package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"voltui/internal/config"
)

func TestBrandViewUsesConfigAndImageDataURLs(t *testing.T) {
	t.Setenv("VOLTUI_BRAND_NAME", "")
	t.Setenv("VOLTUI_BRAND_SHORT_NAME", "")
	t.Setenv("VOLTUI_BRAND_LOGO", "")
	t.Setenv("VOLTUI_BRAND_WORDMARK", "")
	t.Setenv("VOLTUI_BRAND_ICON", "")
	t.Setenv("REASONIX_BRAND_NAME", "")

	dir := t.TempDir()
	logo := filepath.Join(dir, "logo.svg")
	if err := os.WriteFile(logo, []byte(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`), 0o644); err != nil {
		t.Fatalf("write logo: %v", err)
	}
	icon := filepath.Join(dir, "icon.ico")
	if err := os.WriteFile(icon, []byte{0x00, 0x00, 0x01, 0x00}, 0o644); err != nil {
		t.Fatalf("write icon: %v", err)
	}

	cfg := config.Default()
	cfg.Brand.Name = "Acme Copilot"
	cfg.Brand.ShortName = "Copilot"
	cfg.Brand.LogoPath = logo
	cfg.Brand.IconPath = icon

	view := brandViewFromConfig(cfg)
	if view.Name != "Acme Copilot" || view.ShortName != "Copilot" {
		t.Fatalf("brand view names = %+v, want configured names", view)
	}
	if !strings.HasPrefix(view.LogoDataURL, "data:image/svg+xml;") {
		t.Fatalf("LogoDataURL = %q, want svg data URL", view.LogoDataURL)
	}
	if got := view.trayIconBytes([]byte("fallback")); string(got) != string([]byte{0x00, 0x00, 0x01, 0x00}) {
		t.Fatalf("tray icon bytes = % x, want configured icon", got)
	}
}

func TestBrandBindingHonorsEnv(t *testing.T) {
	t.Setenv("VOLTUI_BRAND_NAME", "Env Copilot")
	t.Setenv("VOLTUI_BRAND_SHORT_NAME", "Env")

	view := NewApp().Brand()
	if view.Name != "Env Copilot" || view.ShortName != "Env" {
		t.Fatalf("Brand() = %+v, want env brand", view)
	}
}
