package bot

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSaveInboundMediaStoresWorkspaceImageAttachment(t *testing.T) {
	raw, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatalf("decode png: %v", err)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/octet-stream")
		_, _ = w.Write(raw)
	}))
	defer srv.Close()
	workspace := t.TempDir()

	sourceURL := srv.URL + "/shot.png?access_token=must-not-leak#fragment"
	item, err := saveOneInboundMediaWithClient(context.Background(), workspace, sourceURL, srv.Client(), defaultInboundMediaLimits)
	if err != nil {
		t.Fatalf("saveOneInboundMediaWithClient: %v", err)
	}
	ref := item.Ref
	if !strings.HasPrefix(ref, ".voltui/attachments/") || !strings.HasSuffix(ref, ".png") {
		t.Fatalf("ref = %q, want png attachment ref", ref)
	}
	if _, err := os.Stat(filepath.Join(workspace, filepath.FromSlash(ref))); err != nil {
		t.Fatalf("stored attachment missing: %v", err)
	}
	sum := sha256.Sum256(raw)
	if item.SHA256 != hex.EncodeToString(sum[:]) || item.Size != int64(len(raw)) || item.MIMEType != "image/png" {
		t.Fatalf("metadata = %+v, want sha256/size/image MIME", item)
	}
	sourceSum := sha256.Sum256([]byte(sourceURL))
	if item.SourceSHA256 != hex.EncodeToString(sourceSum[:]) || strings.Contains(item.SourceSHA256, "access_token") {
		t.Fatalf("source metadata = %q, want only a non-reversible URL hash", item.SourceSHA256)
	}
}

func TestSaveInboundMediaBatchEnforcesCountAndTotalLimits(t *testing.T) {
	payload := []byte("data")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		w.Header().Set("Content-Length", "4")
		_, _ = w.Write(payload)
	}))
	defer srv.Close()
	limits := inboundMediaLimits{MaxAttachments: 2, MaxFileBytes: 8, MaxTotalBytes: 6, MaxURLBytes: 4096}

	items, errs := saveInboundMediaBatchWithClient(context.Background(), t.TempDir(), []string{
		srv.URL + "/one.txt",
		srv.URL + "/two.txt",
		srv.URL + "/three.txt",
	}, srv.Client(), limits)

	if len(items) != 1 || items[0].Size != 4 {
		t.Fatalf("items = %+v, want only first attachment within total budget", items)
	}
	if len(errs) != 2 || !strings.Contains(errs[0].Error(), "total") || !strings.Contains(errs[1].Error(), "at most 2") {
		t.Fatalf("errs = %+v, want total-size and count rejections", errs)
	}
}

func TestSaveInboundMediaRejectsOversizedURLAndContentLength(t *testing.T) {
	limits := inboundMediaLimits{MaxAttachments: 5, MaxFileBytes: 8, MaxTotalBytes: 16, MaxURLBytes: 32}
	if _, err := saveOneInboundMediaWithClient(context.Background(), t.TempDir(), "https://example.com/"+strings.Repeat("a", 64), http.DefaultClient, limits); err == nil || !strings.Contains(err.Error(), "URL") {
		t.Fatalf("long URL error = %v", err)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		w.Header().Set("Content-Length", "9")
		_, _ = w.Write([]byte("small"))
	}))
	defer srv.Close()
	if _, err := saveOneInboundMediaWithClient(context.Background(), t.TempDir(), srv.URL+"/file.txt", srv.Client(), limits); err == nil || !strings.Contains(err.Error(), "Content-Length") {
		t.Fatalf("content length error = %v", err)
	}
}

func TestSaveInboundMediaRejectsLoopbackAndUnsafeFileType(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte("<html>unsafe</html>"))
	}))
	defer srv.Close()

	if _, err := saveOneInboundMedia(context.Background(), t.TempDir(), srv.URL+"/file.txt"); err == nil || !strings.Contains(err.Error(), "internal address") {
		t.Fatalf("loopback error = %v, want SSRF rejection", err)
	}
	if _, err := saveOneInboundMediaWithClient(context.Background(), t.TempDir(), srv.URL+"/payload.exe", srv.Client(), defaultInboundMediaLimits); err == nil || !strings.Contains(err.Error(), "media type") {
		t.Fatalf("unsafe file type error = %v", err)
	}
}
