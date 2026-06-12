package main

import (
	"crypto/rand"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"aead.dev/minisign"

	"voltui/desktop/internal/update"
)

// TestSignFiles signs a file with a throwaway key pair (injected via env, exactly
// as CI passes the real key) and verifies the produced .minisig validates under the
// matching public key.
func TestSignFiles(t *testing.T) {
	pub, priv, err := minisign.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	enc, err := minisign.EncryptKey("pw", priv)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("MINISIGN_PRIVATE_KEY", string(enc))
	t.Setenv("MINISIGN_PASSWORD", "pw")

	dir := t.TempDir()
	artifact := filepath.Join(dir, "VoltUI-linux-amd64.tar.gz")
	payload := []byte("pretend this is a release tarball")
	if err := os.WriteFile(artifact, payload, 0o644); err != nil {
		t.Fatal(err)
	}

	if err := signFiles([]string{artifact}); err != nil {
		t.Fatalf("signFiles: %v", err)
	}
	sig, err := os.ReadFile(artifact + ".minisig")
	if err != nil {
		t.Fatalf("read signature: %v", err)
	}
	if !minisign.Verify(pub, payload, sig) {
		t.Fatal("produced signature does not verify under the signing key")
	}
}

// TestGenManifest builds a manifest from a directory of fake artifacts and checks
// every platform is listed with a download URL, a parallel .minisig URL, and a
// non-empty digest. The .minisig and latest.json files must be ignored.
func TestGenManifest(t *testing.T) {
	dir := t.TempDir()
	names := []string{
		"VoltUI-darwin-arm64.zip",
		"VoltUI-darwin-amd64.zip",
		"VoltUI-windows-amd64-installer.exe",
		"VoltUI-linux-amd64.tar.gz",
		"VoltUI-linux-amd64.tar.gz.minisig", // must be skipped
		"README.txt",                        // unmatched, must be skipped
	}
	for _, n := range names {
		if err := os.WriteFile(filepath.Join(dir, n), []byte(n), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(dir, "VoltUI-windows-amd64-installer.exe.minisig"), []byte("sig"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("GITHUB_REPOSITORY", "aizhuliren/volt-gui")

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
	if len(m.Platforms) != 4 {
		t.Fatalf("want 4 platforms, got %d: %v", len(m.Platforms), m.Platforms)
	}
	win, ok := m.Platforms["windows-amd64"]
	if !ok {
		t.Fatal("windows-amd64 missing")
	}
	wantURL := "https://github.com/aizhuliren/volt-gui/releases/download/desktop-v1.2.0/VoltUI-windows-amd64-installer.exe"
	if win.URL != wantURL {
		t.Fatalf("windows url = %q, want %q", win.URL, wantURL)
	}
	if win.Sig != wantURL+".minisig" {
		t.Fatalf("windows sig = %q, want %q.minisig", win.Sig, wantURL)
	}
	if win.SHA256 == "" || win.Size == 0 {
		t.Fatalf("windows asset missing digest/size: %+v", win)
	}
}

func TestGenManifestAllowsUnsignedArtifacts(t *testing.T) {
	dir := t.TempDir()
	name := "VoltUI-windows-amd64-installer.exe"
	if err := os.WriteFile(filepath.Join(dir, name), []byte(name), 0o644); err != nil {
		t.Fatal(err)
	}
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
	if got := m.Platforms["windows-amd64"].Sig; got != "" {
		t.Fatalf("unsigned artifact sig = %q, want empty", got)
	}
}

func TestGenManifestUsesReleaseURLOverrides(t *testing.T) {
	dir := t.TempDir()
	name := "VoltUI-windows-amd64-installer.exe"
	if err := os.WriteFile(filepath.Join(dir, name), []byte(name), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("RELEASE_DOWNLOAD_PAGE", "https://cnb.cool/aizhuliren/xgic/anyong-agent/-/releases/desktop-v1.2.0")
	t.Setenv("RELEASE_ASSET_BASE_URL", "https://cnb.cool/aizhuliren/xgic/anyong-agent/-/releases/desktop-v1.2.0/downloads")

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
	windows := m.Platforms["windows-amd64"]
	wantURL := "https://cnb.cool/aizhuliren/xgic/anyong-agent/-/releases/desktop-v1.2.0/downloads/" + name
	if windows.URL != wantURL {
		t.Fatalf("windows url = %q, want %q", windows.URL, wantURL)
	}
	if m.DownloadPage != "https://cnb.cool/aizhuliren/xgic/anyong-agent/-/releases/desktop-v1.2.0" {
		t.Fatalf("download page = %q", m.DownloadPage)
	}
}
