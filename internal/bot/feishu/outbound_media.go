package feishu

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
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

const maxOutboundMediaBytes = 25 * 1024 * 1024

// outboundMediaClient is an SSRF-hardened HTTP client for outbound media URLs:
// every dial resolves the host and refuses any non-public address, pins the
// connection to the vetted IP (no DNS-rebinding between check and connect), and
// redirects are rejected so a 3xx cannot bounce the fetch to an internal target.
var outboundMediaClient = &http.Client{
	Timeout: 30 * time.Second,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		return fmt.Errorf("feishu outbound media: redirects are not allowed")
	},
	Transport: &http.Transport{
		Proxy:       nil,
		DialContext: guardedDialContext,
	},
}

func guardedDialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}
	ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	for _, ip := range ips {
		if isBlockedOutboundIP(ip.IP) {
			return nil, fmt.Errorf("feishu outbound media: refusing to connect to non-public address %s", ip.IP)
		}
	}
	var dialer net.Dialer
	var lastErr error
	for _, ip := range ips {
		conn, err := dialer.DialContext(ctx, network, net.JoinHostPort(ip.IP.String(), port))
		if err == nil {
			return conn, nil
		}
		lastErr = err
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("feishu outbound media: no address for host")
	}
	return nil, lastErr
}

func isBlockedOutboundIP(ip net.IP) bool {
	return ip == nil || ip.IsLoopback() || ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified()
}

// sendMediaURLs uploads each OutboundMessage.MediaURLs entry and sends it as an
// image/file message. Refs are resolved under a strict policy (see
// resolveOutboundMedia); anything the policy rejects is skipped with a warning.
func (a *adapter) sendMediaURLs(ctx context.Context, msg bot.OutboundMessage) (bot.SendResult, error) {
	var result bot.SendResult
	var firstErr error
	for _, ref := range msg.MediaURLs {
		res, err := a.sendOneMedia(ctx, msg, ref)
		if err != nil {
			a.logger.Warn("feishu media send rejected or failed", "err", err)
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
	data, name, err := a.resolveOutboundMedia(ctx, ref)
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
		a.logger.Warn("feishu image upload failed; falling back to file", "err", err)
	}
	fileKey, err := a.uploadFile(ctx, name, data)
	if err != nil {
		return bot.SendResult{}, err
	}
	content, _ := json.Marshal(map[string]string{"file_key": fileKey})
	return a.sendSDKContent(ctx, msg, larkim.MsgTypeFile, string(content))
}

// resolveOutboundMedia turns a media ref into bytes under a strict policy:
//   - http(s) URLs: the host must be allow-listed and must not resolve to a
//     private/loopback/link-local address (SSRF guard); redirects are refused.
//   - local paths: must be absolute and, after symlink resolution, contained in
//     a configured root; both default to empty (disabled), so an authenticated
//     /send caller cannot read arbitrary files or reach internal endpoints.
func (a *adapter) resolveOutboundMedia(ctx context.Context, ref string) ([]byte, string, error) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return nil, "", fmt.Errorf("feishu outbound media: empty ref")
	}
	if u, err := url.Parse(ref); err == nil && (u.Scheme == "http" || u.Scheme == "https") {
		return a.fetchOutboundURL(ctx, u)
	}
	return a.readOutboundFile(ref)
}

func (a *adapter) fetchOutboundURL(ctx context.Context, u *url.URL) ([]byte, string, error) {
	// Allow-list barrier lives in the same function as the request so the host
	// is validated against trusted config before any fetch happens.
	if !a.outboundHostAllowed(u.Hostname()) {
		return nil, "", fmt.Errorf("feishu outbound media: host %q is not in outbound_media_allowed_hosts", u.Hostname())
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, "", err
	}
	resp, err := outboundMediaClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, "", fmt.Errorf("feishu outbound media: download HTTP %d", resp.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxOutboundMediaBytes+1))
	if err != nil {
		return nil, "", err
	}
	if len(raw) == 0 || len(raw) > maxOutboundMediaBytes {
		return nil, "", fmt.Errorf("feishu outbound media: must be between 1 byte and 25 MB")
	}
	name := path.Base(u.Path)
	if name == "." || name == "/" || strings.TrimSpace(name) == "" {
		name = "media.bin"
	}
	return raw, name, nil
}

func (a *adapter) outboundHostAllowed(host string) bool {
	host = strings.ToLower(strings.TrimSpace(host))
	if host == "" {
		return false
	}
	for _, h := range a.cfg.OutboundMediaAllowedHosts {
		h = strings.ToLower(strings.TrimSpace(h))
		if h == "" {
			continue
		}
		if strings.HasPrefix(h, ".") {
			if host == h[1:] || strings.HasSuffix(host, h) {
				return true
			}
			continue
		}
		if host == h {
			return true
		}
	}
	return false
}

func (a *adapter) readOutboundFile(ref string) ([]byte, string, error) {
	if !filepath.IsAbs(ref) {
		return nil, "", fmt.Errorf("feishu outbound media: local path must be absolute (or use an allow-listed http(s) URL)")
	}
	if len(a.cfg.OutboundMediaRoots) == 0 {
		return nil, "", fmt.Errorf("feishu outbound media: local file sending is disabled (set outbound_media_roots)")
	}
	// Resolve symlinks first so a symlink under a root cannot escape it, then
	// require containment in a configured root before reading.
	resolved, err := filepath.EvalSymlinks(ref)
	if err != nil {
		return nil, "", err
	}
	if !a.outboundPathAllowed(resolved) {
		return nil, "", fmt.Errorf("feishu outbound media: path is outside the allow-listed roots")
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return nil, "", err
	}
	if !info.Mode().IsRegular() || info.Size() == 0 || info.Size() > maxOutboundMediaBytes {
		return nil, "", fmt.Errorf("feishu outbound media: must be a regular file between 1 byte and 25 MB")
	}
	raw, err := os.ReadFile(resolved)
	if err != nil {
		return nil, "", err
	}
	return raw, filepath.Base(resolved), nil
}

// outboundPathAllowed reports whether resolved (already symlink-resolved) is
// contained in one of the configured roots. Roots are symlink-resolved too so
// the comparison is between canonical paths.
func (a *adapter) outboundPathAllowed(resolved string) bool {
	for _, root := range a.cfg.OutboundMediaRoots {
		root = strings.TrimSpace(root)
		if root == "" {
			continue
		}
		rootResolved, err := filepath.EvalSymlinks(root)
		if err != nil {
			rootResolved = filepath.Clean(root)
		}
		if resolved == rootResolved || strings.HasPrefix(resolved, rootResolved+string(filepath.Separator)) {
			return true
		}
	}
	return false
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
