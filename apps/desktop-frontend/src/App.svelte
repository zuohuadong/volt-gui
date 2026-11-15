<script lang="ts">
  import type { SessionOperation } from "$lib/session-activity";
  import { onMount, tick } from "svelte";
  import { ModeWatcher } from "mode-watcher";
  import AppearanceSettings from "$components/AppearanceSettings.svelte";
  import ArchiveSessionDialog from "$components/ArchiveSessionDialog.svelte";
  import NewSessionDialog from "$components/NewSessionDialog.svelte";
  import DeleteSessionDialog from "$components/DeleteSessionDialog.svelte";
  import SettingsSectionNav, { type SettingsSection } from "$components/SettingsSectionNav.svelte";
  import SettingsPageHero from "$components/SettingsPageHero.svelte";
  import SpeechSettings from "$components/SpeechSettings.svelte";
  import AgentConfigTransfer from "$components/AgentConfigTransfer.svelte";
  import ThemeSelector from "$components/ThemeSelector.svelte";
  import { startupState } from "$lib/startup-state";
  import { SessionResponse } from "$lib/session-response.svelte";
  import {
    Archive, BookOpen, Bot, Check, ChevronDown, ChevronRight, CircleAlert, Ellipsis,
    CircleCheck, ClipboardList, Copy, ExternalLink, FileText, FolderOpen,
    HardDrive, History, KeyRound, MessageSquare, MessageSquarePlus, Network,
    Pause, Pencil, Play, PanelLeftClose, PanelLeftOpen, Save, Search, Send,
    Settings2, ShieldAlert, SlidersHorizontal, Square, Target, Trash2, UserRoundCog,
    X, RefreshCw, PlugZap, GitBranch, Blocks, Cable, Boxes, Globe, Languages, Database, RotateCcw, Download,
    ListChecks,
  } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import { Textarea } from "$components/ui/textarea";
  import DshPromptComposer from "$components/DshPromptComposer.svelte";
  import PendingInteractions from "$components/PendingInteractions.svelte";
  import QuickPicker from "$components/QuickPicker.svelte";
  import SmbMounts from "$components/SmbMounts.svelte";
  import BrowserExtensionCard from "$components/BrowserExtensionCard.svelte";
  import ManagementNav, { type ManagementTab } from "$components/ManagementNav.svelte";
  import WorkspaceBrowser from "$components/WorkspaceBrowser.svelte";
  import { separatePluginsAndMcp, settingsNamespaceName } from "$lib/plugin-i18n";
  import { t, getLocale, setLocale, toggleLocale, AVAILABLE_LOCALES, i18n } from "$lib/i18n";
  import { Input } from "$components/ui/input";
  import { Separator } from "$components/ui/separator";
  import { ConfirmDialog, DataState, MetricStrip, SettingsGroup, StatusBadge, type MetricStripItem } from "@svadmin/ui";
  import { messagesToMarkdown, Loader } from "@svadmin/ai-elements";
  import { setResources } from "@svadmin/core";
  import {
    DshClient, type AgentPreset, type ConfigurableProvider, type CredentialView,
    type DshFrame, type DshSkill, type GoalProjection, type ModelGroup,
    type PendingApproval, type PendingQuestion, type SessionSummary,
    type PromptContentPart, type SettingsNamespace, type SubagentEntry, type Workspace, type PluginInventoryEntry, type HistoryEntry,
  } from "$lib/dsh-client";
  import { isHostCommandLine, normalizeCommands, type HostCommand } from "$lib/slash-commands";
  import { planCardsFromHistory, planState, planToggleCommand } from "$lib/plan-mode";
  import { readTeamBoard } from "$lib/agent-team";
  import { maskSecrets } from "$lib/secret-mask";
  import { latestChangesAnnouncement } from "$lib/workspace-changes";
  import PlanCard from "$components/PlanCard.svelte";
  import JobRoster from "$components/JobRoster.svelte";
  import TeamBoard from "$components/TeamBoard.svelte";
  import ShortcutsPanel from "$components/ShortcutsPanel.svelte";
  import TerminalPanel from "$components/TerminalPanel.svelte";
  import { normalizeJobRows, type JobRow } from "$lib/jobs";
  import { feedbackAction, readFeedbackList, readFeedbackWrite, type FeedbackItem, type FeedbackRating } from "$lib/message-feedback";
  import ChangedFilesCard from "$components/ChangedFilesCard.svelte";
  import { assistantMessageForEvent, applyTranscriptEvent, foldHistory, hasMessageContent, interruptRunningTools, mergeHistoryEntries, type SessionEvent, type TodoItem, type TranscriptMessage } from "$lib/transcript";
  import { createStreamRenderScheduler, isBatchableSessionEvent } from "$lib/stream-render-scheduler";
  import {
    credentialRefHint,
    credentialRefTitle,
    collectCredentialRefs,
    enrichModelGroups,
    configuredModelGroups,
    isProviderCredentialOptional,
    localizeModelInfo,
    mergeDiscoveredModels,
    modelCapabilityLabel,
    modelSelectionKey,
    modelSupportsImages,
    parseModelSelectionKey,
    providerCredentialRef,
    resolveProviderSettings,
    supportedReasoningEffort,
  } from "$lib/model-catalog";
  import { providerDisplayCopy } from "$lib/provider-i18n";
  import { agentPresetLocked, archivedSessionItems, clearsSessionError, sessionHealth, sessionHealthLabel, turnEndError, turnEndFailure, visibleSessions } from "$lib/session-health";
  import { buildTranscriptView } from "$lib/transcript-view";
  import { credentialStatusLabel } from "$lib/credential-status";
  import { classifyAuthFailure, errorText, userFacingError, type AuthFailureKind } from "$lib/user-error";
  import {
    isMutableQueueItem,
    nativeQueueRows,
    queueItemDraft,
    inboxPendingCount,
    toNativeQueueItems,
    type NativeQueueItem,
  } from "$lib/native-queue";
  import { browserSkillErrorKey } from "$lib/browser-skill-error";
  import { historyJumpShortcut, isEditableShortcutTarget, sessionNavigationShortcut, sessionNavigationTarget } from "$lib/session-navigation";
  import { filterSessionsByQuery } from "$lib/session-search";
  import { describeFileRejection, formatFileReference, planFileInput } from "$lib/attachment-plan";
  import { deviceMemoryGiB, resolveInlineUploadBudget } from "$lib/file-limits";
  import { appendQuoteToDraft } from "$lib/quote-reference";
  import { confirmSessionStopped } from "$lib/session-stop";
  import {
    AUTO_CONTINUE_LIMIT, approachingOutputLimit, deliveredAnswer, hasRetryableTask, latestOutputTokens,
    latestTurnEndSeq, shouldAutoContinue, taskRecoveryReason, turnEndKind,
  } from "$lib/task-retry";
  import { classifyWorkspaceDirectories, workspaceSuggestions, type WorkspaceKind } from "$lib/workspace-suggestions";
  import { buildKnowledgePrompt, externalKnowledgeStateFrom, externalScopeState, externalSourceSignature, isInternalKnowledgePrompt, knowledgeIndexSummary, knowledgeToolName, parseKnowledgeReport, stripKnowledgeArtifacts, type KnowledgeIndexReport, type KnowledgeOperation, type KnowledgeScope } from "$lib/knowledge";
  import { enabledCapabilityCount, type CapabilityKey } from "$lib/capability-groups";
  import { describeSpecDifference, formatTokenSpec, stripInternalAlias } from "$lib/model-spec";
  import { buildQuestionAnswers, questionsAnswered, toolErrorSummary } from "$lib/ai-elements-adapter";
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
    describeUiCustomizationPatch,
    isUiCustomizationIntent,
    parseUiCustomization,
    restoreUiCustomization,
    UI_CUSTOMIZATION_SCHEMA,
    type UiCustomizationPatch,
    type UiCustomizationState,
    type UiCodeFontFamily,
    type UiDensity,
    type UiFontFamily,
    type UiFontSize,
  } from "$lib/ui-customization";
  import {
    buildVoltSurfacePrompt,
    isSurfaceGenerationIntent,
    resolveVoltSurfaceSegments,
    validateStoredSurface,
  } from "$lib/surface-agent";
  import type { SurfaceSpec } from "@svadmin/surface";
  import { buildSurfaceFollowUpMessage } from "$lib/surface-interaction";
  import type { SurfaceInteractionEvent } from "@svadmin/surface";
  import type { DesktopCapabilities, DesktopCapabilityKey, DesktopUpdateCheck } from "./electron";
  type NetworkMode = "intranet" | "external";
  type View = "conversation" | "knowledge" | "settings";

 const FONT_FAMILY_STACKS: Record<UiFontFamily, string> = {
   system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
   inter: '"Inter", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif',
   yahei: '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif',
 };
 const CODE_FONT_FAMILY_STACKS: Record<UiCodeFontFamily, string> = {
   "system-mono": '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
   jetbrains: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
   cascadia: '"Cascadia Code", "SFMono-Regular", Consolas, monospace',
 };
 const FONT_SIZE_VALUES: Record<UiFontSize, { base: string; message: string; code: string }> = {
   small: { base: "12px", message: "12px", code: "10.5px" },
   medium: { base: "13px", message: "13px", code: "11.5px" },
   large: { base: "14px", message: "14px", code: "12.5px" },
 };

 let client = $state<DshClient>();
  let customProductName = $state("");
  const productName = $derived(customProductName || t("app.name"));
  let appVersion = $state("");
  let desktopFeatures = $state({ permanentSessionDeletion: false, updateChecks: false });
  let networkMode = $state<NetworkMode>("intranet");
  let networkModeBusy = $state(false);
  const DEFAULT_CAPABILITIES: DesktopCapabilities = {
    altium: false, pcb: false, sentry: false, report: false,
    documentImport: false, github: false, cnb: false, feishu: false,
    computerUse: false,
  };
  let capabilities = $state<DesktopCapabilities>({ ...DEFAULT_CAPABILITIES });
  let capabilitiesBusy = $state(false);
  // 内置网关凭据被上游拒绝时自动恢复并重试一次：这条路径以前只给一句「去配置」，
  // 用户只能重启应用，表现为「第一个问题正常，第二个问题就报 401」。
  let autoRepairState = $state<"idle" | "running" | "done" | "failed">("idle");
  // 401/403 到底是谁拒的：只有模型路由的拒绝才该提「模型凭据」（#362）。
  let activeAuthFailureKind = $state<AuthFailureKind | undefined>(undefined);
  let autoRepairNotice = $state("");
  const autoRepairHandled = new Set<string>();
  // 用户自己保存过该凭据时不自动覆盖：宁可报错，也不能悄悄替换掉真实密钥。
  let userSavedCredentialRefs = new Set<string>();
  let updateCheck = $state<DesktopUpdateCheck>();
  let updateChecking = $state(false);
  let updateError = $state("");
 let workspacePath = $state("");
  let defaultChatDirectory = $state("");
  let bootstrapWorkspace = $state("");
  let workspaces = $state<Workspace[]>([]);
  let sessions = $state<SessionSummary[]>([]);
  let allSessions = $state<SessionSummary[]>([]);
  let archivedSessionIds = $state<string[]>([]);
  let activeSessionId = $state("");
  let sessionSelectionRequest = 0;
  let modelSelectionRequest = 0;
  let historyLoad: { requestId: number; sessionId: string; frames: HistoryEntry[] } | undefined;
  let historyEntries = $state<HistoryEntry[]>([]);
  const streamRenderScheduler = createStreamRenderScheduler();
  let streamRenderSessionId = "";
  let streamRenderPending: { messages: TranscriptMessage[]; todos: TodoItem[] } | undefined;
  let historyCursor = -1;
  let historyHasMore = $state(false);
  let historyLoading = $state(false);
  let messages = $state<TranscriptMessage[]>([]);
  let todos = $state<TodoItem[]>([]);
  let input = $state("");
  let sessionDrafts = $state<Record<string, string>>({});
  let draftFilesBySession = $state<Record<string, File[]>>({});
  // 任务执行期间允许先把下一条排上，当前轮结束后自动发出（issue #306）。
  // 待发送队列以官方会话 inbox 为唯一真相（session/state），不再本地维护一份。
  let nativeQueue = $state<Record<string, NativeQueueItem[]>>({});
  // 取消排队后交给 Composer 的附件恢复令牌（配 restoreToken 使用）。
  let sessionQuery = $state("");
  let settingsQuery = $state("");
  let managementTab = $state<ManagementTab>("overview");
  let loading = $state(true);
  const sessionResponse = new SessionResponse((sessionId) => setSessionRuntimeError(sessionId, t("errors.responseInactive")));
  const sending = $derived(sessionResponse.sending);
  let sidebarCollapsed = $state(false);
  let viewportWidth = $state(1200);
  let mobileSidebarOpen = $state(false);
  const sidebarExpanded = $derived(viewportWidth <= 760 ? mobileSidebarOpen : !sidebarCollapsed);
  let sessionOperations = $state<SessionOperation[]>([]);
  let activityOpen = $state(false);
  let activityRestoreElement: HTMLElement | null = null;
  let sessionSearchInput = $state<HTMLInputElement>();
  let quickPickerOpen = $state(false);
  let shortcutsOpen = $state(false);
  /** 终端是会话级面板：切换会话即关闭，避免把旧 shell 挂在新会话下面。 */
  let terminalOpenSessionId = $state("");
  /** 任务板默认只在该会话开启团队或有任务时出现；快捷入口可强制展开。 */
  let teamBoardOpen = $state(false);
  let quickPickerQuery = $state("");
  let quickPickerIndex = $state(0);
  let busyInteractions = $state<Record<string, boolean>>({});
  let view = $state<View>("conversation");
  let runtimeError = $state("");
  let runtimeConnectionError = $state("");
  // 管理总览与运行诊断必须给出同一结论（#356）：两个页面都读这几个派生值。
  let runtimeLastSyncedAt = $state(0);
  const runtimeStatusKind = $derived(runtimeConnectionError ? "unavailable" : loading ? "loading" : "ready");
  const runtimeLastSyncedLabel = $derived(runtimeLastSyncedAt
    ? t("runtime.lastSyncedAt", { time: new Date(runtimeLastSyncedAt).toLocaleTimeString(getLocale()) })
    : t("runtime.neverSynced"));
  let workspaceNotice = $state("");
  let historyNotice = $state("");
  let workspaceWarning = $state("");
  let memoryStatus = $state<"active" | "disabled" | "requiresGit">("disabled");
  let workspaceSelectionRequest = 0;
  let sessionErrors = $state<Record<string, string>>({});
  let modelGroups = $state<ModelGroup[]>([]);
  let selectedModel = $state("");
  let reasoningEffort = $state("");
  let modelBusy = $state(false);
  let modelLoading = $state(false);
  let modelLoadError = $state("");
  let sessionLoadError = $state("");
  let skills = $state<DshSkill[]>([]);
  /** 斜杠命令目录（官方 `commands.list`）；只在当前会话内有效。 */
  let hostCommands = $state<HostCommand[]>([]);
  /** 命令执行结果提示；它不进对话历史，因此不需要持久化。 */
  let commandNotice = $state("");
  let commandCatalogSessionId = $state("");
  /** 后台任务花名册（官方 job/list 流推送，按会话存放）。 */
  let jobRoster = $state<Record<string, JobRow[]>>({});
  /** 当前会话已记录的消息反馈（官方 messageFeedback.list）。 */
  let feedbackItems = $state<Record<string, FeedbackItem>>({});
  let agentPresets = $state<AgentPreset[]>([]);
  let agentPreview = $state<{ id: string; content: string }>();
  let agentAuthorable = $state(false);
  let agentHasDocument = $state(false);
  let copyingAgentPreset = $state("");
  let copyAgentNameDraft = $state("");
  let confirmingAgentPreset = $state("");
  let editingSessionId = $state("");
  let confirmingSessionId = $state("");
  let confirmingDeleteSessionId = $state("");
  let confirmingClearConversation = $state(false);
  let confirmingArchivedSessionId = $state("");
  let confirmingArchivedCleanup = $state(false);
  // 侧栏直接露出已归档会话（含恢复/删除），归档后不需要再摸到管理工作台底部（#371/#372）。
  let archivedListOpen = $state(false);
  let lastArchivedSessionId = $state("");
  let newSessionDialogOpen = $state(false);
  let newSessionBusy = $state(false);
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
  let subagentHistoryRequest = 0;
  let managementRefreshRequest = 0;
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
  // 外部知识源的可用性：只有确认「插件未激活 / 未启用 / 缺凭据 / 未配地址」才判为不可用，
  // settings 读取失败时保持 unknown，避免把可用的外部源误锁成不可选（#348）。
  let externalKnowledgeState = $state<"unknown" | "ready" | "unavailable">("unknown");
  // 外部知识源默认关闭：只有本次运行里「测试连接」成功过，才允许选外部/全部范围（#363）。
  let externalKnowledgeVerified = $state(false);
  let externalKnowledgeSignature = $state("");
  // 每次验证结论变化都递增，用来丢弃刷新期间读到的过期配置。
  let externalKnowledgeVerifiedEpoch = 0;
  // 外部知识源实际使用的凭据引用：轮换同一 ref 的密钥时指纹不会变，必须显式作废验证。
  let externalKnowledgeKeyRef = $state("WEKNORA_API_KEY");
  // 默认只给本地检索：未启用 / 未测试通过都按「不可选外部」处理。
  const externalKnowledgeUnavailable = $derived(externalScopeState({ state: externalKnowledgeState, verifiedInSession: externalKnowledgeVerified }) === "local-only");
  const currentLocale = $derived(i18n.locale);
  const pluginPartition = $derived(separatePluginsAndMcp(pluginInventory, currentLocale));
  const purePlugins = $derived(pluginPartition.plugins);
  const mcpInventoryEntries = $derived(pluginPartition.mcpEntries);
  let credentialRefs = $state<string[]>([]);
  let credentials = $state<Record<string, CredentialView>>({});
  const availableModelGroups = $derived(configuredModelGroups(modelGroups, settingsNamespaces, providers, credentials));
  const availableCatalogGroups = $derived(configuredModelGroups(catalogGroups, settingsNamespaces, providers, credentials));
  let credentialRefDraft = $state("");
  let credentialValueDraft = $state("");
  let confirmingCredentialRef = $state("");
  let unknownModelCapabilities = $state<Set<string>>(new Set());
  let pendingInteractionsBySession = $state<PendingInteractionsBySession>({});
  let customization = $state<UiCustomizationState>(DEFAULT_UI_CUSTOMIZATION);
  let customizationOpen = $state(false);
  let settingsViewMode = $state<"user" | "merged">("user");
  let rawSettingsOpen = $state(false);
  let settingsSection = $state<SettingsSection>("general");
  let customizationDraft = $state<UiCustomizationPatch | undefined>();
  let customizationSourceId = $state("");
  let customizationNotice = $state("");
  let customizationHistory = $state<UiCustomizationState[]>([]);
  let surfaceDraft = $state<{ summary?: string; spec: SurfaceSpec }>();
  // 本轮用户实际输入：界面提案只在这条消息确实表达了界面意图时才展示（#366）。
  let lastUserPromptText = $state("");
  // 系统把 agentconfig:// 深链转发进来时先落到这里，再交给设置页的配置迁移卡片。
  let agentConfigIncomingLink = $state("");
  let agentConfigIncomingLinkToken = $state(0);
  let generatedSurface = $state<SurfaceSpec>();
  type GeneratedSurfaceComponent = typeof import("$components/GeneratedSurface.svelte").default;
  type ConversationTranscriptComponent = typeof import("$components/ConversationTranscript.svelte").default;
  type ActivityPanelComponent = typeof import("$components/ActivityPanel.svelte").default;
  type QuickPickerEntry = { id: string; kind: "session" | "action"; title: string; detail?: string; sessionId?: string; run?: () => void };
  let GeneratedSurface = $state<GeneratedSurfaceComponent>();
  let generatedSurfaceImport = $state<Promise<void>>();
  let generatedSurfaceLoadFailed = $state(false);
  let ConversationTranscript = $state<ConversationTranscriptComponent>();
  let conversationTranscriptImport = $state<Promise<void>>();
  let ActivityPanel = $state<ActivityPanelComponent>();
  let activityPanelImport = $state<Promise<void>>();
  type ManagementComponentName = "provider" | "plugin" | "extensions" | "mcp" | "externalKnowledge" | "knowledgeSkill" | "knowledgeScope" | "skillStore" | "automation";
  type ProviderWorkbenchComponent = typeof import("$components/ProviderWorkbench.svelte").default;
  type PluginInventoryComponent = typeof import("$components/PluginInventoryView.svelte").default;
  type ExtensionCapabilitiesComponent = typeof import("$components/ExtensionCapabilities.svelte").default;
  type McpInventoryComponent = typeof import("$components/McpInventoryView.svelte").default;
  type ExternalKnowledgeSourcesComponent = typeof import("$components/ExternalKnowledgeSources.svelte").default;
  type KnowledgeSkillListComponent = typeof import("$components/KnowledgeSkillList.svelte").default;
  type KnowledgeScopePickerComponent = typeof import("$components/KnowledgeScopePicker.svelte").default;
  type SkillStoreComponent = typeof import("$components/SkillStoreView.svelte").default;
  type AutomationPanelComponent = typeof import("$components/AutomationPanel.svelte").default;
  let ProviderWorkbenchComponent = $state<ProviderWorkbenchComponent>();
  let PluginInventoryComponent = $state<PluginInventoryComponent>();
  let ExtensionCapabilitiesComponent = $state<ExtensionCapabilitiesComponent>();
  let McpInventoryComponent = $state<McpInventoryComponent>();
  let ExternalKnowledgeSourcesComponent = $state<ExternalKnowledgeSourcesComponent>();
  let KnowledgeSkillListComponent = $state<KnowledgeSkillListComponent>();
  let KnowledgeScopePickerComponent = $state<KnowledgeScopePickerComponent>();
  let SkillStoreComponent = $state<SkillStoreComponent>();
  let AutomationPanelComponent = $state<AutomationPanelComponent>();
  let managementComponentImports = $state<Partial<Record<ManagementComponentName, Promise<void>>>>({});
  // 动态组件加载失败必须可见且可重试，否则页面会一直停在 Loader 上。
  let managementComponentErrors = $state<Partial<Record<ManagementComponentName, string>>>({});
  let surfaceSourceId = $state("");
  let surfaceNotice = $state("");
  let surfaceHistory = $state<Array<SurfaceSpec | undefined>>([]);
  let knowledgeIndex = $state<KnowledgeIndexReport & { state: "idle" | "building" | "ready" | "partial" | "failed" }>({ state: "idle", status: "failed", files: 0, chunks: 0, failures: [] });
  // 检索是独立动作：就地展示状态与结果，不把已完成的索引状态回退成「正在建立索引」（#344）。
  let knowledgeQuerying = $state(false);
  let knowledgeQuerySessionId = $state("");
  let knowledgeQueryAnswer = $state("");
  let knowledgeQueryFinished = $state(false);
  // 记录发起检索时的消息数量：只接受这之后产生的助手回复，避免把上一轮答案当成本次结果（#344）。
  let knowledgeQueryStartIndex = 0;
  let knowledgeSessionNotice = $state("");
  // 内部调度指令与机器可读报告不进对话流（#354）：渲染用这份，逻辑仍用 messages。
  const visibleMessages = $derived(messages
    .filter((message) => !(message.role === "user" && isInternalKnowledgePrompt(message.text)))
    .map((message) => (message.role === "assistant" && message.text ? { ...message, text: stripKnowledgeArtifacts(message.text) } : message)));
  const capabilitiesEnabledCount = $derived(enabledCapabilityCount(capabilities));
  // 浏览器扩展是随包内置的，版本号由桌面桥提供；读不到就不显示版本行。
  let bundledBrowserSkillVersion = $state("");
  const browserSkillVersionLabel = $derived(bundledBrowserSkillVersion);
  $effect(() => {
    const desktop = typeof window === "undefined" ? undefined : window.voltDesktop;
    if (!desktop?.browserExtension) return;
    let cancelled = false;
    void desktop.browserExtension()
      .then((state) => { if (!cancelled) bundledBrowserSkillVersion = state.version ?? ""; })
      .catch(() => { if (!cancelled) bundledBrowserSkillVersion = ""; });
    return () => { cancelled = true; };
  });
  const knowledgeSummary = $derived(knowledgeIndexSummary(knowledgeIndex));
  // 空会话建议按工作区可观察到的目录信号分类；拿不到信号时按文档型处理（#342）。
  let workspaceKind = $state<WorkspaceKind>("documents");
  const workspaceSuggestionCache = new Map<string, WorkspaceKind>();
  $effect(() => {
    const path = workspacePath;
    const activeClient = client;
    if (!path || !activeClient) { if (!path) workspaceKind = "documents"; return; }
    const cached = workspaceSuggestionCache.get(path);
    if (cached) { workspaceKind = cached; return; }
    let cancelled = false;
    void activeClient.listDirectory(path).then((listing) => {
      if (cancelled) return;
      const kind = classifyWorkspaceDirectories((listing.entries ?? []).map((entry) => entry.name));
      workspaceSuggestionCache.set(path, kind);
      workspaceKind = kind;
    }).catch(() => { if (!cancelled) workspaceKind = "documents"; });
    return () => { cancelled = true; };
  });
  let knowledgeRoot = "";
  let knowledgeOperation = $state<KnowledgeOperation | "">("");
  let knowledgeScope = $state<KnowledgeScope>("local");
  let unsubscribeRuntimeError: (() => void) | undefined;
  let unsubscribeRuntimeReady: (() => void) | undefined;
  let unsubscribeAgentConfigLink: (() => void) | undefined;
  let unsubscribeDshFrames: (() => void) | undefined;
  let bootstrapInFlight = false;
  let initializingSession = $state(false);
  let refreshQueued = false;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let eventRefreshFlight: { client: DshClient; pending: boolean } | undefined;
  let refreshDisposed = false;
  let bootstrapQueued = false;
  let startupPollingTimer: ReturnType<typeof setInterval> | undefined;
  let runtimeRetrying = $state(false);
  const activePrompt = $derived(sessionResponse.prompt);
  const cancelledPromptIds = new Set<string>();
  const lastFailedPrompt = $derived(sessionResponse.failedPrompt);
  let continuingTask = $state(false);
  let sessionEventRevision = 0;
  let attachmentFilesBySession = $state<Record<string, Record<string, File>>>({});

  function clearAttachmentFiles(sessionId?: string): void {
    if (sessionId === undefined) {
      attachmentFilesBySession = {};
      return;
    }
    const { [sessionId]: _removed, ...remaining } = attachmentFilesBySession;
    attachmentFilesBySession = remaining;
  }

  function clearStartupTimers(): void {
    if (startupPollingTimer) {
      clearInterval(startupPollingTimer);
      startupPollingTimer = undefined;
    }
  }

  function clearRefreshTimer(): void {
    if (!refreshTimer) return;
    clearTimeout(refreshTimer);
    refreshTimer = undefined;
  }

  function armStartupTimers(): void {
    clearStartupTimers();
    startupPollingTimer = setInterval(() => {
      if (client || runtimeConnectionError) {
        clearStartupTimers();
        return;
      }
      void bootstrap();
    }, 600);
  }

  function providerAwareError(error: unknown, code?: string): string {
    const message = userFacingError(error);
    if (message !== t("errors.authFailed")) return message;
    // 只有模型路由的认证失败才把 provider 名拼进文案；工具/外部服务的 401 不能冒充模型凭据。
    if (classifyAuthFailure(errorText(error), code) !== "provider") return message;
    const { provider } = parseModelSelectionKey(selectedModel);
    const providerName = displayProviderName(provider, modelGroups.find((group) => group.id === provider)?.name);
    return providerName ? t("errors.providerAuthFailed", { provider: providerName }) : message;
  }

  function displayProviderName(providerId: string, fallback?: string): string {
    const provider = providers.find((item) => item.provider === providerId);
    return provider
      ? providerDisplayCopy(provider, i18n.locale).name
      : fallback || providerId;
  }

  function displayModelSelection(selection: string): string {
    const { provider, model } = parseModelSelectionKey(selection);
    if (!provider) return t("models.auto");
    const group = modelGroups.find((item) => item.id === provider);
    const modelInfo = group?.models.find((item) => item.id === model);
    const modelName = modelInfo ? localizeModelInfo(modelInfo, i18n.locale).name : model;
    return modelName
      ? `${displayProviderName(provider, group?.name)} / ${modelName}`
      : displayProviderName(provider, group?.name);
  }

  function namespaceDisplayName(namespace: string): string {
    switch (namespace) {
      case "llm-deepseek": return t("settings.namespaceDeepseek");
      case "llm-pi-ai": return t("settings.namespaceXg");
      case "weknora": return t("settings.namespaceWeKnora");
      default: return settingsNamespaceName(namespace, i18n.locale);
    }
  }

  function setSessionRuntimeError(sessionId: string, error: unknown, code?: string): string {
    const message = providerAwareError(error, code);
    const kind = classifyAuthFailure(errorText(error), code);
    sessionErrors = { ...sessionErrors, [sessionId]: message };
    if (sessionId === activeSessionId) {
      runtimeError = message;
      activeAuthFailureKind = kind;
      if (message === t("errors.subagentAddress")) sessionLoadError = message;
    }
    return message;
  }

  function noteResponseActivity(sessionId: string, responseMessages: TranscriptMessage[]): void {
    if (activePrompt?.sessionId !== sessionId) return;
    if (sessionErrors[sessionId] === t("errors.responseInactive")) {
      const { [sessionId]: _cleared, ...remaining } = sessionErrors;
      sessionErrors = remaining;
      if (runtimeError === t("errors.responseInactive")) runtimeError = "";
    }
    sessionResponse.activity(sessionId, responseMessages.some((item) => item.tool?.state === "running"));
  }

  function finishResponse(sessionId: string, failed = false): void {
    if (failed) sessionResponse.fail(sessionId);
    else sessionResponse.finish(sessionId);
  }

  function pauseResponseForInteraction(sessionId: string): void {
    sessionResponse.waitForInteraction(sessionId);
  }

  function resumeResponseAfterInteraction(sessionId: string, revision: number): void {
    const pending = pendingInteractionsBySession[sessionId];
    if (pending?.approval || pending?.question) return;
    sessionResponse.resumeInteraction(sessionId, revision);
  }

  function resolveInteraction(kind: "approval" | "question", sessionId: string, rpcId: string): void {
    if (pendingInteractionsBySession[sessionId]?.[kind]?.rpcId !== rpcId) return;
    pendingInteractionsBySession = kind === "approval"
      ? clearPendingApproval(pendingInteractionsBySession, sessionId, rpcId)
      : clearPendingQuestion(pendingInteractionsBySession, sessionId, rpcId);
    // 同一请求可跨会话切换完成；终止或替换后已不存在的请求不能恢复运行。
    resumeResponseAfterInteraction(sessionId, sessionResponse.revision);
  }

  function disconnectSession(): void {
    sessionResponse.disconnect();
    sessionSelectionRequest += 1;
    historyLoad = undefined;
    pendingInteractionsBySession = {};
    busyInteractions = {};
  }

  const activeSession = $derived(sessions.find((item) => item.sessionId === activeSessionId));
  /** 官方规划投影：缺失表示这套组合没有规划模式，而不是"未开启"。 */
  const activePlan = $derived(planState(activeSession?.projections?.values));
  const planCards = $derived(planCardsFromHistory(historyEntries));
  /** 本轮变更摘要的坐标；摘要本身由官方 host 路由回读。 */
  const changesAnnouncement = $derived(latestChangesAnnouncement(historyEntries));
  const activeJobs = $derived(activeSessionId ? jobRoster[activeSessionId] ?? [] : []);
  /** 官方 agentTeam 投影：缺失表示这套组合没有团队能力，而不是"已关闭"。 */
  const teamBoard = $derived(readTeamBoard(activeSession?.projections?.values));
  /** 草稿里的疑似密钥数量：只提示，绝不改写用户原文。 */
  const draftSecretCount = $derived(maskSecrets(input).masked);
  const feedbackByMessage = $derived(Object.fromEntries(
    Object.values(feedbackItems).map((item) => [item.messageId, item.rating] as const),
  ) as Record<string, FeedbackRating>);
  const activePendingInteractions = $derived(pendingInteractionsBySession[activeSessionId]);
  const pendingApproval = $derived(activePendingInteractions?.approval);
  const pendingQuestion = $derived(activePendingInteractions?.question);
  const taskActive = $derived(sending || !!pendingApproval || !!pendingQuestion || continuingTask);
  const interactionBusy = $derived(Boolean(
    (pendingApproval && busyInteractions[pendingApproval.rpcId])
    || (pendingQuestion && busyInteractions[pendingQuestion.rpcId]),
  ));
  const questionAnswers = $derived(activePendingInteractions?.answers ?? {});
  const activeSessionHasError = $derived(activeSession ? sessionHealth(activeSession, !!sessionErrors[activeSession.sessionId]) === "error" : false);
  const workspaceName = $derived(workspacePath.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || t("app.noWorkspaceSelected"));
  const activeWorkspace = $derived(workspaces.find((workspace) => !!activeSessionId && workspace.sessionIds.includes(activeSessionId)));

  function projectNameForSession(session: SessionSummary): string {
    return workspaces.find((workspace) => workspace.sessionIds.includes(session.sessionId))?.title ?? "";
  }

  function memoryStatusLabel(): string {
    if (memoryStatus === "active") return t("settings.projectMemoryActive");
    if (memoryStatus === "requiresGit") return t("settings.projectMemoryRequiresGit");
    return t("settings.projectMemoryDisabled");
  }

  function memoryStatusHint(): string {
    if (memoryStatus === "active") return t("settings.projectMemoryActiveHint");
    if (memoryStatus === "requiresGit") return t("settings.projectMemoryRequiresGitHint");
    return t("settings.projectMemoryDisabledHint");
  }

 const filteredSessions = $derived.by(() => filterSessionsByQuery(sessions, sessionQuery, {
    title: (item) => sessionTitle(item),
    cwd: (item) => item.cwd,
  }));
  const archivedSessions = $derived(archivedSessionItems(allSessions, archivedSessionIds));
  const filteredArchivedSessions = $derived.by(() => {
    const query = settingsQuery.trim().toLowerCase();
    if (!query) return archivedSessions;
    return archivedSessions.filter((item) => `${sessionTitle(item)} ${item.cwd || ""} ${item.agentPreset || ""}`.toLowerCase().includes(query));
  });
  const quickPickerActions = $derived.by<QuickPickerEntry[]>(() => [
    { id: "action:new-session", kind: "action", title: t("session.newSession"), detail: t("quickPicker.newSessionDetail"), run: () => void createSession() },
    { id: "action:search", kind: "action", title: t("session.searchSessions"), detail: t("quickPicker.searchDetail"), run: () => {
      if (viewportWidth <= 760) mobileSidebarOpen = true;
      else sidebarCollapsed = false;
      void tick().then(() => sessionSearchInput?.focus());
    } },
    { id: "action:activity", kind: "action", title: activityOpen ? t("activity.close") : t("composer.expandActivity"), detail: t("quickPicker.activityDetail"), run: () => setActivityOpen(!activityOpen) },
    { id: "action:latest", kind: "action", title: t("quickPicker.latest"), detail: t("quickPicker.latestDetail"), run: () => {
      const scroller = document.querySelector<HTMLElement>(".message-scroll");
      if (scroller) scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
    } },
    { id: "action:settings", kind: "action", title: t("nav.settings"), detail: t("quickPicker.settingsDetail"), run: () => openManagement("settings") },
    { id: "action:shortcuts", kind: "action", title: t("shortcuts.title"), detail: t("quickPicker.shortcutsDetail"), run: () => { shortcutsOpen = true; } },
    { id: "action:terminal", kind: "action", title: t("terminal.openAction"), detail: t("quickPicker.terminalDetail"), run: () => { if (activeSessionId) terminalOpenSessionId = activeSessionId; } },
    { id: "action:team", kind: "action", title: t("team.openAction"), detail: t("quickPicker.teamDetail"), run: () => { if (activeSessionId) teamBoardOpen = true; } },
  ]);
  const quickPickerEntries = $derived.by<QuickPickerEntry[]>(() => {
    const query = quickPickerQuery.trim().toLowerCase();
    const matches = (title: string, detail = ""): boolean => !query || `${title} ${detail}`.toLowerCase().includes(query);
    const actions = quickPickerActions.filter((item) => matches(item.title, item.detail));
    const sessionEntries = sessions
      .filter((session) => matches(sessionTitle(session), `${session.cwd || ""} ${session.sessionId}`))
      .slice(0, 15)
      .map((session) => ({
        id: `session:${session.sessionId}`,
        kind: "session" as const,
        title: sessionTitle(session),
        detail: session.cwd || workspaceName,
        sessionId: session.sessionId,
      }));
    return [...actions, ...sessionEntries];
  });
  const quickPickerSelected = $derived(quickPickerEntries[quickPickerIndex]);
  $effect(() => {
    if (quickPickerIndex >= quickPickerEntries.length) quickPickerIndex = Math.max(0, quickPickerEntries.length - 1);
  });
  const currentGoal = $derived(goalProjection(activeSession));
  const selectedSubagent = $derived(subagents.find((item) => item.id === selectedSubagentId));
  const filteredSettingsNamespaces = $derived.by(() => {
    const query = settingsQuery.trim().toLowerCase();
    if (!query) return settingsNamespaces;
    return settingsNamespaces.filter((item) => `${item.ns} ${namespaceDisplayName(item.ns)}`.toLowerCase().includes(query));
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
  const recoveryReason = $derived(taskRecoveryReason(
    messages, todos, sending || !!pendingApproval || !!pendingQuestion, historyEntries,
  ));
  // 输出上限自动续写：按会话累计次数，新的人工提交会重置。
  let autoContinueAttempts = $state<Record<string, number>>({});
  // 只对实时观测到的轮次结束自动续写，切换回历史会话不会触发。
  let liveTurnEndSeq = $state<Record<string, number>>({});
  const autoContinueHandled = new Set<string>();
  const autoContinueAttempt = $derived(activeSessionId ? autoContinueAttempts[activeSessionId] ?? 0 : 0);
  const autoContinueExhausted = $derived(recoveryReason === "maxTokens" && autoContinueAttempt >= AUTO_CONTINUE_LIMIT);
  const outputTokens = $derived(latestOutputTokens(messages));
  const outputLimit = $derived(selectedModelInfo()?.maxTokens);
  const outputUsageLine = $derived.by(() => {
    if (recoveryReason !== "maxTokens" || !outputTokens) return "";
    return outputLimit
      ? t("activity.outputUsage", { used: outputTokens.toLocaleString(), limit: outputLimit.toLocaleString() })
      : t("activity.outputUsageNoLimit", { used: outputTokens.toLocaleString() });
  });
  const nearOutputLimit = $derived(taskActive && approachingOutputLimit(outputTokens, outputLimit));
  const currentTurnKind = $derived(turnEndKind(historyEntries.filter((entry) => {
    const userSeq = [...messages].reverse().find((message) => message.role === "user")?.seq;
    return userSeq === undefined || entry.event.seq > userSeq;
  })));
  const answerDelivered = $derived(deliveredAnswer(messages));
  // 答案已交付但后台仍有内部异常：只给不打断的轻提示，不显示整轮失败卡片（#340）。
  // 答案已交付时不再显示整轮失败卡片（#340）：内部异常一律降级为不打断的提示，
  // 且提示本身也只在真的出现异常时出现。
  const backgroundIssueNotice = $derived(answerDelivered
    && (!!recoveryReason || currentTurnKind === "error" || currentTurnKind === "protocol"));
  const lastFailedTool = $derived([...messages].reverse().find((message) => message.tool?.state === "error")?.tool);
  const recoveryDetail = $derived.by(() => {
    if (!recoveryReason) return "";
    for (let index = historyEntries.length - 1; index >= 0; index -= 1) {
      const entry = historyEntries[index];
      if (entry.event.type !== "turn/end") continue;
      const raw = turnEndError(entry.event);
      if (raw && raw !== "error") {
        const mapped = userFacingError(raw);
        if (mapped && mapped !== t("errors.generalError")) return mapped;
      }
      break;
    }
    return lastFailedTool ? toolErrorSummary(lastFailedTool.result) : "";
  });
  // 命中输出上限时自动续写：同一轮（会话 + turn/end 序号）只触发一次。
  $effect(() => {
    const sessionId = activeSessionId;
    if (!sessionId || !shouldAutoContinue(recoveryReason, {
      sending,
      continuing: continuingTask,
      attempts: autoContinueAttempts[sessionId] ?? 0,
      hasPendingInteraction: !!pendingApproval || !!pendingQuestion,
      connectionError: !!runtimeConnectionError,
      sessionRunning: !!activeSession?.running,
    })) return;
    const turnSeq = latestTurnEndSeq(historyEntries);
    if (turnSeq === undefined || liveTurnEndSeq[sessionId] !== turnSeq) return;
    const key = `${sessionId}:${turnSeq}`;
    if (autoContinueHandled.has(key)) return;
    autoContinueHandled.add(key);
    autoContinueAttempts = { ...autoContinueAttempts, [sessionId]: (autoContinueAttempts[sessionId] ?? 0) + 1 };
    // 等终态事件落定后再续写，避免在 phase 仍为 running 时被 canSubmit 拒绝。
    setTimeout(() => void retryInterruptedTask(), 250);
  });
  // 首轮工具调用解析失败时自动重试一次：只在“没有交付任何答案、也没有待人工交互”时生效（#334）。
  // 每个会话只允许一次，避免「失败 → 重试 → 再失败」的无限循环；人工提交后重置。
  let protocolRetriedSessions = $state<Record<string, boolean>>({});
  let protocolRetryTimer: ReturnType<typeof setTimeout> | undefined;
  // 标记本次 submit 来自系统自动重试（非响应式：只影响一次调用的副作用）。
  let automaticRetrySubmission = false;
  $effect(() => {
    const sessionId = activeSessionId;
    if (!sessionId || recoveryReason !== "protocol" || answerDelivered) return;
    if (protocolRetriedSessions[sessionId]) return;
    if (sending || continuingTask || pendingApproval || pendingQuestion || runtimeConnectionError) return;
    if (!lastFailedPrompt || lastFailedPrompt.sessionId !== sessionId) return;
    const turnSeq = latestTurnEndSeq(historyEntries);
    if (turnSeq === undefined || liveTurnEndSeq[sessionId] !== turnSeq) return;
    protocolRetriedSessions = { ...protocolRetriedSessions, [sessionId]: true };
    clearTimeout(protocolRetryTimer);
    protocolRetryTimer = setTimeout(() => {
      protocolRetryTimer = undefined;
      // 定时器兜底复核：会话已切换、已交付答案或已不再需要重试时直接放弃。
      if (activeSessionId !== sessionId) return;
      if (lastFailedPrompt?.sessionId !== sessionId || recoveryReason !== "protocol" || answerDelivered) return;
      void retryLastPrompt({ automatic: true });
    }, 250);
  });
  $effect(() => () => clearTimeout(protocolRetryTimer));
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
  const authFailure = $derived(!!classifyAuthFailure(sessionLoadError || runtimeError));
  // 只有模型路由的认证失败才提示「模型凭据」；外部服务/知识库的 401 由各自文案说明。
  const providerAuthFailure = $derived(authFailure && activeAuthFailureKind === "provider" && !!runtimeError.trim());
  // 内置凭据在本次运行里没有被用户手工改过，才允许自动恢复。
  const canAutoRepairBundledCredential = $derived(providerAuthFailure
    && selectedProviderCredentialRef() === "XG_GOMODEL_API_KEY"
    && !userSavedCredentialRefs.has("XG_GOMODEL_API_KEY")
    && !!window.voltDesktop?.resetBundledModelCredential);
  const authFailureCredentialRef = $derived(selectedProviderCredentialRef());
  const authFailureDetail = $derived.by(() => {
    if (!providerAuthFailure) return "";
    const { provider } = parseModelSelectionKey(selectedModel);
    const providerName = displayProviderName(provider, modelGroups.find((group) => group.id === provider)?.name);
    const credential = authFailureCredentialRef
      ? `${authFailureCredentialRef}（${credentialSummary(authFailureCredentialRef)}）`
      : t("settings.notConfigured");
    return t("errors.authFailureContext", {
      model: displayModelSelection(selectedModel),
      provider: providerName || provider || "—",
      credential,
    });
  });
  const authFailureHint = $derived(providerAuthFailure
    ? authFailureCredentialRef === "XG_GOMODEL_API_KEY"
      ? t("errors.authFailureBuiltinHint")
      : t("errors.authFailureCustomHint")
    : "");
  const builtinFallbackModel = $derived.by(() => {
    const group = modelGroups.find((item) => item.id === "xg-gomodel");
    return group?.models.find((item) => item.id === "vlm") || group?.models[0];
  });
  const canSwitchToBuiltinModel = $derived(
    !!activeSessionId
      && xgGatewayCredentialReady
      && !!builtinFallbackModel
      && parseModelSelectionKey(selectedModel).provider !== "xg-gomodel"
      && /401|API Key|认证失败|authentication|unauthorized/iu.test(runtimeError),
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
    if (activityOpen) void ensureActivityPanel();
    armStartupTimers();
    unsubscribeRuntimeReady = window.voltDesktop?.onRuntimeReady(() => void bootstrap());
    // 深链只把配置包送进"配置迁移"卡片等用户确认，不在这里执行任何写入（#ACB）。
    const openAgentConfigLink = (link: string) => {
      if (!link) return;
      agentConfigIncomingLink = link;
      agentConfigIncomingLinkToken += 1;
      // 卡片自己会显示预览和"确认导入"，所以这里不再另发一条提示（settings 分支
      // 也没有 managementNotice 的位置，写了也看不见）。
      closeMobileSidebar(false);
      view = "settings";
      switchManagementTab("settings");
      switchSettingsSection("advanced");
    };
    // 主进程只发"有新链接"的提示，真正的数据从队列里取：推送早于订阅、连续多条、
    // 渲染层重载三种情况都由同一个队列兜住。多条时只处理最后一条 —— 用户最后点的那次
    // 才是他的意图（更早的仍然留在队列里，下次挂载还能取到）。
    // 串行化：通知与挂载时的补取可能同时触发，两个 drain 并发会重复 ack 同一批条目。
    let drainingLinks = Promise.resolve();
    const drainAgentConfigLinks = (): Promise<void> => {
      drainingLinks = drainingLinks.then(async () => {
        try {
          const links = await window.voltDesktop?.pendingAgentConfigLinks?.() ?? [];
          // 按到达顺序逐条处理并逐条确认：界面最后停在最新一条上，早先的条目也不会丢。
          for (const link of links) {
            openAgentConfigLink(link);
            await window.voltDesktop?.ackAgentConfigLink?.(link);
          }
        } catch {
          // 取不到就当没有；深链永远不应该让界面报错。
        }
      });
      return drainingLinks;
    };
    unsubscribeAgentConfigLink = window.voltDesktop?.onAgentConfigLink?.(() => void drainAgentConfigLinks());
    void drainAgentConfigLinks();
    void bootstrap();
    return () => {
      refreshDisposed = true;
      clearStartupTimers();
      clearRefreshTimer();
      sessionResponse.dispose();
      unsubscribeRuntimeError?.();
      unsubscribeRuntimeReady?.();
      unsubscribeAgentConfigLink?.();
      unsubscribeDshFrames?.();
      clearAttachmentFiles();
    };
  });

  function readUiCustomization(): UiCustomizationState {
    try {
      const stored = window.localStorage.getItem("voltui.ui-customization");
      if (!stored) return DEFAULT_UI_CUSTOMIZATION;
      return restoreUiCustomization(stored);
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
    if (ConversationTranscript || conversationTranscriptImport) {
      await conversationTranscriptImport;
      return;
    }
    conversationTranscriptImport = import("$components/ConversationTranscript.svelte")
      .then((module) => {
        ConversationTranscript = module.default;
      })
      .finally(() => {
        conversationTranscriptImport = undefined;
      });
    try {
      await conversationTranscriptImport;
    } catch (error: unknown) {
      runtimeError = userFacingError(error);
    }
  }

  async function ensureActivityPanel(): Promise<void> {
    if (ActivityPanel || activityPanelImport) {
      await activityPanelImport;
      return;
    }
    activityPanelImport = import("$components/ActivityPanel.svelte")
      .then((module) => {
        ActivityPanel = module.default;
      })
      .finally(() => {
        activityPanelImport = undefined;
      });
    try {
      await activityPanelImport;
    } catch (error: unknown) {
      runtimeError = userFacingError(error);
    }
  }

  // 每个组件使用独立 import 语句：打包器会为每个动态分支生成各自的 CSS 预加载依赖。
  // 不要合并成条件表达式里的单个 import()，否则只会保留最后一个分支的样式依赖。
  function importManagementComponent(name: ManagementComponentName): Promise<void> {
    switch (name) {
      case "provider":
        return import("$components/ProviderWorkbench.svelte").then((module) => { ProviderWorkbenchComponent = module.default; });
      case "plugin":
        return import("$components/PluginInventoryView.svelte").then((module) => { PluginInventoryComponent = module.default; });
      case "extensions":
        return import("$components/ExtensionCapabilities.svelte").then((module) => { ExtensionCapabilitiesComponent = module.default; });
      case "mcp":
        return import("$components/McpInventoryView.svelte").then((module) => { McpInventoryComponent = module.default; });
      case "externalKnowledge":
        return import("$components/ExternalKnowledgeSources.svelte").then((module) => { ExternalKnowledgeSourcesComponent = module.default; });
      case "knowledgeSkill":
        return import("$components/KnowledgeSkillList.svelte").then((module) => { KnowledgeSkillListComponent = module.default; });
      case "knowledgeScope":
        return import("$components/KnowledgeScopePicker.svelte").then((module) => { KnowledgeScopePickerComponent = module.default; });
      case "skillStore":
        return import("$components/SkillStoreView.svelte").then((module) => { SkillStoreComponent = module.default; });
      case "automation":
        return import("$components/AutomationPanel.svelte").then((module) => { AutomationPanelComponent = module.default; });
    }
  }

  async function ensureManagementComponents(names: readonly ManagementComponentName[]): Promise<void> {
    const imports = names.map((name) => {
      const pending = managementComponentImports[name];
      if (pending) return pending;
      if (managementComponentErrors[name]) {
        const { [name]: _cleared, ...remaining } = managementComponentErrors;
        managementComponentErrors = remaining;
      }
      const next = importManagementComponent(name).catch((error: unknown) => {
        managementComponentErrors = { ...managementComponentErrors, [name]: userFacingError(error) };
        throw error;
      });
      const tracked = next.finally(() => {
        const current = managementComponentImports[name];
        if (current === tracked) {
          const remaining = { ...managementComponentImports };
          delete remaining[name];
          managementComponentImports = remaining;
        }
      });
      managementComponentImports[name] = tracked;
      return tracked;
    });
    try {
      await Promise.all(imports);
    } catch (error: unknown) {
      runtimeError = userFacingError(error);
    }
  }

  function applyRuntimeCustomization(value: UiCustomizationState): void {
    sidebarCollapsed = value.sidebar === "collapsed";
    activityOpen = value.activity === "visible";
    const fontSize = FONT_SIZE_VALUES[value.fontSize];
    const root = document.documentElement;
    root.style.setProperty("--font-sans", FONT_FAMILY_STACKS[value.fontFamily]);
    root.style.setProperty("--font-mono", CODE_FONT_FAMILY_STACKS[value.codeFontFamily]);
    root.style.setProperty("--ui-font-size", fontSize.base);
    root.style.setProperty("--ui-message-font-size", fontSize.message);
    root.style.setProperty("--ui-code-font-size", fontSize.code);
  }

  function updateCustomization(patch: Omit<UiCustomizationPatch, "schemaVersion">): void {
    customizationHistory = [...customizationHistory.slice(-9), customization];
    customization = applyUiCustomization(customization, { schemaVersion: UI_CUSTOMIZATION_SCHEMA, ...patch });
    persistUiCustomization(customization);
    applyRuntimeCustomization(customization);
    customizationNotice = t("customization.appearanceApplied");
  }

  function setSidebarCollapsed(collapsed: boolean): void {
    sidebarCollapsed = collapsed;
    customization = { ...customization, sidebar: collapsed ? "collapsed" : "expanded" };
    persistUiCustomization(customization);
  }

  function toggleSidebar(): void {
    if (view === "settings") return;
    if (viewportWidth <= 760) {
      mobileSidebarOpen = !mobileSidebarOpen;
      if (mobileSidebarOpen) void tick().then(() => document.getElementById("sidebar-toggle")?.focus());
    } else {
      setSidebarCollapsed(!sidebarCollapsed);
    }
  }

  function closeMobileSidebar(restoreFocus = true): void {
    if (!mobileSidebarOpen) return;
    mobileSidebarOpen = false;
    if (restoreFocus) void tick().then(() => document.getElementById("sidebar-toggle")?.focus());
  }

  function setActivityOpen(open: boolean): void {
    if (open && !activityOpen) {
      activityRestoreElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    activityOpen = open;
    if (open) void ensureActivityPanel();
    customization = { ...customization, activity: open ? "visible" : "hidden" };
    persistUiCustomization(customization);
    if (!open) {
      void tick().then(() => {
        const target = activityRestoreElement?.isConnected
          ? activityRestoreElement
          : document.getElementById("activity-toggle");
        activityRestoreElement = null;
        target?.focus();
      });
    }
  }

  function handleGlobalKeydown(event: KeyboardEvent): void {
    if (initializingSession) return;
    if (confirmingSessionId) return;
    if (event.defaultPrevented) return;
    const modifier = event.ctrlKey || event.metaKey;
    if (quickPickerOpen) {
      if (!event.isComposing) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeQuickPicker();
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          if (quickPickerEntries.length > 0) {
            const delta = event.key === "ArrowDown" ? 1 : -1;
            quickPickerIndex = (quickPickerIndex + delta + quickPickerEntries.length) % quickPickerEntries.length;
          }
        } else if (event.key === "Enter") {
          event.preventDefault();
          runQuickPickerItem();
        } else if (modifier && !event.shiftKey && event.key.toLowerCase() === "k") {
          event.preventDefault();
          closeQuickPicker();
        }
      }
      return;
    }
    if (event.isComposing) return;
    const navigationDirection = sessionNavigationShortcut(event);
    if (navigationDirection && (!event.altKey || !isEditableShortcutTarget(event.target))) {
      const target = sessionNavigationTarget(filteredSessions.map((session) => session.sessionId), activeSessionId, navigationDirection);
      if (target) {
        event.preventDefault();
        void selectSession(target);
        return;
      }
    }
    const historyJump = historyJumpShortcut(event);
    if (historyJump) {
      const scroller = document.querySelector<HTMLElement>(".message-scroll");
      if (scroller) {
        event.preventDefault();
        if (historyJump === "top") void jumpToHistoryTop();
        else scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
        return;
      }
    }
    if (modifier && !event.altKey && (event.key.toLowerCase() === "k" || (event.shiftKey && event.key.toLowerCase() === "p"))) {
      event.preventDefault();
      openQuickPicker();
      return;
    }
    if (modifier && event.key.toLowerCase() === "n") {
      event.preventDefault();
      void createSession();
      return;
    }
    if (modifier && event.key.toLowerCase() === "b") {
      event.preventDefault();
      toggleSidebar();
      return;
    }
    if (event.key === "Escape") {
      // 浮层优先：面板打开时 Escape 只关面板，绝不能顺带取消正在跑的任务。
      if (shortcutsOpen) {
        event.preventDefault();
        shortcutsOpen = false;
        return;
      }
      if (document.getElementById("workbench-menu")?.matches(":popover-open")) return;
      if (taskActive) {
        event.preventDefault();
        void cancel();
        return;
      }
      if (mobileSidebarOpen) closeMobileSidebar();
      else if (activityOpen) setActivityOpen(false);
    }
  }

  function openQuickPicker(): void {
    quickPickerOpen = true;
    quickPickerQuery = "";
    quickPickerIndex = 0;
    void tick().then(() => {
      const activeIndex = quickPickerEntries.findIndex((item) => item.sessionId === activeSessionId);
      if (activeIndex >= 0) quickPickerIndex = activeIndex;
    });
  }

  function closeQuickPicker(): void {
    quickPickerOpen = false;
  }

  function updateQuickPickerQuery(value: string): void {
    quickPickerQuery = value;
    quickPickerIndex = 0;
  }

  function runQuickPickerItem(item: QuickPickerEntry | undefined = quickPickerSelected): void {
    if (!item) return;
    quickPickerOpen = false;
    if (item.kind === "session" && item.sessionId) void selectSession(item.sessionId);
    else item.run?.();
  }

  function closeWorkbenchMenu(): void {
    document.getElementById("workbench-menu")?.hidePopover();
    document.getElementById("activity-toggle")?.focus();
  }

  function focusComposer(): void {
    void tick().then(() => {
      document.querySelector<HTMLTextAreaElement>(".prompt-input-composer textarea")?.focus();
    });
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
   // 用户没要界面（例如只是让读一段资料），就不把回答里的提案渲染成卡片（#366）。
   if (!lastUserPromptText || !isSurfaceGenerationIntent(lastUserPromptText)) return;
   const proposal = resolveVoltSurfaceSegments(message.text, !!message.pending)
     .find((segment) => segment.kind === "proposal");
   if (!proposal || proposal.kind !== "proposal") return;
   surfaceDraft = { summary: proposal.summary, spec: proposal.spec };
   surfaceSourceId = message.id;
   customizationOpen = true;
    surfaceNotice = t("surface.detectedNotice");
 }

 /**
  * 卡片选择转成一条普通用户消息，走既有提交路径。
  * 回合进行中或会话不可提交时不排队，避免悄悄插入一条消息。
  */
 function handleSurfaceInteraction(event: SurfaceInteractionEvent, spec: SurfaceSpec): void {
   if (sending || sessionResponse.loading || !sessionResponse.canSubmit) return;
   const text = buildSurfaceFollowUpMessage(event, spec, t);
   void submit(text, [], [], activeSessionId, { skipSurfaceContract: true })
     .catch((error) => { runtimeError = userFacingError(error); });
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
    if (networkModeBusy) return;
    if (client && unsubscribeDshFrames && !runtimeConnectionError) {
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
      const info = await withTimeout(shell.bootstrap(), 10_000, t("app.startupShellTimeout"));
      if (info.productName) customProductName = info.productName;
      appVersion = info.version;
      desktopFeatures = info.features ?? { permanentSessionDeletion: false, updateChecks: false };
      networkMode = info.networkMode;
      workspacePath = info.workspace;
      bootstrapWorkspace = info.workspace;
      defaultChatDirectory = readDefaultChatDirectory() || info.workspace;
      workspaceWarning = info.workspaceWarning ?? "";
      memoryStatus = info.memoryStatus ?? "disabled";
      if (info.capabilities) capabilities = info.capabilities;
      unsubscribeRuntimeError?.();
      unsubscribeRuntimeError = shell.onRuntimeError((message) => {
        if (networkModeBusy) return;
        runtimeConnectionError = message ? userFacingError(message) : "";
        runtimeError = runtimeConnectionError;
        if (message) {
          disconnectSession();
          clearRefreshTimer();
          unsubscribeDshFrames?.();
          unsubscribeDshFrames = undefined;
          clearStartupTimers();
          loading = false;
        }
      });
      const status = startupState(info, Date.now());
      if (status === "waiting") return;
      if (status === "failed" || status === "timeout") {
        clearStartupTimers();
        runtimeConnectionError = info.startupError ? userFacingError(info.startupError) : t("app.startupRetryTimeout");
        runtimeError = runtimeConnectionError;
        return;
      }
      clearStartupTimers();
      runtimeConnectionError = "";
      runtimeError = "";
      unsubscribeDshFrames?.();
      clearRefreshTimer();
      client = new DshClient(shell);
      unsubscribeDshFrames = client.subscribe(handleFrame, (error) => {
        disconnectSession();
        runtimeConnectionError = userFacingError(error);
        runtimeError = runtimeConnectionError;
      });
      // 先展示工作台，恢复会话期间暂缓交互，避免历史覆盖新操作。
      initializingSession = true;
      loading = false;
      await refresh(true);
      if (!runtimeConnectionError && !activeSessionId && sessions.length === 0 && workspacePath && !workspaceWarning) {
        await createSession(defaultChatDirectory || workspacePath, true);
      }
      if (networkMode === "external") void checkForUpdate(false);
    } catch (error) {
      clearStartupTimers();
      runtimeConnectionError = userFacingError(error);
      runtimeError = runtimeConnectionError;
    } finally {
      const queuedRefresh = refreshQueued;
      refreshQueued = false;
      initializingSession = false;
      loading = !client && !runtimeConnectionError;
      bootstrapInFlight = false;
      if (queuedRefresh && client && !runtimeConnectionError) void refresh();
      // 设置页可能在 bootstrap 完成前就已打开（例如冷启动直接收到 agentconfig 深链），
      // 那时 refreshManagement 因没有 client 直接返回了，这里补一次，否则设置页
      // 会一直拿着空的 providers/settings 去算配置迁移计划。
      if (client && view === "settings") void refreshManagement();
      if (bootstrapQueued) {
        bootstrapQueued = false;
        void bootstrap();
      }
    }
  }

  async function retryRuntime(): Promise<void> {
    const shell = window.voltDesktop;
    if (!shell || bootstrapInFlight || runtimeRetrying) return;
    runtimeRetrying = true;
    loading = true;
    runtimeConnectionError = "";
    runtimeError = "";
    disconnectSession();
    unsubscribeDshFrames?.();
    unsubscribeDshFrames = undefined;
    clearRefreshTimer();
    client = undefined;
    armStartupTimers();
    try {
      await withTimeout(shell.retryRuntime(), 480_000, t("app.startupRetryTimeout"));
      await bootstrap();
    } catch (error) {
      clearStartupTimers();
      runtimeConnectionError = userFacingError(error);
      runtimeError = runtimeConnectionError;
      loading = false;
    } finally {
      runtimeRetrying = false;
    }
  }

  async function toggleCapability(key: DesktopCapabilityKey): Promise<void> {
    const shell = window.voltDesktop;
    if (!shell || capabilitiesBusy || networkModeBusy || bootstrapInFlight || runtimeRetrying) return;
    const next = !capabilities[key];
    capabilitiesBusy = true;
    managementError = "";
    managementNotice = "";
    runtimeConnectionError = "";
    runtimeError = "";
    clearStartupTimers();
    disconnectSession();
    unsubscribeDshFrames?.();
    unsubscribeDshFrames = undefined;
    clearRefreshTimer();
    client = undefined;
    loading = true;
    try {
      const info = await withTimeout(shell.setCapabilities({ [key]: next }), 480_000, t("app.startupRetryTimeout"));
      if (info.capabilities) capabilities = info.capabilities;
      if (info.startupError) throw new Error(info.startupError);
      capabilitiesBusy = false;
      armStartupTimers();
      await bootstrap();
      if (!runtimeConnectionError) managementNotice = t("settings.capabilityChanged");
    } catch (error) {
      clearStartupTimers();
      managementError = userFacingError(error);
      runtimeConnectionError = managementError;
      runtimeError = managementError;
      loading = false;
    } finally {
      capabilitiesBusy = false;
    }
  }

  async function changeNetworkMode(nextMode: NetworkMode): Promise<void> {
    const shell = window.voltDesktop;
    if (!shell || nextMode === networkMode || networkModeBusy || bootstrapInFlight || runtimeRetrying) return;
    if (nextMode === "external" && !window.confirm(t("settings.externalModeConfirm"))) return;
    networkModeBusy = true;
    managementError = "";
    managementNotice = "";
    runtimeConnectionError = "";
    runtimeError = "";
    clearStartupTimers();
    disconnectSession();
    unsubscribeDshFrames?.();
    unsubscribeDshFrames = undefined;
    clearRefreshTimer();
    client = undefined;
    loading = true;
    try {
      const info = await withTimeout(shell.setNetworkMode(nextMode), 480_000, t("app.startupRetryTimeout"));
      networkMode = info.networkMode;
      if (info.startupError) throw new Error(info.startupError);
      networkModeBusy = false;
      armStartupTimers();
      await bootstrap();
      if (!runtimeConnectionError) managementNotice = t("settings.networkModeChanged");
    } catch (error) {
      clearStartupTimers();
      managementError = userFacingError(error);
      runtimeConnectionError = managementError;
      runtimeError = managementError;
      loading = false;
    } finally {
      networkModeBusy = false;
    }
  }

  async function checkForUpdate(showError = true): Promise<void> {
    const shell = window.voltDesktop;
    if (!shell || updateChecking || !desktopFeatures.updateChecks) return;
    updateChecking = true;
    updateError = "";
    updateCheck = undefined;
    if (showError) managementNotice = "";
    if (showError) managementError = "";
    try {
      updateCheck = await shell.checkForUpdate();
      if (showError) {
        managementNotice = updateCheck.status === "available"
          ? t("updates.availableNotice", { version: updateCheck.latestVersion })
          : t("updates.currentNotice");
      }
    } catch (error) {
      if (showError) updateError = userFacingError(error);
    } finally {
      updateChecking = false;
    }
  }

  async function openUpdateDownload(): Promise<void> {
    if (!updateCheck?.downloadUrl) return;
    try {
      await window.voltDesktop?.openExternal(updateCheck.downloadUrl);
    } catch (error) {
      managementError = userFacingError(error);
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

  async function refresh(restoreActiveSession = false): Promise<void> {
    if (!client) return;
    const refreshClient = client;
    const selectionRequest = sessionSelectionRequest;
    const responseRevision = sessionResponse.revision;
    const eventRevision = sessionEventRevision;
    const activeSessionIdAtStart = activeSessionId;
    try {
      const [workspaceResult, sessionResult] = await Promise.all([refreshClient.listWorkspaces(), refreshClient.listSessions()]);
      if (client !== refreshClient || selectionRequest !== sessionSelectionRequest || activeSessionId !== activeSessionIdAtStart || runtimeConnectionError) return;
      if (responseRevision !== sessionResponse.revision) return;
      workspaces = workspaceResult.items;
      archivedSessionIds = workspaceResult.archivedSessionIds;
      allSessions = sessionResult.items;
      const retainedSessionIds = new Set(sessionResult.items.map((session) => session.sessionId));
      for (const sessionId of Object.keys(attachmentFilesBySession)) {
        if (!retainedSessionIds.has(sessionId) || archivedSessionIds.includes(sessionId)) clearAttachmentFiles(sessionId);
      }
      const draftSessionIds = [...new Set([...Object.keys(sessionDrafts), ...Object.keys(draftFilesBySession)])]
        .filter((sessionId) => sessionDrafts[sessionId]?.trim() || draftFilesBySession[sessionId]?.length);
      const retainedBlankSessionId = activeSessionId
        || sessionResult.items.find((session) => session.blank && !archivedSessionIds.includes(session.sessionId))?.sessionId
        || "";
      sessions = visibleSessions(sessionResult.items, archivedSessionIds, retainedBlankSessionId, draftSessionIds);
      pruneSessionCaches(sessions.map((item) => item.sessionId));
      const active = sessions.find((item) => item.sessionId === activeSessionIdAtStart);
      if (active) {
        workspacePath = active.cwd ?? "";
        workspaceWarning = active.workspaceError ? userFacingError(active.workspaceError) : "";
        if (eventRevision === sessionEventRevision) sessionResponse.reconcile(active.running);
      }
      if (activeSessionIdAtStart && !sessions.some((item) => item.sessionId === activeSessionIdAtStart)) {
        await selectSession(sessions[0]?.sessionId || "");
      } else if (!activeSessionIdAtStart && sessions[0]) {
        await selectSession(sessions[0].sessionId);
      } else if (restoreActiveSession && activeSessionIdAtStart) {
        await selectSession(activeSessionIdAtStart);
      }
    } catch (error) {
      if (client !== refreshClient || selectionRequest !== sessionSelectionRequest || activeSessionId !== activeSessionIdAtStart) return;
      if (responseRevision !== sessionResponse.revision) return;
      disconnectSession();
      runtimeError = userFacingError(error);
      runtimeConnectionError = runtimeError;
    }
  }

  function requestRefresh(): void {
    if (!client || runtimeConnectionError || refreshDisposed) return;
    if (initializingSession) {
      refreshQueued = true;
      return;
    }
    if (eventRefreshFlight?.client === client) {
      eventRefreshFlight.pending = true;
      return;
    }
    if (refreshTimer) return;
    const scheduledClient = client;
    refreshTimer = setTimeout(async () => {
      refreshTimer = undefined;
      if (client !== scheduledClient || runtimeConnectionError || refreshDisposed) return;
      if (initializingSession) {
        refreshQueued = true;
        return;
      }
      const flight = { client: scheduledClient, pending: false };
      eventRefreshFlight = flight;
      try {
        await refresh();
      } finally {
        if (eventRefreshFlight === flight) eventRefreshFlight = undefined;
        if (flight.pending && client === scheduledClient) requestRefresh();
      }
    }, 100);
  }

  async function refreshManagement(): Promise<void> {
    if (!client) return;
    const managementClient = client;
    const managementSession = activeSessionId;
    const requestedTab = managementTab;
    const requestedView = view;
    const refreshRequest = ++managementRefreshRequest;
    const selectionRequest = sessionSelectionRequest;
    let loadError = "";
    const failedLoad = (error: unknown): undefined => { loadError = userFacingError(error); return undefined; };
    const needs = {
      settings: managementTab === "settings" || managementTab === "runtime" || managementTab === "models" || managementTab === "knowledge",
      skills: managementTab === "knowledge" && !!activeSessionId,
      agents: managementTab === "agents",
      providers: managementTab === "models" || managementTab === "settings" || managementTab === "runtime",
      subagents: (managementTab === "subagents" || managementTab === "runtime") && !!activeSessionId,
      catalog: managementTab === "models",
      host: managementTab === "runtime",
      plugins: managementTab === "plugins" || managementTab === "mcp" || managementTab === "knowledge" || managementTab === "extensions",
    };
    const [settingsResult, skillResult, agentResult, providerResult, subagentResult, catalogResult, hostResult, pluginResult] = await Promise.all([
      needs.settings ? client.describeSettings().catch(failedLoad) : Promise.resolve(undefined),
      needs.skills ? client.listSkills(activeSessionId).catch(() => ({ skills: [] })) : Promise.resolve(undefined),
      needs.agents ? client.listAgentPresets().catch(() => ({ presets: [], authorable: false, hasDocument: false })) : Promise.resolve(undefined),
      needs.providers ? client.listProviders().catch(failedLoad) : Promise.resolve(undefined),
      needs.subagents ? client.listSubagents(activeSessionId).catch(failedLoad) : Promise.resolve(undefined),
      needs.catalog ? client.listModelCatalog().catch(failedLoad) : Promise.resolve(undefined),
      needs.host ? client.describeHost().catch(() => undefined) : Promise.resolve(undefined),
      needs.plugins ? client.listPluginInventory().catch(() => ({ entries: [] })) : Promise.resolve(undefined),
    ]);
    if (runtimeConnectionError || client !== managementClient) return;
    if (refreshRequest !== managementRefreshRequest || selectionRequest !== sessionSelectionRequest || managementSession !== activeSessionId || requestedTab !== managementTab || requestedView !== view) return;
    const describedCredentials = settingsResult
      ? await managementClient.describeCredentials(collectCredentialRefs(settingsResult.namespaces, providerResult?.providers ?? [])).catch(failedLoad)
      : undefined;
    if (runtimeConnectionError || client !== managementClient || refreshRequest !== managementRefreshRequest || selectionRequest !== sessionSelectionRequest || managementSession !== activeSessionId || requestedTab !== managementTab || requestedView !== view) return;
    managementError = loadError;
    if (settingsResult) {
      settingsWritable = settingsResult.writable;
      settingsHasDocument = settingsResult.hasDocument;
      settingsNamespaces = settingsResult.namespaces;
      if (!selectedSettingsNs || !settingsNamespaces.some((item) => item.ns === selectedSettingsNs)) {
        selectedSettingsNs = settingsNamespaces[0]?.ns || "";
        settingsDraft = JSON.stringify(settingsNamespaces[0]?.user || {}, null, 2);
      }
      credentialRefs = collectCredentialRefs(settingsNamespaces, providerResult?.providers ?? providers);
      if (describedCredentials) credentials = describedCredentials.credentials;
      if (managementTab === "knowledge") {
        const weknora = settingsNamespaces.find((item) => item.ns === "weknora")?.value as Record<string, unknown> | undefined;
        const weknoraPlugin = (pluginResult?.entries ?? pluginInventory).find((item) => item.moduleName === "@wxg-prc-cpg/dsh-weknora");
        const keyRef = typeof weknora?.apiKeyRef === "string" && weknora.apiKeyRef ? weknora.apiKeyRef : "WEKNORA_API_KEY";
        const keyReady = describedCredentials?.credentials?.[keyRef]?.configured === true;
        const endpoint = typeof weknora?.baseUrl === "string" ? weknora.baseUrl.trim() : "";
        const enabled = weknora?.enabled === true;
        externalKnowledgeState = externalKnowledgeStateFrom({
          namespace: weknora,
          plugin: weknoraPlugin,
          credential: describedCredentials?.credentials?.[keyRef],
          pluginLookupFailed: !pluginResult,
          credentialLookupFailed: !describedCredentials,
        });
        if (externalKnowledgeState === "unavailable" && knowledgeScope !== "local") knowledgeScope = "local";
      }
    }
    if (skillResult) skills = skillResult.skills;
    if (agentResult) {
      agentPresets = agentResult.presets;
      agentAuthorable = agentResult.authorable;
      agentHasDocument = agentResult.hasDocument;
    }
    if (providerResult) providers = providerResult.providers;
    if (catalogResult) {
      catalogGroups = catalogResult.groups;
      catalogFailures = catalogResult.failures;
      modelGroups = enrichModelGroups(catalogResult.groups, settingsNamespaces);
    }
    if (needs.catalog) modelLoadError = loadError || (catalogResult?.failures.length ? t("models.loadFailed") : "");
    if (hostResult) hostInfo = hostResult;
    if (!loadError) runtimeLastSyncedAt = Date.now();
    if (pluginResult) pluginInventory = pluginResult.entries;
    if (subagentResult) {
      subagents = subagentResult.entries;
      subagentParentAvailable = subagentResult.parentAvailable;
      if (!selectedSubagentId || !subagents.some((item) => item.id === selectedSubagentId)) selectedSubagentId = subagents.find((item) => item.kind === "child")?.id || "";
    }
  }

  const DEFAULT_CHAT_DIRECTORY_STORAGE_KEY = "volt_default_chat_directory";

  function readDefaultChatDirectory(): string {
    try {
      return localStorage.getItem(DEFAULT_CHAT_DIRECTORY_STORAGE_KEY)?.trim() || "";
    } catch {
      return "";
    }
  }

  function persistDefaultChatDirectory(path: string): void {
    try {
      if (path) localStorage.setItem(DEFAULT_CHAT_DIRECTORY_STORAGE_KEY, path);
      else localStorage.removeItem(DEFAULT_CHAT_DIRECTORY_STORAGE_KEY);
    } catch {
      // 本地偏好不可写时保留当前进程内的选择。
    }
  }

  function startChatSession(): void {
    newSessionDialogOpen = false;
    void createSession();
  }

  async function startProjectSession(workspace: Workspace): Promise<void> {
    newSessionDialogOpen = false;
    await createSession({ workspaceId: workspace.workspaceId });
  }

  async function pickProjectDirectoryForSession(): Promise<void> {
    if (!client || newSessionBusy) return;
    newSessionBusy = true;
    try {
      const selected = await window.voltDesktop?.pickWorkspace();
      if (!selected) return;
      const result = await client.createWorkspace(selected);
      await refresh();
      newSessionDialogOpen = false;
      await createSession({ workspaceId: result.workspace.workspaceId });
    } catch (error) {
      runtimeError = userFacingError(error);
      newSessionDialogOpen = false;
    } finally {
      newSessionBusy = false;
    }
  }

  async function pickDefaultChatDirectory(): Promise<void> {
    try {
      const selected = await window.voltDesktop?.pickWorkspace();
      if (!selected) return;
      defaultChatDirectory = selected;
      persistDefaultChatDirectory(selected);
      managementNotice = t("settings.defaultChatDirectorySaved");
    } catch (error) {
      managementError = userFacingError(error);
    }
  }

  function resetDefaultChatDirectory(): void {
    defaultChatDirectory = bootstrapWorkspace;
    persistDefaultChatDirectory("");
    managementNotice = t("settings.defaultChatDirectoryReset");
  }

  async function createSession(input?: string | { cwd?: string; workspaceId?: string }, allowDuringInitialization = false): Promise<void> {
    if (!client || (initializingSession && !allowDuringInitialization)) return;
    closeMobileSidebar();
    const requestedFromView = view;
    const requestedFromSelection = sessionSelectionRequest;
    const workspaceRequest = ++workspaceSelectionRequest;
    const chatDirectory = typeof defaultChatDirectory === "string" && defaultChatDirectory
      ? defaultChatDirectory
      : typeof workspacePath === "string" ? workspacePath : "";
    const request = typeof input === "string" ? { cwd: input } : input ?? (chatDirectory ? { cwd: chatDirectory } : {});
    try {
      const created = await client.createSession(request);
      if (!allowDuringInitialization) {
        recordSessionOperation("created", created.sessionId, (created.cwd || request.cwd || "").split(/[\\/]/).pop() || t("session.untitled"));
      }
      const listed = await client.listSessions();
      if (workspaceRequest !== workspaceSelectionRequest) return;
      allSessions = listed.items;
      sessions = visibleSessions(listed.items, archivedSessionIds, created.sessionId, Object.keys(sessionDrafts));
      pruneSessionCaches(sessions.map((item) => item.sessionId));
      if (view === requestedFromView && sessionSelectionRequest === requestedFromSelection) {
        await selectSession(created.sessionId);
      }
      await refresh();
      if (activeSessionId === created.sessionId && created.workspaceRedirected && created.cwd) {
        workspaceNotice = t("errors.workspaceRedirected", { path: created.cwd });
      }
      if (!initializingSession && activeSessionId === created.sessionId) focusComposer();
    } catch (error) {
      if (workspaceRequest === workspaceSelectionRequest) runtimeError = userFacingError(error);
    }
  }

  async function selectSession(sessionId: string): Promise<void> {
    if (!client) return;
    const selectionClient = client;
    const sameSession = activeSessionId === sessionId;
    const previousLoadError = sessionLoadError;
    workspaceNotice = "";
    historyNotice = "";
    closeMobileSidebar();
    const requestId = ++sessionSelectionRequest;
    modelSelectionRequest += 1;
    sessionDrafts[activeSessionId] = input;
    input = sessionDrafts[sessionId] ?? "";
    activeSessionId = sessionId;
    subagentHistoryRequest += 1;
    subagents = [];
    selectedSubagentId = "";
    subagentMessages = [];
    subagentParentAvailable = false;
    const selectedSession = sessions.find((item) => item.sessionId === sessionId);
    // 已知会话没有工作区时必须清空；未选中任何会话（列表清空）时同样清空，
    // 不能沿用上一个会话的路径，否则知识索引 key 和空会话建议都会错位。
    workspacePath = selectedSession ? selectedSession.cwd ?? "" : sessionId ? workspacePath : "";
    workspaceWarning = selectedSession?.workspaceError ? userFacingError(selectedSession.workspaceError) : "";
    sessionResponse.select(sessionId, selectedSession?.running ?? false);
    const pending = pendingInteractionsBySession[sessionId];
    if (pending?.approval || pending?.question) sessionResponse.waitForInteraction(sessionId);
    view = "conversation";
    if (!sameSession) {
      streamRenderScheduler.clear();
      streamRenderSessionId = "";
      streamRenderPending = undefined;
      messages = [];
      todos = [];
      historyEntries = [];
      historyCursor = -1;
      historyHasMore = false;
    }
    historyLoading = false;
    selectedModel = "";
    reasoningEffort = "";
    modelBusy = false;
    runtimeError = "";
    sessionLoadError = "";
    if (!sessionId) {
      historyLoad = undefined;
      hostCommands = [];
      skills = [];
      commandCatalogSessionId = "";
      return;
    }
    historyLoad = { requestId, sessionId, frames: [] };
    // 命令/技能目录不阻塞历史加载：菜单在目录到位前为空，但输入不受影响。
    void loadSessionCatalog(sessionId, selectionClient, requestId);
    void loadMessageFeedback(sessionId);
    const historyRequest = selectionClient.history(sessionId);
    const modelsLoaded = loadSessionModels(sessionId, requestId, selectionClient, historyRequest.then(() => true, () => false));
    try {
      const result = await historyRequest;
      if (requestId !== sessionSelectionRequest || activeSessionId !== sessionId) return;
      historyEntries = result.events;
      historyCursor = result.cursor;
      historyHasMore = result.hasMore && result.events.length > 0;
      if (result.projections) {
        sessions = sessions.map((session) => session.sessionId === sessionId
          ? { ...session, projections: result.projections }
          : session);
      }
      const bufferedFrames = historyLoad?.requestId === requestId ? historyLoad.frames : [];
      if (historyLoad?.requestId === requestId) historyLoad = undefined;
      historyEntries = mergeHistoryEntries(result.events, bufferedFrames);
      const transcript = foldHistory(historyEntries);
      messages = transcript.messages;
      todos = transcript.todos;
      if (previousLoadError && sessionErrors[sessionId] === previousLoadError) {
        const { [sessionId]: _cleared, ...remaining } = sessionErrors;
        sessionErrors = remaining;
      }
    } catch (error) {
      if (requestId !== sessionSelectionRequest || activeSessionId !== sessionId) return;
      const bufferedFrames = historyLoad?.requestId === requestId ? historyLoad.frames : [];
      if (historyLoad?.requestId === requestId) historyLoad = undefined;
      historyEntries = mergeHistoryEntries(historyEntries, bufferedFrames);
      const transcript = foldHistory(historyEntries);
      messages = transcript.messages;
      todos = transcript.todos;
      sessionLoadError = userFacingError(error);
      runtimeError = sessionLoadError;
      sessionErrors = { ...sessionErrors, [sessionId]: runtimeError };
    } finally {
      await modelsLoaded;
      if (requestId === sessionSelectionRequest && activeSessionId === sessionId) sessionResponse.loading = false;
    }
  }

  async function loadSessionModels(sessionId: string, requestId: number, selectionClient: DshClient, historyAvailable: Promise<boolean>): Promise<void> {
    const modelRequest = modelSelectionRequest;
    modelLoading = true;
    modelLoadError = "";
    try {
      const [settingsResult, providerResult, modelResult] = await Promise.all([
        selectionClient.describeSettings(),
        selectionClient.listProviders(),
        selectionClient.models(sessionId),
      ]);
      if (client !== selectionClient || requestId !== sessionSelectionRequest || activeSessionId !== sessionId) return;
      settingsWritable = settingsResult.writable;
      settingsHasDocument = settingsResult.hasDocument;
      settingsNamespaces = settingsResult.namespaces;
      providers = providerResult.providers;
      credentialRefs = collectCredentialRefs(settingsNamespaces, providers);
      const describedCredentials = credentialRefs.length
        ? (await selectionClient.describeCredentials(credentialRefs)).credentials
        : {};
      if (requestId !== sessionSelectionRequest || activeSessionId !== sessionId || modelRequest !== modelSelectionRequest) return;
      credentials = describedCredentials;
      modelGroups = enrichModelGroups(modelResult.groups, settingsNamespaces);
      if (modelResult.failures?.length) modelLoadError = t("models.catalogFailures", {
        count: modelResult.failures.length, names: modelResult.failures.map((item) => item.name).join(", "),
      });
      selectedModel = modelSelectionKey(modelResult.current.provider, modelResult.current.model);
      const currentInfo = modelResult.groups.find((group) => group.id === modelResult.current.provider)?.models.find((model) => model.id === modelResult.current.model);
      reasoningEffort = currentInfo?.reasoning?.efforts.some((effort) => effort.id === modelResult.current.reasoningEffort) ? (modelResult.current.reasoningEffort || "") : "";
      // 模型目录独立可读；参数修正必须等待普通会话地址验证成功。
      if (modelResult.current.reasoningEffort && !reasoningEffort && await historyAvailable) {
        if (requestId !== sessionSelectionRequest || activeSessionId !== sessionId || client !== selectionClient || modelRequest !== modelSelectionRequest) return;
        await selectionClient.selectModel(sessionId, modelResult.current.provider, modelResult.current.model);
      }
      if (requestId !== sessionSelectionRequest || activeSessionId !== sessionId || modelRequest !== modelSelectionRequest) return;
      if (!sessionLoadError && !modelCredentialConfigured(modelResult.current.provider)) {
        runtimeError = t("errors.noApiKey");
        sessionErrors = { ...sessionErrors, [sessionId]: runtimeError };
      } else if (!sessionLoadError) {
        if (runtimeError === t("errors.noApiKey") || runtimeError.includes("API Key") || runtimeError.includes("凭据") || runtimeError.startsWith("当前模型需要 ")) {
          runtimeError = "";
        }
        if (sessionErrors[sessionId] && (sessionErrors[sessionId] === t("errors.noApiKey") || sessionErrors[sessionId]?.includes("API Key") || sessionErrors[sessionId]?.includes("凭据"))) {
          const { [sessionId]: _cleared, ...remaining } = sessionErrors;
          sessionErrors = remaining;
        }
      }
    } catch (error) {
      if (requestId !== sessionSelectionRequest || activeSessionId !== sessionId) return;
      modelLoadError = userFacingError(error);
    } finally {
      if (requestId === sessionSelectionRequest && activeSessionId === sessionId) modelLoading = false;
    }
  }

  async function jumpToHistoryTop(): Promise<void> {
    const sessionId = activeSessionId;
    historyNotice = "";
    for (let page = 0; page < 20 && historyHasMore && !historyLoading; page += 1) {
      const before = historyEntries.length;
      await loadEarlierHistory();
      if (activeSessionId !== sessionId || historyEntries.length === before) break;
    }
    if (activeSessionId !== sessionId) return;
    if (historyHasMore) historyNotice = t("transcript.historyJumpLimit");
    await tick();
    const scroller = document.querySelector<HTMLElement>(".message-scroll");
    if (scroller?.isConnected) scroller.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function loadEarlierHistory(): Promise<void> {
    if (!client || !activeSessionId || !historyHasMore || historyLoading) return;
    const sessionId = activeSessionId;
    const requestId = sessionSelectionRequest;
    const beforeSeq = Math.min(...historyEntries.map((entry) => entry.event.seq));
    if (!Number.isFinite(beforeSeq)) return;
    const viewport = document.querySelector<HTMLElement>(".message-scroll");
    const previousHeight = viewport?.scrollHeight ?? 0;
    const previousTop = viewport?.scrollTop ?? 0;
    historyLoading = true;
    try {
      const result = await client.history(sessionId, { beforeSeq, throughSeq: historyCursor });
      if (requestId !== sessionSelectionRequest || activeSessionId !== sessionId) return;
      const older = result.events.filter((entry) => entry.event.seq < beforeSeq);
      historyHasMore = result.hasMore && older.length > 0;
      historyEntries = mergeHistoryEntries(older, historyEntries);
      const transcript = foldHistory(historyEntries);
      const optimistic = messages.filter((message) => message.seq === undefined && message.pending);
      messages = [...transcript.messages, ...optimistic];
      todos = transcript.todos;
      await tick();
      if (viewport?.isConnected && activeSessionId === sessionId) {
        viewport.scrollTop = previousTop + viewport.scrollHeight - previousHeight;
      }
    } catch (error) {
      if (activeSessionId === sessionId) runtimeError = userFacingError(error);
    } finally {
      if (requestId === sessionSelectionRequest) historyLoading = false;
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

  function openVoiceSettings(): void {
    switchSettingsSection("voice");
    openManagement("settings");
  }

  function openImageModelSettings(): void {
    switchSettingsSection("models");
    openManagement("settings");
  }

  function openCredentialSettings(ref: string | undefined): void {
    if (ref) credentialRefDraft = ref;
    switchSettingsSection("advanced");
    openManagement("settings");
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('.credential-form input[type="password"]');
      input?.focus();
    }, 100);
  }

  function openCredentialSettingsForCurrentModel(): void {
    const ref = selectedProviderCredentialRef();
    if (ref === "XG_GOMODEL_API_KEY") {
      switchSettingsSection("models");
      openManagement("settings");
      return;
    }
    openCredentialSettings(ref);
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
    if (payload.sessionId === activeSessionId) sessionEventRevision += 1;
    if (payload.type === "approval/requested") {
      if (typeof payload.sessionId !== "string" || !payload.sessionId) return;
      const approval = { rpcId: frame.rpcId, ...payload } as unknown as PendingApproval;
      pendingInteractionsBySession = setPendingApproval(pendingInteractionsBySession, payload.sessionId, approval);
      pauseResponseForInteraction(payload.sessionId);
      return;
    }
    if (payload.type === "question/requested") {
      if (typeof payload.sessionId !== "string" || !payload.sessionId) return;
      const question = { rpcId: frame.rpcId, ...payload } as unknown as PendingQuestion;
      pendingInteractionsBySession = setPendingQuestion(pendingInteractionsBySession, payload.sessionId, question);
      pauseResponseForInteraction(payload.sessionId);
      return;
    }
    if (payload.type === "approval/resolved") {
      if (typeof payload.sessionId !== "string" || !payload.sessionId) return;
      resolveInteraction("approval", payload.sessionId, frame.rpcId);
      return;
    }
    if (payload.type === "question/resolved") {
      if (typeof payload.sessionId !== "string" || !payload.sessionId) return;
      resolveInteraction("question", payload.sessionId, frame.rpcId);
      return;
    }
    // 官方被动状态帧：待发送队列与运行标记的唯一来源（session/observeState）。
    if (payload.type === "session/state") {
      if (typeof payload.sessionId === "string") applySessionQueueState(payload.sessionId, payload.state);
      return;
    }
    // 旧外壳可能仍在转发 session/queue 帧，形状相同，按同一套逻辑合并。
    if (payload.type === "session/queue") {
      if (typeof payload.sessionId === "string") applySessionQueueState(payload.sessionId, { queue: payload.items });
      return;
    }
    if (payload.type === "host/command-catalog-changed") {
      if (client && activeSessionId) void loadSessionCatalog(activeSessionId, client, sessionSelectionRequest);
      return;
    }
    if (payload.type === "session/jobs") {
      if (typeof payload.sessionId === "string") {
        jobRoster = { ...jobRoster, [payload.sessionId]: normalizeJobRows({ type: "rows", jobs: payload.rows ?? payload.jobs }) };
      }
      return;
    }
    if (payload.type === "job/state") {
      if (typeof payload.sessionId !== "string" || typeof payload.jobId !== "string") return;
      const job = payload.job && typeof payload.job === "object" ? payload.job : null;
      if (!job) return;
      const rows = normalizeJobRows({ type: "rows", jobs: [job] });
      if (rows.length === 0) return;
      const existing = jobRoster[payload.sessionId] ?? [];
      const merged = existing.some((item) => item.id === rows[0].id)
        ? existing.map((item) => (item.id === rows[0].id ? rows[0] : item))
        : [...existing, rows[0]];
      jobRoster = { ...jobRoster, [payload.sessionId]: merged };
      return;
    }
    if (payload.type === "job/output") return;
    if (payload.type === "session/projection") { requestRefresh(); return; }
    if (payload.type === "host/session-added" || payload.type === "host/session-status" || payload.type === "host/session-removed" || payload.type === "host/workspace-changed" || payload.type === "host/workspace-removed") { requestRefresh(); return; }
    if (payload.type === "host/agent-error") {
      const sessionId = payload.sessionId || activeSessionId;
      const message = sessionId
        ? setSessionRuntimeError(sessionId, payload.message || t("errors.agentFailed"))
        : providerAwareError(payload.message || t("errors.agentFailed"));
      if (sessionId) finishResponse(sessionId, true);
      if (sessionId !== activeSessionId) return;
      streamRenderScheduler.flush();
      messages = messages.map((item) => item.pending ? { ...item, pending: false } : item);
      return;
    }
    if (payload.type !== "session/event" || payload.sessionId !== activeSessionId || !payload.event) return;
    if (historyLoad?.sessionId === payload.sessionId) {
      historyLoad.frames.push({ event: payload.event, view: payload.view as Record<string, unknown> | undefined });
    } else {
      const merged = mergeHistoryEntries(historyEntries, [{ event: payload.event, view: payload.view }]);
      if (merged.length === historyEntries.length && merged.every((entry, index) => entry === historyEntries[index])) return;
      historyEntries = merged;
    }
    if (payload.event.type === "turn/start") sessionResponse.started(payload.sessionId);
    // 若上一帧流式提交尚未 flush，后续 chunk 必须叠在 pending 视图上，避免丢字。
    const transcriptBase = streamRenderPending && streamRenderSessionId === payload.sessionId
      ? streamRenderPending
      : { messages, todos };
    const transcript = applyTranscriptEvent(transcriptBase, payload.event, payload.view as Record<string, unknown> | undefined);
    noteResponseActivity(payload.sessionId, transcript.messages);
    // 历史加载只缓冲消息渲染，运行状态仍须立即响应结束事件。
    // 流式 chunk 合批到下一帧，降低长回复期间的同步重绘；收尾/工具等事件立即 flush。
    if (historyLoad?.sessionId !== payload.sessionId) {
      if (streamRenderSessionId && streamRenderSessionId !== payload.sessionId) streamRenderScheduler.flush();
      streamRenderPending = { messages: transcript.messages, todos: transcript.todos };
      streamRenderSessionId = payload.sessionId;
      const applyMessages = () => {
        if (!streamRenderPending) return;
        messages = streamRenderPending.messages;
        todos = streamRenderPending.todos;
        streamRenderPending = undefined;
      };
      if (isBatchableSessionEvent(payload.event.type)) {
        streamRenderScheduler.schedule(applyMessages);
      } else {
        // 取消未执行的帧回调；pending 已包含本事件，直接提交，避免 flush+apply 二次清空。
        streamRenderScheduler.clear();
        applyMessages();
      }
    }
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
      if (runtimeError === t("errors.noApiKey") || runtimeError.includes("API Key") || runtimeError.includes("凭据") || runtimeError.startsWith("当前模型需要 ")) {
        runtimeError = "";
      }
      if (sessionErrors[activeSessionId] && (sessionErrors[activeSessionId] === t("errors.noApiKey") || sessionErrors[activeSessionId]?.includes("API Key") || sessionErrors[activeSessionId]?.includes("凭据"))) {
        const { [activeSessionId]: _cleared, ...remaining } = sessionErrors;
        sessionErrors = remaining;
      }
    }
    if (payload.event.type === "assistant/message") {
      const assistantMessage = assistantMessageForEvent(transcript.messages, payload.event);
      captureCustomization(assistantMessage);
      captureSurfaceProposal(assistantMessage);
      const report = parseKnowledgeReport(assistantMessage?.text || "");
      if (report) {
        knowledgeIndex = { ...knowledgeIndex, ...report, state: report.status };
        persistKnowledgeSnapshot(workspacePath, knowledgeIndex);
        knowledgeOperation = "";
        if (assistantMessage) assistantMessage.text = stripKnowledgeArtifacts(assistantMessage.text);
      }
    }
    if (payload.event.type === "tool/result" && payload.event.data.error && knowledgeOperation) {
      const errorText = userFacingError(payload.event.data.error);
      knowledgeIndex = { ...knowledgeIndex, state: "failed", failures: [errorText] };
      persistKnowledgeSnapshot(workspacePath, knowledgeIndex);
      knowledgeOperation = "";
    }
    if (payload.event.type === "turn/end") {
      liveTurnEndSeq = { ...liveTurnEndSeq, [payload.sessionId]: payload.event.seq };
      // 一轮结束时官方可能刚消费掉队首：重新取一次队列快照，避免界面停在旧列表。
      void syncSessionQueue(payload.sessionId);
      pendingInteractionsBySession = clearPendingSession(pendingInteractionsBySession, payload.sessionId);
      messages = messages.map((item) => item.pending ? { ...item, pending: false } : item).filter((item) => item.role === "tool" || !!item.text?.trim() || !!item.reasoning?.trim() || !!item.tool);
      if (knowledgeOperation && knowledgeOperation !== "query") {
        knowledgeIndex = { ...knowledgeIndex, state: "partial", failures: [t("knowledge.reportMissing")] };
        persistKnowledgeSnapshot(workspacePath, knowledgeIndex);
        knowledgeOperation = "";
      }
      const endFailure = turnEndFailure(payload.event);
      if (endFailure && classifyAuthFailure(endFailure.message, endFailure.code) === "weknora") {
        // 外部知识源被拒：本次运行视为未验证，并退回本地检索，避免每轮都重试同一个 401。
        externalKnowledgeVerified = false;
        knowledgeScope = "local";
        managementNotice = t("knowledge.externalDeniedFallback");
      }
      const endError = endFailure?.message ?? turnEndError(payload.event);
      // 答案已经交付时，内部错误只降级为后台提示，不再挂整轮失败卡片（#340）。
      if (endError && deliveredAnswer(messages)) {
        finishResponse(payload.sessionId);
        // 已有失败态一并清掉：答案已交付，顶部不该继续挂着红色错误卡（#340）。
        const cleared = sessionErrors[payload.sessionId];
        if (cleared) {
          const { [payload.sessionId]: _gone, ...remaining } = sessionErrors;
          sessionErrors = remaining;
          if (runtimeError === cleared) runtimeError = "";
        }
      } else if (endError) {
        finishResponse(payload.sessionId, true);
        setSessionRuntimeError(activeSessionId, endError, endFailure?.code);
      } else if (clearsSessionError(payload.event) && sessionErrors[activeSessionId]) {
        finishResponse(payload.sessionId);
        const clearedMessage = sessionErrors[activeSessionId];
        const { [activeSessionId]: _cleared, ...remaining } = sessionErrors;
        sessionErrors = remaining;
        if (runtimeError === clearedMessage) runtimeError = "";
      } else {
        finishResponse(payload.sessionId);
      }
    }
  }

  /**
   * 官方 inbox 的队列状态只有一个来源：`session/state`（主进程通过
   * `session/observeState` 流转发）。`null` 表示"这个会话当前没有活动 Agent，
   * 队列不可读"，不能当成"队列为空"。
   */
  /**
   * 会话级缓存（队列快照、任务花名册）不能只加不减：会话被归档/删除后，
   * 它们的键会一直留在内存里。这里以当前可见会话集合为准淘汰。
   */
  function pruneSessionCaches(keep: readonly string[]): void {
    const live = new Set(keep);
    const prune = <T,>(record: Record<string, T>): Record<string, T> => {
      const entries = Object.entries(record).filter(([sessionId]) => live.has(sessionId));
      return entries.length === Object.keys(record).length ? record : Object.fromEntries(entries);
    };
    nativeQueue = prune(nativeQueue);
    jobRoster = prune(jobRoster);
  }

  function applySessionQueueState(sessionId: string, state: unknown): void {
    if (!sessionId || !state || typeof state !== "object") return;
    const value = state as { queue?: unknown };
    if (!Array.isArray(value.queue)) {
      // 官方在"没有活动 Agent"时返回 queue:null：这一会话的队列不可读，
      // 必须清掉旧快照，否则界面会一直显示早已失效的待发送条目。
      if (nativeQueue[sessionId]) {
        const { [sessionId]: _stale, ...rest } = nativeQueue;
        nativeQueue = rest;
      }
      return;
    }
    nativeQueue = { ...nativeQueue, [sessionId]: toNativeQueueItems(value.queue) };
  }

  /** 让主进程观察当前会话，并主动读一次快照（流的第一帧可能还没到）。 */
  async function syncSessionQueue(sessionId: string): Promise<void> {
    if (!sessionId) return;
    try {
      await client?.observeSessionState(sessionId);
      const state = await client?.sessionState(sessionId);
      if (!state || sessionId !== activeSessionId) return;
      applySessionQueueState(sessionId, state);
    } catch {
      // 老运行时没有这个端点：队列不显示即可，不能因为它报错。
    }
  }

  /**
   * 把一条消息排进官方 inbox（mode=queue）：当前回合结束后由 DSH 自己发出，
   * 因此它能在重启/多窗口后依然存在。
   */
  async function queueCurrentPrompt(
    sessionId: string,
    payload: { text: string; images: Extract<PromptContentPart, { type: "image" }>[]; files: File[] },
  ): Promise<boolean> {
    if (!client || !sessionId) return false;
    const rawText = payload.text;
    const text = rawText.trim();
    if (!text && payload.images.length === 0 && payload.files.length === 0) return false;
    const queueClient = client;
    let queuedFiles: Array<{ receiptId: string }> = [];
    try {
      const plan = planFileInput(payload.files, {
        resolvePath: (file) => {
          try {
            return window.voltDesktop?.getPathForFile?.(file) ?? "";
          } catch {
            return "";
          }
        },
        isImage: (file) => /^image\//u.test(file.type || ""),
        inlineUploadBytes: resolveInlineUploadBudget({ deviceMemoryGiB: deviceMemoryGiB() }),
      });
      if (plan.rejections.length > 0) {
        runtimeError = describeFileRejection(plan.rejections[0], t);
        return false;
      }
      for (const file of plan.uploads) {
        const uploaded = await queueClient.uploadFile(sessionId, file);
        queuedFiles.push(uploaded);
      }
      const referencePrefix = plan.references.map((entry) => formatFileReference(entry.path)).join(" ");
      const content: PromptContentPart[] = [
        ...([referencePrefix, rawText].filter(Boolean).join("\n") ? [{ type: "text", text: [referencePrefix, rawText].filter(Boolean).join("\n") } satisfies PromptContentPart] : []),
        ...payload.images,
        ...queuedFiles.map(({ receiptId }) => ({ type: "file", receiptId }) satisfies PromptContentPart),
      ];
      await queueClient.prompt(sessionId, content, "queue");
      await syncSessionQueue(sessionId);
      return true;
    } catch (error) {
      // 入队失败要把文字还给用户，不能静默丢掉一条消息。
      if (!sessionDrafts[sessionId]) {
        input = rawText;
        sessionDrafts[sessionId] = rawText;
      }
      runtimeError = userFacingError(error);
      return false;
    }
  }

  /** 取消排队：官方队列删掉这一条，文字放回输入框（附件已上传，不再重复投递）。 */
  async function cancelQueuedPrompt(item: NativeQueueItem): Promise<void> {
    const sessionId = activeSessionId;
    if (!sessionId || !client || !isMutableQueueItem(item)) return;
    try {
      await client.updateQueue(sessionId, item.id, { kind: "remove" });
    } catch (error) {
      runtimeError = userFacingError(error);
      return;
    }
    restoreQueuedText(sessionId, queueItemDraft(item));
    await syncSessionQueue(sessionId);
  }

  /** 编辑排队条目：拿回输入框并从官方队列删除，改完由用户重新提交。 */
  async function editQueuedPrompt(item: NativeQueueItem): Promise<void> {
    const sessionId = activeSessionId;
    if (!sessionId || !client || !isMutableQueueItem(item)) return;
    // 队列条目里的附件只有回执，取回原文是不可能的：先删后发会静默丢掉它们，
    // 所以带附件的条目只提供"取消"，不提供"编辑"。
    if (item.attachmentCount > 0) {
      runtimeError = t("composer.queueEditWithAttachments");
      return;
    }
    restoreQueuedText(sessionId, queueItemDraft(item));
    try {
      await client.updateQueue(sessionId, item.id, { kind: "remove" });
    } catch (error) {
      runtimeError = userFacingError(error);
      return;
    }
    await syncSessionQueue(sessionId);
  }

  /** 插队：让官方把这条件提前到当前回合处理（steer），而不是等这轮结束。 */
  async function steerQueuedPrompt(item: NativeQueueItem): Promise<void> {
    const sessionId = activeSessionId;
    if (!sessionId || !client || !isMutableQueueItem(item)) return;
    try {
      await client.updateQueue(sessionId, item.id, { kind: "steer" });
    } catch (error) {
      runtimeError = userFacingError(error);
      return;
    }
    await syncSessionQueue(sessionId);
  }

  /** 选区引用：引用块接到草稿末尾，不覆盖用户正在写的内容。 */
  function quoteToComposer(quote: string): void {
    const sessionId = activeSessionId;
    if (!sessionId || !quote) return;
    const merged = appendQuoteToDraft(sessionDrafts[sessionId] ?? input ?? "", quote);
    input = merged;
    sessionDrafts[sessionId] = merged;
  }

  /**
   * 把排队文字并回草稿；绝不覆盖用户正在写的内容。
   *
   * 请求是异步的：期间用户可能已经切到别的会话，`input` 属于那个新会话的草稿。
   * 所以只有发起请求的会话仍是当前会话时才写 `input`，否则只更新它自己的草稿。
   */
  function restoreQueuedText(sessionId: string, text: string): void {
    if (!text) return;
    const draft = (sessionDrafts[sessionId] ?? "").trim();
    const merged = !draft || draft === text.trim() ? text : `${draft}\n${text}`;
    sessionDrafts[sessionId] = merged;
    if (sessionId === activeSessionId) input = merged;
  }

  // 切换会话就换一条观察流；否则队列会停在旧会话上。
  $effect(() => {
    const sessionId = activeSessionId;
    if (!sessionId || !client) return;
    void syncSessionQueue(sessionId);
    // 后台任务花名册同样只跟当前会话；切走时主进程会取消上一条订阅。
    void window.voltDesktop?.observeJobRoster?.(sessionId);
    // 终端绑定的是具体 shell 进程：会话一换就必须关掉，不能让旧 shell 留在新会话下。
    if (terminalOpenSessionId && terminalOpenSessionId !== sessionId) terminalOpenSessionId = "";
  });

  /**
   * 会话未激活时官方不返回可读队列（`queue: null`），但 inbox 投影里仍有待发送条目。
   * 这不是"没有队列"：显示条数，不显示可操作的行。
   */
  const coldInboxCount = $derived(
    nativeQueue[activeSessionId] === undefined ? inboxPendingCount(activeSession?.projections?.values) : 0,
  );
  const activeQueueRows = $derived(
    activeSessionId ? nativeQueueRows(nativeQueue[activeSessionId] ?? []) : [],
  );

  /**
   * 斜杠命令目录与技能目录按会话加载：两者都只在这一个会话里有效，
   * 切换会话后旧目录必须立刻作废（否则会把上一个会话的命令执行到新会话上）。
   */
  async function loadSessionCatalog(sessionId: string, selectionClient: DshClient, requestId: number): Promise<void> {
    if (!sessionId) {
      hostCommands = [];
      skills = [];
      commandCatalogSessionId = "";
      return;
    }
    const [commandsResult, skillsResult] = await Promise.all([
      selectionClient.listCommands(sessionId).catch(() => [] as HostCommand[]),
      selectionClient.listSkills(sessionId).catch(() => ({ skills: [] as DshSkill[] })),
    ]);
    if (client !== selectionClient || activeSessionId !== sessionId || requestId !== sessionSelectionRequest) return;
    hostCommands = normalizeCommands(commandsResult);
    skills = skillsResult.skills;
    commandCatalogSessionId = sessionId;
  }

  /**
   * 执行一条官方命令行。
   *
   * 与提示词不同，命令不进入模型消息：失败只给可见提示，绝不退化成"把这条命令
   * 当普通提问发出去"。
   */
  async function runHostCommand(line: string): Promise<boolean> {
    if (!client || !activeSessionId) return false;
    const sessionId = activeSessionId;
    try {
      const execution = await client.executeCommand(sessionId, line);
      if (activeSessionId !== sessionId) return true;
      const outcome = execution?.result;
      if (outcome?.kind === "error") {
        runtimeError = outcome.text || t("errors.generalError");
      } else if (outcome?.text) {
        commandNotice = outcome.text;
        setTimeout(() => { if (commandNotice === outcome.text) commandNotice = ""; }, 6000);
      }
      requestRefresh();
      return true;
    } catch (error) {
      runtimeError = userFacingError(error);
      return true;
    }
  }

  async function loadMessageFeedback(sessionId: string): Promise<void> {
    if (!client || !sessionId) return;
    try {
      const result = readFeedbackList(await client.listMessageFeedback(sessionId));
      if (sessionId !== activeSessionId) return;
      feedbackItems = Object.fromEntries(result.items.map((item) => [item.messageId, item]));
      // 列表被拒（例如会话不存在）不是"没有反馈"，但也不该打断对话：留一条提示。
      if (result.error && result.error !== "session-not-found") runtimeError = feedbackFailureMessage(result.error);
    } catch {
      // 传输失败不影响对话；界面只是不显示已选状态。
      if (sessionId === activeSessionId) feedbackItems = {};
    }
  }

  async function rateMessage(messageId: string, rating: FeedbackRating): Promise<void> {
    if (!client || !activeSessionId) return;
    const sessionId = activeSessionId;
    const action = feedbackAction(feedbackItems[messageId], rating);
    try {
      const result = action.kind === "delete"
        ? await client.deleteMessageFeedback(sessionId, messageId, action.ifVersion)
        : await client.putMessageFeedback(sessionId, messageId, rating, action.ifVersion);
      const outcome = readFeedbackWrite(result);
      if (!outcome.ok) {
        // 冲突时采纳服务端的 `current`：否则下一次点击会继续拿旧版本冲突。
        if (outcome.code === "version-conflict") {
          if (outcome.current) feedbackItems = { ...feedbackItems, [messageId]: outcome.current };
          else {
            const next = { ...feedbackItems };
            delete next[messageId];
            feedbackItems = next;
          }
        }
        runtimeError = feedbackFailureMessage(outcome.code);
        return;
      }
      await loadMessageFeedback(sessionId);
    } catch (error) {
      runtimeError = userFacingError(error);
    }
  }

  /** 官方拒绝码逐条说明，不合并成一句"失败了"。 */
  function feedbackFailureMessage(code: string): string {
    if (code === "version-conflict") return t("transcript.feedbackConflict");
    if (code === "target-not-found") return t("transcript.feedbackTargetMissing");
    if (code === "session-not-found") return t("transcript.feedbackSessionMissing");
    if (code === "note-too-large") return t("transcript.feedbackNoteTooLarge");
    return t("transcript.feedbackFailed");
  }

  async function killJob(job: JobRow): Promise<void> {
    if (!activeSessionId) return;
    try {
      await window.voltDesktop?.killJob?.(activeSessionId, job.id);
    } catch (error) {
      runtimeError = userFacingError(error);
    }
  }

  async function togglePlanMode(): Promise<void> {
    const active = activePlan?.active === true;
    await runHostCommand(planToggleCommand(active));
  }

  async function toggleAgentTeam(enabled: boolean): Promise<void> {
    if (!client || !activeSessionId) return;
    const sessionId = activeSessionId;
    try {
      await client.setAgentTeamEnabled(sessionId, enabled);
      commandNotice = enabled ? t("team.enabledNotice") : t("team.disabledNotice");
      window.setTimeout(() => { commandNotice = ""; }, 6000);
      // 开关落在会话日志里，投影由官方刷新后才算数。
      if (sessionId === activeSessionId) requestRefresh();
    } catch (error) {
      runtimeError = error instanceof Error ? error.message : String(error);
    }
  }

  async function submit(
    textOverride?: string,
    imageAttachments: Extract<PromptContentPart, { type: "image" }>[] = [],
    fileAttachments: File[] = [],
    sourceSessionId = activeSessionId,
    options: { readonly skipSurfaceContract?: boolean; readonly keepView?: boolean } = {},
  ): Promise<boolean> {
    if (initializingSession) throw new Error(t("app.connecting"));
    if (sourceSessionId !== activeSessionId) throw new Error(t("composer.sessionChanged"));
    if (sessionResponse.loading) throw new Error(t("app.connecting"));
    if (sessionLoadError) throw new Error(sessionLoadError);
    // 用户消息逐字保真：只有在判断「是否为空」时 trim，实际内容保留首尾空格与换行（#349）。
    const rawText = textOverride ?? input;
    const text = rawText.trim();
    // 由输入框发起的提交才拥有草稿（清空/失败回填）；队列与重试传入 textOverride，
    // 不得动用户当前正在编辑的内容。
    const ownsDraft = textOverride === undefined;
    if (!client || !activeSessionId || (!text && imageAttachments.length === 0 && fileAttachments.length === 0)) return false;
    // 正在跑的时候按回车 = 排进官方 inbox（Codex 的行为），而不是弹一个"不能提交"。
    // 只在"这一轮真的在跑"时这么做：submitting/stopping/waiting/disconnected 仍然拒绝。
    if (!sessionResponse.canSubmit && (sessionResponse.phase === "running" || sessionResponse.phase === "waiting")) {
      const queued = await queueCurrentPrompt(sourceSessionId, { text: rawText, images: imageAttachments, files: fileAttachments });
      if (queued && ownsDraft) {
        input = "";
        sessionDrafts[sourceSessionId] = "";
        draftFilesBySession[sourceSessionId] = [];
      }
      if (!queued) throw new Error(runtimeError || t("errors.generalError"));
      return true;
    }
    if (!sessionResponse.canSubmit) return false;
    // 斜杠命令：只有官方目录里确实存在的命令才拦截，其余以斜杠开头的文本仍然是
    // 普通提示词。命令声明要不要附件我们不猜——带附件的提交直接拒绝，命令本身照常执行。
    if (isHostCommandLine(text, hostCommands)) {
      if (imageAttachments.length > 0 || fileAttachments.length > 0) {
        throw new Error(t("composer.commandAttachmentsUnsupported"));
      }
      if (ownsDraft) {
        input = "";
        sessionDrafts[sourceSessionId] = "";
      }
      return await runHostCommand(text);
    }
    // 输入文件策略：≤256 MiB 走字节上传，更大的改成 "@路径" 引用（不复制内容），
    // 只有拿不到本机路径或超过 2 GiB 才拒绝。避免 base64 单请求把内存和字符串上限打爆。
    const filePlan = planFileInput(fileAttachments, {
      resolvePath: (file) => {
        try {
          return window.voltDesktop?.getPathForFile?.(file) ?? "";
        } catch {
          return "";
        }
      },
      isImage: (file) => /^image\//u.test(file.type || ""),
      // 20 MiB 是协议上限，机器内存紧张时按可用内存收缩（峰值约为文件的 4.7 倍）。
      inlineUploadBytes: resolveInlineUploadBudget({ deviceMemoryGiB: deviceMemoryGiB() }),
    });
    if (filePlan.rejections.length > 0) {
      // 拒绝原因要落在可见状态上（顶部错误条 + 输入区提示），不能只抛给调用方：
      // 输入框提交路径不会展示异常，抛出去就变成静默失败。
      runtimeError = describeFileRejection(filePlan.rejections[0], t);
      return false;
    }
    const attachmentsToUpload = filePlan.uploads;
    const referencePrefix = filePlan.references.map((entry) => formatFileReference(entry.path)).join(" ");
    const promptClient = client;
    if (workspaceWarning) {
      runtimeError = "";
      if (textOverride !== undefined) throw new Error(workspaceWarning);
      runtimeError = workspaceWarning;
      return false;
    }
    const credentialRef = selectedProviderCredentialRef();
    const currentProvider = parseModelSelectionKey(selectedModel).provider;
    if (credentialRef && !modelCredentialConfigured(currentProvider) && !credentials[credentialRef]?.configured) {
      credentialRefDraft = credentialRef;
      runtimeError = t("models.missingApiKeyRuntime", { credentialRef });
      sessionErrors = { ...sessionErrors, [activeSessionId]: runtimeError };
      openCredentialSettings(credentialRef);
      if (textOverride !== undefined) throw new Error(runtimeError);
      return false;
    }
    if (imageAttachments.length > 0 && !(selectedModelInfo()?.input || []).includes("image")) {
      throw new Error(t("models.unsupportedImage", { model: displayModelSelection(selectedModel) }));
    }
    if (ownsDraft) {
      input = "";
      sessionDrafts[sourceSessionId] = "";
    }
    // 人工提交新任务时重置自动续写配额。
    if (text !== t("activity.continuePrompt") && autoContinueAttempts[sourceSessionId]) {
      const { [sourceSessionId]: _reset, ...rest } = autoContinueAttempts;
      autoContinueAttempts = rest;
    }
    const submittedFiles = fileAttachments.slice();
    // 用户的新提问意味着上一轮提案已经过期：不能继续霸占首屏（#366 第 3 条）。
    if (surfaceDraft) surfaceDraft = undefined;
    lastUserPromptText = rawText;
    // 知识库检索必须留在知识库页看就地结果（#353）；普通提问仍然回到对话区。
    if (!options.keepView) view = "conversation";
    const pendingId = `pending-${Date.now()}`;
    const failedPrompt = {
      sessionId: activeSessionId,
      pendingId,
      // 失败/重试路径同样保留未 trim 原文，重试不能悄悄改掉首尾空白（#349）。
      text: rawText,
      images: imageAttachments.map((image) => ({ ...image })),
      files: fileAttachments.slice(),
    };
    sessionResponse.begin(failedPrompt);
    // 系统自动重试不能清掉一次性标记；只有人工提交才重置，并顺带取消排队的自动重试。
    if (!automaticRetrySubmission) {
      clearTimeout(protocolRetryTimer);
      protocolRetryTimer = undefined;
      if (protocolRetriedSessions[sourceSessionId]) {
        const { [sourceSessionId]: _reset, ...rest } = protocolRetriedSessions;
        protocolRetriedSessions = rest;
      }
    }
    // 先记录提交前是否停在底部，再追加消息；否则长消息自身会把视口顶出阈值（#335）。
    const wasAtLatest = transcriptAtLatest();
    messages = [...messages, { id: pendingId, role: "user", text: rawText, pending: true }];
    if (wasAtLatest) scrollTranscriptToLatest();
    // 卡片选择回传是普通对话内容，不再注入界面生成契约，避免模型又生成一张卡片。
    // 送模型的正文同样用未 trim 的原文，避免吞掉用户刻意添加的首尾空白（#349）；
    // 升级/续写等内部包装仍需拿 trimmed 值做意图判断。
    const promptBody = options.skipSurfaceContract === true
      ? rawText
      : isSurfaceGenerationIntent(text)
        ? buildVoltSurfacePrompt(rawText)
        : isUiCustomizationIntent(text)
          ? buildUiCustomizationPrompt(rawText)
          : rawText;
    const prompt = [referencePrefix, promptBody].filter(Boolean).join("\n");
    const uploadedAttachmentIds: string[] = [];
    try {
      const uploadedFiles: Array<{ receiptId: string; file: { attachmentId: string; name: string; bytes: number } }> = [];
      for (const file of attachmentsToUpload) {
        const uploaded = await promptClient.uploadFile(sourceSessionId, file, () => activePrompt === failedPrompt);
        if (activePrompt !== failedPrompt) throw new Error(t("composer.sessionChanged"));
        uploadedFiles.push(uploaded);
        if (!attachmentFilesBySession[sourceSessionId]?.[uploaded.file.attachmentId]) {
          uploadedAttachmentIds.push(uploaded.file.attachmentId);
          attachmentFilesBySession[sourceSessionId] = { ...attachmentFilesBySession[sourceSessionId], [uploaded.file.attachmentId]: file };
        }
      }
      if (activePrompt !== failedPrompt) throw new Error(t("composer.sessionChanged"));
      sessionResponse.submitted(failedPrompt);
      const content: PromptContentPart[] = [
        ...(prompt ? [{ type: "text", text: prompt } satisfies PromptContentPart] : []),
        ...imageAttachments,
        ...uploadedFiles.map(({ receiptId }) => ({ type: "file", receiptId }) satisfies PromptContentPart),
      ];
      await promptClient.prompt(sourceSessionId, content);
      cancelledPromptIds.delete(failedPrompt.pendingId);
      draftFilesBySession[sourceSessionId] = (draftFilesBySession[sourceSessionId] ?? []).filter((file) => !submittedFiles.includes(file));
    }
    catch (error) {
      const currentFiles = attachmentFilesBySession[sourceSessionId];
      if (currentFiles && uploadedAttachmentIds.length > 0) {
        const uploadedIds = new Set(uploadedAttachmentIds);
        const retainedFiles = Object.fromEntries(
          Object.entries(currentFiles).filter(([attachmentId]) => !uploadedIds.has(attachmentId)),
        );
        if (Object.keys(retainedFiles).length > 0) attachmentFilesBySession[sourceSessionId] = retainedFiles;
        else clearAttachmentFiles(sourceSessionId);
      }
      if (ownsDraft && !sessionDrafts[sourceSessionId]) sessionDrafts[sourceSessionId] = rawText;
      if (cancelledPromptIds.delete(failedPrompt.pendingId)) {
        return false;
      }
      if (activePrompt !== failedPrompt) throw error;
      if (sourceSessionId !== activeSessionId) {
        setSessionRuntimeError(sourceSessionId, error);
        throw error;
      }
      sessionResponse.fail(sourceSessionId);
      if (ownsDraft && !input) input = rawText;
      messages = messages.map((message) => message.id === pendingId ? { ...message, pending: false } : message);
      const message = setSessionRuntimeError(activeSessionId, error);
      if (message.includes("设置与凭据") || message.includes("Settings & Credentials")) openManagement("settings");
      if (textOverride !== undefined) {
        // Composer 保留失败语义和草稿；连接错误仍需提供统一恢复入口。
        if (!runtimeConnectionError) runtimeError = "";
        throw new Error(message);
      }
      return false;
    }
    return true;
  }

  // automatic=true 表示这次重试由系统触发：它不能重置「每会话只自动重试一次」的标记，
  // 否则失败一次就会无限重试（#334）。
  async function retryLastPrompt(options: { automatic?: boolean } = {}): Promise<void> {
    const failed = lastFailedPrompt;
    if (!failed || failed.sessionId !== activeSessionId || sending) return;
    // 先清失败态才能重新提交（canSubmit 受它影响）；提交未被接受时把失败态恢复。
    sessionResponse.clearFailure();
    runtimeError = "";
    const { [failed.sessionId]: _cleared, ...remaining } = sessionErrors;
    sessionErrors = remaining;
    messages = messages.filter((message) => message.id !== failed.pendingId);
    input = failed.text;
    automaticRetrySubmission = options.automatic === true;
    let accepted = false;
    try {
      accepted = await submit(undefined, failed.images, failed.files);
    } finally {
      automaticRetrySubmission = false;
    }
    if (accepted) {
      // 重试成功后刷新官方队列快照：DSH 之前可能已经消费掉了对应的排队条目。
      void syncSessionQueue(failed.sessionId);
    } else if (lastFailedPrompt?.pendingId === failed.pendingId) {
      // submit 已经记录过失败（长新 pendingId 的情况不会进这里），避免重复 fail 覆盖状态。
      sessionResponse.fail(failed.sessionId);
    }
  }

  /**
   * 401 自愈：用随包内置凭据重新授权，然后把刚才那条提问重发一次。
   * 每一条失败提问只尝试一次，避免连续失败时无限重试。
   */
  async function repairBundledCredentialAndRetry(options: { manual?: boolean } = {}): Promise<boolean> {
    const shell = window.voltDesktop;
    const failed = lastFailedPrompt;
    if (!client || !shell?.resetBundledModelCredential || sending || autoRepairState === "running") return false;
    if (!options.manual && (!canAutoRepairBundledCredential || !failed || failed.sessionId !== activeSessionId)) return false;
    const repairKey = `${activeSessionId}:${failed?.pendingId ?? "current"}`;
    if (!options.manual && autoRepairHandled.has(repairKey)) return false;
    autoRepairHandled.add(repairKey);
    autoRepairState = "running";
    autoRepairNotice = t("errors.autoRepairRunning");
    try {
      const result = await shell.resetBundledModelCredential();
      if (!result.available || !result.reset) {
        autoRepairState = "failed";
        autoRepairNotice = t("errors.autoRepairUnavailable");
        return false;
      }
      if (client) {
        const described = await client.describeCredentials(["XG_GOMODEL_API_KEY"]).catch(() => undefined);
        if (described) credentials = { ...credentials, ...described.credentials };
      }
      clearCredentialRequirementError();
      autoRepairState = "done";
      autoRepairNotice = t("errors.autoRepairDone");
      await retryLastPrompt({ automatic: true });
      return true;
    } catch (error) {
      autoRepairState = "failed";
      autoRepairNotice = userFacingError(error);
      return false;
    }
  }
  async function retryInterruptedTask(): Promise<void> {
    if (!client || !sessionResponse.canSubmit || continuingTask || !activeSessionId || pendingApproval || pendingQuestion) return;
    const sessionId = activeSessionId;
    const continuationClient = client;
    const selectionRequest = sessionSelectionRequest;
    const eventRevision = sessionEventRevision;
    continuingTask = true;
    let draft: string | undefined;
    try {
      const result = await continuationClient.listSessions();
      if (client !== continuationClient || activeSessionId !== sessionId
        || selectionRequest !== sessionSelectionRequest || eventRevision !== sessionEventRevision
        || !sessionResponse.canSubmit || pendingApproval || pendingQuestion) return;
      const session = result.items.find((item) => item.sessionId === sessionId);
      if (!session) throw new Error(t("errors.sessionUnavailable"));
      if (session.running) {
        sessionResponse.reconcile(true);
        return;
      }
      if (!hasRetryableTask(messages, todos, false, historyEntries)) return;
      sessionResponse.clearFailure();
      draft = input;
      const continuation = submit(t("activity.continuePrompt"), [], [], sessionId);
      input = draft;
      sessionDrafts[sessionId] = draft;
      await continuation;
    } catch (error) {
      setSessionRuntimeError(sessionId, error);
    } finally {
      if (draft !== undefined && activeSessionId === sessionId) {
        if (input === t("activity.continuePrompt")) input = draft;
        if (sessionDrafts[sessionId] === t("activity.continuePrompt")) sessionDrafts[sessionId] = draft;
      }
      continuingTask = false;
    }
  }

  async function cancel(): Promise<void> {
    if (!client || !activeSessionId || sessionResponse.phase === "stopping") return;
    const sessionId = activeSessionId;
    const selectionRequest = sessionSelectionRequest;
    const cancelClient = client;
    const prompt = activePrompt;
    if (prompt) cancelledPromptIds.add(prompt.pendingId);
    try {
      await sessionResponse.stop(async () => {
        const stopTimeoutMessage = t("errors.stopTimeout");
        await withTimeout(cancelClient.cancel(sessionId), 10_000, stopTimeoutMessage);
        const outcome = await withTimeout(
          confirmSessionStopped(async () => (await cancelClient.listSessions()).items, sessionId, { attempts: 20, delayMs: 250 }),
          10_000,
          stopTimeoutMessage,
        );
        if (outcome === "missing") throw new Error(t("errors.sessionUnavailable"));
        if (outcome === "running") throw new Error(stopTimeoutMessage);
        return false;
      });
      if (activeSessionId === sessionId && selectionRequest === sessionSelectionRequest && !sending) {
        const stopped = interruptRunningTools({ messages: messages.map((item) => (item.pending ? { ...item, pending: false } : item)), todos });
        messages = stopped.messages.filter(hasMessageContent);
        todos = stopped.todos;
        const pending = pendingInteractionsBySession[sessionId];
        if (pending) {
          const nextBusy = { ...busyInteractions };
          if (pending.approval) delete nextBusy[pending.approval.rpcId];
          if (pending.question) delete nextBusy[pending.question.rpcId];
          busyInteractions = nextBusy;
        }
        pendingInteractionsBySession = clearPendingSession(pendingInteractionsBySession, sessionId);
      }
    } catch (error) {
      if (activeSessionId === sessionId && selectionRequest === sessionSelectionRequest) setSessionRuntimeError(sessionId, error);
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
        if (runtimeError === t("errors.noApiKey") || runtimeError.includes("API Key") || runtimeError.includes("凭据") || runtimeError.startsWith("当前模型需要 ")) {
          runtimeError = "";
        }
        if (sessionErrors[sessionId] && (sessionErrors[sessionId] === t("errors.noApiKey") || sessionErrors[sessionId]?.includes("API Key") || sessionErrors[sessionId]?.includes("凭据"))) {
          const { [sessionId]: _cleared, ...remaining } = sessionErrors;
          sessionErrors = remaining;
        }
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
    try {
      const selected = await window.voltDesktop?.pickWorkspace();
      if (!selected || !client) return;
      await client.createWorkspace(selected);
      await refresh();
      await refreshManagement();
      managementNotice = t("workspaces.registeredNotice");
    } catch (error) {
      runtimeError = userFacingError(error);
    }
  }

  async function performManagementAction(key: string, action: () => Promise<void>): Promise<boolean> {
    if (managementBusy) return false;
    managementBusy = key;
    managementError = "";
    managementNotice = "";
    const actionClient = client;
    const actionSession = activeSessionId;
    const actionTab = managementTab;
    const actionView = view;
    try {
      await action();
      return true;
    } catch (error) {
      if (client === actionClient && activeSessionId === actionSession && managementTab === actionTab && view === actionView) {
        managementError = userFacingError(error);
      }
      return false;
    } finally { managementBusy = ""; }
  }

  function recordSessionOperation(kind: SessionOperation["kind"], sessionId: string, title: string): string {
    const id = crypto.randomUUID();
    sessionOperations = [{ id, kind, sessionId, title, time: Date.now() }, ...sessionOperations].slice(0, 50);
    managementNotice = t("activity.operationNotice", { action: t(`activity.actions.${kind}`), title });
    return id;
  }

  function updateSessionOperationTitle(id: string, title: string): void {
    const operation = sessionOperations.find((entry) => entry.id === id);
    if (!operation) return;
    const action = t(`activity.actions.${operation.kind}`);
    sessionOperations = sessionOperations.map((entry) => entry.id === id ? { ...entry, title } : entry);
    if (managementNotice === t("activity.operationNotice", { action, title: operation.title })) {
      managementNotice = t("activity.operationNotice", { action, title });
    }
  }

  function beginSessionRename(session: SessionSummary): void {
    editingSessionId = session.sessionId;
    sessionTitleDraft = sessionTitle(session);
  }

  async function saveSessionRename(sessionId: string): Promise<void> {
    const title = sessionTitleDraft.trim();
   if (!client || !title) return;
   await performManagementAction(`session-rename:${sessionId}`, async () => {
     const renamed = await client!.rename(sessionId, title);
     recordSessionOperation("renamed", sessionId, renamed.title);
     editingSessionId = "";
     await refresh();
   });
 }

 async function duplicateSession(sessionId: string): Promise<void> {
   if (!client) return;
   const actionClient = client;
   const selectionRequest = sessionSelectionRequest;
   const actionView = view;
   const source = sessions.find((item) => item.sessionId === sessionId);
   const title = `${source ? sessionTitle(source) : t("nav.sessions")}${t("session.copySuffix")}`;
   await performManagementAction(`session-fork:${sessionId}`, async () => {
     const created = await actionClient.fork(sessionId);
     const operationId = recordSessionOperation("forked", created.sessionId, created.sessionId);
     const renamed = await actionClient.rename(created.sessionId, title);
     updateSessionOperationTitle(operationId, renamed.title);
     if (client !== actionClient) return;
     await refresh();
     if (client === actionClient && selectionRequest === sessionSelectionRequest && view === actionView) await selectSession(created.sessionId);
   });
 }

 async function forkSessionAtSeq(seq: number): Promise<void> {
   if (!client || !activeSessionId) return;
   const actionClient = client;
   const sourceSessionId = activeSessionId;
   const selectionRequest = sessionSelectionRequest;
   const actionView = view;
   await performManagementAction(`session-fork:${activeSessionId}:${seq}`, async () => {
     const created = await actionClient.fork(sourceSessionId, seq);
     const operationId = recordSessionOperation("forked", created.sessionId, created.sessionId);
     const listed = await actionClient.listSessions();
     const forked = listed.items.find((entry) => entry.sessionId === created.sessionId);
     if (forked) updateSessionOperationTitle(operationId, sessionTitle(forked));
     if (client !== actionClient) return;
     await refresh();
     if (client === actionClient && selectionRequest === sessionSelectionRequest && view === actionView) await selectSession(created.sessionId);
   });
 }

 async function deleteManagedSession(sessionId: string): Promise<void> {
   const session = sessions.find((session) => session.sessionId === sessionId);
   if (!client || !session || session.running || managementBusy || confirmingSessionId !== sessionId) return;
   confirmingSessionId = "";
   const deleted = await performManagementAction(`session-delete:${sessionId}`, async () => {
     await client!.archiveSession(sessionId);
     recordSessionOperation("deleted", sessionId, sessionTitle(session));
     sessions = sessions.filter((item) => item.sessionId !== sessionId);
     archivedSessionIds = [...new Set([...archivedSessionIds, sessionId])];
     if (activeSessionId === sessionId) {
       sessionSelectionRequest += 1;
       activeSessionId = "";
       input = "";
       streamRenderScheduler.clear();
       streamRenderSessionId = "";
       streamRenderPending = undefined;
       messages = [];
       todos = [];
       historyEntries = [];
       historyHasMore = false;
       historyLoading = false;
       historyLoad = undefined;
       sessionResponse.dispose();
     }
     pendingInteractionsBySession = clearPendingSession(pendingInteractionsBySession, sessionId);
     delete sessionDrafts[sessionId];
     delete draftFilesBySession[sessionId];
     clearAttachmentFiles(sessionId);
     await refresh();
     lastArchivedSessionId = sessionId;
     managementNotice = t("session.archiveSuccess");
   });
   if (!deleted && managementError && view === "conversation") runtimeError = managementError;
 }

/**
 * 活跃会话的「删除会话」（#370）：先归档（数据安全策略不变），再永久删除本地会话日志。
 * 与归档的区别写进确认文案：不可恢复、但工作区文件与项目记忆不受影响。
 */
async function deleteSessionPermanently(sessionId: string): Promise<void> {
  const api = window.voltDesktop;
  const session = sessions.find((item) => item.sessionId === sessionId);
  if (!client || !api || !desktopFeatures.permanentSessionDeletion || !session || session.running || managementBusy || confirmingDeleteSessionId !== sessionId) return;
  confirmingDeleteSessionId = "";
  const deleted = await performManagementAction(`session-purge-active:${sessionId}`, async () => {
    await client!.archiveSession(sessionId);
    await api.deleteArchivedSession(sessionId);
    recordSessionOperation("purged", sessionId, sessionTitle(session));
    allSessions = allSessions.filter((item) => item.sessionId !== sessionId);
    archivedSessionIds = archivedSessionIds.filter((id) => id !== sessionId);
    if (activeSessionId === sessionId) {
      sessionSelectionRequest += 1;
      activeSessionId = "";
      input = "";
      streamRenderScheduler.clear();
      streamRenderSessionId = "";
      streamRenderPending = undefined;
      messages = [];
      todos = [];
      historyEntries = [];
      historyHasMore = false;
      historyLoading = false;
      historyLoad = undefined;
      sessionResponse.dispose();
    }
    pendingInteractionsBySession = clearPendingSession(pendingInteractionsBySession, sessionId);
    delete sessionDrafts[sessionId];
    delete draftFilesBySession[sessionId];
    clearAttachmentFiles(sessionId);
    await refresh();
    managementNotice = t("session.deleteForeverSuccess");
  });
  if (!deleted && managementError && view === "conversation") runtimeError = managementError;
}

/** 撤销归档：把刚归档的会话恢复到列表（#371）。 */
async function undoArchiveSession(): Promise<void> {
  const sessionId = lastArchivedSessionId;
  if (!sessionId || !client || managementBusy) return;
  lastArchivedSessionId = "";
  await performManagementAction(`session-undo-archive:${sessionId}`, async () => {
    const result = await client!.unarchiveSession(sessionId);
    archivedSessionIds = result.archivedSessionIds;
    await refresh();
    managementNotice = t("session.archiveUndone");
  });
}

/** 清空本对话（#373）：删除当前会话的对话记录，工作区文件与项目记忆不受影响。 */
async function clearActiveConversation(): Promise<void> {
  const sessionId = activeSessionId;
  const api = window.voltDesktop;
  if (!client || !api || !desktopFeatures.permanentSessionDeletion || !sessionId || sending || !confirmingClearConversation) return;
  confirmingClearConversation = false;
  const session = allSessions.find((item) => item.sessionId === sessionId);
  await performManagementAction(`session-clear:${sessionId}`, async () => {
    await client!.archiveSession(sessionId);
    await api.deleteArchivedSession(sessionId);
    archivedSessionIds = archivedSessionIds.filter((id) => id !== sessionId);
    allSessions = allSessions.filter((item) => item.sessionId !== sessionId);
    recordSessionOperation("purged", sessionId, session ? sessionTitle(session) : sessionId);
    await refresh();
    const created = await client!.createSession();
    activeSessionId = created.sessionId;
    messages = [];
    todos = [];
    historyEntries = [];
    historyHasMore = false;
    historyLoading = false;
    input = "";
    managementNotice = t("session.clearConversationSuccess");
    await refresh();
  });
}

 async function restoreArchivedSession(sessionId: string): Promise<void> {
   const session = archivedSessions.find((item) => item.sessionId === sessionId);
   if (!client || managementBusy) return;
   await performManagementAction(`session-restore:${sessionId}`, async () => {
     const result = await client!.unarchiveSession(sessionId);
     archivedSessionIds = result.archivedSessionIds;
     recordSessionOperation("restored", sessionId, session ? sessionTitle(session) : sessionId);
     await refresh();
     managementNotice = t("session.restoreSuccess");
   });
 }

 async function purgeArchivedSession(sessionId: string): Promise<void> {
   const api = window.voltDesktop;
   const session = archivedSessions.find((item) => item.sessionId === sessionId);
   if (!client || !api || !desktopFeatures.permanentSessionDeletion || managementBusy || confirmingArchivedSessionId !== sessionId) return;
   confirmingArchivedSessionId = "";
   await performManagementAction(`session-purge:${sessionId}`, async () => {
     await api.deleteArchivedSession(sessionId);
     recordSessionOperation("purged", sessionId, session ? sessionTitle(session) : sessionId);
     await refresh();
     allSessions = allSessions.filter((item) => item.sessionId !== sessionId);
     archivedSessionIds = archivedSessionIds.filter((id) => id !== sessionId);
     managementNotice = t("session.purgeSuccess");
   });
 }

 async function cleanupArchivedSessions(): Promise<void> {
   const api = window.voltDesktop;
   if (!client || !api || !desktopFeatures.permanentSessionDeletion || managementBusy || !confirmingArchivedCleanup) return;
   const targets = archivedSessions.filter((session) => !session.running);
   confirmingArchivedCleanup = false;
   if (targets.length === 0) return;
   await performManagementAction("session-cleanup", async () => {
     let deleted = 0;
     let failed = 0;
     for (const session of targets) {
       try {
         await api.deleteArchivedSession(session.sessionId);
         deleted += 1;
         recordSessionOperation("purged", session.sessionId, sessionTitle(session));
       } catch {
         failed += 1;
       }
     }
     await refresh();
     const removed = new Set(targets.map((session) => session.sessionId));
     allSessions = allSessions.filter((item) => !removed.has(item.sessionId));
     archivedSessionIds = archivedSessionIds.filter((id) => !removed.has(id));
     managementNotice = t("session.cleanupNotice", { count: deleted });
     if (failed > 0) throw new Error(t("session.cleanupPartial", { deleted, failed }));
   });
 }

 function downloadConversationMarkdown(): void {
   if (messages.length === 0) return;
   const markdown = messagesToMarkdown(buildTranscriptView(messages).aiMessages);
   const blob = new Blob([markdown], { type: "text/markdown" });
   const url = URL.createObjectURL(blob);
   const link = document.createElement("a");
   link.href = url;
   link.download = `${productName}-conversation.md`;
   document.body.append(link);
   link.click();
   link.remove();
   URL.revokeObjectURL(url);
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
    const sessionId = workspace.sessionIds.find((id) => sessions.some((item) => item.sessionId === id));
    if (sessionId) await selectSession(sessionId);
    else await createSession({ workspaceId: workspace.workspaceId });
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
    const parentSessionId = activeSessionId;
    const historyClient = client;
    const requestId = ++subagentHistoryRequest;
    const selectionRequest = sessionSelectionRequest;
    const requestedTab = managementTab;
    const requestedView = view;
    const isCurrent = () => client === historyClient && activeSessionId === parentSessionId
      && selectionRequest === sessionSelectionRequest && requestId === subagentHistoryRequest
      && selectedSubagentId === entry.id && managementTab === requestedTab && view === requestedView;
    if (selectedSubagentId !== entry.id) subagentMessages = [];
    selectedSubagentId = entry.id;
    managementError = "";
    try {
      const result = await historyClient.subagentHistory(parentSessionId, entry.id, entry.mode);
      if (!isCurrent()) return;
      subagentMessages = foldHistory(result.events).messages;
    } catch (error) {
      if (isCurrent()) managementError = userFacingError(error);
    }
  }

  async function promptSelectedSubagent(): Promise<void> {
    const text = subagentPromptDraft.trim();
    if (!client || !activeSessionId || !selectedSubagent || selectedSubagent.kind !== "child" || selectedSubagent.mode !== "continuable" || !text) return;
    if (!subagentParentAvailable) { managementError = t("subagents.parentUnavailable"); return; }
    const promptClient = client;
    const parentSessionId = activeSessionId;
    const childSessionId = selectedSubagent.id;
    await performManagementAction("subagent-prompt:" + selectedSubagent.id, async () => {
      await promptClient.promptSubagent(parentSessionId, childSessionId, text);
      if (client !== promptClient || activeSessionId !== parentSessionId || selectedSubagentId !== childSessionId || managementTab !== "subagents") return;
      if (subagentPromptDraft.trim() === text) subagentPromptDraft = "";
      await refreshManagement();
      managementNotice = t("subagents.continuedNotice");
    });
  }

  async function interruptSelectedSubagent(): Promise<void> {
    if (!client || !activeSessionId || !selectedSubagent || selectedSubagent.kind !== "child" || selectedSubagent.mode !== "continuable") return;
    const interruptClient = client;
    const parentSessionId = activeSessionId;
    const childSessionId = selectedSubagent.id;
    await performManagementAction("subagent-interrupt:" + selectedSubagent.id, async () => {
      await interruptClient.interruptSubagent(parentSessionId, childSessionId);
      if (client !== interruptClient || activeSessionId !== parentSessionId || selectedSubagentId !== childSessionId || managementTab !== "subagents") return;
      await refreshManagement();
      managementNotice = t("subagents.stopSentNotice");
    });
  }

  function selectedSettingsNamespace(): SettingsNamespace | undefined {
    return settingsNamespaces.find((item) => item.ns === selectedSettingsNs) || settingsNamespaces[0];
  }

  function switchSettingsSection(section: SettingsSection): void {
    settingsSection = section;
    settingsQuery = "";
    if (section === "models") void ensureManagementComponents(["provider"]);
  }

  function selectSettingsNamespace(ns: string): void {
    switchSettingsSection("advanced");
    selectedSettingsNs = ns;
    rawSettingsOpen = true;
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
      // 高级 JSON 也能改外部知识源：写完必须重算指纹，否则旧验证结论会被沿用到新配置上。
      if (updated.ns === "weknora") await refreshExternalKnowledgeState();
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
      // 轮换凭据同样会改变鉴权结果：指纹只看「是否已配置」，同 ref 换 key 不会变，必须显式作废。
      await refreshExternalKnowledgeState();
      if (ref === externalKnowledgeKeyRef) invalidateExternalKnowledgeVerification();
      userSavedCredentialRefs = new Set([...userSavedCredentialRefs, ref]);
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

  async function resetBundledModelCredential(): Promise<void> {
    const ref = "XG_GOMODEL_API_KEY";
    const shell = window.voltDesktop;
    if (!client || !shell) return;
    const reset = await performManagementAction("credential-reset:" + ref, async () => {
      const result = await shell.resetBundledModelCredential();
      if (!result.available) throw new Error(t("settings.bundledCredentialUnavailable"));
      if (!result.reset) throw new Error(t("settings.bundledCredentialResetFailed"));
      credentials = { ...credentials, ...(await client!.describeCredentials([ref])).credentials };
      if (!credentialRefs.includes(ref)) credentialRefs = [...credentialRefs, ref].sort();
      clearCredentialRequirementError();
      managementNotice = t("settings.bundledCredentialRestored");
    });
    if (!reset) return;
    await refreshXgGatewayModels();
    if (managementError) managementNotice = t("settings.credentialRestoredModelFailed");
    else managementNotice = t("settings.bundledCredentialRestored");
  }

  function clearCredentialRequirementError(): void {
    if (!runtimeError.includes("API Key") && !runtimeError.includes("401") && !runtimeError.includes("凭据") && !runtimeError.includes("认证失败") && !runtimeError.startsWith("当前模型需要 ")) return;
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
      // 先刷新外部知识源状态：凭据回读失败不能连带跳过验证作废。
      await refreshExternalKnowledgeState();
      if (ref === externalKnowledgeKeyRef) invalidateExternalKnowledgeVerification();
      credentials = { ...credentials, ...(await client!.describeCredentials([ref])).credentials };
      confirmingCredentialRef = "";
      managementNotice = t("settings.credentialRemovedNotice");
    });
  }

  async function respondApproval(outcome: "allowed-once" | "rejected"): Promise<void> {
    if (!client || !pendingApproval || interactionBusy) return;
    const request = pendingApproval;
    busyInteractions[request.rpcId] = true;
    try {
      await client.respond({ type: "client-response", rpcId: request.rpcId, result: { ok: true, value: { sessionId: request.sessionId, approvalId: request.approvalId, outcome } } });
      resolveInteraction("approval", request.sessionId, request.rpcId);
    } catch (error) {
      if (pendingInteractionsBySession[request.sessionId]?.approval?.rpcId === request.rpcId) setSessionRuntimeError(request.sessionId, error);
    } finally {
      delete busyInteractions[request.rpcId];
    }
  }

  async function respondQuestion(): Promise<void> {
    if (!client || !pendingQuestion || interactionBusy) return;
    if (!questionsAnswered(pendingQuestion.questions, questionAnswers)) return;
    const answers = buildQuestionAnswers(pendingQuestion.questions, questionAnswers);
    const request = pendingQuestion;
    busyInteractions[request.rpcId] = true;
    try {
      await client.respond({ type: "client-response", rpcId: request.rpcId, result: { ok: true, value: { sessionId: request.sessionId, answer: { answers } } } });
      resolveInteraction("question", request.sessionId, request.rpcId);
    } catch (error) {
      if (pendingInteractionsBySession[request.sessionId]?.question?.rpcId === request.rpcId) setSessionRuntimeError(request.sessionId, error);
    } finally {
      delete busyInteractions[request.rpcId];
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
    return credentialStatusLabel(credentials[ref], { ref }, t);
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
    const componentNames: ManagementComponentName[] = tab === "settings"
      ? ["provider"]
      : tab === "plugins"
        ? ["plugin"]
        : tab === "mcp"
          ? ["mcp"]
          : tab === "extensions"
            ? ["extensions"]
          : tab === "knowledge"
            ? ["externalKnowledge", "knowledgeSkill", "knowledgeScope"]
            : tab === "skills"
              ? ["skillStore"]
              : tab === "automation"
                ? ["automation"]
          : [];
    if (componentNames.length) void ensureManagementComponents(componentNames);
    void refreshManagement();
  }
  // 扩展能力是一级入口（#360）：直接进管理页的该页签，不再要求「设置 → 管理工具」三步。
  function openExtensions(): void {
    openManagement("extensions");
  }
  const extensionsViewActive = $derived(view === "settings" && managementTab === "extensions");
  function openManagement(tab: ManagementTab): void {
    closeMobileSidebar(false);
    view = "settings";
    void tick().then(() => document.getElementById("workbench-content")?.focus());
    switchManagementTab(tab);
  }
  function dismissCustomizationPanel(): void {
    if (customizationOpen && !customizationDraft) customizationOpen = false;
  }
  // 界面设置是低频工具：切换会话后自动收起，避免长期占据对话区首屏（#343）。
  let customizationSessionId = "";
  $effect(() => {
    const current = activeSessionId;
    if (customizationSessionId && current !== customizationSessionId) {
      // 先清掉待确认的方案再收起，否则 dismissCustomizationPanel 会因 draft 存在而跳过。
      customizationDraft = undefined;
      customizationOpen = false;
      // 空会话建议按当前会话的工作区重新分类，先回到默认再按新路径判定。
      workspaceKind = "documents";
    }
    customizationSessionId = current;
  });
  // 知识库页面也可以直接打开（不经过管理页签），这里独立刷新一次外部源可用性（#348）。
  // 读取失败保持 unknown：只有明确的负面证据才判 unavailable，避免把可用的外部源误锁住。
  /** 显式作废外部知识源的「本次已验证」结论（凭据轮换等指纹看不出来的变化）。 */
  function invalidateExternalKnowledgeVerification(): void {
    externalKnowledgeVerifiedEpoch += 1;
    externalKnowledgeVerified = false;
    externalKnowledgeSignature = "";
    if (knowledgeScope !== "local") knowledgeScope = "local";
  }

  async function refreshExternalKnowledgeState(): Promise<void> {
    const activeClient = client;
    if (!activeClient) return;
    // 竞态保护：如果刷新期间用户刚通过了连接测试，本次读到的旧配置不得覆盖新结论。
    const verifiedEpoch = externalKnowledgeVerifiedEpoch;
    // 刷新期间旧结论不再可信，先回到 unknown，防止沿用过期的 ready/unavailable。
    externalKnowledgeState = "unknown";
    let settings: Awaited<ReturnType<DshClient["describeSettings"]>>;
    try {
      settings = await activeClient.describeSettings();
    } catch {
      return;
    }
    if (client !== activeClient) return;
    const weknora = settings.namespaces.find((item) => item.ns === "weknora")?.value as Record<string, unknown> | undefined;
    const keyRef = typeof weknora?.apiKeyRef === "string" && weknora.apiKeyRef ? weknora.apiKeyRef : "WEKNORA_API_KEY";
    externalKnowledgeKeyRef = keyRef;
    let plugins: Awaited<ReturnType<DshClient["listPluginInventory"]>> | undefined;
    try {
      plugins = await activeClient.listPluginInventory();
    } catch {
      plugins = undefined;
    }
    if (client !== activeClient) return;
    let credential: { configured?: boolean } | undefined;
    let credentialLookupFailed = false;
    if (weknora) {
      try {
        const described = await activeClient.describeCredentials([keyRef]);
        if (client !== activeClient) return;
        credential = described.credentials?.[keyRef];
      } catch {
        credentialLookupFailed = true;
      }
    }
    const plugin = plugins?.entries?.find((item) => item.moduleName === "@wxg-prc-cpg/dsh-weknora");
    externalKnowledgeState = externalKnowledgeStateFrom({
      namespace: weknora,
      plugin,
      credential,
      pluginLookupFailed: plugins === undefined,
      credentialLookupFailed,
    });
    // 凭据读取失败时不要把它当成「凭据没了」，否则一次瞬时失败就等于作废验证结论。
    const signature = credentialLookupFailed
      ? externalKnowledgeSignature
      : externalSourceSignature(weknora, credential?.configured === true);
    if (signature !== externalKnowledgeSignature) {
      if (externalKnowledgeVerifiedEpoch !== verifiedEpoch && externalKnowledgeVerified) return;
      // 地址、租户、知识库范围或凭据变了：旧的成功结论不再成立，必须重新测试连接。
      // 注意这里不回写 externalKnowledgeSignature 给设置页当作「已验证」，只清空结论。
      externalKnowledgeSignature = signature;
      externalKnowledgeVerified = false;
    }
    if (externalScopeState({ state: externalKnowledgeState, verifiedInSession: externalKnowledgeVerified }) === "local-only" && knowledgeScope !== "local") {
      knowledgeScope = "local";
    }
  }
  function openKnowledge(): void {
    closeMobileSidebar(false);
    view = "knowledge";
    focusKnowledgePage();
    managementError = "";
    managementNotice = "";
    void ensureManagementComponents(["externalKnowledge", "knowledgeSkill", "knowledgeScope"]);
    void refreshExternalKnowledgeState();
    void refreshManagement();
  }
  // 知识库由多个独立滚动区组成，进入页面时统一回到顶部，避免停留在上一次的旧位置。
  function focusKnowledgePage(): void {
    void tick().then(() => {
      const page = document.querySelector<HTMLElement>(".knowledge-page");
      if (page) page.scrollTop = 0;
      document.getElementById("workbench-content")?.focus();
    });
  }
  function openKnowledgePrompt(prompt: string): void { input = prompt; view = "conversation"; }
  const KNOWLEDGE_INDEX_STORAGE_PREFIX = "volt_knowledge_index_v1:";

  function knowledgeStorageKey(path: string): string {
    return `${KNOWLEDGE_INDEX_STORAGE_PREFIX}${path}`;
  }

  function syncKnowledgeForWorkspace(path: string): void {
    if (path === knowledgeRoot) return;
    knowledgeRoot = path;
    if (!path) {
      knowledgeIndex = { state: "idle", status: "failed", files: 0, chunks: 0, failures: [] };
      return;
    }
    let stored: Partial<KnowledgeIndexReport> | undefined;
    try {
      const raw = localStorage.getItem(knowledgeStorageKey(path));
      stored = raw ? JSON.parse(raw) as Partial<KnowledgeIndexReport> : undefined;
    } catch {
      stored = undefined;
    }
    const status = stored?.status;
    knowledgeIndex = {
      state: status === "ready" || status === "partial" || status === "failed" ? status : "idle",
      status: status === "ready" || status === "partial" ? status : "failed",
      root: typeof stored?.root === "string" ? stored.root : path,
      files: typeof stored?.files === "number" ? stored.files : 0,
      ...(typeof stored?.indexed === "number" ? { indexed: stored.indexed } : {}),
      ...(typeof stored?.skipped === "number" ? { skipped: stored.skipped } : {}),
      chunks: typeof stored?.chunks === "number" ? stored.chunks : 0,
      ...(typeof stored?.placeholders === "number" ? { placeholders: stored.placeholders } : {}),
      failures: Array.isArray(stored?.failures) ? stored.failures.filter((item): item is string => typeof item === "string") : [],
      ...(typeof stored?.updatedAt === "string" ? { updatedAt: stored.updatedAt } : {}),
    };
  }

  function persistKnowledgeSnapshot(path: string, snapshot: KnowledgeIndexReport & { state: string }): void {
    if (!path) return;
    try {
      localStorage.setItem(knowledgeStorageKey(path), JSON.stringify({
        status: snapshot.status,
        root: snapshot.root ?? path,
        files: snapshot.files ?? 0,
        ...(snapshot.indexed === undefined ? {} : { indexed: snapshot.indexed }),
        ...(snapshot.skipped === undefined ? {} : { skipped: snapshot.skipped }),
        chunks: snapshot.chunks ?? 0,
        ...(snapshot.placeholders === undefined ? {} : { placeholders: snapshot.placeholders }),
        failures: snapshot.failures ?? [],
        updatedAt: snapshot.updatedAt ?? new Date().toISOString(),
      }));
    } catch {
      // 本地持久化不可用时保留当前会话内的报告。
    }
  }

  const knowledgeMetrics = $derived.by<MetricStripItem[]>(() => [
    { id: "files", label: t("knowledge.statSearchableFiles"), value: knowledgeSummary.indexed, tone: "info", badge: { text: t("knowledge.filesUnit") } },
    { id: "chunks", label: t("knowledge.statIndex"), value: knowledgeSummary.searchableChunks, tone: "primary", badge: { text: t("knowledge.chunksUnit") } },
    { id: "skills", label: t("knowledge.statSkill"), value: skills.length, tone: "success", badge: { text: t("knowledge.callableCapabilities") } },
    {
      id: "state",
      label: t("knowledge.statPersistent"),
      value: knowledgeStatusLabel(),
      tone: knowledgeIndex.state === "failed" ? "danger" : knowledgeIndex.state === "building" ? "warning" : knowledgeIndex.state === "ready" ? "success" : "default",
    },
  ]);

  function knowledgeStatusLabel(): string {
    if (knowledgeIndex.state === "building") return t("knowledge.indexing");
    if (knowledgeIndex.state === "ready") return t("knowledge.indexReady");
    if (knowledgeIndex.state === "partial") return t("knowledge.indexPartialCounts", { indexed: knowledgeSummary.indexed, skipped: knowledgeSummary.skipped });
    if (knowledgeIndex.state === "failed") return t("knowledge.indexFailed");
    return workspacePath ? t("knowledge.statusLocalReady") : t("knowledge.statusLocalWaiting");
  }
  async function ensureKnowledgeSession(): Promise<boolean> {
    if (activeSessionId) return true;
    await createSession(workspacePath);
    return !!activeSessionId;
  }
  async function runKnowledgeOperation(operation: KnowledgeOperation, query = ""): Promise<void> {
    // 互斥锁必须最先置位：下面有多个 await，双击会在等待期间并发建会话并提交两次检索。
    if (sending || knowledgeQuerying || knowledgeOperation || !client) return;
    const normalizedQuery = query.trim();
    if (operation === "query" && !normalizedQuery) return;
    knowledgeQuerying = operation === "query";
    knowledgeOperation = operation;
    let submitted = false;
    try {
      const hadSession = !!activeSessionId;
      if (!(await ensureKnowledgeSession())) return;
      if (operation === "query" && !hadSession) knowledgeSessionNotice = t("knowledge.querySessionCreated");
      if (operation === "query" && knowledgeScope !== "local" && !externalKnowledgeVerified) {
        await refreshExternalKnowledgeState();
        if (!externalKnowledgeVerified) {
          knowledgeScope = "local";
          managementNotice = t("knowledge.externalNeedsVerification");
        }
      }
      // 外部源状态未确认时不能默认它可用：先刷新一次，仍无法确认就退回本地检索。
      // 只有明确 unavailable 才禁用范围选择，避免把「读不到设置」误锁成不可用（#348）。
      if (operation === "query" && knowledgeScope !== "local" && externalKnowledgeState === "unknown") {
        await refreshExternalKnowledgeState();
        if (externalKnowledgeState === "unknown") {
          knowledgeScope = "local";
          managementNotice = t("knowledge.externalStateUnknownFallback");
        }
      }
      if (!client) return;
      if (operation === "query") {
        knowledgeQueryAnswer = "";
        knowledgeQueryFinished = false;
        knowledgeQueryStartIndex = messages.length;
        knowledgeQuerySessionId = activeSessionId;
      }
      knowledgeIndex = {
        ...knowledgeIndex,
        ...(operation === "query" ? {} : { state: "building" as const }),
        ...(operation === "query" ? { query: normalizedQuery, matches: undefined } : {}),
        ...(operation !== "query" ? { root: workspacePath, failures: [] } : {}),
      };
      const prompt = buildKnowledgePrompt(operation, workspacePath, normalizedQuery, knowledgeScope);
      // 先切到知识库页再提交，且提交过程不把视图切回会话：结果就地呈现（#353）。
      view = "knowledge";
      focusKnowledgePage();
      await submit(prompt, [], [], activeSessionId, { keepView: true });
      submitted = true;
    } catch (error) {
      knowledgeOperation = "";
      knowledgeQuerying = false;
      knowledgeIndex = { ...knowledgeIndex, state: "failed", failures: [userFacingError(error)] };
      persistKnowledgeSnapshot(workspacePath, knowledgeIndex);
    } finally {
      // 未真正提交（没有会话、客户端断开等）时释放互斥，避免界面卡在“正在检索”。
      if (!submitted) {
        knowledgeOperation = "";
        knowledgeQuerying = false;
      }
    }
  }
  $effect(() => {
    syncKnowledgeForWorkspace(workspacePath);
  });
  // 检索轮结束：把答案就地留在知识库页面，而不是只丢进新建的会话里（#344）。
  $effect(() => {
    if (!knowledgeQuerying || sending) return;
    const answer = messages.slice(knowledgeQueryStartIndex)
      .find((message) => message.role === "assistant" && (message.text ?? "").trim());
    knowledgeQueryAnswer = stripKnowledgeArtifacts(answer?.text ?? "").trim();
    knowledgeQueryFinished = true;
    knowledgeQuerying = false;
    knowledgeOperation = "";
  });

  // 提交后立刻把新消息滚进视野（#335）：只有在用户本来就停在最新位置时才抢滚动，
  // 用户向上翻阅时保留原位，由消息区的“回到最新”按钮接管。
  function transcriptAtLatest(): boolean {
    const scroller = document.querySelector<HTMLElement>(".conversation-root .message-scroll");
    if (!scroller) return false;
    return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
  }
  function scrollTranscriptToLatest(): void {
    void tick().then(() => {
      const scroller = document.querySelector<HTMLElement>(".conversation-root .message-scroll");
      if (!scroller) return;
      scroller.scrollTop = scroller.scrollHeight;
    });
  }
  // 裸文件名（没有 Markdown 链接）也要可点击：在工作区根目录按名字定位后打开（#355）。
  async function openWorkspaceFileByName(name: string): Promise<void> {
    const activeClient = client;
    const root = workspacePath.trim();
    const trimmed = name.trim();
    if (!activeClient || !root || !trimmed || /[\\/]/u.test(trimmed)) return;
    const separator = /[\\/]$/u.test(root) ? "" : /\\/u.test(root) ? "\\" : "/";
    try {
      await activeClient.openPath(`${root}${separator}${trimmed}`);
    } catch {
      managementNotice = t("transcript.openFileFailed");
    }
  }
  function permissionNotice(message: string): void { managementNotice = message; }
</script>

{#snippet managementComponentFallback(name: ManagementComponentName)}
  {#if managementComponentErrors[name]}
    <div class="management-load-error" role="alert">
      <p>{managementComponentErrors[name]}</p>
      <Button variant="outline" size="sm" onclick={() => void ensureManagementComponents([name])}><RotateCcw size={13} />{t("common.retry")}</Button>
    </div>
  {:else}
    <Loader size={18} />
  {/if}
{/snippet}

<svelte:head><title>{productName}</title></svelte:head>
<ModeWatcher defaultMode="light" disableHeadScriptInjection />
<svelte:window bind:innerWidth={viewportWidth} onkeydown={handleGlobalKeydown} />

<svelte:boundary onerror={(error) => console.error("[VoltUI] Workbench render failed", error)}>
{#if loading}
  <main class="loading-screen"><Loader size={24} label={t("app.connecting")} /><strong>{networkModeBusy ? t("settings.networkModeRestarting") : t("app.connecting")}</strong><span>{t("app.startupProgress")}</span></main>
{:else if !client && runtimeConnectionError}
  <main class="startup-failure-screen">
    <div class="startup-failure-icon"><CircleAlert size={22} /></div>
    <h1>{t("app.startupFailed")}</h1>
    <p>{t("app.startupFailedDesc")}</p>
    <pre>{runtimeConnectionError}</pre>
    <Button variant="outline" disabled={runtimeRetrying} onclick={() => void retryRuntime()}><RotateCcw size={14} />{t("common.retry")}</Button>
  </main>
{:else}
  <main class="app-shell" class:compact={customization.density === "compact"} inert={initializingSession} aria-busy={initializingSession}>
    <header class:sidebar-collapsed={!sidebarExpanded} class:conversation-topbar={view === "conversation"} class="topbar" inert={viewportWidth <= 760 && mobileSidebarOpen}>
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
        {/if}
      </div>
      <div class="topbar-actions">
        {#if view !== "conversation"}
          <Button variant="ghost" size="sm" class="topbar-action-btn" title={t("app.backToConversation")} onclick={() => view = "conversation"}>
            <MessageSquare size={14} />
            <span class="topbar-btn-label">{t("app.backToConversation")}</span>
          </Button>
        {/if}
        {#if updateCheck?.status === "available"}
          <Button variant="outline" size="icon-sm" class="topbar-action-btn topbar-icon-btn update-available-btn" aria-label={t("updates.available", { version: updateCheck.latestVersion })} title={t("updates.available", { version: updateCheck.latestVersion })} onclick={() => void openUpdateDownload()}>
            <Download size={14} />
          </Button>
        {/if}
        <button id="activity-toggle" class="workbench-menu-trigger" popovertarget="workbench-menu" aria-label={t("composer.moreTools")} title={t("composer.moreTools")}><Ellipsis size={18} /></button>
        <div id="workbench-menu" class="workbench-menu" popover="auto">
          <button aria-pressed={view === "conversation" && activityOpen} onclick={() => { closeWorkbenchMenu(); setActivityOpen(view !== "conversation" || !activityOpen); view = "conversation"; }}><History size={16} />{t("activity.title")}</button>
          <button disabled={messages.length === 0} onclick={() => { closeWorkbenchMenu(); downloadConversationMarkdown(); }}><Download size={16} />{t("transcript.download")}</button>
          <button disabled={!desktopFeatures.permanentSessionDeletion || messages.length === 0 || sending} title={!desktopFeatures.permanentSessionDeletion ? t("session.permanentDeletionUnavailable") : undefined} onclick={() => { closeWorkbenchMenu(); confirmingClearConversation = true; }}><Trash2 size={16} />{t("session.clearConversation")}</button>
          <button onclick={() => { closeWorkbenchMenu(); openExtensions(); }}><Blocks size={16} />{t("nav.extensions")}</button>
          <button onclick={() => { closeWorkbenchMenu(); openKnowledge(); }}><BookOpen size={16} />{t("nav.knowledge")}</button>
          <button onclick={() => { closeWorkbenchMenu(); view = "conversation"; customizationOpen = !customizationOpen; }}><SlidersHorizontal size={16} />{t("app.uiCustomization")}</button>
          <button onclick={() => { closeWorkbenchMenu(); void refresh(); }}><RefreshCw size={16} />{t("common.refresh")}</button>
          <button onclick={() => { closeWorkbenchMenu(); openManagement("settings"); }}><Settings2 size={16} />{t("nav.settings")}</button>
          <div class="workbench-menu-preferences">
            <ThemeSelector />
            <button onclick={() => toggleLocale()} title={t("app.switchLanguage")}><Languages size={16} />{i18n.locale === "zh-CN" ? "EN" : "中文"}</button>
          </div>
        </div>
      </div>
    </header>
    <div class:management-active={view === "settings"} class:sidebar-collapsed={!sidebarExpanded} class:mobile-navigation-open={viewportWidth <= 760 && mobileSidebarOpen} class="workspace-layout">
      {#if viewportWidth <= 760 && mobileSidebarOpen}
        <button class="sidebar-backdrop" tabindex="-1" aria-label={t("app.collapseSidebar")} onclick={() => closeMobileSidebar()}></button>
      {/if}
      <aside class:collapsed={!sidebarExpanded} class:mobile-open={viewportWidth <= 760 && mobileSidebarOpen} class="sidebar" aria-label={t("nav.sessions")}>
        <div class="sidebar-toolbar">
          {#if sidebarExpanded}
            <Button variant="ghost" size="sm" class="sidebar-new-btn" onclick={() => void createSession()}>
              <MessageSquarePlus size={14} />
              <span>{t("session.newSession")}</span>
            </Button>
          {/if}
          <Button id="sidebar-toggle" variant="ghost" size="icon-sm" class="sidebar-collapse-btn" aria-expanded={sidebarExpanded} aria-controls="sidebar-navigation" aria-label={sidebarExpanded ? t("app.collapseSidebar") : t("app.expandSidebar")} title={sidebarExpanded ? t("app.collapseSidebar") : t("app.expandSidebar")} onclick={toggleSidebar}>
            {#if sidebarExpanded}<PanelLeftClose size={16} />{:else}<PanelLeftOpen size={16} />{/if}
          </Button>
        </div>
        {#if !sidebarExpanded}
          <div class="sidebar-collapsed-actions">
            <Button variant="ghost" size="icon-sm" aria-label={t("session.newSession")} title={t("session.newSession")} onclick={() => void createSession()}>
              <MessageSquarePlus size={16} />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={`${t("nav.extensions")} (${capabilitiesEnabledCount})`} title={t("nav.extensions")} onclick={openExtensions}><Blocks size={16} /></Button>
            <Button variant="ghost" size="icon-sm" aria-label={t("nav.knowledge")} title={t("nav.knowledge")} onclick={openKnowledge}><BookOpen size={16} /></Button>
            <Button variant="ghost" size="icon-sm" aria-label={t("nav.settings")} title={t("nav.settings")} onclick={() => openManagement("settings")}><Settings2 size={16} /></Button>
          </div>
        {/if}
        <div id="sidebar-navigation" class="sidebar-navigation" hidden={!sidebarExpanded}>
          <div class="workspace-picker"><div class="section-label">{t("session.sessionScope")}</div><button class="workspace-row" onclick={() => newSessionDialogOpen = true}><FolderOpen size={15} /><span title={activeWorkspace?.path || defaultChatDirectory || workspacePath}>{activeWorkspace?.title || t("session.ordinarySession")}</span><ChevronRight size={14} /></button></div>
          <div class="sidebar-search"><Search size={14} /><input bind:this={sessionSearchInput} aria-label={t("session.searchSessions")} placeholder={t("session.searchSessions")} title={sessionQuery || undefined} bind:value={sessionQuery} onkeydown={(event) => { if (event.key === "Escape" && sessionQuery) { event.stopPropagation(); sessionQuery = ""; } }} onblur={(event) => { event.currentTarget.scrollLeft = 0; }} />{#if sessionQuery}<button class="search-clear" aria-label={t("common.clear")} title={t("common.clear")} onclick={() => { sessionQuery = ""; sessionSearchInput?.focus(); }}><X size={13} /></button>{/if}</div>
          <Separator />
          <div class="session-list"><div class="section-label section-row"><span>{t("nav.sessions")}</span><span class="session-shortcut-hint" title={t("session.shortcutHint")}>{t("session.shortcutHintShort")}</span><span class="count-badge">{filteredSessions.length}</span></div>{#if filteredSessions.length === 0}<div class="sidebar-empty"><Search size={16} /><span>{sessionQuery ? t("session.noSearchResults") : t("session.emptyActive")}</span>{#if sessionQuery}<small>{t("session.noSearchResultsDesc")}</small><button class="search-empty-clear" onclick={() => { sessionQuery = ""; sessionSearchInput?.focus(); }}>{t("session.clearSearch")}</button>{:else}<small>{t("session.emptyActiveDesc")}</small>{/if}</div>{:else}{#each filteredSessions as session (session.sessionId)}
              {@const health = sessionHealth(session, !!sessionErrors[session.sessionId])}
              <div class:active={session.sessionId === activeSessionId && view === "conversation"} class="session-item">
              <button data-session-id={session.sessionId} title={sessionErrors[session.sessionId] || session.cwd || workspaceName} aria-current={session.sessionId === activeSessionId && view === "conversation" ? "page" : undefined} class="session-row" onclick={() => { closeMobileSidebar(); void selectSession(session.sessionId); }}>
                <span class="session-state" class:running={health === "running"} class:error={health === "error"} class:migration={health === "migration-required"} title={health === "migration-required" ? t("session.statusMigrationRequired") : undefined}></span>
                <span class="session-copy">
                  <strong>{sessionTitle(session)}</strong>
                  <small>{health === "migration-required" ? t("session.statusMigrationRequired") : projectNameForSession(session)}</small>
                </span>
                <span class="session-meta-wrap">
                  <time>{formatTime(session.updatedAt)}</time>
                </span>
              </button>
              <div class="session-item-actions">
                <button class="session-delete" disabled={session.running || !!managementBusy} aria-label={`${t("session.archiveSession")}: ${sessionTitle(session)}`} title={session.running ? t("session.runningActionUnavailable") : t("session.archiveSession")} onclick={() => confirmingSessionId = session.sessionId}><Archive size={14} /></button>
                <button class="session-delete session-purge" disabled={!desktopFeatures.permanentSessionDeletion || session.running || !!managementBusy} aria-label={`${t("session.deleteForever")}: ${sessionTitle(session)}`} title={!desktopFeatures.permanentSessionDeletion ? t("session.permanentDeletionUnavailable") : session.running ? t("session.runningActionUnavailable") : t("session.deleteForever")} onclick={() => confirmingDeleteSessionId = session.sessionId}><Trash2 size={14} /></button>
              </div>
              </div>
            {/each}{/if}
            {#if lastArchivedSessionId && !sessionQuery}
              <div class="session-undo" role="status">
                <span>{t("session.archiveSuccess")}</span>
                <Button variant="ghost" size="sm" onclick={() => void undoArchiveSession()}><RotateCcw size={13} />{t("session.archiveUndo")}</Button>
              </div>
            {/if}
            <div class="archived-sessions">
              <button class="archived-toggle" aria-expanded={archivedListOpen} aria-controls="sidebar-archived-list" onclick={() => { archivedListOpen = !archivedListOpen; }} title={t("session.archivedSectionTitle")}>
                <Archive size={14} />
                <span>{archivedListOpen ? t("session.archivedSectionCollapse") : t("session.archivedSectionExpand", { count: archivedSessions.length })}</span>
                <span class="count-badge">{archivedSessions.length}</span>
              </button>
              {#if archivedListOpen}
                <div id="sidebar-archived-list" class="archived-list">
                  <p class="archived-hint">{t("session.archivedListDesc")}</p>
                  {#if archivedSessions.length === 0}
                    <p class="archived-empty">{t("session.emptyArchived")}</p>
                  {:else}
                    {#each archivedSessions as session (session.sessionId)}
                      <div class="archived-item">
                        <span title={sessionTitle(session)}>{sessionTitle(session)}</span>
                        <div class="archived-item-actions">
                          <button disabled={!!managementBusy} aria-label={`${t("common.restore")}: ${sessionTitle(session)}`} title={t("common.restore")} onclick={() => void restoreArchivedSession(session.sessionId)}><RotateCcw size={13} /></button>
                          <button disabled={!desktopFeatures.permanentSessionDeletion || !!managementBusy || session.running} aria-label={`${t("session.deleteForever")}: ${sessionTitle(session)}`} title={!desktopFeatures.permanentSessionDeletion ? t("session.permanentDeletionUnavailable") : t("session.deleteForever")} onclick={() => confirmingArchivedSessionId = session.sessionId}><Trash2 size={13} /></button>
                        </div>
                      </div>
                    {/each}
                  {/if}
                </div>
              {/if}
            </div>
          </div>
          <div class="sidebar-footer">
            <Button variant="ghost" class={`footer-button${extensionsViewActive ? " active" : ""}`} onclick={openExtensions}><Blocks size={15} />{t("nav.extensions")}<span class="count-badge">{capabilitiesEnabledCount}</span></Button>
            <Button variant="ghost" class={`footer-button${view === "knowledge" ? " active" : ""}`} onclick={openKnowledge}><BookOpen size={15} />{t("nav.knowledge")}</Button>
            <Button variant="ghost" class={`footer-button${view === "settings" ? " active" : ""}`} onclick={() => openManagement("settings")}><Settings2 size={15} />{t("nav.settings")}</Button>
          </div>
        </div>
      </aside>
      <section id="workbench-content" tabindex="-1" class="content-area" inert={viewportWidth <= 760 && mobileSidebarOpen}>
        {#if view === "settings"}
          <div class="management-page" class:settings-management={managementTab === "settings"}>
            <header class="management-header"><div><div class="eyebrow">{t("app.eyebrow")}</div><h1>{managementTab === "settings" ? t("settings.title") : t("app.workbench")}</h1>{#if managementTab !== "settings"}<p>{t("app.workbenchDesc")}</p>{:else}<p>{t("settings.description")}</p>{/if}</div><div class="management-header-actions">{#if managementTab === "settings"}<Button variant="ghost" size="sm" onclick={() => switchManagementTab("overview")}><ClipboardList size={14} />{t("nav.managementTools")}</Button>{/if}<Button variant="outline" size="sm" onclick={() => view = "conversation"}><ChevronRight class="rotate-180" size={14} />{t("app.backToConversation")}</Button></div></header>
            <div class="management-body">
              {#if managementTab !== "settings"}
              <ManagementNav
                activeTab={managementTab}
                ariaLabel={t("app.managementNavAria")}
                labels={{
                  overview: t("nav.overview"),
                  extensions: t("nav.extensions"),
                  sessions: t("nav.sessions"),
                  goals: t("nav.goals"),
                  subagents: t("nav.subagents"),
                  agents: t("nav.agents"),
                  models: t("nav.models"),
                  workspaces: t("nav.workspaces"),
                  mounts: t("nav.mounts"),
                  plugins: t("nav.plugins"),
                  mcp: t("nav.mcp"),
                  knowledge: t("nav.knowledge"),
                  skills: t("nav.skills"),
                  automation: t("nav.automation"),
                  settings: t("nav.settings"),
                  runtime: t("nav.runtime"),
                }}
                moreLabel={t("nav.moreManagement")}
                onSelect={switchManagementTab}
              />
              {/if}
              <section class="management-content">
                {#if managementTab !== "settings"}
                  <div class="management-toolbar"><div class="section-label">{managementTitle(managementTab)}</div><div class="settings-filter"><Search size={14} /><Input aria-label={t("overview.filterManagement")} placeholder={t("overview.filterManagement")} bind:value={settingsQuery} /></div></div>
                {/if}
                {#if managementError}<div class="management-feedback error"><CircleAlert size={14} /><span>{managementError}</span><button aria-label={t("app.closeManagementError")} onclick={() => managementError = ""}><X size={13} /></button></div>{/if}
                {#if managementNotice}<div class="management-feedback success"><CircleCheck size={14} /><span>{managementNotice}</span><button aria-label={t("app.closeManagementNotice")} onclick={() => managementNotice = ""}><X size={13} /></button></div>{/if}
                {#if managementTab === "overview"}
                  <div class="management-summary-grid"><button onclick={() => switchManagementTab("sessions")}><span class="summary-icon"><MessageSquare size={16} /></span><strong>{t("overview.sessionsTitle")}</strong><small>{t("overview.sessionsDesc", { active: sessions.length, archived: archivedSessionIds.length })}</small></button><button onclick={() => switchManagementTab("models")}><span class="summary-icon"><Bot size={16} /></span><strong>{t("overview.modelsTitle")}</strong><small>{selectedModel || t("overview.noModelSelected")}</small></button><button onclick={() => switchManagementTab("settings")}><span class="summary-icon"><Settings2 size={16} /></span><strong>{t("overview.settingsTitle")}</strong><small>{t("overview.settingsDesc", { namespaces: settingsNamespaces.length, credentials: credentialRefs.length })}</small></button><button onclick={() => switchManagementTab("runtime")}><span class="summary-icon"><ShieldAlert size={16} /></span><strong>{t("overview.runtimeTitle")}</strong><small>{runtimeStatusKind === "unavailable" ? t("runtime.statusUnavailable") : runtimeStatusKind === "loading" ? t("runtime.statusLoading") : t("overview.runtimeNormal")}</small></button></div>
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
                                <Button variant="ghost" size="icon-sm" aria-label={t("session.archiveSession")} title={item.running ? t("session.runningActionUnavailable") : t("session.archiveSession")} disabled={!!managementBusy || item.running} onclick={() => confirmingSessionId = item.sessionId}><Archive size={14} /></Button>
                              </div>
                            {/if}
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </SettingsGroup>
                  <SettingsGroup title={t("session.archivedSessions")} description={t("session.archivedListDesc")}>
                    <div class="management-actions archived-session-toolbar">
                      <span class="management-capability">{t("session.archivedCount", { count: archivedSessions.length })}</span>
                      <Button variant="outline" size="sm" disabled={!desktopFeatures.permanentSessionDeletion || !!managementBusy || archivedSessions.length === 0} title={!desktopFeatures.permanentSessionDeletion ? t("session.permanentDeletionUnavailable") : undefined} onclick={() => confirmingArchivedCleanup = true}><Trash2 size={14} />{t("session.cleanupArchived")}</Button>
                    </div>
                    {#if filteredArchivedSessions.length === 0}
                      <DataState state="empty" title={archivedSessions.length === 0 ? t("session.emptyArchived") : t("session.noArchivedMatches")} description={t("session.archivedListDesc")} />
                    {:else}
                      <div class="management-list">
                        {#each filteredArchivedSessions as item (item.sessionId)}
                          {@const health = sessionHealth(item, !!sessionErrors[item.sessionId])}
                          <div class="management-list-row session-management-row archived-session-row">
                            <span class="row-icon"><Archive size={15} /></span>
                            <div class="session-management-info">
                              <div class="session-management-title-row">
                                <strong class="session-management-title truncate">{sessionTitle(item)}</strong>
                                <StatusBadge status={health === "running" ? "warning" : health === "error" ? "danger" : "neutral"} label={t("session.archivedBadge")} />
                              </div>
                              <small class="session-management-path truncate" title={item.cwd || workspaceName}>{item.cwd || workspaceName} · {formatTime(item.updatedAt)}</small>
                            </div>
                            <div class="row-actions session-actions">
                              <Button variant="ghost" size="icon-sm" aria-label={t("session.restoreSession")} title={t("session.restoreSession")} disabled={!!managementBusy} onclick={() => void restoreArchivedSession(item.sessionId)}><RotateCcw size={14} /></Button>
                              <Button variant="ghost" size="icon-sm" aria-label={t("session.deleteSession")} title={!desktopFeatures.permanentSessionDeletion ? t("session.permanentDeletionUnavailable") : t("session.deleteSession")} disabled={!desktopFeatures.permanentSessionDeletion || !!managementBusy || item.running} onclick={() => confirmingArchivedSessionId = item.sessionId}><Trash2 size={14} /></Button>
                            </div>
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
                        <Button size="sm" disabled={!!managementBusy || !xgGatewayCredentialReady} title={xgGatewayCredentialReady ? t("models.refreshFromService") : t("models.requireKeyNotice", { ref: credentialRefTitle("XG_GOMODEL_API_KEY") })} onclick={() => void refreshXgGatewayModels()}>
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
                        <span class="management-capability">{t("models.defaultModelPrefix")}{displayModelSelection(modelSelectionKey(hostInfo.provider || "", hostInfo.model || ""))}</span>
                      {/if}
                    </div>
                    {#if availableModelGroups.length === 0}
                      <DataState state="empty" title={t("models.emptySessionModels")} description={t("models.emptySessionModelsDesc")} />
                    {:else}
                      {#each availableModelGroups as group (group.id)}
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
                                <strong title={model.name}>{stripInternalAlias(model.name)}</strong>
                                <small>
                                  {modelCredentialConfigured(group.id) ? modelCapabilityLabel(model, group.id === "xg-gomodel" && unknownModelCapabilities.has(model.id)) : t("models.needApiKey")}
                                  {#if model.contextWindow} · {t("models.contextWindow", { count: formatTokenSpec(model.contextWindow) })}{/if}
                                  {#if model.maxTokens} · {t("models.maxTokens", { count: formatTokenSpec(model.maxTokens) })}{/if}
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
                    {#if availableCatalogGroups.length > 0}
                      <div class="catalog-divider"><span>{t("models.globalProviderCatalog")}</span></div>
                      <div class="catalog-group-container">
                        {#each availableCatalogGroups as group (group.id)}
                          <div class="model-group catalog-group">
                            <div class="model-group-header">
                              <strong>{group.name}</strong>
                              <small>{t("models.availableModelsCount", { count: group.models.length })}</small>
                            </div>
                            <div class="catalog-models-list">
                              {#each group.models as model (model.id)}
                                <div class="catalog-model-row">
                                  <strong title={model.name}>{stripInternalAlias(model.name)}</strong>
                                  <small>{model.id}{#if model.contextWindow} · {t("models.contextWindow", { count: formatTokenSpec(model.contextWindow) })}{/if}{#if model.maxTokens} · {t("models.maxTokens", { count: formatTokenSpec(model.maxTokens) })}{/if}</small>
                                </div>
                              {/each}
                            </div>
                          </div>
                        {/each}
                      </div>
                    {/if}
                    {#if describeSpecDifference(availableModelGroups.flatMap((group) => group.models.map((model) => model.maxTokens)))}
                      <p class="knowledge-note"><CircleAlert size={14} /><span>{t("models.outputLimitVaries")}</span></p>
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
                {:else if managementTab === "automation"}
                  {#if AutomationPanelComponent}
                    <AutomationPanelComponent {client} onNotice={(message: string) => managementNotice = message} onError={(message: string) => managementError = message} />
                  {:else}{@render managementComponentFallback("automation")}{/if}
                {:else if managementTab === "mounts"}
                  <SmbMounts />
                {:else if managementTab === "skills"}
                  {#if SkillStoreComponent}<SkillStoreComponent {client} />{:else}{@render managementComponentFallback("skillStore")}{/if}
                {:else if managementTab === "plugins"}
                  {#if PluginInventoryComponent}<PluginInventoryComponent {client} entries={pluginInventory} onRefresh={() => void refreshManagement()} onNotice={(message: string) => managementNotice = message} onError={(message: string) => managementError = message} />{:else}{@render managementComponentFallback("plugin")}{/if}
                {:else if managementTab === "extensions"}
                  {#if ExtensionCapabilitiesComponent}
                    <ExtensionCapabilitiesComponent
                      {capabilities}
                      browserSkillVersion={browserSkillVersionLabel}
                      busy={capabilitiesBusy || loading}
                      error={managementError}
                      onToggle={(key: CapabilityKey) => toggleCapability(key as DesktopCapabilityKey)}
                      onRefresh={() => void refreshManagement()}
                    />
                  {:else}{@render managementComponentFallback("extensions")}{/if}
                {:else if managementTab === "mcp"}
                  {#if McpInventoryComponent}<McpInventoryComponent entries={pluginInventory} onRefresh={() => void refreshManagement()} onNavigateToSettings={() => openManagement("settings")} />{:else}{@render managementComponentFallback("mcp")}{/if}
                {:else if managementTab === "knowledge"}
                  <MetricStrip items={knowledgeMetrics} columns={4} ariaLabel={t("knowledge.title")} />
                  <SettingsGroup title={t("knowledge.searchTitle")} description={t("knowledge.searchSub")}>
                    <div class="knowledge-search-row"><Input aria-label={t("knowledge.questionAria")} bind:value={input} placeholder={t("knowledge.searchPlaceholder")} /><Button size="sm" disabled={(knowledgeScope === "local" && !workspacePath) || !input.trim() || sending || knowledgeQuerying || knowledgeIndex.state === "building"} onclick={() => void runKnowledgeOperation("query", input)}><Search size={14} />{t("knowledge.searchBtn")}</Button></div>
                    <div class="knowledge-search-options">{#if KnowledgeScopePickerComponent}<KnowledgeScopePickerComponent bind:scope={knowledgeScope} externalUnavailable={externalKnowledgeUnavailable} onConfigure={() => openKnowledge()} />{:else}{@render managementComponentFallback("knowledgeScope")}{/if}<span class="knowledge-search-hint">{externalKnowledgeUnavailable ? t("knowledge.scopeExternalUnavailable") : workspacePath ? workspaceName : t("knowledge.statusLocalWaiting")}</span></div><div class="knowledge-query-inline">{#if knowledgeQuerying}<div class="knowledge-query-status" role="status"><Loader size={14} class="spin" aria-hidden="true" />{t("knowledge.querying")}</div>{:else if knowledgeQueryAnswer}<div class="knowledge-query-result"><strong>{t("knowledge.queryResultTitle")}</strong><p>{knowledgeQueryAnswer}</p></div>{:else if knowledgeQueryFinished}<div class="knowledge-query-status" role="status">{t("knowledge.queryEmpty")}</div>{/if}{#if knowledgeSessionNotice && knowledgeQuerySessionId}<div class="knowledge-query-session"><span>{knowledgeSessionNotice}</span><Button variant="outline" size="sm" onclick={() => void selectSession(knowledgeQuerySessionId)}>{t("knowledge.queryOpenSession")}</Button></div>{/if}</div>
                  </SettingsGroup>
                  <SettingsGroup title={t("knowledge.statPersistent")} description={t("knowledge.statPersistentDesc")}>
                    <div class="knowledge-action-grid">
                      <button disabled={!workspacePath || knowledgeIndex.state === "building"} onclick={() => void runKnowledgeOperation("build")}><Database size={15} /><span><strong>{t("knowledge.buildIndexBtn")}</strong><small>{t("knowledge.statPersistentStatus")}</small></span></button>
                      <button disabled={!workspacePath || knowledgeIndex.state === "building"} onclick={() => void runKnowledgeOperation("refresh")}><RefreshCw size={15} /><span><strong>{t("knowledge.refreshIndexCard")}</strong><small>{t("knowledge.refreshIndexSub")}</small></span></button>
                      <button onclick={() => openKnowledge()}><BookOpen size={15} /><span><strong>{t("knowledge.title")}</strong><small>{t("knowledge.heroDesc")}</small></span></button>
                    </div>
                    {#if knowledgeIndex.failures && knowledgeIndex.failures.length > 0}<div class="knowledge-note"><CircleAlert size={14} /><div class="knowledge-note__body"><span>{t("knowledge.indexFailures", { count: knowledgeIndex.failures.length, names: knowledgeIndex.failures.join("、") })}</span><small>{t("knowledge.indexFailuresHint")}</small>{#if knowledgeSummary.placeholders > 0}<small>{t("knowledge.placeholderNote", { count: knowledgeSummary.placeholders })}</small>{/if}</div></div>{/if}{#if knowledgeIndex.state === "failed" && !(knowledgeIndex.failures && knowledgeIndex.failures.length)}<div class="knowledge-note"><CircleAlert size={14} /><div class="knowledge-note__body"><span>{t("knowledge.indexFailedHint")}</span></div></div>{/if}
                  </SettingsGroup>
                  {#if client && ExternalKnowledgeSourcesComponent}<ExternalKnowledgeSourcesComponent {client} plugins={pluginInventory} onRefresh={refreshManagement} verifiedSignature={externalKnowledgeVerified ? externalKnowledgeSignature : ""} onVerified={() => { externalKnowledgeVerified = true; managementNotice = t("knowledge.externalVerifiedNotice"); }} onVerifiedChange={(signature) => { externalKnowledgeVerifiedEpoch += 1; if (signature) { externalKnowledgeVerified = true; externalKnowledgeSignature = signature; } else { externalKnowledgeVerified = false; if (knowledgeScope !== "local") knowledgeScope = "local"; } }} />{/if}
                  <SettingsGroup title={t("knowledge.skillsSectionTitle")} description={t("knowledge.callableCapabilities")}>
                    <div class="management-actions"><Button variant="outline" size="sm" onclick={() => void refreshManagement()}><History size={14} />{t("knowledge.refreshKnowledgeBtn")}</Button></div>
                    {#if skills.length === 0}
                      <DataState state="empty" title={t("knowledge.emptyKnowledgeTitle")} description={t("knowledge.emptyKnowledgeDesc")} />
                    {:else}
                      {#if KnowledgeSkillListComponent}<KnowledgeSkillListComponent {skills} query={settingsQuery} />{:else}{@render managementComponentFallback("knowledgeSkill")}{/if}
                    {/if}
                  </SettingsGroup>
                  <div class="knowledge-note"><ShieldAlert size={14} /><span>{t("knowledge.noteDesc")}</span></div>
                {:else if managementTab === "settings"}
                  <div class="settings-layout">
                    <SettingsSectionNav activeSection={settingsSection} onSelect={switchSettingsSection} />
                    <div class="settings-section-content">
                  <SettingsPageHero section={settingsSection} locale={i18n.locale} {networkMode} providerCount={providers.length} credentialCount={credentialRefs.length} />
                  {#if settingsSection === "appearance"}
                  <AppearanceSettings customization={customization} onUpdate={updateCustomization} />
                  {/if}
                  {#if settingsSection === "about"}
                  <SettingsGroup title={t("updates.title")} description={t("updates.description")}>
                    <div class="update-panel">
                      <div class="update-panel-copy">
                        <strong>{t("updates.currentVersion", { version: appVersion })}</strong>
                        <small role="status">{updateChecking ? t("updates.checking") : updateError ? t("updates.failed") : updateCheck?.status === "available" ? t("updates.available", { version: updateCheck.latestVersion }) : updateCheck ? t("updates.current", { version: updateCheck.currentVersion }) : t("updates.notChecked")}</small>
                        {#if updateError}<small role="alert">{updateError}</small>{/if}
                        <small>{!desktopFeatures.updateChecks ? t("updates.reviewBuild") : networkMode === "intranet" ? t("updates.intranetDisabled") : updateCheck?.publishedAt ? t("updates.publishedAt", { date: new Date(updateCheck.publishedAt).toLocaleString() }) : t("updates.manualInstall")}</small>
                      </div>
                      <div class="row-actions">
                        <Button variant="outline" size="sm" disabled={!desktopFeatures.updateChecks || updateChecking || networkMode === "intranet"} onclick={() => void checkForUpdate()}><RefreshCw size={13} class={updateChecking ? "spin" : undefined} />{updateChecking ? t("updates.checking") : t("updates.check")}</Button>
                        {#if updateCheck?.status === "available" && updateCheck.downloadUrl}
                          <Button size="sm" onclick={() => void openUpdateDownload()}><Download size={13} />{t("updates.download")}</Button>
                        {/if}
                      </div>
                    </div>
                  </SettingsGroup>
                  <SettingsGroup title={t("settings.appInfoTitle")} description={t("settings.appInfoDesc")}>
                    <div class="settings-facts-grid">
                      <div><span>{t("settings.productName")}</span><strong>{productName}</strong></div>
                      <div><span>{t("updates.versionLabel")}</span><strong>{appVersion ? `v${appVersion}` : "—"}</strong></div>
                      <div><span>{t("settings.runtimeVersion")}</span><strong>{hostInfo?.version ? `DSH ${hostInfo.version}` : "—"}</strong></div>
                      <div><span>{t("runtime.activeSessions")}</span><strong>{t("settings.sessionCountLabel", { count: sessions.length })}</strong></div>
                      <div class="settings-fact-wide"><span>{t("settings.dataHome")}</span><strong title={hostInfo?.home || ""}>{hostInfo?.home || "—"}</strong></div>
                    </div>
                  </SettingsGroup>
                  {/if}
                  {#if settingsSection === "general"}
                  <SettingsGroup title={t("settings.languageTitle")} description={t("settings.languageDesc")}>
                    <label class="settings-row" for="settings-language">
                      <span>{t("app.language")}</span>
                      <select id="settings-language" value={i18n.locale} onchange={(event) => setLocale(event.currentTarget.value as (typeof AVAILABLE_LOCALES)[number]["code"])}>
                        {#each AVAILABLE_LOCALES as opt (opt.code)}
                          <option value={opt.code}>{opt.label}</option>
                        {/each}
                      </select>
                    </label>
                  </SettingsGroup>
                  <SettingsGroup title={t("settings.defaultChatDirectoryTitle")} description={t("settings.defaultChatDirectoryDesc")}>
                    <div class="settings-directory-row">
                      <code title={defaultChatDirectory}>{defaultChatDirectory || "—"}</code>
                      <div class="row-actions">
                        <Button variant="outline" size="sm" onclick={() => void pickDefaultChatDirectory()}><FolderOpen size={13} />{t("settings.pickDefaultChatDirectory")}</Button>
                        <Button variant="ghost" size="sm" disabled={!bootstrapWorkspace || defaultChatDirectory === bootstrapWorkspace} onclick={resetDefaultChatDirectory}><RotateCcw size={13} />{t("settings.resetDefaultChatDirectory")}</Button>
                      </div>
                    </div>
                  </SettingsGroup>
                  <SettingsGroup title={t("settings.networkModeTitle")} description={t("settings.networkModeDesc")}>
                    <div class="settings-choice-grid">
                      <button type="button" class:chosen={networkMode === "intranet"} disabled={networkModeBusy} onclick={() => void changeNetworkMode("intranet")}>
                        <span class="settings-choice-icon"><ShieldAlert size={17} /></span>
                        <span class="settings-choice-copy">
                          <strong>{t("settings.intranetMode")}</strong>
                          <small>{t("settings.intranetModeDesc")}</small>
                        </span>
                        {#if networkMode === "intranet"}<StatusBadge status="success" label={t("settings.networkActive")} />{/if}
                      </button>
                      <button type="button" class:chosen={networkMode === "external"} disabled={networkModeBusy} onclick={() => void changeNetworkMode("external")}>
                        <span class="settings-choice-icon"><Globe size={17} /></span>
                        <span class="settings-choice-copy">
                          <strong>{t("settings.externalMode")}</strong>
                          <small>{t("settings.externalModeDesc")}</small>
                        </span>
                        {#if networkMode === "external"}<StatusBadge status="warning" label={t("settings.networkActive")} />{/if}
                      </button>
                    </div>
                    <p class="settings-choice-hint">{t("settings.networkChoiceHint")}</p>
                    {#if networkModeBusy}<small class="settings-inline-status">{t("settings.networkModeRestarting")}</small>{/if}
                  </SettingsGroup>
                  {/if}
                  {#if settingsSection === "models"}
                  <SettingsGroup title={t("settings.modelProviderTitle")}>
                    <div class="settings-filter settings-local-filter"><Search size={14} /><Input aria-label={t("settings.providerFilter")} placeholder={t("settings.providerFilter")} bind:value={settingsQuery} /></div>
                    {#if client}
                      {#if ProviderWorkbenchComponent}
                        <ProviderWorkbenchComponent
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
                          onBundledCredentialReset={resetBundledModelCredential}
                        />
                      {:else}{@render managementComponentFallback("provider")}{/if}
                    {/if}
                  </SettingsGroup>
                  {/if}
                  {#if settingsSection === "voice"}
                  <SpeechSettings {client} />
                  {/if}
                  {#if settingsSection === "advanced"}
                  <AgentConfigTransfer
                    {client}
                    {providers}
                    namespaces={settingsNamespaces}
                    {credentials}
                    agentPresets={agentPresets}
                    incomingLink={agentConfigIncomingLink}
                    incomingLinkToken={agentConfigIncomingLinkToken}
                    onImported={() => void refreshManagement()}
                  />
                  <SettingsGroup title={t("settings.projectMemoryTitle")} description={t("settings.projectMemoryDesc")}>
                    <div class="settings-directory-row">
                      <code title={workspacePath}>{workspacePath || "—"}</code>
                      <StatusBadge status={memoryStatus === "active" ? "success" : memoryStatus === "requiresGit" ? "warning" : "neutral"} label={memoryStatusLabel()} />
                    </div>
                    <p class="settings-choice-hint">{memoryStatusHint()}</p>
                  </SettingsGroup>
                  <SettingsGroup title={t("settings.capabilitiesTitle")} description={t("settings.capabilitiesDesc")}>
                    <div class="management-list">
                      <div class="management-list-row">
                        <span class="row-icon"><Blocks size={15} /></span>
                        <div>
                          <strong>{t("settings.capabilitiesSummary", { count: capabilitiesEnabledCount })}</strong>
                          <small>{t("settings.capabilitiesSummaryDesc")}</small>
                        </div>
                        <Button variant="outline" size="sm" disabled={loading} onclick={() => openExtensions()}>{t("settings.capabilitiesOpen")}</Button>
                      </div>
                    </div>
                    <p class="settings-choice-hint">{t("settings.capabilitiesHint")}</p>
                  </SettingsGroup>
                  <BrowserExtensionCard />
                  <SettingsGroup title={t("settings.credentialsSectionTitle")} description={t("settings.credentialsSectionDesc")}>
                    <details class="settings-subsection">
                      <summary><KeyRound size={14} /><span><strong>{t("settings.addCredentialTitle")}</strong><small>{t("settings.addCredentialDesc")}</small></span><ChevronDown size={14} /></summary>
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
                    </details>
                    {#if credentialRefs.length === 0}
                      <DataState state="empty" title={t("settings.emptyCredentials")} description={t("settings.emptyCredentialsDesc")} />
                    {:else}
                      <div class="management-list">
                        {#each credentialRefs as ref (ref)}
                          <div class="management-list-row credential-row">
                            <span class="row-icon"><KeyRound size={15} /></span>
                            <div>
                              <strong>{credentialRefTitle(ref)}</strong>
                              <small>{credentialSummary(ref)} · {credentialRefHint(ref)}</small>
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
                    <details class="settings-raw-config" bind:open={rawSettingsOpen}>
                      <summary><Settings2 size={14} /><span><strong>{t("settings.rawConfigTitle")}</strong><small>{t("settings.rawConfigDesc")}</small></span><ChevronDown size={14} /></summary>
                    <SettingsGroup title={t("settings.namespacesSectionTitle")} description={t("settings.namespacesSectionDesc")}>
                    <div class="management-actions">
                      <Button variant="outline" size="sm" disabled={!settingsHasDocument || !!managementBusy} onclick={() => void openSettingsDocument()}>
                        <ExternalLink size={14} />
                        {t("settings.openSettingsFile")}
                      </Button>
                      <span class="management-capability">{settingsWritable ? t("common.writable") : t("common.readonly")}</span>
                    </div>
                    <div class="settings-filter settings-local-filter"><Search size={14} /><Input aria-label={t("settings.configFilter")} placeholder={t("settings.configFilter")} bind:value={settingsQuery} /></div>
                    {#if settingsNamespaces.length === 0}
                      <DataState state="empty" title={t("settings.emptyNamespaces")} description={t("settings.emptyNamespacesDesc")} />
                    {:else}
                      <div class="settings-editor-grid">
                        <nav class="settings-namespace-list" aria-label={t("settings.namespacesSectionTitle")}>
                          {#each filteredSettingsNamespaces as namespace (namespace.ns)}
                            <button class:active={namespace.ns === selectedSettingsNamespace()?.ns} onclick={() => selectSettingsNamespace(namespace.ns)}>
                              <strong>{namespaceDisplayName(namespace.ns)}</strong>
                              <small>{namespace.applies === "restart" ? t("common.restartEffect") : t("common.instantEffect")} · r{namespace.revision}</small>
                            </button>
                          {/each}
                        </nav>
                        <div class="settings-json-editor">
                          {#if selectedSettingsNamespace()}
                            <div class="agent-preview-heading">
                              <div>
                                <strong>{namespaceDisplayName(selectedSettingsNamespace()?.ns || "")}</strong>
                                <small class="settings-namespace-meta">{t("settings.namespaceHint")} · {t("settings.secretsCount", { count: selectedSettingsNamespace()?.secrets.filter((item) => item.set).length || 0 })}</small>
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
                    </details>
                  {/if}
                    </div>
                  </div>
                {:else}
                  <SettingsGroup title={t("runtime.title")} description={t("runtime.description")}>
                    <div class={`status-alert-banner ${runtimeStatusKind === "unavailable" ? "status-alert-banner--error" : "status-alert-banner--success"}`}>
                      {#if runtimeStatusKind === "unavailable"}
                        <ShieldAlert size={16} />
                        <div>
                          <strong>{t("runtime.statusUnavailable")}</strong>
                          <span>{t("runtime.statusUnavailableHint")}</span>
                          <span>{t("errors.runtimeCached")}</span>
                          <span>{runtimeLastSyncedLabel}</span>
                          <details class="diagnostics-technical">
                            <summary>{t("transcript.toolTechnicalDetails")}</summary>
                            <p>{runtimeConnectionError}</p>
                            <Button variant="outline" size="sm" disabled={runtimeRetrying} onclick={() => void retryRuntime()}><RotateCcw size={13} />{t("runtime.restartApp")}</Button>
                          </details>
                        </div>
                        <Button variant="outline" size="sm" disabled={runtimeRetrying} onclick={() => void retryRuntime()}><RotateCcw size={13} />{t("common.retry")}</Button>
                      {:else}
                        <CircleCheck size={16} />
                        <div>
                          <strong>{t("overview.runtimeNormal")}</strong>
                          <span>{t("runtime.eventStreamEstablished")}</span>
                          <span>{runtimeLastSyncedLabel}</span>
                        </div>
                      {/if}
                    </div>
                    <div class="diagnostics-metrics-grid">
                      <div class="diagnostic-metric-card"><span>{t("runtime.activeSessions")}</span><strong>{sessions.length}</strong><small>{activeSession ? sessionTitle(activeSession) : t("runtime.unselectedSession")}</small></div>
                      <div class="diagnostic-metric-card"><span>{t("runtime.activeTools")}</span><strong>{runtimeStatusKind === "unavailable" ? t("runtime.valueUnavailable") : runningTools.length}</strong><small>{runtimeStatusKind === "unavailable" ? t("runtime.statusUnavailableHint") : t("runtime.runningNow")}</small></div>
                      <div class="diagnostic-metric-card"><span>{t("runtime.settingsNamespaces")}</span><strong>{settingsNamespaces.length}</strong><small>{t("runtime.registeredNamespaces")}</small></div>
                      <div class="diagnostic-metric-card"><span>{t("runtime.providers")}</span><strong>{providers.length}</strong><small>{t("runtime.registeredProviders")}</small></div>
                      <div class="diagnostic-metric-card"><span>{t("runtime.subagents")}</span><strong>{subagents.length}</strong><small>{t("runtime.directSubagents")}</small></div>
                    </div>
                    <div class="management-list settings-namespaces">
                      {#each settingsNamespaces as namespace (namespace.ns)}
                        <div class="management-list-row">
                          <span class="row-icon"><Settings2 size={15} /></span>
                          <div><strong>{namespaceDisplayName(namespace.ns)}</strong><small>{namespace.applies === "restart" ? t("common.restartEffect") : t("common.instantEffect")} · {t("runtime.revision", { revision: namespace.revision })}</small></div>
                          <span>{t("runtime.secretFields", { count: namespace.secrets.length })}</span>
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
            <header class="knowledge-hero">
              <div class="knowledge-hero-copy">
                <div class="eyebrow">{t("knowledge.eyebrow")}</div>
                <h1>{t("knowledge.title")}</h1>
                <p>{t("knowledge.heroDesc")}</p>
              </div>
              <div class="header-actions knowledge-hero-actions">
                <span class="knowledge-status"><span class:busy={knowledgeIndex.state === "building"}></span>{knowledgeStatusLabel()}</span>
                <Button variant="outline" size="sm" onclick={() => view = "conversation"}><ChevronRight class="rotate-180" size={14} />{t("app.backToConversation")}</Button>
                <Button size="sm" disabled={!workspacePath || knowledgeIndex.state === "building"} onclick={() => void runKnowledgeOperation("build")}><Database size={14} />{t("knowledge.buildIndexBtn")}</Button>
              </div>
            </header>
            <div class="knowledge-page-body">
              <MetricStrip items={knowledgeMetrics} columns={4} ariaLabel={t("knowledge.title")} />
              <section class="knowledge-search-panel">
                <div class="knowledge-search-heading">
                  <div>
                    <span class="section-label">{t("knowledge.searchTitle")}</span>
                    <h2>{t("knowledge.searchHeading")}</h2>
                    <p>{t("knowledge.searchSub")}</p>
                  </div>
                  <span class="knowledge-source-count"><Database size={15} />{t("knowledge.sourceCount", { indexed: knowledgeSummary.indexed, skipped: knowledgeSummary.skipped })}</span>
                </div>
                <div class="knowledge-search-main">
                  <div class="knowledge-search-row"><Input aria-label={t("knowledge.questionAria")} bind:value={input} placeholder={t("knowledge.searchPlaceholder")} /><Button size="sm" disabled={(knowledgeScope === "local" && !workspacePath) || !input.trim() || sending || knowledgeQuerying || knowledgeIndex.state === "building"} onclick={() => void runKnowledgeOperation("query", input)}><Search size={14} />{t("knowledge.searchBtn")}</Button></div>
                  <div class="knowledge-search-options">{#if KnowledgeScopePickerComponent}<KnowledgeScopePickerComponent bind:scope={knowledgeScope} externalUnavailable={externalKnowledgeUnavailable} onConfigure={() => openKnowledge()} />{:else}{@render managementComponentFallback("knowledgeScope")}{/if}<span class="knowledge-search-hint">{externalKnowledgeUnavailable ? t("knowledge.scopeExternalUnavailable") : workspacePath ? workspaceName : t("knowledge.statusLocalWaiting")}</span></div><div class="knowledge-query-inline">{#if knowledgeQuerying}<div class="knowledge-query-status" role="status"><Loader size={14} class="spin" aria-hidden="true" />{t("knowledge.querying")}</div>{:else if knowledgeQueryAnswer}<div class="knowledge-query-result"><strong>{t("knowledge.queryResultTitle")}</strong><p>{knowledgeQueryAnswer}</p></div>{:else if knowledgeQueryFinished}<div class="knowledge-query-status" role="status">{t("knowledge.queryEmpty")}</div>{/if}{#if knowledgeSessionNotice && knowledgeQuerySessionId}<div class="knowledge-query-session"><span>{knowledgeSessionNotice}</span><Button variant="outline" size="sm" onclick={() => void selectSession(knowledgeQuerySessionId)}>{t("knowledge.queryOpenSession")}</Button></div>{/if}</div>
                </div>
                {#if knowledgeIndex.failures && knowledgeIndex.failures.length > 0}<div class="knowledge-note"><CircleAlert size={14} /><div class="knowledge-note__body"><span>{t("knowledge.indexFailures", { count: knowledgeIndex.failures.length, names: knowledgeIndex.failures.join("、") })}</span><small>{t("knowledge.indexFailuresHint")}</small>{#if knowledgeSummary.placeholders > 0}<small>{t("knowledge.placeholderNote", { count: knowledgeSummary.placeholders })}</small>{/if}</div></div>{/if}{#if knowledgeIndex.state === "failed" && !(knowledgeIndex.failures && knowledgeIndex.failures.length)}<div class="knowledge-note"><CircleAlert size={14} /><div class="knowledge-note__body"><span>{t("knowledge.indexFailedHint")}</span></div></div>{/if}
              </section>
              <div class="knowledge-panel-grid">
                <SettingsGroup title={t("knowledge.statPersistent")} description={t("knowledge.statPersistentDesc")} class="knowledge-action-group">
                  <div class="knowledge-action-grid">
                    <button disabled={!workspacePath || knowledgeIndex.state === "building"} onclick={() => void runKnowledgeOperation("refresh")}><RefreshCw size={15} /><span><strong>{t("knowledge.refreshIndexCard")}</strong><small>{t("knowledge.refreshIndexSub")}</small></span></button>
                    <button onclick={() => openKnowledgePrompt(t("knowledge.createInventoryPrompt"))}><ClipboardList size={15} /><span><strong>{t("knowledge.createInventoryCard")}</strong><small>{t("knowledge.createInventorySub")}</small></span></button>
                    <button onclick={() => void createSession()}><MessageSquarePlus size={15} /><span><strong>{t("knowledge.createSessionCard")}</strong><small>{t("knowledge.createSessionSub")}</small></span></button>
                  </div>
                </SettingsGroup>
                <SettingsGroup title={t("knowledge.currentContext")} description={t("knowledge.needSelectSession")} class="knowledge-context-group">
                  <div class="context-stat"><span>{t("overview.workspaceLabel")}</span><strong title={workspacePath}>{workspaceName}</strong></div>
                  <div class="context-stat"><span>{t("overview.sessionLabel")}</span><strong>{activeSession ? sessionTitle(activeSession) : t("knowledge.unselected")}</strong></div>
                  <div class="context-stat"><span>{t("knowledge.statSession")}</span><strong>{activeSession ? t("knowledge.sessionMessagesCount", { count: messages.length }) : t("knowledge.needSelectSession")}</strong></div>
                  <div class="context-stat"><span>{t("settings.projectMemoryTitle")}</span><strong>{memoryStatusLabel()}</strong></div>
                </SettingsGroup>
              </div>
              {#if client && ExternalKnowledgeSourcesComponent}<ExternalKnowledgeSourcesComponent {client} plugins={pluginInventory} onRefresh={refreshManagement} verifiedSignature={externalKnowledgeVerified ? externalKnowledgeSignature : ""} onVerified={() => { externalKnowledgeVerified = true; managementNotice = t("knowledge.externalVerifiedNotice"); }} onVerifiedChange={(signature) => { externalKnowledgeVerifiedEpoch += 1; if (signature) { externalKnowledgeVerified = true; externalKnowledgeSignature = signature; } else { externalKnowledgeVerified = false; if (knowledgeScope !== "local") knowledgeScope = "local"; } }} />{/if}
              <SettingsGroup title={t("knowledge.skillsSectionTitle")} description={t("knowledge.callableCapabilities")}>
                <div class="management-actions"><Button variant="ghost" size="sm" onclick={() => void refreshManagement()}><History size={14} />{t("common.refresh")}</Button></div>
                {#if skills.length === 0}
                  <DataState state="empty" title={t("knowledge.emptySkillsTitle")} description={t("knowledge.emptySkillsDesc")} />
                {:else}
                  {#if KnowledgeSkillListComponent}<KnowledgeSkillListComponent {skills} query={settingsQuery} />{:else}{@render managementComponentFallback("knowledgeSkill")}{/if}
                {/if}
              </SettingsGroup>
              <div class="knowledge-note"><ShieldAlert size={14} /><span>{t("knowledge.noteDesc")}</span></div>
            </div>
          </div>
        {:else}
          <div class="conversation-shell">
            {#if managementNotice}<div class="management-feedback success" role="status"><CircleCheck size={14} /><span>{managementNotice}</span><button aria-label={t("app.closeManagementNotice")} onclick={() => managementNotice = ""}><X size={13} /></button></div>{/if}
            {#if workspaceNotice || historyNotice}<div class="error-banner" role="status"><FolderOpen size={15} /><span>{workspaceNotice || historyNotice}</span><button aria-label={t("app.closeError")} onclick={() => { workspaceNotice = ""; historyNotice = ""; }}><X size={14} /></button></div>{/if}
            <header class="conversation-header"><div class="conversation-title"><h1 title={customization.title || (activeSession ? sessionTitle(activeSession) : t("app.startNewSession"))}>{customization.title || (activeSession ? sessionTitle(activeSession) : t("app.startNewSession"))}</h1><p title={customization.subtitle || workspacePath}>{customization.subtitle || workspacePath || t("app.selectWorkspaceToStart")}</p></div></header>
            {#if runtimeError || sessionLoadError}
              <div class="error-banner" role="alert"><CircleAlert size={15} /><div class="error-banner-message"><span>{sessionLoadError || runtimeError}</span>{#if authFailureDetail}<small>{authFailureDetail}</small>{/if}{#if authFailureHint}<small class="error-banner-hint">{authFailureHint}</small>{/if}{#if autoRepairNotice}<small class="error-banner-hint">{autoRepairNotice}</small>{/if}
                  {#if authFailure}
                    <details class="error-banner-technical"><summary>{t("transcript.toolTechnicalDetails")}</summary><code>{sessionLoadError || runtimeError}{#if recoveryDetail}{"\n"}{recoveryDetail}{/if}</code></details>
                  {/if}</div>
                {#if runtimeConnectionError || runtimeError === t("errors.runtimeConnection")}
                  <Button variant="outline" size="sm" disabled={runtimeRetrying} onclick={() => void retryRuntime()}><RotateCcw size={13} />{t("common.retry")}</Button>
                {:else if sessionLoadError}
                  <Button variant="outline" size="sm" onclick={() => void selectSession(activeSessionId)}><RotateCcw size={13} />{t("common.retry")}</Button>
                  <Button variant="outline" size="sm" onclick={() => void createSession()}><MessageSquarePlus size={13} />{t("app.startNewSession")}</Button>
                {:else if lastFailedPrompt?.sessionId === activeSessionId && !sending}
                  <Button variant="outline" size="sm" onclick={() => void retryLastPrompt()}><RotateCcw size={13} />{t("common.retry")}</Button>
                {/if}
                {#if authFailure && authFailureCredentialRef === "XG_GOMODEL_API_KEY"}
                  <Button variant="outline" size="sm" disabled={autoRepairState === "running"} onclick={() => void repairBundledCredentialAndRetry({ manual: true })}><RotateCcw size={13} />{autoRepairState === "running" ? t("errors.autoRepairRunning") : t("errors.autoRepairAction")}</Button>
                {/if}
                {#if canSwitchToBuiltinModel}<Button variant="outline" size="sm" onclick={() => void switchToBuiltinModel()}><PlugZap size={13} />{t("app.switchToBuiltinModel")}</Button>{/if}
                {#if authFailure || runtimeError.includes("设置与凭据") || runtimeError.includes("Settings & Credentials") || !selectedProviderCredentialReady}<Button variant="ghost" size="sm" onclick={openCredentialSettingsForCurrentModel}><KeyRound size={13} />{t("app.goToConfigure")}</Button>{/if}
                {#if !sessionLoadError}<button aria-label={t("app.closeError")} onclick={() => { runtimeError = ""; }}><X size={14} /></button>{/if}
              </div>
            {/if}
            {#if customizationOpen}<section class="customization-panel" aria-label={t("customization.title")}><div class="customization-panel__header"><div><div class="section-label">{t("customization.title")}</div><strong>{t("customization.subtitle")}</strong><p>{t("customization.example")}</p></div><Button variant="ghost" size="icon-sm" aria-label={t("customization.close")} onclick={() => customizationOpen = false}><X size={14} /></Button></div>{#if customizationNotice}<div class="customization-feedback"><CircleCheck size={14} /><span>{customizationNotice}</span></div>{/if}{#if customizationDraft}<div class="customization-preview"><div><strong>{t("customization.pendingPatch")}</strong><span>{t("customization.patchFromSession")}</span></div><ul class="customization-changes">{#each describeUiCustomizationPatch(customizationDraft) as change (change.key + ("value" in change ? change.value : "") + ("count" in change ? change.count : ""))}<li>{change.key === "composerRows" ? t("customization.changeComposerRows", { count: "count" in change ? change.count : 0 }) : change.key === "title" ? t("customization.changeTitle", { value: "value" in change ? change.value : "" }) : change.key === "subtitle" ? t("customization.changeSubtitle", { value: "value" in change ? change.value : "" }) : change.key === "quickActions" ? t("customization.changeQuickActions", { count: "count" in change ? change.count : 0 }) : t(`customization.${change.key}`)}</li>{/each}</ul><details class="customization-technical"><summary>{t("customization.technicalDetails")}</summary><code>{JSON.stringify(customizationDraft)}</code></details><div class="customization-actions"><Button variant="outline" size="sm" onclick={() => customizationDraft = undefined}>{t("common.ignore")}</Button><Button size="sm" onclick={() => applyCustomizationPatch(customizationDraft!)}><Check size={13} />{t("customization.applyPatch")}</Button></div></div>{/if}<div class="customization-summary"><span class="section-label">{t("customization.summaryTitle")}</span><p class="customization-summary__sentence">{t("customization.summarySentence", { items: [customization.density === "compact" ? t("customization.compactDensity") : t("customization.comfortableDensity"), customization.sidebar === "collapsed" ? t("customization.sidebarCollapsed") : t("customization.sidebarExpanded"), customization.activity === "visible" ? t("customization.activityVisible") : t("customization.activityHidden"), t("customization.composerRows", { count: customization.composerRows })].join("、") })}</p></div><div class="customization-actions"><Button variant="ghost" size="sm" disabled={customizationHistory.length === 0} title={t("customization.undoHint")} onclick={undoCustomization}>{t("customization.undoLast")}</Button><Button variant="ghost" size="sm" onclick={() => { customization = DEFAULT_UI_CUSTOMIZATION; customizationHistory = []; persistUiCustomization(customization); applyRuntimeCustomization(customization); customizationNotice = t("customization.restoredNotice"); }}>{t("customization.restoreDefaults")}</Button></div></section>{/if}
            {#if surfaceDraft}<section class="surface-proposal" aria-label={t("surface.proposalTitle")}><div><div class="section-label">{t("surface.proposalTitle")}</div><strong>{surfaceDraft.spec.title}</strong><p>{surfaceDraft.summary || t("surface.proposalDefaultSummary", { count: surfaceDraft.spec.widgets.length })}</p></div><div class="surface-proposal__meta"><span>{t("surface.proposalWidgetsCount", { count: surfaceDraft.spec.widgets.length })}</span><span>{t("surface.proposalDataSourcesCount", { count: surfaceDraft.spec.dataSources.length })}</span></div><div class="customization-actions"><Button variant="ghost" size="sm" onclick={() => { surfaceDraft = undefined; surfaceNotice = t("surface.proposalIgnored"); }}>{t("common.ignore")}</Button><Button size="sm" onclick={applySurfaceProposal}><Check size={13} />{t("surface.confirmRender")}</Button></div></section>{/if}
            {#if generatedSurface && client}<section class="generated-surface" aria-label={t("surface.generatedTitle")}><header><div><div class="section-label">{t("surface.generatedTitle")}</div><strong>{generatedSurface.title}</strong><p>{surfaceNotice || t("surface.readOnlyDesc")}</p></div><div class="customization-actions"><Button variant="ghost" size="sm" disabled={surfaceHistory.length === 0} onclick={undoGeneratedSurface}>{t("common.undo")}</Button><Button variant="ghost" size="sm" onclick={removeGeneratedSurface}><Trash2 size={13} />{t("surface.removeThisSurface")}</Button></div></header>{#if GeneratedSurface}<GeneratedSurface spec={generatedSurface} {client} {activeSessionId} onError={(message) => { surfaceNotice = message; }} />{:else if generatedSurfaceLoadFailed}<div class="surface-load-error" role="alert"><span>{surfaceNotice}</span><Button variant="outline" size="sm" onclick={() => void ensureGeneratedSurfaceComponent()}>{t("common.retry")}</Button></div>{:else}<Loader size={16} />{/if}</section>{/if}
            <div class:activity-open={activityOpen} class="main-grid">
              <div class="conversation-lane">
              {#if ConversationTranscript}<ConversationTranscript
                messages={visibleMessages}
                onOpenBareFile={(name: string) => void openWorkspaceFileByName(name)}
                {client}
                onSurfaceInteraction={handleSurfaceInteraction}
                attachmentFiles={attachmentFilesBySession[activeSessionId] ?? {}}
                sessionId={activeSessionId}
                onStartSession={activeSessionId ? undefined : () => void createSession()}
                startSessionLabel={workspacePath && !workspaceWarning ? t("transcript.startSession") : t("transcript.selectWorkspace")}
                onExportSession={exportSession}
                {sending}
                {historyHasMore}
                {historyLoading}
                onLoadEarlier={loadEarlierHistory}
                quickActions={customization.quickActions.length ? customization.quickActions
                  : workspaceSuggestions(workspaceKind).map((suggestion) => ({ label: t(suggestion.labelKey), prompt: t(suggestion.promptKey) }))}
                onPromptSelect={(prompt) => input = prompt}
                onRegenerate={lastFailedPrompt?.sessionId === activeSessionId ? () => void retryLastPrompt() : undefined}
                onQuote={(quote) => quoteToComposer(quote.text)}
                feedback={feedbackByMessage}
                onRate={(messageId: string, rating: FeedbackRating) => void rateMessage(messageId, rating)}
              />{:else}<Loader size={16} />{/if}
            {#if activeSessionId && terminalOpenSessionId === activeSessionId}
              {#key activeSessionId}<TerminalPanel sessionId={activeSessionId} onClose={() => terminalOpenSessionId = ""} />{/key}
            {/if}
            {#if activeSessionId && activeJobs.length > 0}<JobRoster sessionId={activeSessionId} jobs={activeJobs} onKill={killJob} />{/if}
            {#if activeSessionId && planCards.length > 0}<PlanCard cards={planCards} active={activePlan?.active === true} />{/if}
            {#if activeSessionId && teamBoard && (teamBoardOpen || teamBoard.enabled || teamBoard.tasks.length > 0)}
              <TeamBoard board={teamBoard} busy={!client || sessionResponse.loading} onToggle={(enabled) => void toggleAgentTeam(enabled)} />
            {/if}
            {#if activeSessionId && changesAnnouncement}<ChangedFilesCard sessionId={activeSessionId} seq={changesAnnouncement.seq} turn={changesAnnouncement.turn} />{/if}
            <PendingInteractions
              approval={pendingApproval}
              question={pendingQuestion}
              answers={questionAnswers}
              onAnswer={(id, value, custom = false) => { pendingInteractionsBySession = setQuestionAnswer(pendingInteractionsBySession, activeSessionId, id, value, custom); }}
              busy={interactionBusy}
              onApproval={respondApproval}
              onQuestion={respondQuestion}
            />
            {#if nearOutputLimit && !recoveryReason}
              <div class="error-banner recovery-banner warning-banner" role="status">
                <CircleAlert size={15} />
                <div class="recovery-copy">
                  <strong>{t("activity.outputNearLimitTitle")}</strong>
                  <span>{t("activity.outputNearLimit", { used: (outputTokens ?? 0).toLocaleString(), limit: outputLimit ? outputLimit.toLocaleString() : "-" })}</span>
                </div>
              </div>
            {/if}
            {#if backgroundIssueNotice}
              <div class="error-banner recovery-banner warning-banner" role="status">
                <CircleAlert size={15} />
                <div class="recovery-copy"><strong>{t("activity.backgroundIssueTitle")}</strong><span>{t("activity.backgroundIssueDetail")}</span></div>
              </div>
            {/if}
            {#if recoveryReason && !answerDelivered}
              <div class="error-banner recovery-banner" role="status">
                <CircleAlert size={15} />
                <div class="recovery-copy">
                  <strong>{t("activity.turnIncomplete")}</strong>
                  <span>{t(`activity.recovery.${recoveryReason}`)}</span>
                  {#if outputUsageLine}<small>{outputUsageLine}</small>{:else if recoveryDetail}<small>{recoveryDetail}</small>{:else if runtimeError}<small>{runtimeError}</small>{:else}<small>{t("activity.recoveryNoDetail")}</small>{/if}
                  {#if autoContinueExhausted && !continuingTask}
                    <small>{t("activity.autoContinueExhausted", { limit: AUTO_CONTINUE_LIMIT })}</small>
                  {:else if continuingTask && recoveryReason === "maxTokens"}
                    <small>{t("activity.autoContinuing", { attempt: autoContinueAttempt, limit: AUTO_CONTINUE_LIMIT })}</small>
                  {/if}
                  <details class="recovery-diagnostic">
                    <summary>{t("activity.recoveryDetails")}</summary>
                    <dl>
                      <div><dt>{t("activity.recoveryReason")}</dt><dd>{recoveryReason}</dd></div>
                      {#if outputUsageLine}<div><dt>{t("activity.recoveryUsage")}</dt><dd>{outputUsageLine}</dd></div>{/if}
                      {#if recoveryReason === "maxTokens"}<div><dt>{t("activity.recoveryAutoContinue")}</dt><dd>{autoContinueAttempt} / {AUTO_CONTINUE_LIMIT}</dd></div>{/if}
                      <div><dt>{t("activity.recoveryWorkspace")}</dt><dd title={workspacePath}>{workspacePath || t("overview.unselected")}</dd></div>
                      <div><dt>{t("activity.recoverySession")}</dt><dd>{activeSessionId || t("overview.unselected")}</dd></div>
                      {#if recoveryDetail}<div><dt>{t("activity.recoveryErrorDetail")}</dt><dd>{recoveryDetail}</dd></div>{/if}
                      {#if lastFailedTool}<div><dt>{t("activity.recoveryFailedTool")}</dt><dd>{lastFailedTool.name}: {toolErrorSummary(lastFailedTool.result)}</dd></div>{/if}
                      {#if lastFailedTool?.result}<div><dt>{t("activity.recoveryRawDetail")}</dt><dd><pre class="recovery-raw">{lastFailedTool.result.slice(0, 4000)}</pre></dd></div>{/if}
                    </dl>
                  </details>
                </div>
                <div class="recovery-actions">
                  {#if lastFailedPrompt?.sessionId === activeSessionId && !sending}
                    <Button variant="outline" size="sm" onclick={() => void retryLastPrompt()}><RotateCcw size={13} />{t("activity.retryTurn")}</Button>
                  {/if}
                  {#if browserSkillErrorKey(recoveryDetail)}
                    <Button variant="outline" size="sm" onclick={() => { openManagement("settings"); switchSettingsSection("advanced"); }}><Blocks size={13} />{t("browserExtension.installAction")}</Button>
                  {/if}
                  <Button variant="outline" size="sm" disabled={continuingTask || !!runtimeConnectionError} onclick={() => void retryInterruptedTask()}>
                    <RotateCcw size={13} />{t("activity.continueTask")}
                  </Button>
                </div>
              </div>
            {/if}
            {#key activeSessionId}
            {@const composerSessionId = activeSessionId}
            <div class="composer">
              {#if activeQueueRows.length === 0 && coldInboxCount > 0}
                <div class="queued-list" role="status">
                  <div class="queued-list-head">
                    <span>{t("composer.coldInbox", { count: coldInboxCount })}</span>
                    <small>{t("composer.coldInboxHint")}</small>
                  </div>
                </div>
              {/if}
              {#if activeQueueRows.length > 0}
                <div class="queued-list" role="status">
                  <div class="queued-list-head">
                    <span>{t("composer.queuedCount", { count: activeQueueRows.length })}</span>
                    <small>{t("composer.queueNativeHint")}</small>
                  </div>
                  {#each activeQueueRows as row (row.id)}
                    <div class="queued-prompt">
                      <span class="queued-index">{row.position ?? "↳"}</span>
                      <span>{row.summary || t("composer.queueAttachmentOnly")}</span>
                      {#if row.placement === "steering"}<span class="queued-badge">{t("composer.queueSteering")}</span>{/if}
                      <span class="queued-actions">
                        {#if isMutableQueueItem(row)}
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={row.attachmentCount > 0}
                            title={row.attachmentCount > 0 ? t("composer.queueEditWithAttachments") : t("composer.queueEditHint")}
                            onclick={() => void editQueuedPrompt(row)}
                          >{t("composer.queueEdit")}</Button>
                          <Button variant="ghost" size="sm" title={t("composer.queueSteerHint")} onclick={() => void steerQueuedPrompt(row)}>{t("composer.queueSteer")}</Button>
                          <Button variant="ghost" size="sm" onclick={() => void cancelQueuedPrompt(row)}>{t("common.cancel")}</Button>
                        {/if}
                      </span>
                    </div>
                  {/each}
                </div>
              {/if}
              {#if activePlan?.active}
                <div class="plan-mode-banner" role="status">
                  <ListChecks size={14} aria-hidden="true" />
                  <span>{t("plan.toggleHint")}</span>
                  <Button variant="ghost" size="sm" disabled={!client || sessionResponse.loading} onclick={() => void togglePlanMode()}>
                    {t("plan.toggleOff")}
                  </Button>
                </div>
              {/if}
              {#if draftSecretCount > 0}
                <div class="secret-warning" role="status"><ShieldAlert size={14} aria-hidden="true" /><span>{t("composer.secretWarning", { count: String(draftSecretCount) })}</span></div>
              {/if}
              {#if commandNotice}
                <div class="command-notice" role="status"><CircleCheck size={14} aria-hidden="true" /><span>{commandNotice}</span></div>
              {/if}
              <div class="composer-shell"><DshPromptComposer
              bind:value={() => composerSessionId === activeSessionId ? input : sessionDrafts[composerSessionId] ?? "", (text) => {
                sessionDrafts[composerSessionId] = text;
                if (composerSessionId === activeSessionId) input = text;
              }}
              bind:draftFiles={() => draftFilesBySession[composerSessionId] ?? [], (files) => { draftFilesBySession[composerSessionId] = files; }}
              {client}
              sessionId={activeSessionId}
              {skills}
              commands={hostCommands}
              rows={customization.composerRows}
              disabled={!activeSessionId || !!sessionLoadError || sessionResponse.loading || sessionResponse.phase === "disconnected" || !!pendingApproval || !!pendingQuestion}
              loading={taskActive}
              {selectedModel}
              modelGroups={availableModelGroups}
              imageInputSupported={modelSupportsImages(selectedModelInfo())}
              {modelBusy}
              {modelLoading}
              {modelLoadError}
              onModelSettings={() => openManagement("models")}
              onVoiceSettings={openVoiceSettings}
              onConfigureImageModel={openImageModelSettings}
              contextPermissions={activeSession?.projections?.values?.permissions}
              {activityOpen}
              onModelSelect={(provider, model) => void chooseModel(provider, model)}
              onPermissionNotice={permissionNotice}
              onActivityOpen={() => setActivityOpen(true)}
              onSubmit={async (text, images, files) => {
                const accepted = await submit(text, images, files, composerSessionId);
                // 未被接受（canSubmit=false 等）不能让组件误以为成功，否则草稿会被清掉。
                if (!accepted) throw new Error(runtimeError || t("errors.generalError"));
              }}
              onQueue={(text, images, files) => void queueCurrentPrompt(composerSessionId, { text, images, files })}
              onStop={() => void cancel()}
            /></div></div>
            {/key}
              </div>
              {#if activityOpen && ActivityPanel}<ActivityPanel messages={visibleMessages} {todos} {sessionOperations} sending={taskActive} {client} sessionId={activeSessionId} history={historyEntries} open={activityOpen} onClose={() => setActivityOpen(false)} onRetry={retryInterruptedTask} onStop={() => void cancel()} />{/if}
            </div>
          </div>
        {/if}
      </section>
      <ShortcutsPanel open={shortcutsOpen} onClose={() => shortcutsOpen = false} />
      {#if quickPickerOpen}<QuickPicker open={quickPickerOpen} query={quickPickerQuery} items={quickPickerEntries} selectedIndex={quickPickerIndex} activeSessionId={activeSessionId} onQuery={updateQuickPickerQuery} onSelect={runQuickPickerItem} onClose={closeQuickPicker} />{/if}
      {#if confirmingSessionId}
        {@const sessionToArchive = sessions.find((session) => session.sessionId === confirmingSessionId)}
        {#if sessionToArchive}
          <ArchiveSessionDialog
            title={sessionTitle(sessionToArchive)}
            disabled={sessionToArchive.running || !!managementBusy}
            onConfirm={() => void deleteManagedSession(sessionToArchive.sessionId)}
            onCancel={() => confirmingSessionId = ""}
          />
        {/if}
      {/if}
      {#if confirmingDeleteSessionId}
        {@const sessionToDelete = sessions.find((session) => session.sessionId === confirmingDeleteSessionId)}
        {#if sessionToDelete}
          <DeleteSessionDialog
            title={sessionTitle(sessionToDelete)}
            heading={t("session.deleteForever")}
            description={t("session.deleteForeverConfirm", { title: sessionTitle(sessionToDelete) })}
            confirmText={t("session.deleteForever")}
            disabled={sessionToDelete.running || !!managementBusy}
            onConfirm={() => void deleteSessionPermanently(sessionToDelete.sessionId)}
            onCancel={() => confirmingDeleteSessionId = ""}
          />
        {/if}
      {/if}
      {#if confirmingClearConversation}
        <DeleteSessionDialog
          title={t("session.clearConversation")}
          heading={t("session.clearConversation")}
          description={t("session.clearConversationConfirm")}
          confirmText={t("session.clearConversation")}
          disabled={sending || !!managementBusy}
          onConfirm={() => void clearActiveConversation()}
          onCancel={() => confirmingClearConversation = false}
        />
      {/if}
      {#if newSessionDialogOpen}
        <NewSessionDialog
          defaultChatDirectory={defaultChatDirectory}
          workspaces={workspaces}
          busy={newSessionBusy}
          onStartChat={startChatSession}
          onStartProject={(workspace) => void startProjectSession(workspace)}
          onPickDirectory={() => void pickProjectDirectoryForSession()}
          onCancel={() => newSessionDialogOpen = false}
        />
      {/if}
      {#if confirmingArchivedSessionId}
        {@const archivedSessionToPurge = archivedSessions.find((session) => session.sessionId === confirmingArchivedSessionId)}
        {#if archivedSessionToPurge}
          <DeleteSessionDialog
            title={sessionTitle(archivedSessionToPurge)}
            description={t("session.purgeConfirm", { title: sessionTitle(archivedSessionToPurge) })}
            disabled={archivedSessionToPurge.running || !!managementBusy}
            onConfirm={() => void purgeArchivedSession(archivedSessionToPurge.sessionId)}
            onCancel={() => confirmingArchivedSessionId = ""}
          />
        {/if}
      {/if}
      <ConfirmDialog
        open={confirmingArchivedCleanup}
        title={t("session.cleanupArchived")}
        message={t("session.cleanupConfirm", { count: archivedSessions.length })}
        confirmText={t("common.delete")}
        cancelText={t("common.cancel")}
        variant="danger"
        confirming={!!managementBusy}
        onconfirm={() => void cleanupArchivedSessions()}
        oncancel={() => confirmingArchivedCleanup = false}
      />
    </div>
  </main>
{/if}
  {#snippet failed(error, reset)}
    <main class="boot-failure" role="alert">
      <h1>工作台渲染失败</h1>
      <p>界面组件出现异常。可以重试；如果问题持续，请重启应用并保留下方诊断信息。</p>
      <pre>{error instanceof Error ? error.message : String(error)}</pre>
      <button type="button" onclick={reset}>重试界面</button>
    </main>
  {/snippet}
</svelte:boundary>
