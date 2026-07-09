package bot

import (
	"context"
	"encoding/base64"
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

	ref, err := saveOneInboundMedia(context.Background(), workspace, srv.URL+"/shot.png")
	if err != nil {
		t.Fatalf("saveOneInboundMedia: %v", err)
	}
	if !strings.HasPrefix(ref, ".reasonix/attachments/") || !strings.HasSuffix(ref, ".png") {
		t.Fatalf("ref = %q, want png attachment ref", ref)
	}
	if _, err := os.Stat(filepath.Join(workspace, filepath.FromSlash(ref))); err != nil {
		t.Fatalf("stored attachment missing: %v", err)
	}
}

func TestSaveInboundMediaItemsStoresBytesAndReportsErrors(t *testing.T) {
	png, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatalf("decode png: %v", err)
	}
	workspace := t.TempDir()

	refs, errs := saveInboundMediaItems(workspace, []InboundMedia{
		{MIME: "image/png", Data: png},
		{Name: "notes.txt", MIME: "text/plain", Data: []byte("hello from feishu")},
		{Name: "empty.bin"}, // no data -> error
	})
	if len(errs) != 1 {
		t.Fatalf("errs = %v, want exactly one for the empty item", errs)
	}
	if len(refs) != 2 {
		t.Fatalf("refs = %v, want image and text attachment", refs)
	}
	if !strings.HasSuffix(refs[0], ".png") {
		t.Fatalf("image ref = %q, want .png attachment", refs[0])
	}
	if !strings.HasSuffix(refs[1], ".txt") {
		t.Fatalf("text ref = %q, want .txt attachment", refs[1])
	}
	for _, ref := range refs {
		if _, err := os.Stat(filepath.Join(workspace, filepath.FromSlash(ref))); err != nil {
			t.Fatalf("stored attachment missing: %v", err)
		}
	}
}
