package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"voltui/internal/config"
	"voltui/internal/control"
	"voltui/internal/plugin"
	"voltui/internal/scopedmemory"
)

type blockingTrustSession struct {
	control.SessionAPI
	entered chan struct{}
	release chan struct{}
}

func (s *blockingTrustSession) SessionPath() string {
	select {
	case s.entered <- struct{}{}:
	default:
	}
	<-s.release
	return "/tmp/thread.jsonl"
}

func (s *blockingTrustSession) ToolApprovalMode() string { return "ask" }
func (s *blockingTrustSession) Host() *plugin.Host       { return nil }

func TestDataTrustCenterForTabSanitizesDestinationsAndProjectsRealCapabilities(t *testing.T) {
	isolateDesktopUserDirs(t)
	root := t.TempDir()
	t.Setenv("TRUST_MCP_URL", "https://mcp-user:mcp-password@mcp.example.test/rpc?token=mcp-query-secret#fragment")
	t.Setenv("TRUST_MCP_HEADER", "mcp-header-secret")
	if _, err := config.SetCredential("TRUST_PROVIDER_KEY", "provider-key-secret"); err != nil {
		t.Fatal(err)
	}
	if _, err := config.SetCredential("TRUST_BOT_SECRET", "bot-secret-value"); err != nil {
		t.Fatal(err)
	}

	cfg := config.Default()
	cfg.DefaultModel = "external/model-x"
	cfg.Providers = []config.ProviderEntry{
		{
			Name: "local", Kind: "openai", BaseURL: "http://provider-user:provider-password@127.0.0.1:11434/v1?token=provider-query-secret#fragment",
			Model: "model-local", APIKeyEnv: "TRUST_PROVIDER_KEY", Headers: map[string]string{"Authorization": "Bearer provider-header-secret"},
		},
		{Name: "intranet", Kind: "openai", BaseURL: "http://10.12.0.8:8080/v1", Model: "model-intranet"},
		{Name: "external", Kind: "openai", BaseURL: "https://api.example.test/gateway/v1?key=external-query-secret", Model: "model-x", APISurface: "responses"},
	}
	autoStart := false
	cfg.Plugins = []config.PluginEntry{
		{Name: "local-tools", Type: "stdio", Command: "/usr/local/bin/local-mcp", Args: []string{"--token", "stdio-arg-secret"}, Env: map[string]string{"LOCAL_MCP_TOKEN": "stdio-env-secret"}, TrustedReadOnlyTools: []string{"read_status"}},
		{Name: "remote-tools", Type: "http", URL: "${TRUST_MCP_URL}", Headers: map[string]string{"Authorization": "Bearer ${TRUST_MCP_HEADER}"}, AutoStart: &autoStart},
	}
	cfg.Network.ProxyMode = "custom"
	cfg.Network.ProxyURL = "socks5://proxy-user:proxy-secret@127.0.0.1:7890?token=proxy-query-secret"
	cfg.Network.TrustedIntranet.Enabled = true
	cfg.Network.TrustedIntranet.Sites = []config.TrustedIntranetSiteConfig{{Host: "git.corp.internal", CIDRs: []string{"10.0.0.0/8"}, Ports: []int{443}}}
	cfg.Sandbox.Network = true
	cfg.Bot.Enabled = true
	cfg.Bot.Allowlist.Enabled = true
	cfg.Bot.Allowlist.AllowAll = true
	cfg.Bot.Allowlist.FeishuUsers = []string{"user-id-must-not-leak"}
	cfg.Bot.Control = config.BotControlConfig{Enabled: true, Addr: "127.0.0.1:39001", TokenEnv: "TRUST_BOT_SECRET"}
	cfg.Bot.Connections = []config.BotConnectionConfig{{
		ID: "team-chat", Provider: "feishu", Domain: "lark", Label: "Team chat", Enabled: true, Status: "connected",
		ToolApprovalMode: "auto", WorkspaceRoot: root,
		Access:     config.BotAccessConfig{Enabled: true, AllowAll: true, Users: []string{"connection-user-must-not-leak"}},
		Credential: config.BotConnectionCredential{AppID: "public-app-id", AppSecretEnv: "TRUST_BOT_SECRET"},
		SessionMappings: []config.BotConnectionSessionMapping{{
			RemoteID: "remote-id-must-not-leak", SessionID: "session-id-must-not-leak", UserID: "mapping-user-must-not-leak",
			ThreadID: "remote-thread-must-not-leak", WorkspaceRoot: root, Scope: "project",
		}},
	}}
	if err := cfg.SaveTo(config.UserConfigPath()); err != nil {
		t.Fatal(err)
	}

	sessionPath := filepath.Join(config.ProjectSessionDir(root), "thread.jsonl")
	if err := os.MkdirAll(filepath.Dir(sessionPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(sessionPath, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	app := NewApp()
	tab := &WorkspaceTab{
		ID: "trust-tab", Scope: "project", WorkspaceRoot: root, TopicID: "topic-1", TopicTitle: "Release",
		SessionPath: sessionPath, model: "external/model-x", toolApprovalMode: "auto",
		MemoryContext: scopedmemory.Context{OrganizationID: "org-1", WorkspaceID: "workspace-1", ProjectID: "project-1", ThreadID: "thread-1"},
		MemoryScopes:  []string{"user", "project", "thread"}, MemorySourceIDs: []string{"mem-user", "mem-project"}, MemoryUpdatedAt: "2026-07-13T01:02:03Z",
		disabledMCP: map[string]ServerView{},
	}
	app.tabs = map[string]*WorkspaceTab{tab.ID: tab}
	app.tabOrder = []string{tab.ID}
	app.activeTabID = tab.ID

	view, err := app.DataTrustCenterForTab(tab.ID)
	if err != nil {
		t.Fatal(err)
	}
	if view.Context.TabID != tab.ID || view.Context.ProjectID != "project-1" || view.Context.ThreadID != "thread-1" {
		t.Fatalf("context = %+v", view.Context)
	}
	if !slices.Equal(view.Context.MemoryScopes, tab.MemoryScopes) || !slices.Equal(view.Context.MemorySourceIDs, tab.MemorySourceIDs) || view.Context.MemoryUpdatedAt != tab.MemoryUpdatedAt {
		t.Fatalf("memory audit = %+v", view.Context)
	}

	local := trustFlowByID(t, view.Providers, "provider:local")
	if local.Destinations[0].URL != "http://127.0.0.1:11434/v1/chat/completions" || local.Destinations[0].Classification != "local" {
		t.Fatalf("local destination = %+v", local.Destinations)
	}
	if local.Credential.Env != "TRUST_PROVIDER_KEY" || !local.Credential.Set {
		t.Fatalf("credential = %+v", local.Credential)
	}
	intranet := trustFlowByID(t, view.Providers, "provider:intranet")
	if intranet.Destinations[0].Classification != "intranet" {
		t.Fatalf("intranet destination = %+v", intranet.Destinations)
	}
	external := trustFlowByID(t, view.Providers, "provider:external")
	if external.Status != TrustStatusActive || external.APISurface != "responses" || external.Destinations[0].URL != "https://api.example.test/gateway/v1/responses" || external.Destinations[0].Classification != "external" {
		t.Fatalf("external provider = %+v", external)
	}

	stdio := trustFlowByID(t, view.Network, "mcp:local-tools")
	if stdio.Transport != "stdio" || stdio.Classification != "local" || stdio.Runtime != "local subprocess" || stdio.TrustedReadOnlyTools != 1 {
		t.Fatalf("stdio MCP = %+v", stdio)
	}
	remote := trustFlowByID(t, view.Network, "mcp:remote-tools")
	if remote.Transport != "http" || remote.Classification != "external" || remote.AutoStart || remote.Destinations[0].URL != "https://mcp.example.test/rpc" {
		t.Fatalf("remote MCP = %+v", remote)
	}
	if !hasTrustWarning(view.Warnings, "remote-mcp") || !hasTrustWarning(view.Warnings, "bot-allow-all") || !hasTrustWarning(view.Warnings, "bot-role-unconfigured") || !hasTrustWarning(view.Warnings, "sandbox-network") || !hasTrustWarning(view.Warnings, "telemetry") {
		t.Fatalf("warnings = %+v", view.Warnings)
	}
	if !view.EnterpriseIM.Enabled || len(view.EnterpriseIM.Connections) != 1 || view.EnterpriseIM.Connections[0].UserCount != 1 || view.EnterpriseIM.Connections[0].MappingCount != 1 || view.EnterpriseIM.Control.TokenEnv != "TRUST_BOT_SECRET" || !view.EnterpriseIM.Control.TokenSet {
		t.Fatalf("enterprise IM = %+v", view.EnterpriseIM)
	}

	raw, err := json.Marshal(view)
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)
	for _, forbidden := range []string{
		"provider-key-secret", "provider-password", "provider-query-secret", "provider-header-secret", "external-query-secret",
		"mcp-password", "mcp-query-secret", "mcp-header-secret", "stdio-arg-secret", "stdio-env-secret",
		"proxy-secret", "proxy-query-secret", "bot-secret-value",
		"user-id-must-not-leak", "connection-user-must-not-leak", "mapping-user-must-not-leak", "remote-id-must-not-leak", "session-id-must-not-leak", "remote-thread-must-not-leak",
	} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("trust center leaked %q in %s", forbidden, text)
		}
	}
}

func TestDataTrustCenterForTabIncludesStoragePolicyDiagnosticsAndFileEgress(t *testing.T) {
	isolateDesktopUserDirs(t)
	root := t.TempDir()
	cfg := config.Default()
	cfg.DefaultModel = "vision/model-v"
	cfg.Providers = []config.ProviderEntry{{Name: "vision", Kind: "openai", BaseURL: "https://vision.example.test/v1", Model: "model-v", Vision: true}}
	cfg.Plugins = []config.PluginEntry{{Name: "local-only", Type: "stdio", Command: "local-helper"}}
	cfg.Sandbox.WorkspaceRoot = root
	cfg.Sandbox.AllowWrite = []string{filepath.Join(root, "generated")}
	cfg.Sandbox.ForbidRead = []string{"private"}
	cfg.Secrets.FilterSubprocessEnv = true
	cfg.Secrets.ProtectSensitiveFiles = true
	cfg.Permissions.Mode = "deny"
	cfg.Permissions.Allow = []string{"read_file"}
	cfg.Permissions.Ask = []string{"bash"}
	cfg.Permissions.Deny = []string{"write_file"}
	cfg.Desktop.Telemetry = trustBoolPtr(false)
	cfg.Desktop.Metrics = trustBoolPtr(false)
	cfg.Desktop.CheckUpdates = trustBoolPtr(false)
	if err := cfg.SaveTo(config.UserConfigPath()); err != nil {
		t.Fatal(err)
	}

	app := NewApp()
	tab := &WorkspaceTab{
		ID: "policy-tab", Scope: "project", WorkspaceRoot: root, model: "vision/model-v", toolApprovalMode: "yolo",
		MemoryContext: scopedmemory.Context{OrganizationID: "org", WorkspaceID: "workspace", ProjectID: "project", ThreadID: "thread"},
		disabledMCP:   map[string]ServerView{},
	}
	app.tabs = map[string]*WorkspaceTab{tab.ID: tab}
	app.tabOrder = []string{tab.ID}
	app.activeTabID = tab.ID

	view, err := app.DataTrustCenter()
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"config:user", "config:project", "session:directory", "memory:legacy-project", "memory:legacy-user", "memory:scoped", "knowledge:database", "workbench:data", "diagnostics:metrics-pending", "diagnostics:crash-pending"} {
		location := trustLocationByID(t, view.Storage, id)
		if strings.TrimSpace(location.Path) == "" || strings.TrimSpace(location.Retention) == "" {
			t.Fatalf("storage %s = %+v", id, location)
		}
	}
	if view.Policy.SandboxMode == "" || view.Policy.SandboxNetwork != cfg.Sandbox.Network || !slices.Equal(view.Policy.WriteRoots, []string{root, filepath.Join(root, "generated")}) || !slices.Equal(view.Policy.ForbidReadRoots, []string{filepath.Join(root, "private")}) {
		t.Fatalf("sandbox policy = %+v", view.Policy)
	}
	if !view.Policy.RedactToolOutput || !view.Policy.FilterSubprocessEnv || !view.Policy.ProtectSensitiveFiles || view.Policy.DefaultPermission != "deny" || view.Policy.RuntimeToolApproval != "yolo" {
		t.Fatalf("security policy = %+v", view.Policy)
	}
	if trustFlowByID(t, view.Diagnostics, "diagnostic:telemetry").Status != TrustStatusDisabled || trustFlowByID(t, view.Diagnostics, "diagnostic:metrics").Status != TrustStatusDisabled || trustFlowByID(t, view.Diagnostics, "diagnostic:update").Status != TrustStatusDisabled {
		t.Fatalf("diagnostics = %+v", view.Diagnostics)
	}
	vision := trustFlowByID(t, view.FileEgress, "egress:model-vision")
	if vision.Status != TrustStatusPossible || !slices.Contains(vision.DataCategories, "用户选择的图片附件") {
		t.Fatalf("vision egress = %+v", vision)
	}
	browser := trustFlowByID(t, view.FileEgress, "egress:browser-upload")
	if browser.Status != TrustStatusDisabled || !strings.Contains(browser.Detail, "browserControl") || strings.Contains(browser.Detail, "browser_control") {
		t.Fatalf("browser upload must reflect current missing upload action: %+v", browser)
	}
	if mcp := trustFlowByID(t, view.FileEgress, "egress:mcp-tools"); mcp.Status != TrustStatusDisabled || mcp.Name != "MCP 或工具联网" || strings.Contains(mcp.Detail, "MCP/") || strings.Contains(mcp.Direction, "/") {
		t.Fatalf("local stdio MCP alone must not be represented as file egress: %+v", mcp)
	}
}

func TestDataTrustCenterHandlesUnknownDestinationAndMissingTabs(t *testing.T) {
	destination := sanitizeTrustDestination("::::not-a-url", "")
	if destination.Classification != "unknown" || destination.URL != "" {
		t.Fatalf("unknown destination = %+v", destination)
	}
	if got := sanitizeTrustDestination("http://service.internal:8080/api?token=secret", ""); got.Classification != "intranet" || got.URL != "http://service.internal:8080/api" {
		t.Fatalf("internal destination = %+v", got)
	}

	app := NewApp()
	if _, err := app.DataTrustCenter(); err == nil || !strings.Contains(err.Error(), "active tab") {
		t.Fatalf("nil active tab error = %v", err)
	}
	if _, err := app.DataTrustCenterForTab("missing"); err == nil || !strings.Contains(err.Error(), "not found") {
		t.Fatalf("invalid tab error = %v", err)
	}
}

func TestTrustCenterTabSnapshotDoesNotHoldAppLockAcrossControllerCalls(t *testing.T) {
	ctrl := &blockingTrustSession{entered: make(chan struct{}, 1), release: make(chan struct{})}
	app := NewApp()
	app.tabs = map[string]*WorkspaceTab{"tab": {ID: "tab", Ctrl: ctrl, disabledMCP: map[string]ServerView{}}}
	app.activeTabID = "tab"

	done := make(chan error, 1)
	go func() {
		_, err := app.trustCenterTabSnapshot("tab")
		done <- err
	}()
	select {
	case <-ctrl.entered:
	case <-time.After(time.Second):
		close(ctrl.release)
		t.Fatal("controller snapshot read did not start")
	}

	locked := make(chan struct{})
	go func() {
		app.mu.Lock()
		close(locked)
		app.mu.Unlock()
	}()
	select {
	case <-locked:
		close(ctrl.release)
	case <-time.After(300 * time.Millisecond):
		close(ctrl.release)
		t.Fatal("app write lock was blocked by a controller call under app read lock")
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

func TestTrustIMConnectionNeverInfersPerConnectionActiveFromGlobalRuntime(t *testing.T) {
	connections := []config.BotConnectionConfig{
		{ID: "live", Provider: "feishu", Enabled: true, Status: "connected"},
		{ID: "stale", Provider: "weixin", Enabled: true, Status: "connected"},
	}
	for _, connection := range connections {
		view := trustIMConnection(connection, "ask")
		if view.Status == TrustStatusActive {
			t.Fatalf("connection %q was inferred active from global runtime and persisted status: %+v", connection.ID, view)
		}
		if view.Status != TrustStatusConfigured {
			t.Fatalf("connection %q status = %q, want configured without per-connection evidence", connection.ID, view.Status)
		}
	}
}

func TestTrustControlServerAllInterfacesIsExposed(t *testing.T) {
	for _, address := range []string{"0.0.0.0:39001", "[::]:39001"} {
		destination := sanitizeControlServerAddress(address)
		if destination.Classification != "all-interfaces" {
			t.Fatalf("control server %q classification = %q, want all-interfaces", address, destination.Classification)
		}
	}
	if got := sanitizeControlServerAddress("127.0.0.1:39001"); got.Classification != "local" {
		t.Fatalf("loopback control server classification = %q", got.Classification)
	}
}

func TestSanitizeTrustDestinationRedactsCredentialLikePathSegments(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want string
	}{
		{name: "hook id", raw: "https://hooks.example.test/hooks/AbC1234567890", want: "https://hooks.example.test/hooks/_redacted_"},
		{name: "nested webhook token", raw: "https://mcp.example.test/webhook/token/value-123", want: "https://mcp.example.test/webhook/_redacted_/_redacted_"},
		{name: "key value", raw: "https://api.example.test/v1/key/client-key-value", want: "https://api.example.test/v1/key/_redacted_"},
		{name: "secret prefix", raw: "https://api.example.test/v1/secret-live-123", want: "https://api.example.test/v1/_redacted_"},
		{name: "long random", raw: "https://mcp.example.test/rpc/a8F4d9K2m7Q1z6X3c5V0b2N8", want: "https://mcp.example.test/rpc/_redacted_"},
		{name: "public chat api", raw: "https://api.example.test/v1/chat/completions", want: "https://api.example.test/v1/chat/completions"},
		{name: "public responses api", raw: "https://api.example.test/gateway/v1/responses", want: "https://api.example.test/gateway/v1/responses"},
		{name: "public rpc", raw: "https://mcp.example.test/rpc", want: "https://mcp.example.test/rpc"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := sanitizeTrustDestination(tt.raw, "").URL; got != tt.want {
				t.Fatalf("sanitized URL = %q, want %q", got, tt.want)
			}
		})
	}
}

func trustFlowByID(t *testing.T, flows []TrustFlow, id string) TrustFlow {
	t.Helper()
	for _, flow := range flows {
		if flow.ID == id {
			return flow
		}
	}
	t.Fatalf("trust flow %q not found in %+v", id, flows)
	return TrustFlow{}
}

func trustLocationByID(t *testing.T, locations []TrustLocation, id string) TrustLocation {
	t.Helper()
	for _, location := range locations {
		if location.ID == id {
			return location
		}
	}
	t.Fatalf("trust location %q not found in %+v", id, locations)
	return TrustLocation{}
}

func hasTrustWarning(warnings []TrustWarning, id string) bool {
	return slices.ContainsFunc(warnings, func(warning TrustWarning) bool { return warning.ID == id })
}

func trustBoolPtr(value bool) *bool { return &value }
