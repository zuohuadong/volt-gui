import type {
  CommandInfo,
  ContextPanelInfo,
  DirEntry,
  DroppedItem,
  EffortInfo,
  FilePreview,
  GoalInfo,
  CheckpointMeta,
  HistoryMessage,
  ModelInfo,
  QuestionAnswer,
  TabMeta,
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
  CloseTab(tabID: string): Promise<void>;
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
  SlashArgs(input: string): Promise<{ items: Array<{ label: string; insert: string; description?: string }>; from: number }>;
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
  Capabilities(): Promise<unknown>;
  Settings(): Promise<unknown>;
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

function mockTabs(): TabMeta[] {
  return mockTabsState.map((tab) => ({ ...tab, active: tab.id === mockActiveTabId }));
}

const mockListeners = new Set<(event: WireEvent) => void>();

function emitMock(event: WireEvent) {
  for (const listener of mockListeners) listener(event);
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
  async OpenGlobalTab(_topicID: string) {
    return mockTabs()[0];
  },
  async CloseTab(tabID: string) {
    mockTabsState = mockTabsState.filter((tab) => tab.id !== tabID);
    mockActiveTabId = mockTabsState[0]?.id ?? "mock-global";
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
    return [
      { name: "deepseek-flash", label: "DeepSeek Flash", current: mockSelectedModel === "deepseek-flash" },
      { name: "mimo-pro", label: "MiMo Pro", current: mockSelectedModel === "mimo-pro" },
    ];
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
    const items = ["list", "show", "add", "remove", "refresh"]
      .filter((label) => label.includes(token))
      .map((label) => ({ label, insert: label, description: `/${input.split(/\s+/)[0]?.replace("/", "")} ${label}` }));
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
    return {
      skills: [
        { name: "svelte-code-writer", enabled: true },
        { name: "svadmin-admin-ui", enabled: true },
      ],
      servers: [{ name: "filesystem", status: "connected" }],
    };
  },
  async Settings() {
    return {
      providers: [{ name: "deepseek-flash" }, { name: "mimo-pro" }],
      permissions: { mode: "ask", allow: ["read_file"], deny: ["bash(rm *)"] },
    };
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

export function onFilesDropped(cb: (paths: string[]) => void): () => void {
  const runtime = typeof window !== "undefined" ? window.runtime : undefined;
  if (!runtime?.OnFileDrop) return () => {};
  runtime.OnFileDrop((_x, _y, paths) => {
    if (Array.isArray(paths) && paths.length > 0) cb(paths);
  }, true);
  return () => runtime.OnFileDropOff?.();
}
