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

// TestGenManifestForkBrand covers a rebranded fork whose artifacts drop the
// upstream "VoltUI" prefix (e.g. Anyong-windows-amd64-installer.exe). The
// platform key is matched by substring on the arch tag, so the manifest must
// still resolve every channel.
func TestGenManifestForkBrand(t *testing.T) {
	dir := t.TempDir()
	releasePage := "https://cnb.cool/aizhuliren/xgic/anyong-agent/-/releases"
	assetBase := "https://cnb.cool/aizhuliren/xgic/anyong-agent/-/releases/download/desktop-v0.8.0"
	names := []string{
		"Anyong-windows-amd64-installer.exe",
		"Anyong-windows-amd64.zip", // portable, must not shadow the installer key
		"Anyong-darwin-arm64.zip",
		"Anyong-linux-amd64.tar.gz",
	}
	for _, n := range names {
		if err := os.WriteFile(filepath.Join(dir, n), []byte(n), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("GITHUB_REPOSITORY", "aizhuliren/anyong-agent")
	t.Setenv("RELEASE_DOWNLOAD_PAGE", releasePage)
	t.Setenv("RELEASE_ASSET_BASE_URL", assetBase)
	if err := genManifest(dir, "v0.8.0", "desktop-v0.8.0"); err != nil {
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
	if m.DownloadPage != releasePage {
		t.Fatalf("download_page = %q, want %q", m.DownloadPage, releasePage)
	}
	if len(m.Platforms) != 3 {
		t.Fatalf("want 3 platforms, got %d: %v", len(m.Platforms), m.Platforms)
	}
	win, ok := m.Platforms["windows-amd64"]
	if !ok {
		t.Fatal("windows-amd64 missing")
	}
	wantURL := assetBase + "/Anyong-windows-amd64-installer.exe"
	if win.URL != wantURL {
		t.Fatalf("windows url = %q, want %q", win.URL, wantURL)
	}
}
