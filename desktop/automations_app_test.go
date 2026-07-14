package main

import (
	"os/exec"
	"testing"
	"time"
)

func TestSaveAutomationPersistsWorkbenchAutomation(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}

	initial, err := app.ListAutomations()
	if err != nil {
		t.Fatalf("ListAutomations initial: %v", err)
	}
	if len(initial) != 0 {
		t.Fatalf("ListAutomations initial seeded runtime data: %+v", initial)
	}

	saved, err := app.SaveAutomation(WorkbenchAutomationInput{
		Title:        "Nightly workspace check",
		Desc:         "Run local validation commands every night.",
		Status:       "running",
		Kind:         "quality gate",
		Owner:        "Automation Agent",
		Cadence:      "nightly",
		Schedule:     "0 2 * * *",
		Scope:        "desktop/frontend",
		Environment:  "local workspace",
		Command:      "diff-check",
		ScheduleMode: "manual",
		Result:       "pending",
		LastRun:      "never",
		NextRun:      "tonight",
		Steps:        []string{"check", "", "report"},
		Logs:         []string{"created"},
	})
	if err != nil {
		t.Fatalf("SaveAutomation: %v", err)
	}
	if saved.ID == "" {
		t.Fatal("SaveAutomation returned empty id")
	}
	if len(saved.Steps) != 2 {
		t.Fatalf("SaveAutomation should trim empty steps: %+v", saved.Steps)
	}

	reloaded, err := loadAutomations()
	if err != nil {
		t.Fatalf("loadAutomations: %v", err)
	}
	found := false
	for _, automation := range reloaded {
		if automation.ID == saved.ID {
			found = true
			if automation.Command != "diff-check" || automation.Scope != "desktop/frontend" {
				t.Fatalf("reloaded automation lost structured fields: %+v", automation)
			}
		}
	}
	if !found {
		t.Fatalf("saved automation not persisted: %+v", reloaded)
	}

	if err := app.DeleteAutomation(saved.ID); err != nil {
		t.Fatalf("DeleteAutomation: %v", err)
	}
	afterDelete, err := app.ListAutomations()
	if err != nil {
		t.Fatalf("ListAutomations after delete: %v", err)
	}
	for _, automation := range afterDelete {
		if automation.ID == saved.ID {
			t.Fatalf("deleted automation still present: %+v", automation)
		}
	}
}

func TestSaveAutomationValidatesCommandAndSchedule(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}

	if _, err := app.SaveAutomation(WorkbenchAutomationInput{
		Title:   "Bad command",
		Command: "rm-rf-everything",
	}); err == nil {
		t.Fatal("SaveAutomation should reject unknown commands")
	}

	if _, err := app.SaveAutomation(WorkbenchAutomationInput{
		Title:        "Missing schedule time",
		Command:      "diff-check",
		ScheduleMode: "once",
		Status:       automationStatusRunning,
	}); err == nil {
		t.Fatal("SaveAutomation should require nextRunAt for scheduled tasks")
	}
}

func TestSaveAutomationMigratesLegacyCommandText(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}

	saved, err := app.SaveAutomation(WorkbenchAutomationInput{
		Title:   "Legacy frontend gate",
		Command: "npm run check / npm run build / git diff --check",
	})
	if err != nil {
		t.Fatalf("SaveAutomation legacy command: %v", err)
	}
	if saved.Command != "diff-check" {
		t.Fatalf("legacy command mapped to %q, want diff-check", saved.Command)
	}

	browserOnly, err := app.SaveAutomation(WorkbenchAutomationInput{
		Title:   "Legacy browser smoke",
		Command: "HTTP 200 / DOM snapshot / console warnings",
	})
	if err != nil {
		t.Fatalf("SaveAutomation browser legacy command: %v", err)
	}
	if browserOnly.Command != "" {
		t.Fatalf("browser-only legacy command = %q, want empty safe command", browserOnly.Command)
	}
}

func TestRunDueAutomationsExecutesAllowedCommand(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}

	saved, err := app.SaveAutomation(WorkbenchAutomationInput{
		Title:        "Due diff check",
		Command:      "diff-check",
		Status:       automationStatusRunning,
		ScheduleMode: "once",
		NextRunAt:    time.Now().Add(-time.Minute).Format(time.RFC3339),
	})
	if err != nil {
		t.Fatalf("SaveAutomation due: %v", err)
	}
	if err := runDueAutomations(time.Now()); err != nil {
		t.Fatalf("runDueAutomations: %v", err)
	}
	automations, err := app.ListAutomations()
	if err != nil {
		t.Fatalf("ListAutomations: %v", err)
	}
	for _, automation := range automations {
		if automation.ID != saved.ID {
			continue
		}
		if automation.Status != automationStatusDone {
			t.Fatalf("due once automation status = %q, want done: %+v", automation.Status, automation)
		}
		if automation.LastRun == automationLastRunNever || len(automation.Logs) == 0 {
			t.Fatalf("due automation did not record run evidence: %+v", automation)
		}
		return
	}
	t.Fatalf("saved automation not found after run: %+v", automations)
}

func TestDisabledAutomationCannotRunAndPersistsRelationship(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}
	project, err := app.SaveWorkbenchProject(WorkbenchProjectInput{Name: "自动化关联项目"})
	if err != nil {
		t.Fatalf("SaveWorkbenchProject: %v", err)
	}
	saved, err := app.SaveAutomation(WorkbenchAutomationInput{
		Title:               "已停用门禁",
		Status:              automationStatusDisabled,
		Command:             "diff-check",
		ProjectID:           project.ID,
		ProjectName:         "错误名称应被后端纠正",
		CreateTodoOnFailure: true,
	})
	if err != nil {
		t.Fatalf("SaveAutomation: %v", err)
	}
	if saved.Status != automationStatusDisabled || saved.ProjectName != project.Name || !saved.CreateTodoOnFailure {
		t.Fatalf("saved disabled automation lost state: %+v", saved)
	}
	if _, err := app.RunAutomationNow(saved.ID); err == nil {
		t.Fatal("RunAutomationNow should reject disabled automation")
	}
	if _, err := app.SaveAutomation(WorkbenchAutomationInput{Title: "缺少关联", CreateTodoOnFailure: true}); err == nil {
		t.Fatal("SaveAutomation should require a project when failure todo is enabled")
	}
}

func TestAutomationFailureCreatesProjectTodo(t *testing.T) {
	isolateDesktopUserDirs(t)
	failed := executeAutomation(WorkbenchAutomationView{
		ID:                  "failure-follow-up",
		Title:               "失败后跟进",
		Status:              automationStatusRunning,
		Command:             "unsupported-command",
		ProjectID:           "project-1",
		ProjectName:         "测试项目",
		CreateTodoOnFailure: true,
	}, time.Now(), false)
	if failed.Status != automationStatusFailed {
		t.Fatalf("executeAutomation status = %q, want failed", failed.Status)
	}
	todos, err := loadTodos()
	if err != nil {
		t.Fatalf("loadTodos: %v", err)
	}
	for _, todo := range todos {
		if todo.Source == "automation:failure-follow-up" {
			if todo.ProjectID != "project-1" || todo.Priority != "高" || todo.Status != "pending" {
				t.Fatalf("failure todo relation is incorrect: %+v", todo)
			}
			return
		}
	}
	t.Fatalf("failure follow-up todo was not created: %+v", todos)
}

func TestSkipMissedAutomationRunsDoesNotReplayAfterStartup(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}
	now := time.Now()
	daily, err := app.SaveAutomation(WorkbenchAutomationInput{
		Title:        "错过的每日任务",
		Status:       automationStatusRunning,
		Command:      "diff-check",
		ScheduleMode: "daily",
		NextRunAt:    now.Add(-48 * time.Hour).Format(time.RFC3339),
	})
	if err != nil {
		t.Fatalf("SaveAutomation daily: %v", err)
	}
	once, err := app.SaveAutomation(WorkbenchAutomationInput{
		Title:        "错过的一次性任务",
		Status:       automationStatusRunning,
		Command:      "diff-check",
		ScheduleMode: "once",
		NextRunAt:    now.Add(-time.Hour).Format(time.RFC3339),
	})
	if err != nil {
		t.Fatalf("SaveAutomation once: %v", err)
	}
	if err := skipMissedAutomationRuns(now); err != nil {
		t.Fatalf("skipMissedAutomationRuns: %v", err)
	}
	automations, err := app.ListAutomations()
	if err != nil {
		t.Fatalf("ListAutomations: %v", err)
	}
	for _, automation := range automations {
		switch automation.ID {
		case daily.ID:
			next, err := parseAutomationTime(automation.NextRunAt)
			if err != nil || !next.After(now) || automation.Result != "已跳过：应用关闭期间未执行" {
				t.Fatalf("daily missed run was not skipped: %+v", automation)
			}
		case once.ID:
			if automation.Status != automationStatusPaused || automation.NextRunAt != "" || automation.NextRun != "已跳过，请重新安排" {
				t.Fatalf("one-time missed run was not paused: %+v", automation)
			}
		}
	}
}

func TestAutomationRunInboxPersistsAndMarksRead(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}
	started := time.Date(2026, 7, 14, 10, 0, 0, 0, time.UTC)
	finished := started.Add(3 * time.Second)
	before := WorkbenchAutomationView{ID: "verify", Title: "验证门禁", Command: "diff-check", Scope: "/workspace/app"}
	after := before
	after.Status = automationStatusFailed
	after.Result = "Failed: exit status 1"
	after.Logs = []string{"git diff check failed"}

	if err := recordAutomationRun(before, after, started, finished, "manual"); err != nil {
		t.Fatalf("recordAutomationRun: %v", err)
	}
	runs, err := app.ListAutomationRuns()
	if err != nil {
		t.Fatalf("ListAutomationRuns: %v", err)
	}
	if len(runs) != 1 || runs[0].AutomationID != "verify" || !runs[0].NeedsAttention || runs[0].Read {
		t.Fatalf("unexpected automation run inbox: %+v", runs)
	}
	updated, err := app.MarkAutomationRunRead(runs[0].ID, true)
	if err != nil {
		t.Fatalf("MarkAutomationRunRead: %v", err)
	}
	if !updated.Read || updated.NeedsAttention {
		t.Fatalf("marked run should be read and no longer need attention: %+v", updated)
	}
}

func TestSuccessfulRetryClearsAutomationFailureState(t *testing.T) {
	isolateDesktopUserDirs(t)
	repo := t.TempDir()
	if out, err := exec.Command("git", "init", repo).CombinedOutput(); err != nil {
		t.Fatalf("git init: %v\n%s", err, out)
	}

	before := WorkbenchAutomationView{
		ID:           "retry-gate",
		Title:        "重试质量门禁",
		Status:       automationStatusFailed,
		Command:      "diff-check",
		Scope:        repo,
		ScheduleMode: "manual",
		Result:       "Failed: previous run",
	}
	after := executeAutomation(before, time.Now(), false)
	if after.Status != automationStatusRunning || after.Result != "Passed" {
		t.Fatalf("successful retry = %+v, want running / Passed", after)
	}
	run := buildAutomationRun(before, after, time.Now(), time.Now(), "manual")
	if run.Status != "passed" || run.NeedsAttention {
		t.Fatalf("successful retry inbox = %+v, want passed without attention", run)
	}
}
