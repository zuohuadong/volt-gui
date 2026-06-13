package codegraph

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// writeExec writes an executable file at path with the given content and +x.
func writeExec(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
		t.Fatal(err)
	}
}

func TestResolveOverride(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("override path test uses a unix +x bit")
	}
	dir := t.TempDir()
	bin := filepath.Join(dir, "codegraph")
	writeExec(t, bin, "#!/bin/sh\nexit 0\n")

	got, ok := Resolve(bin)
	if !ok || got != bin {
		t.Fatalf("Resolve(%q) = %q, %v; want %q, true", bin, got, ok, bin)
	}
}

func TestResolveOverrideMissingFallsThrough(t *testing.T) {
	// A non-existent override must not resolve to itself; with no bundle/PATH
	// match either, ok is false (a real codegraph on PATH could make this true,
	// so only assert the override itself is not returned).
	missing := filepath.Join(t.TempDir(), "nope")
	if got, _ := Resolve(missing); got == missing {
		t.Fatalf("Resolve returned the missing override path %q", got)
	}
}

func TestExpandTilde(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Skip("no home dir")
	}
	if got := expand("~/foo/bar"); got != filepath.Join(home, "foo", "bar") {
		t.Fatalf("expand(~/foo/bar) = %q", got)
	}
}

func TestEnsureInitSkipsWhenPresent(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, ".codegraph"), 0o755); err != nil {
		t.Fatal(err)
	}
	// bin points at nothing runnable; EnsureInit must short-circuit before exec.
	if err := EnsureInit(context.Background(), filepath.Join(root, "no-such-bin"), root); err != nil {
		t.Fatalf("EnsureInit with existing .codegraph should be a no-op, got %v", err)
	}
}

func TestEnsureInitRunsWhenAbsent(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake launcher is a POSIX-sh script")
	}
	root := t.TempDir()
	// A fake codegraph that creates .codegraph in its working directory — EnsureInit
	// runs it with cmd.Dir = root, so this is independent of the exact arguments.
	bin := filepath.Join(t.TempDir(), "fakecg")
	writeExec(t, bin, "#!/bin/sh\nmkdir -p .codegraph\n")

	if err := EnsureInit(context.Background(), bin, root); err != nil {
		t.Fatalf("EnsureInit = %v", err)
	}
	if fi, err := os.Stat(filepath.Join(root, ".codegraph")); err != nil || !fi.IsDir() {
		t.Fatalf(".codegraph not created: err=%v", err)
	}
}

func TestEnsureInitPropagatesFailure(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake launcher is a POSIX-sh script")
	}
	root := t.TempDir()
	bin := filepath.Join(t.TempDir(), "failcg")
	writeExec(t, bin, "#!/bin/sh\necho boom 1>&2\nexit 3\n")

	if err := EnsureInit(context.Background(), bin, root); err == nil {
		t.Fatal("EnsureInit should return the init failure")
	}
}

func TestDaemonPIDNoLog(t *testing.T) {
	root := t.TempDir()
	pid, ok := DaemonPID(root)
	if ok || pid != 0 {
		t.Fatalf("DaemonPID with no log = %d, %v; want 0, false", pid, ok)
	}
}

func TestDaemonPIDEmptyLog(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, ".codegraph"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".codegraph", "daemon.log"), []byte(""), 0o644); err != nil {
		t.Fatal(err)
	}
	pid, ok := DaemonPID(root)
	if ok || pid != 0 {
		t.Fatalf("DaemonPID with empty log = %d, %v; want 0, false", pid, ok)
	}
}

func TestDaemonPIDNoListeningLine(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, ".codegraph"), 0o755); err != nil {
		t.Fatal(err)
	}
	log := "[CodeGraph MCP] File watcher active\n[CodeGraph MCP] Caught up 7 file(s)\n"
	if err := os.WriteFile(filepath.Join(root, ".codegraph", "daemon.log"), []byte(log), 0o644); err != nil {
		t.Fatal(err)
	}
	pid, ok := DaemonPID(root)
	if ok || pid != 0 {
		t.Fatalf("DaemonPID with no Listening line = %d, %v; want 0, false", pid, ok)
	}
}

func TestDaemonPIDSingleLine(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, ".codegraph"), 0o755); err != nil {
		t.Fatal(err)
	}
	log := "[CodeGraph daemon] Listening on /tmp/.codegraph/daemon.sock (pid 12345, v0.9.7). Idle timeout 300000ms.\n"
	if err := os.WriteFile(filepath.Join(root, ".codegraph", "daemon.log"), []byte(log), 0o644); err != nil {
		t.Fatal(err)
	}
	pid, ok := DaemonPID(root)
	if !ok || pid != 12345 {
		t.Fatalf("DaemonPID = %d, %v; want 12345, true", pid, ok)
	}
}

func TestDaemonPIDReturnsLast(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, ".codegraph"), 0o755); err != nil {
		t.Fatal(err)
	}
	log := "[CodeGraph daemon] Listening on /tmp/.codegraph/daemon.sock (pid 100, v0.9.7). Idle timeout 300000ms.\n"
	log += "[CodeGraph daemon] Shutting down (idle timeout; clients=0).\n"
	log += "[CodeGraph daemon] Listening on /tmp/.codegraph/daemon.sock (pid 99999, v0.9.9). Idle timeout 300000ms.\n"
	if err := os.WriteFile(filepath.Join(root, ".codegraph", "daemon.log"), []byte(log), 0o644); err != nil {
		t.Fatal(err)
	}
	pid, ok := DaemonPID(root)
	if !ok || pid != 99999 {
		t.Fatalf("DaemonPID = %d, %v; want 99999 (last), true", pid, ok)
	}
}

func TestDaemonPIDSkipsMalformed(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, ".codegraph"), 0o755); err != nil {
		t.Fatal(err)
	}
	// Lines missing "(pid ", with non-numeric PID, and with zero PID should all be skipped.
	log := "[CodeGraph daemon] Listening on /tmp/.codegraph/daemon.sock (v0.9.7). Idle timeout 300000ms.\n"
	log += "[CodeGraph daemon] Listening on /tmp/.codegraph/daemon.sock (pid abc, v0.9.7). Idle timeout 300000ms.\n"
	log += "[CodeGraph daemon] Listening on /tmp/.codegraph/daemon.sock (pid 0, v0.9.7). Idle timeout 300000ms.\n"
	log += "[CodeGraph daemon] Listening on /tmp/.codegraph/daemon.sock (pid -5, v0.9.7). Idle timeout 300000ms.\n"
	log += "[CodeGraph daemon] Listening on /tmp/.codegraph/daemon.sock (pid 42, v0.9.7). Idle timeout 300000ms.\n"
	if err := os.WriteFile(filepath.Join(root, ".codegraph", "daemon.log"), []byte(log), 0o644); err != nil {
		t.Fatal(err)
	}
	pid, ok := DaemonPID(root)
	if !ok || pid != 42 {
		t.Fatalf("DaemonPID = %d, %v; want 42 (only valid PID), true", pid, ok)
	}
}

func TestKillDaemonNoLog(t *testing.T) {
	// Must not panic or error when there is no .codegraph directory at all.
	root := t.TempDir()
	KillDaemon(root) // no-op
}

func TestKillDaemonBadPID(t *testing.T) {
	// PID that doesn't correspond to a running process: KillDaemon must not error.
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, ".codegraph"), 0o755); err != nil {
		t.Fatal(err)
	}
	// Use a PID that almost certainly doesn't exist (max int32).
	log := "[CodeGraph daemon] Listening on /tmp/.codegraph/daemon.sock (pid 2147483647, v0.9.7). Idle timeout 300000ms.\n"
	if err := os.WriteFile(filepath.Join(root, ".codegraph", "daemon.log"), []byte(log), 0o644); err != nil {
		t.Fatal(err)
	}
	KillDaemon(root) // best-effort; must not panic
}

func TestIndexableRootRejectsFilesystemRoots(t *testing.T) {
	if got := IndexableRoot(t.TempDir()); !got {
		t.Fatal("a real project dir must be indexable")
	}
	for _, root := range []string{"", "   "} {
		if IndexableRoot(root) {
			t.Fatalf("IndexableRoot(%q) = true; want false", root)
		}
	}
	var roots []string
	if runtime.GOOS == "windows" {
		roots = []string{`C:\`, `c:\`, `\\server\share`}
	} else {
		roots = []string{"/"}
	}
	for _, root := range roots {
		if IndexableRoot(root) {
			t.Fatalf("IndexableRoot(%q) = true; want false (filesystem root)", root)
		}
	}
}
