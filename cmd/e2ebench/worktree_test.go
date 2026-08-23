package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestCreateAttemptWorktreePreservesCallerTree(t *testing.T) {
	repo := t.TempDir()
	runWorktreeGit(t, repo, "init")
	runWorktreeGit(t, repo, "config", "core.autocrlf", "false")
	writeWorktreeFile(t, filepath.Join(repo, "tracked.txt"), "committed\n")
	runWorktreeGit(t, repo, "add", "tracked.txt")
	runWorktreeGit(t, repo, "-c", "user.name=e2ebench", "-c", "user.email=e2ebench@example.invalid", "commit", "-m", "init")

	writeWorktreeFile(t, filepath.Join(repo, "tracked.txt"), "local change\n")
	writeWorktreeFile(t, filepath.Join(repo, "untracked.txt"), "keep me\n")
	writeWorktreeFile(t, filepath.Join(repo, "voltui.toml"), "default_model = \"local\"\n")

	attempt, cleanup, err := createAttemptWorktree(repo)
	if err != nil {
		t.Fatalf("createAttemptWorktree: %v", err)
	}
	t.Cleanup(cleanup)
	if got := readWorktreeFile(t, filepath.Join(attempt, "tracked.txt")); got != "committed\n" {
		t.Fatalf("attempt tracked file = %q, want committed HEAD", got)
	}
	if got := readWorktreeFile(t, filepath.Join(attempt, "voltui.toml")); got != "default_model = \"local\"\n" {
		t.Fatalf("attempt config = %q", got)
	}
	cleanup()

	if got := readWorktreeFile(t, filepath.Join(repo, "tracked.txt")); got != "local change\n" {
		t.Fatalf("caller tracked file changed to %q", got)
	}
	if got := readWorktreeFile(t, filepath.Join(repo, "untracked.txt")); got != "keep me\n" {
		t.Fatalf("caller untracked file changed to %q", got)
	}
}

func runWorktreeGit(t *testing.T, repo string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", repo}, args...)...)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
	}
}

func writeWorktreeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func readWorktreeFile(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(data)
}
