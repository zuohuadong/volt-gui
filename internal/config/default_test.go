package config

import "testing"

func TestDefaultAutoPlanOff(t *testing.T) {
	if got := Default().Agent.AutoPlan; got != "off" {
		t.Fatalf("default auto_plan = %q, want off", got)
	}
}

func TestDefaultUsesXiguInternalGateway(t *testing.T) {
	cfg := Default()
	if cfg.DefaultModel != "qwen-gpu4" {
		t.Fatalf("default_model = %q, want qwen-gpu4", cfg.DefaultModel)
	}

	want := map[string]string{
		"glm-primary": "glm-primary/GLM-5.1-478B-A42B-REAP-NVFP4",
		"qwen-gpu4":   "qwen-gpu4/qwen36-opus-prisma8-gpu4",
		"qwen-gpu5":   "qwen-gpu5/qwen36-opus-prisma8-gpu5",
		"image-gpu5":  "image-gpu5/image-gpu5",
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
		if provider.APIKeyEnv != "XIGU_API_KEY" {
			t.Errorf("%s api_key_env = %q, want XIGU_API_KEY", name, provider.APIKeyEnv)
		}
		if provider.ContextWindow != 131_072 {
			t.Errorf("%s context_window = %d, want 131072", name, provider.ContextWindow)
		}
		if name == "qwen-gpu4" || name == "qwen-gpu5" {
			if provider.DefaultEffort != "high" || len(provider.SupportedEfforts) != 2 || provider.SupportedEfforts[0] != "high" || provider.SupportedEfforts[1] != "max" {
				t.Errorf("%s effort = default %q supported %v, want high with [high max]", name, provider.DefaultEffort, provider.SupportedEfforts)
			}
		}
	}
}
