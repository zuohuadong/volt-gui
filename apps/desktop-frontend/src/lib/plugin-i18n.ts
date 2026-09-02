import type { PluginInventoryEntry } from "./dsh-client";
import { getLocale, t, type Locale } from "./i18n";

export type PluginCategory =
  | "core"
  | "tools"
  | "terminal"
  | "filesystem"
  | "planning"
  | "subagents"
  | "compaction"
  | "skills"
  | "model"
  | "workflow"
  | "infrastructure"
  | "browser"
  | "office"
  | "mcp"
  | "custom";

export type PluginCategoryMeta = {
  id: PluginCategory;
  label: string;
  description: string;
};

export const PLUGIN_CATEGORIES: Record<PluginCategory, PluginCategoryMeta> = {
  core: { id: "core", label: "核心配置", description: "系统人设、提示词注入与基础配置" },
  tools: { id: "tools", label: "核心工具", description: "待办清单、用户交互与通用工具" },
  terminal: { id: "terminal", label: "终端与执行", description: "PowerShell、Bash 命令行与进程执行" },
  filesystem: { id: "filesystem", label: "文件与数据", description: "工作区文件读写、搜索与代码精准替换" },
  planning: { id: "planning", label: "目标与规划", description: "长程目标控制、自主循环与规划模式" },
  subagents: { id: "subagents", label: "多 Agent 协作", description: "多智能体派发、协同与调度控制" },
  compaction: { id: "compaction", label: "上下文与性能", description: "Token 监控、上下文自动压缩与结果裁剪" },
  skills: { id: "skills", label: "技能与知识", description: "技能系统加载、动态规范与文档检索" },
  model: { id: "model", label: "模型与网关", description: "大语言模型提供商适配与推理路由" },
  workflow: { id: "workflow", label: "工作流与自动化", description: "后台多线程工作流编排与批处理" },
  infrastructure: { id: "infrastructure", label: "基础设施", description: "会话持久化、状态投影与框架内核" },
  browser: { id: "browser", label: "浏览器与计算机控制", description: "浏览器会话、页面观察与受控交互" },
  office: { id: "office", label: "Office 文档", description: "Word、Excel 与 PowerPoint 文档创建、编辑和验证" },
  mcp: { id: "mcp", label: "MCP 协议服务", description: "Model Context Protocol 上下文协议连接" },
  custom: { id: "custom", label: "扩展插件", description: "第三方或用户自定义扩展模块" },
};

export type PluginI18nInfo = {
  name: string;
  description: string;
  category: PluginCategory;
  categoryLabel: string;
  vendor: string;
  isMcp: boolean;
  tags?: string[];
};

export type EnrichedPluginEntry = PluginInventoryEntry & {
  info: PluginI18nInfo;
};

interface BilingualPluginSpec {
  name: { "zh-CN": string; "en-US": string };
  description: { "zh-CN": string; "en-US": string };
  category: PluginCategory;
  vendor?: { "zh-CN": string; "en-US": string };
  isMcp: boolean;
  tags?: { "zh-CN": string[]; "en-US": string[] };
}

const DEFAULT_OFFICIAL_VENDOR = {
  "zh-CN": "官方内置 (@deepseek-ai)",
  "en-US": "Official Builtin (@deepseek-ai)",
};

const KNOWN_PLUGIN_REGISTRY: Record<string, BilingualPluginSpec> = {
  "@deepseek-ai/dsh-persona": {
    name: { "zh-CN": "人设与角色定义", "en-US": "Persona & Role Definition" },
    description: {
      "zh-CN": "为 Agent 注入系统角色设定、身份约束以及当前工作目录和模型上下文。",
      "en-US": "Injects system persona, role constraints, working directory, and model context into the Agent.",
    },
    category: "core",
    isMcp: false,
    tags: { "zh-CN": ["人设", "角色", "提示词"], "en-US": ["Persona", "Role", "Prompts"] },
  },
  "@deepseek-ai/dsh-agent-instructions": {
    name: { "zh-CN": "全局指令与提示词", "en-US": "Global Instructions & Prompts" },
    description: {
      "zh-CN": "管理和注入项目级全局指导规则、用户自定义提示词与上下文约束。",
      "en-US": "Manages and injects project-level global rules, custom user instructions, and context constraints.",
    },
    category: "core",
    isMcp: false,
    tags: { "zh-CN": ["指令", "规范", "提示词"], "en-US": ["Instructions", "Specs", "Prompts"] },
  },
  "@deepseek-ai/dsh-settings": {
    name: { "zh-CN": "配置与命名空间服务", "en-US": "Settings & Namespace Service" },
    description: {
      "zh-CN": "统一管理系统级与用户级的配置命名空间，支持动态热更新与持久化存储。",
      "en-US": "Unified management of system and user configuration namespaces with hot-reload and persistent storage.",
    },
    category: "core",
    isMcp: false,
    tags: { "zh-CN": ["设置", "命名空间", "配置"], "en-US": ["Settings", "Namespaces", "Config"] },
  },
  "@deepseek-ai/dsh-tool-pwsh": {
    name: { "zh-CN": "PowerShell 终端工具", "en-US": "PowerShell Terminal Tool" },
    description: {
      "zh-CN": "在 Windows 系统下安全执行 PowerShell 命令行命令、构建脚本与调试任务。",
      "en-US": "Safely executes PowerShell commands, build scripts, and diagnostic tasks on Windows.",
    },
    category: "terminal",
    isMcp: false,
    tags: { "zh-CN": ["PowerShell", "终端", "命令行", "Windows"], "en-US": ["PowerShell", "Terminal", "CLI", "Windows"] },
  },
  "@deepseek-ai/dsh-tool-pwsh-persistent": {
    name: { "zh-CN": "持久化 PowerShell 会话", "en-US": "Persistent PowerShell Session" },
    description: {
      "zh-CN": "维持常驻的后台交互式 PowerShell 进程，支持跨步骤状态和环境变量保持。",
      "en-US": "Maintains persistent interactive PowerShell shell processes across multiple execution steps.",
    },
    category: "terminal",
    isMcp: false,
    tags: { "zh-CN": ["PowerShell", "常驻会话", "终端"], "en-US": ["PowerShell", "Persistent", "Terminal"] },
  },
  "@deepseek-ai/dsh-tool-bash": {
    name: { "zh-CN": "Bash 终端工具", "en-US": "Bash Terminal Tool" },
    description: {
      "zh-CN": "在 Linux / macOS 环境下安全执行 POSIX Shell / Bash 脚本与系统命令。",
      "en-US": "Safely executes POSIX Shell and Bash scripts and system commands on Linux/macOS.",
    },
    category: "terminal",
    isMcp: false,
    tags: { "zh-CN": ["Bash", "Shell", "终端", "命令行"], "en-US": ["Bash", "Shell", "Terminal", "CLI"] },
  },
  "@deepseek-ai/dsh-tool-bash-persistent": {
    name: { "zh-CN": "持久化 Bash 会话", "en-US": "Persistent Bash Session" },
    description: {
      "zh-CN": "维持常驻的后台交互式 Bash 终端进程，支持多步骤连续交互。",
      "en-US": "Maintains persistent interactive Bash processes for multi-step shell sessions.",
    },
    category: "terminal",
    isMcp: false,
    tags: { "zh-CN": ["Bash", "常驻会话", "终端"], "en-US": ["Bash", "Persistent", "Terminal"] },
  },
  "@deepseek-ai/dsh-tool-fs": {
    name: { "zh-CN": "文件系统操作工具", "en-US": "Filesystem Operations Tool" },
    description: {
      "zh-CN": "提供对工作区内文件的读取、创建、写入与目录检查等核心文件管理能力。",
      "en-US": "Provides core filesystem management capabilities including file reading, creation, writing, and directory listing.",
    },
    category: "filesystem",
    isMcp: false,
    tags: { "zh-CN": ["文件读写", "目录", "文件管理"], "en-US": ["File I/O", "Directory", "Filesystem"] },
  },
  "@deepseek-ai/dsh-tool-fs-search": {
    name: { "zh-CN": "文件全文与正则检索", "en-US": "Filesystem Search & Glob" },
    description: {
      "zh-CN": "基于 Glob 模式与正则表达式在工作区快速检索文件名与目标文件内容。",
      "en-US": "Quickly searches filenames and contents across workspace using glob patterns and regular expressions.",
    },
    category: "filesystem",
    isMcp: false,
    tags: { "zh-CN": ["搜索", "Glob", "检索", "代码定位"], "en-US": ["Search", "Glob", "Regex", "Code Locating"] },
  },
  "@deepseek-ai/dsh-tool-str-replace-editor": {
    name: { "zh-CN": "精准文本替换编辑器", "en-US": "Precise String Replace Editor" },
    description: {
      "zh-CN": "通过唯一上下文定位和精准块替换修改代码，最大限度减少文件重写与格式破坏。",
      "en-US": "Modifies code via unique context matching and precise block replacement to prevent file rewrites.",
    },
    category: "filesystem",
    isMcp: false,
    tags: { "zh-CN": ["代码编辑", "精准替换", "补丁"], "en-US": ["Code Editor", "Exact Replace", "Patch"] },
  },
  "@deepseek-ai/dsh-fs-local": {
    name: { "zh-CN": "本地文件系统驱动", "en-US": "Local Filesystem Driver" },
    description: {
      "zh-CN": "提供本地文件路径解析、权限检查与工作区沙箱隔离保护。",
      "en-US": "Provides local file path resolution, permission verification, and workspace sandbox boundaries.",
    },
    category: "infrastructure",
    isMcp: false,
    tags: { "zh-CN": ["沙箱", "路径", "驱动"], "en-US": ["Sandbox", "Path", "Driver"] },
  },
  "@deepseek-ai/dsh-tool-jobs": {
    name: { "zh-CN": "后台作业与任务控制", "en-US": "Background Jobs & Tasks" },
    description: {
      "zh-CN": "支持长耗时构建、测试或服务的后台异步运行、日志流收集与主动终止。",
      "en-US": "Controls background asynchronous jobs for builds, tests, or services with log streaming and termination.",
    },
    category: "tools",
    isMcp: false,
    tags: { "zh-CN": ["后台任务", "作业", "异步"], "en-US": ["Background Jobs", "Tasks", "Async"] },
  },
  "@deepseek-ai/dsh-tool-skill": {
    name: { "zh-CN": "技能加载与执行器", "en-US": "Skill Loader & Executor" },
    description: {
      "zh-CN": "根据对话上下文动态匹配并加载标准 SKILL.md 规范与特定领域操作指南。",
      "en-US": "Dynamically matches and loads standard SKILL.md specifications and domain workflows from context.",
    },
    category: "skills",
    isMcp: false,
    tags: { "zh-CN": ["Skill", "技能", "知识库", "工作流"], "en-US": ["Skills", "Knowledge", "Workflows"] },
  },
  "@deepseek-ai/dsh-skill": {
    name: { "zh-CN": "技能注册中心", "en-US": "Skill Registry Core" },
    description: {
      "zh-CN": "维护会话与全局层级的技能目录索引、分类管理与能力暴露清单。",
      "en-US": "Maintains session and global skill directory indexing, category organization, and capability exposure.",
    },
    category: "skills",
    isMcp: false,
    tags: { "zh-CN": ["技能库", "注册表"], "en-US": ["Registry", "Skills"] },
  },
  "@deepseek-ai/dsh-skill-filesystem": {
    name: { "zh-CN": "本地技能文件发现", "en-US": "Filesystem Skill Discovery" },
    description: {
      "zh-CN": "自动扫描工作区目录（.agents/skills 等）中的技能文件并注册到运行时技能库。",
      "en-US": "Automatically discovers and registers skill files from workspace directories (.agents/skills, etc.).",
    },
    category: "skills",
    isMcp: false,
    tags: { "zh-CN": ["技能发现", "文件扫描"], "en-US": ["Discovery", "File Scan"] },
  },
  "@deepseek-ai/dsh-tool-goal": {
    name: { "zh-CN": "长程目标控制", "en-US": "Long-Horizon Goal Control" },
    description: {
      "zh-CN": "支持自主多步长程目标规划、执行审计、暂停/恢复以及轮次预算保护。",
      "en-US": "Empowers autonomous multi-step long-horizon goal planning, execution auditing, pause/resume, and round budgets.",
    },
    category: "planning",
    isMcp: false,
    tags: { "zh-CN": ["目标管理", "自主规划", "审计"], "en-US": ["Goals", "Planning", "Auditing"] },
  },
  "@deepseek-ai/dsh-goal": {
    name: { "zh-CN": "目标服务核心", "en-US": "Goal Service Core" },
    description: {
      "zh-CN": "驱动长程目标生命周期流转、状态持久化与轮次步数审计。",
      "en-US": "Drives long-horizon goal lifecycle state machine, persistence, and audit step tracking.",
    },
    category: "planning",
    isMcp: false,
    tags: { "zh-CN": ["目标核心", "状态机"], "en-US": ["Goal Core", "State Machine"] },
  },
  "@deepseek-ai/dsh-goal-round-driver": {
    name: { "zh-CN": "目标轮次驱动器", "en-US": "Goal Round Driver" },
    description: {
      "zh-CN": "控制 Agent 在执行目标时的连续驱动轮次与步数上限，防止失控死循环。",
      "en-US": "Controls consecutive execution rounds and step budgets during autonomous goal pursuit to prevent runaway loops.",
    },
    category: "planning",
    isMcp: false,
    tags: { "zh-CN": ["轮次控制", "安全预算"], "en-US": ["Round Driver", "Safety Budget"] },
  },
  "@deepseek-ai/dsh-plan-mode": {
    name: { "zh-CN": "规划模式 (Plan Mode)", "en-US": "Plan Mode" },
    description: {
      "zh-CN": "约束 Agent 在只读状态下先制定完整实施方案，待用户批准后再执行改动。",
      "en-US": "Restricts Agent to read-only analysis to formulate a complete execution plan before user approval.",
    },
    category: "planning",
    isMcp: false,
    tags: { "zh-CN": ["规划模式", "方案先行", "安全审批"], "en-US": ["Plan Mode", "Read-Only", "Approval"] },
  },
  "@deepseek-ai/dsh-tool-ralph": {
    name: { "zh-CN": "Ralph 自主迭代引擎", "en-US": "Ralph Autonomous Iteration Engine" },
    description: {
      "zh-CN": "驱动 Agent 进行高自主度的循环自检、代码验证与反思修复，处理深层系统任务。",
      "en-US": "Drives autonomous iterative loops for self-verification, testing, reflection, and automated code fixes.",
    },
    category: "planning",
    isMcp: false,
    tags: { "zh-CN": ["自主循环", "自检", "反思修复"], "en-US": ["Autonomous", "Self-Reflection", "Iterative Fixes"] },
  },
  "@deepseek-ai/dsh-compaction-basic": {
    name: { "zh-CN": "会话上下文自动压缩", "en-US": "Context Auto-Compaction" },
    description: {
      "zh-CN": "在长对话接近模型上下文上限时，智能摘要历史轮次并压缩冗余信息以降低消耗。",
      "en-US": "Intelligently summarizes historical turns when nearing context limits to reduce token consumption.",
    },
    category: "compaction",
    isMcp: false,
    tags: { "zh-CN": ["上下文压缩", "Token 优化", "历史摘要"], "en-US": ["Compaction", "Token Opt", "Summarization"] },
  },
  "@deepseek-ai/dsh-command-compact": {
    name: { "zh-CN": "手动压缩指令 (/compact)", "en-US": "Manual Compact Command (/compact)" },
    description: {
      "zh-CN": "响应用户或 Agent 发起的即时上下文压缩指令，即刻精简历史消息流。",
      "en-US": "Executes immediate on-demand context compaction triggered by user or agent commands.",
    },
    category: "compaction",
    isMcp: false,
    tags: { "zh-CN": ["手动压缩", "指令"], "en-US": ["Manual Compact", "Command"] },
  },
  "@deepseek-ai/dsh-compaction-tool-result-pruner": {
    name: { "zh-CN": "工具结果智能裁剪", "en-US": "Tool Result Pruner" },
    description: {
      "zh-CN": "对工具调用返回的超大日志进行首尾保留和中间裁剪，避免淹没上下文窗口。",
      "en-US": "Prunes oversized tool execution outputs while retaining head and tail logs to protect context window.",
    },
    category: "compaction",
    isMcp: false,
    tags: { "zh-CN": ["日志裁剪", "Token 保护"], "en-US": ["Log Pruning", "Token Protection"] },
  },
  "@deepseek-ai/dsh-token-meter": {
    name: { "zh-CN": "Token 消耗计量器", "en-US": "Token Consumption Meter" },
    description: {
      "zh-CN": "实时监控会话输入、输出与缓存 Token 数量，统计推理成本与上下文水位。",
      "en-US": "Monitors input, output, and cached tokens in real-time, tracking inference costs and context watermarks.",
    },
    category: "compaction",
    isMcp: false,
    tags: { "zh-CN": ["Token 计量", "水位监控"], "en-US": ["Token Meter", "Watermark"] },
  },
  "@deepseek-ai/dsh-tool-subagent-control": {
    name: { "zh-CN": "子 Agent 协同控制中心", "en-US": "Subagent Coordination Hub" },
    description: {
      "zh-CN": "管理派发给子 Agent 的协作任务生命周期、状态轮询与结果归集。",
      "en-US": "Manages subagent task lifecycle, polling, and result aggregation for multi-agent delegation.",
    },
    category: "subagents",
    isMcp: false,
    tags: { "zh-CN": ["多 Agent", "协同调度", "生命周期"], "en-US": ["Multi-Agent", "Coordination", "Lifecycle"] },
  },
  "@deepseek-ai/dsh-tool-subagent": {
    name: { "zh-CN": "子 Agent 派发器", "en-US": "Subagent Dispatcher" },
    description: {
      "zh-CN": "将独立探索、验证或子任务分发给一次性或持久运行的子 Agent 实例并行处理。",
      "en-US": "Dispatches independent exploration, verification, or subtasks to one-off or persistent subagents in parallel.",
    },
    category: "subagents",
    isMcp: false,
    tags: { "zh-CN": ["子任务派发", "并行执行"], "en-US": ["Dispatch", "Parallel Execution"] },
  },
  "@deepseek-ai/dsh-subagent": {
    name: { "zh-CN": "子 Agent 运行时核心", "en-US": "Subagent Runtime Core" },
    description: {
      "zh-CN": "底层提供隔离的执行环境与会话父子层级关系维护，保障多智能体协作安全性。",
      "en-US": "Provides isolated execution environments and maintains parent-child session hierarchies for multi-agent safety.",
    },
    category: "subagents",
    isMcp: false,
    tags: { "zh-CN": ["多 Agent 核心", "隔离环境"], "en-US": ["Multi-Agent Core", "Isolation"] },
  },
  "@deepseek-ai/dsh-workflow-worker-thread": {
    name: { "zh-CN": "工作流 Worker 线程池", "en-US": "Workflow Worker Thread Pool" },
    description: {
      "zh-CN": "在独立的后台 Worker 线程中驱动复杂工作流管道，隔离重负载计算。",
      "en-US": "Drives workflow pipelines in isolated background worker threads to protect main thread responsiveness.",
    },
    category: "workflow",
    isMcp: false,
    tags: { "zh-CN": ["工作流", "Worker 线程", "异步编排"], "en-US": ["Workflows", "Worker Threads", "Orchestration"] },
  },
  "@deepseek-ai/dsh-tool-workflow": {
    name: { "zh-CN": "工作流编排工具", "en-US": "Workflow Orchestration Tool" },
    description: {
      "zh-CN": "允许 Agent 调用和触发预定义工作流自动化流水线与批处理操作。",
      "en-US": "Allows Agent to invoke and trigger automated workflow pipelines and batch operations.",
    },
    category: "workflow",
    isMcp: false,
    tags: { "zh-CN": ["工作流调用", "流水线"], "en-US": ["Workflows", "Pipelines"] },
  },
  "@deepseek-ai/dsh-tool-ask-user": {
    name: { "zh-CN": "交互提问工具", "en-US": "User Interaction & Confirmation" },
    description: {
      "zh-CN": "在遇到需求分支、关键决策或方案选择时，主动向用户弹出结构化选项或确认框。",
      "en-US": "Presents structured option questions and confirmation dialogs when hitting decision branches.",
    },
    category: "tools",
    isMcp: false,
    tags: { "zh-CN": ["用户确认", "决策分支", "提问"], "en-US": ["Confirmation", "Decision Branch", "Ask User"] },
  },
  "@deepseek-ai/dsh-tool-todo": {
    name: { "zh-CN": "待办清单与进度跟踪", "en-US": "Todo List & Progress Tracker" },
    description: {
      "zh-CN": "在复杂任务执行中动态维护步骤待办列表，实时呈现当前执行步骤与完成进度。",
      "en-US": "Dynamically maintains step-by-step todo items and tracks live progress throughout complex tasks.",
    },
    category: "tools",
    isMcp: false,
    tags: { "zh-CN": ["待办事项", "任务清单", "进度追踪"], "en-US": ["Todos", "Checklists", "Progress"] },
  },
  "@deepseek-ai/dsh-tool-web": {
    name: { "zh-CN": "网页检索与在线浏览", "en-US": "Web Search & Fetch" },
    description: {
      "zh-CN": "支持向搜索引擎发起查询并抓取公开网页内容，获取最新在线技术资料与信息。",
      "en-US": "Queries search engines and fetches web pages to acquire online documentation and real-time information.",
    },
    category: "tools",
    isMcp: false,
    tags: { "zh-CN": ["网页搜索", "网络抓取", "文档检索"], "en-US": ["Web Search", "Web Fetch", "Docs"] },
  },
  "@deepseek-ai/dsh-llm": {
    name: { "zh-CN": "LLM 推理网关核心", "en-US": "LLM Inference Gateway Core" },
    description: {
      "zh-CN": "基础的大语言模型推理流调度、多 Provider 抽象与统一交互接口。",
      "en-US": "Unified LLM inference stream scheduler, multi-provider abstraction, and invocation interface.",
    },
    category: "model",
    isMcp: false,
    tags: { "zh-CN": ["模型网关", "LLM", "推理调度"], "en-US": ["Gateway", "LLM", "Inference"] },
  },
  "@deepseek-ai/dsh-llm-pi-ai": {
    name: { "zh-CN": "XG GOModel / 多模型提供商网关", "en-US": "XG GOModel / Multi-Provider Gateway" },
    description: {
      "zh-CN": "连接 DeepSeek、XG GOModel 与 OpenAI 兼容模型提供商，管理多模型目录与安全凭据。",
      "en-US": "Connects DeepSeek, XG GOModel, and OpenAI-compatible providers, managing catalogs and credentials.",
    },
    category: "model",
    vendor: { "zh-CN": "XGIC 平台驱动 (@deepseek-ai / xgic)", "en-US": "XGIC Platform Driver (@deepseek-ai / xgic)" },
    isMcp: false,
    tags: { "zh-CN": ["XG GOModel", "DeepSeek", "模型目录", "凭据网关"], "en-US": ["XG GOModel", "DeepSeek", "Model Catalog", "Gateway"] },
  },
  "@deepseek-ai/dsh-session-checkpoint-policy": {
    name: { "zh-CN": "会话自动检查点策略", "en-US": "Session Checkpoint Policy" },
    description: {
      "zh-CN": "在关键操作或阶段自动保存会话状态镜像，支持故障恢复与历史状态回退。",
      "en-US": "Automatically captures session snapshots prior to key operations for crash recovery and history rollback.",
    },
    category: "infrastructure",
    isMcp: false,
    tags: { "zh-CN": ["检查点", "自动备份", "崩溃恢复"], "en-US": ["Checkpoints", "Backup", "Recovery"] },
  },
  "@deepseek-ai/dsh-session-projection": {
    name: { "zh-CN": "会话状态实时投影", "en-US": "Session State Projection" },
    description: {
      "zh-CN": "将底层事件流实时聚合投影为前端视图所需的结构化会话状态与交互快照。",
      "en-US": "Aggregates underlying event streams into reactive, structured session state snapshots for UI views.",
    },
    category: "infrastructure",
    isMcp: false,
    tags: { "zh-CN": ["状态投影", "响应式视图"], "en-US": ["Projection", "Reactive View"] },
  },
  "@deepseek-ai/dsh-session-reference": {
    name: { "zh-CN": "跨会话关联引用", "en-US": "Cross-Session Reference" },
    description: {
      "zh-CN": "支持通过 # 语法在提示词中快速引入和关联其他会话的上下文与产物信息。",
      "en-US": "Supports referencing contexts and artifacts from other sessions via # syntax in prompts.",
    },
    category: "infrastructure",
    isMcp: false,
    tags: { "zh-CN": ["会话引用", "上下文关联"], "en-US": ["References", "Context Linking"] },
  },
  "@deepseek-ai/dsh-agent-tool-presentation": {
    name: { "zh-CN": "多媒体产物呈现", "en-US": "Multimedia Presentation Tool" },
    description: {
      "zh-CN": "为模型生成的幻灯片、文档、图表等富媒体产物提供桌面交互式渲染与预览支持。",
      "en-US": "Provides desktop interactive rendering and preview for generated slides, documents, and charts.",
    },
    category: "tools",
    isMcp: false,
    tags: { "zh-CN": ["多媒体", "文档预览", "图表呈现"], "en-US": ["Multimedia", "Doc Preview", "Charts"] },
  },
  "@deepseek-ai/dsh-tools": {
    name: { "zh-CN": "工具注册中心", "en-US": "Tools Registry Core" },
    description: {
      "zh-CN": "收集、验证并向模型暴露所有已启用的函数调用 (Function Calling) 工具集合。",
      "en-US": "Aggregates, validates, and exposes enabled function calling tools to language models.",
    },
    category: "tools",
    isMcp: false,
    tags: { "zh-CN": ["工具注册", "函数调用", "Tools"], "en-US": ["Tool Registry", "Function Calling"] },
  },
  "@deepseek-ai/dsh-tool-cordis": {
    name: { "zh-CN": "Cordis 框架集成工具", "en-US": "Cordis Framework Tool" },
    description: {
      "zh-CN": "驱动底层微内核依赖注入、服务发现与插件生命周期交互。",
      "en-US": "Drives microkernel dependency injection, service discovery, and plugin lifecycle interaction.",
    },
    category: "infrastructure",
    isMcp: false,
    tags: { "zh-CN": ["Cordis", "依赖注入", "微内核"], "en-US": ["Cordis", "DI", "Microkernel"] },
  },
  "@deepseek-ai/dsh-time-context": {
    name: { "zh-CN": "系统时钟与时区上下文", "en-US": "Time & Clock Context" },
    description: {
      "zh-CN": "向 Agent 注入当前客户端的精确时间、时区与日历上下文。",
      "en-US": "Injects real-time client clock, timezone, and calendar context into the Agent.",
    },
    category: "infrastructure",
    isMcp: false,
    tags: { "zh-CN": ["时间", "时区", "环境上下文"], "en-US": ["Time", "Timezone", "Context"] },
  },
  "@deepseek-ai/dsh-tmux-context": {
    name: { "zh-CN": "Tmux 终端会话上下文", "en-US": "Tmux Terminal Context" },
    description: {
      "zh-CN": "提供 Tmux 终端会话的环境感知与连接信息。",
      "en-US": "Provides tmux environment detection and terminal session awareness.",
    },
    category: "infrastructure",
    isMcp: false,
    tags: { "zh-CN": ["Tmux", "终端上下文"], "en-US": ["Tmux", "Terminal Context"] },
  },
  "@deepseek-ai/dsh-launch-environment": {
    name: { "zh-CN": "启动环境探测", "en-US": "Launch Environment Detection" },
    description: {
      "zh-CN": "检测并提供宿主系统的环境变量、Shell 类型及硬件环境参数。",
      "en-US": "Detects and provides host environment variables, shell types, and hardware capabilities.",
    },
    category: "infrastructure",
    isMcp: false,
    tags: { "zh-CN": ["环境变量", "系统探测"], "en-US": ["Env Vars", "Environment"] },
  },
  "@deepseek-ai/dsh-base": {
    name: { "zh-CN": "运行时底座", "en-US": "Runtime Base" },
    description: {
      "zh-CN": "基础核心底座，承载会话总线与事件调度。",
      "en-US": "Fundamental base hosting the session bus and event scheduler.",
    },
    category: "infrastructure",
    isMcp: false,
    tags: { "zh-CN": ["底座核心", "核心运行时"], "en-US": ["Base", "Core Runtime"] },
  },
  "@deepseek-ai/dsh-web-app": {
    name: { "zh-CN": "Web 宿主服务", "en-US": "Web Host Service" },
    description: {
      "zh-CN": "提供本地 RPC API 网关与 WebSocket 双向通信管道。",
      "en-US": "Provides local loopback RPC API gateway and WebSocket bi-directional communication channels.",
    },
    category: "infrastructure",
    isMcp: false,
    tags: { "zh-CN": ["API 网关", "RPC", "Web 宿主"], "en-US": ["API Gateway", "RPC", "Web Host"] },
  },
  "@deepseek-ai/dsh-headless": {
    name: { "zh-CN": "无头运行模式核心", "en-US": "Headless Mode Core" },
    description: {
      "zh-CN": "支持在无图形界面环境下运行 Agent 任务与批处理自动化。",
      "en-US": "Supports executing Agent tasks and batch automations in headless non-GUI environments.",
    },
    category: "infrastructure",
    isMcp: false,
    tags: { "zh-CN": ["无头模式", "批处理"], "en-US": ["Headless", "Batch"] },
  },
  "cordis:group": {
    name: { "zh-CN": "Cordis 作用域隔离分组", "en-US": "Cordis Scoped Group" },
    description: {
      "zh-CN": "Cordis 微内核提供的插件作用域隔离与独立上下文生命周期容器。",
      "en-US": "Cordis microkernel scoped container providing plugin lifecycle isolation and context boundaries.",
    },
    category: "infrastructure",
    vendor: { "zh-CN": "Cordis 微内核", "en-US": "Cordis Microkernel" },
    isMcp: false,
    tags: { "zh-CN": ["作用域", "Cordis", "隔离容器"], "en-US": ["Scope", "Cordis", "Isolation"] },
  },
  "@deepseek-ai/dsh-mcp-client": {
    name: { "zh-CN": "MCP 协议客户端", "en-US": "MCP Protocol Client" },
    description: {
      "zh-CN": "连接标准 Model Context Protocol (MCP) 外部服务，为 Agent 挂载外部数据库、浏览器、企业 API 等工具与上下文资源。",
      "en-US": "Connects standard Model Context Protocol (MCP) external services, mounting external tools, databases, and APIs.",
    },
    category: "mcp",
    isMcp: true,
    tags: { "zh-CN": ["MCP", "Model Context Protocol", "外部工具", "资源服务"], "en-US": ["MCP", "Model Context Protocol", "Tools", "Resources"] },
  },
  "mcp-officecli": {
    name: { "zh-CN": "OfficeCLI 文档处理", "en-US": "OfficeCLI Document Tools" },
    description: {
      "zh-CN": "通过官方 DSH MCP 客户端调用内置 OfficeCLI，创建、读取、修改、验证和预览 Word、Excel 与 PowerPoint 文档。",
      "en-US": "Uses the official DSH MCP client with bundled OfficeCLI to create, inspect, edit, validate, and preview Word, Excel, and PowerPoint documents.",
    },
    category: "office",
    vendor: { "zh-CN": "iOfficeAI OfficeCLI", "en-US": "iOfficeAI OfficeCLI" },
    isMcp: true,
    tags: {
      "zh-CN": ["OfficeCLI", "Word", "Excel", "PowerPoint", "MCP"],
      "en-US": ["OfficeCLI", "Word", "Excel", "PowerPoint", "MCP"],
    },
  },
  "@wxg-prc-cpg/browser-skill-dsh-plugin": {
    name: { "zh-CN": "BrowserSkill 浏览器控制", "en-US": "BrowserSkill Browser Control" },
    description: {
      "zh-CN": "通过官方 DSH 插件桥接 BrowserSkill，支持浏览器会话、页面观察、截图和受控交互。",
      "en-US": "Bridges BrowserSkill through an official DSH plugin for browser sessions, inspection, screenshots, and controlled interaction.",
    },
    category: "browser",
    vendor: { "zh-CN": "腾讯 BrowserSkill", "en-US": "Tencent BrowserSkill" },
    isMcp: false,
    tags: {
      "zh-CN": ["BrowserSkill", "浏览器", "截图", "页面观察", "Computer Use"],
      "en-US": ["BrowserSkill", "Browser", "Screenshot", "Inspection", "Computer Use"],
    },
  },
};

export function isMcpIdentifier(identifier?: string | null): boolean {
  if (!identifier) return false;
  const lower = identifier.toLowerCase();
  return (
    lower.includes("mcp") ||
    lower.startsWith("@modelcontextprotocol/") ||
    lower.includes("model-context-protocol")
  );
}

export function isMcpEntry(entry: { moduleName?: string; entryId?: string }): boolean {
  return isMcpIdentifier(entry.moduleName) || isMcpIdentifier(entry.entryId);
}

function sanitizePluginName(raw: string): string {
  let clean = raw.replace(/^@deepseek-ai\//, "").replace(/^@[\w-]+\//, "");
  clean = clean.replace(/^dsh-/, "");
  clean = clean.replace(/^(tool|command|skill|workflow)-/, "");
  return clean
    .split(/[-_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function inferCategory(moduleName: string, entryId: string): PluginCategory {
  const combined = `${moduleName} ${entryId}`.toLowerCase();
  if (isMcpIdentifier(combined)) return "mcp";
  if (combined.includes("terminal") || combined.includes("pwsh") || combined.includes("bash") || combined.includes("cmdline")) return "terminal";
  if (combined.includes("fs") || combined.includes("file") || combined.includes("search") || combined.includes("replace")) return "filesystem";
  if (combined.includes("goal") || combined.includes("plan") || combined.includes("ralph")) return "planning";
  if (combined.includes("subagent")) return "subagents";
  if (combined.includes("compact") || combined.includes("token") || combined.includes("meter") || combined.includes("pruner")) return "compaction";
  if (combined.includes("skill")) return "skills";
  if (combined.includes("llm") || combined.includes("model") || combined.includes("provider")) return "model";
  if (combined.includes("workflow")) return "workflow";
  if (combined.includes("persona") || combined.includes("instruction") || combined.includes("setting")) return "core";
  if (combined.includes("tool") || combined.includes("todo") || combined.includes("ask-user") || combined.includes("web") || combined.includes("job")) return "tools";
  return "custom";
}

export function resolvePluginI18n(
  entry: { moduleName?: string; entryId?: string },
  targetLocale?: Locale,
): PluginI18nInfo {
  const moduleName = entry.moduleName || "";
  const entryId = entry.entryId || "";
  const loc = targetLocale || getLocale();
  const isZh = loc === "zh-CN";

  const match = KNOWN_PLUGIN_REGISTRY[entryId] || KNOWN_PLUGIN_REGISTRY[moduleName];
  if (match) {
    const categoryLabel = t(`plugins.categories.${match.category}`);
    const vendor = match.vendor ? match.vendor[loc] || match.vendor["zh-CN"] : DEFAULT_OFFICIAL_VENDOR[loc];
    return {
      name: match.name[loc] || match.name["zh-CN"],
      description: match.description[loc] || match.description["zh-CN"],
      category: match.category,
      categoryLabel: categoryLabel || PLUGIN_CATEGORIES[match.category]?.label || match.category,
      vendor,
      isMcp: match.isMcp,
      tags: match.tags ? match.tags[loc] || match.tags["zh-CN"] : undefined,
    };
  }

  if (isMcpEntry(entry)) {
    const readableName = sanitizePluginName(moduleName || entryId) || (isZh ? "MCP 服务" : "MCP Service");
    const categoryLabel = t("plugins.categories.mcp") || PLUGIN_CATEGORIES.mcp.label;
    return {
      name: `MCP ${readableName}`,
      description: isZh
        ? "Model Context Protocol (MCP) 扩展服务，为 Agent 提供标准化外部工具调用、提示词与上下文数据资源。"
        : "Model Context Protocol (MCP) service providing standard tool calling, prompts, and context resources.",
      category: "mcp",
      categoryLabel,
      vendor: moduleName.startsWith("@deepseek-ai")
        ? DEFAULT_OFFICIAL_VENDOR[loc]
        : isZh
          ? "外部扩展"
          : "External Extension",
      isMcp: true,
      tags: isZh ? ["MCP", "Model Context Protocol", "扩展服务"] : ["MCP", "Model Context Protocol", "Extensions"],
    };
  }

  const category = inferCategory(moduleName, entryId);
  const categoryLabel = t(`plugins.categories.${category}`) || PLUGIN_CATEGORIES[category]?.label || category;
  const readableName = sanitizePluginName(moduleName || entryId) || (isZh ? "扩展" : "Extension");
  const vendor = moduleName.startsWith("@deepseek-ai")
    ? DEFAULT_OFFICIAL_VENDOR[loc]
    : moduleName.startsWith("@")
      ? isZh
        ? "组织扩展"
        : "Org Extension"
      : isZh
        ? "自定义插件"
        : "Custom Plugin";

  return {
    name: isZh ? `${readableName} 插件` : `${readableName} Plugin`,
    description: isZh
      ? `运行环境中的 ${categoryLabel} 模块，提供特定领域功能支持与运行时能力扩展。`
      : `${categoryLabel} module providing domain-specific functionality and runtime extensions.`,
    category,
    categoryLabel,
    vendor,
    isMcp: false,
    tags: isZh ? [categoryLabel, "扩展插件"] : [categoryLabel, "Plugin"],
  };
}

export function enrichPluginEntry(
  entry: PluginInventoryEntry,
  locale?: Locale,
): EnrichedPluginEntry {
  return {
    ...entry,
    info: resolvePluginI18n(entry, locale),
  };
}

export function separatePluginsAndMcp(
  entries: PluginInventoryEntry[],
  locale?: Locale,
): {
  plugins: EnrichedPluginEntry[];
  mcpEntries: EnrichedPluginEntry[];
} {
  const enriched = entries.map((e) => enrichPluginEntry(e, locale));
  const plugins: EnrichedPluginEntry[] = [];
  const mcpEntries: EnrichedPluginEntry[] = [];

  for (const item of enriched) {
    if (item.info.isMcp || isMcpEntry(item)) {
      mcpEntries.push(item);
    } else {
      plugins.push(item);
    }
  }

  return { plugins, mcpEntries };
}

export function filterEnrichedPlugins(
  items: EnrichedPluginEntry[],
  query: string,
  category?: PluginCategory | "all",
): EnrichedPluginEntry[] {
  const trimmed = query.trim().toLowerCase();
  return items.filter((item) => {
    if (category && category !== "all" && item.info.category !== category) {
      return false;
    }
    if (!trimmed) return true;
    const searchable = [
      item.moduleName,
      item.entryId,
      item.info.name,
      item.info.description,
      item.info.categoryLabel,
      item.info.vendor,
      ...(item.info.tags || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return searchable.includes(trimmed);
  });
}
