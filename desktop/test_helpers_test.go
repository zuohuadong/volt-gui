package main

import (
	"context"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"voltui/internal/agent"
	"voltui/internal/config"
	"voltui/internal/control"
	"voltui/internal/provider"
)

func (a *App) setTestCtrl(ctrl control.SessionAPI, model string) {
	if len(a.tabs) == 0 {
		tab := &WorkspaceTab{
			ID:          "test",
			Scope:       "global",
			Ready:       true,
			disabledMCP: map[string]ServerView{},
		}
		a.tabs = map[string]*WorkspaceTab{"test": tab}
		a.activeTabID = "test"
	}
	tab := a.tabs["test"]
	tab.Ctrl = ctrl
	a.bindControllerDisplayRecorder(ctrl)
	tab.model = model
}

func isolateDesktopUserDirs(t *testing.T) string {
	t.Helper()
	home := robustTempDir(t)
	configHome := filepath.Join(home, ".config")
	appData := filepath.Join(home, "AppData")
	for _, directory := range []string{configHome, appData} {
		if err := os.MkdirAll(directory, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("HOME", home)
	t.Setenv("REASONIX_CREDENTIALS_STORE", "file")
	t.Setenv("USERPROFILE", home)
	t.Setenv("XDG_CONFIG_HOME", configHome)
	t.Setenv("REASONIX_STATE_HOME", filepath.Join(home, "state"))
	t.Setenv("REASONIX_CACHE_HOME", filepath.Join(home, "cache"))
	t.Setenv("AppData", appData)
	return home
}

func testAppWithOrderedTabs(t *testing.T, activeTabID string, tabIDs ...string) *App {
	t.Helper()
	isolateDesktopUserDirs(t)
	tabs := make(map[string]*WorkspaceTab, len(tabIDs))
	for _, tabID := range tabIDs {
		tabs[tabID] = &WorkspaceTab{
			ID:          tabID,
			Scope:       "global",
			TopicID:     "topic_" + tabID,
			TopicTitle:  tabID,
			Ready:       true,
			disabledMCP: map[string]ServerView{},
		}
	}
	return &App{tabs: tabs, tabOrder: append([]string(nil), tabIDs...), activeTabID: activeTabID}
}

func setDesktopTestCredential(t *testing.T, key, credential string) {
	t.Helper()
	if _, err := config.SetCredential(key, credential); err != nil {
		t.Fatalf("SetCredential(%s): %v", key, err)
	}
}

func writeHistoryTestSession(t *testing.T, path, prompt string) {
	t.Helper()
	session := agent.NewSession("")
	session.Add(provider.Message{Role: provider.RoleUser, Content: prompt})
	if err := session.Save(path); err != nil {
		t.Fatalf("Save %s: %v", path, err)
	}
}

func installNoopRuntimeEvents(app *App, sinks ...*tabEventSink) {
	emit := func(context.Context, string, ...interface{}) {}
	if app != nil {
		app.runtimeEvents.emit = emit
	}
	for _, sink := range sinks {
		if sink != nil {
			sink.runtimeEvents.emit = emit
		}
	}
}

type runtimeStatusSessionController struct {
	control.SessionAPI
	status control.RuntimeStatus
}

func (controller *runtimeStatusSessionController) RuntimeStatus() control.RuntimeStatus {
	return controller.status
}

type blockingRunner struct {
	started chan struct{}
	release chan struct{}
}

func (runner *blockingRunner) Run(ctx context.Context, _ string) error {
	close(runner.started)
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-runner.release:
		return nil
	}
}

func waitNotRunning(t *testing.T, ctrl control.SessionAPI) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for ctrl.Running() {
		if time.Now().After(deadline) {
			t.Fatal("controller still running")
		}
		time.Sleep(10 * time.Millisecond)
	}
}

type topicSessionFixture struct {
	directory     string
	filename      string
	topicID       string
	topicTitle    string
	workspaceRoot string
	prompt        string
	updatedAt     time.Time
}

func writeTopicSessionWithPrompt(t *testing.T, fixture topicSessionFixture) string {
	t.Helper()
	path := filepath.Join(fixture.directory, fixture.filename)
	line := `{"role":"user","content":` + strconv.Quote(fixture.prompt) + `}` + "\n"
	if err := os.WriteFile(path, []byte(line), 0o644); err != nil {
		t.Fatalf("write session: %v", err)
	}
	scope := "global"
	if strings.TrimSpace(fixture.workspaceRoot) != "" {
		scope = "project"
	}
	if err := agent.SaveBranchMetaPreserveUpdated(path, agent.BranchMeta{
		CreatedAt:     fixture.updatedAt.Add(-time.Minute),
		UpdatedAt:     fixture.updatedAt,
		Scope:         scope,
		WorkspaceRoot: fixture.workspaceRoot,
		TopicID:       fixture.topicID,
		TopicTitle:    fixture.topicTitle,
	}); err != nil {
		t.Fatalf("save branch meta: %v", err)
	}
	return path
}
