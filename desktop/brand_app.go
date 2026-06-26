package main

import "voltui/internal/config"

type BrandView struct {
	Name         string `json:"name"`
	ShortName    string `json:"shortName"`
	LogoPath     string `json:"logoPath,omitempty"`
	WordmarkPath string `json:"wordmarkPath,omitempty"`
	IconPath     string `json:"iconPath,omitempty"`
}

func brandViewFromConfig(cfg *config.Config) BrandView {
	if cfg == nil {
		return BrandView{Name: "VoltUI", ShortName: "VoltUI"}
	}
	return BrandView{
		Name:         cfg.BrandName(),
		ShortName:    cfg.BrandShortName(),
		LogoPath:     cfg.BrandLogoPath(),
		WordmarkPath: cfg.BrandWordmarkPath(),
		IconPath:     cfg.BrandIconPath(),
	}
}

func (a *App) Brand() BrandView {
	cfg, err := config.Load()
	if err != nil {
		return brandViewFromConfig(nil)
	}
	return brandViewFromConfig(cfg)
}
