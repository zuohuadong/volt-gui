<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    Activity,
    AlertTriangle,
    Archive,
    ArrowLeft,
    ArrowDown,
    ArrowRight,
    ArrowUp,
    Blocks,
    BookMarked,
    BookOpen,
    Bot,
    BrainCircuit,
    BriefcaseBusiness,
    CalendarDays,
    Check,
    ChevronDown,
    CirclePlus,
    ClipboardList,
    Code2,
    ContactRound,
    Crosshair,
    Crown,
    Database,
    Download,
    FileText,
    Folder,
    FolderKanban,
    Gauge,
    GitBranch,
    LayoutDashboard,
    List,
    ListTodo,
    Loader2,
    Mail,
    MapPin,
    Maximize2,
    MousePointer2,
    Move,
    PanelLeft,
    Pencil,
    Phone,
    Plus,
    Puzzle,
    RefreshCw,
    RotateCcw,
    Search,
    Settings,
    ShieldCheck,
    Sparkles,
    Trash2,
    Upload,
    UserRound,
    UsersRound,
    Workflow,
    Zap,
    ZoomIn,
    ZoomOut,
  } from "@lucide/svelte";
  import CodeDashboard from "./components/CodeDashboard.svelte";
  import Composer from "./components/Composer.svelte";
  import Transcript from "./components/Transcript.svelte";
  import OIDCLoginOverlay from "./components/OIDCLoginOverlay.svelte";
  import { app, onAgentEvent, onWorkspaceReady } from "./lib/bridge";
  import { t } from "./lib/i18n";
  import {
    backendToolApprovalModeToComposer,
    composerToolApprovalModeToBackend,
  } from "./lib/tool-approval-mode";
  import type { ComposerToolApprovalMode } from "./lib/tool-approval-mode";
  import type {
    ActivityMode,
    AgentInput,
    AgentView,
    BrandInfo,
    CapabilitiesView,
    CheckpointMeta,
    CommandInfo,
    ContextPanelInfo,
    FilePreview,
    HistoryMessage,
    ModelInfo,
    MCPServerInput,
    ProviderView,
    QuestionAnswer,
    SettingsView,
    TabMeta,
    TranscriptItem,
    WireApproval,
    WireAsk,
    WireEvent,
    WorkbenchPluginInput,
    WorkbenchPlugin,
	CloudflareDropPreflight,
	WorkbenchJob,
    WorkbenchTodo,
    WorkbenchTodoInput,
    WorkbenchProject,
    WorkbenchProjectInput,
    WorkbenchProjectMaterial,
    WorkbenchProjectMaterialBatchInput,
    WorkbenchProjectMaterialInput,
    WorkbenchAutomation,
    WorkbenchAutomationInput,
    WorkbenchCalendarEvent,
    WorkbenchCalendarEventInput,
    WorkbenchCustomer,
    WorkbenchCustomerInput,
    WorkbenchData,
    KnowledgeBaseView,
    KnowledgeDocumentImportInput,
    KnowledgeStatus,
    WorkbenchKnowledgeDocument,
    WorkbenchKnowledgeDocumentInput,
    SkillPackageInput,
    WorkbenchOperationLog,
    WorkbenchRegulation,
    WorkbenchReport,
    WorkbenchReportInput,
    WorkbenchSearchResult,
    WorkbenchSyncJob,
    WorkbenchTeamChatMessage,
    WorkbenchTeamRoom,
    WorkbenchTeamRuntimeInput,
    WorkbenchTeamRuntimeResult,
    WorkbenchTeamRun,
    WorkbenchTeamRunEvent as TeamRunEvent,
    WorkbenchTeamRunStatus as TeamRunStatus,
    WorkspaceDiffView,
    WorkspaceChangesView,
  } from "./lib/types";


  // Cap the in-memory transcript to prevent unbounded growth during long sessions.
  // Older items are trimmed when the array exceeds this threshold.
  const MAX_TRANSCRIPT_ITEMS = 500;
  const MAX_DATA_URL_PROJECT_MATERIAL_BYTES = 25 * 1024 * 1024;
  type WorkLayer = "today" | "newTask" | "todos" | "automations" | "agents" | "projects" | "customers" | "calendar" | "reports" | "resources" | "knowledge" | "teams" | "models" | "settings" | "operationLog" | "search" | "sync" | "ingest" | "capabilities";
  type CodeWorkbenchAction = "conversation" | "overview" | "workspace" | "context" | "changes" | "checkpoints" | "models" | "settings";
  type CodeWorkbenchPanel = "overview" | "workspace" | "context" | "changes" | "checkpoints";
  type CapabilityTab = "plugin" | "mcp" | "skill";
  type ResourceTab = "resources" | "knowledge" | "search" | "conversationArchive" | "ingest";
  type CustomerDetailTab = "overview" | "projects" | "materials" | "schedules" | "todos";
  type ProjectDetailTab = "overview" | "materials" | "schedules" | "reports" | "todos";
  type ArtifactCanvasMode = "select" | "pan";
  type ArtifactReviewStageId = "copy" | "draft" | "design" | "export";
  type ArtifactReviewStage = { id: ArtifactReviewStageId; label: string; status: string };
  type ArtifactReviewFinding = { id: string; label: string; target: string; status: string; x: number; y: number };
  type ArtifactStyleOption = { id: string; name: string; templateVersion: string; brandKitVersion: string; rationale: string };
  type AgentMarketItem = Pick<AgentView, "id" | "name" | "role" | "runs" | "status" | "desc"> & { category: string; source: string; version: string; tags: string[]; localPath: string };
  type SidebarConversation = { id: string; title: string; updatedAt: string; updatedAtMs?: number; archivedAtMs?: number; transcript?: TranscriptItem[]; tabId?: string; topicId?: string; sessionPath?: string; scope?: TabMeta["scope"]; workspaceRoot?: string };
  type SidebarProject = { id: string; name: string; expanded: boolean; conversations: SidebarConversation[]; localPath?: string; updatedAtMs: number };
  type SidebarStateSnapshot = { version: 1; projects: SidebarProject[]; activeProjectId: string; activeConversationId: string; sort: SidebarProjectSort; dockCollapsed: boolean };
  type SidebarProjectSort = "recent" | "name" | "conversations";
  type ConfigDialog = "schedule" | "todo" | "report" | "model" | "ingest" | "knowledge" | "resource" | "template" | "project" | "customer" | "team" | "dossier" | "selectProject" | "selectCustomer" | "distill";
  type UserPanelDialog = "models" | "settings" | "sync" | "operationLog";
  type SettingPanel = "general" | "runtime" | "models";
  type ModelCard = { name: string; provider: string; role: string; status: string; ref?: string };
  type CalendarMonthCell = { key: string; day: number; date: string; inMonth: boolean; isToday: boolean; events: WorkbenchCalendarEvent[] };
  type CalendarEventInterval = { event: WorkbenchCalendarEvent; date: string; start: number; end: number };
  type CalendarConflictGroup = { date: string; start: number; end: number; events: WorkbenchCalendarEvent[] };
  type SettingGroup = { id: SettingPanel; title: string; desc: string; status: string };
  type TodoPersistenceBindings = {
    ListTodos?: () => Promise<WorkbenchTodo[]>;
    SaveTodo?: (input: WorkbenchTodoInput) => Promise<WorkbenchTodo>;
    DeleteTodo?: (id: string) => Promise<void>;
  };
  type ProjectPersistenceBindings = {
    ListWorkbenchProjects?: () => Promise<WorkbenchProject[]>;
    SaveWorkbenchProject?: (input: WorkbenchProjectInput) => Promise<WorkbenchProject>;
    DeleteWorkbenchProject?: (id: string) => Promise<void>;
  };
  type ProjectMaterialPersistenceBindings = {
    ListProjectMaterials?: () => Promise<WorkbenchProjectMaterial[]>;
    SaveProjectMaterial?: (input: WorkbenchProjectMaterialInput) => Promise<WorkbenchProjectMaterial>;
    SaveProjectMaterialsBatch?: (input: WorkbenchProjectMaterialBatchInput) => Promise<WorkbenchProjectMaterial[]>;
    DeleteProjectMaterial?: (id: string) => Promise<void>;
  };
  type PickedProjectMaterialFile = {
    selectionToken?: string;
    path?: string;
    name: string;
    size: number;
    mimeType: string;
  };
  type ProjectMaterialFileBindings = {
    PickProjectMaterialFile?: () => Promise<PickedProjectMaterialFile>;
    ImportProjectMaterialFile?: (selectionToken: string) => Promise<PickedProjectMaterialFile>;
  };
  type AutomationPersistenceBindings = {
    ListAutomations?: () => Promise<WorkbenchAutomation[]>;
    SaveAutomation?: (input: WorkbenchAutomationInput) => Promise<WorkbenchAutomation>;
    DeleteAutomation?: (id: string) => Promise<void>;
    RunAutomationNow?: (id: string) => Promise<WorkbenchAutomation>;
  };
  type WorkbenchDataPersistenceBindings = {
    ListWorkbenchData?: () => Promise<WorkbenchData>;
    ListCustomers?: () => Promise<WorkbenchCustomer[]>;
    SaveCustomer?: (input: WorkbenchCustomerInput) => Promise<WorkbenchCustomer>;
    DeleteCustomer?: (id: string) => Promise<void>;
    ListCalendarEvents?: () => Promise<WorkbenchCalendarEvent[]>;
    SaveCalendarEvent?: (input: WorkbenchCalendarEventInput) => Promise<WorkbenchCalendarEvent>;
    ListWorkbenchReports?: () => Promise<WorkbenchReport[]>;
    SaveWorkbenchReport?: (input: WorkbenchReportInput) => Promise<WorkbenchReport>;
    SaveKnowledgeDocument?: (input: WorkbenchKnowledgeDocumentInput) => Promise<WorkbenchKnowledgeDocument>;
    RunWorkbenchSync?: (scope: string) => Promise<WorkbenchSyncJob[]>;
    SearchWorkbench?: (query: string) => Promise<WorkbenchSearchResult[]>;
    ExportOperationLogs?: () => Promise<string>;
    ExportWorkbenchReports?: () => Promise<string>;
    ExportWorkbenchReport?: (id: string) => Promise<string>;
    DeleteWorkbenchReport?: (id: string) => Promise<void>;
    SaveTeamRoom?: (input: WorkbenchTeamRoom) => Promise<WorkbenchTeamRoom>;
    SaveTeamRun?: (input: WorkbenchTeamRun) => Promise<WorkbenchTeamRun>;
    SaveTeamChatMessage?: (input: WorkbenchTeamChatMessage) => Promise<WorkbenchTeamChatMessage>;
    RunTeamRuntime?: (input: WorkbenchTeamRuntimeInput) => Promise<WorkbenchTeamRuntimeResult>;
    DistillAgentFromTodo?: (input: WorkbenchTodoInput, skillNames: string[]) => Promise<AgentView>;
  };
  type KnowledgePersistenceBindings = {
    KnowledgeBase?: () => Promise<KnowledgeBaseView>;
    KnowledgeStatus?: () => Promise<KnowledgeStatus>;
    ImportKnowledgeDocument?: (input: KnowledgeDocumentImportInput) => Promise<WorkbenchKnowledgeDocument>;
    DeleteKnowledgeDocument?: (id: string) => Promise<void>;
  };
  type WorkspaceNavItem = { label: string; layer: WorkLayer; icon: WorkLayer; badge?: string; resourceTab?: ResourceTab };
  type WorkspaceNavSection = { title: string; items: WorkspaceNavItem[] };
  type AutomationDraft = WorkbenchAutomationInput & { stepsText: string; logsText: string };
  const defaultBrand: BrandInfo = { name: "VoltUI", shortName: "VoltUI" };
  const automationKindOptions = ["验证自动化", "质量门禁", "工程验证", "浏览器验证", "定时巡检", "报告生成", "自定义自动化"];
  const automationStatusOptions = ["待配置", "运行中", "已暂停", "已停用", "失败", "已完成"];
  const automationOwnerOptions = ["自动化 Agent", "代码审查 Agent", "Browser 插件", "资料研究 Agent"];
  const automationScheduleModeOptions = [
    { value: "manual", label: "手动触发" },
    { value: "once", label: "一次性定时" },
    { value: "daily", label: "每天" },
    { value: "weekly", label: "每周" },
  ];
  const automationCommandOptions = [
    { value: "", label: "不执行命令" },
    { value: "frontend-check", label: "前端类型检查：pnpm check" },
    { value: "frontend-build", label: "前端构建：pnpm build" },
    { value: "diff-check", label: "空白检查：git diff --check" },
    { value: "desktop-go-test", label: "桌面 Go 测试：go test ./..." },
    { value: "root-go-test", label: "根模块 Go 测试：go test ./..." },
  ];
  type SettingsDraft = {
    language: string;
    theme: string;
    themeStyle: string;
    closeBehavior: string;
    permissionMode: string;
    sandboxBash: string;
    sandboxNetwork: boolean;
    sandboxWorkspaceRoot: string;
    sandboxAllowWrite: string;
    sandboxShell: string;
  };
  type ModelProviderDraft = {
    name: string;
    kind: string;
    baseUrl: string;
    modelsText: string;
    defaultModel: string;
    apiKeyEnv: string;
    apiKeyValue: string;
    modelsUrl: string;
    apiSurface: string;
    responsesUrl: string;
    priority: string;
    fetchedModels: string[];
    selectedFetchedModels: string[];
    contextWindow: string;
    reasoningProtocol: string;
    supportedEffortsText: string;
    defaultEffort: string;
    visionModelsText: string;
  };

  function welcomeTranscript(): TranscriptItem[] {
    return [
      {
        id: "system-welcome",
        role: "system",
        body: t.transcript.welcome,
      },
    ];
  }

  let activityMode = $state<ActivityMode>("work");
  let tabs = $state<TabMeta[]>([]);
  let models = $state<ModelInfo[]>([]);
  let commands = $state<CommandInfo[]>([]);
  let selectedModel = $state("");
  let linkedProject = $state("");
  let previewWorkPermission = $state<ComposerToolApprovalMode>("ask");
  let permissionChanging = $state(false);
  let linkedCustomer = $state("");
  let input = $state("");
  let transcript = $state<TranscriptItem[]>(welcomeTranscript());
  let context = $state<ContextPanelInfo | undefined>();
  let changes = $state<WorkspaceChangesView | undefined>();
  let checkpoints = $state<CheckpointMeta[]>([]);
  let filePreview = $state<FilePreview | undefined>();
  let diffPreview = $state<WorkspaceDiffView | undefined>();
  let pendingApproval = $state<WireApproval | undefined>();
  let pendingAsk = $state<WireAsk | undefined>();
  let loading = $state(true);
  let needsAuth = $state<boolean | null>(null);
  let sending = $state(false);
  let sidebarCollapsed = $state(false);
  let codeInspectorOpen = $state(false);
  let codeWorkbenchPanel = $state<CodeWorkbenchPanel>("overview");
  let workLayer = $state<WorkLayer>("today");
  let lastWorkLayer = $state<WorkLayer>("today");
  let capabilityTab = $state<CapabilityTab>("plugin");
  let capabilitySearch = $state("");
  let selectedCapabilityId = $state("git-panel");
  let capabilityDetailOpen = $state(false);
	let cloudflareDropPreflight = $state<CloudflareDropPreflight | undefined>();
	let cloudflareDropJob = $state<WorkbenchJob | undefined>();
	let cloudflareDropPreviewURL = $state("");
	let cloudflareDropWorking = $state(false);
  let capabilityCreateOpen = $state(false);
  let capabilityImportOpen = $state(false);
  let capabilityCreateName = $state("新建插件");
  let capabilityCreateGroup = $state("插件");
  let capabilityCreateVersion = $state("v0.1");
  let capabilityCreateScope = $state("desktop/frontend");
  let capabilityCreateEntry = $state("plugin.json");
  let capabilityCreateTransport = $state<"stdio" | "http" | "sse">("stdio");
  let capabilityCreateArgs = $state("");
  let capabilityCreateStatus = $state("启用");
  let capabilityCreateDescription = $state("");
  let capabilityCreateMcpEnv = $state("");
  let capabilityImportInput = $state<HTMLInputElement | undefined>();
  let capabilityImportText = $state("");
  let resourceTab = $state<ResourceTab>("resources");
  let resourceSearch = $state("");
  let collapsedWorkspaceSections = $state<string[]>([]);
  let userMenuOpen = $state(false);
  let agentSelectorOpen = $state(false);
  let userPanelDialog = $state<UserPanelDialog | undefined>();
  let brand = $state<BrandInfo>(defaultBrand);
  let modelSettings = $state<SettingsView | undefined>();
  let modelSettingsLoading = $state(false);
  let modelSettingsError = $state("");
  let settingsPanel = $state<SettingPanel>("general");
  let settingsDraft = $state<SettingsDraft>(emptySettingsDraft());
  let settingsSaving = $state(false);
  let settingsMessage = $state("");
  let modelDraft = $state<ModelProviderDraft>(emptyModelProviderDraft());
  let modelDraftEditing = $state(false);
  let modelDraftSaving = $state(false);
  let modelDraftFetching = $state(false);
  let modelDraftMessage = $state("");
  let modelDraftError = $state("");
  let teamViewMode = $state<"teams" | "office" | "chat">("teams");
  let teamConfigTitle = $state<string | undefined>();
  let teamBuilderName = $state("");
  let teamBuilderSearch = $state("");
  let teamBuilderMemberIds = $state<string[]>(["code-review", "research"]);
  let teamBuilderLeaderId = $state("code-review");
  let teamChatInput = $state("");
  let teamChatModel = $state("");
  let teamChatAttachments = $state<string[]>([]);
  let teamChatSending = $state(false);
  let automationDialog = $state<string | undefined>();
  let agentWizardOpen = $state(false);
  let agentMarketOpen = $state(false);
  let agentMarketSearch = $state("");
  let downloadedMarketAgentIds = $state<string[]>([]);
  let agentWizardTab = $state("identity");
  let agentWizardMode = $state<"create" | "edit">("edit");
  let agentWizardDraftName = $state("");
  let agentWizardDraftDescription = $state("");
  let agentWizardVibe = $state("");
  let selectedAgentId = $state("code-review");
  let selectedCoreFile = $state("SYSTEM.md");
  let configDialog = $state<ConfigDialog | undefined>();
  let scheduleDraftTitleValue = $state("");
  let scheduleDraftDate = $state("");
  let scheduleDraftTimeValue = $state("");
  let scheduleDraftType = $state("");
  let scheduleDraftPlaceValue = $state("");
  let selectedScheduleEventId = $state<string | undefined>();
  let selectedProjectId = $state("volt-gui");
  let selectedCustomerId = $state("internal");
  let projectSearch = $state("");
  let customerSearch = $state("");
  let customerDetailTab = $state<CustomerDetailTab>("overview");
  let projectDetailTab = $state<ProjectDetailTab>("overview");
  let projectStatusFilter = $state<"all" | "active" | "closed">("all");
  let projectDetailOpen = $state(false);
  let customerDetailOpen = $state(false);
  let selectedTeamTitle = $state<string | undefined>();
  let distillStep = $state(1);
  let agentProvider = $state("OpenAI");
  let agentModel = $state("GPT-4o");
  let agentAvatar = $state("C");
  let nowMs = $state(Date.now());
  let submittedDraft = $state<{ display: string; submission: string } | undefined>();
  let newTaskConversationActive = $state(false);
  let restoreDraftOnTurnDone = false;
  let draftConversationThread: TabMeta | undefined;
  let draftConversationThreadRequest: Promise<TabMeta | undefined> | undefined;
  let draftConversationToken = 0;
  let activeConversationTabId = $state("");
  let conversationScrollEl = $state<HTMLDivElement | null>(null);
  let conversationScrollFrame: number | undefined;
  let sidebarStateHydrated = false;

  const activeTab = $derived(tabs.find((tab) => tab.active) ?? tabs[0]);
  const currentComposerTab = $derived(activeConversationTabId ? tabs.find((tab) => tab.id === activeConversationTabId) ?? activeTab : activeTab);
  const composerWorkPermission = $derived(
    hasWailsBindings()
      ? backendToolApprovalModeToComposer(currentComposerTab?.toolApprovalMode)
      : previewWorkPermission,
  );
  const composerDisabledReason = $derived(
    hasWailsBindings() && currentComposerTab && currentComposerTab.ready === false
      ? "工作区正在准备中，请稍后发送"
      : "",
  );
  const hasConversation = $derived(transcript.some((item) => item.id !== "system-welcome" && item.role !== "system"));
  const showTranscript = $derived(hasConversation || sending || Boolean(pendingApproval) || Boolean(pendingAsk));
  const showActiveTranscript = $derived(((activityMode === "code" && newTaskConversationActive) || (activityMode === "work" && workLayer === "newTask" && newTaskConversationActive)) && (showTranscript || newTaskConversationActive));
  const brandName = $derived(brand.name?.trim() || "VoltUI");
  const brandShortName = $derived(brand.shortName?.trim() || brandName);
  const brandMarkSrc = $derived(brand.logoDataUrl || brand.iconDataUrl || "");
  const brandWordmarkSrc = $derived(brand.wordmarkDataUrl || "");
  const landing = $derived(activityMode === "code" ? t.home.code : t.home.work);
  const changedCount = $derived(changes?.files.length ?? 0);
  const contextPercent = $derived(context ? Math.min(100, Math.round((context.usedTokens / Math.max(context.windowTokens, 1)) * 100)) : 0);
  const navIcons = {
    today: LayoutDashboard,
    newTask: CirclePlus,
    todos: ListTodo,
    automations: Workflow,
    agents: Bot,
    projects: FolderKanban,
    customers: ContactRound,
    calendar: CalendarDays,
    resources: Database,
    knowledge: BookMarked,
    teams: UsersRound,
    capabilities: Blocks,
    models: BrainCircuit,
    settings: Settings,
    operationLog: ClipboardList,
    search: Search,
    sync: RefreshCw,
    ingest: Upload,
    reports: FileText,
  } as const;
  const agentIcons = {
    "code-review": ShieldCheck,
    research: BookMarked,
    automation: Workflow,
    "requirement-planner": ClipboardList,
    "contract-review": FileText,
    "customer-followup": ContactRound,
    "data-analyst": Database,
    "qa-verifier": ShieldCheck,
    "meeting-scheduler": CalendarDays,
  } as const;
  const avatarIcons = {
    C: Bot,
    R: BookMarked,
    A: Workflow,
    M: BrainCircuit,
    S: Sparkles,
    P: BriefcaseBusiness,
  } as const;
  function navIcon(layer: WorkLayer) { return navIcons[layer] ?? Puzzle; }
  function agentIcon(agentId: string) { return agentIcons[agentId as keyof typeof agentIcons] ?? Bot; }
  function avatarIcon(avatar: string) { return avatarIcons[avatar as keyof typeof avatarIcons] ?? UserRound; }
  function modelValue(model?: ModelInfo) { return model?.ref || model?.name || model?.model || model?.label || ""; }
  function currentWorkLayerLabel() {
    if (workLayer === "resources" && resourceTab === "knowledge") return "知识库";
    if (workLayer === "resources" && resourceTab === "search") return "全文检索";
    if (workLayer === "resources" && resourceTab === "ingest") return "导入中心";
    return workLayerLabels[workLayer];
  }

  const workspaceNav = [
    { title: "工作处理", items: [{ label: "今日概览", layer: "today", icon: "today" }, { label: "新建任务", layer: "newTask", icon: "newTask" }, { label: "待办事项", layer: "todos", icon: "todos" }, { label: "自动化", layer: "automations", icon: "automations", badge: "3" }] },
    { title: "业务资料", items: [{ label: "项目管理", layer: "projects", icon: "projects" }, { label: "客户管理", layer: "customers", icon: "customers" }, { label: "资料中心", layer: "resources", icon: "resources", resourceTab: "resources" }, { label: "知识库", layer: "resources", icon: "knowledge", resourceTab: "knowledge" }] },
    { title: "协作交付", items: [{ label: "团队协作", layer: "teams", icon: "teams" }, { label: "日程日历", layer: "calendar", icon: "calendar" }, { label: "报告中心", layer: "reports", icon: "reports" }] },
    { title: "Agent 能力", items: [{ label: "Agent 中心", layer: "agents", icon: "agents" }, { label: "能力中心", layer: "capabilities", icon: "capabilities" }] },
  ] as WorkspaceNavSection[];
  const codeWorkspaceNav = [
    { title: "代码工作台", items: [
      { label: "代码对话", desc: "面向工程问题的 Agent 会话", action: "conversation", icon: "newTask" },
      { label: "总览", desc: "模型、权限、仓库和变更概况", action: "overview", icon: "today" },
      { label: "Workspace", desc: "文件树、预览和当前工作区", action: "workspace", icon: "projects" },
      { label: "上下文窗口", desc: "查看 token、缓存命中和读写文件", action: "context", icon: "reports" },
      { label: "变更审查", desc: "聚焦 diff、预览和回滚范围", action: "changes", icon: "projects" },
      { label: "检查点", desc: "按会话或代码范围回退", action: "checkpoints", icon: "automations" },
    ] },
    { title: "代码配置", items: [
      { label: "模型渠道", desc: "选择 coding 模型与 provider", action: "models", icon: "models" },
      { label: "权限沙箱", desc: "终端、网络和写入边界", action: "settings", icon: "settings" },
    ] },
  ] as { title: string; items: { label: string; desc: string; action: CodeWorkbenchAction; icon: WorkLayer }[] }[];
  const workLayerLabels: Record<WorkLayer, string> = {
    today: "工作台",
    newTask: "新建对话",
    todos: "待办事项",
    automations: "自动化",
    agents: "Agent 中心",
    projects: "项目管理",
    customers: "客户管理",
    calendar: "日历日程",
    reports: "报告中心",
    resources: "资料中心",
    knowledge: "知识库",
    teams: "团队协作",
    models: "模型管理",
    settings: "系统设置",
    operationLog: "操作记录",
    search: "搜索",
    sync: "同步中心",
    ingest: "导入资料",
    capabilities: "能力中心",
  };
  const workbenchModeCopy: Record<ActivityMode, { title: string; eyebrow: string; desc: string }> = {
    work: {
      title: "Work 工作台",
      eyebrow: "Projects / Agents / Operations",
      desc: "面向业务、项目、客户、资料和团队协作，把 Agent 当成可编排的生产力成员。",
    },
    code: {
      title: "Code 工作台",
      eyebrow: "Code / Diff / Context",
      desc: "面向研发和代码变更，围绕仓库上下文、diff、检查点、权限和模型选择组织界面。",
    },
  };
  const collapsibleWorkspaceSections = new Set(["业务资料", "协作交付", "Agent 能力"]);
  const userMenuItems = [{ label: "模型管理", layer: "models" }, { label: "系统设置", layer: "settings" }, { label: "同步中心", layer: "sync" }, { label: "操作记录", layer: "operationLog" }] as { label: string; layer: UserPanelDialog }[];
  let todoItems = $state<WorkbenchTodo[]>([
    { id: "todo-preview-load", title: "验证桌面预览加载状态", description: "确认浏览器模式无需 Wails 绑定也能进入工作台", dueLabel: "今天", status: "in_progress", priority: "中", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: "seed" },
    { id: "todo-agent-template", title: "整理 Agent 创建模板", description: "补齐工具、技能、核心文件与模型配置", dueLabel: "16:00", status: "pending", priority: "中", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: "seed" },
    { id: "todo-link-review", title: "复核项目与客户关联", description: "检查新建对话中的关联入口", dueLabel: "明天", status: "pending", priority: "中", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: "seed" },
  ]);
  let todoDraftTitle = $state("");
  let todoDraftProjectId = $state("");
  let todoDraftPriority = $state("中");
  let todoDraftDue = $state("");
  let todoDraftDesc = $state("");
  let projectDraftName = $state("");
  let projectDraftCode = $state("");
  let projectDraftClient = $state("");
  let projectDraftStage = $state("进行中");
  let projectDraftOwner = $state("");
  let projectDraftCategory = $state("业务项目");
  let projectDraftBudget = $state("");
  let projectDraftAcceptedAt = $state("");
  let projectDraftStatus = $state<"active" | "closed">("active");
  let projectDraftProgress = $state("0");
  let projectDraftPriority = $state("中");
  let projectDraftRisk = $state("低风险");
  let projectDraftAgent = $state("");
  let projectDraftNextStep = $state("");
  let projectDraftDesc = $state("");
  let customerDraftName = $state("");
  let customerDraftType = $state("企业");
  let customerDraftContact = $state("");
  let customerDraftPhone = $state("");
  let customerDraftEmail = $state("");
  let customerDraftIndustry = $state("");
  let customerDraftRegion = $state("");
  let customerDraftOwner = $state("");
  let customerDraftStage = $state("跟进中");
  let customerDraftStatus = $state("active");
  let customerDraftRisk = $state("低风险");
  let customerDraftProjectId = $state("");
  let customerDraftNextAction = $state("");
  let customerDraftTags = $state("");
  let customerDraftAddress = $state("");
  let customerDraftNote = $state("");
  let customerDraftDesc = $state("");
  let materialDraftTitle = $state("");
  let materialDraftProjectId = $state("");
  let materialDraftCategory = $state("项目资料");
  let materialDraftSource = $state("manual");
  let materialDraftStatus = $state("待复核");
  let materialDraftDesc = $state("");
  let materialDraftFile = $state<File | undefined>();
  let materialDraftNativeFile = $state<PickedProjectMaterialFile | undefined>();
  let materialDraftFileLabel = $state("");
  let ingestDraftProjectId = $state("");
  let ingestDraftCategory = $state("项目资料");
  let ingestDraftSource = $state("local files");
  let ingestDraftStatus = $state("待复核");
  let ingestDraftStrategy = $state("自动分类并去重");
  let ingestDraftDesc = $state("");
  let ingestDraftFiles = $state<File[]>([]);
  let ingestDraftFileLabel = $state("");
  let knowledgeDraftTitle = $state("");
  let knowledgeDraftType = $state("文档");
  let knowledgeDraftSource = $state("manual");
  let knowledgeDraftTags = $state("");
  let knowledgeDraftDescription = $state("");
  let knowledgeDraftContent = $state("");
  let selectedMaterialDetailId = $state("");
  let selectedReportId = $state("");
  let artifactCanvasMode = $state<ArtifactCanvasMode>("select");
  let artifactCanvasZoom = $state(96);
  let artifactCanvasPanX = $state(0);
  let artifactCanvasPanY = $state(0);
  let selectedArtifactStage = $state<ArtifactReviewStageId>("design");
  let selectedArtifactStyleId = $state("brand-systematic");
  let artifactStyleApproved = $state(false);
  let reportDraftId = $state("");
  let reportDraftTitle = $state("");
  let reportDraftKind = $state("项目风险报告");
  let reportDraftStatus = $state("草稿");
  let reportDraftProjectId = $state("");
  let reportDraftCustomerId = $state("");
  let reportDraftOwner = $state("");
  let reportDraftSource = $state("工作台数据");
  let reportDraftFormat = $state("Markdown");
  let reportDraftPriority = $state("中");
  let reportDraftDueAt = $state("");
  let reportDraftDesc = $state("");
  let reportDraftBody = $state("");
  let templateDraftId = $state("");
  let templateDraftTitle = $state("");
  let templateDraftType = $state("模板");
  let templateDraftStatus = $state("草稿");
  let templateDraftSource = $state("workbench");
  let templateDraftTags = $state("");
  let templateDraftDescription = $state("");
  let templateDraftMaterialIds = $state<string[]>([]);
  let selectedKnowledgeDocumentId = $state("");
  let selectedResourceCategory = $state("");
  const projectStageOptions = ["立项中", "需求确认", "进行中", "验证中", "交付中", "已暂停", "已归档"];
  const projectCategoryOptions = ["业务项目", "交付项目", "研发项目", "运营项目", "客户项目", "内部项目", "官网运营", "小程序发布", "桌面端重构"];
  const projectRiskOptions = ["低风险", "中风险", "高风险", "待评估", "已关闭"];
  const customerTypeOptions = ["企业", "自然人", "团队", "机构"];
  const customerStageOptions = ["初次接触", "跟进中", "需求确认", "方案沟通", "交付中", "活跃", "暂停", "已归档"];
  const customerRiskOptions = ["低风险", "中风险", "高风险", "待评估"];
  const customerStatusOptions = [
    { value: "active", label: "活跃" },
    { value: "pending", label: "待跟进" },
    { value: "paused", label: "暂停" },
    { value: "closed", label: "已归档" },
  ];
  const materialCategoryOptions = ["项目资料", "需求资料", "业务资料", "验收资料", "验证资料", "发布资料", "归档资料"];
  const reportKindOptions = ["项目风险报告", "客户运营周报", "自动化运行报告", "验收报告", "复盘报告", "分析报告"];
  const reportStatusOptions = ["草稿", "待复核", "已生成", "已归档"];
  const reportSourceOptions = ["工作台数据", "项目资料", "客户资料", "待办事项", "日程日历", "自动化运行", "团队协作"];
  const reportFormatOptions = ["Markdown", "PDF", "Word", "HTML"];
  const materialStatusOptions = ["待复核", "已关联", "已索引", "已同步", "已归档"];
  const templateTypeOptions = ["模板", "说明", "SOP", "清单", "归档", "规范"];
  const templateStatusOptions = ["草稿", "可用", "已索引", "已更新", "已归档"];
  const templateSourceOptions = ["workbench", "项目资料", "客户资料", "手动录入", "订阅源"];
  const knowledgeTypeOptions = ["文档", "规则", "FAQ", "流程", "规范", "经验总结", "客户资料", "项目资料"];
  const knowledgeSourceOptions = ["manual", "内部制度", "项目复盘", "客户访谈", "会议纪要", "资料整理", "URL", "订阅源"];
  const knowledgeTagOptions = ["验收 / 项目管理", "合同 / 风险", "客户沟通", "项目复盘", "交付规范", "业务流程", "内部规则", "常见问题"];
  const artifactReviewStages: ArtifactReviewStage[] = [
    { id: "copy", label: "文案", status: "已审" },
    { id: "draft", label: "草稿", status: "可退回" },
    { id: "design", label: "设计", status: "审查中" },
    { id: "export", label: "导出", status: "待门禁" },
  ];
  const artifactStyleOptions: ArtifactStyleOption[] = [
    { id: "brand-systematic", name: "品牌系统化", templateVersion: "template.v3", brandKitVersion: "brand-kit.2026.07", rationale: "适合报告、PPT 和长图统一复用，信息密度更高。" },
    { id: "launch-editorial", name: "发布叙事", templateVersion: "template.v2", brandKitVersion: "brand-kit.2026.07", rationale: "适合活动海报与故事板，主视觉更突出。" },
    { id: "compliance-plain", name: "合规简明", templateVersion: "template.v1", brandKitVersion: "brand-kit.2026.06", rationale: "适合审查材料，强调证据、免责声明和留痕。" },
  ];
  const artifactReviewFindings: ArtifactReviewFinding[] = [
    { id: "copy-claim", label: "文案断言", target: "slide:cover/title", status: "需证据", x: 26, y: 25 },
    { id: "brand-logo", label: "品牌标识", target: "layer:logo", status: "已通过", x: 78, y: 22 },
    { id: "cta-safe-area", label: "安全区", target: "scene:cta/footer", status: "待复核", x: 68, y: 76 },
  ];
  let runningAutomations = $state<WorkbenchAutomation[]>([
    { id: "preflight-validation", title: "提交前验证自动化", desc: "参考 Codex 自动化，把前端门禁、构建、空白检查和浏览器日志验证串成一个可复用的自动化任务。", status: "运行中", kind: "验证自动化", owner: "自动化 Agent", startedAtMs: Date.now() - 5400000, cadence: "每次 UI 改动后", schedule: "手动触发 / 提交前", scope: "desktop/frontend", environment: "local workspace", command: "autofixer -> npm run check -> npm run build -> browser logs", result: "最近一次通过", lastRun: "刚刚", nextRun: "等待下一次改动", steps: ["Svelte autofixer", "类型检查", "生产构建", "浏览器 DOM / 控制台验证"], logs: ["0 errors / 0 warnings", "构建通过，保留已知 @theme warning", "浏览器 warn/error 为空"] },
    { id: "desktop-frontend-gate", title: "桌面前端质量门禁", desc: "针对 desktop/frontend 执行 Svelte 类型检查、Vite 构建和差异空白检查，覆盖 UI 改动能真正交付的部分。", status: "运行中", kind: "质量门禁", owner: "代码审查 Agent", startedAtMs: Date.now() - 11880000, cadence: "每次前端改动后", schedule: "改动后手动复跑", scope: "desktop/frontend", environment: "local workspace", command: "npm run check / npm run build / git diff --check", result: "通过", lastRun: "12 分钟前", nextRun: "下一次前端改动", steps: ["npm run check", "npm run build", "git diff --check"], logs: ["svelte-check 通过", "Vite build 通过", "无空白错误"] },
    { id: "wails-go-gate", title: "Wails 与 Go 模块门禁", desc: "分别检查根 Go CLI/TUI 与 desktop Wails 模块，避免桌面端改动影响 CLI、绑定层或嵌入资源。", status: "待配置", kind: "工程验证", owner: "代码审查 Agent", startedAtMs: Date.now() - 3120000, cadence: "涉及 Go 或 Wails 绑定时", schedule: "按需触发", scope: "go.mod / desktop/go.mod", environment: "local workspace", command: "go test ./... / cd desktop && go test ./...", result: "待接入", lastRun: "未运行", nextRun: "绑定层改动后", steps: ["根模块 go test", "desktop 模块 go test", "Wails 绑定检查"], logs: ["等待启用"] },
    { id: "local-preview-regression", title: "本地预览回归检查", desc: "启动 127.0.0.1:5174 后检查 DOM、控制台和关键导航，确认浏览器预览模式不依赖 Wails 绑定。", status: "运行中", kind: "浏览器验证", owner: "Browser 插件", startedAtMs: Date.now() - 1620000, cadence: "UI 导航或任务流变更后", schedule: "预览刷新后", scope: "Vite dev server / 浏览器 DOM", environment: "in-app browser", command: "HTTP 200 / DOM snapshot / console warnings", result: "通过", lastRun: "5 分钟前", nextRun: "下一次页面改动", steps: ["刷新本地预览", "检查关键 DOM", "读取 warn/error 日志"], logs: ["页面可访问", "关键节点存在", "控制台无错误"] },
  ]);
  const primaryAutomation = $derived(runningAutomations[0]);
  let automationDialogMode = $state<"create" | "edit">("edit");
  let automationDraft = $state<AutomationDraft>({
    title: "",
    desc: "",
    status: "待配置",
    kind: "自定义自动化",
    owner: "自动化 Agent",
    cadence: "",
    schedule: "手动触发",
    scheduleMode: "manual",
    scope: "",
    environment: "local workspace",
    command: "",
    nextRunAt: "",
    result: "待运行",
    lastRun: "未运行",
    nextRun: "等待配置",
    stepsText: "",
    logsText: "",
  });
  const defaultAgentCards: AgentView[] = [
    { id: "code-review", name: "代码审查 Agent", role: "内置", runs: 128, status: "已启用", desc: "阅读仓库上下文，发现风险、缺失测试和回归点。", avatar: "C", provider: "OpenAI", model: "GPT-4o", tools: ["workspace", "git", "terminal"], skills: ["code-review"], coreFiles: ["AGENTS.md"], builtIn: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "research", name: "资料研究 Agent", role: "自定义", runs: 64, status: "已启用", desc: "汇总文档、网页和项目资料，输出可执行摘要。", avatar: "R", provider: "OpenAI", model: "GPT-4o", tools: ["web", "workspace"], skills: ["research"], coreFiles: ["references"], builtIn: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "automation", name: "自动化 Agent", role: "已蒸馏", runs: 37, status: "已停用", desc: "把重复工作转为可配置的计划任务和监控。", avatar: "A", provider: "OpenAI", model: "GPT-4o", tools: ["terminal", "scheduler"], skills: ["workflow"], coreFiles: ["automations"], builtIn: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];
  let agentCards = $state<AgentView[]>(defaultAgentCards);
  const agentMarketItems: AgentMarketItem[] = [
    { id: "requirement-planner", name: "需求拆解 Agent", role: "市场", runs: 0, status: "未下载", category: "产品规划", source: "Agent Market", version: "v1.2", desc: "把模糊需求整理成目标、非目标、验收标准和执行步骤，适合新项目启动。", tags: ["需求", "规划", "验收"], localPath: ".volt/agents/requirement-planner.agent.json" },
    { id: "delivery-review", name: "交付审查 Agent", role: "市场", runs: 0, status: "未下载", category: "文档审查", source: "Agent Market", version: "v1.0", desc: "检查需求、协议和交付条款中的风险点，输出修改建议和待确认清单。", tags: ["交付", "风险", "审查"], localPath: ".volt/agents/delivery-review.agent.json" },
    { id: "customer-followup", name: "客户跟进 Agent", role: "市场", runs: 0, status: "未下载", category: "客户运营", source: "Agent Market", version: "v1.1", desc: "根据客户状态生成跟进话术、待办和复盘摘要，适合客户管理工作流。", tags: ["客户", "跟进", "运营"], localPath: ".volt/agents/customer-followup.agent.json" },
    { id: "data-analyst", name: "数据分析 Agent", role: "市场", runs: 0, status: "未下载", category: "数据分析", source: "Agent Market", version: "v0.9", desc: "读取表格、日志和指标数据，生成可执行洞察、异常解释和下一步实验。", tags: ["数据", "指标", "分析"], localPath: ".volt/agents/data-analyst.agent.json" },
    { id: "qa-verifier", name: "测试验证 Agent", role: "市场", runs: 0, status: "未下载", category: "质量验证", source: "Agent Market", version: "v1.3", desc: "把检查命令、浏览器验证和失败处理整理成复用门禁，适合提交前验证。", tags: ["测试", "构建", "门禁"], localPath: ".volt/agents/qa-verifier.agent.json" },
    { id: "meeting-scheduler", name: "会议纪要 Agent", role: "市场", runs: 0, status: "未下载", category: "协作效率", source: "Agent Market", version: "v1.0", desc: "把会议记录压缩为决策、负责人、截止时间和下一次沟通议程。", tags: ["会议", "纪要", "协作"], localPath: ".volt/agents/meeting-scheduler.agent.json" },
  ];
  const newTaskQuickTasks = [
    { agentId: "code-review", agent: "代码审查 Agent", title: "审查当前改动", prompt: "请阅读当前仓库变更，按严重程度列出风险、回归点和缺失测试。" },
    { agentId: "research", agent: "资料研究 Agent", title: "整理项目资料", prompt: "请汇总当前项目资料，输出关键结论、待确认事项和下一步执行清单。" },
    { agentId: "automation", agent: "自动化 Agent", title: "配置项目验证自动化", prompt: "请把 Volt GUI 可执行的检查流程整理为自动化，包含触发条件、验证命令、输出证据和失败处理。" },
  ];
  let projectCards = $state<WorkbenchProject[]>([
    { id: "volt-gui", name: "Volt GUI 桌面端重构", code: "PRJ-2026-0615", client: "内部研发", stage: "进行中", owner: "产品工作台", desc: "恢复 AoristLawer 式导航、Agent 与能力中心，并把 Coding 模式统一到新建对话。", category: "桌面端重构", court: "研发工作台", budget: "1,200,000", acceptedAt: "2026-06-15", status: "active", progress: 78, priority: "高", risk: "中风险", updatedAt: "28 分钟前", nextStep: "完成项目管理页深化并做构建验证", agent: "代码审查 Agent", materials: 12, todos: 5, events: 3, reports: 4, timeline: ["AORISTLAWER 参考界面已完成源码对照", "新建对话与代码状态入口已统一", "项目管理页进入深化验收"] },
    { id: "lurefree", name: "Lurefree 小程序发布", code: "PRJ-2026-0610", client: "运营团队", stage: "验证中", owner: "增长项目", desc: "小程序包体、地图交互、图钉资产与发布材料进入交付前验证。", category: "小程序发布", court: "增长项目组", budget: "350,000", acceptedAt: "2026-06-10", status: "active", progress: 64, priority: "中", risk: "低风险", updatedAt: "2 小时前", nextStep: "补齐地图与详情页回归清单", agent: "资料研究 Agent", materials: 8, todos: 4, events: 2, reports: 2, timeline: ["地图交互问题已纳入检查", "发布材料进入复核", "等待小程序预览确认"] },
    { id: "homepage", name: "品牌主页恢复与部署", code: "PRJ-2026-0601", client: "市场团队", stage: "已归档", owner: "官网项目", desc: "恢复历史版本、验证构建并保留无截图校验流程。", category: "官网运营", court: "市场中台", budget: "180,000", acceptedAt: "2026-06-01", status: "closed", progress: 100, priority: "低", risk: "已关闭", updatedAt: "昨天", nextStep: "仅保留归档和复盘记录", agent: "自动化 Agent", materials: 5, todos: 0, events: 1, reports: 3, timeline: ["历史版本已恢复", "构建验证已完成", "无截图校验流程已归档"] },
  ]);
  let sidebarProjects = $state<SidebarProject[]>([
    { id: "volt-gui", name: "Volt GUI 桌面端重构", updatedAtMs: Date.now(), expanded: true, conversations: [{ id: "volt-gui-review", title: "审查当前改动", updatedAt: "刚刚", updatedAtMs: Date.now() }, { id: "volt-gui-ui", title: "侧边栏 UI 调整", updatedAt: "今天", updatedAtMs: Date.now() - 2 * 60 * 60 * 1000 }] },
    { id: "lurefree", name: "Lurefree 小程序发布", updatedAtMs: Date.now() - 3600000, expanded: false, conversations: [{ id: "lurefree-release", title: "发布资料复核", updatedAt: "昨天", updatedAtMs: Date.now() - 24 * 60 * 60 * 1000 }] },
    { id: "homepage", name: "品牌主页恢复与部署", updatedAtMs: Date.now() - 7200000, expanded: false, conversations: [{ id: "homepage-archive", title: "归档复盘", updatedAt: "昨天", updatedAtMs: Date.now() - 26 * 60 * 60 * 1000 }] },
  ]);
  let activeSidebarProjectId = $state("volt-gui");
  let activeSidebarConversationId = $state("volt-gui-review");
  let sidebarProjectDraft = $state("");
  let sidebarProjectCreateOpen = $state(false);
  let sidebarProjectDockCollapsed = $state(false);
  let sidebarProjectSort = $state<SidebarProjectSort>("recent");
  let sidebarProjectFolderInput = $state<HTMLInputElement | undefined>();
  let editingSidebarProjectId = $state("");
  let sidebarProjectRenameDraft = $state("");
  let sidebarProjectRenameInput = $state<HTMLInputElement | undefined>();
  let projectMaterialRows = $state<WorkbenchProjectMaterial[]>([
    { id: "volt-gui-aoristlawer-map", projectId: "volt-gui", title: "AORISTLAWER 项目详情源码对照", category: "参考资料", source: "MatterDetailPage.tsx", status: "已关联", updatedAt: "28 分钟前", desc: "映射概览、资料、日程、报告、待办五个标签页。" },
    { id: "volt-gui-ia-notes", projectId: "volt-gui", title: "Volt GUI 工作台 IA 调整记录", category: "需求资料", source: "App.svelte", status: "已索引", updatedAt: "今天", desc: "覆盖项目管理、客户管理、能力中心与资料中心入口调整。" },
    { id: "volt-gui-quality-gate", projectId: "volt-gui", title: "桌面前端质量门禁说明", category: "验证资料", source: "desktop/frontend", status: "已同步", updatedAt: "今天", desc: "记录 Svelte 检查、Vite 构建和本地预览回归要求。" },
    { id: "volt-gui-relation-sample", projectId: "volt-gui", title: "客户与项目关联样例", category: "业务资料", source: "local", status: "待复核", updatedAt: "昨天", desc: "用于验证项目详情与客户详情之间的跳转和任务关联。" },
    { id: "lurefree-release-checklist", projectId: "lurefree", title: "小程序发布清单", category: "发布资料", source: "lurefree", status: "已索引", updatedAt: "2 小时前", desc: "包体、地图交互、图钉资产与发布前检查记录。" },
    { id: "lurefree-map-regression", projectId: "lurefree", title: "地图交互回归记录", category: "验证资料", source: "dist/wx", status: "待复核", updatedAt: "今天", desc: "确认运行产物和源码行为一致。" },
    { id: "homepage-restore-log", projectId: "homepage", title: "历史版本恢复记录", category: "归档资料", source: "_restore-backups", status: "已归档", updatedAt: "昨天", desc: "记录恢复来源、构建验证和无截图校验边界。" },
  ]);
  const projectScheduleRows = [
    { projectId: "volt-gui", title: "项目详情标签验收", date: "06-20", time: "13:30", place: "本地预览", state: "今日", desc: "检查五个标签页可切换并显示对应内容。" },
    { projectId: "volt-gui", title: "前端门禁复跑", date: "06-20", time: "16:00", place: "desktop/frontend", state: "待开始", desc: "执行 autofixer、check、build 与 diff 空白检查。" },
    { projectId: "volt-gui", title: "交付确认", date: "06-21", time: "10:00", place: "项目群", state: "已排期", desc: "同步 AORISTLAWER 参考补齐结果和剩余风险。" },
    { projectId: "lurefree", title: "发布素材复核", date: "06-20", time: "15:30", place: "运营项目群", state: "今日", desc: "核对发布附件和预览记录。" },
    { projectId: "lurefree", title: "上线窗口确认", date: "06-22", time: "11:00", place: "线上会议", state: "已排期", desc: "确认小程序提交和风险提醒。" },
    { projectId: "homepage", title: "归档复盘", date: "06-24", time: "14:00", place: "官网项目", state: "已排期", desc: "整理恢复记录和发布边界。" },
  ];
  const projectReportRows = [
    { projectId: "volt-gui", title: "项目风险分析报告", type: "风险报告", status: "已生成", owner: "代码审查 Agent", updatedAt: "28 分钟前", summary: "聚焦 UI 改动范围、Svelte 模板风险和验证缺口。" },
    { projectId: "volt-gui", title: "项目自动化运行报告", type: "验证报告", status: "待复核", owner: "自动化 Agent", updatedAt: "今天", summary: "汇总前端门禁、Go/Wails 边界和浏览器预览证据。" },
    { projectId: "volt-gui", title: "AORISTLAWER 对照报告", type: "参考报告", status: "草稿", owner: "资料研究 Agent", updatedAt: "今天", summary: "说明 MatterDetailPage 的功能如何落到 Volt 项目详情。" },
    { projectId: "volt-gui", title: "客户运营周报", type: "周报", status: "草稿", owner: "运营 Agent", updatedAt: "昨天", summary: "记录客户关联、项目状态和下一步触达动作。" },
    { projectId: "lurefree", title: "发布风险分析", type: "风险报告", status: "已生成", owner: "资料研究 Agent", updatedAt: "2 小时前", summary: "覆盖包体、地图交互和发布资料完整性。" },
    { projectId: "lurefree", title: "增长任务周报", type: "周报", status: "草稿", owner: "运营 Agent", updatedAt: "今天", summary: "整理触达节奏和下一轮任务。" },
    { projectId: "homepage", title: "恢复复盘报告", type: "归档报告", status: "已归档", owner: "自动化 Agent", updatedAt: "昨天", summary: "总结恢复来源、构建验证和后续维护边界。" },
  ];
  let projectTodoRows = $state([
    { projectId: "volt-gui", title: "补齐项目详情五个标签页", due: "今天", priority: "高", state: "进行中", desc: "让资料、日程、报告、待办都具备可见内容和操作入口。" },
    { projectId: "volt-gui", title: "执行 Svelte autofixer", due: "今天", priority: "中", state: "待处理", desc: "确认新增模板满足 Svelte 5 语法。" },
    { projectId: "volt-gui", title: "运行前端构建门禁", due: "今天", priority: "中", state: "待处理", desc: "执行 check、build 和 diff 空白检查。" },
    { projectId: "volt-gui", title: "浏览器验证项目详情", due: "今天", priority: "中", state: "待处理", desc: "检查截图中的标签页切换和控制台日志。" },
    { projectId: "volt-gui", title: "整理交付说明", due: "明天", priority: "低", state: "待处理", desc: "记录本次参考 AORISTLAWER 的落地范围。" },
    { projectId: "lurefree", title: "复核发布资料", due: "今天", priority: "高", state: "进行中", desc: "确认发布前材料和验收证据。" },
    { projectId: "lurefree", title: "同步上线排期", due: "06-22", priority: "中", state: "待处理", desc: "更新客户与运营团队的提醒。" },
  ]);
  let customerCards = $state<WorkbenchCustomer[]>([
    { id: "internal", name: "内部研发团队", type: "企业", contact: "产品负责人", phone: "010-0000-0001", email: "dev@example.com", industry: "研发工具", owner: "产品工作台", stage: "活跃", region: "本地", matters: 4, materials: 12, events: 3, todos: 5, reports: 2, risk: "低风险", riskLevel: "low", status: "active", createdAt: "2026-06-01", lastTouch: "28 分钟前", lastContact: "28 分钟前", nextAction: "继续验证工作台功能", address: "局域网本地客户档案", note: "围绕 Volt GUI 桌面端体验、代码质量和发布节奏维护长期项目上下文。", desc: "Volt GUI 研发与验证主体。", tags: ["内部", "研发"], projectIds: ["volt-gui", "homepage"] },
    { id: "ops", name: "运营增长团队", type: "企业", contact: "增长负责人", phone: "010-0000-0002", email: "ops@example.com", industry: "增长运营", owner: "增长项目", stage: "跟进中", region: "本地", matters: 3, materials: 8, events: 2, todos: 4, reports: 1, risk: "中风险", riskLevel: "medium", status: "active", createdAt: "2026-06-08", lastTouch: "2 小时前", lastContact: "2 小时前", nextAction: "复核发布素材", address: "运营项目群", note: "负责客户触达、发布材料和小程序增长相关任务，需保留交付前验证记录。", desc: "运营增长项目主体。", tags: ["运营", "增长"], projectIds: ["lurefree"] },
    { id: "founder", name: "个人创始人项目", type: "自然人", contact: "创始人本人", phone: "138-0000-0003", email: "founder@example.com", industry: "个人委托", owner: "产品工作台", stage: "待确认", region: "远程", matters: 1, materials: 5, events: 1, todos: 2, reports: 0, risk: "高风险", riskLevel: "high", status: "active", createdAt: "2026-06-12", lastTouch: "今天", lastContact: "今天", nextAction: "确认需求边界", address: "远程访谈记录", note: "需求边界变化频繁，任务进入执行前需补齐确认记录与风险说明。", desc: "个人委托项目主体。", tags: ["个人", "待确认"], projectIds: [] },
  ]);
  const filteredProjects = $derived(projectCards.filter((project) => {
    const keyword = projectSearch.trim().toLowerCase();
    const matchSearch = !keyword || [project.name, project.code, project.client, project.owner, project.stage, project.desc, project.category, project.court, project.priority, project.risk, project.agent].some((value) => value.toLowerCase().includes(keyword));
    const matchStatus = projectStatusFilter === "all" || project.status === projectStatusFilter;
    return matchSearch && matchStatus;
  }));
  const projectBudgetTotalText = $derived(`¥${(projectCards.reduce((sum, project) => sum + Number(project.budget.replace(/,/g, "")), 0) / 10000).toFixed(1)} 万`);
  const projectTotalTodos = $derived(projectCards.reduce((sum, project) => sum + project.todos, 0));
  const filteredCustomers = $derived(customerCards.filter((customer) => {
    const keyword = customerSearch.trim().toLowerCase();
    const matchSearch = !keyword || [customer.name, customer.type, customer.contact, customer.phone, customer.email, customer.risk, customer.industry, customer.status, String(customer.matters)].some((value) => value.toLowerCase().includes(keyword));
    return matchSearch;
  }));
  const newTaskProjectOptions = $derived([...sidebarProjects]
    .sort((a, b) => {
      if (sidebarProjectSort === "name") return a.name.localeCompare(b.name, "zh-Hans-CN");
      if (sidebarProjectSort === "conversations") return sidebarProjectConversations(b).length - sidebarProjectConversations(a).length || a.name.localeCompare(b.name, "zh-Hans-CN");
      return b.updatedAtMs - a.updatedAtMs;
    })
    .map((project) => ({ id: project.id, label: project.name })));
  const sortedSidebarProjects = $derived([...sidebarProjects].sort((a, b) => {
    if (sidebarProjectSort === "name") return a.name.localeCompare(b.name, "zh-Hans-CN");
    if (sidebarProjectSort === "conversations") return sidebarProjectConversations(b).length - sidebarProjectConversations(a).length || a.name.localeCompare(b.name, "zh-Hans-CN");
    return b.updatedAtMs - a.updatedAtMs;
  }));
  const archivedSidebarConversationCount = $derived(sidebarProjects.reduce((sum, project) => sum + archivedSidebarProjectConversations(project).length, 0));
  const activeSidebarConversationTitle = $derived(
    sidebarProjects
      .flatMap((project) => project.conversations)
      .find((conversation) => conversation.id === activeSidebarConversationId)?.title,
  );

  function latestTranscriptUpdatedAtMs(items?: TranscriptItem[]) {
    const times = (items ?? []).map((item) => item.updatedAtMs ?? item.createdAtMs).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return times.length ? Math.max(...times) : undefined;
  }

  function relativeSidebarTimeLabel(timestamp: number) {
    const diffMs = Math.max(0, nowMs - timestamp);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diffMs < minute) return "刚刚";
    if (diffMs < hour) return `${Math.floor(diffMs / minute)} 分钟前`;
    if (diffMs < day) return `${Math.floor(diffMs / hour)} 小时前`;
    if (diffMs < 2 * day) return "昨天";
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function materialUpdatedAtMs(item?: { updatedAt?: string; updatedISO?: string; createdAt?: string }) {
    const candidates = [item?.updatedISO, item?.createdAt, item?.updatedAt].filter((value): value is string => Boolean(value?.trim()));
    for (const value of candidates) {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    const value = item?.updatedAt?.trim() || "";
    const minuteMatch = value.match(/^(\d+)\s*\u5206\u949f\u524d$/);
    if (minuteMatch) return nowMs - Number(minuteMatch[1]) * 60 * 1000;
    const hourMatch = value.match(/^(\d+)\s*\u5c0f\u65f6\u524d$/);
    if (hourMatch) return nowMs - Number(hourMatch[1]) * 60 * 60 * 1000;
    const dayMatch = value.match(/^(\d+)\s*\u5929\u524d$/);
    if (dayMatch) return nowMs - Number(dayMatch[1]) * 24 * 60 * 60 * 1000;
    if (value === "\u521a\u521a") return nowMs;
    if (value === "\u4eca\u5929") return nowMs - 12 * 60 * 60 * 1000;
    if (value === "\u6628\u5929") return nowMs - 24 * 60 * 60 * 1000;
    return 0;
  }

  function materialUpdatedAtLabel(item?: { updatedAt?: string; updatedISO?: string; createdAt?: string }) {
    const timestamp = materialUpdatedAtMs(item);
    if (timestamp > 0 && (item?.updatedISO || item?.createdAt || Date.parse(item?.updatedAt || ""))) return relativeSidebarTimeLabel(timestamp);
    return item?.updatedAt || "\u672a\u66f4\u65b0";
  }

  function sidebarConversationTimeLabel(conversation: SidebarConversation) {
    if (conversation.archivedAtMs) return "已归档";
    const timestamp = conversation.updatedAtMs ?? latestTranscriptUpdatedAtMs(conversation.transcript);
    return typeof timestamp === "number" ? relativeSidebarTimeLabel(timestamp) : conversation.updatedAt;
  }
  const conversationHeaderTitle = $derived(
    activityMode === "work" && workLayer === "newTask"
      ? activeSidebarConversationTitle || activeTab?.topicTitle || t.activity.untitled
      : activeTab?.topicTitle || t.activity.untitled,
  );
  const conversationHeaderScope = $derived(
    activityMode === "work" && workLayer === "newTask"
      ? linkedProject || activeTab?.workspaceName || t.common.global
      : activeTab?.workspaceName || t.common.global,
  );
  type CapabilityItem = { id: string; name: string; desc: string; status: string; version: string; source: string; scope: string; sync: string; path: string; permission: string; enabled: boolean; readOnly?: boolean; pluginKind?: string; pluginEntry?: string; capabilities?: string[]; providerIds?: string[]; pluginConfig?: Record<string, string> };
  type CapabilityBuckets = Record<CapabilityTab, CapabilityItem[]>;
  const defaultCapabilityBuckets: CapabilityBuckets = {
    plugin: [
      { id: "git-panel", name: "Git 变更面板", desc: "读取 diff、生成审查清单，并将结果回写到对话上下文。", status: "已启用", version: "v1.6", source: "内置插件", scope: "新建对话", sync: "刚刚同步", path: "desktop/frontend", permission: "读写 diff / 只读提交历史", enabled: true },
      { id: "browser-preview", name: "浏览器预览", desc: "打开本地页面、检查 DOM 状态和控制台错误。", status: "已启用", version: "v1.2", source: "Browser 插件", scope: "本地预览", sync: "5 分钟前", path: "127.0.0.1", permission: "本地页面读取 / 点击验证", enabled: true },
      { id: "resource-ingest", name: "资料导入助手", desc: "把文档、规范、客户资料导入资料中心并建立索引。", status: "待配置", version: "v0.8", source: "工作台插件", scope: "资料中心", sync: "待授权", path: "resources/import", permission: "上传文件 / 建立索引", enabled: false },
    ],
    mcp: [
      { id: "filesystem-mcp", name: "文件系统 MCP", desc: "读取项目文档、源码片段和本地结构化资源。", status: "已连接", version: "v2.1", source: "本地 MCP", scope: "workspace", sync: "在线", path: "E:/workspace/volt-gui", permission: "只读项目文件 / 精确补丁", enabled: true },
      { id: "automation-mcp", name: "自动化 MCP", desc: "触发定时任务、运行监控和线程唤醒回调。", status: "已连接", version: "v1.0", source: "Codex Desktop", scope: "任务中心", sync: "在线", path: "automations", permission: "查看和配置自动化", enabled: true },
      { id: "aorist-sync-mcp", name: "AORIST 同步 MCP", desc: "同步模型、Agent、项目和客户资料的跨端状态。", status: "开发中", version: "v0.4", source: "外部服务", scope: "同步中心", sync: "等待远程同步后端", path: "api.aorist.net", permission: "后端同步服务 / API Token", enabled: false },
    ],
    skill: [
      { id: "frontend-design", name: "frontend-design", desc: "高质量前端界面重构，约束视觉层级、动效与响应式。", status: "已安装", version: "v1.8", source: "Codex Skill", scope: "UI 重构", sync: "已加载", path: "skills/frontend-design", permission: "读取设计约定 / 修改前端文件", enabled: true },
      { id: "webapp-testing", name: "webapp-testing", desc: "本地预览、浏览器验证和控制台错误检查。", status: "可用", version: "v1.1", source: "Testing Skill", scope: "质量验证", sync: "可调用", path: "skills/webapp-testing", permission: "浏览器只读检查 / 交互验证", enabled: true },
      { id: "team-run-automation", name: "team-run-automation", desc: "把协作任务、执行日志、人工确认和结果归档打包为团队运行技能。", status: "待安装", version: "v0.7", source: "本地技能", scope: "团队协作", sync: "待导入", path: "skills/team-run", permission: "任务运行 / 进度日志", enabled: false },
    ],
  };
  let capabilityBuckets = $state<CapabilityBuckets>(defaultCapabilityBuckets);
  const capabilityInstallSteps = [
    { id: "install_files", label: "安装文件", desc: "写入插件包、版本元数据和本地资源清单。" },
    { id: "install_dependencies", label: "安装依赖", desc: "检查 CLI、Skill 文件和运行时依赖是否可用。" },
    { id: "connect", label: "连接 MCP", desc: "复用或创建 MCP Server，并完成连接状态校验。" },
    { id: "authorize", label: "授权", desc: "校验连接器权限、API Token 和工作区访问范围。" },
    { id: "create_agent", label: "创建 Agent", desc: "按能力模板生成可调用的 Agent 或任务入口。" },
    { id: "bind_agents", label: "绑定 Agent", desc: "把能力挂载到 Agent 中心和新建对话流程。" },
  ];
  const wizardTabs = [{ id: "identity", label: "助手特征" }, { id: "tools", label: "基础工具" }, { id: "skills", label: "业务技能" }, { id: "files", label: "核心文件" }];
  const avatarPresets = ["C", "R", "A", "M", "S", "P"];
  const vibePresets = ["精准执行", "研究严谨", "客户友好", "表达简洁"];
  const coreFiles = ["SYSTEM.md", "IDENTITY.md", "MEMORY.md", "WORKFLOW.md"];
  const coreFileContent: Record<string, string> = {
    "SYSTEM.md": "# System Instructions\n\nKeep project boundaries strict and verify every change.",
    "IDENTITY.md": "# Identity\n\nWorkspace Agent for Volt GUI.",
    "MEMORY.md": "# Memory\n\nReuse relevant project memory and verify drift-prone facts.",
    "WORKFLOW.md": "# Workflow\n\nExplore, plan, execute, verify.",
  };
  const modelProviders = ["OpenAI", "Claude", "Gemini", "Qwen", "Moonshot", "Zhipu"];
  const modelOptions: Record<string, string[]> = { OpenAI: ["GPT-4o", "GPT-4o-mini", "o3-mini"], Claude: ["Claude Sonnet 4.6", "Claude Opus 4"], Gemini: ["Gemini 2.5 Pro", "Gemini 2.5 Flash"], Qwen: ["Qwen-Max", "Qwen-Plus"], Moonshot: ["Moonshot v1"], Zhipu: ["GLM-4"] };
  type AgentToolCard = { id: string; title: string; desc: string; active: boolean; available: boolean; reason?: string };
  const defaultToolCards: AgentToolCard[] = [
    { id: "files", title: "本地文件与资料", desc: "读取仓库、附件和项目知识库", active: true, available: true },
    { id: "terminal", title: "终端执行", desc: "运行构建、测试和安全命令", active: true, available: true },
    { id: "browser", title: "浏览器预览", desc: "打开本地页面并检查加载状态", active: true, available: true },
    { id: "memory", title: "长期记忆", desc: "复用项目约定和历史决策", active: false, available: false },
  ];
  let toolCards = $state<AgentToolCard[]>(defaultToolCards);
  type AgentSkillCard = { id: string; title: string; version: string; desc: string; active: boolean; available: boolean; reason?: string; source?: string };
  const defaultSkillCards: AgentSkillCard[] = [
    { id: "repo", title: "Repository Context", version: "未加载", desc: "读取目录、历史和项目规则。", active: false, available: false },
    { id: "frontend", title: "Frontend Polish", version: "未加载", desc: "重建界面层级、导航和交互。", active: false, available: false },
    { id: "automation", title: "Automation Ops", version: "未加载", desc: "配置计划任务、监控和运行记录。", active: false, available: false },
  ];
  let skillCards = $state<AgentSkillCard[]>(defaultSkillCards);
  let calendarEvents = $state<WorkbenchCalendarEvent[]>([
    { id: "version-review", day: "09", title: "版本评审会议", time: "09:30", type: "meeting", place: "线上会议室" },
    { id: "customer-workflow", day: "12", title: "客户工作流复盘", time: "14:00", type: "deadline", place: "项目群" },
    { id: "automation-review", day: "18", title: "自动化验收", time: "16:30", type: "review", place: "研发工作台" },
  ]);
  let calendarMonthCursor = $state(startOfMonth(new Date()));
  const calendarWeekdays = ["一", "二", "三", "四", "五", "六", "日"];
  let reportCards = $state<WorkbenchReport[]>([
    { id: "project-risk", title: "项目风险分析报告", status: "已生成", owner: "代码审查 Agent", desc: "覆盖变更风险、测试缺口、回滚建议。" },
    { id: "customer-weekly", title: "客户运营周报", status: "草稿", owner: "运营 Agent", desc: "整理客户触达、项目状态与内容草案。" },
    { id: "automation-run", title: "项目自动化运行报告", status: "待复核", owner: "自动化 Agent", desc: "汇总前端门禁、Go/Wails 门禁和本地预览回归的执行证据。" },
  ]);
  let regulationItems = $state<WorkbenchRegulation[]>([
    { id: "desktop-security", title: "桌面端安全执行规范", category: "内部规则", status: "现行有效", tags: "权限 / 沙箱 / 审计" },
    { id: "agent-acceptance", title: "Agent 协作验收标准", category: "流程规范", status: "试行", tags: "任务 / 验证 / 交付" },
    { id: "customer-boundary", title: "客户数据使用边界", category: "合规要求", status: "现行有效", tags: "客户 / 数据 / 留痕" },
  ]);
  let documentItems = $state<WorkbenchKnowledgeDocument[]>([
    { id: "requirement-template", title: "需求澄清记录模板", type: "模板", count: 18, status: "可用" },
    { id: "project-retro", title: "项目复盘记录", type: "归档", count: 42, status: "已索引" },
    { id: "automation-config", title: "项目自动化配置说明", type: "说明", count: 9, status: "已更新" },
  ]);
  let knowledgeStatus = $state<KnowledgeStatus>({
    path: "",
    sqlite: false,
    fts5: false,
    sqliteVec: false,
    documents: 0,
    chunks: 0,
    vectors: 0,
    updatedAt: "",
  });
  const resourceItems = $derived(projectMaterialRows.map((material) => {
    const project = projectCards.find((item) => item.id === material.projectId);
    return {
      id: material.id,
      title: material.title,
      category: material.category || "未分类",
      source: `${project?.name ?? material.projectName ?? "未关联项目"} / ${material.fileName || material.source}`,
      size: material.fileSize ? formatFileSize(material.fileSize) : material.category,
      status: material.status,
      updatedAt: material.updatedAt,
      updatedISO: material.updatedISO,
      createdAt: material.createdAt,
      updatedAtMs: materialUpdatedAtMs(material),
      desc: material.desc,
    };
  }));
  const resourceSearchActive = $derived(resourceSearch.trim().length > 0);
  const filteredResourceItems = $derived(resourceItems.filter((item) => {
    const keyword = resourceSearch.trim().toLowerCase();
    const inCategory = !selectedResourceCategory || item.category === selectedResourceCategory;
    const matchesKeyword = !keyword || [item.title, item.category, item.source, item.size, item.status, item.desc].some((value) => value.toLowerCase().includes(keyword));
    return inCategory && matchesKeyword;
  }));
  const resourceCategories = $derived(Array.from(new Set(resourceItems.map((item) => item.category))).map((category) => {
    const items = resourceItems.filter((item) => item.category === category).sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    return {
      category,
      count: items.length,
      latest: materialUpdatedAtLabel(items[0]),
      desc: items.slice(0, 2).map((item) => item.title).join(" / ") || "暂无资料",
    };
  }).filter((item) => item.count > 0));
  const filteredResourceCategories = $derived(resourceCategories.filter((item) => {
    const keyword = resourceSearch.trim().toLowerCase();
    return !keyword || [item.category, item.desc, item.latest, `${item.count}`].some((value) => value.toLowerCase().includes(keyword));
  }));
  const filteredKnowledgeDocuments = $derived(documentItems.filter((item) => {
    const keyword = resourceSearch.trim().toLowerCase();
    return !keyword || matchesWorkbenchKeyword(keyword, item.title, item.type, item.status, item.description, item.source, item.tags);
  }));
  const filteredRegulations = $derived(regulationItems.filter((item) => {
    const keyword = resourceSearch.trim().toLowerCase();
    return !keyword || matchesWorkbenchKeyword(keyword, item.title, item.category, item.status, item.tags);
  }));
  function defaultKnowledgeMaterialIds(id?: string) {
    if (id === "requirement-template") return ["volt-gui-ia-notes", "volt-gui-relation-sample"];
    if (id === "project-retro") return ["homepage-restore-log", "volt-gui-aoristlawer-map"];
    if (id === "automation-config") return ["volt-gui-quality-gate", "lurefree-map-regression"];
    return [];
  }
  function selectedKnowledgeDocument() {
    return documentItems.find((item) => item.id === selectedKnowledgeDocumentId) ?? documentItems[0];
  }
  function knowledgeDocumentMaterialIds(item?: WorkbenchKnowledgeDocument) {
    const ids = item?.materialIds?.length ? item.materialIds : defaultKnowledgeMaterialIds(item?.id);
    return Array.from(new Set(ids.filter(Boolean)));
  }
  function knowledgeDocumentMaterials(item?: WorkbenchKnowledgeDocument) {
    const ids = new Set(knowledgeDocumentMaterialIds(item));
    return projectMaterialRows.filter((material) => ids.has(material.id));
  }
  function knowledgeDocumentCount(item?: WorkbenchKnowledgeDocument) {
    const linkedCount = knowledgeDocumentMaterials(item).length;
    if (linkedCount > 0) return linkedCount;
    return Number(item?.chunkCount ?? item?.count ?? 0);
  }
  const selectedMaterialDetails = $derived(projectMaterialRows.filter((material) => material.id === selectedMaterialDetailId));
  let teamRooms = $state<WorkbenchTeamRoom[]>([
    { id: "product-lab", title: "产品研发组", members: 3, active: "模板已就绪", desc: "围绕桌面端体验、代码质量和发布节奏组织多 Agent 协作。", leader: "代码审查 Agent", leaderId: "code-review", status: "模板", topic: "桌面端体验复核", queue: "0 个运行节点", memberIds: ["code-review", "research", "automation"], avatars: ["C", "R", "A"], mode: "协调者编排", sharedContext: "项目资料库 / 当前变更", runState: "待运行", nextCheckpoint: "发送任务后生成运行草稿", outcome: "等待首次运行", controls: ["暂停", "继续", "终止", "重新分配"], artifacts: ["报告草稿", "待办清单", "资料归档"], steps: [
      { id: "triage", title: "拆解目标", owner: "代码审查 Agent", status: "待运行", detail: "明确目标、非目标、验收标准和风险边界。" },
      { id: "research", title: "补充资料", owner: "资料研究 Agent", status: "待运行", detail: "读取关联资料并给出可引用依据。" },
      { id: "verify", title: "验证闭环", owner: "自动化 Agent", status: "待运行", detail: "生成检查命令、产物路径和失败处理建议。" },
    ] },
    { id: "ops-growth", title: "运营增长组", members: 2, active: "需补上下文", desc: "处理客户触达、内容草案和项目跟进，适合从资料到待办的轻量协作。", leader: "资料研究 Agent", leaderId: "research", status: "待补充", topic: "客户运营协同", queue: "0 个运行节点", memberIds: ["research", "automation"], avatars: ["R", "A"], mode: "串行交接", sharedContext: "客户资料 / 报告模板", runState: "未启动", nextCheckpoint: "绑定客户或项目资料", outcome: "等待配置资料", controls: ["暂停", "继续", "终止"], artifacts: ["跟进话术", "待办清单"], steps: [
      { id: "brief", title: "整理背景", owner: "资料研究 Agent", status: "待补充", detail: "收集客户状态、历史沟通和当前目标。" },
      { id: "actions", title: "生成行动", owner: "自动化 Agent", status: "待运行", detail: "把建议转为待办、日程和跟进记录。" },
    ] },
    { id: "delivery-review", title: "交付审查组", members: 3, active: "可创建审查运行", desc: "审查项目风险、交付记录和验收标准，输出可归档的审查结论。", leader: "自动化 Agent", leaderId: "automation", status: "模板", topic: "项目验收复盘", queue: "0 个运行节点", memberIds: ["automation", "code-review", "research"], avatars: ["A", "C", "R"], mode: "审查后汇总", sharedContext: "项目记录 / 验收报告", runState: "待运行", nextCheckpoint: "选择交付对象", outcome: "等待审查任务", controls: ["暂停", "继续", "终止", "批准高风险工具"], artifacts: ["审查报告", "风险清单", "归档记录"], steps: [
      { id: "collect", title: "收集证据", owner: "资料研究 Agent", status: "待运行", detail: "汇总交付文档、记录和待确认项。" },
      { id: "risk", title: "风险审查", owner: "代码审查 Agent", status: "待运行", detail: "识别缺失验证、范围漂移和回滚风险。" },
      { id: "archive", title: "归档结果", owner: "自动化 Agent", status: "待运行", detail: "形成报告、待办和后续跟踪入口。" },
    ] },
  ]);
  let teamChatMessages = $state<WorkbenchTeamChatMessage[]>([
    { id: "product-lab-system-1", teamId: "product-lab", role: "agent", agentId: "code-review", agentName: "代码审查 Agent", agentAvatar: "C", content: "当前是协作组模板预览。发送任务后会生成运行草稿，真实执行需要接入 Agent runtime。" },
    { id: "product-lab-system-2", teamId: "product-lab", role: "agent", agentId: "research", agentName: "资料研究 Agent", agentAvatar: "R", content: "我会在运行中负责资料依据、上下文摘要和待确认问题，不再引用未验证的外部页面结构。" },
    { id: "ops-growth-system-1", teamId: "ops-growth", role: "agent", agentId: "research", agentName: "资料研究 Agent", agentAvatar: "R", content: "请先绑定客户或项目资料，协作运行会基于真实上下文生成跟进建议。" },
    { id: "delivery-review-system-1", teamId: "delivery-review", role: "agent", agentId: "automation", agentName: "自动化 Agent", agentAvatar: "A", content: "审查组会把验证、报告和归档拆成可观察节点，目前展示的是运行计划而非已执行结果。" },
  ]);
  let teamRuns = $state<WorkbenchTeamRun[]>([]);
  const filteredTeamBuilderAgents = $derived(agentCards.filter((agent) => {
    const keyword = teamBuilderSearch.trim().toLowerCase();
    return !keyword || [agent.name, agent.role, agent.desc].some((value) => value.toLowerCase().includes(keyword));
  }));
  const providerKindOptions = $derived(modelSettings?.providerKinds?.length ? modelSettings.providerKinds : ["openai", "anthropic"]);
  const modelCards = $derived(modelCardsFromSettings());
  const settingGroups = $derived(settingGroupsFromSettings());
  let operationLogs = $state<WorkbenchOperationLog[]>([
    { id: "create-agent", action: "创建 Agent", target: "代码审查 Agent", user: "我的", time: "刚刚", result: "成功" },
    { id: "update-automation", action: "更新自动化", target: "桌面前端质量门禁", user: "我的", time: "12 分钟前", result: "成功" },
    { id: "link-project", action: "关联项目", target: "Volt GUI 桌面端重构", user: "我的", time: "28 分钟前", result: "成功" },
  ]);
  let searchResults = $state<WorkbenchSearchResult[]>([
    { title: "Agent 创建与配置", scope: "Agent 中心", snippet: "助手特征、基础工具、业务技能、核心文件均可配置。" },
    { title: "项目管理入口", scope: "业务管理", snippet: "项目可点击关联到新建对话。" },
    { title: "能力中心 MCP 管理", scope: "能力中心", snippet: "插件、MCP、SKILL 顶部横向切换。" },
  ]);
  const displayedSearchResults = $derived(searchResults.filter((item) => {
    const keyword = resourceSearch.trim().toLowerCase();
    return !keyword || matchesWorkbenchKeyword(keyword, item.title, item.scope, item.snippet);
  }));
  let syncJobs = $state<WorkbenchSyncJob[]>([
    { id: "memory-sync", title: "记忆与核心文件同步", status: "已完成", progress: "100%", time: "5 分钟前" },
    { id: "material-index", title: "资料库索引", status: "运行中", progress: "64%", time: "正在执行" },
    { id: "model-refresh", title: "模型配置刷新", status: "排队中", progress: "0%", time: "等待中" },
  ]);
  const ingestJobs = $derived(projectMaterialRows.map((material) => ({
    title: material.fileName ? `导入 ${material.fileName}` : `入库 ${material.title}`,
    source: projectCards.find((project) => project.id === material.projectId)?.name ?? material.projectName ?? material.source,
    status: material.status || "已入库",
    phase: material.filePath ? "导入完成 · 文件已保存" : "导入完成 · 资料已入库",
    total: 1,
  })));
  let workbenchNotice = $state("");
  let knowledgePreviewTitle = $state("知识库预览");
  let knowledgePreviewDescription = $state("统一承载文档、规范、资料、检索与导入任务，当前以本地 SQLite + FTS5 索引为主。");
  let capabilityAgentBindings = $state<Record<string, string[]>>({});
  let distillSampleTodoId = $state("");
  let workbenchNoticeTimer: ReturnType<typeof setTimeout> | undefined;

  function hasWailsBindings() {
    return typeof window !== "undefined" && Boolean(window.go?.main?.App);
  }
  function normalizeBrandInfo(value?: BrandInfo | null): BrandInfo {
    return {
      ...defaultBrand,
      ...(value ?? {}),
      name: value?.name?.trim() || defaultBrand.name,
      shortName: value?.shortName?.trim() || value?.name?.trim() || defaultBrand.shortName,
    };
  }
  function brandText(value: string) {
    return value.replace(/VoltUI/g, brandName).replace(/\bVolt\b/g, brandShortName);
  }
  function brandInitial() {
    return Array.from(brandShortName || brandName || "V")[0]?.toUpperCase() || "V";
  }
  async function refreshBrand() {
    if (!hasWailsBindings()) return;
    try {
      brand = normalizeBrandInfo(await app().Brand());
    } catch (error) {
      console.error("Failed to load brand", error);
    }
  }
  function readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
  function formatFileSize(size?: number) {
    const value = Number(size ?? 0);
    if (!Number.isFinite(value) || value <= 0) return "未记录大小";
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }
  function handleMaterialFileChange(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    materialDraftFile = file;
    materialDraftNativeFile = undefined;
    materialDraftFileLabel = file ? `${file.name} / ${formatFileSize(file.size)}` : "";
    if (file && !materialDraftTitle.trim()) materialDraftTitle = file.name.replace(/\.[^.]+$/, "") || file.name;
    if (file) materialDraftSource = file.name;
  }
  async function pickProjectMaterialFile() {
    if (!hasWailsBindings()) return;
    const picker = projectMaterialFileBindings()?.PickProjectMaterialFile;
    if (typeof picker !== "function") {
      showWorkbenchNotice("原生资料选择接口未就绪，请重启桌面 dev 窗口后重试。");
      return;
    }
    try {
      const file = await picker();
      if (!file.selectionToken) return;
      materialDraftNativeFile = file;
      materialDraftFile = undefined;
      materialDraftFileLabel = `${file.name} / ${formatFileSize(file.size)}`;
      if (!materialDraftTitle.trim()) materialDraftTitle = file.name.replace(/\.[^.]+$/, "") || file.name;
      materialDraftSource = file.name;
    } catch (error) {
      showWorkbenchNotice(`选择资料文件失败：${formatErrorMessage(error)}`);
    }
  }
  function materialFileUploadError(fileName: string, error: unknown) {
    const detail = formatErrorMessage(error);
    if (detail.includes("between 1 byte and 64 MiB")) return `资料文件“${fileName}”未导入：单个文件不能超过 64 MiB。`;
    if (detail.includes("25 MiB")) return `资料文件“${fileName}”未导入：浏览器 data URL 导入最多支持 25 MiB，请在桌面端重新选择文件。`;
    return `资料文件“${fileName}”未导入。请确认文件仍可读取且当前工作区可写：${detail}`;
  }
  function handleIngestFilesChange(event: Event) {
    const files = Array.from((event.currentTarget as HTMLInputElement).files ?? []);
    ingestDraftFiles = files;
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    ingestDraftFileLabel = files.length ? `${files.length} 个文件 / ${formatFileSize(totalSize)}` : "";
  }
  function materialProjectName(material: WorkbenchProjectMaterial) {
    return projectCards.find((project) => project.id === material.projectId)?.name ?? material.projectName ?? "未关联项目";
  }
  function materialPath(material?: WorkbenchProjectMaterial) {
    return material?.filePath || material?.source || "";
  }
  function openMaterialDetail(id: string) {
    selectedMaterialDetailId = id;
  }
  function openResourceCategory(category: string) {
    selectedResourceCategory = category;
    selectedMaterialDetailId = "";
    resourceSearch = "";
  }
  function closeResourceCategory() {
    selectedResourceCategory = "";
    selectedMaterialDetailId = "";
    resourceSearch = "";
  }
  function matchesWorkbenchKeyword(keyword: string, ...values: Array<string | number | undefined>) {
    return values.some((value) => String(value ?? "").toLowerCase().includes(keyword));
  }
  function localWorkbenchSearch(query: string): WorkbenchSearchResult[] {
    const keyword = query.trim().toLowerCase();
    const results: WorkbenchSearchResult[] = [];
    const add = (title: string, scope: string, snippet = "") => {
      if (!keyword || matchesWorkbenchKeyword(keyword, title, scope, snippet)) results.push({ title, scope, snippet });
    };
    for (const project of projectCards) add(project.name, "项目管理", `${project.client} / ${project.stage} / ${project.desc}`);
    for (const customer of customerCards) add(customer.name, "客户管理", `${customer.contact} / ${customer.industry} / ${customer.note || customer.desc}`);
    for (const todo of todoItems) add(todo.title, "待办事项", todoDescription(todo));
    for (const material of projectMaterialRows) add(material.title, "资料库", `${material.category} / ${material.source} / ${material.desc}`);
    for (const document of documentItems) add(document.title, "文档知识", `${document.type} / ${document.status} / ${document.description || ""}`);
    for (const regulation of regulationItems) add(regulation.title, "规范知识", `${regulation.category} / ${regulation.tags}`);
    for (const report of reportCards) add(report.title, "报告中心", `${report.status} / ${report.owner} / ${report.desc}`);
    for (const event of calendarEvents) add(event.title, "日程日历", `${event.day} 日 ${event.time} / ${event.place} / ${event.status || event.type}`);
    for (const team of teamRooms) add(team.title, "团队协作", `${team.topic} / ${team.desc} / ${team.status}`);
    return results.slice(0, 50);
  }
  function openSearchResult(result: WorkbenchSearchResult) {
    const scope = result.scope.toLowerCase();
    const title = result.title.trim();
    const knowledgeDoc = documentItems.find((item) => item.id === result.documentId || item.title === title);
    if (knowledgeDoc || scope.includes("知识库") || scope.includes("文档知识")) {
      if (knowledgeDoc) {
        resourceTab = "knowledge";
        openKnowledgeDocument(knowledgeDoc);
        return;
      }
      showWorkbenchNotice("未找到对应知识详情，请同步知识库后重试。");
      return;
    }
    const material = projectMaterialRows.find((item) => item.title === title || item.id === result.documentId);
    if (material || scope.includes("资料库")) {
      if (material) {
        resourceTab = "resources";
        selectedResourceCategory = "";
        openMaterialDetail(material.id);
        return;
      }
      showWorkbenchNotice("未找到对应资料详情，请刷新资料库后重试。");
      return;
    }
    const regulation = regulationItems.find((item) => item.id === result.documentId || item.title === title);
    if (regulation || scope.includes("规范知识")) {
      if (regulation) {
        resourceTab = "knowledge";
        selectedKnowledgeDocumentId = "";
        knowledgePreviewTitle = regulation.title;
        knowledgePreviewDescription = `${regulation.category} / ${regulation.status} / ${regulation.tags}`;
        showWorkbenchNotice(`已打开规范知识：${regulation.title}`);
        return;
      }
      showWorkbenchNotice("未找到对应规范详情，请同步知识库后重试。");
      return;
    }
    const project = projectCards.find((item) => item.name === title || item.code === title);
    if (project || scope.includes("项目管理")) {
      if (project) {
        selectedProjectId = project.id;
        projectDetailTab = "overview";
        projectDetailOpen = true;
        return;
      }
      showWorkbenchNotice("未找到对应项目详情。");
      return;
    }
    const customer = customerCards.find((item) => item.name === title);
    if (customer || scope.includes("客户管理")) {
      if (customer) {
        selectedCustomerId = customer.id;
        customerDetailTab = "overview";
        customerDetailOpen = true;
        return;
      }
      showWorkbenchNotice("未找到对应客户详情。");
      return;
    }
    const report = reportCards.find((item) => item.title === title);
    if (report || scope.includes("报告中心")) {
      if (report) {
        selectedReportId = report.id;
        openWorkLayer("reports");
        return;
      }
      showWorkbenchNotice("未找到对应报告详情。");
      return;
    }
    const event = calendarEvents.find((item) => item.title === title);
    if (event || scope.includes("日程")) {
      if (event) {
        void openCalendarEvent(event);
        return;
      }
      showWorkbenchNotice("未找到对应日程详情。");
      return;
    }
    const team = teamRooms.find((item) => item.title === title);
    if (team || scope.includes("团队协作")) {
      if (team) {
        selectedTeamTitle = team.title;
        teamViewMode = "teams";
        openWorkLayer("teams");
        return;
      }
      showWorkbenchNotice("未找到对应团队详情。");
      return;
    }
    showWorkbenchNotice("该检索结果暂未关联可打开的详情。");
  }
  async function runWorkbenchSearch(query = resourceSearch) {
    const search = workbenchDataPersistenceBindings()?.SearchWorkbench;
    try {
      if (typeof search === "function") {
        const results = await search(query.trim());
        if (Array.isArray(results)) {
          searchResults = results;
          return;
        }
      }
      searchResults = localWorkbenchSearch(query);
    } catch (error) {
      console.error("Failed to search workbench", error);
      searchResults = localWorkbenchSearch(query);
    }
  }
  function normalizeKnowledgeDocumentForUI(document: WorkbenchKnowledgeDocument): WorkbenchKnowledgeDocument {
    const chunkCount = Number(document.chunkCount ?? document.count ?? 0);
    return {
      ...document,
      type: document.type || "文档",
      count: chunkCount > 0 ? chunkCount : document.count || 0,
      chunkCount,
      status: document.status || "已入库",
    };
  }
  function knowledgeDocumentMeta(item: WorkbenchKnowledgeDocument) {
    const chunks = knowledgeDocumentCount(item);
    const file = item.fileName || item.source || "手动知识";
    return `${item.type || "文档"} / ${chunks} 个切片 / ${file}`;
  }
  function knowledgeVectorLabel() {
    return knowledgeStatus.sqliteVec ? "已启用" : "待启用";
  }
  function knowledgeIndexSummary() {
    if (!knowledgeStatus.sqlite) return "本地 SQLite 未连接";
    if (!knowledgeStatus.fts5) return "SQLite 已连接，全文索引不可用";
    return knowledgeStatus.sqliteVec
      ? "SQLite + FTS5 + sqlite-vec：本地全文检索与向量相似度索引均可用"
      : "SQLite + FTS5 已可用；sqlite-vec 向量索引暂未启用，检索会自动回退";
  }
  async function refreshKnowledgeBase() {
    const knowledgeApi = knowledgePersistenceBindings();
    if (typeof knowledgeApi?.KnowledgeBase !== "function") return;
    try {
      const data = await knowledgeApi.KnowledgeBase();
      documentItems = Array.isArray(data.documents) ? data.documents.map(normalizeKnowledgeDocumentForUI) : [];
      if (data.status) knowledgeStatus = data.status;
    } catch (error) {
      console.error("Failed to load knowledge base", error);
    }
  }
  async function deleteKnowledgeDocument(item: WorkbenchKnowledgeDocument) {
    const deleteDocument = knowledgePersistenceBindings()?.DeleteKnowledgeDocument;
    if (typeof deleteDocument !== "function") {
      showWorkbenchNotice("知识库管理接口未就绪，请重启桌面 dev 窗口后重试。");
      return;
    }
    try {
      await deleteDocument(item.id);
      documentItems = documentItems.filter((document) => document.id !== item.id);
      await refreshKnowledgeBase();
      await runWorkbenchSearch(resourceSearch);
      if (knowledgePreviewTitle === item.title) {
        knowledgePreviewTitle = "知识库预览";
        knowledgePreviewDescription = "选择左侧文档后查看索引来源、切片状态与文件路径。";
      }
      showWorkbenchNotice(`已从知识库删除：${item.title}`);
    } catch (error) {
      console.error("Failed to delete knowledge document", error);
      showWorkbenchNotice("删除知识库文档失败。");
    }
  }
  function handleResourceSearchInput(event: Event) {
    resourceSearch = (event.currentTarget as HTMLInputElement).value;
    if (resourceTab === "search") void runWorkbenchSearch(resourceSearch);
  }
  async function copyMaterialPath(material?: WorkbenchProjectMaterial) {
    const path = materialPath(material);
    if (!path) {
      showWorkbenchNotice("当前资料没有可复制的文件路径。");
      return;
    }
    try {
      await navigator.clipboard?.writeText(path);
      showWorkbenchNotice("资料路径已复制。");
    } catch {
      showWorkbenchNotice("复制失败，请手动查看路径。");
    }
  }
  async function openMaterialFile(material?: WorkbenchProjectMaterial) {
    const path = materialPath(material);
    if (!path) {
      showWorkbenchNotice("当前资料没有可打开的文件路径。");
      return;
    }
    try {
      await app().OpenWorkspacePath(path);
    } catch (error) {
      console.error("Failed to open material file", error);
      showWorkbenchNotice("打开资料失败，请确认文件仍存在。");
    }
  }
  async function revealMaterialFile(material?: WorkbenchProjectMaterial) {
    const path = materialPath(material);
    if (!path) {
      showWorkbenchNotice("当前资料没有可定位的文件路径。");
      return;
    }
    try {
      await app().RevealWorkspacePath(path);
    } catch {
      try {
        const revealPath = (window.go?.main?.App as { RevealPath?: (path: string) => Promise<void> } | undefined)?.RevealPath;
        if (typeof revealPath !== "function") throw new Error("RevealPath unavailable");
        await revealPath(path);
      } catch (error) {
        console.error("Failed to reveal material file", error);
        showWorkbenchNotice("定位资料失败，请确认文件仍存在。");
      }
    }
  }
  async function deleteMaterial(material?: WorkbenchProjectMaterial) {
    if (!material) return;
    try {
      const deleteMaterialBinding = projectMaterialPersistenceBindings()?.DeleteProjectMaterial;
      if (typeof deleteMaterialBinding === "function") await deleteMaterialBinding(material.id);
      projectMaterialRows = projectMaterialRows.filter((item) => item.id !== material.id);
      projectCards = projectCards.map((project) =>
        project.id === material.projectId ? { ...project, materials: Math.max(0, project.materials - 1), updatedAt: "刚刚" } : project,
      );
      if (selectedResourceCategory && !projectMaterialRows.some((item) => item.category === selectedResourceCategory)) selectedResourceCategory = "";
      selectedMaterialDetailId = "";
      await refreshKnowledgeBase();
      await runWorkbenchSearch(resourceSearch);
      showWorkbenchNotice(`已删除资料：${material.title}`);
    } catch (error) {
      console.error("Failed to delete project material", error);
      showWorkbenchNotice("删除资料失败，请稍后重试。");
    }
  }
  function todoPersistenceBindings(): TodoPersistenceBindings | undefined {
    return typeof window === "undefined" ? undefined : window.go?.main?.App as TodoPersistenceBindings | undefined;
  }
  function projectPersistenceBindings(): ProjectPersistenceBindings | undefined {
    return typeof window === "undefined" ? undefined : window.go?.main?.App as ProjectPersistenceBindings | undefined;
  }
  function projectMaterialPersistenceBindings(): ProjectMaterialPersistenceBindings | undefined {
    return typeof window === "undefined" ? undefined : window.go?.main?.App as ProjectMaterialPersistenceBindings | undefined;
  }
  function projectMaterialFileBindings(): ProjectMaterialFileBindings | undefined {
    return typeof window === "undefined" ? undefined : window.go?.main?.App as ProjectMaterialFileBindings | undefined;
  }
  function automationPersistenceBindings(): AutomationPersistenceBindings | undefined {
    return typeof window === "undefined" ? undefined : window.go?.main?.App as AutomationPersistenceBindings | undefined;
  }
  function workbenchDataPersistenceBindings(): WorkbenchDataPersistenceBindings | undefined {
    return typeof window === "undefined" ? undefined : window.go?.main?.App as WorkbenchDataPersistenceBindings | undefined;
  }
  function knowledgePersistenceBindings(): KnowledgePersistenceBindings | undefined {
    return typeof window === "undefined" ? undefined : window.go?.main?.App as KnowledgePersistenceBindings | undefined;
  }
  function showWorkbenchNotice(message: string) {
    workbenchNotice = message;
    if (workbenchNoticeTimer) clearTimeout(workbenchNoticeTimer);
    if (typeof window === "undefined") return;
    workbenchNoticeTimer = window.setTimeout(() => {
      if (workbenchNotice === message) workbenchNotice = "";
    }, 2800);
  }
  function todoStatusLabel(status: string) {
    if (status === "in_progress") return "进行中";
    if (status === "done") return "已完成";
    if (status === "blocked") return "阻塞";
    return "待处理";
  }
  function todoDescription(todo: WorkbenchTodo) {
    return todo.description || "待补充执行说明。";
  }
  function todoDue(todo: WorkbenchTodo) {
    return todo.dueLabel || todo.dueAt || "无截止时间";
  }
  function isTodoDueToday(todo: WorkbenchTodo) {
    const today = formatCalendarDate(new Date());
    const monthDay = today.slice(5);
    const dueAt = (todo.dueAt || "").trim();
    if (dueAt) return dueAt.startsWith(today);
    const dueLabel = (todo.dueLabel || "").trim();
    if (!dueLabel) return false;
    if (dueLabel === "今天" || dueLabel === "今日" || dueLabel.startsWith("今天 ") || dueLabel.startsWith("今日 ")) return true;
    if (/^\d{1,2}:\d{2}$/.test(dueLabel)) return true;
    return dueLabel.startsWith(today) || dueLabel.startsWith(today.replaceAll("-", "/")) || dueLabel.startsWith(monthDay) || dueLabel.startsWith(monthDay.replace("-", "/"));
  }
  function todayTodoItems() {
    return todoItems.filter(isTodoDueToday);
  }
  function formatTodoDueLabel(value: string) {
    if (!value) return "";
    const [date = "", time = ""] = value.split("T");
    const [year = "", month = "", day = ""] = date.split("-");
    const hourMinute = time.slice(0, 5);
    if (!year || !month || !day || !hourMinute) return value;
    return `${year}-${month}-${day} ${hourMinute}`;
  }
  function defaultTodoProjectId() {
    const linked = projectCards.find((item) => item.name === linkedProject);
    if (linked) return linked.id;
    if (projectDetailOpen && projectCards.some((item) => item.id === selectedProjectId)) return selectedProjectId;
    if (customerDetailOpen) return customerProjects(selectedCustomer())[0]?.id ?? "";
    return "";
  }
  function todoProjectRows(projectId: string) {
    return todoItems
      .filter((todo) => todo.projectId === projectId)
      .map((todo) => ({ projectId, title: todo.title, due: todoDue(todo), priority: todo.priority, state: todoStatusLabel(todo.status), desc: todoDescription(todo) }));
  }
  function scheduleDialogContext() {
    const linkedProjectName = linkedProject.trim();
    const linkedCustomerName = linkedCustomer.trim();
    const inProjectDetail = workLayer === "projects" && projectDetailOpen;
    const inCustomerDetail = workLayer === "customers" && customerDetailOpen;
    const project = linkedProjectName
      ? projectCards.find((item) => item.name === linkedProjectName || item.id === selectedProjectId)
      : inProjectDetail
        ? projectCards.find((item) => item.id === selectedProjectId)
        : undefined;
    const customer = linkedCustomerName
      ? customerCards.find((item) => item.name === linkedCustomerName || item.id === selectedCustomerId)
      : inCustomerDetail
        ? customerCards.find((item) => item.id === selectedCustomerId)
        : undefined;
    return {
      project,
      customer,
      projectName: linkedProjectName || project?.name || "",
      customerName: linkedCustomerName || customer?.name || "",
    };
  }
  function scheduleDraftTitle() {
    const { projectName } = scheduleDialogContext();
    return projectName ? `${projectName} 日程` : "新建日程";
  }
  function scheduleDraftDay(now = new Date()) {
    return String(now.getDate()).padStart(2, "0");
  }
  function scheduleDraftTime(now = new Date()) {
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }
  function scheduleDraftPlace() {
    const { projectName, customerName } = scheduleDialogContext();
    return projectName || customerName || "工作";
  }
  async function syncWorkbench(scope = "工作台") {
    try {
      if (hasWailsBindings()) {
        void refreshModelSettings();
        const runSync = workbenchDataPersistenceBindings()?.RunWorkbenchSync;
        if (typeof runSync === "function") {
          syncJobs = await runSync(scope);
          await refreshWorkbenchData();
        }
      }
      showWorkbenchNotice(`${scope}已完成同步。`);
    } catch (error) {
      console.error("Failed to sync workbench", error);
      showWorkbenchNotice(`${scope}同步失败，请稍后重试。`);
    }
  }
  async function exportOperationLog() {
    try {
      const exportLogs = workbenchDataPersistenceBindings()?.ExportOperationLogs;
      if (typeof exportLogs === "function") {
        const path = await exportLogs();
        showWorkbenchNotice(`已导出 ${operationLogs.length} 条操作记录：${path}`);
        return;
      }
      showWorkbenchNotice(`已生成 ${operationLogs.length} 条操作记录导出。`);
    } catch (error) {
      console.error("Failed to export operation logs", error);
      showWorkbenchNotice("导出操作记录失败。");
    }
  }
  async function exportReports() {
    try {
      const exportReportsBinding = workbenchDataPersistenceBindings()?.ExportWorkbenchReports;
      if (typeof exportReportsBinding === "function") {
        const path = await exportReportsBinding();
        await refreshWorkbenchData();
        openWorkLayer("operationLog");
        showWorkbenchNotice(`已导出 ${reportCards.length} 份报告：${path}`);
        return;
      }
      openWorkLayer("operationLog");
      showWorkbenchNotice(`已将 ${reportCards.length} 份报告加入导出队列。`);
    } catch (error) {
      console.error("Failed to export reports", error);
      showWorkbenchNotice("导出报告失败。");
    }
  }
  async function openCalendarEvent(event: (typeof calendarEvents)[number]) {
    fillScheduleDraft(event);
    configDialog = "schedule";
    showWorkbenchNotice(`正在查看日程：${event.title}`);
  }
  function calendarEventKey(event: Partial<WorkbenchCalendarEvent> & { date?: string }, index: number) {
    return `${event.id || `${event.title}-${event.day || event.date}-${event.time}-${event.place}`}-${index}`;
  }
  function startOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }
  function formatCalendarDate(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function calendarMonthKey(date = calendarMonthCursor) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  function calendarMonthLabel(date = calendarMonthCursor) {
    return `${date.getFullYear()}年${date.getMonth() + 1}月`;
  }
  function calendarEventFullDate(event: WorkbenchCalendarEvent, month = calendarMonthCursor) {
    const withDate = event as WorkbenchCalendarEvent & { date?: string };
    if (withDate.date && /^\d{4}-\d{2}-\d{2}$/.test(withDate.date)) return withDate.date;
    const day = Number(event.day);
    if (!Number.isFinite(day) || day < 1 || day > 31) return "";
    const today = new Date();
    if (month.getFullYear() !== today.getFullYear() || month.getMonth() !== today.getMonth()) return "";
    return `${calendarMonthKey(today)}-${String(day).padStart(2, "0")}`;
  }
  function calendarEventsForDate(date: string) {
    return calendarEvents
      .filter((event) => calendarEventFullDate(event) === date)
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  }
  function calendarMonthEvents() {
    const month = calendarMonthKey();
    return calendarEvents
      .filter((event) => calendarEventFullDate(event).startsWith(month))
      .sort((a, b) => `${calendarEventFullDate(a)} ${a.time || ""}`.localeCompare(`${calendarEventFullDate(b)} ${b.time || ""}`));
  }
  function parseCalendarTimeRange(time: string): { start: number; end: number } | undefined {
    const matches = (time || "").match(/\d{1,2}[:\uFF1A]\d{2}/g) || [];
    if (!matches.length) return undefined;
    const toMinutes = (value: string) => {
      const [hourText = "", minuteText = ""] = value.replace(/\uFF1A/g, ":").split(":");
      const hour = Number(hourText);
      const minute = Number(minuteText);
      if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;
      return hour * 60 + minute;
    };
    const [startMatch, endMatch] = matches;
    if (!startMatch) return undefined;
    const start = toMinutes(startMatch);
    if (start === undefined) return undefined;
    const parsedEnd = endMatch ? toMinutes(endMatch) : undefined;
    const end = parsedEnd === undefined ? start + 60 : parsedEnd <= start ? parsedEnd + 24 * 60 : parsedEnd;
    return { start, end };
  }
  function calendarEventIntervals(month = calendarMonthKey()): CalendarEventInterval[] {
    return calendarEvents
      .map((event) => {
        const date = calendarEventFullDate(event);
        const interval = parseCalendarTimeRange(event.time || "");
        return date.startsWith(month) && interval ? { event, date, start: interval.start, end: interval.end } : undefined;
      })
      .filter((item): item is CalendarEventInterval => Boolean(item))
      .sort((a, b) => `${a.date} ${String(a.start).padStart(4, "0")}`.localeCompare(`${b.date} ${String(b.start).padStart(4, "0")}`));
  }
  function calendarConflictGroups(month = calendarMonthKey()): CalendarConflictGroup[] {
    const groups: CalendarConflictGroup[] = [];
    let active: CalendarConflictGroup | undefined;
    for (const item of calendarEventIntervals(month)) {
      if (!active || active.date !== item.date || item.start >= active.end) {
        if (active && active.events.length > 1) groups.push(active);
        active = { date: item.date, start: item.start, end: item.end, events: [item.event] };
        continue;
      }
      active.end = Math.max(active.end, item.end);
      if (!active.events.some((event) => calendarEventKey(event, 0) === calendarEventKey(item.event, 0))) active.events = [...active.events, item.event];
    }
    if (active && active.events.length > 1) groups.push(active);
    return groups;
  }
  function calendarConflictSummary() {
    const conflicts = calendarConflictGroups();
    if (!conflicts.length) return "\u6682\u65e0\u65f6\u95f4\u51b2\u7a81";
    const first = conflicts[0];
    const day = first.date.slice(8, 10);
    return `${day} \u65e5 ${first.events.length} \u9879\u91cd\u53e0`;
  }
  function upcomingCalendarEvents(limit = 8) {
    const month = calendarMonthKey();
    const today = formatCalendarDate(new Date());
    const lowerBound = today;
    return calendarEvents
      .filter((event) => {
        const eventDate = calendarEventFullDate(event);
        return eventDate.startsWith(month) && eventDate >= lowerBound;
      })
      .sort((a, b) => `${calendarEventFullDate(a)} ${a.time || ""}`.localeCompare(`${calendarEventFullDate(b)} ${b.time || ""}`))
      .slice(0, limit);
  }
  function calendarMonthCells(): CalendarMonthCell[] {
    const year = calendarMonthCursor.getFullYear();
    const month = calendarMonthCursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leading = (firstDay.getDay() + 6) % 7;
    const total = Math.ceil((leading + daysInMonth) / 7) * 7;
    const today = formatCalendarDate(new Date());
    return Array.from({ length: total }, (_, index) => {
      const date = new Date(year, month, index - leading + 1);
      const inMonth = date.getMonth() === month;
      const fullDate = formatCalendarDate(date);
      return { key: fullDate, day: date.getDate(), date: fullDate, inMonth, isToday: fullDate === today, events: inMonth ? calendarEventsForDate(fullDate) : [] };
    });
  }
  function shiftCalendarMonth(delta: number) {
    calendarMonthCursor = startOfMonth(new Date(calendarMonthCursor.getFullYear(), calendarMonthCursor.getMonth() + delta, 1));
  }
  function resetCalendarMonth() {
    calendarMonthCursor = startOfMonth(new Date());
  }
  function currentMonthDateForDay(day: number) {
    const today = new Date();
    return formatCalendarDate(new Date(today.getFullYear(), today.getMonth(), day));
  }
  function isCurrentMonthDayToday(day: number) {
    return currentMonthDateForDay(day) === formatCalendarDate(new Date());
  }
  function calendarEventsForCurrentMonthDay(day: number) {
    return calendarEvents
      .filter((event) => calendarEventFullDate(event, startOfMonth(new Date())) === currentMonthDateForDay(day))
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  }
  function indexedKey(value: unknown, index: number) {
    return `${String(value ?? "item")}-${index}`;
  }
  function workspaceNavItemKey(item: Partial<WorkspaceNavItem>, index: number) {
    return `${item.layer ?? "nav"}:${item.resourceTab ?? ""}:${item.label ?? ""}:${index}`;
  }
  function codeWorkspaceNavItemKey(item: { action?: string; label?: string }, index: number) {
    return `${item.action ?? "action"}:${item.label ?? ""}:${index}`;
  }
  function openKnowledgeDocument(item: (typeof documentItems)[number]) {
    selectedKnowledgeDocumentId = item.id;
    knowledgePreviewTitle = item.title;
    knowledgePreviewDescription = [
      item.description || `${item.type || "文档"}知识已写入本地索引。`,
      `状态：${item.status || "已入库"}`,
      `切片：${knowledgeDocumentCount(item)} 个`,
      item.fileName ? `文件：${item.fileName}` : "",
      item.indexedAt ? `索引时间：${item.indexedAt}` : "",
      item.error ? `错误：${item.error}` : "",
    ].filter(Boolean).join(" / ");
    showWorkbenchNotice(`已打开文档知识：${item.title}`);
  }
  function toggleTemplateMaterial(materialId: string) {
    templateDraftMaterialIds = templateDraftMaterialIds.includes(materialId)
      ? templateDraftMaterialIds.filter((id) => id !== materialId)
      : [...templateDraftMaterialIds, materialId];
  }
  function openKnowledgeMaterial(material: WorkbenchProjectMaterial) {
    resourceTab = "resources";
    selectedResourceCategory = "";
    resourceSearch = "";
    openMaterialDetail(material.id);
  }
  function editKnowledgeDocument(item?: WorkbenchKnowledgeDocument) {
    const target = item ?? selectedKnowledgeDocument();
    if (!target) return;
    templateDraftId = target.id;
    templateDraftTitle = target.title;
    templateDraftType = target.type || "模板";
    templateDraftStatus = target.status || "草稿";
    templateDraftSource = target.source || "workbench";
    templateDraftTags = target.tags || "";
    templateDraftDescription = target.description || "";
    templateDraftMaterialIds = knowledgeDocumentMaterialIds(target);
    selectedKnowledgeDocumentId = target.id;
    configDialog = "template";
  }
  function showFailedIngestJobs() {
    resourceTab = "ingest";
    const failed = ingestJobs.filter((job) => job.status === "失败");
    showWorkbenchNotice(failed.length ? `已筛出 ${failed.length} 条失败导入任务。` : "当前没有失败导入任务。");
  }
  function splitAutomationLines(value: string) {
    return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  }
  function toDateTimeLocalValue(value?: string) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (number: number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  function fromDateTimeLocalValue(value?: string) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  function automationCommandLabel(command?: string) {
    const normalized = normalizeAutomationCommandValue(command);
    return automationCommandOptions.find((item) => item.value === normalized)?.label ?? command ?? "";
  }
  function normalizeAutomationCommandValue(command?: string) {
    const value = (command ?? "").trim();
    if (automationCommandOptions.some((item) => item.value === value)) return value;
    const lower = value.toLowerCase();
    if (!lower) return "";
    if (lower.includes("http 200") || lower.includes("dom snapshot") || lower.includes("console warning")) return "";
    if (lower.includes("go test") && lower.includes("desktop")) return "desktop-go-test";
    if (lower.includes("go test")) return "root-go-test";
    if (lower.includes("diff --check")) return "diff-check";
    if (lower.includes("build")) return "frontend-build";
    if (lower.includes("check") || lower.includes("autofixer")) return "frontend-check";
    return "";
  }
  function automationDraftFromTask(task?: WorkbenchAutomation): AutomationDraft {
    return {
      id: task?.id,
      title: task?.title ?? "",
      desc: task?.desc ?? "",
      status: task?.status ?? "待配置",
      kind: task?.kind ?? "自定义自动化",
      owner: task?.owner ?? "自动化 Agent",
      startedAtMs: task?.startedAtMs,
      cadence: task?.cadence ?? "",
      schedule: task?.schedule ?? "手动触发",
      scheduleMode: task?.scheduleMode ?? "manual",
      scope: task?.scope ?? "",
      environment: task?.environment ?? "local workspace",
      command: normalizeAutomationCommandValue(task?.command),
      nextRunAt: toDateTimeLocalValue(task?.nextRunAt),
      result: task?.result ?? "待运行",
      lastRun: task?.lastRun ?? "未运行",
      nextRun: task?.nextRun ?? "等待配置",
      steps: task?.steps ?? [],
      logs: task?.logs ?? [],
      stepsText: (task?.steps ?? []).join("\n"),
      logsText: (task?.logs ?? []).join("\n"),
    };
  }
  function openAutomationDialog(taskId?: string) {
    const task = taskId ? runningAutomations.find((item) => item.id === taskId) : undefined;
    automationDialogMode = task ? "edit" : "create";
    automationDialog = task?.id ?? "new";
    automationDraft = automationDraftFromTask(task);
  }
  function automationDraftInput(): WorkbenchAutomationInput {
    return {
      id: automationDialogMode === "edit" ? automationDraft.id : undefined,
      title: automationDraft.title.trim(),
      desc: automationDraft.desc.trim(),
      status: automationDraft.status?.trim() || "待配置",
      kind: automationDraft.kind?.trim() || "自定义自动化",
      owner: automationDraft.owner?.trim() || "自动化 Agent",
      startedAtMs: automationDraft.startedAtMs,
      cadence: automationDraft.cadence?.trim(),
      schedule: automationDraft.schedule?.trim() || "手动触发",
      scheduleMode: automationDraft.scheduleMode?.trim() || "manual",
      scope: automationDraft.scope?.trim(),
      environment: automationDraft.environment?.trim() || "local workspace",
      command: normalizeAutomationCommandValue(automationDraft.command),
      nextRunAt: fromDateTimeLocalValue(automationDraft.nextRunAt),
      result: automationDraft.result?.trim() || "待运行",
      lastRun: automationDraft.lastRun?.trim() || "未运行",
      nextRun: automationDraft.nextRun?.trim() || "等待配置",
      steps: splitAutomationLines(automationDraft.stepsText),
      logs: splitAutomationLines(automationDraft.logsText),
    };
  }
  async function saveAutomationDraft() {
    const input = automationDraftInput();
    if (!input.title) {
      showWorkbenchNotice("请填写自动化任务名称。");
      return;
    }
    try {
      const saveAutomation = automationPersistenceBindings()?.SaveAutomation;
      const persisted = typeof saveAutomation === "function";
      const now = new Date().toISOString();
      const saved = persisted
        ? await saveAutomation(input)
        : { ...input, id: input.id || `automation-${Date.now()}`, startedAtMs: input.startedAtMs || Date.now(), createdAt: now, updatedAt: now } as WorkbenchAutomation;
      runningAutomations = [saved, ...runningAutomations.filter((item) => item.id !== saved.id)];
      automationDialog = undefined;
      showWorkbenchNotice(persisted ? `已保存自动化任务：${saved.title}` : `已保存自动化任务：${saved.title}。重启桌面 dev 窗口后会启用持久化。`);
    } catch (error) {
      console.error("Failed to save automation", error);
      showWorkbenchNotice("保存自动化任务失败，请稍后重试。");
    }
  }
  async function toggleAutomationTask(taskId: string) {
    let nextStatus = "";
    const task = runningAutomations.find((item) => item.id === taskId);
    if (!task) return;
    const isRunning = task.status === "运行中";
    nextStatus = isRunning ? "已暂停" : "运行中";
    const input: WorkbenchAutomationInput = {
      ...task,
      status: nextStatus,
      result: isRunning ? "已暂停" : "已启动",
      lastRun: "刚刚",
      nextRun: isRunning ? "等待手动恢复" : task.nextRun,
    };
    try {
      const saveAutomation = automationPersistenceBindings()?.SaveAutomation;
      const saved = typeof saveAutomation === "function"
        ? await saveAutomation(input)
        : { ...task, ...input, updatedAt: new Date().toISOString() };
      runningAutomations = runningAutomations.map((item) => item.id === taskId ? saved as WorkbenchAutomation : item);
      showWorkbenchNotice(`${task.title}已${nextStatus === "运行中" ? "启动" : "暂停"}。`);
    } catch (error) {
      console.error("Failed to toggle automation", error);
      showWorkbenchNotice("更新自动化任务状态失败，请稍后重试。");
    }
  }
  async function runAutomationNow(taskId?: string) {
    if (!taskId) return;
    try {
      const runAutomation = automationPersistenceBindings()?.RunAutomationNow;
      const saveAutomation = automationPersistenceBindings()?.SaveAutomation;
      if (typeof runAutomation === "function") {
        const saved = await runAutomation(taskId);
        runningAutomations = runningAutomations.map((item) => item.id === taskId ? saved : item);
        automationDraft = automationDraftFromTask(saved);
        showWorkbenchNotice(`${saved.title} 已执行。`);
        return;
      }
      if (typeof saveAutomation === "function") {
        const task = runningAutomations.find((item) => item.id === taskId);
        if (!task) return;
        const saved = await saveAutomation({ ...task, result: "等待桌面后端执行", lastRun: "刚刚" });
        runningAutomations = runningAutomations.map((item) => item.id === taskId ? saved : item);
        showWorkbenchNotice("当前桌面绑定不支持立即执行，请重启桌面 dev 窗口。");
      }
    } catch (error) {
      console.error("Failed to run automation", error);
      showWorkbenchNotice("执行自动化任务失败，请检查命令配置。");
    }
  }
  async function deleteAutomationTask(taskId: string) {
    if (runningAutomations.length <= 1) {
      showWorkbenchNotice("至少保留一个自动化任务。");
      return;
    }
    const task = runningAutomations.find((item) => item.id === taskId);
    try {
      const deleteAutomation = automationPersistenceBindings()?.DeleteAutomation;
      if (typeof deleteAutomation === "function") await deleteAutomation(taskId);
      runningAutomations = runningAutomations.filter((item) => item.id !== taskId);
      if (automationDialog === taskId) automationDialog = undefined;
      showWorkbenchNotice(task ? `${task.title}已删除。` : "自动化任务已删除。");
    } catch (error) {
      console.error("Failed to delete automation", error);
      showWorkbenchNotice("删除自动化任务失败，请稍后重试。");
    }
  }
  function selectDistillSample(item: (typeof todoItems)[number]) {
    distillSampleTodoId = item.id;
    distillStep = 2;
    showWorkbenchNotice(`已选择样本：${item.title}`);
  }
  function toggleDistillSkill(skillId: string) {
    let nextTitle = "";
    let enabled = false;
    skillCards = skillCards.map((skill) => {
      if (skill.id !== skillId) return skill;
      nextTitle = skill.title;
      enabled = !skill.active;
      return { ...skill, active: enabled };
    });
    if (nextTitle) showWorkbenchNotice(`${nextTitle}已${enabled ? "加入" : "移出"}蒸馏能力。`);
  }
  function capabilityAgentBindingList(item: CapabilityItem) {
    const explicit = capabilityAgentBindings[item.id];
    if (explicit) return explicit;
    const target = item.name || item.id;
    const persisted = agentCards.filter((agent) => capabilityTab === "skill" ? (agent.skills ?? []).includes(target) : (agent.tools ?? []).includes(target)).map((agent) => agent.id);
    return persisted;
  }
  function isCapabilityAgentBound(item: CapabilityItem, agentId: string) {
    return capabilityAgentBindingList(item).includes(agentId);
  }
  async function toggleCapabilityAgentBinding(item: CapabilityItem, agent: AgentView) {
    const current = capabilityAgentBindingList(item);
    const next = current.includes(agent.id) ? current.filter((id) => id !== agent.id) : [...current, agent.id];
    capabilityAgentBindings = { ...capabilityAgentBindings, [item.id]: next };
    const bound = next.includes(agent.id);
    if (hasWailsBindings()) {
      try {
        await app().SaveAgent(agentInputWithCapability(agent, item, bound));
        await refreshAgents();
      } catch (error) {
        console.error("Failed to persist capability binding", error);
        capabilityAgentBindings = { ...capabilityAgentBindings, [item.id]: current };
        showWorkbenchNotice("保存 Agent 能力绑定失败，请稍后重试。");
        return;
      }
    } else {
      const nextInput = agentInputWithCapability(agent, item, bound);
      agentCards = agentCards.map((candidate) => candidate.id === agent.id ? { ...candidate, tools: nextInput.tools ?? [], skills: nextInput.skills ?? [], updatedAt: new Date().toISOString() } : candidate);
    }
    showWorkbenchNotice(`${agent.name}已${bound ? "绑定到" : "从"}${item.name}${bound ? "" : "解绑"}。`);
  }
  const REQUEST_TIMEOUT_MS = 30_000;
  const SIDEBAR_STATE_STORAGE_KEY = "volt-gui.sidebar-state.v1";

  function emptySettingsDraft(): SettingsDraft {
    return {
      language: "auto",
      theme: "auto",
      themeStyle: "graphite",
      closeBehavior: "background",
      permissionMode: "ask",
      sandboxBash: "enforce",
      sandboxNetwork: false,
      sandboxWorkspaceRoot: "",
      sandboxAllowWrite: "",
      sandboxShell: "auto",
    };
  }

  function emptyModelProviderDraft(): ModelProviderDraft {
    return {
      name: "",
      kind: "openai",
      baseUrl: "",
      modelsText: "",
      defaultModel: "",
      apiKeyEnv: "CUSTOM_API_KEY",
      apiKeyValue: "",
      modelsUrl: "",
      apiSurface: "chat_completions",
      responsesUrl: "",
      priority: "0",
      fetchedModels: [],
      selectedFetchedModels: [],
      contextWindow: "128000",
      reasoningProtocol: "",
      supportedEffortsText: "",
      defaultEffort: "",
      visionModelsText: "",
    };
  }

  function splitModelLines(value: string): string[] {
    return Array.from(new Set(value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean)));
  }

  function providerDefaultModel(provider: ProviderView) {
    return provider.default || provider.models?.[0] || "";
  }

  function providerRef(provider: ProviderView, model = providerDefaultModel(provider)) {
    return model ? `${provider.name}/${model}` : provider.name;
  }

  function isDefaultModelRef(provider: ProviderView, model = providerDefaultModel(provider)) {
    const current = modelSettings?.defaultModel || selectedModel;
    return current === provider.name || current === providerRef(provider, model) || current === model;
  }

  function modelCardsFromSettings(): ModelCard[] {
    if (!hasWailsBindings()) return [];
    return (modelSettings?.providers ?? []).flatMap((provider) => {
      const providerModels = provider.models?.length ? provider.models : provider.default ? [provider.default] : [];
      return providerModels.map((model) => ({
        name: model,
        provider: provider.name,
        role: isDefaultModelRef(provider, model) ? "默认对话模型" : `${provider.kind || "provider"} / ${provider.baseUrl || "未配置 endpoint"}`,
        status: provider.configured ? (provider.keySet ? "已连接" : "免密/本地") : provider.requiresKey ? "缺少 Key" : "未启用",
        ref: providerRef(provider, model),
      }));
    });
  }

  function settingGroupsFromSettings(): SettingGroup[] {
    const providerCount = modelSettings?.providers.length ?? modelCards.length;
    const configuredProviders = modelSettings?.providers.filter((provider) => provider.configured).length ?? 0;
    return [
      {
        id: "general",
        title: "常规设置",
        desc: "语言、主题、关闭按钮行为和桌面外观。",
        status: modelSettings ? `${settingsDraft.theme || "auto"} / ${settingsDraft.closeBehavior || "background"}` : "可配置",
      },
      {
        id: "runtime",
        title: "权限与沙箱",
        desc: "工具授权模式、终端沙箱、网络和写入目录。",
        status: modelSettings ? `${settingsDraft.permissionMode || "ask"} / ${settingsDraft.sandboxBash || "enforce"}` : "可配置",
      },
      {
        id: "models",
        title: "模型接口",
        desc: "Provider、API Key 环境变量和默认模型。",
        status: providerCount ? `${configuredProviders}/${providerCount} 可用` : "待配置",
      },
    ];
  }

  function syncSettingsDraft(view = modelSettings) {
    const next = emptySettingsDraft();
    if (view) {
      next.language = view.desktopLanguage || "auto";
      next.theme = view.desktopTheme || "auto";
      next.themeStyle = view.desktopThemeStyle || "graphite";
      next.closeBehavior = view.closeBehavior || "background";
      next.permissionMode = view.permissions.mode || "ask";
      next.sandboxBash = view.sandbox.bash || "enforce";
      next.sandboxNetwork = Boolean(view.sandbox.network);
      next.sandboxWorkspaceRoot = view.sandbox.workspaceRoot || "";
      next.sandboxAllowWrite = (view.sandbox.allowWrite ?? []).join("\n");
      next.sandboxShell = view.sandbox.shell || "auto";
    }
    settingsDraft = next;
  }

  function splitSettingsLines(value: string): string[] {
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  async function ensureSettingsLoaded() {
    if (!hasWailsBindings()) {
      syncSettingsDraft();
      return;
    }
    if (!modelSettings && !modelSettingsLoading) await refreshModelSettings();
  }

  function openSettingsPanel(panel: SettingPanel) {
    settingsPanel = panel;
    userPanelDialog = "settings";
    userMenuOpen = false;
    settingsMessage = "";
    modelSettingsError = "";
    void ensureSettingsLoaded();
  }

  function selectSettingsPanel(panel: SettingPanel) {
    settingsPanel = panel;
    settingsMessage = "";
    modelSettingsError = "";
  }

  function resetSettingsDraft() {
    syncSettingsDraft();
    settingsMessage = "";
    modelSettingsError = "";
  }

  function settingsPanelTitle() {
    if (settingsPanel === "runtime") return "权限与沙箱";
    if (settingsPanel === "models") return "模型接口";
    return "常规设置";
  }

  async function saveSettingsDraft() {
    if (settingsPanel === "models") {
      openWorkLayer("models");
      userPanelDialog = undefined;
      return;
    }
    if (!hasWailsBindings()) {
      settingsMessage = "浏览器预览已应用草稿；进入桌面运行时后会写入真实配置。";
      return;
    }
    settingsSaving = true;
    settingsMessage = "";
    modelSettingsError = "";
    try {
      const current = modelSettings ?? await app().Settings();
      if (settingsPanel === "general") {
        if ((settingsDraft.language || "auto") !== (current.desktopLanguage || "auto")) {
          await app().SetDesktopLanguage(settingsDraft.language);
        }
        if ((settingsDraft.theme || "auto") !== (current.desktopTheme || "auto") || (settingsDraft.themeStyle || "graphite") !== (current.desktopThemeStyle || "graphite")) {
          await app().SetDesktopAppearance(settingsDraft.theme, settingsDraft.themeStyle);
        }
        if ((settingsDraft.closeBehavior || "background") !== (current.closeBehavior || "background")) {
          await app().SetCloseBehavior(settingsDraft.closeBehavior);
        }
      } else if (settingsPanel === "runtime") {
        if ((settingsDraft.permissionMode || "ask") !== (current.permissions.mode || "ask")) {
          await app().SetPermissionMode(settingsDraft.permissionMode);
        }
        await app().SetSandbox(
          settingsDraft.sandboxBash,
          settingsDraft.sandboxNetwork,
          settingsDraft.sandboxWorkspaceRoot,
          splitSettingsLines(settingsDraft.sandboxAllowWrite),
          settingsDraft.sandboxShell,
        );
      }
      await refreshModelSettings();
      settingsMessage = "设置已保存。";
    } catch (error) {
      modelSettingsError = error instanceof Error ? error.message : String(error);
    } finally {
      settingsSaving = false;
    }
  }

  function providerDraftFromView(provider?: ProviderView): ModelProviderDraft {
    if (!provider) return emptyModelProviderDraft();
    return {
      name: provider.name,
      kind: provider.kind || "openai",
      baseUrl: provider.baseUrl || "",
      modelsText: (provider.models ?? []).join("\n"),
      defaultModel: provider.default || provider.models?.[0] || "",
      apiKeyEnv: provider.apiKeyEnv || "CUSTOM_API_KEY",
      apiKeyValue: "",
      modelsUrl: provider.modelsUrl || "",
      apiSurface: provider.apiSurface || "chat_completions",
      responsesUrl: provider.responsesUrl || "",
      priority: String(provider.priority ?? 0),
      fetchedModels: [],
      selectedFetchedModels: [],
      contextWindow: provider.contextWindow ? String(provider.contextWindow) : "",
      reasoningProtocol: provider.reasoningProtocol || "",
      supportedEffortsText: (provider.supportedEfforts ?? []).join(", "),
      defaultEffort: provider.defaultEffort || "",
      visionModelsText: (provider.visionModels ?? []).join("\n"),
    };
  }

  function providerViewFromDraft(): ProviderView {
    const modelsList = splitModelLines(modelDraft.modelsText);
    const visionModels = splitModelLines(modelDraft.visionModelsText);
    const contextWindow = Number.parseInt(modelDraft.contextWindow.trim(), 10);
    const priority = Number.parseInt(modelDraft.priority.trim(), 10);
    return {
      name: modelDraft.name.trim(),
      kind: modelDraft.kind.trim() || "openai",
      baseUrl: modelDraft.baseUrl.trim(),
      apiSurface: modelDraft.apiSurface.trim() || "chat_completions",
      responsesUrl: modelDraft.responsesUrl.trim(),
      models: modelsList,
      visionModels,
      visionModelsConfigured: visionModels.length > 0,
      modelsUrl: modelDraft.modelsUrl.trim(),
      default: modelDraft.defaultModel.trim() || modelsList[0] || "",
      priority: Number.isFinite(priority) ? priority : 0,
      apiKeyEnv: modelDraft.apiKeyEnv.trim(),
      apiKeyValue: modelDraft.apiKeyValue.trim(),
      keySet: false,
      balanceUrl: "",
      contextWindow: Number.isFinite(contextWindow) && contextWindow > 0 ? contextWindow : 0,
      reasoningProtocol: modelDraft.reasoningProtocol.trim(),
      supportedEfforts: splitModelLines(modelDraft.supportedEffortsText),
      defaultEffort: modelDraft.defaultEffort.trim(),
    };
  }

  function openModelProviderDialog(provider?: ProviderView) {
    modelDraft = providerDraftFromView(provider);
    modelDraftEditing = Boolean(provider);
    modelDraftMessage = "";
    modelDraftError = "";
    configDialog = "model";
    userPanelDialog = undefined;
  }

  function isDraftFetchedModelSelected(model: string) {
    return modelDraft.selectedFetchedModels.includes(model);
  }

  function applySelectedDraftModels(models: string[]) {
    const selected = Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)));
    modelDraft.selectedFetchedModels = selected;
    modelDraft.modelsText = selected.join("\n");
    if (!selected.includes(modelDraft.defaultModel)) modelDraft.defaultModel = selected[0] || "";
  }

  function toggleDraftFetchedModel(model: string) {
    const selected = isDraftFetchedModelSelected(model)
      ? modelDraft.selectedFetchedModels.filter((item) => item !== model)
      : [...modelDraft.selectedFetchedModels, model];
    applySelectedDraftModels(selected);
  }

  function selectAllDraftFetchedModels() {
    applySelectedDraftModels(modelDraft.fetchedModels);
  }

  function clearDraftFetchedModels() {
    applySelectedDraftModels([]);
  }

  async function refreshModelSettings() {
    if (!hasWailsBindings()) return;
    modelSettingsLoading = true;
    modelSettingsError = "";
    try {
      modelSettings = await app().Settings();
      syncSettingsDraft(modelSettings);
    } catch (error) {
      modelSettingsError = error instanceof Error ? error.message : String(error);
    } finally {
      modelSettingsLoading = false;
    }
  }

  async function fetchDraftProviderModels() {
    if (!hasWailsBindings()) return;
    modelDraftFetching = true;
    modelDraftError = "";
    modelDraftMessage = "";
    try {
      const fetched = await app().FetchProviderModels(providerViewFromDraft());
      const fetchedModels = Array.from(new Set(fetched.map((model) => model.trim()).filter(Boolean)));
      if (!fetchedModels.length) {
        modelDraft.fetchedModels = [];
        modelDraft.selectedFetchedModels = [];
        modelDraftMessage = "没有从 /models 发现可用聊天模型，可手动填写模型名。";
        return;
      }
      const current = splitModelLines(modelDraft.modelsText).filter((model) => fetchedModels.includes(model));
      modelDraft.fetchedModels = fetchedModels;
      applySelectedDraftModels(current.length ? current : fetchedModels);
      modelDraftMessage = `已拉取 ${fetchedModels.length} 个模型，请选择要添加的模型。`;
    } catch (error) {
      modelDraftError = error instanceof Error ? error.message : String(error);
    } finally {
      modelDraftFetching = false;
    }
  }

  async function saveModelProvider() {
    if (!hasWailsBindings()) {
      modelDraftError = "当前没有连接桌面后端，无法保存模型渠道。请在 Wails 桌面运行环境中添加渠道。";
      return;
    }
    const provider = providerViewFromDraft();
    if (!provider.name || !provider.kind || !provider.baseUrl || !provider.models.length) {
      modelDraftError = "请填写名称、类型、Base URL 和至少一个模型。";
      return;
    }
    const key = modelDraft.apiKeyValue.trim();
    if (key && !provider.apiKeyEnv) {
      modelDraftError = "保存 API Key 需要填写环境变量名，或清空 API Key 后保存免密 provider。";
      return;
    }
    modelDraftSaving = true;
    modelDraftError = "";
    modelDraftMessage = "";
    try {
      await app().SaveProvider(provider);
      if (key && provider.apiKeyEnv) {
        const warning = await app().SetProviderKey(provider.apiKeyEnv, key);
        modelDraftMessage = warning || "渠道、模型和 Key 已保存。";
      } else {
        modelDraftMessage = "模型渠道已保存。";
      }
      await refreshModelSettings();
      await refresh();
      configDialog = undefined;
    } catch (error) {
      modelDraftError = error instanceof Error ? error.message : String(error);
    } finally {
      modelDraftSaving = false;
    }
  }

  async function setDefaultModelProvider(provider: ProviderView, model = providerDefaultModel(provider)) {
    if (!hasWailsBindings()) return;
    modelSettingsError = "";
    try {
      await app().SetDefaultModel(providerRef(provider, model));
      await refreshModelSettings();
      await refresh();
    } catch (error) {
      modelSettingsError = error instanceof Error ? error.message : String(error);
    }
  }

  async function deleteModelProvider(provider: ProviderView) {
    if (!hasWailsBindings()) return;
    modelSettingsError = "";
    try {
      await app().DeleteProvider(provider.name);
      await refreshModelSettings();
      await refresh();
    } catch (error) {
      modelSettingsError = error instanceof Error ? error.message : String(error);
    }
  }

  function withTimeout<T>(promise: Promise<T>, message: string, ms = REQUEST_TIMEOUT_MS): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  async function settleRefreshStep<T>(label: string, promise: Promise<T>, timeoutMs = 8_000): Promise<T | undefined> {
    try {
      return await withTimeout(promise, `${label} refresh timed out`, timeoutMs);
    } catch (error) {
      console.error(`Failed to refresh ${label}`, error);
      return undefined;
    }
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  function sanitizeTranscriptRole(role: unknown): TranscriptItem["role"] {
    if (role === "user" || role === "assistant" || role === "system" || role === "tool" || role === "reasoning" || role === "notice") return role;
    return "notice";
  }

  function stripComposerContextPrefix(value: string) {
    const lines = value.trimStart().split(/\r?\n/);
    let index = 0;
    while (index < lines.length && /^(归属项目|所属项目|工作权限)\s*[:：]/.test(lines[index].trim())) {
      index += 1;
    }
    return index > 0 ? lines.slice(index).join("\n").trimStart() : value;
  }

  function sanitizeTranscript(items: unknown): TranscriptItem[] | undefined {
    if (!Array.isArray(items)) return undefined;
    return trimTranscriptItems(items
      .filter(isRecord)
      .map((item) => {
        const role = sanitizeTranscriptRole(item.role);
        const body = typeof item.body === "string" ? item.body : "";
        return {
          id: typeof item.id === "string" ? item.id : `persisted-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          role,
          title: typeof item.title === "string" ? item.title : undefined,
          body: role === "user" ? stripComposerContextPrefix(body) : body,
          pending: false,
          readOnly: Boolean(item.readOnly),
          parentId: typeof item.parentId === "string" ? item.parentId : undefined,
          createdAtMs: typeof item.createdAtMs === "number" ? item.createdAtMs : undefined,
          updatedAtMs: typeof item.updatedAtMs === "number" ? item.updatedAtMs : undefined,
          durationMs: typeof item.durationMs === "number" ? item.durationMs : undefined,
          truncated: Boolean(item.truncated),
          error: typeof item.error === "string" ? item.error : undefined,
          toolOutput: typeof item.toolOutput === "string" ? item.toolOutput : undefined,
          toolSubject: typeof item.toolSubject === "string" ? item.toolSubject : undefined,
          toolSummary: typeof item.toolSummary === "string" ? item.toolSummary : undefined,
          toolId: typeof item.toolId === "string" ? item.toolId : undefined,
          archived: Boolean(item.archived),
          archiveLoading: Boolean(item.archiveLoading),
          archiveLoaded: Boolean(item.archiveLoaded),
          archiveLoadError: typeof item.archiveLoadError === "string" ? item.archiveLoadError : undefined,
        };
      }));
  }

  // A long file scan can emit hundreds of tool events. Keep user and final
  // responses useful by discarding old transient tool evidence before dialogue.
  function trimTranscriptItems(items: TranscriptItem[]) {
    const next = [...items];
    while (next.length > MAX_TRANSCRIPT_ITEMS) {
      const transientIndex = next.findIndex((item) => item.role === "tool" || item.role === "reasoning");
      next.splice(transientIndex >= 0 ? transientIndex : 0, 1);
    }
    return next;
  }

  function transcriptHasContent(items?: TranscriptItem[]) {
    return Boolean(items?.some((item) => item.role !== "system" && item.id !== "system-welcome" && item.body.trim()));
  }

  function sidebarConversationHasContent(conversation: SidebarConversation) {
    return transcriptHasContent(conversation.transcript);
  }

  function sanitizeSidebarConversation(value: unknown): SidebarConversation | undefined {
    if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") return undefined;
    const scope = value.scope === "project" || value.scope === "global" ? value.scope : undefined;
    const transcript = sanitizeTranscript(value.transcript);
    const title = conversationTitleFromText(value.title);
    const conversation: SidebarConversation = {
      id: value.id,
      title,
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "刚刚",
      updatedAtMs: typeof value.updatedAtMs === "number" ? value.updatedAtMs : latestTranscriptUpdatedAtMs(transcript),
      archivedAtMs: typeof value.archivedAtMs === "number" ? value.archivedAtMs : undefined,
      transcript,
      tabId: typeof value.tabId === "string" ? value.tabId : undefined,
      topicId: typeof value.topicId === "string" ? value.topicId : undefined,
      sessionPath: typeof value.sessionPath === "string" ? value.sessionPath : undefined,
      scope,
      workspaceRoot: typeof value.workspaceRoot === "string" ? value.workspaceRoot : undefined,
    };
    if (/^新对话\s*\d+$/.test(conversation.title) && !sidebarConversationHasContent(conversation)) return undefined;
    return conversation;
  }

  function sanitizeSidebarProject(value: unknown): SidebarProject | undefined {
    if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return undefined;
    const conversations = Array.isArray(value.conversations)
      ? value.conversations.map(sanitizeSidebarConversation).filter((item): item is SidebarConversation => Boolean(item))
      : [];
    return {
      id: value.id,
      name: value.name,
      expanded: Boolean(value.expanded),
      conversations,
      localPath: typeof value.localPath === "string" ? value.localPath : undefined,
      updatedAtMs: typeof value.updatedAtMs === "number" ? value.updatedAtMs : Date.now(),
    };
  }

  function pruneEmptyDraftSidebarConversations() {
    let removedActiveConversation = false;
    sidebarProjects = sidebarProjects.map((project) => {
      const conversations = project.conversations.filter((conversation) => {
        const isEmptyDraft = /^新对话\s*\d+$/.test(conversation.title) && !sidebarConversationHasContent(conversation);
        if (isEmptyDraft && conversation.id === activeSidebarConversationId) removedActiveConversation = true;
        return !isEmptyDraft;
      });
      return conversations.length === project.conversations.length ? project : { ...project, conversations };
    });
    if (removedActiveConversation) activeSidebarConversationId = "";
  }

  function persistSidebarState() {
    if (typeof window === "undefined" || !sidebarStateHydrated) return;
    const snapshot: SidebarStateSnapshot = {
      version: 1,
      projects: sidebarProjects,
      activeProjectId: activeSidebarProjectId,
      activeConversationId: activeSidebarConversationId,
      sort: sidebarProjectSort,
      dockCollapsed: sidebarProjectDockCollapsed,
    };
    try {
      window.localStorage.setItem(SIDEBAR_STATE_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.warn("Failed to persist sidebar conversations", error);
    }
  }

  function restoreSidebarState() {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(SIDEBAR_STATE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.projects)) return;
      const projects = parsed.projects.map(sanitizeSidebarProject).filter((item): item is SidebarProject => Boolean(item));
      if (!projects.length) return;
      sidebarProjects = projects;
      activeSidebarProjectId = typeof parsed.activeProjectId === "string" && projects.some((project) => project.id === parsed.activeProjectId) ? parsed.activeProjectId : projects[0].id;
      const activeProject = projects.find((project) => project.id === activeSidebarProjectId) ?? projects[0];
      activeSidebarConversationId =
        typeof parsed.activeConversationId === "string" && activeProject.conversations.some((conversation) => conversation.id === parsed.activeConversationId)
          ? parsed.activeConversationId
          : activeProject.conversations[0]?.id ?? "";
      sidebarProjectSort = parsed.sort === "name" || parsed.sort === "conversations" ? parsed.sort : "recent";
      sidebarProjectDockCollapsed = Boolean(parsed.dockCollapsed);
    } catch (error) {
      console.warn("Failed to restore sidebar conversations", error);
    }
  }

  function hydrateBrowserPreview() {
    const previewTab: TabMeta = {
      id: "preview-tab",
      scope: "project",
      workspaceRoot: "E:\\workspace\\volt-gui",
      workspaceName: "volt-gui",
      topicId: "preview-topic",
      topicTitle: "Preview conversation",
      active: true,
      running: false,
    };
    tabs = [previewTab];
    models = [{ name: "GPT-4o", label: "GPT-4o", current: true }];
    selectedModel = "GPT-4o";
    commands = [
      { name: "model", kind: "builtin", description: "Select model" },
      { name: "effort", kind: "builtin", description: "Set reasoning effort" },
      { name: "skill", kind: "builtin", description: "Manage skills" },
      { name: "mcp", kind: "builtin", description: "Manage MCP" },
    ];
    applyToolAvailability({
      files: { available: true, reason: "浏览器预览可用" },
      terminal: { available: true, reason: "浏览器预览可用" },
      browser: { available: true, reason: "浏览器预览可用" },
      memory: { available: false, reason: "浏览器预览未连接桌面记忆后端" },
    });
    agentCards = defaultAgentCards;
    needsAuth = false;
    loading = false;
  }

  onMount(() => {
    restoreSidebarState();
    pruneEmptyDraftSidebarConversations();
    sidebarStateHydrated = true;
    const handleNativeMaterialFilePicker = (event: MouseEvent) => {
      const target = event.target;
      if (!hasWailsBindings() || !(target instanceof HTMLInputElement) || target.type !== "file" || target.getAttribute("aria-label") !== "选择资料文件") return;
      event.preventDefault();
      void pickProjectMaterialFile();
    };
    document.addEventListener("click", handleNativeMaterialFilePicker, true);

    if (!hasWailsBindings()) {
      brand = defaultBrand;
      hydrateBrowserPreview();
      const previewTick = window.setInterval(() => {
        nowMs = Date.now();
      }, 1000);
      return () => {
        window.clearInterval(previewTick);
        document.removeEventListener("click", handleNativeMaterialFilePicker, true);
      };
    }

    // Check auth gate first — if [auth] is configured and no valid token exists,
    // show the OIDC login overlay before anything else.
    void refreshBrand();
    withTimeout(app().NeedsAuth(), "auth check timed out", 8_000)
      .then((auth) => {
        needsAuth = auth;
        if (!auth) void refresh();
      })
      .catch(() => {
        needsAuth = false;
        void refresh();
      });

    const tick = window.setInterval(() => {
      nowMs = Date.now();
    }, 1000);
    const unsubscribeEvents = onAgentEvent(handleEvent);
    const unsubscribeReady = onWorkspaceReady(() => void refresh());
    return () => {
      window.clearInterval(tick);
      if (conversationScrollFrame !== undefined) window.cancelAnimationFrame(conversationScrollFrame);
      unsubscribeEvents();
      unsubscribeReady();
      document.removeEventListener("click", handleNativeMaterialFilePicker, true);
    };
  });

  $effect(() => {
    sidebarProjects;
    activeSidebarProjectId;
    activeSidebarConversationId;
    sidebarProjectSort;
    sidebarProjectDockCollapsed;
    persistSidebarState();
  });

  // Debounce batch-appends of streaming text events to avoid re-render storms.
  let pendingTextBuffer = "";
  let pendingTextTabId = "";
  let textFlushScheduled = false;

  function currentTranscriptTabId() {
    if (activityMode === "work" && workLayer === "newTask") return activeConversationTabId;
    if (activityMode === "code" && newTaskConversationActive) return activeConversationTabId || activeTab?.id || "";
    return activeTab?.id || "";
  }

  function shouldDisplayWireEvent(event: WireEvent) {
    if (!event.tabId) return true;
    const targetTabId = currentTranscriptTabId();
    return Boolean(targetTabId) && event.tabId === targetTabId;
  }

  function updateEventTabRunning(event: WireEvent) {
    if (!event.tabId) return;
    if (event.kind === "turn_started") {
      tabs = tabs.map((tab) => (tab.id === event.tabId ? { ...tab, running: true } : tab));
    }
    if (event.kind === "turn_done") {
      tabs = tabs.map((tab) => (tab.id === event.tabId ? { ...tab, running: false } : tab));
    }
  }

  function scrollConversationToBottom(behavior: ScrollBehavior = "smooth") {
    if (typeof window === "undefined") return;
    void tick().then(() => {
      const el = conversationScrollEl;
      if (!el || !showActiveTranscript) return;
      if (conversationScrollFrame !== undefined) window.cancelAnimationFrame(conversationScrollFrame);
      conversationScrollFrame = window.requestAnimationFrame(() => {
        conversationScrollFrame = undefined;
        el.scrollTo({ top: el.scrollHeight, behavior });
      });
    });
  }

  function scheduleTextFlush() {
    if (textFlushScheduled) return;
    textFlushScheduled = true;
    queueMicrotask(() => {
      textFlushScheduled = false;
      if (!pendingTextBuffer) return;
      if (pendingTextTabId && pendingTextTabId !== currentTranscriptTabId()) {
        pendingTextBuffer = "";
        pendingTextTabId = "";
        return;
      }
      updateLastAssistant(pendingTextBuffer);
      pendingTextBuffer = "";
      pendingTextTabId = "";
    });
  }

  function appendTranscript(item: TranscriptItem) {
    transcript.push(item);
    transcript = trimTranscriptItems(transcript);
    saveActiveSidebarConversationTranscript();
    scrollConversationToBottom();
  }

  function removeTranscriptItem(id: string) {
    const next = transcript.filter((item) => item.id !== id);
    if (next.length === transcript.length) return;
    transcript = next;
    saveActiveSidebarConversationTranscript();
    scrollConversationToBottom("auto");
  }

  function updateTranscriptItem(id: string, patch: Partial<TranscriptItem>) {
    const item = transcript.find((entry) => entry.id === id);
    if (!item) return;
    Object.assign(item, patch);
    saveActiveSidebarConversationTranscript();
    scrollConversationToBottom();
  }

  function removeEmptyPendingAssistant() {
    let index = -1;
    for (let i = transcript.length - 1; i >= 0; i -= 1) {
      const item = transcript[i];
      if (item.role === "assistant" && item.pending && !item.body.trim()) {
        index = i;
        break;
      }
    }
    if (index < 0) return;
    transcript.splice(index, 1);
    saveActiveSidebarConversationTranscript();
    scrollConversationToBottom("auto");
  }

  function ensurePendingAssistant() {
    const existing = transcript.some((item) => item.role === "assistant" && item.pending && !item.body.trim());
    if (existing) return;
    appendTranscript({ id: `assistant-pending-${Date.now()}`, role: "assistant", title: "assistant", body: "", pending: true, createdAtMs: Date.now() });
  }

  function cloneTranscriptItems(items: TranscriptItem[]) {
    return items.map((item) => ({ ...item, pending: false }));
  }

  function saveActiveSidebarConversationTranscript(options: { touch?: boolean } = {}) {
    if (!activeSidebarProjectId || !activeSidebarConversationId) return;
    const now = Date.now();
    const touch = options.touch ?? true;
    const snapshot = cloneTranscriptItems(transcript);
    sidebarProjects = sidebarProjects.map((project) => {
      if (project.id !== activeSidebarProjectId) return project;
      const nextConversations = project.conversations.map((conversation) =>
        conversation.id === activeSidebarConversationId
          ? {
              ...conversation,
              ...(touch ? { updatedAt: "刚刚", updatedAtMs: now } : {}),
              transcript: snapshot,
            }
          : conversation,
      );
      return {
        ...project,
        ...(touch ? { updatedAtMs: now } : {}),
        conversations: nextConversations,
      };
    });
  }

  function conversationTitleFromText(text: string) {
    const firstLine = stripComposerContextPrefix(text).split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "新对话";
    return firstLine.length > 20 ? `${firstLine.slice(0, 20)}...` : firstLine;
  }

  function ensureSidebarConversationForSend(text: string) {
    if (activityMode !== "work" || workLayer !== "newTask") return;
    if (activeSidebarConversationId) return;
    const now = Date.now();
    const projectId = activeSidebarProjectId || sidebarProjects[0]?.id || `sidebar-project-${now}`;
    const project = sidebarProjects.find((item) => item.id === projectId);
    const conversation: SidebarConversation = {
      id: `${projectId}-conversation-${now}`,
      title: conversationTitleFromText(text),
      updatedAt: "刚刚",
      updatedAtMs: now,
      transcript: welcomeTranscript(),
    };
    if (project) {
      sidebarProjects = sidebarProjects.map((item) =>
        item.id === projectId
          ? { ...item, expanded: true, updatedAtMs: now, conversations: [conversation, ...item.conversations] }
          : item,
      );
      syncSidebarProjectContext({ ...project, expanded: true, updatedAtMs: now });
    } else {
      const fallbackProject: SidebarProject = { id: projectId, name: "未归档任务", updatedAtMs: now, expanded: true, conversations: [conversation] };
      sidebarProjects = [fallbackProject, ...sidebarProjects];
      syncSidebarProjectContext(fallbackProject);
    }
    activeSidebarConversationId = conversation.id;
  }
  void ensureSidebarConversationForSend;

  function activeSidebarProject(projectId = activeSidebarProjectId) {
    return sidebarProjects.find((item) => item.id === projectId);
  }

  function sidebarConversation(projectId: string, conversationId: string) {
    return activeSidebarProject(projectId)?.conversations.find((item) => item.id === conversationId && !item.archivedAtMs);
  }

  function isPlaceholderWorkspacePath(path: string) {
    const normalized = path.trim().replace(/\//g, "\\").toLowerCase();
    return normalized.startsWith("e:\\workspace\\") || normalized.startsWith("c:\\users\\1\\documents\\");
  }

  function sidebarProjectThreadTarget(project?: SidebarProject) {
    const projectRoot = project?.localPath?.trim() || "";
    const activeRoot = activeTab?.workspaceRoot?.trim() || activeTab?.cwd?.trim() || "";
    const canUseActiveRoot =
      Boolean(activeRoot) &&
      activeTab?.scope === "project" &&
      (!project || project.id === selectedProjectId || project.name === activeTab.workspaceName || projectRoot === activeRoot);
    const workspaceRoot = projectRoot && !isPlaceholderWorkspacePath(projectRoot) ? projectRoot : canUseActiveRoot ? activeRoot : "";
    if (workspaceRoot) return { scope: "project" as const, workspaceRoot };
    return { scope: "global" as const, workspaceRoot: "" };
  }

  function updateSidebarConversationThread(projectId: string, conversationId: string, meta: TabMeta, options: { touch?: boolean } = {}) {
    const now = Date.now();
    const touch = options.touch ?? false;
    sidebarProjects = sidebarProjects.map((project) => {
      if (project.id !== projectId) return project;
      return {
        ...project,
        ...(touch ? { updatedAtMs: now } : {}),
        conversations: project.conversations.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                tabId: meta.id,
                topicId: meta.topicId,
                sessionPath: meta.sessionPath,
                scope: meta.scope,
                workspaceRoot: meta.workspaceRoot,
                ...(touch ? { updatedAt: "刚刚", updatedAtMs: now } : {}),
              }
            : conversation,
        ),
      };
    });
  }

  function clearSidebarConversationThread(projectId: string, conversationId: string) {
    sidebarProjects = sidebarProjects.map((project) => {
      if (project.id !== projectId) return project;
      return {
        ...project,
        conversations: project.conversations.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                tabId: undefined,
                topicId: undefined,
                sessionPath: undefined,
                scope: undefined,
                workspaceRoot: undefined,
              }
            : conversation,
        ),
      };
    });
  }

  function isMissingTabError(error: unknown) {
    const message = formatErrorMessage(error).toLowerCase();
    return message.includes("tab ") && message.includes(" not found");
  }

  async function syncActiveTabMeta(meta: TabMeta) {
    tabs = tabs.map((tab) => ({ ...tab, active: tab.id === meta.id }));
    if (!tabs.some((tab) => tab.id === meta.id)) {
      tabs = [{ ...meta, active: true }, ...tabs.map((tab) => ({ ...tab, active: false }))];
    }
    try {
      tabs = await app().ListTabs();
    } catch {
      // Keep the returned tab meta when the list refresh races with Wails startup.
    }
    try {
      models = await app().ModelsForTab(meta.id);
      selectedModel = modelValue(models.find((model) => model.current)) || modelValue(models[0]);
    } catch {
      // The controller may still be starting; refresh() will hydrate models later.
    }
  }

  async function createBackendConversationThread(project: SidebarProject | undefined, title: string) {
    const target = sidebarProjectThreadTarget(project);
    return withTimeout(
      app().NewConversationThread(target.scope, target.workspaceRoot, title),
      "新对话创建超时，请稍后重试或重启桌面 dev 窗口。",
    );
  }

  const conversationThreadRequests = new Map<string, Promise<TabMeta | undefined>>();

  function conversationThreadKey(projectId: string, conversationId: string) {
    return `${projectId}::${conversationId}`;
  }

  function bindSidebarConversationThread(projectId: string, conversationId: string): Promise<TabMeta | undefined> {
    if (!hasWailsBindings()) return Promise.resolve(activeTab);
    const key = conversationThreadKey(projectId, conversationId);
    const existing = conversationThreadRequests.get(key);
    if (existing) return existing;
    const request = (async () => {
      const project = activeSidebarProject(projectId);
      const conversation = sidebarConversation(projectId, conversationId);
      if (!conversation) return activeTab;
      if (conversation.tabId) {
        try {
          await withTimeout(app().SetActiveTab(conversation.tabId), "切换对话超时，请稍后重试。");
          const current = tabs.find((tab) => tab.id === conversation.tabId) ?? activeTab;
          if (!current) return undefined;
          const meta = { ...current, id: conversation.tabId };
          return tabs.find((tab) => tab.id === conversation.tabId) ?? meta;
        } catch (error) {
          if (!isMissingTabError(error)) throw error;
          clearSidebarConversationThread(projectId, conversationId);
        }
      }
      const meta = await createBackendConversationThread(project, conversation.title);
      updateSidebarConversationThread(projectId, conversationId, meta);
      return meta;
    })()
      .catch((error) => {
        appendTranscript({ id: `notice-${Date.now()}`, role: "notice", title: "新对话失败", body: formatErrorMessage(error) });
        return undefined;
      })
      .finally(() => conversationThreadRequests.delete(key));
    conversationThreadRequests.set(key, request);
    return request;
  }

  async function ensureConversationThreadForSend(text: string): Promise<TabMeta | undefined> {
    if (activityMode !== "work" || workLayer !== "newTask") return activeTab;
    const now = Date.now();
    const projectId = activeSidebarProjectId || sidebarProjects[0]?.id || `sidebar-project-${now}`;
    let project = activeSidebarProject(projectId);
    let conversation = activeSidebarConversationId ? sidebarConversation(projectId, activeSidebarConversationId) : undefined;
    let createdConversation = false;
    if (!conversation) {
      conversation = {
        id: `${projectId}-conversation-${now}`,
        title: conversationTitleFromText(text),
        updatedAt: "刚刚",
        updatedAtMs: now,
        transcript: welcomeTranscript(),
      };
      createdConversation = true;
      if (project) {
        sidebarProjects = sidebarProjects.map((item) =>
          item.id === projectId
            ? { ...item, expanded: true, updatedAtMs: now, conversations: [conversation!, ...item.conversations] }
            : item,
        );
        project = { ...project, expanded: true, updatedAtMs: now };
        syncSidebarProjectContext(project);
      } else {
        project = { id: projectId, name: "未归档任务", updatedAtMs: now, expanded: true, conversations: [conversation] };
        sidebarProjects = [project, ...sidebarProjects];
        syncSidebarProjectContext(project);
      }
      activeSidebarConversationId = conversation.id;
    }
    renameConversationForFirstMessage(projectId, conversation.id, text);
    if (createdConversation) {
      const draftThread = draftConversationThread ?? (draftConversationThreadRequest ? await draftConversationThreadRequest : undefined);
      draftConversationThread = undefined;
      draftConversationThreadRequest = undefined;
      if (draftThread) {
        updateSidebarConversationThread(projectId, conversation.id, draftThread);
        activeConversationTabId = draftThread.id;
        await syncActiveTabMeta(draftThread);
        return draftThread;
      }
    }
    const meta = await bindSidebarConversationThread(projectId, conversation.id);
    if (meta) {
      activeConversationTabId = meta.id;
      await syncActiveTabMeta(meta);
    }
    return meta;
  }

  function clearConversationRuntime() {
    pendingTextBuffer = "";
    pendingTextTabId = "";
    sending = false;
    pendingApproval = undefined;
    pendingAsk = undefined;
    submittedDraft = undefined;
    restoreDraftOnTurnDone = false;
    draftConversationThread = undefined;
    draftConversationThreadRequest = undefined;
    draftConversationToken += 1;
  }

  function openWorkLayer(layer: WorkLayer) {
    activityMode = "work";
    workLayer = layer;
    lastWorkLayer = layer;
    if (layer === "newTask") newTaskConversationActive = false;
    codeInspectorOpen = false;
    sidebarCollapsed = false;
    userMenuOpen = false;
    agentSelectorOpen = false;
    if (layer === "settings" || layer === "models") void ensureSettingsLoaded();
  }

  function openWorkWorkspace() {
    openWorkLayer(lastWorkLayer || "today");
  }

  function rememberWorkLayerBeforeCode() {
    if (activityMode !== "work") return;
    lastWorkLayer = workLayer;
  }
  function openResourceCenterFromComposer() {
    openWorkLayer("resources");
    resourceTab = "resources";
  }
  function openCodeConversation() {
    rememberWorkLayerBeforeCode();
    activityMode = "code";
    workLayer = "newTask";
    newTaskConversationActive = true;
    codeWorkbenchPanel = "overview";
    codeInspectorOpen = false;
    sidebarCollapsed = false;
    userMenuOpen = false;
  }

  function openCodeWorkbench(panel: CodeWorkbenchPanel = "overview") {
    rememberWorkLayerBeforeCode();
    activityMode = "code";
    workLayer = "newTask";
    newTaskConversationActive = false;
    codeWorkbenchPanel = panel;
    codeInspectorOpen = false;
    sidebarCollapsed = false;
    userMenuOpen = false;
    void tick().then(() => {
      if (hasWailsBindings()) void refreshCodeDock();
    });
  }

  function openCodeWorkbenchAction(action: CodeWorkbenchAction) {
    if (action === "models") {
      rememberWorkLayerBeforeCode();
      activityMode = "code";
      workLayer = "newTask";
      newTaskConversationActive = false;
      codeWorkbenchPanel = "overview";
      settingsPanel = "models";
      userPanelDialog = "settings";
      userMenuOpen = false;
      void ensureSettingsLoaded();
      return;
    }
    if (action === "settings") {
      rememberWorkLayerBeforeCode();
      settingsPanel = "runtime";
      userPanelDialog = "settings";
      userMenuOpen = false;
      activityMode = "code";
      workLayer = "newTask";
      newTaskConversationActive = false;
      codeWorkbenchPanel = "overview";
      void ensureSettingsLoaded();
      return;
    }
    if (action === "conversation") {
      openCodeConversation();
      void tick().then(focusComposer);
      return;
    }
    if (action === "overview") openCodeWorkbench("overview");
    if (action === "workspace") openCodeWorkbench("workspace");
    if (action === "context") openCodeWorkbench("context");
    if (action === "changes") openCodeWorkbench("changes");
    if (action === "checkpoints") openCodeWorkbench("checkpoints");
    if (action === "workspace") showWorkbenchNotice("已切到 Code 工作台的 Workspace，可查看文件树、预览和当前工作区。");
    if (action === "context") showWorkbenchNotice("已切到 Code 工作台的上下文窗口，可查看 token、缓存和读写文件。");
    if (action === "changes") showWorkbenchNotice("已切到 Code 工作台的变更审查，可查看 diff、文件预览和回滚范围。");
    if (action === "checkpoints") showWorkbenchNotice("已切到 Code 工作台的检查点视图，可按会话或代码范围回退。");
  }

  function isCodeWorkspaceActionActive(action: CodeWorkbenchAction) {
    if (activityMode !== "code") return false;
    if (action === "conversation") return newTaskConversationActive;
    if (action === "overview") return !newTaskConversationActive && codeWorkbenchPanel === "overview";
    if (action === "workspace") return !newTaskConversationActive && codeWorkbenchPanel === "workspace";
    if (action === "context") return !newTaskConversationActive && codeWorkbenchPanel === "context";
    if (action === "changes") return !newTaskConversationActive && codeWorkbenchPanel === "changes";
    if (action === "checkpoints") return !newTaskConversationActive && codeWorkbenchPanel === "checkpoints";
    if (action === "models") return userPanelDialog === "settings" && settingsPanel === "models";
    if (action === "settings") return userPanelDialog === "settings" && settingsPanel === "runtime";
    return false;
  }

  function openWorkspaceNavLayer(layer: WorkLayer) {
    if (layer === "newTask") {
      startNewConversation();
      return;
    }
    openWorkLayer(layer);
  }
  function isWorkspaceNavItemActive(item: WorkspaceNavItem) {
    if (activityMode !== "work" || workLayer !== item.layer) return false;
    return !item.resourceTab || resourceTab === item.resourceTab;
  }
  function openWorkspaceNavItem(item: WorkspaceNavItem) {
    if (item.resourceTab) resourceTab = item.resourceTab;
    openWorkspaceNavLayer(item.layer);
    if (item.resourceTab === "knowledge") void refreshKnowledgeBase();
    if (item.resourceTab === "search") void runWorkbenchSearch(resourceSearch);
  }
  function openUserPanelDialog(layer: UserPanelDialog) {
    userMenuOpen = false;
    if (layer === "models") {
      openWorkLayer("models");
      return;
    }
    if (layer === "settings") {
      settingsPanel = "general";
      void ensureSettingsLoaded();
    }
    userPanelDialog = layer;
  }
  function userPanelDialogTitle() {
    if (userPanelDialog === "models") return "模型管理";
    if (userPanelDialog === "settings") return "系统设置";
    if (userPanelDialog === "sync") return "同步中心";
    if (userPanelDialog === "operationLog") return "操作记录";
    return "我的";
  }
  function userPanelDialogIntro() {
    if (userPanelDialog === "models") return "对标 AORISTLAWER 模型管理：集中查看模型状态、供应商和默认用途。";
    if (userPanelDialog === "settings") return "管理桌面语言、外观、权限沙箱和模型配置入口。";
    if (userPanelDialog === "sync") return "展示本地同步记录；跨设备同步、远程推送和统一账号连接标注为开发中。";
    if (userPanelDialog === "operationLog") return "对标 AORISTLAWER 操作记录：保留关键动作、对象、用户和结果。";
    return "用户中心弹窗。";
  }
  function focusNewTask(projectId = activeSidebarProjectId, conversationId = "") {
    saveActiveSidebarConversationTranscript({ touch: false });
    const project = projectId ? activeSidebarProject(projectId) : undefined;
    if (project) syncSidebarProjectContext(project);
    activityMode = "work";
    workLayer = "newTask";
    newTaskConversationActive = false;
    codeInspectorOpen = false;
    sidebarCollapsed = false;
    userMenuOpen = false;
    agentSelectorOpen = false;
    configDialog = undefined;
    projectDetailOpen = false;
    customerDetailOpen = false;
    capabilityCreateOpen = false;
    agentWizardOpen = false;
    agentMarketOpen = false;
    activeSidebarConversationId = conversationId;
    activeConversationTabId = "";
    clearConversationRuntime();
    transcript = welcomeTranscript();
    input = "";
    void tick().then(focusComposer);
  }
  function syncSidebarProjectContext(project: SidebarProject) {
    activeSidebarProjectId = project.id;
    const linked = projectCards.find((item) => item.id === project.id || item.name === project.name);
    selectedProjectId = linked?.id ?? "";
    linkedProject = linked?.name ?? project.name;
  }
  function sidebarProjectSortLabel() {
    if (sidebarProjectSort === "name") return "名称";
    if (sidebarProjectSort === "conversations") return "对话";
    return "最近";
  }
  function isWorkspaceSectionCollapsed(title: string) {
    return collapsedWorkspaceSections.includes(title);
  }
  function toggleWorkspaceSection(title: string) {
    if (!collapsibleWorkspaceSections.has(title)) return;
    collapsedWorkspaceSections = isWorkspaceSectionCollapsed(title)
      ? collapsedWorkspaceSections.filter((item) => item !== title)
      : [...collapsedWorkspaceSections, title];
  }
  function cycleSidebarProjectSort() {
    sidebarProjectSort = sidebarProjectSort === "recent" ? "name" : sidebarProjectSort === "name" ? "conversations" : "recent";
  }
  function pathBasename(path: string) {
    const trimmed = path.trim().replace(/[\\/]+$/, "");
    return trimmed.split(/[\\/]/).filter(Boolean).pop() || trimmed || "新项目";
  }
  function addSidebarProjectFromPath(path: string, fallbackName = "") {
    const cleanPath = path.trim();
    const name = fallbackName.trim() || pathBasename(cleanPath);
    if (!name) return;
    const existing = sidebarProjects.find((item) => item.localPath === cleanPath || item.name === name);
    const now = Date.now();
    if (existing) {
      sidebarProjects = sidebarProjects.map((item) => item.id === existing.id ? { ...item, expanded: true, localPath: item.localPath || cleanPath, updatedAtMs: now } : item);
      sidebarProjectDockCollapsed = false;
      activeSidebarConversationId = "";
      syncSidebarProjectContext({ ...existing, expanded: true, localPath: existing.localPath || cleanPath, updatedAtMs: now });
      return;
    }
    const id = `sidebar-project-${now}`;
    const project: SidebarProject = { id, name, localPath: cleanPath || name, updatedAtMs: now, expanded: true, conversations: [] };
    sidebarProjects = [project, ...sidebarProjects];
    sidebarProjectDockCollapsed = false;
    sidebarProjectCreateOpen = false;
    sidebarProjectDraft = "";
    activeSidebarConversationId = "";
    syncSidebarProjectContext(project);
  }
  function handleSidebarProjectFolderInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const firstFile = input.files?.[0] as (File & { path?: string; webkitRelativePath?: string }) | undefined;
    if (!firstFile) return;
    const relativePath = firstFile.webkitRelativePath || firstFile.name;
    const rootName = relativePath.split("/").filter(Boolean)[0] || firstFile.name;
    addSidebarProjectFromPath(firstFile.path || rootName, rootName);
    input.value = "";
  }
  async function chooseSidebarProjectFolder() {
    if (hasWailsBindings()) {
      try {
        const picked = await app().PickWorkspace();
        if (picked) {
          addSidebarProjectFromPath(picked);
          await refresh();
          return;
        }
      } catch {
        // Browser preview falls back to the hidden directory input below.
      }
    }
    if (sidebarProjectFolderInput) {
      sidebarProjectFolderInput.setAttribute("webkitdirectory", "");
      sidebarProjectFolderInput.setAttribute("directory", "");
      sidebarProjectFolderInput.click();
      return;
    }
    sidebarProjectCreateOpen = true;
  }
  function openSidebarProject(projectId: string) {
    const project = sidebarProjects.find((item) => item.id === projectId);
    if (!project) return;
    const conversation = sidebarProjectConversations(project)[0];
    if (conversation) {
      openSidebarConversation(projectId, conversation.id);
      return;
    }
    syncSidebarProjectContext(project);
    sidebarProjects = sidebarProjects.map((item) => item.id === projectId ? { ...item, expanded: true } : item);
    focusNewTask();
    input = `项目：${project.name}\n`;
    void tick().then(focusComposer);
  }
  function toggleSidebarProject(projectId: string) {
    const project = sidebarProjects.find((item) => item.id === projectId);
    if (!project) return;
    syncSidebarProjectContext(project);
    sidebarProjects = sidebarProjects.map((item) => item.id === projectId ? { ...item, expanded: !item.expanded } : item);
  }
  function createSidebarProject() {
    const name = sidebarProjectDraft.trim();
    if (!name) return;
    const now = Date.now();
    const id = `sidebar-project-${now}`;
    const project: SidebarProject = { id, name, updatedAtMs: now, expanded: true, conversations: [] };
    sidebarProjects = [project, ...sidebarProjects];
    sidebarProjectDraft = "";
    sidebarProjectCreateOpen = false;
    sidebarProjectDockCollapsed = false;
    activeSidebarConversationId = "";
    syncSidebarProjectContext(project);
  }
  function startRenameSidebarProjectTask(project: SidebarProject) {
    editingSidebarProjectId = project.id;
    sidebarProjectRenameDraft = project.name;
    void tick().then(() => {
      sidebarProjectRenameInput?.focus();
      sidebarProjectRenameInput?.select();
    });
  }
  function cancelRenameSidebarProjectTask() {
    editingSidebarProjectId = "";
    sidebarProjectRenameDraft = "";
  }
  function saveSidebarProjectTaskName(projectId: string) {
    const name = sidebarProjectRenameDraft.trim();
    if (!name) {
      cancelRenameSidebarProjectTask();
      return;
    }
    const now = Date.now();
    sidebarProjects = sidebarProjects.map((item) => item.id === projectId ? { ...item, name, updatedAtMs: now } : item);
    if (activeSidebarProjectId === projectId) linkedProject = name;
    cancelRenameSidebarProjectTask();
  }

  function renameConversationForFirstMessage(projectId: string, conversationId: string, text: string) {
    const title = conversationTitleFromText(text);
    const now = Date.now();
    sidebarProjects = sidebarProjects.map((project) => {
      if (project.id !== projectId) return project;
      return {
        ...project,
        updatedAtMs: now,
        conversations: project.conversations.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;
          const isDefaultTitle = /^新对话\s+\d+$/.test(conversation.title);
          return isDefaultTitle ? { ...conversation, title, updatedAt: "刚刚", updatedAtMs: now } : { ...conversation, updatedAt: "刚刚", updatedAtMs: now };
        }),
      };
    });
  }

  function openSidebarConversation(projectId: string, conversationId: string) {
    saveActiveSidebarConversationTranscript({ touch: false });
    const project = sidebarProjects.find((item) => item.id === projectId);
    if (!project) return;
    const conversation = project.conversations.find((item) => item.id === conversationId && !item.archivedAtMs);
    syncSidebarProjectContext(project);
    activeSidebarConversationId = conversationId;
    activeConversationTabId = conversation?.tabId ?? "";
    activityMode = "work";
    workLayer = "newTask";
    newTaskConversationActive = true;
    codeInspectorOpen = false;
    sidebarCollapsed = false;
    userMenuOpen = false;
    agentSelectorOpen = false;
    configDialog = undefined;
    projectDetailOpen = false;
    customerDetailOpen = false;
    capabilityCreateOpen = false;
    agentWizardOpen = false;
    agentMarketOpen = false;
    clearConversationRuntime();
    transcript = conversation?.transcript?.length ? cloneTranscriptItems(conversation.transcript) : welcomeTranscript();
    if (conversation) {
      void bindSidebarConversationThread(projectId, conversation.id).then(async (meta) => {
        if (!meta) return;
        if (activeSidebarProjectId !== projectId || activeSidebarConversationId !== conversation.id) return;
        if (activityMode !== "work" || workLayer !== "newTask") return;
        activeConversationTabId = meta.id;
        await syncActiveTabMeta(meta);
        await hydrateHistory(meta, { preserveLocalWhenEmpty: true });
        newTaskConversationActive = true;
      });
    }
    input = "";
    void tick().then(focusComposer);
  }
  function sidebarProjectConversations(project: SidebarProject) {
    return project.conversations.filter((conversation) => !conversation.archivedAtMs);
  }
  function archivedSidebarProjectConversations(project: SidebarProject) {
    return project.conversations.filter((conversation) => conversation.archivedAtMs);
  }
  function clearActiveSidebarConversation(conversationId: string) {
    if (activeSidebarConversationId === conversationId) activeSidebarConversationId = "";
  }
  function archiveSidebarConversation(projectId: string, conversationId: string) {
    const now = Date.now();
    clearActiveSidebarConversation(conversationId);
    sidebarProjects = sidebarProjects.map((project) => project.id === projectId
      ? { ...project, updatedAtMs: now, conversations: project.conversations.map((conversation) => conversation.id === conversationId ? { ...conversation, archivedAtMs: now, updatedAt: "已归档", updatedAtMs: now } : conversation) }
      : project);
  }
  function deleteSidebarConversation(projectId: string, conversationId: string) {
    const now = Date.now();
    clearActiveSidebarConversation(conversationId);
    sidebarProjects = sidebarProjects.map((project) => project.id === projectId
      ? { ...project, updatedAtMs: now, conversations: project.conversations.filter((conversation) => conversation.id !== conversationId) }
      : project);
  }
  function createSidebarConversation(projectId: string) {
    pruneEmptyDraftSidebarConversations();
    const project = sidebarProjects.find((item) => item.id === projectId);
    if (!project) return;
    focusNewTask(project.id);
  }
  function startNewConversation(projectId = activeSidebarProjectId || sidebarProjects[0]?.id || "") {
    pruneEmptyDraftSidebarConversations();
    const project = projectId ? activeSidebarProject(projectId) : undefined;
    focusNewTask(project?.id ?? projectId);
    if (!hasWailsBindings()) return;
    const token = draftConversationToken + 1;
    draftConversationToken = token;
    draftConversationThreadRequest = createBackendConversationThread(project, "新的会话")
      .then(async (meta) => {
        if (token !== draftConversationToken) return undefined;
        draftConversationThread = meta;
        activeConversationTabId = meta.id;
        await syncActiveTabMeta(meta);
        return meta;
      })
      .catch((error) => {
        appendTranscript({ id: `notice-${Date.now()}`, role: "notice", title: "新对话失败", body: formatErrorMessage(error) });
        return undefined;
      });
  }

  async function openUnifiedCodeTask() {
    openCodeWorkbench("overview");
    await tick();
    if (hasWailsBindings()) await refreshCodeDock();
  }
  function selectedProject() { return projectCards.find((project) => project.id === selectedProjectId) ?? projectCards[0]; }
  function projectMaterials(project = selectedProject()) { return projectMaterialRows.filter((item) => item.projectId === project.id); }
  function projectSchedules(project = selectedProject()) {
    const persisted = calendarEvents
      .filter((item) => item.projectId === project.id)
      .map((item) => ({ projectId: project.id, title: item.title, date: item.day, time: item.time, place: item.place, state: item.status || item.type, desc: item.desc || item.type }));
    return persisted.length ? persisted : projectScheduleRows.filter((item) => item.projectId === project.id);
  }
  function projectReports(project = selectedProject()) {
    const persisted = reportCards
      .filter((item) => !item.projectId || item.projectId === project.id)
      .map((item) => ({ projectId: project.id, title: item.title, type: item.kind || "分析报告", status: item.status, owner: item.owner, updatedAt: item.updatedAt || "刚刚", summary: item.desc }));
    return persisted.length ? persisted : projectReportRows.filter((item) => item.projectId === project.id);
  }
  function selectedReport() { return reportCards.find((report) => report.id === selectedReportId) ?? reportCards[0]; }
  function reportProject(report = selectedReport()) { return report ? projectCards.find((project) => project.id === report.projectId) : undefined; }
  function reportCustomer(report = selectedReport()) { return report ? customerCards.find((customer) => customer.id === report.customerId) : undefined; }
  function reportUpdatedAt(report = selectedReport()) { return report?.updatedAt || report?.createdAt || "??"; }
  function reportDueAt(report = selectedReport()) { return report?.dueAt?.trim() ? report.dueAt.replace("T", " ") : "未设置"; }
  function reportBodyLines(report = selectedReport()) {
    const body = report?.body?.trim() || report?.desc?.trim();
    return body ? body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : ["暂无报告正文。"];
  }
  function openReportEditor(report = selectedReport()) {
    if (!report) return;
    reportDraftId = report.id;
    reportDraftTitle = report.title || "";
    reportDraftKind = report.kind || "项目风险报告";
    reportDraftStatus = report.status || "草稿";
    reportDraftProjectId = report.projectId || "";
    reportDraftCustomerId = report.customerId || "";
    reportDraftOwner = report.owner || agentCards.find((agent) => agent.id === selectedAgentId)?.name || "自动化 Agent";
    reportDraftSource = report.source || "工作台数据";
    reportDraftFormat = report.format || "Markdown";
    reportDraftPriority = report.priority || "中";
    reportDraftDueAt = report.dueAt || "";
    reportDraftDesc = report.desc || "";
    reportDraftBody = report.body || "";
    configDialog = "report";
  }
  async function exportReport(report = selectedReport()) {
    if (!report) return;
    const exportReportBinding = workbenchDataPersistenceBindings()?.ExportWorkbenchReport;
    if (typeof exportReportBinding !== "function") {
      showWorkbenchNotice("当前环境未连接单篇报告导出接口。");
      return;
    }
    try {
      const path = await exportReportBinding(report.id);
      await refreshWorkbenchData();
      showWorkbenchNotice(`已导出报告：${path}`);
    } catch (error) {
      console.error("Failed to export report", error);
      showWorkbenchNotice("导出报告失败，请稍后重试。");
    }
  }
  async function deleteReport(report = selectedReport()) {
    if (!report) return;
    if (!window.confirm(`确认删除报告“${report.title}”？`)) return;
    const deleteReportBinding = workbenchDataPersistenceBindings()?.DeleteWorkbenchReport;
    try {
      if (typeof deleteReportBinding === "function") {
        await deleteReportBinding(report.id);
      }
      reportCards = reportCards.filter((item) => item.id !== report.id);
      selectedReportId = reportCards[0]?.id ?? "";
      if (typeof deleteReportBinding === "function") await refreshWorkbenchData();
      showWorkbenchNotice(`已删除报告：${report.title}`);
    } catch (error) {
      console.error("Failed to delete report", error);
      showWorkbenchNotice("删除报告失败，请稍后重试。");
    }
  }
  function selectedArtifactStyle() {
    return artifactStyleOptions.find((style) => style.id === selectedArtifactStyleId) ?? artifactStyleOptions[0];
  }
  function artifactKindLabel(report = selectedReport()) {
    const text = [report?.kind, report?.format, report?.title].filter(Boolean).join(" ").toLowerCase();
    if (/ppt|deck|slide|演示|幻灯/.test(text)) return "Deck Slides";
    if (/poster|海报|长图/.test(text)) return "Poster Variant";
    if (/video|storyboard|scene|视频|分镜/.test(text)) return "Storyboard";
    return "Review Artifact";
  }
  function artifactStageLabel() {
    return artifactReviewStages.find((stage) => stage.id === selectedArtifactStage)?.label ?? "设计";
  }
  function setArtifactStage(stageId: ArtifactReviewStageId) {
    selectedArtifactStage = stageId;
    if (stageId !== "export") return;
    if (!artifactStyleApproved) showWorkbenchNotice("样式门禁未通过，导出阶段仍需人工批准。");
  }
  function updateArtifactZoom(delta: number) {
    artifactCanvasZoom = Math.min(160, Math.max(60, artifactCanvasZoom + delta));
  }
  function fitArtifactCanvas() {
    artifactCanvasZoom = 92;
    artifactCanvasPanX = 0;
    artifactCanvasPanY = 0;
  }
  function centerArtifactCanvas() {
    artifactCanvasPanX = 0;
    artifactCanvasPanY = 0;
  }
  function resetArtifactCanvas() {
    artifactCanvasMode = "select";
    artifactCanvasZoom = 96;
    artifactCanvasPanX = 0;
    artifactCanvasPanY = 0;
  }
  function panArtifactCanvas(dx: number, dy: number) {
    artifactCanvasMode = "pan";
    artifactCanvasPanX = Math.max(-96, Math.min(96, artifactCanvasPanX + dx));
    artifactCanvasPanY = Math.max(-72, Math.min(72, artifactCanvasPanY + dy));
  }
  function approveArtifactStyle() {
    artifactStyleApproved = true;
    selectedArtifactStage = "design";
    showWorkbenchNotice(`已批准样式：${selectedArtifactStyle().name}`);
  }
  function returnArtifactToDraft() {
    artifactStyleApproved = false;
    selectedArtifactStage = "draft";
    showWorkbenchNotice("已退回草稿阶段，保留当前产物坐标与审查意见。");
  }
  function artifactExportState() {
    if (!artifactStyleApproved) return "样式待批准";
    if (selectedArtifactStage !== "export") return "等待导出阶段";
    return "可导出";
  }
  function projectTodos(project = selectedProject()) { return [...todoProjectRows(project.id), ...projectTodoRows.filter((item) => item.projectId === project.id)]; }
  function selectedCustomer() { return customerCards.find((customer) => customer.id === selectedCustomerId) ?? customerCards[0]; }
  function customerProjectIdSet(customer = selectedCustomer()) {
    return new Set([...(customer?.projectIds ?? []), ...projectCards.filter((project) => project.client === customer?.name).map((project) => project.id)].filter(Boolean));
  }
  function customerProjects(customer = selectedCustomer()) {
    const projectIds = customerProjectIdSet(customer);
    return projectCards.filter((project) => projectIds.has(project.id));
  }
  function customerMaterials(customer = selectedCustomer()) {
    const projectIds = customerProjectIdSet(customer);
    return projectMaterialRows.filter((material) => projectIds.has(material.projectId));
  }
  function customerSchedules(customer = selectedCustomer()) {
    const projectIds = customerProjectIdSet(customer);
    return calendarEvents
      .filter((event) => event.customerId === customer.id || (event.projectId ? projectIds.has(event.projectId) : false))
      .map((event) => ({
        id: event.id,
        title: event.title,
        date: calendarEventFullDate(event) || event.date || event.day,
        time: event.time,
        place: event.place,
        state: event.status || event.type,
        desc: event.desc || `${event.type || "日程"} / ${event.place || "未设置地点"}`,
        event,
      }));
  }
  function customerTodos(customer = selectedCustomer()) {
    const projectIds = customerProjectIdSet(customer);
    const rows = todoItems
      .filter((todo) => todo.customerId === customer.id || (todo.projectId ? projectIds.has(todo.projectId) : false))
      .map((todo) => ({
        id: todo.id,
        customerId: customer.id,
        title: todo.title,
        due: todoDue(todo),
        priority: todo.priority,
        state: todoStatusLabel(todo.status),
        desc: todoDescription(todo),
        todo,
      }));
    return rows.filter((row, index, list) => list.findIndex((item) => item.id === row.id) === index);
  }
  function selectedAgent() { return agentCards.find((agent) => agent.id === selectedAgentId) ?? agentCards[0]; }
  function selectedTeamRoom() { return teamRooms.find((team) => team.title === selectedTeamTitle) ?? teamRooms[0]; }
  function teamMembers(team = selectedTeamRoom()) { return (team?.memberIds ?? []).map((id) => agentCards.find((agent) => agent.id === id)).filter(Boolean) as typeof agentCards; }
  function teamLeaderId(team = selectedTeamRoom()) { return team?.leaderId || team?.memberIds?.[0] || ""; }
  function teamLeader(team = selectedTeamRoom()) { return agentCards.find((agent) => agent.id === teamLeaderId(team)) ?? teamMembers(team)[0]; }
  function selectedTeamChatMessages() { return teamChatMessages.filter((message) => message.teamId === selectedTeamRoom()?.id); }
  function selectedTeamBuilderMembers() { return teamBuilderMemberIds.map((id) => agentCards.find((agent) => agent.id === id)).filter(Boolean) as typeof agentCards; }
  function activeTeamRun(team = selectedTeamRoom()) {
    return [...teamRuns].reverse().find((run) => run.teamId === team?.id);
  }
  function teamRunStatusLabel(status?: TeamRunStatus) {
    if (status === "draft") return "草稿";
    if (status === "running") return "运行中";
    if (status === "paused") return "已暂停";
    if (status === "stopped") return "已终止";
    if (status === "completed") return "已完成";
    return "未创建";
  }
  function teamRunControlList(team = selectedTeamRoom()) {
    const run = activeTeamRun(team);
    if (!run) return ["创建运行"];
    if (run.status === "draft") return ["启动", "终止", "重新分配"];
    if (run.status === "running") {
      const reservedControls = team.controls.filter((control) => !["暂停", "继续", "终止", "重新分配"].includes(control));
      return ["暂停", "终止", "重新分配", ...reservedControls, "完成"];
    }
    if (run.status === "paused") return ["继续", "终止", "重新分配"];
    return ["查看结果"];
  }
  function teamRunArtifacts(team = selectedTeamRoom()) {
    const run = activeTeamRun(team);
    if (run) return run.artifacts;
    return (team?.artifacts ?? []).map((title) => ({ id: title, title, type: "预留产物", status: "待生成" }));
  }
  function teamRunEvents(team = selectedTeamRoom()) {
    return activeTeamRun(team)?.events ?? [];
  }
  function addTeamRunEvent(runId: string, actor: string, type: string, detail: string) {
    const event: TeamRunEvent = { id: `${runId}-${Date.now()}`, time: "刚刚", actor, type, detail };
    teamRuns = teamRuns.map((run) => run.id === runId ? { ...run, updatedAt: "刚刚", events: [...run.events, event] } : run);
  }
  async function persistTeamRun(run: WorkbenchTeamRun) {
    const saveRun = workbenchDataPersistenceBindings()?.SaveTeamRun;
    if (typeof saveRun !== "function") return run;
    return await saveRun(run);
  }
  async function persistTeamRoom(room: WorkbenchTeamRoom) {
    const saveRoom = workbenchDataPersistenceBindings()?.SaveTeamRoom;
    if (typeof saveRoom !== "function") return room;
    return await saveRoom(room);
  }
  async function applyTeamRunControl(control: string, team = selectedTeamRoom()) {
    if (!team) return;
    const run = activeTeamRun(team);
    if (!run) {
      if (control === "创建运行") openTeamChat(team.title);
      return;
    }
    const leaderName = teamLeader(team)?.name ?? "协调者";
    const currentIndex = Math.max(0, team.steps.findIndex((step) => step.id === run.currentStepId));
    const nextStep = team.steps[Math.min(currentIndex + 1, team.steps.length - 1)];
    let nextStatus: TeamRunStatus = run.status;
    let runState = team.runState;
    let nextCheckpoint = team.nextCheckpoint;
    let outcome = team.outcome;
    let eventType = control;
    let eventDetail = "";
    let nextCurrentStepId = run.currentStepId;

    if (control === "启动" || control === "继续") {
      nextStatus = "running";
      runState = "运行中";
      nextCheckpoint = "等待成员输出或人工确认";
      outcome = "运行中";
      eventDetail = control === "启动" ? "运行草稿已启动，开始按节点推进。" : "暂停的运行已继续。";
    } else if (control === "暂停") {
      nextStatus = "paused";
      runState = "已暂停";
      nextCheckpoint = "继续、重新分配或终止";
      outcome = "等待人工处理";
      eventDetail = "运行已暂停，后续节点不会继续推进。";
    } else if (control === "终止") {
      nextStatus = "stopped";
      runState = "已终止";
      nextCheckpoint = "查看已有结果或重新创建运行";
      outcome = "已终止";
      eventDetail = "运行已终止，未完成节点标记为跳过。";
    } else if (control === "重新分配") {
      nextStatus = run.status === "paused" ? "paused" : "running";
      runState = nextStatus === "paused" ? "已暂停" : "运行中";
      nextCheckpoint = `已重新分配给 ${nextStep.owner}`;
      nextCurrentStepId = nextStep.id;
      outcome = "重新分配中";
      eventDetail = `当前节点已重新分配给 ${nextStep.owner}。`;
    } else if (control === "批准高风险工具") {
      nextStatus = "running";
      runState = "等待工具结果";
      nextCheckpoint = "等待工具结果回写";
      outcome = "人工已批准";
      eventDetail = "高风险工具调用已人工批准，等待执行结果回写。";
    } else if (control === "完成") {
      nextStatus = "completed";
      runState = "已完成";
      nextCheckpoint = "归档报告、待办或资料";
      outcome = "已生成可沉淀结果";
      eventDetail = "运行已完成，可以沉淀报告、待办和资料记录。";
    } else if (control === "查看结果") {
      showWorkbenchNotice(`${team.title} 当前结果：${run.artifacts.map((item) => `${item.title}(${item.status})`).join("、")}`);
      return;
    }

    const nextRun = { ...run, status: nextStatus, updatedAt: "刚刚", currentStepId: nextCurrentStepId };
    teamRuns = teamRuns.map((item) => item.id === run.id ? nextRun : item);
    let nextRoom: WorkbenchTeamRoom | undefined;
    teamRooms = teamRooms.map((item) => item.id === team.id ? {
      ...item,
      status: teamRunStatusLabel(nextStatus),
      active: nextStatus === "running" ? "运行中" : teamRunStatusLabel(nextStatus),
      runState,
      nextCheckpoint,
      outcome,
      steps: item.steps.map((step) => {
        if (nextStatus === "stopped" && step.status !== "已完成") return { ...step, status: "已跳过" };
        if (step.id === nextCurrentStepId) return { ...step, status: nextStatus === "paused" ? "已暂停" : nextStatus === "completed" ? "已完成" : "执行中" };
        return step;
      }),
    } : item);
    nextRoom = teamRooms.find((item) => item.id === team.id);
    addTeamRunEvent(run.id, leaderName, eventType, eventDetail);
    try {
      const latestRun = teamRuns.find((item) => item.id === run.id) ?? nextRun;
      await persistTeamRun(latestRun);
      if (nextRoom) await persistTeamRoom(nextRoom);
      await refreshWorkbenchData();
    } catch (error) {
      console.error("Failed to persist team run control", error);
    }
    showWorkbenchNotice(`${team.title}：${eventDetail}`);
  }
  async function archiveTeamRunArtifact(artifactId: string, team = selectedTeamRoom()) {
    const run = activeTeamRun(team);
    if (!run) return;
    teamRuns = teamRuns.map((item) => item.id === run.id ? {
      ...item,
      artifacts: item.artifacts.map((artifact) => artifact.id === artifactId ? { ...artifact, status: "已归档" } : artifact),
    } : item);
    const artifact = run.artifacts.find((item) => item.id === artifactId);
    addTeamRunEvent(run.id, "工作台", "归档", `${artifact?.title ?? "运行产物"}已沉淀到工作台。`);
    try {
      const latestRun = teamRuns.find((item) => item.id === run.id);
      if (latestRun) {
        await persistTeamRun(latestRun);
        await refreshWorkbenchData();
      }
    } catch (error) {
      console.error("Failed to persist archived team artifact", error);
    }
    showWorkbenchNotice(`${artifact?.title ?? "运行产物"}已标记为归档。`);
  }
  function openTeamBuilder(teamTitle?: string) {
    const team = teamRooms.find((item) => item.title === teamTitle);
    teamConfigTitle = teamTitle;
    teamBuilderName = team?.title ?? "";
    teamBuilderMemberIds = team?.memberIds ? [...team.memberIds] : ["code-review", "research"];
    teamBuilderLeaderId = team?.leaderId ?? team?.memberIds?.[0] ?? "code-review";
    teamBuilderSearch = "";
    configDialog = "team";
  }
  function toggleTeamBuilderMember(agentId: string) {
    if (teamBuilderMemberIds.includes(agentId)) {
      const nextMembers = teamBuilderMemberIds.filter((id) => id !== agentId);
      teamBuilderMemberIds = nextMembers;
      if (teamBuilderLeaderId === agentId) teamBuilderLeaderId = nextMembers[0] ?? "";
      return;
    }
    if (teamBuilderMemberIds.length >= 10) return;
    teamBuilderMemberIds = [...teamBuilderMemberIds, agentId];
    if (!teamBuilderLeaderId) teamBuilderLeaderId = agentId;
  }
  function toggleTeamBuilderLeader(agentId: string) {
    if (!teamBuilderMemberIds.includes(agentId)) return;
    teamBuilderLeaderId = agentId;
  }
  function openTeamChat(teamTitle: string) {
    selectedTeamTitle = teamTitle;
    teamViewMode = "chat";
  }
  function deleteTeam(teamId: string) {
    const nextTeams = teamRooms.filter((team) => team.id !== teamId);
    teamRooms = nextTeams;
    if (!nextTeams.some((team) => team.title === selectedTeamTitle)) {
      selectedTeamTitle = nextTeams[0]?.title;
      if (teamViewMode === "chat" && !selectedTeamTitle) teamViewMode = "teams";
    }
  }
  function addTeamChatAttachment() {
    const nextIndex = teamChatAttachments.length + 1;
    teamChatAttachments = [...teamChatAttachments, `待关联材料-${nextIndex}.md`];
  }
  function removeTeamChatAttachment(index: number) {
    teamChatAttachments = teamChatAttachments.filter((_, itemIndex) => itemIndex !== index);
  }
  async function sendTeamChat() {
    const text = teamChatInput.trim();
    const team = selectedTeamRoom();
    if (!text || !team || teamChatSending) return;
    const runTeamRuntime = workbenchDataPersistenceBindings()?.RunTeamRuntime;
    if (typeof runTeamRuntime !== "function") {
      showWorkbenchNotice("团队 runtime 未连接，请在 Wails 桌面环境中重试。");
      return;
    }
    teamChatInput = "";
    teamChatSending = true;
    const previousTeamRooms = teamRooms;
    teamRooms = teamRooms.map((item) => item.id === team.id ? {
      ...item,
      active: "runtime 正在执行",
      status: "运行中",
      topic: text.length > 28 ? `${text.slice(0, 28)}...` : text,
      queue: `${teamMembers(team).length || 1} 个成员待返回`,
      runState: "运行中",
      nextCheckpoint: "等待团队成员输出",
      outcome: "执行中",
      steps: item.steps.map((step, index) => ({
        ...step,
        status: index === 0 ? "执行中" : "待执行",
      })),
    } : item);
    try {
      const result = await runTeamRuntime({
        teamId: team.id,
        task: text,
        modelRef: teamChatModel || selectedModel || modelSettings?.defaultModel,
        attachments: teamChatAttachments,
      });
      teamRooms = teamRooms.map((item) => item.id === result.room.id ? result.room : item);
      teamRuns = [result.run, ...teamRuns.filter((item) => item.id !== result.run.id)];
      const incomingIds = new Set(result.messages.map((message) => message.id));
      teamChatMessages = [
        ...teamChatMessages.filter((message) => message.teamId !== team.id || !incomingIds.has(message.id)),
        ...result.messages,
      ];
      teamChatAttachments = [];
      await refreshWorkbenchData();
      showWorkbenchNotice(`${result.room.title}：${result.run.status === "completed" ? "运行完成" : "运行已记录"}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to run team runtime", error);
      teamRooms = previousTeamRooms;
      showWorkbenchNotice(`团队 runtime 执行失败：${message}`);
    }
    teamChatSending = false;
  }
  async function saveTeamBuilder() {
    const name = teamBuilderName.trim();
    if (!name || teamBuilderMemberIds.length === 0) return;
    const memberAgents = teamBuilderMemberIds.map((id) => agentCards.find((agent) => agent.id === id)).filter(Boolean) as typeof agentCards;
    const leaderId = teamBuilderMemberIds.includes(teamBuilderLeaderId) ? teamBuilderLeaderId : teamBuilderMemberIds[0];
    const leaderAgent = memberAgents.find((agent) => agent.id === leaderId) ?? memberAgents[0];
    const nextTeam: WorkbenchTeamRoom = {
      id: teamConfigTitle ? (teamRooms.find((team) => team.title === teamConfigTitle)?.id ?? `team-${Date.now()}`) : `team-${Date.now()}`,
      title: name,
      members: memberAgents.length,
      active: "模板已创建",
      desc: memberAgents.map((agent) => agent.name).join("、") || "新配置的 Agent 团队。",
      leader: leaderAgent?.name ?? "协调者",
      leaderId,
      status: "模板",
      topic: "待分配任务",
      queue: "0 个运行节点",
      memberIds: [...teamBuilderMemberIds],
      avatars: memberAgents.map((agent) => agent.name.slice(0, 1)).slice(0, 3),
      mode: "协调者编排",
      sharedContext: "未绑定资料",
      runState: "未启动",
      nextCheckpoint: "发送任务后生成运行草稿",
      outcome: "等待首次运行",
      controls: ["暂停", "继续", "终止", "重新分配"],
      artifacts: ["报告草稿", "待办清单", "资料归档"],
      steps: memberAgents.map((agent, index) => ({
        id: `${agent.id}-${index}`,
        title: index === 0 ? "拆解目标" : "执行分工",
        owner: agent.name,
        status: "待运行",
        detail: index === 0 ? "确认目标、约束和验收标准。" : "按角色补充上下文、建议和验证结果。",
      })),
    };
    teamRooms = teamConfigTitle ? teamRooms.map((team) => team.title === teamConfigTitle ? nextTeam : team) : [nextTeam, ...teamRooms];
    selectedTeamTitle = nextTeam.title;
    configDialog = undefined;
    teamConfigTitle = undefined;
    try {
      await persistTeamRoom(nextTeam);
      await refreshWorkbenchData();
    } catch (error) {
      console.error("Failed to persist team", error);
      showWorkbenchNotice("保存协作组失败，请稍后重试。");
    }
  }
  function selectAgentForTask(agentId: string) { selectedAgentId = agentId; agentSelectorOpen = false; }
  function linkProjectById(projectId: string) {
    if (!projectId) {
      selectedProjectId = "";
      linkedProject = "";
      activeSidebarProjectId = "";
      return;
    }
    const sidebarProject = sidebarProjects.find((item) => item.id === projectId);
    const project = projectCards.find((item) => item.id === projectId || item.name === sidebarProject?.name);
    selectedProjectId = project?.id ?? "";
    linkedProject = sidebarProject?.name ?? project?.name ?? "";
    if (sidebarProject) {
      activeSidebarProjectId = sidebarProject.id;
      sidebarProjects = sidebarProjects.map((item) => item.id === sidebarProject.id ? { ...item, expanded: true, updatedAtMs: Date.now() } : item);
    }
  }
  function linkProjectToTask(projectName: string) { const project = projectCards.find((item) => item.name === projectName); if (project) selectedProjectId = project.id; linkedProject = projectName; focusNewTask(); input = `关联项目：${projectName}\n`; void tick().then(focusComposer); }
  function linkCustomerToTask(customerName: string) { const customer = customerCards.find((item) => item.name === customerName); if (customer) selectedCustomerId = customer.id; linkedCustomer = customerName; input = `关联客户：${customerName}\n`; focusNewTask(); }
  function useNewTaskPrompt(task: (typeof newTaskQuickTasks)[number]) { selectedAgentId = task.agentId; input = task.prompt; void tick().then(focusComposer); }
  function resetTodoDraft() {
    todoDraftTitle = "";
    todoDraftProjectId = defaultTodoProjectId();
    todoDraftPriority = "中";
    todoDraftDue = "";
    todoDraftDesc = configDialog === "todo" ? configDialogIntro() : "";
  }
  function resetScheduleDraft() {
    selectedScheduleEventId = undefined;
    scheduleDraftTitleValue = "";
    scheduleDraftDate = "";
    scheduleDraftTimeValue = "";
    scheduleDraftType = "";
    scheduleDraftPlaceValue = "";
  }
  function fillScheduleDraft(event: WorkbenchCalendarEvent) {
    selectedScheduleEventId = event.id;
    scheduleDraftTitleValue = event.title || "";
    scheduleDraftDate = calendarEventFullDate(event) || event.date || "";
    scheduleDraftTimeValue = event.time || "";
    scheduleDraftType = event.type || "";
    scheduleDraftPlaceValue = event.place || "";
  }
  function resetMaterialDraft() {
    const project = selectedProject();
    materialDraftTitle = "";
    materialDraftProjectId = project?.id ?? projectCards[0]?.id ?? "";
    materialDraftCategory = "项目资料";
    materialDraftSource = "manual";
    materialDraftStatus = "待复核";
    materialDraftDesc = "";
    materialDraftFile = undefined;
    materialDraftNativeFile = undefined;
    materialDraftFileLabel = "";
  }
  function resetIngestDraft() {
    const project = selectedProject();
    ingestDraftProjectId = project?.id ?? projectCards[0]?.id ?? "";
    ingestDraftCategory = "项目资料";
    ingestDraftSource = "local files";
    ingestDraftStatus = "待复核";
    ingestDraftStrategy = "自动分类并去重";
    ingestDraftDesc = "";
    ingestDraftFiles = [];
    ingestDraftFileLabel = "";
  }
  function resetKnowledgeDraft() {
    knowledgeDraftTitle = "";
    knowledgeDraftType = "文档";
    knowledgeDraftSource = "manual";
    knowledgeDraftTags = "";
    knowledgeDraftDescription = "";
    knowledgeDraftContent = "";
  }
  function nextProjectCode(now = new Date()) {
    const pad = (value: number) => String(value).padStart(2, "0");
    const prefix = `PRJ-${now.getFullYear()}-${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const next = projectCards.reduce((max, project) => {
      const match = project.code?.match(new RegExp(`^${prefix}-(\\d+)$`));
      if (!match) return max;
      const value = Number(match[1]);
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0) + 1;
    return `${prefix}-${String(next).padStart(2, "0")}`;
  }
  function customerRiskLevel(risk: string) {
    if (risk.includes("高")) return "high";
    if (risk.includes("中")) return "medium";
    return "low";
  }
  function splitDraftList(value: string) {
    return value.split(/[,，、/\n]/).map((item) => item.trim()).filter(Boolean);
  }
  function resetCustomerDraft() {
    customerDraftName = linkedCustomer || "";
    customerDraftType = "企业";
    customerDraftContact = "";
    customerDraftPhone = "";
    customerDraftEmail = "";
    customerDraftIndustry = "";
    customerDraftRegion = "";
    customerDraftOwner = agentCards.find((agent) => agent.id === selectedAgentId)?.name ?? "我的";
    customerDraftStage = "跟进中";
    customerDraftStatus = "active";
    customerDraftRisk = "低风险";
    customerDraftProjectId = "";
    customerDraftNextAction = "";
    customerDraftTags = "";
    customerDraftAddress = "";
    customerDraftNote = "";
    customerDraftDesc = "";
  }
  function resetProjectDraft() {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    projectDraftName = "";
    projectDraftCode = nextProjectCode(now);
    projectDraftClient = linkedCustomer || "";
    projectDraftStage = "进行中";
    projectDraftOwner = "项目负责人";
    projectDraftCategory = "业务项目";
    projectDraftBudget = "";
    projectDraftAcceptedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    projectDraftStatus = "active";
    projectDraftProgress = "0";
    projectDraftPriority = "中";
    projectDraftRisk = "低风险";
    projectDraftAgent = agentCards.find((agent) => agent.id === selectedAgentId)?.name ?? "自动化 Agent";
    projectDraftNextStep = "";
    projectDraftDesc = "";
  }
  function resetReportDraft() {
    const project = selectedProject();
    const customer = selectedCustomer();
    const agent = agentCards.find((item) => item.id === selectedAgentId);
    const baseTitle = linkedProject || project?.name;
    reportDraftId = "";
    reportDraftTitle = baseTitle ? `${baseTitle} 分析报告` : "新建分析报告";
    reportDraftKind = "项目风险报告";
    reportDraftStatus = "草稿";
    reportDraftProjectId = selectedProjectId || project?.id || "";
    reportDraftCustomerId = selectedCustomerId || customer?.id || "";
    reportDraftOwner = agent?.name || "自动化 Agent";
    reportDraftSource = "工作台数据";
    reportDraftFormat = "Markdown";
    reportDraftPriority = "中";
    reportDraftDueAt = "";
    reportDraftDesc = "";
    reportDraftBody = "";
  }
  function resetTemplateDraft() {
    const project = selectedProject();
    templateDraftId = "";
    templateDraftTitle = project?.name ? `${project.name} 模板` : "新建文档模板";
    templateDraftType = "模板";
    templateDraftStatus = "草稿";
    templateDraftSource = "workbench";
    templateDraftTags = "模板 / 工作台";
    templateDraftDescription = "";
    templateDraftMaterialIds = [];
  }
  function openConfigDialog(kind: ConfigDialog) {
    configDialog = kind;
    if (kind === "schedule") resetScheduleDraft();
    if (kind === "todo") resetTodoDraft();
    if (kind === "project") resetProjectDraft();
    if (kind === "customer") resetCustomerDraft();
    if (kind === "report") resetReportDraft();
    if (kind === "template") resetTemplateDraft();
    if (kind === "ingest") resetIngestDraft();
    if (kind === "knowledge") resetKnowledgeDraft();
    if (kind === "dossier" || kind === "resource") resetMaterialDraft();
  }
  function syncSidebarProjectFromWorkbench(project: WorkbenchProject) {
    const now = Date.now();
    const existing = sidebarProjects.find((item) => item.id === project.id || item.name === project.name);
    if (existing) {
      sidebarProjects = sidebarProjects.map((item) =>
        item.id === existing.id
          ? { ...item, id: project.id || item.id, name: project.name, expanded: true, updatedAtMs: now }
          : item,
      );
      activeSidebarConversationId = "";
      syncSidebarProjectContext({ ...existing, id: project.id || existing.id, name: project.name, expanded: true, updatedAtMs: now });
      return;
    }
    const sidebarProject: SidebarProject = { id: project.id, name: project.name, updatedAtMs: now, expanded: true, conversations: [] };
    sidebarProjects = [sidebarProject, ...sidebarProjects];
    activeSidebarConversationId = "";
    syncSidebarProjectContext(sidebarProject);
  }
  async function submitProjectDraft() {
    const name = projectDraftName.trim();
    if (!name) {
      showWorkbenchNotice("请填写项目名称。");
      return;
    }
    const progress = Number(projectDraftProgress);
    const input: WorkbenchProjectInput = {
      name,
      code: projectDraftCode.trim(),
      client: projectDraftClient.trim(),
      stage: projectDraftStage.trim(),
      owner: projectDraftOwner.trim(),
      desc: projectDraftDesc.trim(),
      category: projectDraftCategory.trim(),
      court: projectDraftOwner.trim(),
      budget: projectDraftBudget.trim(),
      acceptedAt: projectDraftAcceptedAt.trim(),
      status: projectDraftStatus,
      progress: Number.isFinite(progress) ? progress : 0,
      priority: projectDraftPriority.trim(),
      risk: projectDraftRisk.trim(),
      nextStep: projectDraftNextStep.trim(),
      agent: projectDraftAgent.trim(),
      materials: 0,
      todos: 0,
      events: 0,
      reports: 0,
      timeline: ["项目已创建"],
    };
    try {
      const saveProject = projectPersistenceBindings()?.SaveWorkbenchProject;
      const persisted = typeof saveProject === "function";
      const now = new Date().toISOString();
      const saved = persisted
        ? await saveProject(input)
        : { ...input, id: `project-${Date.now()}`, updatedAt: "刚刚", createdAt: now, updatedISO: now, materials: 0, todos: 0, events: 0, reports: 0, timeline: input.timeline ?? [] } as WorkbenchProject;
      projectCards = [saved, ...projectCards.filter((project) => project.id !== saved.id)];
      selectedProjectId = saved.id;
      projectDetailTab = "overview";
      projectDetailOpen = true;
      configDialog = undefined;
      workLayer = "projects";
      syncSidebarProjectFromWorkbench(saved);
      showWorkbenchNotice(persisted ? `已新建项目：${saved.name}` : `已新建项目：${saved.name}。重启桌面 dev 窗口后会启用持久化。`);
    } catch (error) {
      console.error("Failed to save project", error);
      showWorkbenchNotice("新建项目失败，请稍后重试。");
    }
  }
  async function submitTodoDraft() {
    const title = todoDraftTitle.trim() || "新建待办";
    const dueAt = todoDraftDue.trim();
    const dueLabel = formatTodoDueLabel(dueAt);
    const priority = todoDraftPriority.trim() || "中";
    const desc = todoDraftDesc.trim() || "待补充执行说明。";
    const project = todoDraftProjectId ? projectCards.find((item) => item.id === todoDraftProjectId) : undefined;
    const customer = customerDetailOpen ? selectedCustomer() : undefined;
    const agent = agentCards.find((item) => item.id === selectedAgentId);
    const projectId = project?.id ?? "";
    const input: WorkbenchTodoInput = {
      title,
      description: desc,
      dueAt,
      dueLabel,
      status: "pending",
      priority,
      projectId,
      projectName: project?.name ?? "",
      customerId: customer?.id ?? "",
      customerName: customer?.name ?? "",
      agentId: agent?.id ?? selectedAgentId,
      agentName: agent?.name ?? "",
      model: selectedModel || agentModel,
      source: "workbench",
    };
    try {
      const saveTodo = todoPersistenceBindings()?.SaveTodo;
      const persisted = typeof saveTodo === "function";
      const saved = persisted
        ? await saveTodo(input)
        : { ...input, id: `todo-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: input.status ?? "pending" } as WorkbenchTodo;
      todoItems = [saved, ...todoItems.filter((todo) => todo.id !== saved.id)];
      configDialog = undefined;
      workLayer = "todos";
      showWorkbenchNotice(persisted ? `已新增待办：${title}` : `已新增待办：${title}。重启桌面 dev 窗口后会启用持久化。`);
    } catch (error) {
      console.error("Failed to save todo", error);
      showWorkbenchNotice("新增待办失败，请稍后重试。");
    }
  }
  async function submitMaterialDraft() {
    const fromResourceCenter = configDialog === "resource";
    const title = materialDraftTitle.trim();
    if (!title) {
      showWorkbenchNotice("请填写资料名称。");
      return;
    }
    const project = projectCards.find((item) => item.id === materialDraftProjectId) ?? selectedProject();
    if (!project?.id) {
      showWorkbenchNotice("请先选择归属项目。");
      return;
    }
    let uploadedFilePath = "";
    let uploadedFileName = "";
    let uploadedFileSize = 0;
    let uploadedMimeType = "";
    if (fromResourceCenter) {
      const nativeFile = materialDraftNativeFile;
      const browserFile = materialDraftFile;
      if (!nativeFile && !browserFile) {
        showWorkbenchNotice("请选择要上传的资料文件。");
        return;
      }
      try {
        if (nativeFile?.selectionToken) {
          const importFile = projectMaterialFileBindings()?.ImportProjectMaterialFile;
          if (typeof importFile !== "function") {
            showWorkbenchNotice("原生资料导入接口未就绪，请重启桌面 dev 窗口后重试。");
            return;
          }
          const imported = await importFile(nativeFile.selectionToken);
          uploadedFilePath = imported.path || "";
          uploadedFileName = imported.name;
          uploadedFileSize = imported.size;
          uploadedMimeType = imported.mimeType;
        } else if (browserFile) {
          if (browserFile.size > MAX_DATA_URL_PROJECT_MATERIAL_BYTES) {
            showWorkbenchNotice(`资料文件“${browserFile.name}”未导入：浏览器 data URL 导入最多支持 25 MiB；桌面端原生选择支持最高 64 MiB。`);
            return;
          }
          if (!hasWailsBindings()) {
            showWorkbenchNotice("浏览器预览不能写入资料库；请在 Volt GUI 桌面端导入文件。");
            return;
          }
          const dataUrl = await readFileAsDataURL(browserFile);
          uploadedFilePath = await app().SavePastedFile(browserFile.name, dataUrl);
          uploadedFileName = browserFile.name;
          uploadedFileSize = browserFile.size;
          uploadedMimeType = browserFile.type;
        }
      } catch (error) {
        console.error("Failed to upload project material file", error);
        showWorkbenchNotice(materialFileUploadError(nativeFile?.name || browserFile?.name || "未命名文件", error));
        return;
      }
    }
    const input: WorkbenchProjectMaterialInput = {
      title,
      projectId: project.id,
      projectName: project.name,
      category: materialDraftCategory.trim() || "项目资料",
      source: uploadedFilePath || materialDraftSource.trim() || "manual",
      status: materialDraftStatus.trim() || "待复核",
      desc: materialDraftDesc.trim(),
      fileName: uploadedFileName,
      filePath: uploadedFilePath,
      fileSize: uploadedFileSize,
      mimeType: uploadedMimeType,
    };
    try {
      const saveMaterial = projectMaterialPersistenceBindings()?.SaveProjectMaterial;
      if (typeof saveMaterial !== "function") {
        showWorkbenchNotice("资料持久化接口未就绪，请重启桌面 dev 窗口后重试。");
        return;
      }
      const saved = await saveMaterial(input);
      const existed = projectMaterialRows.some((material) => material.id === saved.id);
      projectMaterialRows = [saved, ...projectMaterialRows.filter((material) => material.id !== saved.id)];
      await refreshProjectMaterials();
      await refreshKnowledgeBase();
      projectCards = projectCards.map((item) =>
        item.id === saved.projectId
          ? { ...item, materials: existed ? item.materials : item.materials + 1, updatedAt: "刚刚" }
          : item,
      );
      selectedProjectId = saved.projectId;
      if (fromResourceCenter) {
        workLayer = "resources";
        resourceTab = "resources";
      } else {
        projectDetailTab = "materials";
        projectDetailOpen = true;
      }
      configDialog = undefined;
      showWorkbenchNotice(saved.status === "索引失败" ? `资料已复制并保存，但知识库索引失败：${saved.title}。请检查文件格式和文本内容。` : `已新增资料：${saved.title}`);
    } catch (error) {
      console.error("Failed to save project material", error);
      showWorkbenchNotice(`资料入库失败：${formatErrorMessage(error)}`);
    }
  }
  async function submitIngestDraft() {
    if (!ingestDraftFiles.length) {
      showWorkbenchNotice("请选择要批量导入的资料文件。");
      return;
    }
    const project = projectCards.find((item) => item.id === ingestDraftProjectId) ?? selectedProject();
    if (!project?.id) {
      showWorkbenchNotice("请先选择归属项目。");
      return;
    }
    if (!hasWailsBindings()) {
      showWorkbenchNotice("请在桌面端批量导入资料文件。");
      return;
    }
    const saveBatch = projectMaterialPersistenceBindings()?.SaveProjectMaterialsBatch;
    if (typeof saveBatch !== "function") {
      showWorkbenchNotice("批量导入接口未就绪，请重启桌面 dev 窗口后重试。");
      return;
    }
    try {
      const inputs: WorkbenchProjectMaterialBatchInput = [];
      for (const file of ingestDraftFiles) {
        const dataUrl = await readFileAsDataURL(file);
        const uploadedFilePath = await app().SavePastedFile(file.name, dataUrl);
        inputs.push({
          title: file.name.replace(/\.[^.]+$/, "") || file.name,
          projectId: project.id,
          projectName: project.name,
          category: ingestDraftCategory.trim() || "项目资料",
          source: uploadedFilePath || ingestDraftSource,
          status: ingestDraftStatus.trim() || "待复核",
          desc: [ingestDraftDesc.trim(), `导入策略：${ingestDraftStrategy}`].filter(Boolean).join("\n"),
          fileName: file.name,
          filePath: uploadedFilePath,
          fileSize: file.size,
          mimeType: file.type,
        });
      }
      const saved = await saveBatch(inputs);
      await refreshProjectMaterials();
      await refreshKnowledgeBase();
      projectCards = projectCards.map((item) =>
        item.id === project.id
          ? { ...item, materials: item.materials + saved.length, updatedAt: "刚刚" }
          : item,
      );
      selectedProjectId = project.id;
      workLayer = "resources";
      resourceTab = "ingest";
      configDialog = undefined;
      showWorkbenchNotice(`已批量导入 ${saved.length} 份资料。`);
    } catch (error) {
      console.error("Failed to batch import project materials", error);
      showWorkbenchNotice("批量导入失败，请稍后重试。");
    }
  }
  async function submitCustomerDraft() {
    const saveCustomer = workbenchDataPersistenceBindings()?.SaveCustomer;
    const name = customerDraftName.trim();
    if (!name) {
      showWorkbenchNotice("请填写客户名称。");
      return;
    }
    const projectIds = customerDraftProjectId ? [customerDraftProjectId] : [];
    const input: WorkbenchCustomerInput = {
      name,
      type: customerDraftType.trim() || "企业",
      contact: customerDraftContact.trim() || "联系人",
      phone: customerDraftPhone.trim(),
      email: customerDraftEmail.trim(),
      risk: customerDraftRisk.trim() || "低风险",
      riskLevel: customerRiskLevel(customerDraftRisk),
      status: customerDraftStatus || "active",
      owner: customerDraftOwner.trim() || "我的",
      stage: customerDraftStage.trim() || "跟进中",
      industry: customerDraftIndustry.trim(),
      region: customerDraftRegion.trim(),
      address: customerDraftAddress.trim(),
      note: customerDraftNote.trim(),
      desc: customerDraftDesc.trim(),
      projectIds,
      matters: projectIds.length,
      nextAction: customerDraftNextAction.trim(),
      lastTouch: "刚刚",
      lastContact: "刚刚",
      tags: splitDraftList(customerDraftTags),
    };
    try {
      const now = new Date().toISOString();
      const saved = typeof saveCustomer === "function"
        ? await saveCustomer(input)
        : { ...input, id: `customer-${Date.now()}`, email: "", industry: "", region: "", address: "", note: "", materials: 0, events: 0, reports: 0, nextAction: "", createdAt: now, updatedAt: now } as WorkbenchCustomer;
      customerCards = [saved, ...customerCards.filter((customer) => customer.id !== saved.id)];
      selectedCustomerId = saved.id;
      customerDetailOpen = true;
      customerDetailTab = "overview";
      workLayer = "customers";
      configDialog = undefined;
      showWorkbenchNotice(`已新建客户：${saved.name}`);
    } catch (error) {
      console.error("Failed to save customer", error);
      showWorkbenchNotice("新建客户失败，请稍后重试。");
    }
  }
  async function submitScheduleDraft() {
    const saveEvent = workbenchDataPersistenceBindings()?.SaveCalendarEvent;
    const now = new Date();
    const { project, customer } = scheduleDialogContext();
    const existingEvent = selectedScheduleEventId ? calendarEvents.find((event) => event.id === selectedScheduleEventId) : undefined;
    const input: WorkbenchCalendarEventInput = {
      id: selectedScheduleEventId,
      title: scheduleDraftTitleValue.trim() || scheduleDraftTitle(),
      date: scheduleDraftDate.trim() || formatCalendarDate(now),
      day: scheduleDraftDate.trim() ? scheduleDraftDate.trim().slice(8, 10) : scheduleDraftDay(now),
      time: scheduleDraftTimeValue.trim() || scheduleDraftTime(now),
      type: scheduleDraftType.trim() || "meeting",
      place: scheduleDraftPlaceValue.trim() || scheduleDraftPlace(),
      projectId: selectedScheduleEventId ? existingEvent?.projectId || "" : project?.id || "",
      customerId: selectedScheduleEventId ? existingEvent?.customerId || "" : customer?.id || "",
      status: existingEvent?.status || "待开始",
      desc: existingEvent?.desc || configDialogIntro(),
    };
    try {
      const saved = typeof saveEvent === "function"
        ? await saveEvent(input)
        : { ...input, id: input.id || `schedule-${Date.now()}`, createdAt: existingEvent?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() } as WorkbenchCalendarEvent;
      calendarEvents = [saved, ...calendarEvents.filter((event) => event.id !== saved.id)];
      workLayer = "calendar";
      configDialog = undefined;
      selectedScheduleEventId = undefined;
      showWorkbenchNotice(`${existingEvent ? "已更新日程" : "已新建日程"}：${saved.title}`);
    } catch (error) {
      console.error("Failed to save calendar event", error);
      showWorkbenchNotice("新建日程失败，请稍后重试。");
    }
  }
  async function submitReportDraft() {
    const saveReport = workbenchDataPersistenceBindings()?.SaveWorkbenchReport;
    const title = reportDraftTitle.trim();
    if (!title) {
      showWorkbenchNotice("请填写报告标题。");
      return;
    }
    const input: WorkbenchReportInput = {
      id: reportDraftId || undefined,
      title,
      status: reportDraftStatus.trim() || "草稿",
      owner: reportDraftOwner.trim() || "自动化 Agent",
      desc: reportDraftDesc.trim(),
      body: reportDraftBody.trim(),
      kind: reportDraftKind.trim() || "分析报告",
      projectId: reportDraftProjectId || "",
      customerId: reportDraftCustomerId || "",
      source: reportDraftSource.trim() || "工作台数据",
      format: reportDraftFormat.trim() || "Markdown",
      priority: reportDraftPriority.trim() || "中",
      dueAt: reportDraftDueAt.trim(),
    };
    try {
      const saved = typeof saveReport === "function"
        ? await saveReport(input)
        : { ...input, id: input.id || `report-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as WorkbenchReport;
      reportCards = [saved, ...reportCards.filter((report) => report.id !== saved.id)];
      selectedReportId = saved.id;
      workLayer = "reports";
      configDialog = undefined;
      reportDraftId = "";
      showWorkbenchNotice(`${input.id ? "已更新报告" : "已新建报告"}：${saved.title}`);
    } catch (error) {
      console.error("Failed to save report", error);
      showWorkbenchNotice("新建报告失败，请稍后重试。");
    }
  }
  async function submitTemplateDraft() {
    const saveDocument = workbenchDataPersistenceBindings()?.SaveKnowledgeDocument;
    const title = templateDraftTitle.trim();
    if (!title) {
      showWorkbenchNotice("请填写模板名称。");
      return;
    }
    const input: WorkbenchKnowledgeDocumentInput = {
      id: templateDraftId || undefined,
      title,
      type: templateDraftType.trim() || "模板",
      count: templateDraftMaterialIds.length,
      status: templateDraftStatus.trim() || "草稿",
      description: templateDraftDescription.trim(),
      source: templateDraftSource.trim() || "workbench",
      tags: templateDraftTags.trim(),
      materialIds: templateDraftMaterialIds,
    };
    try {
      const saved = typeof saveDocument === "function"
        ? await saveDocument(input)
        : { ...input, id: `template-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as WorkbenchKnowledgeDocument;
      documentItems = [saved, ...documentItems.filter((item) => item.id !== saved.id)];
      await refreshKnowledgeBase();
      selectedKnowledgeDocumentId = saved.id;
      knowledgePreviewTitle = saved.title;
      knowledgePreviewDescription = saved.description || `${saved.type} / ${knowledgeDocumentCount(saved)} linked materials / ${saved.status}`;
      resourceTab = "knowledge";
      workLayer = "resources";
      configDialog = undefined;
      showWorkbenchNotice(`已新建模板：${saved.title}`);
    } catch (error) {
      console.error("Failed to save knowledge template", error);
      showWorkbenchNotice("新建模板失败，请稍后重试。");
    }
  }
  async function submitKnowledgeDraft() {
    const title = knowledgeDraftTitle.trim();
    const content = knowledgeDraftContent.trim();
    if (!title) {
      showWorkbenchNotice("请填写知识标题。");
      return;
    }
    if (!content && !knowledgeDraftDescription.trim()) {
      showWorkbenchNotice("请填写知识内容或摘要。");
      return;
    }
    const importKnowledge = knowledgePersistenceBindings()?.ImportKnowledgeDocument;
    if (typeof importKnowledge !== "function") {
      showWorkbenchNotice("知识导入接口未就绪，请重启桌面 dev 窗口后重试。");
      return;
    }
    try {
      const saved = await importKnowledge({
        title,
        type: knowledgeDraftType.trim() || "文档",
        source: knowledgeDraftSource.trim() || "manual",
        tags: knowledgeDraftTags.trim(),
        description: knowledgeDraftDescription.trim(),
        content: [knowledgeDraftDescription.trim(), content].filter(Boolean).join("\n\n"),
      });
      documentItems = [normalizeKnowledgeDocumentForUI(saved), ...documentItems.filter((item) => item.id !== saved.id)];
      await refreshKnowledgeBase();
      await runWorkbenchSearch(resourceSearch);
      resourceTab = "knowledge";
      workLayer = "resources";
      configDialog = undefined;
      openKnowledgeDocument(normalizeKnowledgeDocumentForUI(saved));
      showWorkbenchNotice(`已导入知识：${saved.title}`);
    } catch (error) {
      console.error("Failed to import knowledge document", error);
      showWorkbenchNotice("导入知识失败，请稍后重试。");
    }
  }
  async function submitDistillDraft() {
    const todo = todoItems.find((item) => item.id === distillSampleTodoId) ?? todoItems[0];
    if (!todo) {
      showWorkbenchNotice("请先选择可蒸馏的任务样本。");
      return;
    }
    const selectedSkills = skillCards.filter((skill) => skill.active).map((skill) => skill.title);
    try {
      const distillAgent = workbenchDataPersistenceBindings()?.DistillAgentFromTodo;
      if (typeof distillAgent === "function") {
        const saved = await distillAgent({
          title: todo.title,
          description: todoDescription(todo),
          priority: todo.priority,
          dueLabel: todoDue(todo),
          status: todo.status,
          projectId: todo.projectId,
          projectName: todo.projectName,
          customerId: todo.customerId,
          customerName: todo.customerName,
        }, selectedSkills);
        await refreshAgents();
        selectedAgentId = saved.id;
      } else {
        const now = new Date().toISOString();
        const localAgent: AgentView = { id: `distilled-${Date.now()}`, name: `${todo.title} Agent`, role: "已蒸馏", runs: 0, status: "已启用", desc: todoDescription(todo), avatar: "D", tools: ["本地文件与资料"], skills: selectedSkills, coreFiles: ["AGENTS.md"], builtIn: false, createdAt: now, updatedAt: now };
        agentCards = [localAgent, ...agentCards];
        selectedAgentId = localAgent.id;
      }
      configDialog = undefined;
      workLayer = "agents";
      showWorkbenchNotice(`已生成蒸馏 Agent：${todo.title} Agent`);
    } catch (error) {
      console.error("Failed to distill agent", error);
      showWorkbenchNotice("生成蒸馏 Agent 失败。");
    }
  }
  function confirmConfigDialog() {
    if (configDialog === "team") return saveTeamBuilder();
    if (configDialog === "model") return void saveModelProvider();
    if (configDialog === "todo") return void submitTodoDraft();
    if (configDialog === "project") return void submitProjectDraft();
    if (configDialog === "ingest") return void submitIngestDraft();
    if (configDialog === "knowledge") return void submitKnowledgeDraft();
    if (configDialog === "dossier" || configDialog === "resource") return void submitMaterialDraft();
    if (configDialog === "customer") return void submitCustomerDraft();
    if (configDialog === "schedule") return void submitScheduleDraft();
    if (configDialog === "report") return void submitReportDraft();
    if (configDialog === "template") return void submitTemplateDraft();
    if (configDialog === "distill") return void submitDistillDraft();
    configDialog = undefined;
  }
  function configDialogTitle() {
    if (configDialog === "schedule") return selectedScheduleEventId ? "日程详情" : "新建日程";
    if (configDialog === "todo") return "新建待办";
    if (configDialog === "report") return reportDraftId ? "编辑分析报告" : "新建分析报告";
    if (configDialog === "model") return modelDraftEditing ? "编辑模型渠道" : "添加模型渠道";
    if (configDialog === "ingest") return "批量导入";
    if (configDialog === "knowledge") return "导入知识";
    if (configDialog === "resource") return "上传资料";
    if (configDialog === "template") return "新建文档模板";
    if (configDialog === "project") return "新建项目";
    if (configDialog === "customer") return "新建客户";
    if (configDialog === "team") return teamConfigTitle ? "编辑 Agent 团队" : "配置 Agent 团队";
    if (configDialog === "dossier") return "新建资料卷宗";
    if (configDialog === "selectProject") return "选择项目";
    if (configDialog === "selectCustomer") return "选择客户";
    if (configDialog === "distill") return "Agent 蒸馏向导";
    return "配置";
  }
  function formatRuntime(startedAtMs: number) { const m = Math.max(1, Math.floor((nowMs - startedAtMs) / 60000)); const h = Math.floor(m / 60); return h ? `${h} 小时 ${m % 60} 分钟` : `${m} 分钟`; }
  function automationDialogTitle() {
    return automationDialogMode === "create" ? "新建自动化任务" : automationDraft.title || "编辑自动化任务";
  }
  function agentWizardName() {
    return agentWizardDraftName;
  }
  function agentWizardDescription() {
    return agentWizardDraftDescription;
  }
  function applyToolAvailability(status: Record<string, { available: boolean; reason: string }>) {
    toolCards = toolCards.map((tool) => {
      const next = status[tool.id] ?? { available: tool.available, reason: tool.reason ?? "" };
      return {
        ...tool,
        available: next.available,
        active: next.available ? tool.active : false,
        reason: next.reason,
      };
    });
  }
  function setToolSelectionFromAgent(agent?: AgentView) {
    const enabled = new Set(agent?.tools ?? defaultToolCards.filter((tool) => tool.active).map((tool) => tool.title));
    toolCards = toolCards.map((tool) => ({ ...tool, active: tool.available && enabled.has(tool.title) }));
  }
  function toggleAgentTool(toolId: string) {
    toolCards = toolCards.map((tool) => {
      if (tool.id !== toolId || !tool.available) return tool;
      return { ...tool, active: !tool.active };
    });
  }
  function skillMatchesCard(skillName: string, cardId: string) {
    const name = skillName.toLowerCase();
    if (cardId === "repo") return /repo|repository|context|code|review/.test(name);
    if (cardId === "frontend") return /front|svelte|ui|design|browser/.test(name);
    if (cardId === "automation") return /auto|workflow|task|verify|test|ops/.test(name);
    return false;
  }
  function setSkillSelectionFromAgent(agent?: AgentView) {
    const enabled = new Set(agent?.skills ?? defaultSkillCards.filter((skill) => skill.active).map((skill) => skill.title));
    skillCards = skillCards.map((skill) => ({ ...skill, active: skill.available && enabled.has(skill.title) }));
  }
  function toggleAgentSkill(skillId: string) {
    skillCards = skillCards.map((skill) => {
      if (skill.id !== skillId || !skill.available) return skill;
      return { ...skill, active: !skill.active };
    });
  }
  async function refreshSkillStatus() {
    if (!hasWailsBindings()) {
      skillCards = skillCards.map((skill) => ({
        ...skill,
        available: false,
        active: false,
        version: "未加载",
        reason: "浏览器预览未连接桌面 Skill 后端",
      }));
      return;
    }
    try {
      const capabilities = await app().Capabilities();
      skillCards = skillCards.map((card) => {
        const matched = capabilities.skills.find((skill) => skillMatchesCard(skill.name, card.id));
        if (!matched) {
          return { ...card, available: false, active: false, version: "未加载", source: undefined, reason: "未发现匹配的真实 Skill" };
        }
        const available = Boolean(matched.enabled);
        return {
          ...card,
          available,
          active: available ? card.active : false,
          version: matched.scope || "已发现",
          desc: matched.description || card.desc,
          source: matched.name,
          reason: available ? `来源：${matched.name}` : `Skill 已发现但未启用：${matched.name}`,
        };
      });
    } catch {
      skillCards = skillCards.map((skill) => ({ ...skill, available: false, active: false, version: "未加载", reason: "无法读取 Skill 状态" }));
    }
  }
  async function refreshToolStatus() {
    if (!hasWailsBindings()) {
      applyToolAvailability({
        files: { available: true, reason: "浏览器预览可用" },
        terminal: { available: true, reason: "浏览器预览可用" },
        browser: { available: true, reason: "浏览器预览可用" },
        memory: { available: false, reason: "浏览器预览未连接桌面记忆后端" },
      });
      return;
    }
    const workspaceReady = Boolean(activeTab?.workspaceRoot || activeTab?.workspaceName);
    let terminalReady = false;
    let memoryReady = false;
    let fileReason = workspaceReady ? "当前工作区已连接" : "尚未打开工作区";
    let terminalReason = "等待权限配置";
    let memoryReason = "长期记忆不可用";
    try {
      const settings = await app().Settings();
      terminalReady = settings.permissions.mode !== "read-only" && settings.sandbox.bash !== "none";
      terminalReason = terminalReady ? `权限模式：${settings.permissions.mode}` : "当前权限或 sandbox 禁止终端执行";
    } catch {
      terminalReady = false;
      terminalReason = "无法读取终端权限配置";
    }
    try {
      const memory = await app().Memory();
      memoryReady = Boolean(memory.available);
      memoryReason = memoryReady ? (memory.storeDir ? `记忆目录：${memory.storeDir}` : "长期记忆可用") : "长期记忆后端未启用";
    } catch {
      memoryReady = false;
      memoryReason = "无法读取长期记忆状态";
    }
    applyToolAvailability({
      files: { available: workspaceReady, reason: fileReason },
      terminal: { available: terminalReady, reason: terminalReason },
      browser: { available: true, reason: "桌面 WebView 已加载" },
      memory: { available: memoryReady, reason: memoryReason },
    });
  }
  function openAgentWizard(agentId?: string) {
    agentWizardMode = agentId ? "edit" : "create";
    if (agentId) selectedAgentId = agentId;
    const agent = agentId ? agentCards.find((item) => item.id === agentId) : undefined;
    agentWizardDraftName = agent?.name ?? "";
    agentWizardDraftDescription = agent?.desc ?? "";
    agentWizardVibe = agent?.vibe ?? "";
    agentWizardTab = "identity";
    agentAvatar = agent?.avatar ?? "C";
    agentProvider = agent?.provider ?? "OpenAI";
    agentModel = agent?.model ?? modelOptions.OpenAI?.[0] ?? "GPT-4o";
    setToolSelectionFromAgent(agent);
    setSkillSelectionFromAgent(agent);
    agentWizardOpen = true;
    void refreshToolStatus();
    void refreshSkillStatus();
  }
  async function refreshAgents() {
    if (!hasWailsBindings()) {
      agentCards = defaultAgentCards;
      return;
    }
    try {
      const agents = await app().ListAgents();
      agentCards = agents.length ? agents : defaultAgentCards;
      if (!agentCards.some((agent) => agent.id === selectedAgentId)) {
        selectedAgentId = agentCards[0]?.id ?? "";
      }
      downloadedMarketAgentIds = agentMarketItems.filter((item) => agentCards.some((agent) => agent.id === item.id)).map((item) => item.id);
    } catch (error) {
      console.error("Failed to load agents", error);
      agentCards = defaultAgentCards;
    }
  }
  async function refreshTodos() {
    const todoApi = todoPersistenceBindings();
    if (typeof todoApi?.ListTodos !== "function") return;
    try {
      const todos = await todoApi.ListTodos();
      todoItems = Array.isArray(todos) ? todos : [];
    } catch (error) {
      console.error("Failed to load todos", error);
    }
  }
  async function refreshProjects() {
    const projectApi = projectPersistenceBindings();
    if (typeof projectApi?.ListWorkbenchProjects !== "function") return;
    try {
      const projects = await projectApi.ListWorkbenchProjects();
      if (!Array.isArray(projects) || !projects.length) return;
      projectCards = projects;
      const now = Date.now();
      const missingSidebarProjects = projects
        .filter((project) => !sidebarProjects.some((item) => item.id === project.id || item.name === project.name))
        .map((project) => ({ id: project.id, name: project.name, updatedAtMs: now, expanded: false, conversations: [] as SidebarConversation[] }));
      if (missingSidebarProjects.length) sidebarProjects = [...sidebarProjects, ...missingSidebarProjects];
      if (selectedProjectId && !projects.some((project) => project.id === selectedProjectId)) selectedProjectId = projects[0]?.id ?? "";
    } catch (error) {
      console.error("Failed to load projects", error);
    }
  }
  async function refreshProjectMaterials() {
    const materialApi = projectMaterialPersistenceBindings();
    if (typeof materialApi?.ListProjectMaterials !== "function") return;
    try {
      const materials = await materialApi.ListProjectMaterials();
      if (Array.isArray(materials)) projectMaterialRows = materials;
    } catch (error) {
      console.error("Failed to load project materials", error);
    }
  }
  async function refreshAutomations() {
    const automationApi = automationPersistenceBindings();
    if (typeof automationApi?.ListAutomations !== "function") return;
    try {
      const automations = await automationApi.ListAutomations();
      if (Array.isArray(automations) && automations.length) runningAutomations = automations;
    } catch (error) {
      console.error("Failed to load automations", error);
    }
  }
  async function refreshWorkbenchData() {
    const workbenchApi = workbenchDataPersistenceBindings();
    if (typeof workbenchApi?.ListWorkbenchData !== "function") {
      await refreshKnowledgeBase();
      return;
    }
    try {
      const data = await withTimeout(workbenchApi.ListWorkbenchData(), "workbench data refresh timed out", 8_000);
      if (Array.isArray(data.customers) && data.customers.length) customerCards = data.customers;
      if (Array.isArray(data.calendarEvents) && data.calendarEvents.length) calendarEvents = data.calendarEvents;
      if (Array.isArray(data.reports) && data.reports.length) reportCards = data.reports;
      if (Array.isArray(data.knowledgeDocuments) && data.knowledgeDocuments.length) documentItems = data.knowledgeDocuments;
      if (Array.isArray(data.regulations) && data.regulations.length) regulationItems = data.regulations;
      if (Array.isArray(data.syncJobs) && data.syncJobs.length) syncJobs = data.syncJobs;
      if (Array.isArray(data.operationLogs) && data.operationLogs.length) operationLogs = data.operationLogs;
      if (Array.isArray(data.teamRooms) && data.teamRooms.length) teamRooms = data.teamRooms;
      if (Array.isArray(data.teamRuns)) teamRuns = data.teamRuns;
      if (Array.isArray(data.teamChatMessages) && data.teamChatMessages.length) teamChatMessages = data.teamChatMessages;
      if (!customerCards.some((customer) => customer.id === selectedCustomerId)) selectedCustomerId = customerCards[0]?.id ?? "";
      if (!teamRooms.some((team) => team.title === selectedTeamTitle)) selectedTeamTitle = teamRooms[0]?.title ?? "";
      await refreshKnowledgeBase();
      await runWorkbenchSearch(resourceSearch);
    } catch (error) {
      console.error("Failed to load workbench data", error);
    }
  }
  async function saveAgentWizard() {
    const name = agentWizardDraftName.trim();
    if (!name) return;
    const current = agentWizardMode === "edit" ? agentCards.find((agent) => agent.id === selectedAgentId) : undefined;
    const input: AgentInput = {
      id: current?.id,
      name,
      role: current?.role ?? "自定义",
      status: current?.status ?? "已启用",
      desc: agentWizardDraftDescription.trim(),
      avatar: agentAvatar,
      vibe: agentWizardVibe,
      provider: agentProvider,
      model: agentModel,
      tools: toolCards.filter((tool) => tool.active).map((tool) => tool.title),
      skills: skillCards.filter((skill) => skill.active).map((skill) => skill.title),
      coreFiles: current?.coreFiles ?? coreFiles,
    };
    if (!hasWailsBindings()) {
      const now = new Date().toISOString();
      const localAgent: AgentView = { ...input, id: input.id || `agent-${Date.now()}`, role: input.role || "自定义", status: input.status || "已启用", desc: input.desc || "尚未分配具体职能。", runs: current?.runs ?? 0, tools: input.tools ?? [], skills: input.skills ?? [], coreFiles: input.coreFiles ?? [], builtIn: current?.builtIn ?? false, createdAt: current?.createdAt ?? now, updatedAt: now };
      agentCards = current ? agentCards.map((agent) => agent.id === current.id ? localAgent : agent) : [localAgent, ...agentCards];
      selectedAgentId = localAgent.id;
      agentWizardOpen = false;
      return;
    }
    try {
      const saved = await app().SaveAgent(input);
      selectedAgentId = saved.id;
      await refreshAgents();
      agentWizardOpen = false;
    } catch (error) {
      console.error("Failed to save agent", error);
    }
  }
  function filteredAgentMarketItems() {
    const keyword = agentMarketSearch.trim().toLowerCase();
    if (!keyword) return agentMarketItems;
    return agentMarketItems.filter((item) => [item.name, item.category, item.desc, item.source, item.version, ...item.tags].some((value) => value.toLowerCase().includes(keyword)));
  }
  function marketAgentDownloaded(item: AgentMarketItem) {
    return downloadedMarketAgentIds.includes(item.id) || agentCards.some((agent) => agent.id === item.id);
  }
  async function downloadMarketAgent(item: AgentMarketItem) {
    if (!agentCards.some((agent) => agent.id === item.id)) {
      const marketAgent: AgentInput = { id: item.id, name: item.name, role: item.role, status: "已下载", desc: item.desc, avatar: item.name.slice(0, 1), provider: "OpenAI", model: modelOptions.OpenAI?.[0] ?? "GPT-4o", tools: [], skills: item.tags, coreFiles: [] };
      if (hasWailsBindings()) {
        try {
          await app().SaveAgent(marketAgent);
          await refreshAgents();
        } catch (error) {
          console.error("Failed to persist market agent", error);
        }
      } else {
        const now = new Date().toISOString();
        agentCards = [{ ...marketAgent, id: item.id, role: item.role, runs: 0, status: "已下载", desc: item.desc, tools: [], skills: item.tags, coreFiles: [], builtIn: false, createdAt: now, updatedAt: now }, ...agentCards];
      }
    }
    if (!downloadedMarketAgentIds.includes(item.id)) downloadedMarketAgentIds = [...downloadedMarketAgentIds, item.id];
    selectedAgentId = item.id;
    const payload = {
      id: item.id,
      name: item.name,
      role: item.role,
      category: item.category,
      version: item.version,
      desc: item.desc,
      tags: item.tags,
      installedAt: new Date().toISOString(),
      localPath: item.localPath,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${item.id}.agent.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
  function capabilityLabel(kind: CapabilityTab) { return kind === "plugin" ? "插件" : kind === "mcp" ? "MCP" : "SKILL"; }
  function capabilityCreateLabel(kind: CapabilityTab) { return kind === "plugin" ? "创建插件" : kind === "mcp" ? "创建MCP" : "创建SKILL"; }
  function capabilitySubtitle(kind: CapabilityTab) {
    if (kind === "plugin") return "本地插件包、工作台插件和启用状态";
    if (kind === "mcp") return "MCP Server、连接器和授权状态";
    return "Skill 包、版本来源和 Agent 挂载";
  }
  function pluginToCapability(plugin: WorkbenchPlugin): CapabilityItem {
    return {
      id: plugin.id,
      name: plugin.name || plugin.id,
      desc: plugin.capabilities?.length ? plugin.capabilities.join(" / ") : `${plugin.kind || "plugin"} 工作台插件`,
      status: plugin.enabled ? "已启用" : "未启用",
      version: plugin.version || "本地",
      source: plugin.kind || "Workbench Plugin",
      scope: plugin.providerIds?.length ? plugin.providerIds.join(" / ") : "workspace",
      sync: plugin.enabled ? "已加载" : "待启用",
      path: plugin.entry || plugin.id,
      permission: plugin.config ? Object.keys(plugin.config).join(" / ") || "按插件配置" : "按插件配置",
      enabled: plugin.enabled,
      pluginKind: plugin.kind || "native",
      pluginEntry: plugin.entry || plugin.id,
      capabilities: plugin.capabilities ?? [],
      providerIds: plugin.providerIds ?? [],
      pluginConfig: plugin.config ?? {},
    };
  }
  function installedPluginToCapability(plugin: CapabilitiesView["plugins"][number]): CapabilityItem {
    const name = plugin.name || plugin.root || "未命名插件";
    const parts = [
      plugin.skills ? `${plugin.skills} Skills` : "",
      plugin.hooks ? `${plugin.hooks} Hooks` : "",
      plugin.mcpServers ? `${plugin.mcpServers} MCP` : "",
    ].filter(Boolean);
    const warnings = plugin.warnings?.filter(Boolean) ?? [];
    return {
      id: `package:${name}`,
      name,
      desc: plugin.description || parts.join(" / ") || "本地 Codex 插件包",
      status: plugin.error ? "加载失败" : plugin.enabled ? "已安装" : "已停用",
      version: plugin.version || plugin.manifestKind || "本地",
      source: `本地插件包${plugin.manifestKind ? ` / ${plugin.manifestKind}` : ""}`,
      scope: parts.join(" / ") || "插件包",
      sync: plugin.error || warnings[0] || (plugin.enabled ? "已加载到本地运行时" : "已安装未启用"),
      path: plugin.root || plugin.source || name,
      permission: plugin.mcpServers ? "包含 MCP Server 配置" : plugin.hooks ? "包含 Hook 配置" : plugin.skills ? "包含 Skill 工作流" : "按插件清单定义",
      enabled: plugin.enabled && !plugin.error,
      readOnly: true,
    };
  }
  function mergeCapabilityItems(items: CapabilityItem[]) {
    const seen: Record<string, true> = {};
    return items.filter((item) => {
      const key = `${item.source}:${item.id}`;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }
  function mcpToCapability(server: CapabilitiesView["servers"][number]): CapabilityItem {
    const enabled = server.status === "connected" || server.status === "deferred" || server.status === "initializing";
    const status = server.status === "connected" ? "已连接" : server.status === "disabled" ? "已停用" : server.status === "failed" ? "连接失败" : server.status || "未知";
    return {
      id: server.name,
      name: server.name,
      desc: `${server.tools} tools · ${server.prompts} prompts · ${server.resources} resources`,
      status,
      version: server.transport || "mcp",
      source: server.builtIn ? "内置 MCP" : server.configured ? "配置 MCP" : "运行时 MCP",
      scope: server.tier || "workspace",
      sync: server.error || server.authStatus || status,
      path: server.command || server.url || server.name,
      permission: server.envKeys?.length ? `环境变量：${server.envKeys.join(" / ")}` : server.authConfigured ? "已配置授权" : "按 MCP 配置",
      enabled,
    };
  }
  function skillToCapability(skill: CapabilitiesView["skills"][number]): CapabilityItem {
    const displayName = skill.displayName?.trim() || skill.name;
    return {
      id: skill.name,
      name: displayName,
      desc: skill.description || "Skill 工作流",
      status: skill.enabled ? "已加载" : "未启用",
      version: skill.scope || "skill",
      source: skill.runAs || "Codex Skill",
      scope: skill.scope || "global",
      sync: skill.enabled ? "可调用" : "待启用",
      path: skill.name,
      permission: skill.runAs || "按 Skill 定义",
      enabled: skill.enabled,
    };
  }
  async function refreshCapabilities() {
    if (!hasWailsBindings()) {
      capabilityBuckets = defaultCapabilityBuckets;
      return;
    }
    try {
      const [plugins, capabilities] = await Promise.all([app().WorkbenchPlugins(), app().Capabilities()]);
      capabilityBuckets = {
        plugin: mergeCapabilityItems([
          ...(capabilities.plugins ?? []).map(installedPluginToCapability),
          ...plugins.map(pluginToCapability),
        ]),
        mcp: capabilities.servers.map(mcpToCapability),
        skill: capabilities.skills.map(skillToCapability),
      };
      if (!capabilityBuckets[capabilityTab].some((item) => item.id === selectedCapabilityId)) {
        selectedCapabilityId = capabilityBuckets[capabilityTab][0]?.id || "";
      }
    } catch (error) {
      console.error("Failed to refresh capabilities", error);
      capabilityBuckets = defaultCapabilityBuckets;
    }
  }
  function allCapabilities() { return [...capabilityBuckets.plugin, ...capabilityBuckets.mcp, ...capabilityBuckets.skill]; }
  function capabilityEnabledCount() { return allCapabilities().filter((item) => item.enabled).length; }
  function currentCapabilityList() { return capabilityBuckets[capabilityTab]; }
  function currentCapability() { return currentCapabilityList().find((item) => item.id === selectedCapabilityId) ?? currentCapabilityList()[0]; }
  function filteredCapabilities() {
    const keyword = capabilitySearch.trim().toLowerCase();
    if (!keyword) return currentCapabilityList();
    return currentCapabilityList().filter((item) => [item.name, item.desc, item.status, item.source, item.scope, item.path].some((value) => value.toLowerCase().includes(keyword)));
  }
  function capabilityStatusTone(item: CapabilityItem) {
    if (item.enabled) return "enabled";
    if (item.status.includes("开发中")) return "pending";
    if (item.status.includes("授权") || item.sync.includes("授权")) return "auth";
    return "pending";
  }
  function capabilityActionLabel(item: CapabilityItem) {
    if (item.readOnly) return item.enabled ? "本地已安装" : "查看状态";
    if (item.enabled) return "停用";
    if (item.status.includes("开发中")) return "开发中";
    if (item.status.includes("授权") || item.sync.includes("授权")) return "授权";
    if (item.status.includes("待安装")) return "安装";
    return "启用";
  }
  function capabilityStepDone(item: CapabilityItem, index: number) {
    if (item.enabled) return true;
    const currentIndex = item.status.includes("授权") ? 2 : item.status.includes("配置") ? 1 : 0;
    return index <= currentIndex;
  }
  function capabilityChoiceEnabled(value: string) {
    const text = value.trim().toLowerCase();
    return text === "启用" || text === "enabled" || text === "true";
  }
  function capabilitySlug(value: string, fallback: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || fallback;
  }
  function capabilityDescriptionParts(value: string) {
    return value.split(/[\n,，/]/).map((item) => item.trim()).filter(Boolean);
  }
  function capabilityStringConfig(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, raw]) => [key, typeof raw === "string" ? raw : JSON.stringify(raw)]));
  }
  function parseCapabilityMCPArgs(value: string) {
    const text = value.trim();
    if (!text) return [];
    if (text.startsWith("[")) {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(String);
      throw new Error("MCP args must be a JSON array");
    }
    return text.split(/\r?\n/).flatMap((line) => line.trim().split(/\s+/)).filter(Boolean);
  }
  function parseCapabilityMCPEnv(value: string) {
    const env: Record<string, string> = {};
    for (const raw of value.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const index = line.indexOf("=");
      if (index <= 0) throw new Error(`Invalid MCP env line: ${line}`);
      env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    }
    return env;
  }
  function capabilityPluginInput(item: CapabilityItem, enabled = item.enabled): WorkbenchPluginInput {
    return {
      id: item.id,
      name: item.name,
      kind: item.pluginKind || item.source || "native",
      entry: item.pluginEntry || item.path || item.id,
      version: item.version || "v0.1",
      capabilities: item.capabilities?.length ? item.capabilities : capabilityDescriptionParts(item.desc),
      providerIds: item.providerIds?.length ? item.providerIds : item.scope && item.scope !== "workspace" ? capabilityDescriptionParts(item.scope) : [],
      config: item.pluginConfig ?? (item.permission && !item.permission.includes("按") ? { permission: item.permission } : {}),
      enabled,
    };
  }
  function agentInputWithCapability(agent: AgentView, item: CapabilityItem, bound: boolean): AgentInput {
    const tools = new Set(agent.tools ?? []);
    const skills = new Set(agent.skills ?? []);
    const target = item.name || item.id;
    if (capabilityTab === "skill") {
      bound ? skills.add(target) : skills.delete(target);
    } else {
      bound ? tools.add(target) : tools.delete(target);
    }
    return {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      status: agent.status,
      desc: agent.desc,
      avatar: agent.avatar ?? agent.name.slice(0, 1),
      vibe: agent.vibe ?? "",
      provider: agent.provider ?? "OpenAI",
      model: agent.model ?? agentModel,
      tools: [...tools],
      skills: [...skills],
      coreFiles: agent.coreFiles ?? [],
    };
  }
  async function toggleCapabilityEnabled(item = currentCapability()) {
    if (!item) return;
    if (!hasWailsBindings()) {
      showWorkbenchNotice("当前环境未连接桌面后端，无法更新能力状态。");
      return;
    }
    if (item.readOnly && capabilityTab === "plugin") {
      showWorkbenchNotice("本地插件包状态来自插件清单，请在插件配置中启停。");
      return;
    }
    const enabled = !item.enabled;
    try {
      if (capabilityTab === "plugin") {
        await app().SaveWorkbenchPlugin(capabilityPluginInput(item, enabled));
      } else if (capabilityTab === "mcp") {
        await app().SetMCPServerEnabled(item.id, enabled);
      } else {
        await app().SetSkillEnabled(item.name, enabled);
        await app().RefreshSkills();
      }
      await refreshCapabilities();
      await refreshSkillStatus();
      showWorkbenchNotice(`${item.name} 已${enabled ? "启用" : "停用"}。`);
    } catch (error) {
      console.error("Failed to toggle capability", error);
      showWorkbenchNotice("更新能力状态失败，请检查配置或当前会话状态。");
    }
  }
	function isCloudflareDropCapability(item?: CapabilityItem) {
		return capabilityTab === "plugin" && item?.id === "cloudflare-drop-publish";
	}
	async function pickCloudflareDropSource(kind: "folder" | "zip") {
		if (!hasWailsBindings()) {
			showWorkbenchNotice("当前环境未连接桌面后端，无法执行本地预检。");
			return;
		}
		cloudflareDropWorking = true;
		try {
			const preflight = kind === "folder"
				? await app().PickCloudflareDropFolder()
				: await app().PickCloudflareDropZIP();
			if (!preflight.sourceName) return;
			cloudflareDropPreflight = preflight;
			cloudflareDropJob = undefined;
			cloudflareDropPreviewURL = "";
			showWorkbenchNotice(cloudflareDropPreflight.valid ? "本地预检通过；下一步可创建发布流程。" : "本地预检未通过，请修正后重新选择。");
		} catch (error) {
			console.error("Failed to preflight Cloudflare Drop source", error);
			showWorkbenchNotice(`本地预检失败：${formatErrorMessage(error)}`);
		} finally {
			cloudflareDropWorking = false;
		}
	}
	async function createCloudflareDropJob() {
		const preflight = cloudflareDropPreflight;
		if (!preflight?.valid || !hasWailsBindings()) {
			showWorkbenchNotice("请先完成通过的本地预检。");
			return;
		}
		cloudflareDropWorking = true;
		try {
			cloudflareDropJob = await app().CreateWorkbenchJob({
				pluginId: "cloudflare-drop-publish",
				kind: "static-preview",
				scenario: "Cloudflare Drop 静态预览",
				mode: "manual",
				metadata: {
					sourceName: preflight.sourceName,
					sourceType: preflight.sourceType,
					preflight,
					handoff: "official-page",
				},
				steps: [
					{
						id: "local-preflight",
						name: "本地预检",
						status: "done",
						input: { sourceName: preflight.sourceName, sourceType: preflight.sourceType },
						output: { ...preflight },
					},
					{ id: "web-handoff", name: "网页内重新选择并发布" },
					{ id: "preview-url", name: "记录最终预览 URL（可选）" },
				],
			});
			showWorkbenchNotice("发布流程已保存；打开官网后请在网页内重新选择源文件。");
		} catch (error) {
			console.error("Failed to create Cloudflare Drop job", error);
			showWorkbenchNotice(`创建发布流程失败：${formatErrorMessage(error)}`);
		} finally {
			cloudflareDropWorking = false;
		}
	}
	async function handoffToCloudflareDrop() {
		if (!cloudflareDropJob || !hasWailsBindings()) {
			showWorkbenchNotice("请先创建发布流程。");
			return;
		}
		cloudflareDropWorking = true;
		try {
			await app().OpenCloudflareDrop();
			cloudflareDropJob = await app().UpdateWorkbenchStep(cloudflareDropJob.id, "web-handoff", {
				status: "done",
				output: { destination: "Cloudflare Drop official page", sourceSelection: "在网页内重新选择源文件" },
			});
			showWorkbenchNotice("已打开官方 Drop 页面；请自行选择源文件、确认条款并发布。");
		} catch (error) {
			console.error("Failed to open Cloudflare Drop", error);
			showWorkbenchNotice(`打开官方页面失败：${formatErrorMessage(error)}`);
		} finally {
			cloudflareDropWorking = false;
		}
	}
	async function saveCloudflareDropPreviewURL() {
		if (!cloudflareDropJob || !hasWailsBindings()) {
			showWorkbenchNotice("请先创建发布流程。");
			return;
		}
		const previewURL = cloudflareDropPreviewURL.trim();
		try {
			const parsed = new URL(previewURL);
			if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("URL 必须使用 HTTP 或 HTTPS");
			cloudflareDropJob = await app().UpdateWorkbenchStep(cloudflareDropJob.id, "preview-url", {
				status: "done",
				output: { previewURL },
			});
			showWorkbenchNotice("最终预览 URL 已记录到发布流程；VoltUI 不会访问或打开该 URL。");
		} catch (error) {
			showWorkbenchNotice(`无法记录预览 URL：${formatErrorMessage(error)}`);
		}
	}
  function openCapabilityImportPicker() {
    capabilityImportInput?.click();
  }
  async function handleCapabilityImportFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (!hasWailsBindings()) {
      showWorkbenchNotice("当前环境未连接桌面后端，无法导入能力配置。");
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed.capabilities) ? parsed.capabilities : [parsed];
      let count = 0;
      for (const item of items) {
        if (await importCapabilityConfig(item)) count += 1;
      }
      await refreshCapabilities();
      await refreshSkillStatus();
      showWorkbenchNotice(`已导入 ${count} 条能力配置。`);
    } catch (error) {
      console.error("Failed to import capability config", error);
      showWorkbenchNotice("导入配置失败，请确认 JSON 格式和字段。");
    }
  }
  async function importCapabilityConfig(raw: unknown) {
    if (!raw || typeof raw !== "object") return false;
    const item = raw as Record<string, unknown>;
    const type = String(item.type ?? item.kind ?? capabilityTab).toLowerCase();
    const name = String(item.name ?? item.id ?? "").trim();
    if (!name) return false;
    const enabled = typeof item.enabled === "boolean" ? item.enabled : capabilityChoiceEnabled(String(item.status ?? "启用"));
    if (type.includes("mcp")) {
      const rawTransport = String(item.transport ?? item.type ?? "stdio").trim().toLowerCase();
      const transport = rawTransport === "streamable-http" ? "http" : rawTransport;
      if (transport !== "stdio" && transport !== "http" && transport !== "sse") {
        throw new Error(`不支持的 MCP 传输方式：${rawTransport || "stdio"}`);
      }
      const mcpInput: MCPServerInput = {
        name,
        transport,
        command: String(item.command ?? item.entry ?? ""),
        args: stringList(item.args),
        url: String(item.url ?? ""),
        env: stringRecord(item.env),
        headers: stringRecord(item.headers),
        trustedReadOnlyTools: stringList(item.trusted_read_only_tools ?? item.trustedReadOnlyTools),
        tier: String(item.tier ?? item.scope ?? "workspace"),
        enabled,
      };
      await app().AddMCPServer(mcpInput);
      return true;
    }
    if (type.includes("skill")) {
      await app().CreateSkillPackage({
        name,
        description: String(item.description ?? item.desc ?? ""),
        runAs: String(item.runAs ?? item.scope ?? "workflow"),
        enabled,
      });
      return true;
    }
    const capabilities = Array.isArray(item.capabilities) ? item.capabilities.map(String) : capabilityDescriptionParts(String(item.description ?? item.desc ?? ""));
    await app().SaveWorkbenchPlugin({
      id: String(item.id ?? capabilitySlug(name, `plugin-${Date.now()}`)),
      name,
      kind: String(item.kind ?? "native"),
      entry: String(item.entry ?? item.path ?? name),
      version: String(item.version ?? "v0.1"),
      capabilities,
      providerIds: Array.isArray(item.providerIds) ? item.providerIds.map(String) : [],
      config: capabilityStringConfig(item.config),
      enabled,
    });
    return true;
  }
  function resetCapabilityCreateForm(kind: CapabilityTab) {
    capabilityCreateName = `新建${capabilityLabel(kind)}`;
    capabilityCreateGroup = kind === "mcp" ? "stdio" : capabilityLabel(kind);
    capabilityCreateVersion = "v0.1";
    capabilityCreateScope = kind === "mcp" ? "background" : kind === "skill" ? "workflow" : "desktop/frontend";
    capabilityCreateEntry = kind === "mcp" ? "" : kind === "skill" ? "SKILL.md" : "plugin.json";
    capabilityCreateTransport = "stdio";
    capabilityCreateArgs = "";
    capabilityCreateStatus = "启用";
    capabilityCreateMcpEnv = "";
    capabilityCreateDescription =
      kind === "skill"
        ? "描述 Skill 的使用场景、输入输出、执行步骤和注意事项。"
        : `${capabilitySubtitle(kind)}：先登记元数据，再配置权限，最后挂载到 Agent 与新建对话。`;
  }
  function switchCapabilityTab(kind: CapabilityTab) { capabilityTab = kind; capabilitySearch = ""; selectedCapabilityId = capabilityBuckets[kind][0]?.id || ""; capabilityDetailOpen = false; if (capabilityCreateOpen) resetCapabilityCreateForm(kind); }
  function startCapabilityCreate(kind: CapabilityTab) { switchCapabilityTab(kind); resetCapabilityCreateForm(kind); openWorkLayer("capabilities"); capabilityCreateOpen = true; }
  function openMCPConfigImport() {
    switchCapabilityTab("mcp");
    capabilityCreateOpen = false;
    capabilityImportText = "";
    capabilityImportOpen = true;
  }
  function stringRecord(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  }
  function stringList(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
  }
  function parseMCPConfig(raw: string): MCPServerInput[] {
    let document: unknown;
    try {
      document = JSON.parse(raw);
    } catch {
      throw new Error("配置不是有效的 JSON。");
    }
    if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error("配置根节点必须是对象。");
    const servers = (document as Record<string, unknown>).mcpServers;
    if (!servers || typeof servers !== "object" || Array.isArray(servers)) throw new Error("未找到 mcpServers 配置对象。");
    const entries = Object.entries(servers as Record<string, unknown>);
    if (!entries.length) throw new Error("mcpServers 中没有可导入的服务。");
    return entries.map(([name, value]) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`MCP ${name} 的配置必须是对象。`);
      const spec = value as Record<string, unknown>;
      const rawTransport = typeof spec.type === "string" ? spec.type.trim().toLowerCase() : "stdio";
      const transport = rawTransport === "streamable-http" ? "http" : rawTransport;
      if (transport !== "stdio" && transport !== "http" && transport !== "sse") throw new Error(`MCP ${name} 使用了不支持的传输方式：${rawTransport || "stdio"}。`);
      const command = typeof spec.command === "string" ? spec.command.trim() : "";
      const url = typeof spec.url === "string" ? spec.url.trim() : "";
      if (transport === "stdio" && !command) throw new Error(`MCP ${name} 缺少 stdio 启动命令。`);
      if (transport !== "stdio" && !url) throw new Error(`MCP ${name} 缺少服务 URL。`);
      return {
        name: name.trim(),
        transport,
        command,
        args: stringList(spec.args),
        url,
        env: stringRecord(spec.env),
        headers: stringRecord(spec.headers),
        trustedReadOnlyTools: stringList(spec.trusted_read_only_tools ?? spec.trustedReadOnlyTools),
        tier: "workspace",
      };
    }).filter((entry) => entry.name);
  }
  async function handleMCPConfigFileChange(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      capabilityImportText = await file.text();
    } catch (error) {
      showWorkbenchNotice(`读取配置文件失败：${formatErrorMessage(error)}`);
    }
  }
  async function submitMCPConfigImport() {
    let entries: MCPServerInput[];
    try {
      entries = parseMCPConfig(capabilityImportText.trim());
    } catch (error) {
      showWorkbenchNotice(formatErrorMessage(error));
      return;
    }
    if (!hasWailsBindings()) {
      showWorkbenchNotice("请在 Volt GUI 桌面端导入 MCP 配置。");
      return;
    }
    const failures: string[] = [];
    for (const entry of entries) {
      try {
        await app().AddMCPServer(entry);
      } catch (error) {
        console.error("Failed to import MCP server", entry.name, error);
        failures.push(entry.name);
      }
    }
    await refreshCapabilities();
    capabilityImportOpen = false;
    showWorkbenchNotice(failures.length ? `已提交 ${entries.length} 个 MCP 配置；${failures.join("、")} 连接失败，可在列表中查看并重试。` : `已导入 ${entries.length} 个 MCP 配置。`);
  }
  async function submitCapabilityCreate() {
    const name = capabilityCreateName.trim();
    if (!name) {
      showWorkbenchNotice("请填写 MCP 或能力名称。");
      return;
    }
    const enabled = capabilityChoiceEnabled(capabilityCreateStatus);
    try {
      if (capabilityTab === "plugin") {
        const input: WorkbenchPluginInput = { id: capabilitySlug(name, `plugin-${Date.now()}`), name, kind: capabilityCreateGroup.trim() || "native", entry: capabilityCreateEntry.trim() || name, version: capabilityCreateVersion.trim() || "v0.1", capabilities: capabilityDescriptionParts(capabilityCreateDescription), enabled };
        await app().SaveWorkbenchPlugin(input);
      } else if (capabilityTab === "mcp") {
        const entry = capabilityCreateEntry.trim();
        if (!entry) {
          showWorkbenchNotice(capabilityCreateTransport === "stdio" ? "请填写 MCP 启动命令。" : "请填写 MCP 服务 URL。");
          return;
        }
        await app().AddMCPServer({
          name,
          transport: capabilityCreateTransport,
          command: capabilityCreateTransport === "stdio" ? entry : "",
          args: capabilityCreateTransport === "stdio" ? parseCapabilityMCPArgs(capabilityCreateArgs) : [],
          url: capabilityCreateTransport === "stdio" ? "" : entry,
          env: parseCapabilityMCPEnv(capabilityCreateMcpEnv),
          headers: {},
          trustedReadOnlyTools: [],
          tier: "background",
          enabled,
        });
      } else {
        const input: SkillPackageInput = { name, description: capabilityCreateDescription.trim(), runAs: capabilityCreateScope.trim() || "workflow", enabled };
        await app().CreateSkillPackage(input);
      }
      capabilityCreateOpen = false;
      await refreshCapabilities();
      await refreshSkillStatus();
      showWorkbenchNotice(capabilityTab === "mcp" ? `已创建 MCP：${name}` : `已创建${capabilityLabel(capabilityTab)}：${name}`);
    } catch (error) {
      console.error("Failed to create capability", error);
      await refreshCapabilities();
      await refreshSkillStatus();
      if (capabilityTab === "mcp") {
        const saved = capabilityBuckets.mcp.some((item) => item.id === name);
        showWorkbenchNotice(saved ? `MCP 已保存，但当前连接失败：${formatErrorMessage(error)}` : `创建 MCP 失败：${formatErrorMessage(error)}`);
      } else {
        showWorkbenchNotice(`创建${capabilityLabel(capabilityTab)}失败：${formatErrorMessage(error)}`);
      }
    }
  }
  function configDialogIntro() {
    if (configDialog === "project") return "对标 CreateMatterDialog：记录项目名称、客户、阶段、负责人和初始任务。";
    if (configDialog === "customer") return "对标 CreateClientDialog：记录客户类型、联系方式、风险等级和关联项目。";
    if (configDialog === "schedule") return "对标 CreateScheduleDialog：支持关联项目、客户和提醒时间。";
    if (configDialog === "todo") return "对标 CreateTodoDialog：设置优先级、截止时间和执行 Agent。";
    if (configDialog === "team") return "配置协作组：选择成员、协调者、共享上下文和运行目标。";
    if (configDialog === "model") return "对标 AddModelDialog：设置 provider、base URL、API Key 和可用模型。";
    if (configDialog === "ingest") return "对标 BatchImportDialog：选择来源、分类、去重和索引策略。";
    if (configDialog === "knowledge") return "直接写入本地知识库：填写标题、标签和正文后建立 SQLite + FTS5 + sqlite-vec 索引，突出本地全文检索与向量相似度检索。";
    if (configDialog === "distill") return "对标 DistillWizard：从历史任务中提炼新 Agent 的身份、技能和工具。";
    return "在工作台中创建、导入或配置资源。";
  }

  function mergeStreamingText(existing: string, incoming: string) {
    if (!incoming) return existing;
    if (!existing) return incoming;
    if (incoming.startsWith(existing)) return incoming;
    if (existing.endsWith(incoming)) return existing;
    const maxOverlap = Math.min(existing.length, incoming.length);
    for (let length = maxOverlap; length > 0; length -= 1) {
      if (existing.endsWith(incoming.slice(0, length))) {
        return existing + incoming.slice(length);
      }
    }
    return existing + incoming;
  }

  function updateLastAssistant(text: string) {
    let current: TranscriptItem | undefined;
    for (let index = transcript.length - 1; index >= 0; index -= 1) {
      const item = transcript[index];
      if (item.role === "assistant" && item.pending) {
        current = item;
        break;
      }
    }
    if (current) {
      current.body = mergeStreamingText(current.body, text);
      saveActiveSidebarConversationTranscript();
      scrollConversationToBottom();
      return;
    }
    appendTranscript({ id: `assistant-${Date.now()}`, role: "assistant", body: text, pending: true });
  }

  function finishTurnWithError(message: string) {
    const lastAssistant = [...transcript].reverse().find((item) => item.role === "assistant" && item.pending);
    if (lastAssistant && !lastAssistant.body.trim()) {
      lastAssistant.role = "notice";
      lastAssistant.title = "请求失败";
      lastAssistant.body = message;
      lastAssistant.pending = false;
      saveActiveSidebarConversationTranscript();
      scrollConversationToBottom();
      return;
    }
    appendTranscript({ id: `error-${Date.now()}`, role: "notice", title: "请求失败", body: message });
  }

  function isTurnAlreadyRunningError(message: string) {
    return message.toLowerCase().includes("turn already running");
  }

  function isWorkspaceStillStartingError(message: string) {
    return message.toLowerCase().includes("workspace is still starting");
  }

  function isCancellationError(message: string) {
    const normalized = message.trim().toLowerCase();
    return normalized === "context canceled" || normalized === "context cancelled" || normalized === "operation canceled" || normalized === "operation cancelled" || normalized === "canceled" || normalized === "cancelled";
  }

  function formatErrorMessage(error: unknown) {
    if (error instanceof Error && error.message.trim()) return error.message;
    if (typeof error === "string" && error.trim()) return error;
    return "发送失败，请检查当前会话是否已启动，或稍后重试。";
  }

  function toolTranscriptId(id?: string) {
    return `tool-${id ?? Date.now()}`;
  }

  async function loadArchivedToolEvidence(item: TranscriptItem) {
    const toolID = item.toolId?.trim();
    const tabID = currentTranscriptTabId();
    if (!item.archived || item.archiveLoaded || item.archiveLoading || !toolID || !tabID) return;

    updateTranscriptItem(item.id, { archiveLoading: true, archiveLoadError: undefined });
    try {
      if (!hasWailsBindings()) throw new Error("归档详情只能在桌面端会话中加载。");
      const evidence = await app().ToolResultForTab(tabID, toolID);
      if (!evidence) throw new Error("归档详情当前不可用。");
      if (currentTranscriptTabId() !== tabID) return;
      updateTranscriptItem(item.id, {
        body: evidence.args || item.body,
        toolOutput: evidence.output,
        archiveLoading: false,
        archiveLoaded: true,
        archiveLoadError: undefined,
      });
    } catch (error) {
      if (currentTranscriptTabId() !== tabID) return;
      updateTranscriptItem(item.id, {
        archiveLoading: false,
        archiveLoadError: formatErrorMessage(error),
      });
    }
  }

  function historyToTranscript(messages: HistoryMessage[]): TranscriptItem[] {
    const toolResults = new Map(messages
      .filter((message) => message.role === "tool" && Boolean(message.toolCallId))
      .map((message) => [message.toolCallId as string, message]));
    const restored: TranscriptItem[] = [];

    for (const [index, message] of messages.entries()) {
      const hasContent = message.content.trim() !== "";
      const hasReasoning = (message.reasoning ?? "").trim() !== "";
      if (message.role === "user" && hasContent) {
        restored.push({
          id: `history-${index}`,
          role: "user",
          body: stripComposerContextPrefix(message.content),
          pending: false,
        });
        continue;
      }
      if (message.role === "assistant") {
        if (hasContent || hasReasoning) {
          restored.push({
            id: `history-${index}`,
            role: "assistant",
            body: message.content,
            title: message.reasoning ? "assistant + reasoning" : undefined,
            pending: false,
          });
        }
        for (const [toolIndex, call] of (message.toolCalls ?? []).entries()) {
          const result = call.id ? toolResults.get(call.id) : undefined;
          const archived = Boolean(result?.toolResultArchived || call.argumentsArchived);
          restored.push({
            id: `history-tool-${index}-${call.id || toolIndex}`,
            role: "tool",
            title: call.name || result?.toolName || "tool",
            body: call.arguments || "",
            pending: false,
            toolSubject: call.subject,
            toolSummary: call.summary,
            toolId: call.id || undefined,
            toolOutput: archived && !result?.toolResultError ? undefined : result?.content || undefined,
            error: result?.toolResultError,
            archived,
          });
        }
        continue;
      }
      if (message.role === "tool" && !message.toolCallId) {
        restored.push({
          id: `history-tool-${index}`,
          role: "tool",
          title: message.toolName || "tool",
          body: "",
          pending: false,
          toolOutput: message.content || undefined,
          error: message.toolResultError,
          archived: Boolean(message.toolResultArchived),
        });
      }
    }
    return restored.length ? restored : welcomeTranscript();
  }

  function historyHasVisibleContent(messages: HistoryMessage[]) {
    return messages.some((message) => {
      const hasContent = message.content.trim() !== "";
      const hasReasoning = (message.reasoning ?? "").trim() !== "";
      return (message.role === "user" && hasContent) || (message.role === "assistant" && (hasContent || hasReasoning || (message.toolCalls?.length ?? 0) > 0)) || message.role === "tool";
    });
  }

  async function hydrateHistory(tab: TabMeta, options: { preserveLocalWhenEmpty?: boolean } = {}) {
    const history = await app().HistoryForTab(tab.id);
    if (options.preserveLocalWhenEmpty && !historyHasVisibleContent(history) && transcriptHasContent(transcript)) {
      scrollConversationToBottom("auto");
      return;
    }
    transcript = historyToTranscript(history);
    pendingApproval = undefined;
    pendingAsk = undefined;
    scrollConversationToBottom("auto");
  }

  function handleEvent(event: WireEvent) {
    updateEventTabRunning(event);
    if (!shouldDisplayWireEvent(event)) return;
    if (event.kind === "turn_started") {
      sending = true;
      if (event.tabId) {
        tabs = tabs.map((tab) => (tab.id === event.tabId ? { ...tab, running: true } : tab));
      }
      pendingApproval = undefined;
      pendingAsk = undefined;
      ensurePendingAssistant();
    }
    if (event.kind === "reasoning" && event.reasoning) {
      appendTranscript({ id: `reasoning-${Date.now()}`, role: "reasoning", title: t.transcript.reasoning, body: event.reasoning, pending: true });
    }
    if ((event.kind === "text" || event.kind === "message") && event.text) {
      if (pendingTextTabId && event.tabId && pendingTextTabId !== event.tabId) pendingTextBuffer = "";
      pendingTextTabId = event.tabId ?? "";
      pendingTextBuffer = mergeStreamingText(pendingTextBuffer, event.text);
      scheduleTextFlush();
    }
    if (event.kind === "tool_dispatch" && event.tool) {
      const id = toolTranscriptId(event.tool.id);
      const existing = transcript.find((item) => item.id === id);
      const now = Date.now();
      if (existing) {
        existing.title = event.tool.name;
        existing.body = event.tool.args ?? existing.body;
        existing.toolId = event.tool.id;
        existing.pending = true;
        existing.readOnly = event.tool.readOnly;
        existing.parentId = event.tool.parentId ? toolTranscriptId(event.tool.parentId) : undefined;
        existing.updatedAtMs = now;
        scrollConversationToBottom();
        return;
      }
      appendTranscript({
        id,
        role: "tool",
        title: event.tool.name,
        body: event.tool.args ?? "",
        toolId: event.tool.id,
        pending: true,
        createdAtMs: now,
        updatedAtMs: now,
        readOnly: event.tool.readOnly,
        parentId: event.tool.parentId ? toolTranscriptId(event.tool.parentId) : undefined,
      });
    }
    if (event.kind === "tool_progress" && event.tool) {
      const id = toolTranscriptId(event.tool.id);
      const now = Date.now();
      const tool = transcript.find((item) => item.id === id);
      if (!tool) {
        appendTranscript({
          id,
          role: "tool",
          title: event.tool.name,
          body: event.tool.args ?? "",
          toolId: event.tool.id,
          pending: true,
          createdAtMs: now,
          updatedAtMs: now,
          readOnly: event.tool.readOnly,
          parentId: event.tool.parentId ? toolTranscriptId(event.tool.parentId) : undefined,
          toolOutput: event.tool.output ?? "",
        });
      } else {
        tool.toolOutput = mergeStreamingText(tool.toolOutput ?? "", event.tool.output ?? "");
        tool.pending = true;
        tool.updatedAtMs = now;
        scrollConversationToBottom();
      }
    }
    if (event.kind === "tool_result" && event.tool) {
      const id = toolTranscriptId(event.tool.id);
      const now = Date.now();
      const tool = transcript.find((item) => item.id === id);
      if (!tool) {
        appendTranscript({
          id,
          role: "tool",
          title: event.tool.name,
          body: event.tool.args ?? "",
          toolId: event.tool.id,
          pending: false,
          createdAtMs: now,
          updatedAtMs: now,
          readOnly: event.tool.readOnly,
          parentId: event.tool.parentId ? toolTranscriptId(event.tool.parentId) : undefined,
          durationMs: event.tool.durationMs,
          truncated: event.tool.truncated,
          error: event.tool.err,
          toolOutput: event.tool.output,
        });
      } else {
        tool.toolId = event.tool.id;
        tool.toolOutput = mergeStreamingText(tool.toolOutput ?? "", event.tool.output ?? "");
        tool.error = event.tool.err || undefined;
        tool.durationMs = event.tool.durationMs;
        tool.truncated = event.tool.truncated;
        tool.pending = false;
        tool.updatedAtMs = now;
        scrollConversationToBottom();
      }
    }
    if (event.kind === "approval_request" && event.approval) {
      pendingApproval = event.approval;
      sending = false;
      scrollConversationToBottom();
    }
    if (event.kind === "ask_request" && event.ask) {
      pendingAsk = event.ask;
      sending = false;
      scrollConversationToBottom();
    }
    if (event.kind === "notice" && event.text) {
      appendTranscript({ id: `notice-${Date.now()}`, role: "notice", body: event.text });
    }
    if (event.kind === "turn_done") {
      sending = false;
      if (event.tabId) {
        tabs = tabs.map((tab) => (tab.id === event.tabId ? { ...tab, running: false } : tab));
      }
      if (event.err && isCancellationError(event.err)) {
        removeEmptyPendingAssistant();
      } else if (event.err) {
        finishTurnWithError(event.err);
      }
      const completedAtMs = Date.now();
      for (const item of transcript) {
        if (!item.pending) continue;
        item.pending = false;
        item.updatedAtMs = completedAtMs;
      }
      if (restoreDraftOnTurnDone && submittedDraft) {
        if (!input.trim()) input = submittedDraft.display;
        appendTranscript({ id: `draft-${Date.now()}`, role: "notice", body: "Draft restored after cancellation." });
      }
      restoreDraftOnTurnDone = false;
      submittedDraft = undefined;
      saveActiveSidebarConversationTranscript();
      scrollConversationToBottom();
    }
  }

  async function refresh() {
    loading = true;
    try {
      await settleRefreshStep("brand", refreshBrand());
      tabs = await settleRefreshStep("tabs", app().ListTabs()) ?? tabs;
      const active = tabs.find((tab) => tab.active) ?? tabs[0];
      models = active ? await settleRefreshStep("models", app().ModelsForTab(active.id)) ?? models : [];
      selectedModel = modelValue(models.find((model) => model.current)) || modelValue(models[0]);
      commands = await settleRefreshStep("commands", app().Commands()) ?? commands;
      await settleRefreshStep("model settings", refreshModelSettings());
      await settleRefreshStep("agents", refreshAgents());
      await settleRefreshStep("projects", refreshProjects());
      await settleRefreshStep("project materials", refreshProjectMaterials());
      await settleRefreshStep("todos", refreshTodos());
      await settleRefreshStep("automations", refreshAutomations());
      await settleRefreshStep("workbench data", refreshWorkbenchData());
      await settleRefreshStep("tool status", refreshToolStatus());
      await settleRefreshStep("skill status", refreshSkillStatus());
      await settleRefreshStep("capabilities", refreshCapabilities());
      if (active) await settleRefreshStep("code dock", refreshCodeDock(active));
      const hydrateTarget = activeConversationTabId ? tabs.find((tab) => tab.id === activeConversationTabId) ?? active : active;
      const preserveLocalWhenEmpty =
        Boolean(hydrateTarget) &&
        ((activityMode === "work" && workLayer === "newTask") || (activityMode === "code" && newTaskConversationActive)) &&
        transcriptHasContent(transcript);
      if (hydrateTarget) await settleRefreshStep("history", hydrateHistory(hydrateTarget, { preserveLocalWhenEmpty }));
    } finally {
      loading = false;
    }
  }


  async function refreshCodeDock(tab = activeTab) {
    if (!tab) return;
    const [nextContext, nextChanges, nextCheckpoints] = await Promise.all([
      settleRefreshStep("context panel", app().ContextPanel(tab.id)),
      settleRefreshStep("workspace changes", app().WorkspaceChanges([tab.id])),
      settleRefreshStep("checkpoints", app().CheckpointsForTab(tab.id)),
    ]);
    if (nextContext) context = nextContext;
    if (nextChanges) changes = nextChanges;
    if (nextCheckpoints) checkpoints = nextCheckpoints;
  }

  async function send(displayText?: string, submitText?: string) {
    const text = (displayText ?? input).trim();
    const submission = (submitText ?? text).trim();
    if (!text || !submission || !activeTab) return;
    if (sending) return;
    if (composerDisabledReason) {
      appendTranscript({ id: `workspace-starting-${Date.now()}`, role: "notice", body: composerDisabledReason });
      focusComposer();
      return;
    }
    if (activityMode === "work" && workLayer === "newTask") newTaskConversationActive = true;
    if (activityMode === "code") {
      newTaskConversationActive = true;
      codeWorkbenchPanel = "overview";
      codeInspectorOpen = false;
    }
    const draft = { display: text, submission };
    const userTranscriptId = `user-${Date.now()}`;
    submittedDraft = draft;
    restoreDraftOnTurnDone = false;
    sending = true;
    input = "";
    appendTranscript({ id: userTranscriptId, role: "user", body: text, createdAtMs: Date.now() });
    ensurePendingAssistant();
    if (!hasWailsBindings()) {
      updateLastAssistant("浏览器预览已收到这条消息。真实模型调用、工具执行和文件写入需要在 Wails 桌面运行环境中完成。");
      for (const item of transcript) item.pending = false;
      sending = false;
      submittedDraft = undefined;
      saveActiveSidebarConversationTranscript();
      return;
    }
    try {
      const targetTab = await ensureConversationThreadForSend(text);
      if (!targetTab) throw new Error("新对话尚未创建，请稍后重试。");
      activeConversationTabId = targetTab.id;
      await withTimeout(
        app().SubmitDisplayToTab(targetTab.id, text, submission),
        "请求超时：30 秒内未收到桌面后端响应，请稍后重试或重启桌面 dev 窗口。",
      );
    } catch (error) {
      const message = formatErrorMessage(error);
      input = "";
      submittedDraft = undefined;
      restoreDraftOnTurnDone = false;
      if (isWorkspaceStillStartingError(message)) {
        removeTranscriptItem(userTranscriptId);
        removeEmptyPendingAssistant();
        input = draft.display;
        sending = false;
        appendTranscript({ id: `workspace-starting-${Date.now()}`, role: "notice", body: "工作区正在准备中，请稍后发送" });
        void refresh();
        void tick().then(focusComposer);
        return;
      }
      if (isTurnAlreadyRunningError(message)) {
        removeEmptyPendingAssistant();
        updateTranscriptItem(userTranscriptId, { title: "user · 待发送", pending: true });
        if (!input.trim()) input = draft.display;
        sending = true;
        appendTranscript({ id: `notice-${Date.now()}`, role: "notice", body: "上一轮对话仍在运行，这条消息尚未提交给模型。已恢复到输入框；如果超过 2 分钟仍无回复，请点击停止后重新发送。" });
        return;
      }
      if (isCancellationError(message)) {
        removeTranscriptItem(userTranscriptId);
        removeEmptyPendingAssistant();
        sending = false;
        return;
      }
      removeEmptyPendingAssistant();
      sending = false;
      finishTurnWithError(message);
    }
  }

  async function cancel() {
    if (!activeTab) return;
    restoreDraftOnTurnDone = Boolean(submittedDraft);
    await app().CancelTab(activeTab.id);
  }

  function focusComposer() {
    const composer = document.querySelector<HTMLTextAreaElement>("[data-composer-input]");
    composer?.focus();
  }

  function useQuickPrompt(text: string) {
    input = text;
    focusComposer();
  }

  function handleGlobalKeydown(event: KeyboardEvent) {
    const isPrimary = event.metaKey || event.ctrlKey;
    if (isPrimary && event.key === "1") {
      event.preventDefault();
      openWorkLayer("today");
      return;
    }
    if (isPrimary && event.key === "2") {
      event.preventDefault();
      void openUnifiedCodeTask();
      return;
    }
    if (isPrimary && event.key.toLowerCase() === "k") {
      event.preventDefault();
      focusComposer();
      return;
    }
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (sending) {
      event.preventDefault();
      void cancel();
      return;
    }
    if (pendingApproval) {
      event.preventDefault();
      void answerApproval(false, false, false);
      return;
    }
    if (pendingAsk) {
      event.preventDefault();
      pendingAsk = undefined;
    }
  }

  async function switchModel(event: Event) {
    const next = (event.currentTarget as HTMLSelectElement).value;
    selectedModel = next;
    if (!hasWailsBindings()) return;
    const tabID = currentComposerTab?.id || activeTab?.id;
    if (!tabID || !next) return;
    await app().SetModelForTab(tabID, next);
    try {
      tabs = await app().ListTabs();
      models = await app().ModelsForTab(tabID);
      selectedModel = modelValue(models.find((model) => model.current)) || modelValue(models[0]) || next;
    } catch {
      // The optimistic selectedModel is still valid; the next refresh will hydrate metadata.
    }
  }

  async function setComposerWorkPermission(next: ComposerToolApprovalMode) {
    if (permissionChanging || next === composerWorkPermission) return;
    if (next === "full-access" && typeof window !== "undefined" && !window.confirm("完全访问权限会自动批准工具调用。仍可能对受保护操作请求批准。是否继续？")) return;

    if (!hasWailsBindings()) {
      previewWorkPermission = next;
      return;
    }

    const tabID = currentComposerTab?.id || activeTab?.id;
    if (!tabID) {
      showWorkbenchNotice("当前没有可设置工作权限的会话。");
      return;
    }

    const backendMode = composerToolApprovalModeToBackend(next);
    permissionChanging = true;
    try {
      await app().SetToolApprovalModeForTab(tabID, backendMode);
      tabs = tabs.map((tab) => tab.id === tabID ? { ...tab, toolApprovalMode: backendMode } : tab);
      try {
        tabs = await app().ListTabs();
      } catch {
        // The backend accepted the change; retain the confirmed local tab state
        // until the next normal refresh can read the complete tab list.
      }
    } catch (error) {
      showWorkbenchNotice(`工作权限切换失败：${formatErrorMessage(error)}`);
    } finally {
      permissionChanging = false;
    }
  }

  async function answerApproval(allow: boolean, session: boolean, persist: boolean) {
    if (!activeTab || !pendingApproval) return;
    const approval = pendingApproval;
    pendingApproval = undefined;
    await app().ApproveTab(activeTab.id, approval.id, allow, session, persist);
  }

  async function answerAsk(answers: QuestionAnswer[]) {
    if (!activeTab || !pendingAsk) return;
    const ask = pendingAsk;
    pendingAsk = undefined;
    await app().AnswerQuestionForTab(activeTab.id, ask.id, answers);
  }

  async function openCodeInspector() {
    openCodeConversation();
    codeInspectorOpen = true;
    await tick();
    if (hasWailsBindings()) await refreshCodeDock();
  }

  async function previewFile(path: string) {
    filePreview = await app().ReadFile(path);
    diffPreview = undefined;
    activityMode = "code";
    workLayer = "newTask";
    newTaskConversationActive = false;
    codeWorkbenchPanel = "workspace";
    codeInspectorOpen = false;
  }

  async function previewChange(path: string) {
    const [diff, preview] = await Promise.all([app().WorkspaceDiff(path), app().ReadFile(path)]);
    diffPreview = diff;
    filePreview = preview;
    activityMode = "code";
    workLayer = "newTask";
    newTaskConversationActive = false;
    codeWorkbenchPanel = "changes";
    codeInspectorOpen = false;
  }

  async function rewind(turn: number, scope: string) {
    const tab = activeTab;
    if (!tab) return;
    await app().Rewind(turn, scope);
    if (scope === "code" || scope === "both") {
      filePreview = undefined;
      diffPreview = undefined;
    }
    await hydrateHistory(tab);
    await refreshCodeDock(tab);
    appendTranscript({
      id: `rewind-${Date.now()}`,
      role: "notice",
      title: "rewind",
      body: t.transcript.rewound.replace("{turn}", String(turn)).replace("{scope}", scope),
    });
  }
</script>
<svelte:head>
  <title>{brandText(t.app.title)}</title>
  {#if brand.iconDataUrl}
    <link rel="icon" href={brand.iconDataUrl} />
  {/if}
</svelte:head>

<svelte:window onkeydown={handleGlobalKeydown} />

{#if needsAuth}
  <OIDCLoginOverlay onComplete={() => { needsAuth = false; void refresh(); }} />
{:else if needsAuth === null}
  <div class="boot-screen">{t.app.loading}</div>
{:else}
  <main class={["shell", sidebarCollapsed && "is-sidebar-collapsed"]} data-mode={activityMode}>
    <aside class="sidebar sidebar--aorist">
      <header class="sidebar__brand"><div class="brand-mark">{#if brandMarkSrc}<img src={brandMarkSrc} alt="" />{:else}<span>{brandInitial()}</span>{/if}</div><div class="brand-copy">{#if brandWordmarkSrc}<img class="brand-wordmark" src={brandWordmarkSrc} alt={brandName} />{:else}<strong>{brandName}</strong>{/if}<span>{brandText(workbenchModeCopy[activityMode].eyebrow)}</span></div><div class="brand-workspace-switch" role="group" aria-label="切换工作台"><button class="brand-workbench-button" class:active={activityMode === "work"} type="button" aria-label="Work 工作台" title="Work 工作台" onclick={openWorkWorkspace}><BriefcaseBusiness size={15} /></button><button class="brand-code-button" class:active={activityMode === "code"} type="button" aria-label="Code 工作台" title="Code 工作台" onclick={() => void openUnifiedCodeTask()}><Code2 size={15} /></button></div><button class="sidebar__icon" type="button" aria-label={t.home.sidebar} onclick={() => (sidebarCollapsed = !sidebarCollapsed)}><PanelLeft size={17} /></button></header>
      <nav class="workspace-nav" aria-label="工作台导航">
        {#if activityMode === "code"}
          <section class="code-repo-dock" aria-label="当前代码工作区">
            <span>Repository</span>
            <strong>{activeTab?.workspaceName || t.common.global}</strong>
            <p>{changedCount ? `${changedCount} 个变更文件` : "工作区干净"} / {context ? `${contextPercent}% context` : "context 未加载"}</p>
          </section>
          {#each codeWorkspaceNav as section, sectionIndex (indexedKey(section.title, sectionIndex))}
            <section class="code-workspace-nav-section">
              <h2>{section.title}</h2>
              {#each section.items as item, itemIndex (codeWorkspaceNavItemKey(item, itemIndex))}
                {@const Icon = navIcon(item.icon)}
                <button class="code-workspace-nav-item" class:active={isCodeWorkspaceActionActive(item.action)} type="button" onclick={() => openCodeWorkbenchAction(item.action)}>
                  <span class="nav-icon"><Icon size={15} /></span>
                  <span><strong>{item.label}</strong><em>{item.desc}</em></span>
                </button>
              {/each}
            </section>
          {/each}
        {:else}
          {#each workspaceNav as section, sectionIndex (indexedKey(section.title, sectionIndex))}
            {@const sectionCollapsed = isWorkspaceSectionCollapsed(section.title)}
            {@const sectionCollapsible = collapsibleWorkspaceSections.has(section.title)}
            <section>
              {#if sectionCollapsible}
                <button class="workspace-nav-section-head" class:collapsed={sectionCollapsed} type="button" aria-expanded={!sectionCollapsed} onclick={() => toggleWorkspaceSection(section.title)}>
                  <ChevronDown size={12} />
                  <span>{section.title}</span>
                </button>
              {:else}
                <h2>{section.title}</h2>
              {/if}
              {#if !sectionCollapsed}
                {#each section.items as item, itemIndex (workspaceNavItemKey(item, itemIndex))}
                  {@const Icon = navIcon(item.icon)}
                  <button class:active={isWorkspaceNavItemActive(item)} type="button" onclick={() => openWorkspaceNavItem(item)}>
                    <span class="nav-icon"><Icon size={15} /></span>
                    <span>{item.label}</span>
                    {#if item.badge}<em>{item.badge}</em>{/if}
                  </button>
                {/each}
              {/if}
            </section>
          {/each}
        {/if}
        {#if activityMode === "work"}
        <section class="sidebar-project-dock" data-sidebar-project-dock>
          <div class="sidebar-project-head">
            <button class="sidebar-project-section-toggle" class:expanded={!sidebarProjectDockCollapsed} type="button" aria-label={sidebarProjectDockCollapsed ? "展开项目" : "收起项目"} aria-expanded={!sidebarProjectDockCollapsed} onclick={() => (sidebarProjectDockCollapsed = !sidebarProjectDockCollapsed)}><ChevronDown size={13} /></button>
            <h2>项目</h2>
            <button class="sidebar-project-sort" type="button" aria-label={`项目排序：${sidebarProjectSortLabel()}`} onclick={cycleSidebarProjectSort}><List size={12} /><span>{sidebarProjectSortLabel()}</span></button>
            <button class="sidebar-project-icon" type="button" aria-label="选择本地项目文件夹" onclick={() => void chooseSidebarProjectFolder()}><Plus size={13} /></button>
          </div>
          <input bind:this={sidebarProjectFolderInput} class="sidebar-project-folder-input" type="file" multiple tabindex="-1" aria-hidden="true" onchange={handleSidebarProjectFolderInput} />
          {#if sidebarProjectCreateOpen && !sidebarProjectDockCollapsed}
            <form class="sidebar-project-create" onsubmit={(event) => { event.preventDefault(); createSidebarProject(); }}>
              <Folder size={14} />
              <input bind:value={sidebarProjectDraft} aria-label="项目名称" placeholder="项目名称" onkeydown={(event) => { if (event.key === "Escape") { sidebarProjectDraft = ""; sidebarProjectCreateOpen = false; } }} />
              <button type="submit" aria-label="确认创建项目"><Check size={13} /></button>
            </form>
          {/if}
          {#if !sidebarProjectDockCollapsed}
          <div class="sidebar-project-list" data-sidebar-project-sort={sidebarProjectSort}>
            {#each sortedSidebarProjects as project (project.id)}
              <div class="sidebar-project-group" data-sidebar-project={project.id}>
                <div class="sidebar-project-row" class:active={activeSidebarProjectId === project.id}>
                  <button class="sidebar-project-disclosure" class:expanded={project.expanded} type="button" aria-label={project.expanded ? `收起 ${project.name}` : `展开 ${project.name}`} aria-expanded={project.expanded} onclick={() => toggleSidebarProject(project.id)}><ChevronDown size={13} /></button>
                  {#if editingSidebarProjectId === project.id}
                    <form class="sidebar-project-open sidebar-project-inline-rename" onsubmit={(event) => { event.preventDefault(); saveSidebarProjectTaskName(project.id); }}>
                      <Folder size={15} />
                      <input bind:this={sidebarProjectRenameInput} bind:value={sidebarProjectRenameDraft} aria-label={`修改 ${project.name} 任务名称`} placeholder="任务名称" onblur={() => saveSidebarProjectTaskName(project.id)} onkeydown={(event) => { if (event.key === "Escape") cancelRenameSidebarProjectTask(); }} />
                    </form>
                  {:else}
                    <button class="sidebar-project-open" type="button" title={project.name} onclick={() => openSidebarProject(project.id)}><Folder size={15} /><span class="sidebar-project-label"><strong>{project.name}</strong></span></button>
                  {/if}
                  <button class="sidebar-project-rename" type="button" data-sidebar-rename-task aria-label={`修改 ${project.name} 任务名称`} title="修改任务名称" onclick={() => startRenameSidebarProjectTask(project)}><Pencil size={12} /></button>
                  <button class="sidebar-project-action" type="button" data-sidebar-new-conversation aria-label={`在 ${project.name} 下新建对话`} onclick={() => createSidebarConversation(project.id)}><Plus size={13} /></button>
                </div>
                {#if project.expanded}
                  <div class="sidebar-conversation-list">
                    {#each sidebarProjectConversations(project) as conversation (conversation.id)}
                      <div class="sidebar-conversation-row" class:active={activeSidebarConversationId === conversation.id} data-sidebar-conversation={conversation.id}>
                        <button class="sidebar-conversation-open" type="button" title={conversation.title} onclick={() => openSidebarConversation(project.id, conversation.id)}>
                          <span>{conversation.title}</span>
                          <em>{sidebarConversationTimeLabel(conversation)}</em>
                        </button>
                        <button class="sidebar-conversation-action" type="button" aria-label={`归档 ${conversation.title}`} title="归档" onclick={() => archiveSidebarConversation(project.id, conversation.id)}><Archive size={12} /></button>
                        <button class="sidebar-conversation-action danger" type="button" aria-label={`删除 ${conversation.title}`} title="删除" onclick={() => deleteSidebarConversation(project.id, conversation.id)}><Trash2 size={12} /></button>
                      </div>
                    {:else}
                      <button class="sidebar-conversation-empty" type="button" onclick={() => createSidebarConversation(project.id)}>新建对话 <Plus size={12} /></button>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
          {/if}
        </section>
        {/if}
      </nav>
      <footer class="sidebar__user-wrap">{#if userMenuOpen}<div class="user-menu" role="menu">{#each userMenuItems as item (item.layer)}<button type="button" role="menuitem" onclick={() => openUserPanelDialog(item.layer)}>{item.label}</button>{/each}</div>{/if}<button class="sidebar__user sidebar__profile" type="button" aria-label="打开用户菜单" title="用户菜单" onclick={() => (userMenuOpen = !userMenuOpen)}><span class="sidebar__avatar"><UserRound size={16} /></span><strong>用户名</strong><em hidden aria-hidden="true"></em></button></footer>
    </aside>

    <section class="stage" class:stage--conversation={showActiveTranscript}>
      <div class="window-drag-region" aria-hidden="true"></div>
      <div class="stage__surface" class:stage__surface--conversation={showActiveTranscript}>
        {#if loading}
          <div class="content__loading">{t.app.loading}</div>
        {:else if showActiveTranscript}
          <section class="conversation-view">
            <header class="conversation-header">
              <div>
                <strong>{conversationHeaderTitle}</strong>
                <span>{conversationHeaderScope}</span>
              </div>
              <button type="button" onclick={openCodeInspector}>
                <Code2 size={15} />
                代码状态
              </button>
            </header>
            <div class="conversation" bind:this={conversationScrollEl}>
              <Transcript
                items={transcript}
                {loading}
                {sending}
                approval={pendingApproval}
                ask={pendingAsk}
                onApprove={answerApproval}
                onAnswerAsk={answerAsk}
                onDismissAsk={() => (pendingAsk = undefined)}
                onLoadArchivedTool={loadArchivedToolEvidence}
              />
            </div>
            <div class="stage__composer conversation-composer">
              <Composer
                {input}
                {commands}
                {sending}
                disabled={Boolean(composerDisabledReason)}
                disabledReason={composerDisabledReason}
                onInput={(value) => (input = value)}
                onSend={send}
                onCancel={cancel}
                onPreviewFile={previewFile}
                {models}
                {selectedModel}
                imageInputEnabled={Boolean(currentComposerTab?.imageInputEnabled)}
                onModelChange={switchModel}
                projectOptions={newTaskProjectOptions}
                selectedProjectId={linkedProject ? activeSidebarProjectId : ""}
                onProjectChange={linkProjectById}
                workPermission={composerWorkPermission}
                {permissionChanging}
                onWorkPermissionChange={setComposerWorkPermission}
                onOpenResources={openResourceCenterFromComposer}
                {activityMode}
              />
            </div>
          </section>
        {:else if activityMode === "work" || activityMode === "code"}
          <section class="workbench aorist-workbench" data-current-work-layer={workLayer} data-current-code-panel={activityMode === "code" ? codeWorkbenchPanel : undefined}>
            <header class="stage-topbar"><div class="stage-topbar__leading"><div><span>{brandText(workbenchModeCopy[activityMode].eyebrow)}</span><strong>{activityMode === "code" ? "Code 工作台" : currentWorkLayerLabel()}</strong></div><p>{activityMode === "code" ? "面向研发用户的代码上下文、diff、检查点和执行权限控制台。" : workbenchModeCopy.work.desc}</p></div>{#if activityMode === "code"}<div class="stage-topbar__actions"><button type="button" onclick={() => openCodeWorkbench("workspace")}><Gauge size={14} /> 代码状态</button><button type="button" onclick={() => openCodeWorkbenchAction("models")}><BrainCircuit size={14} /> 模型渠道</button></div>{/if}</header>
            {#if workbenchNotice}<div class="workbench-notice" role="status"><Check size={14} /> {workbenchNotice}</div>{/if}
            {#if activityMode === "work" && workLayer === "reports"}
              {@const activeReport = selectedReport()}
              {@const activeStyle = selectedArtifactStyle()}
              <section class="artifact-review-workbench" aria-label="产物审查工作台">
                <header class="artifact-review-head">
                  <div>
                    <span>Artifact Review</span>
                    <strong>{activeReport?.title ?? "待选择产物"}</strong>
                    <p>{artifactKindLabel(activeReport)} / {artifactStageLabel()} / {activeReport?.owner ?? "未指定负责人"}</p>
                  </div>
                  <div class="artifact-stage-tabs" role="tablist" aria-label="审查阶段">
                    {#each artifactReviewStages as stage (stage.id)}
                      <button class:active={selectedArtifactStage === stage.id} type="button" role="tab" aria-selected={selectedArtifactStage === stage.id} onclick={() => setArtifactStage(stage.id)}>
                        <span>{stage.label}</span>
                        <em>{stage.status}</em>
                      </button>
                    {/each}
                  </div>
                </header>

                <div class="artifact-review-grid">
                  <section class="artifact-canvas-shell" aria-label="通用审查画布">
                    <div class="artifact-canvas-toolbar" role="toolbar" aria-label="画布工具">
                      <div class="artifact-mode-switch" role="group" aria-label="画布模式">
                        <button class:active={artifactCanvasMode === "select"} type="button" title="选择区域" aria-label="选择区域" onclick={() => (artifactCanvasMode = "select")}><MousePointer2 size={15} /></button>
                        <button class:active={artifactCanvasMode === "pan"} type="button" title="平移画布" aria-label="平移画布" onclick={() => (artifactCanvasMode = "pan")}><Move size={15} /></button>
                      </div>
                      <div class="artifact-tool-buttons" role="group" aria-label="缩放与定位">
                        <button type="button" title="缩小" aria-label="缩小" disabled={artifactCanvasZoom <= 60} onclick={() => updateArtifactZoom(-8)}><ZoomOut size={15} /></button>
                        <strong>{artifactCanvasZoom}%</strong>
                        <button type="button" title="放大" aria-label="放大" disabled={artifactCanvasZoom >= 160} onclick={() => updateArtifactZoom(8)}><ZoomIn size={15} /></button>
                        <button type="button" title="适配屏幕" aria-label="适配屏幕" onclick={fitArtifactCanvas}><Maximize2 size={15} /></button>
                        <button type="button" title="居中" aria-label="居中" disabled={artifactCanvasPanX === 0 && artifactCanvasPanY === 0} onclick={centerArtifactCanvas}><Crosshair size={15} /></button>
                        <button type="button" title="重置" aria-label="重置" disabled={artifactCanvasZoom === 96 && artifactCanvasPanX === 0 && artifactCanvasPanY === 0 && artifactCanvasMode === "select"} onclick={resetArtifactCanvas}><RotateCcw size={15} /></button>
                      </div>
                      <div class="artifact-pan-pad" role="group" aria-label="平移控制">
                        <button type="button" title="上移" aria-label="上移画布" onclick={() => panArtifactCanvas(0, -18)}><ArrowUp size={14} /></button>
                        <button type="button" title="左移" aria-label="左移画布" onclick={() => panArtifactCanvas(-18, 0)}><ArrowLeft size={14} /></button>
                        <button type="button" title="右移" aria-label="右移画布" onclick={() => panArtifactCanvas(18, 0)}><ArrowRight size={14} /></button>
                        <button type="button" title="下移" aria-label="下移画布" onclick={() => panArtifactCanvas(0, 18)}><ArrowDown size={14} /></button>
                      </div>
                    </div>

                    <div class="artifact-canvas-viewport" data-mode={artifactCanvasMode}>
                      <div class="artifact-canvas-page" style={`--artifact-zoom:${artifactCanvasZoom / 100};--artifact-pan-x:${artifactCanvasPanX}px;--artifact-pan-y:${artifactCanvasPanY}px`}>
                        <div class="artifact-page-meta">
                          <span>{artifactKindLabel(activeReport)}</span>
                          <strong>{activeReport?.title ?? "未选择报告"}</strong>
                          <em>{activeStyle.name} / {activeStyle.templateVersion}</em>
                        </div>
                        <div class="artifact-page-layout">
                          <section>
                            <b>{activeReport?.kind || "分析报告"}</b>
                            <h3>{activeReport?.title ?? "产物标题"}</h3>
                            <p>{activeReport?.desc || "这里展示格式中立的产物预览，审查状态与视口缩放互不绑定。"}</p>
                          </section>
                          <aside>
                            <span>Brand Kit</span>
                            <strong>{activeStyle.brandKitVersion}</strong>
                            <em>{artifactExportState()}</em>
                          </aside>
                        </div>
                        {#each artifactReviewFindings as finding (finding.id)}
                          <button class="artifact-marker" type="button" style={`--marker-x:${finding.x}%;--marker-y:${finding.y}%`} title={`${finding.label}: ${finding.target}`} aria-label={`${finding.label}: ${finding.target}`}>
                            {finding.label}
                          </button>
                        {/each}
                      </div>
                    </div>
                  </section>

                  <aside class="artifact-review-side" aria-label="审查门禁与坐标">
                    <section class="artifact-style-gate">
                      <header>
                        <span>Style Gate</span>
                        <strong>{artifactStyleApproved ? "样式已批准" : "等待样式批准"}</strong>
                      </header>
                      <div class="artifact-style-list">
                        {#each artifactStyleOptions as style (style.id)}
                          <button class:active={selectedArtifactStyleId === style.id} type="button" onclick={() => { selectedArtifactStyleId = style.id; artifactStyleApproved = false; }}>
                            <strong>{style.name}</strong>
                            <span>{style.templateVersion} / {style.brandKitVersion}</span>
                            <em>{style.rationale}</em>
                          </button>
                        {/each}
                      </div>
                      <div class="artifact-gate-actions">
                        <button type="button" onclick={returnArtifactToDraft}>退回草稿</button>
                        <button type="button" onclick={approveArtifactStyle}>批准样式</button>
                      </div>
                    </section>

                    <section class="artifact-coordinate-list">
                      <header>
                        <span>Coordinates</span>
                        <strong>{artifactReviewFindings.length} 条坐标化意见</strong>
                      </header>
                      {#each artifactReviewFindings as finding (finding.id)}
                        <article>
                          <div>
                            <strong>{finding.label}</strong>
                            <p>{finding.target}</p>
                          </div>
                          <span>{finding.status}</span>
                        </article>
                      {/each}
                    </section>
                  </aside>
                </div>
              </section>
            {/if}
            {#if activityMode === "code"}
              <section class="aorist-page code-workbench-page" data-code-panel={codeWorkbenchPanel}>
                <div class="code-workbench-shell">
                  <section class="code-workbench-hero" aria-label="Code 工作台总览">
                    <div>
                      <span>Code Agent Workspace</span>
                      <strong>面向研发的代码工作台</strong>
                      <p>把会话、仓库上下文、变更预览、检查点和模型权限放在同一个工程界面里；Work 工作台继续服务项目、客户和团队协作。</p>
                    </div>
                    <div class="code-workbench-actions">
                      <button type="button" onclick={() => openCodeWorkbenchAction("conversation")}><Code2 size={15} /> 开始代码对话</button>
                      <button type="button" onclick={() => openCodeWorkbenchAction("changes")}><GitBranch size={15} /> 审查变更</button>
                      <button type="button" onclick={() => openCodeWorkbenchAction("context")}><Gauge size={15} /> 查看上下文</button>
                    </div>
                  </section>

                  <div class="code-workbench-status-grid" aria-label="Code 工作台状态">
                    <button type="button" onclick={() => openCodeWorkbenchAction("models")}>
                      <BrainCircuit size={16} />
                      <span><strong>{selectedModel || modelSettings?.defaultModel || agentModel}</strong><em>{modelSettings ? `${modelSettings.providers.filter((provider) => provider.configured).length}/${modelSettings.providers.length} 个渠道可用` : "模型渠道未连接桌面后端"}</em></span>
                    </button>
                    <button type="button" onclick={() => openCodeWorkbenchAction("settings")}>
                      <ShieldCheck size={16} />
                      <span><strong>{settingsDraft.permissionMode || "ask"} / {settingsDraft.sandboxBash || "enforce"}</strong><em>{settingsDraft.sandboxNetwork ? "沙箱网络已允许" : "沙箱网络默认关闭"}</em></span>
                    </button>
                    <button type="button" onclick={() => openCodeWorkbench("workspace")}>
                      <Folder size={16} />
                      <span><strong>{activeTab?.workspaceName || t.common.global}</strong><em>Workspace / Preview</em></span>
                    </button>
                    <button type="button" onclick={() => openCodeWorkbench("changes")}>
                      <GitBranch size={16} />
                      <span><strong>{changedCount ? `${changedCount} 个变更文件` : "工作区干净"}</strong><em>Diff / 回滚范围</em></span>
                    </button>
                  </div>

                  <div class="code-workbench-command-row" role="group" aria-label="Code 工作台面板">
                    <button class:active={codeWorkbenchPanel === "overview"} type="button" onclick={() => openCodeWorkbench("overview")}><LayoutDashboard size={14} /> 总览</button>
                    <button class:active={codeWorkbenchPanel === "workspace"} type="button" onclick={() => openCodeWorkbench("workspace")}><Folder size={14} /> Workspace / Preview</button>
                    <button class:active={codeWorkbenchPanel === "context"} type="button" onclick={() => openCodeWorkbench("context")}><Gauge size={14} /> Context</button>
                    <button class:active={codeWorkbenchPanel === "changes"} type="button" onclick={() => openCodeWorkbench("changes")}><GitBranch size={14} /> Diff</button>
                    <button class:active={codeWorkbenchPanel === "checkpoints"} type="button" onclick={() => openCodeWorkbench("checkpoints")}><RotateCcw size={14} /> Checkpoints</button>
                  </div>

                  <div class="code-workbench-main">
                    <section class="code-workbench-chat" aria-label="代码对话入口">
                      <header>
                        <div><span>Code Chat</span><strong>{conversationHeaderTitle}</strong><p>{activeTab?.workspaceName || t.common.global}</p></div>
                        <button type="button" onclick={() => openCodeWorkbenchAction("conversation")}><Code2 size={14} /> 打开会话</button>
                      </header>
                      <div class="code-workbench-chat__prompts">
                    {#each t.home.code.quick as quick, quickIndex (indexedKey(quick.label, quickIndex))}
                          <button type="button" onclick={() => { useQuickPrompt(quick.prompt); openCodeConversation(); void tick().then(focusComposer); }}>
                            <strong>{quick.label}</strong>
                            <span>{quick.prompt}</span>
                          </button>
                        {/each}
                      </div>
                      <Composer
                        {input}
                        {commands}
                        {sending}
                        disabled={Boolean(composerDisabledReason)}
                        disabledReason={composerDisabledReason}
                        onInput={(value) => (input = value)}
                        onSend={send}
                        onCancel={cancel}
                        onPreviewFile={previewFile}
                        {models}
                        {selectedModel}
                        imageInputEnabled={Boolean(currentComposerTab?.imageInputEnabled)}
                        onModelChange={switchModel}
                        projectOptions={newTaskProjectOptions}
                        selectedProjectId={linkedProject ? activeSidebarProjectId : ""}
                        onProjectChange={linkProjectById}
                        workPermission={composerWorkPermission}
                        {permissionChanging}
                        onWorkPermissionChange={setComposerWorkPermission}
                        onOpenResources={openResourceCenterFromComposer}
                        {activityMode}
                      />
                    </section>

                    <CodeDashboard
                      {context}
                      {changes}
                      {checkpoints}
                      {filePreview}
                      {diffPreview}
                      variant="workbench"
                      focus={codeWorkbenchPanel}
                      onPreviewFile={previewFile}
                      onPreviewChange={previewChange}
                      onRewind={rewind}
                      onRefreshContext={() => activeTab && refreshCodeDock(activeTab)}
                    />
                  </div>
                </div>
              </section>
            {:else if workLayer === "today"}<section class="aorist-page"><div class="hero-panel"><span>Volt GUI Console</span><h1>把 Agent、项目、客户、日程与自动化集中到一个工作台。</h1><p>Volt GUI 由 AI 驱动，可用于代码、项目与运营任务协作。重要执行结果请以构建、测试和人工复核为准。</p><div><button type="button" onclick={() => startNewConversation()}>新建对话</button><button type="button" onclick={() => openWorkLayer("agents")}>进入 Agent 中心</button></div></div><div class="aorist-stats"><article><span>运行自动化</span><strong>{runningAutomations.filter((item) => item.status === "运行中").length}</strong><em>持续监控中</em></article><article><span>今日日程</span><strong>{calendarEvents.length}</strong><em>会议 / 截止 / 验收</em></article><article><span>项目管理</span><strong>{projectCards.length}</strong><em>可关联任务</em></article><article><span>能力模块</span><strong>{capabilityBuckets.plugin.length + capabilityBuckets.mcp.length + capabilityBuckets.skill.length}</strong><em>插件 / MCP / SKILL</em></article></div><div class="aorist-split workbench-grid"><section class="aorist-card"><header><strong>今日待办</strong><button type="button" onclick={() => openWorkLayer("todos")}>查看全部</button></header>{#each todayTodoItems() as item (item.id)}<button class="todo-row" type="button" onclick={() => openWorkLayer("todos")}><i></i><span><strong>{item.title}</strong><em>{todoDescription(item)}</em></span><b>{todoStatusLabel(item.status)}</b></button>{/each}</section><section class="aorist-card"><header><strong>运行中的自动化</strong><button type="button" onclick={() => openWorkLayer("automations")}>管理</button></header>{#each runningAutomations as item (item.id)}<button class="automation-row" type="button" onclick={() => openAutomationDialog(item.id)}><span><strong>{item.title}</strong><em>已运行 {formatRuntime(item.startedAtMs)}</em></span><b>{item.status}</b></button>{/each}</section><section class="aorist-card workbench-calendar"><header><strong>日历日程</strong><span>{calendarEvents.length} 项</span></header><div class="calendar-mini-grid">{#each Array.from({ length: 14 }, (_, index) => index + 1) as day (day)}<article class:today={isCurrentMonthDayToday(day)}><b>{day}</b>{#each calendarEventsForCurrentMonthDay(day) as event, eventIndex (calendarEventKey(event, eventIndex))}<span>{event.time}</span>{/each}</article>{/each}</div>{#each calendarEvents as event, eventIndex (calendarEventKey(event, eventIndex))}<button class="automation-row" type="button" onclick={() => openConfigDialog("schedule")}><span><strong>{event.title}</strong><em>{event.day} 日 {event.time} / {event.place}</em></span><b>{event.type}</b></button>{/each}<footer><button type="button" onclick={() => openConfigDialog("todo")}>新建待办</button><button type="button" onclick={() => openConfigDialog("schedule")}>新建日程</button></footer></section></div></section>
            {:else if workLayer === "newTask"}
              {@const currentAgent = selectedAgent()}
              {@const CurrentAgentIcon = agentIcon(currentAgent.id)}
              <section class="aorist-page new-task-page agent-assistant-page">
                <div class="agent-assistant-shell">
                  <div class="agent-assistant-center">
                    <div class="agent-selector">
                      <button class="agent-selector__trigger" type="button" onclick={() => (agentSelectorOpen = !agentSelectorOpen)}>
                        <span class="agent-selector__avatar"><CurrentAgentIcon size={28} /></span>
                        <span class="agent-selector__label">
                          <strong>{currentAgent.name}</strong>
                          <em>{currentAgent.role}</em>
                        </span>
                        <ChevronDown class={agentSelectorOpen ? "is-open" : ""} size={17} />
                      </button>

                      {#if agentSelectorOpen}
                        <button class="agent-selector__scrim" type="button" aria-label="关闭 Agent 选择" onclick={() => (agentSelectorOpen = false)}></button>
                        <div class="agent-selector__menu">
                          {#each agentCards as agent (agent.id)}
                            {@const AgentIcon = agentIcon(agent.id)}
                            <button class:active={selectedAgentId === agent.id} type="button" onclick={() => selectAgentForTask(agent.id)}>
                              <span><AgentIcon size={16} /></span>
                              <div>
                                <strong>{agent.name}</strong>
                                <em>{agent.desc}</em>
                              </div>
                              {#if selectedAgentId === agent.id}<Check size={15} />{/if}
                            </button>
                          {/each}
                        </div>
                      {/if}
                    </div>

                    <div class="agent-quick-tasks">
                      <p>选一个对话模板，快速开始</p>
                      <div class="agent-quick-grid">
                    {#each newTaskQuickTasks as task, taskIndex (indexedKey(task.title, taskIndex))}
                          <button type="button" onclick={() => useNewTaskPrompt(task)}>
                            <span>{task.agent}</span>
                            <strong>{task.title}</strong>
                            <em>{task.prompt}</em>
                          </button>
                        {/each}
                      </div>
                    </div>
                  </div>

                  <section class="agent-compose-card" aria-label="新建对话输入区">
                    <Composer
                      {input}
                      {commands}
                      {sending}
                      disabled={Boolean(composerDisabledReason)}
                      disabledReason={composerDisabledReason}
                      onInput={(value) => (input = value)}
                      onSend={send}
                      onCancel={cancel}
                      onPreviewFile={previewFile}
                      {models}
                      {selectedModel}
                      imageInputEnabled={Boolean(currentComposerTab?.imageInputEnabled)}
                      onModelChange={switchModel}
                      projectOptions={newTaskProjectOptions}
                      selectedProjectId={linkedProject ? activeSidebarProjectId : ""}
                      onProjectChange={linkProjectById}
                      workPermission={composerWorkPermission}
                      {permissionChanging}
                      onWorkPermissionChange={setComposerWorkPermission}
                      onOpenResources={openResourceCenterFromComposer}
                      {activityMode}
                    />
                  </section>

                  <p class="agent-assistant-disclaimer">Volt GUI 由 AI 驱动生成，请结合构建、测试和人工复核采纳执行建议。</p>
                </div>
              </section>
            {:else if workLayer === "todos"}<section class="aorist-page"><div class="aorist-toolbar"><div><span>Task Center</span><strong>待办事项</strong></div><button type="button" onclick={() => openConfigDialog("todo")}>新增待办</button></div><div class="aorist-list">{#each todoItems as item (item.id)}<article><div><strong>{item.title}</strong><p>{todoDescription(item)}</p><em>{todoDue(item)}</em></div><span>{todoStatusLabel(item.status)}</span></article>{/each}</div></section>
            {:else if workLayer === "automations"}
              <section class="aorist-page">
                <div class="aorist-toolbar">
                  <div><span>Codex Automation</span><strong>自动化任务</strong></div>
                  <button type="button" onclick={() => openAutomationDialog()}>新建自动化任务</button>
                </div>
                <div class="automation-console">
                  <section class="automation-overview">
                    <article><span>运行中</span><strong>{runningAutomations.filter((item) => item.status === "运行中").length}</strong><em>自动化任务</em></article>
                    <article><span>验证自动化</span><strong>{runningAutomations.filter((item) => item.kind.includes("验证")).length}</strong><em>已接入门禁</em></article>
                    <article><span>最近结果</span><strong>{primaryAutomation?.result ?? "待运行"}</strong><em>{primaryAutomation?.lastRun ?? "未运行"}</em></article>
                  </section>

                  <div class="automation-layout">
                    <section class="automation-task-list" aria-label="自动化任务列表">
                      {#each runningAutomations as item (item.id)}
                        {@const isRunning = item.status === "运行中"}
                        <div class:active={automationDialog === item.id} class="automation-card automation-task-card" role="button" tabindex="0" onkeydown={(event) => { if (event.key === "Enter" || event.key === " ") openAutomationDialog(item.id); }} onclick={() => openAutomationDialog(item.id)}>
                          <header>
                            <span>{item.kind}</span>
                            <em>{item.status}</em>
                          </header>
                          <strong>{item.title}</strong>
                          <p>{item.desc}</p>
                          <dl>
                            <dt>触发方式</dt><dd>{item.schedule}</dd>
                            <dt>工作区</dt><dd>{item.scope}</dd>
                            <dt>执行命令</dt><dd>{automationCommandLabel(item.command)}</dd>
                            <dt>下一次</dt><dd>{item.nextRun}</dd>
                          </dl>
                          <div class="automation-step-strip">
                          {#each item.steps as step, stepIndex (indexedKey(step, stepIndex))}
                              <b>{step}</b>
                            {/each}
                          </div>
                          <footer role="presentation" onkeydown={(event) => event.stopPropagation()} onclick={(event) => event.stopPropagation()}>
                            <button type="button" onclick={() => void toggleAutomationTask(item.id)}>{isRunning ? "暂停" : "开始"}</button>
                            <button type="button" onclick={() => openAutomationDialog(item.id)}>编辑</button>
                            <button type="button" onclick={() => void deleteAutomationTask(item.id)}>删除</button>
                          </footer>
                        </div>
                      {/each}
                    </section>

                  </div>
                </div>
              </section>
            {:else if workLayer === "agents"}
              <section class="aorist-page">
                <div class="aorist-toolbar agent-center-toolbar">
                  <label class="aorist-search"><Search size={16} /><input aria-label="搜索 Agent" placeholder="输入 Agent 名称或职责" /></label>
                  <div>
                    <button type="button" onclick={() => { agentMarketSearch = ""; agentMarketOpen = true; }}><Blocks size={15} /> Agent 市场（开发中）</button>
                    <button type="button" onclick={() => { distillStep = 1; openConfigDialog("distill"); }}>蒸馏 Agent</button>
                    <button type="button" onclick={() => openAgentWizard()}>创建 Agent</button>
                  </div>
                </div>
                <div class="aorist-card-grid agent-grid">
                  {#each agentCards as agent (agent.id)}
                    {@const AgentIcon = agentIcon(agent.id)}
                    <div class="agent-card" role="button" tabindex="0" onkeydown={(event) => { if (event.key === "Enter" || event.key === " ") openAgentWizard(agent.id); }} onclick={() => openAgentWizard(agent.id)}>
                      <header><span><AgentIcon size={19} /></span><div><strong>{agent.name}</strong><em>{agent.role}</em></div><button type="button" onclick={(event) => event.stopPropagation()}><Trash2 size={14} /></button></header>
                      <p>{agent.desc}</p>
                      <footer><span><Zap size={13} /> {agent.runs} 次运行</span><b>{agent.status}</b></footer>
                    </div>
                  {/each}
                </div>
              </section>
            {:else if workLayer === "projects"}
              <section class="aorist-page management-page project-management-page">
                <div class="management-stats project-stats">
                  <article><div><span>项目总数</span><strong>{projectCards.length}</strong><em>全部在库项目</em></div><FolderKanban size={18} /></article>
                  <article><div><span>进行中</span><strong>{projectCards.filter((project) => project.status === "active").length}</strong><em>当前执行项目</em></div><Gauge size={18} /></article>
                  <article><div><span>待办事项</span><strong>{projectTotalTodos}</strong><em>跨项目任务池</em></div><ListTodo size={18} /></article>
                  <article><div><span>预算合计</span><strong>{projectBudgetTotalText}</strong><em>按当前项目估算</em></div><BriefcaseBusiness size={18} /></article>
                </div>
                <div class="management-controls project-controls">
                  <label class="management-search"><Search size={16} /><input bind:value={projectSearch} placeholder="搜索项目名称、编号、客户、负责人、阶段、Agent" /></label>
                  <div class="management-tabs" role="tablist" aria-label="项目状态筛选">
                    <button class:active={projectStatusFilter === "all"} type="button" onclick={() => (projectStatusFilter = "all")}>全部</button>
                    <button class:active={projectStatusFilter === "active"} type="button" onclick={() => (projectStatusFilter = "active")}>进行中</button>
                    <button class:active={projectStatusFilter === "closed"} type="button" onclick={() => (projectStatusFilter = "closed")}>已归档</button>
                  </div>
                  <button class="management-primary" type="button" onclick={() => openConfigDialog("project")}><Plus size={15} /> 新建项目</button>
                </div>
                <div class="project-list-panel project-list-panel--single">
                  {#each filteredProjects as project (project.id)}
                    <button class="management-card matter-card project-matter-card" type="button" onclick={() => { selectedProjectId = project.id; projectDetailTab = "overview"; projectDetailOpen = true; }}>
                      <span class="management-card__icon"><FolderKanban size={20} /></span>
                      <div class="management-card__body">
                        <div class="project-card-title"><strong>{project.name}</strong><em>{project.code}</em></div>
                        <div class="management-badges"><span>{project.category}</span><span>{project.stage}</span><em>{project.priority}优先级</em><em class:riskHigh={project.risk === "中风险"}>{project.risk}</em></div>
                        <p>{project.court || project.desc}</p>
                        <div class="management-meta"><span><CalendarDays size={13} />{project.acceptedAt}</span><span><BriefcaseBusiness size={13} />¥{project.budget}</span><span>客户：{project.client}</span><span>执行 Agent：{project.agent}</span></div>
                        <div class="project-progress-line"><i style={`--progress:${project.progress}%`}></i><span>{project.progress}%</span></div>
                      </div>
                      <b>›</b>
                    </button>
                  {:else}
                    <article class="detail-empty"><strong>未找到匹配项目</strong><p>换一个关键词，或新建项目后再关联到任务。</p></article>
                  {/each}
                </div>
              </section>
            {:else if workLayer === "customers"}
              <section class="aorist-page management-page customer-management-page">
                <div class="management-stats">
                  <article><div><span>客户总数</span><strong>{customerCards.length}</strong><em>全部客户档案</em></div><UsersRound size={18} /></article>
                  <article><div><span>企业客户</span><strong>{customerCards.filter((customer) => customer.type === "企业").length}</strong><em>机构与团队主体</em></div><BriefcaseBusiness size={18} /></article>
                  <article><div><span>关联项目</span><strong>{customerCards.reduce((sum, customer) => sum + customerProjects(customer).length, 0)}</strong><em>累计项目数量</em></div><FolderKanban size={18} /></article>
                  <article><div><span>高风险客户</span><strong>{customerCards.filter((customer) => customer.riskLevel === "high").length}</strong><em>需重点跟进</em></div><ShieldCheck size={18} /></article>
                </div>
                <div class="management-controls">
                  <label class="management-search"><Search size={16} /><input bind:value={customerSearch} placeholder="搜索客户名称..." /></label>
                  <button class="management-primary" type="button" onclick={() => openConfigDialog("customer")}><Plus size={15} /> 新建客户</button>
                </div>
                <div class="management-list">
                  {#each filteredCustomers as customer (customer.id)}
                    {@const CustomerIcon = customer.type === "企业" ? BriefcaseBusiness : ContactRound}
                    <button class="management-card client-card" type="button" onclick={() => { selectedCustomerId = customer.id; customerDetailTab = "overview"; customerDetailOpen = true; }}>
                      <span class="client-avatar"><CustomerIcon size={20} /></span>
                      <div class="management-card__body">
                        <div class="client-card-title"><strong>{customer.name}</strong><span>{customer.type}</span>{#if customer.riskLevel === "high"}<AlertTriangle size={14} />{/if}</div>
                        <div class="client-contact-row">
                          <span><Phone size={13} />{customer.phone}</span>
                          <span><Mail size={13} />{customer.email}</span>
                          <span><BriefcaseBusiness size={13} />{customer.industry || "个人档案"}</span>
                        </div>
                      </div>
                      <aside class="client-card-side"><span>{customerProjects(customer).length} 个项目</span><em class:riskHigh={customer.riskLevel === "high"}>{customer.risk}</em></aside>
                      <b>›</b>
                    </button>
                  {:else}
                    <article class="detail-empty"><strong>未找到匹配客户</strong><p>换一个关键词，或新建客户后再关联到任务。</p></article>
                  {/each}
                </div>
              </section>
            {:else if workLayer === "calendar"}<section class="aorist-page calendar-page"><div class="aorist-toolbar calendar-toolbar"><div><span>Calendar</span><strong>日程日历 · {calendarMonthLabel()}</strong></div><div><button type="button" onclick={() => shiftCalendarMonth(-1)}>上月</button><button type="button" onclick={resetCalendarMonth}>今天</button><button type="button" onclick={() => shiftCalendarMonth(1)}>下月</button><button type="button" onclick={() => openConfigDialog("todo")}>新建待办</button><button type="button" onclick={() => openConfigDialog("schedule")}>新建日程</button></div></div><div class="aorist-stats"><article><span>本月日程</span><strong>{calendarMonthEvents().length}</strong><em>{calendarMonthLabel()} / 会议 / 截止 / 验收</em></article><article><span>今日待办</span><strong>{todayTodoItems().length}</strong><em>仅统计今天截止</em></article><article><span>冲突提醒</span><strong>{calendarConflictGroups().length}</strong><em>{calendarConflictSummary()}</em></article></div><div class="calendar-board"><div class="calendar-grid calendar-month-grid">{#each calendarWeekdays as weekday (weekday)}<div class="calendar-weekday">{weekday}</div>{/each}{#each calendarMonthCells() as cell (cell.key)}<article class:today={cell.isToday} class:muted={!cell.inMonth}><b>{cell.day}</b>{#each cell.events as event, eventIndex (calendarEventKey(event, eventIndex))}<button class="calendar-event-chip" type="button" onclick={() => openCalendarEvent(event)}>{event.time} {event.title}</button>{/each}</article>{/each}</div><aside class="aorist-card"><header><strong>近日安排</strong><button type="button" onclick={() => syncWorkbench("日程日历")}>同步</button></header>{#each upcomingCalendarEvents() as event, eventIndex (calendarEventKey(event, eventIndex))}<button class="automation-row" type="button" onclick={() => openCalendarEvent(event)}><span><strong>{event.title}</strong><em>{calendarEventFullDate(event).slice(8, 10) || event.day} 日 {event.time} / {event.place}</em></span><b>{event.type}</b></button>{:else}<article class="detail-empty"><strong>暂无近日安排</strong><p>当前月份暂无近期日程。</p></article>{/each}</aside></div></section>
            {:else if workLayer === "reports"}<section class="aorist-page report-center-page"><div class="aorist-toolbar"><div><span>Reports</span><strong>报告中心</strong></div><div><button type="button" onclick={() => openConfigDialog("report")}>新建报告</button><button type="button" onclick={exportReports}>批量导出</button></div></div><div class="report-center-layout"><div class="report-list-panel"><header><div><strong>报告列表</strong><span>{reportCards.length} 份报告</span></div></header><div class="report-card-list">{#each reportCards as report (report.id)}<button class:active={selectedReport()?.id === report.id} type="button" onclick={() => (selectedReportId = report.id)}><span>{report.status}</span><strong>{report.title}</strong><p>{report.desc || report.body || "暂无摘要"}</p><em>{report.kind || "分析报告"} / {report.owner}</em></button>{:else}<article class="detail-empty"><strong>暂无报告</strong><p>新建报告后会显示在这里。</p></article>{/each}</div></div><aside class="report-detail-panel">{#if selectedReport()}<header><div><span>{selectedReport()?.kind || "分析报告"}</span><strong>{selectedReport()?.title}</strong><p>{selectedReport()?.desc || "暂无报告摘要。"}</p></div><em>{selectedReport()?.status}</em></header><div class="report-detail-summary"><article><span>负责人</span><strong>{selectedReport()?.owner || "未指定"}</strong></article><article><span>关联项目</span><strong>{reportProject()?.name || "未关联项目"}</strong></article><article><span>关联客户</span><strong>{reportCustomer()?.name || "未关联客户"}</strong></article><article><span>生成来源</span><strong>{selectedReport()?.source || "工作台数据"}</strong></article><article><span>输出格式</span><strong>{selectedReport()?.format || "Markdown"}</strong></article><article><span>优先级</span><strong>{selectedReport()?.priority || "中"}</strong></article><article><span>截止时间</span><strong>{reportDueAt()}</strong></article><article><span>更新时间</span><strong>{reportUpdatedAt()}</strong></article></div><section class="report-detail-body"><span>结构化正文</span>{#each reportBodyLines() as line, lineIndex (indexedKey(line, lineIndex))}<p>{line}</p>{/each}</section><section class="report-detail-actions"><button type="button" onclick={() => openReportEditor()}><Pencil size={14} /> 修改</button><button type="button" onclick={() => void exportReport()}><Download size={14} /> 导出</button><button class="danger" type="button" onclick={() => void deleteReport()}><Trash2 size={14} /> 删除</button></section><section class="report-detail-meta"><div><span>报告 ID</span><strong>{selectedReport()?.id}</strong></div><div><span>创建时间</span><strong>{selectedReport()?.createdAt || "未记录"}</strong></div></section>{:else}<article class="detail-empty"><strong>请选择报告</strong><p>点击左侧报告卡片后查看完整信息。</p></article>{/if}</aside></div></section>{:else if workLayer === "resources"}<section class="aorist-page resource-center"><div class="resource-center-topbar"><div class="capability-tabs resource-tabs"><button class:active={resourceTab === "resources"} type="button" onclick={() => (resourceTab = "resources")}>资料库</button><button class:active={resourceTab === "knowledge"} type="button" onclick={() => { resourceTab = "knowledge"; void refreshKnowledgeBase(); }}>知识库</button><button class:active={resourceTab === "search"} type="button" onclick={() => { resourceTab = "search"; void runWorkbenchSearch(resourceSearch); }}>全文检索</button><button class:active={resourceTab === "conversationArchive"} type="button" onclick={() => (resourceTab = "conversationArchive")}>对话归档</button><button class:active={resourceTab === "ingest"} type="button" onclick={() => (resourceTab = "ingest")}>导入中心</button></div><div class="resource-center-actions"><button type="button" onclick={() => openConfigDialog("resource")}>上传资料</button><button type="button" onclick={() => openConfigDialog("ingest")}>批量导入</button></div></div>{#if resourceTab === "resources"}<div class="resource-section-top"><label class="aorist-search"><Search size={16} /><input bind:value={resourceSearch} aria-label="检索资料库" placeholder={selectedResourceCategory ? "检索该分类下的资料" : "检索资料或资料分类"} /></label><span>{selectedResourceCategory || resourceSearchActive ? `${filteredResourceItems.length} / ${selectedResourceCategory ? resourceItems.filter((item) => item.category === selectedResourceCategory).length : resourceItems.length} 项` : `${filteredResourceCategories.length} / ${resourceCategories.length} 类`}</span></div>{#if selectedResourceCategory}<div class="resource-category-bar"><button type="button" onclick={closeResourceCategory}>返回分类</button><strong>{selectedResourceCategory}</strong></div><div class="aorist-card-grid">{#each filteredResourceItems as item (item.id)}<button type="button" class="media-card" onclick={() => openMaterialDetail(item.id)}><span>{item.status}</span><strong>{item.title}</strong><p>{item.source}</p><em>{item.size}</em></button>{:else}<article class="detail-empty resource-library-empty"><strong>该分类下暂无匹配资料</strong><p>换一个关键词，或上传资料后重新检索。</p></article>{/each}</div>{:else if resourceSearchActive}<div class="aorist-card-grid">{#each filteredResourceItems as item (item.id)}<button type="button" class="media-card" onclick={() => openMaterialDetail(item.id)}><span>{item.status}</span><strong>{item.title}</strong><p>{item.source}</p><em>{item.size}</em></button>{:else}<article class="detail-empty resource-library-empty"><strong>未找到匹配资料</strong><p>换一个关键词，或上传资料后重新检索。</p></article>{/each}</div>{:else}<div class="aorist-card-grid">{#each filteredResourceCategories as category (category.category)}<button type="button" class="media-card resource-category-card" onclick={() => openResourceCategory(category.category)}><span>{category.count} 项</span><strong>{category.category}</strong><p>{category.desc}</p><em>{category.latest}</em></button>{:else}<article class="detail-empty resource-library-empty"><strong>暂无资料分类</strong><p>上传资料后会按资料分类自动汇总到这里。</p></article>{/each}</div>{/if}{:else if resourceTab === "knowledge"}
  <div class="resource-section-top">
    <label class="aorist-search"><Search size={16} /><input bind:value={resourceSearch} oninput={handleResourceSearchInput} aria-label="搜索文档、规范与规则" placeholder="搜索标题、条文、模板或标签" /></label>
    <div class="resource-actions"><button type="button" onclick={() => openConfigDialog("knowledge")}>导入知识</button><button type="button" onclick={() => openConfigDialog("template")}>新建模板</button><button type="button" onclick={() => syncWorkbench("知识库订阅源")}>同步订阅源</button></div>
  </div>
  <div class="knowledge-health"><article><span>SQLite</span><strong>{knowledgeStatus.sqlite ? "已启用" : "未连接"}</strong></article><article><span>FTS5</span><strong>{knowledgeStatus.fts5 ? "可检索" : "不可用"}</strong></article><article><span>sqlite-vec</span><strong>{knowledgeVectorLabel()}</strong></article><article><span>切片</span><strong>{knowledgeStatus.chunks}</strong></article></div><p class="knowledge-local-note">{knowledgeIndexSummary()}</p>
  <div class="knowledge-layout knowledge-layout--merged">
    <div class="knowledge-stack">
      <section>
        <header><span>Document Knowledge</span><strong>文档模板</strong></header>
        <div class="aorist-card-grid knowledge-template-grid">
          {#each filteredKnowledgeDocuments as item (item.id)}
            <article class="capability-item knowledge-template-card" class:active={selectedKnowledgeDocument()?.id === item.id} title={knowledgeDocumentMeta(item)}>
              <header><span>{item.status}</span><em>{item.type}</em></header>
              <strong>{item.title}</strong>
              <p>{item.description || `${item.type} / ${knowledgeDocumentCount(item)} 份关联资料`}</p>
              <dl>
                <div><dt>来源</dt><dd>{item.source || "workbench"}</dd></div>
                <div><dt>文档数</dt><dd>{knowledgeDocumentCount(item)}</dd></div>
                <div><dt>标签</dt><dd>{item.tags || "未设置"}</dd></div>
                <div><dt>更新</dt><dd>{item.updatedAt || item.createdAt || "未记录"}</dd></div>
              </dl>
              <footer class="knowledge-card-actions"><button type="button" onclick={() => openKnowledgeDocument(item)}>详情</button><button type="button" onclick={() => editKnowledgeDocument(item)}>编辑</button><button type="button" onclick={() => void deleteKnowledgeDocument(item)}>删除</button></footer>
            </article>
          {:else}
            <article class="detail-empty"><strong>暂无文档模板</strong><p>点击新建模板后会在这里显示。</p></article>
          {/each}
        </div>
      </section>
      <section><header><span>Regulation Knowledge</span><strong>规范知识</strong></header><div class="aorist-list">{#each filteredRegulations as item, itemIndex (indexedKey(item.id || item.title, itemIndex))}<article><div><strong>{item.title}</strong><p>{item.category} / {item.tags}</p><em>{item.status}</em></div><span>{item.category}</span></article>{/each}</div></section>
    </div>
    <aside class="knowledge-preview knowledge-detail-panel">
      {#if selectedKnowledgeDocument()}
        {@const doc = selectedKnowledgeDocument()}
        <header><span>Template Detail</span><button type="button" onclick={() => editKnowledgeDocument(doc)}>编辑</button></header>
        <strong>{doc.title}</strong>
        <p>{doc.description || `${doc.type} / ${knowledgeDocumentCount(doc)} 份关联资料 / ${doc.status}`}</p>
        <dl>
          <div><dt>模板类型</dt><dd>{doc.type}</dd></div>
          <div><dt>当前状态</dt><dd>{doc.status}</dd></div>
          <div><dt>文档数量</dt><dd>{knowledgeDocumentCount(doc)}</dd></div>
          <div><dt>来源</dt><dd>{doc.source || "workbench"}</dd></div>
          <div><dt>标签</dt><dd>{doc.tags || "未设置"}</dd></div>
          <div><dt>创建时间</dt><dd>{doc.createdAt || "未记录"}</dd></div>
          <div><dt>更新时间</dt><dd>{doc.updatedAt || "未记录"}</dd></div>
        </dl>
        <section class="knowledge-linked-materials">
          <header><span>关联文档</span><strong>{knowledgeDocumentCount(doc)} 份</strong></header>
          <div>
            {#each knowledgeDocumentMaterials(doc) as material (material.id)}
              <article><div><strong>{material.title}</strong><span>{materialProjectName(material)} / {material.category}</span><em>{material.status} · {material.updatedAt}</em></div><button type="button" onclick={() => openKnowledgeMaterial(material)}>查看详情</button><button type="button" onclick={() => void openMaterialFile(material)}>打开文件</button></article>
            {:else}
              <p>该模板尚未关联资料。</p>
            {/each}
          </div>
        </section>
      {:else}
        <span>Template Detail</span><strong>{knowledgePreviewTitle}</strong><p>{knowledgePreviewDescription}</p>
      {/if}
    </aside>
  </div>{:else if resourceTab === "search"}<div class="resource-section-top"><label class="aorist-search"><Search size={16} /><input bind:value={resourceSearch} oninput={handleResourceSearchInput} aria-label="跨项目、客户、文档、规范检索" placeholder="输入关键词，检索所有工作台内容" /></label><span>{displayedSearchResults.length} 项</span></div><div class="aorist-list search-result-list">{#each displayedSearchResults as result, resultIndex (indexedKey(`${result.scope}-${result.title}-${result.snippet}`, resultIndex))}<button class="search-result-card" type="button" onclick={() => openSearchResult(result)}><div><strong>{result.title}</strong><p>{result.snippet}</p><em>{result.scope}</em></div><span>匹配</span></button>{/each}</div>{:else if resourceTab === "conversationArchive"}<div class="resource-archive-summary"><div><span>Archived Conversations</span><strong>{archivedSidebarConversationCount} 个归档对话</strong></div><em>按项目整理，可直接删除不再保留的归档</em></div>{#if archivedSidebarConversationCount}<div class="resource-archive-list">{#each sortedSidebarProjects as project (project.id)}{@const archivedConversations = archivedSidebarProjectConversations(project)}{#if archivedConversations.length}<section class="resource-archive-project"><header><div><strong>{project.name}</strong><span>{project.localPath || "本地项目"}</span></div><em>{archivedConversations.length} 个</em></header><div>{#each archivedConversations as conversation (conversation.id)}<article><div><strong>{conversation.title}</strong><p>{conversation.updatedAt}</p></div><button type="button" aria-label={`删除归档对话 ${conversation.title}`} onclick={() => deleteSidebarConversation(project.id, conversation.id)}><Trash2 size={14} /> 删除</button></article>{/each}</div></section>{/if}{/each}</div>{:else}<article class="detail-empty resource-archive-empty"><strong>暂无归档对话</strong><p>在项目侧边栏点击对话右侧的归档按钮后，会按项目整理到这里。</p></article>{/if}{:else}<div class="resource-actions"><button type="button" onclick={() => openConfigDialog("ingest")}>批量导入</button><button type="button" onclick={showFailedIngestJobs}>查看失败</button></div><div class="aorist-list">{#each ingestJobs as job, jobIndex (indexedKey(job.title, jobIndex))}<article><div><strong>{job.title}</strong><p>{job.source} / {job.total} 条记录</p><em>{job.phase}</em></div><span>{job.status}</span></article>{/each}</div>{/if}</section>
            {:else if workLayer === "teams"}
              <section class="aorist-page team-collab-page">
                {#if teamViewMode === "chat"}
                  {@const activeTeam = selectedTeamRoom()}
                  <div class="team-chat-shell">
                    <header class="team-chat-header">
                      <div class="team-chat-title">
                        <button type="button" aria-label="返回团队大厅" onclick={() => (teamViewMode = "teams")}><ArrowLeft size={16} /></button>
                        <span><UsersRound size={16} /></span>
                        <strong>{activeTeam?.title || "协作运行"}</strong>
                        <button type="button" title="编辑团队" onclick={() => openTeamBuilder(activeTeam?.title)}><Pencil size={14} /></button>
                      </div>
                      <div class="team-member-bar">
                        {#each teamMembers(activeTeam) as agent (agent.id)}
                          {@const AgentIcon = agentIcon(agent.id)}
                          <span class:leader={agent.id === teamLeaderId(activeTeam)}>
                            <i><AgentIcon size={12} /></i>
                            {agent.name}
                            {#if agent.id === teamLeaderId(activeTeam)}<b>协调者</b>{/if}
                          </span>
                        {/each}
                      </div>
                    </header>
                    <main class="team-message-list">
                      {#if selectedTeamChatMessages().length === 0}
                        <div class="team-chat-empty">
                          <div>
                            {#each teamMembers(activeTeam) as agent (agent.id)}
                              {@const AgentIcon = agentIcon(agent.id)}
                              <span><AgentIcon size={18} /></span>
                            {/each}
                          </div>
                          <strong>协作组已就绪</strong>
                          <p>发送任务后会创建运行草稿，真实执行需接入 Agent runtime。</p>
                        </div>
                      {/if}
                      {#each selectedTeamChatMessages() as message (message.id)}
                        {@const MessageIcon = message.role === "user" ? UserRound : agentIcon(message.agentId || "")}
                        <article class="team-message" class:user={message.role === "user"}>
                          <span><MessageIcon size={16} /></span>
                          <div>
                            {#if message.role === "agent"}
                              <header>{message.agentName || "Agent"}{#if message.agentId === teamLeaderId(activeTeam)}<b><Crown size={11} />协调者</b>{/if}</header>
                            {/if}
                            <p>{message.content}</p>
                          </div>
                        </article>
                      {/each}
                      {#if teamChatSending}
                        <article class="team-message team-message--loading">
                          <span><Loader2 size={16} /></span>
                          <div><header>协作运行</header><p><Activity size={13} />正在生成本地运行草稿...</p></div>
                        </article>
                      {/if}
                    </main>
                    <footer class="team-compose-bar">
                      {#if teamChatAttachments.length}
                        <div class="team-attachments">
                        {#each teamChatAttachments as attachment, index (indexedKey(attachment, index))}
                            <button type="button" onclick={() => removeTeamChatAttachment(index)}>{attachment}<b>×</b></button>
                          {/each}
                        </div>
                      {/if}
                      <div class="team-compose-row">
                        <button type="button" aria-label="上传文件" onclick={addTeamChatAttachment}><Plus size={16} /></button>
                        <select bind:value={teamChatModel} aria-label="选择模型">
                          {#each modelCards as model (model.ref)}
                            <option value={model.ref}>{model.name}</option>
                          {/each}
                        </select>
                        <textarea bind:value={teamChatInput} rows="1" placeholder="向协作组发送任务..." onkeydown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendTeamChat(); } }}></textarea>
                        <button class="team-send" type="button" disabled={!teamChatInput.trim() || teamChatSending} onclick={sendTeamChat}>发送</button>
                      </div>
                    </footer>
                  </div>
                {:else}
                  <div class="team-page-head">
                    <div>
                      <h1><UsersRound size={30} />Agent 协作运行台</h1>
                      <p>配置多 Agent 工作小组，查看团队模板、共享上下文、运行节点和人工检查点。</p>
                    </div>
                    <div class="team-head-actions">
                      <div class="team-view-switch" role="tablist" aria-label="团队视图">
                        <button class:active={teamViewMode === "teams"} type="button" onclick={() => (teamViewMode = "teams")}><UsersRound size={15} />团队模板</button>
                        <button class:active={teamViewMode === "office"} type="button" onclick={() => (teamViewMode = "office")}><BriefcaseBusiness size={15} />运行台</button>
                      </div>
                      <button class="team-primary" type="button" onclick={() => openTeamBuilder()}><Plus size={15} />配置新组</button>
                    </div>
                  </div>

                  {#if teamViewMode === "office"}
                    {@const runningTeam = selectedTeamRoom()}
                    {@const currentTeamRun = activeTeamRun(runningTeam)}
                    <div class="team-office-shell">
                      <div class="team-office-toolbar">
                        <select value={selectedTeamTitle || teamRooms[0]?.title || ""} onchange={(event) => (selectedTeamTitle = (event.currentTarget as HTMLSelectElement).value)}>
                          {#each teamRooms as team (team.id)}
                            <option value={team.title}>{team.title}</option>
                          {/each}
                        </select>
                        <button type="button" onclick={() => (selectedTeamTitle = selectedTeamTitle || teamRooms[0]?.title)}><RefreshCw size={13} />刷新运行态</button>
                      </div>
                      <div class="team-office-stage">
                        <div class="team-office-status">
                          <span>{teamRunStatusLabel(currentTeamRun?.status)}</span>
                          <strong>{currentTeamRun?.title ?? runningTeam?.title} 运行台</strong>
                          <p>{teamLeader(runningTeam)?.name}: 协调当前主题「{runningTeam?.topic}」</p>
                        </div>
                        <div class="team-run-summary">
                          <article><span>协作策略</span><strong>{runningTeam?.mode}</strong></article>
                          <article><span>共享上下文</span><strong>{runningTeam?.sharedContext}</strong></article>
                          <article><span>运行状态</span><strong>{currentTeamRun ? teamRunStatusLabel(currentTeamRun.status) : runningTeam?.runState}</strong></article>
                          <article><span>下一检查点</span><strong>{runningTeam?.nextCheckpoint}</strong></article>
                        </div>
                        <div class="team-office-grid">
                          {#each teamMembers() as agent (agent.id)}
                            {@const AgentIcon = agentIcon(agent.id)}
                            <article class:leader={agent.id === teamLeaderId()}>
                              <span><AgentIcon size={18} /></span>
                              <strong>{agent.name}</strong>
                              <em>{agent.id === teamLeaderId() ? "协调者" : "执行成员"}</em>
                              <p>{agent.id === teamLeaderId() ? "负责拆解目标、分配节点和汇总结论。" : agent.desc}</p>
                            </article>
                          {/each}
                        </div>
                        <div class="team-office-memo">
                          <strong>运行说明</strong>
                          <p>{currentTeamRun ? `当前 teamRun 创建于 ${currentTeamRun.createdAt}，最近更新 ${currentTeamRun.updatedAt}。` : `${runningTeam?.title} 当前展示本地协作计划。真实模型调用、工具执行和日志回写需要后端 runtime 接入。`}</p>
                        </div>
                        <div class="team-run-steps">
                          <header><strong>运行节点</strong><span>{runningTeam?.outcome}</span></header>
                          {#each runningTeam?.steps ?? [] as step (step.id)}
                            <article>
                              <b>{step.status}</b>
                              <div><strong>{step.title}</strong><p>{step.detail}</p></div>
                              <span>{step.owner}</span>
                            </article>
                          {/each}
                        </div>
                        <div class="team-run-timeline">
                          <header><strong>执行观察</strong><span>{teamRunEvents(runningTeam).length} 条</span></header>
                          {#if teamRunEvents(runningTeam).length}
                            {#each teamRunEvents(runningTeam) as event (event.id)}
                              <article>
                                <b>{event.time}</b>
                                <div><strong>{event.type}</strong><p>{event.detail}</p></div>
                                <span>{event.actor}</span>
                              </article>
                            {/each}
                          {:else}
                            <article><b>等待</b><div><strong>尚未创建运行</strong><p>从团队模板进入会话并发送任务后，会在这里显示执行时间线。</p></div><span>工作台</span></article>
                          {/if}
                        </div>
                        <div class="team-run-footer">
                          <section>
                            <strong>人工控制</strong>
                            <div>
                    {#each teamRunControlList(runningTeam) as control, controlIndex (indexedKey(control, controlIndex))}
                                <button type="button" onclick={() => applyTeamRunControl(control, runningTeam)}>{control}</button>
                              {/each}
                            </div>
                          </section>
                          <section>
                            <strong>沉淀结果</strong>
                            <div>
                              {#each teamRunArtifacts(runningTeam) as artifact (artifact.id)}
                                <button type="button" disabled={!currentTeamRun || artifact.status === "已归档"} onclick={() => archiveTeamRunArtifact(artifact.id, runningTeam)}>
                                  {artifact.title}<em>{artifact.status}</em>
                                </button>
                              {/each}
                            </div>
                          </section>
                        </div>
                      </div>
                    </div>
                  {:else}
                    <div class="team-card-grid">
                      {#each teamRooms as team (team.id)}
                        <div class="team-list-card team-card" role="button" tabindex="0" onkeydown={(event) => { if (event.key === "Enter" || event.key === " ") openTeamChat(team.title); }} onclick={() => openTeamChat(team.title)}>
                          <header>
                            <span><UsersRound size={22} /></span>
                            <div class="team-card-actions" role="presentation" onkeydown={(event) => event.stopPropagation()} onclick={(event) => event.stopPropagation()}>
                              <button type="button" title="配置团队" onclick={() => openTeamBuilder(team.title)}><Settings size={15} /></button>
                              <button type="button" title="删除团队" onclick={() => deleteTeam(team.id)}><Trash2 size={15} /></button>
                            </div>
                          </header>
                          <main>
                            <strong>{team.title}</strong>
                            <p>{team.desc}</p>
                          </main>
                          <footer>
                            <span>包含 {team.members} 位协作 Agent</span>
                            <div class="team-avatar-stack">
                              {#each teamMembers(team).slice(0, 3) as agent, index (agent.id)}
                                {@const StackIcon = agentIcon(agent.id)}
                                <i style={`z-index:${10 - index}`}><StackIcon size={14} /></i>
                              {/each}
                              {#if team.members > 3}<i class="team-avatar-more">+{team.members - 3}</i>{/if}
                            </div>
                          </footer>
                          <div class="team-card-meta"><em>{team.mode}</em><b>{team.runState}</b><button type="button" onclick={(event) => { event.stopPropagation(); openTeamChat(team.title); }}>创建运行</button></div>
                        </div>
                      {:else}
                        <div class="team-empty-state">
                          <UsersRound size={44} />
                          <p>目前还没有任何 Agent 团队配置。</p>
                          <button type="button" onclick={() => openTeamBuilder()}>点击开始配置第一组</button>
                        </div>
                      {/each}
                    </div>
                  {/if}
                {/if}
              </section>
            {:else if workLayer === "models"}<section class="aorist-page"><div class="aorist-toolbar"><div><span>Models</span><strong>模型管理</strong></div><div><button type="button" onclick={() => openModelProviderDialog()}><Plus size={14} /> 添加渠道</button><button type="button" onclick={() => void refreshModelSettings()}><RefreshCw size={14} /> 刷新状态</button></div></div>{#if modelSettingsError}<div class="model-inline-alert"><AlertTriangle size={15} /> {modelSettingsError}</div>{/if}<div class="aorist-stats"><article><span>模型数量</span><strong>{modelCards.length}</strong><em>真实可选模型</em></article><article><span>渠道数量</span><strong>{modelSettings?.providers.length ?? 0}</strong><em>{hasWailsBindings() ? "真实配置" : "未连接桌面后端"}</em></article><article><span>密钥状态</span><strong>{modelSettings?.providers.filter((provider) => provider.configured).length ?? 0}</strong><em>可用渠道</em></article></div>{#if modelSettingsLoading}<div class="content__loading"><Loader2 size={16} /> 正在读取模型配置...</div>{:else if !hasWailsBindings()}<article class="detail-empty"><strong>未连接桌面后端</strong><p>模型管理只展示真实配置。请在 Wails 桌面运行环境中读取、添加和保存模型渠道。</p></article>{:else if !(modelSettings?.providers.length)}<article class="detail-empty"><strong>尚未配置模型渠道</strong><p>添加 OpenAI-compatible 或 Anthropic-compatible 渠道后，聊天输入框会立即出现可选模型。</p><button type="button" onclick={() => openModelProviderDialog()}><Plus size={14} /> 添加第一个渠道</button></article>{:else}<div class="aorist-card-grid">{#each modelSettings?.providers ?? [] as provider (provider.name)}<article class="capability-item"><span>{provider.configured ? "可用" : provider.requiresKey ? "缺少 Key" : "未启用"}</span><strong>{provider.name}</strong><p>{provider.kind} / {provider.baseUrl || "未配置 Base URL"}</p><p>Key: {provider.apiKeyEnv || "无"} / 上下文: {provider.contextWindow || "-"} / 优先级: {provider.priority ?? 0}</p><div class="model-chip-list">{#each provider.models as model, modelIndex (indexedKey(model, modelIndex))}<button class:active={isDefaultModelRef(provider, model)} type="button" onclick={() => void setDefaultModelProvider(provider, model)}>{model}{#if isDefaultModelRef(provider, model)}<Check size={13} />{/if}</button>{/each}</div><button type="button" onclick={() => openModelProviderDialog(provider)}><Pencil size={14} /> 编辑渠道</button><button type="button" onclick={() => void setDefaultModelProvider(provider)}><Check size={14} /> 设为默认</button><button type="button" onclick={() => void deleteModelProvider(provider)}><Trash2 size={14} /> 删除</button></article>{/each}</div>{/if}</section>
            {:else if workLayer === "settings"}
              <section class="aorist-page settings-page">
                <div class="aorist-toolbar">
                  <div><span>Settings</span><strong>系统设置</strong></div>
                  <div>
                    <button type="button" onclick={() => void refreshModelSettings()}><RefreshCw size={14} /> 刷新</button>
                    <button type="button" onclick={() => openSettingsPanel("general")}><Settings size={14} /> 打开设置</button>
                  </div>
                </div>
                {#if modelSettingsError}<div class="model-inline-alert"><AlertTriangle size={15} /> {modelSettingsError}</div>{/if}
                {#if modelSettingsLoading}<div class="content__loading"><Loader2 size={16} /> 正在读取系统设置...</div>{/if}
                <div class="aorist-stats settings-stats">
                  <article><span>语言</span><strong>{settingsDraft.language === "auto" ? "自动" : settingsDraft.language.toUpperCase()}</strong><em>桌面 UI</em></article>
                  <article><span>主题</span><strong>{settingsDraft.theme || "auto"}</strong><em>{settingsDraft.themeStyle || "graphite"}</em></article>
                  <article><span>权限</span><strong>{settingsDraft.permissionMode || "ask"}</strong><em>{settingsDraft.sandboxBash || "enforce"}</em></article>
                </div>
                <div class="aorist-card-grid">
                  {#each settingGroups as item, itemIndex (indexedKey(item.id || item.title, itemIndex))}
                    <article class="capability-item settings-card">
                      <span>{item.status}</span>
                      <strong>{item.title}</strong>
                      <p>{item.desc}</p>
                      <button type="button" onclick={() => openSettingsPanel(item.id)}>配置</button>
                    </article>
                  {/each}
                </div>
              </section>
            {:else if workLayer === "sync"}<section class="aorist-page"><div class="aorist-toolbar"><div><span>Sync</span><strong>同步中心</strong></div><button type="button" onclick={() => syncWorkbench("同步中心")}>立即同步</button></div><div class="aorist-list">{#each syncJobs as job, jobIndex (indexedKey(job.title, jobIndex))}<article><div><strong>{job.title}</strong><p>{job.time}</p><em>进度 {job.progress}</em></div><span>{job.status}</span></article>{/each}</div></section>
            {:else if workLayer === "operationLog"}<section class="aorist-page"><div class="aorist-toolbar"><div><span>Operation Log</span><strong>操作记录</strong></div><button type="button" onclick={exportOperationLog}>导出日志</button></div><div class="aorist-list">{#each operationLogs as log, logIndex (indexedKey(`${log.time}-${log.action}-${log.target}`, logIndex))}<article><div><strong>{log.action}</strong><p>{log.target} / {log.user}</p><em>{log.time}</em></div><span>{log.result}</span></article>{/each}</div></section>
            {:else}
              {@const selectedCapability = currentCapability()}
              <section class="aorist-page capability-manager capability-console">
                <header class="capability-hub-header">
                  <div class="capability-hub-header__title">
                    <span>Plugin Hub</span>
                    <strong>能力中心</strong>
                  <p>管理本地插件、MCP 和 Skill；远程市场、统一授权和跨端分发标注为开发中。</p>
                  </div>
                  <label class="capability-search">
                    <Search size={15} />
                    <input bind:value={capabilitySearch} placeholder={`搜索${capabilityLabel(capabilityTab)}名称 / 描述 / 来源`} />
                  </label>
                  <div class="capability-hub-header__actions">
                    <input bind:this={capabilityImportInput} class="visually-hidden" type="file" accept=".json,application/json" aria-label="导入能力配置文件" onchange={handleCapabilityImportFile} />
                    <button type="button" onclick={openCapabilityImportPicker}><Upload size={15} /> 导入能力配置</button>
                    <button type="button" onclick={openMCPConfigImport}><Upload size={15} /> 导入 MCP 配置</button>
                    <button type="button" onclick={() => void refreshCapabilities()}><RefreshCw size={15} /> 刷新状态</button>
                    <button type="button" onclick={() => startCapabilityCreate(capabilityTab)}><CirclePlus size={15} /> {capabilityCreateLabel(capabilityTab)}</button>
                  </div>
                </header>
                <div class="capability-stats">
                  <article><span>能力总数</span><strong>{allCapabilities().length}</strong><em>插件 / MCP / SKILL</em></article>
                  <article><span>已启用</span><strong>{capabilityEnabledCount()}</strong><em>可被 Agent 调用</em></article>
                  <article><span>待处理</span><strong>{allCapabilities().filter((item) => !item.enabled).length}</strong><em>等待安装 / 授权 / 配置</em></article>
                  <article><span>当前目录</span><strong>{capabilityLabel(capabilityTab)}</strong><em>{capabilitySubtitle(capabilityTab)}</em></article>
                </div>
                <div class="capability-hub-shell">
                  <aside class="capability-catalog-sidebar" aria-label="能力目录">
                    <span>Catalog</span>
                    <button class:active={capabilityTab === "plugin"} type="button" onclick={() => switchCapabilityTab("plugin")}>
                      <Puzzle size={16} />
                      <strong>插件模块</strong>
                      <em>{capabilityBuckets.plugin.length} 个本地插件</em>
                    </button>
                    <button class:active={capabilityTab === "mcp"} type="button" onclick={() => switchCapabilityTab("mcp")}>
                      <Database size={16} />
                      <strong>MCP 连接</strong>
                      <em>{capabilityBuckets.mcp.length} 个服务入口</em>
                    </button>
                    <button class:active={capabilityTab === "skill"} type="button" onclick={() => switchCapabilityTab("skill")}>
                      <Sparkles size={16} />
                      <strong>Skill 包</strong>
                      <em>{capabilityBuckets.skill.length} 个可复用技能</em>
                    </button>
                    <div class="capability-catalog-note">
                      <ShieldCheck size={16} />
                      <p>本地能力可直接配置；依赖远程账号、统一授权或市场分发的入口以开发中状态呈现。</p>
                    </div>
                  </aside>
                  <section class="capability-panel capability-market">
                    <header>
                      <div><span>{capabilityLabel(capabilityTab)} Catalog</span><strong>{capabilityLabel(capabilityTab)} 目录</strong><p>展示本地来源、版本、权限和连接状态；远程分发能力暂不伪装成已上线。</p></div>
                      <button type="button" onclick={() => startCapabilityCreate(capabilityTab)}><Plus size={14} /> 添加{capabilityLabel(capabilityTab)}</button>
                    </header>
                    <div class="capability-list capability-market-list">
                      {#if filteredCapabilities().length > 0}
                      {#each filteredCapabilities() as item (item.id)}
                        <button class="capability-row" class:active={selectedCapability?.id === item.id} type="button" onclick={() => { selectedCapabilityId = item.id; capabilityDetailOpen = true; }}>
                          <span class="capability-row__icon">{#if capabilityTab === "plugin"}<Puzzle size={18} />{:else if capabilityTab === "mcp"}<Database size={18} />{:else}<Sparkles size={18} />{/if}</span>
                          <span class="capability-row__body">
                            <span class="capability-title-line"><strong>{item.name}</strong><b>{capabilityLabel(capabilityTab)}</b></span>
                            <em>{item.desc}</em>
                            <span class="capability-badges"><b>{item.version}</b><b>{item.source}</b><b>{item.scope}</b></span>
                          </span>
                          <span class="capability-row__side">
                            <i class={`capability-state capability-state--${capabilityStatusTone(item)}`}>{item.status}</i>
                            <span class="capability-row__action">{capabilityActionLabel(item)}</span>
                          </span>
                        </button>
                      {/each}
                      {:else}
                        <div class="capability-empty">
                          <Search size={18} />
                          <strong>没有匹配的能力</strong>
                          <p>换一个关键词，或切换插件、MCP、SKILL 目录继续查找。</p>
                        </div>
                      {/if}
                    </div>
                  </section>
                </div>
              </section>{/if}          </section>
        {:else}
          <section class="home home--command">
            <div class="home-command">
              <div class="home-command__eyebrow">
                <span>
                  {#if activityMode === "code"}
                    <Code2 size={15} />
                    Code Workspace
                  {:else}
                    <BookOpen size={15} />
                    Knowledge Workspace
                  {/if}
                </span>
                <em>{activeTab?.workspaceName || t.common.global} / main</em>
              </div>

              <header class="home-command__hero">
                <div>
                  <h1>
                    {brandText(landing.title)}
                    <span>{t.home.beta}</span>
                  </h1>
                  <p>把上下文、代码变更、检查点和 Agent 指令集中在一个输入入口。</p>
                </div>
                <button type="button" onclick={openCodeInspector}>
                  <Gauge size={16} />
                  代码状态
                </button>
              </header>

              <div class="home__composer">
                <Composer
                  {input}
                  {commands}
                  {sending}
                  disabled={Boolean(composerDisabledReason)}
                  disabledReason={composerDisabledReason}
                  onInput={(value) => (input = value)}
                  onSend={send}
                  onCancel={cancel}
                  onPreviewFile={previewFile}
                  {models}
                  {selectedModel}
                  imageInputEnabled={Boolean(currentComposerTab?.imageInputEnabled)}
                  onModelChange={switchModel}
                  projectOptions={newTaskProjectOptions}
                  selectedProjectId={linkedProject ? activeSidebarProjectId : ""}
                  onProjectChange={linkProjectById}
                  workPermission={composerWorkPermission}
                  {permissionChanging}
                  onWorkPermissionChange={setComposerWorkPermission}
                  onOpenResources={openResourceCenterFromComposer}
                  {activityMode}
                />
                <div class="home__context">
                  <button type="button" onclick={focusComposer}>
                    <PanelLeft size={15} />
                    <span>{t.home.local}</span>
                  </button>
                  <button type="button" onclick={openCodeInspector}>
                    <Folder size={15} />
                    <span>{activeTab?.workspaceName || t.common.global}</span>
                  </button>
                  {#if activityMode === "code"}
                    <button type="button" onclick={focusComposer}>
                      <GitBranch size={15} />
                      <span>main</span>
                    </button>
                  {/if}
                </div>
              </div>

              <div class="home__quick">
                    {#each landing.quick as quick, quickIndex (indexedKey(quick.label, quickIndex))}
                  <button type="button" onclick={() => useQuickPrompt(quick.prompt)}>
                    {#if quick.icon === "bot"}
                      <Bot size={16} />
                    {:else if quick.icon === "list"}
                      <List size={16} />
                    {:else if quick.icon === "folder"}
                      <Folder size={16} />
                    {:else if quick.icon === "code"}
                      <Code2 size={16} />
                    {:else}
                      <Sparkles size={16} />
                    {/if}
                    <span>{quick.label}</span>
                  </button>
                {/each}
              </div>

              {#if activityMode === "code"}
                <div class="code-tools" aria-label={t.home.codeTools.title}>
                  <button type="button" onclick={openCodeInspector}>
                    <Gauge size={17} />
                    <span>{t.home.codeTools.context}</span>
                    <em>{context ? `${contextPercent}%` : "-"}</em>
                  </button>
                  <button type="button" onclick={openCodeInspector}>
                    <Folder size={17} />
                    <span>{t.code.fileTree}</span>
                    <em>{t.common.ready}</em>
                  </button>
                  <button type="button" onclick={openCodeInspector}>
                    <GitBranch size={17} />
                    <span>{t.code.changes}</span>
                    <em>{changedCount}</em>
                  </button>
                  <button type="button" onclick={openCodeInspector}>
                    <RotateCcw size={17} />
                    <span>{t.code.checkpoints}</span>
                    <em>{checkpoints.length}</em>
                  </button>
                </div>
              {/if}
            </div>
          </section>
        {/if}
      </div>

      {#if codeInspectorOpen}
        <aside class="code-inspector" aria-label={t.home.codeTools.title}>
          <header>
            <strong>{t.home.codeTools.title}</strong>
            <button type="button" onclick={() => (codeInspectorOpen = false)} aria-label={t.common.close}>
              ×
            </button>
          </header>
          <CodeDashboard
            {context}
            {changes}
            {checkpoints}
            {filePreview}
            {diffPreview}
            onPreviewFile={previewFile}
            onPreviewChange={previewChange}
            onRewind={rewind}
            onRefreshContext={() => activeTab && refreshCodeDock(activeTab)}
          />
        </aside>
      {/if}

      {#each selectedMaterialDetails as material (material.id)}
        <div class="modal-backdrop">
          <section class="config-modal resource-detail-modal">
            <header>
              <div><span>Resource Detail</span><strong>{material.title}</strong><p>{materialProjectName(material)} / {material.category}</p></div>
              <button type="button" onclick={() => (selectedMaterialDetailId = "")}>x</button>
            </header>
            <div class="resource-detail-body">
              <article>
                <span>{material.status}</span>
                <strong>{material.fileName || material.title}</strong>
                <p>{material.desc || "暂无资料说明。"}</p>
              </article>
              <dl>
                <dt>归属项目</dt><dd>{materialProjectName(material)}</dd>
                <dt>资料分类</dt><dd>{material.category}</dd>
                <dt>索引状态</dt><dd>{material.status}</dd>
                <dt>文件名称</dt><dd>{material.fileName || "未上传文件"}</dd>
                <dt>文件大小</dt><dd>{formatFileSize(material.fileSize)}</dd>
                <dt>MIME 类型</dt><dd>{material.mimeType || "未记录"}</dd>
                <dt>来源/路径</dt><dd>{materialPath(material) || "未记录"}</dd>
                <dt>更新时间</dt><dd>{material.updatedAt}</dd>
              </dl>
            </div>
            <footer>
              <button type="button" onclick={() => void openMaterialFile(material)}>打开文件</button>
              <button type="button" onclick={() => void revealMaterialFile(material)}>定位文件</button>
              <button type="button" onclick={() => void copyMaterialPath(material)}>复制路径</button>
              <button type="button" class="danger" onclick={() => void deleteMaterial(material)}>删除资料</button>
            </footer>
          </section>
        </div>
      {/each}
      {#if automationDialog}
        <div class="modal-backdrop"><section class="config-modal automation-config-modal"><header><div><span>Automation Task</span><strong>{automationDialogTitle()}</strong></div><button type="button" onclick={() => (automationDialog = undefined)}>x</button></header><div class="config-grid"><label>任务名称<input bind:value={automationDraft.title} /></label><label>任务类型<select bind:value={automationDraft.kind}>{#each automationKindOptions as option (option)}<option value={option}>{option}</option>{/each}</select></label><label>运行状态<select bind:value={automationDraft.status}>{#each automationStatusOptions as option (option)}<option value={option}>{option}</option>{/each}</select></label><label>负责人<select bind:value={automationDraft.owner}>{#each automationOwnerOptions as option (option)}<option value={option}>{option}</option>{/each}</select></label><label>调度模式<select bind:value={automationDraft.scheduleMode}>{#each automationScheduleModeOptions as option (option.value)}<option value={option.value}>{option.label}</option>{/each}</select></label><label>下次运行时间<input type="datetime-local" bind:value={automationDraft.nextRunAt} disabled={automationDraft.scheduleMode === "manual"} /></label><label>覆盖范围<input bind:value={automationDraft.scope} /></label><label>触发条件<input bind:value={automationDraft.cadence} /></label><label>执行环境<select bind:value={automationDraft.environment}><option value="local workspace">local workspace</option><option value="desktop/frontend">desktop/frontend</option><option value="desktop">desktop</option><option value="repo root">repo root</option></select></label><label>验证命令<select bind:value={automationDraft.command}>{#each automationCommandOptions as option (option.value)}<option value={option.value}>{option.label}</option>{/each}</select></label><label class="wide">任务说明<textarea rows="4" bind:value={automationDraft.desc}></textarea></label><label class="wide">运行步骤<textarea rows="4" bind:value={automationDraft.stepsText}></textarea></label><label class="wide">运行日志<textarea rows="3" bind:value={automationDraft.logsText} readonly></textarea></label></div><footer><button type="button" onclick={() => (automationDialog = undefined)}>取消</button>{#if automationDialogMode === "edit"}<button type="button" onclick={() => void runAutomationNow(automationDraft.id)}>立即执行</button>{/if}<button type="button" onclick={() => void saveAutomationDraft()}>保存配置</button></footer></section></div>
      {/if}
      {#if projectDetailOpen}
        {@const project = selectedProject()}
        {@const linkedProjectMaterials = projectMaterials(project)}
        {@const linkedProjectSchedules = projectSchedules(project)}
        {@const linkedProjectReports = projectReports(project)}
        {@const linkedProjectTodos = projectTodos(project)}
        <div class="modal-backdrop">
          <section class="config-modal detail-modal project-detail-modal">
            <header class="project-detail-head">
              <button class="project-detail-back" type="button" aria-label="返回项目列表" onclick={() => (projectDetailOpen = false)}><ArrowLeft size={16} /></button>
              <div class="project-detail-title">
                <div>
                  <div class="project-detail-name-row">
                    <strong>{project.name}</strong>
                    <em>{project.status === "closed" ? "已归档" : "进行中"}</em>
                  </div>
                  <span>{project.code} / {project.category}</span>
                </div>
              </div>
              <div class="project-detail-actions">
                <button type="button" onclick={() => linkProjectToTask(project.name)}><Activity size={14} /> 发起项目任务</button>
                <button type="button" onclick={() => openConfigDialog("dossier")}><Plus size={14} /> 新增资料</button>
              </div>
            </header>
            <aside class="detail-panel project-detail-panel">
              <header>
                <div><span>{project.client}</span><strong>{project.court}</strong><p>{project.desc}</p></div>
              </header>
              <section class="detail-summary project-detail-summary">
                <article><span>项目阶段</span><strong>{project.stage}</strong></article>
                <article><span>项目类型</span><strong>{project.category}</strong></article>
                <article><span>关联资料</span><strong>{project.materials} 份</strong></article>
                <article><span>待办事项</span><strong>{project.todos} 项</strong></article>
              </section>
              <div class="project-detail-body">
                <main class="project-detail-main">
                  <div class="detail-tabs" role="tablist" aria-label="项目详情标签">
                    <button class:active={projectDetailTab === "overview"} type="button" onclick={() => (projectDetailTab = "overview")}>概览</button>
                    <button class:active={projectDetailTab === "materials"} type="button" onclick={() => (projectDetailTab = "materials")}>资料 ({project.materials})</button>
                    <button class:active={projectDetailTab === "schedules"} type="button" onclick={() => (projectDetailTab = "schedules")}>日程 ({project.events})</button>
                    <button class:active={projectDetailTab === "reports"} type="button" onclick={() => (projectDetailTab = "reports")}>报告 ({project.reports})</button>
                    <button class:active={projectDetailTab === "todos"} type="button" onclick={() => (projectDetailTab = "todos")}>待办</button>
                  </div>
                  {#if projectDetailTab === "overview"}
                    <section class="project-detail-card">
                      <h3><FileText size={15} /> 项目概览</h3>
                      <p>当前项目数据来自本地工作台记录。请在资料、报告和任务页补充可复核的上下文、执行记录与交付证据。</p>
                      <div class="project-detail-metrics"><article><FileText size={14} /><strong>{project.materials}</strong><span>资料</span></article><article><Database size={14} /><strong>{project.reports}</strong><span>报告</span></article><article><Activity size={14} /><strong>{project.progress}%</strong><span>进度</span></article></div>
                    </section>
                    <section class="project-detail-card project-detail-risk">
                      <h3><ShieldCheck size={15} /> 本地风控备忘</h3>
                      <p>{project.nextStep}</p>
                      <button type="button" onclick={() => linkProjectToTask(project.name)}>查看执行任务</button>
                    </section>
                    <div class="detail-timeline project-detail-timeline">
                      {#each project.timeline as item, index (indexedKey(item, index))}
                        <article><b>{index + 1}. {item}</b><p>{index === 0 ? project.desc : project.nextStep}</p><em>{index === 0 ? project.updatedAt : index === 1 ? "今天" : "待复核"}</em></article>
                      {/each}
                    </div>
                  {:else if projectDetailTab === "materials"}
                    <section class="project-detail-card project-tab-panel">
                      <header class="project-section-head">
                        <div><h3><Database size={15} /> 项目资料库</h3><p>对标 LinkedResourceLibrary：展示项目关联资料，完整 {project.materials} 份继续在资料中心索引。</p></div>
                        <button type="button" onclick={() => openConfigDialog("dossier")}><Plus size={13} /> 新增资料</button>
                      </header>
                      <div class="project-resource-toolbar"><span>已展示 {linkedProjectMaterials.length} 份资料</span><button type="button" onclick={() => { projectDetailOpen = false; openWorkLayer("resources"); resourceTab = "resources"; }}>打开资料中心</button></div>
                      <div class="project-detail-list">
                        {#each linkedProjectMaterials as material (material.id)}
                          <button class="project-detail-row" type="button" onclick={() => { projectDetailOpen = false; openWorkLayer("resources"); resourceTab = "resources"; }}>
                            <span><FileText size={17} /></span>
                            <div><strong>{material.title}</strong><em>{material.category} / {material.source}</em><p>{material.desc}</p></div>
                            <b>{material.status}<small>{material.updatedAt}</small></b>
                          </button>
                        {:else}
                          <article class="detail-empty"><strong>暂无关联资料</strong><p>新增资料后会出现在项目资料库与全文检索中。</p></article>
                        {/each}
                      </div>
                    </section>
                  {:else if projectDetailTab === "schedules"}
                    <section class="project-detail-card project-tab-panel">
                      <header class="project-section-head">
                        <div><h3><CalendarDays size={15} /> 项目日程</h3><p>对标 MatterDetailPage 的 timeline，集中展示本月项目会议、验证窗口和交付排期。</p></div>
                        <button type="button" onclick={() => openConfigDialog("schedule")}><Plus size={13} /> 新建日程</button>
                      </header>
                      <div class="project-detail-list project-schedule-list">
                        {#each linkedProjectSchedules as schedule, scheduleIndex (calendarEventKey(schedule, scheduleIndex))}
                          <button class="project-detail-row" type="button" onclick={() => openWorkLayer("calendar")}>
                            <span><CalendarDays size={17} /></span>
                            <div><strong>{schedule.title}</strong><em>{schedule.date} {schedule.time} / {schedule.place}</em><p>{schedule.desc}</p></div>
                            <b>{schedule.state}</b>
                          </button>
                        {:else}
                          <article class="detail-empty"><strong>暂无本月关联日程</strong><p>可新建日程并关联当前项目。</p></article>
                        {/each}
                      </div>
                    </section>
                  {:else if projectDetailTab === "reports"}
                    <section class="project-detail-card project-tab-panel">
                      <header class="project-section-head">
                        <div><h3><FileText size={15} /> 项目报告</h3><p>对标 reports 标签，沉淀分析报告、风险报告和项目周报。</p></div>
                        <button type="button" onclick={() => openConfigDialog("report")}><Plus size={13} /> 新建报告</button>
                      </header>
                      <div class="project-detail-list">
                        {#each linkedProjectReports as report, reportIndex (indexedKey(report.title, reportIndex))}
                          <button class="project-detail-row" type="button" onclick={() => { projectDetailOpen = false; openWorkLayer("reports"); }}>
                            <span><FileText size={17} /></span>
                            <div><strong>{report.title}</strong><em>{report.type} / {report.owner}</em><p>{report.summary}</p></div>
                            <b>{report.status}<small>{report.updatedAt}</small></b>
                          </button>
                        {:else}
                          <article class="detail-empty"><strong>暂无项目报告</strong><p>新建报告后会按项目归档到这里。</p></article>
                        {/each}
                      </div>
                    </section>
                  {:else}
                    <section class="project-detail-card project-tab-panel">
                      <header class="project-section-head">
                        <div><h3><ListTodo size={15} /> 项目待办</h3><p>对标 TodoList：聚合当前项目的执行项、优先级和截止时间。</p></div>
                        <button type="button" onclick={() => openConfigDialog("todo")}><Plus size={13} /> 新增待办</button>
                      </header>
                      <div class="project-detail-list">
                        {#each linkedProjectTodos as todo, todoIndex (indexedKey(todo.title, todoIndex))}
                          <button class="project-detail-row project-todo-row" type="button" onclick={() => linkProjectToTask(project.name)}>
                            <span><ListTodo size={17} /></span>
                            <div><strong>{todo.title}</strong><em>{todo.priority}优先级 / {todo.due}</em><p>{todo.desc}</p></div>
                            <b>{todo.state}</b>
                          </button>
                        {:else}
                          <article class="detail-empty"><strong>暂无项目待办</strong><p>新建待办后会自动关联到当前项目。</p></article>
                        {/each}
                      </div>
                    </section>
                  {/if}
                </main>
                <aside class="project-detail-aside">
                  <section>
                    <h3>客户结构</h3>
                    <div><span>客户方</span><strong>{project.client}</strong></div>
                    <div><span>负责人</span><strong>{project.owner}</strong></div>
                  </section>
                  <section>
                    <h3>Agent 执行</h3>
                    <p>{project.agent} 正在维护项目上下文、风险摘要和下一步任务建议。</p>
                    <button type="button" onclick={() => linkProjectToTask(project.name)}>进入项目任务</button>
                  </section>
                </aside>
              </div>
            </aside>
          </section>
        </div>
      {/if}
      {#if customerDetailOpen}
        {@const customer = selectedCustomer()}
        {@const linkedCustomerProjects = customerProjects(customer)}
        {@const linkedCustomerMaterials = customerMaterials(customer)}
        {@const linkedCustomerSchedules = customerSchedules(customer)}
        {@const linkedCustomerTodos = customerTodos(customer)}
        <div class="modal-backdrop">
          <section class="config-modal detail-modal customer-detail-modal">
            <header class="customer-detail-head">
              <button class="customer-detail-back" type="button" aria-label="返回客户列表" onclick={() => (customerDetailOpen = false)}><ArrowLeft size={16} /></button>
              <span class="client-avatar client-avatar--large">
                {#if customer.type === "企业"}<BriefcaseBusiness size={24} />{:else}<UserRound size={24} />{/if}
              </span>
              <div class="customer-detail-title">
                <div>
                  <div class="customer-detail-name-row">
                    <strong>{customer.name}</strong>
                    <em>{customer.type === "企业" ? "企业客户" : "个人客户"}</em>
                    <em class="muted">{customer.status}</em>
                  </div>
                  <span><Phone size={13} />{customer.phone}<Mail size={13} />{customer.email}</span>
                </div>
              </div>
              <button class="customer-detail-primary" type="button" onclick={() => openConfigDialog("todo")}><Plus size={14} /> 新增待办</button>
            </header>
            <aside class="detail-panel customer-detail-panel">
              <div class="customer-detail-body">
                <main class="customer-detail-main">
                  <div class="detail-tabs" role="tablist" aria-label="客户详情标签">
                    <button class:active={customerDetailTab === "overview"} type="button" onclick={() => (customerDetailTab = "overview")}>概览</button>
                    <button class:active={customerDetailTab === "projects"} type="button" onclick={() => (customerDetailTab = "projects")}>项目 ({linkedCustomerProjects.length})</button>
                    <button class:active={customerDetailTab === "materials"} type="button" onclick={() => (customerDetailTab = "materials")}>资料 ({linkedCustomerMaterials.length})</button>
                    <button class:active={customerDetailTab === "schedules"} type="button" onclick={() => (customerDetailTab = "schedules")}>日程 ({linkedCustomerSchedules.length})</button>
                    <button class:active={customerDetailTab === "todos"} type="button" onclick={() => (customerDetailTab = "todos")}>待办 ({linkedCustomerTodos.length})</button>
                  </div>
                  {#if customerDetailTab === "overview"}
                    <section class="customer-detail-card">
                      <h3><BriefcaseBusiness size={15} /> 客户画像</h3>
                      <div class="customer-profile-grid">
                        <article><span>联系人</span><strong>{customer.contact}</strong></article>
                        <article><span>当前活跃项目</span><strong>{linkedCustomerProjects.filter((project) => project.status !== "closed").length} 件</strong></article>
                        <article><span>关联资料</span><strong>{linkedCustomerMaterials.length} 份</strong></article>
                        <article><span>本月日程</span><strong>{linkedCustomerSchedules.length} 项</strong></article>
                      </div>
                      <p>{customer.note}</p>
                    </section>
                    <div class="detail-timeline customer-detail-timeline">
                      <article><b>客户画像</b><p>{customer.type}客户，目前关联 {customer.matters} 个项目。</p><em>已建档</em></article>
                      <article><b>最近沟通</b><p>已记录访谈附件、需求跟进和自动化提醒。</p><em>{customer.lastContact}</em></article>
                      <article><b>资料状态</b><p>关联资料可在资料中心和全文检索中复用。</p><em>已索引</em></article>
                    </div>
                  {:else if customerDetailTab === "projects"}
                    <section class="customer-detail-card customer-tab-panel">
                      <header class="customer-section-head">
                        <div><h3><FolderKanban size={15} /> 关联项目</h3><p>对标工作台的关联项目列表，点击后进入项目详情。</p></div>
                        <button type="button" onclick={() => openConfigDialog("project")}><Plus size={13} /> 新建项目</button>
                      </header>
                      {#if linkedCustomerProjects.length}
                        <div class="customer-project-list">
                          {#each linkedCustomerProjects as project (project.id)}
                            <button type="button" onclick={() => { selectedProjectId = project.id; projectDetailTab = "overview"; customerDetailOpen = false; projectDetailOpen = true; }}>
                              <span><FolderKanban size={17} /></span>
                              <div><strong>{project.name}</strong><em>{project.category} / {project.stage} / {project.updatedAt}</em></div>
                              <b>{project.status === "closed" ? "已归档" : "进行中"}</b>
                            </button>
                          {/each}
                        </div>
                      {:else}
                        <article class="detail-empty"><strong>暂无关联项目</strong><p>可在新建对话中关联客户后补齐项目记录。</p></article>
                      {/if}
                    </section>
                  {:else if customerDetailTab === "materials"}
                    <section class="customer-detail-card customer-tab-panel">
                      <header class="customer-section-head">
                        <div><h3><Database size={15} /> 客户资料库</h3><p>展示真实关联资料，完整 {linkedCustomerMaterials.length} 份资料继续在资料中心索引。</p></div>
                        <button type="button" onclick={() => openConfigDialog("resource")}><Upload size={13} /> 上传资料</button>
                      </header>
                      <div class="customer-resource-toolbar">
                        <span>已展示 {linkedCustomerMaterials.length} 份</span>
                        <button type="button" onclick={() => { customerDetailOpen = false; openWorkLayer("resources"); resourceTab = "resources"; }}>打开资料中心</button>
                      </div>
                      <div class="customer-detail-list">
                        {#each linkedCustomerMaterials as material, materialIndex (indexedKey(material.title, materialIndex))}
                          <button class="customer-detail-row" type="button" onclick={() => { customerDetailOpen = false; openMaterialDetail(material.id); }}>
                            <span><FileText size={17} /></span>
                            <div><strong>{material.title}</strong><em>{material.category} / {material.source}</em><p>{material.desc}</p></div>
                            <b>{material.status}<small>{material.updatedAt}</small></b>
                          </button>
                        {:else}
                          <article class="detail-empty"><strong>暂无关联资料</strong><p>上传客户资料后会自动进入资料中心和全文检索。</p></article>
                        {/each}
                      </div>
                    </section>
                  {:else if customerDetailTab === "schedules"}
                    <section class="customer-detail-card customer-tab-panel">
                      <header class="customer-section-head">
                        <div><h3><CalendarDays size={15} /> 关联日程</h3><p>同步客户本月会议、验收窗口和提醒。</p></div>
                        <button type="button" onclick={() => openConfigDialog("schedule")}><Plus size={13} /> 新建日程</button>
                      </header>
                      <div class="customer-detail-list customer-schedule-list">
                        {#each linkedCustomerSchedules as schedule, scheduleIndex (calendarEventKey(schedule, scheduleIndex))}
                          <button class="customer-detail-row" type="button" onclick={() => { customerDetailOpen = false; void openCalendarEvent(schedule.event); }}>
                            <span><CalendarDays size={17} /></span>
                            <div><strong>{schedule.title}</strong><em>{schedule.date} {schedule.time} / {schedule.place}</em><p>{schedule.desc}</p></div>
                            <b>{schedule.state}</b>
                          </button>
                        {:else}
                          <article class="detail-empty"><strong>暂无本月关联日程</strong><p>可新建日程并关联当前客户。</p></article>
                        {/each}
                      </div>
                    </section>
                  {:else}
                    <section class="customer-detail-card customer-tab-panel">
                      <header class="customer-section-head">
                        <div><h3><ListTodo size={15} /> 客户待办</h3><p>对标 TodoList：聚合当前客户的执行项、优先级和截止时间。</p></div>
                        <button type="button" onclick={() => openConfigDialog("todo")}><Plus size={13} /> 新增待办</button>
                      </header>
                      <div class="customer-detail-list">
                        {#each linkedCustomerTodos as todo, todoIndex (indexedKey(todo.title, todoIndex))}
                          <button class="customer-detail-row customer-todo-row" type="button" onclick={() => linkCustomerToTask(customer.name)}>
                            <span><ListTodo size={17} /></span>
                            <div><strong>{todo.title}</strong><em>{todo.priority}优先级 / {todo.due}</em><p>{todo.desc}</p></div>
                            <b>{todo.state}</b>
                          </button>
                        {:else}
                          <article class="detail-empty"><strong>暂无客户待办</strong><p>新建待办时可在关联对象中选择所属项目。</p></article>
                        {/each}
                      </div>
                    </section>
                  {/if}
                </main>
                <aside class="customer-detail-aside">
                  <section>
                    <h3><UserRound size={15} /> 联系信息</h3>
                    <strong>{customer.contact || customer.name}</strong>
                    <p><Phone size={14} />{customer.phone}</p>
                    <p><Mail size={14} />{customer.email}</p>
                    <p><MapPin size={14} />{customer.address}</p>
                  </section>
                  <section>
                    <h3>业务指标</h3>
                    <div><span>项目总数</span><strong>{customer.matters}</strong></div>
                    <div><span>活跃项目</span><strong>{linkedCustomerProjects.filter((project) => project.status !== "closed").length}</strong></div>
                    <div><span>材料数量</span><strong>{customer.materials}</strong></div>
                    <div><span>本月日程</span><strong>{customer.events}</strong></div>
                  </section>
                  <section class="customer-risk-card">
                    <h3><ShieldCheck size={15} /> 风险等级</h3>
                    <strong>{customer.risk}</strong>
                    <p>客户风险用于决定任务前置检查、资料复核和人工确认强度。</p>
                    <button type="button" onclick={() => linkCustomerToTask(customer.name)}>关联到新建对话</button>
                  </section>
                </aside>
              </div>
            </aside>
          </section>
        </div>
      {/if}
      {#if userPanelDialog}
        {@const UserPanelIcon = navIcon(userPanelDialog)}
        <div class="modal-backdrop">
          <section class="config-modal user-panel-modal">
            <header>
              <div class="user-panel-modal__title">
                <span class="user-panel-modal__icon"><UserPanelIcon size={18} /></span>
                <div><span>User Panel</span><strong>{userPanelDialogTitle()}</strong></div>
              </div>
              <button type="button" onclick={() => (userPanelDialog = undefined)}>x</button>
            </header>
            <p class="user-panel-modal__intro">{userPanelDialogIntro()}</p>
            {#if userPanelDialog === "settings"}
              <div class="settings-dialog-layout">
                <aside class="settings-dialog-nav" aria-label="系统设置分类">
                    {#each settingGroups as item, itemIndex (indexedKey(item.id || item.title, itemIndex))}
                    <button class:active={settingsPanel === item.id} type="button" aria-pressed={settingsPanel === item.id} onclick={() => selectSettingsPanel(item.id)}>
                      <span>{item.status}</span>
                      <strong>{item.title}</strong>
                      <em>{item.desc}</em>
                    </button>
                  {/each}
                </aside>
                <section class="settings-dialog-panel" aria-labelledby="settings-panel-title">
                  <header class="settings-dialog-panel__head">
                    <div><span>Settings</span><strong id="settings-panel-title">{settingsPanelTitle()}</strong></div>
                    {#if modelSettingsLoading}<em><Loader2 size={14} /> 读取中</em>{/if}
                  </header>
                  {#if modelSettingsError}<div class="model-inline-alert"><AlertTriangle size={15} /> {modelSettingsError}</div>{/if}
                  {#if settingsMessage}<div class="model-inline-alert"><Check size={15} /> {settingsMessage}</div>{/if}
                  {#if settingsPanel === "general"}
                    <div class="config-grid user-panel-form">
                      <label>语言
                        <select bind:value={settingsDraft.language}>
                          <option value="auto">跟随系统</option>
                          <option value="zh">中文</option>
                          <option value="en">English</option>
                        </select>
                      </label>
                      <label>主题
                        <select bind:value={settingsDraft.theme}>
                          <option value="auto">跟随系统</option>
                          <option value="light">浅色</option>
                          <option value="dark">深色</option>
                        </select>
                      </label>
                      <label>主题样式
                        <select bind:value={settingsDraft.themeStyle}>
                          <option value="graphite">Graphite</option>
                          <option value="porcelain">Porcelain</option>
                          <option value="glacier">Glacier</option>
                          <option value="aurora">Aurora</option>
                          <option value="ember">Ember</option>
                          <option value="midnight">Midnight</option>
                          <option value="sandstone">Sandstone</option>
                          <option value="linen">Linen</option>
                        </select>
                      </label>
                      <label>关闭按钮
                        <select bind:value={settingsDraft.closeBehavior}>
                          <option value="background">最小化到后台</option>
                          <option value="quit">退出应用</option>
                        </select>
                      </label>
                    </div>
                  {:else if settingsPanel === "runtime"}
                    <div class="config-grid user-panel-form">
                      <label>授权模式
                        <select bind:value={settingsDraft.permissionMode}>
                          <option value="ask">需要确认</option>
                          <option value="allow">默认允许</option>
                          <option value="deny">默认拒绝</option>
                        </select>
                      </label>
                      <label>终端沙箱
                        <select bind:value={settingsDraft.sandboxBash}>
                          <option value="enforce">强制沙箱</option>
                          <option value="none">不启用</option>
                        </select>
                      </label>
                      <label>Shell
                        <input bind:value={settingsDraft.sandboxShell} placeholder="auto / zsh / bash" />
                      </label>
                      <label>工作区根目录
                        <input bind:value={settingsDraft.sandboxWorkspaceRoot} placeholder="留空使用当前工作区" />
                      </label>
                      <label class="settings-toggle wide">
                        <input type="checkbox" bind:checked={settingsDraft.sandboxNetwork} />
                        <span>允许沙箱内网络访问</span>
                      </label>
                      <label class="wide">额外可写目录
                        <textarea rows="4" bind:value={settingsDraft.sandboxAllowWrite} placeholder="每行一个路径，或用逗号分隔"></textarea>
                      </label>
                    </div>
                  {:else}
                    <div class="user-panel-list settings-model-list">
                      <article><div><strong>默认模型</strong><p>{modelSettings?.defaultModel || selectedModel || agentModel}</p><em>在模型管理中修改默认对话模型。</em></div><button type="button" onclick={() => { userPanelDialog = undefined; openWorkLayer("models"); }}>打开模型管理</button></article>
                      <article><div><strong>模型渠道</strong><p>{modelSettings?.providers.length ?? 0} 个渠道，{modelSettings?.providers.filter((provider) => provider.configured).length ?? 0} 个可用</p><em>可添加 OpenAI-compatible 或 Anthropic-compatible 接口。</em></div><button type="button" onclick={() => openModelProviderDialog()}>添加渠道</button></article>
                    </div>
                  {/if}
                </section>
              </div>
            {:else if userPanelDialog === "sync"}
              <div class="user-panel-list sync-dialog-list">{#each syncJobs as job, jobIndex (indexedKey(job.title, jobIndex))}<article><div><strong>{job.title}</strong><p>{job.time}</p><em>进度 {job.progress}</em><i style={`--progress:${job.progress}`}></i></div><span>{job.status}</span></article>{/each}</div>
            {:else}
              <div class="user-panel-list">{#each operationLogs as log, logIndex (indexedKey(`${log.time}-${log.action}-${log.target}`, logIndex))}<article><div><strong>{log.action}</strong><p>{log.target} / {log.user}</p><em>{log.time}</em></div><span>{log.result}</span></article>{/each}</div>
            {/if}
            <footer>
              <button type="button" onclick={() => (userPanelDialog = undefined)}>关闭</button>
              {#if userPanelDialog === "settings"}
                <button type="button" onclick={resetSettingsDraft}>重置</button>
                <button type="button" disabled={settingsSaving || modelSettingsLoading} onclick={() => void saveSettingsDraft()}>{settingsSaving ? "保存中" : settingsPanel === "models" ? "打开模型管理" : `保存${settingsPanelTitle()}`}</button>
              {:else if userPanelDialog === "operationLog"}
                <button type="button" onclick={exportOperationLog}>导出日志</button>
              {:else}
                <button type="button" onclick={() => syncWorkbench("同步中心")}>立即同步</button>
              {/if}
            </footer>
          </section>
        </div>
      {/if}
      {#if capabilityDetailOpen && currentCapability()}
        {@const selectedCapability = currentCapability()}
        <div class="modal-backdrop">
          <div class="config-modal capability-detail-modal" role="dialog" aria-modal="true" aria-label={`${capabilityLabel(capabilityTab)}详情`}>
            <header>
              <div><span>{capabilityLabel(capabilityTab)} Detail</span><strong>{selectedCapability.name}</strong></div>
              <button type="button" onclick={() => (capabilityDetailOpen = false)}>x</button>
            </header>
            <div class="capability-detail capability-plugin-detail capability-detail-modal__body">
              <div class="capability-detail__top">
                <p>{selectedCapability.desc}</p>
                <div class="capability-detail__meta">
                  <b>{selectedCapability.version}</b>
                  <b>{selectedCapability.source}</b>
                  <b>{selectedCapability.scope}</b>
                </div>
              </div>
              <section class="capability-install-flow">
                <header><Workflow size={16} /><strong>安装与连接流程</strong></header>
                {#each capabilityInstallSteps as step, index (indexedKey(step.id, index))}
                  <article class:done={capabilityStepDone(selectedCapability, index)}>
                    <span>{#if capabilityStepDone(selectedCapability, index)}<Check size={13} />{:else}{index + 1}{/if}</span>
                    <div><strong>{step.label}</strong><p>{step.desc}</p></div>
                  </article>
                {/each}
              </section>
							{#if isCloudflareDropCapability(selectedCapability)}
								<section class="capability-install-flow">
									<header><Archive size={16} /><strong>Cloudflare Drop 发布流程</strong></header>
									<p>VoltUI 只在本机预检文件夹或 ZIP；不会上传文件、调用未公开 API、替你确认条款，且打开后必须在官方网页内重新选择源文件。</p>
									{#if !selectedCapability.enabled}
										<article><span>1</span><div><strong>先启用插件</strong><p>启用后才可选择本地源文件、执行预检或打开官方页面。</p></div></article>
									{:else}
										<div class="capability-detail__meta">
											<button type="button" disabled={cloudflareDropWorking} onclick={() => void pickCloudflareDropSource("folder")}><Folder size={14} /> 选择目录并预检</button>
											<button type="button" disabled={cloudflareDropWorking} onclick={() => void pickCloudflareDropSource("zip")}><Archive size={14} /> 选择 ZIP 并预检</button>
										</div>
										{#if cloudflareDropPreflight}
											<article class:done={cloudflareDropPreflight.valid}>
												<span>{#if cloudflareDropPreflight.valid}<Check size={13} />{:else}!{/if}</span>
												<div><strong>{cloudflareDropPreflight.valid ? "本地预检通过" : "本地预检未通过"}</strong><p>{cloudflareDropPreflight.sourceName} / {cloudflareDropPreflight.sourceType === "zip" ? "ZIP" : "目录"} / {cloudflareDropPreflight.fileCount} 个文件 / {formatFileSize(cloudflareDropPreflight.totalBytes)}</p></div>
											</article>
											{#if cloudflareDropPreflight.largestFileName}<p>最大文件：{cloudflareDropPreflight.largestFileName} / {formatFileSize(cloudflareDropPreflight.largestFileBytes)}；根目录 index.html：{cloudflareDropPreflight.hasRootIndex ? "已找到" : "未找到"}</p>{/if}
											{#if cloudflareDropPreflight.issues.length > 0}<p>问题：{cloudflareDropPreflight.issues.join("；")}</p>{/if}
											<button type="button" disabled={!cloudflareDropPreflight.valid || cloudflareDropWorking} onclick={() => void createCloudflareDropJob()}>创建发布流程</button>
										{/if}
										{#if cloudflareDropJob}
											<article class="done"><span><Check size={13} /></span><div><strong>发布流程已保存</strong><p>本地源路径未保存；工作台仅保留展示名、预检统计和官网交接记录。</p></div></article>
											<button type="button" disabled={cloudflareDropWorking} onclick={() => void handoffToCloudflareDrop()}>打开官方 Cloudflare Drop 页面</button>
											<label>最终预览 URL（可选；仅记录，不会访问或打开）<input bind:value={cloudflareDropPreviewURL} inputmode="url" placeholder="https://…" /></label>
											<button type="button" disabled={cloudflareDropWorking || !cloudflareDropPreviewURL.trim()} onclick={() => void saveCloudflareDropPreviewURL()}>记录最终预览 URL</button>
										{/if}
									{/if}
								</section>
							{/if}
              <section class="capability-agent-binding">
                <header><Zap size={16} /><strong>绑定 Agent</strong></header>
                {#each agentCards.slice(0, 3) as agent (agent.id)}
                  {@const isBound = isCapabilityAgentBound(selectedCapability, agent.id)}
                  <button type="button" aria-pressed={isBound} onclick={() => void toggleCapabilityAgentBinding(selectedCapability, agent)}>
                    <span><strong>{agent.name}</strong><em>{agent.role} / {agent.status}</em></span>
                    <i class:enabled={isBound}><u></u></i>
                  </button>
                {/each}
              </section>
              <dl class="capability-runtime">
                <div><dt>状态</dt><dd>{selectedCapability.status}</dd></div>
                <div><dt>版本</dt><dd>{selectedCapability.version}</dd></div>
                <div><dt>来源</dt><dd>{selectedCapability.source}</dd></div>
                <div><dt>同步</dt><dd>{selectedCapability.sync}</dd></div>
                <div><dt>路径</dt><dd>{selectedCapability.path}</dd></div>
                <div><dt>权限</dt><dd>{selectedCapability.permission}</dd></div>
              </dl>
            </div>
            <footer><button type="button" onclick={() => void refreshCapabilities()}>刷新状态</button><button type="button" onclick={() => (capabilityDetailOpen = false)}>关闭</button><button type="button" disabled={selectedCapability.readOnly || selectedCapability.status.includes("开发中")} onclick={() => void toggleCapabilityEnabled(selectedCapability)}>{capabilityActionLabel(selectedCapability)}</button></footer>
          </div>
        </div>
      {/if}
      {#if configDialog === "customer"}
        <div class="modal-backdrop">
          <section class="config-modal customer-create-modal">
            <header><div><span>Customer</span><strong>{configDialogTitle()}</strong><p>填写客户档案、联系方式、风险状态和关联项目后保存到客户管理。</p></div><button type="button" onclick={() => (configDialog = undefined)}>x</button></header>
            <div class="config-grid">
              <label>客户名称 *<input bind:value={customerDraftName} placeholder="例如 内部研发团队" /></label>
              <label>客户类型<select bind:value={customerDraftType}>{#each customerTypeOptions as option (option)}<option value={option}>{option}</option>{/each}</select></label>
              <label>联系人<input bind:value={customerDraftContact} placeholder="例如 产品负责人" /></label>
              <label>联系电话<input bind:value={customerDraftPhone} placeholder="例如 138-0000-0000" /></label>
              <label>邮箱<input bind:value={customerDraftEmail} type="email" placeholder="name@example.com" /></label>
              <label>行业<input bind:value={customerDraftIndustry} placeholder="例如 研发工具 / 运营增长" /></label>
              <label>地区<input bind:value={customerDraftRegion} placeholder="例如 本地 / 上海 / 远程" /></label>
              <label>负责人 / Agent<select bind:value={customerDraftOwner}>{#each agentCards as agent (agent.id)}<option value={agent.name}>{agent.name}</option>{/each}<option value="我的">我的</option></select></label>
              <label>客户阶段<select bind:value={customerDraftStage}>{#each customerStageOptions as option (option)}<option value={option}>{option}</option>{/each}</select></label>
              <label>客户状态<select bind:value={customerDraftStatus}>{#each customerStatusOptions as option (option.value)}<option value={option.value}>{option.label}</option>{/each}</select></label>
              <label>风险等级<select bind:value={customerDraftRisk}>{#each customerRiskOptions as option (option)}<option value={option}>{option}</option>{/each}</select></label>
              <label>关联项目<select bind:value={customerDraftProjectId}><option value="">不关联项目</option>{#each projectCards as project (project.id)}<option value={project.id}>{project.name}</option>{/each}</select></label>
              <label>下次行动<input bind:value={customerDraftNextAction} placeholder="例如 确认需求边界" /></label>
              <label>标签<input bind:value={customerDraftTags} placeholder="用 / 或逗号分隔，例如 内部 / 研发" /></label>
              <label class="wide">地址<input bind:value={customerDraftAddress} placeholder="客户地址、工作群或会议地点" /></label>
              <label class="wide">备注<textarea rows="3" bind:value={customerDraftNote} placeholder="记录客户背景、沟通偏好、风险提示等"></textarea></label>
              <label class="wide">客户说明<textarea rows="4" bind:value={customerDraftDesc} placeholder="补充客户画像、业务目标、合作范围或验收口径"></textarea></label>
            </div>
            <footer><button type="button" onclick={() => (configDialog = undefined)}>取消</button><button type="button" onclick={confirmConfigDialog}>保存客户</button></footer>
          </section>
        </div>
      {/if}
      {#if configDialog && configDialog !== "customer"}
        <div class="modal-backdrop"><section class="config-modal" class:team-modal={configDialog === "team"} class:model-provider-modal={configDialog === "model"} class:schedule-modal={configDialog === "schedule"}><header><div><span>{configDialog === "team" ? "协作组" : configDialog === "model" ? "Model Channel" : "Workbench Dialog"}</span><strong>{configDialogTitle()}</strong>{#if configDialog === "team"}<p>设置团队名称并添加至少一个智能体。你可以将其中一个设为负责拆解、分配和汇总的协调者。</p>{:else if configDialog === "model"}<p>一个渠道对应一个模型来源：填写 Base URL、API Key 和该来源下的多个模型后保存。</p>{/if}</div><button type="button" onclick={() => (configDialog = undefined)}>x</button></header>{#if configDialog === "selectProject"}<div class="select-list"><p>{configDialogIntro()}</p>{#each projectCards as project (project.id)}<button type="button" onclick={() => { linkProjectToTask(project.name); configDialog = undefined; }}><strong>{project.name}</strong><span>{project.client} / {project.stage}</span></button>{/each}</div>{:else if configDialog === "selectCustomer"}<div class="select-list"><p>{configDialogIntro()}</p>{#each customerCards as customer (customer.id)}<button type="button" onclick={() => { linkCustomerToTask(customer.name); configDialog = undefined; }}><strong>{customer.name}</strong><span>{customer.phone} / {customer.risk}</span></button>{/each}</div>{:else if configDialog === "distill"}<div class="distill-panel"><p>{configDialogIntro()}</p><div class="distill-steps"><button class:active={distillStep === 1} type="button" onclick={() => (distillStep = 1)}>1. 选择样本</button><button class:active={distillStep === 2} type="button" onclick={() => (distillStep = 2)}>2. 提炼能力</button><button class:active={distillStep === 3} type="button" onclick={() => (distillStep = 3)}>3. 生成 Agent</button></div>{#if distillStep === 1}<div class="wizard-skill-list">{#each todoItems as item (item.id)}<button type="button" onclick={() => selectDistillSample(item)}><div><strong>{item.title}</strong><p>{todoDescription(item)}</p></div><em>{todoStatusLabel(item.status)}</em></button>{/each}</div>{:else if distillStep === 2}<div class="wizard-card-grid">{#each skillCards as skill (skill.id)}<button class:active={skill.active} type="button" onclick={() => toggleDistillSkill(skill.id)}><strong>{skill.title}</strong><span>{skill.desc}</span><em>{skill.version}</em></button>{/each}</div>{:else}<div class="wizard-preview distill-preview"><span>Agent Preview</span><div><b><Workflow size={24} /></b><strong>蒸馏任务 Agent</strong><em>{agentModel}</em><p>从已完成任务、工具调用和项目资料中抽取可复用工作流。</p></div></div>{/if}</div>{:else if configDialog === "team"}
  <div class="team-builder">
    <section>
      <label class="team-builder-search">
        <Search size={15} />
        <input bind:value={teamBuilderSearch} placeholder="搜索" />
      </label>
      <span>所有智能体 ({agentCards.length})</span>
      <div class="team-builder-list">
        {#each filteredTeamBuilderAgents as agent (agent.id)}
          {@const AgentIcon = agentIcon(agent.id)}
          {@const added = teamBuilderMemberIds.includes(agent.id)}
          <div class:active={added} class="team-builder-agent">
            <i><AgentIcon size={16} /></i>
            <div><strong>{agent.name}</strong><em>{agent.desc}</em></div>
            <button type="button" aria-label={added ? `移除 ${agent.name}` : `添加 ${agent.name}`} onclick={() => toggleTeamBuilderMember(agent.id)}>{added ? "×" : "+"}</button>
          </div>
        {:else}
          <p>没有匹配结果</p>
        {/each}
      </div>
    </section>
    <aside>
      <span>已选成员 ({teamBuilderMemberIds.length} / 10)</span>
      <div class="team-selected-list">
        {#each selectedTeamBuilderMembers() as member (member.id)}
          {@const MemberIcon = agentIcon(member.id)}
          <div class="team-selected-member">
            <i><MemberIcon size={13} /></i>
            <strong>{member.name}</strong>
            <button class:active={teamBuilderLeaderId === member.id} class="team-leader-button" type="button" title="设为 TL" onclick={() => toggleTeamBuilderLeader(member.id)}><Crown size={12} /></button>
            <button class="team-remove-button" type="button" aria-label={`移除 ${member.name}`} onclick={() => toggleTeamBuilderMember(member.id)}>×</button>
          </div>
        {:else}
          <p>请在左侧添加至少一个智能体。</p>
        {/each}
      </div>
      <label>团队名称 *<input bind:value={teamBuilderName} placeholder="例如 发布验证团队" /></label>
    </aside>
  </div>{:else if configDialog === "model"}
    <div class="config-grid">
      <label>渠道名称 *<input bind:value={modelDraft.name} placeholder="例如 company-llm" disabled={modelDraftEditing} /></label>
      <label>类型 *<select bind:value={modelDraft.kind}>{#each providerKindOptions as kind (kind)}<option value={kind}>{kind}</option>{/each}</select></label>
      <label class="wide">Base URL *<input bind:value={modelDraft.baseUrl} placeholder="https://api.example.com/v1" /></label>
      <label>API Key 环境变量<input bind:value={modelDraft.apiKeyEnv} placeholder="CUSTOM_API_KEY" /></label>
      <label>API Key<input bind:value={modelDraft.apiKeyValue} type="password" placeholder={modelDraftEditing ? "留空则不更新 Key" : "可留空，稍后再填"} /></label>
      <label>Models URL<input bind:value={modelDraft.modelsUrl} placeholder="可选，自定义 /models 地址" /></label>
      <div class="model-fetch-panel wide">
        <div class="model-fetch-panel__head">
          <div>
            <strong>自动获取模型</strong>
            <span>使用当前 Base URL 和 API Key 调用 OpenAI-compatible /models。</span>
          </div>
          <button type="button" onclick={() => void fetchDraftProviderModels()} disabled={modelDraftFetching || !hasWailsBindings() || !modelDraft.baseUrl.trim()}>
            <RefreshCw size={14} /> {modelDraftFetching ? "拉取中" : "自动获取模型"}
          </button>
        </div>
        {#if modelDraft.fetchedModels.length}
          <div class="model-fetch-actions">
            <span>已选择 {modelDraft.selectedFetchedModels.length} / {modelDraft.fetchedModels.length}</span>
            <button type="button" onclick={selectAllDraftFetchedModels}>全选</button>
            <button type="button" onclick={clearDraftFetchedModels}>清空</button>
          </div>
          <div class="model-fetch-list">
                          {#each modelDraft.fetchedModels as model, modelIndex (indexedKey(model, modelIndex))}
              <label class:active={isDraftFetchedModelSelected(model)}>
                <input type="checkbox" checked={isDraftFetchedModelSelected(model)} onchange={() => toggleDraftFetchedModel(model)} />
                <span>{model}</span>
              </label>
            {/each}
          </div>
        {/if}
      </div>
      <label class="wide">模型列表 *<textarea rows="5" bind:value={modelDraft.modelsText} placeholder="每行一个模型，或先自动获取后勾选"></textarea></label>
      <label>默认模型<input bind:value={modelDraft.defaultModel} placeholder="默认使用第一个模型" /></label>
      <label>渠道优先级<input bind:value={modelDraft.priority} inputmode="numeric" placeholder="0" /></label>
      <label>上下文窗口<input bind:value={modelDraft.contextWindow} inputmode="numeric" placeholder="128000" /></label>
      <label>请求 API<select bind:value={modelDraft.apiSurface}><option value="chat_completions">Chat Completions</option><option value="responses">Responses</option></select></label>
      {#if modelDraft.apiSurface === "responses"}<label>Responses URL<input bind:value={modelDraft.responsesUrl} placeholder="默认 base_url + /responses" /></label>{/if}
      <label>Reasoning Protocol<input bind:value={modelDraft.reasoningProtocol} placeholder="auto / none / openai" /></label>
      <label>默认 Effort<input bind:value={modelDraft.defaultEffort} placeholder="auto / high / max" /></label>
      <label class="wide">支持的 Effort<textarea rows="2" bind:value={modelDraft.supportedEffortsText} placeholder="逗号或换行分隔，例如 high, max"></textarea></label>
      <label class="wide">视觉模型<textarea rows="2" bind:value={modelDraft.visionModelsText} placeholder="可选，只给支持图片输入的模型填写"></textarea></label>
      {#if modelDraftError}<div class="model-inline-alert wide"><AlertTriangle size={15} /> {modelDraftError}</div>{/if}
      {#if modelDraftMessage}<div class="model-inline-alert wide"><Check size={15} /> {modelDraftMessage}</div>{/if}
    </div>
  {:else if configDialog === "report"}<div class="config-grid"><label>报告标题 *<input bind:value={reportDraftTitle} placeholder="例如 项目风险分析报告" /></label><label>报告类型<select bind:value={reportDraftKind}>{#each reportKindOptions as option (option)}<option value={option}>{option}</option>{/each}</select></label><label>状态<select bind:value={reportDraftStatus}>{#each reportStatusOptions as option (option)}<option value={option}>{option}</option>{/each}</select></label><label>优先级<select bind:value={reportDraftPriority}><option>中</option><option>高</option><option>低</option></select></label><label>关联项目<select bind:value={reportDraftProjectId}><option value="">不关联项目</option>{#each projectCards as project (project.id)}<option value={project.id}>{project.name}</option>{/each}</select></label><label>关联客户<select bind:value={reportDraftCustomerId}><option value="">不关联客户</option>{#each customerCards as customer (customer.id)}<option value={customer.id}>{customer.name}</option>{/each}</select></label><label>负责人 / Agent<select bind:value={reportDraftOwner}>{#each agentCards as agent (agent.id)}<option value={agent.name}>{agent.name}</option>{/each}</select></label><label>生成来源<select bind:value={reportDraftSource}>{#each reportSourceOptions as option (option)}<option value={option}>{option}</option>{/each}</select></label><label>输出格式<select bind:value={reportDraftFormat}>{#each reportFormatOptions as option (option)}<option value={option}>{option}</option>{/each}</select></label><label>截止时间<input type="datetime-local" bind:value={reportDraftDueAt} /></label><label class="wide">报告摘要<textarea rows="3" bind:value={reportDraftDesc} placeholder="填写报告摘要、适用对象和核心结论"></textarea></label><label class="wide">结构化正文<textarea rows="8" bind:value={reportDraftBody} placeholder="填写背景、数据依据、分析过程、结论和行动建议"></textarea></label></div>{:else if configDialog === "knowledge"}<div class="config-grid"><label>知识标题 *<input bind:value={knowledgeDraftTitle} placeholder="例如 交付验收规范" /></label><label>知识类型<select bind:value={knowledgeDraftType}>{#each knowledgeTypeOptions as option (option)}<option value={option}>{option}</option>{/each}</select></label><label>来源<select bind:value={knowledgeDraftSource}>{#each knowledgeSourceOptions as option (option)}<option value={option}>{option}</option>{/each}</select></label><label>标签<select bind:value={knowledgeDraftTags}><option value="">不设置标签</option>{#each knowledgeTagOptions as option (option)}<option value={option}>{option}</option>{/each}</select></label><label class="wide">摘要<textarea rows="3" bind:value={knowledgeDraftDescription} placeholder="填写这条知识的摘要、适用场景或关键结论"></textarea></label><label class="wide">正文 *<textarea rows="8" bind:value={knowledgeDraftContent} placeholder="填写要直接写入知识库并参与全文检索的正文内容"></textarea></label></div>{:else if configDialog === "template"}<div class="config-grid"><label>模板名称 *<input bind:value={templateDraftTitle} placeholder="例如 需求澄清记录模板" /></label><label>模板类型<select bind:value={templateDraftType}>{#each templateTypeOptions as option (option)}<option value={option}>{option}</option>{/each}</select></label><label>状态<select bind:value={templateDraftStatus}>{#each templateStatusOptions as option (option)}<option value={option}>{option}</option>{/each}</select></label><label>来源<select bind:value={templateDraftSource}>{#each templateSourceOptions as option (option)}<option value={option}>{option}</option>{/each}</select></label><label>标签<input bind:value={templateDraftTags} placeholder="用 / 或逗号分隔，例如 模板 / 工作台" /></label><label class="wide template-material-picker"><span>关联资料</span><div>{#each projectMaterialRows as material (material.id)}<button class:active={templateDraftMaterialIds.includes(material.id)} type="button" onclick={() => toggleTemplateMaterial(material.id)}><strong>{material.title}</strong><em>{materialProjectName(material)} / {material.category}</em></button>{:else}<p>资料库暂无可关联资料，请先上传资料。</p>{/each}</div><small>已关联 {templateDraftMaterialIds.length} 份资料，文档数会自动按关联数量计算。</small></label><label class="wide">模板说明<textarea rows="5" bind:value={templateDraftDescription} placeholder="填写模板用途、适用场景、字段结构或使用说明"></textarea></label></div>{:else if configDialog === "ingest"}<div class="config-grid"><label class="wide material-file-field"><span>选择文件 *</span><div class="material-file-picker"><input type="file" multiple aria-label="批量选择资料文件" onchange={handleIngestFilesChange} /><strong>选择文件</strong><span>{ingestDraftFileLabel || "未选择文件"}</span></div><em>可一次选择多个本地资料文件，确认后会写入资料库。</em></label><label>归属项目<select bind:value={ingestDraftProjectId}>{#each projectCards as project (project.id)}<option value={project.id}>{project.name}</option>{/each}</select></label><label>资料分类<select bind:value={ingestDraftCategory}>{#each materialCategoryOptions as option (option)}<option value={option}>{option}</option>{/each}</select></label><label>导入来源<select bind:value={ingestDraftSource}><option value="local files">local files</option><option value="workspace">workspace</option><option value="manual">manual</option></select></label><label>索引状态<select bind:value={ingestDraftStatus}>{#each materialStatusOptions as option (option)}<option value={option}>{option}</option>{/each}</select></label><label>索引策略<select bind:value={ingestDraftStrategy}><option>自动分类并去重</option><option>仅入库</option></select></label><label class="wide">批量说明<textarea rows="4" bind:value={ingestDraftDesc} placeholder="补充导入来源、用途、关联客户或处理说明"></textarea></label></div>{:else if configDialog === "dossier" || configDialog === "resource"}<div class="config-grid"><label>资料名称 *<input bind:value={materialDraftTitle} placeholder="例如 项目验收附件" /></label>{#if configDialog === "resource"}<label class="wide material-file-field"><span>选择文件 *</span><div class="material-file-picker"><input type="file" aria-label="选择资料文件" onchange={handleMaterialFileChange} /><strong>选择文件</strong><span>{materialDraftFileLabel || "未选择文件"}</span></div><em>请选择本地资料文件</em></label>{/if}<label>归属项目<select bind:value={materialDraftProjectId}>{#each projectCards as project (project.id)}<option value={project.id}>{project.name}</option>{/each}</select></label><label>资料分类<select bind:value={materialDraftCategory}>{#each materialCategoryOptions as option (option)}<option value={option}>{option}</option>{/each}</select></label><label>来源<input bind:value={materialDraftSource} placeholder="manual / 文件名 / URL" /></label><label>索引状态<select bind:value={materialDraftStatus}>{#each materialStatusOptions as option (option)}<option value={option}>{option}</option>{/each}</select></label><label class="wide">资料说明<textarea rows="4" bind:value={materialDraftDesc} placeholder="补充资料来源、用途、关联客户或待复核内容"></textarea></label></div>{:else if configDialog === "project"}<div class="config-grid"><label>项目名称 *<input bind:value={projectDraftName} placeholder="例如 客户门户上线" /></label><label>项目编号<input bind:value={projectDraftCode} placeholder="PRJ-2026-0702" /></label><label>客户/归属方<input bind:value={projectDraftClient} placeholder="例如 内部研发 / 客户名称" /></label><label>阶段<select bind:value={projectDraftStage}>{#each projectStageOptions as option (option)}<option value={option}>{option}</option>{/each}</select></label><label>负责人<input bind:value={projectDraftOwner} placeholder="例如 交付团队" /></label><label>项目类型<select bind:value={projectDraftCategory}>{#each projectCategoryOptions as option (option)}<option value={option}>{option}</option>{/each}</select></label><label>预算<input bind:value={projectDraftBudget} inputmode="decimal" placeholder="例如 120,000" /></label><label>立项日期<input type="date" bind:value={projectDraftAcceptedAt} /></label><label>状态<select bind:value={projectDraftStatus}><option value="active">进行中</option><option value="closed">已归档</option></select></label><label>进度<div class="percent-input"><input bind:value={projectDraftProgress} type="number" min="0" max="100" /><span>%</span></div></label><label>优先级<select bind:value={projectDraftPriority}><option>中</option><option>高</option><option>低</option></select></label><label>风险<select bind:value={projectDraftRisk}>{#each projectRiskOptions as option (option)}<option value={option}>{option}</option>{/each}</select></label><label>执行 Agent<select bind:value={projectDraftAgent}>{#each agentCards as agent (agent.id)}<option value={agent.name}>{agent.name}</option>{/each}</select></label><label>下一步<input bind:value={projectDraftNextStep} placeholder="例如 完成验收并输出报告" /></label><label class="wide">项目说明<textarea rows="4" bind:value={projectDraftDesc} placeholder="补充项目背景、目标、交付物或验收标准"></textarea></label></div>{:else if configDialog === "schedule"}<div class="config-grid schedule-config-grid"><label>标题<input bind:value={scheduleDraftTitleValue} placeholder="请输入日程标题" /></label><label>日期<input type="date" bind:value={scheduleDraftDate} /></label><label>时间<input type="time" bind:value={scheduleDraftTimeValue} /></label><label>类型<select bind:value={scheduleDraftType}><option value="">请选择类型</option><option value="meeting">meeting</option></select></label><label class="wide">地点<input bind:value={scheduleDraftPlaceValue} placeholder="请输入地点" /></label></div>{:else if configDialog === "todo"}<div class="config-grid"><label>名称<input bind:value={todoDraftTitle} placeholder="例如 跟进客户反馈" /></label><label>关联对象<select bind:value={todoDraftProjectId}><option value="">不关联项目</option>{#each projectCards as project (project.id)}<option value={project.id}>{project.name}</option>{/each}</select></label><label>执行 Agent<select><option>{agentCards.find((agent) => agent.id === selectedAgentId)?.name}</option>{#each agentCards as agent (agent.id)}<option>{agent.name}</option>{/each}</select></label><label>模型<select><option>{selectedModel || agentModel}</option>{#each modelCards as model (model.ref)}<option>{model.name}</option>{/each}</select></label><label>优先级<select bind:value={todoDraftPriority}><option>中</option><option>高</option><option>低</option></select></label><label>截止时间<input type="datetime-local" bind:value={todoDraftDue} /></label><label class="wide">配置说明<textarea rows="4" bind:value={todoDraftDesc} placeholder="补充待办背景、验收标准或下一步动作"></textarea></label></div>{:else}<div class="config-grid"><label>名称<input value={configDialogTitle()} /></label><label>关联对象<input value={linkedProject || linkedCustomer || selectedProject()?.name || "Volt GUI"} readonly /></label><label>执行 Agent<select><option>{agentCards.find((agent) => agent.id === selectedAgentId)?.name}</option>{#each agentCards as agent (agent.id)}<option>{agent.name}</option>{/each}</select></label><label>模型<select><option>{selectedModel || agentModel}</option>{#each modelCards as model (model.ref)}<option>{model.name}</option>{/each}</select></label><label>优先级<select><option>中</option><option>高</option><option>低</option></select></label><label>截止时间<input value="今天 18:00" /></label><label class="wide">配置说明<textarea rows="4">{configDialogIntro()}</textarea></label></div>{/if}<footer><button type="button" onclick={() => (configDialog = undefined)}>取消</button><button type="button" disabled={modelDraftSaving} onclick={confirmConfigDialog}>{modelDraftSaving ? "保存中" : configDialog === "model" ? "保存渠道" : "确认"}</button></footer></section></div>
      {/if}
      {#if agentWizardOpen}
        {@const WizardAvatarIcon = avatarIcon(agentAvatar)}
        <div class="modal-backdrop"><section class="agent-wizard"><header class="agent-wizard__header"><div class="wizard-avatar"><WizardAvatarIcon size={22} /></div><div><strong>{agentWizardMode === "create" ? "创建 Agent" : agentWizardName()}</strong><span>创建与配置 Agent</span></div><button type="button" onclick={() => (agentWizardOpen = false)}>x</button></header><div class="agent-wizard__body"><nav class="wizard-tabs">{#each wizardTabs as tab (tab.id)}<button class:active={agentWizardTab === tab.id} type="button" onclick={() => (agentWizardTab = tab.id)}>{tab.label}</button>{/each}</nav><div class="wizard-panel">{#if agentWizardTab === "identity"}<div class="wizard-identity"><div class="wizard-form"><label>智能体名称<input bind:value={agentWizardDraftName} /></label><label>系统设定指示词<textarea rows="4" bind:value={agentWizardDraftDescription}></textarea></label><div class="pill-group"><span>智能体头像</span>{#each avatarPresets as avatar (avatar)}{@const AvatarOptionIcon = avatarIcon(avatar)}<button class:active={agentAvatar === avatar} type="button" aria-label={`选择头像 ${avatar}`} onclick={() => (agentAvatar = avatar)}><AvatarOptionIcon size={15} /></button>{/each}</div><div class="pill-group"><span>协作风格</span>{#each vibePresets as vibe (vibe)}<button class:active={agentWizardVibe === vibe} type="button" aria-pressed={agentWizardVibe === vibe} onclick={() => (agentWizardVibe = vibe)}>{vibe}</button>{/each}</div><div class="pill-group"><span>模型底座</span>{#each modelProviders as provider (provider)}<button class:active={agentProvider === provider} type="button" onclick={() => { agentProvider = provider; agentModel = modelOptions[provider]?.[0] || agentModel; }}>{provider}</button>{/each}</div><select value={agentModel} onchange={(event) => (agentModel = (event.currentTarget as HTMLSelectElement).value)}>{#each modelOptions[agentProvider] || [] as model (model)}<option value={model}>{model}</option>{/each}</select></div><aside class="wizard-preview"><span>身份预览</span><div><b><WizardAvatarIcon size={28} /></b><strong>{agentWizardName() || "未命名 Agent"}</strong><em>{agentModel}</em><p>{agentWizardDescription() || "尚未分配具体职能。"}</p></div></aside></div>{:else if agentWizardTab === "tools"}<div class="wizard-card-grid">{#each toolCards as tool (tool.id)}<button class:active={tool.active} class:unavailable={!tool.available} type="button" disabled={!tool.available} title={tool.reason} onclick={() => toggleAgentTool(tool.id)}><strong>{tool.title}</strong><span>{tool.desc}</span><em>{tool.available ? (tool.active ? "已启用" : "未启用") : "不可用"}</em></button>{/each}</div>{:else if agentWizardTab === "skills"}<div class="wizard-skill-list">{#each skillCards as skill (skill.id)}<button class:active={skill.active} class:unavailable={!skill.available} type="button" disabled={!skill.available} title={skill.reason} onclick={() => toggleAgentSkill(skill.id)}><div><strong>{skill.title}</strong><span>{skill.version}</span><p>{skill.desc}</p></div><em>{skill.available ? (skill.active ? "已挂载" : "未挂载") : "不可用"}</em></button>{/each}</div>{:else}<div class="wizard-files"><nav>{#each coreFiles as file, fileIndex (indexedKey(file, fileIndex))}<button class:active={selectedCoreFile === file} type="button" onclick={() => (selectedCoreFile = file)}>{file}</button>{/each}</nav><pre>{coreFileContent[selectedCoreFile]}</pre></div>{/if}</div></div><footer class="agent-wizard__footer"><button type="button" onclick={() => (agentWizardOpen = false)}>取消</button><button type="button" onclick={() => void saveAgentWizard()}>完成并部署</button></footer></section></div>
      {/if}
      {#if agentMarketOpen}
        <div class="modal-backdrop">
          <div class="config-modal agent-market-modal" role="dialog" aria-modal="true" aria-label="Agent 市场">
            <header>
              <div><span>Agent Market</span><strong>Agent 市场（开发中）</strong></div>
              <button type="button" onclick={() => (agentMarketOpen = false)}>x</button>
            </header>
            <div class="agent-market-toolbar">
              <label class="aorist-search agent-market-search"><Search size={16} /><input bind:value={agentMarketSearch} aria-label="搜索 Agent 市场" placeholder="搜索 Agent 类型、能力或来源" /></label>
              <div class="agent-market-stats">
                <span>{downloadedMarketAgentIds.length} 已保存</span>
                <span>{agentMarketItems.length} 个本地模板</span>
              </div>
            </div>
            <div class="agent-market-grid">
              {#each filteredAgentMarketItems() as item (item.id)}
                {@const MarketIcon = agentIcon(item.id)}
                {@const downloaded = marketAgentDownloaded(item)}
                <article class:downloaded class="agent-market-card">
                  <header>
                    <span><MarketIcon size={18} /></span>
                    <div><strong>{item.name}</strong><em>{item.category} / {item.source}</em></div>
                    <b>{item.version}</b>
                  </header>
                  <p>{item.desc}</p>
                  <div class="agent-market-tags">
                    {#each item.tags as tag, tagIndex (indexedKey(tag, tagIndex))}
                      <span>{tag}</span>
                    {/each}
                  </div>
                  <footer>
                    <small>本地模板包 / 远程市场开发中</small>
                    <button class:downloaded type="button" onclick={() => downloadMarketAgent(item)}>
                      {#if downloaded}<Check size={14} /> 已保存{:else}<Download size={14} /> 保存本地模板{/if}
                    </button>
                  </footer>
                </article>
              {:else}
                <div class="agent-market-empty"><Search size={18} /><strong>没有匹配的 Agent</strong><p>换一个关键词继续查找。</p></div>
              {/each}
            </div>
            <footer><button type="button" onclick={() => (agentMarketOpen = false)}>关闭</button><button type="button" onclick={() => { agentMarketOpen = false; openAgentWizard(); }}>创建自定义 Agent</button></footer>
          </div>
        </div>
      {/if}

      {#if capabilityImportOpen}
        <div class="modal-backdrop">
          <section class="config-modal capability-create-modal">
            <header><div><span>MCP Config Import</span><strong>导入 MCP 配置</strong></div><button type="button" onclick={() => (capabilityImportOpen = false)}>x</button></header>
            <div class="config-grid capability-create-form">
              <label class="wide material-file-field"><span>选择 .mcp.json 文件</span><div class="material-file-picker"><input type="file" accept="application/json,.json" aria-label="选择 MCP 配置文件" onchange={handleMCPConfigFileChange} /><strong>选择配置文件</strong><span>也可以直接粘贴配置内容</span></div><em>支持 Claude/Codex 兼容的 <code>mcpServers</code> 格式；可导入 stdio、HTTP 和 SSE 服务。</em></label>
              <label class="wide">配置内容 *<textarea rows="12" bind:value={capabilityImportText} placeholder={'{\n  "mcpServers": {\n    "example": { "command": "npx", "args": ["-y", "@scope/mcp-server"] }\n  }\n}'}></textarea></label>
            </div>
            <footer><button type="button" onclick={() => (capabilityImportOpen = false)}>取消</button><button type="button" onclick={() => void submitMCPConfigImport()}>导入 MCP 配置</button></footer>
          </section>
        </div>
      {/if}

      {#if capabilityCreateOpen}
        <div class="modal-backdrop">
          <section class="config-modal capability-create-modal">
            <header><div><span>Capability Create</span><strong>创建{capabilityLabel(capabilityTab)}</strong></div><button type="button" onclick={() => (capabilityCreateOpen = false)}>x</button></header>
            <div class="capability-create-tabs" role="tablist" aria-label="创建能力类型">
              <button class:active={capabilityTab === "plugin"} type="button" onclick={() => switchCapabilityTab("plugin")}>插件</button>
              <button class:active={capabilityTab === "mcp"} type="button" onclick={() => switchCapabilityTab("mcp")}>MCP</button>
              <button class:active={capabilityTab === "skill"} type="button" onclick={() => switchCapabilityTab("skill")}>SKILL</button>
            </div>
            <div class="config-grid capability-create-form">
              {#if capabilityTab === "mcp"}
                <label>名称 *<input bind:value={capabilityCreateName} placeholder="例如 filesystem" /></label>
                <label>传输方式 *<select bind:value={capabilityCreateTransport}><option value="stdio">stdio（本地命令）</option><option value="http">HTTP（Streamable HTTP）</option><option value="sse">SSE</option></select></label>
                {#if capabilityCreateTransport === "stdio"}
                  <label class="wide">启动命令 *<input bind:value={capabilityCreateEntry} placeholder="例如 npx 或 /usr/local/bin/mcp-server" /></label>
                  <label class="wide">启动参数（每行一个或 JSON 数组）<textarea rows="3" bind:value={capabilityCreateArgs} placeholder={'例如\n-y\n@modelcontextprotocol/server-filesystem\n/你的工作目录'}></textarea></label>
                {:else}
                  <label class="wide">服务 URL *<input bind:value={capabilityCreateEntry} placeholder={capabilityCreateTransport === "http" ? "https://example.com/mcp" : "https://example.com/sse"} /></label>
                {/if}
                <label class="wide">环境变量<textarea rows="3" bind:value={capabilityCreateMcpEnv} placeholder="一行一个 KEY=VALUE，例如：&#10;GITHUB_TOKEN=your-token"></textarea></label>
                <label>启动状态<select bind:value={capabilityCreateStatus}><option>启用</option><option>待配置</option><option>需授权</option></select></label>
                <label class="wide">配置说明<textarea rows="4" bind:value={capabilityCreateDescription} placeholder="可选：记录服务用途、授权方式或重连注意事项"></textarea></label>
              {:else if capabilityTab === "skill"}
                <label>名称<input bind:value={capabilityCreateName} placeholder="如 contract-review" /></label>
                <label>运行方式<select bind:value={capabilityCreateScope}><option value="workflow">workflow</option><option value="prompt">prompt</option><option value="tool">tool</option></select></label>
                <label>入口文件<input bind:value={capabilityCreateEntry} placeholder="SKILL.md" readonly /></label>
                <label>启动状态<select bind:value={capabilityCreateStatus}><option>启用</option><option>待配置</option><option>需授权</option></select></label>
                <label class="wide">说明<textarea rows="4" bind:value={capabilityCreateDescription} placeholder="描述 Skill 的使用场景、输入输出、执行步骤和注意事项。"></textarea></label>
              {:else}
                <label>名称<input bind:value={capabilityCreateName} /></label>
                <label>分组<input bind:value={capabilityCreateGroup} /></label>
                <label>版本<input bind:value={capabilityCreateVersion} /></label>
                <label>运行范围<input bind:value={capabilityCreateScope} /></label>
                <label>入口路径<input bind:value={capabilityCreateEntry} /></label>
                <label>默认状态<select bind:value={capabilityCreateStatus}><option>启用</option><option>待配置</option><option>需授权</option></select></label>
                <label class="wide">配置说明<textarea rows="4" bind:value={capabilityCreateDescription}></textarea></label>
              {/if}
            </div>
            <footer><button type="button" onclick={() => (capabilityCreateOpen = false)}>取消</button><button type="button" onclick={() => void submitCapabilityCreate()}>创建并挂载</button></footer>
          </section>
        </div>
      {/if}

    </section>
  </main>
{/if}

<style>
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  .shell {
    --sidebar-width: clamp(220px, 15vw, 280px);
    --content-width: clamp(620px, 52vw, 900px);
    --document-width: clamp(620px, 58vw, 860px);
    display: grid;
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
    height: 100vh;
    padding: 0;
    color: #202124;
    background: #f0f0f0;
  }

  .shell.is-sidebar-collapsed {
    --sidebar-width: 72px;
  }

  .shell.is-sidebar-collapsed .sidebar {
    padding-inline: 10px;
  }

  .shell.is-sidebar-collapsed .stage__composer {
    left: 50%;
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 14px 12px 12px;
    background: #eeeeee;
    border-right: 1px solid #dfdfdf;
  }

  .sidebar__user {
    display: grid;
    grid-template-columns: 30px minmax(0, auto) auto;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    color: #3f3f3f;
    font-size: 13px;
  }

  .sidebar__avatar {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    color: #5b28cf;
    background: #b89cff;
    border-radius: 8px;
  }

  .sidebar__user strong {
    overflow: hidden;
    font-weight: 560;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sidebar__user em {
    padding: 2px 6px;
    color: #4a4a4a;
    background: #ffffff;
    border: 1px solid #dddddd;
    border-radius: 5px;
    font-size: 11px;
    font-style: normal;
  }

  .stage {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 8px 8px 8px 0;
    background: #f0f0f0;
  }

  .window-drag-region {
    --wails-draggable: drag;
    position: absolute;
    top: 10px;
    right: 10px;
    left: 0;
    z-index: 2;
    height: 44px;
    pointer-events: none;
  }

  .stage__surface {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: #ffffff;
    border: 1px solid #dedede;
    border-radius: 16px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
  }

  .stage__surface,
  .workbench,
  .home,
  .conversation-view,
  .conversation,
  .stage__composer,
  .home__composer,
  button,
  :global(select),
  :global(textarea),
  :global(input) {
    --wails-draggable: no-drag;
  }

  .content__loading {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: var(--fg-faint);
    font-size: 14px;
  }

  .workbench {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 18px;
    background: #ffffff;
  }

  .code-tools {
    display: grid;
    grid-template-columns: repeat(4, minmax(116px, 1fr));
    gap: 8px;
    width: min(100%, 720px);
    margin-top: 16px;
  }

  .code-tools button {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
    min-height: 36px;
    padding: 0 10px;
    color: #3c3c3c;
    background: #fafafa;
    border: 1px solid #e5e5e5;
    border-radius: 10px;
    font-size: 12px;
    text-align: left;
  }

  .code-tools button:hover {
    background: #f3f3f3;
    border-color: #d8d8d8;
  }

  .code-tools span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .code-tools em {
    color: #6f6f6f;
    font-style: normal;
  }

  .home__quick button:hover {
    background: #f8f8f8;
    border-color: #d4d4d4;
  }

  .conversation {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 26px clamp(24px, 5vw, 80px) 20px;
  }

  .conversation-view {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .conversation-header {
    --wails-draggable: drag;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 50px;
    padding: 0 18px;
    border-bottom: 1px solid #eeeeee;
  }

  .conversation-header div {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .conversation-header strong {
    overflow: hidden;
    color: #242424;
    font-size: 14px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .conversation-header span {
    overflow: hidden;
    color: #8a8a8a;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .conversation-header button {
    --wails-draggable: no-drag;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 30px;
    padding: 0 10px;
    color: #303030;
    background: #ffffff;
    border: 1px solid #e5e5e5;
    border-radius: 8px;
    font-size: 12px;
  }

  .stage__composer {
    position: absolute;
    bottom: 26px;
    left: 50%;
    z-index: 4;
    width: min(100%, var(--document-width));
    transform: translateX(-50%);
  }

  .code-inspector {
    --wails-draggable: no-drag;
    position: absolute;
    top: 72px;
    right: 24px;
    bottom: 24px;
    z-index: 5;
    display: flex;
    flex-direction: column;
    width: min(500px, calc(100% - var(--sidebar-width) - 56px));
    min-width: 360px;
    overflow: hidden;
    background: #ffffff;
    border: 1px solid #dedede;
    border-radius: 16px;
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.12);
  }

  .code-inspector header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 46px;
    padding: 0 14px 0 18px;
    border-bottom: 1px solid #ededed;
  }

  .code-inspector header strong {
    font-size: 15px;
    font-weight: 620;
  }

  .code-inspector header button {
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    color: #666666;
    background: #f4f4f4;
    border: 0;
    border-radius: 8px;
    font-size: 20px;
  }

  .code-inspector :global(.code-layout) {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 14px;
  }

  .code-inspector :global(.dashboard-grid) {
    grid-template-columns: 1fr;
  }

  .code-inspector :global(.code-dock) {
    box-shadow: none;
  }

  .home__composer :global(.composer),
  .stage__composer :global(.composer) {
    min-height: 112px;
    background: #ffffff;
    border: 1px solid #e2e2e2;
    border-radius: 15px;
    box-shadow: none;
  }

  .home__composer :global(.composer) {
    border-radius: 15px 15px 0 0;
  }

  .home__composer :global(.composer textarea),
  .stage__composer :global(.composer textarea) {
    min-height: 56px;
    color: #242424;
    font-size: 14px;
  }

  .home__composer :global(.composer button[type="submit"]),
  .stage__composer :global(.composer button[type="submit"]) {
    width: 36px;
    height: 36px;
    justify-content: center;
    padding: 0;
    color: #7a6edb;
    background: #ded8ff;
    border-radius: 11px;
  }

  .home__composer :global(.composer button[type="submit"] span),
  .stage__composer :global(.composer button[type="submit"] span) {
    display: none;
  }

  .boot-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    color: var(--fg-faint);
    font-size: 14px;
  }

  @media (max-width: 980px) {
    .shell {
      --sidebar-width: 220px;
      --content-width: min(760px, calc(100vw - var(--sidebar-width) - 72px));
      --document-width: min(760px, calc(100vw - var(--sidebar-width) - 72px));
    }

    .stage__composer {
      width: min(100%, var(--document-width));
    }

    .home__composer,
    .code-tools {
      width: min(760px, 86%);
    }

    .home__quick,
    .code-tools {
      grid-template-columns: repeat(2, minmax(150px, 1fr));
    }

  }

  @media (max-width: 768px) {
    .shell {
      --content-width: calc(100vw - 36px);
      --document-width: calc(100vw - 36px);
      grid-template-columns: 1fr;
    }

    .sidebar {
      display: none;
    }

    .stage {
      padding: 8px;
    }

    .stage__composer {
      width: var(--document-width);
      bottom: 20px;
    }

    .conversation {
      padding: 18px 18px 200px;
    }

    .conversation-header {
      padding: 0 14px;
    }

    .home {
      padding: 32px 14px 90px;
    }

    .workbench {
      padding: 12px;
    }


    .home__composer {
      width: 100%;
    }

    .home__quick,
    .code-tools {
      width: 100%;
      grid-template-columns: 1fr 1fr;
    }

    .code-inspector {
      right: 12px;
      left: 12px;
      bottom: 12px;
      width: auto;
      min-width: 0;
    }

    .home h1 {
      margin-bottom: 34px;
      font-size: 30px;
    }

  }

  @media (max-width: 520px) {
    .home h1 {
      align-items: flex-start;
      flex-wrap: wrap;
      justify-content: center;
      text-align: center;
    }

    .home__quick,
    .code-tools {
      grid-template-columns: 1fr;
    }

  }

  @media (min-width: 1800px) {
    .shell {
      --sidebar-width: 280px;
      --content-width: 900px;
      --document-width: 820px;
    }

    .home {
      padding-bottom: 13vh;
    }
  }

  @media (min-width: 2400px) {
    .shell {
      --sidebar-width: 280px;
      --content-width: 900px;
      --document-width: 820px;
    }

    .home h1 {
      font-size: 34px;
    }
  }


  .sidebar--aorist{padding:0;background:hsl(220 20% 98%);border-right:1px solid hsl(220 20% 90%)}
  .sidebar__brand{--wails-draggable:drag;display:grid;grid-template-columns:34px minmax(0,1fr) 30px;gap:10px;align-items:center;min-height:56px;padding:0 12px;border-bottom:1px solid #e5e7eb}.brand-mark,.nav-icon{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9px;color:#1f5fbf;background:#eaf2ff}.brand-mark img{display:block;max-width:100%;max-height:100%;object-fit:contain}.brand-mark span{margin:0;font-size:12px;font-weight:800;color:inherit}.brand-wordmark{display:block;max-width:100%;max-height:24px;object-fit:contain;object-position:left center}.sidebar__brand strong,.sidebar__brand span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sidebar__brand strong{font-size:14px;color:#111827}.sidebar__brand span{margin-top:2px;color:#6b7280;font-size:11px}
  .workspace-nav{flex:1;min-height:0;overflow:auto;padding:10px 8px}.workspace-nav section{margin-bottom:10px}.workspace-nav h2{margin:8px 8px 5px;color:#8b95a1;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.workspace-nav button{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:9px;width:100%;min-height:36px;padding:4px 8px;color:#5f6774;background:transparent;border:0;border-radius:10px;text-align:left;font:inherit}.workspace-nav button:hover,.workspace-nav button.active{color:#1f2937;background:hsl(220 20% 94%)}.workspace-nav button span:nth-child(2){overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:620}.workspace-nav button em{min-width:18px;padding:1px 5px;border-radius:999px;background:#e6eefc;color:#1f5fbf;font-size:10px;font-style:normal;text-align:center}
  .sidebar__user-wrap{position:relative;padding:0 8px 10px}.sidebar__user-wrap .sidebar__user{width:100%;display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px;border:1px solid #e5e7eb;border-radius:13px;background:#fff;text-align:left;font:inherit}.user-menu{position:absolute;left:8px;right:8px;bottom:58px;z-index:40;display:grid;gap:4px;padding:6px;border:1px solid #e5e7eb;border-radius:14px;background:#fff;box-shadow:0 18px 38px rgba(15,23,42,.16)}.user-menu button{width:100%;padding:9px 10px;border:0;border-radius:9px;color:#344054;background:transparent;text-align:left;font-size:13px}.user-menu button:hover{background:#f3f6fb;color:#111827}
  .stage-topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:58px;padding:0 18px;border-bottom:1px solid #e5e7eb;background:rgba(255,255,255,.76);backdrop-filter:blur(16px)}.stage-topbar span,.aorist-toolbar span,.hero-panel span{color:#7b8494;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.stage-topbar strong{display:block;margin-top:2px;font-size:17px;color:#111827}.stage-topbar__actions,.aorist-toolbar>div:last-child{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.hero-panel button,.aorist-toolbar button,:global(.composer-context-actions button),.automation-card footer button,.capability-item button,.config-modal footer button,.agent-wizard__footer button{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:0 12px;border:1px solid #d9dee8;border-radius:10px;background:#fff;color:#344054;font-size:12px;font-weight:650}.hero-panel button:first-child,.aorist-toolbar button:last-child,.config-modal footer button:last-child,.agent-wizard__footer button:last-child{border-color:#1f5fbf;background:#1f5fbf;color:#fff}
  .workbench-notice{position:absolute;top:68px;right:24px;z-index:20;display:inline-flex;align-items:center;gap:7px;max-width:min(420px,calc(100% - 48px));min-height:34px;padding:0 12px;border:1px solid #bfdbfe;border-radius:10px;background:rgba(239,246,255,.96);color:#1d4ed8;font-size:12px;font-weight:700;box-shadow:0 12px 28px rgba(15,23,42,.12)}.workbench-notice :global(svg){flex:0 0 auto}
  .aorist-workbench{padding:0;overflow:hidden}.aorist-page{min-height:0;height:100%;overflow:auto;padding:18px;background:radial-gradient(circle at 18% 0%,rgba(31,95,191,.1),transparent 32%),#f7f8fb}.hero-panel{padding:28px;border:1px solid #dfe5ef;border-radius:22px;background:linear-gradient(135deg,#fff 0%,#eef4ff 100%);box-shadow:0 16px 34px rgba(15,23,42,.08)}.hero-panel h1{max-width:760px;margin:10px 0;color:#111827;font-size:clamp(28px,4vw,46px);line-height:1.05;letter-spacing:-.04em}.hero-panel p{max-width:680px;margin:0 0 18px;color:#5f6774;line-height:1.7}.hero-panel div{display:flex;gap:10px;flex-wrap:wrap}.aorist-stats,.aorist-card-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:14px}.aorist-stats article,.aorist-card,.aorist-list article,.agent-card,.automation-card,.media-card,.capability-item,:global(.task-composer-card){border:1px solid #e2e8f0;border-radius:16px;background:rgba(255,255,255,.92);box-shadow:0 8px 22px rgba(15,23,42,.05)}.aorist-stats article{padding:16px}.aorist-stats span,.aorist-stats em{display:block;color:#7b8494;font-size:12px;font-style:normal}.aorist-stats strong{display:block;margin:8px 0 3px;color:#111827;font-size:28px;letter-spacing:-.04em}.aorist-split{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr);gap:12px;margin-top:14px}.aorist-card{padding:14px}.aorist-card header,.aorist-toolbar,.agent-card header,:global(.task-composer-card__head),.config-modal header,.agent-wizard__header,.agent-wizard__footer{display:flex;align-items:center;justify-content:space-between;gap:12px}.aorist-card header strong,.aorist-toolbar strong{color:#111827;font-size:16px}.aorist-card header button{border:0;background:transparent;color:#1f5fbf;font-size:12px}.todo-row,.automation-row{display:grid;grid-template-columns:10px minmax(0,1fr) auto;align-items:center;width:100%;gap:10px;margin-top:8px;padding:10px;border:1px solid #eef2f7;border-radius:12px;background:#fff;text-align:left}.automation-row{grid-template-columns:minmax(0,1fr) auto}.todo-row i{width:8px;height:8px;border-radius:999px;background:#1f5fbf}.todo-row strong,.automation-row strong{display:block;color:#1f2937;font-size:13px}.todo-row em,.automation-row em{display:block;margin-top:3px;color:#7b8494;font-size:11px;font-style:normal}.todo-row b,.automation-row b{color:#1f5fbf;font-size:11px}
  :global(.agent-strip){display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:12px}:global(.agent-strip button){display:grid;grid-template-columns:34px minmax(0,1fr);gap:9px;align-items:center;padding:12px;border:1px solid #e2e8f0;border-radius:15px;background:#fff;text-align:left}:global(.agent-strip button.active){border-color:#1f5fbf;background:#eef4ff}:global(.agent-strip span){grid-row:span 2;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:12px;background:#1f5fbf;color:#fff}:global(.agent-strip strong){color:#111827;font-size:13px}:global(.agent-strip em){color:#7b8494;font-size:11px;font-style:normal}:global(.task-composer-card){padding:14px}:global(.task-composer-card__head){margin-bottom:12px}:global(.task-composer-card__head) strong{display:block;color:#111827;font-size:18px}:global(.task-composer-card__head) select,.config-grid input,.config-grid textarea,.aorist-search input,.wizard-form input,.wizard-form textarea,.wizard-form select{border:1px solid #d9dee8;border-radius:10px;background:#fff;color:#111827}:global(.task-composer-card__head) select{height:34px;padding:0 10px}:global(.composer-context-actions){display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}:global(.composer-context-actions > span){display:inline-flex;align-items:center;min-height:32px;padding:0 10px;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff;color:#1f5fbf;font-size:12px;font-weight:650}
  .aorist-toolbar{margin-bottom:14px;padding:14px;border:1px solid #e2e8f0;border-radius:16px;background:#fff}.aorist-search{display:block;max-width:420px;margin-bottom:12px}.aorist-search input{width:100%;height:38px;padding:0 12px}.aorist-list{display:grid;gap:10px}.aorist-list article{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:15px;cursor:pointer}.aorist-list strong{color:#111827}.aorist-list p{margin:4px 0;color:#5f6774;font-size:13px}.aorist-list em{color:#7b8494;font-size:12px;font-style:normal}.aorist-list span{padding:4px 8px;border-radius:999px;background:#eef4ff;color:#1f5fbf;font-size:12px;white-space:nowrap}.aorist-card-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.automation-card,.agent-card,.media-card,.capability-item{padding:15px;cursor:pointer}.automation-card span,.media-card span,.capability-item span{display:inline-block;margin-bottom:9px;padding:3px 8px;border-radius:999px;background:#eef4ff;color:#1f5fbf;font-size:11px}.automation-card strong,.media-card strong,.capability-item strong{display:block;color:#111827;font-size:15px}.automation-card p,.media-card p,.capability-item p{color:#5f6774;font-size:13px;line-height:1.6}.automation-card dl{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;color:#7b8494;font-size:12px}.automation-card dd{margin:0;color:#111827}.automation-card footer{display:flex;justify-content:flex-end;gap:7px;margin-top:12px}.automation-card footer button:last-child{color:#b42318}.agent-card header{align-items:flex-start}.agent-card header>span{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:13px;background:#eef4ff;color:#1f5fbf}.agent-card header div{flex:1;min-width:0}.agent-card header strong{display:block;color:#111827}.agent-card header em{display:inline-block;margin-top:4px;color:#7b8494;font-size:11px;font-style:normal}.agent-card header button{width:30px;height:30px;border:0;border-radius:8px;background:transparent;color:#98a2b3;opacity:0}.agent-card:hover header button{opacity:1}.agent-card p{color:#5f6774;line-height:1.6;font-size:13px}.agent-card footer{display:flex;align-items:center;justify-content:space-between;color:#7b8494;font-size:12px}.agent-card footer span{display:inline-flex;align-items:center;gap:4px}.agent-card footer b{color:#1f5fbf;font-size:12px}.capability-tabs{display:flex;gap:8px;margin:0 0 12px;padding:4px;width:max-content;border:1px solid #e2e8f0;border-radius:12px;background:#fff}.capability-tabs button{min-width:92px;height:32px;border:0;border-radius:9px;background:transparent;color:#5f6774;font-weight:700}.capability-tabs button.active{background:#1f5fbf;color:#fff}
  .modal-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:22px;background:rgba(15,23,42,.38);backdrop-filter:blur(8px)}.config-modal,.agent-wizard{width:min(860px,calc(100vw - 44px));max-height:calc(100vh - 44px);overflow:hidden;border:1px solid #e2e8f0;border-radius:20px;background:#fff;box-shadow:0 24px 60px rgba(15,23,42,.28)}.config-modal{padding:18px}.config-modal header strong,.agent-wizard__header strong{display:block;color:#111827;font-size:17px}.config-modal header button,.agent-wizard__header>button{border:0;background:transparent;color:#667085;font-size:24px}.config-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}.config-grid label{display:grid;gap:6px;color:#5f6774;font-size:12px}.config-grid .wide{grid-column:1/-1}.config-grid input{height:36px;padding:0 10px}.config-grid textarea{padding:10px;resize:vertical}.config-modal footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.agent-wizard{display:grid;grid-template-rows:auto minmax(0,1fr) auto;height:min(680px,calc(100vh - 44px))}.agent-wizard__header{padding:16px 18px;border-bottom:1px solid #e5e7eb}.wizard-avatar{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,#1f5fbf,#3b82f6);color:#fff}.agent-wizard__header div:nth-child(2){flex:1}.agent-wizard__header span{color:#7b8494;font-size:12px}.agent-wizard__body{display:grid;grid-template-columns:178px minmax(0,1fr);min-height:0}.wizard-tabs{padding:12px;border-right:1px solid #e5e7eb;background:#f8fafc}.wizard-tabs button{width:100%;padding:10px;border:0;border-radius:12px;background:transparent;text-align:left;color:#111827}.wizard-tabs button.active{background:#fff;box-shadow:0 4px 14px rgba(15,23,42,.08)}.wizard-panel{min-height:0;overflow:auto;padding:18px}.wizard-identity{display:grid;grid-template-columns:minmax(0,1fr)230px;gap:18px}.wizard-form{display:grid;gap:14px}.wizard-form label{display:grid;gap:6px;color:#5f6774;font-size:12px}.wizard-form input,.wizard-form select{height:38px;padding:0 10px}.wizard-form textarea{padding:10px;resize:vertical}.pill-group{display:flex;align-items:center;flex-wrap:wrap;gap:7px}.pill-group span{width:100%;color:#5f6774;font-size:12px}.pill-group button{min-height:30px;padding:0 10px;border:1px solid #d9dee8;border-radius:999px;background:#fff;color:#344054}.pill-group button.active{border-color:#1f5fbf;background:#eef4ff;color:#1f5fbf}.wizard-preview{padding-left:18px;border-left:1px solid #e5e7eb}.wizard-preview>span{color:#7b8494;font-size:11px;font-weight:700;text-transform:uppercase}.wizard-preview div{display:grid;justify-items:center;gap:8px;margin-top:12px;padding:18px;border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc;text-align:center}.wizard-preview b{display:inline-flex;align-items:center;justify-content:center;width:58px;height:58px;border-radius:18px;background:#1f5fbf;color:#fff}.wizard-preview strong{color:#111827}.wizard-preview em,.wizard-preview p{color:#7b8494;font-size:12px;font-style:normal;line-height:1.5}.wizard-card-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.wizard-card-grid button{display:grid;gap:5px;padding:14px;border:1px solid #e2e8f0;border-radius:14px;background:#fff;text-align:left}.wizard-card-grid button.active,.wizard-skill-list button.active{border-color:#1f5fbf;background:#eef4ff}.wizard-card-grid strong{color:#111827}.wizard-card-grid span,.wizard-card-grid em{color:#7b8494;font-size:12px;font-style:normal}.wizard-skill-list{display:grid;gap:9px}.wizard-skill-list button{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px;border:1px solid #e2e8f0;border-radius:14px;background:#fff;text-align:left}.wizard-skill-list strong{color:#111827}.wizard-skill-list span,.wizard-skill-list p,.wizard-skill-list em{color:#7b8494;font-size:12px;font-style:normal}.wizard-skill-list p{margin:5px 0 0}.wizard-files{display:grid;grid-template-columns:160px minmax(0,1fr);gap:12px}.wizard-files nav{display:grid;align-content:start;gap:8px}.wizard-files button{height:34px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#344054}.wizard-files button.active{border-color:#1f5fbf;color:#1f5fbf;background:#eef4ff}.wizard-files pre{margin:0;min-height:320px;overflow:auto;padding:14px;border:1px solid #e2e8f0;border-radius:14px;background:#0f172a;color:#dbeafe;font-size:12px;line-height:1.6;white-space:pre-wrap}.agent-wizard__footer{padding:12px 18px;border-top:1px solid #e5e7eb;justify-content:flex-end}
  .shell.is-sidebar-collapsed .workspace-nav h2,.shell.is-sidebar-collapsed .workspace-nav button span:nth-child(2),.shell.is-sidebar-collapsed .workspace-nav button em,.shell.is-sidebar-collapsed .sidebar__brand div:not(.brand-mark),.shell.is-sidebar-collapsed .sidebar__user strong,.shell.is-sidebar-collapsed .sidebar__user em{display:none}.shell.is-sidebar-collapsed .sidebar__brand{grid-template-columns:34px;justify-content:center}.shell.is-sidebar-collapsed .workspace-nav button{grid-template-columns:28px;justify-content:center;padding-inline:8px}.shell.is-sidebar-collapsed .sidebar__user-wrap .sidebar__user{grid-template-columns:28px;justify-content:center}
  @media(max-width:980px){.aorist-stats,.aorist-card-grid,:global(.agent-strip){grid-template-columns:repeat(2,minmax(0,1fr))}.aorist-split{grid-template-columns:1fr}}@media(max-width:720px){.stage-topbar,.aorist-toolbar{align-items:flex-start;flex-direction:column}.aorist-stats,.aorist-card-grid,:global(.agent-strip),.wizard-card-grid,.agent-wizard__body,.wizard-files,.config-grid,.wizard-identity{grid-template-columns:1fr}.wizard-preview{padding-left:0;border-left:0}}

  /* AoristLawer visual alignment polish */
  .shell {
    --aorist-primary: #2563eb;
    --aorist-primary-strong: #1d4ed8;
    --aorist-primary-soft: #eaf2ff;
    --aorist-ink: #0f172a;
    --aorist-muted: #64748b;
    --aorist-faint: #94a3b8;
    --aorist-line: #e2e8f0;
    --aorist-panel: rgba(255, 255, 255, 0.86);
    --aorist-shell: #f6f8fc;
    --aorist-sidebar: hsl(220 20% 98%);
    color: var(--aorist-ink);
    background:
      radial-gradient(circle at 22% -10%, rgba(37, 99, 235, 0.13), transparent 31%),
      linear-gradient(135deg, #f8fafc 0%, #eef3fb 44%, #f7f8fb 100%);
    font-family: "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif;
  }

  .stage {
    padding: 10px 10px 10px 0;
    background: transparent;
  }

  .stage__surface {
    position: relative;
    overflow: hidden;
    border-color: rgba(226, 232, 240, 0.95);
    border-radius: 20px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(248, 250, 252, 0.88)),
      #ffffff;
    box-shadow:
      0 24px 70px rgba(15, 23, 42, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.92);
  }

  .stage__surface::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(circle at 12% 4%, rgba(37, 99, 235, 0.08), transparent 28%),
      linear-gradient(90deg, rgba(15, 23, 42, 0.035) 1px, transparent 1px),
      linear-gradient(180deg, rgba(15, 23, 42, 0.025) 1px, transparent 1px);
    background-size: auto, 42px 42px, 42px 42px;
    mask-image: linear-gradient(180deg, #000 0%, transparent 62%);
  }

  .stage__surface > * {
    position: relative;
    z-index: 1;
  }

  .sidebar--aorist {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(248, 250, 252, 0.96)),
      var(--aorist-sidebar);
    border-right-color: rgba(226, 232, 240, 0.92);
    box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.8);
  }

  .sidebar__brand {
    min-height: 60px;
    padding: 0 14px;
    border-bottom-color: rgba(226, 232, 240, 0.86);
    background: rgba(255, 255, 255, 0.58);
  }

  .brand-mark,
  .nav-icon,
  .sidebar__avatar {
    color: var(--aorist-primary-strong);
    background: linear-gradient(135deg, #eff6ff, #dbeafe);
    box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.1);
  }

  .sidebar__brand strong {
    letter-spacing: -0.02em;
  }

  .workspace-nav {
    padding: 12px 8px;
  }

  .workspace-nav h2 {
    margin: 10px 10px 6px;
    color: var(--aorist-faint);
    font-size: 10px;
    letter-spacing: 0.12em;
  }

  .workspace-nav button {
    position: relative;
    min-height: 38px;
    border-radius: 12px;
    color: #566174;
    transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease;
  }

  .workspace-nav button:hover {
    transform: translateX(1px);
    background: #f1f5fb;
  }

  .workspace-nav button.active {
    color: var(--aorist-primary-strong);
    background: linear-gradient(135deg, #eef4ff, #f8fbff);
    box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.1);
  }

  .workspace-nav button.active::before {
    content: "";
    position: absolute;
    left: 0;
    top: 10px;
    bottom: 10px;
    width: 3px;
    border-radius: 999px;
    background: var(--aorist-primary);
  }

  .sidebar__user-wrap .sidebar__user,
  .user-menu {
    border-color: rgba(226, 232, 240, 0.9);
    background: rgba(255, 255, 255, 0.82);
    box-shadow: 0 14px 34px rgba(15, 23, 42, 0.07);
  }

  .sidebar__user em {
    color: var(--aorist-primary-strong);
    border-color: #dbeafe;
    background: #eff6ff;
  }

  .stage-topbar {
    min-height: 62px;
    padding: 0 20px;
    border-bottom-color: rgba(226, 232, 240, 0.88);
    background: rgba(255, 255, 255, 0.76);
    box-shadow: 0 8px 28px rgba(15, 23, 42, 0.035);
  }

  .stage-topbar strong,
  .aorist-toolbar strong,
  .aorist-card header strong {
    letter-spacing: -0.025em;
  }

  .hero-panel button,
  .aorist-toolbar button,
  :global(.composer-context-actions button),
  .automation-card footer button,
  .capability-item button,
  .config-modal footer button,
  .agent-wizard__footer button {
    border-color: #dce4ef;
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.72);
    transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, background 0.16s ease;
  }

  .hero-panel button:hover,
  .aorist-toolbar button:hover,
  :global(.composer-context-actions button:hover),
  .automation-card footer button:hover,
  .capability-item button:hover,
  .config-modal footer button:hover,
  .agent-wizard__footer button:hover {
    transform: translateY(-1px);
    border-color: #bfdbfe;
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
  }

  .hero-panel button:first-child,
  .aorist-toolbar button:last-child,
  .config-modal footer button:last-child,
  .agent-wizard__footer button:last-child {
    border-color: var(--aorist-primary);
    background: linear-gradient(135deg, var(--aorist-primary), var(--aorist-primary-strong));
    box-shadow: 0 10px 20px rgba(37, 99, 235, 0.18);
  }

  .aorist-page {
    padding: 20px;
    background:
      radial-gradient(circle at 16% 0%, rgba(37, 99, 235, 0.11), transparent 32%),
      radial-gradient(circle at 86% 6%, rgba(14, 165, 233, 0.08), transparent 28%),
      #f7f9fc;
  }

  .hero-panel {
    position: relative;
    overflow: hidden;
    border-color: rgba(191, 219, 254, 0.72);
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.96) 0%, rgba(239, 246, 255, 0.96) 58%, rgba(248, 250, 252, 0.92) 100%);
    box-shadow: 0 24px 60px rgba(37, 99, 235, 0.1);
  }

  .hero-panel::after {
    content: "";
    position: absolute;
    width: 260px;
    height: 260px;
    right: -90px;
    top: -130px;
    border-radius: 999px;
    background: radial-gradient(circle, rgba(37, 99, 235, 0.18), transparent 68%);
  }

  .hero-panel > * {
    position: relative;
    z-index: 1;
  }

  .hero-panel h1 {
    color: var(--aorist-ink);
    text-wrap: balance;
  }

  .aorist-stats article,
  .aorist-card,
  .aorist-list article,
  .agent-card,
  .automation-card,
  .media-card,
  .capability-item,
  :global(.task-composer-card) {
    border-color: rgba(226, 232, 240, 0.88);
    background: rgba(255, 255, 255, 0.78);
    backdrop-filter: blur(14px);
    box-shadow: 0 14px 34px rgba(15, 23, 42, 0.055);
    transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
  }

  .aorist-stats article:hover,
  .aorist-card:hover,
  .aorist-list article:hover,
  .agent-card:hover,
  .automation-card:hover,
  .media-card:hover,
  .capability-item:hover,
  :global(.task-composer-card):hover {
    transform: translateY(-1px);
    border-color: rgba(147, 197, 253, 0.9);
    box-shadow: 0 18px 44px rgba(15, 23, 42, 0.08);
  }

  .aorist-stats strong {
    color: #0f172a;
  }

  .todo-row,
  .automation-row,
  .wizard-card-grid button,
  .wizard-skill-list button {
    border-color: rgba(226, 232, 240, 0.88);
    background: rgba(255, 255, 255, 0.82);
    transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
  }

  .todo-row:hover,
  .automation-row:hover,
  .wizard-card-grid button:hover,
  .wizard-skill-list button:hover {
    transform: translateX(1px);
    border-color: #bfdbfe;
    background: #f8fbff;
  }

  :global(.agent-strip button) {
    border-color: rgba(226, 232, 240, 0.88);
    background: rgba(255, 255, 255, 0.82);
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.045);
  }

  :global(.agent-strip button.active),
  .wizard-card-grid button.active,
  .wizard-skill-list button.active,
  .capability-tabs button.active {
    border-color: #93c5fd;
    background: linear-gradient(135deg, #eef4ff, #ffffff);
    color: var(--aorist-primary-strong);
  }

  :global(.agent-strip span),
  .agent-card header > span,
  .wizard-avatar,
  .wizard-preview b {
    background: linear-gradient(135deg, var(--aorist-primary), var(--aorist-primary-strong));
    box-shadow: 0 12px 22px rgba(37, 99, 235, 0.18);
  }

  :global(.task-composer-card .composer) {
    border-color: rgba(191, 219, 254, 0.8);
    background: rgba(255, 255, 255, 0.9);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
  }

  :global(.task-composer-card .composer textarea),
  .home__composer :global(.composer textarea) {
    color: var(--aorist-ink);
  }

  :global(.composer-context-actions > span) {
    background: linear-gradient(135deg, #eff6ff, #ffffff);
    box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.06);
  }

  .aorist-toolbar,
  .capability-tabs {
    border-color: rgba(226, 232, 240, 0.88);
    background: rgba(255, 255, 255, 0.78);
    backdrop-filter: blur(14px);
    box-shadow: 0 14px 34px rgba(15, 23, 42, 0.045);
  }

  .config-modal,
  .agent-wizard {
    border-color: rgba(226, 232, 240, 0.96);
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(18px);
    box-shadow: 0 30px 80px rgba(15, 23, 42, 0.24);
  }

  .modal-backdrop {
    background:
      radial-gradient(circle at 50% 22%, rgba(37, 99, 235, 0.18), transparent 34%),
      rgba(15, 23, 42, 0.38);
  }

  .wizard-tabs {
    background: linear-gradient(180deg, #f8fafc, #f1f5f9);
  }

  .wizard-tabs button.active {
    color: var(--aorist-primary-strong);
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  }


  .workbench-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(320px,.72fr)}.workbench-calendar header span{padding:3px 8px;border-radius:999px;background:#eef4ff;color:#1f5fbf;font-size:11px;font-weight:800}.calendar-mini-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin:10px 0 12px}.calendar-mini-grid article{min-height:46px;padding:7px;border:1px solid rgba(226,232,240,.88);border-radius:12px;background:#f8fafc}.calendar-mini-grid article.today{border-color:#93c5fd;background:#eff6ff}.calendar-mini-grid b{display:block;color:#0f172a;font-size:12px}.calendar-mini-grid span{display:inline-block;margin-top:5px;padding:2px 5px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:10px}.workbench-calendar footer{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}.workbench-calendar footer button{min-height:30px;padding:0 10px;border:1px solid #dce4ef;border-radius:10px;background:#fff;color:#344054;font-size:12px;font-weight:700}.workbench-calendar footer button:last-child{border-color:#2563eb;background:#2563eb;color:#fff}

  .calendar-board{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(300px,.6fr);gap:14px;margin-top:14px}.calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}.calendar-weekday{display:flex;align-items:center;justify-content:center;min-height:28px;color:#667085;font-size:12px;font-weight:700}.calendar-grid article{min-height:92px;padding:10px;border:1px solid rgba(226,232,240,.88);border-radius:14px;background:rgba(255,255,255,.78);box-shadow:0 10px 24px rgba(15,23,42,.04)}.calendar-grid article.today{border-color:#93c5fd;background:linear-gradient(135deg,#eff6ff,#fff)}.calendar-grid article.muted{background:rgba(248,250,252,.52);box-shadow:none;opacity:.46}.calendar-grid b{display:block;margin-bottom:8px;color:#0f172a}.calendar-grid article.muted b{color:#98a2b3}.calendar-event-chip{display:block;width:100%;margin-top:4px;padding:4px 6px;border:0;border-radius:8px;background:#eef4ff;color:#1d4ed8;font-size:11px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.calendar-event-chip{cursor:pointer}.calendar-event-chip:hover{background:#dbeafe}.knowledge-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,.55fr);gap:14px}.knowledge-preview{padding:18px;border:1px solid rgba(226,232,240,.88);border-radius:18px;background:rgba(255,255,255,.82);box-shadow:0 14px 34px rgba(15,23,42,.055)}.knowledge-preview span{color:#7b8494;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.knowledge-preview strong{display:block;margin-top:12px;color:#0f172a;font-size:18px}.knowledge-preview p{color:#5f6774;line-height:1.7;font-size:13px}@media(max-width:980px){.calendar-board,.knowledge-layout{grid-template-columns:1fr}.calendar-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.calendar-weekday{display:none}}

  .detail-panel{padding:18px;border:1px solid rgba(226,232,240,.9);border-radius:20px;background:rgba(255,255,255,.82);box-shadow:0 18px 42px rgba(15,23,42,.06)}.detail-panel header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.detail-panel header span{color:#7b8494;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.detail-panel header strong{display:block;margin-top:6px;color:#0f172a;font-size:22px;line-height:1.18;letter-spacing:-.035em}.detail-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:16px}.detail-summary article{padding:12px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc}.detail-summary span{display:block;color:#7b8494;font-size:11px}.detail-summary strong{display:block;margin-top:6px;color:#111827;font-size:13px}.detail-tabs{display:flex;gap:7px;margin:16px 0 10px}.detail-tabs button{height:30px;padding:0 10px;border:1px solid #dbe3ee;border-radius:999px;background:#fff;color:#5f6774;font-size:12px}.detail-tabs button.active{border-color:#93c5fd;background:#eef4ff;color:#1d4ed8}.detail-timeline{display:grid;gap:10px}.detail-timeline article{padding:13px;border:1px solid #e2e8f0;border-radius:14px;background:#fff}.detail-timeline b{display:block;color:#111827}.detail-timeline p{margin:6px 0;color:#5f6774;font-size:13px;line-height:1.6}.detail-timeline em{color:#7b8494;font-size:11px;font-style:normal}.team-card{cursor:pointer;text-align:left}.team-card{border:1px solid rgba(226,232,240,.88);background:rgba(255,255,255,.78)}.config-grid select{height:36px;padding:0 10px;border:1px solid #d9dee8;border-radius:10px;background:#fff;color:#111827}.config-grid textarea,.config-grid input{border:1px solid #d9dee8;border-radius:10px;background:#fff;color:#111827}@media(max-width:980px){.detail-summary{grid-template-columns:1fr}}
  .config-grid .percent-input{display:grid;grid-template-columns:minmax(0,1fr)auto;align-items:center;height:36px;border:1px solid #d9dee8;border-radius:10px;background:#fff;color:#111827;overflow:hidden}.config-grid .percent-input input{height:34px;border:0;border-radius:0;background:transparent}.config-grid .percent-input span{padding:0 12px;color:#5f6774;font-size:13px}
  .config-grid .material-file-field{gap:8px}.material-file-picker{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:10px;min-height:42px;padding:4px 12px 4px 4px;border:1px solid #d9dee8;border-radius:12px;background:#fff;color:#111827;overflow:hidden}.material-file-picker:hover{border-color:#bfdbfe;background:#f8fbff}.material-file-picker input{position:absolute;inset:0;width:100%;height:100%;padding:0;border:0;opacity:0;cursor:pointer}.material-file-picker strong{display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 14px;border-radius:9px;background:#111827;color:#fff;font-size:13px;font-weight:650;white-space:nowrap}.material-file-picker span{min-width:0;overflow:hidden;color:#667085;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.material-file-field em{color:#7b8494;font-size:12px;font-style:normal}
  .artifact-review-workbench{display:grid;gap:14px;padding:16px 20px;border-bottom:1px solid rgba(226,232,240,.9);background:#f7f9fc}.artifact-review-head{display:grid;grid-template-columns:minmax(260px,1fr) auto;align-items:end;gap:14px}.artifact-review-head span,.artifact-style-gate header span,.artifact-coordinate-list header span,.artifact-page-meta span{display:block;color:#7b8494;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.artifact-review-head strong{display:block;margin-top:4px;color:#111827;font-size:18px;line-height:1.22}.artifact-review-head p{margin:4px 0 0;color:#667085;font-size:12px}.artifact-stage-tabs{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:7px}.artifact-stage-tabs button{display:grid;gap:2px;min-width:70px;min-height:42px;padding:6px 10px;border:1px solid #dbe3ee;border-radius:10px;background:#fff;color:#344054;text-align:left}.artifact-stage-tabs button.active{border-color:#93c5fd;background:#eef4ff;color:#1d4ed8}.artifact-stage-tabs span{color:inherit;font-size:12px;font-weight:800;letter-spacing:0;text-transform:none}.artifact-stage-tabs em{color:#7b8494;font-size:10px;font-style:normal}.artifact-review-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,.38fr);gap:14px;align-items:stretch}.artifact-canvas-shell,.artifact-review-side section{border:1px solid #e2e8f0;border-radius:18px;background:rgba(255,255,255,.9);box-shadow:0 10px 24px rgba(15,23,42,.045)}.artifact-canvas-shell{display:grid;grid-template-rows:auto minmax(320px,1fr);min-width:0;overflow:hidden}.artifact-canvas-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid #e5eaf2;background:#fff}.artifact-mode-switch,.artifact-tool-buttons,.artifact-pan-pad{display:flex;align-items:center;gap:6px}.artifact-canvas-toolbar button{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid #d8e2ef;border-radius:9px;background:#fff;color:#344054}.artifact-canvas-toolbar button.active,.artifact-canvas-toolbar button:hover:not(:disabled){border-color:#93c5fd;background:#eef4ff;color:#1d4ed8}.artifact-canvas-toolbar button:disabled{cursor:not-allowed;opacity:.45}.artifact-canvas-toolbar strong{min-width:48px;color:#111827;font-size:12px;text-align:center}.artifact-canvas-viewport{display:grid;place-items:center;min-height:320px;padding:20px;overflow:hidden;background:linear-gradient(90deg,rgba(226,232,240,.55) 1px,transparent 1px),linear-gradient(180deg,rgba(226,232,240,.55) 1px,transparent 1px),#f8fafc;background-size:28px 28px}.artifact-canvas-viewport[data-mode=pan]{cursor:grab}.artifact-canvas-page{position:relative;width:min(620px,100%);aspect-ratio:16/10;padding:22px;border:1px solid #cbd5e1;border-radius:16px;background:linear-gradient(135deg,#fff 0%,#f8fbff 58%,#eef4ff 100%);box-shadow:0 22px 50px rgba(15,23,42,.14);transform:translate(var(--artifact-pan-x),var(--artifact-pan-y)) scale(var(--artifact-zoom));transform-origin:center;transition:transform .16s ease}.artifact-page-meta{display:grid;gap:4px}.artifact-page-meta strong{overflow:hidden;color:#0f172a;font-size:18px;text-overflow:ellipsis;white-space:nowrap}.artifact-page-meta em{color:#667085;font-size:12px;font-style:normal}.artifact-page-layout{display:grid;grid-template-columns:minmax(0,1fr) 150px;gap:16px;margin-top:22px}.artifact-page-layout section,.artifact-page-layout aside{min-height:150px;padding:16px;border:1px solid #e5e7eb;border-radius:14px;background:rgba(255,255,255,.76)}.artifact-page-layout b{color:#1d4ed8;font-size:12px}.artifact-page-layout h3{margin:12px 0 8px;color:#111827;font-size:24px;line-height:1.12}.artifact-page-layout p{margin:0;color:#5f6774;font-size:13px;line-height:1.6}.artifact-page-layout aside{display:grid;align-content:center;gap:8px}.artifact-page-layout aside span{color:#7b8494;font-size:11px}.artifact-page-layout aside strong{color:#111827;font-size:14px}.artifact-page-layout aside em{display:inline-flex;width:max-content;padding:4px 8px;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:11px;font-style:normal}.artifact-marker{position:absolute;left:var(--marker-x);top:var(--marker-y);max-width:110px;transform:translate(-50%,-50%);padding:5px 8px;border:1px solid #f59e0b;border-radius:999px;background:#fffbeb;color:#92400e;font-size:10px;font-weight:800;white-space:nowrap;box-shadow:0 8px 16px rgba(146,64,14,.16)}.artifact-review-side{display:grid;grid-template-rows:auto 1fr;gap:14px;min-width:0}.artifact-review-side section{padding:14px}.artifact-style-gate header,.artifact-coordinate-list header{margin-bottom:10px}.artifact-style-gate header strong,.artifact-coordinate-list header strong{display:block;margin-top:4px;color:#111827;font-size:15px}.artifact-style-list{display:grid;gap:8px}.artifact-style-list button{display:grid;gap:5px;width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;text-align:left}.artifact-style-list button.active{border-color:#93c5fd;background:#f8fbff;box-shadow:0 0 0 3px rgba(147,197,253,.16)}.artifact-style-list strong{color:#111827;font-size:13px}.artifact-style-list span,.artifact-style-list em{color:#667085;font-size:11px;font-style:normal;line-height:1.45}.artifact-gate-actions{display:flex;gap:8px;margin-top:10px}.artifact-gate-actions button{flex:1;min-height:34px;border:1px solid #d8e2ef;border-radius:10px;background:#fff;color:#344054;font-weight:750}.artifact-gate-actions button:last-child{border-color:#2563eb;background:#2563eb;color:#fff}.artifact-coordinate-list{display:grid;align-content:start;gap:8px}.artifact-coordinate-list article{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border:1px solid #eef2f7;border-radius:12px;background:#fff}.artifact-coordinate-list article strong{display:block;color:#111827;font-size:13px}.artifact-coordinate-list article p{margin:3px 0 0;overflow:hidden;color:#667085;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.artifact-coordinate-list article span{padding:4px 8px;border-radius:999px;background:#f3f4f6;color:#344054;font-size:11px;white-space:nowrap}@media(max-width:1120px){.artifact-review-head,.artifact-review-grid{grid-template-columns:1fr}.artifact-stage-tabs{justify-content:flex-start}.artifact-review-side{grid-template-columns:1fr 1fr;grid-template-rows:auto}}@media(max-width:720px){.artifact-review-workbench{padding:12px 14px}.artifact-canvas-toolbar{align-items:flex-start;flex-direction:column}.artifact-review-side,.artifact-page-layout{grid-template-columns:1fr}.artifact-canvas-page{aspect-ratio:4/5}.artifact-stage-tabs button{min-width:0;flex:1 1 120px}}
  .report-center-layout{display:grid;grid-template-columns:minmax(320px,.9fr) minmax(420px,1.1fr);gap:18px}.report-list-panel,.report-detail-panel{border:1px solid #e2e8f0;border-radius:18px;background:rgba(255,255,255,.92);box-shadow:0 10px 24px rgba(15,23,42,.045)}.report-list-panel,.report-detail-panel{padding:16px}.report-list-panel header{margin-bottom:12px}.report-list-panel header strong{display:block;color:#111827;font-size:15px}.report-list-panel header span{display:block;margin-top:4px;color:#7b8494;font-size:12px}.report-card-list{display:grid;gap:10px}.report-card-list button{width:100%;padding:14px;border:1px solid #e5e7eb;border-radius:14px;background:#fff;text-align:left;cursor:pointer}.report-card-list button.active{border-color:#93c5fd;background:#f8fbff;box-shadow:0 0 0 3px rgba(147,197,253,.18)}.report-card-list span,.report-detail-panel header>em{display:inline-flex;align-items:center;width:max-content;padding:5px 10px;border-radius:999px;background:#f3f4f6;color:#111827;font-size:12px;font-style:normal}.report-card-list strong{display:block;margin-top:12px;color:#111827;font-size:16px}.report-card-list p{margin:8px 0 0;color:#5f6774;font-size:13px;line-height:1.55}.report-card-list em{display:block;margin-top:12px;color:#111827;font-size:12px;font-style:italic}.report-detail-panel header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.report-detail-panel header span{color:#7b8494;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}.report-detail-panel header strong{display:block;margin-top:7px;color:#111827;font-size:22px;line-height:1.25}.report-detail-panel header p{margin:8px 0 0;color:#5f6774;font-size:13px;line-height:1.7}.report-detail-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:18px}.report-detail-summary article,.report-detail-meta div{padding:12px;border:1px solid #e5e7eb;border-radius:14px;background:#f8fafc}.report-detail-summary span,.report-detail-meta span,.report-detail-body>span{display:block;color:#7b8494;font-size:11px}.report-detail-summary strong,.report-detail-meta strong{display:block;margin-top:6px;color:#111827;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.report-detail-body{margin-top:16px;padding:16px;border:1px solid #e5e7eb;border-radius:16px;background:#fff}.report-detail-body p{margin:10px 0 0;color:#374151;font-size:13px;line-height:1.75}.report-detail-meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.report-detail-actions{display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:14px}.report-detail-actions button{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border:1px solid #dbe4ef;border-radius:9px;background:#fff;color:#1f2937;font-size:12px;cursor:pointer}.report-detail-actions button:hover{border-color:#93c5fd;background:#f8fbff}.report-detail-actions button.danger{border-color:#fecaca;color:#b91c1c;background:#fff7f7}@media(max-width:1100px){.report-center-layout{grid-template-columns:1fr}.report-detail-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:720px){.report-detail-summary,.report-detail-meta{grid-template-columns:1fr}}

  .detail-empty{padding:18px;border:1px dashed #cbd5e1;border-radius:16px;background:rgba(248,250,252,.78);color:#5f6774}.detail-empty strong{display:block;color:#111827}.detail-empty p{margin:6px 0 0;font-size:13px;line-height:1.6}.detail-modal{width:min(840px,calc(100vw - 44px));padding:18px}.detail-modal>.detail-panel{margin-top:14px;background:rgba(255,255,255,.88)}

  .select-list,.distill-panel{display:grid;gap:10px;margin-top:16px}.select-list>p,.distill-panel>p{margin:0;color:#5f6774;font-size:13px;line-height:1.6}.select-list button{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px;border:1px solid #e2e8f0;border-radius:14px;background:#fff;text-align:left}.select-list button:hover{border-color:#93c5fd;background:#f8fbff}.select-list strong{color:#111827}.select-list span{color:#667085;font-size:12px}.distill-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.distill-steps button{min-height:36px;border:1px solid #dbe3ee;border-radius:12px;background:#fff;color:#5f6774;font-weight:700}.distill-steps button.active{border-color:#93c5fd;background:#eef4ff;color:#1d4ed8}.distill-preview{padding:0;border:0}.distill-preview div{margin-top:0}@media(max-width:720px){.distill-steps{grid-template-columns:1fr}}

  .resource-center-topbar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px}.resource-center .resource-tabs{flex:0 1 auto;min-width:0;margin:0;flex-wrap:wrap}.resource-center .resource-tabs button{min-width:104px}.resource-center-actions{display:flex;flex:0 0 auto;align-items:center;justify-content:flex-end;gap:8px}.resource-center-actions button{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:0 14px;border:1px solid #d9dee8;border-radius:999px;background:#fff;color:#222;font-size:13px;font-weight:700}.resource-center-actions button:last-child{border-color:#222;background:#222;color:#fff}.resource-center-actions button:hover{border-color:#222}.resource-section-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.resource-section-top .aorist-search{flex:1 1 320px;max-width:none;margin-bottom:0}.resource-section-top>span{flex:0 0 auto;color:#7b8494;font-size:12px;font-weight:650;white-space:nowrap}.resource-section-top .resource-actions{flex:0 0 auto;justify-content:flex-end;margin:0}.resource-library-empty,.resource-archive-empty{grid-column:1/-1}.resource-archive-summary{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:14px;padding:14px;border:1px solid rgba(226,232,240,.9);border-radius:14px;background:rgba(255,255,255,.82)}.resource-archive-summary span{display:block;color:#7b8494;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.resource-archive-summary strong{display:block;margin-top:4px;color:#111827;font-size:18px}.resource-archive-summary em{color:#7b8494;font-size:12px;font-style:normal}.resource-archive-list{display:grid;gap:12px}.resource-archive-project{padding:14px;border:1px solid rgba(226,232,240,.9);border-radius:14px;background:rgba(255,255,255,.86)}.resource-archive-project header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.resource-archive-project header strong{display:block;color:#111827;font-size:14px}.resource-archive-project header span,.resource-archive-project header em{color:#7b8494;font-size:11px;font-style:normal}.resource-archive-project>div{display:grid;gap:8px}.resource-archive-project article{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;padding:10px;border:1px solid #eef2f7;border-radius:10px;background:#fff}.resource-archive-project article strong{display:block;overflow:hidden;color:#111827;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.resource-archive-project article p{margin:3px 0 0;color:#7b8494;font-size:11px}.resource-archive-project article button{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:28px;padding:0 10px;border:1px solid #f3d3d3;border-radius:8px;background:#fff;color:#b42318;font-size:12px;font-weight:650}.resource-archive-project article button:hover{background:#fff5f5}.resource-actions{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}.resource-actions button{min-height:34px;padding:0 12px;border:1px solid #dce4ef;border-radius:10px;background:rgba(255,255,255,.9);color:#344054;font-size:12px;font-weight:700}.resource-actions button:hover{border-color:#bfdbfe;background:#f8fbff}@media(max-width:920px){.resource-center-topbar{align-items:flex-start;flex-direction:column}.resource-center-actions{justify-content:flex-start}}@media(max-width:720px){.resource-section-top,.resource-archive-summary{align-items:flex-start;flex-direction:column}.resource-section-top .aorist-search{width:100%;max-width:none}.resource-section-top .resource-actions{width:100%;justify-content:flex-start}.resource-archive-project article{grid-template-columns:1fr}}
  .resource-detail-modal{display:grid;grid-template-rows:auto minmax(0,1fr) auto;width:min(760px,calc(100vw - 44px));height:min(760px,calc(100vh - 44px));padding:0}.resource-detail-modal header{padding:18px 24px;border-bottom:1px solid #e5e7eb}.resource-detail-modal header p{margin:4px 0 0;color:#7b8494;font-size:12px}.resource-detail-body{display:grid;gap:14px;min-height:0;margin:0;padding:20px 22px;overflow:auto}.resource-detail-body article{padding:14px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc}.resource-detail-body article span{display:inline-block;margin-bottom:8px;padding:3px 8px;border-radius:999px;background:#eef4ff;color:#1f5fbf;font-size:11px}.resource-detail-body article strong{display:block;color:#111827;font-size:17px}.resource-detail-body article p{margin:7px 0 0;max-height:none;overflow-wrap:anywhere;color:#5f6774;font-size:13px;line-height:1.65}.resource-detail-body dl{display:grid;grid-template-columns:110px minmax(0,1fr);gap:8px 12px;margin:0;padding:14px;border:1px solid #e2e8f0;border-radius:14px;background:#fff}.resource-detail-body dt{color:#7b8494;font-size:12px}.resource-detail-body dd{margin:0;min-width:0;overflow-wrap:anywhere;color:#111827;font-size:13px}.resource-detail-modal footer{margin:0;padding:14px 24px;border-top:1px solid #e5e7eb;background:#fff}.resource-detail-modal footer button.danger{border-color:#f3d3d3!important;background:#fff!important;color:#b42318!important}.resource-detail-modal footer button.danger:hover{background:#fff5f5!important}
  .resource-center .aorist-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,260px));align-items:start;justify-content:start}.resource-center .media-card{display:grid;grid-template-rows:auto auto 1fr auto;width:100%;height:190px;min-height:0;box-sizing:border-box;overflow:hidden;text-align:left}.resource-center .media-card span{justify-self:start;width:auto;max-width:100%}.resource-center .media-card strong,.resource-center .media-card p{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical}.resource-center .media-card strong{-webkit-line-clamp:2;line-clamp:2}.resource-center .media-card p{-webkit-line-clamp:2;line-clamp:2}.resource-center .media-card em{align-self:end;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.resource-category-bar{display:flex;align-items:center;gap:10px;margin:0 0 12px}.resource-category-bar button{min-height:30px;padding:0 10px;border:1px solid #dce4ef;border-radius:9px;background:#fff;color:#344054;font-size:12px;font-weight:700}.resource-category-bar strong{color:#111827;font-size:15px}.resource-category-card{text-align:left}.resource-category-card span{background:#eef4ff;color:#1f5fbf}.resource-category-card em{display:block;margin-top:10px;color:#7b8494;font-size:12px;font-style:normal}
  .knowledge-health{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:10px}.knowledge-health article{padding:12px;border:1px solid rgba(226,232,240,.9);border-radius:14px;background:rgba(255,255,255,.86)}.knowledge-health span{display:block;color:#7b8494;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.knowledge-health strong{display:block;margin-top:5px;color:#111827;font-size:15px}.knowledge-local-note{margin:0 0 14px;color:#687386;font-size:12px;font-weight:650}.knowledge-card-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.knowledge-card-actions button:last-child{color:#b42318}.knowledge-preview em{display:block;margin-top:12px;color:#7b8494;font-size:11px;font-style:normal;word-break:break-all}.knowledge-stack{display:grid;gap:14px;min-width:0}.knowledge-stack section{padding:14px;border:1px solid rgba(226,232,240,.88);border-radius:18px;background:rgba(255,255,255,.76);box-shadow:0 12px 30px rgba(15,23,42,.04)}.knowledge-stack header{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:12px}.knowledge-stack header span{color:#7b8494;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.knowledge-stack header strong{color:#0f172a;font-size:17px;letter-spacing:-.03em}.knowledge-layout--merged .aorist-card-grid{grid-template-columns:repeat(2,minmax(0,1fr))}@media(max-width:720px){.knowledge-health{grid-template-columns:repeat(2,minmax(0,1fr))}.knowledge-layout--merged .aorist-card-grid{grid-template-columns:1fr}.knowledge-stack header{display:grid;align-items:start}}

  .nav-icon :global(svg),.brand-mark :global(svg),:global(.agent-strip span svg),.agent-card header>span :global(svg),.wizard-avatar :global(svg),.wizard-preview b :global(svg){display:block;stroke-width:2}

  .brand-copy{min-width:0}.sidebar__brand{grid-template-columns:34px minmax(0,1fr) 30px;gap:8px}.brand-mode-switch{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:52px;height:28px;padding:0 7px;border:1px solid rgba(37,99,235,.14);border-radius:10px;background:#eef4ff;color:#1d4ed8;font-size:11px;font-weight:800}.brand-mode-switch:hover,.brand-mode-switch.active{border-color:#93c5fd;background:#dbeafe;color:#1e40af}.shell.is-sidebar-collapsed .brand-mode-switch{display:none}

  /* Code home command center */
  .home--command {
    display: grid;
    flex: 1;
    min-height: 0;
    place-items: center;
    overflow: auto;
    padding: clamp(28px, 5vw, 64px) 24px;
    background:
      radial-gradient(circle at 22% 12%, rgba(37, 99, 235, 0.12), transparent 28%),
      radial-gradient(circle at 82% 4%, rgba(14, 165, 233, 0.1), transparent 26%),
      linear-gradient(180deg, rgba(248, 250, 252, 0.2), rgba(241, 245, 249, 0.56));
  }

  .home-command {
    position: relative;
    display: grid;
    gap: 14px;
    width: min(900px, 94%);
    padding: 22px;
    overflow: hidden;
    border: 1px solid rgba(226, 232, 240, 0.92);
    border-radius: 26px;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.94), rgba(248, 250, 252, 0.86)),
      rgba(255, 255, 255, 0.88);
    backdrop-filter: blur(18px);
    box-shadow:
      0 28px 76px rgba(15, 23, 42, 0.11),
      inset 0 1px 0 rgba(255, 255, 255, 0.92);
  }

  .home-command::before {
    content: "";
    position: absolute;
    inset: -1px;
    pointer-events: none;
    background:
      linear-gradient(90deg, rgba(37, 99, 235, 0.04) 1px, transparent 1px),
      linear-gradient(180deg, rgba(15, 23, 42, 0.035) 1px, transparent 1px);
    background-size: 34px 34px;
    mask-image: linear-gradient(180deg, #000 0%, transparent 72%);
  }

  .home-command::after {
    content: "";
    position: absolute;
    right: -120px;
    top: -150px;
    width: 320px;
    height: 320px;
    border-radius: 999px;
    background: radial-gradient(circle, rgba(37, 99, 235, 0.18), transparent 68%);
    pointer-events: none;
  }

  .home-command > * {
    position: relative;
    z-index: 1;
  }

  .home-command__eyebrow,
  .home-command__eyebrow span,
  .home-command__hero,
  .home-command__hero button,
  .home__context button,
  .home__quick button {
    display: flex;
    align-items: center;
  }

  .home-command__eyebrow {
    justify-content: space-between;
    gap: 12px;
    color: var(--aorist-faint);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .home-command__eyebrow span {
    gap: 7px;
    color: var(--aorist-primary-strong);
  }

  .home-command__eyebrow em {
    max-width: 44%;
    overflow: hidden;
    color: #7b8494;
    font-style: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .home-command__hero {
    justify-content: space-between;
    gap: 24px;
    padding: 6px 4px 4px;
  }

  .home-command__hero h1 {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin: 0;
    color: var(--aorist-ink);
    font-size: clamp(30px, 4vw, 52px);
    line-height: 0.96;
    letter-spacing: -0.06em;
  }

  .home-command__hero h1 span {
    padding: 5px 9px;
    border: 1px solid #bfdbfe;
    border-radius: 999px;
    color: var(--aorist-primary-strong);
    background: #eff6ff;
    font-size: 11px;
    letter-spacing: 0;
  }

  .home-command__hero p {
    max-width: 580px;
    margin: 10px 0 0;
    color: #5f6774;
    font-size: 14px;
    line-height: 1.7;
  }

  .home-command__hero button {
    flex: 0 0 auto;
    gap: 7px;
    min-height: 36px;
    padding: 0 13px;
    border: 1px solid #dbeafe;
    border-radius: 12px;
    color: var(--aorist-primary-strong);
    background: linear-gradient(135deg, #eff6ff, #ffffff);
    font-size: 12px;
    font-weight: 750;
    box-shadow: 0 10px 24px rgba(37, 99, 235, 0.08);
  }

  .home-command .home__composer {
    width: 100%;
  }

  .home-command .home__composer :global(.composer) {
    min-height: 100px;
    border-color: rgba(191, 219, 254, 0.92);
    border-radius: 18px 18px 0 0;
    background: rgba(255, 255, 255, 0.94);
    box-shadow:
      0 16px 38px rgba(15, 23, 42, 0.06),
      inset 0 1px 0 rgba(255, 255, 255, 0.9);
  }

  .home-command .home__composer :global(.composer textarea) {
    min-height: 42px;
    font-size: 14px;
    line-height: 1.55;
  }

  .home-command .home__composer :global(.composer button[type="submit"]) {
    color: #ffffff;
    background: linear-gradient(135deg, var(--aorist-primary), var(--aorist-primary-strong));
    box-shadow: 0 10px 20px rgba(37, 99, 235, 0.2);
  }

  .home-command .home__context {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 9px;
    border: 1px solid rgba(191, 219, 254, 0.76);
    border-top: 0;
    border-radius: 0 0 18px 18px;
    background: linear-gradient(135deg, rgba(239, 246, 255, 0.94), rgba(255, 255, 255, 0.9));
  }

  .home-command .home__context button {
    gap: 7px;
    min-height: 31px;
    padding: 0 10px;
    border: 1px solid rgba(219, 234, 254, 0.94);
    border-radius: 999px;
    color: #344054;
    background: rgba(255, 255, 255, 0.84);
    font-size: 12px;
    font-weight: 700;
  }

  .home-command .home__context button:hover {
    border-color: #93c5fd;
    color: var(--aorist-primary-strong);
    background: #ffffff;
  }

  .home-command .home__quick {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    width: 100%;
    margin: 0;
  }

  .home-command .home__quick button {
    justify-content: flex-start;
    gap: 8px;
    min-height: 44px;
    padding: 0 13px;
    border: 1px solid rgba(226, 232, 240, 0.88);
    border-radius: 14px;
    color: #344054;
    background: rgba(255, 255, 255, 0.78);
    font-size: 13px;
    font-weight: 700;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.045);
    transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
  }

  .home-command .home__quick button:hover {
    transform: translateY(-1px);
    border-color: #bfdbfe;
    color: var(--aorist-primary-strong);
    background: #f8fbff;
    box-shadow: 0 16px 32px rgba(15, 23, 42, 0.07);
  }

  .home-command .home__quick :global(svg),
  .home-command .code-tools :global(svg) {
    flex: 0 0 auto;
    color: var(--aorist-primary-strong);
  }

  .home-command .code-tools {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    width: 100%;
    margin: 0;
    padding: 10px;
    border: 1px solid rgba(226, 232, 240, 0.86);
    border-radius: 18px;
    background: rgba(248, 250, 252, 0.78);
  }

  .home-command .code-tools button {
    min-height: 42px;
    padding: 0 11px;
    border-color: rgba(226, 232, 240, 0.86);
    border-radius: 13px;
    background: rgba(255, 255, 255, 0.86);
    box-shadow: none;
  }

  .home-command .code-tools button:hover {
    border-color: #bfdbfe;
    background: #ffffff;
  }

  .home-command .code-tools em {
    min-width: 28px;
    padding: 3px 7px;
    border-radius: 999px;
    color: var(--aorist-primary-strong);
    background: #eff6ff;
    font-size: 11px;
    font-weight: 800;
    text-align: center;
  }

  @media (max-width: 980px) {
    .home--command {
      padding: 24px 14px;
    }

    .home-command {
      width: 100%;
      padding: 18px;
    }

    .home-command .home__quick,
    .home-command .code-tools {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 620px) {
    .home-command__eyebrow,
    .home-command__hero {
      align-items: flex-start;
      flex-direction: column;
    }

    .home-command__eyebrow em {
      max-width: 100%;
    }

    .home-command__hero h1 {
      font-size: 30px;
    }

    .home-command .home__quick,
    .home-command .code-tools {
      grid-template-columns: 1fr;
    }
  }

  /* AoristLawer full UI pass */
  .shell {
    --aorist-primary: #2563eb;
    --aorist-primary-strong: #1d4ed8;
    --aorist-primary-soft: #eff6ff;
    --aorist-primary-softer: #f4f8ff;
    --aorist-ink: #111827;
    --aorist-muted: #667085;
    --aorist-faint: #98a2b3;
    --aorist-line: #e5eaf2;
    --aorist-line-strong: #d8e2ef;
    --aorist-card: rgba(255, 255, 255, 0.78);
    --aorist-card-strong: rgba(255, 255, 255, 0.94);
    --aorist-shadow: 0 16px 42px rgba(15, 23, 42, 0.065);
    --aorist-shadow-soft: 0 8px 22px rgba(15, 23, 42, 0.045);
    --sidebar-width: 240px;
    color: var(--aorist-ink);
    background:
      radial-gradient(circle at 10% -12%, rgba(37, 99, 235, 0.11), transparent 30%),
      radial-gradient(circle at 86% 0%, rgba(56, 189, 248, 0.08), transparent 28%),
      linear-gradient(135deg, #f8fafc 0%, #f1f5f9 44%, #f7f9fc 100%);
    font-family: "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif;
  }

  .stage {
    padding: 10px 10px 10px 0;
  }

  .stage__surface {
    border-color: rgba(216, 226, 239, 0.96);
    border-radius: 20px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(248, 250, 252, 0.9)),
      #ffffff;
    box-shadow:
      0 24px 70px rgba(15, 23, 42, 0.075),
      inset 0 1px 0 rgba(255, 255, 255, 0.92);
  }

  .sidebar--aorist {
    border-right-color: rgba(216, 226, 239, 0.9);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(248, 250, 252, 0.94)),
      hsl(220 20% 98%);
    box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.78);
  }

  .sidebar__brand {
    grid-template-columns: 34px minmax(0, 1fr) auto 30px;
    gap: 8px;
    min-height: 58px;
    padding: 0 12px;
    border-bottom-color: rgba(226, 232, 240, 0.9);
    background: rgba(255, 255, 255, 0.68);
  }

  .brand-mark,
  .nav-icon,
  .sidebar__avatar,
  :global(.agent-strip span),
  .agent-card header > span,
  .wizard-avatar,
  .wizard-preview b {
    color: var(--aorist-primary-strong);
    background: linear-gradient(135deg, #eff6ff, #dbeafe);
    box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.12);
  }

  .brand-mark {
    width: 30px;
    height: 30px;
    border-radius: 10px;
  }

  .sidebar__brand strong {
    color: #0f172a;
    font-size: 14px;
    letter-spacing: -0.025em;
  }

  .sidebar__brand span {
    color: #7b8494;
    font-size: 11px;
  }

  .brand-mode-switch,
  .sidebar__icon {
    flex-shrink: 0;
    border-color: rgba(37, 99, 235, 0.12);
    background: rgba(239, 246, 255, 0.86);
    color: var(--aorist-primary-strong);
  }

  .workspace-nav {
    padding: 11px 8px 12px;
  }

  .workspace-nav section {
    margin-bottom: 12px;
  }

  .workspace-nav h2 {
    margin: 10px 10px 6px;
    color: var(--aorist-faint);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.12em;
  }

  .workspace-nav button {
    position: relative;
    min-height: 36px;
    padding: 4px 9px;
    border-radius: 11px;
    color: #5f6774;
    transition: transform 0.16s ease, color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
  }

  .workspace-nav button:hover {
    transform: translateX(1px);
    color: #1f2937;
    background: #f1f5fb;
  }

  .workspace-nav button.active {
    color: var(--aorist-primary-strong);
    background: linear-gradient(135deg, #eef4ff, #ffffff);
    box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.1), var(--aorist-shadow-soft);
  }

  .workspace-nav button.active::before {
    left: -1px;
    top: 9px;
    bottom: 9px;
    width: 3px;
    background: var(--aorist-primary);
  }

  .workspace-nav button span:nth-child(2) {
    font-size: 13px;
    font-weight: 700;
  }

  .workspace-nav button em {
    border: 1px solid #dbeafe;
    background: #eff6ff;
    color: var(--aorist-primary-strong);
    font-weight: 800;
  }

  .sidebar__user-wrap {
    padding: 0 10px 10px;
  }

  .sidebar__user-wrap .sidebar__user,
  .user-menu {
    border-color: rgba(216, 226, 239, 0.96);
    background: rgba(255, 255, 255, 0.88);
    box-shadow: var(--aorist-shadow-soft);
  }

  .user-menu {
    left: 10px;
    right: 10px;
    bottom: 60px;
    padding: 6px;
  }

  .user-menu button:hover {
    color: var(--aorist-ink);
    background: #f3f6fb;
  }

  .stage-topbar {
    min-height: 60px;
    padding: 0 20px;
    border-bottom-color: rgba(226, 232, 240, 0.9);
    background: rgba(255, 255, 255, 0.82);
    backdrop-filter: blur(18px);
  }

  .stage-topbar span,
  .aorist-toolbar span,
  .hero-panel span,
  :global(.task-composer-card__head) span,
  .detail-panel header span,
  .knowledge-preview span {
    color: #7b8494;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .stage-topbar strong,
  .aorist-toolbar strong,
  .aorist-card header strong {
    color: #0f172a;
    letter-spacing: -0.03em;
  }

  .hero-panel button,
  .aorist-toolbar button,
  :global(.composer-context-actions button),
  .automation-card footer button,
  .capability-item button,
  .config-modal footer button,
  .agent-wizard__footer button,
  .resource-actions button,
  .workbench-calendar footer button {
    min-height: 32px;
    border-color: var(--aorist-line-strong);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.92);
    color: #344054;
    font-weight: 750;
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.78);
    transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
  }

  .hero-panel button:hover,
  .aorist-toolbar button:hover,
  :global(.composer-context-actions button:hover),
  .automation-card footer button:hover,
  .capability-item button:hover,
  .config-modal footer button:hover,
  .agent-wizard__footer button:hover,
  .resource-actions button:hover,
  .workbench-calendar footer button:hover {
    transform: translateY(-1px);
    border-color: #bfdbfe;
    background: #ffffff;
    box-shadow: 0 10px 22px rgba(15, 23, 42, 0.075);
  }

  .hero-panel button:first-child,
  .aorist-toolbar button:last-child,
  .config-modal footer button:last-child,
  .agent-wizard__footer button:last-child,
  .workbench-calendar footer button:last-child {
    border-color: var(--aorist-primary);
    background: linear-gradient(135deg, var(--aorist-primary), var(--aorist-primary-strong));
    color: #ffffff;
    box-shadow: 0 12px 22px rgba(37, 99, 235, 0.18);
  }

  .aorist-page {
    padding: 20px;
    background:
      radial-gradient(circle at 12% -2%, rgba(37, 99, 235, 0.09), transparent 30%),
      radial-gradient(circle at 88% 0%, rgba(14, 165, 233, 0.07), transparent 28%),
      #f7f9fc;
  }

  .hero-panel {
    border-color: rgba(191, 219, 254, 0.72);
    border-radius: 24px;
    background:
      radial-gradient(circle at 88% 8%, rgba(37, 99, 235, 0.16), transparent 24%),
      linear-gradient(135deg, rgba(255, 255, 255, 0.97) 0%, rgba(239, 246, 255, 0.94) 58%, rgba(248, 250, 252, 0.94) 100%);
    box-shadow: 0 24px 64px rgba(37, 99, 235, 0.095);
  }

  .hero-panel h1 {
    color: var(--aorist-ink);
    font-size: clamp(30px, 4vw, 48px);
    line-height: 1.04;
    letter-spacing: -0.055em;
  }

  .hero-panel p {
    color: var(--aorist-muted);
  }

  .aorist-stats,
  .aorist-card-grid {
    gap: 14px;
  }

  .aorist-stats {
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  .aorist-card-grid {
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }

  .aorist-stats article,
  .aorist-card,
  .aorist-list article,
  .agent-card,
  .automation-card,
  .media-card,
  .capability-item,
  :global(.task-composer-card),
  .detail-panel,
  .knowledge-preview,
  .calendar-grid article,
  .calendar-mini-grid article {
    border-color: rgba(226, 232, 240, 0.92);
    background: var(--aorist-card);
    backdrop-filter: blur(16px);
    box-shadow: var(--aorist-shadow-soft);
  }

  .aorist-stats article,
  .aorist-card,
  .agent-card,
  .automation-card,
  .media-card,
  .capability-item,
  :global(.task-composer-card) {
    border-radius: 18px;
  }

  .aorist-stats article:hover,
  .aorist-card:hover,
  .aorist-list article:hover,
  .agent-card:hover,
  .automation-card:hover,
  .media-card:hover,
  .capability-item:hover,
  :global(.task-composer-card):hover {
    transform: translateY(-1px);
    border-color: rgba(147, 197, 253, 0.92);
    box-shadow: var(--aorist-shadow);
  }

  .aorist-stats span,
  .aorist-stats em,
  .todo-row em,
  .automation-row em,
  .aorist-list em,
  .agent-card header em,
  .agent-card footer {
    color: #7b8494;
  }

  .aorist-stats strong {
    color: #0f172a;
    font-size: 30px;
    letter-spacing: -0.055em;
  }

  .aorist-toolbar,
  .capability-tabs {
    border-color: rgba(216, 226, 239, 0.92);
    border-radius: 17px;
    background: rgba(255, 255, 255, 0.84);
    backdrop-filter: blur(16px);
    box-shadow: var(--aorist-shadow-soft);
  }

  .capability-tabs {
    width: fit-content;
  }

  .capability-tabs button {
    color: #5f6774;
  }

  .capability-tabs button.active {
    border-color: transparent;
    background: linear-gradient(135deg, var(--aorist-primary), var(--aorist-primary-strong));
    color: #ffffff;
  }

  :global(.agent-strip) {
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    gap: 12px;
  }

  :global(.agent-strip button) {
    min-height: 70px;
    border-color: rgba(226, 232, 240, 0.92);
    border-radius: 17px;
    background: rgba(255, 255, 255, 0.82);
    box-shadow: var(--aorist-shadow-soft);
  }

  :global(.agent-strip button.active) {
    border-color: rgba(37, 99, 235, 0.42);
    background: linear-gradient(135deg, #eef4ff, #ffffff);
  }

  .new-task-page {
    display: grid;
    align-content: start;
    gap: 14px;
  }

  .new-task-page :global(.agent-strip),
  .new-task-page :global(.task-composer-card) {
    width: min(100%, 1180px);
    margin: 0 auto;
  }

  :global(.task-composer-card) {
    padding: 16px;
  }

  :global(.task-composer-card__head) {
    align-items: center;
  }

  :global(.task-composer-card__head) strong {
    color: #0f172a;
    font-size: 20px;
    letter-spacing: -0.035em;
  }

  :global(.task-composer-card__head) select,
  .config-grid input,
  .config-grid textarea,
  .config-grid select,
  .aorist-search input,
  .wizard-form input,
  .wizard-form textarea,
  .wizard-form select {
    border-color: #d8e2ef;
    border-radius: 11px;
    background: rgba(255, 255, 255, 0.92);
    color: #111827;
    outline: none;
    transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
  }

  :global(.task-composer-card__head) select:focus,
  .config-grid input:focus,
  .config-grid textarea:focus,
  .config-grid select:focus,
  .aorist-search input:focus,
  .wizard-form input:focus,
  .wizard-form textarea:focus,
  .wizard-form select:focus {
    border-color: #93c5fd;
    background: #ffffff;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.09);
  }

  :global(.task-composer-card .composer),
  .home-command .home__composer :global(.composer),
  .stage__composer :global(.composer) {
    border-color: rgba(191, 219, 254, 0.9);
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.94);
    box-shadow:
      0 16px 36px rgba(15, 23, 42, 0.06),
      inset 0 1px 0 rgba(255, 255, 255, 0.88);
  }

  :global(.task-composer-card .composer textarea),
  .home-command .home__composer :global(.composer textarea),
  .stage__composer :global(.composer textarea) {
    color: #0f172a;
  }

  :global(.composer-context-actions) {
    gap: 8px;
  }

  :global(.composer-context-actions > span) {
    border-color: #bfdbfe;
    background: linear-gradient(135deg, #eff6ff, #ffffff);
    color: var(--aorist-primary-strong);
  }

  .todo-row,
  .automation-row,
  .select-list button,
  .wizard-card-grid button,
  .wizard-skill-list button {
    border-color: rgba(226, 232, 240, 0.92);
    background: rgba(255, 255, 255, 0.84);
  }

  .todo-row:hover,
  .automation-row:hover,
  .select-list button:hover,
  .wizard-card-grid button:hover,
  .wizard-skill-list button:hover {
    transform: translateX(1px);
    border-color: #bfdbfe;
    background: #f8fbff;
  }

  .aorist-list article {
    border-radius: 16px;
  }

  .aorist-list strong,
  .todo-row strong,
  .automation-row strong,
  .agent-card header strong,
  .automation-card strong,
  .media-card strong,
  .capability-item strong,
  .knowledge-preview strong {
    color: #111827;
  }

  .aorist-list p,
  .agent-card p,
  .automation-card p,
  .media-card p,
  .capability-item p,
  .knowledge-preview p {
    color: #5f6774;
  }

  .aorist-list span,
  .automation-card span,
  .media-card span,
  .capability-item span,
  .workbench-calendar header span,
  .calendar-event-chip,
  .calendar-mini-grid span {
    border: 1px solid #dbeafe;
    background: #eff6ff;
    color: var(--aorist-primary-strong);
  }

  .agent-card header > span,
  :global(.agent-strip span),
  .wizard-avatar,
  .wizard-preview b {
    color: #ffffff;
    background: linear-gradient(135deg, var(--aorist-primary), var(--aorist-primary-strong));
    box-shadow: 0 12px 24px rgba(37, 99, 235, 0.18);
  }

  .calendar-board,
  .knowledge-layout {
    gap: 16px;
  }

  .calendar-grid article.today,
  .calendar-mini-grid article.today {
    border-color: #93c5fd;
    background: linear-gradient(135deg, #eff6ff, #ffffff);
  }

  .config-modal,
  .agent-wizard,
  .detail-modal {
    border-color: rgba(226, 232, 240, 0.96);
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(20px);
    box-shadow: 0 30px 88px rgba(15, 23, 42, 0.24);
  }

  .modal-backdrop {
    background:
      radial-gradient(circle at 52% 18%, rgba(37, 99, 235, 0.18), transparent 32%),
      rgba(15, 23, 42, 0.36);
  }

  .wizard-tabs {
    background: linear-gradient(180deg, #f8fafc, #f1f5f9);
  }

  .wizard-tabs button.active {
    color: var(--aorist-primary-strong);
    background: #ffffff;
    box-shadow: var(--aorist-shadow-soft);
  }

  .home--command {
    background:
      radial-gradient(circle at 18% 10%, rgba(37, 99, 235, 0.12), transparent 30%),
      radial-gradient(circle at 82% 4%, rgba(14, 165, 233, 0.09), transparent 26%),
      linear-gradient(180deg, rgba(248, 250, 252, 0.36), rgba(241, 245, 249, 0.68));
  }

  .home-command {
    border-color: rgba(216, 226, 239, 0.94);
    background: rgba(255, 255, 255, 0.84);
    box-shadow: 0 28px 80px rgba(15, 23, 42, 0.105);
  }

  .home-command__hero h1 {
    color: #0f172a;
  }

  .home-command .home__quick button,
  .home-command .code-tools,
  .home-command .code-tools button {
    border-color: rgba(226, 232, 240, 0.9);
    background: rgba(255, 255, 255, 0.82);
  }

  .conversation-header {
    border-bottom-color: rgba(226, 232, 240, 0.9);
    background: rgba(255, 255, 255, 0.82);
    backdrop-filter: blur(16px);
  }

  .conversation {
    background:
      radial-gradient(circle at 22% 0%, rgba(37, 99, 235, 0.07), transparent 28%),
      #f8fafc;
  }

  .code-inspector {
    border-color: rgba(216, 226, 239, 0.96);
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(18px);
    box-shadow: 0 28px 80px rgba(15, 23, 42, 0.2);
  }

  @media (max-width: 980px) {
    .shell {
      --sidebar-width: 220px;
    }

    .stage {
      padding: 8px;
    }

    .stage-topbar {
      padding: 10px 14px;
    }

    .aorist-page {
      padding: 14px;
    }
  }

  @media (max-width: 720px) {
    .aorist-toolbar,
    .stage-topbar {
      align-items: flex-start;
      flex-direction: column;
    }

    .aorist-stats,
    .aorist-card-grid,
    :global(.agent-strip),
    .workbench-grid {
      grid-template-columns: 1fr;
    }
  }

  /* AoristLawer 1:1 layout alignment */
  .shell {
    --sidebar-width: 220px;
    --aorist-primary: hsl(220 70% 50%);
    --aorist-primary-strong: hsl(220 70% 46%);
    --aorist-primary-soft: hsl(220 70% 96%);
    --aorist-ink: hsl(220 30% 10%);
    --aorist-muted: hsl(220 10% 46%);
    --aorist-faint: hsl(220 10% 60%);
    --aorist-line: hsl(220 20% 90%);
    --aorist-sidebar: hsl(220 20% 98%);
    --aorist-sidebar-hover: hsl(220 20% 94%);
    --aorist-sidebar-active: hsl(220 20% 90%);
    display: grid;
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
    height: 100vh;
    overflow: hidden;
    color: var(--aorist-ink);
    background: hsl(0 0% 100%);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Microsoft YaHei", sans-serif;
  }

  .stage {
    min-width: 0;
    padding: 0;
    background: hsl(0 0% 100%);
  }

  .stage__surface {
    height: 100vh;
    border: 0;
    border-radius: 0;
    background: hsl(0 0% 100%);
    box-shadow: none;
  }

  .stage__surface::before {
    display: none;
  }

  .sidebar--aorist {
    width: var(--sidebar-width);
    min-width: var(--sidebar-width);
    border-right: 1px solid var(--aorist-line);
    background: var(--aorist-sidebar);
    box-shadow: none;
  }

  .sidebar__brand {
    grid-template-columns: 24px minmax(0, 1fr) 28px;
    gap: 8px;
    min-height: 56px;
    padding: 0 16px;
    border-bottom: 1px solid var(--aorist-line);
    background: var(--aorist-sidebar);
  }

  .brand-mark {
    width: 24px;
    height: 24px;
    border-radius: 0;
    color: var(--aorist-primary);
    background: transparent;
    box-shadow: none;
  }

  .brand-mark :global(svg) {
    width: 24px;
    height: 24px;
  }

  .sidebar__brand strong {
    color: var(--aorist-ink);
    font-size: 16px;
    font-weight: 800;
    letter-spacing: -0.025em;
  }

  .sidebar__brand span {
    display: none;
  }

  .brand-mode-switch {
    min-width: 48px;
    height: 26px;
    padding: 0 7px;
    border-color: var(--aorist-line);
    border-radius: 8px;
    background: hsl(0 0% 100%);
    color: var(--aorist-primary);
    font-size: 11px;
    box-shadow: none;
  }

  .sidebar__icon {
    width: 28px;
    height: 28px;
    border-color: transparent;
    background: transparent;
    color: var(--aorist-muted);
  }

  .workspace-nav {
    padding: 8px 0;
  }

  .workspace-nav section {
    margin: 0 0 8px;
  }

  .workspace-nav h2 {
    margin: 0;
    padding: 6px 12px;
    color: color-mix(in srgb, var(--aorist-muted) 60%, transparent);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .workspace-nav button {
    grid-template-columns: 20px minmax(0, 1fr) auto;
    gap: 12px;
    width: calc(100% - 16px);
    min-height: 36px;
    margin: 0 8px 4px;
    padding: 8px 12px;
    border: 0;
    border-radius: 8px;
    color: var(--aorist-muted);
    background: transparent;
    font-size: 14px;
    font-weight: 600;
    box-shadow: none;
  }

  .workspace-nav button:hover {
    transform: none;
    color: var(--aorist-ink);
    background: var(--aorist-sidebar-hover);
    box-shadow: none;
  }

  .workspace-nav button.active {
    color: var(--aorist-primary);
    background: var(--aorist-sidebar-active);
    box-shadow: none;
  }

  .workspace-nav button.active::before {
    display: none;
  }

  .nav-icon {
    width: 20px;
    height: 20px;
    color: inherit;
    background: transparent;
    box-shadow: none;
  }

  .nav-icon :global(svg) {
    width: 20px;
    height: 20px;
  }

  .workspace-nav button span:nth-child(2) {
    font-size: 14px;
    font-weight: 600;
  }

  .workspace-nav button em {
    min-width: auto;
    padding: 1px 6px;
    border: 0;
    background: hsl(220 20% 96%);
    color: var(--aorist-muted);
    font-size: 11px;
    font-weight: 600;
  }

  .sidebar__user-wrap {
    padding: 0;
    border-top: 1px solid var(--aorist-line);
    background: var(--aorist-sidebar);
  }

  .sidebar__user-wrap .sidebar__user {
    width: calc(100% - 16px);
    margin: 8px;
    padding: 8px 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    box-shadow: none;
  }

  .sidebar__user-wrap .sidebar__user:hover {
    background: var(--aorist-sidebar-hover);
  }

  .sidebar__avatar {
    width: 28px;
    height: 28px;
    color: var(--aorist-primary);
    background: hsl(220 70% 96%);
    box-shadow: none;
  }

  .sidebar__user em {
    border: 0;
    background: hsl(220 20% 96%);
    color: var(--aorist-muted);
  }

  .user-menu {
    left: 8px;
    right: 8px;
    bottom: 56px;
    border: 1px solid var(--aorist-line);
    border-radius: 12px;
    background: hsl(0 0% 100%);
    box-shadow: 0 16px 36px rgba(15, 23, 42, 0.12);
  }

  .stage-topbar,
  .conversation-header {
    min-height: 56px;
    padding: 0 24px;
    border-bottom: 1px solid var(--aorist-line);
    background: hsl(0 0% 100%);
    box-shadow: none;
    backdrop-filter: none;
  }

  .stage-topbar span,
  .aorist-toolbar span,
  .hero-panel span,
  :global(.task-composer-card__head) span {
    color: color-mix(in srgb, var(--aorist-muted) 72%, transparent);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .stage-topbar strong {
    margin: 0;
    color: var(--aorist-ink);
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .stage-topbar {
    --wails-draggable: drag;
  }

  .stage-topbar__actions {
    position: relative;
    z-index: 3;
    gap: 8px;
    --wails-draggable: no-drag;
  }

  .hero-panel button,
  .aorist-toolbar button,
  :global(.composer-context-actions button),
  .automation-card footer button,
  .capability-item button,
  .config-modal footer button,
  .agent-wizard__footer button,
  .resource-actions button,
  .workbench-calendar footer button {
    min-height: 36px;
    padding: 0 12px;
    border: 1px solid var(--aorist-line);
    border-radius: 8px;
    background: hsl(0 0% 100%);
    color: var(--aorist-ink);
    font-size: 13px;
    font-weight: 600;
    box-shadow: none;
    --wails-draggable: no-drag;
  }

  .hero-panel button:hover,
  .aorist-toolbar button:hover,
  :global(.composer-context-actions button:hover),
  .automation-card footer button:hover,
  .capability-item button:hover,
  .config-modal footer button:hover,
  .agent-wizard__footer button:hover,
  .resource-actions button:hover,
  .workbench-calendar footer button:hover {
    transform: none;
    border-color: var(--aorist-line);
    background: hsl(220 20% 96%);
    box-shadow: none;
  }

  .hero-panel button:first-child,
  .aorist-toolbar button:last-child,
  .config-modal footer button:last-child,
  .agent-wizard__footer button:last-child,
  .workbench-calendar footer button:last-child {
    border-color: var(--aorist-primary);
    background: var(--aorist-primary);
    color: hsl(0 0% 100%);
    box-shadow: none;
  }

  .aorist-page {
    height: 100%;
    padding: 24px;
    overflow: auto;
    background: hsl(0 0% 100%);
  }

  .hero-panel {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .hero-panel::after {
    display: none;
  }

  .hero-panel h1 {
    max-width: 760px;
    margin: 8px 0;
    color: var(--aorist-ink);
    font-size: 32px;
    line-height: 1.15;
    letter-spacing: -0.04em;
  }

  .hero-panel p {
    max-width: 680px;
    color: var(--aorist-muted);
    font-size: 14px;
    line-height: 1.7;
  }

  .aorist-stats {
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
    margin-top: 24px;
  }

  .aorist-card-grid {
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 16px;
    margin-top: 16px;
  }

  .aorist-stats article,
  .aorist-card,
  .aorist-list article,
  .agent-card,
  .automation-card,
  .media-card,
  .capability-item,
  :global(.task-composer-card),
  .detail-panel,
  .knowledge-preview,
  .calendar-grid article,
  .calendar-mini-grid article {
    border: 1px solid var(--aorist-line);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.5);
    backdrop-filter: blur(4px);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }

  .aorist-stats article:hover,
  .aorist-card:hover,
  .aorist-list article:hover,
  .agent-card:hover,
  .automation-card:hover,
  .media-card:hover,
  .capability-item:hover,
  :global(.task-composer-card):hover {
    transform: none;
    border-color: var(--aorist-line);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }

  .aorist-stats article {
    padding: 20px;
  }

  .aorist-stats span,
  .aorist-stats em {
    color: var(--aorist-muted);
    font-size: 14px;
  }

  .aorist-stats strong {
    margin: 4px 0;
    color: var(--aorist-ink);
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.04em;
  }

  .aorist-split {
    gap: 24px;
    margin-top: 24px;
  }

  .aorist-card {
    padding: 16px;
  }

  .aorist-card header strong,
  .aorist-toolbar strong {
    color: var(--aorist-ink);
    font-size: 16px;
    font-weight: 700;
  }

  .aorist-toolbar {
    margin-bottom: 16px;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
  }

  .aorist-search {
    max-width: 448px;
    margin-bottom: 16px;
  }

  .aorist-search input,
  :global(.task-composer-card__head) select,
  .config-grid input,
  .config-grid textarea,
  .config-grid select,
  .wizard-form input,
  .wizard-form textarea,
  .wizard-form select {
    border: 1px solid var(--aorist-line);
    border-radius: 8px;
    background: hsl(0 0% 100%);
    color: var(--aorist-ink);
    box-shadow: none;
  }

  .aorist-search input:focus,
  :global(.task-composer-card__head) select:focus,
  .config-grid input:focus,
  .config-grid textarea:focus,
  .config-grid select:focus,
  .wizard-form input:focus,
  .wizard-form textarea:focus,
  .wizard-form select:focus {
    border-color: var(--aorist-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--aorist-primary) 18%, transparent);
  }

  .todo-row,
  .automation-row,
  .select-list button,
  .wizard-card-grid button,
  .wizard-skill-list button {
    border: 1px solid var(--aorist-line);
    border-radius: 10px;
    background: hsl(0 0% 100%);
    box-shadow: none;
  }

  .todo-row:hover,
  .automation-row:hover,
  .select-list button:hover,
  .wizard-card-grid button:hover,
  .wizard-skill-list button:hover {
    transform: none;
    border-color: var(--aorist-line);
    background: hsl(220 20% 96%);
  }

  .aorist-list article {
    padding: 16px;
  }

  .aorist-list span,
  .automation-card span,
  .media-card span,
  .capability-item span,
  .workbench-calendar header span,
  .calendar-event-chip,
  .calendar-mini-grid span {
    border: 0;
    background: hsl(220 20% 96%);
    color: var(--aorist-muted);
    font-size: 11px;
  }

  :global(.agent-strip) {
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
    margin-bottom: 16px;
  }

  :global(.agent-strip button) {
    min-height: 72px;
    padding: 12px;
    border: 1px solid var(--aorist-line);
    border-radius: 12px;
    background: hsl(0 0% 100%);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }

  :global(.agent-strip button.active) {
    border-color: color-mix(in srgb, var(--aorist-primary) 30%, var(--aorist-line));
    background: hsl(220 70% 96%);
  }

  :global(.agent-strip span),
  .agent-card header > span,
  .wizard-avatar,
  .wizard-preview b {
    color: var(--aorist-primary);
    background: hsl(220 70% 96%);
    box-shadow: none;
  }

  .new-task-page :global(.agent-strip),
  .new-task-page :global(.task-composer-card) {
    width: min(100%, 1040px);
  }

  :global(.task-composer-card) {
    padding: 16px;
  }

  :global(.task-composer-card__head) strong {
    color: var(--aorist-ink);
    font-size: 18px;
    font-weight: 700;
  }

  :global(.task-composer-card .composer),
  .home-command .home__composer :global(.composer),
  .stage__composer :global(.composer) {
    border: 1px solid var(--aorist-line);
    border-radius: 12px;
    background: hsl(0 0% 100%);
    box-shadow: none;
  }

  :global(.task-composer-card .composer button[type="submit"]),
  .home-command .home__composer :global(.composer button[type="submit"]),
  .stage__composer :global(.composer button[type="submit"]) {
    color: hsl(0 0% 100%);
    background: var(--aorist-primary);
    box-shadow: none;
  }

  :global(.composer-context-actions > span) {
    border: 0;
    background: hsl(220 70% 96%);
    color: var(--aorist-primary);
  }

  .capability-tabs {
    padding: 4px;
    border: 1px solid var(--aorist-line);
    border-radius: 10px;
    background: hsl(0 0% 100%);
    box-shadow: none;
  }

  .capability-tabs button {
    min-width: 92px;
    height: 32px;
    border-radius: 8px;
    color: var(--aorist-muted);
  }

  .capability-tabs button.active {
    background: var(--aorist-primary);
    color: hsl(0 0% 100%);
  }

  .config-modal,
  .agent-wizard,
  .detail-modal {
    border: 1px solid var(--aorist-line);
    border-radius: 16px;
    background: hsl(0 0% 100%);
    box-shadow: 0 24px 64px rgba(15, 23, 42, 0.22);
    backdrop-filter: none;
  }

  .modal-backdrop {
    background: rgba(15, 23, 42, 0.36);
    backdrop-filter: blur(6px);
  }

  .wizard-tabs {
    background: hsl(220 20% 96%);
  }

  .wizard-tabs button.active {
    color: var(--aorist-ink);
    background: hsl(0 0% 100%);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
  }

  .home--command {
    background: hsl(0 0% 100%);
  }

  .home-command {
    width: min(860px, 92%);
    border: 1px solid var(--aorist-line);
    border-radius: 16px;
    background: hsl(0 0% 100%);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }

  .home-command::before,
  .home-command::after {
    display: none;
  }

  .home-command__hero h1 {
    font-size: clamp(30px, 4vw, 44px);
  }

  .home-command .home__quick button,
  .home-command .code-tools,
  .home-command .code-tools button,
  .home-command .home__context {
    border-color: var(--aorist-line);
    background: hsl(0 0% 100%);
    box-shadow: none;
  }

  .home-command .home__quick button:hover,
  .home-command .code-tools button:hover,
  .home-command .home__context button:hover {
    transform: none;
    background: hsl(220 20% 96%);
    box-shadow: none;
  }

  .conversation {
    background: hsl(0 0% 100%);
  }

  .code-inspector {
    border: 1px solid var(--aorist-line);
    border-radius: 16px;
    background: hsl(0 0% 100%);
    box-shadow: 0 24px 64px rgba(15, 23, 42, 0.18);
  }

  @media (max-width: 980px) {
    .shell {
      --sidebar-width: 220px;
    }

    .stage {
      padding: 0;
    }

    .aorist-page {
      padding: 20px;
    }
  }

  @media (max-width: 720px) {
    .stage-topbar,
    .aorist-toolbar {
      align-items: flex-start;
      flex-direction: column;
      min-height: auto;
      padding: 12px 16px;
    }

    .aorist-page {
      padding: 16px;
    }
  }

  .user-panel-modal {
    width: min(780px, calc(100vw - 44px));
  }

  .config-modal.user-panel-modal {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    max-height: min(720px, calc(100vh - 44px));
    padding: 0;
  }

  .user-panel-modal__title {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .user-panel-modal__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    border-radius: 10px;
    color: var(--aorist-primary);
    background: hsl(220 70% 96%);
  }

  .user-panel-modal__intro {
    margin: 0;
    padding: 14px 18px;
    border-bottom: 1px solid var(--aorist-line);
    color: var(--aorist-muted);
    font-size: 13px;
    line-height: 1.7;
  }

  .settings-dialog-layout {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    min-height: 0;
    overflow: hidden;
  }

  .settings-dialog-nav {
    display: grid;
    align-content: start;
    gap: 8px;
    min-height: 0;
    overflow: auto;
    padding: 14px;
    border-right: 1px solid var(--aorist-line);
    background: var(--aorist-card-bg-soft);
  }

  .settings-dialog-nav button {
    display: grid;
    gap: 5px;
    width: 100%;
    padding: 12px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: var(--aorist-muted);
    text-align: left;
  }

  .settings-dialog-nav button:hover,
  .settings-dialog-nav button.active {
    border-color: var(--aorist-line);
    background: #ffffff;
    color: var(--aorist-ink);
    box-shadow: var(--aorist-shadow-soft);
  }

  .settings-dialog-nav button.active {
    border-color: color-mix(in srgb, var(--aorist-primary) 28%, var(--aorist-line));
  }

  .settings-dialog-nav span {
    justify-self: start;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--aorist-primary-soft);
    color: var(--aorist-primary-strong);
    font-size: 11px;
  }

  .settings-dialog-nav strong {
    color: inherit;
    font-size: 14px;
    line-height: 1.35;
  }

  .settings-dialog-nav em {
    color: var(--aorist-muted);
    font-size: 12px;
    font-style: normal;
    line-height: 1.45;
  }

  .settings-dialog-panel {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    padding: 16px 18px;
  }

  .settings-dialog-panel__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  .settings-dialog-panel__head span {
    display: block;
    color: var(--aorist-muted);
    font-size: 12px;
  }

  .settings-dialog-panel__head strong {
    display: block;
    margin-top: 2px;
    color: var(--aorist-ink);
    font-size: 18px;
    line-height: 1.3;
  }

  .settings-dialog-panel__head em {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--aorist-muted);
    font-size: 12px;
    font-style: normal;
  }

  .user-panel-list article {
    border: 1px solid var(--aorist-line);
    border-radius: 12px;
    background: hsl(0 0% 100%);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }

  .user-panel-list article > span {
    justify-self: start;
    padding: 2px 7px;
    border-radius: 999px;
    background: hsl(220 20% 96%);
    color: var(--aorist-muted);
    font-size: 11px;
  }

  .user-panel-list strong {
    color: var(--aorist-ink);
    font-size: 14px;
  }

  .user-panel-list p,
  .user-panel-list em {
    margin: 0;
    color: var(--aorist-muted);
    font-size: 12px;
    line-height: 1.55;
    font-style: normal;
  }

  .user-panel-list {
    display: grid;
    gap: 10px;
  }

  .user-panel-list article {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px;
  }

  .user-panel-list article > div {
    min-width: 0;
  }

  .sync-dialog-list i {
    display: block;
    width: 220px;
    max-width: 100%;
    height: 6px;
    margin-top: 9px;
    overflow: hidden;
    border-radius: 999px;
    background: hsl(220 20% 94%);
  }

  .sync-dialog-list i::before {
    content: "";
    display: block;
    width: var(--progress);
    height: 100%;
    border-radius: inherit;
    background: var(--aorist-primary);
  }

  .user-panel-form {
    margin-top: 0;
  }

  .settings-tabs {
    margin-bottom: 12px;
  }

  .settings-toggle {
    display: flex !important;
    grid-template-columns: none !important;
    align-items: center;
    gap: 9px !important;
    min-height: 36px;
    padding: 0 2px;
  }

  .settings-toggle input {
    width: 16px !important;
    height: 16px !important;
    min-height: 16px !important;
    padding: 0 !important;
    accent-color: var(--aorist-primary);
  }

  .settings-toggle span {
    color: var(--aorist-ink);
    font-size: 13px;
  }

  @media (max-width: 720px) {
    .user-panel-stats,
    .user-panel-form {
      grid-template-columns: 1fr;
    }

    .user-panel-list article {
      align-items: flex-start;
      flex-direction: column;
    }

    .settings-dialog-layout {
      grid-template-columns: 1fr;
      overflow: auto;
    }

    .settings-dialog-nav {
      display: flex;
      overflow-x: auto;
      border-right: 0;
      border-bottom: 1px solid var(--aorist-line);
    }

    .settings-dialog-nav button {
      width: min(220px, 78vw);
      flex: 0 0 auto;
    }

    .settings-dialog-panel {
      overflow: visible;
    }
  }

  .management-page {
    display: grid;
    align-content: start;
    gap: 16px;
    padding: 24px;
  }

  .management-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .management-stats article {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
    padding: 16px;
    border: 1px solid var(--aorist-line);
    border-radius: 10px;
    background: hsl(0 0% 100%);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }

  .management-stats span,
  .management-stats em {
    display: block;
    color: var(--aorist-muted);
    font-size: 12px;
    font-style: normal;
  }

  .management-stats strong {
    display: block;
    margin-top: 5px;
    overflow: hidden;
    color: var(--aorist-ink);
    font-size: 24px;
    font-weight: 750;
    letter-spacing: -0.035em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .management-stats em {
    margin-top: 4px;
    font-size: 11px;
    opacity: 0.82;
  }

  .management-stats article > :global(svg) {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    padding: 9px;
    border-radius: 10px;
    color: var(--aorist-primary);
    background: hsl(220 70% 96%);
  }

  .management-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .management-search {
    position: relative;
    display: flex;
    align-items: center;
    flex: 1;
    max-width: 448px;
    min-width: 260px;
  }

  .management-search :global(svg) {
    position: absolute;
    left: 12px;
    color: var(--aorist-muted);
    pointer-events: none;
  }

  .management-search input {
    width: 100%;
    height: 36px;
    padding: 0 12px 0 38px;
    border: 1px solid var(--aorist-line);
    border-radius: 8px;
    background: hsl(0 0% 100%);
    color: var(--aorist-ink);
    font: inherit;
    outline: none;
  }

  .management-search input:focus {
    border-color: var(--aorist-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--aorist-primary) 18%, transparent);
  }

  .management-tabs {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 36px;
    padding: 3px;
    border: 1px solid var(--aorist-line);
    border-radius: 9px;
    background: hsl(220 20% 96%);
  }

  .management-tabs button {
    height: 28px;
    padding: 0 10px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--aorist-muted);
    font-size: 12px;
    font-weight: 650;
  }

  .management-tabs button.active {
    background: hsl(0 0% 100%);
    color: var(--aorist-ink);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
  }

  .management-primary {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 36px;
    padding: 0 13px;
    border: 1px solid var(--aorist-primary);
    border-radius: 8px;
    background: var(--aorist-primary);
    color: #ffffff;
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
  }

  .management-list {
    display: grid;
    gap: 8px;
  }

  .project-management-page {
    grid-template-rows: auto auto minmax(0, 1fr);
  }

  .project-list-panel {
    display: grid;
    align-content: start;
    gap: 8px;
    min-width: 0;
  }

  .project-list-panel--single {
    width: 100%;
  }

  .project-matter-card {
    border-radius: 10px;
  }

  .project-card-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
  }

  .project-card-title strong {
    overflow: hidden;
    color: var(--aorist-ink);
    font-size: 15px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-card-title em {
    flex: 0 0 auto;
    color: var(--aorist-muted);
    font-size: 11px;
    font-style: normal;
  }

  .project-progress-line {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 8px;
    border-radius: 999px;
    background: hsl(220 20% 94%);
    overflow: visible;
  }

  .project-matter-card .project-progress-line {
    width: min(320px, calc(100% - 48px));
    margin-top: 2px;
  }

  .project-progress-line i {
    width: var(--progress);
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--aorist-primary), #38bdf8);
  }

  .project-progress-line span {
    position: absolute;
    right: 0;
    transform: translateX(calc(100% + 8px));
    color: var(--aorist-muted);
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }

  .project-detail-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .project-detail-metrics article {
    display: grid;
    gap: 4px;
    padding: 10px;
    border: 1px solid var(--aorist-line);
    border-radius: 10px;
    background: hsl(220 20% 98%);
  }

  .project-detail-metrics strong {
    color: var(--aorist-ink);
    font-size: 18px;
  }

  .project-detail-metrics span {
    color: var(--aorist-muted);
    font-size: 11px;
  }

  .project-detail-modal {
    width: min(1120px, calc(100vw - 44px));
    max-height: calc(100vh - 44px);
    overflow: auto;
  }

  .project-detail-modal > .project-detail-head {
    position: sticky;
    top: -18px;
    z-index: 1;
    align-items: center;
    gap: 14px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--aorist-line);
    background: hsl(0 0% 100%);
  }

  .project-detail-back,
  .project-detail-actions button,
  .project-detail-card button,
  .project-detail-aside button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid var(--aorist-line);
    border-radius: 8px;
    background: hsl(0 0% 100%);
    color: var(--aorist-ink);
    font-size: 12px;
    font-weight: 700;
  }

  .project-detail-back {
    width: 34px;
    padding: 0;
  }

  .project-detail-title {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    gap: 10px;
  }

  .project-detail-title strong {
    display: block;
    overflow: hidden;
    color: var(--aorist-ink);
    font-size: 20px;
    font-weight: 800;
    line-height: 1.2;
    letter-spacing: -0.03em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-detail-title span {
    display: block;
    margin-top: 3px;
    color: var(--aorist-muted);
    font-size: 12px;
  }

  .project-detail-title em {
    flex: 0 0 auto;
    min-height: 24px;
    padding: 4px 8px;
    border: 1px solid color-mix(in srgb, var(--aorist-primary) 22%, transparent);
    border-radius: 999px;
    background: var(--aorist-primary-soft);
    color: var(--aorist-primary);
    font-size: 12px;
    font-style: normal;
    font-weight: 700;
  }

  .project-detail-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }

  .project-detail-actions button:last-child,
  .project-detail-card button,
  .project-detail-aside button {
    border-color: var(--aorist-primary);
    background: var(--aorist-primary);
    color: hsl(0 0% 100%);
  }

  .project-detail-panel > header p {
    max-width: 680px;
    margin: 6px 0 0;
    color: var(--aorist-muted);
    font-size: 13px;
    line-height: 1.6;
  }

  .project-detail-summary {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .project-detail-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 16px;
    margin-top: 16px;
  }

  .project-detail-main,
  .project-detail-aside {
    display: grid;
    align-content: start;
    gap: 12px;
    min-width: 0;
  }

  .project-detail-main .detail-tabs {
    margin: 0 0 2px;
    border-bottom: 1px solid var(--aorist-line);
    border-radius: 0;
  }

  .project-detail-main .detail-tabs button {
    height: 38px;
    border: 0;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: transparent;
  }

  .project-detail-main .detail-tabs button.active {
    border-color: var(--aorist-primary);
    background: transparent;
    color: var(--aorist-primary);
  }

  .project-detail-card,
  .project-detail-aside section {
    padding: 14px;
    border: 1px solid var(--aorist-line);
    border-radius: 12px;
    background: hsl(0 0% 100%);
  }

  .project-detail-card h3,
  .project-detail-aside h3 {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0 0 10px;
    color: var(--aorist-ink);
    font-size: 14px;
  }

  .project-detail-card p,
  .project-detail-aside p {
    margin: 0;
    color: var(--aorist-muted);
    font-size: 13px;
    line-height: 1.65;
  }

  .project-detail-card button,
  .project-detail-aside button {
    margin-top: 12px;
  }

  .project-tab-panel {
    display: grid;
    gap: 12px;
  }

  .project-section-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .project-section-head h3 {
    margin: 0 0 4px;
  }

  .project-section-head p,
  .project-detail-row p {
    margin: 0;
    color: var(--aorist-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .project-section-head button,
  .project-resource-toolbar button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 32px;
    margin-top: 0;
    padding: 0 10px;
    border: 1px solid var(--aorist-line);
    border-radius: 8px;
    background: hsl(0 0% 100%);
    color: var(--aorist-ink);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }

  .project-section-head button:hover,
  .project-resource-toolbar button:hover,
  .project-detail-card .project-detail-row:hover {
    border-color: color-mix(in srgb, var(--aorist-primary) 32%, var(--aorist-line));
    background: color-mix(in srgb, var(--aorist-primary-soft) 54%, hsl(0 0% 100%));
  }

  .project-resource-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--aorist-line);
    border-radius: 10px;
    background: hsl(220 20% 98%);
  }

  .project-resource-toolbar span {
    color: var(--aorist-muted);
    font-size: 12px;
    font-weight: 700;
  }

  .project-detail-list {
    display: grid;
    gap: 8px;
  }

  .project-detail-card .project-detail-row {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) minmax(72px, auto);
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 66px;
    margin-top: 0;
    padding: 10px;
    border: 1px solid var(--aorist-line);
    border-radius: 10px;
    background: hsl(0 0% 100%);
    color: inherit;
    text-align: left;
  }

  .project-detail-row > span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    color: var(--aorist-primary);
    background: var(--aorist-primary-soft);
  }

  .project-detail-row strong {
    display: block;
    overflow: hidden;
    color: var(--aorist-ink);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-detail-row em {
    display: block;
    margin-top: 3px;
    color: var(--aorist-muted);
    font-size: 11px;
    font-style: normal;
    font-weight: 700;
  }

  .project-detail-row p {
    margin-top: 4px;
  }

  .project-detail-row b {
    display: grid;
    justify-items: end;
    gap: 3px;
    color: var(--aorist-primary);
    font-size: 12px;
    font-weight: 800;
  }

  .project-detail-row small {
    color: var(--aorist-muted);
    font-size: 10px;
    font-weight: 700;
  }

  .project-todo-row b,
  .project-schedule-list .project-detail-row b {
    padding: 4px 8px;
    border-radius: 999px;
    background: var(--aorist-primary-soft);
  }

  .project-detail-risk {
    border-color: #fde68a;
    background: #fffbeb;
  }

  .project-detail-risk h3 {
    color: #b45309;
  }

  .project-detail-aside section {
    display: grid;
    gap: 12px;
  }

  .project-detail-aside div {
    display: grid;
    gap: 5px;
  }

  .project-detail-aside span {
    display: inline-flex;
    width: fit-content;
    min-height: 22px;
    align-items: center;
    padding: 0 8px;
    border-radius: 999px;
    background: var(--aorist-primary-soft);
    color: var(--aorist-primary);
    font-size: 11px;
    font-weight: 700;
  }

  .project-detail-aside strong {
    color: var(--aorist-ink);
    font-size: 13px;
  }

  .project-detail-timeline {
    margin-top: 12px;
  }

  .management-card {
    display: flex;
    align-items: flex-start;
    width: 100%;
    gap: 16px;
    padding: 16px;
    border: 1px solid var(--aorist-line);
    border-radius: 12px;
    background: hsl(0 0% 100%);
    color: inherit;
    text-align: left;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    transition: border-color 0.16s ease, background 0.16s ease;
  }

  .management-card:hover {
    border-color: color-mix(in srgb, var(--aorist-primary) 30%, var(--aorist-line));
    background: hsl(220 70% 98%);
  }

  .management-card__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    flex: 0 0 auto;
    border-radius: 10px;
    color: var(--aorist-primary);
    background: hsl(220 70% 96%);
  }

  .management-card__body {
    display: grid;
    flex: 1;
    min-width: 0;
    gap: 7px;
  }

  .management-card__body p {
    margin: 0;
    color: var(--aorist-muted);
    font-size: 13px;
    line-height: 1.55;
  }

  .management-badges,
  .management-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .management-badges span,
  .management-badges em {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    background: hsl(220 20% 96%);
    color: var(--aorist-muted);
    font-size: 12px;
    font-style: normal;
  }

  .management-badges span:nth-child(2) {
    color: var(--aorist-primary);
    background: hsl(220 70% 96%);
  }

  .management-badges .riskHigh {
    color: #dc2626;
    background: #fee2e2;
  }

  .management-meta {
    color: var(--aorist-muted);
    font-size: 12px;
  }

  .management-meta span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .management-meta :global(svg) {
    color: var(--aorist-muted);
  }

  .management-card > b {
    margin-top: 12px;
    color: var(--aorist-muted);
    font-size: 20px;
    font-weight: 400;
    opacity: 0;
    transition: opacity 0.16s ease;
  }

  .management-card:hover > b {
    opacity: 1;
  }

  .client-card {
    align-items: center;
  }

  .client-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
    border: 1px solid var(--aorist-line);
    border-radius: 999px;
    color: var(--aorist-primary);
    background: var(--aorist-primary-soft);
  }

  .client-avatar--large {
    width: 56px;
    height: 56px;
  }

  .client-card-title {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    min-width: 0;
  }

  .client-card-title strong {
    overflow: hidden;
    color: var(--aorist-ink);
    font-size: 15px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .client-card-title span,
  .client-card-side span {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 0 8px;
    border: 1px solid var(--aorist-line);
    border-radius: 999px;
    background: hsl(0 0% 100%);
    color: var(--aorist-muted);
    font-size: 11px;
    font-weight: 700;
  }

  .client-card-title :global(svg) {
    color: #dc2626;
  }

  .client-contact-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 14px;
    color: var(--aorist-muted);
    font-size: 12px;
  }

  .client-contact-row span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .client-card-side {
    display: grid;
    justify-items: end;
    flex: 0 0 auto;
    gap: 5px;
    color: var(--aorist-muted);
    font-size: 12px;
  }

  .client-card-side em {
    font-style: normal;
    font-weight: 700;
  }

  .client-card-side .riskHigh {
    color: #dc2626;
  }

  .customer-detail-modal {
    width: min(1120px, calc(100vw - 44px));
    max-height: calc(100vh - 44px);
    overflow: auto;
  }

  .customer-detail-modal > .customer-detail-head {
    position: sticky;
    top: -18px;
    z-index: 1;
    align-items: center;
    gap: 14px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--aorist-line);
    background: hsl(0 0% 100%);
  }

  .customer-detail-back,
  .customer-detail-primary,
  .customer-project-list button,
  .customer-risk-card button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid var(--aorist-line);
    border-radius: 8px;
    background: hsl(0 0% 100%);
    color: var(--aorist-ink);
    font-size: 12px;
    font-weight: 700;
  }

  .customer-detail-back {
    width: 34px;
    padding: 0;
  }

  .customer-detail-primary,
  .customer-risk-card button {
    border-color: var(--aorist-primary);
    background: var(--aorist-primary);
    color: hsl(0 0% 100%);
  }

  .customer-detail-title {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    gap: 10px;
  }

  .customer-detail-title > div {
    min-width: 0;
  }

  .customer-detail-title strong {
    display: block;
    overflow: hidden;
    color: var(--aorist-ink);
    font-size: 22px;
    line-height: 1.2;
    letter-spacing: -0.03em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .customer-detail-title span {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: 5px;
    color: var(--aorist-muted);
    font-size: 12px;
  }

  .customer-detail-title em {
    flex: 0 0 auto;
    min-height: 24px;
    padding: 4px 8px;
    border: 1px solid color-mix(in srgb, var(--aorist-primary) 22%, transparent);
    border-radius: 999px;
    background: var(--aorist-primary-soft);
    color: var(--aorist-primary);
    font-size: 12px;
    font-style: normal;
    font-weight: 700;
  }

  .customer-detail-title em.muted {
    border-color: var(--aorist-line);
    background: hsl(220 20% 96%);
    color: var(--aorist-muted);
  }

  .customer-detail-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 16px;
  }

  .customer-detail-main,
  .customer-detail-aside {
    display: grid;
    align-content: start;
    gap: 12px;
    min-width: 0;
  }

  .customer-detail-main .detail-tabs {
    margin: 0 0 2px;
    border-bottom: 1px solid var(--aorist-line);
    border-radius: 0;
  }

  .customer-detail-main .detail-tabs button {
    height: 38px;
    border: 0;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: transparent;
  }

  .customer-detail-main .detail-tabs button.active {
    border-color: var(--aorist-primary);
    background: transparent;
    color: var(--aorist-primary);
  }

  .customer-detail-card,
  .customer-detail-aside section {
    padding: 14px;
    border: 1px solid var(--aorist-line);
    border-radius: 12px;
    background: hsl(0 0% 100%);
  }

  .customer-detail-card h3,
  .customer-detail-aside h3 {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0 0 10px;
    color: var(--aorist-ink);
    font-size: 14px;
  }

  .customer-detail-card p,
  .customer-detail-aside p {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0;
    color: var(--aorist-muted);
    font-size: 13px;
    line-height: 1.65;
  }

  .customer-tab-panel {
    display: grid;
    gap: 12px;
  }

  .customer-section-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .customer-section-head h3 {
    margin: 0 0 4px;
  }

  .customer-section-head p,
  .customer-detail-row p {
    display: block;
    margin: 0;
    color: var(--aorist-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .customer-section-head button,
  .customer-resource-toolbar button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 10px;
    border: 1px solid var(--aorist-line);
    border-radius: 8px;
    background: hsl(0 0% 100%);
    color: var(--aorist-ink);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }

  .customer-section-head button:hover,
  .customer-resource-toolbar button:hover,
  .customer-detail-row:hover {
    border-color: color-mix(in srgb, var(--aorist-primary) 32%, var(--aorist-line));
    background: color-mix(in srgb, var(--aorist-primary-soft) 54%, hsl(0 0% 100%));
  }

  .customer-resource-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--aorist-line);
    border-radius: 10px;
    background: hsl(220 20% 98%);
  }

  .customer-resource-toolbar span {
    color: var(--aorist-muted);
    font-size: 12px;
    font-weight: 700;
  }

  .customer-detail-list {
    display: grid;
    gap: 8px;
  }

  .customer-detail-row {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) minmax(72px, auto);
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 66px;
    padding: 10px;
    border: 1px solid var(--aorist-line);
    border-radius: 10px;
    background: hsl(0 0% 100%);
    text-align: left;
  }

  .customer-detail-row > span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    color: var(--aorist-primary);
    background: var(--aorist-primary-soft);
  }

  .customer-detail-row strong {
    display: block;
    overflow: hidden;
    color: var(--aorist-ink);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .customer-detail-row em {
    display: block;
    margin-top: 3px;
    color: var(--aorist-muted);
    font-size: 11px;
    font-style: normal;
    font-weight: 700;
  }

  .customer-detail-row p {
    margin-top: 4px;
  }

  .customer-detail-row b {
    display: grid;
    justify-items: end;
    gap: 3px;
    color: var(--aorist-primary);
    font-size: 12px;
    font-weight: 800;
  }

  .customer-detail-row small {
    color: var(--aorist-muted);
    font-size: 10px;
    font-weight: 700;
  }

  .customer-todo-row b,
  .customer-schedule-list .customer-detail-row b {
    padding: 4px 8px;
    border-radius: 999px;
    background: var(--aorist-primary-soft);
  }

  .customer-profile-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 12px;
  }

  .customer-profile-grid article {
    padding: 12px;
    border: 1px solid var(--aorist-line);
    border-radius: 10px;
    background: hsl(220 20% 98%);
  }

  .customer-profile-grid span,
  .customer-detail-aside span {
    display: block;
    color: var(--aorist-muted);
    font-size: 11px;
  }

  .customer-profile-grid strong,
  .customer-detail-aside strong {
    display: block;
    margin-top: 5px;
    color: var(--aorist-ink);
    font-size: 13px;
  }

  .customer-project-list {
    display: grid;
    gap: 8px;
  }

  .customer-project-list button {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) auto;
    width: 100%;
    min-height: 58px;
    text-align: left;
  }

  .customer-project-list button > span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 9px;
    color: var(--aorist-primary);
    background: var(--aorist-primary-soft);
  }

  .customer-project-list strong {
    display: block;
    overflow: hidden;
    color: var(--aorist-ink);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .customer-project-list em,
  .customer-project-list b {
    color: var(--aorist-muted);
    font-size: 11px;
    font-style: normal;
  }

  .customer-risk-card {
    border-color: #fde68a;
    background: #fffbeb;
  }

  .customer-risk-card h3,
  .customer-risk-card > strong {
    color: #b45309;
  }

  .customer-detail-timeline {
    margin-top: 0;
  }

  @media (max-width: 1100px) {
    .management-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .management-controls {
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .project-detail-body {
      grid-template-columns: 1fr;
    }

    .customer-detail-body {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    .management-page {
      padding: 16px;
    }

    .management-stats {
      grid-template-columns: 1fr;
    }

    .management-search {
      max-width: none;
      min-width: 100%;
    }

    .management-card {
      gap: 12px;
      padding: 14px;
    }

    .management-card > b {
      display: none;
    }

    .project-detail-summary,
    .project-detail-metrics {
      grid-template-columns: 1fr;
    }

    .project-detail-modal > .project-detail-head,
    .project-section-head,
    .project-resource-toolbar,
    .customer-detail-modal > .customer-detail-head,
    .customer-section-head,
    .customer-resource-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .project-detail-title,
    .customer-detail-title {
      flex-wrap: wrap;
    }

    .customer-profile-grid {
      grid-template-columns: 1fr;
    }

    .project-detail-card .project-detail-row,
    .customer-detail-row {
      grid-template-columns: 36px minmax(0, 1fr);
    }

    .project-detail-row b,
    .customer-detail-row b {
      justify-items: start;
      grid-column: 2;
    }
  }



  .capability-console {
    display: grid;
    align-content: start;
    gap: 14px;
  }

  .capability-hub-header {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) minmax(260px, 360px) auto;
    align-items: center;
    gap: 14px;
    padding: 16px;
    border: 1px solid var(--aorist-line);
    border-radius: 14px;
    background: hsl(220 20% 99%);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }

  .capability-hub-header__title span,
  .capability-panel header span,
  .capability-catalog-sidebar > span {
    display: block;
    color: var(--aorist-muted);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .capability-hub-header__title strong,
  .capability-panel header strong {
    display: block;
    margin-top: 5px;
    color: var(--aorist-ink);
    font-size: 18px;
    line-height: 1.2;
  }

  .capability-hub-header__title p,
  .capability-panel header p,
  .capability-detail__top p {
    margin: 6px 0 0;
    color: var(--aorist-muted);
    font-size: 13px;
    line-height: 1.6;
  }

  .capability-search {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 38px;
    padding: 0 12px;
    border: 1px solid var(--aorist-line);
    border-radius: 999px;
    background: hsl(0 0% 100%);
    color: var(--aorist-muted);
  }

  .capability-search input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--aorist-ink);
    font-size: 13px;
  }

  .capability-search input::placeholder {
    color: color-mix(in srgb, var(--aorist-muted) 74%, hsl(0 0% 100%));
  }

  .capability-hub-header__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }

  .capability-hub-header__actions button,
  .capability-panel header button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid var(--aorist-line);
    border-radius: 9px;
    background: hsl(0 0% 100%);
    color: var(--aorist-ink);
    font-size: 12px;
    font-weight: 700;
  }

  .capability-hub-header__actions button:last-child,
  .capability-panel header button {
    border-color: var(--aorist-primary);
    background: var(--aorist-primary);
    color: hsl(0 0% 100%);
  }

  .capability-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .capability-stats article {
    padding: 14px;
    border: 1px solid var(--aorist-line);
    border-radius: 12px;
    background: hsl(0 0% 100%);
  }

  .capability-stats span,
  .capability-stats em {
    display: block;
    color: var(--aorist-muted);
    font-size: 12px;
    font-style: normal;
  }

  .capability-stats strong {
    display: block;
    margin-top: 8px;
    color: var(--aorist-ink);
    font-size: 24px;
    letter-spacing: -0.04em;
  }

  .capability-create-tabs {
    width: fit-content;
    margin: 0;
  }

  .capability-hub-shell {
    display: grid;
    grid-template-columns: 190px minmax(0, 1fr);
    gap: 12px;
    min-height: 0;
  }

  .capability-catalog-sidebar,
  .capability-panel {
    min-width: 0;
    padding: 16px;
    border: 1px solid var(--aorist-line);
    border-radius: 14px;
    background: hsl(0 0% 100%);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }

  .capability-catalog-sidebar {
    display: grid;
    align-content: start;
    gap: 8px;
  }

  .capability-catalog-sidebar button {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    gap: 8px 10px;
    width: 100%;
    padding: 10px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: var(--aorist-muted);
    text-align: left;
  }

  .capability-catalog-sidebar button :global(svg) {
    grid-row: span 2;
    margin-top: 2px;
    color: var(--aorist-primary);
  }

  .capability-catalog-sidebar button strong {
    color: var(--aorist-ink);
    font-size: 13px;
  }

  .capability-catalog-sidebar button em {
    color: var(--aorist-muted);
    font-size: 12px;
    font-style: normal;
  }

  .capability-catalog-sidebar button:hover,
  .capability-catalog-sidebar button.active {
    border-color: color-mix(in srgb, var(--aorist-primary) 22%, var(--aorist-line));
    background: hsl(220 70% 98%);
  }

  .capability-catalog-note {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    gap: 8px;
    margin-top: 8px;
    padding: 10px;
    border: 1px dashed var(--aorist-line);
    border-radius: 10px;
    background: hsl(220 20% 98%);
    color: var(--aorist-muted);
  }

  .capability-catalog-note :global(svg) {
    color: var(--aorist-primary);
  }

  .capability-catalog-note p {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
  }

  .capability-panel header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .capability-market {
    display: grid;
    align-content: start;
  }

  .capability-list {
    display: grid;
    gap: 8px;
  }

  .capability-row {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px;
    border: 1px solid var(--aorist-line);
    border-radius: 12px;
    background: hsl(220 20% 99%);
    color: inherit;
    text-align: left;
    transition: border-color 0.16s ease, background 0.16s ease;
  }

  .capability-row:hover,
  .capability-row.active {
    border-color: color-mix(in srgb, var(--aorist-primary) 32%, var(--aorist-line));
    background: hsl(220 70% 98%);
  }

  .capability-row__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    border-radius: 10px;
    color: var(--aorist-primary);
    background: hsl(220 70% 96%);
  }

  .capability-row__body {
    display: grid;
    min-width: 0;
    gap: 5px;
  }

  .capability-title-line {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .capability-title-line strong {
    overflow: hidden;
    color: var(--aorist-ink);
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .capability-title-line b {
    flex: none;
    padding: 2px 6px;
    border-radius: 999px;
    background: hsl(220 20% 94%);
    color: var(--aorist-muted);
    font-size: 10px;
    font-weight: 800;
  }

  .capability-row__body em {
    overflow: hidden;
    color: var(--aorist-muted);
    font-size: 12px;
    font-style: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .capability-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .capability-badges b,
  .capability-state {
    display: inline-flex;
    align-items: center;
    min-height: 20px;
    padding: 0 7px;
    border-radius: 999px;
    background: hsl(220 20% 96%);
    color: var(--aorist-muted);
    font-size: 11px;
    font-style: normal;
    font-weight: 650;
  }

  .capability-state--enabled {
    background: hsl(145 48% 94%);
    color: hsl(150 64% 28%);
  }

  .capability-state--auth {
    background: hsl(42 90% 93%);
    color: hsl(31 80% 32%);
  }

  .capability-state--pending {
    background: hsl(220 20% 94%);
    color: var(--aorist-muted);
  }

  .capability-row__side {
    display: grid;
    justify-items: end;
    gap: 7px;
  }

  .capability-row__action {
    color: var(--aorist-primary);
    font-size: 12px;
    font-weight: 750;
  }

  .capability-empty {
    display: grid;
    justify-items: center;
    gap: 6px;
    min-height: 190px;
    padding: 28px;
    border: 1px dashed var(--aorist-line);
    border-radius: 12px;
    background: hsl(220 20% 98%);
    color: var(--aorist-muted);
    text-align: center;
  }

  .capability-empty strong {
    color: var(--aorist-ink);
    font-size: 14px;
  }

  .capability-empty p {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
  }

  .capability-detail {
    display: grid;
    align-content: start;
    gap: 14px;
  }

  .capability-detail__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }

  .capability-detail__meta b {
    padding: 3px 7px;
    border-radius: 999px;
    background: hsl(220 20% 96%);
    color: var(--aorist-muted);
    font-size: 11px;
  }

  .capability-install-flow,
  .capability-agent-binding {
    display: grid;
    gap: 8px;
  }

  .capability-install-flow header,
  .capability-agent-binding header {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--aorist-ink);
    font-size: 13px;
  }

  .capability-install-flow header :global(svg),
  .capability-agent-binding header :global(svg) {
    color: var(--aorist-primary);
  }

  .capability-install-flow article {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    gap: 10px;
    padding: 9px 10px;
    border: 1px solid var(--aorist-line);
    border-radius: 10px;
    background: hsl(220 20% 98%);
  }

  .capability-install-flow article > span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 999px;
    background: hsl(220 20% 92%);
    color: var(--aorist-muted);
    font-size: 11px;
    font-weight: 800;
  }

  .capability-install-flow article.done > span {
    border-color: var(--aorist-primary);
    background: var(--aorist-primary);
    color: hsl(0 0% 100%);
  }

  .capability-install-flow strong,
  .capability-agent-binding strong {
    color: var(--aorist-ink);
    font-size: 12px;
  }

  .capability-install-flow p {
    margin: 0;
    color: var(--aorist-muted);
    font-size: 12px;
    line-height: 1.45;
  }

  .capability-agent-binding button {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 9px 10px;
    border: 1px solid var(--aorist-line);
    border-radius: 10px;
    background: hsl(0 0% 100%);
    text-align: left;
  }

  .capability-agent-binding button span {
    display: grid;
    gap: 3px;
  }

  .capability-agent-binding em {
    color: var(--aorist-muted);
    font-size: 12px;
    font-style: normal;
  }

  .capability-agent-binding i {
    position: relative;
    display: inline-flex;
    width: 36px;
    height: 20px;
    border: 1px solid var(--aorist-line);
    border-radius: 999px;
    background: hsl(220 20% 92%);
  }

  .capability-agent-binding i u {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 999px;
    background: hsl(0 0% 100%);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.18);
    transition: transform 0.16s ease;
  }

  .capability-agent-binding i.enabled {
    border-color: var(--aorist-primary);
    background: var(--aorist-primary);
  }

  .capability-agent-binding i.enabled u {
    transform: translateX(16px);
  }

  .capability-runtime {
    display: grid;
    gap: 8px;
    margin: 0;
  }

  .capability-runtime div {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 10px;
    padding: 9px 0;
    border-bottom: 1px solid var(--aorist-line);
  }

  .capability-runtime dt {
    color: var(--aorist-muted);
    font-size: 12px;
  }

  .capability-runtime dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--aorist-ink);
    font-size: 12px;
    font-weight: 650;
  }

  .capability-create-modal {
    width: min(760px, calc(100vw - 44px));
  }

  .capability-detail-modal {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    width: min(680px, calc(100vw - 44px));
    max-height: min(760px, calc(100vh - 44px));
  }

  .capability-detail-modal__body {
    overflow: auto;
    padding: 16px;
  }

  @media (max-width: 1080px) {
    .capability-hub-header,
    .capability-hub-shell {
      grid-template-columns: 1fr;
    }

    .capability-hub-header__actions {
      justify-content: flex-start;
    }

    .capability-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .capability-stats {
      grid-template-columns: 1fr;
    }

    .capability-panel header,
    .capability-row {
      grid-template-columns: 1fr;
    }

    .capability-panel header {
      flex-direction: column;
    }

    .capability-row__side {
      justify-items: start;
    }
  }

  .agent-assistant-page {
    padding: 0;
    background:
      radial-gradient(circle at 50% 8%, rgba(37, 99, 235, 0.08), transparent 30%),
      linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(220 20% 98%) 100%);
  }

  .agent-assistant-shell {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 22px;
    min-height: 100%;
    padding: clamp(28px, 6vh, 72px) clamp(18px, 5vw, 56px) 26px;
  }

  .agent-assistant-center {
    display: grid;
    justify-items: center;
    gap: 28px;
    width: min(100%, 840px);
    margin: 0 auto;
  }

  .agent-selector {
    position: relative;
    z-index: 30;
    display: grid;
    justify-items: center;
  }

  .agent-selector__trigger {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: 0;
    border: 0;
    color: var(--aorist-ink);
    background: transparent;
  }

  .agent-selector__trigger:hover {
    opacity: 0.9;
  }

  .agent-selector__avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 66px;
    height: 66px;
    border-radius: 999px;
    color: hsl(0 0% 100%);
    background: linear-gradient(135deg, var(--aorist-primary), var(--aorist-primary-strong));
    box-shadow:
      0 16px 36px rgba(37, 99, 235, 0.18),
      inset 0 0 0 1px rgba(255, 255, 255, 0.3);
  }

  .agent-selector__label {
    display: grid;
    justify-items: center;
    gap: 2px;
  }

  .agent-selector__label strong {
    color: var(--aorist-ink);
    font-size: 19px;
    font-weight: 760;
    letter-spacing: -0.025em;
  }

  .agent-selector__label em {
    color: var(--aorist-muted);
    font-size: 11px;
    font-style: normal;
    font-weight: 700;
  }

  .agent-selector__trigger > :global(svg) {
    color: var(--aorist-muted);
    transition: transform 0.16s ease;
  }

  .agent-selector__trigger > :global(svg.is-open) {
    transform: rotate(180deg);
  }

  .agent-selector__scrim {
    position: fixed;
    inset: 0;
    z-index: 10;
    border: 0;
    background: transparent;
  }

  .agent-selector__menu {
    position: absolute;
    top: calc(100% + 10px);
    left: 50%;
    z-index: 20;
    display: grid;
    gap: 2px;
    width: min(320px, calc(100vw - 64px));
    max-height: 280px;
    overflow: auto;
    padding: 6px;
    border: 1px solid var(--aorist-line);
    border-radius: 16px;
    background: hsl(0 0% 100%);
    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
    transform: translateX(-50%);
  }

  .agent-selector__menu button {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) 18px;
    align-items: center;
    gap: 10px;
    min-height: 58px;
    padding: 9px 10px;
    border: 0;
    border-radius: 12px;
    color: var(--aorist-muted);
    background: transparent;
    text-align: left;
  }

  .agent-selector__menu button:hover,
  .agent-selector__menu button.active {
    color: var(--aorist-ink);
    background: hsl(220 20% 96%);
  }

  .agent-selector__menu button > span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    color: var(--aorist-primary);
    background: hsl(220 70% 96%);
  }

  .agent-selector__menu strong {
    display: block;
    color: inherit;
    font-size: 12px;
  }

  .agent-selector__menu em {
    display: block;
    overflow: hidden;
    margin-top: 2px;
    color: var(--aorist-muted);
    font-size: 10px;
    font-style: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .agent-quick-tasks {
    width: 100%;
  }

  .agent-quick-tasks > p {
    margin: 0 0 12px;
    color: var(--aorist-muted);
    font-size: 12px;
    text-align: center;
  }

  .agent-quick-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .agent-quick-grid button {
    display: grid;
    align-content: start;
    gap: 8px;
    min-height: 136px;
    padding: 16px;
    border: 1px solid var(--aorist-line);
    border-radius: 18px;
    color: var(--aorist-muted);
    background: hsl(0 0% 100%);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    text-align: left;
    transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease;
  }

  .agent-quick-grid button:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--aorist-primary) 34%, var(--aorist-line));
    background: hsl(220 20% 98%);
  }

  .agent-quick-grid span {
    color: var(--aorist-primary);
    font-size: 11px;
    font-weight: 700;
  }

  .agent-quick-grid strong {
    color: var(--aorist-ink);
    font-size: 14px;
  }

  .agent-quick-grid em {
    display: -webkit-box;
    overflow: hidden;
    color: var(--aorist-muted);
    font-size: 12px;
    font-style: normal;
    line-height: 1.55;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .agent-compose-card {
    width: min(100%, 780px);
    margin: 0 auto;
  }

  .agent-compose-card :global(.composer) {
    border: 1px solid var(--aorist-line);
    border-radius: 18px;
    background: hsl(0 0% 100%);
    box-shadow: 0 18px 46px rgba(15, 23, 42, 0.08);
  }

  .agent-compose-card :global(.composer textarea) {
    min-height: 46px;
    color: var(--aorist-ink);
    font-size: 14px;
  }

  .agent-compose-card :global(.composer__toolbar) {
    align-items: center;
    border-top-color: var(--aorist-line);
  }

  .agent-compose-card :global(.composer__tools),
  .agent-compose-card :global(.composer__actions) {
    gap: 6px;
  }

  .agent-compose-card :global(.composer__tools button),
  .agent-compose-card :global(.composer__link-picker),
  .agent-compose-card :global(.composer__model) {
    border-radius: 10px;
    background: hsl(220 20% 96%);
  }

  .agent-compose-card :global(.composer__submit) {
    color: hsl(0 0% 100%);
    background: var(--aorist-primary);
  }

  .agent-assistant-disclaimer {
    margin: -4px 0 0;
    color: color-mix(in srgb, var(--aorist-muted) 72%, transparent);
    font-size: 10px;
    text-align: center;
  }

  @media (max-width: 760px) {
    .agent-assistant-shell {
      justify-content: flex-start;
      padding-top: 34px;
    }

    .agent-quick-grid {
      grid-template-columns: 1fr;
    }

    .agent-quick-grid button {
      min-height: 0;
    }
  }


  .team-collab-page {
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 24px;
    background:
      radial-gradient(circle at 12% 0%, rgba(37, 99, 235, 0.09), transparent 30%),
      radial-gradient(circle at 88% 8%, rgba(14, 165, 233, 0.08), transparent 28%),
      hsl(220 20% 98%);
  }

  .team-page-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 22px;
  }

  .team-page-head h1 {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0;
    color: var(--aorist-ink);
    font-size: clamp(26px, 3vw, 34px);
    line-height: 1.05;
    letter-spacing: -0.045em;
  }

  .team-page-head h1 :global(svg) {
    color: var(--aorist-primary);
  }

  .team-page-head p {
    max-width: 660px;
    margin: 10px 0 0;
    color: var(--aorist-muted);
    font-size: 14px;
    line-height: 1.7;
  }

  .team-head-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 10px;
  }

  .team-view-switch {
    display: inline-flex;
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--aorist-line);
    border-radius: 12px;
    background: hsl(0 0% 100%);
  }

  .team-view-switch button,
  .team-primary,
  .team-office-toolbar button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 36px;
    padding: 0 12px;
    border: 0;
    border-radius: 9px;
    color: var(--aorist-muted);
    background: transparent;
    font-size: 12px;
    font-weight: 750;
  }

  .team-view-switch button.active,
  .team-primary {
    color: hsl(0 0% 100%);
    background: var(--aorist-primary);
  }

  .team-primary {
    border: 1px solid var(--aorist-primary);
    box-shadow: 0 10px 22px rgba(37, 99, 235, 0.14);
  }

  .team-card-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
  }

  .team-list-card {
    display: flex;
    flex-direction: column;
    min-height: 230px;
    padding: 20px;
    border: 1px solid var(--aorist-line);
    border-radius: 18px;
    background: hsl(0 0% 100%);
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.055);
    cursor: pointer;
    transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
  }

  .team-list-card:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--aorist-primary) 28%, var(--aorist-line));
    box-shadow: 0 18px 42px rgba(15, 23, 42, 0.08);
  }

  .team-list-card header,
  .team-list-card footer,
  .team-card-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .team-list-card header > span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 14px;
    color: var(--aorist-primary);
    background: hsl(220 70% 96%);
  }

  .team-card-actions {
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.16s ease;
  }

  .team-list-card:hover .team-card-actions,
  .team-list-card:focus-within .team-card-actions {
    opacity: 1;
  }

  .team-card-actions button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 9px;
    color: var(--aorist-muted);
    background: transparent;
  }

  .team-card-actions button:hover {
    color: var(--aorist-primary);
    background: hsl(220 20% 96%);
  }

  .team-list-card main {
    margin-top: auto;
  }

  .team-list-card main strong {
    display: block;
    color: var(--aorist-ink);
    font-size: 18px;
  }

  .team-list-card main p {
    margin: 9px 0 0;
    color: var(--aorist-muted);
    font-size: 13px;
    line-height: 1.65;
  }

  .team-list-card footer {
    margin-top: 18px;
    color: var(--aorist-muted);
    font-size: 12px;
  }

  .team-avatar-stack {
    display: flex;
    align-items: center;
    margin-right: 4px;
  }

  .team-avatar-stack i {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    margin-right: -8px;
    border: 2px solid hsl(0 0% 100%);
    border-radius: 999px;
    color: var(--aorist-primary);
    background: hsl(220 70% 96%);
    font-size: 12px;
    font-style: normal;
    font-weight: 800;
  }

  .team-card-meta {
    margin-top: 14px;
    color: var(--aorist-muted);
    font-size: 11px;
  }

  .team-card-meta em,
  .team-card-meta b {
    font-style: normal;
    font-weight: 700;
  }

  .team-card-meta b {
    color: var(--aorist-primary);
  }

  .team-card-meta button {
    min-height: 28px;
    padding: 0 10px;
    border: 1px solid var(--aorist-primary);
    border-radius: 999px;
    color: hsl(0 0% 100%);
    background: var(--aorist-primary);
    font-size: 11px;
    font-weight: 750;
  }

  .team-chat-shell {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    min-height: min(760px, calc(100vh - 136px));
    overflow: hidden;
    border: 1px solid var(--aorist-line);
    border-radius: 18px;
    background: hsl(0 0% 100%);
    box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
  }

  .team-chat-header {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 64px;
    padding: 12px 20px;
    border-bottom: 1px solid var(--aorist-line);
    background: hsl(220 20% 98% / 0.92);
    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.04);
  }

  .team-chat-title,
  .team-member-bar,
  .team-member-bar span,
  .team-message header b {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .team-chat-title button,
  .team-chat-title > span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 999px;
    color: var(--aorist-muted);
    background: transparent;
  }

  .team-chat-title > span {
    border-radius: 10px;
    color: var(--aorist-primary);
    background: hsl(220 70% 96%);
  }

  .team-chat-title button:hover {
    color: var(--aorist-primary);
    background: hsl(220 20% 94%);
  }

  .team-chat-title strong {
    color: var(--aorist-ink);
    font-size: 14px;
  }

  .team-member-bar {
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 7px;
  }

  .team-member-bar span {
    min-height: 28px;
    padding: 4px 8px;
    border-radius: 8px;
    color: var(--aorist-ink);
    background: hsl(220 20% 96%);
    font-size: 11px;
    font-weight: 750;
  }

  .team-member-bar span.leader {
    color: hsl(39 90% 34%);
    background: hsl(45 94% 94%);
  }

  .team-member-bar i {
    display: inline-flex;
    color: var(--aorist-primary);
    font-style: normal;
  }

  .team-member-bar b {
    color: hsl(39 90% 38%);
    font-size: 9px;
    font-weight: 800;
  }

  .team-message-list {
    display: grid;
    align-content: start;
    gap: 22px;
    overflow: auto;
    padding: 32px max(18px, calc((100% - 760px) / 2));
    background:
      radial-gradient(circle at 20% 12%, rgba(37, 99, 235, 0.05), transparent 28%),
      hsl(0 0% 100%);
  }

  .team-chat-empty {
    display: grid;
    justify-items: center;
    gap: 10px;
    padding: 64px 16px;
    color: var(--aorist-muted);
    text-align: center;
  }

  .team-chat-empty div {
    display: flex;
    margin-bottom: 8px;
  }

  .team-chat-empty div span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 54px;
    height: 54px;
    margin-right: -12px;
    border: 4px solid hsl(0 0% 100%);
    border-radius: 999px;
    color: hsl(0 0% 100%);
    background: linear-gradient(135deg, var(--aorist-primary), hsl(217 91% 60%));
    box-shadow: 0 10px 26px rgba(37, 99, 235, 0.18);
  }

  .team-chat-empty strong {
    color: var(--aorist-ink);
    font-size: 16px;
  }

  .team-chat-empty p {
    max-width: 360px;
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
  }

  .team-message {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .team-message.user {
    flex-direction: row-reverse;
  }

  .team-message > span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    border-radius: 12px;
    color: hsl(0 0% 100%);
    background: linear-gradient(135deg, var(--aorist-primary), hsl(217 91% 60%));
  }

  .team-message.user > span {
    background: var(--aorist-primary);
  }

  .team-message > div {
    max-width: min(75%, 620px);
  }

  .team-message.user > div {
    text-align: right;
  }

  .team-message header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 6px 4px;
    color: var(--aorist-muted);
    font-size: 11px;
    font-weight: 750;
  }

  .team-message header b {
    padding: 2px 6px;
    border-radius: 6px;
    color: hsl(39 90% 38%);
    background: hsl(45 94% 94%);
    font-size: 9px;
  }

  .team-message p {
    margin: 0;
    padding: 12px 15px;
    border: 1px solid var(--aorist-line);
    border-radius: 18px;
    color: var(--aorist-ink);
    background: hsl(220 20% 97%);
    font-size: 13px;
    line-height: 1.7;
    white-space: pre-wrap;
  }

  .team-message.user p {
    border-color: var(--aorist-primary);
    color: hsl(0 0% 100%);
    background: var(--aorist-primary);
  }

  .team-message--loading > span {
    color: var(--aorist-primary);
    background: hsl(220 20% 96%);
    animation: team-spin 0.9s linear infinite;
  }

  .team-message--loading p {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--aorist-muted);
  }

  .team-compose-bar {
    display: grid;
    gap: 8px;
    padding: 12px max(18px, calc((100% - 820px) / 2)) 16px;
    border-top: 1px solid var(--aorist-line);
    background: hsl(0 0% 100%);
  }

  .team-attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .team-attachments button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 28px;
    padding: 0 9px;
    border: 1px solid var(--aorist-line);
    border-radius: 999px;
    color: var(--aorist-muted);
    background: hsl(220 20% 98%);
    font-size: 11px;
  }

  .team-compose-row {
    display: grid;
    grid-template-columns: 36px 150px minmax(0, 1fr) auto;
    align-items: end;
    gap: 8px;
  }

  .team-compose-row > button:not(.team-send) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: 1px solid var(--aorist-line);
    border-radius: 12px;
    color: var(--aorist-muted);
    background: hsl(220 20% 98%);
  }

  .team-compose-row select,
  .team-compose-row textarea {
    border: 1px solid var(--aorist-line);
    border-radius: 12px;
    color: var(--aorist-ink);
    background: hsl(220 20% 98%);
    outline: none;
  }

  .team-compose-row select {
    height: 36px;
    padding: 0 10px;
    font-size: 12px;
  }

  .team-compose-row textarea {
    min-height: 36px;
    max-height: 120px;
    padding: 9px 12px;
    resize: vertical;
    font: inherit;
    font-size: 13px;
  }

  .team-send {
    min-height: 36px;
    padding: 0 15px;
    border: 1px solid var(--aorist-primary);
    border-radius: 12px;
    color: hsl(0 0% 100%);
    background: var(--aorist-primary);
    font-size: 12px;
    font-weight: 800;
  }

  .team-send:disabled {
    opacity: 0.48;
    cursor: not-allowed;
  }

  @keyframes team-spin {
    to { transform: rotate(360deg); }
  }

  .team-empty-state {
    grid-column: 1 / -1;
    display: grid;
    justify-items: center;
    gap: 12px;
    padding: 56px 20px;
    border: 2px dashed var(--aorist-line);
    border-radius: 18px;
    color: var(--aorist-muted);
    background: hsl(0 0% 100% / 0.66);
  }

  .team-empty-state button {
    border: 0;
    color: var(--aorist-primary);
    background: transparent;
    font-weight: 750;
  }

  .team-office-shell {
    display: grid;
    gap: 12px;
    padding: 14px;
    border: 1px solid hsl(220 20% 16%);
    border-radius: 22px;
    background: hsl(220 28% 6%);
    box-shadow: 0 24px 64px rgba(15, 23, 42, 0.18);
  }

  .team-office-toolbar {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .team-office-toolbar select,
  .team-office-toolbar button {
    height: 32px;
    border: 1px solid hsl(0 0% 100% / 0.12);
    border-radius: 10px;
    color: hsl(210 20% 92%);
    background: hsl(0 0% 100% / 0.06);
  }

  .team-office-toolbar select {
    padding: 0 10px;
    outline: none;
  }

  .team-office-stage {
    position: relative;
    overflow: hidden;
    min-height: 480px;
    padding: 22px;
    border-radius: 18px;
    background:
      linear-gradient(90deg, hsl(0 0% 100% / 0.05) 1px, transparent 1px),
      linear-gradient(hsl(0 0% 100% / 0.05) 1px, transparent 1px),
      radial-gradient(circle at 18% 18%, hsl(214 100% 62% / 0.18), transparent 28%),
      hsl(222 30% 10%);
    background-size: 54px 54px, 54px 54px, auto, auto;
  }

  .team-office-status,
  .team-office-memo {
    width: min(360px, 100%);
    padding: 14px;
    border: 1px solid hsl(0 0% 100% / 0.1);
    border-radius: 16px;
    color: hsl(210 20% 92%);
    background: hsl(0 0% 100% / 0.07);
    backdrop-filter: blur(12px);
  }

  .team-office-status span {
    display: inline-flex;
    margin-bottom: 8px;
    padding: 4px 8px;
    border-radius: 999px;
    color: hsl(213 94% 68%);
    background: hsl(213 94% 68% / 0.14);
    font-size: 11px;
  }

  .team-office-status strong,
  .team-office-memo strong {
    display: block;
    font-size: 16px;
  }

  .team-office-status p,
  .team-office-memo p {
    margin: 8px 0 0;
    color: hsl(215 20% 72%);
    font-size: 12px;
    line-height: 1.6;
  }

  .team-run-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin-top: 12px;
  }

  .team-run-summary article,
  .team-run-steps article,
  .team-run-timeline article {
    border: 1px solid hsl(0 0% 100% / 0.1);
    border-radius: 13px;
    color: hsl(210 20% 92%);
    background: hsl(0 0% 100% / 0.06);
  }

  .team-run-summary article {
    min-height: 64px;
    padding: 10px 12px;
  }

  .team-run-summary span,
  .team-run-steps span,
  .team-run-timeline span {
    display: block;
    color: hsl(215 20% 72%);
    font-size: 11px;
  }

  .team-run-summary strong {
    display: block;
    margin-top: 6px;
    overflow: hidden;
    color: hsl(210 20% 94%);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .team-office-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    margin: 28px 0;
  }

  .team-office-grid article {
    min-height: 150px;
    padding: 16px;
    border: 1px solid hsl(0 0% 100% / 0.1);
    border-radius: 18px;
    color: hsl(210 20% 92%);
    background: linear-gradient(180deg, hsl(0 0% 100% / 0.09), hsl(0 0% 100% / 0.04));
  }

  .team-office-grid article.leader {
    border-color: hsl(45 93% 58% / 0.34);
    background: linear-gradient(180deg, hsl(45 93% 58% / 0.13), hsl(0 0% 100% / 0.05));
  }

  .team-office-grid article > span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    margin-bottom: 12px;
    border-radius: 12px;
    color: hsl(0 0% 100%);
    background: var(--aorist-primary);
  }

  .team-office-grid strong,
  .team-office-grid em {
    display: block;
  }

  .team-office-grid em {
    margin-top: 4px;
    color: hsl(213 94% 68%);
    font-size: 11px;
    font-style: normal;
  }

  .team-office-grid p {
    margin: 10px 0 0;
    color: hsl(215 20% 72%);
    font-size: 12px;
    line-height: 1.5;
  }

  .team-run-steps,
  .team-run-timeline {
    display: grid;
    gap: 8px;
    margin-top: 12px;
  }

  .team-run-steps header,
  .team-run-timeline header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: hsl(210 20% 92%);
  }

  .team-run-steps header strong,
  .team-run-timeline header strong {
    font-size: 14px;
  }

  .team-run-steps header span,
  .team-run-timeline header span {
    padding: 3px 8px;
    border-radius: 999px;
    color: hsl(213 94% 78%);
    background: hsl(213 94% 68% / 0.14);
  }

  .team-run-steps article,
  .team-run-timeline article {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr) minmax(120px, auto);
    gap: 12px;
    align-items: center;
    min-height: 58px;
    padding: 10px 12px;
  }

  .team-run-steps b,
  .team-run-timeline b {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 24px;
    padding: 0 8px;
    border-radius: 999px;
    color: hsl(213 94% 78%);
    background: hsl(213 94% 68% / 0.14);
    font-size: 11px;
  }

  .team-run-steps strong,
  .team-run-timeline strong {
    color: hsl(210 20% 94%);
    font-size: 13px;
  }

  .team-run-steps p,
  .team-run-timeline p {
    margin: 3px 0 0;
    color: hsl(215 20% 72%);
    font-size: 12px;
    line-height: 1.45;
  }

  .team-run-footer {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 8px;
    margin-top: 8px;
  }

  .team-run-footer section {
    padding: 12px;
    border: 1px solid hsl(0 0% 100% / 0.1);
    border-radius: 13px;
    background: hsl(0 0% 100% / 0.06);
  }

  .team-run-footer strong {
    display: block;
    margin-bottom: 9px;
    color: hsl(210 20% 94%);
    font-size: 13px;
  }

  .team-run-footer div {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .team-run-footer button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 26px;
    padding: 0 9px;
    border: 1px solid hsl(0 0% 100% / 0.12);
    border-radius: 999px;
    color: hsl(210 20% 86%);
    background: hsl(0 0% 100% / 0.07);
    font-size: 11px;
    font-weight: 700;
  }

  .team-run-footer button:disabled {
    cursor: not-allowed;
    opacity: 0.62;
  }

  .team-run-footer button:not(:disabled):hover {
    border-color: hsl(213 94% 68% / 0.4);
    color: hsl(210 20% 96%);
    background: hsl(213 94% 68% / 0.16);
  }

  .team-run-footer button em {
    color: hsl(215 20% 72%);
    font-size: 10px;
    font-style: normal;
  }

  .team-modal {
    display: flex;
    flex-direction: column;
    width: min(680px, calc(100vw - 44px));
    max-height: min(80vh, 720px);
    padding: 0;
  }

  .team-modal header {
    padding: 18px 22px 12px;
  }

  .team-modal header p {
    max-width: 520px;
    margin: 5px 0 0;
    color: var(--aorist-muted);
    font-size: 12px;
    line-height: 1.55;
  }

  .team-modal footer {
    margin: 0;
    padding: 12px 22px 16px;
    border-top: 1px solid var(--aorist-line);
  }

  .team-modal .team-builder {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 0 22px 16px;
  }

  .team-builder {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 220px;
    gap: 16px;
    margin-top: 16px;
    min-height: 420px;
  }

  .team-builder section,
  .team-builder aside {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .team-builder-search {
    position: relative;
    display: block;
    margin-bottom: 12px;
  }

  .team-builder-search :global(svg) {
    position: absolute;
    top: 50%;
    left: 12px;
    color: var(--aorist-muted);
    transform: translateY(-50%);
  }

  .team-builder-search input,
  .team-builder aside input {
    width: 100%;
    height: 38px;
    border: 1px solid var(--aorist-line);
    border-radius: 12px;
    color: var(--aorist-ink);
    background: hsl(220 20% 98%);
    outline: none;
  }

  .team-builder-search input {
    padding: 0 12px 0 38px;
  }

  .team-builder aside input {
    padding: 0 10px;
  }

  .team-builder section > span,
  .team-builder aside > span,
  .team-builder aside label {
    color: var(--aorist-muted);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .team-builder-list,
  .team-selected-list {
    display: grid;
    align-content: start;
    gap: 7px;
    overflow: auto;
    margin-top: 8px;
    padding-right: 4px;
  }

  .team-builder-list {
    max-height: 340px;
  }

  .team-selected-list {
    max-height: 280px;
  }

  .team-builder-agent {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) 28px;
    align-items: center;
    gap: 10px;
    min-height: 58px;
    padding: 9px;
    border: 1px solid var(--aorist-line);
    border-radius: 14px;
    color: var(--aorist-muted);
    background: hsl(0 0% 100%);
  }

  .team-builder-agent.active {
    border-color: hsl(152 70% 38% / 0.36);
    background: hsl(152 70% 96%);
  }

  .team-builder-list i,
  .team-selected-member i {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 999px;
    color: hsl(0 0% 100%);
    background: var(--aorist-primary);
    font-style: normal;
  }

  .team-selected-member i {
    width: 26px;
    height: 26px;
    border-radius: 8px;
  }

  .team-builder-list strong,
  .team-selected-list strong {
    display: block;
    color: var(--aorist-ink);
    font-size: 13px;
  }

  .team-builder-list em {
    display: block;
    overflow: hidden;
    margin-top: 3px;
    color: var(--aorist-muted);
    font-size: 11px;
    font-style: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .team-builder-agent button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: 999px;
    color: hsl(152 70% 34%);
    background: hsl(152 70% 94%);
    font-size: 16px;
    font-weight: 800;
  }

  .team-selected-member {
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr) 24px 24px;
    align-items: center;
    gap: 7px;
    padding: 7px;
    border-radius: 10px;
    background: hsl(220 20% 96%);
  }

  .team-selected-member strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .team-leader-button,
  .team-remove-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: 0;
    border-radius: 7px;
    color: var(--aorist-muted);
    background: transparent;
  }

  .team-leader-button.active {
    color: hsl(39 90% 38%);
    background: hsl(45 94% 91%);
  }

  .team-remove-button:hover {
    color: hsl(0 84% 55%);
    background: hsl(0 84% 95%);
  }

  .team-selected-list p,
  .team-builder-list p {
    margin: 0;
    padding: 16px;
    color: var(--aorist-muted);
    font-size: 12px;
    text-align: center;
  }

  .team-builder aside label {
    display: grid;
    gap: 7px;
    margin-top: auto;
  }

  @media (max-width: 980px) {
    .team-page-head {
      flex-direction: column;
    }

    .team-head-actions {
      justify-content: flex-start;
    }

    .team-card-grid,
    .team-office-grid,
    .team-run-summary,
    .team-run-footer {
      grid-template-columns: 1fr;
    }

    .team-run-steps article,
    .team-run-timeline article {
      grid-template-columns: 1fr;
      align-items: start;
    }

    .team-chat-header {
      align-items: flex-start;
      flex-direction: column;
    }

    .team-member-bar {
      justify-content: flex-start;
    }

    .team-message > div {
      max-width: 86%;
    }

    .team-compose-row {
      grid-template-columns: 36px 1fr auto;
    }

    .team-compose-row select {
      grid-column: 2 / -1;
      grid-row: 1;
    }

    .team-compose-row textarea {
      grid-column: 1 / 3;
      grid-row: 2;
    }

    .team-compose-row .team-send {
      grid-column: 3;
      grid-row: 2;
    }

    .team-builder {
      grid-template-columns: 1fr;
    }
  }

  .shell {
    --sidebar-width: 236px;
    --aorist-primary: hsl(219 72% 48%);
    --aorist-primary-strong: hsl(222 70% 40%);
    --aorist-primary-soft: hsl(218 80% 96%);
    --aorist-ink: hsl(224 32% 12%);
    --aorist-muted: hsl(220 12% 42%);
    --aorist-faint: hsl(220 10% 62%);
    --aorist-line: hsl(220 22% 88%);
    --aorist-line-strong: hsl(220 24% 82%);
    --aorist-sidebar: hsl(218 26% 97%);
    --aorist-sidebar-hover: hsl(217 28% 93%);
    --aorist-sidebar-active: hsl(218 80% 95%);
    --aorist-card-bg: hsl(0 0% 100%);
    --aorist-page-bg: hsl(216 30% 97%);
    background: var(--aorist-sidebar);
  }

  .stage {
    padding: 10px 10px 10px 0;
    background: var(--aorist-sidebar);
  }

  .stage__surface {
    height: calc(100vh - 20px);
    overflow: hidden;
    border: 1px solid var(--aorist-line);
    border-radius: 14px;
    background: var(--aorist-card-bg);
    box-shadow: 0 18px 48px rgba(15, 23, 42, 0.07);
  }

  .sidebar--aorist {
    background: var(--aorist-sidebar);
  }

  .sidebar__brand {
    grid-template-columns: 26px minmax(0, 1fr) 28px;
    min-height: 60px;
    padding: 0 14px;
    background: color-mix(in srgb, var(--aorist-sidebar) 86%, white);
  }

  .sidebar__brand strong {
    font-size: 15px;
  }

  .brand-mode-switch {
    min-width: 50px;
    height: 30px;
    border-color: var(--aorist-line);
    background: var(--aorist-card-bg);
  }

  .workspace-nav {
    padding: 10px 0 12px;
  }

  .workspace-nav h2 {
    padding: 8px 14px 6px;
    color: var(--aorist-faint);
    font-size: 10px;
    font-weight: 750;
  }

  .workspace-nav button {
    width: calc(100% - 18px);
    min-height: 38px;
    margin-inline: 9px;
    border-radius: 10px;
    color: var(--aorist-muted);
  }

  .workspace-nav button:hover {
    background: var(--aorist-sidebar-hover);
  }

  .workspace-nav button.active {
    color: var(--aorist-primary-strong);
    background: var(--aorist-sidebar-active);
  }

  .workspace-nav button em,
  .sidebar__user em {
    background: hsl(218 28% 92%);
    color: var(--aorist-muted);
  }

  .sidebar__user-wrap {
    background: color-mix(in srgb, var(--aorist-sidebar) 88%, white);
  }

  .sidebar__user-wrap .sidebar__user:hover,
  .user-menu button:hover {
    background: var(--aorist-sidebar-hover);
  }

  .stage-topbar,
  .conversation-header {
    min-height: 58px;
    padding-inline: 24px;
    background: color-mix(in srgb, white 92%, var(--aorist-page-bg));
  }

  .hero-panel button,
  .aorist-toolbar button,
  .project-detail-actions button,
  .project-detail-card button,
  .project-detail-aside button,
  .team-view-switch button,
  .team-primary,
  .management-primary,
  .team-card-meta button {
    min-height: 34px;
    border-radius: 9px;
  }

  .hero-panel button:first-child,
  .aorist-toolbar button:last-child,
  .project-detail-actions button:last-child,
  .project-detail-card button,
  .project-detail-aside button,
  .management-primary,
  .team-primary,
  .team-card-meta button {
    border-color: var(--aorist-primary);
    background: var(--aorist-primary);
    color: white;
  }

  .hero-panel button:hover,
  .project-detail-actions button:hover,
  .project-detail-card button:hover,
  .project-detail-aside button:hover,
  .team-card-meta button:hover {
    background: hsl(217 30% 94%);
  }

  .hero-panel button:first-child:hover,
  .project-detail-actions button:last-child:hover,
  .project-detail-card button:hover,
  .project-detail-aside button:hover,
  .team-primary:hover,
  .management-primary:hover,
  .team-card-meta button:hover {
    background: var(--aorist-primary-strong);
    color: white;
  }

  .aorist-page,
  .team-collab-page {
    padding: 22px;
    background: var(--aorist-page-bg);
  }

  .hero-panel {
    position: relative;
    padding: 18px 280px 18px 20px;
    border: 1px solid var(--aorist-line);
    border-radius: 14px;
    background: var(--aorist-card-bg);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }

  .hero-panel h1 {
    max-width: 720px;
    margin: 7px 0;
    font-size: 30px;
    line-height: 1.12;
  }

  .hero-panel p {
    max-width: 760px;
    margin-bottom: 0;
    font-size: 13px;
    line-height: 1.65;
  }

  .hero-panel > div {
    position: absolute;
    right: 20px;
    bottom: 18px;
    justify-content: flex-end;
  }

  .aorist-stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin-top: 14px;
  }

  .aorist-stats article,
  .management-stats article,
  .aorist-card,
  .management-card,
  .team-list-card,
  .team-chat-shell,
  .detail-panel,
  .knowledge-preview,
  :global(.task-composer-card) {
    border-color: var(--aorist-line);
    border-radius: 13px;
    background: var(--aorist-card-bg);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    backdrop-filter: none;
  }

  .aorist-stats article {
    min-height: 92px;
    padding: 14px 16px;
  }

  .aorist-stats span,
  .aorist-stats em {
    font-size: 12px;
  }

  .aorist-stats strong {
    margin: 5px 0 2px;
    font-size: 26px;
  }

  .aorist-split,
  .workbench-grid {
    gap: 14px;
    margin-top: 14px;
  }

  .workbench-grid {
    grid-template-columns: minmax(300px, 1fr) minmax(300px, 1fr) minmax(286px, 0.78fr);
  }

  .aorist-card {
    padding: 16px;
  }

  .aorist-card header {
    min-height: 30px;
    margin-bottom: 8px;
  }

  .todo-row,
  .automation-row {
    min-height: 58px;
    margin-top: 8px;
    padding: 10px 12px;
    border-color: hsl(220 22% 91%);
    border-radius: 10px;
    background: hsl(216 30% 98%);
  }

  .todo-row b,
  .automation-row b {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    background: var(--aorist-primary-soft);
    color: var(--aorist-primary-strong);
    font-weight: 750;
  }

  .calendar-mini-grid {
    gap: 5px;
  }

  .calendar-mini-grid article {
    min-height: 42px;
    border-color: hsl(220 22% 91%);
    background: hsl(216 30% 98%);
  }

  .team-page-head {
    border-color: var(--aorist-line);
    border-radius: 14px;
    background: var(--aorist-card-bg);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }

  .team-page-head {
    padding: 18px 20px;
    margin-bottom: 16px;
  }

  .team-page-head h1 {
    font-size: 28px;
    line-height: 1.12;
  }

  .management-stats {
    gap: 10px;
  }

  .management-stats article {
    min-height: 88px;
    padding: 14px;
  }

  .management-stats article > :global(svg) {
    width: 32px;
    height: 32px;
    padding: 8px;
    border-radius: 9px;
    background: var(--aorist-primary-soft);
  }

  .management-controls {
    gap: 10px;
  }

  .management-search input,
  .team-builder-search input,
  .team-builder aside input,
  .aorist-search input {
    border-color: var(--aorist-line);
    background: var(--aorist-card-bg);
  }

  .project-list-panel {
    gap: 9px;
  }

  .project-progress-line {
    background: hsl(220 20% 92%);
  }

  .project-progress-line i {
    background: var(--aorist-primary);
  }

  .management-badges span,
  .management-badges em {
    background: hsl(218 28% 94%);
    color: var(--aorist-muted);
  }

  .management-badges span:nth-child(2) {
    background: var(--aorist-primary-soft);
    color: var(--aorist-primary-strong);
  }

  .team-collab-page {
    gap: 0;
  }

  .team-card-grid {
    grid-template-columns: repeat(auto-fit, minmax(282px, 1fr));
    gap: 14px;
  }

  .team-list-card {
    min-height: 214px;
    padding: 18px;
  }

  .team-list-card header > span {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    background: var(--aorist-primary-soft);
  }

  .team-view-switch {
    border-color: var(--aorist-line);
    background: hsl(216 30% 97%);
  }

  .team-view-switch button.active {
    background: var(--aorist-primary);
    color: white;
  }

  .team-chat-shell {
    min-height: min(720px, calc(100vh - 142px));
  }

  button:focus-visible,
  input:focus-visible,
  textarea:focus-visible,
  select:focus-visible,
  [role="button"]:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--aorist-primary) 42%, transparent);
    outline-offset: 2px;
  }

  @media (max-width: 1100px) {
    .aorist-stats,
    .management-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .workbench-grid,
    .project-detail-body {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 720px) {
    .shell {
      --sidebar-width: 220px;
      grid-template-columns: 1fr;
    }

    .sidebar {
      display: none;
    }

    .stage {
      padding: 0;
    }

    .stage__surface {
      height: 100vh;
      border: 0;
      border-radius: 0;
    }

    .aorist-page,
    .team-collab-page {
      padding: 16px;
    }

    .project-detail-modal > .project-detail-head {
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .project-detail-title {
      flex: 1 1 calc(100% - 48px);
    }

    .project-detail-actions {
      width: 100%;
      justify-content: flex-start;
    }

    .project-detail-actions button {
      flex: 1 1 150px;
    }

    .hero-panel {
      padding: 16px;
    }

    .hero-panel h1 {
      font-size: 25px;
      line-height: 1.18;
      letter-spacing: -0.03em;
    }

    .hero-panel > div {
      position: static;
      justify-content: flex-start;
      margin-top: 14px;
    }

    .aorist-stats,
    .management-stats,
    .team-card-grid {
      grid-template-columns: 1fr;
    }
  }

  /* AoristLawer 1:1 final alignment: sourced from E:\workspace\aoristlawer\apps\desktop\src. */
  .shell {
    --sidebar-width: 220px;
    --content-width: min(960px, calc(100vw - var(--sidebar-width) - 72px));
    --document-width: min(900px, calc(100vw - var(--sidebar-width) - 72px));
    --aorist-primary: hsl(220 70% 50%);
    --aorist-primary-strong: hsl(220 70% 46%);
    --aorist-primary-soft: hsl(220 70% 96%);
    --aorist-primary-softer: hsl(220 70% 98%);
    --aorist-ink: hsl(220 30% 10%);
    --aorist-muted: hsl(220 10% 46%);
    --aorist-faint: hsl(220 10% 62%);
    --aorist-line: hsl(220 20% 90%);
    --aorist-line-strong: hsl(220 20% 86%);
    --aorist-border-divider: hsl(220 20% 90%);
    --aorist-card-bg: hsl(0 0% 100%);
    --aorist-card-bg-soft: hsl(220 20% 96%);
    --aorist-page-bg: hsl(0 0% 100%);
    --aorist-sidebar: hsl(220 20% 98%);
    --aorist-sidebar-hover: hsl(220 20% 94%);
    --aorist-sidebar-active: hsl(220 20% 90%);
    --aorist-shadow-soft: 0 1px 2px rgba(15, 23, 42, 0.05);
    --aorist-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
    color: var(--aorist-ink);
    background: var(--aorist-page-bg);
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Noto Sans", sans-serif;
  }

  .stage {
    padding: 0;
    background: var(--aorist-page-bg);
  }

  .stage__surface {
    height: 100vh;
    border: 0;
    border-radius: 0;
    background: var(--aorist-card-bg);
    box-shadow: none;
  }

  .sidebar--aorist {
    border-right-color: var(--aorist-border-divider, #e8e8e8);
    background: var(--aorist-sidebar);
  }

  .sidebar__brand {
    min-height: 56px;
    padding-inline: 14px;
    border-bottom-color: var(--aorist-border-divider);
    background: var(--aorist-sidebar);
  }

  .brand-mark {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: var(--aorist-primary);
    color: #ffffff;
    box-shadow: none;
  }

  .sidebar__brand strong {
    color: var(--aorist-ink);
    font-size: 14px;
    font-weight: 650;
    letter-spacing: 0;
  }

  .brand-copy span {
    display: block;
    margin-top: 1px;
    color: var(--aorist-muted);
    font-size: 11px;
    font-weight: 500;
  }

  .brand-mode-switch {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    min-width: 30px;
    padding: 0;
    border-color: var(--aorist-line);
    border-radius: 8px;
    background: #ffffff;
    color: var(--aorist-primary);
    box-shadow: none;
  }

  .brand-mode-switch:hover,
  .brand-mode-switch.active {
    border-color: var(--aorist-primary);
    background: var(--aorist-primary);
    color: #ffffff;
  }

  .sidebar__icon:hover,
  .user-menu button:hover {
    background: var(--aorist-sidebar-hover);
    color: var(--aorist-ink);
  }

  .workspace-nav {
    padding: 8px 0 12px;
  }

  .workspace-nav h2 {
    margin: 0;
    padding: 6px 12px 4px;
    color: var(--aorist-faint);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .workspace-nav button {
    width: calc(100% - 16px);
    min-height: 36px;
    margin: 1px 8px;
    border: 1px solid transparent;
    border-radius: 8px;
    color: var(--aorist-muted);
    font-size: 14px;
    font-weight: 500;
  }

  .workspace-nav button:hover {
    border-color: transparent;
    background: var(--aorist-sidebar-hover);
    color: var(--aorist-ink);
  }

  .workspace-nav button.active {
    border-color: transparent;
    background: var(--aorist-sidebar-active);
    color: var(--aorist-primary);
    box-shadow: none;
  }

  .nav-icon {
    border-radius: 8px;
  }

  .workspace-nav button.active .nav-icon {
    background: #ffffff;
  }

  .sidebar-project-dock {
    margin-top: 6px;
    padding-top: 8px;
    border-top: 1px solid var(--aorist-border-divider);
  }

  .sidebar-project-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-right: 8px;
  }

  .workspace-nav .sidebar-project-head h2 {
    flex: 1 1 auto;
    min-width: 0;
  }

  .workspace-nav .sidebar-project-dock button {
    width: auto;
    min-height: 0;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--aorist-muted);
    font-size: 12px;
    font-weight: 500;
    box-shadow: none;
  }

  .workspace-nav .sidebar-project-dock button:hover {
    background: var(--aorist-sidebar-hover);
    color: var(--aorist-ink);
  }

  .workspace-nav .sidebar-project-icon,
  .workspace-nav .sidebar-project-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
  }

  .workspace-nav .sidebar-project-icon:hover,
  .workspace-nav .sidebar-project-action:hover {
    color: var(--aorist-primary);
  }

  .sidebar-project-create {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) 24px;
    align-items: center;
    gap: 7px;
    min-height: 32px;
    margin: 1px 8px 6px;
    padding: 3px 4px 3px 8px;
    border: 1px solid var(--aorist-line);
    border-radius: 8px;
    background: #ffffff;
  }

  .sidebar-project-create > :global(svg) {
    color: var(--aorist-primary);
  }

  .sidebar-project-create input {
    min-width: 0;
    height: 24px;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--aorist-ink);
    font: inherit;
    font-size: 12px;
  }

  .workspace-nav .sidebar-project-create button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: var(--aorist-primary);
  }

  .sidebar-project-list,
  .sidebar-project-group,
  .sidebar-conversation-list {
    display: grid;
    gap: 1px;
  }

  .sidebar-project-row {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) 24px;
    align-items: center;
    gap: 2px;
    min-height: 30px;
    margin: 1px 8px;
    padding: 1px 3px;
    border-radius: 8px;
  }

  .sidebar-project-row:hover,
  .sidebar-project-row.active {
    background: var(--aorist-sidebar-hover);
  }

  .sidebar-project-row.active {
    color: var(--aorist-primary);
  }

  .workspace-nav .sidebar-project-disclosure {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 26px;
  }

  .sidebar-project-disclosure :global(svg) {
    transform: rotate(-90deg);
    transition: transform 0.16s ease;
  }

  .sidebar-project-disclosure.expanded :global(svg) {
    transform: rotate(0deg);
  }

  .workspace-nav .sidebar-project-open {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr);
    align-items: center;
    gap: 7px;
    min-width: 0;
    height: 28px;
    text-align: left;
  }

  .workspace-nav .sidebar-project-open :global(svg),
  .workspace-nav .sidebar-conversation-row :global(svg) {
    color: inherit;
  }

  .workspace-nav .sidebar-project-open span {
    min-width: 0;
    overflow: hidden;
    color: inherit;
    font-size: 13px;
    font-weight: 540;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .workspace-nav .sidebar-project-action {
    opacity: 0;
    transition: opacity 0.14s ease;
  }

  .sidebar-project-row:hover .sidebar-project-action,
  .sidebar-project-row.active .sidebar-project-action {
    opacity: 1;
  }

  .sidebar-conversation-list {
    margin: 0 8px 4px 36px;
  }

  .workspace-nav .sidebar-conversation-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 22px 22px;
    align-items: center;
    gap: 2px;
    width: 100%;
    min-height: 28px;
    padding: 0 2px 0 0;
    border-radius: 7px;
    text-align: left;
  }

  .workspace-nav .sidebar-conversation-row:hover {
    background: var(--aorist-sidebar-hover);
  }

  .workspace-nav .sidebar-conversation-row.active {
    background: var(--aorist-sidebar-active);
    color: var(--aorist-primary);
  }

  .workspace-nav .sidebar-conversation-open {
    display: grid;
    grid-column: 2;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    min-width: 0;
    min-height: 26px;
    padding: 0 6px 0 0;
    text-align: left;
  }

  .workspace-nav .sidebar-conversation-row span {
    min-width: 0;
    overflow: hidden;
    color: inherit;
    font-size: 12px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .workspace-nav .sidebar-conversation-row em {
    min-width: 0;
    padding: 0;
    background: transparent;
    color: var(--aorist-faint);
    font-size: 10px;
    font-style: normal;
  }

  .workspace-nav .sidebar-conversation-empty {
    display: flex;
    grid-template-columns: none;
    align-items: center;
    justify-content: flex-start;
    gap: 5px;
    width: 100%;
    min-height: 28px;
    padding: 0 8px;
    color: var(--aorist-faint);
    text-align: left;
    white-space: nowrap;
    word-break: keep-all;
  }

  .workspace-nav .sidebar-conversation-empty :global(svg) {
    flex: 0 0 auto;
  }

  .shell.is-sidebar-collapsed .sidebar-project-dock {
    display: none;
  }

  .sidebar__user-wrap {
    border-top-color: var(--aorist-border-divider);
  }

  .sidebar__user-wrap .sidebar__user {
    border: 1px solid var(--aorist-line);
    border-radius: 12px;
    background: #ffffff;
    box-shadow: none;
  }

  .sidebar__avatar {
    color: var(--aorist-primary-strong);
    background: var(--aorist-primary-soft);
  }

  .stage-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-direction: row;
    gap: 16px;
    min-height: 56px;
    padding: 0 24px;
    border-bottom-color: var(--aorist-border-divider);
    background: var(--aorist-card-bg);
    backdrop-filter: none;
  }

  .stage-topbar__leading {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .stage-topbar__leading > div {
    min-width: 0;
  }

  .stage-topbar span,
  .aorist-toolbar span,
  .hero-panel span {
    color: var(--aorist-faint);
    letter-spacing: 0.06em;
  }

  .stage-topbar strong,
  .aorist-toolbar strong {
    color: var(--aorist-ink);
  }

  .hero-panel button,
  .aorist-toolbar button,
  .management-primary,
  .project-section-head button,
  .customer-section-head button,
  .config-modal footer button,
  .agent-wizard__footer button,
  .capability-item button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 34px;
    padding: 0 12px;
    border-color: var(--aorist-line-strong);
    border-radius: 6px;
    background: #ffffff;
    color: var(--aorist-ink);
    box-shadow: none;
    font-size: 12px;
    font-weight: 650;
    white-space: nowrap;
  }

  .hero-panel button:hover,
  .aorist-toolbar button:hover,
  .management-primary:hover,
  .project-section-head button:hover,
  .customer-section-head button:hover,
  .config-modal footer button:hover,
  .agent-wizard__footer button:hover,
  .capability-item button:hover {
    border-color: var(--aorist-line-strong);
    background: var(--aorist-primary-soft);
    color: var(--aorist-primary);
  }

  .hero-panel button:first-child,
  .aorist-toolbar button:last-child,
  .management-primary,
  .config-modal footer button:last-child,
  .agent-wizard__footer button:last-child {
    border-color: var(--aorist-primary);
    background: var(--aorist-primary);
    color: #ffffff;
  }

  .hero-panel button:first-child:hover,
  .aorist-toolbar button:last-child:hover,
  .management-primary:hover,
  .config-modal footer button:last-child:hover,
  .agent-wizard__footer button:last-child:hover {
    border-color: var(--aorist-primary-strong);
    background: var(--aorist-primary-strong);
    color: #ffffff;
  }

  .aorist-page {
    padding: 24px;
    background: var(--aorist-page-bg);
  }

  .hero-panel {
    display: grid;
    gap: 12px;
    padding: 20px 24px;
    border-color: var(--aorist-line);
    border-radius: 12px;
    background: #ffffff;
    box-shadow: var(--aorist-shadow-soft);
  }

  .hero-panel::after {
    display: none;
  }

  .hero-panel h1 {
    max-width: 720px;
    margin: 0;
    color: var(--aorist-ink);
    font-size: 24px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: 0;
  }

  .hero-panel p {
    max-width: 760px;
    color: var(--aorist-muted);
    font-size: 13px;
    line-height: 1.62;
  }

  .aorist-stats,
  .management-stats {
    gap: 10px;
  }

  .aorist-stats article,
  .management-stats article,
  .aorist-card,
  .aorist-list article,
  .agent-card,
  .automation-card,
  .media-card,
  .capability-item,
  .management-card,
  .detail-panel,
  .project-detail-card,
  .customer-detail-card,
  .customer-detail-aside section,
  .project-detail-aside section,
  :global(.task-composer-card) {
    border-color: var(--aorist-line);
    border-radius: 8px;
    background: var(--aorist-card-bg);
    box-shadow: var(--aorist-shadow-soft);
  }

  .aorist-stats article:hover,
  .management-card:hover,
  .agent-card:hover,
  .automation-card:hover,
  .media-card:hover,
  .capability-item:hover {
    border-color: color-mix(in srgb, var(--aorist-primary) 30%, var(--aorist-line));
    background: #ffffff;
    box-shadow: var(--aorist-shadow-soft);
    transform: none;
  }

  .aorist-stats strong,
  .management-stats strong {
    color: var(--aorist-ink);
    letter-spacing: -0.02em;
  }

  .aorist-stats span,
  .aorist-stats em,
  .management-stats span,
  .management-stats em,
  .management-card__body p,
  .aorist-list p,
  .agent-card p,
  .automation-card p,
  .media-card p,
  .capability-item p {
    color: var(--aorist-muted);
  }

  .management-stats article > :global(svg),
  .management-card__icon,
  .agent-card header > span,
  .team-list-card header > span,
  .project-detail-row > span,
  .customer-detail-row > span,
  .client-avatar {
    color: var(--aorist-primary-strong);
    background: var(--aorist-primary-soft);
  }

  .todo-row,
  .automation-row,
  .project-detail-card .project-detail-row,
  .customer-detail-row,
  .customer-project-list button {
    border-color: var(--aorist-line);
    border-radius: 8px;
    background: #fafafa;
  }

  .todo-row:hover,
  .automation-row:hover,
  .project-detail-card .project-detail-row:hover,
  .customer-detail-row:hover,
  .customer-project-list button:hover {
    border-color: color-mix(in srgb, var(--aorist-primary) 30%, var(--aorist-line));
    background: var(--aorist-primary-softer);
  }

  .todo-row i,
  .project-progress-line i {
    background: var(--aorist-primary);
  }

  .todo-row b,
  .automation-row b,
  .aorist-list span,
  .automation-card span,
  .media-card span,
  .capability-item span,
  .management-badges span:nth-child(2),
  .project-todo-row b,
  .project-schedule-list .project-detail-row b,
  .customer-todo-row b,
  .customer-schedule-list .customer-detail-row b {
    background: var(--aorist-primary-soft);
    color: var(--aorist-primary-strong);
  }

  .management-search,
  .aorist-search,
  .team-builder-search {
    background: transparent;
  }

  .management-search input,
  .aorist-search input,
  .team-builder-search input,
  .team-builder aside input,
  .config-grid input,
  .config-grid textarea,
  .config-grid select,
  .wizard-form input,
  .wizard-form textarea,
  .wizard-form select,
  .stage__composer :global(textarea),
  :global(.task-composer-card textarea) {
    border-color: var(--aorist-line);
    border-radius: 10px;
    background: #ffffff;
  }

  .management-search input:focus,
  .aorist-search input:focus,
  .config-grid input:focus,
  .config-grid textarea:focus,
  .config-grid select:focus,
  .wizard-form input:focus,
  .wizard-form textarea:focus,
  .wizard-form select:focus {
    border-color: var(--aorist-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--aorist-primary) 14%, transparent);
  }

  .detail-tabs,
  .project-detail-main .detail-tabs,
  .customer-detail-main .detail-tabs {
    border-bottom-color: var(--aorist-line);
  }

  .detail-tabs button,
  .project-detail-main .detail-tabs button,
  .customer-detail-main .detail-tabs button {
    color: var(--aorist-muted);
  }

  .detail-tabs button.active,
  .project-detail-main .detail-tabs button.active,
  .customer-detail-main .detail-tabs button.active {
    border-color: var(--aorist-primary);
    color: var(--aorist-primary-strong);
  }

  .project-detail-risk,
  .customer-risk-card {
    border-color: oklch(0.86 0.07 82);
    background: oklch(0.98 0.03 82);
  }

  .project-detail-risk h3,
  .customer-risk-card h3,
  .customer-risk-card > strong {
    color: oklch(0.46 0.11 76);
  }

  .modal-backdrop {
    background: rgba(26, 38, 33, 0.34);
    backdrop-filter: none;
  }

  .config-modal,
  .agent-wizard,
  .detail-modal,
  .user-panel-modal,
  .capability-create-modal {
    border-color: var(--aorist-line);
    border-radius: 12px;
    background: #ffffff;
    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
  }

  .agent-assistant-page {
    background: var(--aorist-page-bg);
  }

  .agent-assistant-shell,
  .agent-assistant-center {
    color: var(--aorist-ink);
  }

  .agent-selector__trigger {
    border-color: var(--aorist-line);
    background: var(--aorist-card-bg);
    box-shadow: var(--aorist-shadow-soft);
  }

  .agent-selector__avatar,
  .wizard-avatar,
  .wizard-preview b {
    background: var(--aorist-primary);
    color: #ffffff;
  }

  .stage__composer {
    bottom: 24px;
    width: min(760px, calc(100% - 96px));
  }

  .home__composer :global(.composer),
  .stage__composer :global(.composer),
  :global(.task-composer-card .composer),
  .agent-compose-card :global(.composer) {
    min-height: 112px;
    overflow: visible;
    border: 1px solid var(--aorist-line);
    border-radius: 12px;
    background: var(--aorist-card-bg);
    box-shadow: var(--aorist-shadow-soft);
    backdrop-filter: none;
  }

  .home__composer :global(.composer:focus-within),
  .stage__composer :global(.composer:focus-within),
  :global(.task-composer-card .composer:focus-within),
  .agent-compose-card :global(.composer:focus-within) {
    border-color: color-mix(in srgb, var(--aorist-primary) 36%, var(--aorist-line));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--aorist-primary) 18%, transparent);
  }

  .home__composer :global(.composer textarea),
  .stage__composer :global(.composer textarea),
  :global(.task-composer-card .composer textarea),
  .agent-compose-card :global(.composer textarea) {
    min-height: 46px;
    color: var(--aorist-ink);
    font-size: 14px;
    line-height: 1.52;
    background: transparent;
  }

  .home__composer :global(.composer__toolbar),
  .stage__composer :global(.composer__toolbar),
  :global(.task-composer-card .composer__toolbar),
  .agent-compose-card :global(.composer__toolbar) {
    border-top-color: var(--aorist-border-divider);
  }

  .home__composer :global(.composer__tools button),
  .home__composer :global(.composer__link-picker),
  .home__composer :global(.composer__model),
  .stage__composer :global(.composer__tools button),
  .stage__composer :global(.composer__link-picker),
  .stage__composer :global(.composer__model),
  :global(.task-composer-card .composer__tools button),
  :global(.task-composer-card .composer__link-picker),
  :global(.task-composer-card .composer__model),
  .agent-compose-card :global(.composer__tools button),
  .agent-compose-card :global(.composer__link-picker),
  .agent-compose-card :global(.composer__model) {
    border-color: transparent;
    border-radius: 10px;
    background: #f4f4f4;
    color: var(--aorist-muted);
  }

  .home__composer :global(.composer__status),
  .stage__composer :global(.composer__status),
  .agent-compose-card :global(.composer__status),
  :global(.task-composer-card .composer__status) {
    max-width: 180px;
    overflow: hidden;
    color: #8a5a00;
    font-size: 11px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .home__composer :global(.composer__submit),
  .stage__composer :global(.composer__submit),
  :global(.task-composer-card .composer__submit),
  .agent-compose-card :global(.composer__submit) {
    color: #ffffff;
    background: var(--aorist-primary);
    box-shadow: none;
  }

  .home__composer :global(.composer__submit:hover),
  .stage__composer :global(.composer__submit:hover),
  :global(.task-composer-card .composer__submit:hover),
  .agent-compose-card :global(.composer__submit:hover) {
    background: var(--aorist-primary-strong);
  }

  :global(.composer-context-actions > span) {
    border-color: color-mix(in srgb, var(--aorist-primary) 22%, transparent);
    background: var(--aorist-primary-soft);
    color: var(--aorist-primary);
  }

  button:focus-visible,
  input:focus-visible,
  textarea:focus-visible,
  select:focus-visible,
  [role="button"]:focus-visible {
    outline-color: color-mix(in srgb, var(--aorist-primary) 48%, transparent);
  }

  @media (max-width: 720px) {
    .stage-topbar {
      min-height: 56px;
      padding-inline: 12px;
    }

    .stage-topbar__actions {
      gap: 6px;
    }

    .hero-panel h1 {
      font-size: 28px;
    }
  }

  @media (min-width: 560px) and (max-width: 720px) {
    .shell {
      --sidebar-width: 220px;
      grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
    }

    .sidebar {
      display: flex;
      width: var(--sidebar-width);
      min-width: var(--sidebar-width);
    }

    .stage {
      min-width: 0;
    }

    .stage__surface {
      min-width: 0;
    }
  }

  /* Accio Work normalization: buttons, forms, typography, and dialogs. */
  .shell {
    --aorist-primary: #222222;
    --aorist-primary-strong: #111111;
    --aorist-primary-soft: #eeeeee;
    --aorist-primary-softer: #f7f7f8;
    --aorist-ink: #222222;
    --aorist-muted: #767676;
    --aorist-faint: #8e8e93;
    --aorist-line: #dddddd;
    --aorist-line-strong: #d4d4d8;
    --aorist-border-divider: #e8e8e8;
    --aorist-card-bg: #ffffff;
    --aorist-card-bg-soft: #f7f7f8;
    --aorist-page-bg: #f4f4f4;
    --aorist-sidebar: #f4f4f4;
    --aorist-sidebar-hover: #ececec;
    --aorist-sidebar-active: #e6faf2;
    --aorist-shadow-soft: 0 1px 3px rgba(0, 0, 0, 0.06);
    --aorist-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
    color: var(--aorist-ink);
    background: var(--aorist-page-bg);
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "Noto Sans SC", "Helvetica Neue", sans-serif;
    font-size: 13px;
    line-height: 1.45;
    letter-spacing: 0;
  }

  .shell button,
  .shell input,
  .shell textarea,
  .shell select {
    font: inherit;
    letter-spacing: 0;
  }

  .shell button {
    cursor: default;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease,
      box-shadow 0.15s ease,
      transform 0.1s ease;
  }

  .shell button:active:not(:disabled) {
    transform: scale(0.985);
  }

  .shell button:disabled {
    cursor: default;
    opacity: 0.5;
    pointer-events: none;
    transform: none;
  }

  .stage-topbar strong,
  .aorist-toolbar strong,
  .aorist-card header strong,
  .management-card__body strong,
  .agent-card strong,
  .automation-card strong,
  .media-card strong,
  .capability-item strong {
    color: var(--aorist-ink);
    font-size: 15px;
    font-weight: 600;
    line-height: 1.35;
    letter-spacing: 0;
  }

  .stage-topbar span,
  .aorist-toolbar span,
  .hero-panel span,
  .workspace-nav h2,
  .config-grid label,
  .wizard-form label,
  .team-builder aside label {
    color: var(--aorist-muted);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
  }

  .hero-panel h1 {
    color: var(--aorist-ink);
    font-size: 24px;
    font-weight: 650;
    line-height: 1.25;
    letter-spacing: 0;
  }

  .hero-panel p,
  .aorist-list p,
  .agent-card p,
  .automation-card p,
  .media-card p,
  .capability-item p,
  .management-card__body p,
  .project-detail-card p,
  .customer-detail-card p {
    color: var(--aorist-muted);
    font-size: 13px;
    line-height: 1.5;
  }

  .hero-panel button,
  .aorist-toolbar button,
  .management-primary,
  .project-section-head button,
  .customer-section-head button,
  .resource-actions button,
  .automation-card footer button,
  .capability-item button,
  .project-detail-actions button,
  .project-detail-card button,
  .project-detail-aside button,
  .customer-detail-aside button,
  .team-primary,
  .team-send,
  .team-card-meta button,
  .team-empty-state button,
  .config-modal footer button,
  .agent-wizard__footer button,
  .conversation-header button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 14px;
    border: 1px solid var(--aorist-line);
    border-radius: 999px;
    background: var(--aorist-card-bg);
    color: var(--aorist-ink);
    box-shadow: none;
    font-size: 12px;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
  }

  .hero-panel button:hover,
  .aorist-toolbar button:hover,
  .project-section-head button:hover,
  .customer-section-head button:hover,
  .resource-actions button:hover,
  .automation-card footer button:hover,
  .capability-item button:hover,
  .project-detail-actions button:hover,
  .project-detail-card button:hover,
  .project-detail-aside button:hover,
  .customer-detail-aside button:hover,
  .team-card-meta button:hover,
  .team-empty-state button:hover,
  .config-modal footer button:hover,
  .agent-wizard__footer button:hover,
  .conversation-header button:hover {
    border-color: var(--aorist-line-strong);
    background: var(--aorist-card-bg-soft);
    color: var(--aorist-ink);
  }

  .hero-panel button:first-child,
  .aorist-toolbar button:last-child,
  .management-primary,
  .team-primary,
  .team-send,
  .team-card-meta button,
  .config-modal footer button:last-child,
  .agent-wizard__footer button:last-child {
    border-color: var(--aorist-primary);
    background: var(--aorist-primary);
    color: #ffffff;
  }

  .hero-panel button:first-child:hover,
  .aorist-toolbar button:last-child:hover,
  .management-primary:hover,
  .team-primary:hover,
  .team-send:hover,
  .team-card-meta button:hover,
  .config-modal footer button:last-child:hover,
  .agent-wizard__footer button:last-child:hover {
    border-color: var(--aorist-primary-strong);
    background: var(--aorist-primary-strong);
    color: #ffffff;
  }

  .brand-mode-switch,
  .sidebar__icon,
  .workspace-nav .sidebar-project-icon,
  .workspace-nav .sidebar-project-action,
  .workspace-nav .sidebar-project-disclosure,
  .agent-card header button,
  .team-card-actions button,
  .team-chat-title button,
  .team-compose-row > button:not(.team-send),
  .config-modal header > button,
  .agent-wizard__header > button,
  .project-detail-back,
  .user-panel-modal header button,
  .capability-create-modal header button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    min-width: 32px;
    min-height: 32px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--aorist-muted);
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
  }

  .brand-mode-switch:hover,
  .sidebar__icon:hover,
  .workspace-nav .sidebar-project-icon:hover,
  .workspace-nav .sidebar-project-action:hover,
  .workspace-nav .sidebar-project-disclosure:hover,
  .agent-card header button:hover,
  .team-card-actions button:hover,
  .team-chat-title button:hover,
  .team-compose-row > button:not(.team-send):hover,
  .config-modal header > button:hover,
  .agent-wizard__header > button:hover,
  .project-detail-back:hover,
  .user-panel-modal header button:hover,
  .capability-create-modal header button:hover {
    border-color: transparent;
    background: var(--aorist-sidebar-hover);
    color: var(--aorist-ink);
  }

  .workspace-nav button,
  .workspace-nav .sidebar-project-dock button {
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
  }

  .workspace-nav button.active,
  .workspace-nav .sidebar-conversation-row.active,
  .sidebar-project-row.active {
    background: var(--aorist-sidebar-active);
    color: var(--aorist-primary-strong);
  }

  .capability-tabs,
  .management-tabs,
  .detail-tabs,
  .wizard-tabs,
  .team-view-switch {
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--aorist-line);
    border-radius: 999px;
    background: var(--aorist-card-bg-soft);
  }

  .capability-tabs button,
  .management-tabs button,
  .detail-tabs button,
  .wizard-tabs button,
  .team-view-switch button {
    min-height: 28px;
    padding: 0 12px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--aorist-muted);
    font-size: 12px;
    font-weight: 500;
    line-height: 1;
  }

  .capability-tabs button:hover,
  .management-tabs button:hover,
  .detail-tabs button:hover,
  .wizard-tabs button:hover,
  .team-view-switch button:hover {
    background: #ffffff;
    color: var(--aorist-ink);
  }

  .capability-tabs button.active,
  .management-tabs button.active,
  .detail-tabs button.active,
  .wizard-tabs button.active,
  .team-view-switch button.active {
    background: #ffffff;
    color: var(--aorist-ink);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }

  .management-search,
  .aorist-search,
  .team-builder-search,
  .sidebar-project-create,
  :global(.task-composer-card__head) select,
  .config-grid input,
  .config-grid textarea,
  .config-grid select,
  .wizard-form input,
  .wizard-form textarea,
  .wizard-form select,
  .team-builder aside input,
  .team-compose-row textarea {
    border: 1px solid var(--aorist-line);
    border-radius: 10px;
    background: var(--aorist-card-bg);
    color: var(--aorist-ink);
    box-shadow: none;
  }

  .management-search,
  .aorist-search,
  .team-builder-search {
    min-height: 36px;
    padding: 0 11px;
  }

  .management-search input,
  .aorist-search input,
  .team-builder-search input,
  .sidebar-project-create input,
  .config-grid input,
  .config-grid select,
  .wizard-form input,
  .wizard-form select,
  .team-builder aside input {
    height: 36px;
    min-height: 36px;
    padding: 0 11px;
    border: 1px solid var(--aorist-line);
    border-radius: 10px;
    background: var(--aorist-card-bg);
    color: var(--aorist-ink);
    font-size: 13px;
    font-weight: 400;
  }

  .management-search input,
  .aorist-search input,
  .team-builder-search input,
  .sidebar-project-create input {
    height: 30px;
    min-height: 30px;
    padding: 0;
    border: 0;
    background: transparent;
  }

  .config-grid textarea,
  .wizard-form textarea {
    min-height: 88px;
    padding: 10px 11px;
    border: 1px solid var(--aorist-line);
    border-radius: 10px;
    background: var(--aorist-card-bg);
    color: var(--aorist-ink);
    font-size: 13px;
    line-height: 1.5;
  }

  .config-grid input::placeholder,
  .config-grid textarea::placeholder,
  .wizard-form input::placeholder,
  .wizard-form textarea::placeholder,
  .management-search input::placeholder,
  .aorist-search input::placeholder {
    color: var(--aorist-faint);
  }

  .management-search:focus-within,
  .aorist-search:focus-within,
  .team-builder-search:focus-within,
  .sidebar-project-create:focus-within,
  .config-grid input:focus,
  .config-grid textarea:focus,
  .config-grid select:focus,
  .wizard-form input:focus,
  .wizard-form textarea:focus,
  .wizard-form select:focus,
  .team-builder aside input:focus {
    border-color: var(--aorist-primary);
    outline: 0;
    box-shadow: 0 0 0 3px rgba(34, 34, 34, 0.14);
  }

  .modal-backdrop {
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(4px);
  }

  .config-modal,
  .agent-wizard,
  .detail-modal,
  .user-panel-modal,
  .capability-create-modal {
    overflow: hidden;
    border: 1px solid var(--aorist-border-divider);
    border-radius: 16px;
    background: var(--aorist-card-bg);
    color: var(--aorist-ink);
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.12),
      0 24px 64px rgba(0, 0, 0, 0.08);
  }

  .config-modal header,
  .agent-wizard__header,
  .user-panel-modal header,
  .capability-create-modal header,
  .project-detail-modal > .project-detail-head,
  .customer-detail-modal > .customer-detail-head {
    min-height: 56px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--aorist-border-divider);
    background: var(--aorist-card-bg);
  }

  .config-modal header strong,
  .agent-wizard__header strong,
  .user-panel-modal header strong,
  .capability-create-modal header strong,
  .project-detail-head strong,
  .customer-detail-head strong {
    color: var(--aorist-ink);
    font-size: 16px;
    font-weight: 600;
    line-height: 1.35;
  }

  .config-modal header span,
  .agent-wizard__header span,
  .user-panel-modal header span,
  .capability-create-modal header span {
    color: var(--aorist-muted);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
  }

  .config-modal footer,
  .agent-wizard__footer,
  .user-panel-modal footer,
  .capability-create-modal footer {
    padding: 12px 16px;
    border-top: 1px solid var(--aorist-border-divider);
    background: var(--aorist-card-bg);
  }

  .aorist-card,
  .aorist-list article,
  .management-card,
  .management-stats article,
  .agent-card,
  .automation-card,
  .media-card,
  .capability-item,
  .detail-panel,
  .project-detail-card,
  .customer-detail-card,
  .project-detail-aside section,
  .customer-detail-aside section,
  .team-list-card,
  .team-office-room,
  :global(.task-composer-card),
  .agent-compose-card {
    border: 1px solid var(--aorist-border-divider);
    border-radius: 12px;
    background: var(--aorist-card-bg);
    box-shadow: none;
  }

  .aorist-card:hover,
  .management-card:hover,
  .agent-card:hover,
  .automation-card:hover,
  .media-card:hover,
  .capability-item:hover,
  .team-list-card:hover {
    border-color: var(--aorist-line-strong);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    transform: none;
  }

  .home__composer :global(.composer),
  .stage__composer :global(.composer),
  :global(.task-composer-card .composer),
  .agent-compose-card :global(.composer) {
    border-color: var(--aorist-line);
    border-radius: 16px;
    background: var(--aorist-card-bg);
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.06),
      0 8px 24px rgba(0, 0, 0, 0.08);
  }

  .home__composer :global(.composer.composer--code),
  .home__composer :global(.composer.composer--work),
  .stage__composer :global(.composer.composer--code),
  .stage__composer :global(.composer.composer--work),
  .agent-compose-card :global(.composer.composer--code),
  .agent-compose-card :global(.composer.composer--work) {
    border-color: var(--composer-mode-border);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--composer-mode-soft) 72%, #ffffff), var(--composer-mode-surface) 42%, #ffffff 100%);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--composer-mode-accent) 8%, transparent),
      0 12px 32px var(--composer-mode-shadow);
  }

  .home__composer :global(.composer__tools),
  .stage__composer :global(.composer__tools),
  .agent-compose-card :global(.composer__tools) {
    position: relative;
    overflow: visible;
  }

  .home__composer :global(.composer__permission-wrap),
  .stage__composer :global(.composer__permission-wrap),
  .agent-compose-card :global(.composer__permission-wrap) {
    position: relative;
  }

  .home__composer :global(.composer__project-wrap),
  .stage__composer :global(.composer__project-wrap),
  .agent-compose-card :global(.composer__project-wrap) {
    position: relative;
  }

  .home__composer :global(.composer-plus-menu),
  .stage__composer :global(.composer-plus-menu),
  .agent-compose-card :global(.composer-plus-menu) {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    z-index: 30;
    display: grid;
    gap: 1px;
    width: min(276px, calc(100vw - 40px));
    max-height: min(300px, calc(100vh - 160px));
    overflow-y: auto;
    padding: 8px;
    border: 1px solid var(--aorist-border-divider);
    border-radius: 16px;
    background: #ffffff;
    box-shadow: 0 18px 42px rgba(15, 23, 42, 0.16);
  }

  .home__composer :global(.composer-plus-menu button),
  .home__composer :global(.composer-plus-menu__select),
  .stage__composer :global(.composer-plus-menu button),
  .stage__composer :global(.composer-plus-menu__select),
  .agent-compose-card :global(.composer-plus-menu button),
  .agent-compose-card :global(.composer-plus-menu__select) {
    position: relative;
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    align-items: center;
    gap: 9px;
    width: 100%;
    min-height: 28px;
    padding: 4px 8px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--aorist-ink);
    font-size: 12px;
    font-weight: 500;
    text-align: left;
  }

  .home__composer :global(.composer-plus-menu button:hover),
  .home__composer :global(.composer-plus-menu__select:hover),
  .stage__composer :global(.composer-plus-menu button:hover),
  .stage__composer :global(.composer-plus-menu__select:hover),
  .agent-compose-card :global(.composer-plus-menu button:hover),
  .agent-compose-card :global(.composer-plus-menu__select:hover) {
    background: var(--aorist-card-bg-soft);
  }

  .home__composer :global(.composer-plus-menu button.active),
  .stage__composer :global(.composer-plus-menu button.active),
  .agent-compose-card :global(.composer-plus-menu button.active) {
    background: #f1f2f4;
  }

  .home__composer :global(.composer-plus-menu span),
  .stage__composer :global(.composer-plus-menu span),
  .agent-compose-card :global(.composer-plus-menu span) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .home__composer :global(.composer-plus-menu__title),
  .stage__composer :global(.composer-plus-menu__title),
  .agent-compose-card :global(.composer-plus-menu__title) {
    padding: 3px 6px 4px;
    color: var(--aorist-muted);
    font-size: 11px;
    font-weight: 500;
  }

  .home__composer :global(.composer-plus-menu strong),
  .stage__composer :global(.composer-plus-menu strong),
  .agent-compose-card :global(.composer-plus-menu strong) {
    display: block;
    overflow: hidden;
    color: var(--aorist-ink);
    font-size: 12px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .home__composer :global(.composer-plus-menu__select select),
  .stage__composer :global(.composer-plus-menu__select select),
  .agent-compose-card :global(.composer-plus-menu__select select) {
    position: absolute;
    inset: 0;
    width: 100%;
    opacity: 0;
    cursor: pointer;
  }

  .home__composer :global(.composer__tools button),
  .stage__composer :global(.composer__tools button),
  :global(.task-composer-card .composer__tools button),
  .agent-compose-card :global(.composer__tools button),
  .home__composer :global(.composer__link-picker),
  .stage__composer :global(.composer__link-picker),
  .agent-compose-card :global(.composer__link-picker),
  .home__composer :global(.composer__permission-picker),
  .stage__composer :global(.composer__permission-picker),
  .agent-compose-card :global(.composer__permission-picker),
  .home__composer :global(.composer__model),
  .stage__composer :global(.composer__model),
  .agent-compose-card :global(.composer__model) {
    min-height: 30px;
    width: 108px;
    max-width: 108px;
    padding-inline: 8px 22px;
    border-radius: 8px;
    background: var(--aorist-card-bg-soft);
    color: var(--aorist-muted);
    font-size: 12px;
    font-weight: 500;
    text-overflow: ellipsis;
  }

  .home__composer :global(.composer__tools .composer__plus-trigger),
  .stage__composer :global(.composer__tools .composer__plus-trigger),
  .agent-compose-card :global(.composer__tools .composer__plus-trigger) {
    flex: 0 0 30px;
    width: 30px;
    max-width: 30px;
    min-height: 30px;
    padding: 0;
  }

  .home__composer :global(.composer__tools .composer__permission-picker),
  .stage__composer :global(.composer__tools .composer__permission-picker),
  .agent-compose-card :global(.composer__tools .composer__permission-picker) {
    display: inline-flex;
    justify-content: flex-start;
    width: 108px;
    max-width: 108px;
    min-height: 30px;
    padding-inline: 8px 10px;
  }

  .home__composer :global(.composer__tools .composer__link-picker),
  .stage__composer :global(.composer__tools .composer__link-picker),
  .agent-compose-card :global(.composer__tools .composer__link-picker) {
    display: inline-flex;
    justify-content: flex-start;
    width: 108px;
    max-width: 108px;
    min-height: 30px;
    padding-inline: 8px 10px;
  }

  .home__composer :global(.composer__tools .composer-project-menu button),
  .stage__composer :global(.composer__tools .composer-project-menu button),
  .agent-compose-card :global(.composer__tools .composer-project-menu button) {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) 16px;
    width: 100%;
    max-width: none;
    min-height: 38px;
    padding: 5px 7px;
    background: transparent;
    color: var(--aorist-ink);
  }

  .home__composer :global(.composer__tools .composer-permission-menu button),
  .stage__composer :global(.composer__tools .composer-permission-menu button),
  .agent-compose-card :global(.composer__tools .composer-permission-menu button) {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) 16px;
    width: 100%;
    max-width: none;
    min-height: 40px;
    padding: 6px 7px;
    background: transparent;
    color: var(--aorist-ink);
  }

  .home__composer :global(.composer__tools .composer-plus-menu button),
  .home__composer :global(.composer__tools .composer-plus-menu__select),
  .stage__composer :global(.composer__tools .composer-plus-menu button),
  .stage__composer :global(.composer__tools .composer-plus-menu__select),
  .agent-compose-card :global(.composer__tools .composer-plus-menu button),
  .agent-compose-card :global(.composer__tools .composer-plus-menu__select) {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    justify-content: start;
    width: 100%;
    max-width: none;
    min-height: 28px;
    padding: 4px 8px;
    background: transparent;
    color: var(--aorist-ink);
  }

  .home__composer :global(.composer-plus-menu svg),
  .stage__composer :global(.composer-plus-menu svg),
  .agent-compose-card :global(.composer-plus-menu svg) {
    color: #59616d;
  }

  .home__composer :global(.composer-plus-menu .plugin-docs),
  .stage__composer :global(.composer-plus-menu .plugin-docs),
  .agent-compose-card :global(.composer-plus-menu .plugin-docs) {
    color: #4f7df3;
  }

  .home__composer :global(.composer-plus-menu .plugin-pdf),
  .stage__composer :global(.composer-plus-menu .plugin-pdf),
  .agent-compose-card :global(.composer-plus-menu .plugin-pdf) {
    color: #ff6b6b;
  }

  .home__composer :global(.composer-plus-menu .plugin-sheet),
  .stage__composer :global(.composer-plus-menu .plugin-sheet),
  .agent-compose-card :global(.composer-plus-menu .plugin-sheet) {
    color: #4f9b58;
  }

  .home__composer :global(.composer-plus-menu .plugin-slides),
  .stage__composer :global(.composer-plus-menu .plugin-slides),
  .agent-compose-card :global(.composer-plus-menu .plugin-slides) {
    color: #d7a32e;
  }

  .home__composer :global(.composer-plus-menu .plugin-template),
  .stage__composer :global(.composer-plus-menu .plugin-template),
  .agent-compose-card :global(.composer-plus-menu .plugin-template) {
    color: #f08aa0;
  }

  .home__composer :global(.composer__submit),
  .stage__composer :global(.composer__submit),
  :global(.task-composer-card .composer__submit),
  .agent-compose-card :global(.composer__submit) {
    background: var(--aorist-primary);
    color: #ffffff;
  }

  .home__composer :global(.composer.composer--code .composer__submit),
  .home__composer :global(.composer.composer--work .composer__submit),
  .stage__composer :global(.composer.composer--code .composer__submit),
  .stage__composer :global(.composer.composer--work .composer__submit),
  .agent-compose-card :global(.composer.composer--code .composer__submit),
  .agent-compose-card :global(.composer.composer--work .composer__submit) {
    background: #111111;
  }

  .home__composer :global(.composer__submit:hover),
  .stage__composer :global(.composer__submit:hover),
  :global(.task-composer-card .composer__submit:hover),
  .agent-compose-card :global(.composer__submit:hover) {
    background: var(--aorist-primary-strong);
  }

  .home__composer :global(.composer.composer--code .composer__submit:hover),
  .home__composer :global(.composer.composer--work .composer__submit:hover),
  .stage__composer :global(.composer.composer--code .composer__submit:hover),
  .stage__composer :global(.composer.composer--work .composer__submit:hover),
  .agent-compose-card :global(.composer.composer--code .composer__submit:hover),
  .agent-compose-card :global(.composer.composer--work .composer__submit:hover) {
    background: #000000;
  }

  button:focus-visible,
  input:focus-visible,
  textarea:focus-visible,
  select:focus-visible,
  [role="button"]:focus-visible {
    outline: 0;
    box-shadow: 0 0 0 3px rgba(34, 34, 34, 0.18);
  }

  .shell .management-primary,
  .shell .hero-panel button,
  .shell .aorist-toolbar button,
  .shell .project-section-head button,
  .shell .customer-section-head button,
  .shell .resource-actions button,
  .shell .config-modal footer button,
  .shell .agent-wizard__footer button,
  .shell .conversation-header button {
    font-size: 12px;
    font-weight: 500;
  }

  .shell {
    --aorist-primary: #222222;
    --aorist-primary-strong: #111111;
    --aorist-primary-soft: #eeeeee;
    --aorist-primary-softer: #f7f7f8;
    --aorist-ink: #222222;
    --aorist-muted: #666666;
    --aorist-faint: #8e8e93;
    --aorist-line: #dddddd;
    --aorist-line-strong: #c8c8c8;
    --aorist-border-divider: #e8e8e8;
    --aorist-card-bg: #ffffff;
    --aorist-card-bg-soft: #f7f7f8;
    --aorist-page-bg: #f4f4f4;
    --aorist-sidebar: #f4f4f4;
    --aorist-sidebar-hover: #ececec;
    --aorist-sidebar-active: #e8e8e8;
  }

  .shell[data-mode="code"] {
    --composer-mode-accent: #111111;
    --composer-mode-accent-strong: #000000;
    --composer-mode-soft: #f1f1f1;
    --composer-mode-surface: #f8f8f8;
    --composer-mode-border: #d4d4d4;
    --composer-mode-shadow: rgba(0, 0, 0, 0.14);
    --composer-mode-active-text: #ffffff;
  }

  .shell[data-mode="work"] {
    --composer-mode-accent: #ffffff;
    --composer-mode-accent-strong: #f4f4f4;
    --composer-mode-soft: #ffffff;
    --composer-mode-surface: #ffffff;
    --composer-mode-border: #dddddd;
    --composer-mode-shadow: rgba(0, 0, 0, 0.08);
    --composer-mode-active-text: #111111;
  }

  .brand-mark,
  .agent-selector__avatar,
  .wizard-avatar,
  .wizard-preview b,
  .hero-panel button:first-child,
  .aorist-toolbar button:last-child,
  .management-primary,
  .team-primary,
  .team-send,
  .team-card-meta button,
  .config-modal footer button:last-child,
  .agent-wizard__footer button:last-child,
  .home__composer :global(.composer__submit),
  .stage__composer :global(.composer__submit),
  :global(.task-composer-card .composer__submit),
  .agent-compose-card :global(.composer__submit) {
    border-color: #222222;
    background: #222222;
    color: #ffffff;
  }

  .hero-panel button:first-child:hover,
  .aorist-toolbar button:last-child:hover,
  .management-primary:hover,
  .team-primary:hover,
  .team-send:hover,
  .team-card-meta button:hover,
  .config-modal footer button:last-child:hover,
  .agent-wizard__footer button:last-child:hover,
  .home__composer :global(.composer__submit:hover),
  .stage__composer :global(.composer__submit:hover),
  :global(.task-composer-card .composer__submit:hover),
  .agent-compose-card :global(.composer__submit:hover) {
    border-color: #111111;
    background: #111111;
    color: #ffffff;
  }

  .workspace-nav button.active,
  .workspace-nav button.active .nav-icon,
  .workspace-nav .sidebar-conversation-row.active,
  .sidebar-project-row.active,
  :global(.composer-context-actions > span),
  .todo-row b,
  .automation-row b,
  .aorist-list span,
  .automation-card span,
  .media-card span,
  .capability-item span,
  .management-badges span:nth-child(2),
  .project-todo-row b,
  .project-schedule-list .project-detail-row b,
  .customer-todo-row b,
  .customer-schedule-list .customer-detail-row b {
    border-color: #d4d4d8;
    background: #eeeeee;
    color: #222222;
  }

  .management-stats article > :global(svg),
  .management-card__icon,
  .agent-card header > span,
  .team-list-card header > span,
  .project-detail-row > span,
  .customer-detail-row > span,
  .client-avatar,
  .sidebar__avatar,
  .capability-row__icon,
  .management-badges .riskHigh,
  .client-card-side .riskHigh {
    background: #eeeeee;
    color: #222222;
  }

  .project-detail-risk,
  .customer-risk-card {
    border-color: #dddddd;
    background: #f7f7f8;
  }

  .project-detail-risk h3,
  .customer-risk-card h3,
  .customer-risk-card > strong {
    color: #222222;
  }

  .client-card-title :global(.lucide-triangle-alert),
  .automation-card footer button:last-child,
  .capability-state,
  .capability-state--enabled,
  .capability-state--auth,
  .capability-state--pending {
    border-color: #d4d4d8;
    background: #eeeeee;
    color: #222222;
  }

  .management-search:focus-within,
  .aorist-search:focus-within,
  .team-builder-search:focus-within,
  .sidebar-project-create:focus-within,
  .config-grid input:focus,
  .config-grid textarea:focus,
  .config-grid select:focus,
  .wizard-form input:focus,
  .wizard-form textarea:focus,
  .wizard-form select:focus,
  .team-builder aside input:focus,
  button:focus-visible,
  input:focus-visible,
  textarea:focus-visible,
  select:focus-visible,
  [role="button"]:focus-visible {
    border-color: #222222;
    outline: 0;
    box-shadow: 0 0 0 3px rgba(34, 34, 34, 0.14);
  }

  .aorist-page,
  .hero-panel {
    background: #f7f7f8;
  }

  .brand-mode-switch,
  .nav-icon,
  .workspace-nav button em,
  .workspace-nav button.active em,
  .aorist-card header button,
  .todo-row i,
  .calendar-mini-grid article.today,
  .calendar-mini-grid span,
  .calendar-grid article.today,
  .calendar-event-chip,
  .detail-tabs button.active,
  .select-list button:hover,
  .distill-steps button.active,
  .pill-group button.active,
  .wizard-card-grid button.active,
  .wizard-skill-list button.active,
  .wizard-files button.active,
  .capability-tabs button.active,
  :global(.agent-strip button.active),
  :global(.agent-strip span),
  :global(.composer-context-actions > span) {
    border-color: #d4d4d8;
    background: #eeeeee;
    color: #222222;
  }

  .brand-mode-switch:hover,
  .brand-mode-switch.active,
  .capability-tabs button.active,
  .workbench-calendar footer button:last-child,
  .wizard-avatar,
  .wizard-preview b,
  .project-progress-fill,
  .customer-progress-fill {
    border-color: #222222;
    background: #222222;
    color: #ffffff;
  }

  .agent-card footer b,
  .aorist-card header button,
  .detail-tabs button.active,
  .distill-steps button.active,
  .pill-group button.active,
  .wizard-files button.active,
  .brand-mode-switch,
  .brand-mode-switch:hover,
  .brand-mode-switch.active {
    color: #222222;
  }

  .wizard-files pre {
    background: #1f1f1f;
    color: #f4f4f5;
  }

  .agent-assistant-page {
    background: linear-gradient(180deg, #ffffff 0%, #f7f7f8 100%);
  }

  .agent-selector__avatar {
    box-shadow:
      0 16px 36px rgba(0, 0, 0, 0.12),
      inset 0 0 0 1px rgba(255, 255, 255, 0.3);
  }

  .workspace-nav h2 {
    font-size: 10px;
    font-weight: 500;
  }

  .workspace-nav button {
    grid-template-columns: 28px minmax(0, 1fr) auto;
    font-size: 12px;
    font-weight: 450;
  }

  .workspace-nav button span:nth-child(2),
  .sidebar__brand strong,
  .sidebar__user strong {
    font-size: 12px;
    font-weight: 520;
  }

  .workspace-nav > section:not(.sidebar-project-dock) > button > span:nth-child(2) {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    word-break: keep-all;
  }

  .shell.is-sidebar-collapsed .workspace-nav > section:not(.sidebar-project-dock) > button > span:nth-child(2) {
    display: none;
  }

  .workspace-nav .workspace-nav-section-head {
    display: grid;
    grid-template-columns: 14px minmax(0, 1fr);
    align-items: center;
    gap: 4px;
    width: calc(100% - 16px);
    min-height: 28px;
    margin: 8px 8px 5px;
    padding: 0 6px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--aorist-faint);
    font-size: 10px;
    font-weight: 650;
    letter-spacing: .08em;
    text-transform: uppercase;
  }

  .workspace-nav .workspace-nav-section-head:hover {
    background: var(--aorist-sidebar-hover);
    color: var(--aorist-muted);
  }

  .workspace-nav .workspace-nav-section-head :global(svg) {
    transform: rotate(0deg);
    transition: transform 0.16s ease;
  }

  .workspace-nav .workspace-nav-section-head.collapsed :global(svg) {
    transform: rotate(-90deg);
  }

  .workspace-nav .workspace-nav-section-head span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .brand-copy span,
  .sidebar__user em {
    font-size: 10px;
    font-weight: 450;
  }

  .sidebar-project-head {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) auto 24px;
    align-items: center;
    gap: 2px;
    padding: 0 8px 2px 4px;
  }

  .workspace-nav .sidebar-project-head h2 {
    padding-left: 4px;
  }

  .sidebar-project-folder-input {
    display: none;
  }

  .workspace-nav .sidebar-project-section-toggle,
  .workspace-nav .sidebar-project-icon,
  .workspace-nav .sidebar-project-rename,
  .workspace-nav .sidebar-project-action {
    border-radius: 6px;
    color: #666666;
  }

  .sidebar-project-section-toggle :global(svg) {
    transform: rotate(-90deg);
    transition: transform 0.16s ease;
  }

  .sidebar-project-section-toggle.expanded :global(svg) {
    transform: rotate(0deg);
  }

  .workspace-nav .sidebar-project-sort {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 22px;
    padding: 0 6px;
    border: 1px solid transparent;
    border-radius: 7px;
    color: #666666;
    font-size: 10px;
    font-weight: 500;
  }

  .workspace-nav .sidebar-project-sort:hover,
  .workspace-nav .sidebar-project-section-toggle:hover,
  .workspace-nav .sidebar-project-icon:hover,
  .workspace-nav .sidebar-project-rename:hover,
  .workspace-nav .sidebar-project-action:hover {
    background: #ececec;
    color: #222222;
  }

  .sidebar-project-row {
    grid-template-columns: 20px minmax(0, 1fr) 22px 22px;
    min-height: 34px;
    padding: 1px 2px;
  }

  .workspace-nav .sidebar-project-disclosure {
    width: 20px;
    height: 26px;
  }

  .workspace-nav .sidebar-project-rename {
    width: 22px;
    height: 26px;
    opacity: 1;
  }

  .workspace-nav .sidebar-project-open {
    grid-template-columns: 15px minmax(0, 1fr);
    gap: 6px;
    height: 32px;
  }

  .workspace-nav .sidebar-project-open .sidebar-project-label {
    display: grid;
    gap: 1px;
    min-width: 0;
    overflow: hidden;
  }

  .workspace-nav .sidebar-project-open .sidebar-project-label strong,
  .workspace-nav .sidebar-conversation-row span {
    min-width: 0;
    overflow: hidden;
    color: inherit;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .workspace-nav .sidebar-project-inline-rename {
    border: 1px solid #d4d4d8;
    border-radius: 7px;
    background: #ffffff;
  }

  .workspace-nav .sidebar-project-inline-rename :global(svg) {
    color: #52525b;
  }

  .sidebar-project-inline-rename input {
    min-width: 0;
    width: 100%;
    height: 22px;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: #222222;
    font: inherit;
    font-size: 12px;
    font-weight: 500;
  }

  .workspace-nav .sidebar-conversation-row {
    min-height: 26px;
  }

  .workspace-nav .sidebar-project-dock .sidebar-project-row {
    grid-template-columns: 22px minmax(0, 1fr) 22px 22px;
    column-gap: 2px;
  }

  .workspace-nav .sidebar-project-dock .sidebar-project-disclosure,
  .workspace-nav .sidebar-project-dock .sidebar-project-rename,
  .workspace-nav .sidebar-project-dock .sidebar-project-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    justify-self: center;
    width: 22px;
    height: 28px;
    min-width: 22px;
    min-height: 28px;
    padding: 0;
  }

  .workspace-nav .sidebar-project-dock .sidebar-project-open {
    grid-template-columns: 18px minmax(0, 1fr);
    min-height: 32px;
    padding: 0;
  }

  .workspace-nav .sidebar-project-dock .sidebar-project-open > :global(svg),
  .workspace-nav .sidebar-project-dock .sidebar-conversation-row > :global(svg) {
    justify-self: center;
    align-self: center;
  }

  .workspace-nav .sidebar-project-dock .sidebar-conversation-row {
    grid-template-columns: 18px minmax(0, 1fr) 22px 22px;
    min-height: 26px;
  }

  .sidebar-project-list {
    gap: 6px;
  }

  .sidebar-project-group {
    gap: 3px;
  }

  .sidebar-conversation-list {
    gap: 2px;
    margin: 3px 8px 8px 34px;
  }

  .workspace-nav .sidebar-conversation-row em {
    font-size: 10px;
    font-weight: 400;
  }

  .sidebar__user-wrap {
    display: flex;
    justify-content: flex-start;
    padding: 6px 8px 10px;
  }

  .user-menu {
    left: 8px;
    right: auto;
    bottom: 48px;
    width: 176px;
  }

  .sidebar__user-wrap {
    display: block;
    padding: 6px 8px 10px;
  }

  .sidebar__user-wrap .sidebar__user.sidebar__profile {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    column-gap: 8px;
    width: 100%;
    min-height: 40px;
    margin: 0;
    padding: 6px 8px;
    border: 1px solid #dddddd;
    border-radius: 8px;
    background: #ffffff;
    color: #222222;
    text-align: left;
    box-shadow: none;
  }

  .sidebar__user-wrap .sidebar__user.sidebar__profile:hover,
  .sidebar__user-wrap .sidebar__user.sidebar__profile:focus-visible {
    border-color: #c8c8c8;
    background: #ececec;
  }

  .sidebar__profile .sidebar__avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    min-width: 28px;
    border-radius: 999px;
    background: #eeeeee;
    color: #222222;
  }

  .sidebar__profile strong,
  .sidebar__profile em {
    display: block;
    min-width: 0;
    overflow: hidden;
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sidebar__profile strong {
    font-size: 12px;
    font-weight: 560;
  }

  .sidebar__profile em {
    margin-top: 2px;
    color: #777777;
    font-size: 10px;
    font-style: normal;
    font-weight: 450;
  }

  .sidebar__profile em[hidden] {
    display: none;
  }

  .sidebar__user-wrap .user-menu {
    right: 8px;
    width: auto;
  }

  .shell.is-sidebar-collapsed .sidebar__user-wrap {
    display: flex;
    justify-content: center;
  }

  .shell.is-sidebar-collapsed .sidebar__user-wrap .sidebar__user.sidebar__profile {
    display: inline-flex;
    justify-content: center;
    width: 32px;
    min-width: 32px;
    height: 32px;
    min-height: 32px;
    padding: 0;
  }

  .shell.is-sidebar-collapsed .sidebar__profile strong,
  .shell.is-sidebar-collapsed .sidebar__profile em {
    display: none;
  }

  .shell.is-sidebar-collapsed .sidebar__profile .sidebar__avatar {
    width: 20px;
    height: 20px;
    min-width: 20px;
    background: transparent;
  }

  .automation-console {
    display: grid;
    gap: 12px;
  }

  .automation-overview {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .automation-overview article {
    border: 1px solid #dddddd;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: none;
  }

  .automation-overview article {
    padding: 14px;
  }

  .automation-overview span,
  .automation-overview em {
    display: block;
    color: #777777;
    font-size: 11px;
    font-style: normal;
    font-weight: 600;
  }

  .automation-overview strong {
    display: block;
    margin: 7px 0 2px;
    color: #1f1f1f;
    font-size: 22px;
    letter-spacing: 0;
  }

  .automation-layout {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
    align-items: start;
  }

  .automation-task-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .automation-task-card {
    display: grid;
    gap: 10px;
    min-height: 248px;
    padding: 14px;
  }

  .automation-task-card.active,
  .automation-task-card:focus-visible {
    border-color: #222222;
    box-shadow: 0 0 0 3px rgba(34, 34, 34, 0.08);
  }

  .automation-task-card header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .automation-task-card header span,
  .automation-task-card header em {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    margin: 0;
    padding: 0 8px;
    border: 1px solid #dddddd;
    border-radius: 999px;
    background: #f4f4f5;
    color: #444444;
    font-size: 11px;
    font-style: normal;
    font-weight: 600;
  }

  .automation-task-card header em {
    background: #222222;
    color: #ffffff;
  }

  .automation-task-card strong {
    color: #1f1f1f;
    font-size: 15px;
    line-height: 1.3;
  }

  .automation-task-card p {
    margin: 0;
    color: #666666;
    font-size: 13px;
    line-height: 1.55;
  }

  .automation-task-card dl {
    display: grid;
    grid-template-columns: 68px minmax(0, 1fr);
    gap: 5px 10px;
    margin: 0;
    color: #777777;
    font-size: 12px;
  }

  .automation-task-card dd {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: #222222;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .automation-step-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .automation-step-strip b {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 0 7px;
    border: 1px solid #e4e4e7;
    border-radius: 6px;
    background: #fafafa;
    color: #52525b;
    font-size: 11px;
    font-weight: 500;
  }

  .automation-task-card footer {
    display: flex;
    justify-content: flex-end;
    gap: 7px;
    margin-top: auto;
  }

  .automation-config-modal {
    width: min(780px, calc(100vw - 44px));
  }

  @media (max-width: 720px) {
    .automation-overview,
    .automation-task-list {
      grid-template-columns: 1fr;
    }
  }

  .agent-assistant-page {
    --agent-assistant-content-width: 840px;
  }

  .agent-assistant-shell {
    display: grid;
    grid-template-columns: minmax(0, var(--agent-assistant-content-width));
    align-content: center;
    align-items: start;
    justify-content: center;
    justify-items: stretch;
  }

  .agent-assistant-center,
  .agent-compose-card,
  .agent-assistant-disclaimer {
    width: 100%;
    margin-right: 0;
    margin-left: 0;
  }

  .agent-selector__trigger {
    background: transparent;
    box-shadow: none;
  }

  .agent-selector__trigger:hover {
    background: transparent;
  }

  .agent-compose-card {
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .agent-compose-card :global(.composer) {
    width: 100%;
    border-color: #d4d4d8;
    border-radius: 12px;
    box-shadow: none;
  }

  .agent-compose-card :global(.composer:focus-within) {
    border-color: #222222;
    box-shadow: 0 0 0 2px rgba(34, 34, 34, 0.12);
  }

  .agent-compose-card :global(.composer.composer--code),
  .agent-compose-card :global(.composer.composer--work) {
    border-color: var(--composer-mode-border);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--composer-mode-soft) 72%, #ffffff), var(--composer-mode-surface) 42%, #ffffff 100%);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--composer-mode-accent) 8%, transparent),
      0 12px 32px var(--composer-mode-shadow);
  }

  .agent-compose-card :global(.composer.composer--code:focus-within),
  .agent-compose-card :global(.composer.composer--work:focus-within) {
    border-color: color-mix(in srgb, var(--composer-mode-accent) 56%, var(--composer-mode-border));
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--composer-mode-accent) 18%, transparent),
      0 14px 34px var(--composer-mode-shadow);
  }

  .aorist-page:not(.new-task-page) > .aorist-toolbar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    min-height: 36px;
    margin-bottom: 12px;
  }

  .aorist-page:not(.new-task-page) > .aorist-toolbar > div:first-child {
    display: none;
  }

  .aorist-page:not(.new-task-page) > .aorist-toolbar > div:not(:first-child) {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }

  .aorist-page:not(.new-task-page) > .aorist-toolbar.agent-center-toolbar {
    justify-content: space-between;
    gap: 14px;
  }

  .agent-center-toolbar > .aorist-search {
    flex: 1 1 360px;
    max-width: 448px;
    margin: 0;
  }

  .aorist-page:not(.new-task-page) > .agent-center-toolbar > div:not(:first-child) {
    flex: 0 0 auto;
    align-items: center;
  }

  .capability-console > .capability-hub-header {
    grid-template-columns: minmax(260px, 1fr) auto;
    gap: 10px;
    margin-bottom: 12px;
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
  }

  .capability-console > .capability-hub-header > .capability-hub-header__title {
    display: none;
  }

  .capability-console > .capability-hub-header > .capability-search {
    grid-column: 1;
  }

  .capability-console > .capability-hub-header > .capability-hub-header__actions {
    grid-column: 2;
    justify-content: flex-end;
  }

  @media (max-width: 1080px) {
    .capability-console > .capability-hub-header {
      grid-template-columns: 1fr;
    }

    .capability-console > .capability-hub-header > .capability-hub-header__actions {
      grid-column: 1;
      justify-content: flex-start;
    }
  }

  @media (max-width: 720px) {
    .aorist-page:not(.new-task-page) > .aorist-toolbar,
    .aorist-page:not(.new-task-page) > .aorist-toolbar > div:not(:first-child) {
      justify-content: flex-start;
    }

    .aorist-page:not(.new-task-page) > .aorist-toolbar.agent-center-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .agent-center-toolbar > .aorist-search {
      width: 100%;
      max-width: none;
    }
  }

  .shell {
    --search-height: 36px;
    --search-radius: 8px;
    --search-border: #d4d4d8;
    --search-bg: #ffffff;
    --search-icon: #777777;
    --search-placeholder: #8e8e93;
    --search-focus: #222222;
  }

  .management-search,
  .capability-search,
  .team-builder-search,
  .aorist-search {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--search-height);
    padding: 0 10px;
    border: 1px solid var(--search-border);
    border-radius: var(--search-radius);
    background: var(--search-bg);
    color: var(--search-icon);
    box-shadow: none;
  }

  .management-search :global(svg),
  .capability-search :global(svg),
  .team-builder-search :global(svg),
  .aorist-search :global(svg) {
    position: static;
    flex: 0 0 auto;
    color: var(--search-icon);
    pointer-events: none;
  }

  .management-search input,
  .capability-search input,
  .team-builder-search input,
  .aorist-search input {
    min-width: 0;
    width: 100%;
    height: calc(var(--search-height) - 2px);
    min-height: calc(var(--search-height) - 2px);
    padding: 0;
    border: 0;
    border-radius: 0;
    outline: 0;
    background: transparent;
    color: var(--aorist-ink);
    box-shadow: none;
    font-size: 13px;
    font-weight: 400;
  }

  .aorist-search {
    max-width: 448px;
    margin-bottom: 16px;
  }

  .management-search input::placeholder,
  .capability-search input::placeholder,
  .team-builder-search input::placeholder,
  .aorist-search input::placeholder {
    color: var(--search-placeholder);
  }

  .management-search:focus-within,
  .capability-search:focus-within,
  .team-builder-search:focus-within,
  .aorist-search:focus-within {
    border-color: var(--search-focus);
    box-shadow: 0 0 0 3px rgba(34, 34, 34, 0.12);
  }

  .agent-market-modal {
    width: min(960px, calc(100vw - 44px));
  }

  .agent-market-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    margin: 14px 0;
  }

  .agent-market-search {
    max-width: none;
    margin: 0;
  }

  .agent-market-stats {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: #666666;
    font-size: 12px;
    white-space: nowrap;
  }

  .agent-market-stats span {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0 9px;
    border: 1px solid #dddddd;
    border-radius: 7px;
    background: #f7f7f8;
  }

  .agent-market-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    align-items: start;
    max-height: min(55vh, 520px);
    overflow: auto;
    padding-right: 2px;
  }

  .agent-market-card {
    display: grid;
    align-self: start;
    gap: 10px;
    padding: 14px;
    border: 1px solid #dddddd;
    border-radius: 8px;
    background: #ffffff;
  }

  .agent-market-card.downloaded {
    border-color: #c8c8c8;
    background: #f7f7f8;
  }

  .agent-market-card header {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    gap: 9px;
    align-items: start;
  }

  .agent-market-card header > span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: #eeeeee;
    color: #222222;
  }

  .agent-market-card strong,
  .agent-market-empty strong {
    display: block;
    color: #222222;
    font-size: 14px;
    line-height: 1.25;
  }

  .agent-market-card em,
  .agent-market-card p,
  .agent-market-card small,
  .agent-market-empty p {
    margin: 0;
    color: #666666;
    font-size: 12px;
    font-style: normal;
    line-height: 1.55;
  }

  .agent-market-card b {
    padding: 3px 7px;
    border: 1px solid #dddddd;
    border-radius: 999px;
    color: #444444;
    font-size: 11px;
  }

  .agent-market-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .agent-market-tags span {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 0 7px;
    border: 1px solid #e4e4e7;
    border-radius: 6px;
    background: #fafafa;
    color: #52525b;
    font-size: 11px;
    white-space: nowrap;
  }

  .agent-market-card footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .agent-market-card footer button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 11px;
    border: 1px solid #222222;
    border-radius: 7px;
    background: #222222;
    color: #ffffff;
    font-size: 12px;
    font-weight: 650;
    white-space: nowrap;
  }

  .agent-market-card footer button.downloaded {
    border-color: #d4d4d8;
    background: #eeeeee;
    color: #222222;
  }

  .agent-market-empty {
    grid-column: 1 / -1;
    display: grid;
    place-items: center;
    gap: 8px;
    min-height: 180px;
    border: 1px dashed #d4d4d8;
    border-radius: 8px;
    color: #777777;
    text-align: center;
  }

  @media (max-width: 760px) {
    .agent-market-toolbar,
    .agent-market-grid {
      grid-template-columns: 1fr;
    }

    .agent-market-stats {
      justify-content: flex-start;
    }
  }

  .sidebar__brand {
    grid-template-columns: 34px minmax(0, 1fr) auto 30px;
  }

  .brand-workbench-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    min-width: 34px;
    height: 34px;
    min-height: 34px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 11px;
    background: #f4f4f4;
    color: #525a66;
  }

  .brand-workbench-button:hover {
    background: #eceff3;
    color: #222222;
  }

  .brand-workbench-button.active {
    border-color: #222222;
    background: #222222;
    color: #ffffff;
  }

  .brand-workbench-button :global(svg) {
    flex: 0 0 auto;
    color: currentColor;
  }

  .shell.is-sidebar-collapsed .brand-workbench-button {
    display: none;
  }

  /* Workspace spacing and calmer weight */
  .shell .aorist-workbench {
    font-weight: 400;
  }

  .shell .aorist-workbench[data-current-work-layer]:not([data-current-work-layer="today"]) .aorist-page {
    padding: 28px 48px 46px;
  }

  .shell .aorist-workbench[data-current-work-layer]:not([data-current-work-layer="today"]) .aorist-toolbar {
    margin-bottom: 22px;
    padding: 18px 20px;
  }

  .shell .aorist-card-grid,
  .shell .aorist-list,
  .shell .automation-overview,
  .shell .automation-task-list {
    gap: 18px;
  }

  .shell .management-card,
  .shell .automation-task-card,
  .shell .agent-card,
  .shell .media-card,
  .shell .capability-item,
  .shell .aorist-list article,
  .shell .aorist-card {
    padding: 18px;
  }

  .shell .workspace-nav {
    padding-inline: 10px;
  }

  .shell .workspace-nav section {
    margin-bottom: 5px;
  }

  .shell .workspace-nav button {
    min-height: 30px;
    margin: 0 4px;
    border-radius: 8px;
  }

  .shell .workspace-nav h2 {
    padding-top: 4px;
    padding-bottom: 3px;
  }

  .shell .workspace-nav .workspace-nav-section-head {
    min-height: 26px;
    margin-top: 1px;
    margin-bottom: 1px;
  }

  .shell .sidebar-project-dock {
    margin-top: 4px;
  }

  .shell .sidebar-project-list {
    gap: 6px;
  }

  .shell .sidebar-project-group {
    gap: 3px;
  }

  .shell .sidebar-conversation-list {
    gap: 3px;
    margin-top: 4px;
    margin-bottom: 8px;
  }

  .shell .workspace-nav h2,
  .shell .stage-topbar span,
  .shell .aorist-toolbar span,
  .shell .hero-panel span,
  .shell .wizard-preview > span {
    font-weight: 420;
    letter-spacing: 0.04em;
  }

  .shell .stage-topbar strong,
  .shell .aorist-toolbar strong,
  .shell .aorist-card header strong,
  .shell .management-card__body strong,
  .shell .automation-task-card strong,
  .shell .agent-card header strong,
  .shell .media-card strong,
  .shell .capability-item strong,
  .shell .todo-row strong,
  .shell .automation-row strong,
  .shell .project-detail-card h3,
  .shell .project-detail-aside h3,
  .shell .customer-detail-card h3,
  .shell .customer-detail-aside h3 {
    font-weight: 520;
  }

  .shell .aorist-stats strong,
  .shell .hero-panel h1 {
    font-weight: 560;
  }

  .shell .aorist-workbench button,
  .shell .workspace-nav button,
  .shell .capability-tabs button,
  .shell .project-detail-actions button,
  .shell .customer-detail-primary,
  .shell .customer-detail-card header button,
  .shell .automation-task-card header em,
  .shell .aorist-list span,
  .shell .todo-row b,
  .shell .automation-row b {
    font-weight: 480;
  }

  .shell .aorist-workbench p,
  .shell .aorist-workbench em,
  .shell .aorist-workbench span,
  .shell .project-detail-row p,
  .shell .management-card__body p {
    font-weight: 400;
  }

  @media (max-width: 980px) {
    .shell .aorist-workbench[data-current-work-layer]:not([data-current-work-layer="today"]) .aorist-page {
      padding: 22px 28px 40px;
    }
  }

  .shell:not(.is-sidebar-collapsed) {
    --sidebar-width: clamp(240px, 13vw, 280px);
  }

  .shell:not(.is-sidebar-collapsed) .sidebar--aorist {
    width: var(--sidebar-width);
    min-width: var(--sidebar-width);
  }

  /* Pin user profile to the lower-left corner */
  .shell .sidebar--aorist {
    display: flex;
    flex-direction: column;
    height: 100vh;
    max-height: 100vh;
    min-height: 0;
    overflow: hidden;
  }

  .shell .sidebar__brand {
    flex: 0 0 auto;
  }

  .shell .workspace-nav {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding-bottom: 14px;
  }

  .shell .sidebar__user-wrap {
    flex: 0 0 auto;
    margin-top: auto;
    padding: 10px 12px 12px;
    border-top: 1px solid #e4e4e7;
    background: hsl(220 20% 98%);
  }

  .shell .sidebar__user-wrap .sidebar__user.sidebar__profile {
    min-height: 42px;
  }

  .shell .sidebar__user-wrap .user-menu {
    left: 12px;
    right: 12px;
    bottom: 62px;
    width: auto;
  }

  /* Project dock follows the wider desktop sidebar rhythm. */
  .shell .sidebar-project-dock {
    margin-top: 6px;
    padding: 8px 7px 0;
  }

  .shell .sidebar-project-head {
    min-height: 24px;
    padding: 0 4px 4px;
  }

  .shell .workspace-nav .sidebar-project-head h2 {
    color: #8a8f86;
    font-size: 13px;
    font-weight: 430;
  }

  .shell .sidebar-project-list {
    gap: 6px;
  }

  .shell .sidebar-project-group {
    gap: 2px;
  }

  .shell .workspace-nav .sidebar-project-dock .sidebar-project-row {
    grid-template-columns: 20px minmax(0, 1fr) 24px 24px;
    column-gap: 4px;
    min-height: 31px;
    border-radius: 8px;
  }

  .shell .workspace-nav .sidebar-project-dock .sidebar-project-open {
    grid-template-columns: 20px minmax(0, 1fr);
    min-height: 31px;
    gap: 6px;
  }

  .shell .workspace-nav .sidebar-project-dock .sidebar-project-disclosure,
  .shell .workspace-nav .sidebar-project-dock .sidebar-project-rename,
  .shell .workspace-nav .sidebar-project-dock .sidebar-project-action {
    width: 24px;
    height: 28px;
    min-width: 24px;
    min-height: 28px;
  }

  .shell .sidebar-conversation-list {
    gap: 1px;
    margin: 2px 7px 6px 32px;
  }

  .shell .workspace-nav .sidebar-project-dock .sidebar-conversation-row {
    display: grid;
    position: relative;
    grid-template-columns: minmax(0, 1fr) 22px 22px;
    column-gap: 2px;
    align-items: center;
    width: 100%;
    min-height: 26px;
    padding: 0 2px 0 0;
    border-radius: 7px;
    color: inherit;
    text-align: left;
  }

  .shell .workspace-nav .sidebar-conversation-open {
    grid-column: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-height: 26px;
    min-width: 0;
    margin: 0;
    padding: 0 6px 0 0;
    text-align: left;
  }

  .shell .workspace-nav .sidebar-project-dock .sidebar-conversation-row > .sidebar-conversation-action:nth-of-type(2) {
    grid-column: 2;
  }

  .shell .workspace-nav .sidebar-project-dock .sidebar-conversation-row > .sidebar-conversation-action:nth-of-type(3) {
    grid-column: 3;
  }

  .shell .workspace-nav .sidebar-conversation-open span {
    font-size: 12px;
    font-weight: 500;
    line-height: 1.15;
  }

  .shell .workspace-nav .sidebar-conversation-row em {
    min-width: 0;
    padding: 0;
    background: transparent;
    color: var(--aorist-faint);
    font-size: 10px;
    font-weight: 400;
    font-style: normal;
    white-space: nowrap;
  }

  .shell .workspace-nav .sidebar-project-dock .sidebar-conversation-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: center;
    width: 22px;
    height: 24px;
    min-width: 22px;
    padding: 0;
    border-radius: 6px;
    color: var(--aorist-faint);
    opacity: 0.72;
  }

  .shell .workspace-nav .sidebar-project-dock .sidebar-conversation-row:hover,
  .shell .workspace-nav .sidebar-project-dock .sidebar-conversation-row:focus-within {
    background: var(--aorist-sidebar-hover);
  }

  .shell .workspace-nav .sidebar-project-dock .sidebar-conversation-action:hover {
    background: transparent;
    color: var(--aorist-ink);
    opacity: 1;
  }

  .shell .workspace-nav .sidebar-project-dock .sidebar-conversation-action.danger:hover {
    color: #b42318;
  }

  .shell.is-sidebar-collapsed .sidebar__user-wrap {
    padding-inline: 8px;
  }

  /* Customer detail header after upstream refresh */
  .shell .customer-detail-modal > .customer-detail-head {
    display: grid;
    grid-template-columns: 36px 72px minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 14px;
  }

  .shell .customer-detail-modal > .customer-detail-head > .client-avatar--large {
    justify-self: center;
  }

  .shell .customer-detail-title {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    min-width: 0;
    gap: 12px;
  }

  .shell .customer-detail-title > div {
    min-width: 0;
  }

  .shell .customer-detail-name-row {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 8px;
  }

  .shell .customer-detail-name-row strong {
    min-width: 0;
    max-width: min(420px, 46vw);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 560;
  }

  .shell .customer-detail-name-row em {
    flex: 0 0 auto;
    min-height: 20px;
    padding: 2px 7px;
    font-size: 10.5px;
    font-weight: 520;
  }

  .shell .customer-detail-primary,
  .shell .customer-detail-card header button {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: auto;
    min-width: 104px;
    min-height: 34px;
    padding: 0 14px;
    border-radius: 10px;
    line-height: 1;
    white-space: nowrap;
    writing-mode: horizontal-tb;
    text-orientation: mixed;
  }

  .shell .customer-detail-primary {
    justify-self: end;
    border-color: #222222;
    background: #222222;
    color: #ffffff;
  }

  .shell .customer-detail-primary :global(svg),
  .shell .customer-detail-card header button :global(svg) {
    flex: 0 0 auto;
  }

  /* Detail headers and action buttons after upstream refresh */
  .shell .project-detail-modal > .project-detail-head {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 14px;
  }

  .shell .project-detail-title {
    display: block;
    min-width: 0;
  }

  .shell .project-detail-title > div {
    min-width: 0;
  }

  .shell .project-detail-name-row {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 8px;
  }

  .shell .project-detail-name-row strong {
    min-width: 0;
    max-width: min(460px, 44vw);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 560;
  }

  .shell .project-detail-name-row em {
    flex: 0 0 auto;
    min-height: 20px;
    padding: 2px 7px;
    font-size: 10.5px;
    font-weight: 520;
  }

  .shell .project-detail-actions {
    display: flex;
    justify-self: end;
    align-items: center;
    flex-wrap: nowrap;
    gap: 8px;
  }

  .shell .project-detail-actions button,
  .shell .project-section-head button,
  .shell .project-resource-toolbar button,
  .shell .customer-section-head button,
  .shell .customer-resource-toolbar button,
  .shell .management-primary,
  .shell .aorist-toolbar button {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: auto;
    min-width: auto;
    min-height: 32px;
    padding: 0 11px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
    writing-mode: horizontal-tb;
    text-orientation: mixed;
  }

  .shell .project-detail-actions button :global(svg),
  .shell .project-section-head button :global(svg),
  .shell .customer-section-head button :global(svg),
  .shell .management-primary :global(svg),
  .shell .aorist-toolbar button :global(svg) {
    flex: 0 0 auto;
  }

  .shell .project-detail-actions button:first-child {
    border-color: var(--aorist-line);
    background: var(--aorist-card-bg);
    color: var(--aorist-ink);
  }

  .shell .project-detail-actions button:last-child,
  .shell .management-primary {
    border-color: #222222;
    background: #222222;
    color: #ffffff;
  }

  /* Detail modal scroll safety */
  .shell .detail-modal.project-detail-modal,
  .shell .detail-modal.customer-detail-modal {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: min(1120px, calc(100vw - 44px));
    height: min(860px, calc(100vh - 44px));
    max-height: calc(100vh - 44px);
    padding: 0;
    overflow: hidden;
  }

  .shell .detail-modal > .project-detail-head,
  .shell .detail-modal > .customer-detail-head {
    position: relative;
    top: auto;
    z-index: 2;
    margin: 0;
  }

  .shell .detail-modal > .detail-panel {
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 26px 28px 72px;
    scroll-padding-bottom: 72px;
  }

  .shell .detail-modal > .detail-panel::after {
    content: "";
    display: block;
    height: 24px;
  }

  .shell .customer-detail-body,
  .shell .project-detail-body {
    min-height: 0;
  }

  @media (max-width: 980px) {
    .shell .detail-modal.project-detail-modal,
    .shell .detail-modal.customer-detail-modal {
      width: min(100vw - 24px, 1120px);
      height: calc(100vh - 28px);
      max-height: calc(100vh - 28px);
    }

    .shell .detail-modal > .detail-panel {
      padding: 20px 18px 64px;
      scroll-padding-bottom: 64px;
    }
  }

  /* Wails desktop click safety */
  .shell .sidebar--aorist,
  .shell .sidebar--aorist *,
  .shell .workspace-nav,
  .shell .workspace-nav *,
  .shell .sidebar__user-wrap,
  .shell .sidebar__user-wrap *,
  .shell .brand-workbench-button,
  .shell .sidebar__icon {
    --wails-draggable: no-drag;
  }

  /* Capability panel: remove duplicated catalog heading block */
  .shell .capability-panel.capability-market > header {
    display: none;
  }

  :global(.capability-panel.capability-market > header),
  :global(.capability-market > header) {
    display: none !important;
    height: 0 !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    visibility: hidden !important;
  }

  /* Agent wizard layout safety after upstream tab refresh */
  .shell .agent-wizard {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    width: min(1040px, calc(100vw - 56px));
    height: min(720px, calc(100vh - 56px));
    max-height: calc(100vh - 56px);
    padding: 0;
    overflow: hidden;
    border-radius: 16px;
  }

  .shell .agent-wizard__header {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 86px;
    padding: 18px 24px;
  }

  .shell .agent-wizard__header .wizard-avatar {
    flex: 0 0 auto;
    width: 52px;
    height: 52px;
    border-radius: 16px;
    background: #222222;
  }

  .shell .agent-wizard__header > div:nth-child(2) {
    min-width: 0;
    flex: 1 1 auto;
  }

  .shell .agent-wizard__header strong {
    font-size: 18px;
    font-weight: 560;
  }

  .shell .agent-wizard__body {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    min-height: 0;
    overflow: hidden;
  }

  .shell .agent-wizard .wizard-tabs {
    display: grid;
    align-content: start;
    gap: 6px;
    min-width: 0;
    height: 100%;
    margin: 0;
    padding: 18px 14px;
    border: 0;
    border-right: 1px solid var(--aorist-border-divider);
    border-radius: 0;
    background: #f7f8fa;
    box-shadow: none;
  }

  .shell .agent-wizard .wizard-tabs button {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    width: 100%;
    min-height: 36px;
    margin: 0;
    padding: 0 12px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: var(--aorist-muted);
    font-size: 13px;
    font-weight: 500;
    text-align: left;
    box-shadow: none;
  }

  .shell .agent-wizard .wizard-tabs button:hover {
    border-color: var(--aorist-line);
    background: #ffffff;
    color: var(--aorist-ink);
  }

  .shell .agent-wizard .wizard-tabs button.active {
    border-color: var(--aorist-line);
    background: #ffffff;
    color: var(--aorist-ink);
    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.06);
  }

  .shell .agent-wizard .wizard-panel {
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 26px 28px 84px;
  }

  .shell .agent-wizard .wizard-identity {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 28px;
    align-items: start;
  }

  .shell .agent-wizard .wizard-form {
    gap: 18px;
  }

  .shell .agent-wizard .pill-group {
    gap: 8px;
  }

  .shell .agent-wizard .pill-group button {
    min-height: 34px;
    border-radius: 12px;
    font-weight: 480;
  }

  .shell .agent-wizard .pill-group button.active {
    border-color: #222222;
    background: #222222;
    color: #ffffff;
    box-shadow: 0 6px 16px rgba(34, 34, 34, 0.18);
  }

  .shell .agent-wizard .wizard-card-grid button.unavailable {
    cursor: not-allowed;
    opacity: 0.56;
  }

  .shell .agent-wizard .wizard-card-grid button.unavailable:hover {
    border-color: var(--aorist-line);
    background: #ffffff;
    color: inherit;
    box-shadow: none;
  }

  .shell .agent-wizard .wizard-skill-list button.unavailable {
    cursor: not-allowed;
    opacity: 0.56;
  }

  .shell .agent-wizard .wizard-skill-list button.unavailable:hover {
    border-color: var(--aorist-line);
    background: #ffffff;
    box-shadow: none;
  }

  .shell .capability-create-modal .capability-create-tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: min(340px, 100%);
    gap: 3px;
    margin: 10px auto 16px;
    padding: 3px;
    border: 1px solid #d9dde5;
    border-radius: 11px;
    background: #f7f7f8;
  }

  .shell .capability-create-modal .capability-create-tabs button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 30px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #475467;
    font-size: 12px;
    font-weight: 500;
    box-shadow: none;
  }

  .shell .capability-create-modal .capability-create-tabs button.active {
    background: #222222;
    color: #ffffff;
    box-shadow: 0 5px 12px rgba(15, 23, 42, 0.12);
  }

  .shell .agent-wizard .wizard-preview {
    min-width: 0;
    padding-left: 28px;
  }

  .shell .agent-wizard .wizard-preview div {
    margin-top: 18px;
    padding: 28px 22px;
    border-radius: 16px;
  }

  .shell .agent-wizard .wizard-preview b {
    background: #222222;
  }

  .shell .agent-wizard__footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    min-height: 70px;
    padding: 14px 24px;
  }

  @media (max-width: 900px) {
    .shell .agent-wizard__body,
    .shell .agent-wizard .wizard-identity {
      grid-template-columns: 1fr;
    }

    .shell .agent-wizard .wizard-tabs {
      grid-auto-flow: column;
      grid-auto-columns: max-content;
      overflow-x: auto;
      height: auto;
      border-right: 0;
      border-bottom: 1px solid var(--aorist-border-divider);
    }

    .shell .agent-wizard .wizard-preview {
      padding-left: 0;
      border-left: 0;
    }
  }

  /* Final sidebar guard: keep account fixed at lower-left after upstream style refreshes. */
  .shell:not(.is-sidebar-collapsed) {
    --sidebar-width: clamp(232px, 13vw, 268px);
  }

  .shell .sidebar--aorist {
    display: grid !important;
    grid-template-rows: auto minmax(0, 1fr) auto;
    align-content: stretch;
    height: 100vh;
    height: 100dvh;
    max-height: 100vh;
    max-height: 100dvh;
    min-height: 0;
    overflow: hidden !important;
  }

  .shell .sidebar__brand {
    grid-row: 1;
    flex: 0 0 auto;
  }

  .shell .workspace-nav {
    grid-row: 2;
    min-height: 0;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    padding: 8px 8px 10px;
  }

  .shell .workspace-nav section {
    margin-bottom: 6px;
  }

  .shell .workspace-nav h2 {
    margin: 6px 8px 4px;
    font-weight: 430;
  }

  .shell .workspace-nav button {
    min-height: 31px;
    border-radius: 8px;
    font-weight: 420;
  }

  .shell .workspace-nav button span:nth-child(2),
  .shell .workspace-nav .sidebar-project-open .sidebar-project-label strong,
  .shell .workspace-nav .sidebar-conversation-row span {
    font-weight: 430;
  }

  .shell .sidebar__user-wrap {
    position: sticky;
    bottom: 0;
    grid-row: 3;
    z-index: 30;
    flex: 0 0 auto;
    margin-top: 0 !important;
    padding: 10px 12px 12px;
    border-top: 1px solid var(--aorist-border-divider);
    background: var(--aorist-sidebar);
  }

  .shell .sidebar__user-wrap .sidebar__user.sidebar__profile {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    width: 100%;
    min-height: 40px;
    padding: 7px 8px;
    border-radius: 8px;
  }

  .shell .sidebar__profile strong,
  .shell .sidebar__profile em {
    min-width: 0;
    overflow: hidden;
    font-weight: 430;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .shell .sidebar__user-wrap .user-menu {
    left: 12px;
    right: 12px;
    bottom: calc(100% + 8px);
    width: auto;
  }

  .shell .sidebar-project-dock {
    margin-top: 4px;
    padding: 6px 6px 0;
  }

  .shell .sidebar-project-list,
  .shell .sidebar-conversation-list {
    gap: 2px;
  }

  .shell .workspace-nav .sidebar-project-dock .sidebar-project-row {
    grid-template-columns: 20px minmax(0, 1fr) 22px 22px;
    min-height: 29px;
    column-gap: 3px;
  }

  .shell .workspace-nav .sidebar-project-dock .sidebar-conversation-row {
    grid-template-columns: minmax(0, 1fr) 22px 22px;
    min-height: 25px;
  }

  .shell .workspace-nav .sidebar-conversation-open {
    grid-template-columns: minmax(0, 1fr) auto;
    min-width: 0;
  }

  .shell .workspace-nav .sidebar-conversation-open span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .shell .workspace-nav .sidebar-conversation-row em {
    justify-self: end;
    font-weight: 400;
  }

  .shell .workspace-nav .sidebar-project-dock .sidebar-conversation-action {
    width: 22px;
    min-width: 22px;
    height: 24px;
    padding: 0;
  }

  .shell.is-sidebar-collapsed .sidebar--aorist {
    grid-template-rows: auto minmax(0, 1fr) auto;
  }

  .shell.is-sidebar-collapsed .sidebar__user-wrap {
    padding: 8px;
  }

  .shell.is-sidebar-collapsed .sidebar__user-wrap .sidebar__user.sidebar__profile {
    grid-template-columns: 28px;
    justify-content: center;
    padding: 7px;
  }

  .shell .stage.stage--conversation {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .shell .stage.stage--conversation > .stage__surface {
    min-height: 0;
    overflow: hidden;
  }

  .shell .stage__surface--conversation > .conversation-view {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .shell .stage__surface--conversation .conversation {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding-bottom: 18px;
    scroll-padding-bottom: 18px;
  }

  .shell .stage__surface--conversation .conversation :global(.decision-shelf:last-child) {
    margin-bottom: 18px;
  }

  .shell .stage__surface--conversation .conversation-view > .stage__composer {
    position: relative;
    right: auto;
    bottom: auto;
    left: auto;
    z-index: 1;
    flex: 0 0 auto;
    width: min(760px, calc(100% - 96px));
    margin: 0 auto;
    padding: 10px 0 18px;
    transform: none;
  }

  @media (max-width: 980px) {
    .shell .stage__surface--conversation .conversation-view > .stage__composer {
      width: min(100% - 32px, 760px);
      padding-bottom: 12px;
    }
  }

  .shell .workbench-calendar {
    min-width: 0;
    overflow: hidden;
  }

  .shell .workbench-calendar .calendar-mini-grid {
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 5px;
    width: 100%;
    min-width: 0;
    overflow: hidden;
  }

  .shell .workbench-calendar .calendar-mini-grid article {
    display: grid;
    grid-template-rows: auto 1fr;
    place-items: center;
    min-width: 0;
    min-height: 54px;
    padding: 6px 2px;
    overflow: hidden;
  }

  .shell .workbench-calendar .calendar-mini-grid b {
    line-height: 1;
  }

  .shell .workbench-calendar .calendar-mini-grid span {
    display: block;
    box-sizing: border-box;
    width: min(100%, 40px);
    max-width: 100%;
    margin: 5px auto 0;
    padding: 2px 1px;
    overflow: hidden;
    color: #475467;
    background: #eef1f5;
    border-radius: 8px;
    font-size: clamp(8px, 0.62vw, 10px);
    font-weight: 450;
    line-height: 1.25;
    text-align: center;
    white-space: nowrap;
  }

  .model-fetch-panel {
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--aorist-border-divider, #e2e8f0);
    border-radius: 12px;
    background: var(--aorist-card-bg, #ffffff);
  }

  .shell .config-modal:not(.user-panel-modal):not(.detail-modal):not(.model-provider-modal):not(.team-modal):not(.agent-market-modal):not(.capability-detail-modal):not(.capability-create-modal):not(.automation-config-modal):not(.schedule-modal),
  .shell .automation-config-modal {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    width: min(860px, calc(100vw - 32px));
    height: min(680px, calc(100dvh - 32px));
    max-height: calc(100dvh - 32px);
    padding: 0;
    overflow: hidden;
  }

  .shell .automation-config-modal {
    width: min(780px, calc(100vw - 32px));
  }

  .shell .config-modal:not(.user-panel-modal):not(.detail-modal):not(.model-provider-modal):not(.team-modal):not(.agent-market-modal):not(.capability-detail-modal):not(.capability-create-modal):not(.automation-config-modal):not(.schedule-modal) > .config-grid,
  .shell .config-modal:not(.user-panel-modal):not(.detail-modal):not(.model-provider-modal):not(.team-modal):not(.agent-market-modal):not(.capability-detail-modal):not(.capability-create-modal):not(.automation-config-modal):not(.schedule-modal) > .select-list,
  .shell .config-modal:not(.user-panel-modal):not(.detail-modal):not(.model-provider-modal):not(.team-modal):not(.agent-market-modal):not(.capability-detail-modal):not(.capability-create-modal):not(.automation-config-modal):not(.schedule-modal) > .distill-panel,
  .shell .automation-config-modal > .config-grid {
    min-height: 0;
    margin-top: 0;
    overflow: auto;
    overscroll-behavior: contain;
    padding: 16px;
    scrollbar-gutter: stable;
    scroll-padding-bottom: 88px;
  }

  .shell .config-modal:not(.user-panel-modal):not(.detail-modal):not(.model-provider-modal):not(.team-modal):not(.agent-market-modal):not(.capability-detail-modal):not(.capability-create-modal):not(.automation-config-modal):not(.schedule-modal) > footer,
  .shell .automation-config-modal > footer {
    position: relative;
    z-index: 1;
    margin-top: 0;
  }

  .shell .capability-create-modal {
    display: grid;
    grid-template-rows: auto auto minmax(0, auto) auto;
    width: min(760px, calc(100vw - 32px));
    height: auto;
    max-height: min(620px, calc(100dvh - 32px));
    padding: 0;
    overflow: hidden;
  }

  .shell .capability-create-modal > .capability-create-tabs {
    margin: 10px auto 8px;
  }

  .shell .capability-create-modal > .config-grid {
    align-content: start;
    gap: 14px 12px;
    min-height: 0;
    margin-top: 0;
    overflow: auto;
    overscroll-behavior: contain;
    padding: 0 24px 14px;
    scrollbar-gutter: stable;
    scroll-padding-bottom: 72px;
  }

  .shell .capability-create-modal > .capability-create-form label {
    gap: 5px;
  }

  .shell .capability-create-modal > .capability-create-form input,
  .shell .capability-create-modal > .capability-create-form select {
    height: 34px;
  }

  .shell .capability-create-modal > .capability-create-form textarea {
    min-height: 108px;
    max-height: 132px;
    resize: vertical;
  }

  .shell .capability-create-modal > footer {
    position: relative;
    z-index: 1;
    margin-top: 0;
  }

  .shell .agent-market-modal {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    width: min(960px, calc(100vw - 32px));
    height: min(760px, calc(100dvh - 32px));
    max-height: calc(100dvh - 32px);
    padding: 0;
    overflow: hidden;
  }

  .shell .agent-market-modal > .agent-market-toolbar {
    margin: 0;
    padding: 14px 16px;
    border-bottom: 1px solid var(--aorist-border-divider, #e8e8e8);
  }

  .shell .agent-market-modal > .agent-market-grid {
    min-height: 0;
    max-height: none;
    overflow: auto;
    overscroll-behavior: contain;
    padding: 16px;
    scrollbar-gutter: stable;
    scroll-padding-bottom: 88px;
  }

  .shell .agent-market-modal > footer {
    position: relative;
    z-index: 1;
    margin-top: 0;
  }

  .shell .team-modal {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    width: min(680px, calc(100vw - 32px));
    height: min(720px, calc(100dvh - 32px));
    max-height: calc(100dvh - 32px);
    padding: 0;
    overflow: hidden;
  }

  .shell .team-modal .team-builder {
    min-height: 0;
    overflow: hidden;
  }

  .shell .team-modal .team-builder-list,
  .shell .team-modal .team-selected-list {
    min-height: 0;
    max-height: none;
  }

  @supports not (height: 100dvh) {
    .shell .config-modal:not(.user-panel-modal):not(.detail-modal):not(.model-provider-modal):not(.team-modal):not(.agent-market-modal):not(.capability-detail-modal):not(.capability-create-modal):not(.automation-config-modal):not(.schedule-modal),
    .shell .automation-config-modal,
    .shell .capability-create-modal {
      height: min(680px, calc(100vh - 32px));
      max-height: calc(100vh - 32px);
    }

    .shell .agent-market-modal {
      height: min(760px, calc(100vh - 32px));
      max-height: calc(100vh - 32px);
    }

    .shell .team-modal {
      height: min(720px, calc(100vh - 32px));
      max-height: calc(100vh - 32px);
    }
  }

  .model-provider-modal {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    width: min(860px, calc(100vw - 32px));
    height: min(760px, calc(100dvh - 32px));
    max-height: calc(100dvh - 32px);
    padding: 0;
  }

  @supports not (height: 100dvh) {
    .model-provider-modal {
      height: min(760px, calc(100vh - 32px));
      max-height: calc(100vh - 32px);
    }
  }

  .model-provider-modal header p {
    margin: 4px 0 0;
    color: var(--aorist-muted, #667085);
    font-size: 12px;
    line-height: 1.5;
  }

  .model-provider-modal > .config-grid {
    min-height: 0;
    margin-top: 0;
    overflow: auto;
    overscroll-behavior: contain;
    padding: 16px;
    scrollbar-gutter: stable;
    scroll-padding-bottom: 88px;
  }

  .model-provider-modal > footer {
    position: sticky;
    bottom: 0;
    z-index: 1;
    margin-top: 0;
  }

  .model-fetch-panel__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .model-fetch-panel__head strong,
  .model-fetch-panel__head span {
    display: block;
  }

  .model-fetch-panel__head strong {
    color: var(--aorist-ink, #111827);
    font-size: 13px;
    font-weight: 650;
  }

  .model-fetch-panel__head span,
  .model-fetch-actions span {
    margin-top: 3px;
    color: var(--aorist-muted, #667085);
    font-size: 12px;
  }

  .model-fetch-panel__head button,
  .model-fetch-actions button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 11px;
    border: 1px solid var(--aorist-line, #d9dee8);
    border-radius: 10px;
    background: #ffffff;
    color: #344054;
    font-size: 12px;
    font-weight: 650;
  }

  .model-fetch-panel__head button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .model-fetch-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .model-fetch-actions span {
    margin-right: auto;
  }

  .model-fetch-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    max-height: 190px;
    overflow: auto;
  }

  .model-fetch-list label {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 9px 10px;
    border: 1px solid var(--aorist-border-divider, #e2e8f0);
    border-radius: 10px;
    background: #ffffff;
    color: var(--aorist-ink, #111827);
    font-size: 12px;
  }

  .model-fetch-list label.active {
    border-color: #222222;
    background: #f4f4f5;
  }

  .model-fetch-list input {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
  }

  .model-fetch-list span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 720px) {
    .model-fetch-panel__head {
      align-items: flex-start;
      flex-direction: column;
    }

    .model-fetch-list {
      grid-template-columns: 1fr;
    }
  }

  .sidebar__brand {
    grid-template-columns: 28px minmax(0, 1fr) auto 30px;
  }

  .brand-workspace-switch {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px;
    border: 1px solid var(--aorist-line, #d9dee8);
    border-radius: 10px;
    background: #ffffff;
  }

  .brand-code-button,
  .brand-workbench-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    min-width: 30px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 8px;
    background: #ffffff;
    color: var(--aorist-muted, #667085);
  }

  .brand-code-button:hover,
  .brand-workbench-button:hover,
  .brand-code-button.active,
  .brand-workbench-button.active {
    border-color: #222222;
    background: #222222;
    color: #ffffff;
  }

  .code-repo-dock {
    display: grid;
    gap: 4px;
    margin: 8px 8px 12px;
    padding: 10px 12px;
    border: 1px solid var(--aorist-line, #d9dee8);
    border-radius: 10px;
    background: #ffffff;
  }

  .code-repo-dock > span {
    overflow: hidden;
    color: var(--aorist-faint, #98a2b3);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .code-repo-dock strong {
    overflow: hidden;
    color: var(--aorist-ink, #111827);
    font-size: 13px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .code-repo-dock p {
    margin: 0;
    color: var(--aorist-muted, #667085);
    font-size: 11px;
    line-height: 1.45;
  }

  .code-workspace-nav-section {
    margin-bottom: 12px;
  }

  .workspace-nav .code-workspace-nav-item {
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: flex-start;
    min-height: 54px;
    padding-block: 8px;
  }

  .code-workspace-nav-item > span:nth-child(2) {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .code-workspace-nav-item strong,
  .code-workspace-nav-item em {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .code-workspace-nav-item strong {
    color: inherit;
    font-size: 12px;
    font-weight: 650;
  }

  .code-workspace-nav-item em {
    color: var(--aorist-muted, #667085);
    font-size: 10px;
    font-style: normal;
    font-weight: 450;
  }

  .stage-topbar__leading p {
    max-width: 760px;
    margin: 4px 0 0;
    color: var(--aorist-muted, #667085);
    font-size: 12px;
    line-height: 1.45;
  }

  .code-workbench-page {
    padding: 16px;
    background: #f6f8fc;
  }

  .code-workbench-shell {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 12px;
    min-height: 100%;
  }

  .code-workbench-hero {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 16px;
    border: 1px solid var(--aorist-line, #d9dee8);
    border-radius: 8px;
    background: #ffffff;
  }

  .code-workbench-hero > div:first-child {
    min-width: 0;
  }

  .code-workbench-hero span,
  .code-workbench-chat header span {
    display: block;
    color: var(--aorist-faint, #98a2b3);
    font-size: 11px;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .code-workbench-hero strong,
  .code-workbench-chat header strong {
    display: block;
    margin-top: 4px;
    color: var(--aorist-ink, #111827);
    font-size: 20px;
    font-weight: 560;
    line-height: 1.2;
  }

  .code-workbench-hero p,
  .code-workbench-chat header p {
    max-width: 720px;
    margin: 6px 0 0;
    color: var(--aorist-muted, #667085);
    font-size: 13px;
    line-height: 1.55;
  }

  .code-workbench-actions,
  .code-workbench-command-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .code-workbench-actions {
    justify-content: flex-end;
    min-width: min(420px, 42%);
  }

  .code-workbench-actions button,
  .code-workbench-command-row button,
  .code-workbench-chat header button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 11px;
    border: 1px solid var(--aorist-line, #d9dee8);
    border-radius: 8px;
    background: #ffffff;
    color: var(--aorist-ink, #111827);
    font-size: 12px;
    font-weight: 520;
    white-space: nowrap;
  }

  .code-workbench-actions button:first-child,
  .code-workbench-command-row button.active {
    border-color: #2563eb;
    background: #2563eb;
    color: #ffffff;
  }

  .code-workbench-status-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .code-workbench-status-grid button {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    min-width: 0;
    min-height: 58px;
    padding: 10px;
    border: 1px solid var(--aorist-line, #d9dee8);
    border-radius: 8px;
    background: #ffffff;
    color: var(--aorist-ink, #111827);
    text-align: left;
  }

  .code-workbench-status-grid button:hover {
    border-color: #2563eb;
    box-shadow: 0 8px 22px rgba(37, 99, 235, 0.08);
  }

  .code-workbench-status-grid button > :global(svg) {
    color: #2563eb;
  }

  .code-workbench-status-grid span {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .code-workbench-status-grid strong,
  .code-workbench-status-grid em {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .code-workbench-status-grid strong {
    color: var(--aorist-ink, #111827);
    font-size: 12px;
    font-weight: 650;
  }

  .code-workbench-status-grid em {
    color: var(--aorist-muted, #667085);
    font-size: 11px;
    font-style: normal;
  }

  .code-workbench-command-row {
    padding: 4px;
    border: 1px solid var(--aorist-line, #d9dee8);
    border-radius: 8px;
    background: #ffffff;
  }

  .code-workbench-main {
    display: grid;
    grid-template-columns: minmax(280px, 0.36fr) minmax(0, 1fr);
    gap: 12px;
    min-height: 0;
  }

  .code-workbench-chat {
    display: grid;
    grid-template-rows: auto auto minmax(0, auto);
    align-content: start;
    gap: 12px;
    min-width: 0;
    padding: 12px;
    border: 1px solid var(--aorist-line, #d9dee8);
    border-radius: 8px;
    background: #ffffff;
  }

  .code-workbench-chat header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
  }

  .code-workbench-chat header > div {
    min-width: 0;
  }

  .code-workbench-chat__prompts {
    display: grid;
    gap: 8px;
  }

  .code-workbench-chat__prompts button {
    display: grid;
    gap: 4px;
    min-width: 0;
    padding: 10px;
    border: 1px solid #eef2f7;
    border-radius: 8px;
    background: #f8fafc;
    color: var(--aorist-ink, #111827);
    text-align: left;
  }

  .code-workbench-chat__prompts strong,
  .code-workbench-chat__prompts span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .code-workbench-chat__prompts strong {
    font-size: 13px;
    font-weight: 560;
    white-space: nowrap;
  }

  .code-workbench-chat__prompts span {
    color: var(--aorist-muted, #667085);
    font-size: 12px;
    line-height: 1.45;
  }

  .code-workbench-chat :global(.composer) {
    min-height: 170px;
    border-radius: 8px;
    box-shadow: none;
  }

  .code-workbench-chat :global(.composer textarea) {
    min-height: 68px;
  }

  .code-workbench-page :global(.code-layout--workbench) {
    min-width: 0;
  }

  @media (max-width: 1120px) {
    .code-workbench-status-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .code-workbench-main {
      grid-template-columns: 1fr;
    }

    .code-workbench-chat {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 720px) {
    .shell {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr);
      height: 100dvh;
      overflow: hidden;
    }

    .shell .sidebar--aorist {
      grid-row: 1;
      width: 100%;
      min-width: 0;
      height: auto;
      max-height: min(42dvh, 360px);
      border-right: 0;
      border-bottom: 1px solid var(--aorist-line, #d9dee8);
    }

    .shell .sidebar__brand {
      min-height: 52px;
    }

    .shell .workspace-nav {
      max-height: calc(min(42dvh, 360px) - 112px);
      padding-bottom: 8px;
    }

    .shell .sidebar__user-wrap {
      position: relative;
      z-index: 3;
      padding: 8px 12px;
    }

    .shell .stage {
      grid-row: 2;
      min-height: 0;
      padding: 8px;
      overflow: hidden;
    }

    .shell .stage__surface {
      min-height: 0;
    }

    .shell .aorist-page,
    .shell .code-workbench-page {
      min-height: 0;
      height: 100%;
      overflow: auto;
    }

    .shell .modal-backdrop {
      z-index: 90;
    }

    .shell .code-inspector {
      top: 12px;
      right: 12px;
      bottom: 12px;
      left: 12px;
      width: auto;
      min-width: 0;
    }

    .code-workbench-page {
      padding: 12px;
    }

    .brand-copy strong,
    .brand-copy span,
    .code-repo-dock > span,
    .code-repo-dock strong,
    .code-workspace-nav-item strong,
    .code-workspace-nav-item em {
      overflow: visible;
      text-overflow: clip;
      white-space: normal;
      overflow-wrap: anywhere;
    }

    .workspace-nav .code-workspace-nav-item {
      min-height: auto;
    }

    .code-workbench-hero,
    .code-workbench-chat header {
      align-items: stretch;
      flex-direction: column;
    }

    .code-workbench-actions {
      justify-content: flex-start;
      min-width: 0;
    }

    .code-workbench-command-row button {
      flex: 1 1 140px;
    }

    .code-workbench-status-grid {
      grid-template-columns: 1fr;
    }

    .code-workbench-status-grid strong,
    .code-workbench-status-grid em {
      overflow: visible;
      text-overflow: clip;
      white-space: normal;
      overflow-wrap: anywhere;
    }

  }

  .shell.is-sidebar-collapsed .sidebar__brand {
    grid-template-columns: 30px;
  }

  .shell.is-sidebar-collapsed .brand-workspace-switch,
  .shell.is-sidebar-collapsed .code-repo-dock,
  .shell.is-sidebar-collapsed .code-workspace-nav-item em,
  .shell.is-sidebar-collapsed .code-workspace-nav-item strong {
    display: none;
  }

  .knowledge-template-grid{align-items:stretch}.knowledge-template-card{display:grid;grid-template-rows:auto auto 1fr auto auto;gap:10px;min-height:250px}.knowledge-template-card.active{border-color:#111827;background:#fff;box-shadow:0 0 0 3px rgba(17,24,39,.08)}.knowledge-template-card header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0}.knowledge-template-card header em{color:#7b8494;font-size:11px;font-style:normal}.knowledge-template-card dl,.knowledge-detail-panel dl{display:grid;gap:8px;margin:0}.knowledge-template-card dl{grid-template-columns:repeat(2,minmax(0,1fr))}.knowledge-template-card dl div,.knowledge-detail-panel dl div{min-width:0;padding:8px;border:1px solid #edf0f5;border-radius:10px;background:#f8fafc}.knowledge-template-card dt,.knowledge-detail-panel dt{color:#7b8494;font-size:10px}.knowledge-template-card dd,.knowledge-detail-panel dd{margin:3px 0 0;overflow:hidden;color:#111827;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.knowledge-template-card footer{display:flex;justify-content:flex-end;gap:8px}.knowledge-template-card footer button,.knowledge-detail-panel header button,.knowledge-linked-materials article button{min-height:30px;padding:0 10px;border:1px solid #d9dee8;border-radius:9px;background:#fff;color:#344054;font-size:12px;font-weight:600}.knowledge-template-card footer button:last-child,.knowledge-detail-panel header button{border-color:#111827;background:#111827;color:#fff}.knowledge-detail-panel{display:grid;align-content:start;gap:14px}.knowledge-detail-panel header,.knowledge-linked-materials header{display:flex;align-items:center;justify-content:space-between;gap:12px}.knowledge-detail-panel>strong{font-size:22px;line-height:1.25}.knowledge-detail-panel p{margin:0;line-height:1.65}.knowledge-detail-panel dl{grid-template-columns:1fr}.knowledge-linked-materials{display:grid;gap:10px}.knowledge-linked-materials header span{color:#7b8494;font-size:11px;text-transform:uppercase;letter-spacing:.06em}.knowledge-linked-materials header strong{font-size:12px}.knowledge-linked-materials>div{display:grid;gap:8px}.knowledge-linked-materials article{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:8px;padding:10px;border:1px solid #edf0f5;border-radius:10px;background:#fff}.knowledge-linked-materials article div{display:grid;gap:3px;min-width:0}.knowledge-linked-materials article strong,.knowledge-linked-materials article span,.knowledge-linked-materials article em{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.knowledge-linked-materials article strong{font-size:12px}.knowledge-linked-materials article span,.knowledge-linked-materials article em,.knowledge-linked-materials p{color:#667085;font-size:11px;font-style:normal}.template-material-picker{gap:8px}.template-material-picker>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;max-height:220px;overflow:auto;padding:8px;border:1px solid #e5e7eb;border-radius:12px;background:#f8fafc}.template-material-picker button{display:grid;gap:3px;min-width:0;padding:10px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;color:#111827;text-align:left}.template-material-picker button.active{border-color:#111827;background:#f4f4f5;box-shadow:inset 0 0 0 1px #111827}.template-material-picker button strong,.template-material-picker button em{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.template-material-picker button strong{font-size:12px;font-weight:600}.template-material-picker button em,.template-material-picker small,.template-material-picker p{color:#667085;font-size:11px;font-style:normal}.knowledge-template-grid{align-items:stretch}.knowledge-template-card{display:grid;grid-template-rows:auto auto minmax(42px,auto) 1fr auto;gap:10px;height:300px;min-height:300px;box-sizing:border-box;overflow:hidden}.knowledge-template-card p{display:-webkit-box;min-height:42px;max-height:42px;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2}.knowledge-template-card dl{align-self:start}.knowledge-template-card footer{align-self:end}.resource-center:has(.resource-tabs button:first-child.active) .resource-center-topbar{margin-bottom:14px}.resource-center:has(.resource-tabs button:first-child.active){position:relative}.resource-center:has(.resource-tabs button:first-child.active) .resource-center-actions{position:absolute;top:82px;right:86px;z-index:3}.resource-center:has(.resource-tabs button:first-child.active) .resource-section-top{padding-right:320px}.resource-center:has(.resource-tabs button:first-child.active) .resource-section-top .aorist-search{min-width:0}@media(max-width:980px){.resource-center:has(.resource-tabs button:first-child.active) .resource-center-actions{position:static;margin:0 0 12px}.resource-center:has(.resource-tabs button:first-child.active) .resource-section-top{padding-right:0}}.resource-center:has(.resource-tabs button:first-child.active) .aorist-card-grid{grid-template-columns:repeat(3,minmax(0,1fr));justify-content:stretch;align-items:stretch}.resource-center:has(.resource-tabs button:first-child.active) .media-card{width:100%;max-width:none}@media(max-width:1180px){.resource-center:has(.resource-tabs button:first-child.active) .aorist-card-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:720px){.resource-center:has(.resource-tabs button:first-child.active) .aorist-card-grid{grid-template-columns:1fr}}.resource-center:not(:has(.resource-tabs button:first-child.active)) .resource-center-actions{display:none}.knowledge-template-card{grid-template-rows:auto auto minmax(42px,42px) minmax(84px,1fr) 34px;height:324px;min-height:324px}
.knowledge-template-card>strong{display:-webkit-box;min-height:44px;max-height:44px;overflow:hidden;line-height:1.45;text-overflow:ellipsis;word-break:break-all;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2}
.knowledge-template-card footer{align-items:center;min-height:34px;padding-top:2px;overflow:visible}
.knowledge-template-card .knowledge-card-actions{margin-top:0;flex-wrap:nowrap}
.knowledge-template-card footer button{flex:0 0 auto;min-height:30px}
.knowledge-stack section{display:flex;flex-direction:column;max-height:560px;min-height:0;overflow:hidden}
.knowledge-stack section>.aorist-card-grid,.knowledge-stack section>.aorist-list{min-height:0;overflow:auto;padding-right:4px;scrollbar-gutter:stable}
.knowledge-stack section>.aorist-card-grid{align-content:start}
@media(max-width:980px){.knowledge-stack section{max-height:480px}}
.knowledge-template-card{display:flex;flex-direction:column;gap:12px;height:336px;min-height:336px;padding:18px 26px 16px}
.knowledge-template-card header{flex:0 0 auto}
.knowledge-template-card>strong{flex:0 0 auto;min-height:0;max-height:42px}
  .knowledge-template-card p{flex:0 0 auto;min-height:44px;max-height:44px;margin:0;line-height:1.55}
  .knowledge-template-card dl{flex:0 0 auto;gap:12px;margin:0}
  .knowledge-template-card dl div{min-height:58px;padding:10px 12px}
  .knowledge-template-card .knowledge-card-actions{margin-top:auto}
  .search-result-list{display:grid;width:min(1412px,100%);margin:0 auto;gap:28px}
  .search-result-card{display:flex;align-items:center;justify-content:space-between;gap:24px;width:100%;min-height:154px;padding:28px;border:1px solid #e2e5ea;border-radius:16px;background:#fff;box-shadow:0 8px 18px rgba(15,23,42,.035);text-align:left;cursor:pointer;transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease}
  .search-result-card:hover{border-color:#d0d5dd;box-shadow:0 14px 28px rgba(15,23,42,.065);transform:translateY(-1px)}
  .search-result-card:focus-visible{outline:2px solid #1f5fbf;outline-offset:2px}
  .search-result-card div{min-width:0}
  .search-result-card strong{display:block;color:#0f172a;font-size:15px;font-weight:650;line-height:1.35}
  .search-result-card p{margin:8px 0;color:#4b5563;font-size:13px;line-height:1.55}
  .search-result-card em{color:#52627a;font-size:12px;font-style:normal}
  .search-result-card span{flex:0 0 auto;padding:6px 12px;border-radius:999px;background:#f2f3f5;color:#111827;font-size:12px;font-weight:650;white-space:nowrap}
  @media(max-width:920px){.search-result-card{min-height:132px;padding:22px}.search-result-card strong{font-size:14px}.search-result-card p{font-size:12px}}

  .shell .config-modal.schedule-modal{grid-template-rows:auto auto auto;width:min(700px,calc(100vw - 44px));height:auto;min-height:0;max-height:calc(100dvh - 44px);padding:0;overflow:hidden}
  .shell .config-modal.schedule-modal header{padding:16px 22px 12px}
  .shell .config-modal.schedule-modal > .schedule-config-grid{grid-template-columns:minmax(0,1.35fr) minmax(160px,.7fr);gap:12px 14px;margin:0;padding:16px 22px 14px;overflow:visible;scrollbar-gutter:auto}
  .shell .config-modal.schedule-modal .schedule-config-grid label{gap:6px;color:#5f6774;font-size:12px;font-weight:650}
  .shell .config-modal.schedule-modal .schedule-config-grid input,.shell .config-modal.schedule-modal .schedule-config-grid select{height:36px;padding:0 12px;border-radius:10px;background:#fafafa;color:#111827;font-size:13px}
  .shell .config-modal.schedule-modal > footer{margin-top:0;padding:12px 22px;border-top:1px solid #edf0f5;background:#fff}
  .shell .calendar-page > .aorist-stats{grid-template-columns:repeat(3,minmax(0,1fr));width:100%}
  .shell .calendar-page > .aorist-stats article{min-width:0}
  @media(max-width:720px){.shell .calendar-page > .aorist-stats,.shell .config-modal.schedule-modal > .schedule-config-grid{grid-template-columns:1fr}}</style>
