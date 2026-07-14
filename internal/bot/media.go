package bot

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"path"
	"path/filepath"
	"strings"
	"time"

	"voltui/internal/control"
	"voltui/internal/netclient"
)

const (
	maxBotMediaAttachments = 5
	maxBotMediaBytes       = 25 * 1024 * 1024
	maxBotMediaTotalBytes  = 50 * 1024 * 1024
	maxBotMediaURLBytes    = 4096
)

type inboundMediaLimits struct {
	MaxAttachments int
	MaxFileBytes   int64
	MaxTotalBytes  int64
	MaxURLBytes    int
}

var defaultInboundMediaLimits = inboundMediaLimits{
	MaxAttachments: maxBotMediaAttachments,
	MaxFileBytes:   maxBotMediaBytes,
	MaxTotalBytes:  maxBotMediaTotalBytes,
	MaxURLBytes:    maxBotMediaURLBytes,
}

type inboundMediaAttachment struct {
	Ref          string
	SourceSHA256 string
	MIMEType     string
	SHA256       string
	Size         int64
}

var botMediaHTTPClient = newBotMediaHTTPClient()

func newBotMediaHTTPClient() *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	// A proxy can resolve the destination outside this process and bypass the
	// dial-time address check, so untrusted media downloads use a guarded direct
	// transport. Failure is safer than silently widening the SSRF boundary.
	transport.Proxy = nil
	transport.DialContext = (netclient.GuardedDialer{
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
	}).DialContext
	return &http.Client{
		Timeout:   30 * time.Second,
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return fmt.Errorf("media redirect limit exceeded")
			}
			_, err := validateInboundMediaURL(req.URL.String(), defaultInboundMediaLimits.MaxURLBytes)
			return err
		},
	}
}

func saveInboundMedia(ctx context.Context, workspaceRoot string, mediaURLs []string) (refs []string, errs []error) {
	items, errs := saveInboundMediaBatchWithClient(ctx, workspaceRoot, mediaURLs, botMediaHTTPClient, defaultInboundMediaLimits)
	refs = make([]string, 0, len(items))
	for _, item := range items {
		refs = append(refs, item.Ref)
	}
	return refs, errs
}

func saveInboundMediaBatchWithClient(ctx context.Context, workspaceRoot string, mediaURLs []string, client *http.Client, limits inboundMediaLimits) (items []inboundMediaAttachment, errs []error) {
	limits = normalizeInboundMediaLimits(limits)
	remaining := limits.MaxTotalBytes
	for index, rawURL := range mediaURLs {
		if index >= limits.MaxAttachments {
			errs = append(errs, fmt.Errorf("bot media accepts at most %d attachments", limits.MaxAttachments))
			continue
		}
		if remaining <= 0 {
			errs = append(errs, fmt.Errorf("bot media total size limit has been reached"))
			continue
		}
		itemLimits := limits
		itemLimits.MaxTotalBytes = remaining
		item, err := saveOneInboundMediaWithClient(ctx, workspaceRoot, rawURL, client, itemLimits)
		if err != nil {
			errs = append(errs, err)
			continue
		}
		remaining -= item.Size
		items = append(items, item)
	}
	return items, errs
}

func normalizeInboundMediaLimits(limits inboundMediaLimits) inboundMediaLimits {
	if limits.MaxAttachments <= 0 {
		limits.MaxAttachments = maxBotMediaAttachments
	}
	if limits.MaxFileBytes <= 0 {
		limits.MaxFileBytes = maxBotMediaBytes
	}
	if limits.MaxTotalBytes <= 0 {
		limits.MaxTotalBytes = maxBotMediaTotalBytes
	}
	if limits.MaxURLBytes <= 0 {
		limits.MaxURLBytes = maxBotMediaURLBytes
	}
	return limits
}

func saveOneInboundMedia(ctx context.Context, workspaceRoot, rawURL string) (string, error) {
	item, err := saveOneInboundMediaWithClient(ctx, workspaceRoot, rawURL, botMediaHTTPClient, defaultInboundMediaLimits)
	return item.Ref, err
}

func saveOneInboundMediaWithClient(ctx context.Context, workspaceRoot, rawURL string, client *http.Client, limits inboundMediaLimits) (inboundMediaAttachment, error) {
	limits = normalizeInboundMediaLimits(limits)
	u, err := validateInboundMediaURL(rawURL, limits.MaxURLBytes)
	if err != nil {
		return inboundMediaAttachment{}, err
	}
	if limits.MaxTotalBytes <= 0 {
		return inboundMediaAttachment{}, fmt.Errorf("bot media total size limit has been reached")
	}
	if client == nil {
		client = botMediaHTTPClient
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return inboundMediaAttachment{}, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return inboundMediaAttachment{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return inboundMediaAttachment{}, fmt.Errorf("download media: HTTP %d", resp.StatusCode)
	}
	if resp.ContentLength > limits.MaxFileBytes {
		return inboundMediaAttachment{}, fmt.Errorf("media Content-Length exceeds the per-file limit")
	}
	if resp.ContentLength > limits.MaxTotalBytes {
		return inboundMediaAttachment{}, fmt.Errorf("media Content-Length exceeds the remaining total limit")
	}
	readLimit := min(limits.MaxFileBytes, limits.MaxTotalBytes)
	raw, err := io.ReadAll(io.LimitReader(resp.Body, readLimit+1))
	if err != nil {
		return inboundMediaAttachment{}, err
	}
	if len(raw) == 0 {
		return inboundMediaAttachment{}, fmt.Errorf("media must not be empty")
	}
	if int64(len(raw)) > limits.MaxFileBytes {
		return inboundMediaAttachment{}, fmt.Errorf("media exceeds the per-file size limit")
	}
	if int64(len(raw)) > limits.MaxTotalBytes {
		return inboundMediaAttachment{}, fmt.Errorf("media exceeds the remaining total size limit")
	}

	declaredType := normalizeMediaType(resp.Header.Get("Content-Type"))
	detectedType := normalizeMediaType(http.DetectContentType(raw[:min(len(raw), 512)]))
	name, contentType, err := allowedInboundMediaName(u, declaredType, detectedType)
	if err != nil {
		return inboundMediaAttachment{}, err
	}
	var ref string
	if strings.HasPrefix(contentType, "image/") {
		ref, err = control.SaveImageBytesInRoot(workspaceRoot, contentType, raw)
	} else {
		ref, err = control.SaveAttachmentBytesInRoot(workspaceRoot, name, raw)
	}
	if err != nil {
		return inboundMediaAttachment{}, err
	}
	sum := sha256.Sum256(raw)
	sourceSum := sha256.Sum256([]byte(u.String()))
	return inboundMediaAttachment{
		Ref:          ref,
		SourceSHA256: hex.EncodeToString(sourceSum[:]),
		MIMEType:     contentType,
		SHA256:       hex.EncodeToString(sum[:]),
		Size:         int64(len(raw)),
	}, nil
}

func validateInboundMediaURL(rawURL string, maxBytes int) (*url.URL, error) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return nil, fmt.Errorf("empty media URL")
	}
	if len(rawURL) > maxBytes {
		return nil, fmt.Errorf("media URL must not exceed %d bytes", maxBytes)
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, err
	}
	if (u.Scheme != "http" && u.Scheme != "https") || strings.TrimSpace(u.Hostname()) == "" {
		return nil, fmt.Errorf("unsupported media URL")
	}
	if u.User != nil {
		return nil, fmt.Errorf("media URL credentials are not allowed")
	}
	return u, nil
}

func normalizeMediaType(raw string) string {
	mediaType, _, err := mime.ParseMediaType(strings.TrimSpace(raw))
	if err != nil {
		return ""
	}
	return strings.ToLower(strings.TrimSpace(mediaType))
}

var inboundMediaTypes = map[string]map[string]bool{
	".png":  {"image/png": true},
	".jpg":  {"image/jpeg": true},
	".jpeg": {"image/jpeg": true},
	".gif":  {"image/gif": true},
	".webp": {"image/webp": true},
	".pdf":  {"application/pdf": true},
	".txt":  {"text/plain": true},
	".md":   {"text/plain": true, "text/markdown": true},
	".csv":  {"text/plain": true, "text/csv": true, "application/csv": true},
	".json": {"text/plain": true, "application/json": true},
	".zip":  {"application/zip": true, "application/x-zip-compressed": true},
	".docx": {"application/zip": true, "application/vnd.openxmlformats-officedocument.wordprocessingml.document": true},
	".xlsx": {"application/zip": true, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": true},
	".pptx": {"application/zip": true, "application/vnd.openxmlformats-officedocument.presentationml.presentation": true},
}

var inboundMediaDefaultExtension = map[string]string{
	"image/png":                    ".png",
	"image/jpeg":                   ".jpg",
	"image/gif":                    ".gif",
	"image/webp":                   ".webp",
	"application/pdf":              ".pdf",
	"text/plain":                   ".txt",
	"text/markdown":                ".md",
	"text/csv":                     ".csv",
	"application/csv":              ".csv",
	"application/json":             ".json",
	"application/zip":              ".zip",
	"application/x-zip-compressed": ".zip",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document":   ".docx",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":         ".xlsx",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
}

func allowedInboundMediaName(u *url.URL, declaredType, detectedType string) (string, string, error) {
	if detectedType == "text/html" || detectedType == "application/xhtml+xml" || detectedType == "image/svg+xml" {
		return "", "", fmt.Errorf("unsupported media type %q", detectedType)
	}
	base := path.Base(u.Path)
	ext := strings.ToLower(filepath.Ext(base))
	if ext != "" {
		if _, ok := inboundMediaTypes[ext]; !ok {
			return "", "", fmt.Errorf("unsupported media type or extension")
		}
	} else {
		ext = inboundMediaDefaultExtension[declaredType]
		if ext == "" {
			ext = inboundMediaDefaultExtension[detectedType]
		}
	}
	allowed, ok := inboundMediaTypes[ext]
	if !ok || ext == "" {
		return "", "", fmt.Errorf("unsupported media type or extension")
	}
	if declaredType != "" && declaredType != "application/octet-stream" && !allowed[declaredType] {
		return "", "", fmt.Errorf("unsupported media type %q for %s", declaredType, ext)
	}
	if !allowed[detectedType] {
		return "", "", fmt.Errorf("unsupported detected media type %q for %s", detectedType, ext)
	}
	contentType := detectedType
	if declaredType != "" && declaredType != "application/octet-stream" && allowed[declaredType] {
		contentType = declaredType
	}
	if strings.HasPrefix(detectedType, "image/") {
		contentType = detectedType
	}
	if base == "." || base == "/" || strings.TrimSpace(base) == "" || strings.ToLower(filepath.Ext(base)) != ext {
		base = "media" + ext
	}
	return base, contentType, nil
}

func appendMediaRefs(text string, refs []string) string {
	if len(refs) == 0 {
		return text
	}
	var b strings.Builder
	if strings.TrimSpace(text) != "" {
		b.WriteString(text)
		b.WriteString("\n\n")
	}
	b.WriteString("Attachments:")
	for _, ref := range refs {
		b.WriteString("\n@")
		b.WriteString(ref)
	}
	return b.String()
}
