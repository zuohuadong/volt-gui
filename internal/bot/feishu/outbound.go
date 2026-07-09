package feishu

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"reasonix/internal/bot"

	larkim "github.com/larksuite/oapi-sdk-go/v3/service/im/v1"
)

var outboundMediaHTTPClient = &http.Client{Timeout: 30 * time.Second}

// EditMessage 原地编辑一条已发送的消息（Im.Message.Patch，仅对 interactive
// card 消息有效）。bot 渲染器用它实现回合中的流式输出。
func (a *adapter) EditMessage(ctx context.Context, messageID string, msg bot.OutboundMessage) error {
	messageID = strings.TrimSpace(messageID)
	if messageID == "" {
		return fmt.Errorf("feishu edit: empty message id")
	}
	content, err := buildMarkdownCard(msg.Text)
	if err != nil {
		return err
	}
	client, err := a.sdkClient()
	if err != nil {
		return err
	}
	return withTransientRetry(ctx, a.logger, "patch message", func(ctx context.Context) error {
		req := larkim.NewPatchMessageReqBuilder().
			MessageId(messageID).
			Body(larkim.NewPatchMessageReqBodyBuilder().Content(content).Build()).
			Build()
		resp, err := client.Im.Message.Patch(ctx, req)
		if err != nil {
			return err
		}
		if resp == nil {
			return fmt.Errorf("feishu patch error: empty response")
		}
		if !resp.Success() {
			return fmt.Errorf("feishu patch error: %s", feishuCodeError(resp.Code, resp.Msg))
		}
		return nil
	})
}

// sendMediaURLs 把 OutboundMessage.MediaURLs 逐个上传并作为图片/文件消息发送。
// 每个引用可以是 http(s) URL 或本机绝对路径（/send 的调用方是已鉴权的本机
// operator，读取本地文件正是该能力的用途）。
func (a *adapter) sendMediaURLs(ctx context.Context, msg bot.OutboundMessage) (bot.SendResult, error) {
	var result bot.SendResult
	var firstErr error
	for _, ref := range msg.MediaURLs {
		res, err := a.sendOneMedia(ctx, msg, ref)
		if err != nil {
			a.logger.Warn("feishu media send failed", "err", err)
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		result = res
	}
	return result, firstErr
}

func (a *adapter) sendOneMedia(ctx context.Context, msg bot.OutboundMessage, ref string) (bot.SendResult, error) {
	data, name, err := loadOutboundMedia(ctx, ref)
	if err != nil {
		return bot.SendResult{}, err
	}
	mimeType := http.DetectContentType(data[:min(len(data), 512)])
	if strings.HasPrefix(mimeType, "image/") {
		imageKey, err := a.uploadImage(ctx, data)
		if err == nil {
			content, _ := json.Marshal(map[string]string{"image_key": imageKey})
			return a.sendSDKContent(ctx, msg, larkim.MsgTypeImage, string(content))
		}
		// 图片上传失败（如超过图片接口 10MB 上限）时降级为文件发送。
		a.logger.Warn("feishu image upload failed; falling back to file", "err", err)
	}
	fileKey, err := a.uploadFile(ctx, name, data)
	if err != nil {
		return bot.SendResult{}, err
	}
	content, _ := json.Marshal(map[string]string{"file_key": fileKey})
	return a.sendSDKContent(ctx, msg, larkim.MsgTypeFile, string(content))
}

func loadOutboundMedia(ctx context.Context, ref string) ([]byte, string, error) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return nil, "", fmt.Errorf("empty media ref")
	}
	if u, err := url.Parse(ref); err == nil && (u.Scheme == "http" || u.Scheme == "https") {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, ref, nil)
		if err != nil {
			return nil, "", err
		}
		resp, err := outboundMediaHTTPClient.Do(req)
		if err != nil {
			return nil, "", err
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return nil, "", fmt.Errorf("download media: HTTP %d", resp.StatusCode)
		}
		raw, err := io.ReadAll(io.LimitReader(resp.Body, maxFeishuMediaBytes+1))
		if err != nil {
			return nil, "", err
		}
		if len(raw) == 0 || len(raw) > maxFeishuMediaBytes {
			return nil, "", fmt.Errorf("media must be between 1 byte and 25 MB")
		}
		name := path.Base(u.Path)
		if name == "." || name == "/" || strings.TrimSpace(name) == "" {
			name = "media.bin"
		}
		return raw, name, nil
	}
	if !filepath.IsAbs(ref) {
		return nil, "", fmt.Errorf("feishu media ref must be a http(s) URL or absolute path")
	}
	info, err := os.Stat(ref)
	if err != nil {
		return nil, "", err
	}
	if info.IsDir() || info.Size() == 0 || info.Size() > maxFeishuMediaBytes {
		return nil, "", fmt.Errorf("media must be a regular file between 1 byte and 25 MB")
	}
	raw, err := os.ReadFile(ref)
	if err != nil {
		return nil, "", err
	}
	return raw, filepath.Base(ref), nil
}

func (a *adapter) uploadImage(ctx context.Context, data []byte) (string, error) {
	client, err := a.sdkClient()
	if err != nil {
		return "", err
	}
	var key string
	err = withTransientRetry(ctx, a.logger, "upload image", func(ctx context.Context) error {
		req := larkim.NewCreateImageReqBuilder().
			Body(larkim.NewCreateImageReqBodyBuilder().
				ImageType(larkim.CreateImageImageTypeMessage).
				Image(bytes.NewReader(data)).
				Build()).
			Build()
		resp, err := client.Im.Image.Create(ctx, req)
		if err != nil {
			return err
		}
		if resp == nil {
			return fmt.Errorf("feishu image upload error: empty response")
		}
		if !resp.Success() {
			return fmt.Errorf("feishu image upload error: %s", feishuCodeError(resp.Code, resp.Msg))
		}
		if resp.Data == nil || resp.Data.ImageKey == nil {
			return fmt.Errorf("feishu image upload error: missing image key")
		}
		key = *resp.Data.ImageKey
		return nil
	})
	return key, err
}

func (a *adapter) uploadFile(ctx context.Context, name string, data []byte) (string, error) {
	client, err := a.sdkClient()
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(name) == "" {
		name = "media.bin"
	}
	var key string
	err = withTransientRetry(ctx, a.logger, "upload file", func(ctx context.Context) error {
		req := larkim.NewCreateFileReqBuilder().
			Body(larkim.NewCreateFileReqBodyBuilder().
				FileType(feishuFileType(name)).
				FileName(name).
				File(bytes.NewReader(data)).
				Build()).
			Build()
		resp, err := client.Im.File.Create(ctx, req)
		if err != nil {
			return err
		}
		if resp == nil {
			return fmt.Errorf("feishu file upload error: empty response")
		}
		if !resp.Success() {
			return fmt.Errorf("feishu file upload error: %s", feishuCodeError(resp.Code, resp.Msg))
		}
		if resp.Data == nil || resp.Data.FileKey == nil {
			return fmt.Errorf("feishu file upload error: missing file key")
		}
		key = *resp.Data.FileKey
		return nil
	})
	return key, err
}

func feishuFileType(name string) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".pdf":
		return "pdf"
	case ".doc", ".docx":
		return "doc"
	case ".xls", ".xlsx":
		return "xls"
	case ".ppt", ".pptx":
		return "ppt"
	case ".mp4":
		return "mp4"
	case ".opus":
		return "opus"
	default:
		return "stream"
	}
}
