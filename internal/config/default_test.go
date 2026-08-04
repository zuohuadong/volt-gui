package config

import "testing"

func TestDefaultAutoPlanOff(t *testing.T) {
	if got := Default().Agent.AutoPlan; got != "off" {
		t.Fatalf("default auto_plan = %q, want off", got)
	}
}

func TestDefaultUsesvoltInternalGateway(t *testing.T) {
	cfg := Default()
	if cfg.DefaultModel != "qwen-thinking" {
		t.Fatalf("default_model = %q, want qwen-thinking", cfg.DefaultModel)
	}

	want := map[string]string{
		"glm-5.2":       "glm-primary/glm-5.2-nvfp4",
		"qwen-thinking": "qwen-gpu4/step3p7-flash",
	}
	for name, model := range want {
		provider, ok := cfg.Provider(name)
		if !ok {
			t.Fatalf("default provider %q missing", name)
		}
		if provider.Kind != "openai" {
			t.Errorf("%s kind = %q, want openai", name, provider.Kind)
		}
		if provider.BaseURL != "http://192.168.1.47:9010/v1" {
			t.Errorf("%s base_url = %q", name, provider.BaseURL)
		}
		if provider.Model != model {
			t.Errorf("%s model = %q, want %q", name, provider.Model, model)
		}
		if provider.APIKeyEnv != "volt_API_KEY" {
			t.Errorf("%s api_key_env = %q, want volt_API_KEY", name, provider.APIKeyEnv)
		}
		if provider.ContextWindow != 131_072 {
			t.Errorf("%s context_window = %d, want 131072", name, provider.ContextWindow)
		}
		if name == "qwen-thinking" {
			if provider.DefaultEffort != "high" || len(provider.SupportedEfforts) != 2 || provider.SupportedEfforts[0] != "high" || provider.SupportedEfforts[1] != "max" {
				t.Errorf("%s effort = default %q supported %v, want high with [high max]", name, provider.DefaultEffort, provider.SupportedEfforts)
			}
		}
	}
	for _, removed := range []string{"qwen-fast", "image-gen"} {
		if _, ok := cfg.Provider(removed); ok {
			t.Errorf("retired default provider %q is still configured", removed)
		}
	}
}

func TestResolveExplicitProviderModelUsesConfiguredEndpoint(t *testing.T) {
	cfg := Default()
	entry, ok := cfg.ResolveExplicitProviderModel("qwen-thinking/qwen-gpu4/future-model")
	if !ok {
		t.Fatal("explicit provider model did not resolve")
	}
	if entry.Model != "qwen-gpu4/future-model" || entry.BaseURL != "http://192.168.1.47:9010/v1" || entry.APIKeyEnv != "volt_API_KEY" {
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

func TestDefaultMemoryCompilerEnabled(t *testing.T) {
	cfg := Default()
	if !cfg.MemoryCompilerEnabled() {
		t.Fatal("default memory compiler = false, want true")
	}
	if got := cfg.MemoryCompilerVerbosity(); got != MemoryCompilerVerbosityObserve {
		t.Fatalf("default memory compiler verbosity = %q, want observe", got)
	}
}

func TestDefaultPlanModeAllowHostAutomation(t *testing.T) {
	cfg := Default()
	if !cfg.PlanModeAllowHostAutomation() {
		t.Fatal("default plan_mode_allow_host_automation = false, want true")
	}
	disabled := false
	cfg.Agent.PlanModeAllowHostAutomation = &disabled
	if cfg.PlanModeAllowHostAutomation() {
		t.Fatal("explicit plan_mode_allow_host_automation = false resolved to true")
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
