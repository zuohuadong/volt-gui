<script lang="ts">
  import { onMount } from "svelte";
  import {
    Archive, BookOpen, Bot, Check, ChevronDown, ChevronRight, CircleAlert,
    CircleCheck, ClipboardList, Code2, Copy, ExternalLink, FileText, FolderOpen,
    HardDrive, History, KeyRound, LoaderCircle, MessageSquare, MessageSquarePlus, Network,
    Pause, Pencil, Play, PanelLeftClose, PanelLeftOpen, Save, Search, Send,
    Settings2, ShieldAlert, SlidersHorizontal, Square, Target, Terminal, Trash2, UserRoundCog,
    Wrench, X, RefreshCw, PlugZap, GitBranch,
  } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import { Textarea } from "$components/ui/textarea";
  import GeneratedSurface from "$components/GeneratedSurface.svelte";
  import SmbMounts from "$components/SmbMounts.svelte";
  import ImageAttachments from "$components/ImageAttachments.svelte";
  import PermissionSelector from "$components/PermissionSelector.svelte";
  import ProviderWorkbench from "$components/ProviderWorkbench.svelte";
  import WorkspaceBrowser from "$components/WorkspaceBrowser.svelte";
  import ReferencePicker from "$components/ReferencePicker.svelte";
  import { Input } from "$components/ui/input";
  import { Separator } from "$components/ui/separator";
  import { DataState, SettingsGroup, StatusBadge } from "@svadmin/ui";
  import { setResources } from "@svadmin/core";
  import {
    DshClient, type AgentPreset, type ConfigurableProvider, type CredentialView,
    type DshFrame, type DshSkill, type GoalProjection, type ModelGroup,
    type PendingApproval, type PendingQuestion, type SessionSummary,
    type PromptContentPart, type SettingsNamespace, type SubagentEntry, type Workspace, type PluginInventoryEntry,
  } from "$lib/dsh-client";
  import { assistantMessageForEvent, applyTranscriptEvent, foldHistory, type TodoItem, type TranscriptMessage } from "$lib/transcript";
  import { enrichModelGroups, findProviderSettings, mergeDiscoveredModels, modelCapabilityLabel } from "$lib/model-catalog";
  import {
    applyUiCustomization,
    buildUiCustomizationPrompt,
    DEFAULT_UI_CUSTOMIZATION,
    isUiCustomizationIntent,
    parseUiCustomization,
    type UiCustomizationPatch,
    type UiCustomizationState,
  } from "$lib/ui-customization";
  import {
    buildVoltSurfacePrompt,
    isSurfaceGenerationIntent,
    parseVoltSurfaceProposal,
    validateStoredSurface,
  } from "$lib/surface-agent";
  import type { SurfaceSpec } from "@svadmin/surface";
  type View = "conversation" | "knowledge" | "settings";
  type ManagementTab = "overview" | "sessions" | "goals" | "subagents" | "agents" | "models" | "workspaces" | "mounts" | "plugins" | "knowledge" | "settings" | "runtime";

  let client = $state<DshClient>();
  let productName = $state("西谷智灯暗涌平台");
  let appVersion = $state("0.31.1");
  let workspacePath = $state("");
  let workspaces = $state<Workspace[]>([]);
  let sessions = $state<SessionSummary[]>([]);
  let archivedSessionIds = $state<string[]>([]);
  let activeSessionId = $state("");
  let messages = $state<TranscriptMessage[]>([]);
  let todos = $state<TodoItem[]>([]);
  let input = $state("");
  let attachments = $state<Extract<PromptContentPart, { type: "image" }>[]>([]);
  let sessionQuery = $state("");
  let settingsQuery = $state("");
  let managementTab = $state<ManagementTab>("overview");
  let loading = $state(true);
  let sending = $state(false);
  let sidebarCollapsed = $state(false);
  let activityOpen = $state(true);
  let view = $state<View>("conversation");
  let runtimeError = $state("");
  let modelGroups = $state<ModelGroup[]>([]);
  let selectedModel = $state("");
  let reasoningEffort = $state("");
  let modelBusy = $state(false);
  let skills = $state<DshSkill[]>([]);
  let agentPresets = $state<AgentPreset[]>([]);
  let agentPreview = $state<{ id: string; content: string }>();
  let agentAuthorable = $state(false);
  let agentHasDocument = $state(false);
  let copyingAgentPreset = $state("");
  let copyAgentNameDraft = $state("");
  let confirmingAgentPreset = $state("");
  let editingSessionId = $state("");
  let sessionTitleDraft = $state("");
  let editingWorkspaceId = $state("");
  let workspaceTitleDraft = $state("");
  let confirmingWorkspaceId = $state("");
  let managementBusy = $state("");
  let managementError = $state("");
  let managementNotice = $state("");
  let goalObjectiveDraft = $state("");
  let goalRoundsDraft = $state("256");
  let editingGoal = $state(false);
  let confirmingGoalClear = $state(false);
  let subagents = $state<SubagentEntry[]>([]);
  let subagentParentAvailable = $state(false);
  let selectedSubagentId = $state("");
  let subagentMessages = $state<TranscriptMessage[]>([]);
  let subagentPromptDraft = $state("");
  let settingsNamespaces = $state<SettingsNamespace[]>([]);
  let settingsWritable = $state(false);
  let settingsHasDocument = $state(false);
  let selectedSettingsNs = $state("");
  let settingsDraft = $state("{}");
  let providers = $state<ConfigurableProvider[]>([]);
  let catalogGroups = $state<ModelGroup[]>([]);
  let catalogFailures = $state<Array<{ id: string; name: string; message: string }>>([]);
  let hostInfo = $state<{ version: string; cwd: string; provider?: string; model?: string; attachedSessions: number; home: string; canOpenPath: boolean }>();
  let pluginInventory = $state<PluginInventoryEntry[]>([]);
  let credentialRefs = $state<string[]>([]);
  let credentials = $state<Record<string, CredentialView>>({});
  let credentialRefDraft = $state("");
  let credentialValueDraft = $state("");
  let confirmingCredentialRef = $state("");
  let unknownModelCapabilities = $state<Set<string>>(new Set());
  let pendingApproval = $state<PendingApproval | undefined>();
  let pendingQuestion = $state<PendingQuestion | undefined>();
  let questionAnswers = $state<Record<string, string>>({});
  let customization = $state<UiCustomizationState>(DEFAULT_UI_CUSTOMIZATION);
  let customizationOpen = $state(false);
  let customizationDraft = $state<UiCustomizationPatch | undefined>();
  let customizationSourceId = $state("");
  let customizationNotice = $state("");
  let customizationHistory = $state<UiCustomizationState[]>([]);
  let surfaceDraft = $state<{ summary?: string; spec: SurfaceSpec }>();
  let generatedSurface = $state<SurfaceSpec>();
  let surfaceSourceId = $state("");
  let surfaceNotice = $state("");
  let surfaceHistory = $state<Array<SurfaceSpec | undefined>>([]);
  let unsubscribeRuntimeError: (() => void) | undefined;

  const activeSession = $derived(sessions.find((item) => item.sessionId === activeSessionId));
  const workspaceName = $derived(workspacePath.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "未选择工作区");
  const filteredSessions = $derived.by(() => {
    const query = sessionQuery.trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter((item) => sessionTitle(item).toLowerCase().includes(query) || (item.cwd || "").toLowerCase().includes(query));
  });
  const currentGoal = $derived(goalProjection(activeSession));
  const selectedSubagent = $derived(subagents.find((item) => item.id === selectedSubagentId));
  const filteredSettingsNamespaces = $derived.by(() => {
    const query = settingsQuery.trim().toLowerCase();
    if (!query) return settingsNamespaces;
    return settingsNamespaces.filter((item) => item.ns.toLowerCase().includes(query));
  });
  const filteredProviders = $derived.by(() => {
    const query = settingsQuery.trim().toLowerCase();
    if (!query) return providers;
    return providers.filter((item) => (item.displayName + " " + item.provider + " " + item.settingsNs).toLowerCase().includes(query));
  });
  const filteredManagementSessions = $derived.by(() => {
    const query = settingsQuery.trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter((item) => `${sessionTitle(item)} ${item.cwd || ""} ${item.agentPreset || ""}`.toLowerCase().includes(query));
  });
  const filteredAgentPresets = $derived.by(() => {
    const query = settingsQuery.trim().toLowerCase();
    if (!query) return agentPresets;
    return agentPresets.filter((item) => `${item.name || ""} ${item.id} ${item.description || ""}`.toLowerCase().includes(query));
  });
  const filteredWorkspaces = $derived.by(() => {
    const query = settingsQuery.trim().toLowerCase();
    if (!query) return workspaces;
    return workspaces.filter((item) => `${item.title} ${item.path}`.toLowerCase().includes(query));
  });
  const runningTools = $derived(messages.filter((item) => item.tool?.state === "running"));
  const activityItems = $derived(messages.filter((item) => item.tool).slice(-12).reverse());
  const completedTools = $derived(messages.filter((item) => item.tool && item.tool.state === "success").length);
  const latestAssistant = $derived.by(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === "assistant") return messages[index];
    }
    return undefined;
  });

  setResources([
    { name: "sessions", label: "会话", fields: [{ key: "title", label: "标题", type: "text" }], showInMenu: true },
    { name: "goals", label: "目标", fields: [{ key: "objective", label: "目标", type: "text" }], showInMenu: true },
    { name: "subagents", label: "子 Agent", fields: [{ key: "label", label: "名称", type: "text" }], showInMenu: true },
    { name: "agents", label: "Agent", fields: [{ key: "name", label: "名称", type: "text" }], showInMenu: true },
    { name: "workspaces", label: "工作区", fields: [{ key: "path", label: "路径", type: "text" }], showInMenu: true },
    { name: "models", label: "模型", fields: [{ key: "name", label: "名称", type: "text" }], showInMenu: true },
    { name: "knowledge", label: "知识库", fields: [{ key: "name", label: "名称", type: "text" }], showInMenu: true },
    { name: "settings", label: "设置", fields: [{ key: "ns", label: "命名空间", type: "text" }], showInMenu: true },
  ]);

  onMount(() => {
    customization = readUiCustomization();
    generatedSurface = readGeneratedSurface();
    applyRuntimeCustomization(customization);
    void bootstrap();
    return () => unsubscribeRuntimeError?.();
  });

  function readUiCustomization(): UiCustomizationState {
    try {
      const stored = window.localStorage.getItem("voltui.ui-customization");
      if (!stored) return DEFAULT_UI_CUSTOMIZATION;
      const parsed = JSON.parse(stored) as Partial<UiCustomizationState>;
      const result = parseUiCustomization(JSON.stringify({ ...parsed, schemaVersion: "voltui/ui-patch-v1" }));
      return result.ok ? applyUiCustomization(DEFAULT_UI_CUSTOMIZATION, result.value) : DEFAULT_UI_CUSTOMIZATION;
    } catch {
      return DEFAULT_UI_CUSTOMIZATION;
    }
  }

  function persistUiCustomization(value: UiCustomizationState): void {
    try { window.localStorage.setItem("voltui.ui-customization", JSON.stringify(value)); } catch { /* storage is optional */ }
  }

  function readGeneratedSurface(): SurfaceSpec | undefined {
    try {
      const stored = window.localStorage.getItem("voltui.generated-surface");
      return stored ? validateStoredSurface(JSON.parse(stored)) : undefined;
    } catch {
      return undefined;
    }
  }

  function persistGeneratedSurface(value: SurfaceSpec | undefined): void {
    try {
      if (value) window.localStorage.setItem("voltui.generated-surface", JSON.stringify(value));
      else window.localStorage.removeItem("voltui.generated-surface");
    } catch {
      // Browser storage is optional; the validated in-memory surface remains usable.
    }
  }

  function applyRuntimeCustomization(value: UiCustomizationState): void {
    sidebarCollapsed = value.sidebar === "collapsed";
    activityOpen = value.activity === "visible";
  }

  function setSidebarCollapsed(collapsed: boolean): void {
    sidebarCollapsed = collapsed;
    customization = { ...customization, sidebar: collapsed ? "collapsed" : "expanded" };
    persistUiCustomization(customization);
  }

  function setActivityOpen(open: boolean): void {
    activityOpen = open;
    customization = { ...customization, activity: open ? "visible" : "hidden" };
    persistUiCustomization(customization);
  }

  function applyCustomizationPatch(patch: UiCustomizationPatch): void {
    customizationHistory = [...customizationHistory.slice(-9), customization];
    customization = applyUiCustomization(customization, patch);
    persistUiCustomization(customization);
    applyRuntimeCustomization(customization);
    customizationDraft = undefined;
    customizationNotice = "界面定制已应用，可继续用对话调整或撤销。";
  }

  function undoCustomization(): void {
    const previous = customizationHistory.at(-1);
    if (!previous) return;
    customizationHistory = customizationHistory.slice(0, -1);
    customization = previous;
    persistUiCustomization(customization);
    applyRuntimeCustomization(customization);
    customizationNotice = "已撤销上一次界面定制。";
  }

  function captureCustomization(message: TranscriptMessage | undefined): void {
    if (!message || message.role !== "assistant" || !message.text || message.id === customizationSourceId) return;
    const result = parseUiCustomization(message.text);
    if (!result.ok) return;
    customizationDraft = result.value;
    customizationSourceId = message.id;
    customizationOpen = true;
    customizationNotice = "检测到对话生成的界面方案，请确认后应用。";
  }

  function captureSurfaceProposal(message: TranscriptMessage | undefined): void {
    if (!message || message.role !== "assistant" || !message.text || message.id === surfaceSourceId) return;
    const result = parseVoltSurfaceProposal(message.text);
    if (!result.ok) return;
    surfaceDraft = { summary: result.value.summary, spec: result.value.spec };
    surfaceSourceId = message.id;
    customizationOpen = true;
    surfaceNotice = "检测到 AI 生成的操作界面，请预览并确认后渲染。";
  }

  function applySurfaceProposal(): void {
    if (!surfaceDraft) return;
    surfaceHistory = [...surfaceHistory.slice(-9), generatedSurface];
    generatedSurface = surfaceDraft.spec;
    persistGeneratedSurface(generatedSurface);
    surfaceDraft = undefined;
    surfaceNotice = "操作界面已渲染；数据由官方 DSH 会话 API 提供。";
  }

  function removeGeneratedSurface(): void {
    surfaceHistory = [...surfaceHistory.slice(-9), generatedSurface];
    generatedSurface = undefined;
    persistGeneratedSurface(undefined);
    surfaceNotice = "已移除操作界面。";
  }

  function undoGeneratedSurface(): void {
    if (surfaceHistory.length === 0) return;
    generatedSurface = surfaceHistory.at(-1);
    surfaceHistory = surfaceHistory.slice(0, -1);
    persistGeneratedSurface(generatedSurface);
    surfaceNotice = generatedSurface ? "已恢复上一个操作界面。" : "已撤销操作界面。";
  }

  async function bootstrap(): Promise<void> {
    try {
      const shell = window.voltDesktop;
      if (!shell) throw new Error("桌面桥接未加载");
      const info = await shell.bootstrap();
      productName = info.productName;
      appVersion = info.version;
      workspacePath = info.workspace;
      unsubscribeRuntimeError = shell.onRuntimeError((message) => { runtimeError = message; sending = false; });
      if (info.startupError || !info.dshReady) { runtimeError = info.startupError || "DSH runtime 未提供连接地址"; return; }
      client = new DshClient(shell);
      client.subscribe(handleFrame, (error) => { runtimeError = error.message; });
      await refresh();
    } catch (error) {
      runtimeError = error instanceof Error ? error.message : String(error);
    } finally { loading = false; }
  }

  async function refresh(): Promise<void> {
    if (!client) return;
    const [workspaceResult, sessionResult] = await Promise.all([client.listWorkspaces(), client.listSessions()]);
    workspaces = workspaceResult.items;
    archivedSessionIds = workspaceResult.archivedSessionIds;
    sessions = sessionResult.items.filter((item) => !item.blank && !archivedSessionIds.includes(item.sessionId));
    if (activeSessionId && !sessions.some((item) => item.sessionId === activeSessionId)) activeSessionId = sessions[0]?.sessionId || "";
    if (!activeSessionId && sessions[0]) await selectSession(sessions[0].sessionId);
  }

  async function refreshManagement(): Promise<void> {
    if (!client) return;
    const [settingsResult, skillResult, agentResult, providerResult, subagentResult, catalogResult, hostResult, pluginResult] = await Promise.all([
      client.describeSettings().catch(() => ({ writable: false, hasDocument: false, namespaces: [] })),
      activeSessionId ? client.listSkills(activeSessionId).catch(() => ({ skills: [] })) : Promise.resolve({ skills: [] }),
      client.listAgentPresets().catch(() => ({ presets: [], authorable: false, hasDocument: false })),
      client.listProviders().catch(() => ({ providers: [] })),
      activeSessionId ? client.listSubagents(activeSessionId).catch(() => ({ entries: [], parentAvailable: false })) : Promise.resolve({ entries: [], parentAvailable: false }),
      client.listModelCatalog().catch(() => ({ groups: [], failures: [] })),
      client.describeHost().catch(() => undefined),
      client.listPluginInventory().catch(() => ({ entries: [] })),
    ]);
    settingsWritable = settingsResult.writable;
    settingsHasDocument = settingsResult.hasDocument;
    settingsNamespaces = settingsResult.namespaces;
    modelGroups = enrichModelGroups(modelGroups, settingsNamespaces);
    if (!selectedSettingsNs || !settingsNamespaces.some((item) => item.ns === selectedSettingsNs)) {
      selectedSettingsNs = settingsNamespaces[0]?.ns || "";
      settingsDraft = JSON.stringify(settingsNamespaces[0]?.user || {}, null, 2);
    }
    skills = skillResult.skills;
    agentPresets = agentResult.presets;
    agentAuthorable = agentResult.authorable;
    agentHasDocument = agentResult.hasDocument;
    providers = providerResult.providers;
    catalogGroups = catalogResult.groups;
    catalogFailures = catalogResult.failures;
    hostInfo = hostResult;
    pluginInventory = pluginResult.entries;
    subagents = subagentResult.entries;
    subagentParentAvailable = subagentResult.parentAvailable;
    if (!selectedSubagentId || !subagents.some((item) => item.id === selectedSubagentId)) selectedSubagentId = subagents.find((item) => item.kind === "child")?.id || "";
    credentialRefs = collectCredentialRefs(settingsNamespaces);
    credentials = credentialRefs.length
      ? (await client.describeCredentials(credentialRefs).catch(() => ({ credentials: {} }))).credentials
      : {};
  }

  async function createSession(cwd = workspacePath): Promise<void> {
    if (!client) return;
    const created = await client.createSession(cwd);
    await refresh();
    await selectSession(created.sessionId);
  }

  async function selectSession(sessionId: string): Promise<void> {
    if (!client) return;
    activeSessionId = sessionId;
    view = "conversation";
    pendingApproval = undefined;
    pendingQuestion = undefined;
    const [result, modelResult, settingsResult] = await Promise.all([
      client.history(sessionId),
      client.models(sessionId),
      client.describeSettings().catch(() => ({ writable: false, hasDocument: false, namespaces: [] })),
    ]);
    const transcript = foldHistory(result.events);
    messages = transcript.messages;
    todos = transcript.todos;
    settingsWritable = settingsResult.writable;
    settingsHasDocument = settingsResult.hasDocument;
    settingsNamespaces = settingsResult.namespaces;
    credentialRefs = collectCredentialRefs(settingsNamespaces);
    credentials = credentialRefs.length
      ? (await client.describeCredentials(credentialRefs).catch(() => ({ credentials: {} }))).credentials
      : {};
    modelGroups = enrichModelGroups(modelResult.groups, settingsNamespaces);
    selectedModel = `${modelResult.current.provider}/${modelResult.current.model}`;
    const currentInfo = modelResult.groups.find((group) => group.id === modelResult.current.provider)?.models.find((model) => model.id === modelResult.current.model);
    reasoningEffort = currentInfo?.reasoning?.efforts.some((effort) => effort.id === modelResult.current.reasoningEffort) ? (modelResult.current.reasoningEffort || "") : "";
    if (modelResult.current.reasoningEffort && !reasoningEffort) { try { await client.selectModel(sessionId, modelResult.current.provider, modelResult.current.model); } catch { /* 清理不兼容参数 */ } }
  }

  function sessionTitle(session: SessionSummary): string {
    const title = session.projections?.values?.title;
    return typeof title === "string" && title.trim() ? title : (session.cwd || "新会话").split(/[\\/]/).pop() || "新会话";
  }

  function goalProjection(session: SessionSummary | undefined): GoalProjection | undefined {
    const value = session?.projections?.values?.goal;
    if (!value || typeof value !== "object") return undefined;
    const projection = value as Partial<GoalProjection>;
    const goal = projection.goal;
    if (!goal || typeof goal.id !== "string" || typeof goal.revision !== "number" || typeof goal.objective !== "string") return undefined;
    return projection as GoalProjection;
  }

  function collectCredentialRefs(namespaces: SettingsNamespace[]): string[] {
    const refs: string[] = [];
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) { value.forEach(visit); return; }
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (key === "apiKeyEnv" && typeof child === "string" && child && !refs.includes(child)) refs.push(child);
        else visit(child);
      }
    };
    namespaces.forEach((namespace) => visit(namespace.value));
    return refs.sort();
  }

  function selectedModelInfo(): ModelGroup["models"][number] | undefined {
    const [provider, model] = selectedModel.split("/", 2);
    return modelGroups.find((group) => group.id === provider)?.models.find((item) => item.id === model);
  }

  function selectedProviderCredentialRef(): string | undefined {
    const provider = selectedModel.split("/", 1)[0];
    const ref = findProviderSettings(settingsNamespaces, provider)?.config.apiKeyEnv;
    return typeof ref === "string" && ref ? ref : undefined;
  }

  async function xgProviderSettings() {
    let providerSettings = findProviderSettings(settingsNamespaces, "xg-gomodel");
    if (providerSettings || !client) return providerSettings;
    const described = await client.describeSettings();
    settingsNamespaces = described.namespaces;
    return findProviderSettings(settingsNamespaces, "xg-gomodel");
  }

  async function requireConfiguredCredential(config: Record<string, unknown>): Promise<void> {
    const ref = typeof config.apiKeyEnv === "string" ? config.apiKeyEnv : "";
    if (!ref || !client) return;
    const described = await client.describeCredentials([ref]);
    credentials = { ...credentials, ...described.credentials };
    if (described.credentials[ref]?.configured) return;
    credentialRefDraft = ref;
    throw new Error(`请先保存 ${ref}，再从 192.168.1.47 刷新模型`);
  }

  async function applyXgModels(namespace: SettingsNamespace, models: Record<string, unknown>[]): Promise<void> {
    if (!client) return;
    const updated = await client.updateSettings(namespace.ns, { providers: { "xg-gomodel": { models } } }, namespace.revision);
    settingsNamespaces = settingsNamespaces.map((item) => item.ns === updated.ns ? updated : item);
    if (activeSessionId) {
      const sessionModels = await client.models(activeSessionId);
      modelGroups = enrichModelGroups(sessionModels.groups, settingsNamespaces);
      selectedModel = `${sessionModels.current.provider}/${sessionModels.current.model}`;
    }
    catalogGroups = (await client.listModelCatalog()).groups;
  }

  function handleFrame(frame: DshFrame): void {
    const payload = frame.payload;
    if (payload.type === "approval/requested") { pendingApproval = { rpcId: frame.rpcId, ...payload } as unknown as PendingApproval; sending = false; return; }
    if (payload.type === "question/requested") { pendingQuestion = { rpcId: frame.rpcId, ...payload } as unknown as PendingQuestion; sending = false; return; }
    if (payload.type === "approval/resolved" || payload.type === "question/resolved") { pendingApproval = undefined; pendingQuestion = undefined; return; }
    if (payload.type === "session/queue") return;
    if (payload.type === "session/jobs") return;
    if (payload.type === "session/projection") { void refresh(); return; }
    if (payload.type === "host/session-added" || payload.type === "host/session-status" || payload.type === "host/session-removed" || payload.type === "host/workspace-changed" || payload.type === "host/workspace-removed") { void refresh(); return; }
    if (payload.type === "host/agent-error") { runtimeError = payload.message || "DSH agent 运行失败"; sending = false; return; }
    if (payload.type !== "session/event" || payload.sessionId !== activeSessionId || !payload.event) return;
    const transcript = applyTranscriptEvent({ messages, todos }, payload.event, payload.view as Record<string, unknown> | undefined);
    messages = transcript.messages;
    todos = transcript.todos;
    if (payload.event.type === "assistant/message") {
      const assistantMessage = assistantMessageForEvent(transcript.messages, payload.event);
      captureCustomization(assistantMessage);
      captureSurfaceProposal(assistantMessage);
    }
    if (payload.event.type === "assistant/message" || payload.event.type === "turn/end") sending = false;
  }

  async function submit(): Promise<void> {
    const text = input.trim();
    if (!client || !activeSessionId || (!text && attachments.length === 0) || sending) return;
    const credentialRef = selectedProviderCredentialRef();
    if (credentialRef && !credentials[credentialRef]?.configured) {
      credentialRefDraft = credentialRef;
      runtimeError = `当前模型需要 ${credentialRef}。请先在“管理 > 设置与凭据”中保存凭据。`;
      openManagement("settings");
      return;
    }
    if (attachments.length > 0 && !(selectedModelInfo()?.input || []).includes("image")) {
      runtimeError = `当前模型 ${selectedModel || "未选择"} 不支持图片输入，请先选择支持多模态的模型。`;
      return;
    }
    input = ""; sending = true; view = "conversation";
    messages = [...messages, { id: `pending-${Date.now()}`, role: "user", text, pending: true }];
    const prompt = isSurfaceGenerationIntent(text)
      ? buildVoltSurfacePrompt(text)
      : isUiCustomizationIntent(text)
        ? buildUiCustomizationPrompt(text)
        : text;
    try {
      const content: PromptContentPart[] = [...(prompt ? [{ type: "text", text: prompt } satisfies PromptContentPart] : []), ...attachments];
      await client.prompt(activeSessionId, content);
      attachments = [];
    }
    catch (error) { sending = false; runtimeError = error instanceof Error ? error.message : String(error); }
  }

  async function cancel(): Promise<void> {
    if (!client || !activeSessionId) return;
    try { await client.cancel(activeSessionId); } finally { sending = false; }
  }

  async function chooseModel(provider: string, model: string): Promise<void> {
    if (!client || !activeSessionId || modelBusy) return;
    modelBusy = true;
    try {
      const result = await client.selectModel(activeSessionId, provider, model, reasoningEffort || undefined);
      selectedModel = `${result.selected.provider}/${result.selected.model}`;
      reasoningEffort = result.selected.reasoningEffort || "";
    } catch (error) { runtimeError = error instanceof Error ? error.message : String(error); }
    finally { modelBusy = false; }
  }

  function chooseModelValue(value: string): void {
    const selection = modelGroups
      .flatMap((group) => group.models.map((model) => ({ provider: group.id, model: model.id, value: `${group.id}/${model.id}` })))
      .find((item) => item.value === value);
    if (selection) void chooseModel(selection.provider, selection.model);
  }

  async function pickWorkspace(): Promise<void> {
    const selected = await window.voltDesktop?.pickWorkspace();
    if (!selected || !client) return;
    workspacePath = selected;
    await createSession(selected);
  }

  async function performManagementAction(key: string, action: () => Promise<void>): Promise<void> {
    if (managementBusy) return;
    managementBusy = key;
    managementError = "";
    managementNotice = "";
    try { await action(); }
    catch (error) { managementError = error instanceof Error ? error.message : String(error); }
    finally { managementBusy = ""; }
  }

  function beginSessionRename(session: SessionSummary): void {
    editingSessionId = session.sessionId;
    sessionTitleDraft = sessionTitle(session);
  }

  async function saveSessionRename(sessionId: string): Promise<void> {
    const title = sessionTitleDraft.trim();
    if (!client || !title) return;
    await performManagementAction(`session-rename:${sessionId}`, async () => {
      await client!.rename(sessionId, title);
      editingSessionId = "";
      await refresh();
      managementNotice = "会话名称已更新";
    });
  }

  async function duplicateSession(sessionId: string): Promise<void> {
    if (!client) return;
    await performManagementAction(`session-fork:${sessionId}`, async () => {
      const created = await client!.fork(sessionId);
      const source = sessions.find((item) => item.sessionId === sessionId);
      await client!.rename(created.sessionId, `${source ? sessionTitle(source) : "会话"} - 副本`);
      await refresh();
      await selectSession(created.sessionId);
      managementNotice = "会话已复制，并已添加“副本”后缀";
    });
  }

  async function forkSessionAtSeq(seq: number): Promise<void> {
    if (!client || !activeSessionId) return;
    await performManagementAction(`session-fork:${activeSessionId}:${seq}`, async () => {
      const created = await client!.fork(activeSessionId, seq);
      await refresh();
      await selectSession(created.sessionId);
      managementNotice = `已从事件 #${seq} 创建分支会话`;
    });
  }

  async function archiveManagedSession(sessionId: string): Promise<void> {
    if (!client) return;
    await performManagementAction(`session-archive:${sessionId}`, async () => {
      const wasActive = activeSessionId === sessionId;
      await client!.archiveSession(sessionId);
      await refresh();
      if (wasActive) {
        activeSessionId = "";
        messages = [];
        todos = [];
      }
      managementNotice = "会话已归档";
    });
  }

  async function exportSession(sessionId: string): Promise<void> {
    const api = window.voltDesktop;
    if (!api) return;
    await performManagementAction(`session-export:${sessionId}`, async () => {
      const result = await api.exportSession(sessionId);
      managementNotice = result.saved ? `会话已导出到 ${result.path}` : "已取消会话导出";
    });
  }

  async function previewAgentPreset(agentPreset: string): Promise<void> {
    if (!client) return;
    await performManagementAction(`agent-read:${agentPreset}`, async () => {
      const result = await client!.readAgentPreset(agentPreset);
      agentPreview = { id: result.agentPreset, content: result.content };
    });
  }

  async function chooseAgentPreset(agentPreset: string): Promise<void> {
    if (!client || !activeSessionId) return;
    await performManagementAction(`agent-select:${agentPreset}`, async () => {
      if (activeSession?.running) throw new Error("当前会话已开始，Agent 预设固定不变；请新建会话后再应用预设。");
      await client!.selectAgentPreset(activeSessionId, agentPreset);
      await refresh();
      managementNotice = "当前会话的 Agent 预设已更新";
    });
  }

  async function openAgentPresetDocument(agentPreset: string): Promise<void> {
    if (!client) return;
    await performManagementAction(`agent-open:${agentPreset}`, async () => {
      const preset = agentPresets.find((item) => item.id === agentPreset);
      if (preset?.trust === "system") throw new Error("官方 Agent 预设为只读，请先复制为用户预设后再编辑。");
      const result = await client!.openAgentPresetDocument(agentPreset);
      managementNotice = result.opened ? "已打开 Agent 配置文件" : `配置文件位于 ${result.path}`;
    });
  }

  async function copyAgentPreset(agentPreset: AgentPreset): Promise<void> {
    if (!client || agentPreset.trust !== "user") return;
    const name = copyAgentNameDraft.trim();
    await performManagementAction(`agent-copy:${agentPreset.id}`, async () => {
      await client!.copyAgentPreset("user", agentPreset.id, name || undefined);
      copyingAgentPreset = "";
      copyAgentNameDraft = "";
      await refreshManagement();
      managementNotice = "Agent 预设已复制";
    });
  }

  async function removeAgentPreset(agentPreset: AgentPreset): Promise<void> {
    if (!client || agentPreset.trust !== "user" || agentPreset.isDefault) return;
    await performManagementAction(`agent-remove:${agentPreset.id}`, async () => {
      await client!.removeAgentPreset(agentPreset.id);
      confirmingAgentPreset = "";
      await refreshManagement();
      managementNotice = "用户 Agent 预设已移除";
    });
  }

  function beginWorkspaceRename(workspace: Workspace): void {
    editingWorkspaceId = workspace.workspaceId;
    workspaceTitleDraft = workspace.title;
    confirmingWorkspaceId = "";
  }

  async function saveWorkspaceRename(workspaceId: string): Promise<void> {
    const title = workspaceTitleDraft.trim();
    if (!client || !title) return;
    await performManagementAction(`workspace-rename:${workspaceId}`, async () => {
      await client!.renameWorkspace(workspaceId, title);
      editingWorkspaceId = "";
      await refresh();
      managementNotice = "工作区名称已更新";
    });
  }

  async function enterWorkspace(workspace: Workspace): Promise<void> {
    workspacePath = workspace.path;
    const sessionId = workspace.sessionIds.find((id) => sessions.some((item) => item.sessionId === id));
    if (sessionId) await selectSession(sessionId);
    else await createSession(workspace.path);
  }

  async function openWorkspacePath(workspace: Workspace): Promise<void> {
    if (!client) return;
    await performManagementAction(`workspace-open:${workspace.workspaceId}`, async () => {
      await client!.openPath(workspace.path);
      managementNotice = "已在资源管理器中打开工作区";
    });
  }

  async function removeWorkspace(workspaceId: string): Promise<void> {
    if (!client) return;
    await performManagementAction(`workspace-delete:${workspaceId}`, async () => {
      await client!.deleteWorkspace(workspaceId);
      confirmingWorkspaceId = "";
      await refresh();
      managementNotice = "工作区注册已移除，磁盘文件未删除";
    });
  }

  async function moveWorkspace(workspaceId: string, direction: -1 | 1): Promise<void> {
    if (!client) return;
    const index = workspaces.findIndex((item) => item.workspaceId === workspaceId);
    if (index < 0 || index + direction < 0 || index + direction >= workspaces.length) return;
    const beforeWorkspaceId = direction < 0 ? workspaces[index - 1]?.workspaceId : workspaces[index + 2]?.workspaceId;
    await performManagementAction(`workspace-order:${workspaceId}`, async () => {
      await client!.insertWorkspaceBefore(workspaceId, beforeWorkspaceId);
      await refresh();
      managementNotice = "工作区顺序已更新";
    });
  }

  async function moveWorkspaceSession(workspace: Workspace, sessionId: string, direction: -1 | 1): Promise<void> {
    if (!client) return;
    const index = workspace.sessionIds.indexOf(sessionId);
    if (index < 0 || index + direction < 0 || index + direction >= workspace.sessionIds.length) return;
    const beforeSessionId = direction < 0 ? workspace.sessionIds[index - 1] : workspace.sessionIds[index + 2];
    await performManagementAction(`session-order:${sessionId}`, async () => {
      await client!.insertSessionBefore(workspace.workspaceId, sessionId, beforeSessionId);
      await refresh();
      managementNotice = "会话顺序已更新";
    });
  }

  function beginGoalEdit(): void {
    if (!currentGoal) return;
    editingGoal = true;
    goalObjectiveDraft = currentGoal.goal.objective;
    goalRoundsDraft = String(currentGoal.goal.maxGoalRounds);
  }

  async function saveGoal(): Promise<void> {
    if (!client || !activeSessionId) return;
    const objective = goalObjectiveDraft.trim();
    const maxGoalRounds = Number.parseInt(goalRoundsDraft, 10);
    if (!objective || !Number.isFinite(maxGoalRounds) || maxGoalRounds < 1) return;
    await performManagementAction("goal-save", async () => {
      const existing = currentGoal;
      if (existing) await client!.editGoal(activeSessionId, { id: existing.goal.id, revision: existing.goal.revision }, objective, maxGoalRounds);
      else await client!.createGoal(activeSessionId, objective, maxGoalRounds);
      editingGoal = false;
      await refresh();
      managementNotice = existing ? "目标已更新" : "目标已创建";
    });
  }

  async function mutateGoal(action: "pause" | "resume" | "complete" | "clear"): Promise<void> {
    if (!client || !activeSessionId || !currentGoal) return;
    await performManagementAction("goal-" + action, async () => {
      const ref = { id: currentGoal.goal.id, revision: currentGoal.goal.revision };
      if (action === "pause") await client!.pauseGoal(activeSessionId, ref);
      if (action === "resume") await client!.resumeGoal(activeSessionId, ref);
      if (action === "complete") await client!.completeGoal(activeSessionId, ref);
      if (action === "clear") await client!.clearGoal(activeSessionId, ref);
      confirmingGoalClear = false;
      await refresh();
      managementNotice = action === "clear" ? "目标已清除" : "目标状态已更新";
    });
  }

  async function selectSubagent(entry: SubagentEntry): Promise<void> {
    if (entry.kind !== "child" || !client || !activeSessionId) return;
    selectedSubagentId = entry.id;
    await performManagementAction("subagent-history:" + entry.id, async () => {
      const result = await client!.subagentHistory(activeSessionId, entry.id, entry.mode);
      subagentMessages = foldHistory(result.events).messages;
    });
  }

  async function promptSelectedSubagent(): Promise<void> {
    const text = subagentPromptDraft.trim();
    if (!client || !activeSessionId || !selectedSubagent || selectedSubagent.kind !== "child" || selectedSubagent.mode !== "continuable" || !text) return;
    await performManagementAction("subagent-prompt:" + selectedSubagent.id, async () => {
      await client!.promptSubagent(activeSessionId, selectedSubagent.id, text);
      subagentPromptDraft = "";
      await refreshManagement();
      managementNotice = "子 Agent 已收到继续指令";
    });
  }

  async function interruptSelectedSubagent(): Promise<void> {
    if (!client || !activeSessionId || !selectedSubagent || selectedSubagent.kind !== "child" || selectedSubagent.mode !== "continuable") return;
    await performManagementAction("subagent-interrupt:" + selectedSubagent.id, async () => {
      await client!.interruptSubagent(activeSessionId, selectedSubagent.id);
      await refreshManagement();
      managementNotice = "已发送停止信号";
    });
  }

  function selectedSettingsNamespace(): SettingsNamespace | undefined {
    return settingsNamespaces.find((item) => item.ns === selectedSettingsNs) || settingsNamespaces[0];
  }

  function selectSettingsNamespace(ns: string): void {
    selectedSettingsNs = ns;
    const namespace = settingsNamespaces.find((item) => item.ns === ns);
    settingsDraft = JSON.stringify(namespace?.user || {}, null, 2);
  }

  async function saveSettingsNamespace(): Promise<void> {
    const namespace = selectedSettingsNamespace();
    if (!client || !namespace || !settingsWritable) return;
    let patchValue: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(settingsDraft);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("设置必须是 JSON 对象");
      patchValue = parsed as Record<string, unknown>;
    } catch (error) {
      managementError = error instanceof Error ? error.message : String(error);
      return;
    }
    await performManagementAction("settings-update:" + namespace.ns, async () => {
      const updated = await client!.updateSettings(namespace.ns, patchValue, namespace.revision);
      settingsNamespaces = settingsNamespaces.map((item) => item.ns === updated.ns ? updated : item);
      settingsDraft = JSON.stringify(updated.user || {}, null, 2);
      managementNotice = updated.applies === "restart" ? "设置已保存，重启后生效" : "设置已保存";
    });
  }

  async function openSettingsDocument(): Promise<void> {
    if (!client || !settingsHasDocument) return;
    await performManagementAction("settings-open-document", async () => {
      await client!.openSettingsDocument();
      managementNotice = "已打开设置文件";
    });
  }

  async function refreshXgGatewayModels(): Promise<void> {
    if (!client) return;
    await performManagementAction("models-discover:xg-gomodel", async () => {
      const providerSettings = await xgProviderSettings();
      if (!providerSettings) throw new Error("官方 DSH 未返回 xg-gomodel 配置");
      const { namespace, config } = providerSettings;
      await requireConfiguredCredential(config);
      const baseURL = typeof config.baseURL === "string" ? config.baseURL : "";
      if (!baseURL) throw new Error("xg-gomodel 未配置 Base URL");
      const discovered = await client!.discoverModels({
        settingsNs: namespace.ns,
        provider: "xg-gomodel",
        baseURL,
        ...(typeof config.api === "string" ? { api: config.api } : {}),
      });
      if (discovered.models.length === 0) throw new Error("192.168.1.47 未返回任何模型");
      if (!discovered.models.some((model) => model.id === "vlm")) throw new Error("网关模型目录缺少默认模型 vlm，已拒绝覆盖当前配置");
      const merged = mergeDiscoveredModels(discovered.models, config.models);
      unknownModelCapabilities = merged.unknownCapabilities;
      await applyXgModels(namespace, merged.models);
      managementNotice = `已从 192.168.1.47 刷新 ${discovered.models.length} 个模型`;
    });
  }

  async function saveCredential(): Promise<void> {
    const ref = credentialRefDraft.trim();
    const value = credentialValueDraft;
    if (!client || !ref || !value || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)) return;
    await performManagementAction("credential-set:" + ref, async () => {
      await client!.setCredential(ref, value);
      credentialValueDraft = "";
      credentials = { ...credentials, ...(await client!.describeCredentials([ref])).credentials };
      if (!credentialRefs.includes(ref)) credentialRefs = [...credentialRefs, ref].sort();
      managementNotice = "凭据已保存，实际值不会回显";
    });
    if (ref === "XG_GOMODEL_API_KEY" && credentials[ref]?.configured) await refreshXgGatewayModels();
  }

  async function unsetCredential(ref: string): Promise<void> {
    if (!client) return;
    await performManagementAction("credential-unset:" + ref, async () => {
      await client!.unsetCredential(ref);
      credentials = { ...credentials, ...(await client!.describeCredentials([ref])).credentials };
      confirmingCredentialRef = "";
      managementNotice = "凭据已从可写层移除";
    });
  }

  async function respondApproval(outcome: "allowed-once" | "rejected"): Promise<void> {
    if (!client || !pendingApproval) return;
    await client.respond({ type: "client-response", rpcId: pendingApproval.rpcId, result: { ok: true, value: { sessionId: pendingApproval.sessionId, approvalId: pendingApproval.approvalId, outcome } } });
  }

  async function respondQuestion(): Promise<void> {
    if (!client || !pendingQuestion) return;
    const answers = pendingQuestion.questions.map((item) => ({ id: String(item.id), selected: questionAnswers[String(item.id)] ? [questionAnswers[String(item.id)]] : [], custom: questionAnswers[`${String(item.id)}:custom`] || undefined }));
    await client.respond({ type: "client-response", rpcId: pendingQuestion.rpcId, result: { ok: true, value: { sessionId: pendingQuestion.sessionId, answer: { answers } } } });
  }

  function formatTime(value: number): string { return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(value); }
  function managementTitle(tab: ManagementTab): string {
    const titles: Record<ManagementTab, string> = {
      overview: "系统总览",
      sessions: "会话管理",
      goals: "目标控制",
      subagents: "子 Agent",
      agents: "Agent 预设",
      models: "模型与推理",
      workspaces: "工作区与资源",
      mounts: "SMB 共享",
      plugins: "插件与 MCP",
      knowledge: "知识库与资料",
      settings: "设置与凭据",
      runtime: "运行诊断",
    };
    return titles[tab];
  }
  function agentPresetLabel(preset: AgentPreset): string { return preset.name?.trim() || preset.id; }
  function goalPhaseLabel(phase: GoalProjection["goal"]["phase"]): string {
    return { active: "进行中", paused: "已暂停", blocked: "已阻塞", complete: "已完成" }[phase];
  }
  function subagentLabel(entry: SubagentEntry): string {
    if (entry.kind === "diagnostic") return entry.id;
    return entry.label?.trim() || "子 Agent " + entry.id.slice(0, 8);
  }
  function subagentStatusLabel(entry: SubagentEntry): string {
    if (entry.kind === "diagnostic") return "诊断：" + entry.reason;
    return (entry.mode === "continuable" ? "可继续" : "一次性") + " · " + (entry.activity === "running" ? "运行中" : "未运行");
  }
  function credentialSummary(ref: string): string {
    const credential = credentials[ref];
    return credential?.configured ? "已配置 · " + (credential.source || "可写层") : "未配置";
  }
  function openManagement(tab: ManagementTab): void {
    managementTab = tab;
    view = "settings";
    managementError = "";
    managementNotice = "";
    void refreshManagement();
  }
  function openKnowledge(): void {
    view = "knowledge";
    managementError = "";
    managementNotice = "";
    void refreshManagement();
  }
  function openKnowledgePrompt(prompt: string): void { input = prompt; view = "conversation"; }
  function knowledgeStatusLabel(): string { return skills.length > 0 ? "官方 Skill 知识源已加载" : "等待官方知识插件"; }
  function permissionNotice(message: string): void { managementNotice = message; }
  async function handlePaste(event: ClipboardEvent): Promise<void> {
    const files = event.clipboardData?.files;
    if (!files?.length) return;
    const supported = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
    const next: Extract<PromptContentPart, { type: "image" }>[] = [];
    for (const file of Array.from(files)) {
      if (!supported.has(file.type) || file.size > 10 * 1024 * 1024) continue;
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || "");
        reader.onerror = () => reject(reader.error || new Error("图片读取失败"));
        reader.readAsDataURL(file);
      });
      if (data) next.push({ type: "image", mediaType: file.type as Extract<PromptContentPart, { type: "image" }>["mediaType"], data, name: file.name });
    }
    if (next.length) attachments = [...attachments, ...next];
  }
</script>

<svelte:head><title>{productName}</title></svelte:head>
<svelte:window onpaste={(event) => void handlePaste(event)} />

{#if loading}
  <main class="loading-screen"><LoaderCircle class="animate-spin" size={24} /><span>正在连接官方 DSH…</span></main>
{:else}
  <main class="app-shell" class:compact={customization.density === "compact"}>
    <header class="topbar">
      <div class="brand"><span class="brand-mark"><Bot size={16} /></span><strong>{productName}</strong><span class="version-label">v{appVersion}</span><span class:offline={!!runtimeError} class="status-dot"></span><span class="status-copy">{runtimeError ? "运行异常" : "官方 DSH"}</span></div>
      <div class="topbar-center"><span class="topbar-workspace"><FolderOpen size={13} />{workspaceName}</span>{#if activeSession}<span class="topbar-separator">/</span><span>{sessionTitle(activeSession)}</span>{/if}</div>
    </header>
    <div class:management-active={view === "settings"} class="workspace-layout">
      <aside class:collapsed={sidebarCollapsed} class="sidebar">
        <div class="sidebar-toolbar"><Button variant="ghost" size="icon-sm" aria-label="折叠侧栏" onclick={() => setSidebarCollapsed(!sidebarCollapsed)}>{#if sidebarCollapsed}<PanelLeftOpen size={16} />{:else}<PanelLeftClose size={16} />{/if}</Button>{#if !sidebarCollapsed}<Button variant="ghost" size="icon-sm" aria-label="新建会话" onclick={() => void createSession()}><MessageSquarePlus size={16} /></Button>{/if}</div>
        {#if !sidebarCollapsed}
          <div class="workspace-picker"><div class="section-label">工作区</div><button class="workspace-row" onclick={() => void pickWorkspace()}><FolderOpen size={15} /><span title={workspacePath}>{workspaceName}</span><ChevronRight size={14} /></button></div>
          <div class="sidebar-search"><Search size={14} /><input aria-label="搜索会话" placeholder="搜索会话" bind:value={sessionQuery} /></div>
          <Separator />
          <div class="session-list"><div class="section-label section-row"><span>会话</span><span class="count-badge">{filteredSessions.length}</span></div>{#if filteredSessions.length === 0}<div class="sidebar-empty"><MessageSquarePlus size={16} /><span>还没有会话</span><small>点击上方按钮新建会话</small></div>{:else}{#each filteredSessions as session (session.sessionId)}<button class:active={session.sessionId === activeSessionId} class="session-row" onclick={() => void selectSession(session.sessionId)}><span class="session-state" class:running={session.running}></span><span class="session-copy"><strong>{sessionTitle(session)}</strong><small>{session.cwd || workspaceName}</small></span><time>{formatTime(session.updatedAt)}</time></button>{/each}{/if}</div>
          <div class="sidebar-footer"><Button variant="ghost" class={`footer-button${view === "knowledge" ? " active" : ""}`} onclick={() => openKnowledge()}><BookOpen size={15} />知识库</Button><Button variant="ghost" class="footer-button" onclick={() => openManagement("overview")}><Settings2 size={15} />管理</Button><Button variant="ghost" class="footer-button" onclick={() => setActivityOpen(!activityOpen)}><History size={15} />活动记录<span class="footer-spacer"></span><ChevronDown class={!activityOpen ? "rotated" : ""} size={14} /></Button></div>
        {/if}
      </aside>
      <section class="content-area">
        {#if view === "settings"}
          <div class="management-page">
            <header class="management-header"><div><div class="eyebrow">暗涌管理</div><h1>管理工作台</h1><p>按领域管理模型、工作区、知识来源和运行状态。</p></div><Button variant="outline" size="sm" onclick={() => view = "conversation"}><ChevronRight class="rotate-180" size={14} />返回会话</Button></header>
            <div class="management-body">
              <nav class="management-nav" aria-label="管理分区"><button class:active={managementTab === "overview"} onclick={() => managementTab = "overview"}><ClipboardList size={15} /><span>总览</span></button><button class:active={managementTab === "sessions"} onclick={() => managementTab = "sessions"}><MessageSquare size={15} /><span>会话</span></button><button class:active={managementTab === "goals"} onclick={() => managementTab = "goals"}><Target size={15} /><span>目标</span></button><button class:active={managementTab === "subagents"} onclick={() => managementTab = "subagents"}><Network size={15} /><span>子 Agent</span></button><button class:active={managementTab === "agents"} onclick={() => managementTab = "agents"}><UserRoundCog size={15} /><span>Agent 预设</span></button><button class:active={managementTab === "models"} onclick={() => managementTab = "models"}><Bot size={15} /><span>模型与推理</span></button><button class:active={managementTab === "workspaces"} onclick={() => managementTab = "workspaces"}><FolderOpen size={15} /><span>工作区</span></button><button class:active={managementTab === "mounts"} onclick={() => managementTab = "mounts"}><HardDrive size={15} /><span>SMB 共享</span></button><button class:active={managementTab === "plugins"} onclick={() => managementTab = "plugins"}><PlugZap size={15} /><span>插件与 MCP</span></button><button class:active={managementTab === "knowledge"} onclick={() => managementTab = "knowledge"}><BookOpen size={15} /><span>知识库</span></button><button class:active={managementTab === "settings"} onclick={() => managementTab = "settings"}><Settings2 size={15} /><span>设置与凭据</span></button><button class:active={managementTab === "runtime"} onclick={() => managementTab = "runtime"}><ShieldAlert size={15} /><span>运行诊断</span></button></nav>
              <section class="management-content">
                <div class="management-toolbar"><div class="section-label">{managementTitle(managementTab)}</div><div class="settings-filter"><Search size={14} /><Input aria-label="筛选管理内容" placeholder="筛选管理内容" bind:value={settingsQuery} /></div></div>
                {#if managementError}<div class="management-feedback error"><CircleAlert size={14} /><span>{managementError}</span><button aria-label="关闭管理错误" onclick={() => managementError = ""}><X size={13} /></button></div>{/if}
                {#if managementNotice}<div class="management-feedback success"><CircleCheck size={14} /><span>{managementNotice}</span><button aria-label="关闭管理提示" onclick={() => managementNotice = ""}><X size={13} /></button></div>{/if}
                {#if managementTab === "overview"}
                  <div class="management-summary-grid"><button onclick={() => managementTab = "sessions"}><span class="summary-icon"><MessageSquare size={16} /></span><strong>会话管理</strong><small>{sessions.length} 个活跃会话，{archivedSessionIds.length} 个已归档</small></button><button onclick={() => managementTab = "goals"}><span class="summary-icon"><Target size={16} /></span><strong>目标</strong><small>{currentGoal ? goalPhaseLabel(currentGoal.goal.phase) : "当前会话暂无目标"}</small></button><button onclick={() => managementTab = "subagents"}><span class="summary-icon"><Network size={16} /></span><strong>子 Agent</strong><small>{subagents.filter((item) => item.kind === "child").length} 个直接子 Agent</small></button><button onclick={() => managementTab = "agents"}><span class="summary-icon"><UserRoundCog size={16} /></span><strong>Agent 预设</strong><small>{agentPresets.length} 个可用预设</small></button><button onclick={() => managementTab = "models"}><span class="summary-icon"><Bot size={16} /></span><strong>模型与推理</strong><small>{selectedModel || "尚未选择模型"}</small></button><button onclick={() => managementTab = "workspaces"}><span class="summary-icon"><FolderOpen size={16} /></span><strong>工作区</strong><small>{workspaces.length} 个已注册工作区</small></button><button onclick={() => managementTab = "knowledge"}><span class="summary-icon"><BookOpen size={16} /></span><strong>知识库</strong><small>{knowledgeStatusLabel()}</small></button><button onclick={() => managementTab = "settings"}><span class="summary-icon"><Settings2 size={16} /></span><strong>设置与凭据</strong><small>{settingsNamespaces.length} 个命名空间，{credentialRefs.length} 个凭据引用</small></button><button onclick={() => managementTab = "runtime"}><span class="summary-icon"><ShieldAlert size={16} /></span><strong>运行状态</strong><small>{runtimeError ? "连接异常" : "官方 DSH 正常"}</small></button></div>
                  <SettingsGroup title="当前会话" description="会话状态、模型和工作区来自官方 DSH 实时状态。"><div class="diagnostic-row"><span>会话</span><strong>{activeSession ? sessionTitle(activeSession) : "未选择"}</strong></div><div class="diagnostic-row"><span>工作区</span><strong>{workspacePath || "未选择"}</strong></div><div class="diagnostic-row"><span>模型</span><strong>{selectedModel || "默认模型"}</strong></div></SettingsGroup>
                {:else if managementTab === "sessions"}
                  <SettingsGroup title="会话管理" description="重命名、复制和归档都直接写入官方 DSH。"><div class="management-actions"><Button size="sm" onclick={() => void createSession()}><MessageSquarePlus size={14} />新建会话</Button><Button variant="outline" size="sm" onclick={() => void refresh()}><History size={14} />刷新</Button></div>{#if filteredManagementSessions.length === 0}<DataState state="empty" title="没有匹配的会话" description="调整筛选条件或新建一个会话。" />{:else}<div class="management-list">{#each filteredManagementSessions as item (item.sessionId)}<div class="management-list-row session-management-row"><span class="row-icon"><MessageSquare size={15} /></span><div>{#if editingSessionId === item.sessionId}<Input class="inline-edit-input" aria-label="会话名称" bind:value={sessionTitleDraft} onkeydown={(event) => { if (event.key === "Enter") void saveSessionRename(item.sessionId); if (event.key === "Escape") editingSessionId = ""; }} />{:else}<strong>{sessionTitle(item)}</strong><small>{item.cwd || workspaceName} · {item.agentPreset || "默认 Agent"}</small>{/if}</div>{#if editingSessionId === item.sessionId}<div class="row-actions"><Button size="sm" disabled={!!managementBusy} onclick={() => void saveSessionRename(item.sessionId)}><Check size={13} />保存</Button><Button variant="ghost" size="sm" onclick={() => editingSessionId = ""}>取消</Button></div>{:else}<div class="row-actions"><Button variant="ghost" size="icon-sm" aria-label="打开会话" title="打开会话" onclick={() => void selectSession(item.sessionId)}><ExternalLink size={14} /></Button><Button variant="ghost" size="icon-sm" aria-label="重命名会话" title="重命名会话" onclick={() => beginSessionRename(item)}><Pencil size={14} /></Button><Button variant="ghost" size="icon-sm" aria-label="复制会话" title="复制会话" disabled={!!managementBusy} onclick={() => void duplicateSession(item.sessionId)}><Copy size={14} /></Button><Button variant="ghost" size="icon-sm" aria-label="导出会话" title="导出会话" disabled={!!managementBusy} onclick={() => void exportSession(item.sessionId)}><Save size={14} /></Button><Button variant="ghost" size="icon-sm" aria-label="归档会话" title="归档会话" disabled={!!managementBusy} onclick={() => void archiveManagedSession(item.sessionId)}><Archive size={14} /></Button></div>{/if}</div>{/each}</div>{/if}</SettingsGroup>
                  <SettingsGroup title="检查点与分支" description="官方 checkpoint policy 自动保证持久化；回到历史位置使用 DSH 的非破坏性 fork-at-seq。"><div class="management-actions"><StatusBadge status={pluginInventory.some((item) => item.moduleName.includes("session-checkpoint-policy") && item.fiberPhase === "active") ? "success" : "neutral"} label={pluginInventory.some((item) => item.moduleName.includes("session-checkpoint-policy") && item.fiberPhase === "active") ? "自动检查点已启用" : "未检测到活动检查点策略"} /></div>{#if messages.some((message) => typeof message.seq === "number")}<div class="management-list">{#each messages.filter((message) => typeof message.seq === "number").slice(-20).reverse() as message (message.id)}<div class="management-list-row"><span class="row-icon"><GitBranch size={14} /></span><div><strong>事件 #{message.seq}</strong><small>{message.role === "assistant" ? "Agent" : message.role === "user" ? "用户" : "工具"} · {(message.text || message.tool?.name || "事件").slice(0, 80)}</small></div><Button variant="ghost" size="sm" disabled={!!managementBusy} onclick={() => void forkSessionAtSeq(message.seq!)}><GitBranch size={13} />从此分支</Button></div>{/each}</div>{:else}<DataState state="empty" title="暂无可分支事件" description="当前会话产生历史事件后，可以从指定序号创建新会话。" />{/if}</SettingsGroup>
                {:else if managementTab === "agents"}
                  <SettingsGroup title="Agent 预设" description="选择当前会话的官方 Agent 预设，或查看它的真实配置内容。"><div class="management-actions"><Button variant="outline" size="sm" onclick={() => void refreshManagement()}><History size={14} />刷新预设</Button>{#if agentAuthorable && agentHasDocument}<span class="management-capability">支持用户配置</span>{/if}</div>{#if filteredAgentPresets.length === 0}<DataState state="empty" title="暂无 Agent 预设" description="官方 DSH 尚未返回可用预设。" />{:else}<div class="management-list">{#each filteredAgentPresets as preset (preset.id)}<div class="management-list-row agent-management-row"><span class="row-icon"><UserRoundCog size={15} /></span><div><strong>{agentPresetLabel(preset)}{#if preset.isDefault}<span class="default-badge">默认</span>{/if}</strong><small>{preset.description || preset.id} · {preset.trust === "system" ? "系统" : "用户"}{#if preset.broken} · {preset.broken}{/if}</small></div><div class="row-actions"><Button variant="ghost" size="sm" disabled={!activeSessionId || !!preset.broken || !!managementBusy} onclick={() => void chooseAgentPreset(preset.id)}>{activeSession?.agentPreset === preset.id ? "当前" : "应用"}</Button><Button variant="ghost" size="icon-sm" aria-label="查看 Agent 配置" title="查看 Agent 配置" disabled={!!managementBusy} onclick={() => void previewAgentPreset(preset.id)}><FileText size={14} /></Button><Button variant="ghost" size="icon-sm" aria-label="打开 Agent 配置文件" title="打开 Agent 配置文件" disabled={!!managementBusy} onclick={() => void openAgentPresetDocument(preset.id)}><ExternalLink size={14} /></Button></div></div>{/each}</div>{/if}{#if agentPreview}<div class="agent-preview"><div class="agent-preview-heading"><strong>{agentPreview.id}</strong><Button variant="ghost" size="icon-sm" aria-label="关闭预览" onclick={() => agentPreview = undefined}><X size={14} /></Button></div><pre>{agentPreview.content}</pre></div>{/if}</SettingsGroup>
                  {#if agentAuthorable}<SettingsGroup title="用户预设维护" description="复制和删除只调用官方 Agent preset API；系统预设和默认预设不可删除。"><div class="agent-preset-maintenance"><select aria-label="选择用户 Agent 预设" bind:value={copyingAgentPreset}><option value="">选择用户预设…</option>{#each agentPresets.filter((preset) => preset.trust === "user") as preset (preset.id)}<option value={preset.id}>{agentPresetLabel(preset)}</option>{/each}</select><Input aria-label="副本名称" bind:value={copyAgentNameDraft} placeholder="可选的新名称" /><Button size="sm" disabled={!copyingAgentPreset || !!managementBusy} onclick={() => { const preset = agentPresets.find((item) => item.id === copyingAgentPreset); if (preset) void copyAgentPreset(preset); }}><Copy size={13} />复制</Button>{#if copyingAgentPreset && agentPresets.find((item) => item.id === copyingAgentPreset)?.isDefault !== true}{#if confirmingAgentPreset === copyingAgentPreset}<Button variant="destructive" size="sm" disabled={!!managementBusy} onclick={() => { const preset = agentPresets.find((item) => item.id === copyingAgentPreset); if (preset) void removeAgentPreset(preset); }}><Trash2 size={13} />确认删除</Button><Button variant="ghost" size="sm" onclick={() => confirmingAgentPreset = ""}>取消</Button>{:else}<Button variant="ghost" size="sm" onclick={() => confirmingAgentPreset = copyingAgentPreset}><Trash2 size={13} />删除</Button>{/if}{/if}</div></SettingsGroup>{/if}
                {:else if managementTab === "goals"}
                  <SettingsGroup title="目标控制" description="目标状态来自当前会话 projection，写操作使用官方 DSH 的 revision。"><div class="management-actions"><Button size="sm" onclick={() => { if (currentGoal) beginGoalEdit(); else { editingGoal = true; goalObjectiveDraft = ""; goalRoundsDraft = "256"; } }}><Target size={14} />{currentGoal ? "编辑目标" : "创建目标"}</Button>{#if currentGoal && currentGoal.goal.phase === "active"}<Button variant="outline" size="sm" disabled={!!managementBusy} onclick={() => void mutateGoal("pause")}><Pause size={14} />暂停</Button>{:else if currentGoal && (currentGoal.goal.phase === "paused" || currentGoal.goal.phase === "blocked")}<Button variant="outline" size="sm" disabled={!!managementBusy} onclick={() => void mutateGoal("resume")}><Play size={14} />恢复</Button>{/if}{#if currentGoal && currentGoal.goal.phase !== "complete"}<Button variant="outline" size="sm" disabled={!!managementBusy} onclick={() => void mutateGoal("complete")}><Check size={14} />完成</Button>{/if}{#if currentGoal}{#if confirmingGoalClear}<Button variant="destructive" size="sm" disabled={!!managementBusy} onclick={() => void mutateGoal("clear")}><Trash2 size={13} />确认清除</Button><Button variant="ghost" size="sm" onclick={() => confirmingGoalClear = false}>取消</Button>{:else}<Button variant="ghost" size="icon-sm" aria-label="清除目标" title="清除目标" onclick={() => confirmingGoalClear = true}><Trash2 size={14} /></Button>{/if}{/if}</div>{#if editingGoal}<div class="goal-editor"><label>目标内容<Input aria-label="目标内容" bind:value={goalObjectiveDraft} placeholder="描述需要持续推进的目标" /></label><label>最大轮次<Input aria-label="最大轮次" type="number" min="1" bind:value={goalRoundsDraft} /></label><div class="row-actions"><Button size="sm" disabled={!!managementBusy} onclick={() => void saveGoal()}><Save size={13} />保存</Button><Button variant="ghost" size="sm" onclick={() => editingGoal = false}>取消</Button></div></div>{/if}{#if currentGoal}<div class="goal-status-grid"><div><span>状态</span><strong>{goalPhaseLabel(currentGoal.goal.phase)}</strong></div><div><span>轮次</span><strong>{currentGoal.roundsStarted} / {currentGoal.goal.maxGoalRounds}</strong></div><div><span>版本</span><strong>{currentGoal.goal.revision}</strong></div></div><div class="goal-objective">{currentGoal.goal.objective}</div>{#if currentGoal.goal.blockedReason}<div class="knowledge-note"><CircleAlert size={14} /><span>{String(currentGoal.goal.blockedReason)}</span></div>{/if}{:else}<DataState state="empty" title="当前会话暂无目标" description="创建一个目标后，官方 DSH 会持续记录状态与轮次。" />{/if}</SettingsGroup>
                {:else if managementTab === "subagents"}
                  <SettingsGroup title="子 Agent" description="查看直接子 Agent 的历史，并向可继续的子 Agent 发送后续指令。"><div class="management-actions"><Button variant="outline" size="sm" onclick={() => void refreshManagement()}><History size={14} />刷新子 Agent</Button><span class="management-capability">{subagentParentAvailable ? "父会话可用" : "父会话不可用"}</span></div>{#if subagents.length === 0}<DataState state="empty" title="暂无子 Agent" description="当前会话尚未产生直接子 Agent。" />{:else}<div class="management-list">{#each subagents as entry (entry.id)}<div class:chosen={entry.id === selectedSubagentId} class="management-list-row subagent-management-row"><span class="row-icon"><Network size={15} /></span><div><strong>{subagentLabel(entry)}</strong><small>{subagentStatusLabel(entry)}</small></div>{#if entry.kind === "child"}<div class="row-actions"><Button variant="ghost" size="sm" onclick={() => void selectSubagent(entry)}>查看历史</Button>{#if entry.mode === "continuable" && entry.activity === "running"}<Button variant="ghost" size="icon-sm" aria-label="停止子 Agent" title="停止子 Agent" disabled={!!managementBusy} onclick={() => { selectedSubagentId = entry.id; void interruptSelectedSubagent(); }}><Square size={14} /></Button>{/if}</div>{/if}</div>{/each}</div>{/if}{#if selectedSubagent && selectedSubagent.kind === "child"}<div class="subagent-history"><div class="agent-preview-heading"><strong>{subagentLabel(selectedSubagent)} 的历史</strong><span class="management-capability">{selectedSubagent.mode === "continuable" ? "可继续" : "一次性"}</span></div>{#if subagentMessages.length === 0}<DataState state="empty" title="暂无历史消息" description="子 Agent 尚未产生可展示的消息。" />{:else}{#each subagentMessages as message (message.id)}<article class="subagent-message"><div class="message-meta"><strong>{message.role === "assistant" ? "Agent" : message.role === "user" ? "用户" : "工具"}</strong></div><div class="message-text">{message.text}</div></article>{/each}{/if}{#if selectedSubagent.mode === "continuable"}<div class="subagent-composer"><Input aria-label="继续指令" bind:value={subagentPromptDraft} placeholder="向子 Agent 发送后续指令" onkeydown={(event) => { if (event.key === "Enter") void promptSelectedSubagent(); }} /><Button size="sm" disabled={!subagentPromptDraft.trim() || !!managementBusy} onclick={() => void promptSelectedSubagent()}><Send size={13} />发送</Button></div>{/if}</div>{/if}</SettingsGroup>
                {:else if managementTab === "models"}
                  <SettingsGroup title="模型目录" description="会话模型和全局 Provider 目录均由官方 DSH 提供。"><div class="management-actions"><Button variant="outline" size="sm" disabled={!!managementBusy} onclick={() => void refreshXgGatewayModels()}><RefreshCw size={13} />从 192.168.1.47 刷新</Button><Button variant="ghost" size="sm" onclick={() => void refreshManagement()}>刷新目录</Button>{#if hostInfo}<span class="management-capability">默认 {hostInfo.provider || "自动"}/{hostInfo.model || "自动"}</span>{/if}</div>{#if modelGroups.length === 0}<DataState state="empty" title="尚未加载会话模型" description="先选择或新建一个会话。" />{:else}{#each modelGroups as group (group.id)}<div class="model-group"><strong>{group.name}</strong>{#each group.models as model (model.id)}<button class:chosen={`${group.id}/${model.id}` === selectedModel} class="model-option" disabled={modelBusy} onclick={() => void chooseModel(group.id, model.id)}><span><strong>{model.name}</strong><small>{modelCapabilityLabel(model, group.id === "xg-gomodel" && unknownModelCapabilities.has(model.id))}{#if model.contextWindow} · 上下文 {model.contextWindow.toLocaleString()}{/if}{#if model.maxTokens} · 输出 {model.maxTokens.toLocaleString()}{/if}</small></span>{#if `${group.id}/${model.id}` === selectedModel}<Check size={14} />{/if}</button>{/each}</div>{/each}{/if}{#if catalogGroups.length > 0}<div class="catalog-divider"><span>全局 Provider 目录</span></div>{#each catalogGroups as group (group.id)}<div class="model-group catalog-group"><strong>{group.name}</strong><small>{group.models.length} 个可用模型</small><div class="catalog-models">{#each group.models as model (model.id)}<span>{model.name}</span>{/each}</div></div>{/each}{/if}{#if catalogFailures.length > 0}<div class="knowledge-note"><CircleAlert size={14} /><span>{catalogFailures.length} 个 Provider 目录读取失败：{catalogFailures.map((item) => item.name).join("、")}</span></div>{/if}</SettingsGroup>
                {:else if managementTab === "workspaces"}
                  <SettingsGroup title="工作区注册" description="工作区和会话由官方 DSH 维护，暗涌只提供选择与呈现。"><div class="management-actions"><Button size="sm" onclick={() => void pickWorkspace()}><FolderOpen size={14} />选择工作区</Button><Button variant="outline" size="sm" onclick={() => void refresh()}><History size={14} />刷新</Button></div>{#if filteredWorkspaces.length === 0}<DataState state="empty" title="没有注册工作区" description="选择一个目录后，官方 DSH 会建立工作区记录。" />{:else}<div class="management-list">{#each filteredWorkspaces as item (item.workspaceId)}<div class="management-list-row workspace-management-row"><span class="row-icon"><FolderOpen size={15} /></span><div>{#if editingWorkspaceId === item.workspaceId}<Input class="inline-edit-input" aria-label="工作区名称" bind:value={workspaceTitleDraft} onkeydown={(event) => { if (event.key === "Enter") void saveWorkspaceRename(item.workspaceId); if (event.key === "Escape") editingWorkspaceId = ""; }} />{:else}<strong>{item.title}</strong><small>{item.path}</small>{/if}</div>{#if editingWorkspaceId === item.workspaceId}<div class="row-actions"><Button size="sm" disabled={!!managementBusy} onclick={() => void saveWorkspaceRename(item.workspaceId)}><Check size={13} />保存</Button><Button variant="ghost" size="sm" onclick={() => editingWorkspaceId = ""}>取消</Button></div>{:else}<em>{item.sessionIds.length} 个会话</em><div class="row-actions"><Button variant="ghost" size="icon-sm" aria-label="进入工作区" title="进入工作区" onclick={() => void enterWorkspace(item)}><ExternalLink size={14} /></Button><Button variant="ghost" size="icon-sm" aria-label="在资源管理器打开" title="在资源管理器打开" disabled={!!managementBusy} onclick={() => void openWorkspacePath(item)}><FolderOpen size={14} /></Button><Button variant="ghost" size="icon-sm" aria-label="重命名工作区" title="重命名工作区" onclick={() => beginWorkspaceRename(item)}><Pencil size={14} /></Button>{#if confirmingWorkspaceId === item.workspaceId}<Button variant="destructive" size="sm" disabled={!!managementBusy} onclick={() => void removeWorkspace(item.workspaceId)}><Trash2 size={13} />确认移除</Button><Button variant="ghost" size="sm" onclick={() => confirmingWorkspaceId = ""}>取消</Button>{:else}<Button variant="ghost" size="icon-sm" aria-label="移除工作区注册" title="移除工作区注册" onclick={() => confirmingWorkspaceId = item.workspaceId}><Trash2 size={14} /></Button>{/if}</div>{/if}</div>{/each}</div>{/if}<div class="workspace-browser-divider"><span>目录浏览</span></div>{#if client}<WorkspaceBrowser client={client} onRegistered={() => { void refresh(); void refreshManagement(); }} />{/if}</SettingsGroup>
                  <SettingsGroup title="官方顺序" description="使用 DSH 的持久排序 API 调整工作区和会话顺序。"><div class="management-list">{#each filteredWorkspaces as workspace, index (workspace.workspaceId)}<div class="management-list-row"><span class="row-icon"><FolderOpen size={15} /></span><div><strong>{workspace.title}</strong><small>{workspace.sessionIds.length} 个会话</small></div><div class="row-actions"><Button variant="ghost" size="icon-sm" aria-label="工作区上移" title="工作区上移" disabled={index === 0 || !!managementBusy} onclick={() => void moveWorkspace(workspace.workspaceId, -1)}><ChevronDown class="rotate-180" size={14} /></Button><Button variant="ghost" size="icon-sm" aria-label="工作区下移" title="工作区下移" disabled={index === filteredWorkspaces.length - 1 || !!managementBusy} onclick={() => void moveWorkspace(workspace.workspaceId, 1)}><ChevronDown size={14} /></Button></div></div>{#each workspace.sessionIds as sessionId, sessionIndex (sessionId)}<div class="management-list-row nested-order-row"><span class="row-icon"><MessageSquare size={13} /></span><div><strong>{sessionTitle(sessions.find((item) => item.sessionId === sessionId) || { sessionId, updatedAt: 0, running: false, blank: false })}</strong><small>{sessionId}</small></div><div class="row-actions"><Button variant="ghost" size="icon-sm" aria-label="会话上移" title="会话上移" disabled={sessionIndex === 0 || !!managementBusy} onclick={() => void moveWorkspaceSession(workspace, sessionId, -1)}><ChevronDown class="rotate-180" size={13} /></Button><Button variant="ghost" size="icon-sm" aria-label="会话下移" title="会话下移" disabled={sessionIndex === workspace.sessionIds.length - 1 || !!managementBusy} onclick={() => void moveWorkspaceSession(workspace, sessionId, 1)}><ChevronDown size={13} /></Button></div></div>{/each}{/each}</div></SettingsGroup>
                {:else if managementTab === "mounts"}
                  <SmbMounts />
                {:else if managementTab === "plugins"}
                  <SettingsGroup title="插件与 MCP" description="只读显示官方 DSH Loader 的实时插件清单，不伪造连接或启用状态。"><div class="management-actions"><Button variant="outline" size="sm" onclick={() => void refreshManagement()}><RefreshCw size={13} />刷新清单</Button><span class="management-capability">{pluginInventory.length} 个条目</span></div>{#if pluginInventory.length === 0}<DataState state="empty" title="暂无插件清单" description="官方 DSH 尚未返回 Host Loader 条目。" />{:else}<div class="management-list">{#each pluginInventory.filter((item) => !settingsQuery || `${item.moduleName} ${item.entryId}`.toLowerCase().includes(settingsQuery.toLowerCase())) as plugin (plugin.entryId)}<div class="management-list-row"><span class="row-icon"><PlugZap size={15} /></span><div><strong>{plugin.moduleName}</strong><small>{plugin.entryId}</small></div><StatusBadge status={plugin.enabled ? "success" : "neutral"} label={plugin.enabled ? "已启用" : "未启用"} /><span class={`plugin-phase plugin-phase--${plugin.fiberPhase || "none"}`}>{plugin.fiberPhase || "无运行 Fiber"}</span></div>{/each}</div>{/if}<div class="knowledge-note"><ShieldAlert size={14} /><span>插件启停、安装和 MCP 配置必须通过官方 DSH Profile/设置完成，本界面不维护第二套状态。</span></div></SettingsGroup>
                {:else if managementTab === "knowledge"}
                  <SettingsGroup title="知识库与资料" description="知识入口接入官方 DSH Skill、工作区文件和会话附件。"><div class="knowledge-health-grid"><div><span>官方 Skill</span><strong>{skills.length}</strong><small>{skills.length ? "已加载" : "未加载"}</small></div><div><span>工作区文件</span><strong>{workspacePath ? "可用" : "未选择"}</strong><small>由 DSH 工具读取</small></div><div><span>会话资料</span><strong>{activeSession ? "可用" : "需会话"}</strong><small>由官方会话管理</small></div><div><span>持久知识库</span><strong>未接入</strong><small>等待官方插件 RPC</small></div></div><div class="knowledge-toolbar"><Button size="sm" onclick={() => void pickWorkspace()}><FolderOpen size={14} />选择知识工作区</Button><Button variant="outline" size="sm" onclick={() => void createSession()}><MessageSquarePlus size={14} />新建资料会话</Button><Button variant="outline" size="sm" onclick={() => openKnowledgePrompt("扫描当前工作区的文档与资料，按目录、类型和用途整理一份知识清单。") }><ClipboardList size={14} />扫描工作区资料</Button><Button variant="outline" size="sm" onclick={() => openKnowledgePrompt("检索当前工作区资料，找出与我的问题最相关的文件、段落和依据，并给出引用路径。") }><Search size={14} />检索工作区</Button><Button variant="outline" size="sm" onclick={() => void refreshManagement()}><History size={14} />刷新知识源</Button></div>{#if skills.length === 0}<DataState state="empty" title="暂无官方知识源" description="选择会话与工作区后，可让 DSH 读取项目资料；持久索引需要官方知识插件。" />{:else}<div class="knowledge-skill-list">{#each skills.filter((skill) => !settingsQuery || `${skill.name} ${skill.description}`.toLowerCase().includes(settingsQuery.toLowerCase())) as skill (skill.name)}<article><div class="skill-heading"><span class="row-icon"><BookOpen size={15} /></span><div><strong>{skill.name}</strong><small>{skill.modelInvocable ? "模型可调用" : "仅用户可调用"}</small></div></div><p>{skill.description}</p>{#if skill.whenToUse}<em>{skill.whenToUse}</em>{/if}</article>{/each}</div>{/if}<div class="knowledge-note"><ShieldAlert size={14} /><span>旧版 SQLite、FTS5 和向量知识库属于已删除的私有 Wails 后端。当前页面只显示官方 DSH 的真实能力，不伪造本地索引状态。</span></div></SettingsGroup>
                {:else if managementTab === "settings"}
                  <SettingsGroup title="模型 Provider" description="Provider 目录、模型发现与配置地址来自官方 DSH。">{#if client}<ProviderWorkbench {client} providers={filteredProviders} onSelectNamespace={(ns) => selectSettingsNamespace(ns)} />{/if}</SettingsGroup>
                  <SettingsGroup title="凭据" description="官方接口不会返回凭据值，只显示配置状态并接受单向写入。"><div class="credential-form"><Input aria-label="凭据引用名" bind:value={credentialRefDraft} placeholder="例如 DEEPSEEK_API_KEY" /><Input aria-label="凭据值" type="password" bind:value={credentialValueDraft} placeholder="输入后只用于本次写入" /><Button size="sm" disabled={!credentialRefDraft.trim() || !credentialValueDraft || !!managementBusy} onclick={() => void saveCredential()}><KeyRound size={13} />保存凭据</Button></div>{#if credentialRefs.length === 0}<DataState state="empty" title="暂无凭据引用" description="Provider 设置中尚未声明 apiKeyEnv；也可在上方手动输入引用名。" />{:else}<div class="management-list">{#each credentialRefs as ref (ref)}<div class="management-list-row credential-row"><span class="row-icon"><KeyRound size={15} /></span><div><strong>{ref}</strong><small>{credentialSummary(ref)}</small></div><StatusBadge status={credentials[ref]?.configured ? "success" : "neutral"} label={credentials[ref]?.writable === false ? "只读" : "可写"} />{#if credentials[ref]?.configured && credentials[ref]?.writable}{#if confirmingCredentialRef === ref}<Button variant="destructive" size="sm" disabled={!!managementBusy} onclick={() => void unsetCredential(ref)}><Trash2 size={13} />确认移除</Button><Button variant="ghost" size="sm" onclick={() => confirmingCredentialRef = ""}>取消</Button>{:else}<Button variant="ghost" size="icon-sm" aria-label="移除凭据" title="移除凭据" onclick={() => confirmingCredentialRef = ref}><Trash2 size={14} /></Button>{/if}{/if}</div>{/each}</div>{/if}</SettingsGroup>
                  <SettingsGroup title="设置命名空间" description="以 JSON 对象合并更新用户层；secret 字段保持写入专用，不会显示在这里。"><div class="management-actions"><Button variant="outline" size="sm" disabled={!settingsHasDocument || !!managementBusy} onclick={() => void openSettingsDocument()}><ExternalLink size={14} />打开设置文件</Button><span class="management-capability">{settingsWritable ? "可写" : "只读"}</span></div>{#if settingsNamespaces.length === 0}<DataState state="empty" title="暂无设置命名空间" description="官方 DSH 尚未注册设置项。" />{:else}<div class="settings-editor-grid"><nav class="settings-namespace-list" aria-label="设置命名空间">{#each filteredSettingsNamespaces as namespace (namespace.ns)}<button class:active={namespace.ns === selectedSettingsNamespace()?.ns} onclick={() => selectSettingsNamespace(namespace.ns)}><strong>{namespace.ns}</strong><small>{namespace.applies === "restart" ? "重启生效" : "即时生效"} · r{namespace.revision}</small></button>{/each}</nav><div class="settings-json-editor">{#if selectedSettingsNamespace()}<div class="agent-preview-heading"><strong>{selectedSettingsNamespace()?.ns}</strong><span>{selectedSettingsNamespace()?.secrets.filter((item) => item.set).length} 个 secret 已配置</span></div><Textarea aria-label="设置 JSON" rows={14} bind:value={settingsDraft} spellcheck={false} /><div class="row-actions"><Button size="sm" disabled={!settingsWritable || !!managementBusy} onclick={() => void saveSettingsNamespace()}><Save size={13} />合并更新</Button><Button variant="ghost" size="sm" onclick={() => selectSettingsNamespace(selectedSettingsNamespace()?.ns || "")}>重置编辑</Button></div>{/if}</div></div>{/if}</SettingsGroup>
                {:else}
                  <SettingsGroup title="运行状态与诊断" description="桌面 shell、官方 DSH 事件流和设置命名空间。"><div class="status-line"><StatusBadge status={runtimeError ? "danger" : "success"} label={runtimeError ? "连接异常" : "连接正常"} /><span>{runtimeError || "事件流已建立，状态由官方 DSH 提供。"}</span></div><div class="diagnostic-row"><span>活跃会话</span><strong>{activeSession ? sessionTitle(activeSession) : "无"}</strong></div><div class="diagnostic-row"><span>活动工具</span><strong>{runningTools.length}</strong></div><div class="diagnostic-row"><span>设置命名空间</span><strong>{settingsNamespaces.length}</strong></div><div class="diagnostic-row"><span>Provider</span><strong>{providers.length}</strong></div><div class="diagnostic-row"><span>子 Agent</span><strong>{subagents.length}</strong></div><div class="management-list settings-namespaces">{#each settingsNamespaces as namespace (namespace.ns)}<div class="management-list-row"><span class="row-icon"><Settings2 size={15} /></span><div><strong>{namespace.ns}</strong><small>{namespace.applies === "restart" ? "重启生效" : "即时生效"} · revision {namespace.revision}</small></div><code>{namespace.secrets.length} secrets</code></div>{/each}</div></SettingsGroup>
                {/if}
              </section>
            </div>
          </div>
        {:else if view === "knowledge"}
          <div class="knowledge-page">
            <header class="knowledge-hero"><div><div class="eyebrow">暗涌知识工作区</div><h1>知识库</h1><p>从官方 DSH Skill、当前工作区和会话资料中查找可引用的上下文。</p></div><div class="header-actions"><Button variant="outline" size="sm" onclick={() => view = "conversation"}><ChevronRight class="rotate-180" size={14} />返回会话</Button><Button size="sm" onclick={() => openKnowledgePrompt("扫描当前工作区的文档与资料，按目录、类型和用途整理一份知识清单。") }><ClipboardList size={14} />扫描工作区</Button></div></header>
            <div class="knowledge-page-body">
              <section class="knowledge-search-panel"><div class="knowledge-search-heading"><div><span class="section-label">资料检索</span><h2>问问你的工作区</h2><p>检索结果由官方 DSH 在当前会话中生成，不建立并行索引。</p></div><span class="knowledge-source-count"><BookOpen size={15} />{skills.length} 个官方知识源</span></div><div class="knowledge-search-row"><Input aria-label="知识库问题" bind:value={input} placeholder="例如：这个项目的启动流程和关键配置在哪里？" /><Button size="sm" disabled={!activeSessionId || !input.trim()} onclick={() => void submit()}><Search size={14} />检索</Button></div><div class="knowledge-shortcuts"><button onclick={() => openKnowledgePrompt("检索当前工作区资料，找出与我的问题最相关的文件、段落和依据，并给出引用路径。")}><Search size={14} /><span><strong>检索工作区</strong><small>按文件、段落和依据回答</small></span></button><button onclick={() => openKnowledgePrompt("扫描当前工作区的文档与资料，按目录、类型和用途整理一份知识清单。")}><ClipboardList size={14} /><span><strong>建立资料清单</strong><small>先梳理目录与文档用途</small></span></button><button onclick={() => void createSession()}><MessageSquarePlus size={14} /><span><strong>新建资料会话</strong><small>保留一条独立的研究上下文</small></span></button></div></section>
              <div class="knowledge-columns"><section class="knowledge-source-section"><div class="section-row"><div><span class="section-label">官方知识源</span><h2>可调用能力</h2></div><Button variant="ghost" size="sm" onclick={() => void refreshManagement()}><History size={14} />刷新</Button></div>{#if skills.length === 0}<DataState state="empty" title="暂无官方知识源" description="选择工作区和会话后，官方 DSH Skill 会在这里出现。" />{:else}<div class="knowledge-skill-list">{#each skills.filter((skill) => !settingsQuery || `${skill.name} ${skill.description}`.toLowerCase().includes(settingsQuery.toLowerCase())) as skill (skill.name)}<article><div class="skill-heading"><span class="row-icon"><BookOpen size={15} /></span><div><strong>{skill.name}</strong><small>{skill.modelInvocable ? "模型可调用" : "仅用户可调用"}</small></div></div><p>{skill.description}</p>{#if skill.whenToUse}<em>{skill.whenToUse}</em>{/if}</article>{/each}</div>{/if}</section><aside class="knowledge-context"><div class="section-label">当前上下文</div><div class="context-stat"><span>工作区</span><strong title={workspacePath}>{workspaceName}</strong></div><div class="context-stat"><span>会话</span><strong>{activeSession ? sessionTitle(activeSession) : "未选择"}</strong></div><div class="context-stat"><span>会话资料</span><strong>{activeSession ? `${messages.length} 条消息` : "需先选择会话"}</strong></div><div class="knowledge-note"><ShieldAlert size={14} /><span>知识库展示的是官方 DSH 的真实能力；旧版私有 SQLite、FTS5 和向量索引不会在本地伪造。</span></div></aside></div>
            </div>
          </div>
        {:else}
          <div class="conversation-shell">
            <header class="conversation-header"><div class="conversation-title"><div class="eyebrow">{activeSession ? "会话工作台" : "暗涌"}</div><h1>{customization.title || (activeSession ? sessionTitle(activeSession) : "开始一个新会话")}</h1><p>{customization.subtitle || workspacePath || "选择一个工作区开始"}</p></div><div class="header-actions">{#if activeSessionId}<label class="header-model"><Bot size={13} /><span class="sr-only">会话模型</span><select aria-label="选择会话模型" value={selectedModel} disabled={modelBusy || modelGroups.length === 0} onchange={(event) => chooseModelValue(event.currentTarget.value)}>{#if modelGroups.length === 0}<option value={selectedModel}>{selectedModel || "默认模型"}</option>{:else}{#each modelGroups as group (group.id)}<optgroup label={group.name}>{#each group.models as model (model.id)}<option value={`${group.id}/${model.id}`}>{model.name}</option>{/each}</optgroup>{/each}{/if}</select></label>{/if}<Button variant="outline" size="sm" aria-pressed={customizationOpen} onclick={() => customizationOpen = !customizationOpen}><SlidersHorizontal size={14} />界面</Button><Button variant="outline" size="sm" onclick={() => openManagement("overview")}><Settings2 size={14} />管理</Button></div></header>
            {#if runtimeError}<div class="error-banner"><CircleAlert size={15} /><span>{runtimeError}</span><button aria-label="关闭错误" onclick={() => { runtimeError = ""; }}><X size={14} /></button></div>{/if}
            {#if customizationOpen}<section class="customization-panel" aria-label="界面定制"><div class="customization-panel__header"><div><div class="section-label">对话式界面定制</div><strong>用自然语言改变工作台</strong><p>例如：收起活动面板、使用紧凑密度、把输入框改成四行。</p></div><Button variant="ghost" size="icon-sm" aria-label="关闭界面定制" onclick={() => customizationOpen = false}><X size={14} /></Button></div>{#if customizationNotice}<div class="customization-feedback"><CircleCheck size={14} /><span>{customizationNotice}</span></div>{/if}{#if customizationDraft}<div class="customization-preview"><div><strong>待应用方案</strong><span>来自当前会话的结构化 patch</span></div><code>{JSON.stringify(customizationDraft)}</code><div class="customization-actions"><Button variant="outline" size="sm" onclick={() => customizationDraft = undefined}>忽略</Button><Button size="sm" onclick={() => applyCustomizationPatch(customizationDraft!)}><Check size={13} />应用方案</Button></div></div>{/if}<div class="customization-summary"><span class="mode-chip">{customization.density === "compact" ? "紧凑密度" : "舒适密度"}</span><span>{customization.sidebar === "collapsed" ? "侧栏已收起" : "侧栏已展开"}</span><span>{customization.activity === "visible" ? "活动面板可见" : "活动面板隐藏"}</span><span>{customization.composerRows} 行输入框</span></div><div class="customization-actions"><Button variant="ghost" size="sm" disabled={customizationHistory.length === 0} onclick={undoCustomization}>撤销上次</Button><Button variant="ghost" size="sm" onclick={() => { customization = DEFAULT_UI_CUSTOMIZATION; customizationHistory = []; persistUiCustomization(customization); applyRuntimeCustomization(customization); customizationNotice = "已恢复默认界面。"; }}>恢复默认</Button></div></section>{/if}
            {#if surfaceDraft}<section class="surface-proposal" aria-label="待确认操作界面"><div><div class="section-label">AI 操作界面提案</div><strong>{surfaceDraft.spec.title}</strong><p>{surfaceDraft.summary || `包含 ${surfaceDraft.spec.widgets.length} 个只读组件，确认后才会查询 DSH 数据。`}</p></div><div class="surface-proposal__meta"><span>{surfaceDraft.spec.widgets.length} 个组件</span><span>{surfaceDraft.spec.dataSources.length} 个数据源</span></div><div class="customization-actions"><Button variant="ghost" size="sm" onclick={() => { surfaceDraft = undefined; surfaceNotice = "已忽略操作界面提案。"; }}>忽略</Button><Button size="sm" onclick={applySurfaceProposal}><Check size={13} />确认渲染</Button></div></section>{/if}
            {#if generatedSurface && client}<section class="generated-surface" aria-label="AI 生成操作界面"><header><div><div class="section-label">AI 生成操作界面</div><strong>{generatedSurface.title}</strong><p>{surfaceNotice || "只读视图，数据来自官方 DSH API。"}</p></div><div class="customization-actions"><Button variant="ghost" size="sm" disabled={surfaceHistory.length === 0} onclick={undoGeneratedSurface}>撤销</Button><Button variant="ghost" size="sm" onclick={removeGeneratedSurface}><Trash2 size={13} />移除</Button></div></header><GeneratedSurface spec={generatedSurface} {client} {activeSessionId} onError={(message) => { surfaceNotice = message; }} /></section>{/if}
            <div class="main-grid">
              <div class="message-scroll" aria-busy={sending}>{#if messages.length === 0}<div class="empty-state"><span class="empty-mark"><Bot size={22} /></span><h2>准备好开始工作</h2><p>官方 DSH 运行时已连接。描述目标，暗涌会在这里呈现计划、工具和结果。</p><div class="quick-actions">{#each (customization.quickActions.length ? customization.quickActions : [{ label: "检查当前项目", prompt: "检查当前项目状态并给出最值得先处理的问题。" }, { label: "理解代码结构", prompt: "梳理当前项目的主要模块和启动流程。" }, { label: "运行测试", prompt: "运行测试并汇总失败项。" }]) as action (action.label)}<button onclick={() => input = action.prompt}><ClipboardList size={14} />{action.label}</button>{/each}</div></div>{:else}{#each messages as message (message.id)}<article class:user={message.role === "user"} class:assistant={message.role === "assistant"} class:tool={message.role === "tool"} class:pending={message.pending} class="message"><div class="message-avatar">{#if message.role === "user"}你{:else if message.role === "tool"}<Wrench size={13} />{:else if message.role === "system"}<CircleAlert size={13} />{:else}<Bot size={13} />{/if}</div><div class="message-body"><div class="message-meta"><span>{message.role === "user" ? "你" : message.role === "tool" ? (message.tool?.name || "工具") : productName}</span>{#if message.seq}<time>#{message.seq}</time>{/if}{#if message.pending}<span class="live-label">等待处理</span>{/if}</div>{#if message.role === "tool" && message.tool}<div class="tool-card"><div class="tool-card-head"><div class="tool-title"><span class:tool-running={message.tool.state === "running"} class="tool-dot"></span><strong>{message.tool.name}</strong><span class="tool-state">{message.tool.state === "running" ? "运行中" : message.tool.state === "error" ? "失败" : "已完成"}</span></div>{#if message.tool.state === "success"}<CircleCheck size={15} class="success-icon" />{:else if message.tool.state === "error"}<CircleAlert size={15} class="error-icon" />{:else}<LoaderCircle class="animate-spin" size={14} />{/if}</div>{#if message.tool.args}<details><summary>查看参数</summary><pre>{message.tool.args}</pre></details>{/if}{#if message.tool.result}<details class="tool-result"><summary>查看输出</summary><pre>{message.tool.result}</pre></details>{/if}</div>{:else}{#if message.reasoning}<details class="reasoning"><summary>显示推理过程</summary><p>{message.reasoning}</p></details>{/if}<div class="message-text">{message.text || "…"}</div>{#if message.usage}<div class="usage-line">输入 {String(message.usage.inputTokens || "-")} · 输出 {String(message.usage.outputTokens || "-")}</div>{/if}{/if}</div></article>{/each}{#if sending}<div class="typing" role="status" aria-atomic="true"><LoaderCircle class="animate-spin" size={14} />DSH 正在执行任务，活动记录会持续更新</div>{/if}{/if}</div>
              <aside class:open={activityOpen} class="activity-panel"><div class="panel-heading"><div><div class="section-label">活动记录</div><strong>{runningTools.length ? `${runningTools.length} 个工具运行中` : "当前会话轨迹"}</strong></div><Button variant="ghost" size="icon-sm" aria-label="关闭活动面板" onclick={() => setActivityOpen(false)}><X size={14} /></Button></div><div class="activity-summary" aria-label="活动摘要"><div><strong>{runningTools.length}</strong><span>运行中</span></div><div><strong>{completedTools}</strong><span>已完成</span></div><div><strong>{todos.filter((todo) => todo.status === "completed").length}/{todos.length}</strong><span>待办</span></div></div><div class="activity-content">{#if todos.length > 0}<section class="todo-section"><div class="panel-subheading"><ClipboardList size={14} />任务计划</div>{#each todos as todo (todo.content)}<div class="todo-row"><span class:todo-done={todo.status === "completed"} class:todo-active={todo.status === "in_progress"} class="todo-check">{#if todo.status === "completed"}<Check size={12} />{:else if todo.status === "in_progress"}<LoaderCircle class="animate-spin" size={10} />{/if}</span><span>{todo.content}</span><small>{todo.status === "completed" ? "完成" : todo.status === "in_progress" ? "进行中" : "待处理"}</small></div>{/each}</section>{/if}<section class="activity-list"><div class="panel-subheading"><History size={14} />最近活动</div>{#if activityItems.length === 0}<div class="panel-empty"><History size={18} /><p>任务开始后，工具调用和执行状态会显示在这里。</p></div>{:else}{#each activityItems as item (item.id)}<div class:error={item.tool?.state === "error"} class="activity-row"><span class="tool-dot" class:tool-running={item.tool?.state === "running"}></span><span title={item.tool?.name}>{item.tool?.name}</span><small>{item.tool?.state === "running" ? "运行中" : item.tool?.state === "error" ? "失败" : "完成"}</small></div>{/each}{/if}</section></div></aside>
            </div>
            {#if pendingApproval}<div class="interaction-card approval-card"><div class="interaction-icon"><ShieldAlert size={17} /></div><div class="interaction-content"><strong>需要批准工具操作</strong><p>{pendingApproval.reason || `${pendingApproval.toolName} 请求访问工作区资源。`}</p><div class="interaction-actions"><Button variant="outline" size="sm" onclick={() => void respondApproval("rejected")}>拒绝</Button><Button size="sm" onclick={() => void respondApproval("allowed-once")}><Check size={14} />允许一次</Button></div></div></div>{/if}
            {#if pendingQuestion}<div class="interaction-card question-card"><div class="interaction-icon"><CircleAlert size={17} /></div><div class="interaction-content"><strong>DSH 需要你的选择</strong>{#each pendingQuestion.questions as question (String(question.id))}<div class="question-block"><label for={`question-${String(question.id)}`}>{String(question.question || question.header || "请选择")}</label>{#if Array.isArray(question.options) && question.options.length > 0}<select id={`question-${String(question.id)}`} aria-label={String(question.question || question.id)} value={questionAnswers[String(question.id)] || ""} onchange={(event) => questionAnswers[String(question.id)] = (event.currentTarget as HTMLSelectElement).value}><option value="">请选择…</option>{#each question.options as option (String(option.label))}<option value={String(option.label)}>{String(option.label)}</option>{/each}</select>{:else}<Input id={`question-${String(question.id)}`} aria-label={String(question.question || question.id)} placeholder="输入回答" value={questionAnswers[`${String(question.id)}:custom`] || ""} oninput={(event) => questionAnswers[`${String(question.id)}:custom`] = (event.currentTarget as HTMLInputElement).value} />{/if}</div>{/each}<div class="interaction-actions"><Button size="sm" onclick={() => void respondQuestion()}><Send size={14} />提交回答</Button></div></div></div>{/if}
            <div class="composer"><div class="composer-shell"><ReferencePicker bind:value={input} rows={customization.composerRows} {client} sessionId={activeSessionId} placeholder={activeSessionId ? "描述任务，或输入 @ 查找官方文件/会话引用…" : "先新建一个会话…"} disabled={!activeSessionId || !!pendingApproval || !!pendingQuestion} onSubmit={() => void submit()} /><div class="composer-footer"><div class="composer-context"><span class="mode-chip">队列模式</span><span class="composer-hint">Ctrl / ⌘ + Enter 发送</span>{#if activeSessionId && client}<PermissionSelector {client} sessionId={activeSessionId} permissions={activeSession?.projections?.values?.permissions} onNotice={permissionNotice} />{/if}</div><div class="composer-actions"><ImageAttachments bind:attachments />{#if !activityOpen}<Button variant="ghost" size="sm" onclick={() => setActivityOpen(true)}><History size={14} />活动</Button>{/if}{#if sending}<Button variant="outline" size="sm" onclick={() => void cancel()}><Square size={13} />停止</Button>{:else}<Button size="sm" disabled={!activeSessionId || (!input.trim() && attachments.length === 0) || !!pendingApproval || !!pendingQuestion} onclick={() => void submit()}><Send size={13} />发送</Button>{/if}</div></div></div></div>
          </div>
        {/if}
      </section>
    </div>
  </main>
{/if}
