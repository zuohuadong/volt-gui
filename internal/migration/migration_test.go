package migration

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"reasonix/internal/config"
	"reasonix/internal/event"
)

const legacyMessageLog = `{"role":"user","content":"hello from v0.x"}
{"role":"assistant","content":"hi there"}
`

func isolateMigrationHome(t *testing.T) string {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
	t.Setenv("AppData", filepath.Join(home, "AppData"))
	t.Setenv("REASONIX_HOME", filepath.Join(home, "new-reasonix"))
	t.Setenv("REASONIX_CREDENTIALS_STORE", "file")
	t.Chdir(t.TempDir())
	return home
}

func TestRunLegacyRescueImportsSessionsAndEmitsProgress(t *testing.T) {
	home := isolateMigrationHome(t)
	legacyDir := filepath.Join(home, ".reasonix", "sessions")
	if err := os.MkdirAll(legacyDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(legacyDir, "old-chat.jsonl"), []byte(legacyMessageLog), 0o644); err != nil {
		t.Fatal(err)
	}

	var notices []string
	res := RunLegacyRescue(event.FuncSink(func(e event.Event) {
		if e.Kind == event.Notice {
			notices = append(notices, e.Text)
		}
	}))
	if res.ConfigErr != nil {
		t.Fatalf("config migration error: %v", res.ConfigErr)
	}
	if len(res.SessionErrs) != 0 {
		t.Fatalf("session migration errors: %v", res.SessionErrs)
	}
	if got := totalImported(res.SessionImports); got != 1 {
		t.Fatalf("imported sessions = %d, want 1; imports=%+v", got, res.SessionImports)
	}
	if _, err := os.Stat(filepath.Join(config.SessionDir(), "old-chat.jsonl")); err != nil {
		t.Fatalf("migrated session missing: %v", err)
	}
	joined := strings.Join(notices, "\n")
	for _, want := range []string{
		"migration rescue: checking legacy config and credentials",
		"migration rescue: scanning legacy sessions",
		"imported 1 past session(s)",
		"migration rescue complete: imported 1 past session(s)",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("missing notice %q in:\n%s", want, joined)
		}
	}
}

func TestRunLegacyRescueNoopStillShowsProgress(t *testing.T) {
	isolateMigrationHome(t)

	var notices []string
	res := RunLegacyRescue(event.FuncSink(func(e event.Event) {
		if e.Kind == event.Notice {
			notices = append(notices, e.Text)
		}
	}))
	if got := totalImported(res.SessionImports); got != 0 {
		t.Fatalf("imported sessions = %d, want 0", got)
	}
	joined := strings.Join(notices, "\n")
	for _, want := range []string{
		"migration rescue: checking legacy config and credentials",
		"migration rescue: no legacy sessions needed migration",
		"migration rescue complete: no legacy data needed migration",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("missing notice %q in:\n%s", want, joined)
		}
	}
}

func totalImported(imports []SessionImport) int {
	total := 0
	for _, imp := range imports {
		total += imp.Count
	}
	return total
}
