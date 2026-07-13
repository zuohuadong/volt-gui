package main

import (
	"fmt"
	"strings"
	"time"

	"voltui/internal/agent"
	"voltui/internal/boot"
	"voltui/internal/config"
	"voltui/internal/provider"
)

const agentProfileAuditHistoryLimit = 64

func runtimeAgentProfile(profileID string) (*boot.AgentProfile, *PersistentAgentView, error) {
	profileID = strings.TrimSpace(profileID)
	if profileID == "" {
		return nil, nil, nil
	}
	agents, err := loadAgents()
	if err != nil {
		return nil, nil, err
	}
	for i := range agents {
		if strings.TrimSpace(agents[i].ID) != profileID {
			continue
		}
		view := agents[i]
		status := strings.ToLower(strings.TrimSpace(view.Status))
		if strings.Contains(status, "停用") || status == "disabled" || status == "inactive" {
			return nil, nil, fmt.Errorf("agent profile %q is disabled", profileID)
		}
		return &boot.AgentProfile{
			ID:           view.ID,
			Name:         view.Name,
			SystemPrompt: strings.TrimSpace(view.Desc),
			ToolIDs:      append([]string(nil), view.Tools...),
			SkillNames:   append([]string(nil), view.Skills...),
		}, &view, nil
	}
	return nil, nil, fmt.Errorf("agent profile %q not found", profileID)
}

func runtimeAgentProfileForSnapshot(snap tabRuntimeSnapshot) (*boot.AgentProfile, error) {
	profile, _, err := runtimeAgentProfile(snap.agentProfileID)
	return profile, err
}

func agentProfileModelCandidate(view *PersistentAgentView) string {
	if view == nil {
		return ""
	}
	providerName := strings.TrimSpace(view.Provider)
	model := strings.TrimSpace(view.Model)
	if model == "" {
		return ""
	}
	if providerName == "" {
		return model
	}
	prefix := providerName + "/"
	if strings.HasPrefix(model, prefix) {
		return model
	}
	return prefix + model
}

func resolveAgentProfileModel(cfg *config.Config, view *PersistentAgentView, inherited string) (string, error) {
	candidate := agentProfileModelCandidate(view)
	if candidate == "" {
		return inherited, nil
	}
	config.NormalizeLegacyMimoCustomProvidersForRefs(cfg, candidate)
	entry, ok := cfg.ResolveModel(candidate)
	if !ok {
		return "", fmt.Errorf("agent profile %q uses unknown model %q", view.ID, candidate)
	}
	if !modelProviderAccessAllowed(providerAccessSet(cfg.Desktop.ProviderAccess), entry.Name) {
		return "", fmt.Errorf("agent profile %q model is unavailable because provider %q is not added", view.ID, entry.Name)
	}
	return entry.Name + "/" + entry.Model, nil
}

func recordAgentProfileSwitch(path string, view *PersistentAgentView, modelRef string) error {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil
	}
	unlock := agent.LockSessionMetaPath(path)
	defer unlock()
	meta, err := agent.EnsureBranchMeta(path)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	event := agent.AgentProfileSwitch{
		Action:         "clear",
		ChangedAt:      now,
		ModelRef:       strings.TrimSpace(modelRef),
		MemoryScopes:   []string{"inherited"},
		PermissionMode: "inherited",
	}
	if view != nil {
		event.Action = "select"
		event.ProfileID = strings.TrimSpace(view.ID)
		event.ProfileName = strings.TrimSpace(view.Name)
		event.ToolIDs = append([]string(nil), view.Tools...)
		event.SkillNames = append([]string(nil), view.Skills...)
		meta.AgentProfileID = event.ProfileID
		meta.AgentProfileName = event.ProfileName
	} else {
		meta.AgentProfileID = ""
		meta.AgentProfileName = ""
	}
	meta.AgentProfileUpdatedAt = now.Format(time.RFC3339Nano)
	meta.Model = strings.TrimSpace(modelRef)
	meta.AgentProfileHistory = append(meta.AgentProfileHistory, event)
	if extra := len(meta.AgentProfileHistory) - agentProfileAuditHistoryLimit; extra > 0 {
		meta.AgentProfileHistory = append([]agent.AgentProfileSwitch(nil), meta.AgentProfileHistory[extra:]...)
	}
	return agent.SaveBranchMetaPreserveUpdated(path, meta)
}

// SetAgentProfileForTab applies or clears a thread's runtime Agent Profile.
// The current transcript stays on the same session path while the controller is
// rebuilt with the profile prompt, skill surface, and tool boundary.
func (a *App) SetAgentProfileForTab(tabID, profileID string) error {
	if a.ctx == nil {
		return nil
	}
	profileID = strings.TrimSpace(profileID)
	tab := a.tabByID(tabID)
	if tab == nil {
		return fmt.Errorf("tab %q not found", tabID)
	}
	profile, view, err := runtimeAgentProfile(profileID)
	if err != nil {
		return err
	}
	a.mu.RLock()
	currentProfileID := strings.TrimSpace(tab.AgentProfileID)
	a.mu.RUnlock()
	if currentProfileID == profileID {
		return nil
	}

	a.runtimeRebuildMu.Lock()
	defer a.runtimeRebuildMu.Unlock()
	a.mu.RLock()
	currentProfileID = strings.TrimSpace(tab.AgentProfileID)
	a.mu.RUnlock()
	if currentProfileID == profileID {
		return nil
	}

	prevPath := a.reconciledSessionPathForTab(tab)
	if prevPath == "" {
		prevPath = a.currentSessionPathFor(tab)
	}
	if a.controllerForTab(tab) == nil && prevPath != "" {
		a.attachExistingSessionRuntime(tab, prevPath, a.ctx)
	}
	if controllerHasActiveRuntimeWork(a.controllerForTab(tab)) {
		return rebuildControllerActiveWorkError("agent profile")
	}
	if err := a.ensureTabControllerWorkspace(tab); err != nil {
		return err
	}
	prevPath = a.reconciledSessionPathForTab(tab)
	if prevPath == "" {
		prevPath = a.currentSessionPathFor(tab)
	}
	if controllerHasActiveRuntimeWork(a.controllerForTab(tab)) {
		return rebuildControllerActiveWorkError("agent profile")
	}

	snap := a.tabRuntimeSnapshot(tab)
	modelRef, fallback, err := a.resolvedModelForTab(tab)
	if err != nil {
		return err
	}
	if fallback && strings.TrimSpace(snap.model) != "" {
		a.noticeForTab(tab.ID, fmt.Sprintf("model %q is no longer available; switched to %s", snap.model, modelRef))
	}
	cfg, err := config.LoadForRoot(snap.workspaceRoot)
	if err != nil {
		return err
	}
	baseModel := strings.TrimSpace(snap.agentProfileBaseModel)
	if strings.TrimSpace(snap.agentProfileID) == "" {
		baseModel = strings.TrimSpace(snap.model)
	}
	if baseModel == "" {
		baseModel = modelRef
	}
	config.NormalizeLegacyMimoCustomProvidersForRefs(cfg, baseModel)
	if resolved, fallback, ok := cfg.ResolveModelWithFallback(baseModel); ok {
		if fallback {
			a.noticeForTab(tab.ID, fmt.Sprintf("base model %q is no longer available; switched to %s", baseModel, resolved))
		}
		baseModel = resolved
	} else {
		return fmt.Errorf("agent profile base model %q is unavailable", baseModel)
	}
	modelRef, err = resolveAgentProfileModel(cfg, view, baseModel)
	if err != nil {
		return err
	}

	var carried []provider.Message
	oldCtrl := a.controllerForTab(tab)
	if oldCtrl != nil {
		if prevPath == "" {
			prevPath = oldCtrl.SessionPath()
		}
		if err := a.ensureTabSessionLeaseForRebuild(tab, prevPath, "agent profile"); err != nil {
			return err
		}
		if err := a.snapshotTabForAction(tab, "changing agent profile"); err != nil {
			return err
		}
		prevPath = sessionPathAfterSnapshot(oldCtrl, prevPath)
		carried = oldCtrl.History()
	}

	sharedHost := a.lookupSharedHost(snap.sharedHostKey)
	newCtrl, err := boot.Build(a.bootContext(), boot.Options{
		Model:                    modelRef,
		RequireKey:               false,
		Sink:                     snap.sink,
		WorkspaceRoot:            snap.workspaceRoot,
		SessionDir:               sessionDirForSnapshot(snap),
		EffortOverride:           cloneStringPtr(snap.effort),
		TokenMode:                snap.currentTokenMode(),
		AgentProfile:             profile,
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

	path := agent.ContinueSessionPath(prevPath, newCtrl.SessionDir(), newCtrl.Label())
	if err := a.ensureTabSessionLeaseForRebuild(tab, path, "agent profile"); err != nil {
		newCtrl.Close()
		return err
	}
	resumeWithFreshSystemPrompt(newCtrl, carried, path)

	a.mu.Lock()
	if current := a.tabs[tab.ID]; current != tab {
		a.mu.Unlock()
		newCtrl.Close()
		tab.releaseSessionLease()
		return fmt.Errorf("tab %q changed while switching agent profile; retry", tab.ID)
	}
	tab.Ctrl = newCtrl
	tab.model = modelRef
	tab.Label = newCtrl.Label()
	tab.AgentProfileID = profileID
	tab.AgentProfileName = ""
	tab.AgentProfileBaseModel = ""
	if view != nil {
		tab.AgentProfileName = strings.TrimSpace(view.Name)
		tab.AgentProfileBaseModel = baseModel
	}
	clearTabStartupError(tab)
	tab.Ready = true
	a.supersedeTabBuildLocked(tab)
	a.saveTabsLocked()
	a.mu.Unlock()
	if oldCtrl != nil {
		oldCtrl.Close()
	}
	a.clearDeferredRebuild(tab.ID)
	a.persistTabSessionPath(tab, path)
	if err := recordAgentProfileSwitch(path, view, modelRef); err != nil {
		a.warnForTab(tab.ID, "Agent Profile 已切换，但审计记录写入失败："+err.Error())
	}
	a.notifyTabRuntimeRebuilt(tab)
	return nil
}
