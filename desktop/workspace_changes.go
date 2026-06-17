package main

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

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

type workspaceChangeAccumulator struct {
	view       WorkspaceChangeView
	hasSession bool
	hasGit     bool
}

func (a *App) WorkspaceChanges() WorkspaceChangesView {
	out := WorkspaceChangesView{GitAvailable: true}
	base, err := a.activeWorkspaceBase()
	if err != nil {
		out.GitAvailable = false
		out.GitErr = err.Error()
		return out
	}

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

	a.mu.RLock()
	ctrl := a.activeCtrlLocked()
	a.mu.RUnlock()
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

func workspaceGitStatus(base string) ([]gitStatusEntry, error) {
	cmd := workspaceGit("-C", base, "status", "--porcelain=v1", "-z", "--untracked-files=all")
	raw, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	entries := parseGitStatusPorcelainZ(raw)
	repoRoot, err := workspaceGitRoot(base)
	if err != nil {
		return nil, err
	}
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

func workspaceGit(args ...string) *exec.Cmd {
	fullArgs := append([]string{"-c", "core.fsmonitor=false", "-c", "maintenance.auto=false"}, args...)
	cmd := exec.Command("git", fullArgs...)
	proc.HideWindowDetached(cmd)
	return cmd
}

func (a *App) WorkspaceDiff(rel string) WorkspaceDiffView {
	out := WorkspaceDiffView{Path: normalizeWorkspaceRelPath("", rel)}
	base, err := a.activeWorkspaceBase()
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
		data, err := os.ReadFile(path)
		if err != nil {
			out.Err = err.Error()
			return out
		}
		newText = string(data)
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
		entry := gitStatusEntry{
			Path:           path,
			Status:         strings.TrimSpace(status),
			IndexStatus:    strings.TrimSpace(status[:1]),
			WorktreeStatus: strings.TrimSpace(status[1:2]),
		}
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
