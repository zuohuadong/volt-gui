package main

import (
	"fmt"
	"strings"
	"time"

	"voltui/internal/agent"
	"voltui/internal/boot"
	"voltui/internal/config"
	"voltui/internal/control"
	"voltui/internal/provider"
	"voltui/internal/scopedmemory"
)

type ScopedMemoryInput struct {
	ID         string                   `json:"id,omitempty"`
	Title      string                   `json:"title"`
	Body       string                   `json:"body"`
	Source     string                   `json:"source"`
	Layer      string                   `json:"layer"`
	ScopeID    string                   `json:"scopeId"`
	References []scopedmemory.Reference `json:"references"`
	Isolated   bool                     `json:"isolated"`
}

type ScopedMemoryView struct {
	Context   scopedmemory.Context   `json:"context"`
	Entries   []scopedmemory.Entry   `json:"entries"`
	Archives  []scopedmemory.Archive `json:"archives"`
	StorePath string                 `json:"storePath,omitempty"`
	Available bool                   `json:"available"`
}

type scopedMemoryRuntime struct {
	Context   scopedmemory.Context
	Block     string
	Scopes    []string
	SourceIDs []string
	UpdatedAt string
}

func (a *App) ScopedMemoryForTab(tabID string) (ScopedMemoryView, error) {
	tab := a.tabByID(tabID)
	if tab == nil {
		return ScopedMemoryView{Entries: []scopedmemory.Entry{}, Archives: []scopedmemory.Archive{}}, fmt.Errorf("tab %q not found", tabID)
	}
	ctx := a.scopedMemoryContextForTab(tab)
	store, err := openDesktopScopedMemoryStore()
	if err != nil {
		return ScopedMemoryView{Context: ctx, Entries: []scopedmemory.Entry{}, Archives: []scopedmemory.Archive{}}, err
	}
	entries, err := store.List(ctx)
	if err != nil {
		return ScopedMemoryView{}, err
	}
	archives, err := store.ListArchives(ctx)
	if err != nil {
		return ScopedMemoryView{}, err
	}
	return ScopedMemoryView{Context: ctx, Entries: entries, Archives: archives, StorePath: store.Path(), Available: true}, nil
}

func (a *App) SaveScopedMemoryForTab(tabID string, input ScopedMemoryInput) (scopedmemory.Entry, error) {
	tab := a.tabByID(tabID)
	if tab == nil {
		return scopedmemory.Entry{}, fmt.Errorf("tab %q not found", tabID)
	}
	a.runtimeRebuildMu.Lock()
	defer a.runtimeRebuildMu.Unlock()
	plan, err := a.prepareScopedMemoryRuntimeRebuild(tab, "scoped memory")
	if err != nil {
		return scopedmemory.Entry{}, err
	}
	ctx := a.scopedMemoryContextForTab(tab)
	store, err := openDesktopScopedMemoryStore()
	if err != nil {
		return scopedmemory.Entry{}, err
	}
	entry, err := store.Save(ctx, scopedmemory.Input{
		ID: strings.TrimSpace(input.ID), Title: input.Title, Body: input.Body, Source: input.Source,
		Layer: scopedmemory.Layer(strings.TrimSpace(input.Layer)), ScopeID: input.ScopeID,
		References: input.References, Isolated: input.Isolated,
	})
	if err != nil {
		return scopedmemory.Entry{}, err
	}
	if err := a.finishScopedMemoryMutation(tab, plan, ctx, "save", entry.ID); err != nil {
		return entry, err
	}
	return entry, nil
}

func (a *App) SetScopedMemoryIsolationForTab(tabID, entryID string, isolated bool) (scopedmemory.Entry, error) {
	tab := a.tabByID(tabID)
	if tab == nil {
		return scopedmemory.Entry{}, fmt.Errorf("tab %q not found", tabID)
	}
	a.runtimeRebuildMu.Lock()
	defer a.runtimeRebuildMu.Unlock()
	plan, err := a.prepareScopedMemoryRuntimeRebuild(tab, "scoped memory")
	if err != nil {
		return scopedmemory.Entry{}, err
	}
	ctx := a.scopedMemoryContextForTab(tab)
	store, err := openDesktopScopedMemoryStore()
	if err != nil {
		return scopedmemory.Entry{}, err
	}
	entry, err := store.SetIsolation(ctx, entryID, isolated)
	if err != nil {
		return scopedmemory.Entry{}, err
	}
	if err := a.finishScopedMemoryMutation(tab, plan, ctx, "change isolation for", entry.ID); err != nil {
		return entry, err
	}
	return entry, nil
}

func (a *App) DeleteScopedMemoryForTab(tabID, entryID string) error {
	tab := a.tabByID(tabID)
	if tab == nil {
		return fmt.Errorf("tab %q not found", tabID)
	}
	a.runtimeRebuildMu.Lock()
	defer a.runtimeRebuildMu.Unlock()
	plan, err := a.prepareScopedMemoryRuntimeRebuild(tab, "scoped memory")
	if err != nil {
		return err
	}
	ctx := a.scopedMemoryContextForTab(tab)
	store, err := openDesktopScopedMemoryStore()
	if err != nil {
		return err
	}
	archive, err := store.Delete(ctx, entryID)
	if err != nil {
		return err
	}
	return a.finishScopedMemoryMutation(tab, plan, ctx, "delete", archive.Entry.ID)
}

func (a *App) SetMemoryContextForTab(tabID string, next scopedmemory.Context) error {
	if a.ctx == nil {
		return nil
	}
	next.OrganizationID = strings.TrimSpace(next.OrganizationID)
	next.WorkspaceID = strings.TrimSpace(next.WorkspaceID)
	next.ProjectID = strings.TrimSpace(next.ProjectID)
	next.ThreadID = strings.TrimSpace(next.ThreadID)
	if err := scopedmemory.ValidateContext(next); err != nil {
		return err
	}
	tab := a.tabByID(tabID)
	if tab == nil {
		return fmt.Errorf("tab %q not found", tabID)
	}
	if a.tabRuntimeSnapshot(tab).memoryContext == next {
		return nil
	}

	return a.refreshScopedMemoryRuntimeForTab(tab, next, "memory context")
}

type scopedMemoryRuntimeRebuildPlan struct {
	tab          *WorkspaceTab
	snap         tabRuntimeSnapshot
	prevPath     string
	oldCtrl      control.SessionAPI
	carried      []provider.Message
	modelRef     string
	agentProfile *boot.AgentProfile
}

func (a *App) refreshScopedMemoryRuntimeForTab(tab *WorkspaceTab, next scopedmemory.Context, reason string) error {
	a.runtimeRebuildMu.Lock()
	defer a.runtimeRebuildMu.Unlock()
	plan, err := a.prepareScopedMemoryRuntimeRebuild(tab, reason)
	if err != nil {
		return err
	}
	runtime, err := loadScopedMemoryRuntime(next)
	if err != nil {
		return err
	}
	return a.applyScopedMemoryRuntimeRebuild(plan, runtime, reason)
}

func (a *App) prepareScopedMemoryRuntimeRebuild(tab *WorkspaceTab, reason string) (scopedMemoryRuntimeRebuildPlan, error) {
	if tab == nil {
		return scopedMemoryRuntimeRebuildPlan{}, fmt.Errorf("no active tab")
	}
	reason = strings.TrimSpace(reason)
	if reason == "" {
		reason = "scoped memory"
	}
	prevPath := a.reconciledSessionPathForTab(tab)
	if prevPath == "" {
		prevPath = a.currentSessionPathFor(tab)
	}
	if a.controllerForTab(tab) == nil && prevPath != "" {
		a.attachExistingSessionRuntime(tab, prevPath, a.ctx)
	}
	if controllerHasActiveRuntimeWork(a.controllerForTab(tab)) {
		return scopedMemoryRuntimeRebuildPlan{}, rebuildControllerActiveWorkError(reason)
	}
	if err := a.ensureTabControllerWorkspace(tab); err != nil {
		return scopedMemoryRuntimeRebuildPlan{}, err
	}
	prevPath = a.reconciledSessionPathForTab(tab)
	if prevPath == "" {
		prevPath = a.currentSessionPathFor(tab)
	}
	if controllerHasActiveRuntimeWork(a.controllerForTab(tab)) {
		return scopedMemoryRuntimeRebuildPlan{}, rebuildControllerActiveWorkError(reason)
	}

	snap := a.tabRuntimeSnapshot(tab)
	modelRef, fallback, err := a.resolvedModelForTab(tab)
	if err != nil {
		return scopedMemoryRuntimeRebuildPlan{}, err
	}
	if fallback && strings.TrimSpace(snap.model) != "" {
		a.noticeForTab(tab.ID, fmt.Sprintf("model %q is no longer available; switched to %s", snap.model, modelRef))
	}
	agentProfile, err := runtimeAgentProfileForSnapshot(snap)
	if err != nil {
		return scopedMemoryRuntimeRebuildPlan{}, err
	}

	var carried []provider.Message
	oldCtrl := a.controllerForTab(tab)
	if oldCtrl != nil {
		if prevPath == "" {
			prevPath = oldCtrl.SessionPath()
		}
		if err := a.ensureTabSessionLeaseForRebuild(tab, prevPath, reason); err != nil {
			return scopedMemoryRuntimeRebuildPlan{}, err
		}
		if err := a.snapshotTabForAction(tab, "changing "+reason); err != nil {
			return scopedMemoryRuntimeRebuildPlan{}, err
		}
		prevPath = sessionPathAfterSnapshot(oldCtrl, prevPath)
		carried = oldCtrl.History()
	}
	return scopedMemoryRuntimeRebuildPlan{tab: tab, snap: snap, prevPath: prevPath, oldCtrl: oldCtrl, carried: carried, modelRef: modelRef, agentProfile: agentProfile}, nil
}

func (a *App) applyScopedMemoryRuntimeRebuild(plan scopedMemoryRuntimeRebuildPlan, memoryRuntime scopedMemoryRuntime, reason string) error {
	tab := plan.tab
	snap := plan.snap
	sharedHost := a.lookupSharedHost(snap.sharedHostKey)
	newCtrl, err := boot.Build(a.bootContext(), boot.Options{
		Model:                    plan.modelRef,
		RequireKey:               false,
		Sink:                     snap.sink,
		WorkspaceRoot:            snap.workspaceRoot,
		SessionDir:               sessionDirForSnapshot(snap),
		EffortOverride:           cloneStringPtr(snap.effort),
		TokenMode:                snap.currentTokenMode(),
		AgentProfile:             plan.agentProfile,
		ScopedMemoryBlock:        memoryRuntime.Block,
		SharedHost:               sharedHost,
		CleanupPendingReconciler: reconcileDesktopCleanupPending,
		SessionRecoveryMeta:      a.tabSessionRecoveryMeta(tab),
		OnSessionRecovered:       a.handleTabSessionRecovered(tab),
	})
	if err != nil {
		return err
	}
	a.bindControllerDisplayRecorder(newCtrl)
	newCtrl.EnableInteractiveApproval()
	applyTabModeToController(newCtrl, snap.mode)
	applyTabToolApprovalModeToController(newCtrl, snap.toolApprovalMode)
	newCtrl.SetGoal(snap.goal)
	path := agent.ContinueSessionPath(plan.prevPath, newCtrl.SessionDir(), newCtrl.Label())
	if err := a.ensureTabSessionLeaseForRebuild(tab, path, reason); err != nil {
		newCtrl.Close()
		return err
	}
	resumeWithFreshSystemPrompt(newCtrl, plan.carried, path)

	a.mu.Lock()
	if current := a.tabs[tab.ID]; current != tab {
		a.mu.Unlock()
		newCtrl.Close()
		tab.releaseSessionLease()
		return fmt.Errorf("tab %q changed while rebuilding %s; retry", tab.ID, reason)
	}
	tab.Ctrl = newCtrl
	tab.model = plan.modelRef
	tab.Label = newCtrl.Label()
	applyScopedMemoryRuntimeLocked(tab, memoryRuntime)
	clearTabStartupError(tab)
	tab.Ready = true
	a.supersedeTabBuildLocked(tab)
	a.saveTabsLocked()
	a.mu.Unlock()
	if plan.oldCtrl != nil {
		plan.oldCtrl.Close()
	}
	a.clearDeferredRebuild(tab.ID)
	a.persistTabSessionPath(tab, path)
	if err := a.saveTabSessionMeta(tab, path); err != nil {
		a.warnForTab(tab.ID, "记忆运行时已刷新，但会话审计写入失败："+err.Error())
		a.notifyTabRuntimeRebuilt(tab)
		return fmt.Errorf("persist scoped memory runtime audit: %w", err)
	}
	a.notifyTabRuntimeRebuilt(tab)
	return nil
}

func (a *App) finishScopedMemoryMutation(tab *WorkspaceTab, plan scopedMemoryRuntimeRebuildPlan, ctx scopedmemory.Context, action, entryID string) error {
	runtime, err := loadScopedMemoryRuntime(ctx)
	if err == nil {
		err = a.applyScopedMemoryRuntimeRebuild(plan, runtime, "scoped memory")
	}
	if err == nil {
		return nil
	}
	message := fmt.Sprintf("Scoped memory %s succeeded for %s, but the current tab runtime/audit refresh failed: %v", action, entryID, err)
	a.warnForTab(tab.ID, message)
	return fmt.Errorf("scoped memory %s succeeded, but runtime refresh is partial: %w", action, err)
}

func openDesktopScopedMemoryStore() (*scopedmemory.Store, error) {
	return scopedmemory.Open(config.MemoryUserDir())
}

func (a *App) scopedMemoryContextForTab(tab *WorkspaceTab) scopedmemory.Context {
	if tab == nil {
		return scopedmemory.Context{}
	}
	a.mu.RLock()
	tabID := strings.TrimSpace(tab.ID)
	ctx := tab.MemoryContext
	workspaceRoot := strings.TrimSpace(tab.WorkspaceRoot)
	topicID := strings.TrimSpace(tab.TopicID)
	sessionPath := strings.TrimSpace(tab.SessionPath)
	ctrl := tab.Ctrl
	a.mu.RUnlock()
	if ctrl != nil {
		if path := strings.TrimSpace(ctrl.SessionPath()); path != "" {
			sessionPath = path
		}
	}
	return defaultScopedMemoryContext(ctx, workspaceRoot, topicID, sessionPath, tabID)
}

func defaultScopedMemoryContext(ctx scopedmemory.Context, workspaceRoot, topicID, sessionPath, tabID string) scopedmemory.Context {
	if strings.TrimSpace(ctx.OrganizationID) == "" {
		ctx.OrganizationID = "default"
	}
	if strings.TrimSpace(ctx.WorkspaceID) == "" {
		ctx.WorkspaceID = config.WorkspaceSlug(workspaceRoot)
		if strings.TrimSpace(ctx.WorkspaceID) == "" {
			ctx.WorkspaceID = "global"
		}
	}
	if strings.TrimSpace(ctx.ProjectID) == "" {
		ctx.ProjectID = "inbox"
	}
	if strings.TrimSpace(ctx.ThreadID) == "" {
		stableKey := strings.TrimSpace(tabID)
		if stableKey == "" {
			stableKey = strings.TrimSpace(topicID)
		}
		if stableKey == "" {
			stableKey = agent.BranchID(sessionPath)
		}
		if stableKey == "" {
			stableKey = "default"
		}
		ctx.ThreadID = scopedMemoryThreadID(stableKey)
	}
	return ctx
}

func scopedMemoryThreadID(stableKey string) string {
	return "thread-" + config.WorkspaceSlug(stableKey)
}

func loadScopedMemoryRuntime(ctx scopedmemory.Context) (scopedMemoryRuntime, error) {
	store, err := openDesktopScopedMemoryStore()
	if err != nil {
		return scopedMemoryRuntime{}, err
	}
	entries, block, sources, err := store.Snapshot(ctx)
	if err != nil {
		return scopedMemoryRuntime{}, err
	}
	return scopedMemoryRuntime{
		Context: ctx, Block: block, Scopes: scopedmemory.LayersForEntries(entries, false),
		SourceIDs: sources, UpdatedAt: time.Now().UTC().Format(time.RFC3339Nano),
	}, nil
}

func (a *App) scopedMemoryRuntimeForSnapshot(snap tabRuntimeSnapshot) (scopedMemoryRuntime, error) {
	ctx := defaultScopedMemoryContext(snap.memoryContext, snap.workspaceRoot, snap.topicID, snap.sessionPath, snap.id)
	return loadScopedMemoryRuntime(ctx)
}

func applyScopedMemoryRuntimeLocked(tab *WorkspaceTab, runtime scopedMemoryRuntime) {
	if tab == nil {
		return
	}
	tab.MemoryContext = runtime.Context
	tab.MemoryScopes = append([]string(nil), runtime.Scopes...)
	tab.MemorySourceIDs = append([]string(nil), runtime.SourceIDs...)
	tab.MemoryUpdatedAt = runtime.UpdatedAt
}
