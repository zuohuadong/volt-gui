package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestManagedWorktreeSnapshotAndHandoff(t *testing.T) {
	isolateDesktopUserDirs(t)
	repo := t.TempDir()
	runGitTestCommand(t, repo, "init")
	runGitTestCommand(t, repo, "config", "user.email", "test@example.com")
	runGitTestCommand(t, repo, "config", "user.name", "Volt Test")
	if err := os.WriteFile(filepath.Join(repo, "app.txt"), []byte("base\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	runGitTestCommand(t, repo, "add", "app.txt")
	runGitTestCommand(t, repo, "commit", "-m", "base")

	app := &App{}
	source, err := app.CreateManagedWorktree(repo, "source-review")
	if err != nil {
		t.Fatalf("CreateManagedWorktree source: %v", err)
	}
	target, err := app.CreateManagedWorktree(repo, "target-review")
	if err != nil {
		t.Fatalf("CreateManagedWorktree target: %v", err)
	}
	if err := os.WriteFile(filepath.Join(source.Path, "app.txt"), []byte("changed\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source.Path, "note.txt"), []byte("handoff note\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source.Path, "added.txt"), []byte("tracked addition\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	runGitTestCommand(t, source.Path, "add", "added.txt")

	snapshot, err := app.CreateManagedWorktreeSnapshot(source.ID)
	if err != nil {
		t.Fatalf("CreateManagedWorktreeSnapshot: %v", err)
	}
	if snapshot.UntrackedCount != 1 || snapshot.BaseHead == "" {
		t.Fatalf("unexpected snapshot: %+v", snapshot)
	}
	snapshots, err := app.ListManagedWorktreeSnapshots(repo)
	if err != nil || len(snapshots) != 1 || snapshots[0].ID != snapshot.ID {
		t.Fatalf("ListManagedWorktreeSnapshots = %+v, err=%v", snapshots, err)
	}
	tampered := snapshot
	tampered.PatchPath = filepath.Join(t.TempDir(), "changes.patch")
	if err := os.WriteFile(tampered.PatchPath, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := restoreManagedWorktreeSnapshot(tampered, target); err == nil || !strings.Contains(err.Error(), "artifact path") {
		t.Fatalf("tampered snapshot path should be rejected, got %v", err)
	}
	oversizedPath := filepath.Join(snapshot.FilesPath, "note.txt")
	if err := os.Truncate(oversizedPath, managedWorktreeMaxSnapshot); err != nil {
		t.Fatal(err)
	}
	if err := restoreManagedWorktreeSnapshot(snapshot, target); err == nil || !strings.Contains(err.Error(), "exceeds 50 MiB") {
		t.Fatalf("expanded snapshot payload should be rejected, got %v", err)
	}
	if out := runGitTestCommand(t, target.Path, "status", "--porcelain", "--untracked-files=all"); out != "" {
		t.Fatalf("oversized restore mutated target: %q", out)
	}
	if err := os.WriteFile(oversizedPath, []byte("handoff note\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	handoff, err := app.HandoffManagedWorktree(source.ID, target.ID, "review and continue")
	if err != nil {
		t.Fatalf("HandoffManagedWorktree: %v", err)
	}
	if handoff.SnapshotID == "" || handoff.Status != "applied" {
		t.Fatalf("unexpected handoff: %+v", handoff)
	}
	got, err := os.ReadFile(filepath.Join(target.Path, "app.txt"))
	if err != nil || string(got) != "changed\n" {
		t.Fatalf("target tracked content = %q, err=%v", got, err)
	}
	got, err = os.ReadFile(filepath.Join(target.Path, "note.txt"))
	if err != nil || string(got) != "handoff note\n" {
		t.Fatalf("target untracked content = %q, err=%v", got, err)
	}
	got, err = os.ReadFile(filepath.Join(target.Path, "added.txt"))
	if err != nil || string(got) != "tracked addition\n" {
		t.Fatalf("target added content = %q, err=%v", got, err)
	}
	if out := runGitTestCommand(t, target.Path, "diff", "--cached", "--name-only"); out != "" {
		t.Fatalf("restored tracked changes should remain unstaged, got %q", out)
	}
	worktrees, err := app.ListManagedWorktrees(repo)
	if err != nil || len(worktrees) != 2 {
		t.Fatalf("ListManagedWorktrees = %+v, err=%v", worktrees, err)
	}
}

func TestManagedWorktreeStateRejectsSymlinkRoot(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink creation requires additional Windows privileges")
	}
	isolateDesktopUserDirs(t)
	registryPath, err := managedWorktreeRegistryPath()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(registryPath), 0o700); err != nil {
		t.Fatal(err)
	}
	external := t.TempDir()
	base := filepath.Join(filepath.Dir(registryPath), "managed-worktrees")
	if err := os.Symlink(external, base); err != nil {
		t.Fatal(err)
	}
	if _, err := managedWorktreeBaseDir(); err == nil || !strings.Contains(err.Error(), "not a real directory") {
		t.Fatalf("symlinked managed state root should be rejected, got %v", err)
	}
}

func TestManagedWorktreeRollbackFailureIsExplicit(t *testing.T) {
	target := t.TempDir()
	copied := filepath.Join(target, "copied.txt")
	if err := os.WriteFile(copied, []byte("partial"), 0o644); err != nil {
		t.Fatal(err)
	}
	rollbackErr := rollbackManagedWorktreeRestore(target, []string{copied}, true)
	if rollbackErr == nil {
		t.Fatal("rollback outside a Git worktree should report the failed tracked restore")
	}
	if _, err := os.Stat(copied); !os.IsNotExist(err) {
		t.Fatalf("rollback should still remove copied files, stat err=%v", err)
	}
	err := managedWorktreeRestoreFailure(os.ErrInvalid, rollbackErr)
	if !strings.Contains(err.Error(), "partial changes") {
		t.Fatalf("rollback failure should warn about partial changes: %v", err)
	}
}

func TestManagedGitOutputLimitStopsBeforeBufferingLargePatch(t *testing.T) {
	repo := t.TempDir()
	runGitTestCommand(t, repo, "init")
	target := filepath.Join(t.TempDir(), "limited.patch")
	if _, err := writeManagedGitOutputLimited(repo, target, 4, "rev-parse", "--show-toplevel"); err == nil || !strings.Contains(err.Error(), "exceeds 50 MiB") {
		t.Fatalf("limited git output should reject oversized stream, got %v", err)
	}
	if _, err := os.Stat(target); !os.IsNotExist(err) {
		t.Fatalf("oversized streamed output should be removed, stat err=%v", err)
	}
}

func TestManagedWorktreeHandoffArtifactCleanupUsesExactPath(t *testing.T) {
	isolateDesktopUserDirs(t)
	id := "handoff-123"
	path, err := managedWorktreeHandoffArtifactPath(id)
	if err != nil {
		t.Fatal(err)
	}
	if err := writeManagedJSON(path, map[string]string{"id": id}); err != nil {
		t.Fatal(err)
	}
	removeManagedWorktreeHandoffArtifact(ManagedWorktreeHandoffView{ID: id, ArtifactPath: path})
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("expired exact handoff artifact should be removed, stat err=%v", err)
	}
}

func runGitTestCommand(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
	}
	return strings.TrimSpace(string(out))
}
