package config

import "testing"

func TestDefaultRetiredAutoPlanCompatibilityOff(t *testing.T) {
	if got := Default().Agent.AutoPlan; got != "off" {
		t.Fatalf("default auto_plan = %q, want off", got)
	}
}

func TestResolveExplicitProviderModelUsesConfiguredEndpoint(t *testing.T) {
	cfg := &Config{Providers: []ProviderEntry{{
		Name: "qwen-thinking", Kind: "openai", BaseURL: "http://127.0.0.1:9010/v1",
		Model: "qwen-gpu4/step3p7-flash", APIKeyEnv: "volt_API_KEY",
	}}}
	entry, ok := cfg.ResolveExplicitProviderModel("qwen-thinking/qwen-gpu4/future-model")
	if !ok {
		t.Fatal("explicit provider model did not resolve")
	}
	if entry.Model != "qwen-gpu4/future-model" || entry.BaseURL != "http://127.0.0.1:9010/v1" || entry.APIKeyEnv != "volt_API_KEY" {
		t.Fatalf("explicit provider model = %+v", entry)
	}
	if _, ok := cfg.ResolveExplicitProviderModel("missing/qwen-gpu4/future-model"); ok {
		t.Fatal("unknown provider resolved")
	}
}

func TestDefaultReasoningLanguageAuto(t *testing.T) {
	if got := Default().ReasoningLanguage(); got != "auto" {
		t.Fatalf("default reasoning_language = %q, want auto", got)
	}
}

func TestDefaultDesktopAppearanceAutoGraphite(t *testing.T) {
	cfg := Default()
	if got := cfg.DesktopTheme(); got != "auto" {
		t.Fatalf("default desktop theme = %q, want auto", got)
	}
	if got := cfg.DesktopThemeStyle(); got != "" {
		t.Fatalf("default desktop theme style = %q, want empty so frontend resolves graphite", got)
	}
}

func TestDefaultDesktopMetricsOn(t *testing.T) {
	cfg := Default()
	if !cfg.DesktopMetrics() {
		t.Fatal("default desktop metrics = false, want true")
	}
	disabled := false
	cfg.Desktop.Metrics = &disabled
	if cfg.DesktopMetrics() {
		t.Fatal("desktop metrics explicit false = true, want false")
	}
}
