package config

import (
	"os"
	"path/filepath"
	"testing"

	fileencoding "voltui/internal/fileutil/encoding"
)

func TestLoadForEdit(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "voltui.toml")
	custom := `default_model = "custom"
[[providers]]
name = "custom"
kind = "openai"
base_url = "https://x"
model = "m"
api_key_env = "X_KEY"
`
	if err := os.WriteFile(path, []byte(custom), 0o644); err != nil {
		t.Fatal(err)
	}

	// Existing file: its providers/default override the built-in defaults, so a
	// reconfigure preserves the user's setup.
	cfg := LoadForEdit(path)
	if cfg.DefaultModel != "custom" {
		t.Errorf("default_model = %q, want custom", cfg.DefaultModel)
	}
	if len(cfg.Providers) != 1 || cfg.Providers[0].Name != "custom" {
		t.Errorf("providers = %v, want a single custom provider", cfg.Providers)
	}

	// Missing file: falls back to the built-in defaults.
	if cfg := LoadForEdit(filepath.Join(dir, "absent.toml")); cfg.DefaultModel != Default().DefaultModel {
		t.Errorf("missing-file default = %q, want %q", cfg.DefaultModel, Default().DefaultModel)
	}
}

func TestLoadForEditDecodesGB18030TOML(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "voltui.toml")
	body := `default_model = "local/中文模型"

[[providers]]
name = "local"
kind = "openai"
base_url = "https://example.com/v1"
model = "中文模型"
api_key_env = "LOCAL_KEY"
`
	if err := os.WriteFile(path, fileencoding.Encode(body, fileencoding.GB18030), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg := LoadForEdit(path)
	if cfg.DefaultModel != "local/中文模型" {
		t.Fatalf("default_model = %q", cfg.DefaultModel)
	}
	if len(cfg.Providers) != 1 || cfg.Providers[0].Model != "中文模型" {
		t.Fatalf("providers = %+v, want decoded Chinese model", cfg.Providers)
	}
}
