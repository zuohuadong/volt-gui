package main

import (
	"path/filepath"
	"strings"
	"testing"

	"voltui/internal/config"
)

// WorkspaceChanges accepts both the Wails array payload and legacy string calls.
func (a *App) WorkspaceChanges(tabIDs any) WorkspaceChangesView {
	id := ""
	switch v := tabIDs.(type) {
	case string:
		id = v
	case []string:
		if len(v) > 0 {
			id = v[0]
		}
	case []any:
		if len(v) > 0 {
			if s, ok := v[0].(string); ok {
				id = s
			}
		}
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
