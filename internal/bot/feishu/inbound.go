package feishu

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"reasonix/internal/bot"

	larkim "github.com/larksuite/oapi-sdk-go/v3/service/im/v1"
)

// maxFeishuMediaBytes matches the bot gateway's inbound media cap.
const maxFeishuMediaBytes = 25 * 1024 * 1024

const resourceDownloadTimeout = 30 * time.Second

type imageContent struct {
	ImageKey string `json:"image_key"`
}

type fileContent struct {
	FileKey  string `json:"file_key"`
	FileName string `json:"file_name"`
}

// mentionRef 是 SDK 事件与 webhook 事件两种 mention 表示的归一化形态。
type mentionRef struct {
	Key    string
	OpenID string
	Name   string
}

func sdkMentionRefs(mentions []*larkim.MentionEvent) []mentionRef {
	refs := make([]mentionRef, 0, len(mentions))
	for _, m := range mentions {
		if m == nil {
			continue
		}
		ref := mentionRef{Key: stringPtrValue(m.Key), Name: stringPtrValue(m.Name)}
		if m.Id != nil {
			ref.OpenID = stringPtrValue(m.Id.OpenId)
		}
		refs = append(refs, ref)
	}
	return refs
}

// mentionsBot 判断消息是否 @ 了本 bot。bot open_id 未知时退回“任意 @ 均放行”
// 的旧行为，避免因为 bot/v3/info 拉取失败而完全失聪。
func (a *adapter) mentionsBot(mentions []mentionRef) bool {
	botID := a.botOpenID()
	if botID == "" {
		return len(mentions) > 0
	}
	for _, m := range mentions {
		if m.OpenID != "" && m.OpenID == botID {
			return true
		}
	}
	return false
}

// replaceMentionPlaceholders 把 "@_user_N" 占位符还原为可读的 "@显示名"；
// bot 自己的占位符直接移除，模型看到的输入不再包含对 bot 的 @。
func (a *adapter) replaceMentionPlaceholders(text string, mentions []mentionRef) string {
	botID := a.botOpenID()
	for _, m := range mentions {
		if m.Key == "" {
			continue
		}
		replacement := ""
		if (botID == "" || m.OpenID != botID) && m.Name != "" {
			replacement = "@" + m.Name
		}
		text = strings.ReplaceAll(text, m.Key, replacement)
	}
	return strings.TrimSpace(text)
}

// parseInboundContent 把一条飞书消息的 content 解析为文本与预下载媒体。
// ok=false 表示该消息类型不支持，调用方应忽略。下载失败不阻断消息：退化为
// 占位文本，让会话至少知道用户发过附件。
func (a *adapter) parseInboundContent(ctx context.Context, msgType, content, messageID string) (text string, media []bot.InboundMedia, ok bool) {
	switch msgType {
	case "text":
		var tc textContent
		if err := json.Unmarshal([]byte(content), &tc); err != nil {
			a.logger.Warn("feishu message ignored", "reason", "bad_content", "message", logHash(messageID), "err", err)
			return "", nil, false
		}
		return tc.Text, nil, true
	case "image":
		var ic imageContent
		if err := json.Unmarshal([]byte(content), &ic); err != nil || strings.TrimSpace(ic.ImageKey) == "" {
			return "", nil, false
		}
		item, err := a.downloadMedia(ctx, messageID, ic.ImageKey, "image", "")
		if err != nil {
			a.logger.Warn("feishu image download failed", "message", logHash(messageID), "err", err)
			return "[图片下载失败]", nil, true
		}
		return "", []bot.InboundMedia{item}, true
	case "sticker":
		var fc fileContent
		if err := json.Unmarshal([]byte(content), &fc); err != nil || strings.TrimSpace(fc.FileKey) == "" {
			return "", nil, false
		}
		item, err := a.downloadMedia(ctx, messageID, fc.FileKey, "image", "")
		if err != nil {
			return "[sticker]", nil, true
		}
		return "", []bot.InboundMedia{item}, true
	case "file":
		var fc fileContent
		if err := json.Unmarshal([]byte(content), &fc); err != nil || strings.TrimSpace(fc.FileKey) == "" {
			return "", nil, false
		}
		item, err := a.downloadMedia(ctx, messageID, fc.FileKey, "file", fc.FileName)
		if err != nil {
			a.logger.Warn("feishu file download failed", "message", logHash(messageID), "err", err)
			return fmt.Sprintf("[文件下载失败: %s]", fc.FileName), nil, true
		}
		return "", []bot.InboundMedia{item}, true
	case "post":
		return a.parsePostContent(ctx, content, messageID)
	default:
		return "", nil, false
	}
}

// parsePostContent 解析富文本（post）消息：抽取文本、链接、@，并下载内嵌图片。
func (a *adapter) parsePostContent(ctx context.Context, content, messageID string) (string, []bot.InboundMedia, bool) {
	var post struct {
		Title   string `json:"title"`
		Content [][]struct {
			Tag      string `json:"tag"`
			Text     string `json:"text"`
			Href     string `json:"href"`
			UserName string `json:"user_name"`
			ImageKey string `json:"image_key"`
		} `json:"content"`
	}
	if err := json.Unmarshal([]byte(content), &post); err != nil {
		a.logger.Warn("feishu message ignored", "reason", "bad_post_content", "message", logHash(messageID), "err", err)
		return "", nil, false
	}
	var b strings.Builder
	var media []bot.InboundMedia
	if title := strings.TrimSpace(post.Title); title != "" {
		b.WriteString(title)
		b.WriteString("\n")
	}
	for _, paragraph := range post.Content {
		for _, run := range paragraph {
			switch run.Tag {
			case "text", "code_block", "md":
				b.WriteString(run.Text)
			case "a":
				switch {
				case run.Text != "" && run.Href != "" && run.Text != run.Href:
					fmt.Fprintf(&b, "%s (%s)", run.Text, run.Href)
				case run.Href != "":
					b.WriteString(run.Href)
				default:
					b.WriteString(run.Text)
				}
			case "at":
				if run.UserName != "" {
					b.WriteString("@" + run.UserName)
				}
			case "img":
				if strings.TrimSpace(run.ImageKey) == "" {
					continue
				}
				item, err := a.downloadMedia(ctx, messageID, run.ImageKey, "image", "")
				if err != nil {
					a.logger.Warn("feishu post image download failed", "message", logHash(messageID), "err", err)
					b.WriteString("[图片下载失败]")
					continue
				}
				media = append(media, item)
			case "media":
				b.WriteString("[视频]")
			}
		}
		b.WriteString("\n")
	}
	return strings.TrimRight(b.String(), "\n"), media, true
}

func (a *adapter) downloadMedia(ctx context.Context, messageID, key, typ, name string) (bot.InboundMedia, error) {
	fetch := a.fetchResource
	if fetch == nil {
		fetch = a.sdkFetchResource
	}
	data, fetchedName, err := fetch(ctx, messageID, key, typ)
	if err != nil {
		return bot.InboundMedia{}, err
	}
	if strings.TrimSpace(name) == "" {
		name = fetchedName
	}
	return bot.InboundMedia{
		Name: name,
		MIME: http.DetectContentType(data[:min(len(data), 512)]),
		Data: data,
	}, nil
}

// sdkFetchResource 经 SDK 鉴权接口下载消息资源（图片/文件）。
func (a *adapter) sdkFetchResource(ctx context.Context, messageID, key, typ string) ([]byte, string, error) {
	client, err := a.sdkClient()
	if err != nil {
		return nil, "", err
	}
	ctx, cancel := context.WithTimeout(ctx, resourceDownloadTimeout)
	defer cancel()
	var data []byte
	var fileName string
	err = withTransientRetry(ctx, a.logger, "get message resource", func(ctx context.Context) error {
		req := larkim.NewGetMessageResourceReqBuilder().
			MessageId(messageID).
			FileKey(key).
			Type(typ).
			Build()
		resp, err := client.Im.MessageResource.Get(ctx, req)
		if err != nil {
			return err
		}
		if resp == nil {
			return fmt.Errorf("feishu resource error: empty response")
		}
		if !resp.Success() {
			return fmt.Errorf("feishu resource error: %s", feishuCodeError(resp.Code, resp.Msg))
		}
		raw, err := io.ReadAll(io.LimitReader(resp.File, maxFeishuMediaBytes+1))
		if err != nil {
			return err
		}
		if len(raw) == 0 || len(raw) > maxFeishuMediaBytes {
			return fmt.Errorf("feishu resource must be between 1 byte and 25 MB")
		}
		data, fileName = raw, resp.FileName
		return nil
	})
	return data, fileName, err
}
