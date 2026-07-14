package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestParseAssetAllowlist(t *testing.T) {
	got, err := parseAssetAllowlist("latest.json, Anyong-windows-amd64.zip")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"Anyong-windows-amd64.zip", "latest.json"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseAssetAllowlist = %q, want %q", got, want)
	}
	for _, raw := range []string{"a,,b", "../secret", "a,a"} {
		if _, err := parseAssetAllowlist(raw); err == nil {
			t.Fatalf("parseAssetAllowlist(%q) should fail", raw)
		}
	}
}

func TestReleaseTagEndsWithVersion(t *testing.T) {
	for _, tc := range []struct {
		tag     string
		version string
		ok      bool
	}{
		{tag: "desktop-v1.2.3", version: "v1.2.3", ok: true},
		{tag: "prerequisites-v1.0.0", version: "v1.0.0", ok: true},
		{tag: "prerequisites-v1.0.1", version: "v1.0.0", ok: false},
	} {
		err := validateTagVersion(tc.tag, tc.version)
		if got := err == nil; got != tc.ok {
			t.Fatalf("validateTagVersion(%q, %q) error = %v, ok=%v", tc.tag, tc.version, err, tc.ok)
		}
	}
}

func TestReleaseFilesRequiresExactAllowlist(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"bundle.zip", "bundle.zip.sha256", "bundle.json"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(name), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	allowlist := []string{"bundle.json", "bundle.zip", "bundle.zip.sha256"}
	files, err := releaseFiles(dir, allowlist)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 3 {
		t.Fatalf("releaseFiles returned %d files, want 3", len(files))
	}
	if err := os.WriteFile(filepath.Join(dir, "unexpected.txt"), []byte("no"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := releaseFiles(dir, allowlist); err == nil {
		t.Fatal("releaseFiles should reject unexpected files")
	}
}

func TestImmutableReleaseStartsAsNonLatestDraft(t *testing.T) {
	var payload map[string]any
	var handlerErr error
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/owner/repo/-/releases" {
			handlerErr = fmt.Errorf("path = %q", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			handlerErr = err
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = io.WriteString(w, `{"id":"release-1"}`)
	}))
	defer srv.Close()

	c := client{api: srv.URL, repo: "owner/repo", token: "redacted", http: srv.Client(), tag: "prerequisites-v1.0.0", immutable: true}
	if err := c.createRelease("Prerequisites", "body", false, "false"); err != nil {
		t.Fatal(err)
	}
	if handlerErr != nil {
		t.Fatal(handlerErr)
	}
	if got := payload["make_latest"]; got != "false" {
		t.Fatalf("make_latest = %#v, want false", got)
	}
	if got, ok := payload["draft"].(bool); !ok || !got {
		t.Fatalf("draft = %#v, want true", payload["draft"])
	}
	if c.releaseID != "release-1" {
		t.Fatalf("releaseID = %q", c.releaseID)
	}
	if !c.releaseDraft {
		t.Fatal("immutable release should remain draft until all assets are uploaded")
	}
}

func TestMutableDesktopReleasePublishesImmediately(t *testing.T) {
	var payload map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&payload)
		w.WriteHeader(http.StatusCreated)
		_, _ = io.WriteString(w, `{"id":"release-1"}`)
	}))
	defer srv.Close()

	c := client{api: srv.URL, repo: "owner/repo", token: "redacted", http: srv.Client(), tag: "desktop-v1.2.3"}
	if err := c.createRelease("Desktop", "body", false, "true"); err != nil {
		t.Fatal(err)
	}
	if payload["make_latest"] != "true" || payload["draft"] != false {
		t.Fatalf("desktop payload = %#v", payload)
	}
	if c.releaseDraft {
		t.Fatal("mutable desktop release should be published immediately")
	}
}

func TestFinalizeImmutableReleasePublishesDesiredLatestPolicy(t *testing.T) {
	var payload map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch || r.URL.Path != "/owner/repo/-/releases/release-1" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		_ = json.NewDecoder(r.Body).Decode(&payload)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := client{api: srv.URL, repo: "owner/repo", token: "redacted", http: srv.Client(), tag: "desktop-v1.2.3", releaseID: "release-1", releaseDraft: true, immutable: true}
	if err := c.finalizeRelease(false, "true"); err != nil {
		t.Fatal(err)
	}
	if payload["make_latest"] != "true" || payload["draft"] != false || payload["prerelease"] != false {
		t.Fatalf("finalize payload = %#v", payload)
	}
	if c.releaseDraft {
		t.Fatal("finalized release should not remain draft")
	}
}

func TestImmutableReleaseReplacesIncompleteDraft(t *testing.T) {
	var posts, deletes int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/owner/repo/-/releases":
			posts++
			if posts == 1 {
				w.WriteHeader(http.StatusConflict)
				return
			}
			w.WriteHeader(http.StatusCreated)
			_, _ = io.WriteString(w, `{"id":"release-2"}`)
		case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/releases/tags/"):
			_, _ = io.WriteString(w, `{"id":"release-1","draft":true}`)
		case r.Method == http.MethodDelete && r.URL.Path == "/owner/repo/-/releases/release-1":
			deletes++
			w.WriteHeader(http.StatusNoContent)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	c := client{api: srv.URL, repo: "owner/repo", token: "redacted", http: srv.Client(), tag: "prerequisites-v1.0.0", immutable: true}
	if err := c.createRelease("Prerequisites", "body", false, "false"); err != nil {
		t.Fatal(err)
	}
	if posts != 2 || deletes != 1 || c.releaseID != "release-2" || !c.releaseDraft {
		t.Fatalf("posts=%d deletes=%d releaseID=%q draft=%v", posts, deletes, c.releaseID, c.releaseDraft)
	}
}

func TestImmutableReleaseRejectsPublishedTag(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			w.WriteHeader(http.StatusConflict)
			return
		}
		if r.Method == http.MethodGet {
			_, _ = io.WriteString(w, `{"id":"release-1","draft":false}`)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	c := client{api: srv.URL, repo: "owner/repo", token: "redacted", http: srv.Client(), tag: "prerequisites-v1.0.0", immutable: true}
	err := c.createRelease("Prerequisites", "body", false, "false")
	if err == nil || !strings.Contains(err.Error(), "already exists and is published") {
		t.Fatalf("createRelease error = %v", err)
	}
}

func TestImmutableUploadDisablesOverwrite(t *testing.T) {
	file := filepath.Join(t.TempDir(), "bundle.zip")
	if err := os.WriteFile(file, []byte("bundle"), 0o600); err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	var handlerErr error
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			handlerErr = err
		}
		_ = json.NewEncoder(w).Encode(uploadTicket{UploadURL: "https://upload.invalid"})
	}))
	defer srv.Close()

	c := client{api: srv.URL, repo: "owner/repo", token: "redacted", http: srv.Client(), releaseID: "release-1", immutable: true}
	if _, err := c.requestUploadTicket(file); err != nil {
		t.Fatal(err)
	}
	if handlerErr != nil {
		t.Fatal(handlerErr)
	}
	if got, ok := payload["overwrite"].(bool); !ok || got {
		t.Fatalf("overwrite = %#v, want false", payload["overwrite"])
	}
}

func TestCleanupImmutableDraftDeletesIncompleteRelease(t *testing.T) {
	var deleted bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete && r.URL.Path == "/owner/repo/-/releases/release-1" {
			deleted = true
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	c := client{api: srv.URL, repo: "owner/repo", token: "redacted", http: srv.Client(), tag: "prerequisites-v1.0.0", releaseID: "release-1", releaseDraft: true, immutable: true}
	if err := c.cleanupImmutableDraft(); err != nil {
		t.Fatal(err)
	}
	if !deleted || c.releaseID != "" || c.releaseDraft {
		t.Fatalf("deleted=%v releaseID=%q draft=%v", deleted, c.releaseID, c.releaseDraft)
	}
}

func TestPutFileUsesFileBody(t *testing.T) {
	file := filepath.Join(t.TempDir(), "bundle.zip")
	if err := os.WriteFile(file, []byte("bundle"), 0o600); err != nil {
		t.Fatal(err)
	}
	var handlerErr error
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if !bytes.Equal(body, []byte("bundle")) {
			handlerErr = fmt.Errorf("body = %q", body)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()
	if err := putFile(srv.Client(), srv.URL, file); err != nil {
		t.Fatal(err)
	}
	if handlerErr != nil {
		t.Fatal(handlerErr)
	}
}
