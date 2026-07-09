package main

import (
	"encoding/base64"
	"mime"
	"os"
	"path/filepath"
	"strings"

	"voltui/internal/config"
)

type BrandView struct {
	Name            string `json:"name"`
	ShortName       string `json:"shortName"`
	LogoPath        string `json:"logoPath,omitempty"`
	WordmarkPath    string `json:"wordmarkPath,omitempty"`
	IconPath        string `json:"iconPath,omitempty"`
	LogoDataURL     string `json:"logoDataUrl,omitempty"`
	WordmarkDataURL string `json:"wordmarkDataUrl,omitempty"`
	IconDataURL     string `json:"iconDataUrl,omitempty"`
}

func brandViewFromConfig(cfg *config.Config) BrandView {
	if cfg == nil {
		cfg = config.Default()
	}
	logoPath := cfg.BrandLogoPath()
	wordmarkPath := cfg.BrandWordmarkPath()
	iconPath := cfg.BrandIconPath()
	return BrandView{
		Name:            cfg.BrandName(),
		ShortName:       cfg.BrandShortName(),
		LogoPath:        logoPath,
		WordmarkPath:    wordmarkPath,
		IconPath:        iconPath,
		LogoDataURL:     imageDataURL(logoPath),
		WordmarkDataURL: imageDataURL(wordmarkPath),
		IconDataURL:     imageDataURL(iconPath),
	}
}

func loadDesktopBrand() BrandView {
	cfg, err := config.Load()
	if err != nil {
		return brandViewFromConfig(config.Default())
	}
	return brandViewFromConfig(cfg)
}

func (a *App) Brand() BrandView {
	return loadDesktopBrand()
}

func (b BrandView) displayName() string {
	if v := strings.TrimSpace(b.Name); v != "" {
		return v
	}
	return "VoltUI"
}

func (b BrandView) compactName() string {
	if v := strings.TrimSpace(b.ShortName); v != "" {
		return v
	}
	return b.displayName()
}

func (b BrandView) trayIconBytes(fallback []byte) []byte {
	if strings.TrimSpace(b.IconPath) == "" {
		return fallback
	}
	data, err := os.ReadFile(b.IconPath)
	if err != nil || len(data) == 0 {
		return fallback
	}
	return data
}

func imageDataURL(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	data, err := os.ReadFile(path)
	if err != nil || len(data) == 0 {
		return ""
	}
	contentType := mime.TypeByExtension(strings.ToLower(filepath.Ext(path)))
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	return "data:" + contentType + ";base64," + base64.StdEncoding.EncodeToString(data)
}
