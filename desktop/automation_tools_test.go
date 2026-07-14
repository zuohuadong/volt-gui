package main

import (
	"context"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"voltui/internal/tool"
)

func TestProjectAutomationToolsExposeApprovalSafeContracts(t *testing.T) {
	root := t.TempDir()
	tools := projectAutomationTools("project", root)
	if len(tools) != 4 {
		t.Fatalf("projectAutomationTools returned %d tools, want 4", len(tools))
	}
	for _, current := range tools {
		classifier, ok := current.(tool.PlanModeClassifier)
		if !ok {
			t.Fatalf("tool %q does not declare a plan-mode contract", current.Name())
		}
		if current.Name() == automationListToolName {
			if !current.ReadOnly() || !classifier.PlanModeSafe() {
				t.Fatalf("list tool contract = readOnly %v, planSafe %v", current.ReadOnly(), classifier.PlanModeSafe())
			}
			continue
		}
		if current.ReadOnly() || classifier.PlanModeSafe() {
			t.Fatalf("writer tool %q must require the normal write approval path", current.Name())
		}
	}
	if got := projectAutomationTools("global", root); len(got) != 0 {
		t.Fatalf("global scope exposed project automation tools: %d", len(got))
	}
}

func TestAutomationSaveToolCreatesAndUpdatesWorkspaceScopedTask(t *testing.T) {
	isolateDesktopUserDirs(t)
	root := t.TempDir()
	save := automationToolForTest(t, root, automationSaveToolName)
	nextRunAt := time.Now().Add(24 * time.Hour).Format(time.RFC3339)
	createdRaw, err := save.Execute(context.Background(), json.RawMessage(`{"title":"Daily diff check","status":"running","schedule_mode":"daily","command":"diff-check","next_run_at":"`+nextRunAt+`","steps":["check diff"]}`))
	if err != nil {
		t.Fatalf("automation_save create: %v", err)
	}
	var created automationToolView
	if err := json.Unmarshal([]byte(createdRaw), &created); err != nil {
		t.Fatalf("decode created automation: %v", err)
	}
	if created.ID == "" || created.Status != automationStatusRunning || created.WorkspaceRoot != root {
		t.Fatalf("created automation lost project state: %+v", created)
	}

	updatedRaw, err := save.Execute(context.Background(), json.RawMessage(`{"id":"`+created.ID+`","description":"updated description"}`))
	if err != nil {
		t.Fatalf("automation_save update: %v", err)
	}
	var updated automationToolView
	if err := json.Unmarshal([]byte(updatedRaw), &updated); err != nil {
		t.Fatalf("decode updated automation: %v", err)
	}
	if updated.Title != created.Title || updated.NextRunAt != created.NextRunAt || updated.Description != "updated description" {
		t.Fatalf("partial update did not preserve omitted fields: %+v", updated)
	}

	list := automationToolForTest(t, root, automationListToolName)
	listedRaw, err := list.Execute(context.Background(), json.RawMessage(`{}`))
	if err != nil || !strings.Contains(listedRaw, created.ID) {
		t.Fatalf("automation_list = %q, %v", listedRaw, err)
	}

	run := automationToolForTest(t, root, automationRunToolName)
	runRaw, err := run.Execute(context.Background(), json.RawMessage(`{"id":"`+created.ID+`"}`))
	if err != nil {
		t.Fatalf("automation_run_now: %v", err)
	}
	var ran automationToolView
	if err := json.Unmarshal([]byte(runRaw), &ran); err != nil {
		t.Fatalf("decode run result: %v", err)
	}
	if ran.LastRun == "" || ran.LastRun == automationLastRunNever {
		t.Fatalf("automation_run_now did not record a run: %+v", ran)
	}

	deleteTool := automationToolForTest(t, root, automationDeleteToolName)
	if _, err := deleteTool.Execute(context.Background(), json.RawMessage(`{"id":"`+created.ID+`"}`)); err != nil {
		t.Fatalf("automation_delete: %v", err)
	}
	listedRaw, err = list.Execute(context.Background(), json.RawMessage(`{}`))
	if err != nil || strings.Contains(listedRaw, created.ID) {
		t.Fatalf("deleted automation still listed: %q, %v", listedRaw, err)
	}
}

func TestAutomationToolsPreserveBackendValidationAndWorkspaceBoundary(t *testing.T) {
	isolateDesktopUserDirs(t)
	root := t.TempDir()
	otherRoot := t.TempDir()
	other, err := saveAutomationInput(WorkbenchAutomationInput{
		Title: "Other workspace", Status: automationStatusRunning, Scope: otherRoot, Command: "diff-check",
	})
	if err != nil {
		t.Fatalf("save other workspace automation: %v", err)
	}
	legacy, err := saveAutomationInput(WorkbenchAutomationInput{
		Title: "Legacy relative scope", Status: automationStatusRunning, Scope: "desktop/frontend", Command: "diff-check",
	})
	if err != nil {
		t.Fatalf("save legacy automation: %v", err)
	}

	list := automationToolForTest(t, root, automationListToolName)
	listedRaw, err := list.Execute(context.Background(), json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("automation_list: %v", err)
	}
	if strings.Contains(listedRaw, other.ID) || strings.Contains(listedRaw, legacy.ID) {
		t.Fatalf("automation_list leaked another or ambiguous workspace task: %s", listedRaw)
	}
	deleteTool := automationToolForTest(t, root, automationDeleteToolName)
	if _, err := deleteTool.Execute(context.Background(), json.RawMessage(`{"id":"`+other.ID+`"}`)); err == nil || !strings.Contains(err.Error(), "another project workspace") {
		t.Fatalf("cross-workspace delete error = %v", err)
	}

	save := automationToolForTest(t, root, automationSaveToolName)
	disabledRaw, err := save.Execute(context.Background(), json.RawMessage(`{"title":"Disabled task","status":"disabled","command":"diff-check"}`))
	if err != nil {
		t.Fatalf("save disabled task: %v", err)
	}
	var disabled automationToolView
	if err := json.Unmarshal([]byte(disabledRaw), &disabled); err != nil {
		t.Fatalf("decode disabled task: %v", err)
	}
	run := automationToolForTest(t, root, automationRunToolName)
	if _, err := run.Execute(context.Background(), json.RawMessage(`{"id":"`+disabled.ID+`"}`)); err == nil || !strings.Contains(err.Error(), "disabled") {
		t.Fatalf("disabled run error = %v", err)
	}
	if _, err := save.Execute(context.Background(), json.RawMessage(`{"title":"Unsafe task","command":"rm -rf /"}`)); err == nil {
		t.Fatal("automation_save accepted an arbitrary shell command")
	}
}

func TestAutomationCommandUsesStoredProjectWorkspace(t *testing.T) {
	root := t.TempDir()
	desktopFrontend := filepath.Join(root, "desktop", "frontend")
	rootSpec, ok := automationCommandSpecForWorkspace("root-go-test", root)
	if !ok || rootSpec.WorkDir != root {
		t.Fatalf("root-go-test workdir = %q, ok %v", rootSpec.WorkDir, ok)
	}
	frontendSpec, ok := automationCommandSpecForWorkspace("frontend-check", root)
	if !ok || frontendSpec.WorkDir != desktopFrontend {
		t.Fatalf("frontend-check workdir = %q, want %q, ok %v", frontendSpec.WorkDir, desktopFrontend, ok)
	}
}

func automationToolForTest(t *testing.T, workspaceRoot, name string) tool.Tool {
	t.Helper()
	for _, current := range projectAutomationTools("project", workspaceRoot) {
		if current.Name() == name {
			return current
		}
	}
	t.Fatalf("automation tool %q not found", name)
	return nil
}
