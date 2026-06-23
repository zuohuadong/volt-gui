package config

import (
	"os"
	"path/filepath"
	"testing"
)

func isolateCompatConfig(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	t.Setenv("HOME", root)
	t.Setenv("USERPROFILE", root)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(root, "xdg"))
	t.Setenv("AppData", filepath.Join(root, "AppData"))
	t.Chdir(t.TempDir())
	return root
}

func TestLoadAcceptsVoltUIUserConfig(t *testing.T) {
	isolateCompatConfig(t)
	path := legacyUserConfigPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(`default_model = "legacy-provider"
[[providers]]
name = "legacy-provider"
kind = "openai"
base_url = "https://legacy.example/v1"
model = "legacy-model"
api_key_env = "LEGACY_KEY"
`), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.DefaultModel != "legacy-provider" {
		t.Fatalf("default_model = %q, want legacy-provider", cfg.DefaultModel)
	}
	if _, ok := cfg.Provider("legacy-provider"); !ok {
		t.Fatalf("voltui provider was not loaded: %+v", cfg.Providers)
	}
}

func TestLoadVoltUIOverridesVoltUIConfig(t *testing.T) {
	isolateCompatConfig(t)
	legacy := legacyUserConfigPath()
	current := UserConfigPath()
	for _, path := range []string{legacy, current} {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(legacy, []byte(`default_model = "legacy-provider"
[[plugins]]
name = "shared"
command = "legacy-bin"
`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(current, []byte(`default_model = "current-provider"
[[plugins]]
name = "shared"
command = "current-bin"
`), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.DefaultModel != "current-provider" {
		t.Fatalf("default_model = %q, want current-provider", cfg.DefaultModel)
	}
	if len(cfg.Plugins) != 1 || cfg.Plugins[0].Command != "current-bin" {
		t.Fatalf("plugins = %+v, want current shared plugin", cfg.Plugins)
	}
}

func TestLoadAcceptsVoltUIProjectConfig(t *testing.T) {
	isolateCompatConfig(t)
	if err := os.WriteFile("voltui.toml", []byte(`default_model = "project-provider"
[[providers]]
name = "project-provider"
kind = "openai"
base_url = "https://project.example/v1"
model = "project-model"
api_key_env = "PROJECT_KEY"
`), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.DefaultModel != "project-provider" {
		t.Fatalf("default_model = %q, want project-provider", cfg.DefaultModel)
	}
	if got := SourcePath(); filepath.Base(got) != "voltui.toml" {
		t.Fatalf("SourcePath() = %q, want voltui.toml", got)
	}
}

func TestLoadDotEnvAcceptsVoltUICredentials(t *testing.T) {
	isolateCompatConfig(t)
	path := legacyUserCredentialsPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("REASONIX_ONLY_KEY=from_voltui\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	os.Unsetenv("REASONIX_ONLY_KEY")

	loadDotEnv()
	if got := os.Getenv("REASONIX_ONLY_KEY"); got != "from_voltui" {
		t.Fatalf("REASONIX_ONLY_KEY = %q, want from_voltui", got)
	}
}
