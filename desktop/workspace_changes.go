package main

import (
	"bytes"
	"context"
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

	"voltui/internal/control"
	codediff "voltui/internal/diff"
	"voltui/internal/proc"
)

type gitStatusEntry struct {
	Path           string
	OldPath        string
	Status         string
	IndexStatus    string
	WorktreeStatus string
}

type WorkspaceDiffView struct {
	Path           string `json:"path"`
	OldPath        string `json:"oldPath,omitempty"`
	Status         string `json:"status,omitempty"`
	IndexStatus    string `json:"indexStatus,omitempty"`
	WorktreeStatus string `json:"worktreeStatus,omitempty"`
	Kind           string `json:"kind"`
	Diff           string `json:"diff"`
	Added          int    `json:"added"`
	Removed        int    `json:"removed"`
	Binary         bool   `json:"binary"`
	Truncated      bool   `json:"truncated"`
	Err            string `json:"err,omitempty"`
}

type workspaceChangeAccumulator struct {
	view       WorkspaceChangeView
	hasSession bool
	hasGit     bool
}

const workspaceGitBranchCacheTTL = 2 * time.Second

type workspaceGitBranchCacheEntry struct {
	branch     string
	expires    time.Time
	refreshing bool
}

var workspaceGitBranchCache = struct {
	sync.Mutex
	entries map[string]workspaceGitBranchCacheEntry
}{entries: map[string]workspaceGitBranchCacheEntry{}}

var workspaceGitBranchForMetaProbe = workspaceGitBranch

func (a *App) workspaceChanges(tabID string) WorkspaceChangesView {
	out := WorkspaceChangesView{Files: []WorkspaceChangeView{}, GitAvailable: true}
	tabID = strings.TrimSpace(tabID)

	workspaceRoot, ctrl, ok := a.workspaceChangesTarget(tabID)
	if !ok {
		out.GitAvailable = false
		out.GitErr = fmt.Sprintf("tab %q not found", tabID)
		return out
	}

	base, err := workspaceBaseFromRoot(workspaceRoot)
	if err != nil {
		out.GitAvailable = false
		out.GitErr = err.Error()
		return out
	}

	out.GitBranch = workspaceGitBranch(base)

	changes := map[string]*workspaceChangeAccumulator{}
	add := func(path string) *workspaceChangeAccumulator {
		path = normalizeWorkspaceRelPath(base, path)
		if path == "" {
			return nil
		}
		if changes[path] == nil {
			changes[path] = &workspaceChangeAccumulator{view: WorkspaceChangeView{Path: path}}
		}
		return changes[path]
	}

	if ctrl != nil {
		for _, meta := range ctrl.Checkpoints() {
			for _, path := range meta.Paths {
				acc := add(path)
				if acc == nil {
					continue
				}
				acc.hasSession = true
				if len(acc.view.Turns) == 0 || acc.view.Turns[len(acc.view.Turns)-1] != meta.Turn {
					acc.view.Turns = append(acc.view.Turns, meta.Turn)
				}
				if meta.Time.UnixMilli() >= acc.view.LatestTime {
					acc.view.LatestPrompt = meta.Prompt
					acc.view.LatestTime = meta.Time.UnixMilli()
				}
			}
		}
	}

	gitEntries, gitErr := workspaceGitStatus(base)
	if gitErr != nil {
		out.GitAvailable = false
		out.GitErr = gitErr.Error()
	}
	for _, entry := range gitEntries {
		acc := add(entry.Path)
		if acc == nil {
			continue
		}
		acc.hasGit = true
		acc.view.GitStatus = entry.Status
		acc.view.IndexStatus = entry.IndexStatus
		acc.view.WorktreeStatus = entry.WorktreeStatus
		acc.view.OldPath = normalizeWorkspaceRelPath(base, entry.OldPath)
	}

	out.Files = make([]WorkspaceChangeView, 0, len(changes))
	for _, acc := range changes {
		if acc.hasSession {
			acc.view.Sources = append(acc.view.Sources, "session")
		}
		if acc.hasGit {
			acc.view.Sources = append(acc.view.Sources, "git")
		}
		out.Files = append(out.Files, acc.view)
	}
	sort.Slice(out.Files, func(i, j int) bool {
		a, b := out.Files[i], out.Files[j]
		if len(a.Sources) != len(b.Sources) {
			return len(a.Sources) > len(b.Sources)
		}
		return strings.ToLower(a.Path) < strings.ToLower(b.Path)
	})
	return out
}

func (a *App) workspaceChangesTarget(tabID string) (string, control.SessionAPI, bool) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	var tab *WorkspaceTab
	if tabID == "" {
		tab = a.activeTabLocked()
	} else {
		tab = a.tabs[tabID]
	}
	if tab == nil {
		return "", nil, tabID == ""
	}
	return tab.WorkspaceRoot, tab.Ctrl, true
}

func (a *App) workspaceBaseForTab(tabID string) (string, error) {
	tabID = strings.TrimSpace(tabID)
	workspaceRoot, _, ok := a.workspaceChangesTarget(tabID)
	if !ok {
		return "", fmt.Errorf("tab %q not found", tabID)
	}
	return workspaceBaseFromRoot(workspaceRoot)
}

// workspaceGit builds a console-hidden git probe: CREATE_NO_WINDOW so git's own
// children inherit the invisible console, fsmonitor/auto-maintenance off so a
// probe never spawns a background daemon that opens a console of its own (#3906).
func workspaceGit(args ...string) *exec.Cmd {
	return workspaceGitCommand(context.Background(), args...)
}

func workspaceGitCommand(ctx context.Context, args ...string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, "git", append([]string{"-c", "core.fsmonitor=false", "-c", "maintenance.auto=false"}, args...)...)
	proc.HideWindow(cmd)
	return cmd
}

func workspaceGitOutputWithTimeout(timeout time.Duration, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	return workspaceGitCommand(ctx, args...).Output()
}

func workspaceGitStatus(base string) ([]gitStatusEntry, error) {
	cmd := workspaceGit("-C", base, "status", "--porcelain=v1", "-z", "--untracked-files=all")
	raw, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	entries := parseGitStatusPorcelainZ(raw)
	topCmd := workspaceGit("-C", base, "rev-parse", "--show-toplevel")
	topRaw, err := topCmd.Output()
	if err != nil {
		return nil, err
	}
	repoRoot := strings.TrimSpace(string(topRaw))
	if repoRoot == "" {
		return entries, nil
	}
	out := make([]gitStatusEntry, 0, len(entries))
	for _, entry := range entries {
		entry.Path = workspaceRelPathFromGitStatus(repoRoot, base, entry.Path)
		if entry.Path == "" {
			continue
		}
		entry.OldPath = workspaceRelPathFromGitStatus(repoRoot, base, entry.OldPath)
		out = append(out, entry)
	}
	return out, nil
}

func (a *App) WorkspaceDiff(rel string) WorkspaceDiffView {
	return a.workspaceDiff("", rel)
}

func (a *App) WorkspaceDiffForTab(tabID, rel string) WorkspaceDiffView {
	tabID = strings.TrimSpace(tabID)
	if tabID == "" {
		return WorkspaceDiffView{Path: normalizeWorkspaceRelPath("", rel), Err: "tab id is required"}
	}
	return a.workspaceDiff(tabID, rel)
}

func (a *App) workspaceDiff(tabID, rel string) WorkspaceDiffView {
	out := WorkspaceDiffView{Path: normalizeWorkspaceRelPath("", rel)}
	var base string
	var err error
	if tabID == "" {
		base, err = a.activeWorkspaceBase()
	} else {
		workspaceRoot, _, ok := a.workspaceChangesTarget(tabID)
		if !ok {
			out.Err = fmt.Sprintf("tab %q not found", tabID)
			return out
		}
		base, err = workspaceBaseFromRoot(workspaceRoot)
	}
	if err != nil {
		out.Err = err.Error()
		return out
	}
	path, ok, err := workspacePathForBase(base, rel)
	if err != nil || !ok {
		out.Err = "invalid path"
		return out
	}
	rel = normalizeWorkspaceRelPath(base, path)
	out.Path = rel
	if rel == "" {
		out.Err = "invalid path"
		return out
	}

	repoRoot, err := workspaceGitRoot(base)
	if err != nil {
		out.Err = err.Error()
		return out
	}
	statusEntries, err := workspaceGitStatus(base)
	if err != nil {
		out.Err = err.Error()
		return out
	}

	var entry gitStatusEntry
	for _, candidate := range statusEntries {
		if candidate.Path == rel {
			entry = candidate
			break
		}
	}
	out.Status = entry.Status
	out.IndexStatus = entry.IndexStatus
	out.WorktreeStatus = entry.WorktreeStatus
	out.OldPath = entry.OldPath

	kind := codediff.Modify
	oldRel := rel
	oldText := ""
	newText := ""
	switch {
	case entry.Status == "??" || strings.Contains(entry.Status, "A"):
		kind = codediff.Create
	case strings.Contains(entry.Status, "D"):
		kind = codediff.Delete
	}
	if entry.OldPath != "" {
		oldRel = entry.OldPath
	}

	if kind != codediff.Create {
		oldText, err = gitWorkspaceText(repoRoot, base, oldRel)
		if err != nil {
			out.Err = err.Error()
			return out
		}
	}
	if kind != codediff.Delete {
		newText, err = workspaceDiffText(base, path)
		if err != nil {
			out.Err = err.Error()
			return out
		}
	}

	change := codediff.Build(rel, oldText, newText, kind)
	out.Kind = string(change.Kind)
	out.Diff = change.Diff
	out.Added = change.Added
	out.Removed = change.Removed
	out.Binary = change.Binary
	out.Truncated = strings.Contains(change.Diff, "diff omitted:")
	return out
}

// workspaceDiffText reads only a stable regular file. Symlinks are represented
// by their link target without following it, so an untracked link cannot expose
// content outside the selected workspace through the Diff -> review pipeline.
func workspaceDiffText(base, path string) (string, error) {
	if err := validateWorkspaceDiffParent(base, path); err != nil {
		return "", err
	}
	before, err := os.Lstat(path)
	if err != nil {
		return "", err
	}
	if before.Mode()&os.ModeSymlink != 0 {
		target, err := os.Readlink(path)
		if err != nil {
			return "", err
		}
		return "symlink -> " + target + "\n", nil
	}
	if !before.Mode().IsRegular() {
		return "", errors.New("workspace diff only supports regular files and symbolic links")
	}
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	if err := validateWorkspaceDiffParent(base, path); err != nil {
		return "", err
	}
	after, err := os.Lstat(path)
	if err != nil {
		return "", err
	}
	opened, err := file.Stat()
	if err != nil {
		return "", err
	}
	if after.Mode()&os.ModeSymlink != 0 || !after.Mode().IsRegular() || !os.SameFile(before, after) || !os.SameFile(after, opened) {
		return "", errors.New("workspace file changed while preparing diff")
	}
	data, err := io.ReadAll(file)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func validateWorkspaceDiffParent(base, path string) error {
	baseAbs, err := filepath.Abs(base)
	if err != nil {
		return err
	}
	pathAbs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	rel, err := filepath.Rel(baseAbs, pathAbs)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return os.ErrInvalid
	}

	realBase, err := filepath.EvalSymlinks(baseAbs)
	if err != nil {
		return err
	}
	parent := filepath.Dir(pathAbs)
	realParent, err := filepath.EvalSymlinks(parent)
	if err != nil {
		return err
	}
	realRel, err := filepath.Rel(realBase, realParent)
	if err != nil || realRel == ".." || strings.HasPrefix(realRel, ".."+string(filepath.Separator)) || filepath.IsAbs(realRel) {
		return errors.New("workspace diff refuses paths through a symbolic-link parent outside the workspace")
	}

	relParent, err := filepath.Rel(baseAbs, parent)
	if err != nil {
		return err
	}
	current := baseAbs
	for _, part := range strings.Split(relParent, string(filepath.Separator)) {
		if part == "" || part == "." {
			continue
		}
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return errors.New("workspace diff refuses symbolic-link parent directories")
		}
		if !info.IsDir() {
			return errors.New("workspace diff parent is not a directory")
		}
	}
	return nil
}

func workspaceGitRoot(base string) (string, error) {
	topCmd := workspaceGit("-C", base, "rev-parse", "--show-toplevel")
	topRaw, err := topCmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(topRaw)), nil
}

func gitWorkspaceText(repoRoot, base, rel string) (string, error) {
	abs, ok, err := workspacePathForBase(base, rel)
	if err != nil || !ok {
		return "", os.ErrInvalid
	}
	repoRel, err := filepath.Rel(repoRoot, abs)
	if err != nil {
		return "", err
	}
	spec := filepath.ToSlash(repoRel)
	if text, err := gitBlobText(repoRoot, "HEAD:"+spec); err == nil {
		return text, nil
	}
	return gitBlobText(repoRoot, ":"+spec)
}

func gitBlobText(repoRoot, spec string) (string, error) {
	cmd := workspaceGit("-C", repoRoot, "show", spec)
	raw, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

func parseGitStatusPorcelainZ(raw []byte) []gitStatusEntry {
	parts := bytes.Split(raw, []byte{0})
	out := make([]gitStatusEntry, 0, len(parts))
	for i := 0; i < len(parts); i++ {
		part := parts[i]
		if len(part) < 4 {
			continue
		}
		status := string(part[:2])
		path := string(part[3:])
		indexStatus := strings.TrimSpace(string(status[0]))
		worktreeStatus := strings.TrimSpace(string(status[1]))
		if status[0] == '?' {
			indexStatus = "?"
		}
		if status[1] == '?' {
			worktreeStatus = "?"
		}
		entry := gitStatusEntry{Path: path, Status: strings.TrimSpace(status), IndexStatus: indexStatus, WorktreeStatus: worktreeStatus}
		if strings.ContainsAny(status, "RC") && i+1 < len(parts) {
			i++
			entry.OldPath = string(parts[i])
		}
		out = append(out, entry)
	}
	return out
}

func normalizeWorkspaceRelPath(base, path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	if filepath.IsAbs(path) {
		if rel, err := filepath.Rel(base, path); err == nil {
			path = rel
		}
	}
	path = filepath.Clean(path)
	if path == "." || path == ".." || strings.HasPrefix(path, ".."+string(filepath.Separator)) {
		return ""
	}
	return filepath.ToSlash(path)
}

func workspaceRelPathFromGitStatus(repoRoot, base, path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	if !filepath.IsAbs(path) {
		path = filepath.Join(repoRoot, filepath.FromSlash(path))
	}
	return normalizeWorkspaceRelPath(base, path)
}

// workspaceGitBranchForMeta is the cached variant used by high-frequency UI
// metadata refreshes. It never waits for git on the caller path: stale branch
// metadata is less harmful than blocking tab activation or hydration. Workflows
// that need an immediate git read, such as WorkspaceChanges, should call
// workspaceGitBranch directly.
func workspaceGitBranchForMeta(base string) string {
	key := filepath.Clean(base)
	now := time.Now()

	workspaceGitBranchCache.Lock()
	if cached, ok := workspaceGitBranchCache.entries[key]; ok {
		branch := cached.branch
		if now.Before(cached.expires) || cached.refreshing {
			workspaceGitBranchCache.Unlock()
			return branch
		}
		cached.refreshing = true
		workspaceGitBranchCache.entries[key] = cached
		workspaceGitBranchCache.Unlock()
		go refreshWorkspaceGitBranchForMeta(key, base)
		return branch
	}

	workspaceGitBranchCache.entries[key] = workspaceGitBranchCacheEntry{
		expires:    now.Add(workspaceGitBranchCacheTTL),
		refreshing: true,
	}
	workspaceGitBranchCache.Unlock()

	go refreshWorkspaceGitBranchForMeta(key, base)
	return ""
}

func refreshWorkspaceGitBranchForMeta(key, base string) {
	branch := ""
	// Store via defer so the refreshing flag is always cleared, even when the
	// probe panics or exits the goroutine early; otherwise the entry would stay
	// marked refreshing forever and never update again.
	defer func() {
		storeNow := time.Now()
		workspaceGitBranchCache.Lock()
		if len(workspaceGitBranchCache.entries) > 256 {
			for k, cached := range workspaceGitBranchCache.entries {
				if storeNow.After(cached.expires) {
					delete(workspaceGitBranchCache.entries, k)
				}
			}
		}
		workspaceGitBranchCache.entries[key] = workspaceGitBranchCacheEntry{branch: branch, expires: storeNow.Add(workspaceGitBranchCacheTTL)}
		workspaceGitBranchCache.Unlock()
	}()

	branch = workspaceGitBranchForMetaProbe(base)
}

// workspaceGitBranch returns the current git branch name for the repo rooted
// at base, or an empty string when base is not inside a git repository or when
// git is unavailable.
func workspaceGitBranch(base string) string {
	raw, err := workspaceGitOutputWithTimeout(2*time.Second, "-C", base, "branch", "--show-current")
	if err != nil {
		return ""
	}
	if branch := strings.TrimSpace(string(raw)); branch != "" {
		return branch
	}

	raw, err = workspaceGitOutputWithTimeout(2*time.Second, "-C", base, "rev-parse", "--short", "HEAD")
	if err != nil {
		return ""
	}
	short := strings.TrimSpace(string(raw))
	if short == "" {
		return ""
	}
	return "@" + short
}

// GitBranches returns all local git branches for the active workspace's repo.
func (a *App) GitBranches() ([]string, error) {
	base, err := a.activeWorkspaceBase()
	if err != nil {
		return nil, err
	}
	cmd := workspaceGit("-C", base, "branch", "--format=%(refname:short)")
	raw, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	branches := strings.FieldsFunc(strings.TrimSpace(string(raw)), func(r rune) bool { return r == '\n' })
	return branches, nil
}

// GitCheckout switches the active workspace's git branch and returns the
// current branch name, or an error when git is unavailable.
func (a *App) GitCheckout(branch string) error {
	base, err := a.activeWorkspaceBase()
	if err != nil {
		return err
	}
	cmd := workspaceGit("-C", base, "checkout", branch)
	out, err := cmd.CombinedOutput()
	if err != nil {
		if len(out) > 0 {
			return fmt.Errorf("git checkout: %s", strings.TrimSpace(string(out)))
		}
		return err
	}
	return nil
}

type GitCommitView struct {
	Hash    string `json:"hash"`
	Author  string `json:"author"`
	Date    string `json:"date"`
	Message string `json:"message"`
}

type GitCommitDetailView struct {
	Diff  *string  `json:"diff,omitempty"`
	Files []string `json:"files,omitempty"`
}

func (a *App) WorkspaceGitHistory(tabID string, path string) ([]GitCommitView, error) {
	base, err := a.workspaceBaseForTab(tabID)
	if err != nil {
		return nil, err
	}

	args := []string{"-C", base, "log", "--pretty=format:%H%x00%an%x00%ad%x00%s", "-z", "-n", "100"}
	if path != "" {
		args = append(args, "--", path)
	}

	cmd := workspaceGit(args...)
	raw, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	parts := bytes.Split(raw, []byte{0})
	var out []GitCommitView
	// 4 parts per commit: hash, author, date, message
	for i := 0; i+3 < len(parts); i += 4 {
		out = append(out, GitCommitView{
			Hash:    string(parts[i]),
			Author:  string(parts[i+1]),
			Date:    string(parts[i+2]),
			Message: string(parts[i+3]),
		})
	}
	return out, nil
}

func (a *App) WorkspaceGitCommitDetail(tabID string, hash string, path string) (GitCommitDetailView, error) {
	base, err := a.workspaceBaseForTab(tabID)
	if err != nil {
		return GitCommitDetailView{}, err
	}

	if path != "" {
		// Single file diff
		cmd := workspaceGit("-C", base, "show", "--relative", "--pretty=format:", "--patch", hash, "--", path)
		raw, err := cmd.Output()
		if err != nil {
			return GitCommitDetailView{}, err
		}
		diffStr := strings.TrimSpace(string(raw))
		return GitCommitDetailView{Diff: &diffStr}, nil
	}

	// Project level: list of files changed
	cmd := workspaceGit("-C", base, "diff-tree", "--relative", "--no-commit-id", "--name-only", "-r", hash)
	raw, err := cmd.Output()
	if err != nil {
		return GitCommitDetailView{}, err
	}

	lines := strings.Split(strings.TrimSpace(string(raw)), "\n")
	var files []string
	for _, line := range lines {
		if line != "" {
			files = append(files, line)
		}
	}
	return GitCommitDetailView{Files: files}, nil
}
