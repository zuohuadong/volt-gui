package serve

import "voltui/internal/config"

func renderBrandHTML(raw []byte) []byte {
	cfg, err := config.Load()
	if err != nil {
		cfg = config.Default()
	}
	return []byte(cfg.ApplyBrandName(string(raw)))
}
