package config

import (
	"os"
	"path/filepath"
	"testing"
)

// TestBundledCredentialIsLowestPriority locks down the OEM bundled.env
// behavior: it only supplies a key when neither the VoltUI credentials store
// nor the process environment has one. Env wins; bundled is the last resort.
func TestBundledCredentialIsLowestPriority(t *testing.T) {
	// Stage a temp bundled.env carrying an OEM gateway key.
	dir := t.TempDir()
	bundled := filepath.Join(dir, "bundled.env")
	if err := os.WriteFile(bundled, []byte("XIGU_API_KEY=bundled-value\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	// Pin the path seam + isolate from the real machine's credentials store.
	prevPath := bundledEnvPath
	bundledEnvPath = func() string { return bundled }
	prevLookup := storedCredentialValueLookup
	storedCredentialValueLookup = func(string) (string, CredentialSource, bool) {
		return "", CredentialSource{}, false
	}
	t.Cleanup(func() {
		bundledEnvPath = prevPath
		storedCredentialValueLookup = prevLookup
	})

	t.Setenv("XIGU_API_KEY", "")

	// 1) Nothing else configured -> bundled fallback applies.
	res := resolveCredentialForRootGlobalFirst(".", "XIGU_API_KEY")
	if !res.Set || res.Value != "bundled-value" {
		t.Fatalf("expected bundled fallback, got Set=%v Value=%q", res.Set, res.Value)
	}
	if res.Source.Kind != CredentialSourceBundled {
		t.Fatalf("source kind = %q, want bundled", res.Source.Kind)
	}

	// 2) A real environment value shadows the bundled key.
	t.Setenv("XIGU_API_KEY", "from-env")
	res = resolveCredentialForRootGlobalFirst(".", "XIGU_API_KEY")
	if !res.Set || res.Value != "from-env" {
		t.Fatalf("env must beat bundled, got Set=%v Value=%q", res.Set, res.Value)
	}
	if res.Source.Kind != CredentialSourceEnvironment {
		t.Fatalf("source kind = %q, want environment", res.Source.Kind)
	}
}
