<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    Activity,
    AlertTriangle,
    Archive,
    ArrowLeft,
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
    MessageSquare,
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
  } from "@lucide/svelte";
  import CodeDashboard from "./components/CodeDashboard.svelte";
  import Composer from "./components/Composer.svelte";
  import Transcript from "./components/Transcript.svelte";
  import OIDCLoginOverlay from "./components/OIDCLoginOverlay.svelte";
  import { app, onAgentEvent } from "./lib/bridge";
  import { t } from "./lib/i18n";
  import type {
    ActivityMode,
    CheckpointMeta,
    CommandInfo,
    ContextPanelInfo,
    FilePreview,
    HistoryMessage,
    ModelInfo,
    QuestionAnswer,
    TabMeta,
    TranscriptItem,
    WireApproval,
    WireAsk,
    WireEvent,
    WorkspaceDiffView,
    WorkspaceChangesView,
  } from "./lib/types";


  // Cap the in-memory transcript to prevent unbounded growth during long sessions.
  // Older items are trimmed when the array exceeds this threshold.
  const MAX_TRANSCRIPT_ITEMS = 500;
  type WorkLayer = "today" | "newTask" | "todos" | "automations" | "agents" | "projects" | "customers" | "calendar" | "mockHearing" | "reports" | "regulations" | "library" | "resources" | "teams" | "models" | "settings" | "operationLog" | "search" | "sync" | "ingest" | "capabilities";
  type CapabilityTab = "plugin" | "mcp" | "skill";
  type ResourceTab = "resources" | "knowledge" | "search" | "conversationArchive" | "ingest";
  type CustomerDetailTab = "overview" | "projects" | "materials" | "schedules" | "todos";
  type ProjectDetailTab = "overview" | "materials" | "schedules" | "reports" | "todos";
  type AgentCard = { id: string; name: string; role: string; runs: number; status: string; desc: string };
  type AgentMarketItem = AgentCard & { category: string; source: string; version: string; tags: string[]; localPath: string };
  type SidebarConversation = { id: string; title: string; updatedAt: string; archivedAtMs?: number };
  type SidebarProject = { id: string; name: string; expanded: boolean; conversations: SidebarConversation[]; localPath?: string; updatedAtMs: number };
  type SidebarProjectSort = "recent" | "name" | "conversations";
  type ConfigDialog = "schedule" | "todo" | "report" | "model" | "ingest" | "resource" | "template" | "project" | "customer" | "hearing" | "team" | "dossier" | "selectProject" | "selectCustomer" | "distill";
  type UserPanelDialog = "models" | "settings" | "sync" | "operationLog";

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
  let workPermission = $state("auto-approve");
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
  let workLayer = $state<WorkLayer>("today");
  let capabilityTab = $state<CapabilityTab>("plugin");
  let capabilitySearch = $state("");
  let selectedCapabilityId = $state("git-panel");
  let capabilityDetailOpen = $state(false);
  let capabilityCreateOpen = $state(false);
  let resourceTab = $state<ResourceTab>("resources");
  let resourceSearch = $state("");
  let collapsedWorkspaceSections = $state<string[]>([]);
  let userMenuOpen = $state(false);
  let agentSelectorOpen = $state(false);
  let userPanelDialog = $state<UserPanelDialog | undefined>();
  let teamViewMode = $state<"teams" | "office" | "chat">("teams");
  let teamConfigTitle = $state<string | undefined>();
  let teamBuilderName = $state("");
  let teamBuilderSearch = $state("");
  let teamBuilderMemberIds = $state<string[]>(["code-review", "research"]);
  let teamBuilderLeaderId = $state("code-review");
  let teamChatInput = $state("");
  let teamChatModel = $state("GPT-4o");
  let teamChatAttachments = $state<string[]>([]);
  let teamChatSending = $state(false);
  let automationDialog = $state<string | undefined>();
  let agentWizardOpen = $state(false);
  let agentMarketOpen = $state(false);
  let agentMarketSearch = $state("");
  let downloadedMarketAgentIds = $state<string[]>([]);
  let agentWizardTab = $state("identity");
  let selectedAgentId = $state("code-review");
  let selectedCoreFile = $state("SYSTEM.md");
  let configDialog = $state<ConfigDialog | undefined>();
  let selectedProjectId = $state("volt-gui");
  let selectedCustomerId = $state("internal");
  let projectSearch = $state("");
  let customerSearch = $state("");
  let customerDetailTab = $state<CustomerDetailTab>("overview");
  let projectDetailTab = $state<ProjectDetailTab>("overview");
  let projectStatusFilter = $state<"all" | "active" | "closed">("all");
  let projectDetailOpen = $state(false);
  let customerDetailOpen = $state(false);
  let selectedHearingTitle = $state<string | undefined>();
  let selectedTeamTitle = $state<string | undefined>();
  let distillStep = $state(1);
  let agentProvider = $state("OpenAI");
  let agentModel = $state("GPT-4o");
  let agentAvatar = $state("C");
  let nowMs = $state(Date.now());
  let submittedDraft = $state<{ display: string; submission: string } | undefined>();
  let restoreDraftOnTurnDone = false;

  const activeTab = $derived(tabs.find((tab) => tab.active) ?? tabs[0]);
  const hasConversation = $derived(transcript.some((item) => item.id !== "system-welcome" && item.role !== "system"));
  const showTranscript = $derived(hasConversation || sending || Boolean(pendingApproval) || Boolean(pendingAsk));
  const showActiveTranscript = $derived(showTranscript && !(workLayer === "newTask" && !sending && !pendingApproval && !pendingAsk));
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
    teams: UsersRound,
    capabilities: Blocks,
    models: BrainCircuit,
    settings: Settings,
    operationLog: ClipboardList,
    search: Search,
    sync: RefreshCw,
    ingest: Upload,
    mockHearing: MessageSquare,
    reports: FileText,
    regulations: BookMarked,
    library: Archive,
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

  const workspaceNav = [
    { title: "Agent Work", items: [{ label: "新建对话", layer: "newTask", icon: "newTask" }, { label: "自动化", layer: "automations", icon: "automations", badge: "3" }] },
    { title: "运营", items: [{ label: "项目管理", layer: "projects", icon: "projects" }, { label: "客户管理", layer: "customers", icon: "customers" }] },
    { title: "知识库", items: [{ label: "Agent 中心", layer: "agents", icon: "agents" }, { label: "能力中心", layer: "capabilities", icon: "capabilities" }, { label: "资料中心", layer: "resources", icon: "resources" }] },
  ] as { title: string; items: { label: string; layer: WorkLayer; icon: WorkLayer; badge?: string }[] }[];
  const collapsibleWorkspaceSections = new Set(["运营", "知识库"]);
  const userMenuItems = [{ label: "模型管理", layer: "models" }, { label: "系统设置", layer: "settings" }, { label: "同步中心", layer: "sync" }, { label: "操作记录", layer: "operationLog" }] as { label: string; layer: UserPanelDialog }[];
  const todoItems = [
    { title: "验证桌面预览加载状态", desc: "确认浏览器模式无需 Wails 绑定也能进入工作台", due: "今天", state: "进行中" },
    { title: "整理 Agent 创建模板", desc: "补齐工具、技能、核心文件与模型配置", due: "16:00", state: "待处理" },
    { title: "复核项目与客户关联", desc: "检查新建对话中的关联入口", due: "明天", state: "待处理" },
  ];
  const runningAutomations = [
    { id: "preflight-validation", title: "提交前验证自动化", desc: "参考 Codex 自动化，把前端门禁、构建、空白检查和浏览器日志验证串成一个可复用的自动化任务。", status: "运行中", kind: "验证自动化", owner: "自动化 Agent", startedAtMs: Date.now() - 5400000, cadence: "每次 UI 改动后", schedule: "手动触发 / 提交前", scope: "desktop/frontend", environment: "local workspace", command: "autofixer -> npm run check -> npm run build -> browser logs", result: "最近一次通过", lastRun: "刚刚", nextRun: "等待下一次改动", steps: ["Svelte autofixer", "类型检查", "生产构建", "浏览器 DOM / 控制台验证"], logs: ["0 errors / 0 warnings", "构建通过，保留已知 @theme warning", "浏览器 warn/error 为空"] },
    { id: "desktop-frontend-gate", title: "桌面前端质量门禁", desc: "针对 desktop/frontend 执行 Svelte 类型检查、Vite 构建和差异空白检查，覆盖 UI 改动能真正交付的部分。", status: "运行中", kind: "质量门禁", owner: "代码审查 Agent", startedAtMs: Date.now() - 11880000, cadence: "每次前端改动后", schedule: "改动后手动复跑", scope: "desktop/frontend", environment: "local workspace", command: "npm run check / npm run build / git diff --check", result: "通过", lastRun: "12 分钟前", nextRun: "下一次前端改动", steps: ["npm run check", "npm run build", "git diff --check"], logs: ["svelte-check 通过", "Vite build 通过", "无空白错误"] },
    { id: "wails-go-gate", title: "Wails 与 Go 模块门禁", desc: "分别检查根 Go CLI/TUI 与 desktop Wails 模块，避免桌面端改动影响 CLI、绑定层或嵌入资源。", status: "待配置", kind: "工程验证", owner: "代码审查 Agent", startedAtMs: Date.now() - 3120000, cadence: "涉及 Go 或 Wails 绑定时", schedule: "按需触发", scope: "go.mod / desktop/go.mod", environment: "local workspace", command: "go test ./... / cd desktop && go test ./...", result: "待接入", lastRun: "未运行", nextRun: "绑定层改动后", steps: ["根模块 go test", "desktop 模块 go test", "Wails 绑定检查"], logs: ["等待启用"] },
    { id: "local-preview-regression", title: "本地预览回归检查", desc: "启动 127.0.0.1:5174 后检查 DOM、控制台和关键导航，确认浏览器预览模式不依赖 Wails 绑定。", status: "运行中", kind: "浏览器验证", owner: "Browser 插件", startedAtMs: Date.now() - 1620000, cadence: "UI 导航或任务流变更后", schedule: "预览刷新后", scope: "Vite dev server / 浏览器 DOM", environment: "in-app browser", command: "HTTP 200 / DOM snapshot / console warnings", result: "通过", lastRun: "5 分钟前", nextRun: "下一次页面改动", steps: ["刷新本地预览", "检查关键 DOM", "读取 warn/error 日志"], logs: ["页面可访问", "关键节点存在", "控制台无错误"] },
  ];
  const primaryAutomation = runningAutomations[0];
  let agentCards = $state<AgentCard[]>([
    { id: "code-review", name: "代码审查 Agent", role: "内置", runs: 128, status: "已启用", desc: "阅读仓库上下文，发现风险、缺失测试和回归点。" },
    { id: "research", name: "资料研究 Agent", role: "自定义", runs: 64, status: "已启用", desc: "汇总文档、网页和项目资料，输出可执行摘要。" },
    { id: "automation", name: "自动化 Agent", role: "已蒸馏", runs: 37, status: "已停用", desc: "把重复工作转为可配置的计划任务和监控。" },
  ]);
  const agentMarketItems: AgentMarketItem[] = [
    { id: "requirement-planner", name: "需求拆解 Agent", role: "市场", runs: 0, status: "未下载", category: "产品规划", source: "Agent Market", version: "v1.2", desc: "把模糊需求整理成目标、非目标、验收标准和执行步骤，适合新项目启动。", tags: ["需求", "规划", "验收"], localPath: ".volt/agents/requirement-planner.agent.json" },
    { id: "contract-review", name: "合同审阅 Agent", role: "市场", runs: 0, status: "未下载", category: "文档审查", source: "Agent Market", version: "v1.0", desc: "检查合同、协议和交付条款中的风险点，输出修改建议和待确认清单。", tags: ["合同", "风险", "审阅"], localPath: ".volt/agents/contract-review.agent.json" },
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
  const projectCards = [
    { id: "volt-gui", name: "Volt GUI 桌面端重构", code: "PRJ-2026-0615", client: "内部研发", stage: "进行中", owner: "产品工作台", desc: "恢复 AoristLawer 式导航、Agent 与能力中心，并把 Coding 模式统一到新建对话。", category: "桌面端重构", court: "研发工作台", budget: "1,200,000", acceptedAt: "2026-06-15", status: "active", progress: 78, priority: "高", risk: "中风险", updatedAt: "28 分钟前", nextStep: "完成项目管理页深化并做构建验证", agent: "代码审查 Agent", materials: 12, todos: 5, events: 3, reports: 4, timeline: ["AORISTLAWER 参考界面已完成源码对照", "新建对话与代码状态入口已统一", "项目管理页进入深化验收"] },
    { id: "lurefree", name: "Lurefree 小程序发布", code: "PRJ-2026-0610", client: "运营团队", stage: "验证中", owner: "增长项目", desc: "小程序包体、地图交互、图钉资产与发布材料进入交付前验证。", category: "小程序发布", court: "增长项目组", budget: "350,000", acceptedAt: "2026-06-10", status: "active", progress: 64, priority: "中", risk: "低风险", updatedAt: "2 小时前", nextStep: "补齐地图与详情页回归清单", agent: "资料研究 Agent", materials: 8, todos: 4, events: 2, reports: 2, timeline: ["地图交互问题已纳入检查", "发布材料进入复核", "等待小程序预览确认"] },
    { id: "homepage", name: "品牌主页恢复与部署", code: "PRJ-2026-0601", client: "市场团队", stage: "已归档", owner: "官网项目", desc: "恢复历史版本、验证构建并保留无截图校验流程。", category: "官网运营", court: "市场中台", budget: "180,000", acceptedAt: "2026-06-01", status: "closed", progress: 100, priority: "低", risk: "已关闭", updatedAt: "昨天", nextStep: "仅保留归档和复盘记录", agent: "自动化 Agent", materials: 5, todos: 0, events: 1, reports: 3, timeline: ["历史版本已恢复", "构建验证已完成", "无截图校验流程已归档"] },
  ];
  let sidebarProjects = $state<SidebarProject[]>([
    { id: "volt-gui", name: "Volt GUI 桌面端重构", localPath: "E:\\workspace\\volt-gui", updatedAtMs: Date.now(), expanded: true, conversations: [{ id: "volt-gui-review", title: "审查当前改动", updatedAt: "刚刚" }, { id: "volt-gui-ui", title: "侧边栏 UI 调整", updatedAt: "今天" }] },
    { id: "lurefree", name: "Lurefree 小程序发布", localPath: "E:\\workspace\\lurefree", updatedAtMs: Date.now() - 3600000, expanded: false, conversations: [{ id: "lurefree-release", title: "发布资料复核", updatedAt: "昨天" }] },
    { id: "homepage", name: "品牌主页恢复与部署", localPath: "C:\\Users\\1\\Documents\\HOMEPAGE", updatedAtMs: Date.now() - 7200000, expanded: false, conversations: [{ id: "homepage-archive", title: "归档复盘", updatedAt: "昨天" }] },
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
  const projectMaterialRows = [
    { projectId: "volt-gui", title: "AORISTLAWER 项目详情源码对照", category: "参考资料", source: "MatterDetailPage.tsx", status: "已关联", updatedAt: "28 分钟前", desc: "映射概览、资料、日程、报告、待办五个标签页。" },
    { projectId: "volt-gui", title: "Volt GUI 工作台 IA 调整记录", category: "需求资料", source: "App.svelte", status: "已索引", updatedAt: "今天", desc: "覆盖项目管理、客户管理、能力中心与资料中心入口调整。" },
    { projectId: "volt-gui", title: "桌面前端质量门禁说明", category: "验证资料", source: "desktop/frontend", status: "已同步", updatedAt: "今天", desc: "记录 Svelte 检查、Vite 构建和本地预览回归要求。" },
    { projectId: "volt-gui", title: "客户与项目关联样例", category: "业务资料", source: "local", status: "待复核", updatedAt: "昨天", desc: "用于验证项目详情与客户详情之间的跳转和任务关联。" },
    { projectId: "lurefree", title: "小程序发布清单", category: "发布资料", source: "lurefree", status: "已索引", updatedAt: "2 小时前", desc: "包体、地图交互、图钉资产与发布前检查记录。" },
    { projectId: "lurefree", title: "地图交互回归记录", category: "验证资料", source: "dist/wx", status: "待复核", updatedAt: "今天", desc: "确认运行产物和源码行为一致。" },
    { projectId: "homepage", title: "历史版本恢复记录", category: "归档资料", source: "_restore-backups", status: "已归档", updatedAt: "昨天", desc: "记录恢复来源、构建验证和无截图校验边界。" },
  ];
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
  const projectTodoRows = [
    { projectId: "volt-gui", title: "补齐项目详情五个标签页", due: "今天", priority: "高", state: "进行中", desc: "让资料、日程、报告、待办都具备可见内容和操作入口。" },
    { projectId: "volt-gui", title: "执行 Svelte autofixer", due: "今天", priority: "中", state: "待处理", desc: "确认新增模板满足 Svelte 5 语法。" },
    { projectId: "volt-gui", title: "运行前端构建门禁", due: "今天", priority: "中", state: "待处理", desc: "执行 check、build 和 diff 空白检查。" },
    { projectId: "volt-gui", title: "浏览器验证项目详情", due: "今天", priority: "中", state: "待处理", desc: "检查截图中的标签页切换和控制台日志。" },
    { projectId: "volt-gui", title: "整理交付说明", due: "明天", priority: "低", state: "待处理", desc: "记录本次参考 AORISTLAWER 的落地范围。" },
    { projectId: "lurefree", title: "复核发布资料", due: "今天", priority: "高", state: "进行中", desc: "确认发布前材料和验收证据。" },
    { projectId: "lurefree", title: "同步上线排期", due: "06-22", priority: "中", state: "待处理", desc: "更新客户与运营团队的提醒。" },
  ];
  const customerCards = [
    { id: "internal", name: "内部研发团队", type: "企业", contact: "产品负责人", phone: "010-0000-0001", email: "dev@example.com", industry: "研发工具", matters: 4, materials: 12, events: 3, todos: 5, risk: "低风险", riskLevel: "low", status: "active", createdAt: "2026-06-01", lastContact: "28 分钟前", address: "局域网本地客户档案", note: "围绕 Volt GUI 桌面端体验、代码质量和发布节奏维护长期项目上下文。", projectIds: ["volt-gui", "homepage"] },
    { id: "ops", name: "运营增长团队", type: "企业", contact: "增长负责人", phone: "010-0000-0002", email: "ops@example.com", industry: "增长运营", matters: 3, materials: 8, events: 2, todos: 4, risk: "中风险", riskLevel: "medium", status: "active", createdAt: "2026-06-08", lastContact: "2 小时前", address: "运营项目群", note: "负责客户触达、发布材料和小程序增长相关任务，需保留交付前验证记录。", projectIds: ["lurefree"] },
    { id: "founder", name: "个人创始人项目", type: "自然人", contact: "创始人本人", phone: "138-0000-0003", email: "founder@example.com", industry: "个人委托", matters: 1, materials: 5, events: 1, todos: 2, risk: "高风险", riskLevel: "high", status: "active", createdAt: "2026-06-12", lastContact: "今天", address: "远程访谈记录", note: "需求边界变化频繁，任务进入执行前需补齐确认记录与风险说明。", projectIds: [] },
  ];
  const customerMaterialRows = [
    { customerId: "internal", title: "Volt GUI 客户需求纪要", category: "访谈记录", source: "workspace", status: "已索引", updatedAt: "28 分钟前", desc: "整理导航、客户管理和项目管理的最新确认口径。" },
    { customerId: "internal", title: "桌面前端验证证据包", category: "交付资料", source: "desktop/frontend", status: "已同步", updatedAt: "今天", desc: "包含 Svelte 检查、构建、浏览器 DOM 与控制台验证记录。" },
    { customerId: "internal", title: "AORISTLAWER 参考映射", category: "参考资料", source: "aoristlawer", status: "已关联", updatedAt: "昨天", desc: "记录客户详情、项目详情和创建弹窗的对照关系。" },
    { customerId: "internal", title: "风险与回滚说明", category: "复核资料", source: "memory", status: "待复核", updatedAt: "昨天", desc: "用于补齐交付前风险说明和可回退边界。" },
    { customerId: "ops", title: "小程序发布清单", category: "交付资料", source: "lurefree", status: "已索引", updatedAt: "2 小时前", desc: "汇总包体、地图交互和发布前验收项。" },
    { customerId: "ops", title: "客户触达话术", category: "运营资料", source: "local", status: "草稿", updatedAt: "今天", desc: "用于增长团队跟进项目状态和确认上线窗口。" },
    { customerId: "ops", title: "发布复核附件", category: "附件", source: "workspace", status: "待清理", updatedAt: "昨天", desc: "保留预览、问题记录和人工确认材料。" },
    { customerId: "founder", title: "创始人访谈记录", category: "访谈记录", source: "remote", status: "已索引", updatedAt: "今天", desc: "记录需求边界、预算和变更口径。" },
    { customerId: "founder", title: "执行前确认单", category: "确认资料", source: "manual", status: "待确认", updatedAt: "今天", desc: "进入任务前需要客户再次确认范围和验收标准。" },
  ];
  const customerScheduleRows = [
    { customerId: "internal", title: "桌面端体验复盘", date: "06-20", time: "10:30", place: "研发工作台", state: "今日", desc: "确认客户管理和项目管理补齐范围。" },
    { customerId: "internal", title: "构建验证窗口", date: "06-20", time: "16:00", place: "本地预览", state: "待开始", desc: "跑完前端门禁并检查 127.0.0.1 预览。" },
    { customerId: "internal", title: "交付前确认", date: "06-21", time: "14:00", place: "项目群", state: "已排期", desc: "确认详情页标签内容和资料联动。" },
    { customerId: "ops", title: "发布素材复核", date: "06-20", time: "15:30", place: "运营项目群", state: "今日", desc: "复核小程序发布材料与客户触达节奏。" },
    { customerId: "ops", title: "增长任务同步", date: "06-22", time: "11:00", place: "线上会议", state: "已排期", desc: "同步地图、包体和发布排期风险。" },
    { customerId: "founder", title: "需求边界确认", date: "06-20", time: "18:00", place: "远程会议", state: "待确认", desc: "确认任务进入执行前的范围冻结条件。" },
  ];
  const customerTodoRows = [
    { customerId: "internal", title: "补齐客户详情五个标签页", due: "今天", priority: "高", state: "进行中", desc: "对照 AORISTLAWER 的客户详情结构补足面板内容。" },
    { customerId: "internal", title: "运行 Svelte autofixer", due: "今天", priority: "中", state: "待处理", desc: "确认新增模板满足 Svelte 5 语法。" },
    { customerId: "internal", title: "执行前端构建门禁", due: "今天", priority: "中", state: "待处理", desc: "运行 check、build 和 diff 空白检查。" },
    { customerId: "internal", title: "浏览器验证客户详情", due: "今天", priority: "中", state: "待处理", desc: "检查标签切换、内容可见性和控制台错误。" },
    { customerId: "internal", title: "回写验收结论", due: "明天", priority: "低", state: "待处理", desc: "把验证证据同步到客户档案和交付说明。" },
    { customerId: "ops", title: "复核小程序发布材料", due: "今天", priority: "高", state: "进行中", desc: "确认发布附件、预览记录和客户触达话术。" },
    { customerId: "ops", title: "整理增长任务清单", due: "明天", priority: "中", state: "待处理", desc: "把运营动作拆成可执行任务。" },
    { customerId: "ops", title: "同步项目日程", due: "06-22", priority: "中", state: "待处理", desc: "补齐下次会议、验收窗口和风险提醒。" },
    { customerId: "ops", title: "更新客户周报", due: "06-23", priority: "低", state: "待处理", desc: "同步项目状态、资料清理和下一步。" },
    { customerId: "founder", title: "确认需求边界", due: "今天", priority: "高", state: "待确认", desc: "进入执行前冻结范围、交付物和验收标准。" },
    { customerId: "founder", title: "补齐风险说明", due: "明天", priority: "中", state: "待处理", desc: "记录频繁变更带来的排期和交付风险。" },
  ];
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
  const newTaskProjectOptions = $derived(projectCards.map((project) => ({ id: project.id, label: project.name })));
  const sortedSidebarProjects = $derived([...sidebarProjects].sort((a, b) => {
    if (sidebarProjectSort === "name") return a.name.localeCompare(b.name, "zh-Hans-CN");
    if (sidebarProjectSort === "conversations") return sidebarProjectConversations(b).length - sidebarProjectConversations(a).length || a.name.localeCompare(b.name, "zh-Hans-CN");
    return b.updatedAtMs - a.updatedAtMs;
  }));
  const archivedSidebarConversationCount = $derived(sidebarProjects.reduce((sum, project) => sum + archivedSidebarProjectConversations(project).length, 0));
  const capabilityBuckets = {
    plugin: [
      { id: "git-panel", name: "Git 变更面板", desc: "读取 diff、生成审查清单，并将结果回写到对话上下文。", status: "已启用", version: "v1.6", source: "内置插件", scope: "新建对话", sync: "刚刚同步", path: "desktop/frontend", permission: "读写 diff / 只读提交历史", enabled: true },
      { id: "browser-preview", name: "浏览器预览", desc: "打开本地页面、检查 DOM 状态和控制台错误。", status: "已启用", version: "v1.2", source: "Browser 插件", scope: "本地预览", sync: "5 分钟前", path: "127.0.0.1", permission: "本地页面读取 / 点击验证", enabled: true },
      { id: "resource-ingest", name: "资料导入助手", desc: "把文档、法规、客户资料导入资料中心并建立索引。", status: "待配置", version: "v0.8", source: "工作台插件", scope: "资料中心", sync: "待授权", path: "resources/import", permission: "上传文件 / 建立索引", enabled: false },
    ],
    mcp: [
      { id: "filesystem-mcp", name: "文件系统 MCP", desc: "读取项目文档、源码片段和本地结构化资源。", status: "已连接", version: "v2.1", source: "本地 MCP", scope: "workspace", sync: "在线", path: "E:/workspace/volt-gui", permission: "只读项目文件 / 精确补丁", enabled: true },
      { id: "automation-mcp", name: "自动化 MCP", desc: "触发定时任务、运行监控和线程唤醒回调。", status: "已连接", version: "v1.0", source: "Codex Desktop", scope: "任务中心", sync: "在线", path: "automations", permission: "查看和配置自动化", enabled: true },
      { id: "aorist-sync-mcp", name: "AORIST 同步 MCP", desc: "同步模型、Agent、项目和客户资料的跨端状态。", status: "需授权", version: "v0.4", source: "外部服务", scope: "同步中心", sync: "未连接", path: "api.aorist.net", permission: "需要 API Token", enabled: false },
    ],
    skill: [
      { id: "frontend-design", name: "frontend-design", desc: "高质量前端界面重构，约束视觉层级、动效与响应式。", status: "已安装", version: "v1.8", source: "Codex Skill", scope: "UI 重构", sync: "已加载", path: "skills/frontend-design", permission: "读取设计约定 / 修改前端文件", enabled: true },
      { id: "webapp-testing", name: "webapp-testing", desc: "本地预览、浏览器验证和控制台错误检查。", status: "可用", version: "v1.1", source: "Testing Skill", scope: "质量验证", sync: "可调用", path: "skills/webapp-testing", permission: "浏览器只读检查 / 交互验证", enabled: true },
      { id: "agent-team-automation", name: "agent-team-automation", desc: "把可复用任务契约、执行日志和回调流程打包为团队技能。", status: "待安装", version: "v0.7", source: "Agent Team", scope: "团队协作", sync: "待导入", path: "skills/agent-team", permission: "任务契约 / 进度日志", enabled: false },
    ],
  };
  type CapabilityItem = typeof capabilityBuckets.plugin[number];
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
  const toolCards = [
    { id: "files", title: "本地文件与资料", desc: "读取仓库、附件和项目知识库", active: true },
    { id: "terminal", title: "终端执行", desc: "运行构建、测试和安全命令", active: true },
    { id: "browser", title: "浏览器预览", desc: "打开本地页面并检查加载状态", active: true },
    { id: "memory", title: "长期记忆", desc: "复用项目约定和历史决策", active: false },
  ];
  const skillCards = [
    { id: "repo", title: "Repository Context", version: "v1.4", desc: "读取目录、历史和项目规则。", active: true },
    { id: "frontend", title: "Frontend Polish", version: "v1.8", desc: "重建界面层级、导航和交互。", active: true },
    { id: "automation", title: "Automation Ops", version: "v0.9", desc: "配置计划任务、监控和运行记录。", active: false },
  ];
  const calendarEvents = [
    { day: "09", title: "版本评审会议", time: "09:30", type: "meeting", place: "线上会议室" },
    { day: "12", title: "客户工作流复盘", time: "14:00", type: "deadline", place: "项目群" },
    { day: "18", title: "自动化验收", time: "16:30", type: "hearing", place: "研发工作台" },
  ];
  const hearingRooms = [
    { title: "需求争议模拟庭辩", stage: "准备中", role: "产品方 / 交付方", next: "生成交叉询问提纲" },
    { title: "代码质量责任复盘", stage: "进行中", role: "审查 Agent / 执行 Agent", next: "进入庭辩室" },
    { title: "上线风险答辩", stage: "已归档", role: "架构 / 运维", next: "查看总结" },
  ];
  const reportCards = [
    { title: "项目风险分析报告", status: "已生成", owner: "代码审查 Agent", desc: "覆盖变更风险、测试缺口、回滚建议。" },
    { title: "客户运营周报", status: "草稿", owner: "运营 Agent", desc: "整理客户触达、项目状态与内容草案。" },
    { title: "项目自动化运行报告", status: "待复核", owner: "自动化 Agent", desc: "汇总前端门禁、Go/Wails 门禁和本地预览回归的执行证据。" },
  ];
  const regulationItems = [
    { title: "桌面端安全执行规范", category: "内部规则", status: "现行有效", tags: "权限 / 沙箱 / 审计" },
    { title: "Agent 协作验收标准", category: "流程规范", status: "试行", tags: "任务 / 验证 / 交付" },
    { title: "客户数据使用边界", category: "合规要求", status: "现行有效", tags: "客户 / 数据 / 留痕" },
  ];
  const documentItems = [
    { title: "需求澄清记录模板", type: "模板", count: 18, status: "可用" },
    { title: "项目复盘文书", type: "归档", count: 42, status: "已索引" },
    { title: "项目自动化配置说明", type: "说明", count: 9, status: "已更新" },
  ];
  const resourceItems = [
    { title: "项目资料库", source: "workspace", size: "128 files", status: "已同步" },
    { title: "客户访谈附件", source: "local", size: "36 files", status: "待清理" },
    { title: "Agent 核心文件", source: "memory", size: "12 files", status: "已挂载" },
  ];
  const filteredResourceItems = $derived(resourceItems.filter((item) => {
    const keyword = resourceSearch.trim().toLowerCase();
    return !keyword || [item.title, item.source, item.size, item.status].some((value) => value.toLowerCase().includes(keyword));
  }));
  let teamRooms = $state([
    { id: "product-lab", title: "产品研发组", members: 3, active: "2 个 Agent 在线", desc: "围绕桌面端体验、代码质量和发布节奏协作。", leader: "代码审查 Agent", leaderId: "code-review", status: "运行中", topic: "桌面端体验复刻", queue: "3 条任务", memberIds: ["code-review", "research", "automation"], avatars: ["C", "R", "A"] },
    { id: "ops-growth", title: "运营增长组", members: 2, active: "3 个任务进行中", desc: "处理客户触达、内容草案和项目跟进。", leader: "资料研究 Agent", leaderId: "research", status: "待配置", topic: "客户运营协同", queue: "5 条任务", memberIds: ["research", "automation"], avatars: ["R", "A"] },
    { id: "delivery-review", title: "交付审查组", members: 3, active: "1 个报告待审", desc: "审查项目风险、交付记录和验收标准。", leader: "自动化 Agent", leaderId: "automation", status: "已启用", topic: "项目验收复盘", queue: "2 条任务", memberIds: ["automation", "code-review", "research"], avatars: ["A", "C", "R"] },
  ]);
  type TeamChatMessage = { id: string; teamId: string; role: "user" | "agent"; agentId?: string; agentName?: string; agentAvatar?: string; content: string };
  let teamChatMessages = $state<TeamChatMessage[]>([
    { id: "product-lab-system-1", teamId: "product-lab", role: "agent", agentId: "code-review", agentName: "代码审查 Agent", agentAvatar: "C", content: "我会先拆解当前桌面端体验问题，再把验证点分配给资料研究和自动化 Agent。" },
    { id: "product-lab-system-2", teamId: "product-lab", role: "agent", agentId: "research", agentName: "资料研究 Agent", agentAvatar: "R", content: "已整理 AORISTLAWER 参考路径，建议优先同步 TeamsPage、CreateTeamModal 和 TeamChatPage 的交互结构。" },
    { id: "ops-growth-system-1", teamId: "ops-growth", role: "agent", agentId: "research", agentName: "资料研究 Agent", agentAvatar: "R", content: "客户触达素材已汇总，下一步可以生成项目跟进话术和执行清单。" },
    { id: "delivery-review-system-1", teamId: "delivery-review", role: "agent", agentId: "automation", agentName: "自动化 Agent", agentAvatar: "A", content: "验收流程已准备：构建、检查、预览、残留文案扫描会按顺序执行。" },
  ]);
  const filteredTeamBuilderAgents = $derived(agentCards.filter((agent) => {
    const keyword = teamBuilderSearch.trim().toLowerCase();
    return !keyword || [agent.name, agent.role, agent.desc].some((value) => value.toLowerCase().includes(keyword));
  }));
  const modelCards = [
    { name: "GPT-4o", provider: "OpenAI", role: "默认对话模型", status: "已连接" },
    { name: "Claude Sonnet 4.6", provider: "Claude", role: "长文档分析", status: "备用" },
    { name: "Qwen-Max", provider: "Qwen", role: "中文任务", status: "可用" },
  ];
  const settingGroups = [
    { title: "常规设置", desc: "语言、主题、关闭行为和本地缓存。", status: "已配置" },
    { title: "局域网运行", desc: "局域网访问、健康检查和服务端口。", status: "运行中" },
    { title: "模型接口", desc: "Relay、API Key 环境变量和默认模型。", status: "需复核" },
  ];
  const operationLogs = [
    { action: "创建 Agent", target: "代码审查 Agent", user: "我的", time: "刚刚", result: "成功" },
    { action: "更新自动化", target: "桌面前端质量门禁", user: "我的", time: "12 分钟前", result: "成功" },
    { action: "关联项目", target: "Volt GUI 桌面端重构", user: "我的", time: "28 分钟前", result: "成功" },
  ];
  const searchResults = [
    { title: "Agent 创建与配置", scope: "Agent 中心", snippet: "助手特征、基础工具、业务技能、核心文件均可配置。" },
    { title: "项目管理入口", scope: "业务管理", snippet: "项目可点击关联到新建对话。" },
    { title: "能力中心 MCP 管理", scope: "能力中心", snippet: "插件、MCP、SKILL 顶部横向切换。" },
  ];
  const syncJobs = [
    { title: "记忆与核心文件同步", status: "已完成", progress: "100%", time: "5 分钟前" },
    { title: "资料库索引", status: "运行中", progress: "64%", time: "正在执行" },
    { title: "模型配置刷新", status: "排队中", progress: "0%", time: "等待中" },
  ];
  const ingestJobs = [
    { title: "导入项目文档", source: "workspace", status: "完成", total: 128 },
    { title: "导入客户资料", source: "local", status: "排队", total: 36 },
    { title: "导入法规样例", source: "manual", status: "失败", total: 1 },
  ];

  const hasWailsBindings = () => typeof window !== "undefined" && Boolean(window.go?.main?.App);

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
    needsAuth = false;
    loading = false;
  }

  onMount(() => {
    if (!hasWailsBindings()) {
      hydrateBrowserPreview();
      const previewTick = window.setInterval(() => {
        nowMs = Date.now();
      }, 1000);
      return () => window.clearInterval(previewTick);
    }

    // Check auth gate first — if [auth] is configured and no valid token exists,
    // show the OIDC login overlay before anything else.
    app()
      .NeedsAuth()
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
    return () => {
      window.clearInterval(tick);
      unsubscribeEvents();
    };
  });

  // Debounce batch-appends of streaming text events to avoid re-render storms.
  let pendingTextBuffer = "";
  let textFlushScheduled = false;

  function scheduleTextFlush() {
    if (textFlushScheduled) return;
    textFlushScheduled = true;
    queueMicrotask(() => {
      textFlushScheduled = false;
      if (!pendingTextBuffer) return;
      updateLastAssistant(pendingTextBuffer);
      pendingTextBuffer = "";
    });
  }

  function appendTranscript(item: TranscriptItem) {
    transcript.push(item);
    if (transcript.length > MAX_TRANSCRIPT_ITEMS) {
      // Keep the most recent items; drop from the front.
      transcript.splice(0, transcript.length - MAX_TRANSCRIPT_ITEMS);
    }
  }

  function openWorkLayer(layer: WorkLayer) { activityMode = "work"; workLayer = layer; codeInspectorOpen = false; sidebarCollapsed = false; userMenuOpen = false; }
  function openResourceCenterFromComposer() {
    openWorkLayer("resources");
    resourceTab = "resources";
  }
  function openCodeConversation() {
    activityMode = "code";
    workLayer = "newTask";
    codeInspectorOpen = false;
    sidebarCollapsed = false;
    userMenuOpen = false;
  }
  function openActivityMode(mode: ActivityMode) {
    if (mode === "work") {
      if (activityMode === "work" && workLayer === "newTask") return;
      openWorkLayer("newTask");
      return;
    }
    openCodeConversation();
    void tick().then(focusComposer);
  }
  function openUserPanelDialog(layer: UserPanelDialog) { userPanelDialog = layer; userMenuOpen = false; }
  function userPanelDialogTitle() {
    if (userPanelDialog === "models") return "模型管理";
    if (userPanelDialog === "settings") return "系统设置";
    if (userPanelDialog === "sync") return "同步中心";
    if (userPanelDialog === "operationLog") return "操作记录";
    return "我的";
  }
  function userPanelDialogIntro() {
    if (userPanelDialog === "models") return "对标 AORISTLAWER 模型管理：集中查看模型状态、供应商和默认用途。";
    if (userPanelDialog === "settings") return "对标 AORISTLAWER UserPanel：常规设置、局域网运行和模型接口在弹窗内快速配置。";
    if (userPanelDialog === "sync") return "对标 AORISTLAWER 同步面板：展示资料、模型和记忆同步进度。";
    if (userPanelDialog === "operationLog") return "对标 AORISTLAWER 操作记录：保留关键动作、对象、用户和结果。";
    return "用户中心弹窗。";
  }
  function focusNewTask() { openWorkLayer("newTask"); void tick().then(focusComposer); }
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
    syncSidebarProjectContext(project);
    sidebarProjects = sidebarProjects.map((item) => item.id === projectId ? { ...item, expanded: true } : item);
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
  function openSidebarConversation(projectId: string, conversationId: string) {
    const project = sidebarProjects.find((item) => item.id === projectId);
    if (!project) return;
    const conversation = project.conversations.find((item) => item.id === conversationId && !item.archivedAtMs);
    syncSidebarProjectContext(project);
    activeSidebarConversationId = conversationId;
    sidebarProjects = sidebarProjects.map((item) => item.id === projectId ? { ...item, updatedAtMs: Date.now() } : item);
    input = `项目：${project.name}\n${conversation ? `对话：${conversation.title}\n` : ""}`;
    focusNewTask();
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
      ? { ...project, updatedAtMs: now, conversations: project.conversations.map((conversation) => conversation.id === conversationId ? { ...conversation, archivedAtMs: now, updatedAt: "已归档" } : conversation) }
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
    const project = sidebarProjects.find((item) => item.id === projectId);
    if (!project) return;
    const now = Date.now();
    const conversation: SidebarConversation = { id: `${projectId}-conversation-${Date.now()}`, title: `新对话 ${sidebarProjectConversations(project).length + 1}`, updatedAt: "刚刚" };
    sidebarProjects = sidebarProjects.map((item) => item.id === projectId ? { ...item, expanded: true, updatedAtMs: now, conversations: [conversation, ...item.conversations] } : item);
    openSidebarConversation(projectId, conversation.id);
  }
  async function openUnifiedCodeTask() {
    openCodeConversation();
    await tick();
    if (hasWailsBindings()) await refreshCodeDock();
    focusComposer();
  }
  function selectedProject() { return projectCards.find((project) => project.id === selectedProjectId) ?? projectCards[0]; }
  function projectMaterials(project = selectedProject()) { return projectMaterialRows.filter((item) => item.projectId === project.id); }
  function projectSchedules(project = selectedProject()) { return projectScheduleRows.filter((item) => item.projectId === project.id); }
  function projectReports(project = selectedProject()) { return projectReportRows.filter((item) => item.projectId === project.id); }
  function projectTodos(project = selectedProject()) { return projectTodoRows.filter((item) => item.projectId === project.id); }
  function selectedCustomer() { return customerCards.find((customer) => customer.id === selectedCustomerId) ?? customerCards[0]; }
  function customerProjects(customer = selectedCustomer()) { return projectCards.filter((project) => customer.projectIds.includes(project.id)); }
  function customerMaterials(customer = selectedCustomer()) { return customerMaterialRows.filter((item) => item.customerId === customer.id); }
  function customerSchedules(customer = selectedCustomer()) { return customerScheduleRows.filter((item) => item.customerId === customer.id); }
  function customerTodos(customer = selectedCustomer()) { return customerTodoRows.filter((item) => item.customerId === customer.id); }
  function selectedAgent() { return agentCards.find((agent) => agent.id === selectedAgentId) ?? agentCards[0]; }
  function selectedHearingRoom() { return hearingRooms.find((room) => room.title === selectedHearingTitle) ?? hearingRooms[0]; }
  function selectedTeamRoom() { return teamRooms.find((team) => team.title === selectedTeamTitle) ?? teamRooms[0]; }
  function teamMembers(team = selectedTeamRoom()) { return (team?.memberIds ?? []).map((id) => agentCards.find((agent) => agent.id === id)).filter(Boolean) as typeof agentCards; }
  function teamLeaderId(team = selectedTeamRoom()) { return team?.leaderId || team?.memberIds?.[0] || ""; }
  function teamLeader(team = selectedTeamRoom()) { return agentCards.find((agent) => agent.id === teamLeaderId(team)) ?? teamMembers(team)[0]; }
  function selectedTeamChatMessages() { return teamChatMessages.filter((message) => message.teamId === selectedTeamRoom()?.id); }
  function selectedTeamBuilderMembers() { return teamBuilderMemberIds.map((id) => agentCards.find((agent) => agent.id === id)).filter(Boolean) as typeof agentCards; }
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
    teamChatAttachments = [...teamChatAttachments, `团队材料-${nextIndex}.md`];
  }
  function removeTeamChatAttachment(index: number) {
    teamChatAttachments = teamChatAttachments.filter((_, itemIndex) => itemIndex !== index);
  }
  function sendTeamChat() {
    const text = teamChatInput.trim();
    const team = selectedTeamRoom();
    if (!text || !team || teamChatSending) return;
    const members = teamMembers(team);
    const responders = members.length ? members.slice(0, Math.min(3, members.length)) : agentCards.slice(0, 2);
    const now = Date.now();
    teamChatInput = "";
    teamChatSending = true;
    teamChatMessages = [
      ...teamChatMessages,
      { id: `${team.id}-user-${now}`, teamId: team.id, role: "user" as const, content: text },
      ...responders.map((agent, index) => ({
        id: `${team.id}-agent-${now}-${index}`,
        teamId: team.id,
        role: "agent" as const,
        agentId: agent.id,
        agentName: agent.name,
        agentAvatar: agent.name.slice(0, 1),
        content: index === 0
          ? `收到任务。我会作为 Team Leader 先拆解目标：${text}。接下来同步分工、风险点和验证步骤。`
          : `我会补充 ${agent.role} 视角，围绕资料、执行和验收输出可落地建议。`,
      })),
    ];
    window.setTimeout(() => {
      teamChatSending = false;
    }, 380);
  }
  function saveTeamBuilder() {
    const name = teamBuilderName.trim();
    if (!name || teamBuilderMemberIds.length === 0) return;
    const memberAgents = teamBuilderMemberIds.map((id) => agentCards.find((agent) => agent.id === id)).filter(Boolean) as typeof agentCards;
    const leaderId = teamBuilderMemberIds.includes(teamBuilderLeaderId) ? teamBuilderLeaderId : teamBuilderMemberIds[0];
    const leaderAgent = memberAgents.find((agent) => agent.id === leaderId) ?? memberAgents[0];
    const nextTeam = {
      id: teamConfigTitle ? (teamRooms.find((team) => team.title === teamConfigTitle)?.id ?? `team-${Date.now()}`) : `team-${Date.now()}`,
      title: name,
      members: memberAgents.length,
      active: `${Math.min(memberAgents.length, 3)} 个 Agent 在线`,
      desc: memberAgents.map((agent) => agent.name).join("、") || "新配置的 Agent 团队。",
      leader: leaderAgent?.name ?? "Team Leader",
      leaderId,
      status: "已配置",
      topic: "团队协作任务",
      queue: "0 条任务",
      memberIds: [...teamBuilderMemberIds],
      avatars: memberAgents.map((agent) => agent.name.slice(0, 1)).slice(0, 3),
    };
    teamRooms = teamConfigTitle ? teamRooms.map((team) => team.title === teamConfigTitle ? nextTeam : team) : [nextTeam, ...teamRooms];
    selectedTeamTitle = nextTeam.title;
    configDialog = undefined;
    teamConfigTitle = undefined;
  }
  function selectAgentForTask(agentId: string) { selectedAgentId = agentId; agentSelectorOpen = false; }
  function linkProjectById(projectId: string) {
    if (!projectId) {
      selectedProjectId = "";
      linkedProject = "";
      return;
    }
    selectedProjectId = projectId;
    const project = projectCards.find((item) => item.id === projectId);
    linkedProject = project?.name ?? "";
  }
  function linkProjectToTask(projectName: string) { const project = projectCards.find((item) => item.name === projectName); if (project) selectedProjectId = project.id; linkedProject = projectName; input = `关联项目：${projectName}\n`; focusNewTask(); }
  function linkCustomerToTask(customerName: string) { const customer = customerCards.find((item) => item.name === customerName); if (customer) selectedCustomerId = customer.id; linkedCustomer = customerName; input = `关联客户：${customerName}\n`; focusNewTask(); }
  function useNewTaskPrompt(task: (typeof newTaskQuickTasks)[number]) { selectedAgentId = task.agentId; input = task.prompt; void tick().then(focusComposer); }
  function openConfigDialog(kind: ConfigDialog) { configDialog = kind; }
  function configDialogTitle() {
    if (configDialog === "schedule") return "新建日程";
    if (configDialog === "todo") return "新建待办";
    if (configDialog === "report") return "新建分析报告";
    if (configDialog === "model") return "添加模型";
    if (configDialog === "ingest") return "批量导入";
    if (configDialog === "resource") return "上传资料";
    if (configDialog === "template") return "新建文书模板";
    if (configDialog === "project") return "新建项目";
    if (configDialog === "customer") return "新建客户";
    if (configDialog === "hearing") return "创建模拟庭辩";
    if (configDialog === "team") return teamConfigTitle ? "编辑 Agent 团队" : "配置 Agent 团队";
    if (configDialog === "dossier") return "新建资料卷宗";
    if (configDialog === "selectProject") return "选择项目";
    if (configDialog === "selectCustomer") return "选择客户";
    if (configDialog === "distill") return "Agent 蒸馏向导";
    return "配置";
  }
  function formatRuntime(startedAtMs: number) { const m = Math.max(1, Math.floor((nowMs - startedAtMs) / 60000)); const h = Math.floor(m / 60); return h ? `${h} 小时 ${m % 60} 分钟` : `${m} 分钟`; }
  function currentAutomation() { return runningAutomations.find((item) => item.id === automationDialog); }
  function openAgentWizard(agentId?: string) { selectedAgentId = agentId || selectedAgentId; agentWizardTab = "identity"; agentWizardOpen = true; }
  function filteredAgentMarketItems() {
    const keyword = agentMarketSearch.trim().toLowerCase();
    if (!keyword) return agentMarketItems;
    return agentMarketItems.filter((item) => [item.name, item.category, item.desc, item.source, item.version, ...item.tags].some((value) => value.toLowerCase().includes(keyword)));
  }
  function marketAgentDownloaded(item: AgentMarketItem) {
    return downloadedMarketAgentIds.includes(item.id) || agentCards.some((agent) => agent.id === item.id);
  }
  function downloadMarketAgent(item: AgentMarketItem) {
    if (!agentCards.some((agent) => agent.id === item.id)) {
      agentCards = [{ id: item.id, name: item.name, role: item.role, runs: 0, status: "已下载", desc: item.desc }, ...agentCards];
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
  function capabilitySubtitle(kind: CapabilityTab) {
    if (kind === "plugin") return "插件市场、安装流程和启用状态";
    if (kind === "mcp") return "MCP Server、连接器和授权状态";
    return "Skill 包、版本来源和 Agent 挂载";
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
    if (item.status.includes("授权") || item.sync.includes("授权")) return "auth";
    return "pending";
  }
  function capabilityActionLabel(item: CapabilityItem) {
    if (item.enabled) return "配置";
    if (item.status.includes("授权") || item.sync.includes("授权")) return "授权";
    if (item.status.includes("待安装")) return "安装";
    return "启用";
  }
  function capabilityStepDone(item: CapabilityItem, index: number) {
    if (item.enabled) return true;
    const currentIndex = item.status.includes("授权") ? 2 : item.status.includes("配置") ? 1 : 0;
    return index <= currentIndex;
  }
  function switchCapabilityTab(kind: CapabilityTab) { capabilityTab = kind; capabilitySearch = ""; selectedCapabilityId = capabilityBuckets[kind][0]?.id || ""; capabilityDetailOpen = false; }
  function startCapabilityCreate(kind: CapabilityTab) { switchCapabilityTab(kind); openWorkLayer("capabilities"); capabilityCreateOpen = true; }
  function configDialogIntro() {
    if (configDialog === "project") return "对标 CreateMatterDialog：记录项目名称、客户、阶段、负责人和初始任务。";
    if (configDialog === "customer") return "对标 CreateClientDialog：记录客户类型、联系方式、风险等级和关联项目。";
    if (configDialog === "schedule") return "对标 CreateScheduleDialog：支持关联项目、客户和提醒时间。";
    if (configDialog === "todo") return "对标 CreateTodoDialog：设置优先级、截止时间和执行 Agent。";
    if (configDialog === "hearing") return "对标 CreateMockHearingDialog：选择辩题、参与角色和关联资料。";
    if (configDialog === "team") return "对标 CreateTeamModal：选择成员、Agent 和协作目标。";
    if (configDialog === "model") return "对标 AddModelDialog：设置 provider、base URL、API Key 和可用模型。";
    if (configDialog === "ingest") return "对标 BatchImportDialog：选择来源、分类、去重和索引策略。";
    if (configDialog === "distill") return "对标 DistillWizard：从历史任务中提炼新 Agent 的身份、技能和工具。";
    return "该弹窗对标 AORISTLAWER 的创建、导入和配置流程。";
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
      current.body += text;
      return;
    }
    appendTranscript({ id: `assistant-${Date.now()}`, role: "assistant", body: text, pending: true });
  }

  function toolTranscriptId(id?: string) {
    return `tool-${id ?? Date.now()}`;
  }

  function historyToTranscript(messages: HistoryMessage[]): TranscriptItem[] {
    const visible = messages.filter((message) => {
      const hasContent = message.content.trim() !== "";
      const hasReasoning = (message.reasoning ?? "").trim() !== "";
      return (message.role === "user" && hasContent) || (message.role === "assistant" && (hasContent || hasReasoning));
    });
    if (!visible.length) return welcomeTranscript();
    return visible.map((message, index) => ({
      id: `history-${index}`,
      role: message.role === "user" ? "user" : "assistant",
      body: message.content,
      title: message.reasoning ? "assistant + reasoning" : undefined,
      pending: false,
    }));
  }

  async function hydrateHistory(tab: TabMeta) {
    const history = await app().HistoryForTab(tab.id);
    transcript = historyToTranscript(history);
    pendingApproval = undefined;
    pendingAsk = undefined;
  }

  function handleEvent(event: WireEvent) {
    if (event.tabId && activeTab?.id && event.tabId !== activeTab.id) return;
    if (event.kind === "turn_started") {
      sending = true;
      pendingApproval = undefined;
      pendingAsk = undefined;
      appendTranscript({ id: `assistant-${Date.now()}`, role: "assistant", body: "", pending: true });
    }
    if (event.kind === "reasoning" && event.reasoning) {
      appendTranscript({ id: `reasoning-${Date.now()}`, role: "reasoning", title: t.transcript.reasoning, body: event.reasoning, pending: true });
    }
    if ((event.kind === "text" || event.kind === "message") && event.text) {
    pendingTextBuffer += event.text;
    scheduleTextFlush();
  }
    if (event.kind === "tool_dispatch" && event.tool) {
      const id = toolTranscriptId(event.tool.id);
      const existing = transcript.find((item) => item.id === id);
      if (existing) {
        existing.title = event.tool.name;
        existing.body = event.tool.args ?? existing.body;
        existing.pending = true;
        existing.readOnly = event.tool.readOnly;
        existing.parentId = event.tool.parentId ? toolTranscriptId(event.tool.parentId) : undefined;
        return;
      }
      appendTranscript({
        id,
        role: "tool",
        title: event.tool.name,
        body: event.tool.args ?? "",
        pending: true,
        readOnly: event.tool.readOnly,
        parentId: event.tool.parentId ? toolTranscriptId(event.tool.parentId) : undefined,
      });
    }
    if (event.kind === "tool_result" && event.tool) {
      const tool = transcript.find((item) => item.id === toolTranscriptId(event.tool?.id));
      if (tool) {
        tool.body += event.tool.output ? `\n${event.tool.output}` : "";
        tool.body += event.tool.err ? `\n${event.tool.err}` : "";
        tool.pending = false;
      }
    }
    if (event.kind === "approval_request" && event.approval) {
      pendingApproval = event.approval;
      sending = false;
    }
    if (event.kind === "ask_request" && event.ask) {
      pendingAsk = event.ask;
      sending = false;
    }
    if (event.kind === "usage" && event.usage) {
      appendTranscript({
        id: `usage-${Date.now()}`,
        role: "notice",
        title: "usage",
        body: `${event.usage.totalTokens ?? 0} ${t.transcript.tokens}`,
      });
    }
    if (event.kind === "notice" && event.text) {
      appendTranscript({ id: `notice-${Date.now()}`, role: "notice", body: event.text });
    }
    if (event.kind === "turn_done") {
      sending = false;
      for (const item of transcript) item.pending = false;
      if (restoreDraftOnTurnDone && submittedDraft) {
        if (!input.trim()) input = submittedDraft.display;
        appendTranscript({ id: `draft-${Date.now()}`, role: "notice", body: "Draft restored after cancellation." });
      }
      restoreDraftOnTurnDone = false;
      submittedDraft = undefined;
    }
  }

  async function refresh() {
    loading = true;
    try {
      tabs = await app().ListTabs();
      const active = tabs.find((tab) => tab.active) ?? tabs[0];
      models = active ? await app().ModelsForTab(active.id) : [];
      selectedModel = models.find((model) => model.current)?.name ?? models[0]?.name ?? "";
      commands = await app().Commands();
      if (active) await refreshCodeDock(active);
      if (active) await hydrateHistory(active);
    } finally {
      loading = false;
    }
  }


  async function refreshCodeDock(tab = activeTab) {
    if (!tab) return;
    context = await app().ContextPanel(tab.id);
    changes = await app().WorkspaceChanges();
    checkpoints = await app().CheckpointsForTab(tab.id);
  }

  async function send(displayText?: string, submitText?: string) {
    const text = (displayText ?? input).trim();
    const submission = (submitText ?? text).trim();
    if (!text || !submission || !activeTab) return;
    const draft = { display: text, submission };
    submittedDraft = draft;
    restoreDraftOnTurnDone = false;
    input = "";
    appendTranscript({ id: `user-${Date.now()}`, role: "user", body: text });
    try {
      await app().SubmitDisplayToTab(activeTab.id, text, submission);
    } catch (error) {
      input = draft.display;
      submittedDraft = undefined;
      restoreDraftOnTurnDone = false;
      throw error;
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
    if (activeTab && next) await app().SetModelForTab(activeTab.id, next);
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
    openCodeConversation();
    codeInspectorOpen = true;
  }

  async function previewChange(path: string) {
    const [diff, preview] = await Promise.all([app().WorkspaceDiff(path), app().ReadFile(path)]);
    diffPreview = diff;
    filePreview = preview;
    openCodeConversation();
    codeInspectorOpen = true;
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
  <title>{t.app.title}</title>
</svelte:head>

<svelte:window onkeydown={handleGlobalKeydown} />

{#if needsAuth}
  <OIDCLoginOverlay onComplete={() => { needsAuth = false; void refresh(); }} />
{:else if needsAuth === null}
  <div class="boot-screen">{t.app.loading}</div>
{:else}
  <main class={["shell", sidebarCollapsed && "is-sidebar-collapsed"]} data-mode={activityMode}>
    <aside class="sidebar sidebar--aorist">
      <header class="sidebar__brand"><div class="brand-mark"><Bot size={17} /></div><div class="brand-copy"><strong>Volt GUI</strong><span>AI 驱动工作台</span></div><button class="brand-workbench-button" class:active={activityMode === "work" && workLayer === "today"} type="button" aria-label="工作台" title="工作台" onclick={() => openWorkLayer("today")}><LayoutDashboard size={15} /></button><button class="sidebar__icon" type="button" aria-label={t.home.sidebar} onclick={() => (sidebarCollapsed = !sidebarCollapsed)}><PanelLeft size={17} /></button></header>
      <nav class="workspace-nav" aria-label="工作台导航">
        {#each workspaceNav as section (section.title)}
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
              {#each section.items as item (item.label)}
                {@const Icon = navIcon(item.icon)}
                <button class:active={activityMode === "work" && workLayer === item.layer} type="button" onclick={() => openWorkLayer(item.layer)}>
                  <span class="nav-icon"><Icon size={15} /></span>
                  <span>{item.label}</span>
                  {#if item.badge}<em>{item.badge}</em>{/if}
                </button>
              {/each}
            {/if}
          </section>
        {/each}
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
                          <em>{conversation.updatedAt}</em>
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
      </nav>
      <footer class="sidebar__user-wrap">{#if userMenuOpen}<div class="user-menu" role="menu">{#each userMenuItems as item (item.layer)}<button type="button" role="menuitem" onclick={() => openUserPanelDialog(item.layer)}>{item.label}</button>{/each}</div>{/if}<button class="sidebar__user sidebar__profile" type="button" aria-label="打开用户菜单" title="用户菜单" onclick={() => (userMenuOpen = !userMenuOpen)}><span class="sidebar__avatar"><UserRound size={16} /></span><strong>用户名</strong><em hidden aria-hidden="true"></em></button></footer>
    </aside>

    <section class="stage">
      <div class="window-drag-region" aria-hidden="true"></div>
      <div class="stage__surface">
        {#if loading}
          <div class="content__loading">{t.app.loading}</div>
        {:else if showActiveTranscript}
          <section class="conversation-view">
            <header class="conversation-header">
              <div>
                <strong>{activeTab?.topicTitle || t.activity.untitled}</strong>
                <span>{activeTab?.workspaceName || t.common.global}</span>
              </div>
              <button type="button" onclick={openCodeInspector}>
                <Code2 size={15} />
                代码状态
              </button>
            </header>
            <div class="conversation">
              <Transcript
                items={transcript}
                {loading}
                {sending}
                approval={pendingApproval}
                ask={pendingAsk}
                onApprove={answerApproval}
                onAnswerAsk={answerAsk}
                onDismissAsk={() => (pendingAsk = undefined)}
              />
            </div>
          </section>
        {:else if activityMode === "work" || activityMode === "code"}
          <section class="workbench aorist-workbench">
            <header class="stage-topbar"><div class="stage-topbar__leading"><div><span>{activityMode === "code" ? "Code" : "Workbench"}</span><strong>{activityMode === "code" ? "新建对话" : workspaceNav.flatMap((section) => section.items).find((item) => item.layer === workLayer)?.label || "工作台"}</strong></div></div></header>
            {#if workLayer === "today"}<section class="aorist-page"><div class="hero-panel"><span>Volt GUI Console</span><h1>把 Agent、项目、客户、日程与自动化集中到一个工作台。</h1><p>Volt GUI 由 AI 驱动，可用于代码、项目与运营任务协作。重要执行结果请以构建、测试和人工复核为准。</p><div><button type="button" onclick={focusNewTask}>新建对话</button><button type="button" onclick={() => openWorkLayer("agents")}>进入 Agent 中心</button></div></div><div class="aorist-stats"><article><span>运行自动化</span><strong>{runningAutomations.filter((item) => item.status === "运行中").length}</strong><em>持续监控中</em></article><article><span>今日日程</span><strong>{calendarEvents.length}</strong><em>会议 / 截止 / 验收</em></article><article><span>项目管理</span><strong>{projectCards.length}</strong><em>可关联任务</em></article><article><span>能力模块</span><strong>{capabilityBuckets.plugin.length + capabilityBuckets.mcp.length + capabilityBuckets.skill.length}</strong><em>插件 / MCP / SKILL</em></article></div><div class="aorist-split workbench-grid"><section class="aorist-card"><header><strong>今日待办</strong><button type="button" onclick={() => openWorkLayer("todos")}>查看全部</button></header>{#each todoItems as item (item.title)}<button class="todo-row" type="button" onclick={() => openWorkLayer("todos")}><i></i><span><strong>{item.title}</strong><em>{item.desc}</em></span><b>{item.state}</b></button>{/each}</section><section class="aorist-card"><header><strong>运行中的自动化</strong><button type="button" onclick={() => openWorkLayer("automations")}>管理</button></header>{#each runningAutomations as item (item.id)}<button class="automation-row" type="button" onclick={() => (automationDialog = item.id)}><span><strong>{item.title}</strong><em>已运行 {formatRuntime(item.startedAtMs)}</em></span><b>{item.status}</b></button>{/each}</section><section class="aorist-card workbench-calendar"><header><strong>日历日程</strong><span>{calendarEvents.length} 项</span></header><div class="calendar-mini-grid">{#each Array.from({ length: 14 }, (_, index) => index + 1) as day (day)}<article class:today={day === 17}><b>{day}</b>{#each calendarEvents.filter((item) => Number(item.day) === day) as event (event.title)}<span>{event.time}</span>{/each}</article>{/each}</div>{#each calendarEvents as event (event.title)}<button class="automation-row" type="button" onclick={() => openConfigDialog("schedule")}><span><strong>{event.title}</strong><em>{event.day} 日 {event.time} / {event.place}</em></span><b>{event.type}</b></button>{/each}<footer><button type="button" onclick={() => openConfigDialog("todo")}>新建待办</button><button type="button" onclick={() => openConfigDialog("schedule")}>新建日程</button></footer></section></div></section>
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
                        {#each newTaskQuickTasks as task (task.title)}
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
                      onInput={(value) => (input = value)}
                      onSend={send}
                      onCancel={cancel}
                      onPreviewFile={previewFile}
                      {models}
                      {selectedModel}
                      onModelChange={switchModel}
                      projectOptions={newTaskProjectOptions}
                      selectedProjectId={linkedProject ? selectedProjectId : ""}
                      onProjectChange={linkProjectById}
                      {workPermission}
                      onWorkPermissionChange={(value) => (workPermission = value)}
                      onOpenResources={openResourceCenterFromComposer}
                      {activityMode}
                      onActivityModeChange={openActivityMode}
                    />
                  </section>

                  <p class="agent-assistant-disclaimer">Volt GUI 由 AI 驱动生成，请结合构建、测试和人工复核采纳执行建议。</p>
                </div>
              </section>
            {:else if workLayer === "todos"}<section class="aorist-page"><div class="aorist-toolbar"><div><span>Task Center</span><strong>待办事项</strong></div><button type="button">新增待办</button></div><div class="aorist-list">{#each todoItems as item (item.title)}<article><div><strong>{item.title}</strong><p>{item.desc}</p><em>{item.due}</em></div><span>{item.state}</span></article>{/each}</div></section>
            {:else if workLayer === "automations"}
              <section class="aorist-page">
                <div class="aorist-toolbar">
                  <div><span>Codex Automation</span><strong>自动化任务</strong></div>
                  <button type="button" onclick={() => (automationDialog = primaryAutomation.id)}>新建自动化任务</button>
                </div>
                <div class="automation-console">
                  <section class="automation-overview">
                    <article><span>运行中</span><strong>{runningAutomations.filter((item) => item.status === "运行中").length}</strong><em>自动化任务</em></article>
                    <article><span>验证自动化</span><strong>{runningAutomations.filter((item) => item.kind.includes("验证")).length}</strong><em>已接入门禁</em></article>
                    <article><span>最近结果</span><strong>{primaryAutomation.result}</strong><em>{primaryAutomation.lastRun}</em></article>
                  </section>

                  <div class="automation-layout">
                    <section class="automation-task-list" aria-label="自动化任务列表">
                      {#each runningAutomations as item (item.id)}
                        {@const isRunning = item.status === "运行中"}
                        <div class:active={automationDialog === item.id} class="automation-card automation-task-card" role="button" tabindex="0" onkeydown={(event) => { if (event.key === "Enter" || event.key === " ") automationDialog = item.id; }} onclick={() => (automationDialog = item.id)}>
                          <header>
                            <span>{item.kind}</span>
                            <em>{item.status}</em>
                          </header>
                          <strong>{item.title}</strong>
                          <p>{item.desc}</p>
                          <dl>
                            <dt>触发方式</dt><dd>{item.schedule}</dd>
                            <dt>工作区</dt><dd>{item.scope}</dd>
                            <dt>下一次</dt><dd>{item.nextRun}</dd>
                          </dl>
                          <div class="automation-step-strip">
                            {#each item.steps as step (step)}
                              <b>{step}</b>
                            {/each}
                          </div>
                          <footer role="presentation" onkeydown={(event) => event.stopPropagation()} onclick={(event) => event.stopPropagation()}>
                            <button type="button">{isRunning ? "暂停" : "开始"}</button>
                            <button type="button" onclick={() => (automationDialog = item.id)}>编辑</button>
                            <button type="button">删除</button>
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
                    <button type="button" onclick={() => { agentMarketSearch = ""; agentMarketOpen = true; }}><Blocks size={15} /> Agent 市场</button>
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
                        <div class="management-meta"><span><CalendarDays size={13} />{project.acceptedAt}</span><span><BriefcaseBusiness size={13} />¥{project.budget}</span><span>委托人：{project.client}</span><span>执行 Agent：{project.agent}</span></div>
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
                  <article><div><span>关联项目</span><strong>{customerCards.reduce((sum, customer) => sum + customer.matters, 0)}</strong><em>累计项目数量</em></div><FolderKanban size={18} /></article>
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
                      <aside class="client-card-side"><span>{customer.matters} 个项目</span><em class:riskHigh={customer.riskLevel === "high"}>{customer.risk}</em></aside>
                      <b>›</b>
                    </button>
                  {:else}
                    <article class="detail-empty"><strong>未找到匹配客户</strong><p>换一个关键词，或新建客户后再关联到任务。</p></article>
                  {/each}
                </div>
              </section>
            {:else if workLayer === "calendar"}<section class="aorist-page"><div class="aorist-toolbar"><div><span>Calendar</span><strong>日程日历</strong></div><div><button type="button" onclick={() => openConfigDialog("todo")}>新建待办</button><button type="button" onclick={() => openConfigDialog("schedule")}>新建日程</button></div></div><div class="aorist-stats"><article><span>本月日程</span><strong>{calendarEvents.length}</strong><em>会议 / 截止 / 验收</em></article><article><span>今日待办</span><strong>{todoItems.length}</strong><em>工作台同步</em></article><article><span>冲突提醒</span><strong>0</strong><em>暂无时间冲突</em></article></div><div class="calendar-board"><div class="calendar-grid">{#each Array.from({ length: 35 }, (_, index) => index + 1) as day (day)}<article class:today={day === 17}><b>{day}</b>{#each calendarEvents.filter((item) => Number(item.day) === day) as event (event.title)}<span>{event.time} {event.title}</span>{/each}</article>{/each}</div><aside class="aorist-card"><header><strong>近日安排</strong><button type="button">同步</button></header>{#each calendarEvents as event (event.title)}<button class="automation-row" type="button"><span><strong>{event.title}</strong><em>{event.day} 日 {event.time} / {event.place}</em></span><b>{event.type}</b></button>{/each}</aside></div></section>
            {:else if workLayer === "mockHearing"}<section class="aorist-page"><div class="aorist-toolbar"><div><span>Mock Hearing</span><strong>模拟庭辩</strong></div><div><button type="button" onclick={() => openConfigDialog("hearing")}>创建庭辩</button><button type="button" onclick={() => (selectedHearingTitle = hearingRooms[0]?.title)}>进入庭辩室</button></div></div><div class="aorist-card-grid">{#each hearingRooms as room (room.title)}<button class="agent-card hearing-card" type="button" onclick={() => (selectedHearingTitle = room.title)}><header><span>辩</span><div><strong>{room.title}</strong><em>{room.stage}</em></div></header><p>{room.role}</p><footer><span>{room.next}</span><b>AI 庭辩</b></footer></button>{/each}</div></section>
            {:else if workLayer === "reports"}<section class="aorist-page"><div class="aorist-toolbar"><div><span>Reports</span><strong>分析报告</strong></div><div><button type="button" onclick={() => openConfigDialog("report")}>新建报告</button><button type="button">批量导出</button></div></div><div class="aorist-card-grid">{#each reportCards as report (report.title)}<article class="media-card"><span>{report.status}</span><strong>{report.title}</strong><p>{report.desc}</p><em>{report.owner}</em></article>{/each}</div></section>
            {:else if workLayer === "resources"}<section class="aorist-page resource-center"><div class="resource-center-topbar"><div class="capability-tabs resource-tabs"><button class:active={resourceTab === "resources"} type="button" onclick={() => (resourceTab = "resources")}>资料库</button><button class:active={resourceTab === "knowledge"} type="button" onclick={() => (resourceTab = "knowledge")}>知识库</button><button class:active={resourceTab === "search"} type="button" onclick={() => (resourceTab = "search")}>全文检索</button><button class:active={resourceTab === "conversationArchive"} type="button" onclick={() => (resourceTab = "conversationArchive")}>对话归档</button><button class:active={resourceTab === "ingest"} type="button" onclick={() => (resourceTab = "ingest")}>导入中心</button></div><div class="resource-center-actions"><button type="button" onclick={() => openConfigDialog("resource")}>上传资料</button><button type="button" onclick={() => openConfigDialog("ingest")}>批量导入</button></div></div>{#if resourceTab === "resources"}<div class="resource-section-top"><label class="aorist-search"><Search size={16} /><input bind:value={resourceSearch} aria-label="检索资料库" placeholder="检索标题、来源、状态或文件数量" /></label><span>{filteredResourceItems.length} / {resourceItems.length} 项</span></div><div class="aorist-card-grid">{#each filteredResourceItems as item (item.title)}<article class="media-card"><span>{item.status}</span><strong>{item.title}</strong><p>{item.source}</p><em>{item.size}</em></article>{:else}<article class="detail-empty resource-library-empty"><strong>未找到匹配资料</strong><p>换一个关键词，或上传资料后重新检索。</p></article>{/each}</div>{:else if resourceTab === "knowledge"}<div class="resource-section-top"><label class="aorist-search"><Search size={16} /><input aria-label="搜索文书、法规与规则" placeholder="搜索标题、条文、模板或标签" /></label><div class="resource-actions"><button type="button" onclick={() => openConfigDialog("ingest")}>导入知识</button><button type="button" onclick={() => openConfigDialog("template")}>新建模板</button><button type="button">同步订阅源</button></div></div><div class="knowledge-layout knowledge-layout--merged"><div class="knowledge-stack"><section><header><span>Document Knowledge</span><strong>文书知识</strong></header><div class="aorist-card-grid">{#each documentItems as item (item.title)}<article class="capability-item"><span>{item.status}</span><strong>{item.title}</strong><p>{item.type} / {item.count} 份文档</p><button type="button">打开</button></article>{/each}</div></section><section><header><span>Regulation Knowledge</span><strong>法规知识</strong></header><div class="aorist-list">{#each regulationItems as item (item.title)}<article><div><strong>{item.title}</strong><p>{item.category} / {item.tags}</p><em>{item.status}</em></div><span>{item.category}</span></article>{/each}</div></section></div><aside class="knowledge-preview"><span>知识库预览</span><strong>{regulationItems[0].title}</strong><p>统一承载文书、法规、资料、检索与导入任务，避免在工作台中拆出重复入口。</p></aside></div>{:else if resourceTab === "search"}<div class="resource-section-top"><label class="aorist-search"><Search size={16} /><input aria-label="跨项目、客户、文书、法规检索" placeholder="输入关键词，检索所有工作台内容" /></label><span>{searchResults.length} 项</span></div><div class="aorist-list">{#each searchResults as result (result.title)}<article><div><strong>{result.title}</strong><p>{result.snippet}</p><em>{result.scope}</em></div><span>匹配</span></article>{/each}</div>{:else if resourceTab === "conversationArchive"}<div class="resource-archive-summary"><div><span>Archived Conversations</span><strong>{archivedSidebarConversationCount} 个归档对话</strong></div><em>按项目整理，可直接删除不再保留的归档</em></div>{#if archivedSidebarConversationCount}<div class="resource-archive-list">{#each sortedSidebarProjects as project (project.id)}{@const archivedConversations = archivedSidebarProjectConversations(project)}{#if archivedConversations.length}<section class="resource-archive-project"><header><div><strong>{project.name}</strong><span>{project.localPath || "本地项目"}</span></div><em>{archivedConversations.length} 个</em></header><div>{#each archivedConversations as conversation (conversation.id)}<article><div><strong>{conversation.title}</strong><p>{conversation.updatedAt}</p></div><button type="button" aria-label={`删除归档对话 ${conversation.title}`} onclick={() => deleteSidebarConversation(project.id, conversation.id)}><Trash2 size={14} /> 删除</button></article>{/each}</div></section>{/if}{/each}</div>{:else}<article class="detail-empty resource-archive-empty"><strong>暂无归档对话</strong><p>在项目侧边栏点击对话右侧的归档按钮后，会按项目整理到这里。</p></article>{/if}{:else}<div class="resource-actions"><button type="button" onclick={() => openConfigDialog("ingest")}>批量导入</button><button type="button">查看失败</button></div><div class="aorist-list">{#each ingestJobs as job (job.title)}<article><div><strong>{job.title}</strong><p>{job.source} / {job.total} 条记录</p><em>导入队列</em></div><span>{job.status}</span></article>{/each}</div>{/if}</section>
            {:else if workLayer === "teams"}
              <section class="aorist-page team-collab-page">
                {#if teamViewMode === "chat"}
                  {@const activeTeam = selectedTeamRoom()}
                  <div class="team-chat-shell">
                    <header class="team-chat-header">
                      <div class="team-chat-title">
                        <button type="button" aria-label="返回团队大厅" onclick={() => (teamViewMode = "teams")}><ArrowLeft size={16} /></button>
                        <span><UsersRound size={16} /></span>
                        <strong>{activeTeam?.title || "Agent Team"}</strong>
                        <button type="button" title="编辑团队" onclick={() => openTeamBuilder(activeTeam?.title)}><Pencil size={14} /></button>
                      </div>
                      <div class="team-member-bar">
                        {#each teamMembers(activeTeam) as agent (agent.id)}
                          {@const AgentIcon = agentIcon(agent.id)}
                          <span class:leader={agent.id === teamLeaderId(activeTeam)}>
                            <i><AgentIcon size={12} /></i>
                            {agent.name}
                            {#if agent.id === teamLeaderId(activeTeam)}<b>Team Leader</b>{/if}
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
                          <strong>团队已就绪</strong>
                          <p>发送任务指令后，{teamMembers(activeTeam).length} 位 Agent 会依次协作输出。</p>
                        </div>
                      {/if}
                      {#each selectedTeamChatMessages() as message (message.id)}
                        {@const MessageIcon = message.role === "user" ? UserRound : agentIcon(message.agentId || "")}
                        <article class="team-message" class:user={message.role === "user"}>
                          <span><MessageIcon size={16} /></span>
                          <div>
                            {#if message.role === "agent"}
                              <header>{message.agentName || "Agent"}{#if message.agentId === teamLeaderId(activeTeam)}<b><Crown size={11} />Team Leader</b>{/if}</header>
                            {/if}
                            <p>{message.content}</p>
                          </div>
                        </article>
                      {/each}
                      {#if teamChatSending}
                        <article class="team-message team-message--loading">
                          <span><Loader2 size={16} /></span>
                          <div><header>Agent Team</header><p><Activity size={13} />团队成员处理中...</p></div>
                        </article>
                      {/if}
                    </main>
                    <footer class="team-compose-bar">
                      {#if teamChatAttachments.length}
                        <div class="team-attachments">
                          {#each teamChatAttachments as attachment, index (attachment)}
                            <button type="button" onclick={() => removeTeamChatAttachment(index)}>{attachment}<b>×</b></button>
                          {/each}
                        </div>
                      {/if}
                      <div class="team-compose-row">
                        <button type="button" aria-label="上传文件" onclick={addTeamChatAttachment}><Plus size={16} /></button>
                        <select bind:value={teamChatModel} aria-label="选择模型">
                          {#each modelCards as model (model.name)}
                            <option value={model.name}>{model.name}</option>
                          {/each}
                        </select>
                        <textarea bind:value={teamChatInput} rows="1" placeholder="向 Agent Team 发送任务..." onkeydown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendTeamChat(); } }}></textarea>
                        <button class="team-send" type="button" disabled={!teamChatInput.trim() || teamChatSending} onclick={sendTeamChat}>发送</button>
                      </div>
                    </footer>
                  </div>
                {:else}
                  <div class="team-page-head">
                    <div>
                      <h1><UsersRound size={30} />Agent 团队协作</h1>
                      <p>配置并管理多 Agent 工作小组，也可以在 Office 视图中查看团队状态、席位和任务流。</p>
                    </div>
                    <div class="team-head-actions">
                      <div class="team-view-switch" role="tablist" aria-label="团队视图">
                        <button class:active={teamViewMode === "teams"} type="button" onclick={() => (teamViewMode = "teams")}><UsersRound size={15} />团队列表</button>
                        <button class:active={teamViewMode === "office"} type="button" onclick={() => (teamViewMode = "office")}><BriefcaseBusiness size={15} />Agent Office</button>
                      </div>
                      <button class="team-primary" type="button" onclick={() => openTeamBuilder()}><Plus size={15} />配置新组</button>
                    </div>
                  </div>

                  {#if teamViewMode === "office"}
                    <div class="team-office-shell">
                      <div class="team-office-toolbar">
                        <select value={selectedTeamTitle || teamRooms[0]?.title || ""} onchange={(event) => (selectedTeamTitle = (event.currentTarget as HTMLSelectElement).value)}>
                          {#each teamRooms as team (team.id)}
                            <option value={team.title}>{team.title}</option>
                          {/each}
                        </select>
                        <button type="button" onclick={() => (selectedTeamTitle = selectedTeamTitle || teamRooms[0]?.title)}><RefreshCw size={13} />重载办公室</button>
                      </div>
                      <div class="team-office-stage">
                        <div class="team-office-status">
                          <span>{selectedTeamRoom()?.status}</span>
                          <strong>{selectedTeamRoom()?.title} Office</strong>
                          <p>{teamLeader()?.name}: 正在推进 {selectedTeamRoom()?.topic}</p>
                        </div>
                        <div class="team-office-grid">
                          {#each teamMembers() as agent (agent.id)}
                            {@const AgentIcon = agentIcon(agent.id)}
                            <article class:leader={agent.id === teamLeaderId()}>
                              <span><AgentIcon size={18} /></span>
                              <strong>{agent.name}</strong>
                              <em>{agent.id === teamLeaderId() ? "Team Leader" : "Agent Seat"}</em>
                              <p>{agent.id === teamLeaderId() ? "正在拆解任务和同步结论" : agent.desc}</p>
                            </article>
                          {/each}
                        </div>
                        <div class="team-office-memo">
                          <strong>Office Memo</strong>
                          <p>{selectedTeamRoom()?.title} 已接入团队协作协议，成员状态、任务流和会话记录会同步到工作台。</p>
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
                          <div class="team-card-meta"><em>{team.active}</em><b>{team.queue}</b><button type="button">进入会话</button></div>
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
            {:else if workLayer === "models"}<section class="aorist-page"><div class="aorist-toolbar"><div><span>Models</span><strong>模型管理</strong></div><div><button type="button" onclick={() => openConfigDialog("model")}>添加模型</button><button type="button">刷新状态</button></div></div><div class="aorist-stats"><article><span>模型数量</span><strong>{modelCards.length}</strong><em>可选模型</em></article><article><span>远程 LLM</span><strong>ON</strong><em>已允许</em></article><article><span>密钥状态</span><strong>OK</strong><em>环境变量托管</em></article></div><div class="aorist-card-grid">{#each modelCards as model (model.name)}<article class="capability-item"><span>{model.status}</span><strong>{model.name}</strong><p>{model.provider} / {model.role}</p><button type="button">设为默认</button></article>{/each}</div></section>
            {:else if workLayer === "settings"}<section class="aorist-page"><div class="aorist-toolbar"><div><span>Settings</span><strong>系统设置</strong></div><button type="button">保存设置</button></div><div class="aorist-card-grid">{#each settingGroups as item (item.title)}<article class="capability-item"><span>{item.status}</span><strong>{item.title}</strong><p>{item.desc}</p><button type="button">配置</button></article>{/each}</div></section>
            {:else if workLayer === "sync"}<section class="aorist-page"><div class="aorist-toolbar"><div><span>Sync</span><strong>同步中心</strong></div><button type="button">立即同步</button></div><div class="aorist-list">{#each syncJobs as job (job.title)}<article><div><strong>{job.title}</strong><p>{job.time}</p><em>进度 {job.progress}</em></div><span>{job.status}</span></article>{/each}</div></section>
            {:else if workLayer === "operationLog"}<section class="aorist-page"><div class="aorist-toolbar"><div><span>Operation Log</span><strong>操作记录</strong></div><button type="button">导出日志</button></div><div class="aorist-list">{#each operationLogs as log (log.time)}<article><div><strong>{log.action}</strong><p>{log.target} / {log.user}</p><em>{log.time}</em></div><span>{log.result}</span></article>{/each}</div></section>
            {:else}
              {@const selectedCapability = currentCapability()}
              <section class="aorist-page capability-manager capability-console">
                <header class="capability-hub-header">
                  <div class="capability-hub-header__title">
                    <span>Plugin Hub</span>
                    <strong>能力中心</strong>
                    <p>参考 Accio 插件模块：用目录检索、安装步骤、MCP 连接、授权和 Agent 绑定来管理工作台能力。</p>
                  </div>
                  <label class="capability-search">
                    <Search size={15} />
                    <input bind:value={capabilitySearch} placeholder={`搜索${capabilityLabel(capabilityTab)}名称 / 描述 / 来源`} />
                  </label>
                  <div class="capability-hub-header__actions">
                    <button type="button" onclick={() => openConfigDialog("ingest")}><Upload size={15} /> 导入配置</button>
                    <button type="button"><RefreshCw size={15} /> 刷新状态</button>
                    <button type="button" onclick={() => (capabilityCreateOpen = true)}><CirclePlus size={15} /> 创建插件</button>
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
                      <p>安装前先确认来源、权限和可绑定 Agent，避免能力入口失控。</p>
                    </div>
                  </aside>
                  <section class="capability-panel capability-market">
                    <header>
                      <div><span>{capabilityLabel(capabilityTab)} Catalog</span><strong>{capabilityLabel(capabilityTab)} 目录</strong><p>按 Accio 插件卡片方式展示来源、版本、状态、权限和安装动作。</p></div>
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
                    {landing.title}
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
                  onInput={(value) => (input = value)}
                  onSend={send}
                  onCancel={cancel}
                  onPreviewFile={previewFile}
                  {models}
                  {selectedModel}
                  onModelChange={switchModel}
                  projectOptions={newTaskProjectOptions}
                  selectedProjectId={linkedProject ? selectedProjectId : ""}
                  onProjectChange={linkProjectById}
                  {workPermission}
                  onWorkPermissionChange={(value) => (workPermission = value)}
                  onOpenResources={openResourceCenterFromComposer}
                  {activityMode}
                  onActivityModeChange={openActivityMode}
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
                {#each landing.quick as quick (quick.label)}
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

      {#if automationDialog && currentAutomation()}
        <div class="modal-backdrop"><section class="config-modal automation-config-modal"><header><div><span>Automation Task</span><strong>{currentAutomation()?.title}</strong></div><button type="button" onclick={() => (automationDialog = undefined)}>x</button></header><div class="config-grid"><label>任务类型<input value={currentAutomation()?.kind || ""} /></label><label>运行状态<input value={currentAutomation()?.status || ""} /></label><label>覆盖范围<input value={currentAutomation()?.scope || ""} /></label><label>触发条件<input value={currentAutomation()?.cadence || ""} /></label><label>执行环境<input value={currentAutomation()?.environment || ""} /></label><label>下次运行<input value={currentAutomation()?.nextRun || ""} /></label><label class="wide">验证命令<textarea rows="3" value={currentAutomation()?.command || ""}></textarea></label><label class="wide">任务说明<textarea rows="4" value={currentAutomation()?.desc || ""}></textarea></label><label class="wide">运行步骤<textarea rows="4" value={currentAutomation()?.steps.join("\n") || ""}></textarea></label></div><footer><button type="button" onclick={() => (automationDialog = undefined)}>取消</button><button type="button" onclick={() => (automationDialog = undefined)}>保存配置</button></footer></section></div>
      {/if}
      {#if selectedHearingTitle}
        <div class="modal-backdrop"><section class="config-modal room-modal"><header><div><span>Mock Hearing Room</span><strong>{selectedHearingRoom()?.title}</strong></div><button type="button" onclick={() => (selectedHearingTitle = undefined)}>x</button></header><div class="room-layout"><aside><span>{selectedHearingRoom()?.stage}</span><strong>{selectedHearingRoom()?.role}</strong><p>{selectedHearingRoom()?.next}</p></aside><main><article class="room-message judge"><b>审判视角</b><p>先核对争议焦点，再进入询问与反询问。</p></article><article class="room-message plaintiff"><b>主张方 Agent</b><p>基于项目记录提炼证据链和责任边界。</p></article><article class="room-message defendant"><b>答辩方 Agent</b><p>按时间线检查对方假设和缺失材料。</p></article></main></div><footer><button type="button" onclick={() => (selectedHearingTitle = undefined)}>暂停</button><button type="button" onclick={() => (selectedHearingTitle = undefined)}>生成总结</button></footer></section></div>
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
                <div><strong>{project.name}</strong><span>{project.code} / {project.category}</span></div>
                <em>{project.status === "closed" ? "已归档" : "进行中"}</em>
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
                      {#each project.timeline as item, index (item)}
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
                        {#each linkedProjectMaterials as material (material.title)}
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
                        {#each linkedProjectSchedules as schedule (schedule.title)}
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
                        {#each linkedProjectReports as report (report.title)}
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
                        {#each linkedProjectTodos as todo (todo.title)}
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
                    <h3>当事人结构</h3>
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
                  <strong>{customer.name}</strong>
                  <span><Phone size={13} />{customer.phone}<Mail size={13} />{customer.email}</span>
                </div>
                <em>{customer.type === "企业" ? "企业客户" : "个人客户"}</em>
                <em class="muted">{customer.status}</em>
              </div>
              <button class="customer-detail-primary" type="button" onclick={() => openConfigDialog("todo")}><Plus size={14} /> 新增待办</button>
            </header>
            <aside class="detail-panel customer-detail-panel">
              <div class="customer-detail-body">
                <main class="customer-detail-main">
                  <div class="detail-tabs" role="tablist" aria-label="客户详情标签">
                    <button class:active={customerDetailTab === "overview"} type="button" onclick={() => (customerDetailTab = "overview")}>概览</button>
                    <button class:active={customerDetailTab === "projects"} type="button" onclick={() => (customerDetailTab = "projects")}>项目 ({linkedCustomerProjects.length})</button>
                    <button class:active={customerDetailTab === "materials"} type="button" onclick={() => (customerDetailTab = "materials")}>资料 ({customer.materials})</button>
                    <button class:active={customerDetailTab === "schedules"} type="button" onclick={() => (customerDetailTab = "schedules")}>日程 ({customer.events})</button>
                    <button class:active={customerDetailTab === "todos"} type="button" onclick={() => (customerDetailTab = "todos")}>待办</button>
                  </div>
                  {#if customerDetailTab === "overview"}
                    <section class="customer-detail-card">
                      <h3><BriefcaseBusiness size={15} /> 客户画像</h3>
                      <div class="customer-profile-grid">
                        <article><span>联系人</span><strong>{customer.contact}</strong></article>
                        <article><span>当前活跃项目</span><strong>{linkedCustomerProjects.filter((project) => project.status !== "closed").length} 件</strong></article>
                        <article><span>关联资料</span><strong>{customer.materials} 份</strong></article>
                        <article><span>本月日程</span><strong>{customer.events} 项</strong></article>
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
                        <div><h3><FolderKanban size={15} /> 关联项目</h3><p>对标 AORISTLAWER 的关联案件列表，点击后进入项目详情。</p></div>
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
                        <div><h3><Database size={15} /> 客户资料库</h3><p>展示最近关联资料，完整 {customer.materials} 份资料继续在资料中心索引。</p></div>
                        <button type="button" onclick={() => openConfigDialog("resource")}><Upload size={13} /> 上传资料</button>
                      </header>
                      <div class="customer-resource-toolbar">
                        <span>已展示 {linkedCustomerMaterials.length} 份</span>
                        <button type="button" onclick={() => { customerDetailOpen = false; openWorkLayer("resources"); resourceTab = "resources"; }}>打开资料中心</button>
                      </div>
                      <div class="customer-detail-list">
                        {#each linkedCustomerMaterials as material (material.title)}
                          <button class="customer-detail-row" type="button" onclick={() => { customerDetailOpen = false; openWorkLayer("resources"); resourceTab = "resources"; }}>
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
                        {#each linkedCustomerSchedules as schedule (schedule.title)}
                          <button class="customer-detail-row" type="button" onclick={() => openWorkLayer("calendar")}>
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
                        {#each linkedCustomerTodos as todo (todo.title)}
                          <button class="customer-detail-row customer-todo-row" type="button" onclick={() => linkCustomerToTask(customer.name)}>
                            <span><ListTodo size={17} /></span>
                            <div><strong>{todo.title}</strong><em>{todo.priority}优先级 / {todo.due}</em><p>{todo.desc}</p></div>
                            <b>{todo.state}</b>
                          </button>
                        {:else}
                          <article class="detail-empty"><strong>暂无客户待办</strong><p>新建待办后会自动出现在当前客户档案中。</p></article>
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
            {#if userPanelDialog === "models"}
              <div class="user-panel-stats"><article><span>模型数量</span><strong>{modelCards.length}</strong></article><article><span>默认模型</span><strong>{selectedModel || agentModel}</strong></article><article><span>接口状态</span><strong>OK</strong></article></div>
              <div class="user-panel-list">{#each modelCards as model (model.name)}<article><div><strong>{model.name}</strong><p>{model.provider} / {model.role}</p></div><span>{model.status}</span></article>{/each}</div>
            {:else if userPanelDialog === "settings"}
              <div class="user-panel-grid">{#each settingGroups as item (item.title)}<article><span>{item.status}</span><strong>{item.title}</strong><p>{item.desc}</p><button type="button">配置</button></article>{/each}</div>
              <div class="config-grid user-panel-form"><label>语言<select><option>中文</option><option>English</option></select></label><label>主题<select><option>浅色</option><option>深色</option><option>跟随系统</option></select></label><label>局域网运行<input value="127.0.0.1:5174" /></label><label>默认模型<input value={selectedModel || agentModel} /></label></div>
            {:else if userPanelDialog === "sync"}
              <div class="user-panel-list sync-dialog-list">{#each syncJobs as job (job.title)}<article><div><strong>{job.title}</strong><p>{job.time}</p><em>进度 {job.progress}</em><i style={`--progress:${job.progress}`}></i></div><span>{job.status}</span></article>{/each}</div>
            {:else}
              <div class="user-panel-list">{#each operationLogs as log (log.time)}<article><div><strong>{log.action}</strong><p>{log.target} / {log.user}</p><em>{log.time}</em></div><span>{log.result}</span></article>{/each}</div>
            {/if}
            <footer><button type="button" onclick={() => (userPanelDialog = undefined)}>关闭</button><button type="button" onclick={() => (userPanelDialog = undefined)}>{userPanelDialog === "operationLog" ? "导出日志" : "保存"}</button></footer>
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
                {#each capabilityInstallSteps as step, index (step.id)}
                  <article class:done={capabilityStepDone(selectedCapability, index)}>
                    <span>{#if capabilityStepDone(selectedCapability, index)}<Check size={13} />{:else}{index + 1}{/if}</span>
                    <div><strong>{step.label}</strong><p>{step.desc}</p></div>
                  </article>
                {/each}
              </section>
              <section class="capability-agent-binding">
                <header><Zap size={16} /><strong>绑定 Agent</strong></header>
                {#each agentCards.slice(0, 3) as agent (agent.id)}
                  <button type="button" aria-pressed={selectedCapability.enabled}>
                    <span><strong>{agent.name}</strong><em>{agent.role} / {agent.status}</em></span>
                    <i class:enabled={selectedCapability.enabled}><u></u></i>
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
            <footer><button type="button" onclick={() => (capabilityDetailOpen = false)}>关闭</button><button type="button" onclick={() => { capabilityCreateOpen = true; capabilityDetailOpen = false; }}>{capabilityActionLabel(selectedCapability)}</button></footer>
          </div>
        </div>
      {/if}
      {#if configDialog}
        <div class="modal-backdrop"><section class="config-modal" class:team-modal={configDialog === "team"}><header><div><span>{configDialog === "team" ? "Agent Team" : "Aorist Dialog"}</span><strong>{configDialogTitle()}</strong>{#if configDialog === "team"}<p>设置团队名称并添加至少一个智能体。你可以将其中一个设为负责推进主流程的 Team Leader。</p>{/if}</div><button type="button" onclick={() => (configDialog = undefined)}>x</button></header>{#if configDialog === "selectProject"}<div class="select-list"><p>{configDialogIntro()}</p>{#each projectCards as project (project.id)}<button type="button" onclick={() => { linkProjectToTask(project.name); configDialog = undefined; }}><strong>{project.name}</strong><span>{project.client} / {project.stage}</span></button>{/each}</div>{:else if configDialog === "selectCustomer"}<div class="select-list"><p>{configDialogIntro()}</p>{#each customerCards as customer (customer.id)}<button type="button" onclick={() => { linkCustomerToTask(customer.name); configDialog = undefined; }}><strong>{customer.name}</strong><span>{customer.phone} / {customer.risk}</span></button>{/each}</div>{:else if configDialog === "distill"}<div class="distill-panel"><p>{configDialogIntro()}</p><div class="distill-steps"><button class:active={distillStep === 1} type="button" onclick={() => (distillStep = 1)}>1. 选择样本</button><button class:active={distillStep === 2} type="button" onclick={() => (distillStep = 2)}>2. 提炼能力</button><button class:active={distillStep === 3} type="button" onclick={() => (distillStep = 3)}>3. 生成 Agent</button></div>{#if distillStep === 1}<div class="wizard-skill-list">{#each todoItems as item (item.title)}<button type="button"><div><strong>{item.title}</strong><p>{item.desc}</p></div><em>{item.state}</em></button>{/each}</div>{:else if distillStep === 2}<div class="wizard-card-grid">{#each skillCards as skill (skill.id)}<button class:active={skill.active} type="button"><strong>{skill.title}</strong><span>{skill.desc}</span><em>{skill.version}</em></button>{/each}</div>{:else}<div class="wizard-preview distill-preview"><span>Agent Preview</span><div><b><Workflow size={24} /></b><strong>蒸馏任务 Agent</strong><em>{agentModel}</em><p>从已完成任务、工具调用和项目资料中抽取可复用工作流。</p></div></div>{/if}</div>{:else if configDialog === "team"}
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
      <label>团队名称 *<input bind:value={teamBuilderName} placeholder="例如 庭审突击团队" /></label>
    </aside>
  </div>{:else}<div class="config-grid"><label>名称<input value={configDialogTitle()} /></label><label>关联对象<input value={linkedProject || linkedCustomer || selectedProject()?.name || "Volt GUI"} /></label><label>执行 Agent<select><option>{agentCards.find((agent) => agent.id === selectedAgentId)?.name}</option>{#each agentCards as agent (agent.id)}<option>{agent.name}</option>{/each}</select></label><label>模型<select><option>{selectedModel || agentModel}</option>{#each modelCards as model (model.name)}<option>{model.name}</option>{/each}</select></label>{#if configDialog === "model"}<label>Provider<select>{#each modelProviders as provider (provider)}<option>{provider}</option>{/each}</select></label><label>Base URL<input value="https://api.example.com/v1" /></label>{:else if configDialog === "ingest"}<label>导入来源<select><option>workspace</option><option>local files</option><option>manual</option></select></label><label>索引策略<select><option>自动分类并去重</option><option>仅入库</option></select></label>{:else if configDialog === "hearing"}<label>庭辩角色<select><option>产品方 / 交付方</option><option>主张方 / 答辩方</option></select></label><label>争议焦点<input value="需求边界与交付责任" /></label>{:else}<label>优先级<select><option>中</option><option>高</option><option>低</option></select></label><label>截止时间<input value="今天 18:00" /></label>{/if}<label class="wide">配置说明<textarea rows="4">{configDialogIntro()}</textarea></label></div>{/if}<footer><button type="button" onclick={() => (configDialog = undefined)}>取消</button><button type="button" onclick={() => configDialog === "team" ? saveTeamBuilder() : (configDialog = undefined)}>确认</button></footer></section></div>
      {/if}
      {#if agentWizardOpen}
        {@const WizardAvatarIcon = avatarIcon(agentAvatar)}
        <div class="modal-backdrop"><section class="agent-wizard"><header class="agent-wizard__header"><div class="wizard-avatar"><WizardAvatarIcon size={22} /></div><div><strong>{agentCards.find((agent) => agent.id === selectedAgentId)?.name || "创建 Agent"}</strong><span>创建与配置 Agent</span></div><button type="button" onclick={() => (agentWizardOpen = false)}>x</button></header><div class="agent-wizard__body"><nav class="wizard-tabs">{#each wizardTabs as tab (tab.id)}<button class:active={agentWizardTab === tab.id} type="button" onclick={() => (agentWizardTab = tab.id)}>{tab.label}</button>{/each}</nav><div class="wizard-panel">{#if agentWizardTab === "identity"}<div class="wizard-identity"><div class="wizard-form"><label>智能体名称<input value={agentCards.find((agent) => agent.id === selectedAgentId)?.name || ""} /></label><label>系统设定指示词<textarea rows="4" value={agentCards.find((agent) => agent.id === selectedAgentId)?.desc || ""}></textarea></label><div class="pill-group"><span>智能体头像</span>{#each avatarPresets as avatar (avatar)}{@const AvatarOptionIcon = avatarIcon(avatar)}<button class:active={agentAvatar === avatar} type="button" aria-label={`选择头像 ${avatar}`} onclick={() => (agentAvatar = avatar)}><AvatarOptionIcon size={15} /></button>{/each}</div><div class="pill-group"><span>执业风格</span>{#each vibePresets as vibe (vibe)}<button type="button">{vibe}</button>{/each}</div><div class="pill-group"><span>模型底座</span>{#each modelProviders as provider (provider)}<button class:active={agentProvider === provider} type="button" onclick={() => { agentProvider = provider; agentModel = modelOptions[provider]?.[0] || agentModel; }}>{provider}</button>{/each}</div><select value={agentModel} onchange={(event) => (agentModel = (event.currentTarget as HTMLSelectElement).value)}>{#each modelOptions[agentProvider] || [] as model (model)}<option value={model}>{model}</option>{/each}</select></div><aside class="wizard-preview"><span>身份预览</span><div><b><WizardAvatarIcon size={28} /></b><strong>{agentCards.find((agent) => agent.id === selectedAgentId)?.name || "未命名 Agent"}</strong><em>{agentModel}</em><p>{agentCards.find((agent) => agent.id === selectedAgentId)?.desc || "尚未分配具体职能。"}</p></div></aside></div>{:else if agentWizardTab === "tools"}<div class="wizard-card-grid">{#each toolCards as tool (tool.id)}<button class:active={tool.active} type="button"><strong>{tool.title}</strong><span>{tool.desc}</span><em>{tool.active ? "已启用" : "未启用"}</em></button>{/each}</div>{:else if agentWizardTab === "skills"}<div class="wizard-skill-list">{#each skillCards as skill (skill.id)}<button class:active={skill.active} type="button"><div><strong>{skill.title}</strong><span>{skill.version}</span><p>{skill.desc}</p></div><em>{skill.active ? "已挂载" : "未挂载"}</em></button>{/each}</div>{:else}<div class="wizard-files"><nav>{#each coreFiles as file (file)}<button class:active={selectedCoreFile === file} type="button" onclick={() => (selectedCoreFile = file)}>{file}</button>{/each}</nav><pre>{coreFileContent[selectedCoreFile]}</pre></div>{/if}</div></div><footer class="agent-wizard__footer"><button type="button" onclick={() => (agentWizardOpen = false)}>取消</button><button type="button" onclick={() => (agentWizardOpen = false)}>完成并部署</button></footer></section></div>
      {/if}
      {#if agentMarketOpen}
        <div class="modal-backdrop">
          <div class="config-modal agent-market-modal" role="dialog" aria-modal="true" aria-label="Agent 市场">
            <header>
              <div><span>Agent Market</span><strong>Agent 市场</strong></div>
              <button type="button" onclick={() => (agentMarketOpen = false)}>x</button>
            </header>
            <div class="agent-market-toolbar">
              <label class="aorist-search agent-market-search"><Search size={16} /><input bind:value={agentMarketSearch} aria-label="搜索 Agent 市场" placeholder="搜索 Agent 类型、能力或来源" /></label>
              <div class="agent-market-stats">
                <span>{downloadedMarketAgentIds.length} 已下载</span>
                <span>{agentMarketItems.length} 可用</span>
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
                    {#each item.tags as tag (tag)}
                      <span>{tag}</span>
                    {/each}
                  </div>
                  <footer>
                    <small>本地 JSON 包</small>
                    <button class:downloaded type="button" onclick={() => downloadMarketAgent(item)}>
                      {#if downloaded}<Check size={14} /> 已下载{:else}<Download size={14} /> 下载到本地{/if}
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

      {#if capabilityCreateOpen}
        <div class="modal-backdrop">
          <section class="config-modal capability-create-modal">
            <header><div><span>Capability Create</span><strong>创建{capabilityLabel(capabilityTab)}</strong></div><button type="button" onclick={() => (capabilityCreateOpen = false)}>x</button></header>
            <div class="capability-tabs capability-create-tabs" role="tablist" aria-label="创建能力类型">
              <button class:active={capabilityTab === "plugin"} type="button" onclick={() => switchCapabilityTab("plugin")}>插件</button>
              <button class:active={capabilityTab === "mcp"} type="button" onclick={() => switchCapabilityTab("mcp")}>MCP</button>
              <button class:active={capabilityTab === "skill"} type="button" onclick={() => switchCapabilityTab("skill")}>SKILL</button>
            </div>
            <div class="config-grid">
              <label>名称<input value={`新建${capabilityLabel(capabilityTab)}`} /></label>
              <label>分组<input value={capabilityLabel(capabilityTab)} /></label>
              <label>版本<input value="v0.1" /></label>
              <label>运行范围<input value={capabilityTab === "mcp" ? "workspace" : capabilityTab === "skill" ? "skills" : "desktop/frontend"} /></label>
              <label>入口路径<input value={capabilityTab === "mcp" ? "mcp/server.json" : capabilityTab === "skill" ? "SKILL.md" : "plugin.json"} /></label>
              <label>默认状态<select><option>启用</option><option>待配置</option><option>需授权</option></select></label>
              <label class="wide">配置说明<textarea rows="4">{capabilitySubtitle(capabilityTab)} 对标 AORISTLAWER 的工具 / 技能配置流程：先登记元数据，再配置权限，最后挂载到 Agent 与新建对话。</textarea></label>
            </div>
            <footer><button type="button" onclick={() => (capabilityCreateOpen = false)}>取消</button><button type="button" onclick={() => (capabilityCreateOpen = false)}>创建并挂载</button></footer>
          </section>
        </div>
      {/if}

      {#if showTranscript}
        <div class="stage__composer">
          <Composer
            {input}
            {commands}
            {sending}
            onInput={(value) => (input = value)}
            onSend={send}
            onCancel={cancel}
            onPreviewFile={previewFile}
            {models}
            {selectedModel}
            onModelChange={switchModel}
            projectOptions={newTaskProjectOptions}
            selectedProjectId={linkedProject ? selectedProjectId : ""}
            onProjectChange={linkProjectById}
            {workPermission}
            onWorkPermissionChange={(value) => (workPermission = value)}
            onOpenResources={openResourceCenterFromComposer}
            {activityMode}
            onActivityModeChange={openActivityMode}
          />
        </div>
      {/if}
    </section>
  </main>
{/if}

<style>
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
    padding: 26px clamp(24px, 5vw, 80px) 196px;
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
  .sidebar__brand{--wails-draggable:drag;display:grid;grid-template-columns:34px minmax(0,1fr) 30px;gap:10px;align-items:center;min-height:56px;padding:0 12px;border-bottom:1px solid #e5e7eb}.brand-mark,.nav-icon{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9px;color:#1f5fbf;background:#eaf2ff}.sidebar__brand strong,.sidebar__brand span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sidebar__brand strong{font-size:14px;color:#111827}.sidebar__brand span{margin-top:2px;color:#6b7280;font-size:11px}
  .workspace-nav{flex:1;min-height:0;overflow:auto;padding:10px 8px}.workspace-nav section{margin-bottom:10px}.workspace-nav h2{margin:8px 8px 5px;color:#8b95a1;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.workspace-nav button{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:9px;width:100%;min-height:36px;padding:4px 8px;color:#5f6774;background:transparent;border:0;border-radius:10px;text-align:left;font:inherit}.workspace-nav button:hover,.workspace-nav button.active{color:#1f2937;background:hsl(220 20% 94%)}.workspace-nav button span:nth-child(2){overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:620}.workspace-nav button em{min-width:18px;padding:1px 5px;border-radius:999px;background:#e6eefc;color:#1f5fbf;font-size:10px;font-style:normal;text-align:center}
  .sidebar__user-wrap{position:relative;padding:0 8px 10px}.sidebar__user-wrap .sidebar__user{width:100%;display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px;border:1px solid #e5e7eb;border-radius:13px;background:#fff;text-align:left;font:inherit}.user-menu{position:absolute;left:8px;right:8px;bottom:58px;z-index:40;display:grid;gap:4px;padding:6px;border:1px solid #e5e7eb;border-radius:14px;background:#fff;box-shadow:0 18px 38px rgba(15,23,42,.16)}.user-menu button{width:100%;padding:9px 10px;border:0;border-radius:9px;color:#344054;background:transparent;text-align:left;font-size:13px}.user-menu button:hover{background:#f3f6fb;color:#111827}
  .stage-topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:58px;padding:0 18px;border-bottom:1px solid #e5e7eb;background:rgba(255,255,255,.76);backdrop-filter:blur(16px)}.stage-topbar span,.aorist-toolbar span,.hero-panel span{color:#7b8494;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.stage-topbar strong{display:block;margin-top:2px;font-size:17px;color:#111827}.stage-topbar__actions,.aorist-toolbar>div:last-child{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.hero-panel button,.aorist-toolbar button,:global(.composer-context-actions button),.automation-card footer button,.capability-item button,.config-modal footer button,.agent-wizard__footer button{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:0 12px;border:1px solid #d9dee8;border-radius:10px;background:#fff;color:#344054;font-size:12px;font-weight:650}.hero-panel button:first-child,.aorist-toolbar button:last-child,.config-modal footer button:last-child,.agent-wizard__footer button:last-child{border-color:#1f5fbf;background:#1f5fbf;color:#fff}
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

  .calendar-board{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(300px,.6fr);gap:14px;margin-top:14px}.calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}.calendar-grid article{min-height:92px;padding:10px;border:1px solid rgba(226,232,240,.88);border-radius:14px;background:rgba(255,255,255,.78);box-shadow:0 10px 24px rgba(15,23,42,.04)}.calendar-grid article.today{border-color:#93c5fd;background:linear-gradient(135deg,#eff6ff,#fff)}.calendar-grid b{display:block;margin-bottom:8px;color:#0f172a}.calendar-grid span{display:block;margin-top:4px;padding:4px 6px;border-radius:8px;background:#eef4ff;color:#1d4ed8;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.knowledge-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,.55fr);gap:14px}.knowledge-preview{padding:18px;border:1px solid rgba(226,232,240,.88);border-radius:18px;background:rgba(255,255,255,.82);box-shadow:0 14px 34px rgba(15,23,42,.055)}.knowledge-preview span{color:#7b8494;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.knowledge-preview strong{display:block;margin-top:12px;color:#0f172a;font-size:18px}.knowledge-preview p{color:#5f6774;line-height:1.7;font-size:13px}@media(max-width:980px){.calendar-board,.knowledge-layout{grid-template-columns:1fr}.calendar-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}

  .detail-panel{padding:18px;border:1px solid rgba(226,232,240,.9);border-radius:20px;background:rgba(255,255,255,.82);box-shadow:0 18px 42px rgba(15,23,42,.06)}.detail-panel header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.detail-panel header span{color:#7b8494;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.detail-panel header strong{display:block;margin-top:6px;color:#0f172a;font-size:22px;line-height:1.18;letter-spacing:-.035em}.detail-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:16px}.detail-summary article{padding:12px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc}.detail-summary span{display:block;color:#7b8494;font-size:11px}.detail-summary strong{display:block;margin-top:6px;color:#111827;font-size:13px}.detail-tabs{display:flex;gap:7px;margin:16px 0 10px}.detail-tabs button{height:30px;padding:0 10px;border:1px solid #dbe3ee;border-radius:999px;background:#fff;color:#5f6774;font-size:12px}.detail-tabs button.active{border-color:#93c5fd;background:#eef4ff;color:#1d4ed8}.detail-timeline{display:grid;gap:10px}.detail-timeline article{padding:13px;border:1px solid #e2e8f0;border-radius:14px;background:#fff}.detail-timeline b{display:block;color:#111827}.detail-timeline p{margin:6px 0;color:#5f6774;font-size:13px;line-height:1.6}.detail-timeline em{color:#7b8494;font-size:11px;font-style:normal}.room-modal{width:min(940px,calc(100vw - 44px))}.room-layout{display:grid;grid-template-columns:260px minmax(0,1fr);gap:14px;margin-top:16px}.room-layout aside{padding:14px;border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc}.room-layout aside span{display:inline-block;margin-bottom:8px;padding:4px 8px;border-radius:999px;background:#eef4ff;color:#1f5fbf;font-size:11px}.room-layout aside strong{display:block;color:#111827}.room-layout aside p{color:#5f6774;font-size:13px;line-height:1.6}.room-layout main{display:grid;align-content:start;gap:10px;max-height:420px;overflow:auto;padding:6px}.room-message{padding:12px 14px;border:1px solid #e2e8f0;border-radius:16px;background:#fff}.room-message.judge{margin-inline:28px;background:#fffbeb}.room-message.plaintiff{margin-right:64px;background:#eff6ff}.room-message.defendant{margin-left:64px;background:#f8fafc}.room-message b{display:block;color:#111827;font-size:13px}.room-message p{margin:6px 0 0;color:#5f6774;font-size:13px;line-height:1.6}.hearing-card,.team-card{cursor:pointer;text-align:left}.hearing-card{border:1px solid rgba(226,232,240,.88);background:rgba(255,255,255,.78)}.team-card{border:1px solid rgba(226,232,240,.88);background:rgba(255,255,255,.78)}.config-grid select{height:36px;padding:0 10px;border:1px solid #d9dee8;border-radius:10px;background:#fff;color:#111827}.config-grid textarea,.config-grid input{border:1px solid #d9dee8;border-radius:10px;background:#fff;color:#111827}@media(max-width:980px){.room-layout{grid-template-columns:1fr}.detail-summary{grid-template-columns:1fr}}

  .detail-empty{padding:18px;border:1px dashed #cbd5e1;border-radius:16px;background:rgba(248,250,252,.78);color:#5f6774}.detail-empty strong{display:block;color:#111827}.detail-empty p{margin:6px 0 0;font-size:13px;line-height:1.6}.detail-modal{width:min(840px,calc(100vw - 44px));padding:18px}.detail-modal>.detail-panel{margin-top:14px;background:rgba(255,255,255,.88)}

  .select-list,.distill-panel{display:grid;gap:10px;margin-top:16px}.select-list>p,.distill-panel>p{margin:0;color:#5f6774;font-size:13px;line-height:1.6}.select-list button{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px;border:1px solid #e2e8f0;border-radius:14px;background:#fff;text-align:left}.select-list button:hover{border-color:#93c5fd;background:#f8fbff}.select-list strong{color:#111827}.select-list span{color:#667085;font-size:12px}.distill-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.distill-steps button{min-height:36px;border:1px solid #dbe3ee;border-radius:12px;background:#fff;color:#5f6774;font-weight:700}.distill-steps button.active{border-color:#93c5fd;background:#eef4ff;color:#1d4ed8}.distill-preview{padding:0;border:0}.distill-preview div{margin-top:0}@media(max-width:720px){.distill-steps{grid-template-columns:1fr}}

  .resource-center-topbar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px}.resource-center .resource-tabs{flex:0 1 auto;min-width:0;margin:0;flex-wrap:wrap}.resource-center .resource-tabs button{min-width:104px}.resource-center-actions{display:flex;flex:0 0 auto;align-items:center;justify-content:flex-end;gap:8px}.resource-center-actions button{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:0 14px;border:1px solid #d9dee8;border-radius:999px;background:#fff;color:#222;font-size:13px;font-weight:700}.resource-center-actions button:last-child{border-color:#222;background:#222;color:#fff}.resource-center-actions button:hover{border-color:#222}.resource-section-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.resource-section-top .aorist-search{flex:1 1 320px;max-width:none;margin-bottom:0}.resource-section-top>span{flex:0 0 auto;color:#7b8494;font-size:12px;font-weight:650;white-space:nowrap}.resource-section-top .resource-actions{flex:0 0 auto;justify-content:flex-end;margin:0}.resource-library-empty,.resource-archive-empty{grid-column:1/-1}.resource-archive-summary{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:14px;padding:14px;border:1px solid rgba(226,232,240,.9);border-radius:14px;background:rgba(255,255,255,.82)}.resource-archive-summary span{display:block;color:#7b8494;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.resource-archive-summary strong{display:block;margin-top:4px;color:#111827;font-size:18px}.resource-archive-summary em{color:#7b8494;font-size:12px;font-style:normal}.resource-archive-list{display:grid;gap:12px}.resource-archive-project{padding:14px;border:1px solid rgba(226,232,240,.9);border-radius:14px;background:rgba(255,255,255,.86)}.resource-archive-project header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.resource-archive-project header strong{display:block;color:#111827;font-size:14px}.resource-archive-project header span,.resource-archive-project header em{color:#7b8494;font-size:11px;font-style:normal}.resource-archive-project>div{display:grid;gap:8px}.resource-archive-project article{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;padding:10px;border:1px solid #eef2f7;border-radius:10px;background:#fff}.resource-archive-project article strong{display:block;overflow:hidden;color:#111827;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.resource-archive-project article p{margin:3px 0 0;color:#7b8494;font-size:11px}.resource-archive-project article button{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:28px;padding:0 10px;border:1px solid #f3d3d3;border-radius:8px;background:#fff;color:#b42318;font-size:12px;font-weight:650}.resource-archive-project article button:hover{background:#fff5f5}.resource-actions{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}.resource-actions button{min-height:34px;padding:0 12px;border:1px solid #dce4ef;border-radius:10px;background:rgba(255,255,255,.9);color:#344054;font-size:12px;font-weight:700}.resource-actions button:hover{border-color:#bfdbfe;background:#f8fbff}@media(max-width:920px){.resource-center-topbar{align-items:flex-start;flex-direction:column}.resource-center-actions{justify-content:flex-start}}@media(max-width:720px){.resource-section-top,.resource-archive-summary{align-items:flex-start;flex-direction:column}.resource-section-top .aorist-search{width:100%;max-width:none}.resource-section-top .resource-actions{width:100%;justify-content:flex-start}.resource-archive-project article{grid-template-columns:1fr}}
  .knowledge-stack{display:grid;gap:14px;min-width:0}.knowledge-stack section{padding:14px;border:1px solid rgba(226,232,240,.88);border-radius:18px;background:rgba(255,255,255,.76);box-shadow:0 12px 30px rgba(15,23,42,.04)}.knowledge-stack header{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:12px}.knowledge-stack header span{color:#7b8494;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.knowledge-stack header strong{color:#0f172a;font-size:17px;letter-spacing:-.03em}.knowledge-layout--merged .aorist-card-grid{grid-template-columns:repeat(2,minmax(0,1fr))}@media(max-width:720px){.knowledge-layout--merged .aorist-card-grid{grid-template-columns:1fr}.knowledge-stack header{display:grid;align-items:start}}

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
  .calendar-grid span,
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
  .calendar-grid span,
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
    margin: 14px 0 16px;
    color: var(--aorist-muted);
    font-size: 13px;
    line-height: 1.7;
  }

  .user-panel-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 12px;
  }

  .user-panel-stats article,
  .user-panel-grid article,
  .user-panel-list article {
    border: 1px solid var(--aorist-line);
    border-radius: 12px;
    background: hsl(0 0% 100%);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }

  .user-panel-stats article {
    padding: 13px;
  }

  .user-panel-stats span {
    display: block;
    color: var(--aorist-muted);
    font-size: 12px;
  }

  .user-panel-stats strong {
    display: block;
    margin-top: 5px;
    overflow: hidden;
    color: var(--aorist-ink);
    font-size: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-panel-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 12px;
  }

  .user-panel-grid article {
    display: grid;
    gap: 8px;
    padding: 14px;
  }

  .user-panel-grid article > span,
  .user-panel-list article > span {
    justify-self: start;
    padding: 2px 7px;
    border-radius: 999px;
    background: hsl(220 20% 96%);
    color: var(--aorist-muted);
    font-size: 11px;
  }

  .user-panel-grid strong,
  .user-panel-list strong {
    color: var(--aorist-ink);
    font-size: 14px;
  }

  .user-panel-grid p,
  .user-panel-list p,
  .user-panel-list em {
    margin: 0;
    color: var(--aorist-muted);
    font-size: 12px;
    line-height: 1.55;
    font-style: normal;
  }

  .user-panel-grid button {
    width: fit-content;
    min-height: 30px;
    padding: 0 10px;
    border: 1px solid var(--aorist-line);
    border-radius: 8px;
    background: hsl(0 0% 100%);
    color: var(--aorist-ink);
    font-size: 12px;
    font-weight: 600;
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
    margin-top: 12px;
  }

  @media (max-width: 720px) {
    .user-panel-stats,
    .user-panel-grid,
    .user-panel-form {
      grid-template-columns: 1fr;
    }

    .user-panel-list article {
      align-items: flex-start;
      flex-direction: column;
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
    .team-office-grid {
      grid-template-columns: 1fr;
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

  .workspace-nav .sidebar-conversation-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 24px;
    color: var(--aorist-faint);
    opacity: 0.72;
  }

  .workspace-nav .sidebar-conversation-action:hover {
    color: var(--aorist-ink);
    opacity: 1;
  }

  .workspace-nav .sidebar-conversation-action.danger:hover {
    color: #b42318;
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

  .home__composer :global(.composer__mode-switch),
  .stage__composer :global(.composer__mode-switch),
  .agent-compose-card :global(.composer__mode-switch) {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    width: max-content;
    margin: 0;
    padding: 3px;
    border: 1px solid color-mix(in srgb, var(--composer-mode-accent) 18%, var(--aorist-line));
    border-radius: 999px;
    background: color-mix(in srgb, var(--composer-mode-soft) 72%, #ffffff);
  }

  .home__composer :global(.composer__mode-switch button),
  .stage__composer :global(.composer__mode-switch button),
  .agent-compose-card :global(.composer__mode-switch button) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-width: 62px;
    height: 26px;
    padding: 0 10px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--aorist-muted);
    font-size: 12px;
    font-weight: 600;
  }

  .home__composer :global(.composer__mode-switch button.active),
  .stage__composer :global(.composer__mode-switch button.active),
  .agent-compose-card :global(.composer__mode-switch button.active) {
    background: var(--composer-mode-accent);
    color: var(--composer-mode-active-text);
    box-shadow: 0 6px 16px var(--composer-mode-shadow);
  }

  .home__composer :global(.composer__mode-switch button:not(.active):hover),
  .stage__composer :global(.composer__mode-switch button:not(.active):hover),
  .agent-compose-card :global(.composer__mode-switch button:not(.active):hover) {
    background: color-mix(in srgb, var(--composer-mode-accent) 10%, transparent);
    color: var(--composer-mode-accent-strong);
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
  .calendar-grid span,
  .detail-tabs button.active,
  .room-layout aside span,
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
    max-height: min(55vh, 520px);
    overflow: auto;
    padding-right: 2px;
  }

  .agent-market-card {
    display: grid;
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
    border: 1px solid #222222;
    border-radius: 11px;
    background: #222222;
    color: #ffffff;
  }

  .brand-workbench-button:hover,
  .brand-workbench-button.active {
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
</style>
