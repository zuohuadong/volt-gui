<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    Archive,
    Blocks,
    BookMarked,
    BookOpen,
    Bot,
    BrainCircuit,
    BriefcaseBusiness,
    CalendarDays,
    CirclePlus,
    ClipboardList,
    Code2,
    ContactRound,
    Database,
    FileText,
    Folder,
    FolderKanban,
    Gauge,
    GitBranch,
    List,
    ListTodo,
    Megaphone,
    MessageSquare,
    PanelLeft,
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
  type WorkLayer = "today" | "newTask" | "todos" | "automations" | "agents" | "projects" | "customers" | "calendar" | "mockHearing" | "reports" | "regulations" | "library" | "resources" | "teams" | "models" | "settings" | "operationLog" | "search" | "sync" | "ingest" | "media" | "capabilities";
  type CapabilityTab = "plugin" | "mcp" | "skill";
  type ResourceTab = "resources" | "library" | "regulations" | "search" | "ingest";
  type ConfigDialog = "schedule" | "todo" | "report" | "model" | "ingest" | "resource" | "template" | "project" | "customer" | "hearing" | "team" | "dossier" | "selectProject" | "selectCustomer" | "distill";

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
  let resourceTab = $state<ResourceTab>("resources");
  let userMenuOpen = $state(false);
  let automationDialog = $state<string | undefined>();
  let agentWizardOpen = $state(false);
  let agentWizardTab = $state("identity");
  let selectedAgentId = $state("code-review");
  let selectedCoreFile = $state("SYSTEM.md");
  let mediaDialog = $state<"channels" | "accounts" | undefined>();
  let configDialog = $state<ConfigDialog | undefined>();
  let selectedProjectId = $state("volt-gui");
  let selectedCustomerId = $state("internal");
  let projectSearch = $state("");
  let customerSearch = $state("");
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
  const landing = $derived(activityMode === "code" ? t.home.code : t.home.work);
  const changedCount = $derived(changes?.files.length ?? 0);
  const contextPercent = $derived(context ? Math.min(100, Math.round((context.usedTokens / Math.max(context.windowTokens, 1)) * 100)) : 0);
  const navIcons = {
    today: Gauge,
    newTask: CirclePlus,
    todos: ListTodo,
    automations: Workflow,
    agents: Bot,
    projects: FolderKanban,
    customers: ContactRound,
    calendar: CalendarDays,
    resources: Database,
    teams: UsersRound,
    media: Megaphone,
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
    { title: "Agent Work", items: [{ label: "新建任务", layer: "newTask", icon: "newTask" }, { label: "待办事项", layer: "todos", icon: "todos", badge: "6" }, { label: "自动化", layer: "automations", icon: "automations", badge: "3" }, { label: "Agent 中心", layer: "agents", icon: "agents" }] },
    { title: "业务管理", items: [{ label: "管理项目", layer: "projects", icon: "projects" }, { label: "管理客户", layer: "customers", icon: "customers" }] },
    { title: "知识库", items: [{ label: "资料中心", layer: "resources", icon: "resources" }] },
    { title: "协作与系统", items: [{ label: "团队协作", layer: "teams", icon: "teams" }] },
    { title: "运营", items: [{ label: "自媒体运营中心", layer: "media", icon: "media" }, { label: "能力中心", layer: "capabilities", icon: "capabilities" }] },
  ] as { title: string; items: { label: string; layer: WorkLayer; icon: WorkLayer; badge?: string }[] }[];
  const userMenuItems = [{ label: "模型管理", layer: "models" }, { label: "系统设置", layer: "settings" }, { label: "同步中心", layer: "sync" }, { label: "操作记录", layer: "operationLog" }] as { label: string; layer: WorkLayer }[];
  const todoItems = [
    { title: "验证桌面预览加载状态", desc: "确认浏览器模式无需 Wails 绑定也能进入工作台", due: "今天", state: "进行中" },
    { title: "整理 Agent 创建模板", desc: "补齐工具、技能、核心文件与模型配置", due: "16:00", state: "待处理" },
    { title: "复核项目与客户关联", desc: "检查新建任务中的关联入口", due: "明天", state: "待处理" },
  ];
  const runningAutomations = [
    { id: "daily-review", title: "每日代码巡检", desc: "扫描变更、生成风险清单并写入任务中心", status: "运行中", startedAtMs: Date.now() - 11880000, cadence: "每天 09:30" },
    { id: "media-publish", title: "自媒体选题同步", desc: "抓取渠道数据、生成选题草案", status: "暂停", startedAtMs: Date.now() - 3120000, cadence: "每 4 小时" },
    { id: "mcp-health", title: "MCP 健康检查", desc: "检测 MCP 连接、权限和失败记录", status: "运行中", startedAtMs: Date.now() - 1620000, cadence: "每小时" },
  ];
  const agentCards = [
    { id: "code-review", name: "代码审查 Agent", role: "内置", runs: 128, status: "已启用", desc: "阅读仓库上下文，发现风险、缺失测试和回归点。" },
    { id: "research", name: "资料研究 Agent", role: "自定义", runs: 64, status: "已启用", desc: "汇总文档、网页和项目资料，输出可执行摘要。" },
    { id: "automation", name: "自动化 Agent", role: "已蒸馏", runs: 37, status: "已停用", desc: "把重复工作转为可配置的计划任务和监控。" },
  ];
  const projectCards = [
    { id: "volt-gui", name: "Volt GUI 桌面端重构", client: "内部研发", stage: "进行中", owner: "产品工作台", desc: "恢复 AoristLawer 式导航、Agent 与能力中心。" },
    { id: "lurefree", name: "Lurefree 小程序发布", client: "运营团队", stage: "验证中", owner: "增长项目", desc: "小程序包体、地图交互与发布材料。" },
  ];
  const customerCards = [
    { id: "internal", name: "内部研发团队", type: "企业", phone: "010-0000-0001", email: "dev@example.com", matters: 4, risk: "低风险" },
    { id: "ops", name: "运营增长团队", type: "企业", phone: "010-0000-0002", email: "ops@example.com", matters: 3, risk: "中风险" },
  ];
  const filteredProjects = $derived(projectCards.filter((project) => {
    const keyword = projectSearch.trim().toLowerCase();
    if (!keyword) return true;
    return [project.name, project.client, project.owner, project.stage, project.desc].some((value) => value.toLowerCase().includes(keyword));
  }));
  const filteredCustomers = $derived(customerCards.filter((customer) => {
    const keyword = customerSearch.trim().toLowerCase();
    if (!keyword) return true;
    return [customer.name, customer.type, customer.phone, customer.email, customer.risk, String(customer.matters)].some((value) => value.toLowerCase().includes(keyword));
  }));
  const mediaChannels = [{ name: "微信公众号", accounts: 3, status: "已配置", metric: "12 篇待发" }, { name: "视频号", accounts: 2, status: "需授权", metric: "4 条脚本" }, { name: "小红书", accounts: 4, status: "已配置", metric: "18 个选题" }];
  const capabilityBuckets = {
    plugin: [{ name: "Git 变更面板", desc: "读取 diff、生成审查清单。", status: "已启用" }, { name: "浏览器预览", desc: "本地页面打开和 DOM 检查。", status: "已启用" }],
    mcp: [{ name: "文件系统 MCP", desc: "读取项目文档和结构化资源。", status: "已连接" }, { name: "自动化 MCP", desc: "触发定时任务和监控回调。", status: "已连接" }],
    skill: [{ name: "frontend-design", desc: "高质量前端界面重构。", status: "已安装" }, { name: "webapp-testing", desc: "本地预览和浏览器验证。", status: "可用" }],
  };
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
  const mediaAccounts = [
    { platform: "微信公众号", name: "Volt 研发日报", owner: "内容团队", status: "已授权" },
    { platform: "视频号", name: "Volt Lab", owner: "运营团队", status: "需刷新" },
    { platform: "小红书", name: "AI 工作台实验室", owner: "增长团队", status: "已授权" },
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
    { title: "客户运营周报", status: "草稿", owner: "自媒体 Agent", desc: "整理渠道矩阵、账号状态与选题表现。" },
    { title: "自动化运行报告", status: "待复核", owner: "自动化 Agent", desc: "汇总计划任务执行、失败原因和下一步动作。" },
  ];
  const regulationItems = [
    { title: "桌面端安全执行规范", category: "内部规则", status: "现行有效", tags: "权限 / 沙箱 / 审计" },
    { title: "Agent 协作验收标准", category: "流程规范", status: "试行", tags: "任务 / 验证 / 交付" },
    { title: "客户数据使用边界", category: "合规要求", status: "现行有效", tags: "客户 / 数据 / 留痕" },
  ];
  const documentItems = [
    { title: "需求澄清记录模板", type: "模板", count: 18, status: "可用" },
    { title: "项目复盘文书", type: "归档", count: 42, status: "已索引" },
    { title: "自动化配置说明", type: "说明", count: 9, status: "待更新" },
  ];
  const resourceItems = [
    { title: "项目资料库", source: "workspace", size: "128 files", status: "已同步" },
    { title: "客户访谈附件", source: "local", size: "36 files", status: "待清理" },
    { title: "Agent 核心文件", source: "memory", size: "12 files", status: "已挂载" },
  ];
  const teamRooms = [
    { title: "产品研发组", members: 6, active: "2 个 Agent 在线", desc: "围绕桌面端体验、代码质量和发布节奏协作。" },
    { title: "运营增长组", members: 4, active: "3 个任务进行中", desc: "处理自媒体选题、账号配置和客户触达。" },
    { title: "交付审查组", members: 5, active: "1 个报告待审", desc: "审查项目风险、交付记录和验收标准。" },
  ];
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
    { action: "更新自动化", target: "每日代码巡检", user: "我的", time: "12 分钟前", result: "成功" },
    { action: "关联项目", target: "Volt GUI 桌面端重构", user: "我的", time: "28 分钟前", result: "成功" },
  ];
  const searchResults = [
    { title: "Agent 创建与配置", scope: "Agent 中心", snippet: "助手特征、基础工具、业务技能、核心文件均可配置。" },
    { title: "项目管理入口", scope: "业务管理", snippet: "项目可点击关联到新建任务。" },
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

  function openWorkLayer(layer: WorkLayer) { activityMode = "work"; workLayer = layer; sidebarCollapsed = false; userMenuOpen = false; }
  function focusNewTask() { openWorkLayer("newTask"); void tick().then(focusComposer); }
  function selectedProject() { return projectCards.find((project) => project.id === selectedProjectId) ?? projectCards[0]; }
  function selectedCustomer() { return customerCards.find((customer) => customer.id === selectedCustomerId) ?? customerCards[0]; }
  function selectedHearingRoom() { return hearingRooms.find((room) => room.title === selectedHearingTitle) ?? hearingRooms[0]; }
  function selectedTeamRoom() { return teamRooms.find((team) => team.title === selectedTeamTitle) ?? teamRooms[0]; }
  function linkProjectToTask(projectName: string) { linkedProject = projectName; input = `关联项目：${projectName}\n`; focusNewTask(); }
  function linkCustomerToTask(customerName: string) { linkedCustomer = customerName; input = `关联客户：${customerName}\n`; focusNewTask(); }
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
    if (configDialog === "team") return "创建团队";
    if (configDialog === "dossier") return "新建资料卷宗";
    if (configDialog === "selectProject") return "选择项目";
    if (configDialog === "selectCustomer") return "选择客户";
    if (configDialog === "distill") return "Agent 蒸馏向导";
    return "配置";
  }
  function formatRuntime(startedAtMs: number) { const m = Math.max(1, Math.floor((nowMs - startedAtMs) / 60000)); const h = Math.floor(m / 60); return h ? `${h} 小时 ${m % 60} 分钟` : `${m} 分钟`; }
  function currentAutomation() { return runningAutomations.find((item) => item.id === automationDialog); }
  function openAgentWizard(agentId?: string) { selectedAgentId = agentId || selectedAgentId; agentWizardTab = "identity"; agentWizardOpen = true; }
  function startCapabilityCreate(kind: CapabilityTab) { capabilityTab = kind; openWorkLayer("capabilities"); }
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

  async function useWorkbenchCommand(name: string) {
    workLayer = "today";
    const command = commands.find((item) => item.name.toLowerCase() === name.toLowerCase());
    input = command ? `/${command.name} ` : `/${name} `;
    await tick();
    focusComposer();
  }

  function useQuickPrompt(text: string) {
    input = text;
    focusComposer();
  }

  function handleGlobalKeydown(event: KeyboardEvent) {
    const isPrimary = event.metaKey || event.ctrlKey;
    if (isPrimary && event.key === "1") {
      event.preventDefault();
      activityMode = "work";
      return;
    }
    if (isPrimary && event.key === "2") {
      event.preventDefault();
      activityMode = "code";
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
    activityMode = "code";
    codeInspectorOpen = true;
    await refreshCodeDock();
  }

  async function previewFile(path: string) {
    filePreview = await app().ReadFile(path);
    diffPreview = undefined;
    activityMode = "code";
    codeInspectorOpen = true;
  }

  async function previewChange(path: string) {
    const [diff, preview] = await Promise.all([app().WorkspaceDiff(path), app().ReadFile(path)]);
    diffPreview = diff;
    filePreview = preview;
    activityMode = "code";
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
      <header class="sidebar__brand"><div class="brand-mark"><Bot size={17} /></div><div class="brand-copy"><strong>Volt GUI</strong><span>AI 驱动工作台</span></div><button class:active={activityMode === "code"} class="brand-mode-switch" type="button" onclick={() => (activityMode = activityMode === "code" ? "work" : "code")} aria-label="切换代码工作台"><Code2 size={14} /><span>{activityMode === "code" ? "工作台" : "代码"}</span></button><button class="sidebar__icon" type="button" aria-label={t.home.sidebar} onclick={() => (sidebarCollapsed = !sidebarCollapsed)}><PanelLeft size={17} /></button></header>
      <nav class="workspace-nav" aria-label="工作台导航">
        {#each workspaceNav as section (section.title)}<section><h2>{section.title}</h2>{#each section.items as item (item.label)}{@const Icon = navIcon(item.icon)}<button class:active={activityMode === "work" && workLayer === item.layer} type="button" onclick={() => openWorkLayer(item.layer)}><span class="nav-icon"><Icon size={15} /></span><span>{item.label}</span>{#if item.badge}<em>{item.badge}</em>{/if}</button>{/each}</section>{/each}

      </nav>
      <footer class="sidebar__user-wrap">{#if userMenuOpen}<div class="user-menu" role="menu">{#each userMenuItems as item (item.layer)}<button type="button" role="menuitem" onclick={() => openWorkLayer(item.layer)}>{item.label}</button>{/each}</div>{/if}<button class="sidebar__user" type="button" onclick={() => (userMenuOpen = !userMenuOpen)}><span class="sidebar__avatar"><Bot size={17} /></span><strong>我的</strong><em>{t.home.free}</em></button></footer>
    </aside>

    <section class="stage">
      <div class="window-drag-region" aria-hidden="true"></div>
      <div class="stage__surface">
        {#if loading}
          <div class="content__loading">{t.app.loading}</div>
        {:else if showTranscript}
          <section class="conversation-view">
            <header class="conversation-header">
              <div>
                <strong>{activeTab?.topicTitle || t.activity.untitled}</strong>
                <span>{activeTab?.workspaceName || t.common.global}</span>
              </div>
              <button type="button" onclick={() => (activityMode = "code")}>
                <Code2 size={15} />
                {t.home.openInCode}
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
        {:else if activityMode === "work"}
          <section class="workbench aorist-workbench">
            <header class="stage-topbar"><div><span>Workbench</span><strong>{workspaceNav.flatMap((section) => section.items).find((item) => item.layer === workLayer)?.label || "工作台"}</strong></div><div class="stage-topbar__actions"><button type="button" onclick={() => openWorkLayer("today")}>工作台入口</button><button type="button" onclick={focusNewTask}><Plus size={14} /> 新建任务</button><button type="button" onclick={() => (activityMode = "code")}><Code2 size={14} /> 代码工作台</button></div></header>
            {#if workLayer === "today"}<section class="aorist-page"><div class="hero-panel"><span>Volt GUI Console</span><h1>把 Agent、项目、客户、日程与自动化集中到一个工作台。</h1><p>Volt GUI 由 AI 驱动，可用于代码、项目与运营任务协作。重要执行结果请以构建、测试和人工复核为准。</p><div><button type="button" onclick={focusNewTask}>新建任务</button><button type="button" onclick={() => openWorkLayer("agents")}>进入 Agent 中心</button></div></div><div class="aorist-stats"><article><span>运行自动化</span><strong>{runningAutomations.filter((item) => item.status === "运行中").length}</strong><em>持续监控中</em></article><article><span>今日日程</span><strong>{calendarEvents.length}</strong><em>会议 / 截止 / 验收</em></article><article><span>管理项目</span><strong>{projectCards.length}</strong><em>可关联任务</em></article><article><span>能力模块</span><strong>{capabilityBuckets.plugin.length + capabilityBuckets.mcp.length + capabilityBuckets.skill.length}</strong><em>插件 / MCP / SKILL</em></article></div><div class="aorist-split workbench-grid"><section class="aorist-card"><header><strong>今日待办</strong><button type="button" onclick={() => openWorkLayer("todos")}>查看全部</button></header>{#each todoItems as item (item.title)}<button class="todo-row" type="button" onclick={() => openWorkLayer("todos")}><i></i><span><strong>{item.title}</strong><em>{item.desc}</em></span><b>{item.state}</b></button>{/each}</section><section class="aorist-card"><header><strong>运行中的自动化</strong><button type="button" onclick={() => openWorkLayer("automations")}>管理</button></header>{#each runningAutomations as item (item.id)}<button class="automation-row" type="button" onclick={() => (automationDialog = item.id)}><span><strong>{item.title}</strong><em>已运行 {formatRuntime(item.startedAtMs)}</em></span><b>{item.status}</b></button>{/each}</section><section class="aorist-card workbench-calendar"><header><strong>日历日程</strong><span>{calendarEvents.length} 项</span></header><div class="calendar-mini-grid">{#each Array.from({ length: 14 }, (_, index) => index + 1) as day (day)}<article class:today={day === 17}><b>{day}</b>{#each calendarEvents.filter((item) => Number(item.day) === day) as event (event.title)}<span>{event.time}</span>{/each}</article>{/each}</div>{#each calendarEvents as event (event.title)}<button class="automation-row" type="button" onclick={() => openConfigDialog("schedule")}><span><strong>{event.title}</strong><em>{event.day} 日 {event.time} / {event.place}</em></span><b>{event.type}</b></button>{/each}<footer><button type="button" onclick={() => openConfigDialog("todo")}>新建待办</button><button type="button" onclick={() => openConfigDialog("schedule")}>新建日程</button></footer></section></div></section>
            {:else if workLayer === "newTask"}<section class="aorist-page new-task-page"><div class="agent-strip">{#each agentCards as agent (agent.id)}{@const AgentIcon = agentIcon(agent.id)}<button class:active={selectedAgentId === agent.id} type="button" onclick={() => (selectedAgentId = agent.id)}><span><AgentIcon size={17} /></span><strong>{agent.name}</strong><em>{agent.role}</em></button>{/each}</div><section class="task-composer-card"><div class="task-composer-card__head"><div><span>Agent 助手</span><strong>新建任务</strong></div><select value={selectedModel} onchange={switchModel}>{#each models as model (model.name)}<option value={model.name}>{model.label || model.name}</option>{/each}</select></div><Composer {input} {commands} {sending} onInput={(value) => (input = value)} onSend={send} onCancel={cancel} onPreviewFile={previewFile} {models} {selectedModel} onModelChange={switchModel} /><div class="composer-context-actions"><button type="button" onclick={focusComposer}>+ 上传文件</button><button type="button" onclick={() => openConfigDialog("selectProject")}>@ 关联项目</button><button type="button" onclick={() => openConfigDialog("selectCustomer")}>@ 关联客户</button><button type="button" onclick={() => useWorkbenchCommand("model")}>选择模型</button>{#if linkedProject}<span>已关联项目：{linkedProject}</span>{/if}{#if linkedCustomer}<span>已关联客户：{linkedCustomer}</span>{/if}</div></section></section>
            {:else if workLayer === "todos"}<section class="aorist-page"><div class="aorist-toolbar"><div><span>Task Center</span><strong>待办事项</strong></div><button type="button">新增待办</button></div><div class="aorist-list">{#each todoItems as item (item.title)}<article><div><strong>{item.title}</strong><p>{item.desc}</p><em>{item.due}</em></div><span>{item.state}</span></article>{/each}</div></section>
            {:else if workLayer === "automations"}<section class="aorist-page"><div class="aorist-toolbar"><div><span>Automation</span><strong>自动化</strong></div><button type="button">新增自动化</button></div><div class="aorist-card-grid">{#each runningAutomations as item (item.id)}<div class="automation-card" role="button" tabindex="0" onkeydown={(event) => { if (event.key === "Enter" || event.key === " ") automationDialog = item.id; }} onclick={() => (automationDialog = item.id)}><span>{item.status}</span><strong>{item.title}</strong><p>{item.desc}</p><dl><dt>运行时长</dt><dd>{formatRuntime(item.startedAtMs)}</dd><dt>频率</dt><dd>{item.cadence}</dd></dl><footer role="presentation" onkeydown={(event) => event.stopPropagation()} onclick={(event) => event.stopPropagation()}><button type="button">{item.status === "运行中" ? "暂停" : "开始"}</button><button type="button" onclick={() => (automationDialog = item.id)}>编辑</button><button type="button">删除</button></footer></div>{/each}</div></section>
            {:else if workLayer === "agents"}<section class="aorist-page"><div class="aorist-toolbar"><div><span>Agent Center</span><strong>Agent 中心</strong></div><div><button type="button" onclick={() => { distillStep = 1; openConfigDialog("distill"); }}>蒸馏 Agent</button><button type="button" onclick={() => openAgentWizard()}>创建 Agent</button></div></div><label class="aorist-search"><span>搜索 Agent</span><input placeholder="输入 Agent 名称或职责" /></label><div class="aorist-card-grid agent-grid">{#each agentCards as agent (agent.id)}{@const AgentIcon = agentIcon(agent.id)}<div class="agent-card" role="button" tabindex="0" onkeydown={(event) => { if (event.key === "Enter" || event.key === " ") openAgentWizard(agent.id); }} onclick={() => openAgentWizard(agent.id)}><header><span><AgentIcon size={19} /></span><div><strong>{agent.name}</strong><em>{agent.role}</em></div><button type="button" onclick={(event) => event.stopPropagation()}><Trash2 size={14} /></button></header><p>{agent.desc}</p><footer><span><Zap size={13} /> {agent.runs} 次运行</span><b>{agent.status}</b></footer></div>{/each}</div></section>
            {:else if workLayer === "projects"}<section class="aorist-page detail-page"><div class="aorist-toolbar"><div><span>Project Management</span><strong>管理项目</strong></div><button type="button" onclick={() => openConfigDialog("project")}>新建项目</button></div><div class="aorist-stats"><article><span>项目总数</span><strong>{projectCards.length}</strong><em>全部项目</em></article><article><span>进行中</span><strong>1</strong><em>当前执行</em></article><article><span>关联客户</span><strong>{customerCards.length}</strong><em>可点击关联</em></article></div><label class="aorist-search detail-search"><span>检索项目</span><input bind:value={projectSearch} placeholder="输入项目名称、客户、负责人或阶段" /></label><div class="detail-layout detail-layout--single"><div class="aorist-list detail-list detail-list--full">{#each filteredProjects as project (project.id)}<button class:active={selectedProjectId === project.id} type="button" onclick={() => { selectedProjectId = project.id; projectDetailOpen = true; }}><div><strong>{project.name}</strong><p>{project.desc}</p><em>客户：{project.client} / 负责人：{project.owner}</em></div><span>{project.stage}</span></button>{:else}<article class="detail-empty"><strong>未找到匹配项目</strong><p>换一个关键词，或新建项目后再关联到任务。</p></article>{/each}</div></div></section>
            {:else if workLayer === "customers"}<section class="aorist-page detail-page"><div class="aorist-toolbar"><div><span>Customer Management</span><strong>管理客户</strong></div><button type="button" onclick={() => openConfigDialog("customer")}>新建客户</button></div><div class="aorist-stats"><article><span>客户总数</span><strong>{customerCards.length}</strong><em>全部客户档案</em></article><article><span>企业客户</span><strong>2</strong><em>机构与团队</em></article><article><span>关联项目</span><strong>{projectCards.length}</strong><em>项目数量</em></article></div><label class="aorist-search detail-search"><span>检索客户</span><input bind:value={customerSearch} placeholder="输入客户名称、电话、邮箱或风险等级" /></label><div class="detail-layout detail-layout--single"><div class="aorist-list detail-list detail-list--full">{#each filteredCustomers as customer (customer.id)}<button class:active={selectedCustomerId === customer.id} type="button" onclick={() => { selectedCustomerId = customer.id; customerDetailOpen = true; }}><div><strong>{customer.name}</strong><p>{customer.phone} / {customer.email}</p><em>{customer.type}，{customer.matters} 个项目</em></div><span>{customer.risk}</span></button>{:else}<article class="detail-empty"><strong>未找到匹配客户</strong><p>换一个关键词，或新建客户后再关联到任务。</p></article>{/each}</div></div></section>
            {:else if workLayer === "calendar"}<section class="aorist-page"><div class="aorist-toolbar"><div><span>Calendar</span><strong>日程日历</strong></div><div><button type="button" onclick={() => openConfigDialog("todo")}>新建待办</button><button type="button" onclick={() => openConfigDialog("schedule")}>新建日程</button></div></div><div class="aorist-stats"><article><span>本月日程</span><strong>{calendarEvents.length}</strong><em>会议 / 截止 / 验收</em></article><article><span>今日待办</span><strong>{todoItems.length}</strong><em>工作台同步</em></article><article><span>冲突提醒</span><strong>0</strong><em>暂无时间冲突</em></article></div><div class="calendar-board"><div class="calendar-grid">{#each Array.from({ length: 35 }, (_, index) => index + 1) as day (day)}<article class:today={day === 17}><b>{day}</b>{#each calendarEvents.filter((item) => Number(item.day) === day) as event (event.title)}<span>{event.time} {event.title}</span>{/each}</article>{/each}</div><aside class="aorist-card"><header><strong>近日安排</strong><button type="button">同步</button></header>{#each calendarEvents as event (event.title)}<button class="automation-row" type="button"><span><strong>{event.title}</strong><em>{event.day} 日 {event.time} / {event.place}</em></span><b>{event.type}</b></button>{/each}</aside></div></section>
            {:else if workLayer === "mockHearing"}<section class="aorist-page"><div class="aorist-toolbar"><div><span>Mock Hearing</span><strong>模拟庭辩</strong></div><div><button type="button" onclick={() => openConfigDialog("hearing")}>创建庭辩</button><button type="button" onclick={() => (selectedHearingTitle = hearingRooms[0]?.title)}>进入庭辩室</button></div></div><div class="aorist-card-grid">{#each hearingRooms as room (room.title)}<button class="agent-card hearing-card" type="button" onclick={() => (selectedHearingTitle = room.title)}><header><span>辩</span><div><strong>{room.title}</strong><em>{room.stage}</em></div></header><p>{room.role}</p><footer><span>{room.next}</span><b>AI 庭辩</b></footer></button>{/each}</div></section>
            {:else if workLayer === "reports"}<section class="aorist-page"><div class="aorist-toolbar"><div><span>Reports</span><strong>分析报告</strong></div><div><button type="button" onclick={() => openConfigDialog("report")}>新建报告</button><button type="button">批量导出</button></div></div><div class="aorist-card-grid">{#each reportCards as report (report.title)}<article class="media-card"><span>{report.status}</span><strong>{report.title}</strong><p>{report.desc}</p><em>{report.owner}</em></article>{/each}</div></section>
            {:else if workLayer === "resources"}<section class="aorist-page resource-center"><div class="aorist-toolbar"><div><span>Resource Center</span><strong>资料中心</strong></div><div><button type="button" onclick={() => openConfigDialog("resource")}>上传资料</button><button type="button" onclick={() => openConfigDialog("ingest")}>批量导入</button></div></div><div class="capability-tabs resource-tabs"><button class:active={resourceTab === "resources"} type="button" onclick={() => (resourceTab = "resources")}>资料库</button><button class:active={resourceTab === "library"} type="button" onclick={() => (resourceTab = "library")}>文书库</button><button class:active={resourceTab === "regulations"} type="button" onclick={() => (resourceTab = "regulations")}>法规库</button><button class:active={resourceTab === "search"} type="button" onclick={() => (resourceTab = "search")}>全文检索</button><button class:active={resourceTab === "ingest"} type="button" onclick={() => (resourceTab = "ingest")}>导入中心</button></div>{#if resourceTab === "resources"}<div class="aorist-card-grid">{#each resourceItems as item (item.title)}<article class="media-card"><span>{item.status}</span><strong>{item.title}</strong><p>{item.source}</p><em>{item.size}</em></article>{/each}</div>{:else if resourceTab === "library"}<div class="resource-actions"><button type="button" onclick={() => openConfigDialog("ingest")}>导入文书</button><button type="button" onclick={() => openConfigDialog("template")}>新建模板</button></div><div class="aorist-card-grid">{#each documentItems as item (item.title)}<article class="capability-item"><span>{item.status}</span><strong>{item.title}</strong><p>{item.type} / {item.count} 份文档</p><button type="button">打开</button></article>{/each}</div>{:else if resourceTab === "regulations"}<div class="resource-actions"><button type="button">新增法规</button><button type="button">同步订阅源</button></div><label class="aorist-search"><span>搜索法规与规则</span><input placeholder="搜索标题、条文或标签" /></label><div class="knowledge-layout"><div class="aorist-list">{#each regulationItems as item (item.title)}<article><div><strong>{item.title}</strong><p>{item.category} / {item.tags}</p><em>{item.status}</em></div><span>{item.category}</span></article>{/each}</div><aside class="knowledge-preview"><span>法规预览</span><strong>{regulationItems[0].title}</strong><p>用于展示全文条文、标签、效力状态、导入来源和更新记录。资料中心统一承载法规、文书、资料、检索与导入任务。</p></aside></div>{:else if resourceTab === "search"}<label class="aorist-search"><span>跨项目、客户、文书、法规检索</span><input placeholder="输入关键词，检索所有工作台内容" /></label><div class="aorist-list">{#each searchResults as result (result.title)}<article><div><strong>{result.title}</strong><p>{result.snippet}</p><em>{result.scope}</em></div><span>匹配</span></article>{/each}</div>{:else}<div class="resource-actions"><button type="button" onclick={() => openConfigDialog("ingest")}>批量导入</button><button type="button">查看失败</button></div><div class="aorist-list">{#each ingestJobs as job (job.title)}<article><div><strong>{job.title}</strong><p>{job.source} / {job.total} 条记录</p><em>导入队列</em></div><span>{job.status}</span></article>{/each}</div>{/if}</section>
            {:else if workLayer === "teams"}<section class="aorist-page"><div class="aorist-toolbar"><div><span>Teams</span><strong>团队协作</strong></div><div><button type="button" onclick={() => openConfigDialog("team")}>创建团队</button><button type="button" onclick={() => (selectedTeamTitle = teamRooms[0]?.title)}>团队会话</button></div></div><div class="aorist-card-grid">{#each teamRooms as team (team.title)}<button class="agent-card team-card" type="button" onclick={() => (selectedTeamTitle = team.title)}><header><span>队</span><div><strong>{team.title}</strong><em>{team.members} 名成员</em></div></header><p>{team.desc}</p><footer><span>{team.active}</span><b>协作空间</b></footer></button>{/each}</div></section>
            {:else if workLayer === "models"}<section class="aorist-page"><div class="aorist-toolbar"><div><span>Models</span><strong>模型管理</strong></div><div><button type="button" onclick={() => openConfigDialog("model")}>添加模型</button><button type="button">刷新状态</button></div></div><div class="aorist-stats"><article><span>模型数量</span><strong>{modelCards.length}</strong><em>可选模型</em></article><article><span>远程 LLM</span><strong>ON</strong><em>已允许</em></article><article><span>密钥状态</span><strong>OK</strong><em>环境变量托管</em></article></div><div class="aorist-card-grid">{#each modelCards as model (model.name)}<article class="capability-item"><span>{model.status}</span><strong>{model.name}</strong><p>{model.provider} / {model.role}</p><button type="button">设为默认</button></article>{/each}</div></section>
            {:else if workLayer === "settings"}<section class="aorist-page"><div class="aorist-toolbar"><div><span>Settings</span><strong>系统设置</strong></div><button type="button">保存设置</button></div><div class="aorist-card-grid">{#each settingGroups as item (item.title)}<article class="capability-item"><span>{item.status}</span><strong>{item.title}</strong><p>{item.desc}</p><button type="button">配置</button></article>{/each}</div></section>
            {:else if workLayer === "sync"}<section class="aorist-page"><div class="aorist-toolbar"><div><span>Sync</span><strong>同步中心</strong></div><button type="button">立即同步</button></div><div class="aorist-list">{#each syncJobs as job (job.title)}<article><div><strong>{job.title}</strong><p>{job.time}</p><em>进度 {job.progress}</em></div><span>{job.status}</span></article>{/each}</div></section>
            {:else if workLayer === "operationLog"}<section class="aorist-page"><div class="aorist-toolbar"><div><span>Operation Log</span><strong>操作记录</strong></div><button type="button">导出日志</button></div><div class="aorist-list">{#each operationLogs as log (log.time)}<article><div><strong>{log.action}</strong><p>{log.target} / {log.user}</p><em>{log.time}</em></div><span>{log.result}</span></article>{/each}</div></section>
            {:else if workLayer === "media"}<section class="aorist-page"><div class="aorist-toolbar"><div><span>Media Ops</span><strong>自媒体运营中心</strong></div><div><button type="button" onclick={() => (mediaDialog = "channels")}>渠道矩阵</button><button type="button" onclick={() => (mediaDialog = "accounts")}>账号配置</button></div></div><div class="aorist-card-grid">{#each mediaChannels as channel (channel.name)}<article class="media-card"><span>{channel.status}</span><strong>{channel.name}</strong><p>{channel.accounts} 个账号</p><em>{channel.metric}</em></article>{/each}</div></section>
            {:else}<section class="aorist-page capability-manager"><div class="aorist-toolbar"><div><span>Capability Center</span><strong>能力中心</strong></div><div><button type="button" onclick={() => startCapabilityCreate("plugin")}>创建插件</button><button type="button" onclick={() => startCapabilityCreate("mcp")}>创建 MCP</button><button type="button" onclick={() => startCapabilityCreate("skill")}>创建 SKILL</button></div></div><div class="capability-tabs"><button class:active={capabilityTab === "plugin"} type="button" onclick={() => (capabilityTab = "plugin")}>插件</button><button class:active={capabilityTab === "mcp"} type="button" onclick={() => (capabilityTab = "mcp")}>MCP</button><button class:active={capabilityTab === "skill"} type="button" onclick={() => (capabilityTab = "skill")}>SKILL</button></div><div class="aorist-card-grid">{#each capabilityBuckets[capabilityTab] as item (item.name)}<article class="capability-item"><span>{item.status}</span><strong>{item.name}</strong><p>{item.desc}</p><button type="button">管理</button></article>{/each}</div></section>{/if}
          </section>
        {:else}
          <section class="home">
            <h1>
              {#if activityMode === "code"}
                <Code2 size={38} />
              {:else}
                <BookOpen size={34} />
              {/if}
              {landing.title}
              <span>{t.home.beta}</span>
            </h1>
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
              />
              <div class="home__context">
                <button type="button" onclick={focusComposer}>
                  <PanelLeft size={16} />
                  {t.home.local}
                </button>
                <button type="button" onclick={() => (activityMode = "code")}>
                  <Folder size={16} />
                  {activeTab?.workspaceName || t.common.global}
                </button>
                {#if activityMode === "code"}
                  <button type="button" onclick={focusComposer}>
                    <GitBranch size={16} />
                    main
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
                  {quick.label}
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
          </section>
        {/if}
      </div>

      {#if activityMode === "code" && codeInspectorOpen}
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
        <div class="modal-backdrop"><section class="config-modal"><header><div><span>Automation Config</span><strong>{currentAutomation()?.title}</strong></div><button type="button" onclick={() => (automationDialog = undefined)}>x</button></header><div class="config-grid"><label>运行频率<input value={currentAutomation()?.cadence || ""} /></label><label>运行时长<input value={currentAutomation() ? formatRuntime(currentAutomation()!.startedAtMs) : ""} readonly /></label><label class="wide">任务说明<textarea rows="4" value={currentAutomation()?.desc || ""}></textarea></label></div><footer><button type="button" onclick={() => (automationDialog = undefined)}>取消</button><button type="button" onclick={() => (automationDialog = undefined)}>保存配置</button></footer></section></div>
      {/if}
      {#if selectedHearingTitle}
        <div class="modal-backdrop"><section class="config-modal room-modal"><header><div><span>Mock Hearing Room</span><strong>{selectedHearingRoom()?.title}</strong></div><button type="button" onclick={() => (selectedHearingTitle = undefined)}>x</button></header><div class="room-layout"><aside><span>{selectedHearingRoom()?.stage}</span><strong>{selectedHearingRoom()?.role}</strong><p>{selectedHearingRoom()?.next}</p></aside><main><article class="room-message judge"><b>审判视角</b><p>先核对争议焦点，再进入询问与反询问。</p></article><article class="room-message plaintiff"><b>主张方 Agent</b><p>基于项目记录提炼证据链和责任边界。</p></article><article class="room-message defendant"><b>答辩方 Agent</b><p>按时间线检查对方假设和缺失材料。</p></article></main></div><footer><button type="button" onclick={() => (selectedHearingTitle = undefined)}>暂停</button><button type="button" onclick={() => (selectedHearingTitle = undefined)}>生成总结</button></footer></section></div>
      {/if}
      {#if selectedTeamTitle}
        <div class="modal-backdrop"><section class="config-modal room-modal"><header><div><span>Team Chat</span><strong>{selectedTeamRoom()?.title}</strong></div><button type="button" onclick={() => (selectedTeamTitle = undefined)}>x</button></header><div class="team-chat-layout"><aside><strong>{selectedTeamRoom()?.members} 名成员</strong><span>{selectedTeamRoom()?.active}</span><p>{selectedTeamRoom()?.desc}</p></aside><main><article><b>我</b><p>请审查当前页面与 AORISTLAWER 对标结果。</p></article><article><b>代码审查 Agent</b><p>已检查导航、详情、弹窗与构建验证项。</p></article><article><b>产品 Agent</b><p>建议保留侧边密度，将二级内容放入右侧详情面板。</p></article></main></div><footer><button type="button" onclick={() => (selectedTeamTitle = undefined)}>关闭</button><button type="button" onclick={() => (selectedTeamTitle = undefined)}>发起协作任务</button></footer></section></div>
      {/if}
      {#if projectDetailOpen}
        <div class="modal-backdrop"><section class="config-modal detail-modal"><header><div><span>Project Detail</span><strong>{selectedProject()?.name}</strong></div><button type="button" onclick={() => (projectDetailOpen = false)}>x</button></header><aside class="detail-panel"><header><div><span>Project Profile</span><strong>{selectedProject()?.name}</strong></div><button type="button" onclick={() => linkProjectToTask(selectedProject()?.name || "")}>关联到新建任务</button></header><section class="detail-summary"><article><span>客户</span><strong>{selectedProject()?.client}</strong></article><article><span>阶段</span><strong>{selectedProject()?.stage}</strong></article><article><span>负责人</span><strong>{selectedProject()?.owner}</strong></article></section><div class="detail-tabs"><button class="active" type="button">概览</button><button type="button">资料</button><button type="button">待办</button><button type="button">日程</button></div><div class="detail-timeline"><article><b>最近进展</b><p>{selectedProject()?.desc}</p><em>28 分钟前</em></article><article><b>待处理事项</b><p>复核构建、预览和 Agent 配置闭环。</p><em>今天</em></article><article><b>关联资料</b><p>已挂载项目资料库、导入记录和操作日志。</p><em>已同步</em></article></div></aside></section></div>
      {/if}
      {#if customerDetailOpen}
        <div class="modal-backdrop"><section class="config-modal detail-modal"><header><div><span>Customer Detail</span><strong>{selectedCustomer()?.name}</strong></div><button type="button" onclick={() => (customerDetailOpen = false)}>x</button></header><aside class="detail-panel"><header><div><span>Customer Profile</span><strong>{selectedCustomer()?.name}</strong></div><button type="button" onclick={() => linkCustomerToTask(selectedCustomer()?.name || "")}>关联到新建任务</button></header><section class="detail-summary"><article><span>电话</span><strong>{selectedCustomer()?.phone}</strong></article><article><span>邮箱</span><strong>{selectedCustomer()?.email}</strong></article><article><span>风险</span><strong>{selectedCustomer()?.risk}</strong></article></section><div class="detail-tabs"><button class="active" type="button">档案</button><button type="button">项目</button><button type="button">资料</button><button type="button">日程</button></div><div class="detail-timeline"><article><b>客户画像</b><p>{selectedCustomer()?.type}客户，目前关联 {selectedCustomer()?.matters} 个项目。</p><em>已建档</em></article><article><b>最近沟通</b><p>已记录访谈附件、需求跟进和自动化提醒。</p><em>12 分钟前</em></article><article><b>资料状态</b><p>关联资料可在资料库和全文检索中复用。</p><em>已索引</em></article></div></aside></section></div>
      {/if}
      {#if configDialog}
        <div class="modal-backdrop"><section class="config-modal"><header><div><span>Aorist Dialog</span><strong>{configDialogTitle()}</strong></div><button type="button" onclick={() => (configDialog = undefined)}>x</button></header>{#if configDialog === "selectProject"}<div class="select-list"><p>{configDialogIntro()}</p>{#each projectCards as project (project.id)}<button type="button" onclick={() => { linkProjectToTask(project.name); configDialog = undefined; }}><strong>{project.name}</strong><span>{project.client} / {project.stage}</span></button>{/each}</div>{:else if configDialog === "selectCustomer"}<div class="select-list"><p>{configDialogIntro()}</p>{#each customerCards as customer (customer.id)}<button type="button" onclick={() => { linkCustomerToTask(customer.name); configDialog = undefined; }}><strong>{customer.name}</strong><span>{customer.phone} / {customer.risk}</span></button>{/each}</div>{:else if configDialog === "distill"}<div class="distill-panel"><p>{configDialogIntro()}</p><div class="distill-steps"><button class:active={distillStep === 1} type="button" onclick={() => (distillStep = 1)}>1. 选择样本</button><button class:active={distillStep === 2} type="button" onclick={() => (distillStep = 2)}>2. 提炼能力</button><button class:active={distillStep === 3} type="button" onclick={() => (distillStep = 3)}>3. 生成 Agent</button></div>{#if distillStep === 1}<div class="wizard-skill-list">{#each todoItems as item (item.title)}<button type="button"><div><strong>{item.title}</strong><p>{item.desc}</p></div><em>{item.state}</em></button>{/each}</div>{:else if distillStep === 2}<div class="wizard-card-grid">{#each skillCards as skill (skill.id)}<button class:active={skill.active} type="button"><strong>{skill.title}</strong><span>{skill.desc}</span><em>{skill.version}</em></button>{/each}</div>{:else}<div class="wizard-preview distill-preview"><span>Agent Preview</span><div><b><Workflow size={24} /></b><strong>蒸馏任务 Agent</strong><em>{agentModel}</em><p>从已完成任务、工具调用和项目资料中抽取可复用工作流。</p></div></div>{/if}</div>{:else}<div class="config-grid"><label>名称<input value={configDialogTitle()} /></label><label>关联对象<input value={linkedProject || linkedCustomer || selectedProject()?.name || "Volt GUI"} /></label><label>执行 Agent<select><option>{agentCards.find((agent) => agent.id === selectedAgentId)?.name}</option>{#each agentCards as agent (agent.id)}<option>{agent.name}</option>{/each}</select></label><label>模型<select><option>{selectedModel || agentModel}</option>{#each modelCards as model (model.name)}<option>{model.name}</option>{/each}</select></label>{#if configDialog === "model"}<label>Provider<select>{#each modelProviders as provider (provider)}<option>{provider}</option>{/each}</select></label><label>Base URL<input value="https://api.example.com/v1" /></label>{:else if configDialog === "team"}<label>成员范围<input value="产品 / 研发 / Agent" /></label><label>协作目标<input value="审查、执行、复盘" /></label>{:else if configDialog === "ingest"}<label>导入来源<select><option>workspace</option><option>local files</option><option>manual</option></select></label><label>索引策略<select><option>自动分类并去重</option><option>仅入库</option></select></label>{:else if configDialog === "hearing"}<label>庭辩角色<select><option>产品方 / 交付方</option><option>主张方 / 答辩方</option></select></label><label>争议焦点<input value="需求边界与交付责任" /></label>{:else}<label>优先级<select><option>中</option><option>高</option><option>低</option></select></label><label>截止时间<input value="今天 18:00" /></label>{/if}<label class="wide">配置说明<textarea rows="4">{configDialogIntro()}</textarea></label></div>{/if}<footer><button type="button" onclick={() => (configDialog = undefined)}>取消</button><button type="button" onclick={() => (configDialog = undefined)}>确认</button></footer></section></div>
      {/if}
      {#if agentWizardOpen}
        {@const WizardAvatarIcon = avatarIcon(agentAvatar)}
        <div class="modal-backdrop"><section class="agent-wizard"><header class="agent-wizard__header"><div class="wizard-avatar"><WizardAvatarIcon size={22} /></div><div><strong>{agentCards.find((agent) => agent.id === selectedAgentId)?.name || "创建 Agent"}</strong><span>创建与配置 Agent</span></div><button type="button" onclick={() => (agentWizardOpen = false)}>x</button></header><div class="agent-wizard__body"><nav class="wizard-tabs">{#each wizardTabs as tab (tab.id)}<button class:active={agentWizardTab === tab.id} type="button" onclick={() => (agentWizardTab = tab.id)}>{tab.label}</button>{/each}</nav><div class="wizard-panel">{#if agentWizardTab === "identity"}<div class="wizard-identity"><div class="wizard-form"><label>智能体名称<input value={agentCards.find((agent) => agent.id === selectedAgentId)?.name || ""} /></label><label>系统设定指示词<textarea rows="4" value={agentCards.find((agent) => agent.id === selectedAgentId)?.desc || ""}></textarea></label><div class="pill-group"><span>智能体头像</span>{#each avatarPresets as avatar (avatar)}{@const AvatarOptionIcon = avatarIcon(avatar)}<button class:active={agentAvatar === avatar} type="button" aria-label={`选择头像 ${avatar}`} onclick={() => (agentAvatar = avatar)}><AvatarOptionIcon size={15} /></button>{/each}</div><div class="pill-group"><span>执业风格</span>{#each vibePresets as vibe (vibe)}<button type="button">{vibe}</button>{/each}</div><div class="pill-group"><span>模型底座</span>{#each modelProviders as provider (provider)}<button class:active={agentProvider === provider} type="button" onclick={() => { agentProvider = provider; agentModel = modelOptions[provider]?.[0] || agentModel; }}>{provider}</button>{/each}</div><select value={agentModel} onchange={(event) => (agentModel = (event.currentTarget as HTMLSelectElement).value)}>{#each modelOptions[agentProvider] || [] as model (model)}<option value={model}>{model}</option>{/each}</select></div><aside class="wizard-preview"><span>身份预览</span><div><b><WizardAvatarIcon size={28} /></b><strong>{agentCards.find((agent) => agent.id === selectedAgentId)?.name || "未命名 Agent"}</strong><em>{agentModel}</em><p>{agentCards.find((agent) => agent.id === selectedAgentId)?.desc || "尚未分配具体职能。"}</p></div></aside></div>{:else if agentWizardTab === "tools"}<div class="wizard-card-grid">{#each toolCards as tool (tool.id)}<button class:active={tool.active} type="button"><strong>{tool.title}</strong><span>{tool.desc}</span><em>{tool.active ? "已启用" : "未启用"}</em></button>{/each}</div>{:else if agentWizardTab === "skills"}<div class="wizard-skill-list">{#each skillCards as skill (skill.id)}<button class:active={skill.active} type="button"><div><strong>{skill.title}</strong><span>{skill.version}</span><p>{skill.desc}</p></div><em>{skill.active ? "已挂载" : "未挂载"}</em></button>{/each}</div>{:else}<div class="wizard-files"><nav>{#each coreFiles as file (file)}<button class:active={selectedCoreFile === file} type="button" onclick={() => (selectedCoreFile = file)}>{file}</button>{/each}</nav><pre>{coreFileContent[selectedCoreFile]}</pre></div>{/if}</div></div><footer class="agent-wizard__footer"><button type="button" onclick={() => (agentWizardOpen = false)}>取消</button><button type="button" onclick={() => (agentWizardOpen = false)}>完成并部署</button></footer></section></div>
      {/if}
      {#if mediaDialog}
        <div class="modal-backdrop"><section class="config-modal media-config-modal"><header><div><span>Media Ops</span><strong>{mediaDialog === "channels" ? "渠道矩阵" : "账号配置"}</strong></div><button type="button" onclick={() => (mediaDialog = undefined)}>x</button></header>{#if mediaDialog === "channels"}<div class="media-config-list">{#each mediaChannels as channel (channel.name)}<article><strong>{channel.name}</strong><span>{channel.status}</span><p>{channel.accounts} 个账号 / {channel.metric}</p></article>{/each}</div>{:else}<div class="media-config-list">{#each mediaAccounts as account (account.name)}<article><strong>{account.name}</strong><span>{account.status}</span><p>{account.platform} / {account.owner}</p></article>{/each}</div>{/if}<footer><button type="button" onclick={() => (mediaDialog = undefined)}>关闭</button><button type="button" onclick={() => (mediaDialog = undefined)}>保存配置</button></footer></section></div>
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
    top: 24px;
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
  .stage-topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:58px;padding:0 18px;border-bottom:1px solid #e5e7eb;background:rgba(255,255,255,.76);backdrop-filter:blur(16px)}.stage-topbar span,.aorist-toolbar span,.hero-panel span{color:#7b8494;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.stage-topbar strong{display:block;margin-top:2px;font-size:17px;color:#111827}.stage-topbar__actions,.aorist-toolbar>div:last-child{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.stage-topbar__actions button,.hero-panel button,.aorist-toolbar button,.composer-context-actions button,.automation-card footer button,.capability-item button,.config-modal footer button,.agent-wizard__footer button{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:0 12px;border:1px solid #d9dee8;border-radius:10px;background:#fff;color:#344054;font-size:12px;font-weight:650}.stage-topbar__actions button:nth-child(2),.hero-panel button:first-child,.aorist-toolbar button:last-child,.config-modal footer button:last-child,.agent-wizard__footer button:last-child{border-color:#1f5fbf;background:#1f5fbf;color:#fff}
  .aorist-workbench{padding:0;overflow:hidden}.aorist-page{min-height:0;height:100%;overflow:auto;padding:18px;background:radial-gradient(circle at 18% 0%,rgba(31,95,191,.1),transparent 32%),#f7f8fb}.hero-panel{padding:28px;border:1px solid #dfe5ef;border-radius:22px;background:linear-gradient(135deg,#fff 0%,#eef4ff 100%);box-shadow:0 16px 34px rgba(15,23,42,.08)}.hero-panel h1{max-width:760px;margin:10px 0;color:#111827;font-size:clamp(28px,4vw,46px);line-height:1.05;letter-spacing:-.04em}.hero-panel p{max-width:680px;margin:0 0 18px;color:#5f6774;line-height:1.7}.hero-panel div{display:flex;gap:10px;flex-wrap:wrap}.aorist-stats,.aorist-card-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:14px}.aorist-stats article,.aorist-card,.aorist-list article,.agent-card,.automation-card,.media-card,.capability-item,.task-composer-card{border:1px solid #e2e8f0;border-radius:16px;background:rgba(255,255,255,.92);box-shadow:0 8px 22px rgba(15,23,42,.05)}.aorist-stats article{padding:16px}.aorist-stats span,.aorist-stats em{display:block;color:#7b8494;font-size:12px;font-style:normal}.aorist-stats strong{display:block;margin:8px 0 3px;color:#111827;font-size:28px;letter-spacing:-.04em}.aorist-split{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr);gap:12px;margin-top:14px}.aorist-card{padding:14px}.aorist-card header,.aorist-toolbar,.agent-card header,.task-composer-card__head,.config-modal header,.agent-wizard__header,.agent-wizard__footer{display:flex;align-items:center;justify-content:space-between;gap:12px}.aorist-card header strong,.aorist-toolbar strong{color:#111827;font-size:16px}.aorist-card header button{border:0;background:transparent;color:#1f5fbf;font-size:12px}.todo-row,.automation-row{display:grid;grid-template-columns:10px minmax(0,1fr) auto;align-items:center;width:100%;gap:10px;margin-top:8px;padding:10px;border:1px solid #eef2f7;border-radius:12px;background:#fff;text-align:left}.automation-row{grid-template-columns:minmax(0,1fr) auto}.todo-row i{width:8px;height:8px;border-radius:999px;background:#1f5fbf}.todo-row strong,.automation-row strong{display:block;color:#1f2937;font-size:13px}.todo-row em,.automation-row em{display:block;margin-top:3px;color:#7b8494;font-size:11px;font-style:normal}.todo-row b,.automation-row b{color:#1f5fbf;font-size:11px}
  .agent-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:12px}.agent-strip button{display:grid;grid-template-columns:34px minmax(0,1fr);gap:9px;align-items:center;padding:12px;border:1px solid #e2e8f0;border-radius:15px;background:#fff;text-align:left}.agent-strip button.active{border-color:#1f5fbf;background:#eef4ff}.agent-strip span{grid-row:span 2;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:12px;background:#1f5fbf;color:#fff}.agent-strip strong{color:#111827;font-size:13px}.agent-strip em{color:#7b8494;font-size:11px;font-style:normal}.task-composer-card{padding:14px}.task-composer-card__head{margin-bottom:12px}.task-composer-card__head strong{display:block;color:#111827;font-size:18px}.task-composer-card__head select,.config-grid input,.config-grid textarea,.aorist-search input,.wizard-form input,.wizard-form textarea,.wizard-form select{border:1px solid #d9dee8;border-radius:10px;background:#fff;color:#111827}.task-composer-card__head select{height:34px;padding:0 10px}.composer-context-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.composer-context-actions>span{display:inline-flex;align-items:center;min-height:32px;padding:0 10px;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff;color:#1f5fbf;font-size:12px;font-weight:650}
  .aorist-toolbar{margin-bottom:14px;padding:14px;border:1px solid #e2e8f0;border-radius:16px;background:#fff}.aorist-search{display:block;max-width:420px;margin-bottom:12px}.aorist-search span{display:block;margin-bottom:6px;color:#7b8494;font-size:12px}.aorist-search input{width:100%;height:38px;padding:0 12px}.aorist-list{display:grid;gap:10px}.aorist-list article{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:15px;cursor:pointer}.aorist-list strong{color:#111827}.aorist-list p{margin:4px 0;color:#5f6774;font-size:13px}.aorist-list em{color:#7b8494;font-size:12px;font-style:normal}.aorist-list span{padding:4px 8px;border-radius:999px;background:#eef4ff;color:#1f5fbf;font-size:12px;white-space:nowrap}.aorist-card-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.automation-card,.agent-card,.media-card,.capability-item{padding:15px;cursor:pointer}.automation-card span,.media-card span,.capability-item span{display:inline-block;margin-bottom:9px;padding:3px 8px;border-radius:999px;background:#eef4ff;color:#1f5fbf;font-size:11px}.automation-card strong,.media-card strong,.capability-item strong{display:block;color:#111827;font-size:15px}.automation-card p,.media-card p,.capability-item p{color:#5f6774;font-size:13px;line-height:1.6}.automation-card dl{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;color:#7b8494;font-size:12px}.automation-card dd{margin:0;color:#111827}.automation-card footer{display:flex;justify-content:flex-end;gap:7px;margin-top:12px}.automation-card footer button:last-child{color:#b42318}.agent-card header{align-items:flex-start}.agent-card header>span{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:13px;background:#eef4ff;color:#1f5fbf}.agent-card header div{flex:1;min-width:0}.agent-card header strong{display:block;color:#111827}.agent-card header em{display:inline-block;margin-top:4px;color:#7b8494;font-size:11px;font-style:normal}.agent-card header button{width:30px;height:30px;border:0;border-radius:8px;background:transparent;color:#98a2b3;opacity:0}.agent-card:hover header button{opacity:1}.agent-card p{color:#5f6774;line-height:1.6;font-size:13px}.agent-card footer{display:flex;align-items:center;justify-content:space-between;color:#7b8494;font-size:12px}.agent-card footer span{display:inline-flex;align-items:center;gap:4px}.agent-card footer b{color:#1f5fbf;font-size:12px}.capability-tabs{display:flex;gap:8px;margin:0 0 12px;padding:4px;width:max-content;border:1px solid #e2e8f0;border-radius:12px;background:#fff}.capability-tabs button{min-width:92px;height:32px;border:0;border-radius:9px;background:transparent;color:#5f6774;font-weight:700}.capability-tabs button.active{background:#1f5fbf;color:#fff}
  .modal-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:22px;background:rgba(15,23,42,.38);backdrop-filter:blur(8px)}.config-modal,.agent-wizard{width:min(860px,calc(100vw - 44px));max-height:calc(100vh - 44px);overflow:hidden;border:1px solid #e2e8f0;border-radius:20px;background:#fff;box-shadow:0 24px 60px rgba(15,23,42,.28)}.config-modal{padding:18px}.config-modal header strong,.agent-wizard__header strong{display:block;color:#111827;font-size:17px}.config-modal header button,.agent-wizard__header>button{border:0;background:transparent;color:#667085;font-size:24px}.config-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}.config-grid label{display:grid;gap:6px;color:#5f6774;font-size:12px}.config-grid .wide{grid-column:1/-1}.config-grid input{height:36px;padding:0 10px}.config-grid textarea{padding:10px;resize:vertical}.config-modal footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.agent-wizard{display:grid;grid-template-rows:auto minmax(0,1fr) auto;height:min(680px,calc(100vh - 44px))}.agent-wizard__header{padding:16px 18px;border-bottom:1px solid #e5e7eb}.wizard-avatar{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,#1f5fbf,#3b82f6);color:#fff}.agent-wizard__header div:nth-child(2){flex:1}.agent-wizard__header span{color:#7b8494;font-size:12px}.agent-wizard__body{display:grid;grid-template-columns:178px minmax(0,1fr);min-height:0}.wizard-tabs{padding:12px;border-right:1px solid #e5e7eb;background:#f8fafc}.wizard-tabs button{width:100%;padding:10px;border:0;border-radius:12px;background:transparent;text-align:left;color:#111827}.wizard-tabs button.active{background:#fff;box-shadow:0 4px 14px rgba(15,23,42,.08)}.wizard-panel{min-height:0;overflow:auto;padding:18px}.wizard-identity{display:grid;grid-template-columns:minmax(0,1fr)230px;gap:18px}.wizard-form{display:grid;gap:14px}.wizard-form label{display:grid;gap:6px;color:#5f6774;font-size:12px}.wizard-form input,.wizard-form select{height:38px;padding:0 10px}.wizard-form textarea{padding:10px;resize:vertical}.pill-group{display:flex;align-items:center;flex-wrap:wrap;gap:7px}.pill-group span{width:100%;color:#5f6774;font-size:12px}.pill-group button{min-height:30px;padding:0 10px;border:1px solid #d9dee8;border-radius:999px;background:#fff;color:#344054}.pill-group button.active{border-color:#1f5fbf;background:#eef4ff;color:#1f5fbf}.wizard-preview{padding-left:18px;border-left:1px solid #e5e7eb}.wizard-preview>span{color:#7b8494;font-size:11px;font-weight:700;text-transform:uppercase}.wizard-preview div{display:grid;justify-items:center;gap:8px;margin-top:12px;padding:18px;border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc;text-align:center}.wizard-preview b{display:inline-flex;align-items:center;justify-content:center;width:58px;height:58px;border-radius:18px;background:#1f5fbf;color:#fff}.wizard-preview strong{color:#111827}.wizard-preview em,.wizard-preview p{color:#7b8494;font-size:12px;font-style:normal;line-height:1.5}.wizard-card-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.wizard-card-grid button{display:grid;gap:5px;padding:14px;border:1px solid #e2e8f0;border-radius:14px;background:#fff;text-align:left}.wizard-card-grid button.active,.wizard-skill-list button.active{border-color:#1f5fbf;background:#eef4ff}.wizard-card-grid strong{color:#111827}.wizard-card-grid span,.wizard-card-grid em{color:#7b8494;font-size:12px;font-style:normal}.wizard-skill-list{display:grid;gap:9px}.wizard-skill-list button{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px;border:1px solid #e2e8f0;border-radius:14px;background:#fff;text-align:left}.wizard-skill-list strong{color:#111827}.wizard-skill-list span,.wizard-skill-list p,.wizard-skill-list em{color:#7b8494;font-size:12px;font-style:normal}.wizard-skill-list p{margin:5px 0 0}.media-config-list{display:grid;gap:10px;margin-top:14px}.media-config-list article{padding:12px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc}.media-config-list strong{display:block;color:#111827}.media-config-list span{display:inline-block;margin-top:7px;padding:3px 8px;border-radius:999px;background:#eef4ff;color:#1f5fbf;font-size:11px}.media-config-list p{margin:7px 0 0;color:#667085;font-size:12px}.wizard-files{display:grid;grid-template-columns:160px minmax(0,1fr);gap:12px}.wizard-files nav{display:grid;align-content:start;gap:8px}.wizard-files button{height:34px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#344054}.wizard-files button.active{border-color:#1f5fbf;color:#1f5fbf;background:#eef4ff}.wizard-files pre{margin:0;min-height:320px;overflow:auto;padding:14px;border:1px solid #e2e8f0;border-radius:14px;background:#0f172a;color:#dbeafe;font-size:12px;line-height:1.6;white-space:pre-wrap}.agent-wizard__footer{padding:12px 18px;border-top:1px solid #e5e7eb;justify-content:flex-end}
  .shell.is-sidebar-collapsed .workspace-nav h2,.shell.is-sidebar-collapsed .workspace-nav button span:nth-child(2),.shell.is-sidebar-collapsed .workspace-nav button em,.shell.is-sidebar-collapsed .sidebar__brand div:not(.brand-mark),.shell.is-sidebar-collapsed .sidebar__user strong,.shell.is-sidebar-collapsed .sidebar__user em{display:none}.shell.is-sidebar-collapsed .sidebar__brand{grid-template-columns:34px;justify-content:center}.shell.is-sidebar-collapsed .workspace-nav button{grid-template-columns:28px;justify-content:center;padding-inline:8px}.shell.is-sidebar-collapsed .sidebar__user-wrap .sidebar__user{grid-template-columns:28px;justify-content:center}
  @media(max-width:980px){.aorist-stats,.aorist-card-grid,.agent-strip{grid-template-columns:repeat(2,minmax(0,1fr))}.aorist-split{grid-template-columns:1fr}}@media(max-width:720px){.stage-topbar,.aorist-toolbar{align-items:flex-start;flex-direction:column}.aorist-stats,.aorist-card-grid,.agent-strip,.wizard-card-grid,.agent-wizard__body,.wizard-files,.config-grid,.wizard-identity{grid-template-columns:1fr}.wizard-preview{padding-left:0;border-left:0}}

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

  .stage-topbar__actions button,
  .hero-panel button,
  .aorist-toolbar button,
  .composer-context-actions button,
  .automation-card footer button,
  .capability-item button,
  .config-modal footer button,
  .agent-wizard__footer button {
    border-color: #dce4ef;
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.72);
    transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, background 0.16s ease;
  }

  .stage-topbar__actions button:hover,
  .hero-panel button:hover,
  .aorist-toolbar button:hover,
  .composer-context-actions button:hover,
  .automation-card footer button:hover,
  .capability-item button:hover,
  .config-modal footer button:hover,
  .agent-wizard__footer button:hover {
    transform: translateY(-1px);
    border-color: #bfdbfe;
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
  }

  .stage-topbar__actions button:nth-child(2),
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
  .task-composer-card {
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
  .task-composer-card:hover {
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

  .agent-strip button {
    border-color: rgba(226, 232, 240, 0.88);
    background: rgba(255, 255, 255, 0.82);
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.045);
  }

  .agent-strip button.active,
  .wizard-card-grid button.active,
  .wizard-skill-list button.active,
  .capability-tabs button.active {
    border-color: #93c5fd;
    background: linear-gradient(135deg, #eef4ff, #ffffff);
    color: var(--aorist-primary-strong);
  }

  .agent-strip span,
  .agent-card header > span,
  .wizard-avatar,
  .wizard-preview b {
    background: linear-gradient(135deg, var(--aorist-primary), var(--aorist-primary-strong));
    box-shadow: 0 12px 22px rgba(37, 99, 235, 0.18);
  }

  .task-composer-card :global(.composer) {
    border-color: rgba(191, 219, 254, 0.8);
    background: rgba(255, 255, 255, 0.9);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
  }

  .task-composer-card :global(.composer textarea),
  .home__composer :global(.composer textarea) {
    color: var(--aorist-ink);
  }

  .composer-context-actions > span {
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

  .detail-layout{display:grid;grid-template-columns:minmax(280px,.42fr) minmax(0,.58fr);gap:14px;margin-top:14px}.detail-list{display:grid;align-content:start;gap:10px}.detail-list button{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:13px;border:1px solid rgba(226,232,240,.9);border-radius:16px;background:rgba(255,255,255,.82);text-align:left;box-shadow:0 10px 24px rgba(15,23,42,.04);transition:transform .16s ease,border-color .16s ease,background .16s ease}.detail-list button:hover,.detail-list button.active{transform:translateX(1px);border-color:#93c5fd;background:#f8fbff}.detail-list strong{display:block;color:#111827;font-size:14px}.detail-list p{margin:5px 0;color:#5f6774;font-size:12px;line-height:1.5}.detail-list em{color:#7b8494;font-size:11px;font-style:normal}.detail-list span{padding:4px 8px;border-radius:999px;background:#eef4ff;color:#1f5fbf;font-size:11px;white-space:nowrap}.detail-panel{padding:18px;border:1px solid rgba(226,232,240,.9);border-radius:20px;background:rgba(255,255,255,.82);box-shadow:0 18px 42px rgba(15,23,42,.06)}.detail-panel header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.detail-panel header span{color:#7b8494;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.detail-panel header strong{display:block;margin-top:6px;color:#0f172a;font-size:22px;line-height:1.18;letter-spacing:-.035em}.detail-panel header button{min-height:34px;padding:0 12px;border:1px solid #2563eb;border-radius:10px;background:#2563eb;color:#fff;font-size:12px;font-weight:700}.detail-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:16px}.detail-summary article{padding:12px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc}.detail-summary span{display:block;color:#7b8494;font-size:11px}.detail-summary strong{display:block;margin-top:6px;color:#111827;font-size:13px}.detail-tabs{display:flex;gap:7px;margin:16px 0 10px}.detail-tabs button{height:30px;padding:0 10px;border:1px solid #dbe3ee;border-radius:999px;background:#fff;color:#5f6774;font-size:12px}.detail-tabs button.active{border-color:#93c5fd;background:#eef4ff;color:#1d4ed8}.detail-timeline{display:grid;gap:10px}.detail-timeline article{padding:13px;border:1px solid #e2e8f0;border-radius:14px;background:#fff}.detail-timeline b{display:block;color:#111827}.detail-timeline p{margin:6px 0;color:#5f6774;font-size:13px;line-height:1.6}.detail-timeline em{color:#7b8494;font-size:11px;font-style:normal}.room-modal{width:min(940px,calc(100vw - 44px))}.room-layout,.team-chat-layout{display:grid;grid-template-columns:260px minmax(0,1fr);gap:14px;margin-top:16px}.room-layout aside,.team-chat-layout aside{padding:14px;border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc}.room-layout aside span,.team-chat-layout aside span{display:inline-block;margin-bottom:8px;padding:4px 8px;border-radius:999px;background:#eef4ff;color:#1f5fbf;font-size:11px}.room-layout aside strong,.team-chat-layout aside strong{display:block;color:#111827}.room-layout aside p,.team-chat-layout aside p{color:#5f6774;font-size:13px;line-height:1.6}.room-layout main,.team-chat-layout main{display:grid;align-content:start;gap:10px;max-height:420px;overflow:auto;padding:6px}.room-message,.team-chat-layout main article{padding:12px 14px;border:1px solid #e2e8f0;border-radius:16px;background:#fff}.room-message.judge{margin-inline:28px;background:#fffbeb}.room-message.plaintiff{margin-right:64px;background:#eff6ff}.room-message.defendant{margin-left:64px;background:#f8fafc}.room-message b,.team-chat-layout b{display:block;color:#111827;font-size:13px}.room-message p,.team-chat-layout p{margin:6px 0 0;color:#5f6774;font-size:13px;line-height:1.6}.hearing-card,.team-card{cursor:pointer;text-align:left}.hearing-card{border:1px solid rgba(226,232,240,.88);background:rgba(255,255,255,.78)}.team-card{border:1px solid rgba(226,232,240,.88);background:rgba(255,255,255,.78)}.config-grid select{height:36px;padding:0 10px;border:1px solid #d9dee8;border-radius:10px;background:#fff;color:#111827}.config-grid textarea,.config-grid input{border:1px solid #d9dee8;border-radius:10px;background:#fff;color:#111827}@media(max-width:980px){.detail-layout,.room-layout,.team-chat-layout{grid-template-columns:1fr}.detail-summary{grid-template-columns:1fr}}

  .detail-layout--single{grid-template-columns:1fr}.detail-search{margin-top:14px}.detail-list--full{margin-top:14px}.detail-list--full button{min-height:82px}.detail-empty{padding:18px;border:1px dashed #cbd5e1;border-radius:16px;background:rgba(248,250,252,.78);color:#5f6774}.detail-empty strong{display:block;color:#111827}.detail-empty p{margin:6px 0 0;font-size:13px;line-height:1.6}.detail-modal{width:min(840px,calc(100vw - 44px));padding:18px}.detail-modal>.detail-panel{margin-top:14px;background:rgba(255,255,255,.88)}

  .select-list,.distill-panel{display:grid;gap:10px;margin-top:16px}.select-list>p,.distill-panel>p{margin:0;color:#5f6774;font-size:13px;line-height:1.6}.select-list button{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px;border:1px solid #e2e8f0;border-radius:14px;background:#fff;text-align:left}.select-list button:hover{border-color:#93c5fd;background:#f8fbff}.select-list strong{color:#111827}.select-list span{color:#667085;font-size:12px}.distill-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.distill-steps button{min-height:36px;border:1px solid #dbe3ee;border-radius:12px;background:#fff;color:#5f6774;font-weight:700}.distill-steps button.active{border-color:#93c5fd;background:#eef4ff;color:#1d4ed8}.distill-preview{padding:0;border:0}.distill-preview div{margin-top:0}@media(max-width:720px){.distill-steps{grid-template-columns:1fr}}

  .resource-center .resource-tabs{margin-top:0;margin-bottom:14px;flex-wrap:wrap}.resource-center .resource-tabs button{min-width:104px}.resource-actions{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}.resource-actions button{min-height:34px;padding:0 12px;border:1px solid #dce4ef;border-radius:10px;background:rgba(255,255,255,.9);color:#344054;font-size:12px;font-weight:700}.resource-actions button:hover{border-color:#bfdbfe;background:#f8fbff}

  .nav-icon :global(svg),.brand-mark :global(svg),.agent-strip span :global(svg),.agent-card header>span :global(svg),.wizard-avatar :global(svg),.wizard-preview b :global(svg){display:block;stroke-width:2}

  .brand-copy{min-width:0}.brand-mode-switch{display:inline-flex;align-items:center;gap:5px;min-width:58px;height:28px;padding:0 8px;border:1px solid rgba(37,99,235,.14);border-radius:10px;background:#eef4ff;color:#1d4ed8;font-size:11px;font-weight:800}.brand-mode-switch:hover,.brand-mode-switch.active{border-color:#93c5fd;background:#dbeafe;color:#1e40af}.brand-mode-switch span{white-space:nowrap}.shell.is-sidebar-collapsed .brand-mode-switch{display:none}

</style>
