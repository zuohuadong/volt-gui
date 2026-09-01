<script lang="ts">
  import { onMount } from "svelte";
  import {
    Archive, BookOpen, Bot, Check, ChevronDown, ChevronRight, CircleAlert,
    CircleCheck, ClipboardList, Copy, ExternalLink, FileText, FolderOpen,
    HardDrive, History, KeyRound, MessageSquare, MessageSquarePlus, Network,
    Pause, Pencil, Play, PanelLeftClose, PanelLeftOpen, Save, Search, Send,
    Settings2, ShieldAlert, SlidersHorizontal, Square, Target, Trash2, UserRoundCog,
    X, RefreshCw, PlugZap, GitBranch, Blocks, Cable, Boxes, Globe, Languages,
  } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import { Textarea } from "$components/ui/textarea";
  import GeneratedSurface from "$components/GeneratedSurface.svelte";
  import ConversationTranscript from "$components/ConversationTranscript.svelte";
  import ActivityPanel from "$components/ActivityPanel.svelte";
  import DshPromptComposer from "$components/DshPromptComposer.svelte";
  import PendingInteractions from "$components/PendingInteractions.svelte";
  import SmbMounts from "$components/SmbMounts.svelte";
  import ProviderWorkbench from "$components/ProviderWorkbench.svelte";
  import WorkspaceBrowser from "$components/WorkspaceBrowser.svelte";
  import PluginInventoryView from "$components/PluginInventoryView.svelte";
  import McpInventoryView from "$components/McpInventoryView.svelte";
  import { separatePluginsAndMcp } from "$lib/plugin-i18n";
  import { t, getLocale, setLocale, toggleLocale, AVAILABLE_LOCALES, i18n } from "$lib/i18n";
  import { Input } from "$components/ui/input";
  import { Separator } from "$components/ui/separator";
  import { DataState, SettingsGroup, StatusBadge } from "@svadmin/ui";
  import { Loader } from "@svadmin/ai-elements";
  import { setResources } from "@svadmin/core";
  import {
    DshClient, type AgentPreset, type ConfigurableProvider, type CredentialView,
    type DshFrame, type DshSkill, type GoalProjection, type ModelGroup,
    type PendingApproval, type PendingQuestion, type SessionSummary,
    type PromptContentPart, type SettingsNamespace, type SubagentEntry, type Workspace, type PluginInventoryEntry,
  } from "$lib/dsh-client";
  import { assistantMessageForEvent, applyTranscriptEvent, foldHistory, type TodoItem, type TranscriptMessage } from "$lib/transcript";
  import {
    credentialRefHint,
    credentialRefTitle,
    enrichModelGroups,
    mergeDiscoveredModels,
    modelCapabilityLabel,
    modelSupportsImages,
    providerCredentialRef,
    resolveProviderSettings,
    supportedReasoningEffort,
  } from "$lib/model-catalog";
  import { agentPresetLocked, clearsSessionError, sessionHealth, sessionHealthLabel, visibleSessions } from "$lib/session-health";
  import { userFacingError } from "$lib/user-error";
  import { buildQuestionAnswers, questionsAnswered } from "$lib/ai-elements-adapter";
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
 type ManagementTab = "overview" | "sessions" | "goals" | "subagents" | "agents" | "models" | "workspaces" | "mounts" | "plugins" | "mcp" | "knowledge" | "settings" | "runtime";

 let client = $state<DshClient>();
  let customProductName = $state("");
  const productName = $derived(customProductName || t("app.name"));
 let appVersion = $state("0.31.1");
 let workspacePath = $state("");
  let workspaces = $state<Workspace[]>([]);
  let sessions = $state<SessionSummary[]>([]);
  let archivedSessionIds = $state<string[]>([]);
  let activeSessionId = $state("");
  let messages = $state<TranscriptMessage[]>([]);
  let todos = $state<TodoItem[]>([]);
  let input = $state("");
  let sessionQuery = $state("");
  let settingsQuery = $state("");
  let managementTab = $state<ManagementTab>("overview");
  let loading = $state(true);
  let sending = $state(false);
  let sidebarCollapsed = $state(false);
  let activityOpen = $state(true);
  let view = $state<View>("conversation");
  let runtimeError = $state("");
  let runtimeConnectionError = $state("");
  let sessionErrors = $state<Record<string, string>>({});
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
  const currentLocale = $derived(i18n.locale);
  const pluginPartition = $derived(separatePluginsAndMcp(pluginInventory, currentLocale));
  const purePlugins = $derived(pluginPartition.plugins);
  const mcpInventoryEntries = $derived(pluginPartition.mcpEntries);
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
  let settingsViewMode = $state<"user" | "merged">("user");
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
  const workspaceName = $derived(workspacePath.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || t("app.noWorkspaceSelected"));
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
  const xgGatewayCredentialReady = $derived.by(() => {
    const config = resolveProviderSettings(settingsNamespaces, providers, "xg-gomodel")?.config;
    if (!config) return false;
    const ref = config.apiKeyEnv;
    return typeof ref !== "string" || !ref || !!credentials[ref]?.configured;
  });
  const selectedProviderCredentialReady = $derived.by(() => {
    const provider = selectedModel.split("/", 1)[0];
    return provider ? modelCredentialConfigured(provider) : true;
  });
  const activeAgentPresetLocked = $derived(agentPresetLocked(activeSession, messages.length));
 const latestAssistant = $derived.by(() => {
   for (let index = messages.length - 1; index >= 0; index -= 1) {
     if (messages[index].role === "assistant") return messages[index];
   }
   return undefined;
 });

  $effect(() => {
    setResources([
      { name: "sessions", label: t("nav.sessions"), fields: [{ key: "title", label: t("common.name"), type: "text" }], showInMenu: true },
      { name: "goals", label: t("nav.goals"), fields: [{ key: "objective", label: t("goals.objective"), type: "text" }], showInMenu: true },
      { name: "subagents", label: t("nav.subagents"), fields: [{ key: "label", label: t("common.name"), type: "text" }], showInMenu: true },
      { name: "agents", label: t("nav.agents"), fields: [{ key: "name", label: t("common.name"), type: "text" }], showInMenu: true },
      { name: "workspaces", label: t("nav.workspaces"), fields: [{ key: "path", label: t("common.path"), type: "text" }], showInMenu: true },
      { name: "models", label: t("nav.models"), fields: [{ key: "name", label: t("common.name"), type: "text" }], showInMenu: true },
      { name: "knowledge", label: t("nav.knowledge"), fields: [{ key: "name", label: t("common.name"), type: "text" }], showInMenu: true },
      { name: "settings", label: t("nav.settings"), fields: [{ key: "ns", label: t("settings.namespacesTitle"), type: "text" }], showInMenu: true },
    ]);
  });

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
    customizationNotice = t("customization.appliedNotice");
 }

 function undoCustomization(): void {
   const previous = customizationHistory.at(-1);
   if (!previous) return;
   customizationHistory = customizationHistory.slice(0, -1);
   customization = previous;
   persistUiCustomization(customization);
   applyRuntimeCustomization(customization);
    customizationNotice = t("customization.undoneNotice");
 }

 function captureCustomization(message: TranscriptMessage | undefined): void {
   if (!message || message.role !== "assistant" || !message.text || message.id === customizationSourceId) return;
   const result = parseUiCustomization(message.text);
   if (!result.ok) return;
   customizationDraft = result.value;
   customizationSourceId = message.id;
   customizationOpen = true;
    customizationNotice = t("customization.proposalNotice");
 }

 function captureSurfaceProposal(message: TranscriptMessage | undefined): void {
   if (!message || message.role !== "assistant" || !message.text || message.id === surfaceSourceId) return;
   const result = parseVoltSurfaceProposal(message.text);
   if (!result.ok) return;
   surfaceDraft = { summary: result.value.summary, spec: result.value.spec };
   surfaceSourceId = message.id;
   customizationOpen = true;
    surfaceNotice = t("surface.detectedNotice");
 }

 function applySurfaceProposal(): void {
   if (!surfaceDraft) return;
   surfaceHistory = [...surfaceHistory.slice(-9), generatedSurface];
   generatedSurface = surfaceDraft.spec;
   persistGeneratedSurface(generatedSurface);
   surfaceDraft = undefined;
    surfaceNotice = t("surface.renderedNotice");
 }

 function removeGeneratedSurface(): void {
   surfaceHistory = [...surfaceHistory.slice(-9), generatedSurface];
   generatedSurface = undefined;
   persistGeneratedSurface(undefined);
    surfaceNotice = t("surface.removedNotice");
 }

 function undoGeneratedSurface(): void {
   if (surfaceHistory.length === 0) return;
   generatedSurface = surfaceHistory.at(-1);
   surfaceHistory = surfaceHistory.slice(0, -1);
   persistGeneratedSurface(generatedSurface);
    surfaceNotice = generatedSurface ? t("surface.restoredNotice") : t("surface.undoneNotice");
 }

  async function bootstrap(): Promise<void> {
    try {
      const shell = window.voltDesktop;
     if (!shell) throw new Error(t("smb.bridgeNotLoaded"));
     const info = await shell.bootstrap();
      if (info.productName) customProductName = info.productName;
      appVersion = info.version;
      workspacePath = info.workspace;
      unsubscribeRuntimeError = shell.onRuntimeError((message) => {
        runtimeConnectionError = message;
        runtimeError = message;
        sending = false;
      });
      if (info.startupError || !info.dshReady) {
        runtimeConnectionError = info.startupError || t("runtime.noAddressProvided");
        runtimeError = runtimeConnectionError;
        return;
      }
      client = new DshClient(shell);
      client.subscribe(handleFrame, (error) => {
        runtimeConnectionError = userFacingError(error);
        runtimeError = runtimeConnectionError;
      });
      await refresh();
    } catch (error) {
      runtimeConnectionError = userFacingError(error);
      runtimeError = runtimeConnectionError;
    } finally { loading = false; }
  }

  async function refresh(): Promise<void> {
    if (!client) return;
    const [workspaceResult, sessionResult] = await Promise.all([client.listWorkspaces(), client.listSessions()]);
    workspaces = workspaceResult.items;
    archivedSessionIds = workspaceResult.archivedSessionIds;
    sessions = visibleSessions(sessionResult.items, archivedSessionIds, activeSessionId);
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
    activeSessionId = created.sessionId;
    await refresh();
    await selectSession(created.sessionId);
  }

  async function selectSession(sessionId: string): Promise<void> {
    if (!client) return;
    activeSessionId = sessionId;
    view = "conversation";
    pendingApproval = undefined;
    pendingQuestion = undefined;
    runtimeError = "";
    const [result, settingsResult, providerResult] = await Promise.all([
      client.history(sessionId),
      client.describeSettings().catch(() => ({ writable: false, hasDocument: false, namespaces: [] })),
      client.listProviders().catch(() => ({ providers: [] })),
    ]);
    const transcript = foldHistory(result.events);
    messages = transcript.messages;
    todos = transcript.todos;
    settingsWritable = settingsResult.writable;
    settingsHasDocument = settingsResult.hasDocument;
    settingsNamespaces = settingsResult.namespaces;
    providers = providerResult.providers;
    credentialRefs = collectCredentialRefs(settingsNamespaces);
    credentials = credentialRefs.length
      ? (await client.describeCredentials(credentialRefs).catch(() => ({ credentials: {} }))).credentials
      : {};
    try {
      const modelResult = await client.models(sessionId);
      modelGroups = enrichModelGroups(modelResult.groups, settingsNamespaces);
      selectedModel = `${modelResult.current.provider}/${modelResult.current.model}`;
      const currentInfo = modelResult.groups.find((group) => group.id === modelResult.current.provider)?.models.find((model) => model.id === modelResult.current.model);
      reasoningEffort = currentInfo?.reasoning?.efforts.some((effort) => effort.id === modelResult.current.reasoningEffort) ? (modelResult.current.reasoningEffort || "") : "";
      if (modelResult.current.reasoningEffort && !reasoningEffort) { try { await client.selectModel(sessionId, modelResult.current.provider, modelResult.current.model); } catch { /* clear incompatible parameters */ } }
      if (!modelCredentialConfigured(modelResult.current.provider)) {
        runtimeError = t("errors.noApiKey");
        sessionErrors = { ...sessionErrors, [sessionId]: runtimeError };
      } else if (sessionErrors[sessionId]) {
        const { [sessionId]: _cleared, ...remaining } = sessionErrors;
        sessionErrors = remaining;
      }
    } catch (error) {
      runtimeError = userFacingError(error);
      sessionErrors = { ...sessionErrors, [sessionId]: runtimeError };
    }
  }

 function sessionTitle(session: SessionSummary): string {
   const title = session.projections?.values?.title;
    return typeof title === "string" && title.trim() ? title : (session.cwd || t("session.untitled")).split(/[\\/]/).pop() || t("session.untitled");
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
    return providerCredentialRef(settingsNamespaces, providers, provider);
  }

  function modelCredentialConfigured(provider: string): boolean {
    const ref = providerCredentialRef(settingsNamespaces, providers, provider);
    return !ref || !!credentials[ref]?.configured;
  }

  function pickCredentialQuickChip(ref: string): void {
    credentialRefDraft = ref;
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('.credential-form input[type="password"]');
      input?.focus();
    }, 50);
  }

  function openCredentialSettings(ref: string | undefined): void {
    if (ref) credentialRefDraft = ref;
    openManagement("settings");
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('.credential-form input[type="password"]');
      input?.focus();
    }, 100);
  }

  async function xgProviderSettings() {
    let providerSettings = resolveProviderSettings(settingsNamespaces, providers, "xg-gomodel");
    if (providerSettings || !client) return providerSettings;
    const [described, providerResult] = await Promise.all([client.describeSettings(), client.listProviders()]);
    settingsNamespaces = described.namespaces;
    providers = providerResult.providers;
    return resolveProviderSettings(settingsNamespaces, providers, "xg-gomodel");
  }

  async function requireConfiguredCredential(config: Record<string, unknown>): Promise<void> {
    const ref = typeof config.apiKeyEnv === "string" ? config.apiKeyEnv : "";
    if (!ref || !client) return;
    const described = await client.describeCredentials([ref]);
    credentials = { ...credentials, ...described.credentials };
    if (described.credentials[ref]?.configured) return;
    credentialRefDraft = ref;
    throw new Error(t("models.requireKeyNotice", { ref }));
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
    if (payload.type === "question/requested") { pendingQuestion = { rpcId: frame.rpcId, ...payload } as unknown as PendingQuestion; questionAnswers = {}; sending = false; return; }
    if (payload.type === "approval/resolved" || payload.type === "question/resolved") { pendingApproval = undefined; pendingQuestion = undefined; questionAnswers = {}; return; }
    if (payload.type === "session/queue") return;
    if (payload.type === "session/jobs") return;
    if (payload.type === "session/projection") { void refresh(); return; }
    if (payload.type === "host/session-added" || payload.type === "host/session-status" || payload.type === "host/session-removed" || payload.type === "host/workspace-changed" || payload.type === "host/workspace-removed") { void refresh(); return; }
    if (payload.type === "host/agent-error") {
      const message = userFacingError(payload.message || t("errors.agentFailed"));
      const sessionId = payload.sessionId || activeSessionId;
      if (sessionId) sessionErrors = { ...sessionErrors, [sessionId]: message };
      if (sessionId !== activeSessionId) return;
      runtimeError = message;
      sending = false;
      messages = [
        ...messages.map((item) => item.pending ? { ...item, pending: false } : item),
        { id: `agent-error-${Date.now()}`, role: "system", text: message },
      ];
      return;
    }
    if (payload.type !== "session/event" || payload.sessionId !== activeSessionId || !payload.event) return;
    const transcript = applyTranscriptEvent({ messages, todos }, payload.event, payload.view as Record<string, unknown> | undefined);
    messages = transcript.messages;
    todos = transcript.todos;
    if (payload.event.type === "assistant/message") {
      const assistantMessage = assistantMessageForEvent(transcript.messages, payload.event);
      captureCustomization(assistantMessage);
      captureSurfaceProposal(assistantMessage);
    }
    if (payload.event.type === "assistant/message" || payload.event.type === "turn/end") {
      sending = false;
      if (clearsSessionError(payload.event) && sessionErrors[activeSessionId]) {
        const clearedMessage = sessionErrors[activeSessionId];
        const { [activeSessionId]: _cleared, ...remaining } = sessionErrors;
        sessionErrors = remaining;
        if (runtimeError === clearedMessage) runtimeError = "";
      }
    }
  }

  async function submit(textOverride?: string, imageAttachments: Extract<PromptContentPart, { type: "image" }>[] = []): Promise<void> {
    const text = (textOverride ?? input).trim();
    if (!client || !activeSessionId || (!text && imageAttachments.length === 0) || sending) return;
    const credentialRef = selectedProviderCredentialRef();
    if (credentialRef && !credentials[credentialRef]?.configured) {
      credentialRefDraft = credentialRef;
      runtimeError = t("models.missingApiKeyRuntime", { credentialRef });
      sessionErrors = { ...sessionErrors, [activeSessionId]: runtimeError };
      openCredentialSettings(credentialRef);
      if (textOverride !== undefined) throw new Error(runtimeError);
      return;
    }
    if (imageAttachments.length > 0 && !(selectedModelInfo()?.input || []).includes("image")) {
      runtimeError = t("models.unsupportedImage", { model: selectedModel || t("common.unselected") });
      throw new Error(runtimeError);
    }
    if (textOverride === undefined) input = "";
    sending = true; view = "conversation";
    const pendingId = `pending-${Date.now()}`;
    messages = [...messages, { id: pendingId, role: "user", text, pending: true }];
    const prompt = isSurfaceGenerationIntent(text)
      ? buildVoltSurfacePrompt(text)
      : isUiCustomizationIntent(text)
        ? buildUiCustomizationPrompt(text)
        : text;
    try {
      const content: PromptContentPart[] = [...(prompt ? [{ type: "text", text: prompt } satisfies PromptContentPart] : []), ...imageAttachments];
      await client.prompt(activeSessionId, content);
    }
    catch (error) {
      sending = false;
      messages = messages.map((message) => message.id === pendingId ? { ...message, pending: false } : message);
      runtimeError = userFacingError(error);
      sessionErrors = { ...sessionErrors, [activeSessionId]: runtimeError };
      if (runtimeError.includes("设置与凭据") || runtimeError.includes("Settings & Credentials")) openManagement("settings");
      if (textOverride !== undefined) throw error;
    }
  }

  async function cancel(): Promise<void> {
    if (!client || !activeSessionId) return;
    try { await client.cancel(activeSessionId); } finally { sending = false; }
  }

  async function chooseModel(provider: string, model: string): Promise<void> {
    if (!client || !activeSessionId || modelBusy) return;
    modelBusy = true;
    try {
      const validEffort = supportedReasoningEffort(modelGroups, provider, model, reasoningEffort);
      let result;
      try {
        result = await client.selectModel(activeSessionId, provider, model, validEffort);
      } catch (e) {
        const msg = String(e || "").toLowerCase();
        if (msg.includes("reasoning effort") || msg.includes("does not support reasoning")) {
          result = await client.selectModel(activeSessionId, provider, model);
        } else throw e;
      }
      selectedModel = `${result.selected.provider}/${result.selected.model}`;
      reasoningEffort = result.selected.reasoningEffort || "";
    } catch (error) {
      runtimeError = userFacingError(error);
      sessionErrors = { ...sessionErrors, [activeSessionId]: runtimeError };
    }
    finally { modelBusy = false; }
  }


  async function pickWorkspace(): Promise<void> {
    const selected = await window.voltDesktop?.pickWorkspace();
    if (!selected || !client) return;
    workspacePath = selected;
    await createSession(selected);
  }

  async function performManagementAction(key: string, action: () => Promise<void>): Promise<boolean> {
    if (managementBusy) return false;
    managementBusy = key;
    managementError = "";
    managementNotice = "";
    try {
      await action();
      return true;
    } catch (error) {
      managementError = userFacingError(error);
      return false;
    } finally { managementBusy = ""; }
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
      managementNotice = t("session.renamedNotice");
   });
 }

 async function duplicateSession(sessionId: string): Promise<void> {
   if (!client) return;
   await performManagementAction(`session-fork:${sessionId}`, async () => {
     const created = await client!.fork(sessionId);
     const source = sessions.find((item) => item.sessionId === sessionId);
      await client!.rename(created.sessionId, `${source ? sessionTitle(source) : t("nav.sessions")}${t("session.copySuffix")}`);
     await refresh();
     await selectSession(created.sessionId);
      managementNotice = t("session.duplicatedNotice");
   });
 }

 async function forkSessionAtSeq(seq: number): Promise<void> {
   if (!client || !activeSessionId) return;
   await performManagementAction(`session-fork:${activeSessionId}:${seq}`, async () => {
     const created = await client!.fork(activeSessionId, seq);
     await refresh();
     await selectSession(created.sessionId);
      managementNotice = t("checkpoints.forkSuccess", { seq });
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
      managementNotice = t("session.archiveSuccess");
   });
 }

 async function exportSession(sessionId: string): Promise<void> {
   const api = window.voltDesktop;
   if (!api) return;
   await performManagementAction(`session-export:${sessionId}`, async () => {
     const result = await api.exportSession(sessionId);
      managementNotice = result.saved ? t("session.exportedNotice", { path: result.path }) : t("session.exportCancelled");
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
     if (activeAgentPresetLocked) throw new Error(t("errors.presetFixed"));
     await client!.selectAgentPreset(activeSessionId, agentPreset);
     await refresh();
      managementNotice = t("agents.appliedNotice");
   });
 }

 async function openAgentPresetDocument(agentPreset: string): Promise<void> {
   if (!client) return;
   await performManagementAction(`agent-open:${agentPreset}`, async () => {
     const preset = agentPresets.find((item) => item.id === agentPreset);
     if (preset?.trust === "system") throw new Error(t("agents.readonlyPreset"));
     const result = await client!.openAgentPresetDocument(agentPreset);
      managementNotice = result.opened ? t("agents.openedNotice") : t("agents.pathNotice", { path: result.path });
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
      managementNotice = t("agents.copiedNotice");
   });
 }

 async function removeAgentPreset(agentPreset: AgentPreset): Promise<void> {
   if (!client || agentPreset.trust !== "user" || agentPreset.isDefault) return;
   await performManagementAction(`agent-remove:${agentPreset.id}`, async () => {
     await client!.removeAgentPreset(agentPreset.id);
     confirmingAgentPreset = "";
     await refreshManagement();
      managementNotice = t("agents.removedNotice");
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
      managementNotice = t("workspaces.renamedNotice");
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
      managementNotice = t("workspaces.openedInExplorer");
    });
  }

  async function removeWorkspace(workspaceId: string): Promise<void> {
    if (!client) return;
    await performManagementAction(`workspace-delete:${workspaceId}`, async () => {
      await client!.deleteWorkspace(workspaceId);
      confirmingWorkspaceId = "";
      await refresh();
      managementNotice = t("workspaces.registrationRemoved");
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
      managementNotice = t("workspaces.orderUpdated");
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
      managementNotice = t("workspaces.sessionOrderUpdated");
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
      managementNotice = existing ? t("goals.updatedNotice") : t("goals.createdNotice");
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
      managementNotice = action === "clear" ? t("goals.clearedNotice") : t("goals.statusUpdatedNotice");
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
      managementNotice = t("subagents.continuedNotice");
    });
  }

  async function interruptSelectedSubagent(): Promise<void> {
    if (!client || !activeSessionId || !selectedSubagent || selectedSubagent.kind !== "child" || selectedSubagent.mode !== "continuable") return;
    await performManagementAction("subagent-interrupt:" + selectedSubagent.id, async () => {
      await client!.interruptSubagent(activeSessionId, selectedSubagent.id);
      await refreshManagement();
      managementNotice = t("subagents.stopSentNotice");
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
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(t("settings.jsonMustBeObject"));
      patchValue = parsed as Record<string, unknown>;
    } catch (error) {
      managementError = userFacingError(error);
      return;
    }
    await performManagementAction("settings-update:" + namespace.ns, async () => {
      const updated = await client!.updateSettings(namespace.ns, patchValue, namespace.revision);
      settingsNamespaces = settingsNamespaces.map((item) => item.ns === updated.ns ? updated : item);
      settingsDraft = JSON.stringify(updated.user || {}, null, 2);
      managementNotice = updated.applies === "restart" ? t("settings.savedRestartNotice") : t("settings.savedNotice");
    });
  }

  async function openSettingsDocument(): Promise<void> {
    if (!client || !settingsHasDocument) return;
    await performManagementAction("settings-open-document", async () => {
      await client!.openSettingsDocument();
      managementNotice = t("settings.openedFileNotice");
    });
  }

  async function refreshXgGatewayModels(): Promise<void> {
    if (!client) return;
    await performManagementAction("models-discover:xg-gomodel", async () => {
      const providerSettings = await xgProviderSettings();
      if (!providerSettings) throw new Error(t("settings.noXgGomodelConfig"));
      const { namespace, config } = providerSettings;
      await requireConfiguredCredential(config);
      const baseURL = typeof config.baseURL === "string" ? config.baseURL : "";
      if (!baseURL) throw new Error(t("settings.noXgGomodelBaseUrl"));
      const discovered = await client!.discoverModels({
        settingsNs: namespace.ns,
        provider: "xg-gomodel",
        baseURL,
        ...(typeof config.api === "string" ? { api: config.api } : {}),
      });
      if (discovered.models.length === 0) throw new Error(t("settings.noModelsReturned"));
      if (!discovered.models.some((model) => model.id === "vlm")) throw new Error(t("settings.gatewayMissingVlm"));
      const merged = mergeDiscoveredModels(discovered.models, config.models);
      unknownModelCapabilities = merged.unknownCapabilities;
      await applyXgModels(namespace, merged.models);
      managementNotice = t("models.refreshedNotice", { count: discovered.models.length });
    });
  }

  async function saveCredential(): Promise<void> {
    const ref = credentialRefDraft.trim();
    const value = credentialValueDraft;
    if (!client || !ref || !value || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)) return;
    const saved = await performManagementAction("credential-set:" + ref, async () => {
      await client!.setCredential(ref, value);
      credentialValueDraft = "";
      credentials = { ...credentials, ...(await client!.describeCredentials([ref])).credentials };
      if (!credentialRefs.includes(ref)) credentialRefs = [...credentialRefs, ref].sort();
      managementNotice = t("settings.credentialSaved");
    });
    if (!saved || !credentials[ref]?.configured) return;
    clearCredentialRequirementError();
    if (ref === "XG_GOMODEL_API_KEY") {
      await refreshXgGatewayModels();
      if (managementError) managementNotice = t("settings.credentialSavedModelFailed");
      else managementNotice = t("settings.credentialSaved");
    }
  }

  function clearCredentialRequirementError(): void {
    if (!runtimeError.includes("API Key") && !runtimeError.includes("401") && !runtimeError.includes("凭据") && !runtimeError.startsWith("当前模型需要 ")) return;
    const previousError = runtimeError;
    runtimeError = "";
    if (!activeSessionId || sessionErrors[activeSessionId] !== previousError) return;
    const { [activeSessionId]: _cleared, ...remaining } = sessionErrors;
    sessionErrors = remaining;
  }

  async function unsetCredential(ref: string): Promise<void> {
    if (!client) return;
    await performManagementAction("credential-unset:" + ref, async () => {
      await client!.unsetCredential(ref);
      credentials = { ...credentials, ...(await client!.describeCredentials([ref])).credentials };
      confirmingCredentialRef = "";
      managementNotice = t("settings.credentialRemovedNotice");
    });
  }

  async function respondApproval(outcome: "allowed-once" | "rejected"): Promise<void> {
    if (!client || !pendingApproval) return;
    await client.respond({ type: "client-response", rpcId: pendingApproval.rpcId, result: { ok: true, value: { sessionId: pendingApproval.sessionId, approvalId: pendingApproval.approvalId, outcome } } });
  }

  async function respondQuestion(): Promise<void> {
    if (!client || !pendingQuestion) return;
    if (!questionsAnswered(pendingQuestion.questions, questionAnswers)) return;
    const answers = buildQuestionAnswers(pendingQuestion.questions, questionAnswers);
    await client.respond({ type: "client-response", rpcId: pendingQuestion.rpcId, result: { ok: true, value: { sessionId: pendingQuestion.sessionId, answer: { answers } } } });
  }

  function formatTime(value: number): string { return new Intl.DateTimeFormat(i18n.locale, { hour: "2-digit", minute: "2-digit" }).format(value); }
  function managementTitle(tab: ManagementTab): string {
    return t(`nav.${tab}`);
  }
  function agentPresetLabel(preset: AgentPreset): string { return preset.name?.trim() || preset.id; }
  function goalPhaseLabel(phase: GoalProjection["goal"]["phase"]): string {
    switch (phase) {
      case "active": return t("goals.phaseExecuting");
      case "paused": return t("goals.phasePaused");
      case "blocked": return t("goals.phaseBlocked");
      case "complete": return t("goals.phaseCompleted");
      default: return phase;
    }
  }
  function subagentLabel(entry: SubagentEntry): string {
    if (entry.kind === "diagnostic") return entry.id;
    return entry.label?.trim() || `${t("common.agent")} ${entry.id.slice(0, 8)}`;
  }
  function subagentStatusLabel(entry: SubagentEntry): string {
    if (entry.kind === "diagnostic") return t("subagents.diagnostic", { reason: entry.reason });
    return (entry.mode === "continuable" ? t("subagents.continuable") : t("subagents.oneOff")) + " · " + (entry.activity === "running" ? t("common.running") : t("common.pending"));
  }
  function credentialSummary(ref: string): string {
    const credential = credentials[ref];
    return credential?.configured ? `${t("common.enabled")} · ` + (credential.source || t("settings.userLayerShort")) : t("common.disabled");
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
  function knowledgeStatusLabel(): string { return skills.length > 0 ? t("knowledge.statusLoaded") : t("knowledge.statusWaiting"); }
  function permissionNotice(message: string): void { managementNotice = message; }
</script>

<svelte:head><title>{productName}</title></svelte:head>

{#if loading}
  <main class="loading-screen"><Loader size={24} label={t("app.connecting")} /><span>{t("app.connecting")}</span></main>
{:else}
  <main class="app-shell" class:compact={customization.density === "compact"}>
    <header class="topbar">
      <div class="brand"><span class="brand-mark"><Bot size={16} /></span><strong>{productName}</strong><span class="version-label">v{appVersion}</span><span class:offline={!!runtimeConnectionError} class="status-dot"></span><span class="status-copy">{runtimeConnectionError ? t("overview.runtimeError") : t("overview.runtimeNormal")}</span></div>
      <div class="topbar-center">{#if view === "settings"}<span class="topbar-workspace"><Settings2 size={13} />{t("app.workbench")}</span><span class="topbar-separator">/</span><span>{managementTitle(managementTab)}</span>{:else}<span class="topbar-workspace"><FolderOpen size={13} />{workspaceName}</span>{#if activeSession}<span class="topbar-separator">/</span><span>{sessionTitle(activeSession)}</span>{/if}{/if}</div>
      <div class="topbar-actions" style="margin-left: auto; display: flex; align-items: center; gap: 6px;">
        <Button variant="ghost" size="sm" onclick={() => toggleLocale()} title={t("app.switchLanguage")} style="font-size: 11px; gap: 4px; height: 26px; padding: 0 8px;">
          <Languages size={13} />
          <span>{i18n.locale === "zh-CN" ? "EN" : "中文"}</span>
        </Button>
      </div>
    </header>
    <div class:management-active={view === "settings"} class="workspace-layout">
      <aside class:collapsed={sidebarCollapsed} class="sidebar">
        <div class="sidebar-toolbar"><Button variant="ghost" size="icon-sm" aria-label={sidebarCollapsed ? t("app.expandSidebar") : t("app.collapseSidebar")} onclick={() => setSidebarCollapsed(!sidebarCollapsed)}>{#if sidebarCollapsed}<PanelLeftOpen size={16} />{:else}<PanelLeftClose size={16} />{/if}</Button>{#if !sidebarCollapsed}<Button variant="ghost" size="icon-sm" aria-label={t("session.newSession")} onclick={() => void createSession()}><MessageSquarePlus size={16} /></Button>{/if}</div>
        {#if !sidebarCollapsed}
          <div class="workspace-picker"><div class="section-label">{t("nav.workspaces")}</div><button class="workspace-row" onclick={() => void pickWorkspace()}><FolderOpen size={15} /><span title={workspacePath}>{workspaceName}</span><ChevronRight size={14} /></button></div>
          <div class="sidebar-search"><Search size={14} /><input aria-label={t("session.searchSessions")} placeholder={t("session.searchSessions")} bind:value={sessionQuery} /></div>
          <Separator />
          <div class="session-list"><div class="section-label section-row"><span>{t("nav.sessions")}</span><span class="count-badge">{filteredSessions.length}</span></div>{#if filteredSessions.length === 0}<div class="sidebar-empty"><MessageSquarePlus size={16} /><span>{t("session.emptyActive")}</span><small>{t("session.emptyActiveDesc")}</small></div>{:else}{#each filteredSessions as session (session.sessionId)}{@const health = sessionHealth(session, !!sessionErrors[session.sessionId])}<button class:active={session.sessionId === activeSessionId} class="session-row" onclick={() => void selectSession(session.sessionId)}><span class="session-state" class:running={health === "running"} class:error={health === "error"}></span><span class="session-copy"><strong>{sessionTitle(session)}</strong><small>{session.cwd || workspaceName} · {sessionHealthLabel(health)}</small></span><time>{formatTime(session.updatedAt)}</time></button>{/each}{/if}</div>
          <div class="sidebar-footer"><Button variant="ghost" class={`footer-button${view === "knowledge" ? " active" : ""}`} onclick={() => openKnowledge()}><BookOpen size={15} />{t("nav.knowledge")}</Button><Button variant="ghost" class="footer-button" onclick={() => openManagement("overview")}><Settings2 size={15} />{t("nav.overview")}</Button><Button variant="ghost" class="footer-button" onclick={() => setActivityOpen(!activityOpen)}><History size={15} />{t("activity.title")}<span class="footer-spacer"></span><ChevronDown class={!activityOpen ? "rotated" : ""} size={14} /></Button></div>
        {/if}
      </aside>
      <section class="content-area">
        {#if view === "settings"}
          <div class="management-page">
            <header class="management-header"><div><div class="eyebrow">{t("app.eyebrow")}</div><h1>{t("app.workbench")}</h1><p>{t("app.workbenchDesc")}</p></div><Button variant="outline" size="sm" onclick={() => view = "conversation"}><ChevronRight class="rotate-180" size={14} />{t("app.backToConversation")}</Button></header>
            <div class="management-body">
              <nav class="management-nav" aria-label={t("app.managementNavAria")}><button class:active={managementTab === "overview"} onclick={() => managementTab = "overview"}><ClipboardList size={15} /><span>{t("nav.overview")}</span></button><button class:active={managementTab === "sessions"} onclick={() => managementTab = "sessions"}><MessageSquare size={15} /><span>{t("nav.sessions")}</span></button><button class:active={managementTab === "goals"} onclick={() => managementTab = "goals"}><Target size={15} /><span>{t("nav.goals")}</span></button><button class:active={managementTab === "subagents"} onclick={() => managementTab = "subagents"}><Network size={15} /><span>{t("nav.subagents")}</span></button><button class:active={managementTab === "agents"} onclick={() => managementTab = "agents"}><UserRoundCog size={15} /><span>{t("nav.agents")}</span></button><button class:active={managementTab === "models"} onclick={() => managementTab = "models"}><Bot size={15} /><span>{t("nav.models")}</span></button><button class:active={managementTab === "workspaces"} onclick={() => managementTab = "workspaces"}><FolderOpen size={15} /><span>{t("nav.workspaces")}</span></button><button class:active={managementTab === "mounts"} onclick={() => managementTab = "mounts"}><HardDrive size={15} /><span>{t("nav.mounts")}</span></button><button class:active={managementTab === "plugins"} onclick={() => managementTab = "plugins"}><Blocks size={15} /><span>{t("nav.plugins")}</span></button><button class:active={managementTab === "mcp"} onclick={() => managementTab = "mcp"}><Cable size={15} /><span>{t("nav.mcp")}</span></button><button class:active={managementTab === "knowledge"} onclick={() => managementTab = "knowledge"}><BookOpen size={15} /><span>{t("nav.knowledge")}</span></button><button class:active={managementTab === "settings"} onclick={() => managementTab = "settings"}><Settings2 size={15} /><span>{t("nav.settings")}</span></button><button class:active={managementTab === "runtime"} onclick={() => managementTab = "runtime"}><ShieldAlert size={15} /><span>{t("nav.runtime")}</span></button></nav>
              <section class="management-content">
                <div class="management-toolbar"><div class="section-label">{managementTitle(managementTab)}</div><div class="settings-filter"><Search size={14} /><Input aria-label={t("overview.filterManagement")} placeholder={t("overview.filterManagement")} bind:value={settingsQuery} /></div></div>
                {#if managementError}<div class="management-feedback error"><CircleAlert size={14} /><span>{managementError}</span><button aria-label={t("app.closeManagementError")} onclick={() => managementError = ""}><X size={13} /></button></div>{/if}
                {#if managementNotice}<div class="management-feedback success"><CircleCheck size={14} /><span>{managementNotice}</span><button aria-label={t("app.closeManagementNotice")} onclick={() => managementNotice = ""}><X size={13} /></button></div>{/if}
                {#if managementTab === "overview"}
                  <div class="management-summary-grid"><button onclick={() => managementTab = "sessions"}><span class="summary-icon"><MessageSquare size={16} /></span><strong>{t("overview.sessionsTitle")}</strong><small>{t("overview.sessionsDesc", { active: sessions.length, archived: archivedSessionIds.length })}</small></button><button onclick={() => managementTab = "goals"}><span class="summary-icon"><Target size={16} /></span><strong>{t("overview.goalsTitle")}</strong><small>{currentGoal ? goalPhaseLabel(currentGoal.goal.phase) : t("overview.noGoal")}</small></button><button onclick={() => managementTab = "subagents"}><span class="summary-icon"><Network size={16} /></span><strong>{t("overview.subagentsTitle")}</strong><small>{t("overview.subagentsDesc", { count: subagents.filter((item) => item.kind === "child").length })}</small></button><button onclick={() => managementTab = "agents"}><span class="summary-icon"><UserRoundCog size={16} /></span><strong>{t("overview.agentsTitle")}</strong><small>{t("overview.agentsDesc", { count: agentPresets.length })}</small></button><button onclick={() => managementTab = "models"}><span class="summary-icon"><Bot size={16} /></span><strong>{t("overview.modelsTitle")}</strong><small>{selectedModel || t("overview.noModelSelected")}</small></button><button onclick={() => managementTab = "workspaces"}><span class="summary-icon"><FolderOpen size={16} /></span><strong>{t("overview.workspacesTitle")}</strong><small>{t("overview.workspacesDesc", { count: workspaces.length })}</small></button><button onclick={() => managementTab = "plugins"}><span class="summary-icon"><Blocks size={16} /></span><strong>{t("overview.pluginsTitle")}</strong><small>{t("overview.pluginsDesc", { total: purePlugins.length, enabled: purePlugins.filter((item) => item.enabled).length })}</small></button><button onclick={() => managementTab = "mcp"}><span class="summary-icon"><Cable size={16} /></span><strong>{t("overview.mcpTitle")}</strong><small>{mcpInventoryEntries.length > 0 ? t("overview.mcpDesc", { count: mcpInventoryEntries.length }) : t("overview.mcpReady")}</small></button><button onclick={() => managementTab = "knowledge"}><span class="summary-icon"><BookOpen size={16} /></span><strong>{t("overview.knowledgeTitle")}</strong><small>{knowledgeStatusLabel()}</small></button><button onclick={() => managementTab = "settings"}><span class="summary-icon"><Settings2 size={16} /></span><strong>{t("overview.settingsTitle")}</strong><small>{t("overview.settingsDesc", { namespaces: settingsNamespaces.length, credentials: credentialRefs.length })}</small></button><button onclick={() => managementTab = "runtime"}><span class="summary-icon"><ShieldAlert size={16} /></span><strong>{t("overview.runtimeTitle")}</strong><small>{runtimeConnectionError ? t("overview.runtimeError") : t("overview.runtimeNormal")}</small></button></div>
                  <SettingsGroup title={t("overview.currentSession")} description={t("overview.currentSessionDesc")}><div class="diagnostic-row"><span>{t("overview.sessionLabel")}</span><strong>{activeSession ? sessionTitle(activeSession) : t("overview.unselected")}</strong></div><div class="diagnostic-row"><span>{t("overview.workspaceLabel")}</span><strong>{workspacePath || t("overview.unselected")}</strong></div><div class="diagnostic-row"><span>{t("overview.modelLabel")}</span><strong>{selectedModel || t("overview.defaultModel")}</strong></div></SettingsGroup>
                {:else if managementTab === "sessions"}
                  <SettingsGroup title={t("session.sessionManagement")} description={t("session.sessionManagementDesc")}>
                    <div class="management-actions">
                      <Button size="sm" onclick={() => void createSession()}><MessageSquarePlus size={14} />{t("session.newSession")}</Button>
                      <Button variant="outline" size="sm" onclick={() => void refresh()}><History size={14} />{t("session.refresh")}</Button>
                    </div>
                    {#if filteredManagementSessions.length === 0}
                      <DataState state="empty" title={t("session.noMatch")} description={t("session.noMatchDesc")} />
                    {:else}
                      <div class="management-list">
                        {#each filteredManagementSessions as item (item.sessionId)}
                          {@const health = sessionHealth(item, !!sessionErrors[item.sessionId])}
                          <div class="management-list-row session-management-row">
                            <span class="row-icon"><MessageSquare size={15} /></span>
                            <div class="session-management-info">
                              {#if editingSessionId === item.sessionId}
                                <Input class="inline-edit-input" aria-label={t("session.nameLabel")} bind:value={sessionTitleDraft} onkeydown={(event) => { if (event.key === "Enter") void saveSessionRename(item.sessionId); if (event.key === "Escape") editingSessionId = ""; }} />
                              {:else}
                                <div class="session-management-title-row">
                                  <strong class="session-management-title truncate">{sessionTitle(item)}</strong>
                                  <span class="session-health session-health--{health}">{sessionHealthLabel(health)}</span>
                                </div>
                                <small class="session-management-path truncate" title={item.cwd || workspaceName}>{item.cwd || workspaceName} · {item.agentPreset || t("session.defaultAgent")}</small>
                              {/if}
                            </div>
                            {#if editingSessionId === item.sessionId}
                              <div class="row-actions">
                                <Button size="sm" disabled={!!managementBusy} onclick={() => void saveSessionRename(item.sessionId)}><Check size={13} />{t("common.save")}</Button>
                                <Button variant="ghost" size="sm" onclick={() => editingSessionId = ""}>{t("common.cancel")}</Button>
                              </div>
                            {:else}
                              <div class="row-actions session-actions">
                                <Button variant="ghost" size="icon-sm" aria-label={t("session.openSession")} title={health === "error" ? t("session.openSessionHelp") : t("session.openSession")} onclick={() => void selectSession(item.sessionId)}><ExternalLink size={14} /></Button>
                                <Button variant="ghost" size="icon-sm" aria-label={t("session.renameSession")} title={t("session.renameSession")} onclick={() => beginSessionRename(item)}><Pencil size={14} /></Button>
                                <Button variant="ghost" size="icon-sm" aria-label={t("session.duplicateSession")} title={t("session.duplicateSession")} disabled={!!managementBusy} onclick={() => void duplicateSession(item.sessionId)}><Copy size={14} /></Button>
                                <Button variant="ghost" size="icon-sm" aria-label={t("session.exportSession")} title={t("session.exportSession")} disabled={!!managementBusy} onclick={() => void exportSession(item.sessionId)}><Save size={14} /></Button>
                                <Button variant="ghost" size="icon-sm" aria-label={t("session.archiveSession")} title={t("session.archiveSession")} disabled={!!managementBusy} onclick={() => void archiveManagedSession(item.sessionId)}><Archive size={14} /></Button>
                              </div>
                            {/if}
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </SettingsGroup>
                  <SettingsGroup title={t("session.checkpointsTitle")} description={t("session.checkpointsDesc")}>
                    <div class="management-actions">
                      <StatusBadge status={pluginInventory.some((item) => item.moduleName.includes("session-checkpoint-policy") && item.fiberPhase === "active") ? "success" : "neutral"} label={pluginInventory.some((item) => item.moduleName.includes("session-checkpoint-policy") && item.fiberPhase === "active") ? t("session.checkpointsEnabled") : t("session.checkpointsMissing")} />
                    </div>
                    {#if messages.some((message) => typeof message.seq === "number")}
                      <div class="management-list checkpoint-list">
                        {#each messages.filter((message) => typeof message.seq === "number").slice(-20).reverse() as message (message.id)}
                          <div class="management-list-row checkpoint-row">
                            <span class="row-icon"><GitBranch size={14} /></span>
                            <div class="checkpoint-info">
                              <div class="checkpoint-title-row">
                                <strong>{t("checkpoints.event", { seq: message.seq })}</strong>
                                <span class="checkpoint-role-badge">{message.role === "assistant" ? t("common.agent") : message.role === "user" ? t("common.user") : t("common.tool")}</span>
                              </div>
                              <small class="checkpoint-detail truncate">{(message.text || message.tool?.name || t("checkpoints.event", { seq: message.seq || "" })).slice(0, 80)}</small>
                            </div>
                            <Button variant="outline" size="sm" disabled={!!managementBusy} onclick={() => void forkSessionAtSeq(message.seq!)}><GitBranch size={13} />{t("checkpoints.forkFromHere")}</Button>
                          </div>
                        {/each}
                      </div>
                    {:else}
                      <DataState state="empty" title={t("session.noBranchEvents")} description={t("session.noBranchEventsDesc")} />
                    {/if}
                  </SettingsGroup>
                {:else if managementTab === "agents"}
                  <SettingsGroup title={t("agents.title")} description={t("agents.description")}>
                    <div class="management-actions">
                      <Button variant="outline" size="sm" onclick={() => void refreshManagement()}><History size={14} />{t("agents.refreshPresets")}</Button>
                      {#if activeAgentPresetLocked}<span class="management-capability">{t("agents.sessionStartedLocked")}</span>{/if}
                      {#if agentAuthorable && agentHasDocument}<span class="management-capability">{t("agents.supportsUserConfig")}</span>{/if}
                    </div>
                    {#if filteredAgentPresets.length === 0}
                      <DataState state="empty" title={t("agents.empty")} description={t("agents.emptyDesc")} />
                    {:else}
                      <div class="management-list">
                        {#each filteredAgentPresets as preset (preset.id)}
                          <div class="management-list-row agent-management-row">
                            <span class="row-icon"><UserRoundCog size={15} /></span>
                            <div class="agent-info">
                              <div class="agent-title-row">
                                <strong>{agentPresetLabel(preset)}</strong>
                                <span class="agent-trust-badge">{preset.trust === "system" ? t("agents.systemPreset") : t("agents.userPreset")}</span>
                                {#if preset.isDefault}<span class="default-badge">{t("agents.defaultBadge")}</span>{/if}
                              </div>
                              <small>{preset.description || preset.id}{#if preset.broken} · <span class="text-destructive">{preset.broken}</span>{/if}</small>
                            </div>
                            <div class="row-actions agent-actions">
                              <Button variant={activeSession?.agentPreset === preset.id ? "default" : "outline"} size="sm" disabled={!activeSessionId || activeAgentPresetLocked || activeSession?.agentPreset === preset.id || !!preset.broken || !!managementBusy} title={activeAgentPresetLocked ? t("agents.sessionStartedLocked") : undefined} onclick={() => void chooseAgentPreset(preset.id)}>
                                {activeSession?.agentPreset === preset.id ? t("agents.currentlyActive") : t("agents.apply")}
                              </Button>
                              <Button variant="ghost" size="icon-sm" aria-label={t("agents.viewConfig")} title={t("agents.viewConfig")} disabled={!!managementBusy} onclick={() => void previewAgentPreset(preset.id)}><FileText size={14} /></Button>
                              <Button variant="ghost" size="icon-sm" aria-label={t("agents.openConfigFile")} title={t("agents.openConfigFile")} disabled={!!managementBusy} onclick={() => void openAgentPresetDocument(preset.id)}><ExternalLink size={14} /></Button>
                            </div>
                          </div>
                        {/each}
                      </div>
                    {/if}
                    {#if agentPreview}
                      <div class="agent-preview">
                        <div class="agent-preview-heading">
                          <strong>{agentPreview.id}</strong>
                          <Button variant="ghost" size="icon-sm" aria-label={t("agents.closePreview")} onclick={() => agentPreview = undefined}><X size={14} /></Button>
                        </div>
                        <pre>{agentPreview.content}</pre>
                      </div>
                    {/if}
                  </SettingsGroup>
                  {#if agentAuthorable}
                    <SettingsGroup title={t("agents.userPresetMaintenance")} description={t("agents.userPresetMaintenanceDesc")}>
                      <div class="agent-preset-maintenance-card">
                        <div class="agent-preset-maintenance-form">
                          <select class="agent-preset-select" aria-label={t("agents.selectUserPreset")} bind:value={copyingAgentPreset}>
                            <option value="">{t("agents.selectUserPreset")}</option>
                            {#each agentPresets.filter((preset) => preset.trust === "user") as preset (preset.id)}
                              <option value={preset.id}>{agentPresetLabel(preset)}</option>
                            {/each}
                          </select>
                          <Input aria-label={t("agents.copyNameLabel")} bind:value={copyAgentNameDraft} placeholder={t("agents.copyNamePlaceholder")} />
                          <Button size="sm" disabled={!copyingAgentPreset || !!managementBusy} onclick={() => { const preset = agentPresets.find((item) => item.id === copyingAgentPreset); if (preset) void copyAgentPreset(preset); }}>
                            <Copy size={13} />
                            {t("agents.createCopy")}
                          </Button>
                          {#if copyingAgentPreset && agentPresets.find((item) => item.id === copyingAgentPreset)?.isDefault !== true}
                            {#if confirmingAgentPreset === copyingAgentPreset}
                              <Button variant="destructive" size="sm" disabled={!!managementBusy} onclick={() => { const preset = agentPresets.find((item) => item.id === copyingAgentPreset); if (preset) void removeAgentPreset(preset); }}>
                                <Trash2 size={13} />
                                {t("agents.confirmDelete")}
                              </Button>
                              <Button variant="ghost" size="sm" onclick={() => confirmingAgentPreset = ""}>{t("common.cancel")}</Button>
                            {:else}
                              <Button variant="outline" size="sm" onclick={() => confirmingAgentPreset = copyingAgentPreset}>
                                <Trash2 size={13} />
                                {t("agents.deletePreset")}
                              </Button>
                            {/if}
                          {/if}
                        </div>
                      </div>
                    </SettingsGroup>
                  {/if}
                {:else if managementTab === "goals"}
                  <SettingsGroup title={t("goals.title")} description={t("goals.description")}>
                    <div class="management-actions">
                      <Button size="sm" onclick={() => { if (currentGoal) beginGoalEdit(); else { editingGoal = true; goalObjectiveDraft = ""; goalRoundsDraft = "256"; } }}>
                        <Target size={14} />
                        {currentGoal ? t("goals.editGoal") : t("goals.createGoal")}
                      </Button>
                      {#if currentGoal && currentGoal.goal.phase === "active"}
                        <Button variant="outline" size="sm" disabled={!!managementBusy} onclick={() => void mutateGoal("pause")}><Pause size={14} />{t("goals.pause")}</Button>
                      {:else if currentGoal && (currentGoal.goal.phase === "paused" || currentGoal.goal.phase === "blocked")}
                        <Button variant="outline" size="sm" disabled={!!managementBusy} onclick={() => void mutateGoal("resume")}><Play size={14} />{t("goals.resume")}</Button>
                      {/if}
                      {#if currentGoal && currentGoal.goal.phase !== "complete"}
                        <Button variant="outline" size="sm" disabled={!!managementBusy} onclick={() => void mutateGoal("complete")}><Check size={14} />{t("common.complete")}</Button>
                      {/if}
                      {#if currentGoal}
                        {#if confirmingGoalClear}
                          <Button variant="destructive" size="sm" disabled={!!managementBusy} onclick={() => void mutateGoal("clear")}><Trash2 size={13} />{t("goals.confirmClear")}</Button>
                          <Button variant="ghost" size="sm" onclick={() => confirmingGoalClear = false}>{t("common.cancel")}</Button>
                        {:else}
                          <Button variant="outline" size="sm" aria-label={t("goals.clear")} title={t("goals.clear")} onclick={() => confirmingGoalClear = true}><Trash2 size={13} />{t("goals.clear")}</Button>
                        {/if}
                      {/if}
                    </div>
                    {#if editingGoal}
                      <div class="goal-editor">
                        <label>{t("goals.objective")}<Input aria-label={t("goals.objective")} bind:value={goalObjectiveDraft} placeholder={t("goals.objectivePlaceholder")} /></label>
                        <label>{t("goals.rounds")}<Input aria-label={t("goals.rounds")} type="number" min="1" bind:value={goalRoundsDraft} /></label>
                        <div class="row-actions">
                          <Button size="sm" disabled={!!managementBusy} onclick={() => void saveGoal()}><Save size={13} />{t("common.save")}</Button>
                          <Button variant="ghost" size="sm" onclick={() => editingGoal = false}>{t("common.cancel")}</Button>
                        </div>
                      </div>
                    {/if}
                    {#if currentGoal}
                      <div class="goal-status-grid">
                        <div class="goal-status-card"><span>{t("common.status")}</span><strong>{goalPhaseLabel(currentGoal.goal.phase)}</strong></div>
                        <div class="goal-status-card"><span>{t("goals.roundsCount")}</span><strong>{currentGoal.roundsStarted} / {currentGoal.goal.maxGoalRounds}</strong></div>
                        <div class="goal-status-card"><span>{t("goals.version")}</span><strong>{currentGoal.goal.revision}</strong></div>
                      </div>
                      <div class="goal-objective-card">
                        <div class="goal-objective-header"><span>{t("goals.currentGoalSettings")}</span></div>
                        <div class="goal-objective-body">{currentGoal.goal.objective}</div>
                      </div>
                      {#if currentGoal.goal.blockedReason}
                        <div class="management-feedback error" style="margin-top: 10px;">
                          <CircleAlert size={14} />
                          <span>{String(currentGoal.goal.blockedReason)}</span>
                        </div>
                      {/if}
                    {:else}
                      <DataState state="empty" title={t("goals.noGoal")} description={t("goals.noGoalDesc")} />
                    {/if}
                  </SettingsGroup>
                {:else if managementTab === "subagents"}
                  <SettingsGroup title={t("subagents.title")} description={t("subagents.description")}><div class="management-actions"><Button variant="outline" size="sm" onclick={() => void refreshManagement()}><History size={14} />{t("subagents.refresh")}</Button><span class="management-capability">{subagentParentAvailable ? t("subagents.parentAvailable") : t("subagents.parentUnavailable")}</span></div>{#if subagents.length === 0}<DataState state="empty" title={t("subagents.empty")} description={t("subagents.emptyDesc")} />{:else}<div class="management-list">{#each subagents as entry (entry.id)}<div class:chosen={entry.id === selectedSubagentId} class="management-list-row subagent-management-row"><span class="row-icon"><Network size={15} /></span><div><strong>{subagentLabel(entry)}</strong><small>{subagentStatusLabel(entry)}</small></div>{#if entry.kind === "child"}<div class="row-actions"><Button variant="ghost" size="sm" onclick={() => void selectSubagent(entry)}>{t("subagents.viewHistory")}</Button>{#if entry.mode === "continuable" && entry.activity === "running"}<Button variant="ghost" size="icon-sm" aria-label={t("subagents.stopSubagent")} title={t("subagents.stopSubagent")} disabled={!!managementBusy} onclick={() => { selectedSubagentId = entry.id; void interruptSelectedSubagent(); }}><Square size={14} /></Button>{/if}</div>{/if}</div>{/each}</div>{/if}{#if selectedSubagent && selectedSubagent.kind === "child"}<div class="subagent-history"><div class="agent-preview-heading"><strong>{t("subagents.historyOf", { label: subagentLabel(selectedSubagent) })}</strong><span class="management-capability">{selectedSubagent.mode === "continuable" ? t("subagents.continuable") : t("subagents.oneOff")}</span></div>{#if subagentMessages.length === 0}<DataState state="empty" title={t("subagents.noHistory")} description={t("subagents.noHistoryDesc")} />{:else}{#each subagentMessages as message (message.id)}<article class="subagent-message"><div class="message-meta"><strong>{message.role === "assistant" ? t("common.agent") : message.role === "user" ? t("common.user") : t("common.tool")}</strong></div><div class="message-text">{message.text}</div></article>{/each}{/if}{#if selectedSubagent.mode === "continuable"}<div class="subagent-composer"><Input aria-label={t("subagents.instructionAria")} bind:value={subagentPromptDraft} placeholder={t("subagents.sendInstruction")} onkeydown={(event) => { if (event.key === "Enter") void promptSelectedSubagent(); }} /><Button size="sm" disabled={!subagentPromptDraft.trim() || !!managementBusy} onclick={() => void promptSelectedSubagent()}><Send size={13} />{t("subagents.send")}</Button></div>{/if}</div>{/if}</SettingsGroup>
                {:else if managementTab === "models"}
                  <SettingsGroup title={t("models.title")} description={t("models.description")}>
                    <div class="management-actions models-toolbar">
                      <div class="models-toolbar-buttons">
                        <Button size="sm" disabled={!!managementBusy || !xgGatewayCredentialReady} title={xgGatewayCredentialReady ? t("models.refreshFromService") : t("models.requireKeyNotice", { ref: "XG_GOMODEL_API_KEY" })} onclick={() => void refreshXgGatewayModels()}>
                          <RefreshCw size={13} />
                          {t("models.refreshFromService")}
                        </Button>
                        {#if !xgGatewayCredentialReady}
                          <Button variant="outline" size="sm" onclick={() => openManagement("settings")}>
                            <KeyRound size={13} />
                            {t("models.goToSaveKey")}
                          </Button>
                        {/if}
                        <Button variant="outline" size="sm" onclick={() => void refreshManagement()}>{t("models.refreshCatalog")}</Button>
                      </div>
                      {#if hostInfo}
                        <span class="management-capability">{t("models.defaultModelPrefix")}{hostInfo.provider || t("models.auto")}/{hostInfo.model || t("models.auto")}</span>
                      {/if}
                    </div>
                    {#if modelGroups.length === 0}
                      <DataState state="empty" title={t("models.emptySessionModels")} description={t("models.emptySessionModelsDesc")} />
                    {:else}
                      {#each modelGroups as group (group.id)}
                        <div class="model-group">
                          <div class="model-group-header">
                            <strong>{group.name}</strong>
                            {#if !modelCredentialConfigured(group.id)}
                              <span class="model-group-unconfigured-badge">{t("models.unconfiguredKeyBadge")}</span>
                            {/if}
                          </div>
                          {#each group.models as model (model.id)}
                            <button class:chosen={`${group.id}/${model.id}` === selectedModel} class="model-option" disabled={modelBusy || !modelCredentialConfigured(group.id)} title={modelCredentialConfigured(group.id) ? undefined : t("models.missingProviderKey")} onclick={() => void chooseModel(group.id, model.id)}>
                              <span>
                                <strong>{model.name}</strong>
                                <small>
                                  {modelCredentialConfigured(group.id) ? modelCapabilityLabel(model, group.id === "xg-gomodel" && unknownModelCapabilities.has(model.id)) : t("models.needApiKey")}
                                  {#if model.contextWindow} · {t("models.contextWindow", { count: model.contextWindow.toLocaleString() })}{/if}
                                  {#if model.maxTokens} · {t("models.maxTokens", { count: model.maxTokens.toLocaleString() })}{/if}
                                </small>
                              </span>
                              {#if `${group.id}/${model.id}` === selectedModel}
                                <Check size={14} class="model-selected-check" />
                              {/if}
                            </button>
                          {/each}
                        </div>
                      {/each}
                    {/if}
                    {#if catalogGroups.length > 0}
                      <div class="catalog-divider"><span>{t("models.globalProviderCatalog")}</span></div>
                      <div class="catalog-group-container">
                        {#each catalogGroups as group (group.id)}
                          <div class="model-group catalog-group">
                            <div class="model-group-header">
                              <strong>{group.name}</strong>
                              <small>{t("models.availableModelsCount", { count: group.models.length })}</small>
                            </div>
                            <div class="catalog-models-list">
                              {#each group.models as model (model.id)}
                                <div class="catalog-model-row">
                                  <strong>{model.name}</strong>
                                  <small>{model.id}{#if model.contextWindow} · {t("models.contextWindow", { count: model.contextWindow.toLocaleString() })}{/if}{#if model.maxTokens} · {t("models.maxTokens", { count: model.maxTokens.toLocaleString() })}{/if}</small>
                                </div>
                              {/each}
                            </div>
                          </div>
                        {/each}
                      </div>
                    {/if}
                    {#if catalogFailures.length > 0}
                      <div class="knowledge-note">
                        <CircleAlert size={14} />
                        <span>{t("models.catalogFailures", { count: catalogFailures.length, names: catalogFailures.map((item) => item.name).join("、") })}</span>
                      </div>
                    {/if}
                  </SettingsGroup>
                {:else if managementTab === "workspaces"}
                  <SettingsGroup title={t("workspaces.title")} description={t("workspaces.description")}>
                    <div class="management-actions">
                      <Button size="sm" onclick={() => void pickWorkspace()}><FolderOpen size={14} />{t("workspaces.pickWorkspace")}</Button>
                      <Button variant="outline" size="sm" onclick={() => void refresh()}><History size={14} />{t("common.refresh")}</Button>
                    </div>
                    {#if filteredWorkspaces.length === 0}
                      <div class="workspace-empty-banner">
                        <FolderOpen size={20} />
                        <div>
                          <strong>{t("workspaces.emptyBannerTitle")}</strong>
                          <small>{t("workspaces.emptyBannerDesc")}</small>
                        </div>
                      </div>
                    {:else}
                      <div class="management-list">
                        {#each filteredWorkspaces as item (item.workspaceId)}
                          <div class="management-list-row workspace-management-row">
                            <span class="row-icon"><FolderOpen size={15} /></span>
                            <div>
                              {#if editingWorkspaceId === item.workspaceId}
                                <Input class="inline-edit-input" aria-label={t("workspaces.nameLabel")} bind:value={workspaceTitleDraft} onkeydown={(event) => { if (event.key === "Enter") void saveWorkspaceRename(item.workspaceId); if (event.key === "Escape") editingWorkspaceId = ""; }} />
                              {:else}
                                <strong>{item.title}</strong>
                                <small>{item.path}</small>
                              {/if}
                            </div>
                            {#if editingWorkspaceId === item.workspaceId}
                              <div class="row-actions">
                                <Button size="sm" disabled={!!managementBusy} onclick={() => void saveWorkspaceRename(item.workspaceId)}><Check size={13} />{t("common.save")}</Button>
                                <Button variant="ghost" size="sm" onclick={() => editingWorkspaceId = ""}>{t("common.cancel")}</Button>
                              </div>
                            {:else}
                              <em>{t("workspaces.sessionsCount", { count: item.sessionIds.length })}</em>
                              <div class="row-actions">
                                <Button variant="ghost" size="icon-sm" aria-label={t("workspaces.enterWorkspace")} title={t("workspaces.enterWorkspace")} onclick={() => void enterWorkspace(item)}><ExternalLink size={14} /></Button>
                                <Button variant="ghost" size="icon-sm" aria-label={t("workspaces.openInExplorer")} title={t("workspaces.openInExplorer")} disabled={!!managementBusy} onclick={() => void openWorkspacePath(item)}><FolderOpen size={14} /></Button>
                                <Button variant="ghost" size="icon-sm" aria-label={t("workspaces.renameWorkspace")} title={t("workspaces.renameWorkspace")} onclick={() => beginWorkspaceRename(item)}><Pencil size={14} /></Button>
                                {#if confirmingWorkspaceId === item.workspaceId}
                                  <Button variant="destructive" size="sm" disabled={!!managementBusy} onclick={() => void removeWorkspace(item.workspaceId)}><Trash2 size={13} />{t("workspaces.confirmRemove")}</Button>
                                  <Button variant="ghost" size="sm" onclick={() => confirmingWorkspaceId = ""}>{t("common.cancel")}</Button>
                                {:else}
                                  <Button variant="ghost" size="icon-sm" aria-label={t("workspaces.removeRegistration")} title={t("workspaces.removeRegistration")} onclick={() => confirmingWorkspaceId = item.workspaceId}><Trash2 size={14} /></Button>
                                {/if}
                              </div>
                            {/if}
                          </div>
                        {/each}
                      </div>
                    {/if}
                    <div class="workspace-browser-divider"><span>{t("workspaces.directoryBrowsing")}</span></div>
                    {#if client}
                      <WorkspaceBrowser client={client} onRegistered={() => { void refresh(); void refreshManagement(); }} />
                    {/if}
                  </SettingsGroup>
                  <SettingsGroup title={t("workspaces.officialOrder")} description={t("workspaces.officialOrderDesc")}><div class="management-list">{#each filteredWorkspaces as workspace, index (workspace.workspaceId)}<div class="management-list-row"><span class="row-icon"><FolderOpen size={15} /></span><div><strong>{workspace.title}</strong><small>{t("workspaces.sessionsCount", { count: workspace.sessionIds.length })}</small></div><div class="row-actions"><Button variant="ghost" size="icon-sm" aria-label={t("workspaces.moveWorkspaceUp")} title={t("workspaces.moveWorkspaceUp")} disabled={index === 0 || !!managementBusy} onclick={() => void moveWorkspace(workspace.workspaceId, -1)}><ChevronDown class="rotate-180" size={14} /></Button><Button variant="ghost" size="icon-sm" aria-label={t("workspaces.moveWorkspaceDown")} title={t("workspaces.moveWorkspaceDown")} disabled={index === filteredWorkspaces.length - 1 || !!managementBusy} onclick={() => void moveWorkspace(workspace.workspaceId, 1)}><ChevronDown size={14} /></Button></div></div>{#each workspace.sessionIds as sessionId, sessionIndex (sessionId)}<div class="management-list-row nested-order-row"><span class="row-icon"><MessageSquare size={13} /></span><div><strong>{sessionTitle(sessions.find((item) => item.sessionId === sessionId) || { sessionId, updatedAt: 0, running: false, blank: false })}</strong><small>{sessionId}</small></div><div class="row-actions"><Button variant="ghost" size="icon-sm" aria-label={t("workspaces.moveSessionUp")} title={t("workspaces.moveSessionUp")} disabled={sessionIndex === 0 || !!managementBusy} onclick={() => void moveWorkspaceSession(workspace, sessionId, -1)}><ChevronDown class="rotate-180" size={13} /></Button><Button variant="ghost" size="icon-sm" aria-label={t("workspaces.moveSessionDown")} title={t("workspaces.moveSessionDown")} disabled={sessionIndex === workspace.sessionIds.length - 1 || !!managementBusy} onclick={() => void moveWorkspaceSession(workspace, sessionId, 1)}><ChevronDown size={13} /></Button></div></div>{/each}{/each}</div></SettingsGroup>
                {:else if managementTab === "mounts"}
                  <SmbMounts />
                {:else if managementTab === "plugins"}
                  <PluginInventoryView entries={pluginInventory} onRefresh={() => void refreshManagement()} />
                {:else if managementTab === "mcp"}
                  <McpInventoryView entries={pluginInventory} onRefresh={() => void refreshManagement()} onNavigateToSettings={() => openManagement("settings")} />
                {:else if managementTab === "knowledge"}
                  <SettingsGroup title={t("knowledge.title")} description={t("knowledge.description")}>
                    <div class="knowledge-health-grid">
                      <div class="knowledge-health-card">
                        <span>{t("knowledge.statSkill")}</span>
                        <strong>{skills.length ? t("knowledge.statSkillLoaded", { count: skills.length }) : t("knowledge.statSkillEmpty")}</strong>
                        <small>{skills.length ? t("knowledge.statSkillDescLoaded") : t("knowledge.statSkillDescEmpty")}</small>
                      </div>
                      <div class="knowledge-health-card">
                        <span>{t("knowledge.statWorkspace")}</span>
                        <strong>{workspacePath ? t("knowledge.statWorkspaceReady") : t("knowledge.statWorkspaceEmpty")}</strong>
                        <small>{workspacePath ? t("knowledge.statWorkspaceDescReady") : t("knowledge.statWorkspaceDescEmpty")}</small>
                      </div>
                      <div class="knowledge-health-card">
                        <span>{t("knowledge.statSession")}</span>
                        <strong>{activeSession ? t("knowledge.statSessionReady") : t("knowledge.statSessionEmpty")}</strong>
                        <small>{activeSession ? t("knowledge.statSessionDescReady") : t("knowledge.statSessionDescEmpty")}</small>
                      </div>
                      <div class="knowledge-health-card">
                        <span>{t("knowledge.statPersistent")}</span>
                        <strong>{t("knowledge.statPersistentStatus")}</strong>
                        <small>{t("knowledge.statPersistentDesc")}</small>
                      </div>
                    </div>
                    <div class="knowledge-toolbar">
                      <Button size="sm" onclick={() => void pickWorkspace()}><FolderOpen size={14} />{t("knowledge.selectWorkspaceBtn")}</Button>
                      <Button variant="outline" size="sm" onclick={() => void createSession()}><MessageSquarePlus size={14} />{t("knowledge.newKnowledgeSessionBtn")}</Button>
                      <Button variant="outline" size="sm" onclick={() => openKnowledgePrompt(t("knowledge.createInventoryPrompt"))}><ClipboardList size={14} />{t("knowledge.scanWorkspaceBtn")}</Button>
                      <Button variant="outline" size="sm" onclick={() => openKnowledgePrompt(t("knowledge.searchWorkspacePrompt"))}><Search size={14} />{t("knowledge.searchWorkspaceBtn")}</Button>
                      <Button variant="outline" size="sm" onclick={() => void refreshManagement()}><History size={14} />{t("knowledge.refreshKnowledgeBtn")}</Button>
                    </div>
                    {#if skills.length === 0}
                      <DataState state="empty" title={t("knowledge.emptyKnowledgeTitle")} description={t("knowledge.emptyKnowledgeDesc")} />
                    {:else}
                      <div class="knowledge-skill-list">
                        {#each skills.filter((skill) => !settingsQuery || `${skill.name} ${skill.description}`.toLowerCase().includes(settingsQuery.toLowerCase())) as skill (skill.name)}
                          <article>
                            <div class="skill-heading"><span class="row-icon"><BookOpen size={15} /></span><div><strong>{skill.name}</strong><small>{skill.modelInvocable ? t("knowledge.skillInvocableModel") : t("knowledge.skillInvocableUser")}</small></div></div>
                            <p>{skill.description}</p>
                            {#if skill.whenToUse}<em>{skill.whenToUse}</em>{/if}
                          </article>
                        {/each}
                      </div>
                    {/if}
                    <div class="knowledge-note"><ShieldAlert size={14} /><span>{t("knowledge.noteDesc")}</span></div>
                  </SettingsGroup>
                {:else if managementTab === "settings"}
                  <SettingsGroup title={t("app.language")} description={t("app.switchLanguage")}>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                      {#each AVAILABLE_LOCALES as opt (opt.code)}
                        <Button
                          variant={i18n.locale === opt.code ? "default" : "outline"}
                          size="sm"
                          onclick={() => setLocale(opt.code)}
                        >
                          <Globe size={14} />
                          <span>{opt.label}</span>
                        </Button>
                      {/each}
                    </div>
                  </SettingsGroup>
                  <SettingsGroup title={t("settings.modelProviderTitle")} description={t("settings.modelProviderDesc")}>
                    {#if client}
                      <ProviderWorkbench
                        {client}
                        providers={filteredProviders}
                        namespaces={settingsNamespaces}
                        {credentials}
                        onSelectNamespace={(ns) => selectSettingsNamespace(ns)}
                        onCredentialSaved={async (ref) => {
                          credentials = { ...credentials, ...(await client!.describeCredentials([ref])).credentials };
                          if (!credentialRefs.includes(ref)) credentialRefs = [...credentialRefs, ref].sort();
                          if (ref === "XG_GOMODEL_API_KEY" && credentials[ref]?.configured) await refreshXgGatewayModels();
                        }}
                      />
                    {/if}
                  </SettingsGroup>
                  <SettingsGroup title={t("settings.modelProviderSecurity")} description={t("settings.modelProviderSecurityDesc")}>
                    <div class="credential-chips">
                      <span class="credential-chips-label">{t("settings.quickPresets")}</span>
                      <button type="button" class="credential-chip" class:chosen={credentialRefDraft === "XG_GOMODEL_API_KEY"} onclick={() => pickCredentialQuickChip("XG_GOMODEL_API_KEY")}>
                        <strong>XG_GOMODEL_API_KEY</strong>
                        <small>{t("settings.presetXg")}</small>
                      </button>
                      <button type="button" class="credential-chip" class:chosen={credentialRefDraft === "DEEPSEEK_API_KEY"} onclick={() => pickCredentialQuickChip("DEEPSEEK_API_KEY")}>
                        <strong>DEEPSEEK_API_KEY</strong>
                        <small>{t("settings.presetDeepseek")}</small>
                      </button>
                    </div>
                    <div class="credential-form">
                      <Input aria-label={t("settings.credentialRef")} bind:value={credentialRefDraft} placeholder={t("settings.refPlaceholderExample")} />
                      <Input
                        aria-label={t("settings.credentialValue")}
                        type="password"
                        bind:value={credentialValueDraft}
                        placeholder={t("settings.credentialValuePlaceholder")}
                        onkeydown={(event) => { if (event.key === "Enter") void saveCredential(); }}
                      />
                      <Button size="sm" disabled={!credentialRefDraft.trim() || !credentialValueDraft || !!managementBusy} onclick={() => void saveCredential()}>
                        <KeyRound size={13} />
                        {t("settings.saveCredential")}
                      </Button>
                    </div>
                    {#if credentialRefs.length === 0}
                      <DataState state="empty" title={t("settings.emptyCredentials")} description={t("settings.emptyCredentialsDesc")} />
                    {:else}
                      <div class="management-list">
                        {#each credentialRefs as ref (ref)}
                          <div class="management-list-row credential-row">
                            <span class="row-icon"><KeyRound size={15} /></span>
                            <div>
                              <strong>{credentialRefTitle(ref)}</strong>
                              <small>{ref} · {credentialSummary(ref)} · {credentialRefHint(ref)}</small>
                            </div>
                            <StatusBadge status={credentials[ref]?.configured ? "success" : "neutral"} label={credentials[ref]?.configured ? (credentials[ref]?.writable === false ? t("settings.configuredReadonly") : t("settings.configured")) : t("settings.notConfigured")} />
                            {#if !credentials[ref]?.configured}
                              <Button variant="outline" size="sm" onclick={() => pickCredentialQuickChip(ref)}>
                                <KeyRound size={12} />
                                {t("settings.fillKey")}
                              </Button>
                            {:else if credentials[ref]?.writable}
                              {#if confirmingCredentialRef === ref}
                                <Button variant="destructive" size="sm" disabled={!!managementBusy} onclick={() => void unsetCredential(ref)}>
                                  <Trash2 size={13} />
                                  {t("settings.confirmRemove")}
                                </Button>
                                <Button variant="ghost" size="sm" onclick={() => confirmingCredentialRef = ""}>{t("common.cancel")}</Button>
                              {:else}
                                <Button variant="ghost" size="icon-sm" aria-label={t("settings.removeCredential")} title={t("settings.removeCredential")} onclick={() => confirmingCredentialRef = ref}>
                                  <Trash2 size={14} />
                                </Button>
                              {/if}
                            {/if}
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </SettingsGroup>
                  <SettingsGroup title={t("settings.namespacesSectionTitle")} description={t("settings.namespacesSectionDesc")}>
                    <div class="management-actions">
                      <Button variant="outline" size="sm" disabled={!settingsHasDocument || !!managementBusy} onclick={() => void openSettingsDocument()}>
                        <ExternalLink size={14} />
                        {t("settings.openSettingsFile")}
                      </Button>
                      <span class="management-capability">{settingsWritable ? t("common.writable") : t("common.readonly")}</span>
                    </div>
                    {#if settingsNamespaces.length === 0}
                      <DataState state="empty" title={t("settings.emptyNamespaces")} description={t("settings.emptyNamespacesDesc")} />
                    {:else}
                      <div class="settings-editor-grid">
                        <nav class="settings-namespace-list" aria-label={t("settings.namespacesSectionTitle")}>
                          {#each filteredSettingsNamespaces as namespace (namespace.ns)}
                            <button class:active={namespace.ns === selectedSettingsNamespace()?.ns} onclick={() => selectSettingsNamespace(namespace.ns)}>
                              <strong>{namespace.ns}</strong>
                              <small>{namespace.applies === "restart" ? t("common.restartEffect") : t("common.instantEffect")} · r{namespace.revision}</small>
                            </button>
                          {/each}
                        </nav>
                        <div class="settings-json-editor">
                          {#if selectedSettingsNamespace()}
                            <div class="agent-preview-heading">
                              <div>
                                <strong>{selectedSettingsNamespace()?.ns}</strong>
                                <small style="margin-left: 8px; color: var(--muted-foreground);">{t("settings.secretsCount", { count: selectedSettingsNamespace()?.secrets.filter((item) => item.set).length || 0 })}</small>
                              </div>
                              <div class="settings-view-tabs">
                                <button type="button" class:active={settingsViewMode === "user"} onclick={() => settingsViewMode = "user"}>{t("settings.userLayer")}</button>
                                <button type="button" class:active={settingsViewMode === "merged"} onclick={() => settingsViewMode = "merged"}>{t("settings.mergedConfig")}</button>
                              </div>
                            </div>
                            {#if settingsViewMode === "user"}
                              <Textarea aria-label={t("settings.jsonAria")} rows={14} bind:value={settingsDraft} spellcheck={false} />
                              <div class="row-actions">
                                <Button size="sm" disabled={!settingsWritable || !!managementBusy} onclick={() => void saveSettingsNamespace()}>
                                  <Save size={13} />
                                  {t("settings.mergeUpdate")}
                                </Button>
                                <Button variant="ghost" size="sm" onclick={() => selectSettingsNamespace(selectedSettingsNamespace()?.ns || "")}>{t("settings.resetEdit")}</Button>
                              </div>
                            {:else}
                              <div class="merged-settings-viewer">
                                <pre><code>{JSON.stringify(selectedSettingsNamespace()?.value || {}, null, 2)}</code></pre>
                                <div class="knowledge-note" style="margin-top: 8px;">
                                  <ShieldAlert size={14} />
                                  <span>{t("settings.mergedSettingsNote")}</span>
                                </div>
                              </div>
                            {/if}
                          {/if}
                        </div>
                      </div>
                    {/if}
                  </SettingsGroup>
                {:else}
                  <SettingsGroup title={t("runtime.title")} description={t("runtime.description")}>
                    <div class={`status-alert-banner ${runtimeConnectionError ? "status-alert-banner--error" : "status-alert-banner--success"}`}>
                      {#if runtimeConnectionError}
                        <ShieldAlert size={16} />
                        <div>
                          <strong>{t("overview.runtimeError")}</strong>
                          <span>{runtimeConnectionError}</span>
                        </div>
                      {:else}
                        <CircleCheck size={16} />
                        <div>
                          <strong>{t("overview.runtimeNormal")}</strong>
                          <span>{t("runtime.eventStreamEstablished")}</span>
                        </div>
                      {/if}
                    </div>
                    <div class="diagnostics-metrics-grid">
                      <div class="diagnostic-metric-card"><span>{t("runtime.activeSessions")}</span><strong>{sessions.length}</strong><small>{activeSession ? sessionTitle(activeSession) : t("runtime.unselectedSession")}</small></div>
                      <div class="diagnostic-metric-card"><span>{t("runtime.activeTools")}</span><strong>{runningTools.length}</strong><small>{t("runtime.runningNow")}</small></div>
                      <div class="diagnostic-metric-card"><span>{t("runtime.settingsNamespaces")}</span><strong>{settingsNamespaces.length}</strong><small>{t("runtime.registeredNamespaces")}</small></div>
                      <div class="diagnostic-metric-card"><span>{t("runtime.providers")}</span><strong>{providers.length}</strong><small>{t("runtime.registeredProviders")}</small></div>
                      <div class="diagnostic-metric-card"><span>{t("runtime.subagents")}</span><strong>{subagents.length}</strong><small>{t("runtime.directSubagents")}</small></div>
                    </div>
                    <div class="management-list settings-namespaces">
                      {#each settingsNamespaces as namespace (namespace.ns)}
                        <div class="management-list-row">
                          <span class="row-icon"><Settings2 size={15} /></span>
                          <div><strong>{namespace.ns}</strong><small>{namespace.applies === "restart" ? t("common.restartEffect") : t("common.instantEffect")} · revision {namespace.revision}</small></div>
                          <code>{namespace.secrets.length} secrets</code>
                        </div>
                      {/each}
                    </div>
                  </SettingsGroup>
                {/if}
              </section>
            </div>
          </div>
        {:else if view === "knowledge"}
          <div class="knowledge-page">
            <header class="knowledge-hero"><div><div class="eyebrow">{t("knowledge.eyebrow")}</div><h1>{t("knowledge.title")}</h1><p>{t("knowledge.heroDesc")}</p></div><div class="header-actions"><Button variant="outline" size="sm" onclick={() => view = "conversation"}><ChevronRight class="rotate-180" size={14} />{t("app.backToConversation")}</Button><Button size="sm" onclick={() => openKnowledgePrompt(t("knowledge.createInventoryPrompt")) }><ClipboardList size={14} />{t("knowledge.scanWorkspace")}</Button></div></header>
            <div class="knowledge-page-body">
              <section class="knowledge-search-panel"><div class="knowledge-search-heading"><div><span class="section-label">{t("knowledge.searchTitle")}</span><h2>{t("knowledge.searchHeading")}</h2><p>{t("knowledge.searchSub")}</p></div><span class="knowledge-source-count"><BookOpen size={15} />{t("knowledge.officialSourcesCount", { count: skills.length })}</span></div><div class="knowledge-search-row"><Input aria-label={t("knowledge.questionAria")} bind:value={input} placeholder={t("knowledge.searchPlaceholder")} /><Button size="sm" disabled={!activeSessionId || !input.trim()} onclick={() => void submit()}><Search size={14} />{t("knowledge.searchBtn")}</Button></div><div class="knowledge-shortcuts"><button onclick={() => openKnowledgePrompt(t("knowledge.searchWorkspacePrompt"))}><Search size={14} /><span><strong>{t("knowledge.searchWorkspaceCard")}</strong><small>{t("knowledge.searchWorkspaceSub")}</small></span></button><button onclick={() => openKnowledgePrompt(t("knowledge.createInventoryPrompt"))}><ClipboardList size={14} /><span><strong>{t("knowledge.createInventoryCard")}</strong><small>{t("knowledge.createInventorySub")}</small></span></button><button onclick={() => void createSession()}><MessageSquarePlus size={14} /><span><strong>{t("knowledge.createSessionCard")}</strong><small>{t("knowledge.createSessionSub")}</small></span></button></div></section>
              <div class="knowledge-columns"><section class="knowledge-source-section"><div class="section-row"><div><span class="section-label">{t("knowledge.skillsSectionTitle")}</span><h2>{t("knowledge.callableCapabilities")}</h2></div><Button variant="ghost" size="sm" onclick={() => void refreshManagement()}><History size={14} />{t("common.refresh")}</Button></div>{#if skills.length === 0}<DataState state="empty" title={t("knowledge.emptySkillsTitle")} description={t("knowledge.emptySkillsDesc")} />{:else}<div class="knowledge-skill-list">{#each skills.filter((skill) => !settingsQuery || `${skill.name} ${skill.description}`.toLowerCase().includes(settingsQuery.toLowerCase())) as skill (skill.name)}<article><div class="skill-heading"><span class="row-icon"><BookOpen size={15} /></span><div><strong>{skill.name}</strong><small>{skill.modelInvocable ? t("knowledge.skillInvocableModel") : t("knowledge.skillInvocableUser")}</small></div></div><p>{skill.description}</p>{#if skill.whenToUse}<em>{skill.whenToUse}</em>{/if}</article>{/each}</div>{/if}</section><aside class="knowledge-context"><div class="section-label">{t("knowledge.currentContext")}</div><div class="context-stat"><span>{t("overview.workspaceLabel")}</span><strong title={workspacePath}>{workspaceName}</strong></div><div class="context-stat"><span>{t("overview.sessionLabel")}</span><strong>{activeSession ? sessionTitle(activeSession) : t("knowledge.unselected")}</strong></div><div class="context-stat"><span>{t("knowledge.statSession")}</span><strong>{activeSession ? t("knowledge.sessionMessagesCount", { count: messages.length }) : t("knowledge.needSelectSession")}</strong></div><div class="knowledge-note"><ShieldAlert size={14} /><span>{t("knowledge.noteDesc")}</span></div></aside></div>
            </div>
          </div>
        {:else}
          <div class="conversation-shell">
            <header class="conversation-header"><div class="conversation-title"><div class="eyebrow">{activeSession ? t("app.sessionWorkbench") : t("app.eyebrow")}</div><h1>{customization.title || (activeSession ? sessionTitle(activeSession) : t("app.startNewSession"))}</h1><p>{customization.subtitle || workspacePath || t("app.selectWorkspaceToStart")}</p></div><div class="header-actions"><Button variant="outline" size="sm" aria-pressed={customizationOpen} onclick={() => customizationOpen = !customizationOpen}><SlidersHorizontal size={14} />{t("app.uiCustomization")}</Button><Button variant="outline" size="sm" onclick={() => openManagement("overview")}><Settings2 size={14} />{t("app.management")}</Button></div></header>
            {#if runtimeError}<div class="error-banner"><CircleAlert size={15} /><span>{runtimeError}</span>{#if runtimeError.includes("设置与凭据") || runtimeError.includes("Settings & Credentials") || !selectedProviderCredentialReady}<Button variant="ghost" size="sm" onclick={() => openManagement("settings")}><KeyRound size={13} />{t("app.goToConfigure")}</Button>{/if}<button aria-label={t("app.closeError")} onclick={() => { runtimeError = ""; }}><X size={14} /></button></div>{/if}
            {#if customizationOpen}<section class="customization-panel" aria-label={t("customization.title")}><div class="customization-panel__header"><div><div class="section-label">{t("customization.title")}</div><strong>{t("customization.subtitle")}</strong><p>{t("customization.example")}</p></div><Button variant="ghost" size="icon-sm" aria-label={t("customization.close")} onclick={() => customizationOpen = false}><X size={14} /></Button></div>{#if customizationNotice}<div class="customization-feedback"><CircleCheck size={14} /><span>{customizationNotice}</span></div>{/if}{#if customizationDraft}<div class="customization-preview"><div><strong>{t("customization.pendingPatch")}</strong><span>{t("customization.patchFromSession")}</span></div><code>{JSON.stringify(customizationDraft)}</code><div class="customization-actions"><Button variant="outline" size="sm" onclick={() => customizationDraft = undefined}>{t("common.ignore")}</Button><Button size="sm" onclick={() => applyCustomizationPatch(customizationDraft!)}><Check size={13} />{t("customization.applyPatch")}</Button></div></div>{/if}<div class="customization-summary"><span class="mode-chip">{customization.density === "compact" ? t("customization.compactDensity") : t("customization.comfortableDensity")}</span><span>{customization.sidebar === "collapsed" ? t("customization.sidebarCollapsed") : t("customization.sidebarExpanded")}</span><span>{customization.activity === "visible" ? t("customization.activityVisible") : t("customization.activityHidden")}</span><span>{t("customization.composerRows", { count: customization.composerRows })}</span></div><div class="customization-actions"><Button variant="ghost" size="sm" disabled={customizationHistory.length === 0} onclick={undoCustomization}>{t("customization.undoLast")}</Button><Button variant="ghost" size="sm" onclick={() => { customization = DEFAULT_UI_CUSTOMIZATION; customizationHistory = []; persistUiCustomization(customization); applyRuntimeCustomization(customization); customizationNotice = t("customization.restoredNotice"); }}>{t("customization.restoreDefaults")}</Button></div></section>{/if}
            {#if surfaceDraft}<section class="surface-proposal" aria-label={t("surface.proposalTitle")}><div><div class="section-label">{t("surface.proposalTitle")}</div><strong>{surfaceDraft.spec.title}</strong><p>{surfaceDraft.summary || t("surface.proposalDefaultSummary", { count: surfaceDraft.spec.widgets.length })}</p></div><div class="surface-proposal__meta"><span>{t("surface.proposalWidgetsCount", { count: surfaceDraft.spec.widgets.length })}</span><span>{t("surface.proposalDataSourcesCount", { count: surfaceDraft.spec.dataSources.length })}</span></div><div class="customization-actions"><Button variant="ghost" size="sm" onclick={() => { surfaceDraft = undefined; surfaceNotice = t("surface.proposalIgnored"); }}>{t("common.ignore")}</Button><Button size="sm" onclick={applySurfaceProposal}><Check size={13} />{t("surface.confirmRender")}</Button></div></section>{/if}
            {#if generatedSurface && client}<section class="generated-surface" aria-label={t("surface.generatedTitle")}><header><div><div class="section-label">{t("surface.generatedTitle")}</div><strong>{generatedSurface.title}</strong><p>{surfaceNotice || t("surface.readOnlyDesc")}</p></div><div class="customization-actions"><Button variant="ghost" size="sm" disabled={surfaceHistory.length === 0} onclick={undoGeneratedSurface}>{t("common.undo")}</Button><Button variant="ghost" size="sm" onclick={removeGeneratedSurface}><Trash2 size={13} />{t("common.remove")}</Button></div></header><GeneratedSurface spec={generatedSurface} {client} {activeSessionId} onError={(message) => { surfaceNotice = message; }} /></section>{/if}
            <div class="main-grid">
              <ConversationTranscript
                messages={messages}
                {sending}
                {productName}
                {selectedModel}
                contextWindow={selectedModelInfo()?.contextWindow}
                quickActions={customization.quickActions.length ? customization.quickActions : [
                  { label: t("transcript.checkProject"), prompt: t("transcript.checkProjectPrompt") },
                  { label: t("transcript.understandCode"), prompt: t("transcript.understandCodePrompt") },
                  { label: t("transcript.runTests"), prompt: t("transcript.runTestsPrompt") },
                ]}
                onPromptSelect={(prompt) => input = prompt}
              />
              <ActivityPanel {messages} {todos} {sending} open={activityOpen} onClose={() => setActivityOpen(false)} />
            </div>
            <PendingInteractions
              approval={pendingApproval}
              question={pendingQuestion}
              answers={questionAnswers}
              onAnswer={(id, value, custom = false) => { questionAnswers[custom ? `${id}:custom` : id] = value; }}
              onApproval={(outcome) => void respondApproval(outcome)}
              onQuestion={() => void respondQuestion()}
            />
            <div class="composer"><div class="composer-shell"><DshPromptComposer
              bind:value={input}
              {client}
              sessionId={activeSessionId}
              {skills}
              rows={customization.composerRows}
              disabled={!activeSessionId || !!pendingApproval || !!pendingQuestion}
              loading={sending}
              {selectedModel}
              {modelGroups}
              imageInputSupported={modelSupportsImages(selectedModelInfo())}
              {modelBusy}
              contextPermissions={activeSession?.projections?.values?.permissions}
              {activityOpen}
              onModelSelect={(provider, model) => void chooseModel(provider, model)}
              onPermissionNotice={permissionNotice}
              onActivityOpen={() => setActivityOpen(true)}
              onSubmit={(text, images) => submit(text, images)}
              onStop={() => void cancel()}
            /></div></div>
          </div>
        {/if}
      </section>
    </div>
  </main>
{/if}
