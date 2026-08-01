package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunTestsAllowsStaticEnvAssignment(t *testing.T) {
	repo := t.TempDir()
	writeE2EFile(t, filepath.Join(repo, "go.mod"), "module example.com/e2ebenchtest\n\ngo 1.23\n")
	writeE2EFile(t, filepath.Join(repo, "env_test.go"), `package e2ebenchtest

import (
	"os"
	"testing"
)

func TestEnv(t *testing.T) {
	if got := os.Getenv("REASONIX_E2E_ENV"); got != "ok" {
		t.Fatalf("REASONIX_E2E_ENV = %q", got)
	}
}
`)

	ok, out := runTests(repo, "GOWORK=off REASONIX_E2E_ENV=ok go test", []string{"./..."})
	if !ok {
		t.Fatalf("runTests failed:\n%s", out)
	}
}

func TestRunTestsRejectsDynamicEnvAssignment(t *testing.T) {
	ok, out := runTests(t.TempDir(), "REASONIX_E2E_ENV=$(echo ok) go test", []string{"./..."})
	if ok {
		t.Fatal("runTests accepted dynamic env assignment")
	}
	if !strings.Contains(out, "invalid test command: shell expansion") {
		t.Fatalf("output = %q, want shell expansion rejection", out)
	}
}

func TestCreateAttemptWorktreePreservesCallerTree(t *testing.T) {
	repo := t.TempDir()
	runE2EGit(t, repo, "init")
	writeE2EFile(t, filepath.Join(repo, "tracked.txt"), "committed\n")
	runE2EGit(t, repo, "add", "tracked.txt")
	runE2EGit(t, repo, "-c", "user.name=e2ebench", "-c", "user.email=e2ebench@example.invalid", "commit", "-m", "init")

	writeE2EFile(t, filepath.Join(repo, "tracked.txt"), "local change\n")
	writeE2EFile(t, filepath.Join(repo, "untracked.txt"), "keep me\n")
	writeE2EFile(t, filepath.Join(repo, "voltui.toml"), "default_model = \"local\"\n")

	attempt, cleanup, err := createAttemptWorktree(repo)
	if err != nil {
		t.Fatalf("createAttemptWorktree: %v", err)
	}
	if got := readE2EFile(t, filepath.Join(attempt, "tracked.txt")); got != "committed\n" {
		t.Fatalf("attempt tracked file = %q, want committed HEAD", got)
	}
	if got := readE2EFile(t, filepath.Join(attempt, "voltui.toml")); got != "default_model = \"local\"\n" {
		t.Fatalf("attempt config = %q", got)
	}
	cleanup()

	if got := readE2EFile(t, filepath.Join(repo, "tracked.txt")); got != "local change\n" {
		t.Fatalf("caller tracked file changed to %q", got)
	}
	if got := readE2EFile(t, filepath.Join(repo, "untracked.txt")); got != "keep me\n" {
		t.Fatalf("caller untracked file changed to %q", got)
	}
}

func runE2EGit(t *testing.T, repo string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", repo}, args...)...)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
	}
}

func readE2EFile(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(data)
}

func writeE2EFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
