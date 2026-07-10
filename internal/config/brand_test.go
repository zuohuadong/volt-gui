package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBrandNameEnvOverridesConfig(t *testing.T) {
	t.Setenv("VOLTUI_BRAND_NAME", "Acme Copilot")
	cfg := Default()
	cfg.Brand.Name = "Configured Brand"

	if got := cfg.BrandName(); got != "Acme Copilot" {
		t.Fatalf("BrandName() = %q, want env override", got)
	}
}

func TestBrandNameUsesCompiledDefault(t *testing.T) {
	t.Setenv("VOLTUI_BRAND_NAME", "")
	t.Setenv("REASONIX_BRAND_NAME", "")
	want := os.Getenv("VOLTUI_TEST_COMPILED_BRAND")
	if want == "" {
		want = "VoltUI"
	}

	defaultCfg := Default()
	if defaultCfg.Brand.Name != want {
		t.Fatalf("Default().Brand.Name = %q, want compiled default %q", defaultCfg.Brand.Name, want)
	}
	for name, cfg := range map[string]*Config{
		"default config": defaultCfg,
		"empty config":   {},
	} {
		if got := cfg.BrandName(); got != want {
			t.Fatalf("%s BrandName() = %q, want compiled default %q", name, got, want)
		}
	}
}

func TestBrandNameConfiguredValueOverridesCompiledDefault(t *testing.T) {
	t.Setenv("VOLTUI_BRAND_NAME", "")
	t.Setenv("REASONIX_BRAND_NAME", "")
	cfg := Default()
	cfg.Brand.Name = "Configured Brand"

	if got := cfg.BrandName(); got != "Configured Brand" {
		t.Fatalf("BrandName() = %q, want configured brand", got)
	}
}

func TestSystemPromptUsesCompiledDefaultIdentity(t *testing.T) {
	t.Setenv("VOLTUI_BRAND_NAME", "")
	t.Setenv("REASONIX_BRAND_NAME", "")
	want := os.Getenv("VOLTUI_TEST_COMPILED_BRAND")
	if want == "" {
		want = "VoltUI"
	}

	prompt, err := Default().ResolveSystemPromptForRoot(".")
	if err != nil {
		t.Fatalf("ResolveSystemPromptForRoot: %v", err)
	}
	if !strings.HasPrefix(prompt, "You are "+want) {
		t.Fatalf("system prompt identity = %q, want compiled brand prefix %q", prompt, "You are "+want)
	}
	if want != "VoltUI" && (strings.HasPrefix(prompt, "You are VoltUI") || strings.HasPrefix(prompt, "You are Volt")) {
		t.Fatalf("system prompt kept legacy identity prefix: %q", prompt)
	}
}

func TestSystemPromptAppliesBrandName(t *testing.T) {
	t.Setenv("VOLTUI_BRAND_NAME", "Acme Copilot")
	cfg := Default()

	prompt, err := cfg.ResolveSystemPromptForRoot(".")
	if err != nil {
		t.Fatalf("SystemPrompt: %v", err)
	}
	if !strings.Contains(prompt, "You are Acme Copilot") {
		t.Fatalf("system prompt did not apply brand name: %q", prompt)
	}
	if strings.Contains(prompt, "You are VoltUI") {
		t.Fatalf("system prompt still contains default brand: %q", prompt)
	}
}

func TestSystemPromptKeepsDefaultBrandWhenUnconfigured(t *testing.T) {
	t.Setenv("VOLTUI_BRAND_NAME", "")
	t.Setenv("REASONIX_BRAND_NAME", "")
	cfg := Default()

	prompt, err := cfg.ResolveSystemPromptForRoot(".")
	if err != nil {
		t.Fatalf("SystemPrompt: %v", err)
	}
	if !strings.Contains(prompt, "You are VoltUI") {
		t.Fatalf("default system prompt changed unexpectedly: %q", prompt)
	}
}

func TestSystemPromptFileAppliesBrandName(t *testing.T) {
	t.Setenv("VOLTUI_BRAND_NAME", "Acme Copilot")
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "SYSTEM.md"), []byte("You are VoltUI.\n"), 0o644); err != nil {
		t.Fatalf("write prompt file: %v", err)
	}
	cfg := Default()
	cfg.Agent.SystemPromptFile = "SYSTEM.md"

	prompt, err := cfg.ResolveSystemPromptForRoot(root)
	if err != nil {
		t.Fatalf("ResolveSystemPromptForRoot: %v", err)
	}
	if prompt != "You are Acme Copilot." {
		t.Fatalf("system prompt file = %q, want branded prompt", prompt)
	}
}
