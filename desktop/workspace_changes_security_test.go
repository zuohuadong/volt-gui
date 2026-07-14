package main

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestWorkspaceDiffForTabDoesNotFollowSymlinkOutsideWorkspace(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink creation requires additional Windows privileges")
	}
	repo, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	runGitTestCommand(t, repo, "init")
	runGitTestCommand(t, repo, "config", "user.email", "test@example.com")
	runGitTestCommand(t, repo, "config", "user.name", "Volt Test")
	if err := os.WriteFile(filepath.Join(repo, "README.md"), []byte("base\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	runGitTestCommand(t, repo, "add", "README.md")
	runGitTestCommand(t, repo, "commit", "-m", "base")

	external := filepath.Join(t.TempDir(), "secret.txt")
	const secret = "outside-workspace-secret"
	if err := os.WriteFile(external, []byte(secret), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(external, filepath.Join(repo, "linked.txt")); err != nil {
		t.Fatal(err)
	}
	entries, err := workspaceGitStatus(repo)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Path != "linked.txt" || entries[0].Status != "??" {
		t.Fatalf("unexpected symlink git status: %+v", entries)
	}

	app := &App{
		tabs:        map[string]*WorkspaceTab{"tab": {ID: "tab", WorkspaceRoot: repo, Ready: true}},
		activeTabID: "tab",
	}
	view := app.WorkspaceDiffForTab("tab", "linked.txt")
	if view.Err != "" {
		t.Fatalf("WorkspaceDiffForTab symlink: %s", view.Err)
	}
	if strings.Contains(view.Diff, secret) {
		t.Fatalf("symlink diff leaked external file content: %q", view.Diff)
	}
	if !strings.Contains(view.Diff, "symlink -> "+external) {
		t.Fatalf("symlink diff should describe the link target without reading it: %q", view.Diff)
	}
}

func TestWorkspaceDiffForTabRejectsEmptyTabID(t *testing.T) {
	app := &App{tabs: map[string]*WorkspaceTab{"active": {ID: "active", WorkspaceRoot: t.TempDir(), Ready: true}}, activeTabID: "active"}
	view := app.WorkspaceDiffForTab("  ", "README.md")
	if view.Err != "tab id is required" {
		t.Fatalf("WorkspaceDiffForTab empty tab = %+v", view)
	}
}

func TestWorkspaceDiffTextRejectsSymlinkParentOutsideWorkspace(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink creation requires additional Windows privileges")
	}
	workspace := t.TempDir()
	external := t.TempDir()
	secretPath := filepath.Join(external, "secret.txt")
	if err := os.WriteFile(secretPath, []byte("parent-symlink-secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	linkedDir := filepath.Join(workspace, "linked-dir")
	if err := os.Symlink(external, linkedDir); err != nil {
		t.Fatal(err)
	}
	if text, err := workspaceDiffText(workspace, filepath.Join(linkedDir, "secret.txt")); err == nil {
		t.Fatalf("workspaceDiffText followed a symlink parent and returned %q", text)
	}
}
