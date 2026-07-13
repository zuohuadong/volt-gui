package main

import "testing"
import "time"

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
