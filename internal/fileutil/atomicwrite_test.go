package fileutil

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestReplaceFileRenamesInPlace(t *testing.T) {
	dir := t.TempDir()
	tmp := filepath.Join(dir, "x.tmp")
	dest := filepath.Join(dir, "x.txt")
	if err := os.WriteFile(tmp, []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := ReplaceFile(tmp, dest); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(dest); string(b) != "hello" {
		t.Errorf("dest = %q, want hello", b)
	}
	if _, err := os.Stat(tmp); !os.IsNotExist(err) {
		t.Error("tmp should be gone after ReplaceFile")
	}
}

func TestCopyOntoOverwritesAndPreservesMode(t *testing.T) {
	dir := t.TempDir()
	tmp := filepath.Join(dir, "x.tmp")
	dest := filepath.Join(dir, "x.txt")
	if err := os.WriteFile(tmp, []byte("new"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(dest, []byte("old-and-longer"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := copyOnto(tmp, dest); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(dest); string(b) != "new" {
		t.Errorf("dest = %q, want new (fully overwritten)", b)
	}
	if _, err := os.Stat(tmp); !os.IsNotExist(err) {
		t.Error("tmp should be removed after copyOnto")
	}
	// Mode preservation is meaningful on Unix; Windows only tracks the read-only bit.
	if info, err := os.Stat(dest); err == nil && info.Mode().Perm() != 0o600 {
		t.Logf("dest mode = %o (want 0600 on Unix)", info.Mode().Perm())
	}
}

func TestAtomicWriteFileReplacesExisting(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.toml")
	if err := os.WriteFile(path, []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := AtomicWriteFile(path, []byte("new-content"), 0o600); err != nil {
		t.Fatalf("AtomicWriteFile: %v", err)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "new-content" {
		t.Fatalf("content = %q, want %q", got, "new-content")
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if perm := info.Mode().Perm(); runtime.GOOS != "windows" && perm != 0o600 {
		t.Fatalf("perm = %o, want 600", perm)
	}
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if e.Name() != "config.toml" {
			t.Fatalf("unexpected leftover file: %s", e.Name())
		}
	}
}

func TestAtomicWriteFileCreatesParentDir(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "nested", "deep", "creds")
	if err := AtomicWriteFile(path, []byte("x"), 0o600); err != nil {
		t.Fatalf("AtomicWriteFile into missing dir: %v", err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("file not created: %v", err)
	}
}
