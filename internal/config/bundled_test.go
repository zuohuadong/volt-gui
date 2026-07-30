package config

import (
	"os"
	"path/filepath"
	"testing"
)

// TestBundledCredentialIsLowestPriority locks down the OEM bundled.env
// behavior: a user-saved credential wins and the bundle is the fallback.
func TestBundledCredentialIsLowestPriority(t *testing.T) {
	// Stage a temp bundled.env carrying an OEM gateway key.
	dir := t.TempDir()
	bundled := filepath.Join(dir, "bundled.env")
	if err := os.WriteFile(bundled, []byte("volt_API_KEY=bundled-value\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	// Pin the path seam + isolate from the real machine's credentials store.
	prevPath := bundledEnvPath
	bundledEnvPath = func() string { return bundled }
	storedValue := ""
	prevLookup := storedCredentialValueLookup
	storedCredentialValueLookup = func(string) (string, CredentialSource, bool) {
		if storedValue == "" {
			return "", CredentialSource{}, false
		}
		return storedValue, CredentialSource{Kind: CredentialSourceCredentials}, true
	}
	t.Cleanup(func() {
		bundledEnvPath = prevPath
		storedCredentialValueLookup = prevLookup
	})

	// 1) Nothing else configured -> bundled fallback applies.
	res := resolveCredentialForRootGlobalFirst(".", "volt_API_KEY")
	if !res.Set || res.Value != "bundled-value" {
		t.Fatalf("expected bundled fallback, got Set=%v Value=%q", res.Set, res.Value)
	}
	if res.Source.Kind != CredentialSourceBundled {
		t.Fatalf("source kind = %q, want bundled", res.Source.Kind)
	}

	// 2) A key explicitly saved by the user shadows the bundled key.
	storedValue = "from-user"
	res = resolveCredentialForRootGlobalFirst(".", "volt_API_KEY")
	if !res.Set || res.Value != "from-user" {
		t.Fatalf("user credential must beat bundled, got Set=%v Value=%q", res.Set, res.Value)
	}
	if res.Source.Kind != CredentialSourceCredentials {
		t.Fatalf("source kind = %q, want credentials", res.Source.Kind)
	}
}

func TestDefaultUsesBundledvoltGateway(t *testing.T) {
	dir := t.TempDir()
	bundled := filepath.Join(dir, "bundled.env")
	const baseURL = "http://gateway.internal.test/v1"
	if err := os.WriteFile(bundled, []byte("volt_MODEL_BASE_URL="+baseURL+"\nvolt_API_KEY=test-key\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	previousPath := bundledEnvPath
	bundledEnvPath = func() string { return bundled }
	t.Cleanup(func() { bundledEnvPath = previousPath })

	cfg := Default()
	if cfg.DefaultModel != "xllm" {
		t.Fatalf("default model = %q, want xllm", cfg.DefaultModel)
	}
	want := map[string]struct {
		model  string
		label  string
		vision bool
	}{
		"xllm": {model: "xllm", label: "纯文本"},
		"vlm":  {model: "vlm", label: "多模态", vision: true},
	}
	if len(cfg.Providers) != len(want) {
		t.Fatalf("bundled provider count = %d, want %d", len(cfg.Providers), len(want))
	}
	for name, expected := range want {
		entry, ok := cfg.Provider(name)
		if !ok {
			t.Fatalf("bundled provider %q is missing", name)
		}
		if entry.BaseURL != baseURL || entry.Model != expected.model || entry.DisplayLabel() != expected.label || entry.APIKeyEnv != "volt_API_KEY" || entry.Vision != expected.vision || !entry.NoProxy {
			t.Errorf("provider %q = %+v", name, entry)
		}
	}
}
