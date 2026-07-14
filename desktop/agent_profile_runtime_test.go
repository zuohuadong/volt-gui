package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"voltui/internal/agent"
	"voltui/internal/config"
	"voltui/internal/control"
	"voltui/internal/event"
	"voltui/internal/provider"
)

func TestAgentProfilePersistsInTabAndSessionMetadata(t *testing.T) {
	isolateDesktopUserDirs(t)
	dir := t.TempDir()
	path := filepath.Join(dir, "profile.jsonl")
	if err := os.WriteFile(path, nil, 0o644); err != nil {
		t.Fatal(err)
	}

	app := NewApp()
	tab := &WorkspaceTab{
		ID:                    "tab-profile",
		Scope:                 "project",
		WorkspaceRoot:         dir,
		SessionPath:           path,
		AgentProfileID:        "reviewer",
		AgentProfileName:      "Reviewer",
		AgentProfileBaseModel: "base/model",
		model:                 "profile-provider/profile-model",
		disabledMCP:           map[string]ServerView{},
	}
	app.tabs = map[string]*WorkspaceTab{tab.ID: tab}
	app.tabOrder = []string{tab.ID}
	app.activeTabID = tab.ID
	app.mu.Lock()
	app.saveTabsLocked()
	app.mu.Unlock()

	entry := loadTabsFile().Tabs[0]
	if entry.AgentProfileID != "reviewer" || entry.AgentProfileName != "Reviewer" || entry.AgentProfileBaseModel != "base/model" {
		t.Fatalf("persisted tab profile = %+v", entry)
	}
	if err := app.saveTabSessionMeta(tab, path); err != nil {
		t.Fatalf("saveTabSessionMeta: %v", err)
	}
	meta, ok, err := agent.LoadBranchMeta(path)
	if err != nil || !ok {
		t.Fatalf("LoadBranchMeta: ok=%v err=%v", ok, err)
	}
	if meta.AgentProfileID != "reviewer" || meta.AgentProfileName != "Reviewer" || meta.AgentProfileBaseModel != "base/model" {
		t.Fatalf("session meta profile = %+v", meta)
	}
	if model, ok := agent.LoadSessionModel(path); !ok || model != "profile-provider/profile-model" {
		t.Fatalf("startup session model = %q, %v", model, ok)
	}

	restored := &WorkspaceTab{}
	applyTabSessionProfile(restored, tabSessionProfileFromMeta(path, meta))
	if restored.AgentProfileID != "reviewer" || restored.AgentProfileName != "Reviewer" || restored.AgentProfileBaseModel != "base/model" {
		t.Fatalf("restored profile = %+v", restored)
	}
	view := app.tabMeta(tab, true)
	if view.AgentProfileID != "reviewer" || view.AgentProfileName != "Reviewer" || view.AgentProfileBaseModel != "base/model" {
		t.Fatalf("TabMeta profile = %+v", view)
	}
}

func TestAgentProfileModelCandidateOnlyTreatsProviderPrefixAsFullRef(t *testing.T) {
	tests := []struct {
		name string
		view PersistentAgentView
		want string
	}{
		{name: "plain model", view: PersistentAgentView{Provider: "gateway", Model: "model-a"}, want: "gateway/model-a"},
		{name: "model id contains slash", view: PersistentAgentView{Provider: "gateway", Model: "org/model-a"}, want: "gateway/org/model-a"},
		{name: "already full ref", view: PersistentAgentView{Provider: "gateway", Model: "gateway/model-a"}, want: "gateway/model-a"},
		{name: "no provider", view: PersistentAgentView{Model: "org/model-a"}, want: "org/model-a"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := agentProfileModelCandidate(&tt.view); got != tt.want {
				t.Fatalf("agentProfileModelCandidate = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestSetAgentProfileForTabRejectsRunningTurn(t *testing.T) {
	isolateDesktopUserDirs(t)
	if err := saveAgents([]PersistentAgentView{{ID: "reviewer", Name: "Reviewer", Status: "已启用", Desc: "Review carefully."}}); err != nil {
		t.Fatal(err)
	}
	runner := &blockingRunner{started: make(chan struct{}), release: make(chan struct{})}
	ctrl := control.New(control.Options{Runner: runner, Sink: event.Discard})
	defer ctrl.Close()
	app := NewApp()
	app.ctx = context.Background()
	tab := &WorkspaceTab{ID: "running", Scope: "global", Ctrl: ctrl, Ready: true, disabledMCP: map[string]ServerView{}}
	app.tabs = map[string]*WorkspaceTab{tab.ID: tab}
	app.tabOrder = []string{tab.ID}
	app.activeTabID = tab.ID

	ctrl.Submit("work")
	<-runner.started
	err := app.SetAgentProfileForTab(tab.ID, "reviewer")
	if err == nil || !strings.Contains(err.Error(), "finish or cancel") {
		t.Fatalf("SetAgentProfileForTab running error = %v", err)
	}
	if tab.AgentProfileID != "" {
		t.Fatalf("running rejection changed profile to %q", tab.AgentProfileID)
	}
	close(runner.release)
	waitNotRunning(t, ctrl)
}

func TestSetAgentProfileForTabSameIDStillRejectsDisabledProfile(t *testing.T) {
	isolateDesktopUserDirs(t)
	if err := saveAgents([]PersistentAgentView{{ID: "reviewer", Name: "Reviewer", Status: "已停用"}}); err != nil {
		t.Fatal(err)
	}
	app := NewApp()
	app.ctx = context.Background()
	tab := &WorkspaceTab{ID: "disabled", Scope: "global", AgentProfileID: "reviewer", disabledMCP: map[string]ServerView{}}
	app.tabs = map[string]*WorkspaceTab{tab.ID: tab}
	app.tabOrder = []string{tab.ID}
	app.activeTabID = tab.ID

	err := app.SetAgentProfileForTab(tab.ID, "reviewer")
	if err == nil || !strings.Contains(err.Error(), "disabled") {
		t.Fatalf("same disabled profile error = %v", err)
	}
}

func TestSetAgentProfileForTabRebuildsSameSessionAndClearRestoresBaseModel(t *testing.T) {
	isolateDesktopUserDirs(t)
	t.Setenv("AGENT_PROFILE_TEST_KEY", "sk-test")
	root := t.TempDir()
	configBody := `default_model = "base/base-model"

[agent]
system_prompt = "BASE SYSTEM"

[[providers]]
name = "base"
kind = "openai"
base_url = "https://example.invalid/v1"
model = "base-model"
api_key_env = "AGENT_PROFILE_TEST_KEY"

[[providers]]
name = "profile-provider"
kind = "openai"
base_url = "https://example.invalid/v1"
model = "profile-model"
api_key_env = "AGENT_PROFILE_TEST_KEY"
`
	userConfig := config.UserConfigPath()
	if err := os.MkdirAll(filepath.Dir(userConfig), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(userConfig, []byte(configBody), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := saveAgents([]PersistentAgentView{{
		ID:       "reviewer",
		Name:     "Reviewer",
		Status:   "已启用",
		Desc:     "PROFILE SYSTEM: focus on regressions.",
		Provider: "profile-provider",
		Model:    "profile-model",
		Tools:    []string{"本地文件与资料"},
		Skills:   []string{"review"},
	}}); err != nil {
		t.Fatal(err)
	}

	dir := desktopSessionDir(root)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "profile-runtime.jsonl")
	sess := agent.NewSession("OLD SYSTEM")
	sess.Add(provider.Message{Role: provider.RoleUser, Content: "keep this user message"})
	if err := sess.Save(path); err != nil {
		t.Fatal(err)
	}
	if err := agent.SaveBranchMeta(path, agent.BranchMeta{Scope: "project", WorkspaceRoot: root, Model: "base/base-model"}); err != nil {
		t.Fatal(err)
	}
	oldExec := agent.New(nil, nil, sess, agent.Options{}, event.Discard)
	oldCtrl := control.New(control.Options{Executor: oldExec, SessionDir: dir, SessionPath: path, Label: "base/base-model", Sink: event.Discard, WorkspaceRoot: root})

	app := NewApp()
	app.ctx = context.Background()
	app.readyHook = func() {}
	tab := &WorkspaceTab{
		ID:            "profile-tab",
		Scope:         "project",
		WorkspaceRoot: root,
		SessionPath:   path,
		Ctrl:          oldCtrl,
		Ready:         true,
		model:         "base/base-model",
		disabledMCP:   map[string]ServerView{},
	}
	tab.sink = &tabEventSink{tabID: tab.ID, app: app}
	app.tabs = map[string]*WorkspaceTab{tab.ID: tab}
	app.tabOrder = []string{tab.ID}
	app.activeTabID = tab.ID
	t.Cleanup(func() {
		if tab.Ctrl != nil {
			tab.Ctrl.Close()
		}
		tab.releaseSessionLease()
	})

	if err := app.SetAgentProfileForTab(tab.ID, "reviewer"); err != nil {
		t.Fatalf("select profile: %v", err)
	}
	selectedCtrl := tab.Ctrl
	if selectedCtrl == oldCtrl {
		t.Fatal("profile selection did not rebuild the controller")
	}
	if selectedCtrl.SessionPath() != path {
		t.Fatalf("session path = %q, want %q", selectedCtrl.SessionPath(), path)
	}
	if tab.model != "profile-provider/profile-model" || tab.AgentProfileBaseModel != "base/base-model" {
		t.Fatalf("selected model/base = %q/%q", tab.model, tab.AgentProfileBaseModel)
	}
	history := selectedCtrl.History()
	if len(history) < 2 || !strings.Contains(history[0].Content, "PROFILE SYSTEM") {
		t.Fatalf("profile system prompt missing from history: %+v", history)
	}
	if !strings.Contains(history[len(history)-1].Content, "keep this user message") {
		t.Fatalf("carried user history missing: %+v", history)
	}
	if err := app.SetAgentProfileForTab(tab.ID, "reviewer"); err != nil {
		t.Fatalf("same-profile no-op: %v", err)
	}
	if tab.Ctrl != selectedCtrl {
		t.Fatal("same profile selection rebuilt the controller")
	}

	meta, ok, err := agent.LoadBranchMeta(path)
	if err != nil || !ok {
		t.Fatalf("LoadBranchMeta: ok=%v err=%v", ok, err)
	}
	if len(meta.AgentProfileHistory) != 1 {
		t.Fatalf("profile history = %+v, want one select event", meta.AgentProfileHistory)
	}
	evidence := meta.AgentProfileHistory[0]
	if evidence.ModelRef != "profile-provider/profile-model" || len(evidence.ToolIDs) != 1 || len(evidence.SkillNames) != 1 || evidence.PermissionMode != "inherited" {
		t.Fatalf("profile evidence incomplete: %+v", evidence)
	}

	if err := app.SetAgentProfileForTab(tab.ID, ""); err != nil {
		t.Fatalf("clear profile: %v", err)
	}
	if tab.AgentProfileID != "" || tab.AgentProfileBaseModel != "" || tab.model != "base/base-model" {
		t.Fatalf("cleared profile state = id:%q base:%q model:%q", tab.AgentProfileID, tab.AgentProfileBaseModel, tab.model)
	}
	meta, _, err = agent.LoadBranchMeta(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(meta.AgentProfileHistory) != 2 || meta.AgentProfileHistory[1].Action != "clear" {
		t.Fatalf("profile clear evidence = %+v", meta.AgentProfileHistory)
	}
}

func TestRecordAgentProfileSwitchBoundsAuditHistory(t *testing.T) {
	path := filepath.Join(t.TempDir(), "audit.jsonl")
	if err := os.WriteFile(path, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	view := &PersistentAgentView{ID: "reviewer", Name: "Reviewer", Tools: []string{"terminal"}, Skills: []string{"review"}}
	for i := 0; i < agentProfileAuditHistoryLimit+5; i++ {
		if err := recordAgentProfileSwitch(path, view, "provider/model", []string{"workspace"}, []string{"memory-workspace"}); err != nil {
			t.Fatal(err)
		}
	}
	meta, ok, err := agent.LoadBranchMeta(path)
	if err != nil || !ok {
		t.Fatalf("LoadBranchMeta: ok=%v err=%v", ok, err)
	}
	if len(meta.AgentProfileHistory) != agentProfileAuditHistoryLimit {
		t.Fatalf("audit history len = %d, want %d", len(meta.AgentProfileHistory), agentProfileAuditHistoryLimit)
	}
	last := meta.AgentProfileHistory[len(meta.AgentProfileHistory)-1]
	if strings.Join(last.MemoryScopes, ",") != "workspace" || strings.Join(last.MemorySourceIDs, ",") != "memory-workspace" {
		t.Fatalf("memory audit = scopes:%v sources:%v", last.MemoryScopes, last.MemorySourceIDs)
	}
}
