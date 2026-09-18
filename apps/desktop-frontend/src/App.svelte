<script lang="ts">
  import { onMount } from "svelte";
  import {
    Archive, BookOpen, Bot, Check, ChevronDown, ChevronRight, CircleAlert,
    CircleCheck, ClipboardList, Copy, ExternalLink, FileText, FolderOpen,
    HardDrive, History, KeyRound, MessageSquare, MessageSquarePlus, Network,
    Pause, Pencil, Play, PanelLeftClose, PanelLeftOpen, Save, Search, Send,
    Settings2, ShieldAlert, SlidersHorizontal, Square, Target, Trash2, UserRoundCog,
    X, RefreshCw, PlugZap, GitBranch, Blocks, Cable, Boxes, Globe, Languages, Database, RotateCcw,
  } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import { Textarea } from "$components/ui/textarea";
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
  import { assistantMessageForEvent, applyTranscriptEvent, foldHistory, hasMessageContent, type SessionEvent, type TodoItem, type TranscriptMessage } from "$lib/transcript";
  import {
    credentialRefHint,
    credentialRefTitle,
    enrichModelGroups,
    isProviderCredentialOptional,
    mergeDiscoveredModels,
    modelCapabilityLabel,
    modelSelectionKey,
    modelSupportsImages,
    parseModelSelectionKey,
    providerCredentialRef,
    resolveProviderSettings,
    supportedReasoningEffort,
  } from "$lib/model-catalog";
  import { agentPresetLocked, clearsSessionError, sessionHealth, sessionHealthLabel, turnEndError, visibleSessions } from "$lib/session-health";
  import { isCredentialSettingsError, shouldOfferCredentialSettingsAction, userFacingError } from "$lib/user-error";
  import { buildKnowledgePrompt, knowledgeToolName, parseKnowledgeReport, stripKnowledgeReport, type KnowledgeIndexReport, type KnowledgeOperation } from "$lib/knowledge";
  import { buildQuestionAnswers, questionsAnswered } from "$lib/ai-elements-adapter";
  import {
    clearPendingApproval,
    clearPendingQuestion,
    clearPendingSession,
    setPendingApproval,
    setPendingQuestion,
    setQuestionAnswer,
    type PendingInteractionsBySession,
  } from "$lib/pending-interactions";
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
  let appVersion = $state("0.31.36");
 let workspacePath = $state("");
  let workspaces = $state<Workspace[]>([]);
  let sessions = $state<SessionSummary[]>([]);
  let archivedSessionIds = $state<string[]>([]);
  let activeSessionId = $state("");
  let sessionSelectionRequest = 0;
  let modelSelectionRequest = 0;
  let historyLoad: { requestId: number; sessionId: string; frames: Array<{ event: SessionEvent; view?: Record<string, unknown> }> } | undefined;
  let messages = $state<TranscriptMessage[]>([]);
  let todos = $state<TodoItem[]>([]);
  let input = $state("");
  let sessionQuery = $state("");
  let settingsQuery = $state("");
  let managementTab = $state<ManagementTab>("overview");
  let loading = $state(true);
  let sending = $state(false);
  let sidebarCollapsed = $state(false);
  let activityOpen = $state(false);
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
  let pendingInteractionsBySession = $state<PendingInteractionsBySession>({});
  let customization = $state<UiCustomizationState>(DEFAULT_UI_CUSTOMIZATION);
  let customizationOpen = $state(false);
  let settingsViewMode = $state<"user" | "merged">("user");
  let customizationDraft = $state<UiCustomizationPatch | undefined>();
  let customizationSourceId = $state("");
  let customizationNotice = $state("");
  let customizationHistory = $state<UiCustomizationState[]>([]);
  let surfaceDraft = $state<{ summary?: string; spec: SurfaceSpec }>();
  let generatedSurface = $state<SurfaceSpec>();
  type GeneratedSurfaceComponent = typeof import("$components/GeneratedSurface.svelte").default;
  type ConversationTranscriptComponent = typeof import("$components/ConversationTranscript.svelte").default;
  type ActivityPanelComponent = typeof import("$components/ActivityPanel.svelte").default;
  let GeneratedSurface = $state<GeneratedSurfaceComponent>();
  let generatedSurfaceImport = $state<Promise<void>>();
  let generatedSurfaceLoadFailed = $state(false);
  let ConversationTranscript = $state<ConversationTranscriptComponent>();
  let conversationTranscriptImport = $state<Promise<void>>();
  let ActivityPanel = $state<ActivityPanelComponent>();
  let activityPanelImport = $state<Promise<void>>();
  let surfaceSourceId = $state("");
  let surfaceNotice = $state("");
  let surfaceHistory = $state<Array<SurfaceSpec | undefined>>([]);
  let knowledgeIndex = $state<KnowledgeIndexReport & { state: "idle" | "building" | "ready" | "partial" | "failed" }>({ state: "idle", status: "failed", files: 0, chunks: 0, failures: [] });
  let knowledgeOperation = $state<KnowledgeOperation | "">("");
  let unsubscribeRuntimeError: (() => void) | undefined;
  let unsubscribeRuntimeReady: (() => void) | undefined;
  let unsubscribeDshFrames: (() => void) | undefined;
  let bootstrapInFlight = false;
  let bootstrapQueued = false;
  let startupPollingTimer: ReturnType<typeof setInterval> | undefined;
  let startupTimeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let responseTimeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let activePrompt: {
    sessionId: string;
    pendingId: string;
    text: string;
    images: Extract<PromptContentPart, { type: "image" }>[];
  } | undefined;
  let lastFailedPrompt = $state<typeof activePrompt>();

  const RESPONSE_INACTIVITY_TIMEOUT_MS = 70_000;

  function clearStartupTimers(): void {
    if (startupPollingTimer) {
      clearInterval(startupPollingTimer);
      startupPollingTimer = undefined;
    }
    if (startupTimeoutTimer) {
      clearTimeout(startupTimeoutTimer);
      startupTimeoutTimer = undefined;
    }
  }

  function armStartupTimers(): void {
    clearStartupTimers();
    startupTimeoutTimer = setTimeout(() => {
      if (!client && !runtimeConnectionError) {
        clearStartupTimers();
        runtimeConnectionError = t("app.startupRetryTimeout");
        runtimeError = runtimeConnectionError;
        loading = false;
      }
    }, 70_000);

    startupPollingTimer = setInterval(() => {
      if (client || runtimeConnectionError) {
        clearStartupTimers();
        return;
      }
      void bootstrap();
    }, 600);
  }

  function clearResponseTimeout(): void {
    if (!responseTimeoutTimer) return;
    clearTimeout(responseTimeoutTimer);
    responseTimeoutTimer = undefined;
  }

  function providerAwareError(error: unknown): string {
    const message = userFacingError(error);
    if (message !== t("errors.authFailed")) return message;
    const { provider } = parseModelSelectionKey(selectedModel);
    const providerName = modelGroups.find((group) => group.id === provider)?.name || provider;
    return providerName ? t("errors.providerAuthFailed", { provider: providerName }) : message;
  }

  function applyRuntimeConnectionError(error: unknown): void {
    runtimeConnectionError = userFacingError(error);
    runtimeError = runtimeConnectionError;
  }

  function setSessionRuntimeError(sessionId: string, error: unknown): string {
    const message = providerAwareError(error);
    sessionErrors = { ...sessionErrors, [sessionId]: message };
    if (sessionId === activeSessionId) runtimeError = message;
    return message;
  }

  function armResponseTimeout(prompt: NonNullable<typeof activePrompt>): void {
    clearResponseTimeout();
    activePrompt = prompt;
    responseTimeoutTimer = setTimeout(() => {
      if (activePrompt?.sessionId !== prompt.sessionId || activePrompt.pendingId !== prompt.pendingId) return;
      responseTimeoutTimer = undefined;
      sending = false;
      lastFailedPrompt = prompt;
      setSessionRuntimeError(prompt.sessionId, t("errors.requestTimeout"));
      if (prompt.sessionId === activeSessionId) {
        messages = messages.map((item) => item.id === prompt.pendingId ? { ...item, pending: false } : item);
      }
      activePrompt = undefined;
    }, RESPONSE_INACTIVITY_TIMEOUT_MS);
  }

  function noteResponseActivity(sessionId: string): void {
    if (activePrompt?.sessionId !== sessionId) return;
    armResponseTimeout(activePrompt);
  }

  function finishResponse(sessionId: string, failed = false): void {
    if (activePrompt?.sessionId !== sessionId) return;
    if (failed) lastFailedPrompt = activePrompt;
    clearResponseTimeout();
    activePrompt = undefined;
    if (!failed) lastFailedPrompt = undefined;
  }

 const activeSession = $derived(sessions.find((item) => item.sessionId === activeSessionId));
  const activePendingInteractions = $derived(pendingInteractionsBySession[activeSessionId]);
  const pendingApproval = $derived(activePendingInteractions?.approval);
  const pendingQuestion = $derived(activePendingInteractions?.question);
  const questionAnswers = $derived(activePendingInteractions?.answers ?? {});
  const activeSessionHasError = $derived(activeSession ? sessionHealth(activeSession, !!sessionErrors[activeSession.sessionId]) === "error" : false);
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
    const { provider } = parseModelSelectionKey(selectedModel);
    return provider ? modelCredentialConfigured(provider) : true;
  });
  const builtinFallbackModel = $derived.by(() => {
    const group = modelGroups.find((item) => item.id === "xg-gomodel");
    return group?.models.find((item) => item.id === "vlm") || group?.models[0];
  });
  const canSwitchToBuiltinModel = $derived(
    !!activeSessionId
      && xgGatewayCredentialReady
      && !!builtinFallbackModel
      && parseModelSelectionKey(selectedModel).provider !== "xg-gomodel"
      && isCredentialSettingsError(runtimeError),
  );
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
    if (generatedSurface) void ensureGeneratedSurfaceComponent();
    void ensureConversationComponents();
    applyRuntimeCustomization(customization);
    armStartupTimers();
    unsubscribeRuntimeReady = window.voltDesktop?.onRuntimeReady(() => void bootstrap());
    void bootstrap();
    return () => {
      clearStartupTimers();
      clearResponseTimeout();
      activePrompt = undefined;
      unsubscribeRuntimeError?.();
      unsubscribeRuntimeReady?.();
      unsubscribeDshFrames?.();
    };
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

  async function ensureGeneratedSurfaceComponent(): Promise<void> {
    if (GeneratedSurface) return;
    if (generatedSurfaceImport) return generatedSurfaceImport;
    generatedSurfaceLoadFailed = false;

    generatedSurfaceImport = import("$components/GeneratedSurface.svelte")
      .then((module) => {
        GeneratedSurface = module.default;
        generatedSurfaceLoadFailed = false;
      })
      .catch((error: unknown) => {
        generatedSurfaceLoadFailed = true;
        surfaceNotice = userFacingError(error);
      })
      .finally(() => {
        generatedSurfaceImport = undefined;
      });

    return generatedSurfaceImport;
  }

  async function ensureConversationComponents(): Promise<void> {
    const imports: Promise<void>[] = [];
    if (!ConversationTranscript && !conversationTranscriptImport) {
      conversationTranscriptImport = import("$components/ConversationTranscript.svelte")
        .then((module) => {
          ConversationTranscript = module.default;
        })
        .finally(() => {
          conversationTranscriptImport = undefined;
        });
    }
    if (!ActivityPanel && !activityPanelImport) {
      activityPanelImport = import("$components/ActivityPanel.svelte")
        .then((module) => {
          ActivityPanel = module.default;
        })
        .finally(() => {
          activityPanelImport = undefined;
        });
    }
    if (conversationTranscriptImport) imports.push(conversationTranscriptImport);
    if (activityPanelImport) imports.push(activityPanelImport);
    try {
      await Promise.all(imports);
    } catch (error: unknown) {
      runtimeError = userFacingError(error);
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
   void ensureGeneratedSurfaceComponent();
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
   const previous = surfaceHistory.at(-1);
   if (previous) void ensureGeneratedSurfaceComponent();
   generatedSurface = previous;
   surfaceHistory = surfaceHistory.slice(0, -1);
   persistGeneratedSurface(generatedSurface);
    surfaceNotice = generatedSurface ? t("surface.restoredNotice") : t("surface.undoneNotice");
 }

  async function bootstrap(): Promise<void> {
    if (client) {
      clearStartupTimers();
      loading = false;
      return;
    }
    if (bootstrapInFlight) {
      bootstrapQueued = true;
      return;
    }
    bootstrapInFlight = true;
    try {
      const shell = window.voltDesktop;
      if (!shell) throw new Error(t("smb.bridgeNotLoaded"));
      const info = await shell.bootstrap();
      if (info.productName) customProductName = info.productName;
      appVersion = info.version;
      workspacePath = info.workspace;
      unsubscribeRuntimeError?.();
      unsubscribeRuntimeError = shell.onRuntimeError((message) => {
        applyRuntimeConnectionError(message);
        sending = false;
        if (message) {
          sessionSelectionRequest += 1;
          historyLoad = undefined;
          unsubscribeDshFrames?.();
          unsubscribeDshFrames = undefined;
          client = undefined;
          clearStartupTimers();
          loading = false;
        }
      });
      if (!info.dshReady && !info.startupError) return;
      if (info.startupError || !info.dshReady) {
        clearStartupTimers();
        applyRuntimeConnectionError(info.startupError || t("runtime.noAddressProvided"));
        return;
      }
      clearStartupTimers();
      runtimeConnectionError = "";
      runtimeError = "";
      unsubscribeDshFrames?.();
      client = new DshClient(shell);
      unsubscribeDshFrames = client.subscribe(handleFrame, (error) => {
        applyRuntimeConnectionError(error);
      });
      await refresh();
    } catch (error) {
      clearStartupTimers();
      applyRuntimeConnectionError(error);
    } finally {
      loading = !client && !runtimeConnectionError;
      bootstrapInFlight = false;
      if (bootstrapQueued) {
        bootstrapQueued = false;
        void bootstrap();
      }
    }
  }

  async function retryRuntime(): Promise<void> {
    const shell = window.voltDesktop;
    if (!shell || bootstrapInFlight) return;
    loading = true;
    runtimeConnectionError = "";
    runtimeError = "";
    unsubscribeDshFrames?.();
    unsubscribeDshFrames = undefined;
    client = undefined;
    armStartupTimers();
    try {
      await withTimeout(shell.retryRuntime(), 70_000, t("app.startupRetryTimeout"));
      await bootstrap();
    } catch (error) {
      clearStartupTimers();
      applyRuntimeConnectionError(error);
      loading = false;
    }
  }

  async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async function refresh(): Promise<void> {
    if (!client) return;
    try {
      const [workspaceResult, sessionResult] = await Promise.all([client.listWorkspaces(), client.listSessions()]);
      workspaces = workspaceResult.items;
      archivedSessionIds = workspaceResult.archivedSessionIds;
      sessions = visibleSessions(sessionResult.items, archivedSessionIds, activeSessionId);
      if (activeSessionId && !sessions.some((item) => item.sessionId === activeSessionId)) activeSessionId = sessions[0]?.sessionId || "";
      if (!activeSessionId && sessions[0]) await selectSession(sessions[0].sessionId);
    } catch (error) {
      runtimeError = userFacingError(error);
      runtimeConnectionError = runtimeError;
    }
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
    try {
      const created = await client.createSession(cwd);
      activeSessionId = created.sessionId;
      await refresh();
      await selectSession(created.sessionId);
    } catch (error) {
      runtimeError = userFacingError(error);
      runtimeConnectionError = runtimeError;
    }
  }

  async function selectSession(sessionId: string): Promise<void> {
    if (!client) return;
    const requestId = ++sessionSelectionRequest;
    modelSelectionRequest += 1;
    activeSessionId = sessionId;
    clearResponseTimeout();
    activePrompt = undefined;
    lastFailedPrompt = undefined;
    view = "conversation";
    sending = false;
    messages = [];
    todos = [];
    selectedModel = "";
    reasoningEffort = "";
    modelBusy = false;
    runtimeError = "";
    historyLoad = { requestId, sessionId, frames: [] };
    try {
      const [result, settingsResult, providerResult] = await Promise.all([
        client.history(sessionId),
        client.describeSettings().catch(() => ({ writable: false, hasDocument: false, namespaces: [] })),
        client.listProviders().catch(() => ({ providers: [] })),
      ]);
      if (requestId !== sessionSelectionRequest || activeSessionId !== sessionId) return;
      if (result.projections) {
        sessions = sessions.map((session) => session.sessionId === sessionId
          ? { ...session, projections: result.projections }
          : session);
      }
      const bufferedFrames = historyLoad?.requestId === requestId ? historyLoad.frames : [];
      if (historyLoad?.requestId === requestId) historyLoad = undefined;
      let transcript = foldHistory(result.events);
      for (const frame of bufferedFrames) transcript = applyTranscriptEvent(transcript, frame.event, frame.view);
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
      if (requestId !== sessionSelectionRequest || activeSessionId !== sessionId) return;
      const modelResult = await client.models(sessionId);
      if (requestId !== sessionSelectionRequest || activeSessionId !== sessionId) return;
      modelGroups = enrichModelGroups(modelResult.groups, settingsNamespaces);
      selectedModel = modelSelectionKey(modelResult.current.provider, modelResult.current.model);
      const currentInfo = modelResult.groups.find((group) => group.id === modelResult.current.provider)?.models.find((model) => model.id === modelResult.current.model);
      reasoningEffort = currentInfo?.reasoning?.efforts.some((effort) => effort.id === modelResult.current.reasoningEffort) ? (modelResult.current.reasoningEffort || "") : "";
      if (modelResult.current.reasoningEffort && !reasoningEffort) { try { await client.selectModel(sessionId, modelResult.current.provider, modelResult.current.model); } catch { /* clear incompatible parameters */ } }
      if (!modelCredentialConfigured(modelResult.current.provider)) {
        runtimeError = t("errors.noApiKey");
        sessionErrors = { ...sessionErrors, [sessionId]: runtimeError };
      } else {
        clearCredentialRequirementError(sessionId);
      }
    } catch (error) {
      if (requestId !== sessionSelectionRequest || activeSessionId !== sessionId) return;
      const bufferedFrames = historyLoad?.requestId === requestId ? historyLoad.frames : [];
      if (historyLoad?.requestId === requestId) historyLoad = undefined;
      let transcript = { messages, todos };
      for (const frame of bufferedFrames) transcript = applyTranscriptEvent(transcript, frame.event, frame.view);
      messages = transcript.messages;
      todos = transcript.todos;
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
    const { provider, model } = parseModelSelectionKey(selectedModel);
    return modelGroups.find((group) => group.id === provider)?.models.find((item) => item.id === model);
  }

  function selectedProviderCredentialRef(): string | undefined {
    const { provider } = parseModelSelectionKey(selectedModel);
    return providerCredentialRef(settingsNamespaces, providers, provider);
  }

  function modelCredentialConfigured(provider: string): boolean {
    if (isProviderCredentialOptional(settingsNamespaces, providers, provider)) return true;
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

  function openCredentialSettings(ref?: string): void {
    if (ref) credentialRefDraft = ref;
    view = "settings";
    managementTab = "settings";
    void refreshManagement();
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
    const sessionId = activeSessionId;
    if (sessionId) {
      const sessionModels = await client.models(sessionId);
      if (activeSessionId === sessionId) {
        modelGroups = enrichModelGroups(sessionModels.groups, settingsNamespaces);
        selectedModel = modelSelectionKey(sessionModels.current.provider, sessionModels.current.model);
      }
    }
    catalogGroups = (await client.listModelCatalog()).groups;
  }

  function handleFrame(frame: DshFrame): void {
    const payload = frame.payload;
    if (payload.type === "approval/requested") {
      if (typeof payload.sessionId !== "string" || !payload.sessionId) return;
      const approval = { rpcId: frame.rpcId, ...payload } as unknown as PendingApproval;
      pendingInteractionsBySession = setPendingApproval(pendingInteractionsBySession, payload.sessionId, approval);
      finishResponse(payload.sessionId);
      if (payload.sessionId === activeSessionId) sending = false;
      return;
    }
    if (payload.type === "question/requested") {
      if (typeof payload.sessionId !== "string" || !payload.sessionId) return;
      const question = { rpcId: frame.rpcId, ...payload } as unknown as PendingQuestion;
      pendingInteractionsBySession = setPendingQuestion(pendingInteractionsBySession, payload.sessionId, question);
      finishResponse(payload.sessionId);
      if (payload.sessionId === activeSessionId) sending = false;
      return;
    }
    if (payload.type === "approval/resolved") {
      if (typeof payload.sessionId !== "string" || !payload.sessionId) return;
      pendingInteractionsBySession = clearPendingApproval(pendingInteractionsBySession, payload.sessionId, frame.rpcId);
      return;
    }
    if (payload.type === "question/resolved") {
      if (typeof payload.sessionId !== "string" || !payload.sessionId) return;
      pendingInteractionsBySession = clearPendingQuestion(pendingInteractionsBySession, payload.sessionId, frame.rpcId);
      return;
    }
    if (payload.type === "session/queue") return;
    if (payload.type === "session/jobs") return;
    if (payload.type === "session/projection") { void refresh(); return; }
    if (payload.type === "host/session-added" || payload.type === "host/session-status" || payload.type === "host/session-removed" || payload.type === "host/workspace-changed" || payload.type === "host/workspace-removed") { void refresh(); return; }
    if (payload.type === "host/agent-error") {
      const sessionId = payload.sessionId || activeSessionId;
      const message = sessionId
        ? setSessionRuntimeError(sessionId, payload.message || t("errors.agentFailed"))
        : providerAwareError(payload.message || t("errors.agentFailed"));
      if (sessionId) finishResponse(sessionId, true);
      if (sessionId !== activeSessionId) return;
      sending = false;
      messages = messages.map((item) => item.pending ? { ...item, pending: false } : item);
      return;
    }
    if (payload.type !== "session/event" || payload.sessionId !== activeSessionId || !payload.event) return;
    noteResponseActivity(payload.sessionId);
    if (historyLoad?.sessionId === payload.sessionId) {
      historyLoad.frames.push({ event: payload.event, view: payload.view as Record<string, unknown> | undefined });
      return;
    }
    const transcript = applyTranscriptEvent({ messages, todos }, payload.event, payload.view as Record<string, unknown> | undefined);
    messages = transcript.messages;
    todos = transcript.todos;
    if (payload.event.type === "tool/call" && knowledgeToolName(String(payload.event.data.name || "")) && knowledgeOperation) {
      knowledgeIndex = { ...knowledgeIndex, state: "building" };
    }
    if (payload.event.type === "tool/result") {
      const toolError = payload.event.data.error;
      const toolErrorCode = toolError && typeof toolError === "object" ? String((toolError as Record<string, unknown>).code || "") : "";
      const toolErrorMessage = toolError && typeof toolError === "object" ? String((toolError as Record<string, unknown>).message || "") : "";
      if (toolErrorCode.startsWith("WEB_PROVIDER_") || toolErrorMessage.toLowerCase().includes("api key")) {
        runtimeError = userFacingError(toolErrorMessage || transcript.messages.at(-1)?.tool?.result || toolErrorCode);
      }
    }
    if (payload.event.type === "assistant/chunk" || payload.event.type === "assistant/message" || payload.event.type === "tool/call") {
      clearCredentialRequirementError(activeSessionId);
    }
    if (payload.event.type === "assistant/message") {
      const assistantMessage = assistantMessageForEvent(transcript.messages, payload.event);
      captureCustomization(assistantMessage);
      captureSurfaceProposal(assistantMessage);
      const report = parseKnowledgeReport(assistantMessage?.text || "");
      if (report) {
        knowledgeIndex = { ...knowledgeIndex, ...report, state: report.status };
        knowledgeOperation = "";
        if (assistantMessage) assistantMessage.text = stripKnowledgeReport(assistantMessage.text);
      }
    }
    if (payload.event.type === "tool/result" && payload.event.data.error && knowledgeOperation) {
      const errorText = userFacingError(payload.event.data.error);
      knowledgeIndex = { ...knowledgeIndex, state: "failed", failures: [errorText] };
      knowledgeOperation = "";
    }
    if (payload.event.type === "assistant/message" || payload.event.type === "turn/end") {
      sending = false;
      if (payload.event.type === "turn/end") {
        messages = messages.map((item) => item.pending ? { ...item, pending: false } : item).filter(hasMessageContent);
        if (knowledgeOperation) {
          knowledgeIndex = { ...knowledgeIndex, state: "partial", failures: [t("knowledge.reportMissing")] };
          knowledgeOperation = "";
        }
        const endError = turnEndError(payload.event);
        if (endError) {
          finishResponse(payload.sessionId, true);
          setSessionRuntimeError(activeSessionId, endError);
        } else if (clearsSessionError(payload.event) && sessionErrors[activeSessionId]) {
          finishResponse(payload.sessionId);
          const clearedMessage = sessionErrors[activeSessionId];
          const { [activeSessionId]: _cleared, ...remaining } = sessionErrors;
          sessionErrors = remaining;
          if (runtimeError === clearedMessage) runtimeError = "";
        } else {
          finishResponse(payload.sessionId);
        }
      } else {
        finishResponse(payload.sessionId);
      }
    }
  }

  async function submit(textOverride?: string, imageAttachments: Extract<PromptContentPart, { type: "image" }>[] = []): Promise<void> {
    const text = (textOverride ?? input).trim();
    if (!client || !activeSessionId || (!text && imageAttachments.length === 0) || sending) return;
    const credentialRef = selectedProviderCredentialRef();
    const currentProvider = parseModelSelectionKey(selectedModel).provider;
    if (credentialRef && !modelCredentialConfigured(currentProvider) && !credentials[credentialRef]?.configured) {
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
    input = "";
    sending = true; view = "conversation";
    const pendingId = `pending-${Date.now()}`;
    const failedPrompt = {
      sessionId: activeSessionId,
      pendingId,
      text,
      images: imageAttachments.map((image) => ({ ...image })),
    };
    armResponseTimeout(failedPrompt);
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
      clearResponseTimeout();
      activePrompt = undefined;
      sending = false;
      input = text;
      messages = messages.map((message) => message.id === pendingId ? { ...message, pending: false } : message);
      lastFailedPrompt = failedPrompt;
      const message = setSessionRuntimeError(activeSessionId, error);
      if (isCredentialSettingsError(message)) openCredentialSettings(selectedProviderCredentialRef());
      if (textOverride !== undefined) throw error;
    }
  }

  async function retryLastPrompt(): Promise<void> {
    const failed = lastFailedPrompt;
    if (!failed || failed.sessionId !== activeSessionId || sending) return;
    lastFailedPrompt = undefined;
    runtimeError = "";
    const { [failed.sessionId]: _cleared, ...remaining } = sessionErrors;
    sessionErrors = remaining;
    messages = messages.filter((message) => message.id !== failed.pendingId);
    input = failed.text;
    await submit(undefined, failed.images);
  }

  async function cancel(): Promise<void> {
    if (!client || !activeSessionId) return;
    try {
      await client.cancel(activeSessionId);
    } finally {
      clearResponseTimeout();
      activePrompt = undefined;
      lastFailedPrompt = undefined;
      sending = false;
      messages = messages.map((item) => (item.pending ? { ...item, pending: false } : item)).filter(hasMessageContent);
    }
  }

  async function chooseModel(provider: string, model: string): Promise<void> {
    if (!client || !activeSessionId || modelBusy) return;
    const sessionId = activeSessionId;
    const requestId = ++modelSelectionRequest;
    modelBusy = true;
    try {
      const validEffort = supportedReasoningEffort(modelGroups, provider, model, reasoningEffort);
      let result;
      try {
        result = await client.selectModel(sessionId, provider, model, validEffort);
      } catch (e) {
        const msg = String(e || "").toLowerCase();
        if (msg.includes("reasoning effort") || msg.includes("does not support reasoning")) {
          result = await client.selectModel(sessionId, provider, model);
        } else throw e;
      }
      if (requestId !== modelSelectionRequest || activeSessionId !== sessionId) return;
      selectedModel = modelSelectionKey(result.selected.provider, result.selected.model);
      reasoningEffort = result.selected.reasoningEffort || "";
      if (modelCredentialConfigured(provider)) {
        clearCredentialRequirementError(sessionId);
      }
    } catch (error) {
      const message = userFacingError(error);
      sessionErrors = { ...sessionErrors, [sessionId]: message };
      if (requestId === modelSelectionRequest && activeSessionId === sessionId) runtimeError = message;
    }
    finally { if (requestId === modelSelectionRequest) modelBusy = false; }
  }

  async function switchToBuiltinModel(): Promise<void> {
    if (!builtinFallbackModel || !activeSessionId || modelBusy) return;
    await chooseModel("xg-gomodel", builtinFallbackModel.id);
    if (selectedModel === modelSelectionKey("xg-gomodel", builtinFallbackModel.id)) {
      runtimeError = "";
      const { [activeSessionId]: _cleared, ...remaining } = sessionErrors;
      sessionErrors = remaining;
    }
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
     if (wasActive) {
       activeSessionId = "";
       messages = [];
       todos = [];
     }
     pendingInteractionsBySession = clearPendingSession(pendingInteractionsBySession, sessionId);
     await client!.archiveSession(sessionId);
     await refresh();
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
    const rawValue = credentialValueDraft.trim();
    const value = rawValue.replace(/^[\"']|[\"']$/g, "").trim();
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

  function clearCredentialRequirementError(sessionId = activeSessionId): void {
    if (isCredentialSettingsError(runtimeError)) runtimeError = "";
    if (!sessionId || !isCredentialSettingsError(sessionErrors[sessionId])) return;
    const { [sessionId]: _cleared, ...remaining } = sessionErrors;
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
    const request = pendingApproval;
    try {
      await client.respond({ type: "client-response", rpcId: request.rpcId, result: { ok: true, value: { sessionId: request.sessionId, approvalId: request.approvalId, outcome } } });
      pendingInteractionsBySession = clearPendingApproval(pendingInteractionsBySession, request.sessionId, request.rpcId);
      if (activeSessionId === request.sessionId) sending = outcome === "allowed-once";
    } catch (error) {
      runtimeError = userFacingError(error);
    }
  }

  async function respondQuestion(): Promise<void> {
    if (!client || !pendingQuestion) return;
    if (!questionsAnswered(pendingQuestion.questions, questionAnswers)) return;
    const answers = buildQuestionAnswers(pendingQuestion.questions, questionAnswers);
    const request = pendingQuestion;
    try {
      await client.respond({ type: "client-response", rpcId: request.rpcId, result: { ok: true, value: { sessionId: request.sessionId, answer: { answers } } } });
      pendingInteractionsBySession = clearPendingQuestion(pendingInteractionsBySession, request.sessionId, request.rpcId);
      if (activeSessionId === request.sessionId) sending = true;
    } catch (error) {
      runtimeError = userFacingError(error);
    }
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
  function switchManagementTab(tab: ManagementTab): void {
    managementTab = tab;
    managementError = "";
    managementNotice = "";
    confirmingWorkspaceId = "";
    editingWorkspaceId = "";
    editingSessionId = "";
    confirmingAgentPreset = "";
    confirmingGoalClear = false;
    void refreshManagement();
  }
  function openManagement(tab: ManagementTab): void {
    view = "settings";
    switchManagementTab(tab);
  }
  function openKnowledge(): void {
    view = "knowledge";
    managementError = "";
    managementNotice = "";
    void refreshManagement();
  }
  function openKnowledgePrompt(prompt: string): void { input = prompt; view = "conversation"; }
  function knowledgeStatusLabel(): string {
    if (knowledgeIndex.state === "building") return t("knowledge.indexing");
    if (knowledgeIndex.state === "ready") return t("knowledge.indexReady");
    if (knowledgeIndex.state === "partial") return t("knowledge.indexPartial");
    if (knowledgeIndex.state === "failed") return t("knowledge.indexFailed");
    return skills.length > 0 ? t("knowledge.statusLoaded") : t("knowledge.statusWaiting");
  }
  async function ensureKnowledgeSession(): Promise<boolean> {
    if (activeSessionId) return true;
    await createSession(workspacePath);
    return !!activeSessionId;
  }
  async function runKnowledgeOperation(operation: KnowledgeOperation, query = ""): Promise<void> {
    if (sending || !client || !(await ensureKnowledgeSession())) return;
    const normalizedQuery = query.trim();
    if (operation === "query" && !normalizedQuery) return;
    knowledgeOperation = operation;
    knowledgeIndex = {
      ...knowledgeIndex,
      state: "building",
      ...(operation === "query" ? { query: normalizedQuery, matches: undefined } : {}),
      ...(operation !== "query" ? { root: workspacePath, failures: [] } : {}),
    };
    const prompt = buildKnowledgePrompt(operation, workspacePath, normalizedQuery);
    try {
      await submit(prompt);
      view = "knowledge";
    } catch (error) {
      knowledgeOperation = "";
      knowledgeIndex = { ...knowledgeIndex, state: "failed", failures: [userFacingError(error)] };
    }
  }
  function permissionNotice(message: string): void { managementNotice = message; }
</script>

<svelte:head><title>{productName}</title></svelte:head>

{#if loading}
  <main class="loading-screen"><Loader size={24} label={t("app.connecting")} /><strong>{t("app.connecting")}</strong><span>{t("app.startupProgress")}</span></main>
{:else if !client && runtimeConnectionError}
  <main class="startup-failure-screen">
    <div class="startup-failure-icon"><CircleAlert size={22} /></div>
    <h1>{t("app.startupFailed")}</h1>
    <p>{t("app.startupFailedDesc")}</p>
    <pre>{runtimeConnectionError}</pre>
    <Button onclick={() => void retryRuntime()}><RotateCcw size={14} />{t("common.retry")}</Button>
  </main>
{:else}
  <main class="app-shell" class:compact={customization.density === "compact"}>
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark"><Bot size={15} /></span>
        <strong>{productName}</strong>
        <span class="status-dot" class:offline={!!runtimeConnectionError} class:warning={!runtimeConnectionError && activeSessionHasError} title={runtimeConnectionError ? t("overview.runtimeError") : (activeSessionHasError ? t("overview.runtimeNormalWithSessionError") : t("overview.runtimeNormal"))}></span>
      </div>
      <div class="topbar-center">
        {#if view === "settings"}
          <span class="topbar-workspace"><Settings2 size={13} />{t("app.workbench")} / {managementTitle(managementTab)}</span>
        {:else if view === "knowledge"}
          <span class="topbar-workspace"><BookOpen size={13} />{t("nav.knowledge")}</span>
        {:else}
          <span class="topbar-workspace" title={workspacePath}><FolderOpen size={13} />{workspaceName}</span>
          {#if activeSession}
            <span class="topbar-separator">/</span>
            <span class="topbar-session-title" title={sessionTitle(activeSession)}>{sessionTitle(activeSession)}</span>
            {#if activeSessionHasError}
              <span class="session-health session-health--error" style="margin-left: 4px; font-size: 10px; padding: 1px 5px;">{sessionHealthLabel("error")}</span>
            {/if}
          {/if}
        {/if}
      </div>
      <div class="topbar-actions">
        {#if view === "conversation"}
          <Button variant="ghost" size="sm" class="topbar-action-btn" title={t("session.newSession")} onclick={() => void createSession()}>
            <MessageSquarePlus size={14} />
            <span class="topbar-btn-label">{t("session.newSession")}</span>
          </Button>
          <Button variant="ghost" size="sm" class="topbar-action-btn" title={t("app.workbench")} onclick={() => openManagement("overview")}>
            <Settings2 size={14} />
            <span class="topbar-btn-label">{t("app.workbench")}</span>
          </Button>
          <Button variant="ghost" size="sm" class="topbar-action-btn" title={t("app.uiCustomization")} onclick={() => customizationOpen = !customizationOpen}>
            <SlidersHorizontal size={14} />
          </Button>
        {:else}
          <Button variant="ghost" size="sm" class="topbar-action-btn" title={t("app.backToConversation")} onclick={() => view = "conversation"}>
            <MessageSquare size={14} />
            <span class="topbar-btn-label">{t("app.backToConversation")}</span>
          </Button>
        {/if}
        <Button variant="ghost" size="sm" class="topbar-action-btn topbar-locale-btn" onclick={() => toggleLocale()} title={t("app.switchLanguage")}>
          <Languages size={13} />
          <span>{i18n.locale === "zh-CN" ? "EN" : "中文"}</span>
        </Button>
      </div>
    </header>
    <div class:management-active={view === "settings"} class="workspace-layout">
      <aside class:collapsed={sidebarCollapsed} class="sidebar">
        <div class="sidebar-toolbar">
          {#if !sidebarCollapsed}
            <Button variant="outline" size="sm" class="sidebar-new-btn" onclick={() => void createSession()}>
              <MessageSquarePlus size={14} />
              <span>{t("session.newSession")}</span>
            </Button>
          {/if}
          <Button variant="ghost" size="icon-sm" class="sidebar-collapse-btn" aria-label={sidebarCollapsed ? t("app.expandSidebar") : t("app.collapseSidebar")} onclick={() => setSidebarCollapsed(!sidebarCollapsed)}>
            {#if sidebarCollapsed}<PanelLeftOpen size={16} />{:else}<PanelLeftClose size={16} />{/if}
          </Button>
        </div>
        {#if sidebarCollapsed}
          <div class="sidebar-collapsed-actions">
            <Button variant="ghost" size="icon-sm" aria-label={t("session.newSession")} title={t("session.newSession")} onclick={() => void createSession()}>
              <MessageSquarePlus size={16} />
            </Button>
          </div>
        {/if}
        {#if !sidebarCollapsed}
          <div class="workspace-picker"><div class="section-label">{t("nav.workspaces")}</div><button class="workspace-row" onclick={() => void pickWorkspace()}><FolderOpen size={15} /><span title={workspacePath}>{workspaceName}</span><ChevronRight size={14} /></button></div>
          <div class="sidebar-search"><Search size={14} /><input aria-label={t("session.searchSessions")} placeholder={t("session.searchSessions")} bind:value={sessionQuery} /></div>
          <Separator />
          <div class="session-list"><div class="section-label section-row"><span>{t("nav.sessions")}</span><span class="count-badge">{filteredSessions.length}</span></div>{#if filteredSessions.length === 0}<div class="sidebar-empty"><MessageSquarePlus size={16} /><span>{t("session.emptyActive")}</span><small>{t("session.emptyActiveDesc")}</small></div>{:else}{#each filteredSessions as session (session.sessionId)}
              {@const health = sessionHealth(session, !!sessionErrors[session.sessionId])}
              <button class:active={session.sessionId === activeSessionId} class="session-row" onclick={() => void selectSession(session.sessionId)}>
                <span class="session-state" class:running={health === "running"} class:error={health === "error"}></span>
                <span class="session-copy">
                  <strong>{sessionTitle(session)}</strong>
                  <small>{session.cwd || workspaceName}</small>
                </span>
                <span class="session-meta-wrap">
                  <time>{formatTime(session.updatedAt)}</time>
                  <span
                    class="session-hover-action"
                    role="button"
                    tabindex="0"
                    title={t("session.archiveSession")}
                    onclick={(e) => { e.stopPropagation(); void archiveManagedSession(session.sessionId); }}
                    onkeydown={(e) => { if (e.key === "Enter") { e.stopPropagation(); void archiveManagedSession(session.sessionId); } }}
                  >
                    <Archive size={12} />
                  </span>
                </span>
              </button>
            {/each}{/if}</div>
          <div class="sidebar-footer"><Button variant="ghost" class={`footer-button${view === "knowledge" ? " active" : ""}`} onclick={() => openKnowledge()}><BookOpen size={15} />{t("nav.knowledge")}</Button><Button variant="ghost" class="footer-button" onclick={() => openManagement("overview")}><Settings2 size={15} />{t("nav.overview")}</Button><Button variant="ghost" class="footer-button" onclick={() => setActivityOpen(!activityOpen)}><History size={15} />{t("activity.title")}<span class="footer-spacer"></span><ChevronDown class={!activityOpen ? "rotated" : ""} size={14} /></Button></div>
        {/if}
      </aside>
      <section class="content-area">
        {#if view === "settings"}
          <div class="management-page">
            <header class="management-header"><div><div class="eyebrow">{t("app.eyebrow")}</div><h1>{t("app.workbench")}</h1><p>{t("app.workbenchDesc")}</p></div><Button variant="outline" size="sm" onclick={() => view = "conversation"}><ChevronRight class="rotate-180" size={14} />{t("app.backToConversation")}</Button></header>
            <div class="management-body">
              <nav class="management-nav" aria-label={t("app.managementNavAria")}><button class:active={managementTab === "overview"} onclick={() => switchManagementTab("overview")}><ClipboardList size={15} /><span>{t("nav.overview")}</span></button><button class:active={managementTab === "sessions"} onclick={() => switchManagementTab("sessions")}><MessageSquare size={15} /><span>{t("nav.sessions")}</span></button><button class:active={managementTab === "goals"} onclick={() => switchManagementTab("goals")}><Target size={15} /><span>{t("nav.goals")}</span></button><button class:active={managementTab === "subagents"} onclick={() => switchManagementTab("subagents")}><Network size={15} /><span>{t("nav.subagents")}</span></button><button class:active={managementTab === "agents"} onclick={() => switchManagementTab("agents")}><UserRoundCog size={15} /><span>{t("nav.agents")}</span></button><button class:active={managementTab === "models"} onclick={() => switchManagementTab("models")}><Bot size={15} /><span>{t("nav.models")}</span></button><button class:active={managementTab === "workspaces"} onclick={() => switchManagementTab("workspaces")}><FolderOpen size={15} /><span>{t("nav.workspaces")}</span></button><button class:active={managementTab === "mounts"} onclick={() => switchManagementTab("mounts")}><HardDrive size={15} /><span>{t("nav.mounts")}</span></button><button class:active={managementTab === "plugins"} onclick={() => switchManagementTab("plugins")}><Blocks size={15} /><span>{t("nav.plugins")}</span></button><button class:active={managementTab === "mcp"} onclick={() => switchManagementTab("mcp")}><Cable size={15} /><span>{t("nav.mcp")}</span></button><button class:active={managementTab === "knowledge"} onclick={() => switchManagementTab("knowledge")}><BookOpen size={15} /><span>{t("nav.knowledge")}</span></button><button class:active={managementTab === "settings"} onclick={() => switchManagementTab("settings")}><Settings2 size={15} /><span>{t("nav.settings")}</span></button><button class:active={managementTab === "runtime"} onclick={() => switchManagementTab("runtime")}><ShieldAlert size={15} /><span>{t("nav.runtime")}</span></button></nav>
              <section class="management-content">
                <div class="management-toolbar"><div class="section-label">{managementTitle(managementTab)}</div><div class="settings-filter"><Search size={14} /><Input aria-label={t("overview.filterManagement")} placeholder={t("overview.filterManagement")} bind:value={settingsQuery} /></div></div>
                {#if managementError}<div class="management-feedback error"><CircleAlert size={14} /><span>{managementError}</span>{#if shouldOfferCredentialSettingsAction(managementError, managementTab)}<Button variant="ghost" size="sm" onclick={() => openCredentialSettings()}><KeyRound size={13} />{t("app.goToConfigure")}</Button>{/if}<button aria-label={t("app.closeManagementError")} onclick={() => managementError = ""}><X size={13} /></button></div>{/if}
                {#if managementNotice}<div class="management-feedback success"><CircleCheck size={14} /><span>{managementNotice}</span><button aria-label={t("app.closeManagementNotice")} onclick={() => managementNotice = ""}><X size={13} /></button></div>{/if}
                {#if managementTab === "overview"}
                  <div class="management-summary-grid"><button onclick={() => switchManagementTab("sessions")}><span class="summary-icon"><MessageSquare size={16} /></span><strong>{t("overview.sessionsTitle")}</strong><small>{t("overview.sessionsDesc", { active: sessions.length, archived: archivedSessionIds.length })}</small></button><button onclick={() => switchManagementTab("goals")}><span class="summary-icon"><Target size={16} /></span><strong>{t("overview.goalsTitle")}</strong><small>{currentGoal ? goalPhaseLabel(currentGoal.goal.phase) : t("overview.noGoal")}</small></button><button onclick={() => switchManagementTab("subagents")}><span class="summary-icon"><Network size={16} /></span><strong>{t("overview.subagentsTitle")}</strong><small>{t("overview.subagentsDesc", { count: subagents.filter((item) => item.kind === "child").length })}</small></button><button onclick={() => switchManagementTab("agents")}><span class="summary-icon"><UserRoundCog size={16} /></span><strong>{t("overview.agentsTitle")}</strong><small>{t("overview.agentsDesc", { count: agentPresets.length })}</small></button><button onclick={() => switchManagementTab("models")}><span class="summary-icon"><Bot size={16} /></span><strong>{t("overview.modelsTitle")}</strong><small>{selectedModel || t("overview.noModelSelected")}</small></button><button onclick={() => switchManagementTab("workspaces")}><span class="summary-icon"><FolderOpen size={16} /></span><strong>{t("overview.workspacesTitle")}</strong><small>{t("overview.workspacesDesc", { count: workspaces.length })}</small></button><button onclick={() => switchManagementTab("plugins")}><span class="summary-icon"><Blocks size={16} /></span><strong>{t("overview.pluginsTitle")}</strong><small>{t("overview.pluginsDesc", { total: purePlugins.length, enabled: purePlugins.filter((item) => item.enabled).length })}</small></button><button onclick={() => switchManagementTab("mcp")}><span class="summary-icon"><Cable size={16} /></span><strong>{t("overview.mcpTitle")}</strong><small>{mcpInventoryEntries.length > 0 ? t("overview.mcpDesc", { count: mcpInventoryEntries.length }) : t("overview.mcpReady")}</small></button><button onclick={() => switchManagementTab("knowledge")}><span class="summary-icon"><BookOpen size={16} /></span><strong>{t("overview.knowledgeTitle")}</strong><small>{knowledgeStatusLabel()}</small></button><button onclick={() => switchManagementTab("settings")}><span class="summary-icon"><Settings2 size={16} /></span><strong>{t("overview.settingsTitle")}</strong><small>{t("overview.settingsDesc", { namespaces: settingsNamespaces.length, credentials: credentialRefs.length })}</small></button><button onclick={() => switchManagementTab("runtime")}><span class="summary-icon"><ShieldAlert size={16} /></span><strong>{t("overview.runtimeTitle")}</strong><small>{runtimeConnectionError ? t("overview.runtimeError") : t("overview.runtimeNormal")}</small></button></div>
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
                                <Button variant="ghost" size="icon-sm" aria-label={t("session.duplicateSession")} title={item.running ? t("session.runningActionUnavailable") : t("session.duplicateSession")} disabled={!!managementBusy || item.running} onclick={() => void duplicateSession(item.sessionId)}><Copy size={14} /></Button>
                                <Button variant="ghost" size="icon-sm" aria-label={t("session.exportSession")} title={t("session.exportSession")} disabled={!!managementBusy} onclick={() => void exportSession(item.sessionId)}><Save size={14} /></Button>
                                <Button variant="ghost" size="icon-sm" aria-label={t("session.archiveSession")} title={item.running ? t("session.runningActionUnavailable") : t("session.archiveSession")} disabled={!!managementBusy || item.running} onclick={() => void archiveManagedSession(item.sessionId)}><Archive size={14} /></Button>
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
                            <Button variant="outline" size="sm" disabled={!!managementBusy || !!activeSession?.running} title={activeSession?.running ? t("session.runningActionUnavailable") : undefined} onclick={() => void forkSessionAtSeq(message.seq!)}><GitBranch size={13} />{t("checkpoints.forkFromHere")}</Button>
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
                          <Button variant="outline" size="sm" onclick={() => openCredentialSettings("XG_GOMODEL_API_KEY")}>
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
                            <button class:chosen={modelSelectionKey(group.id, model.id) === selectedModel} class="model-option" disabled={modelBusy || !modelCredentialConfigured(group.id)} title={modelCredentialConfigured(group.id) ? undefined : t("models.missingProviderKey")} onclick={() => void chooseModel(group.id, model.id)}>
                              <span>
                                <strong>{model.name}</strong>
                                <small>
                                  {modelCredentialConfigured(group.id) ? modelCapabilityLabel(model, group.id === "xg-gomodel" && unknownModelCapabilities.has(model.id)) : t("models.needApiKey")}
                                  {#if model.contextWindow} · {t("models.contextWindow", { count: model.contextWindow.toLocaleString() })}{/if}
                                  {#if model.maxTokens} · {t("models.maxTokens", { count: model.maxTokens.toLocaleString() })}{/if}
                                </small>
                              </span>
                              {#if modelSelectionKey(group.id, model.id) === selectedModel}
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
                      <div class="knowledge-health-card">
                        <span>{t("knowledge.statIndex")}</span>
                        <strong>{knowledgeIndex.files || 0} {t("knowledge.filesUnit")} · {knowledgeIndex.chunks || 0} {t("knowledge.chunksUnit")}</strong>
                        <small>{knowledgeStatusLabel()}</small>
                      </div>
                    </div>
                    <div class="knowledge-toolbar">
                      <Button size="sm" onclick={() => void pickWorkspace()}><FolderOpen size={14} />{t("knowledge.selectWorkspaceBtn")}</Button>
                      <Button variant="outline" size="sm" onclick={() => void createSession()}><MessageSquarePlus size={14} />{t("knowledge.newKnowledgeSessionBtn")}</Button>
                      <Button variant="outline" size="sm" disabled={!workspacePath || knowledgeIndex.state === "building"} onclick={() => void runKnowledgeOperation("build")}><Database size={14} />{t("knowledge.buildIndexBtn")}</Button>
                      <Button variant="outline" size="sm" disabled={!workspacePath || knowledgeIndex.state === "building"} onclick={() => void runKnowledgeOperation("refresh")}><RefreshCw size={14} />{t("knowledge.refreshIndexBtn")}</Button>
                      <Button variant="outline" size="sm" onclick={() => openKnowledgePrompt(t("knowledge.createInventoryPrompt"))}><ClipboardList size={14} />{t("knowledge.scanWorkspaceBtn")}</Button>
                      <Button variant="outline" size="sm" disabled={!workspacePath || knowledgeIndex.state === "building"} onclick={() => void runKnowledgeOperation("query", t("knowledge.searchWorkspacePrompt"))}><Search size={14} />{t("knowledge.searchWorkspaceBtn")}</Button>
                      <Button variant="outline" size="sm" onclick={() => void refreshManagement()}><History size={14} />{t("knowledge.refreshKnowledgeBtn")}</Button>
                    </div>
                    {#if knowledgeIndex.failures && knowledgeIndex.failures.length > 0}<div class="knowledge-note"><CircleAlert size={14} /><span>{t("knowledge.indexFailures", { count: knowledgeIndex.failures.length, names: knowledgeIndex.failures.join("、") })}</span></div>{/if}
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
                          <div><strong>{namespace.ns}</strong><small>{namespace.applies === "restart" ? t("common.restartEffect") : t("common.instantEffect")} · {t("runtime.revision", { revision: namespace.revision })}</small></div>
                          <code>{t("runtime.secretsCount", { count: namespace.secrets.length })}</code>
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
            <header class="knowledge-hero"><div><div class="eyebrow">{t("knowledge.eyebrow")}</div><h1>{t("knowledge.title")}</h1><p>{t("knowledge.heroDesc")}</p></div><div class="header-actions"><Button variant="outline" size="sm" onclick={() => view = "conversation"}><ChevronRight class="rotate-180" size={14} />{t("app.backToConversation")}</Button><Button size="sm" disabled={!workspacePath || knowledgeIndex.state === "building"} onclick={() => void runKnowledgeOperation("build")}><Database size={14} />{t("knowledge.buildIndexBtn")}</Button></div></header>
            <div class="knowledge-page-body">
              <section class="knowledge-search-panel"><div class="knowledge-search-heading"><div><span class="section-label">{t("knowledge.searchTitle")}</span><h2>{t("knowledge.searchHeading")}</h2><p>{t("knowledge.searchSub")}</p></div><span class="knowledge-source-count"><Database size={15} />{knowledgeStatusLabel()}</span></div><div class="knowledge-search-row"><Input aria-label={t("knowledge.questionAria")} bind:value={input} placeholder={t("knowledge.searchPlaceholder")} /><Button size="sm" disabled={!workspacePath || !input.trim() || knowledgeIndex.state === "building"} onclick={() => void runKnowledgeOperation("query", input)}><Search size={14} />{t("knowledge.searchBtn")}</Button></div><div class="knowledge-shortcuts"><button disabled={!workspacePath || knowledgeIndex.state === "building"} onclick={() => void runKnowledgeOperation("refresh")}><RefreshCw size={14} /><span><strong>{t("knowledge.refreshIndexCard")}</strong><small>{t("knowledge.refreshIndexSub")}</small></span></button><button onclick={() => openKnowledgePrompt(t("knowledge.createInventoryPrompt"))}><ClipboardList size={14} /><span><strong>{t("knowledge.createInventoryCard")}</strong><small>{t("knowledge.createInventorySub")}</small></span></button><button onclick={() => void createSession()}><MessageSquarePlus size={14} /><span><strong>{t("knowledge.createSessionCard")}</strong><small>{t("knowledge.createSessionSub")}</small></span></button></div>{#if knowledgeIndex.failures && knowledgeIndex.failures.length > 0}<div class="knowledge-note"><CircleAlert size={14} /><span>{t("knowledge.indexFailures", { count: knowledgeIndex.failures.length, names: knowledgeIndex.failures.join("、") })}</span></div>{/if}</section>
              <div class="knowledge-columns"><section class="knowledge-source-section"><div class="section-row"><div><span class="section-label">{t("knowledge.skillsSectionTitle")}</span><h2>{t("knowledge.callableCapabilities")}</h2></div><Button variant="ghost" size="sm" onclick={() => void refreshManagement()}><History size={14} />{t("common.refresh")}</Button></div>{#if skills.length === 0}<DataState state="empty" title={t("knowledge.emptySkillsTitle")} description={t("knowledge.emptySkillsDesc")} />{:else}<div class="knowledge-skill-list">{#each skills.filter((skill) => !settingsQuery || `${skill.name} ${skill.description}`.toLowerCase().includes(settingsQuery.toLowerCase())) as skill (skill.name)}<article><div class="skill-heading"><span class="row-icon"><BookOpen size={15} /></span><div><strong>{skill.name}</strong><small>{skill.modelInvocable ? t("knowledge.skillInvocableModel") : t("knowledge.skillInvocableUser")}</small></div></div><p>{skill.description}</p>{#if skill.whenToUse}<em>{skill.whenToUse}</em>{/if}</article>{/each}</div>{/if}</section><aside class="knowledge-context"><div class="section-label">{t("knowledge.currentContext")}</div><div class="context-stat"><span>{t("overview.workspaceLabel")}</span><strong title={workspacePath}>{workspaceName}</strong></div><div class="context-stat"><span>{t("overview.sessionLabel")}</span><strong>{activeSession ? sessionTitle(activeSession) : t("knowledge.unselected")}</strong></div><div class="context-stat"><span>{t("knowledge.statSession")}</span><strong>{activeSession ? t("knowledge.sessionMessagesCount", { count: messages.length }) : t("knowledge.needSelectSession")}</strong></div><div class="knowledge-note"><ShieldAlert size={14} /><span>{t("knowledge.noteDesc")}</span></div></aside></div>
            </div>
          </div>
        {:else}
          <div class="conversation-shell">
            <header class="conversation-header"><div class="conversation-title"><div class="eyebrow">{activeSession ? t("app.sessionWorkbench") : t("app.eyebrow")}</div><h1>{customization.title || (activeSession ? sessionTitle(activeSession) : t("app.startNewSession"))}</h1><p>{customization.subtitle || workspacePath || t("app.selectWorkspaceToStart")}</p></div><div class="header-actions"><Button variant="outline" size="sm" aria-pressed={customizationOpen} onclick={() => customizationOpen = !customizationOpen}><SlidersHorizontal size={14} />{t("app.uiCustomization")}</Button><Button variant="outline" size="sm" onclick={() => openManagement("overview")}><Settings2 size={14} />{t("app.management")}</Button></div></header>
            {#if runtimeError}<div class="error-banner"><CircleAlert size={15} /><span>{runtimeError}</span>{#if lastFailedPrompt?.sessionId === activeSessionId && !sending}<Button variant="outline" size="sm" onclick={() => void retryLastPrompt()}><RotateCcw size={13} />{t("common.retry")}</Button>{/if}{#if canSwitchToBuiltinModel}<Button variant="outline" size="sm" onclick={() => void switchToBuiltinModel()}><PlugZap size={13} />{t("app.switchToBuiltinModel")}</Button>{/if}{#if isCredentialSettingsError(runtimeError) || !selectedProviderCredentialReady}<Button variant="ghost" size="sm" onclick={() => openCredentialSettings(selectedProviderCredentialRef())}><KeyRound size={13} />{t("app.goToConfigure")}</Button>{/if}<button aria-label={t("app.closeError")} onclick={() => { runtimeError = ""; }}><X size={14} /></button></div>{/if}
            {#if customizationOpen}<section class="customization-panel" aria-label={t("customization.title")}><div class="customization-panel__header"><div><div class="section-label">{t("customization.title")}</div><strong>{t("customization.subtitle")}</strong><p>{t("customization.example")}</p></div><Button variant="ghost" size="icon-sm" aria-label={t("customization.close")} onclick={() => customizationOpen = false}><X size={14} /></Button></div>{#if customizationNotice}<div class="customization-feedback"><CircleCheck size={14} /><span>{customizationNotice}</span></div>{/if}{#if customizationDraft}<div class="customization-preview"><div><strong>{t("customization.pendingPatch")}</strong><span>{t("customization.patchFromSession")}</span></div><code>{JSON.stringify(customizationDraft)}</code><div class="customization-actions"><Button variant="outline" size="sm" onclick={() => customizationDraft = undefined}>{t("common.ignore")}</Button><Button size="sm" onclick={() => applyCustomizationPatch(customizationDraft!)}><Check size={13} />{t("customization.applyPatch")}</Button></div></div>{/if}<div class="customization-summary"><span class="mode-chip">{customization.density === "compact" ? t("customization.compactDensity") : t("customization.comfortableDensity")}</span><span>{customization.sidebar === "collapsed" ? t("customization.sidebarCollapsed") : t("customization.sidebarExpanded")}</span><span>{customization.activity === "visible" ? t("customization.activityVisible") : t("customization.activityHidden")}</span><span>{t("customization.composerRows", { count: customization.composerRows })}</span></div><div class="customization-actions"><Button variant="ghost" size="sm" disabled={customizationHistory.length === 0} onclick={undoCustomization}>{t("customization.undoLast")}</Button><Button variant="ghost" size="sm" onclick={() => { customization = DEFAULT_UI_CUSTOMIZATION; customizationHistory = []; persistUiCustomization(customization); applyRuntimeCustomization(customization); customizationNotice = t("customization.restoredNotice"); }}>{t("customization.restoreDefaults")}</Button></div></section>{/if}
            {#if surfaceDraft}<section class="surface-proposal" aria-label={t("surface.proposalTitle")}><div><div class="section-label">{t("surface.proposalTitle")}</div><strong>{surfaceDraft.spec.title}</strong><p>{surfaceDraft.summary || t("surface.proposalDefaultSummary", { count: surfaceDraft.spec.widgets.length })}</p></div><div class="surface-proposal__meta"><span>{t("surface.proposalWidgetsCount", { count: surfaceDraft.spec.widgets.length })}</span><span>{t("surface.proposalDataSourcesCount", { count: surfaceDraft.spec.dataSources.length })}</span></div><div class="customization-actions"><Button variant="ghost" size="sm" onclick={() => { surfaceDraft = undefined; surfaceNotice = t("surface.proposalIgnored"); }}>{t("common.ignore")}</Button><Button size="sm" onclick={applySurfaceProposal}><Check size={13} />{t("surface.confirmRender")}</Button></div></section>{/if}
            {#if generatedSurface && client}<section class="generated-surface" aria-label={t("surface.generatedTitle")}><header><div><div class="section-label">{t("surface.generatedTitle")}</div><strong>{generatedSurface.title}</strong><p>{surfaceNotice || t("surface.readOnlyDesc")}</p></div><div class="customization-actions"><Button variant="ghost" size="sm" disabled={surfaceHistory.length === 0} onclick={undoGeneratedSurface}>{t("common.undo")}</Button><Button variant="ghost" size="sm" onclick={removeGeneratedSurface}><Trash2 size={13} />{t("common.remove")}</Button></div></header>{#if GeneratedSurface}<GeneratedSurface spec={generatedSurface} {client} {activeSessionId} onError={(message) => { surfaceNotice = userFacingError(message); }} />{:else if generatedSurfaceLoadFailed}<div class="surface-load-error" role="alert"><span>{surfaceNotice}</span><Button variant="outline" size="sm" onclick={() => void ensureGeneratedSurfaceComponent()}>{t("common.retry")}</Button></div>{:else}<Loader size={16} />{/if}</section>{/if}
            <div class="main-grid">
              {#if ConversationTranscript}<ConversationTranscript
                messages={messages}
                {sending}
                {productName}
                quickActions={customization.quickActions.length ? customization.quickActions : [
                  { label: t("transcript.checkProject"), prompt: t("transcript.checkProjectPrompt") },
                  { label: t("transcript.understandCode"), prompt: t("transcript.understandCodePrompt") },
                  { label: t("transcript.runTests"), prompt: t("transcript.runTestsPrompt") },
                ]}
                onPromptSelect={(prompt) => input = prompt}
              />{:else}<Loader size={16} />{/if}
              {#if ActivityPanel}<ActivityPanel {messages} {todos} {sending} open={activityOpen} onClose={() => setActivityOpen(false)} />{/if}
            </div>
            <PendingInteractions
              approval={pendingApproval}
              question={pendingQuestion}
              answers={questionAnswers}
              onAnswer={(id, value, custom = false) => { pendingInteractionsBySession = setQuestionAnswer(pendingInteractionsBySession, activeSessionId, id, value, custom); }}
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
