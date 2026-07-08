package main

import (
	"path/filepath"
	"strings"
	"testing"

	"voltui/internal/config"
)

// WorkspaceChanges accepts a slice because Wails binds Go variadic string
// parameters as array payloads in TypeScript but calls them inconsistently at
// runtime. A fixed slice keeps the desktop binding stable.
func (a *App) WorkspaceChanges(tabIDs []string) WorkspaceChangesView {
	id := ""
	if len(tabIDs) > 0 {
		id = tabIDs[0]
	}
	return a.workspaceChanges(id)
}

// NewConversationThread creates a fresh topic-backed conversation for the given
// scope/root. It is a compatibility wrapper around the topic tab flow.
func (a *App) NewConversationThread(scope, workspaceRoot, model string) (TabMeta, error) {
	scope = strings.TrimSpace(scope)
	if scope == "" {
		scope = "project"
	}
	if scope == "global" {
		topic, err := a.CreateTopic("global", "", "")
		if err != nil {
			return TabMeta{}, err
		}
		return a.ActivateTopic("global", "", topic.ID, "")
	}
	if abs, err := filepath.Abs(workspaceRoot); err == nil {
		workspaceRoot = abs
	}
	topic, err := a.CreateTopic(scope, workspaceRoot, "")
	if err != nil {
		return TabMeta{}, err
	}
	return a.ActivateTopic(scope, workspaceRoot, topic.ID, "")
}

func writeKeylessSubmitProviderConfig(t *testing.T, defaultModel string) {
	t.Helper()
	path := config.UserConfigPath()
	if path == "" {
		path = "voltui.toml"
	}
	cfg := config.Default()
	cfg.DefaultModel = defaultModel
	cfg.Providers = []config.ProviderEntry{{
		Name:    "scripted-desktop",
		Kind:    "scripted-desktop",
		Model:   "test-model",
		Models:  []string{"test-model"},
		BaseURL: "https://example.invalid",
	}}
	if err := cfg.SaveTo(path); err != nil {
		t.Fatalf("write provider config: %v", err)
	}
}
