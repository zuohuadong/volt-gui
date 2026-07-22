package main

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"voltui/internal/builtinmcp"
	"voltui/internal/config"
	"voltui/internal/memory"
	"voltui/internal/scopedmemory"
)

type TrustStatus string

const (
	TrustStatusConfigured TrustStatus = "configured"
	TrustStatusActive     TrustStatus = "active"
	TrustStatusDisabled   TrustStatus = "disabled"
	TrustStatusPossible   TrustStatus = "possible"
	TrustStatusUnknown    TrustStatus = "unknown"
)

type TrustCredentialRef struct {
	Env string `json:"env,omitempty"`
	Set bool   `json:"set"`
}

type TrustDestination struct {
	URL            string `json:"url,omitempty"`
	Scheme         string `json:"scheme,omitempty"`
	Host           string `json:"host,omitempty"`
	Path           string `json:"path,omitempty"`
	Classification string `json:"classification"`
}

type TrustFlow struct {
	ID                   string             `json:"id"`
	Category             string             `json:"category"`
	Name                 string             `json:"name"`
	Status               TrustStatus        `json:"status"`
	Direction            string             `json:"direction,omitempty"`
	Detail               string             `json:"detail,omitempty"`
	Provider             string             `json:"provider,omitempty"`
	Models               []string           `json:"models,omitempty"`
	APISurface           string             `json:"apiSurface,omitempty"`
	Credential           TrustCredentialRef `json:"credential"`
	Destinations         []TrustDestination `json:"destinations"`
	Classification       string             `json:"classification,omitempty"`
	Transport            string             `json:"transport,omitempty"`
	Runtime              string             `json:"runtime,omitempty"`
	AutoStart            bool               `json:"autoStart,omitempty"`
	TrustedReadOnlyTools int                `json:"trustedReadOnlyTools,omitempty"`
	DataCategories       []string           `json:"dataCategories"`
}

type TrustLocation struct {
	ID        string      `json:"id"`
	Name      string      `json:"name"`
	Path      string      `json:"path,omitempty"`
	Scope     string      `json:"scope"`
	Retention string      `json:"retention"`
	Status    TrustStatus `json:"status"`
	Exists    bool        `json:"exists"`
	Sensitive bool        `json:"sensitive,omitempty"`
}

type TrustWarning struct {
	ID       string `json:"id"`
	Severity string `json:"severity"`
	Title    string `json:"title"`
	Detail   string `json:"detail"`
}

type TrustContextView struct {
	TabID             string   `json:"tabId"`
	Scope             string   `json:"scope"`
	WorkspaceRoot     string   `json:"workspaceRoot,omitempty"`
	WorkspaceID       string   `json:"workspaceId,omitempty"`
	ProjectID         string   `json:"projectId,omitempty"`
	ThreadID          string   `json:"threadId,omitempty"`
	OrganizationID    string   `json:"organizationId,omitempty"`
	TopicID           string   `json:"topicId,omitempty"`
	SessionPath       string   `json:"sessionPath,omitempty"`
	AgentProfileID    string   `json:"agentProfileId,omitempty"`
	MemoryScopes      []string `json:"memoryScopes"`
	MemorySourceIDs   []string `json:"memorySourceIds"`
	MemoryUpdatedAt   string   `json:"memoryUpdatedAt,omitempty"`
	RuntimeModel      string   `json:"runtimeModel,omitempty"`
	RuntimePermission string   `json:"runtimePermission"`
}

type TrustPolicyView struct {
	SandboxMode           string   `json:"sandboxMode"`
	SandboxNetwork        bool     `json:"sandboxNetwork"`
	WriteRoots            []string `json:"writeRoots"`
	ForbidReadRoots       []string `json:"forbidReadRoots"`
	RedactToolOutput      bool     `json:"redactToolOutput"`
	FilterSubprocessEnv   bool     `json:"filterSubprocessEnv"`
	ProtectSensitiveFiles bool     `json:"protectSensitiveFiles"`
	DefaultPermission     string   `json:"defaultPermission"`
	RuntimeToolApproval   string   `json:"runtimeToolApproval"`
	AllowRuleCount        int      `json:"allowRuleCount"`
	AskRuleCount          int      `json:"askRuleCount"`
	DenyRuleCount         int      `json:"denyRuleCount"`
}

type TrustControlServerView struct {
	Enabled  bool             `json:"enabled"`
	Address  string           `json:"address,omitempty"`
	TokenEnv string           `json:"tokenEnv,omitempty"`
	TokenSet bool             `json:"tokenSet"`
	Status   TrustStatus      `json:"status"`
	Target   TrustDestination `json:"target"`
}

type TrustIMConnectionView struct {
	ID               string               `json:"id"`
	Platform         string               `json:"platform"`
	Domain           string               `json:"domain,omitempty"`
	Status           TrustStatus          `json:"status"`
	ConfiguredStatus string               `json:"configuredStatus,omitempty"`
	WorkspaceRoots   []string             `json:"workspaceRoots"`
	MappingCount     int                  `json:"mappingCount"`
	UserCount        int                  `json:"userCount"`
	GroupCount       int                  `json:"groupCount"`
	ApproverCount    int                  `json:"approverCount"`
	AdminCount       int                  `json:"adminCount"`
	AllowAll         bool                 `json:"allowAll"`
	PairingEnabled   bool                 `json:"pairingEnabled"`
	ToolApprovalMode string               `json:"toolApprovalMode"`
	Credentials      []TrustCredentialRef `json:"credentials"`
	MessagePath      string               `json:"messagePath"`
}

type TrustEnterpriseIMView struct {
	Enabled            bool                    `json:"enabled"`
	Status             TrustStatus             `json:"status"`
	RuntimeStatus      string                  `json:"runtimeStatus"`
	RuntimeConnections int                     `json:"runtimeConnections"`
	AllowAll           bool                    `json:"allowAll"`
	PairingEnabled     bool                    `json:"pairingEnabled"`
	UserCount          int                     `json:"userCount"`
	GroupCount         int                     `json:"groupCount"`
	ApproverCount      int                     `json:"approverCount"`
	AdminCount         int                     `json:"adminCount"`
	ToolApprovalMode   string                  `json:"toolApprovalMode"`
	Control            TrustControlServerView  `json:"control"`
	Connections        []TrustIMConnectionView `json:"connections"`
	MessagePath        string                  `json:"messagePath"`
}

type TrustCenterView struct {
	GeneratedAt  string                `json:"generatedAt"`
	Context      TrustContextView      `json:"context"`
	Providers    []TrustFlow           `json:"providers"`
	Storage      []TrustLocation       `json:"storage"`
	Network      []TrustFlow           `json:"network"`
	EnterpriseIM TrustEnterpriseIMView `json:"enterpriseIm"`
	FileEgress   []TrustFlow           `json:"fileEgress"`
	Diagnostics  []TrustFlow           `json:"diagnostics"`
	Policy       TrustPolicyView       `json:"policy"`
	Warnings     []TrustWarning        `json:"warnings"`
}

type trustTabSnapshot struct {
	ID               string
	Scope            string
	WorkspaceRoot    string
	TopicID          string
	SessionPath      string
	AgentProfileID   string
	MemoryContext    scopedmemory.Context
	MemoryScopes     []string
	MemorySourceIDs  []string
	MemoryUpdatedAt  string
	Model            string
	ToolApprovalMode string
	ConnectedMCP     map[string]bool
	FailedMCP        map[string]bool
}

func (a *App) DataTrustCenter() (TrustCenterView, error) {
	return a.DataTrustCenterForTab("")
}

func (a *App) DataTrustCenterForTab(tabID string) (TrustCenterView, error) {
	snap, err := a.trustCenterTabSnapshot(tabID)
	if err != nil {
		return emptyTrustCenterView(), err
	}
	cfg, err := config.LoadForRoot(snap.WorkspaceRoot)
	if err != nil {
		return emptyTrustCenterView(), fmt.Errorf("load trust center config: %w", err)
	}
	if cfg == nil {
		cfg = config.Default()
	}
	return a.buildTrustCenterView(snap, cfg), nil
}

func emptyTrustCenterView() TrustCenterView {
	return TrustCenterView{
		Providers: []TrustFlow{}, Storage: []TrustLocation{}, Network: []TrustFlow{},
		EnterpriseIM: TrustEnterpriseIMView{Connections: []TrustIMConnectionView{}},
		FileEgress:   []TrustFlow{}, Diagnostics: []TrustFlow{}, Warnings: []TrustWarning{},
	}
}

func (a *App) trustCenterTabSnapshot(tabID string) (trustTabSnapshot, error) {
	a.mu.RLock()
	id := strings.TrimSpace(tabID)
	if id == "" {
		id = strings.TrimSpace(a.activeTabID)
		if id == "" {
			a.mu.RUnlock()
			return trustTabSnapshot{}, fmt.Errorf("no active tab")
		}
	}
	tab := a.tabs[id]
	if tab == nil {
		a.mu.RUnlock()
		return trustTabSnapshot{}, fmt.Errorf("tab %q not found", id)
	}
	ctrl := tab.Ctrl
	snap := trustTabSnapshot{
		ID: tab.ID, Scope: tab.Scope, WorkspaceRoot: strings.TrimSpace(tab.WorkspaceRoot), TopicID: tab.TopicID,
		SessionPath: strings.TrimSpace(tab.SessionPath), AgentProfileID: tab.AgentProfileID,
		MemoryContext: tab.MemoryContext, MemoryScopes: append([]string(nil), tab.MemoryScopes...), MemorySourceIDs: append([]string(nil), tab.MemorySourceIDs...),
		MemoryUpdatedAt: tab.MemoryUpdatedAt, Model: strings.TrimSpace(tab.model), ToolApprovalMode: normalizeToolApprovalMode(tab.toolApprovalMode),
	}
	a.mu.RUnlock()

	connected := map[string]bool{}
	failed := map[string]bool{}
	if ctrl != nil {
		if path := strings.TrimSpace(ctrl.SessionPath()); path != "" {
			snap.SessionPath = path
		}
		snap.ToolApprovalMode = normalizeToolApprovalMode(ctrl.ToolApprovalMode())
		if host := ctrl.Host(); host != nil {
			for _, server := range host.Servers() {
				connected[strings.TrimSpace(server.Name)] = true
			}
			for _, failure := range host.Failures() {
				failed[strings.TrimSpace(failure.Name)] = true
			}
		}
	}
	snap.ConnectedMCP = connected
	snap.FailedMCP = failed
	return snap, nil
}

func (a *App) buildTrustCenterView(snap trustTabSnapshot, cfg *config.Config) TrustCenterView {
	ctx := defaultScopedMemoryContext(snap.MemoryContext, snap.WorkspaceRoot, snap.TopicID, snap.SessionPath, snap.ID)
	view := emptyTrustCenterView()
	view.GeneratedAt = time.Now().UTC().Format(time.RFC3339Nano)
	view.Context = TrustContextView{
		TabID: snap.ID, Scope: snap.Scope, WorkspaceRoot: snap.WorkspaceRoot,
		OrganizationID: ctx.OrganizationID, WorkspaceID: ctx.WorkspaceID, ProjectID: ctx.ProjectID, ThreadID: ctx.ThreadID,
		TopicID: snap.TopicID, SessionPath: snap.SessionPath,
		AgentProfileID: snap.AgentProfileID,
		MemoryScopes:   nonNilStrings(snap.MemoryScopes), MemorySourceIDs: nonNilStrings(snap.MemorySourceIDs),
		MemoryUpdatedAt: snap.MemoryUpdatedAt, RuntimeModel: snap.Model, RuntimePermission: snap.ToolApprovalMode,
	}
	view.Providers = normalizeTrustFlows(trustProviderFlows(cfg, snap.Model))
	view.Storage = trustStorageLocations(snap)
	view.Network = normalizeTrustFlows(trustNetworkFlows(cfg, snap))
	view.EnterpriseIM = a.trustEnterpriseIMView(cfg)
	view.FileEgress = normalizeTrustFlows(trustFileEgressFlows(cfg, snap.Model, view.EnterpriseIM))
	view.Diagnostics = normalizeTrustFlows(trustDiagnosticFlows(cfg))
	view.Policy = trustPolicyView(cfg, snap)
	view.Warnings = trustWarnings(cfg, snap, view.Network, view.EnterpriseIM)
	return view
}

func trustProviderFlows(cfg *config.Config, activeModel string) []TrustFlow {
	if cfg == nil {
		return []TrustFlow{}
	}
	activeModel = strings.TrimSpace(activeModel)
	if activeModel == "" {
		activeModel = strings.TrimSpace(cfg.DefaultModel)
	}
	out := make([]TrustFlow, 0, len(cfg.Providers))
	for i := range cfg.Providers {
		entry := &cfg.Providers[i]
		name := strings.TrimSpace(entry.Name)
		if name == "" {
			name = fmt.Sprintf("provider-%d", i+1)
		}
		destination := trustProviderDestination(entry)
		status := TrustStatusConfigured
		if !entry.Configured() {
			status = TrustStatusUnknown
		}
		if trustModelUsesProvider(activeModel, name) && entry.Configured() {
			status = TrustStatusActive
		}
		out = append(out, TrustFlow{
			ID: "provider:" + name, Category: "provider", Name: name, Status: status, Direction: "本机 -> 模型服务",
			Provider: name, Models: nonNilStrings(entry.ModelList()), APISurface: trustProviderAPISurface(entry),
			Credential:   TrustCredentialRef{Env: strings.TrimSpace(entry.APIKeyEnv), Set: entry.APIKey() != ""},
			Destinations: []TrustDestination{destination}, Classification: destination.Classification,
			DataCategories: []string{"系统提示词", "对话消息", "工具结果摘要", "所选模型参数"},
			Detail:         "显示配置后的实际请求目标；凭据值、请求头值、URL 查询参数和 userinfo 均已移除。",
		})
	}
	return out
}

func trustProviderAPISurface(entry *config.ProviderEntry) string {
	if entry == nil {
		return "unknown"
	}
	if strings.EqualFold(strings.TrimSpace(entry.Kind), "anthropic") {
		return "messages"
	}
	return config.EffectiveAPISurface(entry)
}

func trustProviderDestination(entry *config.ProviderEntry) TrustDestination {
	if entry == nil {
		return TrustDestination{Classification: "unknown"}
	}
	base := sanitizeTrustDestination(entry.BaseURL, "").URL
	if strings.EqualFold(strings.TrimSpace(entry.Kind), "anthropic") {
		base = strings.TrimSuffix(strings.TrimRight(base, "/"), "/v1")
		return sanitizeTrustDestination(base, "/v1/messages")
	}
	if config.EffectiveAPISurface(entry) == config.APISurfaceResponses {
		if strings.TrimSpace(entry.ResponsesURL) != "" {
			return sanitizeTrustDestination(entry.ResponsesURL, "")
		}
		return sanitizeTrustDestination(base, "/responses")
	}
	if strings.TrimSpace(entry.ChatURL) != "" {
		return sanitizeTrustDestination(entry.ChatURL, "")
	}
	return sanitizeTrustDestination(base, "/chat/completions")
}

func trustModelUsesProvider(modelRef, providerName string) bool {
	provider, _, ok := strings.Cut(strings.TrimSpace(modelRef), "/")
	if ok {
		return strings.EqualFold(strings.TrimSpace(provider), strings.TrimSpace(providerName))
	}
	return strings.EqualFold(strings.TrimSpace(modelRef), strings.TrimSpace(providerName))
}

func trustStorageLocations(snap trustTabSnapshot) []TrustLocation {
	root := strings.TrimSpace(snap.WorkspaceRoot)
	legacy := memory.StoreFor(config.MemoryUserDir(), root)
	scopedPath := ""
	if store, err := scopedmemory.Open(config.MemoryUserDir()); err == nil {
		scopedPath = store.Path()
	}
	knowledgePath, _ := knowledgeDatabasePath()
	workbenchPath, _ := workbenchDataPath()
	projectsPath, _ := workbenchProjectsPath()
	todosDataPath, _ := todosPath()
	automationsDataPath, _ := automationsPath()
	agentsDataPath, _ := agentsPath()
	materialsPath, _ := projectMaterialsPath()
	locations := []TrustLocation{
		trustLocation("config:user", "用户配置", config.UserConfigPath(), "user", "保留到用户删除或覆盖配置", false),
		trustLocation("config:project", "项目配置", projectConfigPathForRoot(root), "workspace", "随工作区文件保留", false),
		trustLocation("credentials:provider", "凭据存储", config.UserCredentialsPath(), "user", "保留到用户移除对应环境变量凭据", true),
		trustLocation("session:directory", "会话目录", desktopSessionDir(root), "workspace", "会话 JSONL 与审计侧车保留到删除/清理", true),
		trustLocation("session:active", "当前会话", snap.SessionPath, "thread", "随当前 Thread 保留到删除/清理", true),
		trustLocation("memory:legacy-project", "项目旧版记忆", legacy.Dir, "workspace", "Markdown 事实保留到遗忘或归档", true),
		trustLocation("memory:legacy-user", "用户旧版记忆", legacy.GlobalDir, "user", "跨项目保留到遗忘或归档", true),
		trustLocation("memory:scoped", "分层记忆", scopedPath, "user/organization/workspace/project/thread", "条目保留到删除；删除项进入可审计归档", true),
		trustLocation("knowledge:database", "知识库", knowledgePath, "user", "文档、分块和索引保留到知识库删除", true),
		trustLocation("workbench:data", "工作台数据", workbenchPath, "user", "业务对象保留到用户编辑或删除", true),
		trustLocation("workbench:projects", "业务项目", projectsPath, "user", "保留到用户删除", true),
		trustLocation("workbench:todos", "工作台待办", todosDataPath, "user", "保留到用户删除", true),
		trustLocation("workbench:automations", "自动化", automationsDataPath, "user", "保留到用户删除", true),
		trustLocation("workbench:agents", "Agent 配置", agentsDataPath, "user", "保留到用户删除", true),
		trustLocation("workbench:materials", "项目资料索引", materialsPath, "user", "索引保留到资料删除；原文件按其本地位置保留", true),
		trustLocation("workbench:runtime", "项目工作台任务与产物", filepath.Join(root, ".voltui", "workbench"), "workspace", "任务记录和产物保留到工作区清理", true),
		trustLocation("desktop:tabs", "桌面 Thread 索引", filepath.Join(desktopConfigDir(), tabsFileName), "user", "保留打开 Thread 与恢复指针", true),
		trustLocation("desktop:projects", "桌面工作区索引", filepath.Join(desktopConfigDir(), desktopProjectsFile), "user", "保留工作区与 Topic 索引", true),
		trustLocation("desktop:workbench-state", "桌面任务侧栏索引", desktopWorkbenchStatePath(), "user", "只保留任务导航元数据；会话正文仍在 session JSONL", true),
		trustLocation("diagnostics:metrics-pending", "待发送聚合指标", filepath.Join(config.MemoryUserDir(), metricsPendingFile), "user", "下一次成功发送后清除；关闭指标后不发送", true),
		trustLocation("diagnostics:crash-pending", "待发送崩溃报告", pendingCrashPath(), "user", "下一次启动按遥测设置发送或清除", true),
	}
	return locations
}

func trustLocation(id, name, path, scope, retention string, sensitive bool) TrustLocation {
	path = strings.TrimSpace(path)
	exists := false
	status := TrustStatusUnknown
	if path != "" {
		status = TrustStatusConfigured
		if _, err := os.Stat(path); err == nil {
			exists = true
			status = TrustStatusActive
		}
	}
	return TrustLocation{ID: id, Name: name, Path: path, Scope: scope, Retention: retention, Status: status, Exists: exists, Sensitive: sensitive}
}

func trustNetworkFlows(cfg *config.Config, snap trustTabSnapshot) []TrustFlow {
	if cfg == nil {
		return []TrustFlow{}
	}
	flows := make([]TrustFlow, 0, len(cfg.Plugins)+8)
	entries := builtinmcp.AppendDefaultEnabled(nil, cfg.Plugins)
	entries = append(entries, cfg.Plugins...)
	for _, entry := range entries {
		name := strings.TrimSpace(entry.Name)
		if name == "" {
			continue
		}
		expanded := entry.ExpandedPlugin()
		transport := normalizeTrustMCPTransport(expanded.Type)
		classification := "local"
		destinations := []TrustDestination{}
		runtimeName := ""
		if transport == "stdio" {
			runtimeName = "local subprocess"
		} else {
			destination := sanitizeTrustDestination(expanded.URL, "")
			destinations = append(destinations, destination)
			classification = destination.Classification
		}
		status := TrustStatusConfigured
		if !entry.ShouldAutoStart() {
			status = TrustStatusDisabled
		}
		if snap.FailedMCP[name] {
			status = TrustStatusUnknown
		}
		if snap.ConnectedMCP[name] {
			status = TrustStatusActive
		}
		flows = append(flows, TrustFlow{
			ID: "mcp:" + name, Category: "mcp", Name: name, Status: status, Direction: "模型运行时 <-> MCP",
			Detail: trustMCPDetail(transport), Destinations: destinations, Classification: classification,
			Transport: transport, Runtime: runtimeName, AutoStart: entry.ShouldAutoStart(), TrustedReadOnlyTools: len(entry.TrustedReadOnlyTools),
			DataCategories: []string{"工具参数", "工具返回结果", "MCP 协议元数据"},
		})
	}

	webStatus := TrustStatusDisabled
	if trustToolEnabled(cfg.Tools.Enabled, "web_fetch") {
		webStatus = TrustStatusPossible
	}
	flows = append(flows, TrustFlow{ID: "network:web-fetch", Category: "network", Name: "web_fetch", Status: webStatus, Direction: "本机 -> 用户指定 URL", Classification: "unknown", DataCategories: []string{"请求 URL", "响应正文"}, Detail: "受 SSRF 检查、代理与可信内网审批约束；此处只表示能力，不表示已经访问。"})
	browserStatus := TrustStatusDisabled
	if trustToolEnabled(cfg.Tools.Enabled, "browser_control") || trustToolEnabled(cfg.Tools.Enabled, "browser_navigate") {
		browserStatus = TrustStatusPossible
	}
	flows = append(flows, TrustFlow{ID: "network:browser", Category: "network", Name: "浏览器自动化", Status: browserStatus, Direction: "本机浏览器 <-> 网站", Classification: "unknown", DataCategories: []string{"页面 URL", "页面可见文本", "用户明确输入的表单值"}, Detail: "使用本机浏览器访问用户指定网站；此处只表示能力，不表示已访问。"})

	sandboxStatus := TrustStatusDisabled
	if cfg.Sandbox.Network {
		sandboxStatus = TrustStatusActive
	}
	flows = append(flows, TrustFlow{ID: "network:sandbox", Category: "network", Name: "Shell 沙箱网络", Status: sandboxStatus, Direction: "沙箱进程 -> 网络", Classification: "unknown", DataCategories: []string{"命令自行发起的网络请求"}, Detail: "开启时，沙箱内命令可联网；不代表任何命令已经联网。"})

	intranetStatus := TrustStatusDisabled
	intranetDestinations := []TrustDestination{}
	if cfg.Network.TrustedIntranet.Enabled {
		intranetStatus = TrustStatusConfigured
		for _, site := range cfg.Network.TrustedIntranet.Sites {
			host := strings.TrimSpace(site.Host)
			if host == "" {
				continue
			}
			port := 443
			if len(site.Ports) > 0 && site.Ports[0] > 0 {
				port = site.Ports[0]
			}
			intranetDestinations = append(intranetDestinations, sanitizeTrustDestination("https://"+net.JoinHostPort(host, strconv.Itoa(port)), ""))
		}
	}
	flows = append(flows, TrustFlow{ID: "network:trusted-intranet", Category: "network", Name: "可信内网站点", Status: intranetStatus, Direction: "web_fetch -> 已授权内网", Destinations: intranetDestinations, Classification: "intranet", DataCategories: []string{"请求 URL", "响应正文"}, Detail: fmt.Sprintf("配置了 %d 个精确站点规则。", len(cfg.Network.TrustedIntranet.Sites))})

	proxyStatus := TrustStatusConfigured
	mode := strings.ToLower(strings.TrimSpace(cfg.Network.ProxyMode))
	if mode == "" {
		mode = "auto"
	}
	if mode == "off" {
		proxyStatus = TrustStatusDisabled
	}
	proxyDestinations := []TrustDestination{}
	if destination := trustProxyDestination(cfg); destination.URL != "" {
		proxyDestinations = append(proxyDestinations, destination)
	}
	flows = append(flows, TrustFlow{ID: "network:proxy", Category: "network", Name: "出站代理", Status: proxyStatus, Direction: "本机网络客户端 -> 代理 -> 目标", Destinations: proxyDestinations, Classification: trustFlowClassification(proxyDestinations), DataCategories: []string{"目标主机", "加密连接元数据"}, Detail: "模式：" + mode + "。代理认证信息已移除。"})
	return flows
}

func normalizeTrustMCPTransport(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "http", "streamable-http", "streamable_http":
		return "http"
	case "sse":
		return "sse"
	default:
		return "stdio"
	}
}

func trustMCPDetail(transport string) string {
	if transport == "stdio" {
		return "本机子进程；仅显示可执行文件名，不显示参数或环境变量值。"
	}
	return "远程 MCP；目标已移除 userinfo、查询参数、片段与请求头值。"
}

func trustToolEnabled(enabled []string, name string) bool {
	if len(enabled) == 0 {
		return true
	}
	for _, candidate := range enabled {
		if strings.EqualFold(strings.TrimSpace(candidate), strings.TrimSpace(name)) {
			return true
		}
	}
	return false
}

func trustProxyDestination(cfg *config.Config) TrustDestination {
	if cfg == nil {
		return TrustDestination{Classification: "unknown"}
	}
	spec := cfg.NetworkProxySpec()
	if strings.TrimSpace(spec.URL) != "" {
		return sanitizeTrustDestination(spec.URL, "")
	}
	server := strings.TrimSpace(spec.Server)
	if server == "" || spec.Port <= 0 {
		return TrustDestination{Classification: "unknown"}
	}
	scheme := strings.TrimSpace(spec.Type)
	if scheme == "" {
		scheme = "http"
	}
	return sanitizeTrustDestination(scheme+"://"+net.JoinHostPort(server, strconv.Itoa(spec.Port)), "")
}

func (a *App) trustEnterpriseIMView(cfg *config.Config) TrustEnterpriseIMView {
	view := TrustEnterpriseIMView{Connections: []TrustIMConnectionView{}, MessagePath: "远端平台 -> 本机 runtime -> 模型服务"}
	if cfg == nil {
		view.Status = TrustStatusUnknown
		return view
	}
	runtimeStatus := a.BotRuntimeStatus()
	view.Enabled = cfg.Bot.Enabled
	view.Status = TrustStatusDisabled
	if cfg.Bot.Enabled {
		view.Status = TrustStatusConfigured
	}
	if runtimeStatus.Running {
		view.Status = TrustStatusActive
	}
	view.RuntimeStatus = strings.TrimSpace(runtimeStatus.Status)
	view.RuntimeConnections = runtimeStatus.Connections
	view.AllowAll = cfg.Bot.Allowlist.AllowAll
	view.PairingEnabled = cfg.Bot.Pairing.Enabled
	view.UserCount = len(cfg.Bot.Allowlist.QQUsers) + len(cfg.Bot.Allowlist.FeishuUsers) + len(cfg.Bot.Allowlist.WeixinUsers)
	view.GroupCount = len(cfg.Bot.Allowlist.QQGroups) + len(cfg.Bot.Allowlist.FeishuGroups) + len(cfg.Bot.Allowlist.WeixinGroups)
	view.ApproverCount = len(cfg.Bot.Allowlist.QQApprovers) + len(cfg.Bot.Allowlist.FeishuApprovers) + len(cfg.Bot.Allowlist.WeixinApprovers)
	view.AdminCount = len(cfg.Bot.Allowlist.QQAdmins) + len(cfg.Bot.Allowlist.FeishuAdmins) + len(cfg.Bot.Allowlist.WeixinAdmins)
	view.ToolApprovalMode = normalizeBotConnectionToolApprovalMode(cfg.Bot.ToolApprovalMode)
	controlTarget := sanitizeControlServerAddress(cfg.Bot.Control.Addr)
	view.Control = TrustControlServerView{
		Enabled: cfg.Bot.Control.Enabled, Address: trustControlAddress(controlTarget), TokenEnv: strings.TrimSpace(cfg.Bot.Control.TokenEnv),
		TokenSet: config.CredentialIsSet(cfg.Bot.Control.TokenEnv), Status: TrustStatusDisabled, Target: controlTarget,
	}
	if cfg.Bot.Control.Enabled {
		view.Control.Status = TrustStatusConfigured
	}
	for _, connection := range cfg.Bot.Connections {
		view.Connections = append(view.Connections, trustIMConnection(connection, cfg.Bot.ToolApprovalMode))
	}
	if len(view.Connections) == 0 {
		view.Connections = append(view.Connections, trustLegacyIMConnections(cfg)...)
	}
	return view
}

func trustIMConnection(connection config.BotConnectionConfig, defaultApprovalMode string) TrustIMConnectionView {
	status := TrustStatusDisabled
	if connection.Enabled {
		status = TrustStatusConfigured
	}
	if connection.Enabled && normalizeTrustBotConnectionStatus(connection.Status) == "error" {
		status = TrustStatusUnknown
	}
	workspaceRoots := []string{}
	addWorkspace := func(root string) {
		root = strings.TrimSpace(root)
		if root == "" || containsString(workspaceRoots, root) {
			return
		}
		workspaceRoots = append(workspaceRoots, root)
	}
	addWorkspace(connection.WorkspaceRoot)
	for _, mapping := range connection.SessionMappings {
		addWorkspace(mapping.WorkspaceRoot)
	}
	credentials := []TrustCredentialRef{}
	for _, env := range []string{connection.Credential.AppSecretEnv, connection.Credential.TokenEnv} {
		env = strings.TrimSpace(env)
		if env != "" {
			credentials = append(credentials, TrustCredentialRef{Env: env, Set: config.CredentialIsSet(env)})
		}
	}
	approvalMode := strings.TrimSpace(connection.ToolApprovalMode)
	if approvalMode == "" {
		approvalMode = defaultApprovalMode
	}
	return TrustIMConnectionView{
		ID: strings.TrimSpace(connection.ID), Platform: strings.TrimSpace(connection.Provider), Domain: strings.TrimSpace(connection.Domain),
		Status: status, ConfiguredStatus: normalizeTrustBotConnectionStatus(connection.Status), WorkspaceRoots: workspaceRoots, MappingCount: len(connection.SessionMappings),
		UserCount: len(connection.Access.Users), GroupCount: len(connection.Access.Groups), ApproverCount: len(connection.Access.Approvers), AdminCount: len(connection.Access.Admins),
		AllowAll: connection.Access.AllowAll, PairingEnabled: connection.Access.PairingEnabled, ToolApprovalMode: normalizeBotConnectionToolApprovalMode(approvalMode),
		Credentials: credentials, MessagePath: "远端平台 -> 本机 runtime -> 模型服务",
	}
}

func normalizeTrustBotConnectionStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "connected", "pending", "disconnected", "error":
		return strings.ToLower(strings.TrimSpace(status))
	default:
		return "unknown"
	}
}

func trustLegacyIMConnections(cfg *config.Config) []TrustIMConnectionView {
	if cfg == nil {
		return []TrustIMConnectionView{}
	}
	out := []TrustIMConnectionView{}
	appendLegacy := func(id, platform, domain, workspace, approval, credentialEnv string, enabled bool, access config.BotAccessConfig) {
		if !enabled {
			return
		}
		status := TrustStatusConfigured
		credentials := []TrustCredentialRef{}
		if env := strings.TrimSpace(credentialEnv); env != "" {
			credentials = append(credentials, TrustCredentialRef{Env: env, Set: config.CredentialIsSet(env)})
		}
		roots := []string{}
		if strings.TrimSpace(workspace) != "" {
			roots = append(roots, strings.TrimSpace(workspace))
		}
		out = append(out, TrustIMConnectionView{ID: id, Platform: platform, Domain: domain, Status: status, WorkspaceRoots: roots,
			UserCount: len(access.Users), GroupCount: len(access.Groups), ApproverCount: len(access.Approvers), AdminCount: len(access.Admins),
			AllowAll: access.AllowAll, PairingEnabled: access.PairingEnabled, ToolApprovalMode: normalizeBotConnectionToolApprovalMode(approval), Credentials: credentials,
			MessagePath: "远端平台 -> 本机 runtime -> 模型服务"})
	}
	appendLegacy("legacy:qq", "qq", "qq", cfg.Bot.QQ.WorkspaceRoot, cfg.Bot.QQ.ToolApprovalMode, cfg.Bot.QQ.AppSecretEnv, cfg.Bot.QQ.Enabled, cfg.Bot.QQ.Access)
	appendLegacy("legacy:feishu", "feishu", firstTrustNonEmpty(cfg.Bot.Feishu.Domain, "feishu"), "", cfg.Bot.ToolApprovalMode, cfg.Bot.Feishu.AppSecretEnv, cfg.Bot.Feishu.Enabled, config.BotAccessConfig{})
	appendLegacy("legacy:weixin", "weixin", "weixin", "", cfg.Bot.ToolApprovalMode, cfg.Bot.Weixin.TokenEnv, cfg.Bot.Weixin.Enabled, config.BotAccessConfig{})
	return out
}

func sanitizeControlServerAddress(address string) TrustDestination {
	address = strings.TrimSpace(address)
	if address == "" {
		return TrustDestination{Classification: "unknown"}
	}
	return sanitizeTrustDestination("http://"+address, "")
}

func trustControlAddress(destination TrustDestination) string {
	if destination.Host == "" {
		return ""
	}
	parsed, err := url.Parse(destination.URL)
	if err != nil {
		return destination.Host
	}
	return parsed.Host
}

func trustFileEgressFlows(cfg *config.Config, activeModel string, im TrustEnterpriseIMView) []TrustFlow {
	visionStatus := TrustStatusDisabled
	visionDestination := []TrustDestination{}
	if cfg != nil {
		modelRef := strings.TrimSpace(activeModel)
		if modelRef == "" {
			modelRef = strings.TrimSpace(cfg.DefaultModel)
		}
		if entry, ok := cfg.ResolveModel(modelRef); ok && config.EffectiveVision(entry) {
			visionStatus = TrustStatusPossible
			visionDestination = []TrustDestination{trustProviderDestination(entry)}
		}
	}
	imStatus := TrustStatusDisabled
	if im.Enabled && len(im.Connections) > 0 {
		imStatus = TrustStatusPossible
	}
	remoteMCPStatus := TrustStatusDisabled
	if cfg != nil {
		for _, entry := range cfg.Plugins {
			if normalizeTrustMCPTransport(entry.Type) != "stdio" {
				remoteMCPStatus = TrustStatusPossible
				break
			}
		}
	}
	return []TrustFlow{
		{ID: "egress:model-vision", Category: "file-egress", Name: "模型 Vision 附件", Status: visionStatus, Direction: "本机附件 -> 当前模型服务", Destinations: visionDestination, Classification: trustFlowClassification(visionDestination), DataCategories: []string{"用户选择的图片附件"}, Detail: "仅在用户附图且当前模型支持 Vision 时可能发送；不是已发送事件记录。"},
		{ID: "egress:browser-upload", Category: "file-egress", Name: "浏览器文件上传", Status: TrustStatusDisabled, Direction: "本机文件 -> 浏览器页面", Classification: "unknown", DataCategories: []string{}, Detail: "当前 browserControl 动作未提供文件选择/上传能力。"},
		{ID: "egress:im-media", Category: "file-egress", Name: "企业 IM 媒体", Status: imStatus, Direction: "远端 IM <-> 本机附件目录", Classification: "external", DataCategories: []string{"用户在 IM 中提供的媒体", "适配器媒体 URL"}, Detail: "入站媒体会下载到本机工作区；出站适配器契约可携带媒体 URL。此处只表示能力。"},
		{ID: "egress:mcp-tools", Category: "file-egress", Name: "MCP 或工具联网", Status: remoteMCPStatus, Direction: "工具参数/本地文件引用 -> 工具目标", Classification: "unknown", DataCategories: []string{"工具明确接收的文本、路径或文件内容"}, Detail: "取决于具体 MCP 或工具语义与调用参数；不伪造已发送事件。"},
	}
}

func trustDiagnosticFlows(cfg *config.Config) []TrustFlow {
	if cfg == nil {
		return []TrustFlow{}
	}
	status := func(enabled bool) TrustStatus {
		if enabled {
			return TrustStatusActive
		}
		return TrustStatusDisabled
	}
	updateDestinations := make([]TrustDestination, 0, len(manifestEndpoints()))
	for _, endpoint := range manifestEndpoints() {
		updateDestinations = append(updateDestinations, sanitizeTrustDestination(endpoint, ""))
	}
	return []TrustFlow{
		{ID: "diagnostic:telemetry", Category: "diagnostic", Name: "启动遥测", Status: status(cfg.DesktopTelemetry()), Direction: "本机 -> 诊断服务", Destinations: []TrustDestination{sanitizeTrustDestination(pingEndpoint, "")}, Classification: "external", DataCategories: []string{"安装 ID", "版本", "操作系统与架构", "已登录时的账户标识资料"}, Detail: "每次正式版启动一次；关闭 desktop.telemetry 后停用。"},
		{ID: "diagnostic:metrics", Category: "diagnostic", Name: "聚合指标", Status: status(cfg.DesktopMetrics()), Direction: "本机 -> 诊断服务", Destinations: []TrustDestination{sanitizeTrustDestination(metricsEndpoint, "")}, Classification: "external", DataCategories: []string{"功能信号计数", "有限枚举桶"}, Detail: "不包含提示词、文件内容、路径、密钥或自定义服务 URL。"},
		{ID: "diagnostic:crash", Category: "diagnostic", Name: "崩溃报告", Status: status(cfg.DesktopTelemetry()), Direction: "本机 -> 诊断服务", Destinations: []TrustDestination{sanitizeTrustDestination(crashEndpoint, "")}, Classification: "external", DataCategories: []string{"净化后的错误消息", "净化后的堆栈", "版本与设备信息"}, Detail: "Go panic 可暂存并在下次启动按遥测设置处理；前端报告仍需用户明确发送。"},
		{ID: "diagnostic:update", Category: "diagnostic", Name: "更新检查", Status: status(cfg.DesktopCheckUpdates()), Direction: "本机 -> 发布服务", Destinations: updateDestinations, Classification: "external", DataCategories: []string{"当前版本", "发布通道", "平台与架构", "更新 User-Agent"}, Detail: "仅检查发布清单；下载与安装是独立用户动作。"},
		{ID: "diagnostic:notifications", Category: "diagnostic", Name: "系统通知", Status: status(cfg.Notifications.Enabled), Direction: "本机应用 -> 操作系统通知中心", Classification: "local", DataCategories: []string{"任务完成/审批/提问事件标题"}, Detail: "由本机操作系统通知服务显示，不需要远程目标。"},
	}
}

func trustPolicyView(cfg *config.Config, snap trustTabSnapshot) TrustPolicyView {
	if cfg == nil {
		return TrustPolicyView{WriteRoots: []string{}, ForbidReadRoots: []string{}, RuntimeToolApproval: snap.ToolApprovalMode}
	}
	permission := strings.ToLower(strings.TrimSpace(cfg.Permissions.Mode))
	if permission == "" {
		permission = "ask"
	}
	return TrustPolicyView{
		SandboxMode: cfg.BashMode(), SandboxNetwork: cfg.Sandbox.Network,
		WriteRoots: nonNilStrings(cfg.WriteRootsForRoot(snap.WorkspaceRoot)), ForbidReadRoots: nonNilStrings(cfg.ForbidReadRootsForRoot(snap.WorkspaceRoot)),
		RedactToolOutput: cfg.SecretsRedactToolOutput(), FilterSubprocessEnv: cfg.Secrets.FilterSubprocessEnv, ProtectSensitiveFiles: cfg.Secrets.ProtectSensitiveFiles,
		DefaultPermission: permission, RuntimeToolApproval: snap.ToolApprovalMode,
		AllowRuleCount: len(cfg.Permissions.Allow), AskRuleCount: len(cfg.Permissions.Ask), DenyRuleCount: len(cfg.Permissions.Deny),
	}
}

func trustWarnings(cfg *config.Config, snap trustTabSnapshot, network []TrustFlow, im TrustEnterpriseIMView) []TrustWarning {
	warnings := []TrustWarning{}
	add := func(warning TrustWarning) {
		for _, existing := range warnings {
			if existing.ID == warning.ID {
				return
			}
		}
		warnings = append(warnings, warning)
	}
	for _, flow := range network {
		if flow.Category == "mcp" && flow.Transport != "stdio" {
			add(TrustWarning{ID: "remote-mcp", Severity: "medium", Title: "已配置远程 MCP", Detail: "远程 MCP 可能接收工具参数与返回工具结果；请核对目标主机和工具语义。"})
			break
		}
	}
	if cfg != nil && cfg.Sandbox.Network {
		add(TrustWarning{ID: "sandbox-network", Severity: "medium", Title: "Shell 沙箱允许联网", Detail: "受限 shell 仍可发起网络请求；写入边界不等同于网络隔离。"})
	}
	if im.Control.Enabled && im.Control.Target.Classification == "all-interfaces" {
		add(TrustWarning{ID: "bot-control-exposed", Severity: "high", Title: "企业 IM 控制服务监听所有网络接口", Detail: "控制服务绑定了 0.0.0.0 或 ::；请确认防火墙、令牌与网络边界。"})
	}
	if im.Enabled && im.AllowAll {
		add(TrustWarning{ID: "bot-allow-all", Severity: "high", Title: "企业 IM 允许所有用户", Detail: "allow_all 会扩大远端任务入口；建议使用明确用户/群组名单或配对。"})
	}
	for _, connection := range im.Connections {
		if connection.AllowAll {
			add(TrustWarning{ID: "bot-allow-all", Severity: "high", Title: "企业 IM 连接允许所有用户", Detail: "至少一个连接启用了 allow_all；建议缩小到明确用户/群组。"})
		}
	}
	rolesEmpty := im.Enabled && im.ApproverCount == 0 && im.AdminCount == 0 && (im.AllowAll || im.PairingEnabled || im.UserCount+im.GroupCount > 0)
	for _, connection := range im.Connections {
		if connection.Status != TrustStatusDisabled && connection.ApproverCount == 0 && connection.AdminCount == 0 && (connection.AllowAll || connection.PairingEnabled || connection.UserCount+connection.GroupCount > 0) {
			rolesEmpty = true
			break
		}
	}
	if rolesEmpty {
		add(TrustWarning{ID: "bot-role-unconfigured", Severity: "high", Title: "企业 IM 命令角色未配置", Detail: "approver/admin 均为空；高权限命令的有效行为取决于当前运行时安全策略，建议显式配置角色并保持 fail-closed。"})
	}
	if cfg != nil && cfg.DesktopTelemetry() {
		add(TrustWarning{ID: "telemetry", Severity: "medium", Title: "启动遥测已启用", Detail: "正式版启动会发送安装/版本/系统信息；已登录时还可能包含账户标识资料。"})
		add(TrustWarning{ID: "crash-reporting", Severity: "medium", Title: "崩溃暂存发送已启用", Detail: "Go panic 可能写入本地待发送文件，并在下次启动按遥测设置发送。"})
	}
	if cfg != nil && cfg.DesktopMetrics() {
		add(TrustWarning{ID: "metrics", Severity: "info", Title: "聚合指标已启用", Detail: "应用会发送有限枚举的功能计数；不包含内容、路径或密钥。"})
	}
	if snap.ToolApprovalMode == "yolo" {
		add(TrustWarning{ID: "runtime-full-access", Severity: "high", Title: "当前 Thread 为完全访问模式", Detail: "当前运行时会绕过多数常规工具审批；记忆与部分显式规则仍可能要求确认。"})
	}
	return warnings
}

func sanitizeTrustDestination(raw, defaultPath string) TrustDestination {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return TrustDestination{Classification: "unknown"}
	}
	parsed, err := url.Parse(raw)
	if err != nil || strings.TrimSpace(parsed.Scheme) == "" {
		return TrustDestination{Classification: "unknown"}
	}
	if parsed.Scheme != "file" && strings.TrimSpace(parsed.Host) == "" {
		return TrustDestination{Classification: "unknown"}
	}
	parsed.User = nil
	parsed.RawQuery = ""
	parsed.ForceQuery = false
	parsed.Fragment = ""
	parsed.RawFragment = ""
	if defaultPath = strings.TrimSpace(defaultPath); defaultPath != "" {
		basePath := strings.TrimRight(parsed.Path, "/")
		parsed.RawPath = ""
		parsed.Path = basePath + "/" + strings.TrimLeft(defaultPath, "/")
	}
	parsed.Path = redactTrustURLPath(parsed.Path)
	parsed.RawPath = ""
	host := strings.ToLower(strings.TrimSpace(parsed.Hostname()))
	classification := classifyTrustHost(parsed.Scheme, host)
	return TrustDestination{
		URL: parsed.String(), Scheme: strings.ToLower(parsed.Scheme), Host: host,
		Path: parsed.EscapedPath(), Classification: classification,
	}
}

func classifyTrustHost(scheme, host string) string {
	scheme = strings.ToLower(strings.TrimSpace(scheme))
	host = strings.ToLower(strings.Trim(strings.TrimSpace(host), "[]"))
	if scheme == "file" || scheme == "unix" || scheme == "stdio" {
		return "local"
	}
	if host == "" {
		return "unknown"
	}
	if host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return "local"
	}
	if ip := net.ParseIP(host); ip != nil {
		if ip.IsUnspecified() {
			return "all-interfaces"
		}
		if ip.IsLoopback() {
			return "local"
		}
		if ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
			return "intranet"
		}
		return "external"
	}
	for _, suffix := range []string{".internal", ".local", ".lan", ".corp", ".home"} {
		if strings.HasSuffix(host, suffix) {
			return "intranet"
		}
	}
	if !strings.Contains(host, ".") {
		return "intranet"
	}
	return "external"
}

func redactTrustURLPath(path string) string {
	if path == "" || path == "/" {
		return path
	}
	segments := strings.Split(path, "/")
	redactNext := false
	for i, segment := range segments {
		if segment == "" {
			continue
		}
		marker := trustSensitivePathMarker(segment)
		if redactNext || trustSensitivePathValue(segment) {
			segments[i] = "_redacted_"
		}
		if marker {
			redactNext = true
		} else {
			redactNext = false
		}
	}
	return strings.Join(segments, "/")
}

func trustSensitivePathMarker(segment string) bool {
	switch strings.ToLower(strings.TrimSpace(segment)) {
	case "hook", "hooks", "webhook", "webhooks", "token", "tokens", "key", "keys", "secret", "secrets":
		return true
	default:
		return false
	}
}

func trustSensitivePathValue(segment string) bool {
	value := strings.TrimSpace(segment)
	lower := strings.ToLower(value)
	for _, prefix := range []string{"hook-", "hook_", "webhook-", "webhook_", "token-", "token_", "key-", "key_", "secret-", "secret_"} {
		if strings.HasPrefix(lower, prefix) {
			return true
		}
	}
	if len(value) < 20 {
		return false
	}
	hasLetter := false
	hasDigit := false
	hasUpper := false
	hasLower := false
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z':
			hasLetter = true
			hasLower = true
		case r >= 'A' && r <= 'Z':
			hasLetter = true
			hasUpper = true
		case r >= '0' && r <= '9':
			hasDigit = true
		case r == '-' || r == '_' || r == '.' || r == '~':
		default:
			return false
		}
	}
	return hasLetter && (hasDigit || (hasUpper && hasLower) || (!strings.ContainsAny(value, "-_.~") && len(value) >= 32))
}

func trustFlowClassification(destinations []TrustDestination) string {
	if len(destinations) == 0 {
		return "unknown"
	}
	classification := destinations[0].Classification
	for _, destination := range destinations[1:] {
		if destination.Classification != classification {
			return "mixed"
		}
	}
	return classification
}

func nonNilStrings(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	out := append([]string(nil), values...)
	return out
}

func normalizeTrustFlows(flows []TrustFlow) []TrustFlow {
	if len(flows) == 0 {
		return []TrustFlow{}
	}
	for i := range flows {
		if flows[i].Destinations == nil {
			flows[i].Destinations = []TrustDestination{}
		}
		if flows[i].DataCategories == nil {
			flows[i].DataCategories = []string{}
		}
	}
	return flows
}

func containsString(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}

func firstTrustNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
