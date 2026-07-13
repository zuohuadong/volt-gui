package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"voltui/desktop/internal/update"
)

// TestGenManifest builds a manifest from a directory of fake artifacts and checks
// every platform is listed with a download URL and non-empty digest. Sidecar
// files and latest.json must be ignored.
func TestGenManifest(t *testing.T) {
	dir := t.TempDir()
	names := []string{
		"VoltUI-darwin-arm64.zip",
		"VoltUI-darwin-amd64.zip",
		"VoltUI-windows-amd64-installer.exe",
		"VoltUI-windows-amd64.zip",               // portable download, not the updater channel
		"VoltUI-windows-amd64-prerequisites.zip", // offline runtimes, not the updater channel
		"VoltUI-windows-arm64-installer.exe",
		"VoltUI-windows-arm64.zip",               // portable download, not the updater channel
		"VoltUI-windows-arm64-prerequisites.zip", // offline runtimes, not the updater channel
		"VoltUI-linux-amd64.tar.gz",
		"VoltUI-linux-amd64.deb",             // human download, not the updater channel
		"VoltUI-linux-amd64.tar.gz.checksum", // sidecar, must be skipped
		"README.txt",                         // unmatched, must be skipped
	}
	for _, n := range names {
		if err := os.WriteFile(filepath.Join(dir, n), []byte(n), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("GITHUB_REPOSITORY", "zuohuadong/volt-gui")

	if err := genManifest(dir, "v1.2.0", "desktop-v1.2.0"); err != nil {
		t.Fatalf("genManifest: %v", err)
	}
	raw, err := os.ReadFile(filepath.Join(dir, "latest.json"))
	if err != nil {
		t.Fatal(err)
	}
	var m update.Manifest
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("latest.json is not valid: %v", err)
	}
	if m.Version != "v1.2.0" {
		t.Fatalf("version = %q, want v1.2.0", m.Version)
	}
	if m.DownloadPage != "https://voltui.io/#start" {
		t.Fatalf("download_page = %q, want official install page", m.DownloadPage)
	}
	if len(m.Platforms) != 5 {
		t.Fatalf("want 5 platforms, got %d: %v", len(m.Platforms), m.Platforms)
	}
	win, ok := m.Platforms["windows-amd64"]
	if !ok {
		t.Fatal("windows-amd64 missing")
	}
	wantURL := "https://github.com/zuohuadong/volt-gui/releases/download/desktop-v1.2.0/VoltUI-windows-amd64-installer.exe"
	if win.URL != wantURL {
		t.Fatalf("windows url = %q, want %q", win.URL, wantURL)
	}
	if win.SHA256 == "" || win.Size == 0 {
		t.Fatalf("windows asset missing digest/size: %+v", win)
	}
	// The Windows updater channel is the per-arch -installer.exe; portable and
	// prerequisite ZIPs must not shadow the windows-arm64 key.
	arm, ok := m.Platforms["windows-arm64"]
	if !ok {
		t.Fatal("windows-arm64 missing")
	}
	if !strings.HasSuffix(arm.URL, "/VoltUI-windows-arm64-installer.exe") {
		t.Fatalf("windows-arm64 url = %q, want the installer, not the portable zip", arm.URL)
	}
	// The Linux updater channel must stay the .tar.gz; the co-located .deb is a
	// human download and must not shadow the linux-amd64 key.
	lin, ok := m.Platforms["linux-amd64"]
	if !ok {
		t.Fatal("linux-amd64 missing")
	}
	if !strings.HasSuffix(lin.URL, "/VoltUI-linux-amd64.tar.gz") {
		t.Fatalf("linux-amd64 url = %q, want the .tar.gz, not the .deb", lin.URL)
	}
}
