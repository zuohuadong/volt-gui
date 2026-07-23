package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"voltui/internal/proc"
)

const (
	reviewSourceStaged   = "staged"
	reviewSourceUnstaged = "unstaged"

	reviewPatchSuccess        = "success"
	reviewPatchPartialSuccess = "partial-success"
	reviewPatchConflict       = "conflict"
)

type ReviewPatchRequest struct {
	TabID            string `json:"tabId"`
	Path             string `json:"path"`
	Action           string `json:"action"`
	Source           string `json:"source"`
	Ticket           uint64 `json:"ticket"`
	SourceGeneration uint64 `json:"sourceGeneration"`
	SourceRevision   string `json:"sourceRevision"`
}

type ReviewPatchResult struct {
	Path             string               `json:"path"`
	Action           string               `json:"action"`
	Source           string               `json:"source"`
	Ticket           uint64               `json:"ticket"`
	SourceGeneration uint64               `json:"sourceGeneration"`
	SourceRevision   string               `json:"sourceRevision"`
	Status           string               `json:"status"`
	Detail           string               `json:"detail,omitempty"`
	Applied          []string             `json:"applied"`
	Skipped          []string             `json:"skipped"`
	Conflicted       []string             `json:"conflicted"`
	Changes          WorkspaceChangesView `json:"changes"`
	Diff             WorkspaceDiffView    `json:"diff"`
}

type ReviewWorkflowRequest struct {
	TabID              string `json:"tabId"`
	Action             string `json:"action"`
	Ticket             uint64 `json:"ticket"`
	SourceGeneration   uint64 `json:"sourceGeneration"`
	ExpectedGeneration string `json:"expectedGeneration"`
	Message            string `json:"message,omitempty"`
}

type ReviewWorkflowResult struct {
	Action             string               `json:"action"`
	Ticket             uint64               `json:"ticket"`
	SourceGeneration   uint64               `json:"sourceGeneration"`
	ExpectedGeneration string               `json:"expectedGeneration"`
	Status             string               `json:"status"`
	Detail             string               `json:"detail,omitempty"`
	URL                string               `json:"url,omitempty"`
	Changes            WorkspaceChangesView `json:"changes"`
}

var reviewMutationMu sync.Mutex

func reviewSourceRevision(source string, patch []byte) string {
	hash := sha256.New()
	_, _ = hash.Write([]byte(strings.TrimSpace(source)))
	_, _ = hash.Write([]byte{0})
	_, _ = hash.Write(patch)
	return fmt.Sprintf("sha256-%x", hash.Sum(nil)[:12])
}

func reviewWorkspaceGeneration(base, branch string, entries []gitStatusEntry) string {
	ordered := append([]gitStatusEntry(nil), entries...)
	sort.Slice(ordered, func(i, j int) bool {
		if ordered[i].Path == ordered[j].Path {
			return ordered[i].Status < ordered[j].Status
		}
		return ordered[i].Path < ordered[j].Path
	})
	var body strings.Builder
	body.WriteString(strings.TrimSpace(branch))
	body.WriteByte(0)
	for _, entry := range ordered {
		body.WriteString(entry.Path)
		body.WriteByte(0)
		body.WriteString(entry.OldPath)
		body.WriteByte(0)
		body.WriteString(entry.Status)
		body.WriteByte(0)
	}

	// Git status alone is not a snapshot: editing an already-modified file keeps
	// the same "M" status. Fold both patch sources into the generation so the
	// shared Commit/Push/Create PR gate rejects content-level drift as well.
	if repoRoot, err := workspaceGitRoot(base); err == nil {
		scope := "."
		if rel, relErr := filepath.Rel(repoRoot, base); relErr == nil {
			scope = filepath.ToSlash(rel)
		}
		for _, source := range []string{reviewSourceStaged, reviewSourceUnstaged} {
			args := []string{"-C", repoRoot, "diff", "--binary", "--no-ext-diff"}
			if source == reviewSourceStaged {
				args = append(args, "--cached")
			}
			args = append(args, "--")
			if scope != "." && scope != "" {
				args = append(args, scope)
			}
			body.WriteString(source)
			body.WriteByte(0)
			if patch, patchErr := workspaceGit(args...).Output(); patchErr == nil {
				body.Write(patch)
			} else {
				body.WriteString(patchErr.Error())
			}
			body.WriteByte(0)
		}
	}

	// Untracked files do not appear in git diff. Hash their bounded, path-safe
	// workspace representation so content edits also invalidate the workflow.
	for _, entry := range ordered {
		if entry.Status != "??" {
			continue
		}
		path, ok, err := workspacePathForBase(base, entry.Path)
		if err != nil || !ok {
			continue
		}
		body.WriteString(entry.Path)
		body.WriteByte(0)
		if content, contentErr := workspaceDiffText(base, path); contentErr == nil {
			body.WriteString(content)
		} else {
			body.WriteString(contentErr.Error())
		}
		body.WriteByte(0)
	}
	sum := sha256.Sum256([]byte(body.String()))
	return fmt.Sprintf("sha256-%x", sum[:12])
}

func reviewSourcePatch(repoRoot, repoRel, source string) ([]byte, error) {
	args := []string{"-C", repoRoot, "diff", "--binary", "--no-ext-diff"}
	if source == reviewSourceStaged {
		args = append(args, "--cached")
	} else if source != reviewSourceUnstaged {
		return nil, fmt.Errorf("unsupported review source %q", source)
	}
	args = append(args, "--", filepath.ToSlash(repoRel))
	return workspaceGit(args...).Output()
}

func reviewRevisionForSource(diff WorkspaceDiffView, source string) string {
	if source == reviewSourceStaged {
		return diff.StagedRevision
	}
	return diff.UnstagedRevision
}

func validateReviewAction(action, source string) error {
	switch action {
	case "stage":
		if source != reviewSourceUnstaged {
			return errors.New("Stage only accepts unstaged changes")
		}
	case "unstage":
		if source != reviewSourceStaged {
			return errors.New("Unstage only accepts staged changes")
		}
	case "revert":
		if source != reviewSourceStaged && source != reviewSourceUnstaged {
			return errors.New("Revert requires a staged or unstaged source")
		}
	default:
		return fmt.Errorf("unsupported review action %q", action)
	}
	return nil
}

func (a *App) reviewTarget(tabID, rel string) (base, repoRoot, repoRel string, err error) {
	tab := a.tabByID(strings.TrimSpace(tabID))
	if tab == nil {
		return "", "", "", fmt.Errorf("tab %q not found", strings.TrimSpace(tabID))
	}
	if a.tabIsReadOnly(tab) {
		return "", "", "", readOnlyChannelErr()
	}
	base, err = a.workspaceBaseForTab(tab.ID)
	if err != nil {
		return "", "", "", err
	}
	path, ok, pathErr := workspacePathForBase(base, rel)
	if pathErr != nil || !ok {
		return "", "", "", errors.New("invalid review path")
	}
	repoRoot, err = workspaceGitRoot(base)
	if err != nil {
		return "", "", "", err
	}
	repoRel, err = filepath.Rel(repoRoot, path)
	if err != nil || repoRel == ".." || strings.HasPrefix(repoRel, ".."+string(filepath.Separator)) || filepath.IsAbs(repoRel) {
		return "", "", "", errors.New("review path is outside the repository")
	}
	return base, repoRoot, filepath.ToSlash(repoRel), nil
}

func runReviewGitApply(repoRoot string, patch []byte, cached, reverse bool) error {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	args := []string{"-C", repoRoot, "apply", "--whitespace=nowarn"}
	if cached {
		args = append(args, "--cached")
	}
	if reverse {
		args = append(args, "--reverse")
	}
	cmd := workspaceGitCommand(ctx, args...)
	cmd.Stdin = bytes.NewReader(patch)
	if output, err := cmd.CombinedOutput(); err != nil {
		detail := strings.TrimSpace(string(output))
		if detail == "" {
			detail = err.Error()
		}
		return errors.New(detail)
	}
	return nil
}

func (a *App) reviewPatchResult(input ReviewPatchRequest, status, detail string, applied, skipped, conflicted []string) ReviewPatchResult {
	return ReviewPatchResult{
		Path: input.Path, Action: input.Action, Source: input.Source, Ticket: input.Ticket,
		SourceGeneration: input.SourceGeneration, SourceRevision: input.SourceRevision,
		Status: status, Detail: detail,
		Applied: append([]string{}, applied...), Skipped: append([]string{}, skipped...), Conflicted: append([]string{}, conflicted...),
		Changes: a.workspaceChanges(input.TabID), Diff: a.workspaceDiff(input.TabID, input.Path),
	}
}

// ApplyReviewPatchForTab applies one exact file patch. The frontend ticket and
// generation are echoed for late-ACK rejection; the backend independently
// recomputes the source revision before touching git state.
func (a *App) ApplyReviewPatchForTab(input ReviewPatchRequest) (ReviewPatchResult, error) {
	input.TabID = strings.TrimSpace(input.TabID)
	input.Path = strings.TrimSpace(input.Path)
	input.Action = strings.TrimSpace(input.Action)
	input.Source = strings.TrimSpace(input.Source)
	input.SourceRevision = strings.TrimSpace(input.SourceRevision)
	if input.Ticket == 0 || input.SourceGeneration == 0 || input.SourceRevision == "" {
		return ReviewPatchResult{}, errors.New("review ticket, generation, and revision are required")
	}
	if err := validateReviewAction(input.Action, input.Source); err != nil {
		return ReviewPatchResult{}, err
	}

	reviewMutationMu.Lock()
	defer reviewMutationMu.Unlock()

	_, repoRoot, repoRel, err := a.reviewTarget(input.TabID, input.Path)
	if err != nil {
		return ReviewPatchResult{}, err
	}
	currentDiff := a.workspaceDiff(input.TabID, input.Path)
	if currentDiff.Err != "" {
		return a.reviewPatchResult(input, reviewPatchConflict, currentDiff.Err, nil, []string{input.Path}, []string{input.Path}), nil
	}
	if current := reviewRevisionForSource(currentDiff, input.Source); current == "" || current != input.SourceRevision {
		return a.reviewPatchResult(input, reviewPatchConflict, "Diff 已变化，请刷新后重试。", nil, []string{input.Path}, []string{input.Path}), nil
	}
	patch, err := reviewSourcePatch(repoRoot, repoRel, input.Source)
	if err != nil {
		return ReviewPatchResult{}, err
	}

	if input.Action == "stage" && len(patch) == 0 && currentDiff.Status == "??" {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		cmd := workspaceGitCommand(ctx, "-C", repoRoot, "add", "--", repoRel)
		if output, addErr := cmd.CombinedOutput(); addErr != nil {
			return a.reviewPatchResult(input, reviewPatchConflict, strings.TrimSpace(string(output)), nil, []string{input.Path}, []string{input.Path}), nil
		}
		return a.reviewPatchResult(input, reviewPatchSuccess, "新文件已加入暂存区。", []string{input.Path}, nil, nil), nil
	}
	if len(patch) == 0 {
		return a.reviewPatchResult(input, reviewPatchConflict, "该来源没有可应用的变更。", nil, []string{input.Path}, []string{input.Path}), nil
	}

	switch input.Action {
	case "stage":
		err = runReviewGitApply(repoRoot, patch, true, false)
	case "unstage":
		err = runReviewGitApply(repoRoot, patch, true, true)
	case "revert":
		if input.Source == reviewSourceUnstaged {
			if currentDiff.Status == "??" {
				return a.reviewPatchResult(input, reviewPatchConflict, "未跟踪文件不会被自动删除，请在 Workspace 中手动处理。", nil, []string{input.Path}, []string{input.Path}), nil
			}
			err = runReviewGitApply(repoRoot, patch, false, true)
			break
		}
		if err = runReviewGitApply(repoRoot, patch, true, true); err == nil {
			if worktreeErr := runReviewGitApply(repoRoot, patch, false, true); worktreeErr != nil {
				return a.reviewPatchResult(input, reviewPatchPartialSuccess, "已取消暂存，但工作区回退发生冲突："+worktreeErr.Error(), []string{input.Path}, []string{input.Path}, []string{input.Path}), nil
			}
		}
	}
	if err != nil {
		return a.reviewPatchResult(input, reviewPatchConflict, err.Error(), nil, []string{input.Path}, []string{input.Path}), nil
	}
	return a.reviewPatchResult(input, reviewPatchSuccess, "变更已应用，并已刷新 Review 快照。", []string{input.Path}, nil, nil), nil
}

func (a *App) RunReviewWorkflowForTab(input ReviewWorkflowRequest) (ReviewWorkflowResult, error) {
	input.TabID = strings.TrimSpace(input.TabID)
	input.Action = strings.TrimSpace(input.Action)
	input.ExpectedGeneration = strings.TrimSpace(input.ExpectedGeneration)
	input.Message = strings.TrimSpace(input.Message)
	if input.Ticket == 0 || input.SourceGeneration == 0 || input.ExpectedGeneration == "" {
		return ReviewWorkflowResult{}, errors.New("workflow ticket, generation, and expected revision are required")
	}
	if input.Action != "commit" && input.Action != "push" && input.Action != "create-pr" {
		return ReviewWorkflowResult{}, fmt.Errorf("unsupported review workflow %q", input.Action)
	}

	reviewMutationMu.Lock()
	defer reviewMutationMu.Unlock()

	base, _, ok := a.workspaceChangesTarget(input.TabID)
	if !ok {
		return ReviewWorkflowResult{}, fmt.Errorf("tab %q not found", input.TabID)
	}
	tab := a.tabByID(input.TabID)
	if a.tabIsReadOnly(tab) {
		return ReviewWorkflowResult{}, readOnlyChannelErr()
	}
	base, err := workspaceBaseFromRoot(base)
	if err != nil {
		return ReviewWorkflowResult{}, err
	}
	repoRoot, err := workspaceGitRoot(base)
	if err != nil {
		return ReviewWorkflowResult{}, err
	}
	current := a.workspaceChanges(input.TabID)
	result := ReviewWorkflowResult{Action: input.Action, Ticket: input.Ticket, SourceGeneration: input.SourceGeneration, ExpectedGeneration: input.ExpectedGeneration, Changes: current}
	if current.Generation != input.ExpectedGeneration {
		result.Status = reviewPatchConflict
		result.Detail = "Review 快照已变化，请刷新后重试。"
		return result, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	var cmd *exec.Cmd
	switch input.Action {
	case "commit":
		if input.Message == "" {
			return ReviewWorkflowResult{}, errors.New("commit message is required")
		}
		cmd = workspaceGitCommand(ctx, "-C", repoRoot, "commit", "-m", input.Message)
	case "push":
		cmd = workspaceGitCommand(ctx, "-C", repoRoot, "push")
	case "create-pr":
		cmd = exec.CommandContext(ctx, "gh", "pr", "create", "--fill")
		cmd.Dir = repoRoot
		proc.HideWindow(cmd)
	}
	output, runErr := cmd.CombinedOutput()
	detail := strings.TrimSpace(string(output))
	if len(detail) > 12000 {
		detail = detail[len(detail)-12000:]
	}
	if runErr != nil {
		if detail == "" {
			detail = runErr.Error()
		}
		return ReviewWorkflowResult{}, errors.New(detail)
	}
	result.Status = reviewPatchSuccess
	result.Detail = detail
	if input.Action == "create-pr" {
		for _, field := range strings.Fields(detail) {
			if strings.HasPrefix(field, "https://") || strings.HasPrefix(field, "http://") {
				result.URL = strings.TrimSpace(field)
				break
			}
		}
	}
	result.Changes = a.workspaceChanges(input.TabID)
	return result, nil
}
