package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"voltui/internal/config"
	"voltui/internal/fileutil"
)

const (
	managedWorktreeRegistryFile = "managed-worktrees.json"
	managedWorktreeMaxSnapshot  = int64(50 << 20)
)

type ManagedWorktreeView struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	RepositoryRoot string `json:"repositoryRoot"`
	Path           string `json:"path"`
	Branch         string `json:"branch,omitempty"`
	Head           string `json:"head,omitempty"`
	Dirty          bool   `json:"dirty"`
	Status         string `json:"status"`
	Warning        string `json:"warning,omitempty"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

type ManagedWorktreeSnapshotView struct {
	ID             string   `json:"id"`
	WorktreeID     string   `json:"worktreeId"`
	RepositoryRoot string   `json:"repositoryRoot"`
	BaseHead       string   `json:"baseHead"`
	PatchPath      string   `json:"patchPath"`
	FilesPath      string   `json:"filesPath"`
	UntrackedFiles []string `json:"untrackedFiles"`
	UntrackedCount int      `json:"untrackedCount"`
	CreatedAt      string   `json:"createdAt"`
}

type ManagedWorktreeHandoffView struct {
	ID               string `json:"id"`
	SourceWorktreeID string `json:"sourceWorktreeId"`
	TargetWorktreeID string `json:"targetWorktreeId"`
	SnapshotID       string `json:"snapshotId"`
	Summary          string `json:"summary"`
	Status           string `json:"status"`
	Warning          string `json:"warning,omitempty"`
	ArtifactPath     string `json:"artifactPath"`
	CreatedAt        string `json:"createdAt"`
}

type managedWorktreeRegistry struct {
	Worktrees []ManagedWorktreeView         `json:"worktrees"`
	Snapshots []ManagedWorktreeSnapshotView `json:"snapshots"`
	Handoffs  []ManagedWorktreeHandoffView  `json:"handoffs"`
}

var managedWorktreeMu sync.Mutex

func (a *App) ListManagedWorktrees(workspaceRoot string) ([]ManagedWorktreeView, error) {
	managedWorktreeMu.Lock()
	defer managedWorktreeMu.Unlock()
	registry, err := loadManagedWorktreeRegistry()
	if err != nil {
		return nil, err
	}
	repositoryRoot := ""
	if strings.TrimSpace(workspaceRoot) != "" {
		repositoryRoot, err = managedGitRoot(workspaceRoot)
		if err != nil {
			return nil, err
		}
	}
	worktrees := make([]ManagedWorktreeView, 0, len(registry.Worktrees))
	changed := false
	for i := range registry.Worktrees {
		worktree := refreshManagedWorktree(registry.Worktrees[i])
		if worktree != registry.Worktrees[i] {
			registry.Worktrees[i] = worktree
			changed = true
		}
		if repositoryRoot == "" || sameManagedPath(worktree.RepositoryRoot, repositoryRoot) {
			worktrees = append(worktrees, worktree)
		}
	}
	if changed {
		if err := saveManagedWorktreeRegistry(registry); err != nil {
			return nil, err
		}
	}
	sort.SliceStable(worktrees, func(i, j int) bool { return worktrees[i].CreatedAt > worktrees[j].CreatedAt })
	return worktrees, nil
}

func (a *App) ListManagedWorktreeSnapshots(workspaceRoot string) ([]ManagedWorktreeSnapshotView, error) {
	managedWorktreeMu.Lock()
	defer managedWorktreeMu.Unlock()
	registry, err := loadManagedWorktreeRegistry()
	if err != nil {
		return nil, err
	}
	repositoryRoot := ""
	if strings.TrimSpace(workspaceRoot) != "" {
		repositoryRoot, err = managedGitRoot(workspaceRoot)
		if err != nil {
			return nil, err
		}
	}
	snapshots := make([]ManagedWorktreeSnapshotView, 0, len(registry.Snapshots))
	for _, snapshot := range registry.Snapshots {
		if repositoryRoot == "" || sameManagedPath(snapshot.RepositoryRoot, repositoryRoot) {
			snapshots = append(snapshots, snapshot)
		}
	}
	sort.SliceStable(snapshots, func(i, j int) bool { return snapshots[i].CreatedAt > snapshots[j].CreatedAt })
	return snapshots, nil
}

func (a *App) CreateManagedWorktree(workspaceRoot, name string) (ManagedWorktreeView, error) {
	managedWorktreeMu.Lock()
	defer managedWorktreeMu.Unlock()
	repositoryRoot, err := managedGitRoot(workspaceRoot)
	if err != nil {
		return ManagedWorktreeView{}, err
	}
	registry, err := loadManagedWorktreeRegistry()
	if err != nil {
		return ManagedWorktreeView{}, err
	}
	name = uniqueManagedWorktreeName(cleanManagedWorktreeName(name), repositoryRoot, registry.Worktrees)
	base, err := managedWorktreeRepositoryDir(repositoryRoot)
	if err != nil {
		return ManagedWorktreeView{}, err
	}
	path := filepath.Join(base, name)
	if err := ensureManagedChild(base, path); err != nil {
		return ManagedWorktreeView{}, err
	}
	if _, err := os.Stat(path); err == nil {
		return ManagedWorktreeView{}, errors.New("managed worktree path already exists")
	} else if !os.IsNotExist(err) {
		return ManagedWorktreeView{}, err
	}
	if err := os.MkdirAll(base, 0o755); err != nil {
		return ManagedWorktreeView{}, err
	}
	if _, err := runManagedGit(repositoryRoot, 30*time.Second, "worktree", "add", "--detach", path, "HEAD"); err != nil {
		return ManagedWorktreeView{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	worktree := refreshManagedWorktree(ManagedWorktreeView{
		ID:             fmt.Sprintf("worktree-%d", time.Now().UnixNano()),
		Name:           name,
		RepositoryRoot: repositoryRoot,
		Path:           path,
		Status:         "ready",
		CreatedAt:      now,
		UpdatedAt:      now,
	})
	registry.Worktrees = append([]ManagedWorktreeView{worktree}, registry.Worktrees...)
	if err := saveManagedWorktreeRegistry(registry); err != nil {
		_, _ = runManagedGit(repositoryRoot, 30*time.Second, "worktree", "remove", "--force", path)
		return ManagedWorktreeView{}, err
	}
	return worktree, nil
}

func (a *App) CreateManagedWorktreeSnapshot(worktreeID string) (ManagedWorktreeSnapshotView, error) {
	managedWorktreeMu.Lock()
	defer managedWorktreeMu.Unlock()
	registry, err := loadManagedWorktreeRegistry()
	if err != nil {
		return ManagedWorktreeSnapshotView{}, err
	}
	worktree, ok := findManagedWorktree(registry.Worktrees, worktreeID)
	if !ok {
		return ManagedWorktreeSnapshotView{}, errors.New("managed worktree not found")
	}
	snapshot, err := createManagedWorktreeSnapshot(worktree)
	if err != nil {
		return ManagedWorktreeSnapshotView{}, err
	}
	registry.Snapshots = append([]ManagedWorktreeSnapshotView{snapshot}, registry.Snapshots...)
	expired := []ManagedWorktreeSnapshotView(nil)
	if len(registry.Snapshots) > 100 {
		expired = append(expired, registry.Snapshots[100:]...)
		registry.Snapshots = registry.Snapshots[:100]
	}
	if err := saveManagedWorktreeRegistry(registry); err != nil {
		_ = os.RemoveAll(filepath.Dir(snapshot.PatchPath))
		return ManagedWorktreeSnapshotView{}, err
	}
	for _, old := range expired {
		if validateManagedWorktreeSnapshot(old) == nil {
			_ = os.RemoveAll(filepath.Dir(old.PatchPath))
		}
	}
	return snapshot, nil
}

func (a *App) RestoreManagedWorktreeSnapshot(snapshotID, targetWorktreeID string) (ManagedWorktreeView, error) {
	managedWorktreeMu.Lock()
	defer managedWorktreeMu.Unlock()
	registry, err := loadManagedWorktreeRegistry()
	if err != nil {
		return ManagedWorktreeView{}, err
	}
	snapshot, ok := findManagedWorktreeSnapshot(registry.Snapshots, snapshotID)
	if !ok {
		return ManagedWorktreeView{}, errors.New("managed worktree snapshot not found")
	}
	target, ok := findManagedWorktree(registry.Worktrees, targetWorktreeID)
	if !ok {
		return ManagedWorktreeView{}, errors.New("target managed worktree not found")
	}
	if !sameManagedPath(snapshot.RepositoryRoot, target.RepositoryRoot) {
		return ManagedWorktreeView{}, errors.New("snapshot and target worktree belong to different repositories")
	}
	if err := restoreManagedWorktreeSnapshot(snapshot, target); err != nil {
		return ManagedWorktreeView{}, err
	}
	target = refreshManagedWorktree(target)
	for i := range registry.Worktrees {
		if registry.Worktrees[i].ID == target.ID {
			registry.Worktrees[i] = target
			break
		}
	}
	if err := saveManagedWorktreeRegistry(registry); err != nil {
		target.Warning = fmt.Sprintf("snapshot was applied but the managed-worktree registry could not be updated: %v", err)
	}
	return target, nil
}

func (a *App) HandoffManagedWorktree(sourceWorktreeID, targetWorktreeID, summary string) (ManagedWorktreeHandoffView, error) {
	if strings.TrimSpace(sourceWorktreeID) == strings.TrimSpace(targetWorktreeID) {
		return ManagedWorktreeHandoffView{}, errors.New("source and target worktrees must differ")
	}
	snapshot, err := a.CreateManagedWorktreeSnapshot(sourceWorktreeID)
	if err != nil {
		return ManagedWorktreeHandoffView{}, err
	}
	restored, err := a.RestoreManagedWorktreeSnapshot(snapshot.ID, targetWorktreeID)
	if err != nil {
		return ManagedWorktreeHandoffView{}, err
	}

	now := time.Now().UTC().Format(time.RFC3339)
	id := fmt.Sprintf("handoff-%d", time.Now().UnixNano())
	artifactPath, err := managedWorktreeHandoffArtifactPath(id)
	if err != nil {
		message := strings.TrimSpace(summary)
		if message == "" {
			message = "Continue the task from the transferred workspace snapshot."
		}
		return ManagedWorktreeHandoffView{
			ID: id, SourceWorktreeID: sourceWorktreeID, TargetWorktreeID: targetWorktreeID,
			SnapshotID: snapshot.ID, Summary: message, Status: "applied-with-warning",
			Warning: appendManagedWarning(restored.Warning, fmt.Sprintf("handoff was applied but its artifact path is unavailable: %v", err)), CreatedAt: now,
		}, nil
	}
	handoff := ManagedWorktreeHandoffView{
		ID:               id,
		SourceWorktreeID: sourceWorktreeID,
		TargetWorktreeID: targetWorktreeID,
		SnapshotID:       snapshot.ID,
		Summary:          strings.TrimSpace(summary),
		Status:           "applied",
		ArtifactPath:     artifactPath,
		CreatedAt:        now,
	}
	if handoff.Summary == "" {
		handoff.Summary = "Continue the task from the transferred workspace snapshot."
	}
	if restored.Warning != "" {
		handoff.Status = "applied-with-warning"
		handoff.Warning = restored.Warning
	}
	if err := writeManagedJSON(artifactPath, handoff); err != nil {
		handoff.Status = "applied-with-warning"
		handoff.Warning = appendManagedWarning(handoff.Warning, fmt.Sprintf("handoff was applied but its artifact could not be written: %v", err))
		return handoff, nil
	}

	managedWorktreeMu.Lock()
	defer managedWorktreeMu.Unlock()
	registry, err := loadManagedWorktreeRegistry()
	if err != nil {
		handoff.Status = "applied-with-warning"
		handoff.Warning = appendManagedWarning(handoff.Warning, fmt.Sprintf("handoff was applied but its registry could not be loaded: %v", err))
		_ = writeManagedJSON(artifactPath, handoff)
		return handoff, nil
	}
	registry.Handoffs = append([]ManagedWorktreeHandoffView{handoff}, registry.Handoffs...)
	expired := []ManagedWorktreeHandoffView(nil)
	if len(registry.Handoffs) > 100 {
		expired = append(expired, registry.Handoffs[100:]...)
		registry.Handoffs = registry.Handoffs[:100]
	}
	if err := saveManagedWorktreeRegistry(registry); err != nil {
		handoff.Status = "applied-with-warning"
		handoff.Warning = appendManagedWarning(handoff.Warning, fmt.Sprintf("handoff was applied but its registry could not be updated: %v", err))
		_ = writeManagedJSON(artifactPath, handoff)
		return handoff, nil
	}
	for _, old := range expired {
		removeManagedWorktreeHandoffArtifact(old)
	}
	return handoff, nil
}

func createManagedWorktreeSnapshot(worktree ManagedWorktreeView) (ManagedWorktreeSnapshotView, error) {
	if err := validateManagedWorktree(worktree); err != nil {
		return ManagedWorktreeSnapshotView{}, err
	}
	baseHead, err := runManagedGit(worktree.Path, 10*time.Second, "rev-parse", "HEAD")
	if err != nil {
		return ManagedWorktreeSnapshotView{}, err
	}
	untrackedRaw, err := runManagedGit(worktree.Path, 10*time.Second, "ls-files", "--others", "--exclude-standard", "-z")
	if err != nil {
		return ManagedWorktreeSnapshotView{}, err
	}
	untracked := splitNULPaths(untrackedRaw)
	id := fmt.Sprintf("snapshot-%d", time.Now().UnixNano())
	dir, err := managedWorktreeSnapshotDir(id)
	if err != nil {
		return ManagedWorktreeSnapshotView{}, err
	}
	patchPath := filepath.Join(dir, "changes.patch")
	filesPath := filepath.Join(dir, "files")
	if err := ensureManagedDirectoryChild(filepath.Dir(dir), dir); err != nil {
		return ManagedWorktreeSnapshotView{}, err
	}
	if err := ensureManagedDirectoryChild(dir, filesPath); err != nil {
		return ManagedWorktreeSnapshotView{}, err
	}
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.RemoveAll(dir)
		}
	}()
	patchBytes, err := writeManagedGitOutputLimited(worktree.Path, patchPath, managedWorktreeMaxSnapshot, "diff", "--binary", "--no-ext-diff", "HEAD", "--", ".")
	if err != nil {
		return ManagedWorktreeSnapshotView{}, err
	}
	total := patchBytes
	for _, rel := range untracked {
		source, target, err := managedSnapshotFilePaths(worktree.Path, filesPath, rel)
		if err != nil {
			return ManagedWorktreeSnapshotView{}, err
		}
		if err := ensureNoManagedSymlinkParents(worktree.Path, source); err != nil {
			return ManagedWorktreeSnapshotView{}, err
		}
		info, err := os.Lstat(source)
		if err != nil {
			return ManagedWorktreeSnapshotView{}, err
		}
		if !info.Mode().IsRegular() {
			return ManagedWorktreeSnapshotView{}, fmt.Errorf("snapshot only supports regular untracked files: %s", rel)
		}
		copied, err := copyManagedFile(source, target, info.Mode().Perm(), managedWorktreeMaxSnapshot-total)
		if err != nil {
			return ManagedWorktreeSnapshotView{}, err
		}
		total += copied
	}
	snapshot := ManagedWorktreeSnapshotView{
		ID:             id,
		WorktreeID:     worktree.ID,
		RepositoryRoot: worktree.RepositoryRoot,
		BaseHead:       strings.TrimSpace(baseHead),
		PatchPath:      patchPath,
		FilesPath:      filesPath,
		UntrackedFiles: untracked,
		UntrackedCount: len(untracked),
		CreatedAt:      time.Now().UTC().Format(time.RFC3339),
	}
	if err := writeManagedJSON(filepath.Join(dir, "snapshot.json"), snapshot); err != nil {
		return ManagedWorktreeSnapshotView{}, err
	}
	cleanup = false
	return snapshot, nil
}

func restoreManagedWorktreeSnapshot(snapshot ManagedWorktreeSnapshotView, target ManagedWorktreeView) error {
	if err := validateManagedWorktreeSnapshot(snapshot); err != nil {
		return err
	}
	if err := validateManagedWorktree(target); err != nil {
		return err
	}
	head, err := runManagedGit(target.Path, 10*time.Second, "rev-parse", "HEAD")
	if err != nil {
		return err
	}
	if strings.TrimSpace(head) != strings.TrimSpace(snapshot.BaseHead) {
		return errors.New("target worktree HEAD differs from snapshot base")
	}
	status, err := runManagedGit(target.Path, 10*time.Second, "status", "--porcelain", "--untracked-files=all")
	if err != nil {
		return err
	}
	if strings.TrimSpace(status) != "" {
		return errors.New("target worktree must be clean before restore or handoff")
	}
	patchInfo, err := os.Stat(snapshot.PatchPath)
	if err != nil {
		return err
	}
	total := patchInfo.Size()
	if total > managedWorktreeMaxSnapshot {
		return errors.New("managed worktree snapshot exceeds 50 MiB")
	}
	seen := make(map[string]struct{}, len(snapshot.UntrackedFiles))
	for _, rel := range snapshot.UntrackedFiles {
		normalized := filepath.ToSlash(filepath.Clean(filepath.FromSlash(strings.TrimSpace(rel))))
		if _, exists := seen[normalized]; exists {
			return fmt.Errorf("snapshot contains a duplicate path: %s", rel)
		}
		seen[normalized] = struct{}{}
		sourcePath, targetPath, err := managedSnapshotFilePaths(snapshot.FilesPath, target.Path, rel)
		if err != nil {
			return err
		}
		if err := ensureNoManagedSymlinkParents(snapshot.FilesPath, sourcePath); err != nil {
			return err
		}
		if err := ensureNoManagedSymlinkParents(target.Path, targetPath); err != nil {
			return err
		}
		info, err := os.Lstat(sourcePath)
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("snapshot only contains regular files: %s", rel)
		}
		total += info.Size()
		if total > managedWorktreeMaxSnapshot {
			return errors.New("managed worktree snapshot exceeds 50 MiB")
		}
		if _, err := os.Lstat(targetPath); err == nil {
			return fmt.Errorf("target already contains snapshot file %s", rel)
		} else if !os.IsNotExist(err) {
			return err
		}
	}
	if patchInfo.Size() > 0 {
		if _, err := runManagedGit(target.Path, 20*time.Second, "apply", "--check", "--index", snapshot.PatchPath); err != nil {
			return err
		}
		if _, err := runManagedGit(target.Path, 20*time.Second, "apply", "--index", "--whitespace=nowarn", snapshot.PatchPath); err != nil {
			return err
		}
	}
	copied := make([]string, 0, len(snapshot.UntrackedFiles))
	copiedPayload := patchInfo.Size()
	for _, rel := range snapshot.UntrackedFiles {
		source, targetPath, err := managedSnapshotFilePaths(snapshot.FilesPath, target.Path, rel)
		if err != nil {
			return managedWorktreeRestoreFailure(err, rollbackManagedWorktreeRestore(target.Path, copied, patchInfo.Size() > 0))
		}
		info, err := os.Stat(source)
		if err != nil {
			return managedWorktreeRestoreFailure(err, rollbackManagedWorktreeRestore(target.Path, copied, patchInfo.Size() > 0))
		}
		copiedBytes, err := copyManagedFile(source, targetPath, info.Mode().Perm(), managedWorktreeMaxSnapshot-copiedPayload)
		if err != nil {
			return managedWorktreeRestoreFailure(err, rollbackManagedWorktreeRestore(target.Path, copied, patchInfo.Size() > 0))
		}
		copiedPayload += copiedBytes
		copied = append(copied, targetPath)
	}
	if patchInfo.Size() > 0 {
		if _, err := runManagedGit(target.Path, 20*time.Second, "restore", "--staged", "--", "."); err != nil {
			return managedWorktreeRestoreFailure(err, rollbackManagedWorktreeRestore(target.Path, copied, true))
		}
	}
	return nil
}

func managedWorktreeRestoreFailure(cause, rollbackErr error) error {
	if rollbackErr == nil {
		return cause
	}
	return fmt.Errorf("%w; rollback also failed and the target may contain partial changes: %v", cause, rollbackErr)
}

func rollbackManagedWorktreeRestore(targetPath string, copied []string, patchApplied bool) error {
	rollbackErrors := make([]error, 0, len(copied)+1)
	for _, path := range copied {
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			rollbackErrors = append(rollbackErrors, fmt.Errorf("remove %s: %w", path, err))
		}
	}
	if patchApplied {
		if _, err := runManagedGit(targetPath, 20*time.Second, "restore", "--source=HEAD", "--staged", "--worktree", "--", "."); err != nil {
			rollbackErrors = append(rollbackErrors, err)
		}
	}
	return errors.Join(rollbackErrors...)
}

func validateManagedWorktree(worktree ManagedWorktreeView) error {
	base, err := managedWorktreeRepositoryDir(worktree.RepositoryRoot)
	if err != nil {
		return err
	}
	if err := ensureManagedChild(base, worktree.Path); err != nil {
		return err
	}
	info, err := os.Lstat(worktree.Path)
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return errors.New("managed worktree path is not a directory")
	}
	return ensureManagedExistingChild(base, worktree.Path)
}

func validateManagedWorktreeSnapshot(snapshot ManagedWorktreeSnapshotView) error {
	if !validManagedArtifactID(snapshot.ID, "snapshot-") {
		return errors.New("managed worktree snapshot id is invalid")
	}
	dir, err := managedWorktreeSnapshotDir(snapshot.ID)
	if err != nil {
		return err
	}
	expectedPatch := filepath.Join(dir, "changes.patch")
	expectedFiles := filepath.Join(dir, "files")
	if !sameManagedPath(snapshot.PatchPath, expectedPatch) || !sameManagedPath(snapshot.FilesPath, expectedFiles) {
		return errors.New("managed worktree snapshot artifact path is invalid")
	}
	dirInfo, err := os.Lstat(dir)
	if err != nil {
		return err
	}
	if dirInfo.Mode()&os.ModeSymlink != 0 || !dirInfo.IsDir() {
		return errors.New("managed worktree snapshot directory is not a real directory")
	}
	patchInfo, err := os.Lstat(snapshot.PatchPath)
	if err != nil {
		return err
	}
	if !patchInfo.Mode().IsRegular() {
		return errors.New("managed worktree snapshot patch is not a regular file")
	}
	filesInfo, err := os.Lstat(snapshot.FilesPath)
	if err != nil {
		return err
	}
	if filesInfo.Mode()&os.ModeSymlink != 0 || !filesInfo.IsDir() {
		return errors.New("managed worktree snapshot files path is not a directory")
	}
	base, err := managedWorktreeBaseDir()
	if err != nil {
		return err
	}
	return ensureManagedExistingChild(filepath.Join(base, "snapshots"), dir)
}

func refreshManagedWorktree(worktree ManagedWorktreeView) ManagedWorktreeView {
	now := time.Now().UTC().Format(time.RFC3339)
	worktree.UpdatedAt = now
	if info, err := os.Stat(worktree.Path); err != nil || !info.IsDir() {
		worktree.Status = "missing"
		worktree.Dirty = false
		return worktree
	}
	worktree.Status = "ready"
	if branch, err := runManagedGit(worktree.Path, 5*time.Second, "branch", "--show-current"); err == nil {
		worktree.Branch = strings.TrimSpace(branch)
	}
	if head, err := runManagedGit(worktree.Path, 5*time.Second, "rev-parse", "HEAD"); err == nil {
		worktree.Head = strings.TrimSpace(head)
	}
	if status, err := runManagedGit(worktree.Path, 5*time.Second, "status", "--porcelain", "--untracked-files=all"); err == nil {
		worktree.Dirty = strings.TrimSpace(status) != ""
	}
	return worktree
}

func managedGitRoot(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", errors.New("workspace root is required")
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	root, err := runManagedGit(abs, 10*time.Second, "rev-parse", "--show-toplevel")
	if err != nil {
		return "", errors.New("workspace is not a Git repository")
	}
	root = filepath.Clean(strings.TrimSpace(root))
	if commonDir, commonErr := runManagedGit(abs, 10*time.Second, "rev-parse", "--path-format=absolute", "--git-common-dir"); commonErr == nil {
		commonDir = filepath.Clean(strings.TrimSpace(commonDir))
		if filepath.Base(commonDir) == ".git" {
			root = filepath.Dir(commonDir)
		}
	}
	return root, nil
}

func runManagedGit(dir string, timeout time.Duration, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmdArgs := append([]string{"-c", "core.fsmonitor=false", "-c", "maintenance.auto=false", "-C", dir}, args...)
	cmd := exec.CommandContext(ctx, "git", cmdArgs...)
	out, err := cmd.CombinedOutput()
	if ctx.Err() != nil {
		return "", fmt.Errorf("git %s timed out", strings.Join(args, " "))
	}
	if err != nil {
		message := strings.TrimSpace(string(out))
		if message == "" {
			message = err.Error()
		}
		return "", fmt.Errorf("git %s: %s", strings.Join(args, " "), message)
	}
	return string(out), nil
}

func writeManagedGitOutputLimited(dir, target string, maxBytes int64, args ...string) (int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cmdArgs := append([]string{"-c", "core.fsmonitor=false", "-c", "maintenance.auto=false", "-C", dir}, args...)
	cmd := exec.CommandContext(ctx, "git", cmdArgs...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return 0, err
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return 0, err
	}
	cleanup := true
	defer func() {
		_ = out.Close()
		if cleanup {
			_ = os.Remove(target)
		}
	}()
	if err := cmd.Start(); err != nil {
		return 0, err
	}
	written, copyErr := io.Copy(out, io.LimitReader(stdout, maxBytes+1))
	if written > maxBytes {
		cancel()
	}
	waitErr := cmd.Wait()
	closeErr := out.Close()
	if written > maxBytes {
		return 0, errors.New("managed worktree snapshot exceeds 50 MiB")
	}
	if ctx.Err() != nil {
		return 0, fmt.Errorf("git %s timed out", strings.Join(args, " "))
	}
	if copyErr != nil {
		return 0, copyErr
	}
	if waitErr != nil {
		message := strings.TrimSpace(stderr.String())
		if message == "" {
			message = waitErr.Error()
		}
		return 0, fmt.Errorf("git %s: %s", strings.Join(args, " "), message)
	}
	if closeErr != nil {
		return 0, closeErr
	}
	cleanup = false
	return written, nil
}

func managedWorktreeRegistryPath() (string, error) {
	userConfig := strings.TrimSpace(config.UserConfigPath())
	if userConfig == "" {
		return "", errors.New("user config dir is unavailable")
	}
	return filepath.Join(filepath.Dir(userConfig), managedWorktreeRegistryFile), nil
}

func managedWorktreeBaseDir() (string, error) {
	registryPath, err := managedWorktreeRegistryPath()
	if err != nil {
		return "", err
	}
	base := filepath.Join(filepath.Dir(registryPath), "managed-worktrees")
	if err := ensureManagedDirectory(base); err != nil {
		return "", err
	}
	return base, nil
}

func managedWorktreeRepositoryDir(repositoryRoot string) (string, error) {
	base, err := managedWorktreeBaseDir()
	if err != nil {
		return "", err
	}
	hash := sha256.Sum256([]byte(filepath.Clean(repositoryRoot)))
	dir := filepath.Join(base, fmt.Sprintf("%x", hash[:6]))
	if err := ensureManagedDirectoryChild(base, dir); err != nil {
		return "", err
	}
	return dir, nil
}

func managedWorktreeSnapshotDir(id string) (string, error) {
	if !validManagedArtifactID(id, "snapshot-") {
		return "", errors.New("managed worktree snapshot id is invalid")
	}
	base, err := managedWorktreeBaseDir()
	if err != nil {
		return "", err
	}
	snapshotsRoot := filepath.Join(base, "snapshots")
	if err := ensureManagedDirectoryChild(base, snapshotsRoot); err != nil {
		return "", err
	}
	return filepath.Join(snapshotsRoot, id), nil
}

func managedWorktreeHandoffArtifactPath(id string) (string, error) {
	if !validManagedArtifactID(id, "handoff-") {
		return "", errors.New("managed worktree handoff id is invalid")
	}
	base, err := managedWorktreeBaseDir()
	if err != nil {
		return "", err
	}
	handoffsRoot := filepath.Join(base, "handoffs")
	if err := ensureManagedDirectoryChild(base, handoffsRoot); err != nil {
		return "", err
	}
	return filepath.Join(handoffsRoot, id+".json"), nil
}

func removeManagedWorktreeHandoffArtifact(handoff ManagedWorktreeHandoffView) {
	expected, err := managedWorktreeHandoffArtifactPath(handoff.ID)
	if err != nil || !sameManagedPath(strings.TrimSpace(handoff.ArtifactPath), expected) {
		return
	}
	info, err := os.Lstat(expected)
	if err != nil || !info.Mode().IsRegular() {
		return
	}
	_ = os.Remove(expected)
}

func loadManagedWorktreeRegistry() (managedWorktreeRegistry, error) {
	path, err := managedWorktreeRegistryPath()
	if err != nil {
		return managedWorktreeRegistry{}, err
	}
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return managedWorktreeRegistry{}, nil
		}
		return managedWorktreeRegistry{}, err
	}
	var registry managedWorktreeRegistry
	if err := json.Unmarshal(b, &registry); err != nil {
		return managedWorktreeRegistry{}, err
	}
	return registry, nil
}

func saveManagedWorktreeRegistry(registry managedWorktreeRegistry) error {
	path, err := managedWorktreeRegistryPath()
	if err != nil {
		return err
	}
	return writeManagedJSON(path, registry)
}

func writeManagedJSON(path string, value any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	b, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".managed-worktree.*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return err
	}
	if _, err := tmp.Write(b); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}
	return fileutil.ReplaceFile(tmpPath, path)
}

func findManagedWorktree(worktrees []ManagedWorktreeView, id string) (ManagedWorktreeView, bool) {
	id = strings.TrimSpace(id)
	for _, worktree := range worktrees {
		if worktree.ID == id {
			return worktree, true
		}
	}
	return ManagedWorktreeView{}, false
}

func findManagedWorktreeSnapshot(snapshots []ManagedWorktreeSnapshotView, id string) (ManagedWorktreeSnapshotView, bool) {
	id = strings.TrimSpace(id)
	for _, snapshot := range snapshots {
		if snapshot.ID == id {
			return snapshot, true
		}
	}
	return ManagedWorktreeSnapshotView{}, false
}

func cleanManagedWorktreeName(name string) string {
	name = strings.TrimSpace(strings.ToLower(name))
	if name == "" {
		return "task"
	}
	var out strings.Builder
	lastDash := false
	for _, r := range name {
		valid := r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '.' || r == '_' || r == '-'
		if valid {
			out.WriteRune(r)
			lastDash = r == '-'
			continue
		}
		if !lastDash {
			out.WriteByte('-')
			lastDash = true
		}
	}
	clean := strings.Trim(out.String(), ".-_ ")
	if clean == "" {
		return "task"
	}
	if len(clean) > 48 {
		clean = strings.Trim(clean[:48], ".-_ ")
	}
	return clean
}

func uniqueManagedWorktreeName(name, repositoryRoot string, worktrees []ManagedWorktreeView) string {
	used := map[string]bool{}
	for _, worktree := range worktrees {
		if sameManagedPath(worktree.RepositoryRoot, repositoryRoot) {
			used[worktree.Name] = true
		}
	}
	if !used[name] {
		return name
	}
	for index := 2; ; index++ {
		candidate := fmt.Sprintf("%s-%d", name, index)
		if !used[candidate] {
			return candidate
		}
	}
}

func ensureManagedChild(base, child string) error {
	rel, err := filepath.Rel(filepath.Clean(base), filepath.Clean(child))
	if err != nil {
		return err
	}
	if rel == "." || rel == ".." || filepath.IsAbs(rel) || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return errors.New("managed worktree path escapes its state directory")
	}
	return nil
}

func ensureManagedExistingChild(base, child string) error {
	if err := ensureManagedChild(base, child); err != nil {
		return err
	}
	realBase, err := filepath.EvalSymlinks(base)
	if err != nil {
		return err
	}
	realChild, err := filepath.EvalSymlinks(child)
	if err != nil {
		return err
	}
	return ensureManagedChild(realBase, realChild)
}

func ensureManagedDirectory(path string) error {
	if err := os.MkdirAll(path, 0o700); err != nil {
		return err
	}
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return fmt.Errorf("managed state path is not a real directory: %s", path)
	}
	return nil
}

func ensureManagedDirectoryChild(base, child string) error {
	if err := ensureManagedChild(base, child); err != nil {
		return err
	}
	if err := ensureManagedDirectory(child); err != nil {
		return err
	}
	return ensureManagedExistingChild(base, child)
}

func ensureNoManagedSymlinkParents(root, path string) error {
	if err := ensureManagedChild(root, path); err != nil {
		return err
	}
	rel, err := filepath.Rel(filepath.Clean(root), filepath.Clean(path))
	if err != nil {
		return err
	}
	parts := strings.Split(rel, string(filepath.Separator))
	current := filepath.Clean(root)
	for _, part := range parts[:len(parts)-1] {
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if os.IsNotExist(err) {
			return nil
		}
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("managed path contains a symbolic-link parent: %s", current)
		}
		if !info.IsDir() {
			return fmt.Errorf("managed path parent is not a directory: %s", current)
		}
	}
	return nil
}

func managedSnapshotFilePaths(sourceRoot, targetRoot, rel string) (string, string, error) {
	rel = filepath.Clean(filepath.FromSlash(strings.TrimSpace(rel)))
	if rel == "." || filepath.IsAbs(rel) || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", "", errors.New("snapshot contains an unsafe relative path")
	}
	source := filepath.Join(sourceRoot, rel)
	target := filepath.Join(targetRoot, rel)
	if err := ensureManagedChild(sourceRoot, source); err != nil {
		return "", "", err
	}
	if err := ensureManagedChild(targetRoot, target); err != nil {
		return "", "", err
	}
	return source, target, nil
}

func copyManagedFile(source, target string, mode os.FileMode, maxBytes int64) (int64, error) {
	if maxBytes < 0 {
		return 0, errors.New("managed worktree snapshot exceeds 50 MiB")
	}
	info, err := os.Lstat(source)
	if err != nil {
		return 0, err
	}
	if !info.Mode().IsRegular() {
		return 0, errors.New("managed snapshot source is not a regular file")
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
		return 0, err
	}
	in, err := os.Open(source)
	if err != nil {
		return 0, err
	}
	defer in.Close()
	out, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode)
	if err != nil {
		return 0, err
	}
	written, copyErr := io.Copy(out, io.LimitReader(in, maxBytes+1))
	closeErr := out.Close()
	if copyErr != nil {
		_ = os.Remove(target)
		return 0, copyErr
	}
	if closeErr != nil {
		_ = os.Remove(target)
		return 0, closeErr
	}
	if written > maxBytes {
		_ = os.Remove(target)
		return 0, errors.New("managed worktree snapshot exceeds 50 MiB")
	}
	return written, nil
}

func splitNULPaths(value string) []string {
	parts := strings.Split(value, "\x00")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if strings.TrimSpace(part) != "" {
			out = append(out, filepath.ToSlash(part))
		}
	}
	return out
}

func sameManagedPath(left, right string) bool {
	return filepath.Clean(left) == filepath.Clean(right)
}

func appendManagedWarning(existing, next string) string {
	existing = strings.TrimSpace(existing)
	next = strings.TrimSpace(next)
	if existing == "" {
		return next
	}
	if next == "" {
		return existing
	}
	return existing + "; " + next
}

func validManagedArtifactID(id, prefix string) bool {
	value := strings.TrimPrefix(strings.TrimSpace(id), prefix)
	if value == "" || value == id {
		return false
	}
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
