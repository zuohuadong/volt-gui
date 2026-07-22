import type { ProjectNode, TabMeta, TranscriptItem } from "./types";

export const INBOX_PROJECT_ID = "inbox";
export const WORKBENCH_STATE_STORAGE_KEY = "voltui.workbench.ia.v2";
export const LEGACY_SIDEBAR_STORAGE_KEY = "volt-gui.sidebar-state.v1";

export type TaskOutcomeTemplateID =
  | "write-document"
  | "organize-materials"
  | "meeting-followup"
  | "analyze-data"
  | "plan-work"
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

export interface TaskReceiptEvidenceSection {
  items?: string[];
  note?: string;
  error?: string;
  supersedeFailure?: boolean;
}

export type TaskReceiptEvidence = Partial<Record<ReceiptSectionID, TaskReceiptEvidenceSection>>;

function isVerificationCommand(command: string) {
  const segments = command
    .split(/\s*(?:&&|\|\||;|\n)\s*/)
    .map((segment) => segment.trim().replace(/^(?:env\s+)?(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]+\s+)*/, ""))
    .filter(Boolean);
  return segments.some((segment) => [
    /^go\s+(?:test|vet)\b/i,
    /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test(?::[\w-]+)?|build|check|lint|typecheck|verify)\b/i,
    /^(?:npx\s+)?(?:vitest|playwright)\b(?:\s+(?:run|test))?/i,
    /^(?:python\d*\s+-m\s+)?pytest\b/i,
    /^cargo\s+(?:test|check|clippy)\b/i,
    /^dotnet\s+(?:test|build)\b/i,
    /^(?:mvn|mvnw|gradle|gradlew)\s+.*\b(?:test|check|verify|build)\b/i,
    /^git\s+diff\s+--check\b/i,
    /^(?:npx\s+)?tsc\b.*\s--noEmit\b/i,
    /^(?:npx\s+)?svelte-check\b/i,
  ].some((pattern) => pattern.test(segment)));
}

export function verificationEvidenceFromTool(input: {
  toolName: string;
  args?: string;
  error?: string;
  existingItems?: string[];
}): TaskReceiptEvidenceSection | undefined {
  const executionTools = new Set(["bash", "shell", "exec_command", "run_command", "terminal"]);
  if (!executionTools.has(input.toolName.trim().toLowerCase())) return undefined;
  let command = "";
  try {
    const args = JSON.parse(input.args || "{}") as Record<string, unknown>;
    const raw = args.command ?? args.cmd;
    command = typeof raw === "string" ? raw.trim() : "";
  } catch {
    return undefined;
  }
  if (!isVerificationCommand(command)) return undefined;
  const key = command.replace(/\s+/g, " ").slice(0, 120);
  const prefix = `验证 ${key}：`;
  const existing = input.existingItems ?? [];
  const previous = existing.find((item) => item.startsWith(prefix));
  const error = input.error?.trim() ?? "";
  const item = `${prefix}${error ? "失败" : previous?.includes("失败") ? "通过（此前失败，重跑通过）" : "通过"}`;
  const items = [...existing.filter((entry) => !entry.startsWith(prefix)), item];
  const failedItems = items.filter((entry) => entry.endsWith("失败"));
  return {
    items,
    note: failedItems.length ? "仍有验证命令失败" : "来自真实执行命令的验证结果",
    error: failedItems.length ? failedItems.join("；") : undefined,
    supersedeFailure: failedItems.length === 0,
  };
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

export const WORK_OUTCOME_TEMPLATES: OutcomeTemplate[] = [
  {
    id: "write-document",
    title: "起草文档",
    summary: "根据目标、读者和资料生成可直接编辑的初稿。",
    prompt: "根据当前任务中提供的目标和资料起草办公文档。\n\n步骤：\n1. 确认文档用途、读者和期望格式；信息不足时先提问。\n2. 提炼资料中的事实和约束，不补写未经确认的信息。\n3. 输出结构清晰、可直接继续编辑的初稿。\n\n最终交付包括：文档正文、采用的资料、待确认事项。",
    receiptSections: RECEIPT_SECTIONS,
  },
  {
    id: "organize-materials",
    title: "整理资料",
    summary: "归纳多份材料，提取重点、差异和待办事项。",
    prompt: "整理当前任务中明确提供或引用的资料。\n\n步骤：\n1. 按来源和主题归类。\n2. 提取关键事实、差异、风险和待确认信息。\n3. 把可执行事项整理为清单。\n\n最终交付包括：资料摘要、关键结论、行动清单、来源索引。资料缺失时明确指出，不要猜测。",
    receiptSections: RECEIPT_SECTIONS,
  },
  {
    id: "meeting-followup",
    title: "会议纪要",
    summary: "把会议记录整理为决策、负责人和后续安排。",
    prompt: "把当前会议记录整理为便于协作和跟进的纪要。\n\n步骤：\n1. 提取已确认决策、讨论结论和未决问题。\n2. 识别行动项、负责人和截止时间；原文未给出时标记待确认。\n3. 生成简洁的会后跟进内容。\n\n最终交付包括：会议结论、行动项、待确认事项、跟进消息草稿。",
    receiptSections: RECEIPT_SECTIONS,
  },
  {
    id: "analyze-data",
    title: "分析数据",
    summary: "分析表格或指标，给出结论、异常与行动建议。",
    prompt: "分析当前任务中提供的表格、指标或结构化数据。\n\n步骤：\n1. 确认分析目标、口径和时间范围。\n2. 检查缺失值、异常值和口径差异。\n3. 提炼趋势、对比和可执行洞察。\n\n最终交付包括：关键结论、数据依据、异常说明、行动建议。不要虚构缺失数据。",
    receiptSections: RECEIPT_SECTIONS,
  },
  {
    id: "plan-work",
    title: "制定计划",
    summary: "把目标拆成里程碑、负责人、时间和风险。",
    prompt: "把当前目标整理为可执行的工作计划。\n\n步骤：\n1. 明确目标、范围和完成标准。\n2. 拆分里程碑、任务依赖、负责人和时间安排。\n3. 标记风险、阻塞项和需要确认的决策。\n\n最终交付包括：目标与范围、里程碑、任务清单、风险与下一步。",
    receiptSections: RECEIPT_SECTIONS,
  },
];

export const CODE_OUTCOME_TEMPLATES: OutcomeTemplate[] = [
  {
    id: "review-fix",
    title: "审查并修复",
    summary: "输出问题清单、实际变更与测试证据。",
    prompt: "审查当前项目的真实变更。\n\n步骤：\n1. 列出可复现的问题与风险。\n2. 完成必要修复。\n3. 给出测试命令与结果。\n\n最终交付按以下格式输出：问题清单、变更摘要、验证证据、剩余风险。只针对当前变更，不要引入无关内容。",
    receiptSections: RECEIPT_SECTIONS,
  },
  {
    id: "build-diagnosis",
    title: "构建失败诊断",
    summary: "定位根因、实施修复并重跑失败门禁。",
    prompt: "复现当前的构建或测试失败。\n\n步骤：\n1. 基于日志和源码定位根因。\n2. 完成最小修复。\n3. 重跑原失败命令与相关回归检查。\n\n最终交付按以下格式输出：根因、修复内容、重跑结果、是否仍有失败。只处理当前失败，不要扩大范围。",
    receiptSections: RECEIPT_SECTIONS,
  },
  {
    id: "knowledge-change",
    title: "内部资料驱动变更",
    summary: "引用资料来源，记录改动、权限与验证。",
    prompt: "仅基于当前任务中明确引用的项目资料和目标文件完成变更。\n\n边界：\n- 只使用任务中引用的资料，不使用历史会话、未引用资料或无关示例。\n- 资料来源或目标文件不明确时，先提问确认，不要猜测。\n\n步骤：\n1. 确认引用的资料与目标文件。\n2. 完成变更。\n3. 验证并记录回滚方式。\n\n最终交付按以下格式输出：使用的资料来源、修改内容、数据与文件路径、验证结果、回滚方式。",
    receiptSections: RECEIPT_SECTIONS,
  },
  {
    id: "issue-delivery",
    title: "Issue 到可验证交付",
    summary: "从范围澄清到实现、验收与交付说明。",
    prompt: "把当前 Issue 转为可验证交付。\n\n步骤：\n1. 确认目标与非目标。\n2. 完成实现与测试。\n3. 整理验收标准。\n\n最终交付按以下格式输出：目标与非目标、实现摘要、验收标准、产物清单、限制与后续动作。",
    receiptSections: RECEIPT_SECTIONS,
  },
  {
    id: "release-acceptance",
    title: "发布验收",
    summary: "检查产物、门禁、数据路径和回滚方案。",
    prompt: "执行发布前验收。\n\n步骤：\n1. 检查构建产物是否就绪。\n2. 检查自动化门禁是否通过。\n3. 确认配置与数据路径。\n4. 准备回滚方案。\n\n最终交付按以下格式输出：通过项、待确认项、阻断项、回滚步骤。逐项给出明确结论，不要混入无关内容。",
    receiptSections: RECEIPT_SECTIONS,
  },
];

export const OUTCOME_TEMPLATES: OutcomeTemplate[] = [
  ...WORK_OUTCOME_TEMPLATES,
  ...CODE_OUTCOME_TEMPLATES,
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

export function applyTaskReceiptEvidence(
  receipt: TaskResultReceipt,
  evidence: TaskReceiptEvidence,
  now = new Date().toISOString(),
): TaskResultReceipt {
  const sections = { ...receipt.sections };
  for (const sectionID of RECEIPT_SECTIONS) {
    const next = evidence[sectionID];
    if (!next) continue;
    const previous = sections[sectionID];
    const items = (next.items ?? []).map((item) => item.trim()).filter(Boolean);
    const error = next.error?.trim() ?? "";
    const preserveFailure = previous.status === "failed" && !error && !next.supersedeFailure;
    sections[sectionID] = {
      status: error || preserveFailure ? "failed" : items.length ? "ready" : "pending",
      items,
      note: error || (preserveFailure ? previous.note : "") || next.note?.trim() || (items.length ? "已记录执行证据" : "等待执行证据"),
    };
  }
  return { ...receipt, updatedAt: now, sections };
}

export function settleTaskReceipt(
  receipt: TaskResultReceipt,
  input: { now?: string; error?: string },
): TaskResultReceipt {
  const error = input.error?.trim() ?? "";
  const verificationFailed = receipt.sections.verification.status === "failed";
  return {
    ...receipt,
    state: error || verificationFailed ? "failed" : "pending-review",
    updatedAt: input.now ?? new Date().toISOString(),
    sections: {
      ...receipt.sections,
      verification: error
        ? { status: "failed", items: receipt.sections.verification.items, note: error }
        : receipt.sections.verification.status === "ready" || receipt.sections.verification.status === "failed"
          ? receipt.sections.verification
          : { status: "pending", items: [], note: "等待验证证据与人工复核" },
    },
  };
}

export function restartTaskReceipt(
  receipt: TaskResultReceipt,
  now = new Date().toISOString(),
): TaskResultReceipt {
  const verification = receipt.sections.verification;
  const transientExecutionFailure = verification.status === "failed" && verification.items.length === 0;
  return {
    ...receipt,
    state: "running",
    updatedAt: now,
    sections: transientExecutionFailure
      ? {
          ...receipt.sections,
          verification: { status: "pending", items: [], note: "等待本次重试的验证证据" },
        }
      : receipt.sections,
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

// The backend snapshot is a durable navigation/index record. Transcript bodies
// stay in the session JSONL files so a WebView reset cannot duplicate or expose
// a second copy of the conversation in the sidebar state file.
export function persistentWorkbenchSnapshot(snapshot: WorkbenchSnapshotV2): WorkbenchSnapshotV2 {
  const withoutTranscript = (task: TaskThread): TaskThread => {
    const { transcript: _transcript, ...metadata } = task;
    return metadata;
  };
  return {
    ...snapshot,
    projectTasks: snapshot.projectTasks.map((project) => ({
      ...project,
      tasks: project.tasks.map(withoutTranscript),
    })),
    inboxTasks: snapshot.inboxTasks.map(withoutTranscript),
  };
}

function recoveredTaskID(scope: TaskThread["scope"], root: string, topicID: string, sessionPath: string) {
  return `recovered:${scope || "global"}:${root || "global"}:${topicID}:${sessionPath || "topic"}`;
}

function recoveredTaskTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? new Date(value).toISOString()
    : "已恢复";
}

// Reconstructs lightweight inbox tasks from the backend topic tree after
// localStorage has been deleted by a WebView uninstall/reinstall. The caller
// can later bind each task by topicId/sessionPath without inventing transcript
// content.
export function recoveredTaskThreadsFromBackend(nodes: ProjectNode[], tabs: TabMeta[]): TaskThread[] {
  const tasks: TaskThread[] = [];
  const seen = new Set<string>();
  const tabForTopic = (scope: TaskThread["scope"], root: string, topicID: string) => tabs.find((tab) =>
    tab.topicId === topicID && tab.scope === scope && (scope !== "project" || tab.workspaceRoot === root));
  const addTask = (node: ProjectNode, scope: TaskThread["scope"], root: string, sessionPath = "", title = node.label) => {
    const topicID = node.topicId?.trim() || "";
    if (!topicID) return;
    const tab = tabForTopic(scope, root, topicID);
    const path = sessionPath.trim() || tab?.sessionPath?.trim() || "";
    const id = recoveredTaskID(scope, root, topicID, path);
    if (seen.has(id)) return;
    seen.add(id);
    tasks.push({
      id,
      title: title.trim() || "已恢复会话",
      updatedAt: recoveredTaskTimestamp(node.lastActivityAt || node.createdAt),
      updatedAtMs: typeof node.lastActivityAt === "number" ? node.lastActivityAt : node.createdAt,
      tabId: tab?.id,
      topicId: topicID,
      sessionPath: path || undefined,
      scope,
      workspaceRoot: scope === "project" ? (root || undefined) : undefined,
    });
  };
  const walk = (node: ProjectNode, scope: TaskThread["scope"], root: string) => {
    const nextScope: TaskThread["scope"] = node.kind === "project" || node.kind === "topic" ? "project" : scope;
    const nextRoot = node.kind === "project" ? (node.root || root) : root;
    if (node.kind === "global_topic" || node.kind === "topic") {
      const sessions = (node.children || []).filter((child) => child.sessionPath);
      if (sessions.length > 0) {
        for (const session of sessions) addTask(session, nextScope, nextRoot, session.sessionPath, session.label || node.label);
      } else {
        addTask(node, nextScope, nextRoot);
      }
    }
    for (const child of node.children || []) {
      if (child.kind !== "session") walk(child, nextScope, nextRoot);
    }
  };
  for (const node of nodes) walk(node, node.kind === "project" ? "project" : "global", node.root || "");
  return tasks.sort((left, right) => (right.updatedAtMs || 0) - (left.updatedAtMs || 0));
}
