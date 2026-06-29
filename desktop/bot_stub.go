//go:build !bot

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"voltui/internal/config"
)

var botStubSessionMappingMu sync.Mutex

type BotConnectionCredentialView struct {
	AppID        string `json:"appId"`
	AppSecretEnv string `json:"appSecretEnv"`
	AccountID    string `json:"accountId"`
	TokenEnv     string `json:"tokenEnv"`
	SecretSet    bool   `json:"secretSet"`
}

type BotConnectionSessionMappingView struct {
	RemoteID      string `json:"remoteId"`
	SessionID     string `json:"sessionId"`
	Scope         string `json:"scope"`
	WorkspaceRoot string `json:"workspaceRoot"`
	UpdatedAt     string `json:"updatedAt"`
}

type BotConnectionView struct {
	ID               string                            `json:"id"`
	Provider         string                            `json:"provider"`
	Domain           string                            `json:"domain"`
	Label            string                            `json:"label"`
	Enabled          bool                              `json:"enabled"`
	Status           string                            `json:"status"`
	Model            string                            `json:"model"`
	ToolApprovalMode string                            `json:"toolApprovalMode"`
	WorkspaceRoot    string                            `json:"workspaceRoot"`
	Credential       BotConnectionCredentialView       `json:"credential"`
	SessionMappings  []BotConnectionSessionMappingView `json:"sessionMappings"`
	LastError        string                            `json:"lastError"`
	CreatedAt        string                            `json:"createdAt"`
	UpdatedAt        string                            `json:"updatedAt"`
}

type BotInstallStartResult struct {
	OK         bool   `json:"ok"`
	Provider   string `json:"provider"`
	Domain     string `json:"domain"`
	InstallID  string `json:"installId"`
	URL        string `json:"url"`
	DeviceCode string `json:"deviceCode"`
	UserCode   string `json:"userCode"`
	Interval   int    `json:"interval"`
	ExpireIn   int    `json:"expireIn"`
	Message    string `json:"message"`
}

type BotInstallPollResult struct {
	Done       bool              `json:"done"`
	Connection BotConnectionView `json:"connection"`
	Status     string            `json:"status"`
	Message    string            `json:"message"`
	Error      string            `json:"error"`
}

type BotConnectionDiagnostic struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Status    string `json:"status"`
	Message   string `json:"message"`
	MessageID string `json:"messageId,omitempty"`
}

type BotRuntimeStatusView struct {
	Running     bool   `json:"running"`
	Status      string `json:"status"`
	Message     string `json:"message"`
	Connections int    `json:"connections"`
	StartedAt   string `json:"startedAt"`
}

type desktopBotRuntime struct{}

type botInstallSession struct{}

func newDesktopBotRuntime() *desktopBotRuntime { return &desktopBotRuntime{} }

func (r *desktopBotRuntime) updateConnectionToolApprovalMode(connID, mode string) bool {
	return false
}

func forgetAutoSessionMappingsForPath(sessionPath string) error {
	target := normalizedBotSessionPath(sessionPath)
	if target == "" {
		return nil
	}
	userPath := config.UserConfigPath()
	if strings.TrimSpace(userPath) == "" {
		return nil
	}
	botStubSessionMappingMu.Lock()
	defer botStubSessionMappingMu.Unlock()

	cfg := config.LoadForEdit(userPath)
	now := time.Now().UTC().Format(time.RFC3339)
	changed := false
	for i := range cfg.Bot.Connections {
		conn := &cfg.Bot.Connections[i]
		next := conn.SessionMappings[:0]
		removed := false
		for _, mapping := range conn.SessionMappings {
			if strings.TrimSpace(mapping.SessionSource) == "auto" && normalizedBotSessionPath(mapping.SessionID) == target {
				removed = true
				continue
			}
			next = append(next, mapping)
		}
		if !removed {
			continue
		}
		conn.SessionMappings = next
		conn.UpdatedAt = now
		changed = true
	}
	if !changed {
		return nil
	}
	return cfg.SaveTo(userPath)
}

func normalizedBotSessionPath(sessionID string) string {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return ""
	}
	if strings.HasPrefix(strings.ToLower(sessionID), "path:") {
		sessionID = strings.TrimSpace(sessionID[5:])
	}
	if sessionID == "" {
		return ""
	}
	if !(strings.HasSuffix(sessionID, ".jsonl") || strings.Contains(sessionID, "/") || strings.Contains(sessionID, `\`) || strings.HasPrefix(sessionID, "~")) {
		return ""
	}
	return filepath.Clean(sessionID)
}

func (a *App) refreshBotRuntimeAsync() {}

func (a *App) refreshBotRuntime() {}

func (a *App) stopBotRuntime() {}

func (a *App) BotRuntimeStatus() BotRuntimeStatusView {
	return BotRuntimeStatusView{Status: "disabled", Message: "bot runtime is not included in this build"}
}

func (a *App) StartBotConnectionInstall(provider, domain string) (BotInstallStartResult, error) {
	provider = strings.TrimSpace(provider)
	domain = strings.TrimSpace(domain)
	return BotInstallStartResult{
		Provider: provider,
		Domain:   domain,
		Message:  "bot runtime is not included in this build",
	}, fmt.Errorf("bot runtime is not included in this build")
}

func (a *App) PollBotConnectionInstall(installID string) (BotInstallPollResult, error) {
	return BotInstallPollResult{
		Status: "disabled",
		Error:  "bot runtime is not included in this build",
	}, nil
}

func (a *App) DiagnoseBotConnection(id string) (BotConnectionDiagnostic, error) {
	return BotConnectionDiagnostic{
		ID:      strings.TrimSpace(id),
		Status:  "disabled",
		Message: "bot runtime is not included in this build",
	}, nil
}

func (a *App) TestBotConnection(id, target string) (BotConnectionDiagnostic, error) {
	return BotConnectionDiagnostic{
		ID:      strings.TrimSpace(id),
		Status:  "disabled",
		Message: "bot runtime is not included in this build",
	}, nil
}

func normalizeBotConnectionToolApprovalMode(mode string) string {
	switch strings.TrimSpace(strings.ToLower(mode)) {
	case "auto", "yolo", "ask":
		return strings.TrimSpace(strings.ToLower(mode))
	default:
		return "ask"
	}
}

func botConnectionRuntimeID(conn config.BotConnectionConfig) string {
	if id := strings.TrimSpace(conn.ID); id != "" {
		return id
	}
	provider := strings.TrimSpace(conn.Provider)
	domain := strings.TrimSpace(conn.Domain)
	if provider == "" {
		return ""
	}
	if domain == "" {
		return provider
	}
	return provider + "-" + domain
}

func botConnectionView(conn config.BotConnectionConfig) BotConnectionView {
	return BotConnectionView{
		ID:               conn.ID,
		Provider:         conn.Provider,
		Domain:           conn.Domain,
		Label:            conn.Label,
		Enabled:          conn.Enabled,
		Status:           conn.Status,
		Model:            conn.Model,
		ToolApprovalMode: normalizeBotConnectionToolApprovalMode(conn.ToolApprovalMode),
		WorkspaceRoot:    conn.WorkspaceRoot,
		Credential: BotConnectionCredentialView{
			AppID:        conn.Credential.AppID,
			AppSecretEnv: conn.Credential.AppSecretEnv,
			AccountID:    conn.Credential.AccountID,
			TokenEnv:     conn.Credential.TokenEnv,
			SecretSet:    botCredentialSecretSet(conn),
		},
		SessionMappings: botSessionMappingViews(conn.SessionMappings, conn.WorkspaceRoot),
		LastError:       conn.LastError,
		CreatedAt:       conn.CreatedAt,
		UpdatedAt:       conn.UpdatedAt,
	}
}

func botCredentialSecretSet(conn config.BotConnectionConfig) bool {
	return envIsSet(conn.Credential.AppSecretEnv) || envIsSet(conn.Credential.TokenEnv)
}

func botConnectionViews(connections []config.BotConnectionConfig) []BotConnectionView {
	if connections == nil {
		return []BotConnectionView{}
	}
	out := make([]BotConnectionView, 0, len(connections))
	for _, conn := range connections {
		out = append(out, botConnectionView(conn))
	}
	return out
}

func botConnectionConfig(view BotConnectionView) config.BotConnectionConfig {
	return config.BotConnectionConfig{
		ID:               strings.TrimSpace(view.ID),
		Provider:         strings.TrimSpace(view.Provider),
		Domain:           strings.TrimSpace(view.Domain),
		Label:            strings.TrimSpace(view.Label),
		Enabled:          view.Enabled,
		Status:           strings.TrimSpace(view.Status),
		Model:            strings.TrimSpace(view.Model),
		ToolApprovalMode: normalizeBotConnectionToolApprovalMode(view.ToolApprovalMode),
		WorkspaceRoot:    strings.TrimSpace(view.WorkspaceRoot),
		Credential: config.BotConnectionCredential{
			AppID:        strings.TrimSpace(view.Credential.AppID),
			AppSecretEnv: strings.TrimSpace(view.Credential.AppSecretEnv),
			AccountID:    strings.TrimSpace(view.Credential.AccountID),
			TokenEnv:     strings.TrimSpace(view.Credential.TokenEnv),
		},
		SessionMappings: botSessionMappingConfigs(view.SessionMappings, view.WorkspaceRoot),
		LastError:       strings.TrimSpace(view.LastError),
		CreatedAt:       strings.TrimSpace(view.CreatedAt),
		UpdatedAt:       strings.TrimSpace(view.UpdatedAt),
	}
}

func botConnectionConfigs(views []BotConnectionView) []config.BotConnectionConfig {
	if views == nil {
		return nil
	}
	out := make([]config.BotConnectionConfig, 0, len(views))
	for _, view := range views {
		cfg := botConnectionConfig(view)
		if cfg.ID == "" || cfg.Provider == "" {
			continue
		}
		out = append(out, cfg)
	}
	return out
}

func botMappingScope(scope, workspaceRoot string) string {
	if strings.TrimSpace(scope) == "project" || strings.TrimSpace(workspaceRoot) != "" {
		return "project"
	}
	return "global"
}

func botMappingWorkspaceRoot(scope, workspaceRoot string) string {
	if botMappingScope(scope, workspaceRoot) != "project" {
		return ""
	}
	return strings.TrimSpace(workspaceRoot)
}

func botSessionMappingViews(mappings []config.BotConnectionSessionMapping, connectionWorkspaceRoot string) []BotConnectionSessionMappingView {
	if mappings == nil {
		return []BotConnectionSessionMappingView{}
	}
	out := make([]BotConnectionSessionMappingView, 0, len(mappings))
	for _, m := range mappings {
		workspaceRoot := firstNonEmptyBot(m.WorkspaceRoot, connectionWorkspaceRoot)
		scope := botMappingScope(m.Scope, workspaceRoot)
		out = append(out, BotConnectionSessionMappingView{
			RemoteID:      m.RemoteID,
			SessionID:     m.SessionID,
			Scope:         scope,
			WorkspaceRoot: botMappingWorkspaceRoot(scope, workspaceRoot),
			UpdatedAt:     m.UpdatedAt,
		})
	}
	return out
}

func botSessionMappingConfigs(mappings []BotConnectionSessionMappingView, connectionWorkspaceRoot string) []config.BotConnectionSessionMapping {
	if mappings == nil {
		return nil
	}
	out := make([]config.BotConnectionSessionMapping, 0, len(mappings))
	for _, m := range mappings {
		workspaceRoot := firstNonEmptyBot(m.WorkspaceRoot, connectionWorkspaceRoot)
		scope := botMappingScope(m.Scope, workspaceRoot)
		out = append(out, config.BotConnectionSessionMapping{
			RemoteID:      strings.TrimSpace(m.RemoteID),
			SessionID:     strings.TrimSpace(m.SessionID),
			Scope:         scope,
			WorkspaceRoot: botMappingWorkspaceRoot(scope, workspaceRoot),
			UpdatedAt:     strings.TrimSpace(m.UpdatedAt),
		})
	}
	return out
}

func envIsSet(name string) bool {
	return strings.TrimSpace(name) != "" && strings.TrimSpace(os.Getenv(name)) != ""
}

func firstNonEmptyBot(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
