package bot

import (
	"context"
	"errors"
	"strings"

	"voltui/internal/boot"
)

type RemoteRuntime struct {
	WorkspaceRoot  string
	ProjectID      string
	AgentProfileID string
	PermissionMode string
	AgentProfile   *boot.AgentProfile
	Legacy         bool
}

type RemoteRuntimeResolver func(context.Context, RemoteBinding, RemoteRuntime, InboundMessage) (RemoteRuntime, error)

func (gw *BotGateway) beginRemoteTask(ctx context.Context, msg InboundMessage) (RemoteTaskRecord, RemoteRuntime, bool, error) {
	if gw.cfg.RemoteStore == nil {
		return RemoteTaskRecord{}, RemoteRuntime{}, false, nil
	}
	endpoint := RemoteEndpointFromMessage(msg)
	actor := RemoteActorFromMessage(msg)
	if actor == "" {
		return RemoteTaskRecord{}, RemoteRuntime{}, false, errors.New("remote actor is unavailable")
	}
	binding, runtime := gw.remoteBindingCandidate(msg)
	if gw.cfg.ResolveRemoteRuntime != nil {
		resolved, err := gw.cfg.ResolveRemoteRuntime(ctx, binding, runtime, msg)
		if err != nil {
			return RemoteTaskRecord{}, RemoteRuntime{}, false, err
		}
		runtime = normalizeRemoteRuntime(resolved)
	}
	if runtime.WorkspaceRoot == "" {
		return RemoteTaskRecord{}, RemoteRuntime{}, false, errors.New("remote workspace could not be resolved")
	}
	if runtime.ProjectID == "" {
		return RemoteTaskRecord{}, RemoteRuntime{}, false, errors.New("remote business project could not be resolved")
	}
	if runtime.ProjectID == "inbox" && runtime.AgentProfileID == "" {
		runtime.Legacy = true
	}
	binding.Endpoint = endpoint
	binding.ActorID = actor
	binding.WorkspaceRoots = append(binding.WorkspaceRoots, runtime.WorkspaceRoot)
	binding.ProjectIDs = append(binding.ProjectIDs, runtime.ProjectID)
	if runtime.AgentProfileID != "" {
		binding.AgentProfileIDs = append(binding.AgentProfileIDs, runtime.AgentProfileID)
	}
	binding.Legacy = runtime.Legacy
	storedBinding, _, err := gw.cfg.RemoteStore.EnsureBinding(binding)
	if err != nil {
		return RemoteTaskRecord{}, RemoteRuntime{}, false, err
	}
	spec := RemoteTaskSpec{
		Endpoint:       endpoint,
		ActorID:        actor,
		MessageID:      strings.TrimSpace(msg.MessageID),
		Goal:           strings.TrimSpace(msg.Text),
		WorkspaceRoot:  runtime.WorkspaceRoot,
		ProjectID:      runtime.ProjectID,
		AgentProfileID: runtime.AgentProfileID,
		PermissionMode: capRemotePermission(runtime.PermissionMode, storedBinding.PermissionCeiling),
		Legacy:         runtime.Legacy,
	}
	task, created, err := gw.cfg.RemoteStore.BeginTask(storedBinding.ID, spec)
	return task, runtime, !created, err
}

func (gw *BotGateway) remoteBindingCandidate(msg InboundMessage) (RemoteBinding, RemoteRuntime) {
	actor := RemoteActorFromMessage(msg)
	binding := RemoteBinding{
		Endpoint: RemoteEndpointFromMessage(msg),
		ActorID:  actor,
		Status:   RemoteBindingActive,
		Roles:    []string{"user"},
	}
	var access AccessConfig
	if current, ok := gw.connectionAccess(msg); ok {
		access = current
		binding.WorkspaceRoots = append(binding.WorkspaceRoots, access.WorkspaceRoots...)
		binding.ProjectIDs = append(binding.ProjectIDs, access.ProjectIDs...)
		binding.AgentProfileIDs = append(binding.AgentProfileIDs, access.AgentProfileIDs...)
		binding.PermissionCeiling = access.PermissionCeiling
		binding.RequireHighRiskConfirm = access.RequireHighRiskConfirm
		if containsTrimmed(access.Admins, actor) {
			binding.Roles = append(binding.Roles, "admin", "approver")
		} else if containsTrimmed(access.Approvers, actor) {
			binding.Roles = append(binding.Roles, "approver")
		}
	} else {
		if containsTrimmed(gw.cfg.Allowlist.Admins[msg.Platform], actor) {
			binding.Roles = append(binding.Roles, "admin", "approver")
		} else if containsTrimmed(gw.cfg.Allowlist.Approvers[msg.Platform], actor) {
			binding.Roles = append(binding.Roles, "approver")
		}
	}
	model, workspaceRoot, toolMode := gw.sessionOptionsForMessage(msg)
	_ = model
	runtime := RemoteRuntime{WorkspaceRoot: strings.TrimSpace(workspaceRoot), PermissionMode: normalizeRemotePermission(toolMode)}
	if runtime.PermissionMode == "" {
		runtime.PermissionMode = RemotePermissionAsk
	}
	if mapping, ok := gw.remoteSessionMapping(msg); ok {
		if value := strings.TrimSpace(mapping.WorkspaceRoot); value != "" {
			runtime.WorkspaceRoot = value
		}
		runtime.ProjectID = strings.TrimSpace(mapping.ProjectID)
		runtime.AgentProfileID = strings.TrimSpace(mapping.AgentProfileID)
		if value := normalizeRemotePermission(mapping.PermissionCeiling); value != "" {
			binding.PermissionCeiling = value
		}
		binding.RequireHighRiskConfirm = binding.RequireHighRiskConfirm || mapping.RequireHighRiskConfirm
	}
	if runtime.ProjectID == "" {
		if len(binding.ProjectIDs) == 1 {
			runtime.ProjectID = binding.ProjectIDs[0]
		} else if len(binding.ProjectIDs) == 0 {
			runtime.ProjectID = "inbox"
			runtime.Legacy = true
		}
	}
	if runtime.AgentProfileID == "" && len(binding.AgentProfileIDs) == 1 {
		runtime.AgentProfileID = binding.AgentProfileIDs[0]
	}
	if binding.PermissionCeiling == "" {
		binding.PermissionCeiling = RemotePermissionAsk
	}
	runtime.PermissionMode = capRemotePermission(runtime.PermissionMode, binding.PermissionCeiling)
	return binding, runtime
}

func (gw *BotGateway) remoteSessionMapping(msg InboundMessage) (SessionMapping, bool) {
	gw.mu.Lock()
	conn := gw.cfg.ConnectionChannels[strings.TrimSpace(msg.ConnectionID)]
	platform := gw.cfg.Channels[msg.Platform]
	gw.mu.Unlock()
	if mapping, ok := matchingSessionMapping(conn.SessionMappings, msg); ok {
		return mapping, true
	}
	return matchingSessionMapping(platform.SessionMappings, msg)
}

func normalizeRemoteRuntime(runtime RemoteRuntime) RemoteRuntime {
	runtime.WorkspaceRoot = strings.TrimSpace(runtime.WorkspaceRoot)
	runtime.ProjectID = strings.TrimSpace(runtime.ProjectID)
	runtime.AgentProfileID = strings.TrimSpace(runtime.AgentProfileID)
	runtime.PermissionMode = normalizeRemotePermission(runtime.PermissionMode)
	if runtime.PermissionMode == "" {
		runtime.PermissionMode = RemotePermissionAsk
	}
	return runtime
}

func capRemotePermission(requested, ceiling string) string {
	requested = normalizeRemotePermission(requested)
	ceiling = normalizeRemotePermission(ceiling)
	if requested == "" {
		requested = RemotePermissionAsk
	}
	if ceiling == "" {
		ceiling = RemotePermissionAsk
	}
	if remotePermissionRank(requested) > remotePermissionRank(ceiling) {
		return ceiling
	}
	return requested
}
