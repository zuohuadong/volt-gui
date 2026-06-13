import type {
  CommandInfo,
  ContextPanelInfo,
  DirEntry,
  DroppedItem,
  EffortInfo,
  FilePreview,
  GoalInfo,
  CheckpointMeta,
  CapabilitiesView,
  HistoryMessage,
  MCPServerInput,
  ModelInfo,
  ProjectNode,
  ProviderView,
  QuestionAnswer,
  SettingsView,
  SlashArgItem,
  TabMeta,
  TopicMeta,
  UpdateInfo,
  UpdateProgress,
  WireEvent,
  WorkspaceDiffView,
  WorkspaceChangesView,
} from "./types";

interface AppBindings {
  SubmitToTab(tabID: string, input: string): Promise<void>;
  SubmitDisplayToTab(tabID: string, display: string, input: string): Promise<void>;
  CancelTab(tabID: string): Promise<void>;
  ListTabs(): Promise<TabMeta[]>;
  SetActiveTab(tabID: string): Promise<void>;
  OpenGlobalTab(topicID: string): Promise<TabMeta>;
  OpenProjectTab(workspaceRoot: string, topicID: string): Promise<TabMeta>;
  ReorderTabs(tabIDs: string[]): Promise<void>;
  CloseTab(tabID: string): Promise<void>;
  ListProjectTree(): Promise<ProjectNode[]>;
  RenameProject(workspaceRoot: string, title: string): Promise<void>;
  SetProjectColor(workspaceRoot: string, color: string): Promise<void>;
  ReorderProjects(workspaceRoots: string[]): Promise<void>;
  CreateTopic(scope: string, workspaceRoot: string, title: string): Promise<TopicMeta>;
  RenameTopic(topicID: string, title: string): Promise<void>;
  DeleteTopic(topicID: string): Promise<void>;
  TrashTopic(topicID: string): Promise<void>;
  HistoryForTab(tabID: string): Promise<HistoryMessage[]>;
  CheckpointsForTab(tabID: string): Promise<CheckpointMeta[]>;
  Rewind(turn: number, scope: string): Promise<void>;
  ModelsForTab(tabID: string): Promise<ModelInfo[]>;
  SetModelForTab(tabID: string, name: string): Promise<void>;
  EffortForTab(tabID: string): Promise<EffortInfo>;
  SetEffortForTab(tabID: string, level: string): Promise<void>;
  SetModeForTab(tabID: string, mode: string): Promise<void>;
  GoalForTab(tabID: string): Promise<GoalInfo>;
  StartGoalForTab(tabID: string, objective: string): Promise<void>;
  ContinueGoalForTab(tabID: string): Promise<void>;
  ClearGoalForTab(tabID: string): Promise<void>;
  ApproveTab(tabID: string, id: string, allow: boolean, session: boolean, persist: boolean): Promise<void>;
  AnswerQuestionForTab(tabID: string, id: string, answers: QuestionAnswer[]): Promise<void>;
  Commands(): Promise<CommandInfo[]>;
  SlashArgs(input: string): Promise<{ items: SlashArgItem[]; from: number }>;
  ListDir(rel: string): Promise<DirEntry[]>;
  SearchFileRefs(query: string): Promise<DirEntry[]>;
  ReadFile(rel: string): Promise<FilePreview>;
  WorkspaceChanges(): Promise<WorkspaceChangesView>;
  WorkspaceDiff(rel: string): Promise<WorkspaceDiffView>;
  SavePastedImage(dataUrl: string): Promise<string>;
  SavePastedFile(name: string, dataUrl: string): Promise<string>;
  AttachDropped(path: string): Promise<DroppedItem>;
  AttachmentDataURL(path: string): Promise<string>;
  ContextPanel(tabID: string): Promise<ContextPanelInfo>;
  Capabilities(): Promise<CapabilitiesView>;
  AddMCPServer(input: MCPServerInput): Promise<number>;
  UpdateMCPServer(name: string, input: MCPServerInput): Promise<void>;
  RemoveMCPServer(name: string): Promise<void>;
  RetryMCPServer(name: string): Promise<void>;
  SetMCPServerEnabled(name: string, enabled: boolean): Promise<void>;
  RefreshSkills(): Promise<void>;
  SetSkillEnabled(name: string, enabled: boolean): Promise<void>;
  Settings(): Promise<SettingsView>;
  SetCloseBehavior(mode: string): Promise<void>;
  SetDesktopLanguage(lang: string): Promise<void>;
  SetDesktopAppearance(theme: string, style: string): Promise<void>;
  SetDefaultModel(ref: string): Promise<void>;
  SetPlannerModel(ref: string): Promise<void>;
  SaveProvider(provider: ProviderView): Promise<void>;
  DeleteProvider(name: string): Promise<void>;
  SetProviderKey(apiKeyEnv: string, value: string): Promise<void>;
  SetPermissionMode(mode: string): Promise<void>;
  AddPermissionRule(list: string, rule: string): Promise<void>;
  RemovePermissionRule(list: string, rule: string): Promise<void>;
  SetSandbox(bash: string, network: boolean, workspaceRoot: string, allowWrite: string[]): Promise<void>;
  Version(): Promise<string>;
  CheckUpdate(): Promise<UpdateInfo | null>;
  ApplyUpdate(): Promise<void>;
  OpenDownloadPage(): Promise<void>;
  Memory(): Promise<unknown>;
}

interface WailsRuntime {
  EventsOn(name: string, cb: (...data: unknown[]) => void): () => void;
  OnFileDrop?(cb: (x: number, y: number, paths: string[]) => void, useDropTarget: boolean): void;
  OnFileDropOff?(): void;
}

declare global {
  interface Window {
    runtime?: WailsRuntime;
    go?: { main?: { App?: AppBindings } };
  }
}

const EVENT_CHANNEL = "agent:event";
const PROJECT_TREE_CHANNEL = "project-tree:changed";

function realApp(): AppBindings | undefined {
  return typeof window === "undefined" ? undefined : window.go?.main?.App;
}

let mockActiveTabId = "mock-global";
let mockSelectedModel = "deepseek-flash";
let mockEffort = "auto";
let mockCancelled = false;
let mockGoals: Record<string, GoalInfo> = {
  "mock-global": {
    objective: "Finish the Svelte + svadmin workbench migration until Work and Code are both usable.",
    status: "active",
  },
  "mock-code": {
    objective: "Make Code mode diffs, context, checkpoints, and file previews production-ready.",
    status: "idle",
  },
};
let mockHistory: Record<string, HistoryMessage[]> = {
  "mock-global": [
    { role: "user", content: "Plan the Svelte workbench migration." },
    {
      role: "assistant",
      content: [
        "## Workbench plan",
        "",
        "The migration keeps **Work/Code** activity mode separate from `Ask/Auto/YOLO/Plan/Goal` run mode.",
        "",
        "- [x] Define the contract",
        "- [x] Scaffold the Svelte shell",
        "- [ ] Replace the React desktop frontend",
        "",
        "| Mode | Purpose |",
        "| --- | --- |",
        "| Work | General agent work |",
        "| Code | Repository-aware coding |",
        "",
        "Inline math: $tokens = prompt + completion$.",
        "",
        "\\[",
        "\\int_0^1 x^2 dx = \\frac{1}{3}",
        "\\]",
      ].join("\n"),
      reasoning: "Identify product mode boundaries before wiring runtime controls.",
    },
  ],
  "mock-code": [
    { role: "user", content: "Inspect the Svelte workbench shell." },
    {
      role: "assistant",
      content: [
        "Code mode should prioritize context, changed files, checkpoints, and file previews.",
        "",
        "```ts",
        "export const activityMode = \"code\";",
        "```",
      ].join("\n"),
    },
  ],
};
let mockTabsState: TabMeta[] = [
  {
    id: "mock-global",
    scope: "global",
    workspaceRoot: "",
    workspaceName: "Global",
    topicId: "welcome",
    topicTitle: "Workbench planning",
    label: "DeepSeek Flash",
    active: true,
    running: false,
    mode: "normal",
    ready: true,
    cwd: "~/projects/voltui",
  },
  {
    id: "mock-code",
    scope: "project",
    workspaceRoot: "~/projects/voltui",
    workspaceName: "voltui",
    topicId: "code",
    topicTitle: "Svelte migration",
    label: "MiMo Pro",
    active: false,
    running: false,
    mode: "normal",
    ready: true,
    cwd: "~/projects/voltui",
  },
];

let mockProjectTree: ProjectNode[] = [
  {
    key: "global_folder",
    kind: "global_folder",
    label: "Global",
    root: "",
    projectColor: "teal",
    children: [
      {
        key: "global_topic_welcome",
        kind: "global_topic",
        label: "Workbench planning",
        topicId: "welcome",
        projectColor: "teal",
        turns: 3,
        lastActivityAt: Date.now() - 180000,
        open: true,
      },
      {
        key: "global_topic_research",
        kind: "global_topic",
        label: "Research notes",
        topicId: "research",
        projectColor: "teal",
        turns: 1,
        lastActivityAt: Date.now() - 900000,
      },
    ],
  },
  {
    key: "project_~/projects/voltui",
    kind: "project",
    label: "voltui",
    root: "~/projects/voltui",
    projectColor: "blue",
    children: [
      {
        key: "topic_code",
        kind: "topic",
        label: "Svelte migration",
        root: "~/projects/voltui",
        topicId: "code",
        projectColor: "blue",
        turns: 7,
        lastActivityAt: Date.now() - 120000,
        open: true,
      },
      {
        key: "topic_resources",
        kind: "topic",
        label: "Resource surfaces",
        root: "~/projects/voltui",
        topicId: "resources",
        projectColor: "blue",
        turns: 2,
        lastActivityAt: Date.now() - 600000,
      },
    ],
  },
  {
    key: "project_~/projects/docs",
    kind: "project",
    label: "docs",
    root: "~/projects/docs",
    projectColor: "amber",
    children: [
      {
        key: "topic_docs",
        kind: "topic",
        label: "Docs refresh",
        root: "~/projects/docs",
        topicId: "docs",
        projectColor: "amber",
        turns: 1,
        lastActivityAt: Date.now() - 1200000,
      },
    ],
  },
];

function cloneProjectTree(): ProjectNode[] {
  return JSON.parse(JSON.stringify(mockProjectTree)) as ProjectNode[];
}

function nodeChildren(node: ProjectNode): ProjectNode[] {
  return Array.isArray(node.children) ? node.children : [];
}

function findMockTopic(topicID: string): ProjectNode | undefined {
  for (const parent of mockProjectTree) {
    const found = nodeChildren(parent).find((child) => child.topicId === topicID);
    if (found) return found;
  }
  return undefined;
}

function deleteMockTopic(topicID: string) {
  mockProjectTree = mockProjectTree.map((parent) => ({
    ...parent,
    children: nodeChildren(parent).filter((child) => child.topicId !== topicID),
  }));
}

function topicLabel(topicID: string, fallback: string): string {
  return findMockTopic(topicID)?.label ?? fallback;
}

function mockTabs(): TabMeta[] {
  return mockTabsState.map((tab) => ({ ...tab, active: tab.id === mockActiveTabId }));
}

const mockListeners = new Set<(event: WireEvent) => void>();
const mockUpdateListeners = new Set<(progress: UpdateProgress) => void>();

function emitMock(event: WireEvent) {
  for (const listener of mockListeners) listener(event);
}

function emitMockUpdate(progress: UpdateProgress) {
  for (const listener of mockUpdateListeners) listener(progress);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const mockCommands: CommandInfo[] = [
  { name: "plan", description: "Draft a read-only plan before editing.", kind: "builtin" },
  { name: "goal", description: "Start or continue a long-running goal.", kind: "builtin" },
  { name: "model", description: "Switch model for the active session.", kind: "builtin" },
  { name: "mcp", description: "Inspect MCP servers and tools.", kind: "mcp" },
  { name: "skill", description: "List or run installed skills.", kind: "skill" },
];

const mockFiles: DirEntry[] = [
  { name: "desktop/", isDir: true },
  { name: "desktop/frontend-svelte/", isDir: true },
  { name: "desktop/frontend-svelte/src/App.svelte", isDir: false },
  { name: "desktop/frontend-svelte/src/lib/bridge.ts", isDir: false },
  { name: "docs/WORKBENCH.zh-CN.md", isDir: false },
];

let mockCapabilities: CapabilitiesView = {
  servers: [
    {
      name: "filesystem",
      transport: "stdio",
      status: "connected",
      configured: true,
      autoStart: true,
      tier: "background",
      command: "voltui-mcp-filesystem",
      args: [],
      tools: 8,
      prompts: 0,
      resources: 2,
    },
    {
      name: "browser",
      transport: "http",
      status: "disabled",
      configured: true,
      autoStart: false,
      tier: "lazy",
      url: "http://127.0.0.1:9876/mcp",
      tools: 0,
      prompts: 0,
      resources: 0,
    },
  ],
  skills: [
    { name: "svelte-code-writer", description: "Svelte 5 component authoring", scope: "global", runAs: "inline", enabled: true },
    { name: "svadmin-admin-ui", description: "svadmin resource/admin surfaces", scope: "global", runAs: "inline", enabled: true },
    { name: "typescript", description: "Strict TypeScript workflow", scope: "global", runAs: "inline", enabled: true },
  ],
  skillRoots: [],
};

let mockSettings: SettingsView = {
  defaultModel: "deepseek/deepseek-chat",
  plannerModel: "",
  autoPlan: "off",
  providerKinds: ["openai", "anthropic", "google"],
  providers: [
    {
      name: "deepseek",
      kind: "openai",
      baseUrl: "https://api.deepseek.com",
      models: ["deepseek-chat", "deepseek-reasoner"],
      default: "deepseek-chat",
      apiKeyEnv: "DEEPSEEK_API_KEY",
      keySet: true,
      balanceUrl: "",
      contextWindow: 128000,
      supportedEfforts: ["auto", "low", "medium", "high"],
      defaultEffort: "auto",
    },
    {
      name: "mimo",
      kind: "openai",
      baseUrl: "https://api.mimo.example/v1",
      models: ["mimo-pro"],
      default: "mimo-pro",
      apiKeyEnv: "MIMO_API_KEY",
      keySet: false,
      balanceUrl: "",
      contextWindow: 64000,
      supportedEfforts: ["auto", "medium", "high"],
      defaultEffort: "auto",
    },
  ],
  permissions: {
    mode: "ask",
    allow: ["read_file"],
    ask: ["bash(*)"],
    deny: ["bash(rm -rf *)"],
  },
  sandbox: {
    bash: "enforce",
    network: false,
    workspaceRoot: "",
    allowWrite: [],
  },
  desktopLanguage: "en",
  desktopTheme: "dark",
  desktopThemeStyle: "graphite",
  closeBehavior: "background",
  configPath: "~/.voltui/config.toml",
  bypass: false,
};

function cloneCapabilities(): CapabilitiesView {
  return JSON.parse(JSON.stringify(mockCapabilities)) as CapabilitiesView;
}

function cloneSettings(): SettingsView {
  return JSON.parse(JSON.stringify(mockSettings)) as SettingsView;
}

const mockApp: AppBindings = {
  async SubmitToTab(_tabID: string, input: string) {
    mockCancelled = false;
    const tabID = _tabID || mockActiveTabId;
    const lowered = input.trim().toLowerCase();
    mockHistory[tabID] = [...(mockHistory[tabID] ?? []), { role: "user", content: input }];
    emitMock({ kind: "turn_started", tabId: mockActiveTabId });
    await delay(120);
    if (mockCancelled) return;
    if (lowered.includes("approve")) {
      emitMock({
        kind: "approval_request",
        tabId: mockActiveTabId,
        approval: {
          id: "mock-approval",
          tool: "bash",
          subject: "pnpm build\n\nThis command checks the Svelte workbench production build.",
        },
      });
      return;
    }
    if (lowered.includes("ask")) {
      emitMock({
        kind: "ask_request",
        tabId: mockActiveTabId,
        ask: {
          id: "mock-ask",
          questions: [
            {
              id: "mode",
              header: "Scope",
              prompt: "Which surface should the next slice prioritize?",
              options: [
                { label: "Code dock", description: "Files, context, changed files, and checkpoints." },
                { label: "Work dashboard", description: "Tasks, goals, memory, and resource shortcuts." },
              ],
            },
          ],
        },
      });
      return;
    }
    emitMock({ kind: "reasoning", tabId: mockActiveTabId, reasoning: "Classifying activity mode, run mode, and workspace context." });
    await delay(120);
    if (mockCancelled) return;
    const response = [
      `Mock response for: ${input}`,
      "",
      "```ts",
      "const next = \"wire real Wails events\";",
      "```",
      "",
      "$$",
      "total = prompt + completion",
      "$$",
      "",
      "Inline KaTeX smoke: \\(E = mc^2\\).",
    ].join("\n");
    emitMock({ kind: "text", tabId: mockActiveTabId, text: response });
    emitMock({
      kind: "tool_dispatch",
      tabId: mockActiveTabId,
      tool: {
        id: "mock-tool",
        name: "workspace_overview",
        args: JSON.stringify({ activity: mockActiveTabId === "mock-code" ? "code" : "work" }),
        readOnly: true,
      },
    });
    await delay(120);
    if (mockCancelled) return;
    emitMock({ kind: "tool_result", tabId: mockActiveTabId, tool: { id: "mock-tool", name: "workspace_overview", output: "ready", readOnly: true } });
    emitMock({ kind: "usage", tabId: mockActiveTabId, usage: { promptTokens: 1200, completionTokens: 320, totalTokens: 1520 } });
    mockHistory[tabID] = [...(mockHistory[tabID] ?? []), { role: "assistant", content: response, reasoning: "Classifying activity mode, run mode, and workspace context." }];
    emitMock({ kind: "turn_done", tabId: mockActiveTabId });
  },
  async SubmitDisplayToTab(tabID, _display, input) {
    await this.SubmitToTab(tabID, input);
  },
  async CancelTab(_tabID: string) {
    mockCancelled = true;
    emitMock({ kind: "notice", level: "warn", tabId: mockActiveTabId, text: "Turn cancelled." });
    emitMock({ kind: "turn_done", tabId: mockActiveTabId });
  },
  async ListTabs() {
    return mockTabs();
  },
  async SetActiveTab(tabID: string) {
    mockActiveTabId = tabID;
  },
  async OpenGlobalTab(topicID: string) {
    const existing = mockTabsState.find((tab) => tab.scope === "global" && tab.topicId === topicID);
    if (existing) {
      mockActiveTabId = existing.id;
      return { ...existing, active: true };
    }
    const id = `mock-global-${Date.now()}`;
    const tab: TabMeta = {
      id,
      scope: "global",
      workspaceRoot: "",
      workspaceName: "Global",
      topicId: topicID,
      topicTitle: topicLabel(topicID, "New session"),
      projectColor: findMockTopic(topicID)?.projectColor,
      label: mockSelectedModel,
      active: true,
      running: false,
      mode: "normal",
      ready: true,
      cwd: "~/projects/voltui",
    };
    mockTabsState = [...mockTabsState.map((item) => ({ ...item, active: false })), tab];
    mockActiveTabId = id;
    mockHistory[id] = [];
    mockGoals[id] = { objective: "", status: "idle" };
    return { ...tab };
  },
  async OpenProjectTab(workspaceRoot: string, topicID: string) {
    const existing = mockTabsState.find((tab) => tab.scope === "project" && tab.workspaceRoot === workspaceRoot && tab.topicId === topicID);
    if (existing) {
      mockActiveTabId = existing.id;
      return { ...existing, active: true };
    }
    const topic = findMockTopic(topicID);
    const id = `mock-project-${Date.now()}`;
    const workspaceName = workspaceRoot.split("/").filter(Boolean).pop() ?? workspaceRoot;
    const tab: TabMeta = {
      id,
      scope: "project",
      workspaceRoot,
      workspaceName,
      topicId: topicID,
      topicTitle: topic?.label ?? "New session",
      projectColor: topic?.projectColor,
      label: mockSelectedModel,
      active: true,
      running: false,
      mode: "normal",
      ready: true,
      cwd: workspaceRoot,
    };
    mockTabsState = [...mockTabsState.map((item) => ({ ...item, active: false })), tab];
    mockActiveTabId = id;
    mockHistory[id] = [];
    mockGoals[id] = { objective: "", status: "idle" };
    return { ...tab };
  },
  async ReorderTabs(tabIDs: string[]) {
    const byID = new Map(mockTabsState.map((tab) => [tab.id, tab]));
    const ordered = tabIDs.map((id) => byID.get(id)).filter((tab): tab is TabMeta => Boolean(tab));
    if (ordered.length === mockTabsState.length) mockTabsState = ordered;
  },
  async CloseTab(tabID: string) {
    if (mockTabsState.length <= 1) return;
    mockTabsState = mockTabsState.filter((tab) => tab.id !== tabID);
    mockActiveTabId = mockTabsState[0]?.id ?? "mock-global";
  },
  async ListProjectTree() {
    return cloneProjectTree();
  },
  async RenameProject(workspaceRoot: string, title: string) {
    const node = workspaceRoot
      ? mockProjectTree.find((item) => item.root === workspaceRoot)
      : mockProjectTree.find((item) => item.kind === "global_folder");
    if (!node) return;
    const fallback = node.kind === "global_folder" ? "Global" : (node.root?.split("/").filter(Boolean).pop() ?? node.label);
    node.label = title.trim() || fallback;
  },
  async SetProjectColor(workspaceRoot: string, color: string) {
    const node = workspaceRoot
      ? mockProjectTree.find((item) => item.root === workspaceRoot)
      : mockProjectTree.find((item) => item.kind === "global_folder");
    if (!node) return;
    node.projectColor = color || undefined;
    node.children = nodeChildren(node).map((child) => ({ ...child, projectColor: node.projectColor }));
    mockTabsState = mockTabsState.map((tab) =>
      (workspaceRoot ? tab.workspaceRoot === workspaceRoot : tab.scope === "global")
        ? { ...tab, projectColor: node.projectColor }
        : tab,
    );
  },
  async ReorderProjects(workspaceRoots: string[]) {
    const globals = mockProjectTree.filter((node) => node.kind !== "project");
    const projects = mockProjectTree.filter((node) => node.kind === "project");
    const byRoot = new Map(projects.map((node) => [node.root, node]));
    const ordered = workspaceRoots.map((root) => byRoot.get(root)).filter((node): node is ProjectNode => Boolean(node));
    if (ordered.length === projects.length) mockProjectTree = [...globals, ...ordered];
  },
  async CreateTopic(scope: string, workspaceRoot: string, title: string) {
    const topicID = `topic-${Date.now()}`;
    const topicTitle = title.trim() || "New session";
    const parent = scope === "global"
      ? mockProjectTree.find((node) => node.kind === "global_folder")
      : mockProjectTree.find((node) => node.root === workspaceRoot);
    if (parent) {
      parent.children = [
        {
          key: parent.kind === "global_folder" ? `global_topic_${topicID}` : `topic_${topicID}`,
          kind: parent.kind === "global_folder" ? "global_topic" : "topic",
          label: topicTitle,
          root: parent.kind === "global_folder" ? undefined : parent.root,
          topicId: topicID,
          projectColor: parent.projectColor,
          turns: 0,
          lastActivityAt: Date.now(),
        },
        ...nodeChildren(parent),
      ];
    }
    return {
      id: topicID,
      title: topicTitle,
      createdAt: Date.now(),
    };
  },
  async RenameTopic(topicID: string, title: string) {
    const topic = findMockTopic(topicID);
    const nextTitle = title.trim();
    if (!topic || !nextTitle) return;
    topic.label = nextTitle;
    mockTabsState = mockTabsState.map((tab) => (tab.topicId === topicID ? { ...tab, topicTitle: nextTitle } : tab));
  },
  async DeleteTopic(topicID: string) {
    deleteMockTopic(topicID);
  },
  async TrashTopic(topicID: string) {
    deleteMockTopic(topicID);
    mockTabsState = mockTabsState.filter((tab) => tab.topicId !== topicID);
    mockActiveTabId = mockTabsState.find((tab) => tab.active)?.id ?? mockTabsState[0]?.id ?? "mock-global";
  },
  async HistoryForTab(tabID: string) {
    return mockHistory[tabID] ?? [];
  },
  async CheckpointsForTab(_tabID: string) {
    return [
      {
        turn: 0,
        prompt: "Plan the Svelte workbench migration.",
        files: ["docs/WORKBENCH.zh-CN.md", "desktop/frontend-svelte/src/App.svelte"],
        time: Date.now() - 180000,
        canCode: true,
        canConversation: true,
      },
      {
        turn: 1,
        prompt: "Inspect the Svelte workbench shell.",
        files: ["desktop/frontend-svelte/src/components/CodeDashboard.svelte"],
        time: Date.now() - 90000,
        canCode: true,
        canConversation: false,
      },
    ];
  },
  async Rewind(turn: number, scope: string) {
    emitMock({ kind: "notice", tabId: mockActiveTabId, text: `Rewind requested for turn ${turn} (${scope}).` });
  },
  async ModelsForTab(_tabID: string) {
    return mockSettings.providers.flatMap((provider) =>
      provider.models.map((model) => {
        const ref = `${provider.name}/${model}`;
        return {
          ref,
          provider: provider.name,
          model,
          name: ref,
          label: ref,
          current: mockSelectedModel === ref || mockSettings.defaultModel === ref,
        };
      }),
    );
  },
  async SetModelForTab(_tabID: string, name: string) {
    mockSelectedModel = name;
  },
  async EffortForTab(_tabID: string) {
    return { current: mockEffort, supported: ["auto", "low", "medium", "high"] };
  },
  async SetEffortForTab(_tabID: string, level: string) {
    mockEffort = level;
  },
  async SetModeForTab(tabID: string, mode: string) {
    mockTabsState = mockTabsState.map((tab) => (tab.id === tabID ? { ...tab, mode: mode === "plan" || mode === "yolo" ? mode : "normal" } : tab));
  },
  async GoalForTab(tabID: string) {
    return mockGoals[tabID] ?? { objective: "", status: "idle" };
  },
  async StartGoalForTab(tabID: string, objective: string) {
    mockGoals[tabID] = { objective, status: "active" };
    mockHistory[tabID] = [...(mockHistory[tabID] ?? []), { role: "user", content: `/goal ${objective}` }];
    emitMock({ kind: "notice", tabId: tabID || mockActiveTabId, text: `goal started: ${objective}` });
  },
  async ContinueGoalForTab(tabID: string) {
    const current = mockGoals[tabID] ?? { objective: "", status: "idle" };
    if (!current.objective) {
      emitMock({ kind: "notice", tabId: tabID || mockActiveTabId, text: "no active goal" });
      return;
    }
    mockGoals[tabID] = { ...current, status: current.status === "blocked" ? "active" : "complete", blockedReason: undefined };
    emitMock({ kind: "notice", tabId: tabID || mockActiveTabId, text: `goal ${mockGoals[tabID].status}` });
  },
  async ClearGoalForTab(tabID: string) {
    mockGoals[tabID] = { objective: "", status: "idle" };
    emitMock({ kind: "notice", tabId: tabID || mockActiveTabId, text: "goal cleared" });
  },
  async ApproveTab(_tabID: string, id: string, allow: boolean) {
    emitMock({ kind: "notice", tabId: mockActiveTabId, text: `${allow ? "Approved" : "Denied"} ${id}.` });
    emitMock({ kind: "turn_done", tabId: mockActiveTabId });
  },
  async AnswerQuestionForTab(_tabID: string, id: string, answers: QuestionAnswer[]) {
    const selected = answers.flatMap((answer) => answer.selected).join(", ") || "No answer";
    emitMock({ kind: "text", tabId: mockActiveTabId, text: `Answer received for ${id}: ${selected}` });
    emitMock({ kind: "turn_done", tabId: mockActiveTabId });
  },
  async Commands() {
    return mockCommands;
  },
  async SlashArgs(input: string) {
    const parts = input.split(/\s+/);
    const token = parts[parts.length - 1]?.toLowerCase() ?? "";
    const command = input.split(/\s+/)[0]?.replace("/", "") || "command";
    const items = ["list", "show", "add", "remove", "refresh"]
      .filter((label) => label.includes(token))
      .map((label) => ({ label, insert: label, hint: `/${command} ${label}`, descend: label === "show" || label === "remove" }));
    return { items, from: input.lastIndexOf(token) };
  },
  async ListDir(rel: string) {
    if (!rel) return mockFiles;
    return mockFiles.filter((file) => file.name.startsWith(rel));
  },
  async SearchFileRefs(query: string) {
    const q = query.toLowerCase();
    return mockFiles.filter((file) => file.name.toLowerCase().includes(q));
  },
  async ReadFile(rel: string) {
    return {
      path: rel,
      body: `// Preview for ${rel}\nexport const workbench = "svelte + svadmin";\nexport const mode = "code";\n`,
      size: 68,
      truncated: false,
      binary: false,
    };
  },
  async WorkspaceChanges() {
    return {
      files: [
        {
          path: "desktop/frontend-svelte/src/App.svelte",
          sources: ["mock"],
          gitStatus: "M",
          turns: [1],
          latestPrompt: "Hydrate Svelte history and checkpoint state.",
        },
        {
          path: "docs/WORKBENCH_FEATURE_MATRIX.md",
          sources: ["mock"],
          gitStatus: "M",
          turns: [1],
          latestPrompt: "Track Markdown and diff viewer parity.",
        },
      ],
      gitAvailable: true,
    };
  },
  async WorkspaceDiff(rel: string) {
    return {
      path: rel,
      status: "M",
      kind: "modify",
      diff: [
        `--- a/${rel}`,
        `+++ b/${rel}`,
        "@@ -1,4 +1,5 @@",
        " import App from './App.svelte';",
        "-const mode = 'react';",
        "+const mode = 'svelte';",
        "+const workbench = 'svadmin';",
        " export default App;",
      ].join("\n"),
      added: 2,
      removed: 1,
      binary: false,
      truncated: false,
    };
  },
  async SavePastedImage(_dataUrl: string) {
    return ".voltui/attachments/mock-image.png";
  },
  async SavePastedFile(name: string, _dataUrl: string) {
    return `.voltui/attachments/mock-${name.replace(/\s+/g, "-")}`;
  },
  async AttachDropped(path: string) {
    const name = path.split(/[/\\]/).filter(Boolean).pop() ?? path;
    return {
      kind: "attachment",
      path: `.voltui/attachments/mock-${name}`,
      previewUrl: name.match(/\.(png|jpe?g|gif|webp)$/i) ? "data:image/png;base64,iVBORw0KGgo=" : undefined,
    };
  },
  async AttachmentDataURL(_path: string) {
    return "data:image/png;base64,iVBORw0KGgo=";
  },
  async ContextPanel(_tabID: string) {
    return {
      usedTokens: 18400,
      windowTokens: 128000,
      promptTokens: 16000,
      completionTokens: 2400,
      reasoningTokens: 900,
      cacheHitTokens: 7200,
      cacheMissTokens: 8800,
      readFiles: [
        { path: "docs/WORKBENCH.zh-CN.md", turn: 1, time: Date.now() - 120000 },
        { path: "desktop/frontend-svelte/src/lib/bridge.ts", turn: 1, time: Date.now() - 60000 },
      ],
      changedFiles: (await this.WorkspaceChanges()).files,
    };
  },
  async Capabilities() {
    return cloneCapabilities();
  },
  async AddMCPServer(input: MCPServerInput) {
    const tools = input.transport === "stdio" ? 3 : 5;
    mockCapabilities.servers = [
      ...mockCapabilities.servers.filter((server) => server.name !== input.name),
      {
        name: input.name,
        transport: input.transport,
        status: "connected",
        configured: true,
        autoStart: true,
        tier: input.tier || "lazy",
        command: input.command,
        args: input.args,
        url: input.url,
        envKeys: input.env ? Object.keys(input.env).sort() : [],
        tools,
        prompts: 0,
        resources: 0,
      },
    ];
    return tools;
  },
  async UpdateMCPServer(name: string, input: MCPServerInput) {
    mockCapabilities.servers = mockCapabilities.servers.map((server) =>
      server.name === name
        ? {
            ...server,
            transport: input.transport,
            tier: input.tier || server.tier,
            command: input.transport === "stdio" ? input.command : "",
            args: input.transport === "stdio" ? input.args : [],
            url: input.transport === "stdio" ? "" : input.url,
            envKeys: input.env ? Object.keys(input.env).sort() : server.envKeys,
            status: server.status === "disabled" ? "disabled" : "connected",
            tools: server.status === "disabled" ? 0 : server.tools || (input.transport === "stdio" ? 3 : 5),
          }
        : server,
    );
  },
  async RemoveMCPServer(name: string) {
    mockCapabilities.servers = mockCapabilities.servers.filter((server) => server.name !== name);
  },
  async RetryMCPServer(name: string) {
    mockCapabilities.servers = mockCapabilities.servers.map((server) =>
      server.name === name ? { ...server, status: "connected", tools: server.tools || 4, error: undefined } : server,
    );
  },
  async SetMCPServerEnabled(name: string, enabled: boolean) {
    mockCapabilities.servers = mockCapabilities.servers.map((server) =>
      server.name === name
        ? { ...server, status: enabled ? "connected" : "disabled", tools: enabled ? server.tools || 4 : 0, error: undefined }
        : server,
    );
  },
  async RefreshSkills() {
    emitMock({ kind: "notice", tabId: mockActiveTabId, text: "skills refreshed" });
  },
  async SetSkillEnabled(name: string, enabled: boolean) {
    mockCapabilities.skills = mockCapabilities.skills.map((skill) => (skill.name === name ? { ...skill, enabled } : skill));
  },
  async Settings() {
    return cloneSettings();
  },
  async SetCloseBehavior(mode: string) {
    mockSettings.closeBehavior = mode === "quit" ? "quit" : "background";
  },
  async SetDesktopLanguage(lang: string) {
    mockSettings.desktopLanguage = lang === "zh" ? "zh" : "en";
  },
  async SetDesktopAppearance(theme: string, style: string) {
    mockSettings.desktopTheme = theme === "light" || theme === "system" ? theme : "dark";
    mockSettings.desktopThemeStyle = style || "graphite";
  },
  async SetDefaultModel(ref: string) {
    mockSettings.defaultModel = ref;
    mockSelectedModel = ref;
  },
  async SetPlannerModel(ref: string) {
    mockSettings.plannerModel = ref;
  },
  async SaveProvider(provider: ProviderView) {
    const next = { ...provider, keySet: Boolean(provider.keySet) };
    const index = mockSettings.providers.findIndex((item) => item.name === next.name);
    if (index >= 0) {
      mockSettings.providers[index] = next;
    } else {
      mockSettings.providers = [...mockSettings.providers, next];
    }
  },
  async DeleteProvider(name: string) {
    mockSettings.providers = mockSettings.providers.filter((provider) => provider.name !== name);
  },
  async SetProviderKey(apiKeyEnv: string, value: string) {
    mockSettings.providers = mockSettings.providers.map((provider) => (provider.apiKeyEnv === apiKeyEnv ? { ...provider, keySet: value.trim() !== "" } : provider));
  },
  async SetPermissionMode(mode: string) {
    mockSettings.permissions.mode = mode;
  },
  async AddPermissionRule(list: string, rule: string) {
    const key = list === "allow" || list === "ask" || list === "deny" ? list : "ask";
    if (rule.trim() && !mockSettings.permissions[key].includes(rule.trim())) mockSettings.permissions[key] = [...mockSettings.permissions[key], rule.trim()];
  },
  async RemovePermissionRule(list: string, rule: string) {
    const key = list === "allow" || list === "ask" || list === "deny" ? list : "ask";
    mockSettings.permissions[key] = mockSettings.permissions[key].filter((item) => item !== rule);
  },
  async SetSandbox(bash: string, network: boolean, workspaceRoot: string, allowWrite: string[]) {
    mockSettings.sandbox = { bash, network, workspaceRoot, allowWrite };
  },
  async Version() {
    return "v1.0.0";
  },
  async CheckUpdate() {
    return {
      available: true,
      current: "v1.0.0",
      latest: "v1.1.0",
      notes: "Svelte workbench update smoke.",
      canSelfUpdate: true,
      downloadUrl: "https://example.com/voltui/releases/latest",
      assetSize: 12000000,
    };
  },
  async ApplyUpdate() {
    const total = 12000000;
    emitMockUpdate({ phase: "downloading", received: 3000000, total });
    await delay(120);
    emitMockUpdate({ phase: "downloading", received: total, total });
    await delay(120);
    emitMockUpdate({ phase: "verifying", received: total, total });
    await delay(120);
    emitMockUpdate({ phase: "applying", received: total, total });
    await delay(120);
    emitMockUpdate({ phase: "done", received: total, total });
  },
  async OpenDownloadPage() {
    emitMock({ kind: "notice", tabId: mockActiveTabId, text: "Opened update download page." });
  },
  async Memory() {
    return { entries: [{ name: "workbench-roadmap", note: "Keep Work and Code modes orthogonal." }] };
  },
};

export function app(): AppBindings {
  return realApp() ?? mockApp;
}

export function onAgentEvent(cb: (event: WireEvent) => void): () => void {
  if (typeof window !== "undefined" && window.runtime) {
    return window.runtime.EventsOn(EVENT_CHANNEL, (payload) => cb(payload as WireEvent));
  }
  mockListeners.add(cb);
  return () => mockListeners.delete(cb);
}

export function onUpdaterProgress(cb: (progress: UpdateProgress) => void): () => void {
  if (typeof window !== "undefined" && window.runtime) {
    return window.runtime.EventsOn("updater:progress", (payload) => cb(payload as UpdateProgress));
  }
  mockUpdateListeners.add(cb);
  return () => mockUpdateListeners.delete(cb);
}

export function onProjectTreeChanged(cb: () => void): () => void {
  if (typeof window !== "undefined" && window.runtime) {
    return window.runtime.EventsOn(PROJECT_TREE_CHANNEL, () => cb());
  }
  return () => {};
}

export function onFilesDropped(cb: (paths: string[]) => void): () => void {
  const runtime = typeof window !== "undefined" ? window.runtime : undefined;
  if (!runtime?.OnFileDrop) return () => {};
  runtime.OnFileDrop((_x, _y, paths) => {
    if (Array.isArray(paths) && paths.length > 0) cb(paths);
  }, true);
  return () => runtime.OnFileDropOff?.();
}
