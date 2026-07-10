package builtin

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBundledCoreutilsBinAtReadsValidatedRuntimeMetadata(t *testing.T) {
	appDir := t.TempDir()
	bin := filepath.Join(appDir, bundledCoreutilsDir, "payload", "bin")
	if err := os.MkdirAll(bin, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(bin, "coreutils.exe"), []byte("fixture"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(appDir, bundledCoreutilsDir, bundledCoreutilsPathFile), []byte("payload/bin\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := bundledCoreutilsBinAt(appDir); got != bin {
		t.Fatalf("bundledCoreutilsBinAt() = %q, want %q", got, bin)
	}
}

func TestBundledCoreutilsBinAtRejectsUnsafeOrIncompleteMetadata(t *testing.T) {
	appDir := t.TempDir()
	root := filepath.Join(appDir, bundledCoreutilsDir)
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, bundledCoreutilsPathFile)
	for _, value := range []string{"../bin", "C:\\tools", "\\\\server\\share", "missing"} {
		if err := os.WriteFile(path, []byte(value), 0o644); err != nil {
			t.Fatal(err)
		}
		if got := bundledCoreutilsBinAt(appDir); got != "" {
			t.Fatalf("bundledCoreutilsBinAt(%q) = %q, want empty", value, got)
		}
	}
}

func TestSafeCoreutilsRuntimePath(t *testing.T) {
	for _, value := range []string{".", "bin", "nested/bin"} {
		if _, ok := safeCoreutilsRuntimePath(value); !ok {
			t.Fatalf("safeCoreutilsRuntimePath(%q) rejected a safe path", value)
		}
	}
	for _, value := range []string{"", "..", "../bin", "/bin", "\\\\server\\share", "C:\\bin", "bin/../other"} {
		if _, ok := safeCoreutilsRuntimePath(value); ok {
			t.Fatalf("safeCoreutilsRuntimePath(%q) accepted an unsafe path", value)
		}
	}
}
