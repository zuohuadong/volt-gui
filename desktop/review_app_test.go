package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func reviewTestGit(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSuffix(string(out), "\n")
}

func reviewTestRepo(t *testing.T) (string, *App) {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not installed")
	}
	dir := t.TempDir()
	reviewTestGit(t, dir, "init")
	reviewTestGit(t, dir, "config", "user.email", "review@example.com")
	reviewTestGit(t, dir, "config", "user.name", "Review Test")
	if err := os.WriteFile(filepath.Join(dir, "tracked.txt"), []byte("base\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	reviewTestGit(t, dir, "add", "tracked.txt")
	reviewTestGit(t, dir, "commit", "-m", "base")
	workspaceRoot, err := filepath.EvalSymlinks(dir)
	if err != nil {
		t.Fatal(err)
	}
	app := &App{
		tabs: map[string]*WorkspaceTab{
			"review": {ID: "review", Scope: "project", WorkspaceRoot: workspaceRoot, Ready: true},
		},
		activeTabID: "review",
	}
	return workspaceRoot, app
}

func TestApplyReviewPatchStageUnstageAndRevert(t *testing.T) {
	dir, app := reviewTestRepo(t)
	if err := os.WriteFile(filepath.Join(dir, "tracked.txt"), []byte("changed\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	diff := app.WorkspaceDiffForTab("review", "tracked.txt")
	if diff.UnstagedRevision == "" {
		t.Fatalf("unstaged revision missing: %+v", diff)
	}
	stage, err := app.ApplyReviewPatchForTab(ReviewPatchRequest{
		TabID: "review", Path: "tracked.txt", Action: "stage", Source: reviewSourceUnstaged,
		Ticket: 1, SourceGeneration: 1, SourceRevision: diff.UnstagedRevision,
	})
	if err != nil || stage.Status != reviewPatchSuccess {
		t.Fatalf("stage = %+v, err=%v", stage, err)
	}
	if status := reviewTestGit(t, dir, "status", "--porcelain=v1"); !strings.HasPrefix(status, "M ") {
		t.Fatalf("status after stage = %q", status)
	}

	diff = app.WorkspaceDiffForTab("review", "tracked.txt")
	unstage, err := app.ApplyReviewPatchForTab(ReviewPatchRequest{
		TabID: "review", Path: "tracked.txt", Action: "unstage", Source: reviewSourceStaged,
		Ticket: 2, SourceGeneration: 2, SourceRevision: diff.StagedRevision,
	})
	if err != nil || unstage.Status != reviewPatchSuccess {
		t.Fatalf("unstage = %+v, err=%v", unstage, err)
	}
	if status := reviewTestGit(t, dir, "status", "--porcelain=v1"); !strings.HasPrefix(status, " M") {
		t.Fatalf("status after unstage = %q", status)
	}

	diff = app.WorkspaceDiffForTab("review", "tracked.txt")
	reverted, err := app.ApplyReviewPatchForTab(ReviewPatchRequest{
		TabID: "review", Path: "tracked.txt", Action: "revert", Source: reviewSourceUnstaged,
		Ticket: 3, SourceGeneration: 3, SourceRevision: diff.UnstagedRevision,
	})
	if err != nil || reverted.Status != reviewPatchSuccess {
		t.Fatalf("revert = %+v, err=%v", reverted, err)
	}
	if status := reviewTestGit(t, dir, "status", "--porcelain=v1"); status != "" {
		t.Fatalf("status after revert = %q", status)
	}
}

func TestApplyReviewPatchRejectsStaleRevision(t *testing.T) {
	dir, app := reviewTestRepo(t)
	path := filepath.Join(dir, "tracked.txt")
	if err := os.WriteFile(path, []byte("first\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	stale := app.WorkspaceDiffForTab("review", "tracked.txt")
	if err := os.WriteFile(path, []byte("second\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	result, err := app.ApplyReviewPatchForTab(ReviewPatchRequest{
		TabID: "review", Path: "tracked.txt", Action: "stage", Source: reviewSourceUnstaged,
		Ticket: 4, SourceGeneration: 4, SourceRevision: stale.UnstagedRevision,
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != reviewPatchConflict {
		t.Fatalf("stale revision result = %+v", result)
	}
	if status := reviewTestGit(t, dir, "status", "--porcelain=v1"); !strings.HasPrefix(status, " M") {
		t.Fatalf("stale stage mutated index: %q", status)
	}
}

func TestApplyReviewPatchStagedRevertReportsPartialSuccess(t *testing.T) {
	dir, app := reviewTestRepo(t)
	path := filepath.Join(dir, "tracked.txt")
	if err := os.WriteFile(path, []byte("staged\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	reviewTestGit(t, dir, "add", "tracked.txt")
	if err := os.WriteFile(path, []byte("conflicting worktree\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	diff := app.WorkspaceDiffForTab("review", "tracked.txt")
	result, err := app.ApplyReviewPatchForTab(ReviewPatchRequest{
		TabID: "review", Path: "tracked.txt", Action: "revert", Source: reviewSourceStaged,
		Ticket: 5, SourceGeneration: 5, SourceRevision: diff.StagedRevision,
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != reviewPatchPartialSuccess {
		t.Fatalf("staged revert = %+v, want partial-success", result)
	}
	if status := reviewTestGit(t, dir, "status", "--porcelain=v1"); !strings.HasPrefix(status, " M") {
		t.Fatalf("first staged-revert phase did not unstage: %q", status)
	}
}

func TestReviewWorkflowCommitUsesSharedGenerationGate(t *testing.T) {
	dir, app := reviewTestRepo(t)
	path := filepath.Join(dir, "tracked.txt")
	if err := os.WriteFile(path, []byte("ready to commit\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	reviewTestGit(t, dir, "add", "tracked.txt")
	changes := app.workspaceChanges("review")
	result, err := app.RunReviewWorkflowForTab(ReviewWorkflowRequest{
		TabID: "review", Action: "commit", Ticket: 6, SourceGeneration: 6,
		ExpectedGeneration: changes.Generation, Message: "review workflow commit",
	})
	if err != nil || result.Status != reviewPatchSuccess {
		t.Fatalf("commit result = %+v, err=%v", result, err)
	}
	if message := reviewTestGit(t, dir, "log", "-1", "--pretty=%s"); message != "review workflow commit" {
		t.Fatalf("commit message = %q", message)
	}

	stale, err := app.RunReviewWorkflowForTab(ReviewWorkflowRequest{
		TabID: "review", Action: "push", Ticket: 7, SourceGeneration: 7,
		ExpectedGeneration: changes.Generation,
	})
	if err != nil {
		t.Fatal(err)
	}
	if stale.Status != reviewPatchConflict {
		t.Fatalf("stale workflow result = %+v", stale)
	}
}

func TestReviewWorkflowGenerationTracksContentWithoutStatusChange(t *testing.T) {
	dir, app := reviewTestRepo(t)
	path := filepath.Join(dir, "tracked.txt")
	if err := os.WriteFile(path, []byte("first unstaged value\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	first := app.workspaceChanges("review")
	if err := os.WriteFile(path, []byte("second unstaged value\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	second := app.workspaceChanges("review")
	if first.Generation == second.Generation {
		t.Fatalf("generation did not change with patch content: %q", first.Generation)
	}

	stale, err := app.RunReviewWorkflowForTab(ReviewWorkflowRequest{
		TabID: "review", Action: "push", Ticket: 8, SourceGeneration: 8,
		ExpectedGeneration: first.Generation,
	})
	if err != nil {
		t.Fatal(err)
	}
	if stale.Status != reviewPatchConflict {
		t.Fatalf("content-stale workflow result = %+v", stale)
	}
}
