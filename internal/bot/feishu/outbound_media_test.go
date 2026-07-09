package feishu

import (
	"context"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"reasonix/internal/config"
)

func TestIsBlockedOutboundIP(t *testing.T) {
	blocked := []string{"127.0.0.1", "::1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "0.0.0.0", "224.0.0.1"}
	for _, s := range blocked {
		if !isBlockedOutboundIP(net.ParseIP(s)) {
			t.Errorf("%s should be blocked (SSRF)", s)
		}
	}
	allowed := []string{"8.8.8.8", "1.1.1.1", "93.184.216.34"}
	for _, s := range allowed {
		if isBlockedOutboundIP(net.ParseIP(s)) {
			t.Errorf("%s is public and should be allowed", s)
		}
	}
	if !isBlockedOutboundIP(nil) {
		t.Error("nil IP should be blocked")
	}
}

func TestOutboundHostAllowed(t *testing.T) {
	a := &adapter{cfg: config.FeishuBotConfig{
		OutboundMediaAllowedHosts: []string{"cdn.example.com", ".assets.example.org"},
	}}
	cases := map[string]bool{
		"cdn.example.com":        true,
		"CDN.Example.com":        true, // case-insensitive
		"assets.example.org":     true, // ".x" matches the apex
		"img.assets.example.org": true, // and subdomains
		"evil.com":               false,
		"example.com":            false,
		"notcdn.example.com":     false,
		"":                       false,
	}
	for host, want := range cases {
		if got := a.outboundHostAllowed(host); got != want {
			t.Errorf("outboundHostAllowed(%q) = %v, want %v", host, got, want)
		}
	}
	// No allow-list configured -> nothing allowed.
	empty := &adapter{cfg: config.FeishuBotConfig{}}
	if empty.outboundHostAllowed("cdn.example.com") {
		t.Error("empty allow-list should reject all hosts")
	}
}

func TestReadOutboundFileConfinement(t *testing.T) {
	root := t.TempDir()
	inside := filepath.Join(root, "ok.txt")
	if err := os.WriteFile(inside, []byte("hello"), 0o600); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(t.TempDir(), "secret.txt")
	if err := os.WriteFile(outside, []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}

	a := &adapter{cfg: config.FeishuBotConfig{OutboundMediaRoots: []string{root}}}

	// Inside the root: allowed.
	data, name, err := a.readOutboundFile(inside)
	if err != nil {
		t.Fatalf("file inside root should be readable: %v", err)
	}
	if string(data) != "hello" || name != "ok.txt" {
		t.Fatalf("got %q/%q, want hello/ok.txt", data, name)
	}

	// Outside every root: rejected.
	if _, _, err := a.readOutboundFile(outside); err == nil {
		t.Fatal("file outside the roots must be rejected")
	}

	// Relative path: rejected.
	if _, _, err := a.readOutboundFile("relative/path"); err == nil {
		t.Fatal("relative path must be rejected")
	}

	// No roots configured: local sending disabled.
	off := &adapter{cfg: config.FeishuBotConfig{}}
	if _, _, err := off.readOutboundFile(inside); err == nil {
		t.Fatal("local file sending must be disabled when no roots are set")
	}
}

func TestReadOutboundFileRejectsSymlinkEscape(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink creation is unreliable on Windows CI")
	}
	root := t.TempDir()
	secret := filepath.Join(t.TempDir(), "secret.txt")
	if err := os.WriteFile(secret, []byte("top secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	// A symlink living inside the allowed root but pointing outside it.
	link := filepath.Join(root, "escape.txt")
	if err := os.Symlink(secret, link); err != nil {
		t.Skipf("symlink not supported: %v", err)
	}
	a := &adapter{cfg: config.FeishuBotConfig{OutboundMediaRoots: []string{root}}}
	if _, _, err := a.readOutboundFile(link); err == nil {
		t.Fatal("a symlink escaping the root must be rejected (symlink resolution)")
	}
}

func TestResolveOutboundMediaRejectsDisallowedURLHost(t *testing.T) {
	a := &adapter{cfg: config.FeishuBotConfig{OutboundMediaAllowedHosts: []string{"cdn.example.com"}}}
	if _, _, err := a.resolveOutboundMedia(context.Background(), "https://evil.example.net/x.png"); err == nil {
		t.Fatal("URL with a non-allow-listed host must be rejected before any fetch")
	}
}
