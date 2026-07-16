//go:build windows

package worktree

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestCreateSupportsLongManagedPathOnWindows(t *testing.T) {
	requireGit(t)
	repo := initRepo(t)
	managed := t.TempDir()
	for len(managed) < 250 {
		managed = filepath.Join(managed, "reasonix-managed-worktrees")
	}
	if err := os.MkdirAll(managed, 0o700); err != nil {
		t.Fatal(err)
	}

	result, err := Create(context.Background(), repo, managed)
	if err != nil {
		t.Fatalf("Create() with a long managed path: %v", err)
	}
	if len(result.WorktreeRoot) <= 260 {
		t.Fatalf("worktree path length = %d, want a path beyond MAX_PATH: %q", len(result.WorktreeRoot), result.WorktreeRoot)
	}
	if _, err := os.Stat(filepath.Join(result.WorktreeRoot, "README.md")); err != nil {
		t.Fatalf("long-path worktree missing committed file: %v", err)
	}
}
