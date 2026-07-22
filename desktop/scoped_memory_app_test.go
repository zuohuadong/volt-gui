package main

import (
	"context"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"voltui/internal/agent"
	"voltui/internal/boot"
	"voltui/internal/config"
	"voltui/internal/control"
	"voltui/internal/event"
	"voltui/internal/provider"
	"voltui/internal/scopedmemory"
)

func TestScopedMemoryForTabCRUDIsolationArchiveAndRebuild(t *testing.T) {
	isolateDesktopUserDirs(t)
	ctrl := control.New(control.Options{Sink: event.Discard})
	defer ctrl.Close()
	app := NewApp()
	app.ctx = context.Background()
	tab := &WorkspaceTab{
		ID: "memory-tab", Scope: "project", WorkspaceRoot: t.TempDir(), Ctrl: ctrl, Ready: true,
		MemoryContext: scopedmemory.Context{
			OrganizationID: "org-acme",
			WorkspaceID:    "workspace-volt",
			ProjectID:      "project-release",
			ThreadID:       "thread-42",
		},
		disabledMCP: map[string]ServerView{},
	}
	app.tabs = map[string]*WorkspaceTab{tab.ID: tab}
	app.tabOrder = []string{tab.ID}
	app.activeTabID = tab.ID

	user, err := app.SaveScopedMemoryForTab(tab.ID, ScopedMemoryInput{
		Title: "User preference", Body: "Prefer concise Chinese", Source: "user-profile",
		Layer: "user", ScopeID: scopedmemory.UserScopeID,
	})
	if err != nil {
		t.Fatal(err)
	}
	project, err := app.SaveScopedMemoryForTab(tab.ID, ScopedMemoryInput{
		Title: "Release policy", Body: "Run desktop tests", Source: "project-brief",
		Layer: "project", ScopeID: tab.MemoryContext.ProjectID,
		References: []scopedmemory.Reference{{ID: "contract-1", Title: "Delivery contract", Source: "local"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	view, err := app.ScopedMemoryForTab(tab.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !view.Available || len(view.Entries) != 2 || view.Entries[0].ID != user.ID || view.Entries[1].ID != project.ID {
		t.Fatalf("view = %+v", view)
	}
	if !strings.Contains(systemPromptFrom(tab.Ctrl.History()), "Release policy") || !slices.Contains(tab.MemorySourceIDs, project.ID) {
		t.Fatal("memory mutation was not rebuilt into the current runtime")
	}

	isolated, err := app.SetScopedMemoryIsolationForTab(tab.ID, project.ID, true)
	if err != nil || !isolated.Isolated {
		t.Fatalf("isolate = %+v, err=%v", isolated, err)
	}
	unisolated, err := app.SetScopedMemoryIsolationForTab(tab.ID, project.ID, false)
	if err != nil || unisolated.Isolated {
		t.Fatalf("unisolate = %+v, err=%v", unisolated, err)
	}
	if err := app.DeleteScopedMemoryForTab(tab.ID, project.ID); err != nil {
		t.Fatal(err)
	}
	view, err = app.ScopedMemoryForTab(tab.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(view.Entries) != 1 || len(view.Archives) != 1 || view.Archives[0].Entry.ID != project.ID {
		t.Fatalf("post-delete view = %+v", view)
	}
	info, err := os.Stat(view.StorePath)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("store mode = %o, want 600", info.Mode().Perm())
	}
}

func TestScopedMemoryForTabReturnsFriendlyContextLabels(t *testing.T) {
	isolateDesktopUserDirs(t)
	root := filepath.Join(t.TempDir(), "customer-portal")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	app := NewApp()
	tab := &WorkspaceTab{
		ID: "tab_opaque", WorkspaceRoot: root, TopicTitle: "登录流程复核",
		MemoryContext: scopedmemory.Context{OrganizationID: "default", ProjectID: "inbox"},
		disabledMCP:   map[string]ServerView{},
	}
	app.tabs = map[string]*WorkspaceTab{tab.ID: tab}

	view, err := app.ScopedMemoryForTab(tab.ID)
	if err != nil {
		t.Fatal(err)
	}
	if view.ContextLabels.Organization != "默认组织" || view.ContextLabels.Workspace != "customer-portal" || view.ContextLabels.Project != "收件箱" || view.ContextLabels.Thread != "登录流程复核" {
		t.Fatalf("context labels = %+v", view.ContextLabels)
	}
	if view.Context.ThreadID == view.ContextLabels.Thread {
		t.Fatalf("opaque thread id should remain canonical but separate from display label: %+v", view)
	}
}

func TestMemoryContextPersistsInTabSessionAndView(t *testing.T) {
	isolateDesktopUserDirs(t)
	path := filepath.Join(t.TempDir(), "memory-context.jsonl")
	if err := os.WriteFile(path, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	ctx := scopedmemory.Context{OrganizationID: "org-a", WorkspaceID: "workspace-a", ProjectID: "project-a", ThreadID: "thread-a"}
	app := NewApp()
	tab := &WorkspaceTab{
		ID: "tab-memory", SessionPath: path, MemoryContext: ctx,
		MemoryScopes: []string{"user", "project"}, MemorySourceIDs: []string{"memory-user", "memory-project"}, MemoryUpdatedAt: "2026-07-13T00:00:00Z",
		disabledMCP: map[string]ServerView{},
	}
	app.tabs = map[string]*WorkspaceTab{tab.ID: tab}
	app.tabOrder = []string{tab.ID}
	app.activeTabID = tab.ID
	app.mu.Lock()
	app.saveTabsLocked()
	app.mu.Unlock()
	if got := loadTabsFile().Tabs[0].MemoryContext; got != ctx {
		t.Fatalf("tab file memory context = %+v, want %+v", got, ctx)
	}
	if err := app.saveTabSessionMeta(tab, path); err != nil {
		t.Fatal(err)
	}
	meta, ok, err := agent.LoadBranchMeta(path)
	if err != nil || !ok {
		t.Fatalf("LoadBranchMeta: ok=%v err=%v", ok, err)
	}
	if meta.MemoryContext == nil || *meta.MemoryContext != ctx {
		t.Fatalf("session memory context = %+v, want %+v", meta.MemoryContext, ctx)
	}
	restored := &WorkspaceTab{}
	applyTabSessionProfile(restored, tabSessionProfileFromMeta(path, meta))
	view := app.tabMeta(tab, true)
	if restored.MemoryContext != ctx || view.MemoryContext != ctx {
		t.Fatalf("restored/view memory context = %+v / %+v", restored.MemoryContext, view.MemoryContext)
	}
	if strings.Join(restored.MemoryScopes, ",") != "user,project" || strings.Join(restored.MemorySourceIDs, ",") != "memory-user,memory-project" || restored.MemoryUpdatedAt != tab.MemoryUpdatedAt {
		t.Fatalf("restored memory audit = scopes:%v sources:%v updated:%q", restored.MemoryScopes, restored.MemorySourceIDs, restored.MemoryUpdatedAt)
	}
	if strings.Join(view.MemoryScopes, ",") != "user,project" || strings.Join(view.MemorySourceIDs, ",") != "memory-user,memory-project" || view.MemoryUpdatedAt != tab.MemoryUpdatedAt {
		t.Fatalf("tab meta memory audit = scopes:%v sources:%v updated:%q", view.MemoryScopes, view.MemorySourceIDs, view.MemoryUpdatedAt)
	}
}

func TestSetMemoryContextForTabRebuildsSameSessionAndKeepsRuntimeAxes(t *testing.T) {
	isolateDesktopUserDirs(t)
	t.Setenv("SCOPED_MEMORY_PROFILE_KEY", "sk-test")
	root := t.TempDir()
	configBody := `default_model = "base/base-model"

[agent]
system_prompt = "BASE SYSTEM"

[[providers]]
name = "base"
kind = "openai"
base_url = "https://example.invalid/v1"
model = "base-model"
api_key_env = "SCOPED_MEMORY_PROFILE_KEY"
`
	if err := os.MkdirAll(filepath.Dir(config.UserConfigPath()), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(config.UserConfigPath(), []byte(configBody), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := saveAgents([]PersistentAgentView{{ID: "reviewer", Name: "Reviewer", Status: "已启用", Desc: "PROFILE SYSTEM"}}); err != nil {
		t.Fatal(err)
	}
	oldCtx := scopedmemory.Context{OrganizationID: "org-a", WorkspaceID: "workspace-a", ProjectID: "project-old", ThreadID: "thread-a"}
	newCtx := scopedmemory.Context{OrganizationID: "org-a", WorkspaceID: "workspace-a", ProjectID: "project-new", ThreadID: "thread-a"}
	store, err := openDesktopScopedMemoryStore()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Save(newCtx, scopedmemory.Input{Title: "New project memory", Body: "new project constraint", Source: "project-brief", Layer: scopedmemory.LayerProject, ScopeID: newCtx.ProjectID}); err != nil {
		t.Fatal(err)
	}

	dir := desktopSessionDir(root)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "context-runtime.jsonl")
	sess := agent.NewSession("OLD SYSTEM")
	sess.Add(provider.Message{Role: provider.RoleUser, Content: "keep history"})
	if err := sess.Save(path); err != nil {
		t.Fatal(err)
	}
	if err := agent.SaveBranchMeta(path, agent.BranchMeta{Scope: "project", WorkspaceRoot: root, Model: "base/base-model", MemoryContext: scopedmemory.ContextPointer(oldCtx)}); err != nil {
		t.Fatal(err)
	}
	oldExec := agent.New(nil, nil, sess, agent.Options{}, event.Discard)
	oldCtrl := control.New(control.Options{Executor: oldExec, SessionDir: dir, SessionPath: path, Label: "base/base-model", Sink: event.Discard, WorkspaceRoot: root})
	oldCtrl.EnableInteractiveApproval()
	oldCtrl.SetToolApprovalMode(control.ToolApprovalYolo)

	app := NewApp()
	app.ctx = context.Background()
	app.readyHook = func() {}
	tab := &WorkspaceTab{
		ID: "context-tab", Scope: "project", WorkspaceRoot: root, SessionPath: path,
		Ctrl: oldCtrl, Ready: true, model: "base/base-model", AgentProfileID: "reviewer",
		AgentProfileName: "Reviewer", MemoryContext: oldCtx, toolApprovalMode: control.ToolApprovalYolo,
		disabledMCP: map[string]ServerView{},
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

	if err := app.SetMemoryContextForTab(tab.ID, newCtx); err != nil {
		t.Fatal(err)
	}
	if tab.Ctrl == oldCtrl || tab.Ctrl.SessionPath() != path {
		t.Fatalf("controller/session were not rebuilt in place: ctrl=%p old=%p path=%q", tab.Ctrl, oldCtrl, tab.Ctrl.SessionPath())
	}
	if tab.MemoryContext != newCtx || tab.model != "base/base-model" || tab.AgentProfileID != "reviewer" || tab.Ctrl.ToolApprovalMode() != control.ToolApprovalYolo {
		t.Fatalf("runtime axes changed: context=%+v model=%q profile=%q approval=%q", tab.MemoryContext, tab.model, tab.AgentProfileID, tab.Ctrl.ToolApprovalMode())
	}
	history := tab.Ctrl.History()
	if !strings.Contains(history[0].Content, "new project constraint") || !strings.Contains(history[0].Content, "PROFILE SYSTEM") || !strings.Contains(history[len(history)-1].Content, "keep history") {
		t.Fatalf("rebuilt history/system = %+v", history)
	}
	meta, ok, err := agent.LoadBranchMeta(path)
	if err != nil || !ok || meta.MemoryContext == nil || *meta.MemoryContext != newCtx || len(meta.MemorySourceIDs) != 1 {
		t.Fatalf("memory metadata = %+v, ok=%v err=%v", meta, ok, err)
	}
}

func TestSetMemoryContextForTabRejectsActiveWork(t *testing.T) {
	isolateDesktopUserDirs(t)
	runner := &blockingRunner{started: make(chan struct{}), release: make(chan struct{})}
	ctrl := control.New(control.Options{Runner: runner, Sink: event.Discard})
	defer ctrl.Close()
	current := scopedmemory.Context{OrganizationID: "org-a", WorkspaceID: "workspace-a", ProjectID: "project-a", ThreadID: "thread-a"}
	next := scopedmemory.Context{OrganizationID: "org-a", WorkspaceID: "workspace-a", ProjectID: "project-b", ThreadID: "thread-a"}
	app := NewApp()
	app.ctx = context.Background()
	tab := &WorkspaceTab{ID: "running-memory", Ctrl: ctrl, Ready: true, MemoryContext: current, disabledMCP: map[string]ServerView{}}
	app.tabs = map[string]*WorkspaceTab{tab.ID: tab}
	app.tabOrder = []string{tab.ID}
	app.activeTabID = tab.ID
	ctrl.Submit("work")
	<-runner.started
	err := app.SetMemoryContextForTab(tab.ID, next)
	if err == nil || !strings.Contains(err.Error(), "finish or cancel") {
		t.Fatalf("active work error = %v", err)
	}
	if tab.MemoryContext != current || tab.Ctrl != ctrl {
		t.Fatalf("active rejection mutated runtime: context=%+v ctrl=%p", tab.MemoryContext, tab.Ctrl)
	}
	close(runner.release)
	waitNotRunning(t, ctrl)
}

func TestSaveScopedMemoryRejectsLayerOutsideTabContext(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := NewApp()
	tab := &WorkspaceTab{
		ID: "memory-tab", MemoryContext: scopedmemory.Context{ProjectID: "project-a"},
		disabledMCP: map[string]ServerView{},
	}
	app.tabs = map[string]*WorkspaceTab{tab.ID: tab}
	if _, err := app.SaveScopedMemoryForTab(tab.ID, ScopedMemoryInput{
		Title: "Other project", Body: "must fail", Source: "test", Layer: "project", ScopeID: "project-b",
	}); err == nil {
		t.Fatal("cross-project memory save should fail")
	}
}

func TestSaveIsolatedScopedMemoryRebuildsWithoutBody(t *testing.T) {
	isolateDesktopUserDirs(t)
	ctrl := control.New(control.Options{Sink: event.Discard})
	defer ctrl.Close()
	app := NewApp()
	tab := &WorkspaceTab{
		ID: "isolated-memory-tab", Ctrl: ctrl, Ready: true,
		MemoryContext: scopedmemory.Context{OrganizationID: "org-a", WorkspaceID: "workspace-a", ProjectID: "project-a", ThreadID: "thread-a"},
		disabledMCP:   map[string]ServerView{},
	}
	app.tabs = map[string]*WorkspaceTab{tab.ID: tab}
	const secret = "isolated-secret-must-never-enter-compose"
	oldCtrl := tab.Ctrl
	entry, err := app.SaveScopedMemoryForTab(tab.ID, ScopedMemoryInput{
		Title: "Private audit", Body: secret, Source: "test", Layer: "thread", ScopeID: tab.MemoryContext.ThreadID, Isolated: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if tab.Ctrl == oldCtrl {
		t.Fatal("isolated save did not rebuild the current runtime")
	}
	composed := tab.Ctrl.Compose("next")
	if strings.Contains(composed, secret) || strings.Contains(systemPromptFrom(tab.Ctrl.History()), secret) {
		t.Fatalf("isolated memory body leaked into runtime: system=%q compose=%q", systemPromptFrom(tab.Ctrl.History()), composed)
	}
	if slices.Contains(tab.MemorySourceIDs, entry.ID) {
		t.Fatalf("isolated memory source leaked into runtime audit: %v", tab.MemorySourceIDs)
	}
}

func TestDefaultScopedMemoryContextUsesStableDistinctThreadAndInboxProject(t *testing.T) {
	first := defaultScopedMemoryContext(scopedmemory.Context{}, t.TempDir(), "", "", "tab-a")
	again := defaultScopedMemoryContext(scopedmemory.Context{}, t.TempDir(), "", "", "tab-a")
	other := defaultScopedMemoryContext(scopedmemory.Context{}, t.TempDir(), "", "", "tab-b")
	if first.ThreadID == "" || first.ProjectID == "" {
		t.Fatalf("default memory context must be complete: %+v", first)
	}
	if first.ProjectID == first.ThreadID {
		t.Fatalf("project and thread ownership must be distinct: %+v", first)
	}
	if first.ProjectID != "inbox" {
		t.Fatalf("default project = %q, want inbox", first.ProjectID)
	}
	if first.ThreadID != again.ThreadID {
		t.Fatalf("same tab did not get stable thread id: %q / %q", first.ThreadID, again.ThreadID)
	}
	if first.ThreadID == other.ThreadID {
		t.Fatalf("different tabs reused thread id %q", first.ThreadID)
	}
}

func TestScopedMemoryMutationsRebuildPromptAndPersistAudit(t *testing.T) {
	t.Run("save active entry", func(t *testing.T) {
		app, tab, store := newScopedMemoryMutationTestApp(t)
		oldCtrl := tab.Ctrl
		entry, err := app.SaveScopedMemoryForTab(tab.ID, ScopedMemoryInput{
			Title: "Saved memory", Body: "saved-memory-body", Source: "test", Layer: "thread", ScopeID: tab.MemoryContext.ThreadID,
		})
		if err != nil {
			t.Fatal(err)
		}
		assertScopedMemoryRuntimeAudit(t, app, tab, oldCtrl, entry.ID, "saved-memory-body", true)
		entries, err := store.List(tab.MemoryContext)
		if err != nil || len(entries) != 1 {
			t.Fatalf("store entries = %+v, err=%v", entries, err)
		}
	})

	t.Run("isolate active entry", func(t *testing.T) {
		app, tab, store := newScopedMemoryMutationTestApp(t)
		entry, err := store.Save(tab.MemoryContext, scopedmemory.Input{
			Title: "Isolate memory", Body: "isolate-memory-body", Source: "test", Layer: scopedmemory.LayerThread, ScopeID: tab.MemoryContext.ThreadID,
		})
		if err != nil {
			t.Fatal(err)
		}
		installScopedMemoryRuntimeForTest(t, app, tab)
		oldCtrl := tab.Ctrl
		isolated, err := app.SetScopedMemoryIsolationForTab(tab.ID, entry.ID, true)
		if err != nil {
			t.Fatal(err)
		}
		if !isolated.Isolated {
			t.Fatalf("isolated entry = %+v", isolated)
		}
		assertScopedMemoryRuntimeAudit(t, app, tab, oldCtrl, entry.ID, "isolate-memory-body", false)
	})

	t.Run("update active entry", func(t *testing.T) {
		app, tab, store := newScopedMemoryMutationTestApp(t)
		entry, err := store.Save(tab.MemoryContext, scopedmemory.Input{
			Title: "Original memory", Body: "original-memory-body", Source: "test", Layer: scopedmemory.LayerThread, ScopeID: tab.MemoryContext.ThreadID,
		})
		if err != nil {
			t.Fatal(err)
		}
		installScopedMemoryRuntimeForTest(t, app, tab)
		oldCtrl := tab.Ctrl
		updated, err := app.SaveScopedMemoryForTab(tab.ID, ScopedMemoryInput{
			ID: entry.ID, Title: "Updated memory", Body: "updated-memory-body", Source: "test", Layer: "thread", ScopeID: tab.MemoryContext.ThreadID,
		})
		if err != nil {
			t.Fatal(err)
		}
		assertScopedMemoryRuntimeAudit(t, app, tab, oldCtrl, updated.ID, "updated-memory-body", true)
		if strings.Contains(systemPromptFrom(tab.Ctrl.History()), "original-memory-body") {
			t.Fatalf("updated runtime retained stale memory body: %q", systemPromptFrom(tab.Ctrl.History()))
		}
	})

	t.Run("delete active entry", func(t *testing.T) {
		app, tab, store := newScopedMemoryMutationTestApp(t)
		entry, err := store.Save(tab.MemoryContext, scopedmemory.Input{
			Title: "Delete memory", Body: "delete-memory-body", Source: "test", Layer: scopedmemory.LayerThread, ScopeID: tab.MemoryContext.ThreadID,
		})
		if err != nil {
			t.Fatal(err)
		}
		installScopedMemoryRuntimeForTest(t, app, tab)
		oldCtrl := tab.Ctrl
		if err := app.DeleteScopedMemoryForTab(tab.ID, entry.ID); err != nil {
			t.Fatal(err)
		}
		assertScopedMemoryRuntimeAudit(t, app, tab, oldCtrl, entry.ID, "delete-memory-body", false)
	})
}

func TestScopedMemoryMutationRejectsActiveWorkBeforeStoreChange(t *testing.T) {
	cases := []struct {
		name       string
		seed       bool
		mutate     func(*App, *WorkspaceTab, string) error
		wantBody   string
		wantExists bool
		isolated   bool
	}{
		{name: "save", mutate: func(app *App, tab *WorkspaceTab, _ string) error {
			_, err := app.SaveScopedMemoryForTab(tab.ID, ScopedMemoryInput{Title: "Must reject", Body: "must-not-save", Source: "test", Layer: "thread", ScopeID: tab.MemoryContext.ThreadID})
			return err
		}},
		{name: "update", seed: true, wantBody: "original", wantExists: true, mutate: func(app *App, tab *WorkspaceTab, id string) error {
			_, err := app.SaveScopedMemoryForTab(tab.ID, ScopedMemoryInput{ID: id, Title: "Update", Body: "changed", Source: "test", Layer: "thread", ScopeID: tab.MemoryContext.ThreadID})
			return err
		}},
		{name: "isolate", seed: true, wantBody: "original", wantExists: true, mutate: func(app *App, tab *WorkspaceTab, id string) error {
			_, err := app.SetScopedMemoryIsolationForTab(tab.ID, id, true)
			return err
		}},
		{name: "delete", seed: true, wantBody: "original", wantExists: true, mutate: func(app *App, tab *WorkspaceTab, id string) error {
			return app.DeleteScopedMemoryForTab(tab.ID, id)
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			isolateDesktopUserDirs(t)
			runner := &blockingRunner{started: make(chan struct{}), release: make(chan struct{})}
			ctrl := control.New(control.Options{Runner: runner, Sink: event.Discard})
			defer ctrl.Close()
			app := NewApp()
			app.ctx = context.Background()
			ctx := scopedmemory.Context{OrganizationID: "org-a", WorkspaceID: "workspace-a", ProjectID: "project-a", ThreadID: "thread-a"}
			tab := &WorkspaceTab{ID: "active-memory", Ctrl: ctrl, Ready: true, MemoryContext: ctx, disabledMCP: map[string]ServerView{}}
			app.tabs = map[string]*WorkspaceTab{tab.ID: tab}
			app.tabOrder = []string{tab.ID}
			app.activeTabID = tab.ID
			store, err := openDesktopScopedMemoryStore()
			if err != nil {
				t.Fatal(err)
			}
			entryID := ""
			if tc.seed {
				entry, saveErr := store.Save(ctx, scopedmemory.Input{Title: "Original", Body: "original", Source: "test", Layer: scopedmemory.LayerThread, ScopeID: ctx.ThreadID})
				if saveErr != nil {
					t.Fatal(saveErr)
				}
				entryID = entry.ID
			}
			ctrl.Submit("work")
			<-runner.started
			err = tc.mutate(app, tab, entryID)
			if err == nil || !strings.Contains(err.Error(), "finish or cancel") {
				t.Fatalf("active mutation error = %v", err)
			}
			entries, listErr := store.List(ctx)
			if listErr != nil || len(entries) != btoi(tc.wantExists) {
				t.Fatalf("active rejection changed store: entries=%+v err=%v", entries, listErr)
			}
			if tc.wantExists && (entries[0].Body != tc.wantBody || entries[0].Isolated != tc.isolated) {
				t.Fatalf("active rejection changed entry: %+v", entries[0])
			}
			close(runner.release)
			waitNotRunning(t, ctrl)
		})
	}
}

func btoi(v bool) int {
	if v {
		return 1
	}
	return 0
}

func newScopedMemoryMutationTestApp(t *testing.T) (*App, *WorkspaceTab, *scopedmemory.Store) {
	t.Helper()
	isolateDesktopUserDirs(t)
	t.Setenv("SCOPED_MEMORY_MUTATION_KEY", "sk-test")
	root := t.TempDir()
	configBody := `default_model = "base/base-model"

[agent]
system_prompt = "BASE SYSTEM"

[[providers]]
name = "base"
kind = "openai"
base_url = "https://example.invalid/v1"
model = "base-model"
api_key_env = "SCOPED_MEMORY_MUTATION_KEY"
`
	if err := os.MkdirAll(filepath.Dir(config.UserConfigPath()), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(config.UserConfigPath(), []byte(configBody), 0o644); err != nil {
		t.Fatal(err)
	}
	ctx := scopedmemory.Context{OrganizationID: "org-a", WorkspaceID: "workspace-a", ProjectID: "project-a", ThreadID: "thread-a"}
	store, err := openDesktopScopedMemoryStore()
	if err != nil {
		t.Fatal(err)
	}
	dir := desktopSessionDir(root)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "scoped-memory-mutation.jsonl")
	ctrl, err := boot.Build(context.Background(), boot.Options{
		Model: "base/base-model", RequireKey: false, Sink: event.Discard, WorkspaceRoot: root, SessionDir: dir,
	})
	if err != nil {
		t.Fatal(err)
	}
	sess := agent.NewSession(systemPromptFrom(ctrl.History()))
	sess.Add(provider.Message{Role: provider.RoleUser, Content: "keep mutation history"})
	if err := sess.Save(path); err != nil {
		ctrl.Close()
		t.Fatal(err)
	}
	ctrl.Resume(sess, path)
	ctrl.EnableInteractiveApproval()
	ctrl.SetToolApprovalMode(control.ToolApprovalYolo)
	ctrl.SetGoal("keep-goal")
	app := NewApp()
	app.ctx = context.Background()
	app.readyHook = func() {}
	tab := &WorkspaceTab{
		ID: "mutation-tab", Scope: "project", WorkspaceRoot: root, SessionPath: path, Ctrl: ctrl, Ready: true,
		model: "base/base-model", MemoryContext: ctx, toolApprovalMode: control.ToolApprovalYolo, goal: "keep-goal",
		disabledMCP: map[string]ServerView{},
	}
	tab.sink = &tabEventSink{tabID: tab.ID, app: app}
	app.tabs = map[string]*WorkspaceTab{tab.ID: tab}
	app.tabOrder = []string{tab.ID}
	app.activeTabID = tab.ID
	if err := app.saveTabSessionMeta(tab, path); err != nil {
		ctrl.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if tab.Ctrl != nil {
			tab.Ctrl.Close()
		}
		tab.releaseSessionLease()
	})
	return app, tab, store
}

func installScopedMemoryRuntimeForTest(t *testing.T, app *App, tab *WorkspaceTab) {
	t.Helper()
	runtime, err := loadScopedMemoryRuntime(tab.MemoryContext)
	if err != nil {
		t.Fatal(err)
	}
	oldCtrl := tab.Ctrl
	if err := app.refreshScopedMemoryRuntimeForTab(tab, runtime.Context, "test setup"); err != nil {
		t.Fatal(err)
	}
	if tab.Ctrl == oldCtrl {
		t.Fatal("test setup did not rebuild scoped memory runtime")
	}
}

func assertScopedMemoryRuntimeAudit(t *testing.T, app *App, tab *WorkspaceTab, oldCtrl control.SessionAPI, entryID, body string, included bool) {
	t.Helper()
	if tab.Ctrl == oldCtrl || tab.Ctrl.SessionPath() != tab.SessionPath {
		t.Fatalf("memory mutation did not rebuild same session: ctrl=%p old=%p path=%q want=%q", tab.Ctrl, oldCtrl, tab.Ctrl.SessionPath(), tab.SessionPath)
	}
	system := systemPromptFrom(tab.Ctrl.History())
	compose := tab.Ctrl.Compose("next")
	if strings.Contains(system, body) != included || !included && strings.Contains(compose, body) {
		t.Fatalf("runtime memory visibility mismatch: included=%v system=%q compose=%q", included, system, compose)
	}
	if slices.Contains(tab.MemorySourceIDs, entryID) != included {
		t.Fatalf("tab memory sources = %v, included=%v id=%q", tab.MemorySourceIDs, included, entryID)
	}
	if tab.Ctrl.ToolApprovalMode() != control.ToolApprovalYolo || tab.Ctrl.Goal() != "keep-goal" {
		t.Fatalf("runtime axes changed: approval=%q goal=%q", tab.Ctrl.ToolApprovalMode(), tab.Ctrl.Goal())
	}
	if !strings.Contains(tab.Ctrl.History()[len(tab.Ctrl.History())-1].Content, "keep mutation history") || tab.model != "base/base-model" {
		t.Fatalf("history/model changed: history=%+v model=%q", tab.Ctrl.History(), tab.model)
	}
	view := app.tabMeta(tab, true)
	if strings.Join(view.MemorySourceIDs, ",") != strings.Join(tab.MemorySourceIDs, ",") || view.MemoryUpdatedAt != tab.MemoryUpdatedAt {
		t.Fatalf("TabMeta audit = sources:%v updated:%q, tab=%v/%q", view.MemorySourceIDs, view.MemoryUpdatedAt, tab.MemorySourceIDs, tab.MemoryUpdatedAt)
	}
	meta, ok, err := agent.LoadBranchMeta(tab.SessionPath)
	if err != nil || !ok {
		t.Fatalf("LoadBranchMeta: ok=%v err=%v", ok, err)
	}
	if strings.Join(meta.MemorySourceIDs, ",") != strings.Join(tab.MemorySourceIDs, ",") || meta.MemoryUpdatedAt != tab.MemoryUpdatedAt || meta.MemoryContext == nil || *meta.MemoryContext != tab.MemoryContext {
		t.Fatalf("BranchMeta audit = context:%+v sources:%v updated:%q; tab=%+v/%v/%q", meta.MemoryContext, meta.MemorySourceIDs, meta.MemoryUpdatedAt, tab.MemoryContext, tab.MemorySourceIDs, tab.MemoryUpdatedAt)
	}
}
