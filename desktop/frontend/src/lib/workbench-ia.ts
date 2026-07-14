import type { TabMeta, TranscriptItem } from "./types";

export const INBOX_PROJECT_ID = "inbox";
export const WORKBENCH_STATE_STORAGE_KEY = "voltui.workbench.ia.v2";
export const LEGACY_SIDEBAR_STORAGE_KEY = "volt-gui.sidebar-state.v1";

export type TaskOutcomeTemplateID =
  | "review-fix"
  | "build-diagnosis"
  | "knowledge-change"
  | "issue-delivery"
  | "release-acceptance";

export type ReceiptSectionID =
  | "goal"
  | "runtime"
  | "changes"
  | "verification"
  | "artifacts"
  | "dataPath"
  | "rollback";

export interface WorkspaceOption {
  id: string;
  name: string;
  root: string;
  source: "tab" | "folder";
  tabId?: string;
  active?: boolean;
}

export interface TaskReceiptSection {
  status: "pending" | "ready" | "failed";
  items: string[];
  note: string;
}

export interface TaskResultReceipt {
  id: string;
  taskId: string;
  templateId: TaskOutcomeTemplateID;
  state: "running" | "pending-review" | "failed";
  createdAt: string;
  updatedAt: string;
  sections: Record<ReceiptSectionID, TaskReceiptSection>;
}

export interface TaskThread {
  id: string;
  title: string;
  updatedAt: string;
  updatedAtMs?: number;
  archivedAtMs?: number;
  transcript?: TranscriptItem[];
  tabId?: string;
  topicId?: string;
  sessionPath?: string;
  scope?: TabMeta["scope"];
  workspaceRoot?: string;
  templateId?: TaskOutcomeTemplateID;
  receipt?: TaskResultReceipt;
}

export interface PersistedProjectTasks {
  projectId: string;
  expanded: boolean;
  updatedAtMs: number;
  tasks: TaskThread[];
}

export interface ProjectTaskNode {
  id: string;
  name: string;
  kind: "inbox" | "project";
  expanded: boolean;
  updatedAtMs: number;
  tasks: TaskThread[];
}

export interface WorkbenchSnapshotV2 {
  version: 2;
  savedWorkspaces: WorkspaceOption[];
  projectTasks: PersistedProjectTasks[];
  inboxTasks: TaskThread[];
  activeWorkspaceId: string;
  activeProjectId: string;
  activeTaskId: string;
  projectSort: "recent" | "name" | "tasks";
  projectDockCollapsed: boolean;
}

export interface OutcomeTemplate {
  id: TaskOutcomeTemplateID;
  title: string;
  summary: string;
  prompt: string;
  receiptSections: ReceiptSectionID[];
}

const RECEIPT_SECTIONS: ReceiptSectionID[] = [
  "goal",
  "runtime",
  "changes",
  "verification",
  "artifacts",
  "dataPath",
  "rollback",
];

export const OUTCOME_TEMPLATES: OutcomeTemplate[] = [
  {
    id: "review-fix",
    title: "审查并修复",
    summary: "输出问题清单、实际变更与测试证据。",
    prompt: "请审查当前真实项目变更，先列出可复现的问题与风险，再完成必要修复，并给出 diff、测试命令、结果和剩余风险。",
    receiptSections: RECEIPT_SECTIONS,
  },
  {
    id: "build-diagnosis",
    title: "构建失败诊断",
    summary: "定位根因、实施修复并重跑失败门禁。",
    prompt: "请复现当前构建或测试失败，基于日志和源码定位根因，完成最小修复，并重跑原失败命令与相关回归检查。",
    receiptSections: RECEIPT_SECTIONS,
  },
  {
    id: "knowledge-change",
    title: "内部资料驱动变更",
    summary: "引用资料来源，记录改动、权限与验证。",
    prompt: "请基于当前项目资料和明确引用来源完成变更，记录使用了哪些资料、修改了什么、数据与文件经过哪里，以及如何验证和回滚。",
    receiptSections: RECEIPT_SECTIONS,
  },
  {
    id: "issue-delivery",
    title: "Issue 到可验证交付",
    summary: "从范围澄清到实现、验收与交付说明。",
    prompt: "请把当前 Issue 转为可验证交付：确认目标和非目标，完成实现与测试，整理验收标准、产物、限制和后续动作。",
    receiptSections: RECEIPT_SECTIONS,
  },
  {
    id: "release-acceptance",
    title: "发布验收",
    summary: "检查产物、门禁、数据路径和回滚方案。",
    prompt: "请执行发布前验收，检查构建产物、自动化门禁、配置和数据路径，明确通过项、待确认项、阻断项以及可执行回滚方案。",
    receiptSections: RECEIPT_SECTIONS,
  },
];

type ProjectIdentity = { id: string; name: string };
type WorkspaceTabIdentity = Pick<TabMeta, "id" | "workspaceRoot" | "workspaceName" | "cwd" | "active">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanTimestamp(value: unknown, fallback = Date.now()): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sanitizeReceiptSection(value: unknown): TaskReceiptSection {
  if (!isRecord(value)) return { status: "pending", items: [], note: "等待执行证据" };
  const status = value.status === "ready" || value.status === "failed" ? value.status : "pending";
  const items = Array.isArray(value.items) ? value.items.filter((item): item is string => typeof item === "string" && item.trim() !== "") : [];
  return { status, items, note: cleanString(value.note) || "等待执行证据" };
}

function sanitizeReceipt(value: unknown): TaskResultReceipt | undefined {
  if (!isRecord(value)) return undefined;
  const id = cleanString(value.id);
  const taskId = cleanString(value.taskId);
  const templateId = OUTCOME_TEMPLATES.some((template) => template.id === value.templateId)
    ? value.templateId as TaskOutcomeTemplateID
    : undefined;
  if (!id || !taskId || !templateId) return undefined;
  const rawSections = isRecord(value.sections) ? value.sections : {};
  return {
    id,
    taskId,
    templateId,
    state: value.state === "failed" || value.state === "pending-review" ? value.state : "running",
    createdAt: cleanString(value.createdAt),
    updatedAt: cleanString(value.updatedAt),
    sections: Object.fromEntries(RECEIPT_SECTIONS.map((section) => [section, sanitizeReceiptSection(rawSections[section])])) as Record<ReceiptSectionID, TaskReceiptSection>,
  };
}

export function sanitizeTaskThread(value: unknown): TaskThread | undefined {
  if (!isRecord(value)) return undefined;
  const id = cleanString(value.id);
  const title = cleanString(value.title);
  if (!id || !title) return undefined;
  const templateId = OUTCOME_TEMPLATES.some((template) => template.id === value.templateId)
    ? value.templateId as TaskOutcomeTemplateID
    : undefined;
  return {
    id,
    title,
    updatedAt: cleanString(value.updatedAt) || "刚刚",
    updatedAtMs: typeof value.updatedAtMs === "number" ? value.updatedAtMs : undefined,
    archivedAtMs: typeof value.archivedAtMs === "number" ? value.archivedAtMs : undefined,
    transcript: Array.isArray(value.transcript) ? value.transcript as TranscriptItem[] : undefined,
    tabId: cleanString(value.tabId) || undefined,
    topicId: cleanString(value.topicId) || undefined,
    sessionPath: cleanString(value.sessionPath) || undefined,
    scope: value.scope === "project" || value.scope === "global" ? value.scope : undefined,
    workspaceRoot: cleanString(value.workspaceRoot) || undefined,
    templateId,
    receipt: sanitizeReceipt(value.receipt),
  };
}

function uniqueTasks(tasks: TaskThread[]): TaskThread[] {
  const seen = new Set<string>();
  return tasks.filter((task) => {
    if (seen.has(task.id)) return false;
    seen.add(task.id);
    return true;
  });
}

function sanitizeWorkspace(value: unknown): WorkspaceOption | undefined {
  if (!isRecord(value)) return undefined;
  const root = cleanString(value.root);
  if (!root) return undefined;
  return {
    id: cleanString(value.id) || `folder:${root}`,
    name: cleanString(value.name) || root.split(/[\\/]/).filter(Boolean).pop() || root,
    root,
    source: value.source === "tab" ? "tab" : "folder",
    tabId: cleanString(value.tabId) || undefined,
    active: value.active === true || undefined,
  };
}

export function emptyWorkbenchSnapshot(): WorkbenchSnapshotV2 {
  return {
    version: 2,
    savedWorkspaces: [],
    projectTasks: [],
    inboxTasks: [],
    activeWorkspaceId: "",
    activeProjectId: INBOX_PROJECT_ID,
    activeTaskId: "",
    projectSort: "recent",
    projectDockCollapsed: false,
  };
}

export function migrateWorkbenchSnapshot(value: unknown): WorkbenchSnapshotV2 {
  if (!isRecord(value)) return emptyWorkbenchSnapshot();
  if (value.version === 2) {
    const savedWorkspaces = Array.isArray(value.savedWorkspaces)
      ? value.savedWorkspaces.map(sanitizeWorkspace).filter((workspace): workspace is WorkspaceOption => Boolean(workspace && workspace.source === "folder"))
      : [];
    const projectTasks = Array.isArray(value.projectTasks)
      ? value.projectTasks.flatMap((item) => {
          if (!isRecord(item)) return [];
          const projectId = cleanString(item.projectId);
          if (!projectId || projectId === INBOX_PROJECT_ID) return [];
          const tasks = Array.isArray(item.tasks) ? item.tasks.map(sanitizeTaskThread).filter((task): task is TaskThread => Boolean(task)) : [];
          return [{ projectId, expanded: item.expanded !== false, updatedAtMs: cleanTimestamp(item.updatedAtMs), tasks }];
        })
      : [];
    const inboxTasks = Array.isArray(value.inboxTasks) ? value.inboxTasks.map(sanitizeTaskThread).filter((task): task is TaskThread => Boolean(task)) : [];
    return {
      version: 2,
      savedWorkspaces,
      projectTasks,
      inboxTasks,
      activeWorkspaceId: cleanString(value.activeWorkspaceId),
      activeProjectId: cleanString(value.activeProjectId) || INBOX_PROJECT_ID,
      activeTaskId: cleanString(value.activeTaskId),
      projectSort: value.projectSort === "name" || value.projectSort === "tasks" ? value.projectSort : "recent",
      projectDockCollapsed: value.projectDockCollapsed === true,
    };
  }
  if (value.version !== 1 || !Array.isArray(value.projects)) return emptyWorkbenchSnapshot();

  const savedWorkspaces: WorkspaceOption[] = [];
  const projectTasks: PersistedProjectTasks[] = [];
  const inboxTasks: TaskThread[] = [];
  let activeProjectId = cleanString(value.activeProjectId) || INBOX_PROJECT_ID;
  for (const rawProject of value.projects) {
    if (!isRecord(rawProject)) continue;
    const projectId = cleanString(rawProject.id);
    if (!projectId) continue;
    const tasks = Array.isArray(rawProject.conversations)
      ? rawProject.conversations.map(sanitizeTaskThread).filter((task): task is TaskThread => Boolean(task))
      : [];
    const localPath = cleanString(rawProject.localPath);
    if (localPath) {
      savedWorkspaces.push({ id: `folder:${localPath}`, name: cleanString(rawProject.name) || localPath, root: localPath, source: "folder" });
      inboxTasks.push(...tasks);
      if (activeProjectId === projectId) activeProjectId = INBOX_PROJECT_ID;
      continue;
    }
    projectTasks.push({
      projectId,
      expanded: rawProject.expanded !== false,
      updatedAtMs: cleanTimestamp(rawProject.updatedAtMs),
      tasks,
    });
  }
  return {
    version: 2,
    savedWorkspaces,
    projectTasks,
    inboxTasks: uniqueTasks(inboxTasks),
    activeWorkspaceId: "",
    activeProjectId,
    activeTaskId: cleanString(value.activeConversationId),
    projectSort: value.sort === "name" ? "name" : value.sort === "conversations" ? "tasks" : "recent",
    projectDockCollapsed: value.dockCollapsed === true,
  };
}

export function deriveWorkspaceOptions(
  tabs: WorkspaceTabIdentity[],
  savedWorkspaces: WorkspaceOption[],
): WorkspaceOption[] {
  const roots = new Set<string>();
  const output: WorkspaceOption[] = [];
  const orderedTabs = [...tabs].sort((left, right) => Number(Boolean(right.active)) - Number(Boolean(left.active)));
  for (const tab of orderedTabs) {
    const root = cleanString(tab.workspaceRoot) || cleanString(tab.cwd);
    if (!root || roots.has(root)) continue;
    roots.add(root);
    output.push({
      id: `tab:${tab.id}`,
      name: cleanString(tab.workspaceName) || root.split(/[\\/]/).filter(Boolean).pop() || root,
      root,
      source: "tab",
      tabId: tab.id,
      active: Boolean(tab.active),
    });
  }
  for (const saved of savedWorkspaces) {
    const workspace = sanitizeWorkspace(saved);
    if (!workspace || roots.has(workspace.root)) continue;
    roots.add(workspace.root);
    output.push({ ...workspace, source: "folder", tabId: undefined, active: undefined });
  }
  return output;
}

export function upsertSavedWorkspace(workspaces: WorkspaceOption[], root: string, name: string): WorkspaceOption[] {
  const trimmedRoot = root.trim();
  if (!trimmedRoot) return workspaces;
  const next: WorkspaceOption = {
    id: `folder:${trimmedRoot}`,
    name: name.trim() || trimmedRoot.split(/[\\/]/).filter(Boolean).pop() || trimmedRoot,
    root: trimmedRoot,
    source: "folder",
  };
  return [next, ...workspaces.filter((workspace) => workspace.root !== trimmedRoot)];
}

export function reconcileProjectTaskNodes(
  projects: ProjectIdentity[],
  state: Pick<WorkbenchSnapshotV2, "projectTasks" | "inboxTasks">,
): ProjectTaskNode[] {
  const projectIDs = new Set(projects.map((project) => project.id));
  const orphaned = state.projectTasks.filter((item) => !projectIDs.has(item.projectId)).flatMap((item) => item.tasks);
  const inboxTasks = uniqueTasks([...state.inboxTasks, ...orphaned]);
  const inboxUpdated = Math.max(0, ...inboxTasks.map((task) => task.updatedAtMs ?? 0));
  const nodes: ProjectTaskNode[] = [{
    id: INBOX_PROJECT_ID,
    name: "收件箱项目",
    kind: "inbox",
    expanded: true,
    updatedAtMs: inboxUpdated,
    tasks: inboxTasks,
  }];
  for (const project of projects) {
    const saved = state.projectTasks.find((item) => item.projectId === project.id);
    nodes.push({
      id: project.id,
      name: project.name,
      kind: "project",
      expanded: saved?.expanded ?? false,
      updatedAtMs: saved?.updatedAtMs ?? 0,
      tasks: saved?.tasks ?? [],
    });
  }
  return nodes;
}

function pendingSection(note: string): TaskReceiptSection {
  return { status: "pending", items: [], note };
}

export function createPendingTaskReceipt(input: {
  id: string;
  taskId: string;
  templateId: TaskOutcomeTemplateID;
  goal: string;
  runtime: string[];
  now?: string;
}): TaskResultReceipt {
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.id,
    taskId: input.taskId,
    templateId: input.templateId,
    state: "running",
    createdAt: now,
    updatedAt: now,
    sections: {
      goal: { status: "ready", items: [input.goal], note: "来自结果模板与本轮任务输入" },
      runtime: { status: "ready", items: input.runtime.filter(Boolean), note: "发送前确认的运行配置" },
      changes: pendingSection("等待实际变更"),
      verification: pendingSection("等待验证证据"),
      artifacts: pendingSection("等待生成产物"),
      dataPath: pendingSection("等待数据路径记录"),
      rollback: pendingSection("等待回滚方案"),
    },
  };
}

export function settleTaskReceipt(
  receipt: TaskResultReceipt,
  input: { now?: string; error?: string },
): TaskResultReceipt {
  const error = input.error?.trim() ?? "";
  return {
    ...receipt,
    state: error ? "failed" : "pending-review",
    updatedAt: input.now ?? new Date().toISOString(),
    sections: {
      ...receipt.sections,
      verification: error
        ? { status: "failed", items: [], note: error }
        : { status: "pending", items: [], note: "等待验证证据与人工复核" },
    },
  };
}

export function snapshotFromProjectNodes(input: {
  workspaces: WorkspaceOption[];
  projectNodes: ProjectTaskNode[];
  activeWorkspaceId: string;
  activeProjectId: string;
  activeTaskId: string;
  projectSort: WorkbenchSnapshotV2["projectSort"];
  projectDockCollapsed: boolean;
}): WorkbenchSnapshotV2 {
  const inbox = input.projectNodes.find((node) => node.id === INBOX_PROJECT_ID);
  return {
    version: 2,
    savedWorkspaces: input.workspaces.filter((workspace) => workspace.source === "folder"),
    projectTasks: input.projectNodes
      .filter((node) => node.kind === "project")
      .map((node) => ({ projectId: node.id, expanded: node.expanded, updatedAtMs: node.updatedAtMs, tasks: node.tasks })),
    inboxTasks: inbox?.tasks ?? [],
    activeWorkspaceId: input.activeWorkspaceId,
    activeProjectId: input.activeProjectId || INBOX_PROJECT_ID,
    activeTaskId: input.activeTaskId,
    projectSort: input.projectSort,
    projectDockCollapsed: input.projectDockCollapsed,
  };
}
