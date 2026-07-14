package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"voltui/internal/config"
	"voltui/internal/fileutil"
)

const (
	automationsFile    = "automations.json"
	automationRunsFile = "automation-runs.json"
)

const (
	automationStatusPending  = "\u5f85\u914d\u7f6e"
	automationStatusRunning  = "\u8fd0\u884c\u4e2d"
	automationStatusPaused   = "\u5df2\u6682\u505c"
	automationStatusDisabled = "\u5df2\u505c\u7528"
	automationStatusFailed   = "\u5931\u8d25"
	automationStatusDone     = "\u5df2\u5b8c\u6210"
	automationKindDefault    = "\u81ea\u5b9a\u4e49\u81ea\u52a8\u5316"
	automationOwnerDefault   = "\u81ea\u52a8\u5316 Agent"
	automationResultPending  = "\u5f85\u8fd0\u884c"
	automationLastRunNever   = "\u672a\u8fd0\u884c"
	automationNextConfigure  = "\u7b49\u5f85\u914d\u7f6e"
)

type WorkbenchAutomationView struct {
	ID                  string   `json:"id"`
	Title               string   `json:"title"`
	Desc                string   `json:"desc"`
	Status              string   `json:"status"`
	Kind                string   `json:"kind"`
	Owner               string   `json:"owner"`
	ProjectID           string   `json:"projectId,omitempty"`
	ProjectName         string   `json:"projectName,omitempty"`
	CreateTodoOnFailure bool     `json:"createTodoOnFailure"`
	StartedAtMs         int64    `json:"startedAtMs"`
	Cadence             string   `json:"cadence"`
	Schedule            string   `json:"schedule"`
	ScheduleMode        string   `json:"scheduleMode,omitempty"`
	Scope               string   `json:"scope"`
	Environment         string   `json:"environment"`
	Command             string   `json:"command"`
	NextRunAt           string   `json:"nextRunAt,omitempty"`
	Result              string   `json:"result"`
	LastRun             string   `json:"lastRun"`
	NextRun             string   `json:"nextRun"`
	Steps               []string `json:"steps"`
	Logs                []string `json:"logs"`
	CreatedAt           string   `json:"createdAt"`
	UpdatedAt           string   `json:"updatedAt"`
}

type WorkbenchAutomationInput struct {
	ID                  string   `json:"id"`
	Title               string   `json:"title"`
	Desc                string   `json:"desc"`
	Status              string   `json:"status"`
	Kind                string   `json:"kind"`
	Owner               string   `json:"owner"`
	ProjectID           string   `json:"projectId"`
	ProjectName         string   `json:"projectName"`
	CreateTodoOnFailure bool     `json:"createTodoOnFailure"`
	StartedAtMs         int64    `json:"startedAtMs"`
	Cadence             string   `json:"cadence"`
	Schedule            string   `json:"schedule"`
	ScheduleMode        string   `json:"scheduleMode"`
	Scope               string   `json:"scope"`
	Environment         string   `json:"environment"`
	Command             string   `json:"command"`
	NextRunAt           string   `json:"nextRunAt"`
	Result              string   `json:"result"`
	LastRun             string   `json:"lastRun"`
	NextRun             string   `json:"nextRun"`
	Steps               []string `json:"steps"`
	Logs                []string `json:"logs"`
}

type WorkbenchAutomationRunView struct {
	ID              string   `json:"id"`
	AutomationID    string   `json:"automationId"`
	AutomationTitle string   `json:"automationTitle"`
	ProjectID       string   `json:"projectId,omitempty"`
	ProjectName     string   `json:"projectName,omitempty"`
	Status          string   `json:"status"`
	Result          string   `json:"result"`
	Trigger         string   `json:"trigger"`
	Command         string   `json:"command,omitempty"`
	Scope           string   `json:"scope,omitempty"`
	StartedAt       string   `json:"startedAt"`
	FinishedAt      string   `json:"finishedAt"`
	DurationMs      int64    `json:"durationMs"`
	Logs            []string `json:"logs"`
	Read            bool     `json:"read"`
	NeedsAttention  bool     `json:"needsAttention"`
}

type automationsDiskFile struct {
	Automations []WorkbenchAutomationView `json:"automations"`
}

type automationRunsDiskFile struct {
	Runs []WorkbenchAutomationRunView `json:"runs"`
}

type automationCommandSpec struct {
	Label   string
	WorkDir string
	Name    string
	Args    []string
}

type AutomationScheduler struct {
	app     *App
	done    chan struct{}
	running bool
	mu      sync.Mutex
}

var automationStoreMu sync.Mutex

func newAutomationScheduler(app *App) *AutomationScheduler {
	return &AutomationScheduler{app: app, done: make(chan struct{})}
}

func (s *AutomationScheduler) Start() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.running {
		return
	}
	s.running = true
	go s.loop()
}

func (s *AutomationScheduler) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.running {
		return
	}
	s.running = false
	close(s.done)
}

func (s *AutomationScheduler) loop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-s.done:
			return
		case <-ticker.C:
			_ = runDueAutomations(time.Now())
		}
	}
}

func (a *App) ListAutomations() ([]WorkbenchAutomationView, error) {
	automationStoreMu.Lock()
	defer automationStoreMu.Unlock()
	automations, err := loadAutomations()
	if err != nil {
		return nil, err
	}
	return automations, nil
}

func (a *App) ListAutomationRuns() ([]WorkbenchAutomationRunView, error) {
	automationStoreMu.Lock()
	defer automationStoreMu.Unlock()
	return loadAutomationRuns()
}

func (a *App) MarkAutomationRunRead(id string, read bool) (WorkbenchAutomationRunView, error) {
	automationStoreMu.Lock()
	defer automationStoreMu.Unlock()
	id = strings.TrimSpace(id)
	if id == "" {
		return WorkbenchAutomationRunView{}, errors.New("automation run id is required")
	}
	runs, err := loadAutomationRuns()
	if err != nil {
		return WorkbenchAutomationRunView{}, err
	}
	for i := range runs {
		if runs[i].ID != id {
			continue
		}
		runs[i].Read = read
		runs[i].NeedsAttention = !read && (runs[i].Status == "failed" || runs[i].Status == "skipped")
		if err := saveAutomationRuns(runs); err != nil {
			return WorkbenchAutomationRunView{}, err
		}
		return runs[i], nil
	}
	return WorkbenchAutomationRunView{}, errors.New("automation run not found")
}

func (a *App) SaveAutomation(input WorkbenchAutomationInput) (WorkbenchAutomationView, error) {
	automationStoreMu.Lock()
	defer automationStoreMu.Unlock()
	return saveAutomationInput(input)
}

func (a *App) DeleteAutomation(id string) error {
	automationStoreMu.Lock()
	defer automationStoreMu.Unlock()
	return deleteAutomation(id)
}

func deleteAutomation(id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return errors.New("automation id is required")
	}
	automations, err := loadAutomations()
	if err != nil {
		return err
	}
	next := automations[:0]
	for _, automation := range automations {
		if automation.ID == id {
			continue
		}
		next = append(next, automation)
	}
	return saveAutomations(next)
}

func (a *App) RunAutomationNow(id string) (WorkbenchAutomationView, error) {
	return runAutomationNow(context.Background(), id)
}

func runAutomationNow(ctx context.Context, id string) (WorkbenchAutomationView, error) {
	automationStoreMu.Lock()
	defer automationStoreMu.Unlock()
	return runAutomationNowLocked(ctx, id)
}

func runAutomationNowLocked(ctx context.Context, id string) (WorkbenchAutomationView, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return WorkbenchAutomationView{}, errors.New("automation id is required")
	}
	automations, err := loadAutomations()
	if err != nil {
		return WorkbenchAutomationView{}, err
	}
	for i, automation := range automations {
		if automation.ID != id {
			continue
		}
		if normalizeAutomationStatus(automation.Status) == automationStatusDisabled {
			return WorkbenchAutomationView{}, errors.New("automation is disabled")
		}
		started := time.Now()
		updated := executeAutomationContext(ctx, automation, started, false)
		finished := time.Now()
		automations[i] = updated
		sortAutomations(automations)
		if err := saveAutomations(automations); err != nil {
			return WorkbenchAutomationView{}, err
		}
		if err := recordAutomationRun(automation, updated, started, finished, "manual"); err != nil {
			return WorkbenchAutomationView{}, fmt.Errorf("automation state was saved but the result inbox could not be persisted: %w", err)
		}
		return updated, nil
	}
	return WorkbenchAutomationView{}, errors.New("automation not found")
}

func saveAutomationInput(input WorkbenchAutomationInput) (WorkbenchAutomationView, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return WorkbenchAutomationView{}, errors.New("automation title is required")
	}
	rawCommand := strings.TrimSpace(input.Command)
	command := normalizeAutomationCommand(rawCommand)
	if rawCommand != "" && command == "" && !isBrowserOnlyLegacyAutomationCommand(rawCommand) {
		return WorkbenchAutomationView{}, fmt.Errorf("unsupported automation command %q", rawCommand)
	}
	if command != "" {
		if _, ok := automationCommandSpecFor(command); !ok {
			return WorkbenchAutomationView{}, fmt.Errorf("unsupported automation command %q", command)
		}
	}
	scheduleMode := normalizeAutomationScheduleMode(input.ScheduleMode)
	nextRunAt := strings.TrimSpace(input.NextRunAt)
	if scheduleMode != "manual" {
		if command == "" {
			return WorkbenchAutomationView{}, errors.New("scheduled automation requires a command")
		}
		if _, err := parseAutomationTime(nextRunAt); err != nil {
			return WorkbenchAutomationView{}, errors.New("scheduled automation requires a valid next run time")
		}
	}
	projectID := strings.TrimSpace(input.ProjectID)
	projectName := strings.TrimSpace(input.ProjectName)
	if projectID != "" {
		projects, err := loadWorkbenchProjects()
		if err != nil {
			return WorkbenchAutomationView{}, err
		}
		matched := false
		for _, project := range projects {
			if project.ID != projectID {
				continue
			}
			projectName = project.Name
			matched = true
			break
		}
		if !matched {
			return WorkbenchAutomationView{}, errors.New("automation project not found")
		}
	}
	if input.CreateTodoOnFailure && projectID == "" {
		return WorkbenchAutomationView{}, errors.New("failure todo requires a project")
	}
	automations, err := loadAutomations()
	if err != nil {
		return WorkbenchAutomationView{}, err
	}
	now := time.Now().Format(time.RFC3339)
	id := strings.TrimSpace(input.ID)
	if id == "" {
		id = uniqueAutomationID(slugifyAgentID(title), automations)
	}
	startedAtMs := input.StartedAtMs
	if startedAtMs <= 0 {
		startedAtMs = time.Now().UnixMilli()
	}
	next := WorkbenchAutomationView{
		ID:                  id,
		Title:               title,
		Desc:                strings.TrimSpace(input.Desc),
		Status:              normalizeAutomationStatus(input.Status),
		Kind:                defaultString(strings.TrimSpace(input.Kind), automationKindDefault),
		Owner:               defaultString(strings.TrimSpace(input.Owner), automationOwnerDefault),
		ProjectID:           projectID,
		ProjectName:         projectName,
		CreateTodoOnFailure: input.CreateTodoOnFailure,
		StartedAtMs:         startedAtMs,
		Cadence:             strings.TrimSpace(input.Cadence),
		Schedule:            defaultString(strings.TrimSpace(input.Schedule), automationScheduleLabel(scheduleMode)),
		ScheduleMode:        scheduleMode,
		Scope:               strings.TrimSpace(input.Scope),
		Environment:         defaultString(strings.TrimSpace(input.Environment), "local workspace"),
		Command:             command,
		NextRunAt:           nextRunAt,
		Result:              defaultString(strings.TrimSpace(input.Result), automationResultPending),
		LastRun:             defaultString(strings.TrimSpace(input.LastRun), automationLastRunNever),
		NextRun:             defaultString(strings.TrimSpace(input.NextRun), automationNextRunLabel(scheduleMode, nextRunAt)),
		Steps:               cleanAutomationLines(input.Steps),
		Logs:                cleanAutomationLines(input.Logs),
		CreatedAt:           now,
		UpdatedAt:           now,
	}
	if next.Desc == "" {
		next.Desc = "\u5f85\u8865\u5145\u81ea\u52a8\u5316\u4efb\u52a1\u8bf4\u660e\u3002"
	}
	replaced := false
	for i, existing := range automations {
		if existing.ID != id {
			continue
		}
		next.CreatedAt = defaultString(existing.CreatedAt, now)
		automations[i] = next
		replaced = true
		break
	}
	if !replaced {
		automations = append([]WorkbenchAutomationView{next}, automations...)
	}
	sortAutomations(automations)
	if err := saveAutomations(automations); err != nil {
		return WorkbenchAutomationView{}, err
	}
	return next, nil
}

func runDueAutomations(now time.Time) error {
	automationStoreMu.Lock()
	defer automationStoreMu.Unlock()
	automations, err := loadAutomations()
	if err != nil {
		return err
	}
	changed := false
	runs := make([]WorkbenchAutomationRunView, 0)
	for i, automation := range automations {
		if !automationIsDue(automation, now) {
			continue
		}
		started := time.Now()
		updated := executeAutomationContext(context.Background(), automation, now, true)
		runs = append(runs, buildAutomationRun(automation, updated, started, time.Now(), "scheduled"))
		automations[i] = updated
		changed = true
	}
	if !changed {
		return nil
	}
	sortAutomations(automations)
	if err := saveAutomations(automations); err != nil {
		return err
	}
	if err := recordAutomationRuns(runs); err != nil {
		return fmt.Errorf("scheduled automation state was saved but the result inbox could not be persisted: %w", err)
	}
	return nil
}

func automationIsDue(automation WorkbenchAutomationView, now time.Time) bool {
	if !isAutomationRunning(automation.Status) || strings.TrimSpace(automation.Command) == "" {
		return false
	}
	if normalizeAutomationScheduleMode(automation.ScheduleMode) == "manual" {
		return false
	}
	next, err := parseAutomationTime(automation.NextRunAt)
	return err == nil && !next.After(now)
}

func executeAutomation(automation WorkbenchAutomationView, now time.Time, scheduled bool) WorkbenchAutomationView {
	return executeAutomationContext(context.Background(), automation, now, scheduled)
}

func executeAutomationContext(parent context.Context, automation WorkbenchAutomationView, now time.Time, scheduled bool) WorkbenchAutomationView {
	automation.Command = normalizeAutomationCommand(automation.Command)
	spec, ok := automationCommandSpecForWorkspace(automation.Command, automation.Scope)
	if !ok {
		automation.Status = automationStatusFailed
		automation.Result = "Unsupported command"
		automation.LastRun = time.Now().Format(time.RFC3339)
		automation.UpdatedAt = now.Format(time.RFC3339)
		automation.Logs = appendAutomationLog(automation.Logs, "Unsupported command: "+automation.Command)
		appendAutomationFailureTodoLog(&automation)
		return automation
	}
	if parent == nil {
		parent = context.Background()
	}
	ctx, cancel := context.WithTimeout(parent, 2*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, spec.Name, spec.Args...)
	cmd.Dir = spec.WorkDir
	out, err := cmd.CombinedOutput()
	output := truncateAutomationOutput(strings.TrimSpace(string(out)), 1200)
	if err != nil {
		automation.Status = automationStatusFailed
		automation.Result = "Failed: " + err.Error()
		automation.Logs = appendAutomationLog(automation.Logs, fmt.Sprintf("%s failed: %s\n%s", spec.Label, err.Error(), output))
		appendAutomationFailureTodoLog(&automation)
	} else {
		automation.Result = "Passed"
		automation.Logs = appendAutomationLog(automation.Logs, fmt.Sprintf("%s passed\n%s", spec.Label, output))
		if normalizeAutomationScheduleMode(automation.ScheduleMode) == "once" {
			automation.Status = automationStatusDone
		} else if normalizeAutomationStatus(automation.Status) == automationStatusFailed {
			// A successful retry must clear the durable failure state so the
			// automation and its inbox receipt agree about the latest run.
			automation.Status = automationStatusRunning
		}
	}
	automation.LastRun = time.Now().Format(time.RFC3339)
	automation.UpdatedAt = now.Format(time.RFC3339)
	if scheduled {
		automation.NextRunAt = nextAutomationRunAt(automation, now)
		automation.NextRun = automationNextRunLabel(normalizeAutomationScheduleMode(automation.ScheduleMode), automation.NextRunAt)
	}
	return automation
}

func recordAutomationRun(
	before WorkbenchAutomationView,
	after WorkbenchAutomationView,
	started time.Time,
	finished time.Time,
	trigger string,
) error {
	return recordAutomationRuns([]WorkbenchAutomationRunView{buildAutomationRun(before, after, started, finished, trigger)})
}

func buildAutomationRun(
	before WorkbenchAutomationView,
	after WorkbenchAutomationView,
	started time.Time,
	finished time.Time,
	trigger string,
) WorkbenchAutomationRunView {
	status := "passed"
	result := strings.TrimSpace(after.Result)
	if trigger == "skipped" || strings.HasPrefix(result, "已跳过") {
		status = "skipped"
	} else if strings.EqualFold(result, "Passed") {
		status = "passed"
	} else if normalizeAutomationStatus(after.Status) == automationStatusFailed || strings.HasPrefix(strings.ToLower(result), "failed") {
		status = "failed"
	}
	if finished.Before(started) {
		finished = started
	}
	return WorkbenchAutomationRunView{
		ID:              fmt.Sprintf("automation-run-%d", time.Now().UnixNano()),
		AutomationID:    before.ID,
		AutomationTitle: defaultString(strings.TrimSpace(before.Title), strings.TrimSpace(after.Title)),
		ProjectID:       defaultString(strings.TrimSpace(after.ProjectID), strings.TrimSpace(before.ProjectID)),
		ProjectName:     defaultString(strings.TrimSpace(after.ProjectName), strings.TrimSpace(before.ProjectName)),
		Status:          status,
		Result:          result,
		Trigger:         defaultString(strings.TrimSpace(trigger), "manual"),
		Command:         defaultString(strings.TrimSpace(after.Command), strings.TrimSpace(before.Command)),
		Scope:           defaultString(strings.TrimSpace(after.Scope), strings.TrimSpace(before.Scope)),
		StartedAt:       started.Format(time.RFC3339),
		FinishedAt:      finished.Format(time.RFC3339),
		DurationMs:      finished.Sub(started).Milliseconds(),
		Logs:            append([]string(nil), after.Logs...),
		NeedsAttention:  status == "failed" || status == "skipped",
	}
}

func recordAutomationRuns(next []WorkbenchAutomationRunView) error {
	if len(next) == 0 {
		return nil
	}
	runs, err := loadAutomationRuns()
	if err != nil {
		return err
	}
	runs = append(append([]WorkbenchAutomationRunView(nil), next...), runs...)
	sort.SliceStable(runs, func(i, j int) bool {
		if runs[i].FinishedAt == runs[j].FinishedAt {
			return runs[i].ID > runs[j].ID
		}
		return runs[i].FinishedAt > runs[j].FinishedAt
	})
	if len(runs) > 200 {
		runs = runs[:200]
	}
	return saveAutomationRuns(runs)
}

// skipMissedAutomationRuns advances schedules that elapsed while the desktop app was closed.
// The desktop scheduler intentionally does not replay missed work after startup.
func skipMissedAutomationRuns(now time.Time) error {
	automationStoreMu.Lock()
	defer automationStoreMu.Unlock()
	automations, err := loadAutomations()
	if err != nil {
		return err
	}
	changed := false
	runs := make([]WorkbenchAutomationRunView, 0)
	for i, automation := range automations {
		if !isAutomationRunning(automation.Status) || normalizeAutomationScheduleMode(automation.ScheduleMode) == "manual" {
			continue
		}
		next, err := parseAutomationTime(automation.NextRunAt)
		if err != nil || next.After(now) {
			continue
		}
		before := automation
		if normalizeAutomationScheduleMode(automation.ScheduleMode) == "once" {
			automation.Status = automationStatusPaused
			automation.NextRunAt = ""
			automation.NextRun = "已跳过，请重新安排"
		} else {
			for !next.After(now) {
				nextRunAt := nextAutomationRunAt(automation, next)
				next, err = parseAutomationTime(nextRunAt)
				if err != nil {
					return err
				}
			}
			automation.NextRunAt = next.Format(time.RFC3339)
			automation.NextRun = automationNextRunLabel(automation.ScheduleMode, automation.NextRunAt)
		}
		automation.Result = "已跳过：应用关闭期间未执行"
		automation.UpdatedAt = now.Format(time.RFC3339)
		automation.Logs = appendAutomationLog(automation.Logs, "Skipped missed schedule because the desktop app was closed")
		automations[i] = automation
		runs = append(runs, buildAutomationRun(before, automation, now, now, "skipped"))
		changed = true
	}
	if !changed {
		return nil
	}
	sortAutomations(automations)
	if err := saveAutomations(automations); err != nil {
		return err
	}
	if err := recordAutomationRuns(runs); err != nil {
		return fmt.Errorf("missed automation state was saved but the result inbox could not be persisted: %w", err)
	}
	return nil
}

func appendAutomationFailureTodoLog(automation *WorkbenchAutomationView) {
	if !automation.CreateTodoOnFailure {
		return
	}
	if strings.TrimSpace(automation.ProjectID) == "" {
		automation.Logs = appendAutomationLog(automation.Logs, "Failure todo skipped: no project is linked")
		return
	}
	_, err := (&App{}).SaveTodo(WorkbenchTodoInput{
		Title:       "处理自动化失败：" + automation.Title,
		Description: fmt.Sprintf("自动化“%s”执行失败。\n结果：%s\n请查看自动化运行日志并处理后重新执行。", automation.Title, automation.Result),
		ProjectID:   automation.ProjectID,
		ProjectName: automation.ProjectName,
		Priority:    "高",
		DueLabel:    "尽快处理",
		Status:      "pending",
		Source:      "automation:" + automation.ID,
	})
	if err != nil {
		automation.Logs = appendAutomationLog(automation.Logs, "Failed to create failure todo: "+err.Error())
		return
	}
	automation.Logs = appendAutomationLog(automation.Logs, "Created follow-up todo for the linked project")
}

func automationCommandSpecFor(command string) (automationCommandSpec, bool) {
	return automationCommandSpecForWorkspace(command, "")
}

func automationCommandSpecForWorkspace(command, workspaceRoot string) (automationCommandSpec, bool) {
	command = normalizeAutomationCommand(command)
	repoRoot, ok := automationRepoRoot(workspaceRoot)
	if !ok {
		return automationCommandSpec{}, false
	}
	desktopDir := filepath.Join(repoRoot, "desktop")
	pnpm := "pnpm"
	if runtime.GOOS == "windows" {
		pnpm = "pnpm.cmd"
	}
	specs := map[string]automationCommandSpec{
		"frontend-check":  {Label: "frontend check", WorkDir: filepath.Join(desktopDir, "frontend"), Name: pnpm, Args: []string{"check"}},
		"frontend-build":  {Label: "frontend build", WorkDir: filepath.Join(desktopDir, "frontend"), Name: pnpm, Args: []string{"build"}},
		"diff-check":      {Label: "git diff check", WorkDir: repoRoot, Name: "git", Args: []string{"diff", "--check"}},
		"desktop-go-test": {Label: "desktop go test", WorkDir: desktopDir, Name: "go", Args: []string{"test", "./..."}},
		"root-go-test":    {Label: "root go test", WorkDir: repoRoot, Name: "go", Args: []string{"test", "./..."}},
	}
	spec, ok := specs[command]
	return spec, ok
}

func automationRepoRoot(workspaceRoot string) (string, bool) {
	workspaceRoot = strings.TrimSpace(workspaceRoot)
	if workspaceRoot != "" && filepath.IsAbs(workspaceRoot) {
		root := filepath.Clean(workspaceRoot)
		info, err := os.Stat(root)
		return root, err == nil && info.IsDir()
	}
	wd, err := os.Getwd()
	if err != nil {
		return ".", true
	}
	wd = filepath.Clean(wd)
	if filepath.Base(wd) == "desktop" {
		if _, err := os.Stat(filepath.Join(wd, "go.mod")); err == nil {
			return filepath.Dir(wd), true
		}
	}
	return wd, true
}

func normalizeAutomationCommand(command string) string {
	command = strings.TrimSpace(command)
	if command == "" {
		return ""
	}
	switch command {
	case "frontend-check", "frontend-build", "diff-check", "desktop-go-test", "root-go-test":
		return command
	}
	lower := strings.ToLower(command)
	if strings.Contains(lower, "http 200") || strings.Contains(lower, "dom snapshot") || strings.Contains(lower, "console warning") {
		return ""
	}
	if strings.Contains(lower, "go test") && strings.Contains(lower, "desktop") {
		return "desktop-go-test"
	}
	if strings.Contains(lower, "go test") {
		return "root-go-test"
	}
	if strings.Contains(lower, "diff --check") {
		return "diff-check"
	}
	if strings.Contains(lower, "build") {
		return "frontend-build"
	}
	if strings.Contains(lower, "check") || strings.Contains(lower, "autofixer") {
		return "frontend-check"
	}
	return ""
}

func isBrowserOnlyLegacyAutomationCommand(command string) bool {
	lower := strings.ToLower(strings.TrimSpace(command))
	return strings.Contains(lower, "http 200") || strings.Contains(lower, "dom snapshot") || strings.Contains(lower, "console warning")
}

func nextAutomationRunAt(automation WorkbenchAutomationView, now time.Time) string {
	mode := normalizeAutomationScheduleMode(automation.ScheduleMode)
	if mode == "once" || mode == "manual" {
		return ""
	}
	next, err := parseAutomationTime(automation.NextRunAt)
	if err != nil {
		next = now
	}
	step := 24 * time.Hour
	if mode == "weekly" {
		step = 7 * 24 * time.Hour
	}
	for !next.After(now) {
		next = next.Add(step)
	}
	return next.Format(time.RFC3339)
}

func parseAutomationTime(value string) (time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, errors.New("empty time")
	}
	if t, err := time.Parse(time.RFC3339, value); err == nil {
		return t, nil
	}
	return time.ParseInLocation("2006-01-02T15:04", value, time.Local)
}

func automationsPath() (string, error) {
	userConfig := config.UserConfigPath()
	if strings.TrimSpace(userConfig) == "" {
		return "", errors.New("user config dir is unavailable")
	}
	return filepath.Join(filepath.Dir(userConfig), automationsFile), nil
}

func automationRunsPath() (string, error) {
	userConfig := config.UserConfigPath()
	if strings.TrimSpace(userConfig) == "" {
		return "", errors.New("user config dir is unavailable")
	}
	return filepath.Join(filepath.Dir(userConfig), automationRunsFile), nil
}

func loadAutomationRuns() ([]WorkbenchAutomationRunView, error) {
	path, err := automationRunsPath()
	if err != nil {
		return []WorkbenchAutomationRunView{}, nil
	}
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []WorkbenchAutomationRunView{}, nil
		}
		return nil, err
	}
	var disk automationRunsDiskFile
	if err := json.Unmarshal(b, &disk); err != nil {
		return nil, err
	}
	runs := make([]WorkbenchAutomationRunView, 0, len(disk.Runs))
	for _, run := range disk.Runs {
		run.ID = strings.TrimSpace(run.ID)
		run.AutomationID = strings.TrimSpace(run.AutomationID)
		run.AutomationTitle = strings.TrimSpace(run.AutomationTitle)
		if run.ID == "" || run.AutomationID == "" || run.AutomationTitle == "" {
			continue
		}
		run.Logs = cleanAutomationLines(run.Logs)
		run.NeedsAttention = !run.Read && (run.Status == "failed" || run.Status == "skipped")
		runs = append(runs, run)
	}
	sort.SliceStable(runs, func(i, j int) bool { return runs[i].FinishedAt > runs[j].FinishedAt })
	return runs, nil
}

func saveAutomationRuns(runs []WorkbenchAutomationRunView) error {
	path, err := automationRunsPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(automationRunsDiskFile{Runs: runs}, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".automation-runs.*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
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

func loadAutomations() ([]WorkbenchAutomationView, error) {
	path, err := automationsPath()
	if err != nil {
		return []WorkbenchAutomationView{}, nil
	}
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []WorkbenchAutomationView{}, nil
		}
		return nil, err
	}
	var disk automationsDiskFile
	if err := json.Unmarshal(b, &disk); err != nil {
		return nil, err
	}
	automations := make([]WorkbenchAutomationView, 0, len(disk.Automations))
	migrated := false
	for _, automation := range disk.Automations {
		if isLegacySeedAutomation(automation) {
			migrated = true
			continue
		}
		automation = normalizeAutomation(automation)
		if automation.ID != "" {
			automations = append(automations, automation)
		}
	}
	sortAutomations(automations)
	if migrated {
		if err := saveAutomations(automations); err != nil {
			return nil, err
		}
	}
	return automations, nil
}

func saveAutomations(automations []WorkbenchAutomationView) error {
	path, err := automationsPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(automationsDiskFile{Automations: automations}, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".automations.*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
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

func isLegacySeedAutomation(automation WorkbenchAutomationView) bool {
	if automation.CreatedAt == "" || automation.CreatedAt != automation.UpdatedAt || automation.StartedAtMs <= 0 {
		return false
	}
	switch strings.TrimSpace(automation.ID) {
	// runtime-mock-guard: allow-legacy-cleanup
	case "preflight-validation":
		// runtime-mock-guard: allow-legacy-cleanup
		expected := WorkbenchAutomationView{ID: "preflight-validation", Title: "提交前验证自动化", Desc: "将前端门禁、构建、空白检查和浏览器日志验证串成可复用任务。", Status: automationStatusRunning, Kind: "验证自动化", Owner: automationOwnerDefault, StartedAtMs: automation.StartedAtMs, Cadence: "每次 UI 改动后", Schedule: "手动触发 / 提交前", ScheduleMode: "manual", Scope: "desktop/frontend", Environment: "local workspace", Command: "frontend-check", Result: "最近一次通过", LastRun: "刚刚", NextRun: "等待下一次改动", Steps: []string{"Svelte check", "build", "browser verification"}, Logs: []string{"0 errors / 0 warnings"}, CreatedAt: automation.CreatedAt, UpdatedAt: automation.UpdatedAt}
		return reflect.DeepEqual(automation, expected)
	// runtime-mock-guard: allow-legacy-cleanup
	case "desktop-frontend-gate":
		// runtime-mock-guard: allow-legacy-cleanup
		expected := WorkbenchAutomationView{ID: "desktop-frontend-gate", Title: "桌面前端质量门禁", Desc: "针对 desktop/frontend 执行 Svelte 类型检查、Vite 构建和差异空白检查。", Status: automationStatusRunning, Kind: "质量门禁", Owner: "代码审查 Agent", StartedAtMs: automation.StartedAtMs, Cadence: "每次前端改动后", Schedule: "改动后手动复跑", ScheduleMode: "manual", Scope: "desktop/frontend", Environment: "local workspace", Command: "frontend-check", Result: "通过", LastRun: "12 分钟前", NextRun: "下一次前端改动", Steps: []string{"pnpm check", "pnpm build", "git diff --check"}, Logs: []string{"svelte-check passed"}, CreatedAt: automation.CreatedAt, UpdatedAt: automation.UpdatedAt}
		return reflect.DeepEqual(automation, expected)
	default:
		return false
	}
}

func normalizeAutomation(automation WorkbenchAutomationView) WorkbenchAutomationView {
	automation.ID = strings.TrimSpace(automation.ID)
	automation.Title = strings.TrimSpace(automation.Title)
	if automation.Title == "" {
		return WorkbenchAutomationView{}
	}
	if automation.ID == "" {
		automation.ID = slugifyAgentID(automation.Title)
	}
	automation.Desc = defaultString(strings.TrimSpace(automation.Desc), "\u5f85\u8865\u5145\u81ea\u52a8\u5316\u4efb\u52a1\u8bf4\u660e\u3002")
	automation.Status = normalizeAutomationStatus(automation.Status)
	automation.Kind = defaultString(strings.TrimSpace(automation.Kind), automationKindDefault)
	automation.Owner = defaultString(strings.TrimSpace(automation.Owner), automationOwnerDefault)
	if automation.StartedAtMs <= 0 {
		automation.StartedAtMs = time.Now().UnixMilli()
	}
	automation.Cadence = strings.TrimSpace(automation.Cadence)
	automation.ScheduleMode = normalizeAutomationScheduleMode(automation.ScheduleMode)
	automation.Schedule = defaultString(strings.TrimSpace(automation.Schedule), automationScheduleLabel(automation.ScheduleMode))
	automation.Scope = strings.TrimSpace(automation.Scope)
	automation.Environment = defaultString(strings.TrimSpace(automation.Environment), "local workspace")
	automation.Command = normalizeAutomationCommand(automation.Command)
	automation.NextRunAt = strings.TrimSpace(automation.NextRunAt)
	automation.Result = defaultString(strings.TrimSpace(automation.Result), automationResultPending)
	automation.LastRun = defaultString(strings.TrimSpace(automation.LastRun), automationLastRunNever)
	automation.NextRun = defaultString(strings.TrimSpace(automation.NextRun), automationNextRunLabel(automation.ScheduleMode, automation.NextRunAt))
	automation.Steps = cleanAutomationLines(automation.Steps)
	automation.Logs = cleanAutomationLines(automation.Logs)
	now := time.Now().Format(time.RFC3339)
	automation.CreatedAt = defaultString(automation.CreatedAt, now)
	automation.UpdatedAt = defaultString(automation.UpdatedAt, automation.CreatedAt)
	return automation
}

func normalizeAutomationStatus(value string) string {
	switch strings.TrimSpace(value) {
	case automationStatusRunning, "running":
		return automationStatusRunning
	case automationStatusPaused, "paused":
		return automationStatusPaused
	case automationStatusDisabled, "disabled":
		return automationStatusDisabled
	case automationStatusFailed, "failed":
		return automationStatusFailed
	case automationStatusDone, "done", "completed":
		return automationStatusDone
	default:
		return automationStatusPending
	}
}

func isAutomationRunning(value string) bool {
	return normalizeAutomationStatus(value) == automationStatusRunning
}

func normalizeAutomationScheduleMode(value string) string {
	switch strings.TrimSpace(value) {
	case "once", "daily", "weekly":
		return strings.TrimSpace(value)
	default:
		return "manual"
	}
}

func automationScheduleLabel(mode string) string {
	switch normalizeAutomationScheduleMode(mode) {
	case "once":
		return "\u4e00\u6b21\u6027\u5b9a\u65f6"
	case "daily":
		return "\u6bcf\u5929"
	case "weekly":
		return "\u6bcf\u5468"
	default:
		return "\u624b\u52a8\u89e6\u53d1"
	}
}

func automationNextRunLabel(mode, nextRunAt string) string {
	if normalizeAutomationScheduleMode(mode) == "manual" {
		return "\u624b\u52a8\u89e6\u53d1"
	}
	next, err := parseAutomationTime(nextRunAt)
	if err != nil {
		return automationNextConfigure
	}
	return next.Local().Format("2006-01-02 15:04")
}

func cleanAutomationLines(lines []string) []string {
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" {
			out = append(out, line)
		}
	}
	return nonNil(out)
}

func appendAutomationLog(logs []string, entry string) []string {
	logs = append(cleanAutomationLines(logs), strings.TrimSpace(entry))
	if len(logs) > 20 {
		logs = logs[len(logs)-20:]
	}
	return logs
}

func truncateAutomationOutput(value string, max int) string {
	if len(value) <= max {
		return value
	}
	return value[:max] + "\n..."
}

func sortAutomations(automations []WorkbenchAutomationView) {
	sort.SliceStable(automations, func(i, j int) bool {
		return automations[i].UpdatedAt > automations[j].UpdatedAt
	})
}

func uniqueAutomationID(base string, automations []WorkbenchAutomationView) string {
	base = defaultString(strings.TrimSpace(base), "automation")
	seen := map[string]struct{}{}
	for _, automation := range automations {
		seen[automation.ID] = struct{}{}
	}
	if _, ok := seen[base]; !ok {
		return base
	}
	for i := 2; ; i++ {
		id := base + "-" + strconv.Itoa(i)
		if _, ok := seen[id]; !ok {
			return id
		}
	}
}
