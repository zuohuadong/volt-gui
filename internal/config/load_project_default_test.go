package config

import (
	"os"
	"path/filepath"
	"testing"
)

func writeProjectDefaultTestConfig(t *testing.T, dir, name, body string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

// Older persistence paths wrote a full ./voltui.toml and pinned the built-in
// default_model into project folders. Once the user's [[providers]] replaced
// the built-in presets, the stale project value stopped resolving. Loading must
// keep the user-global default in memory and report the ignored project value.
func TestLoadForRoot_UnresolvableProjectDefaultModelFallsBackToUserDefault(t *testing.T) {
	home := t.TempDir()
	t.Setenv("VOLTUI_HOME", home)
	writeProjectDefaultTestConfig(t, home, "config.toml", `default_model = "deepseek-pro"

[[providers]]
name        = "deepseek-pro"
kind        = "openai"
base_url    = "https://api.deepseek.com"
model       = "deepseek-v4-pro"
api_key_env = "DEEPSEEK_API_KEY"
`)

	project := t.TempDir()
	projectConfig := writeProjectDefaultTestConfig(t, project, "voltui.toml", `default_model = "deepseek-flash"

[permissions]
allow = ["Bash(go test*)"]
`)

	cfg, err := LoadForRoot(project)
	if err != nil {
		t.Fatalf("LoadForRoot: %v", err)
	}
	if cfg.DefaultModel != "deepseek-pro" {
		t.Fatalf("DefaultModel = %q, want fallback to user default %q", cfg.DefaultModel, "deepseek-pro")
	}
	if got := cfg.IgnoredProjectDefaultModel(); got != "deepseek-flash" {
		t.Fatalf("IgnoredProjectDefaultModel() = %q, want %q", got, "deepseek-flash")
	}
	if _, ok := cfg.ResolveModel(cfg.DefaultModel); !ok {
		t.Fatalf("ResolveModel(%q) failed after fallback", cfg.DefaultModel)
	}
	data, err := os.ReadFile(projectConfig)
	if err != nil {
		t.Fatalf("ReadFile project config: %v", err)
	}
	if string(data) != `default_model = "deepseek-flash"

[permissions]
allow = ["Bash(go test*)"]
` {
		t.Fatalf("LoadForRoot rewrote project config: %q", data)
	}
}

// A project default_model that resolves remains the higher-priority value.
func TestLoadForRoot_ResolvableProjectDefaultModelStillWins(t *testing.T) {
	home := t.TempDir()
	t.Setenv("VOLTUI_HOME", home)
	writeProjectDefaultTestConfig(t, home, "config.toml", `default_model = "deepseek-pro"

[[providers]]
name        = "deepseek-pro"
kind        = "openai"
base_url    = "https://api.deepseek.com"
model       = "deepseek-v4-pro"
api_key_env = "DEEPSEEK_API_KEY"

[[providers]]
name        = "local"
kind        = "openai"
base_url    = "http://127.0.0.1:8080/v1"
model       = "local-model"
`)

	project := t.TempDir()
	writeProjectDefaultTestConfig(t, project, "voltui.toml", `default_model = "local"
`)

	cfg, err := LoadForRoot(project)
	if err != nil {
		t.Fatalf("LoadForRoot: %v", err)
	}
	if cfg.DefaultModel != "local" {
		t.Fatalf("DefaultModel = %q, want project override %q kept", cfg.DefaultModel, "local")
	}
	if got := cfg.IgnoredProjectDefaultModel(); got != "" {
		t.Fatalf("IgnoredProjectDefaultModel() = %q, want empty", got)
	}
}

// If the user-global default also fails to resolve, retain the project value so
// the existing boot error names the value the user actually wrote.
func TestLoadForRoot_ProjectDefaultModelKeptWhenUserDefaultUnresolvable(t *testing.T) {
	home := t.TempDir()
	t.Setenv("VOLTUI_HOME", home)
	writeProjectDefaultTestConfig(t, home, "config.toml", `default_model = "gone-too"

[[providers]]
name        = "deepseek-pro"
kind        = "openai"
base_url    = "https://api.deepseek.com"
model       = "deepseek-v4-pro"
api_key_env = "DEEPSEEK_API_KEY"
`)

	project := t.TempDir()
	writeProjectDefaultTestConfig(t, project, "voltui.toml", `default_model = "gone"
`)

	cfg, err := LoadForRoot(project)
	if err != nil {
		t.Fatalf("LoadForRoot: %v", err)
	}
	if cfg.DefaultModel != "gone" {
		t.Fatalf("DefaultModel = %q, want project value %q kept", cfg.DefaultModel, "gone")
	}
	if got := cfg.IgnoredProjectDefaultModel(); got != "" {
		t.Fatalf("IgnoredProjectDefaultModel() = %q, want empty", got)
	}
}

// With no explicit user default, a broken project default must keep failing
// loudly instead of silently substituting the built-in value.
func TestLoadForRoot_NoUserConfigKeepsBrokenProjectDefaultModel(t *testing.T) {
	home := t.TempDir()
	t.Setenv("VOLTUI_HOME", home)

	project := t.TempDir()
	writeProjectDefaultTestConfig(t, project, "voltui.toml", `default_model = "legacy-missing"

[[providers]]
name        = "deepseek-flash"
kind        = "openai"
base_url    = "https://example.invalid"
model       = "deepseek-v4-flash"
api_key_env = "VOLTUI_TEST_KEY_UNSET"
`)

	cfg, err := LoadForRoot(project)
	if err != nil {
		t.Fatalf("LoadForRoot: %v", err)
	}
	if cfg.DefaultModel != "legacy-missing" {
		t.Fatalf("DefaultModel = %q, want broken project value %q kept", cfg.DefaultModel, "legacy-missing")
	}
	if got := cfg.IgnoredProjectDefaultModel(); got != "" {
		t.Fatalf("IgnoredProjectDefaultModel() = %q, want empty", got)
	}
}

// A user config that merely defines providers is not enough to activate the
// fallback: default_model must be explicitly set by the user. Otherwise a
// stale project value remains visible in the actionable boot error.
func TestLoadForRoot_UserConfigWithoutDefaultKeepsBrokenProjectDefaultModel(t *testing.T) {
	home := t.TempDir()
	t.Setenv("VOLTUI_HOME", home)
	writeProjectDefaultTestConfig(t, home, "config.toml", `
[[providers]]
name        = "deepseek-pro"
kind        = "openai"
base_url    = "https://api.deepseek.com"
model       = "deepseek-v4-pro"
api_key_env = "DEEPSEEK_API_KEY"
`)

	project := t.TempDir()
	writeProjectDefaultTestConfig(t, project, "voltui.toml", `default_model = "legacy-missing"
`)

	cfg, err := LoadForRoot(project)
	if err != nil {
		t.Fatalf("LoadForRoot: %v", err)
	}
	if cfg.DefaultModel != "legacy-missing" {
		t.Fatalf("DefaultModel = %q, want broken project value %q kept", cfg.DefaultModel, "legacy-missing")
	}
	if got := cfg.IgnoredProjectDefaultModel(); got != "" {
		t.Fatalf("IgnoredProjectDefaultModel() = %q, want empty", got)
	}
}

// A user default is only a fallback when the project overrode it. A missing
// project default_model must leave the user value untouched.
func TestLoadForRoot_NoProjectOverrideLeavesUserDefaultAlone(t *testing.T) {
	home := t.TempDir()
	t.Setenv("VOLTUI_HOME", home)
	writeProjectDefaultTestConfig(t, home, "config.toml", `default_model = "deepseek-pro"

[[providers]]
name        = "deepseek-pro"
kind        = "openai"
base_url    = "https://api.deepseek.com"
model       = "deepseek-v4-pro"
api_key_env = "DEEPSEEK_API_KEY"
`)

	project := t.TempDir()
	cfg, err := LoadForRoot(project)
	if err != nil {
		t.Fatalf("LoadForRoot: %v", err)
	}
	if cfg.DefaultModel != "deepseek-pro" {
		t.Fatalf("DefaultModel = %q, want %q", cfg.DefaultModel, "deepseek-pro")
	}
	if got := cfg.IgnoredProjectDefaultModel(); got != "" {
		t.Fatalf("IgnoredProjectDefaultModel() = %q, want empty", got)
	}
}
