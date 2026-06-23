package cli

import (
	"strings"
	"testing"

	"voltui/internal/config"
)

// TestModelRefsFromConfig verifies the /model picker enumerates configured
// provider/model refs (built-in defaults when no voltui.toml is present), and
// only those whose provider API key is set.
func TestModelRefsFromConfig(t *testing.T) {
	isolateUserConfig(t)
	t.Chdir(t.TempDir()) // no voltui.toml → built-in default providers
	// Only DeepSeek keyed in VoltUI's credentials store → MiMo refs must be
	// filtered out.
	if _, err := config.StoreCredentialLines([]string{"DEEPSEEK_API_KEY=test-key"}); err != nil {
		t.Fatalf("store credentials: %v", err)
	}
	refs := modelRefs()
	if len(refs) == 0 {
		t.Fatal("expected default provider/model refs, got none")
	}
	for _, r := range refs {
		if !strings.Contains(r, "/") {
			t.Errorf("ref %q should be provider/model", r)
		}
		if strings.HasPrefix(r, "mimo") {
			t.Errorf("ref %q from a provider without an API key should be filtered out", r)
		}
	}
}

// TestModelRefsSkipsUnconfigured verifies that with no provider keys set, the
// picker offers nothing rather than listing models the user can't select.
func TestModelRefsSkipsUnconfigured(t *testing.T) {
	isolateUserConfig(t)
	t.Chdir(t.TempDir())
	if refs := modelRefs(); len(refs) != 0 {
		t.Errorf("no keys set → no refs, got %v", refs)
	}
}

// TestModelArgCompletion verifies "/model " completes to the configured refs
// through the shared completion path.
func TestModelArgCompletion(t *testing.T) {
	isolateUserConfig(t)
	t.Chdir(t.TempDir())
	if _, err := config.StoreCredentialLines([]string{"DEEPSEEK_API_KEY=test-key"}); err != nil {
		t.Fatalf("store credentials: %v", err)
	}
	m := newTestChatTUI()
	items, _, ok := m.slashArgItems("/model ")
	if !ok || len(items) == 0 {
		t.Fatalf("/model arg completion should offer refs, ok=%v n=%d", ok, len(items))
	}
}
