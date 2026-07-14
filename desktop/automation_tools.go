package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strings"

	"voltui/internal/tool"
)

const (
	automationListToolName   = "automation_list"
	automationSaveToolName   = "automation_save"
	automationDeleteToolName = "automation_delete"
	automationRunToolName    = "automation_run_now"
)

type desktopHostTool struct {
	name        string
	description string
	schema      json.RawMessage
	readOnly    bool
	execute     func(context.Context, json.RawMessage) (string, error)
}

func (t desktopHostTool) Name() string            { return t.name }
func (t desktopHostTool) Description() string     { return t.description }
func (t desktopHostTool) Schema() json.RawMessage { return t.schema }
func (t desktopHostTool) ReadOnly() bool          { return t.readOnly }
func (t desktopHostTool) PlanModeSafe() bool      { return t.readOnly }
func (t desktopHostTool) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	return t.execute(ctx, args)
}

type automationSaveToolArgs struct {
	ID                  string    `json:"id,omitempty"`
	Title               *string   `json:"title,omitempty"`
	Description         *string   `json:"description,omitempty"`
	Status              *string   `json:"status,omitempty"`
	Kind                *string   `json:"kind,omitempty"`
	ProjectID           *string   `json:"project_id,omitempty"`
	CreateTodoOnFailure *bool     `json:"create_todo_on_failure,omitempty"`
	Cadence             *string   `json:"cadence,omitempty"`
	ScheduleMode        *string   `json:"schedule_mode,omitempty"`
	Command             *string   `json:"command,omitempty"`
	NextRunAt           *string   `json:"next_run_at,omitempty"`
	Steps               *[]string `json:"steps,omitempty"`
}

type automationIDToolArgs struct {
	ID string `json:"id"`
}

type automationToolView struct {
	ID                  string `json:"id"`
	Title               string `json:"title"`
	Description         string `json:"description,omitempty"`
	Status              string `json:"status"`
	Kind                string `json:"kind"`
	ProjectID           string `json:"project_id,omitempty"`
	ProjectName         string `json:"project_name,omitempty"`
	CreateTodoOnFailure bool   `json:"create_todo_on_failure"`
	ScheduleMode        string `json:"schedule_mode"`
	NextRunAt           string `json:"next_run_at,omitempty"`
	Command             string `json:"command,omitempty"`
	WorkspaceRoot       string `json:"workspace_root,omitempty"`
	Result              string `json:"result,omitempty"`
	LastRun             string `json:"last_run,omitempty"`
	NextRun             string `json:"next_run,omitempty"`
}

func projectAutomationTools(scope, workspaceRoot string) []tool.Tool {
	if strings.TrimSpace(scope) != "project" {
		return nil
	}
	workspaceRoot = normalizeProjectRoot(workspaceRoot)
	if workspaceRoot == "" {
		return nil
	}

	return []tool.Tool{
		desktopHostTool{
			name:        automationListToolName,
			description: "List Volt GUI automation tasks available to the current project workspace. Use this before updating, deleting, or running an existing task.",
			schema:      json.RawMessage(`{"type":"object","additionalProperties":false}`),
			readOnly:    true,
			execute: func(_ context.Context, _ json.RawMessage) (string, error) {
				return listProjectAutomations(workspaceRoot)
			},
		},
		desktopHostTool{
			name:        automationSaveToolName,
			description: "Create or update a Volt GUI automation task for the current project. Omit id to create; provide id to update while preserving omitted fields. Supported schedule_mode values: manual, once, daily, weekly. Scheduled tasks require next_run_at and a whitelisted command: frontend-check, frontend-build, diff-check, desktop-go-test, or root-go-test.",
			schema:      json.RawMessage(`{"type":"object","additionalProperties":false,"properties":{"id":{"type":"string","description":"Existing automation id; omit to create."},"title":{"type":"string","description":"Required when creating."},"description":{"type":"string"},"status":{"type":"string","enum":["pending","running","paused","disabled","failed","done"]},"kind":{"type":"string"},"project_id":{"type":"string","description":"Optional Volt GUI workbench project id."},"create_todo_on_failure":{"type":"boolean","description":"Requires project_id when true."},"cadence":{"type":"string"},"schedule_mode":{"type":"string","enum":["manual","once","daily","weekly"]},"command":{"type":"string","enum":["","frontend-check","frontend-build","diff-check","desktop-go-test","root-go-test"]},"next_run_at":{"type":"string","description":"RFC3339 or local YYYY-MM-DDTHH:mm. Required for non-manual schedules."},"steps":{"type":"array","items":{"type":"string"}}}}`),
			readOnly:    false,
			execute: func(_ context.Context, raw json.RawMessage) (string, error) {
				var args automationSaveToolArgs
				if err := json.Unmarshal(raw, &args); err != nil {
					return "", fmt.Errorf("decode automation_save arguments: %w", err)
				}
				automation, err := saveProjectAutomation(workspaceRoot, args)
				if err != nil {
					return "", err
				}
				return marshalAutomationToolResult(automation)
			},
		},
		desktopHostTool{
			name:        automationDeleteToolName,
			description: "Delete a Volt GUI automation task belonging to the current project workspace. Call automation_list first to resolve the id.",
			schema:      json.RawMessage(`{"type":"object","additionalProperties":false,"required":["id"],"properties":{"id":{"type":"string"}}}`),
			readOnly:    false,
			execute: func(_ context.Context, raw json.RawMessage) (string, error) {
				var args automationIDToolArgs
				if err := json.Unmarshal(raw, &args); err != nil {
					return "", fmt.Errorf("decode automation_delete arguments: %w", err)
				}
				if err := deleteProjectAutomation(workspaceRoot, args.ID); err != nil {
					return "", err
				}
				return `{"deleted":true}`, nil
			},
		},
		desktopHostTool{
			name:        automationRunToolName,
			description: "Run a Volt GUI automation task belonging to the current project immediately. The configured command remains restricted to the built-in whitelist.",
			schema:      json.RawMessage(`{"type":"object","additionalProperties":false,"required":["id"],"properties":{"id":{"type":"string"}}}`),
			readOnly:    false,
			execute: func(ctx context.Context, raw json.RawMessage) (string, error) {
				var args automationIDToolArgs
				if err := json.Unmarshal(raw, &args); err != nil {
					return "", fmt.Errorf("decode automation_run_now arguments: %w", err)
				}
				automation, err := runProjectAutomation(ctx, workspaceRoot, args.ID)
				if err != nil {
					return "", err
				}
				return marshalAutomationToolResult(automation)
			},
		},
	}
}

func listProjectAutomations(workspaceRoot string) (string, error) {
	automationStoreMu.Lock()
	defer automationStoreMu.Unlock()
	automations, err := loadAutomations()
	if err != nil {
		return "", err
	}
	views := make([]automationToolView, 0, len(automations))
	for _, automation := range automations {
		if automationBelongsToWorkspace(automation, workspaceRoot) {
			views = append(views, automationToolSummary(automation))
		}
	}
	payload := struct {
		WorkspaceRoot string               `json:"workspace_root"`
		Automations   []automationToolView `json:"automations"`
	}{WorkspaceRoot: workspaceRoot, Automations: views}
	b, err := json.Marshal(payload)
	return string(b), err
}

func saveProjectAutomation(workspaceRoot string, args automationSaveToolArgs) (WorkbenchAutomationView, error) {
	automationStoreMu.Lock()
	defer automationStoreMu.Unlock()
	input := WorkbenchAutomationInput{Status: automationStatusRunning, Owner: automationOwnerDefault, Scope: workspaceRoot, Environment: "local workspace"}
	if id := strings.TrimSpace(args.ID); id != "" {
		existing, err := findProjectAutomationLocked(id, workspaceRoot)
		if err != nil {
			return WorkbenchAutomationView{}, err
		}
		input = automationInputFromView(existing)
	}
	input.Scope = workspaceRoot
	input.Environment = "local workspace"
	applyOptionalString(args.Title, &input.Title)
	applyOptionalString(args.Description, &input.Desc)
	applyOptionalString(args.Status, &input.Status)
	applyOptionalString(args.Kind, &input.Kind)
	if args.ProjectID != nil {
		input.ProjectID = *args.ProjectID
		input.ProjectName = ""
	}
	applyOptionalString(args.Cadence, &input.Cadence)
	applyOptionalString(args.Command, &input.Command)
	if args.CreateTodoOnFailure != nil {
		input.CreateTodoOnFailure = *args.CreateTodoOnFailure
	}
	if args.ScheduleMode != nil {
		input.ScheduleMode = *args.ScheduleMode
		input.Schedule = ""
		input.NextRun = ""
		if normalizeAutomationScheduleMode(*args.ScheduleMode) == "manual" && args.NextRunAt == nil {
			input.NextRunAt = ""
		}
	}
	if args.NextRunAt != nil {
		input.NextRunAt = *args.NextRunAt
		input.NextRun = ""
	}
	if args.Steps != nil {
		input.Steps = append([]string(nil), (*args.Steps)...)
	}
	return saveAutomationInput(input)
}

func deleteProjectAutomation(workspaceRoot, id string) error {
	automationStoreMu.Lock()
	defer automationStoreMu.Unlock()
	if _, err := findProjectAutomationLocked(id, workspaceRoot); err != nil {
		return err
	}
	return deleteAutomation(id)
}

func runProjectAutomation(ctx context.Context, workspaceRoot, id string) (WorkbenchAutomationView, error) {
	automationStoreMu.Lock()
	defer automationStoreMu.Unlock()
	if _, err := findProjectAutomationLocked(id, workspaceRoot); err != nil {
		return WorkbenchAutomationView{}, err
	}
	return runAutomationNowLocked(ctx, id)
}

func findProjectAutomationLocked(id, workspaceRoot string) (WorkbenchAutomationView, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return WorkbenchAutomationView{}, errors.New("automation id is required")
	}
	automations, err := loadAutomations()
	if err != nil {
		return WorkbenchAutomationView{}, err
	}
	for _, automation := range automations {
		if automation.ID != id {
			continue
		}
		if !automationBelongsToWorkspace(automation, workspaceRoot) {
			return WorkbenchAutomationView{}, errors.New("automation belongs to another project workspace")
		}
		return automation, nil
	}
	return WorkbenchAutomationView{}, errors.New("automation not found")
}

func automationBelongsToWorkspace(automation WorkbenchAutomationView, workspaceRoot string) bool {
	scope := strings.TrimSpace(automation.Scope)
	if scope == "" || !filepath.IsAbs(scope) {
		legacyRoot, ok := automationRepoRoot("")
		return ok && sameProjectRoot(legacyRoot, workspaceRoot)
	}
	return sameProjectRoot(scope, workspaceRoot)
}

func automationInputFromView(view WorkbenchAutomationView) WorkbenchAutomationInput {
	return WorkbenchAutomationInput{
		ID: view.ID, Title: view.Title, Desc: view.Desc, Status: view.Status,
		Kind: view.Kind, Owner: view.Owner, ProjectID: view.ProjectID, ProjectName: view.ProjectName,
		CreateTodoOnFailure: view.CreateTodoOnFailure, StartedAtMs: view.StartedAtMs,
		Cadence: view.Cadence, Schedule: view.Schedule, ScheduleMode: view.ScheduleMode,
		Scope: view.Scope, Environment: view.Environment, Command: view.Command,
		NextRunAt: view.NextRunAt, Result: view.Result, LastRun: view.LastRun,
		NextRun: view.NextRun, Steps: append([]string(nil), view.Steps...), Logs: append([]string(nil), view.Logs...),
	}
}

func automationToolSummary(view WorkbenchAutomationView) automationToolView {
	return automationToolView{
		ID: view.ID, Title: view.Title, Description: view.Desc, Status: view.Status,
		Kind: view.Kind, ProjectID: view.ProjectID, ProjectName: view.ProjectName,
		CreateTodoOnFailure: view.CreateTodoOnFailure, ScheduleMode: view.ScheduleMode,
		NextRunAt: view.NextRunAt, Command: view.Command, WorkspaceRoot: view.Scope,
		Result: view.Result, LastRun: view.LastRun, NextRun: view.NextRun,
	}
}

func marshalAutomationToolResult(view WorkbenchAutomationView) (string, error) {
	b, err := json.Marshal(automationToolSummary(view))
	return string(b), err
}

func applyOptionalString(value *string, target *string) {
	if value != nil {
		*target = *value
	}
}
