import { MAX_INLINE_UPLOAD_BYTES, MAX_INPUT_FILE_BYTES, formatFileSize } from "./file-limits";
import { normalizeCommands, type HostCommand } from "./slash-commands";

export type RpcResult<T> = { ok: true; value: T } | { ok: false; error: { message: string; code?: string } };

/** 单个输入文件上限（2 GiB）；超过 MAX_INLINE_UPLOAD_BYTES 的文件由调用方改成路径引用。 */
export const MAX_UPLOAD_FILE_BYTES = MAX_INPUT_FILE_BYTES;
export type PermissionSelect = {
  options: Array<{ value: string; label?: string; description?: string }>;
  currentValue: string;
};
export type PermissionCatalog = {
  options: Array<{ value: string; name?: string; description?: string }>;
};
export type SessionSummary = {
  sessionId: string;
  updatedAt: number;
  running: boolean;
  blank: boolean;
  origin?: "user" | "subagent" | "fork";
  parentSessionId?: string;
  agentAvailable?: boolean;
  cwd?: string;
  workspaceError?: string;
  agentPreset?: string;
  /**
   * 官方报告的持久化格式状态：`migration-required` 表示这条会话由更新版本的
   * DSH 写过，当前运行时不能安全读取（降级安装的典型症状）。
   */
  formatStatus?: "current" | "migration-required";
  projections?: { values?: Record<string, unknown> & { permissions?: PermissionSelect } };
};
export type SessionProjection = { asOfSeq: number; values: Record<string, unknown> & { permissions?: PermissionSelect } };
export type SessionHistory = { events: HistoryEntry[]; hasMore: boolean; cursor: number; projections?: SessionProjection };
/** 官方 `session/updateQueue` 的三种改动：改文字、删除、插队（立即转向）。 */
export type SessionQueueAction =
  | { readonly kind: "edit"; readonly content: readonly { type: "text"; text: string }[] }
  | { readonly kind: "remove" }
  | { readonly kind: "steer" };
/** 官方 `session/state` 的被动状态快照。 */
export type SessionRuntimeState = {
  readonly cursor: number;
  readonly active: boolean;
  readonly running: boolean;
  /** 没有活动 Agent 时官方返回 null（此时队列不可读，而不是空队列）。 */
  readonly queue: readonly unknown[] | null;
  readonly pendingInput?: readonly string[];
};
export type Workspace = { workspaceId: string; path: string; title: string; sessionIds: string[] };
export type SessionSearchItem = { sessionId: string; snippet: string };
export type HistoryEntry = { event: { type: string; seq: number; time: number; data: Record<string, unknown> }; view?: unknown };
export type ModelInfo = { id: string; name: string; description?: string; input?: string[]; contextWindow?: number; maxTokens?: number; reasoning?: { efforts: Array<{ id: string; name: string }>; defaultEffort?: string } };
export type ModelGroup = { id: string; name: string; models: ModelInfo[] };
export type ModelCatalogFailure = { id: string; name: string; message: string };
export type DirectoryEntry = { name: string; path: string; hidden: boolean };
export type DirectoryListing = {
  path: string;
  home: string;
  crumbs: DirectoryEntry[];
  entries: DirectoryEntry[];
  truncated: boolean;
};
export type FileReferenceCandidate = { path: string; kind: "file" | "directory" };
export type SessionReferenceCandidate = { sessionId: string; label: string; cwd?: string; createdAt: number; mention: string };
export type PluginInventoryEntry = {
  entryId: string;
  moduleName: string;
  enabled: boolean;
  fiberPhase: "pending" | "loading" | "active" | "failed" | "unloading" | null;
};
export type ManagedPluginEntry = PluginInventoryEntry & {
  /** 官方 profile patch 里的行 id；有这个字段才允许启停。 */
  patchId?: string;
  /** 官方拒绝就地修改的原因。 */
  readOnlyReason?: "management-required" | "unaddressable";
};
/**
 * 官方 `setPluginEnabled` 的结果（`ChangeResult.application`）。
 *
 * 五态都必须区分：`applied` 立即生效；`restart-required` 下次启动生效；
 * `overridden` 表示配置写进去了但被更高优先级的覆盖压住（**没生效**）；
 * `failed` 失败；`cancelled` 是调用方中止、文件已回滚。
 */
export type PluginToggleResult = {
  application: "applied" | "restart-required" | "overridden" | "failed" | "cancelled";
  enabled?: boolean;
  restartReason?: string;
  error?: { code?: string; message?: string };
  warnings?: string[];
};
export type DiscoveredModel = { id: string; name?: string; contextWindow?: number; maxTokens?: number; input?: string[] };
export type SpeechPreparationState =
  | { phase: "unprepared" | "ready" | "standby" | "cancelled" }
  | { phase: "downloading"; resource: string; completedBytes: number; totalBytes?: number }
  | { phase: "checking" | "loading" | "waking" | "cancelling"; startedAt: number }
  | { phase: "failed"; message: string; download?: { resource: string; source: string; reason: string; code?: string; status?: number } };
export type SpeechProviderView = {
  id: string;
  name?: string;
  location?: "host-local" | "cloud";
  languages?: string[];
  downloadSources?: string[];
  preparation?: SpeechPreparationState & { step?: string; steps?: Array<{ kind: string; status: string; startedAt?: number }> };
};
export type SpeechCatalog = {
  providers: SpeechProviderView[];
  selection?: { providerId?: string; language?: string };
  maxAudioBytes?: number;
  maxDurationSeconds?: number;
};
export type PromptContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; data: string; name?: string }
  | { type: "file"; receiptId: string };
export type DshSkill = { name: string; description: string; whenToUse?: string; modelInvocable: boolean };
export type AgentPreset = {
  id: string;
  trust: "system" | "user";
  isDefault: boolean;
  name?: string;
  description?: string;
  broken?: string;
};
export type GoalRef = { id: string; revision: number };
export type GoalProjection = {
  goal: GoalRef & {
    objective: string;
    phase: "active" | "paused" | "blocked" | "complete";
    blockedReason?: unknown;
    maxGoalRounds: number;
  };
  roundsStarted: number;
  createdAt: number;
  updatedAt: number;
};
export type SubagentEntry = {
  kind: "child";
  id: string;
  mode: "one-shot" | "continuable";
  activity: "running" | "inactive";
  hasChildren: boolean;
  label?: string;
} | {
  kind: "diagnostic";
  id: string;
  reason: "corrupt" | "unsupported" | "unavailable";
};
export type SettingsNamespace = {
  ns: string;
  schema: unknown;
  value: unknown;
  base?: unknown;
  user?: unknown;
  applies: "live" | "restart";
  secrets: Array<{ path: string[]; set: boolean }>;
  revision: number;
};
export type CredentialView = { configured: boolean; source?: string; writable: boolean };
export type ConfigurableProvider = {
  provider: string;
  displayName: string;
  settingsNs: string;
  settingsPath: string[];
  active: boolean;
  declared?: boolean;
};
export type ToolView = { for?: "call" | "result"; view?: Record<string, unknown> };
export type PendingApproval = { rpcId: string; sessionId: string; approvalId: string; toolName: string; callId?: string; reason?: string };
export type PendingQuestion = { rpcId: string; sessionId: string; questions: Array<Record<string, unknown>> };

export type DshFrame = {
  rpcId: string;
  payload: {
    type: string;
    sessionId?: string;
    event?: { type: string; seq: number; time: number; data: Record<string, unknown> };
    view?: unknown;
    running?: boolean;
    message?: string;
    [key: string]: unknown;
  };
};

type DshTransport = {
  dshRequest(method: string, payload: unknown): Promise<unknown>;
  dshRespond(message: unknown): Promise<unknown>;
  onDshFrame(listener: (frame: unknown) => void): () => void;
  observeSessionState?(sessionId: string): Promise<{ accepted: boolean; sessionId?: string }>;
};

function unwrap<T>(body: { result?: RpcResult<T> }): T {
  const result = body.result;
  if (!result || !result.ok) throw new Error(result?.error.message || "DSH 请求失败");
  return result.value;
}

export class DshClient {
  private readonly transport: DshTransport;

  constructor(transport: DshTransport) {
    this.transport = transport;
  }

  async request<T>(method: string, payload: unknown): Promise<T> {
    return unwrap<T>(await this.transport.dshRequest(method, snapshotRpcValue(payload)) as { result?: RpcResult<T> });
  }

  listSessions(): Promise<{ items: SessionSummary[] }> { return this.request("session.list", {}); }
  listSchedules(request: Record<string, unknown>): Promise<unknown> { return this.request("schedule.list", request); }
  runSchedule(request: Record<string, unknown>): Promise<unknown> { return this.request("schedule.run", request); }
  editSchedule(request: Record<string, unknown>): Promise<unknown> { return this.request("schedule.edit", request); }
  searchSessions(query: string): Promise<{ items: SessionSearchItem[]; hasMore: boolean }> { return this.request("session.search", { query }); }
  listWorkspaces(): Promise<{ items: Workspace[]; archivedSessionIds: string[] }> { return this.request("workspace.list", {}); }
  createWorkspace(path: string): Promise<{ workspace: Workspace; created: boolean }> { return this.request("workspace.create", { path }); }
  createSession(input?: string | { cwd?: string; workspaceId?: string }): Promise<{ sessionId: string; agentPreset?: string; workspaceRedirected?: boolean; cwd?: string }> {
    const request = typeof input === "string" ? { cwd: input } : input ?? {};
    return this.request("session.create", request);
  }
  history(sessionId: string, page?: { beforeSeq: number; throughSeq: number }): Promise<SessionHistory> {
    return this.request("session.history", {
      sessionId,
      maxMessages: 80,
      ...page,
    });
  }
  prompt(sessionId: string, content: string | PromptContentPart[], mode: "queue" | "steer" = "queue"): Promise<{ accepted: true; command?: { kind: "success"; text?: string } }> {
    const parts = typeof content === "string" ? [{ type: "text", text: content } satisfies PromptContentPart] : snapshotPromptContent(content);
    return this.request("session.prompt", { sessionId, mode, content: parts, clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  }
  permissionCatalog(): Promise<PermissionCatalog> {
    return this.request("permissionPresets.catalog", {});
  }
  executeCommand(sessionId: string, line: string): Promise<{ result?: { kind: "success" | "error"; text?: string } }> {
    return this.request("commands.execute", { sessionId, line, attachments: [] });
  }
  /**
   * 官方命令目录（斜杠菜单的唯一来源）。
   *
   * 目录按 Agent 解析：会话切走后返回的可能是上一会话的命令集，调用方必须用
   * 自己的会话代际丢弃过期结果（与其它管理面一致）。
   */
  async listCommands(sessionId: string): Promise<HostCommand[]> {
    return normalizeCommands(await this.request<unknown>("commands.list", { sessionId }));
  }
  async selectPermission(sessionId: string, preset: string): Promise<PermissionSelect> {
    const catalog = await this.permissionCatalog();
    if (!catalog.options.some((option) => option.value === preset)) throw new Error("Permission preset is unavailable");
    const execution = await this.executeCommand(sessionId, `/permission ${preset}`);
    if (execution?.result?.kind !== "success") throw new Error(execution?.result?.text || "Permission command was not executed");
    const sessions = await this.listSessions();
    const permission = sessions.items.find((session) => session.sessionId === sessionId)?.projections?.values?.permissions;
    if (permission?.currentValue !== preset) throw new Error("Permission change could not be verified");
    return permission;
  }
  async uploadFile(sessionId: string, file: File, isCurrent: () => boolean = () => true): Promise<{ receiptId: string; file: { attachmentId: string; name: string; bytes: number } }> {
    if (!isCurrent()) throw new DOMException("文件上传已取消", "AbortError");
    if (file.size > MAX_UPLOAD_FILE_BYTES) throw new Error(`文件超过 ${formatFileSize(MAX_UPLOAD_FILE_BYTES)}`);
    // base64 单请求上传有字符串上限：大文件必须走工作区路径引用，不能在这里静默改道。
    if (file.size > MAX_INLINE_UPLOAD_BYTES) throw new Error(`文件超过 ${formatFileSize(MAX_INLINE_UPLOAD_BYTES)}，请改用工作区路径引用`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isCurrent()) throw new DOMException("文件上传已取消", "AbortError");
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunkSize, bytes.length)));
    }
    const result = await this.request<{ receiptId: string; file: { attachmentId: string; name: string; bytes: number } }>(
      "fileUploads.upload",
      { agentId: sessionId, request: { data: btoa(binary), name: file.name } },
    );
    if (!isCurrent()) throw new DOMException("文件上传已取消", "AbortError");
    if (!result || typeof result.receiptId !== "string" || !result.receiptId) {
      throw new Error("文件上传未返回有效回执");
    }
    return result;
  }
  cancel(sessionId: string): Promise<{ accepted: true }> { return this.request("session.cancel", { sessionId }); }
  rename(sessionId: string, title: string): Promise<{ title: string; seq: number }> { return this.request("session.rename", { sessionId, title }); }
  fork(sessionId: string, atSeq?: number): Promise<{ sessionId: string }> { return this.request("session.fork", { sessionId, ...(atSeq === undefined ? {} : { atSeq }) }); }
  archiveSession(sessionId: string): Promise<{ archivedSessionIds: string[] }> { return this.request("workspace.archiveSession", { sessionId }); }
  unarchiveSession(sessionId: string): Promise<{ archivedSessionIds: string[] }> { return this.request("workspace.unarchiveSession", { sessionId }); }
  updateQueue(sessionId: string, itemId: string, action: SessionQueueAction): Promise<{ accepted: true }> {
    return this.request("session.updateQueue", { sessionId, itemId, action });
  }
  /** 读取会话被动状态：待发送队列与运行标记（官方 `session/state`）。 */
  sessionState(sessionId: string): Promise<SessionRuntimeState> {
    return this.request("session.state", { sessionId });
  }
  /**
   * 让主进程持续观察这个会话的状态（`session/observeState` 流）。
   * 老版本桌面外壳没有这个通道时静默降级：队列读不到就不显示，不能因此报错。
   */
  async observeSessionState(sessionId: string): Promise<{ accepted: boolean }> {
    if (!this.transport.observeSessionState) return { accepted: true };
    const result = await this.transport.observeSessionState(sessionId);
    return { accepted: result?.accepted === true };
  }
  respond(message: unknown): Promise<unknown> { return this.transport.dshRespond(message); }
  models(sessionId: string): Promise<{ current: { provider: string; model: string; reasoningEffort?: string }; groups: ModelGroup[]; failures?: ModelCatalogFailure[]; routable: boolean }> {
    return this.request("session.models", { sessionId });
  }
  selectModel(sessionId: string, provider: string, model: string, reasoningEffort?: string): Promise<{ selected: { provider: string; model: string; reasoningEffort?: string } }> {
    return this.request("session.selectModel", { sessionId, provider, model, ...(reasoningEffort ? { reasoningEffort } : {}) });
  }
  listSkills(sessionId: string): Promise<{ skills: DshSkill[] }> { return this.request("skill.list", { sessionId }); }
  speechCatalog(): Promise<SpeechCatalog> {
    return this.request("speech/catalog", {});
  }
  speechPrepare(providerId: string, options?: { downloadSource?: string }): Promise<void> {
    return this.request("speech/prepare", { providerId, ...(options ? { options } : {}) });
  }
  speechCancelPreparation(providerId: string): Promise<void> {
    return this.request("speech/cancelPreparation", { providerId });
  }
  speechTranscribe(audioBase64: string, providerId?: string, language?: string): Promise<{ text: string; audioSeconds?: number; inferenceSeconds?: number }> {
    return this.request("speech/transcribe", { request: { audioBase64, ...(providerId ? { providerId } : {}), ...(language ? { language } : {}) } });
  }
  listAgentPresets(): Promise<{ presets: AgentPreset[]; authorable: boolean; hasDocument: boolean }> {
    return this.request("agentPreset.list", {});
  }
  selectAgentPreset(sessionId: string, agentPreset: string): Promise<{ agentPreset: string }> {
    return this.request("agentPreset.select", { sessionId, agentPreset });
  }
  readAgentPreset(agentPreset: string): Promise<{ agentPreset: string; trust: "system" | "user"; content: string; name?: string; description?: string }> {
    return this.request("agentPreset.read", { agentPreset });
  }
  openAgentPresetDocument(agentPreset: string): Promise<{ opened: true } | { opened: false; path: string }> {
    return this.request("agentPreset.openDocument", { agentPreset });
  }
  renameWorkspace(workspaceId: string, title: string): Promise<{ workspace: Workspace }> {
    return this.request("workspace.rename", { workspaceId, title });
  }
  deleteWorkspace(workspaceId: string): Promise<{ deleted: true }> {
    return this.request("workspace.delete", { workspaceId });
  }
  openPath(path: string): Promise<{ opened: true }> {
    return this.request("host.openPath", { path });
  }
  createGoal(sessionId: string, objective: string, maxGoalRounds?: number): Promise<{ ref: GoalRef }> {
    return this.request("goal.create", { sessionId, objective, ...(maxGoalRounds ? { maxGoalRounds } : {}) });
  }
  editGoal(sessionId: string, ref: GoalRef, objective?: string, maxGoalRounds?: number): Promise<{ ref: GoalRef }> {
    return this.request("goal.edit", { sessionId, ref, ...(objective ? { objective } : {}), ...(maxGoalRounds ? { maxGoalRounds } : {}) });
  }
  pauseGoal(sessionId: string, ref: GoalRef): Promise<{ ref: GoalRef }> { return this.request("goal.pause", { sessionId, ref }); }
  resumeGoal(sessionId: string, ref: GoalRef): Promise<{ ref: GoalRef }> { return this.request("goal.resume", { sessionId, ref }); }
  completeGoal(sessionId: string, ref: GoalRef): Promise<{ ref: GoalRef }> { return this.request("goal.complete", { sessionId, ref }); }
  clearGoal(sessionId: string, ref: GoalRef): Promise<{ cleared: true }> { return this.request("goal.clear", { sessionId, ref }); }
  listSubagents(parentSessionId: string): Promise<{ entries: SubagentEntry[]; parentAvailable: boolean }> {
    return this.request("subagent.list", { parentSessionId });
  }
  subagentHistory(parentSessionId: string, childSessionId: string, mode: "one-shot" | "continuable"): Promise<{ events: HistoryEntry[]; hasMore: boolean }> {
    return this.request("subagent.history", { parentSessionId, childSessionId, mode, maxMessages: 80 });
  }
  promptSubagent(parentSessionId: string, childSessionId: string, text: string): Promise<{ messageId: string }> {
    return this.request("subagent.prompt", { parentSessionId, childSessionId, mode: "continuable", content: [{ type: "text", text }], clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  }
  interruptSubagent(parentSessionId: string, childSessionId: string): Promise<{ accepted: true }> {
    return this.request("subagent.interrupt", { parentSessionId, childSessionId, mode: "continuable" });
  }
  describeSettings(): Promise<{ writable: boolean; hasDocument: boolean; namespaces: SettingsNamespace[] }> {
    return this.request("settings.describe", {});
  }
  openSettingsDocument(): Promise<{ opened: true }> { return this.request("settings.openDocument", {}); }
  updateSettings(ns: string, patch: Record<string, unknown>, expectedRevision?: number): Promise<SettingsNamespace> {
    return this.request("settings.update", { ns, patch, ...(expectedRevision === undefined ? {} : { expectedRevision }) });
  }
  describeCredentials(refs: string[]): Promise<{ credentials: Record<string, CredentialView> }> {
    return this.request("credentials.describe", { refs });
  }
  setCredential(ref: string, value: string): Promise<Record<string, never>> { return this.request("credentials.set", { ref, value }); }
  unsetCredential(ref: string): Promise<Record<string, never>> { return this.request("credentials.unset", { ref }); }
  listProviders(): Promise<{ providers: ConfigurableProvider[] }> { return this.request("llm.providers", {}); }
  listModelCatalog(): Promise<{ groups: ModelGroup[]; failures: ModelCatalogFailure[] }> { return this.request("llm.models", {}); }
  discoverModels(payload: { settingsNs: string; provider?: string; baseURL?: string; api?: string; apiKey?: string }): Promise<{ models: DiscoveredModel[] }> {
    return this.request("llm.discoverModels", payload);
  }
  describeHost(): Promise<{ version: string; cwd: string; provider?: string; model?: string; attachedSessions: number; home: string; canOpenPath: boolean }> {
    return this.request("host.describe", {});
  }
  listDirectory(path?: string): Promise<DirectoryListing> { return this.request("host.listDirectory", path ? { path } : {}); }
  createDirectory(path: string, name: string): Promise<{ path: string }> { return this.request("host.createDirectory", { path, name }); }
  insertWorkspaceBefore(workspaceId: string, beforeWorkspaceId?: string): Promise<{ workspaceIds: string[] }> {
    return this.request("workspace.insertBefore", { workspaceId, ...(beforeWorkspaceId ? { beforeWorkspaceId } : {}) });
  }
  insertSessionBefore(workspaceId: string, sessionId: string, beforeSessionId?: string): Promise<{ workspace: Workspace }> {
    return this.request("workspace.insertSessionBefore", { workspaceId, sessionId, ...(beforeSessionId ? { beforeSessionId } : {}) });
  }
  copyAgentPreset(from: string, agentPreset: string, name?: string): Promise<{ agentPreset: string }> {
    return this.request("agentPreset.copy", { from, agentPreset, ...(name ? { name } : {}) });
  }
  removeAgentPreset(agentPreset: string): Promise<Record<string, never>> { return this.request("agentPreset.remove", { agentPreset }); }
  listFileReferences(sessionId: string, query: string): Promise<FileReferenceCandidate[]> {
    return this.request("fileReferences/list", { args: { agentId: sessionId, query } });
  }
  listSessionReferenceCandidates(sessionId: string, query: string): Promise<SessionReferenceCandidate[]> {
    return this.request("sessionReferenceResolver/candidates", { args: { agentId: sessionId, query } });
  }
  listPluginInventory(): Promise<{ entries: PluginInventoryEntry[] }> {
    return this.request("pluginInventory/list", { args: {} });
  }
  /**
   * 可管理插件列表：官方 `pluginManager.listPlugins` 在只读清单之外给出
   * `patchId`（可写）或 `readOnlyReason`（为什么不能从这里改）。
   */
  listManagedPlugins(): Promise<{ entries: ManagedPluginEntry[] }> {
    return this.request<ManagedPluginEntry[]>("pluginManager.listPlugins", {}).then((entries) => ({ entries: Array.isArray(entries) ? entries : [] }));
  }
  /** 保存根会话的 Agent 团队模式选择（官方 `agentTeams.setEnabled`）。 */
  setAgentTeamEnabled(sessionId: string, enabled: boolean): Promise<unknown> {
    return this.request("agentTeams.setEnabled", { sessionId, enabled });
  }
  /** 读取本会话的消息反馈（官方 `messageFeedback.list`）。 */
  listMessageFeedback(sessionId: string): Promise<unknown> {
    return this.request("messageFeedback.list", { sessionId });
  }
  /** 写入/覆盖一条消息反馈；`ifVersion` 为 null 表示要求此前不存在。 */
  putMessageFeedback(sessionId: string, messageId: string, rating: "positive" | "negative", ifVersion: string | null): Promise<unknown> {
    return this.request("messageFeedback.put", { sessionId, messageId, rating, ifVersion });
  }
  /** 撤回一条消息反馈（官方要求带观察到的版本）。 */
  deleteMessageFeedback(sessionId: string, messageId: string, ifVersion: string): Promise<unknown> {
    return this.request("messageFeedback.delete", { sessionId, messageId, ifVersion });
  }
  /** 持久化并就地应用一个插件条目的启停状态。 */
  setPluginEnabled(id: string, enabled: boolean): Promise<PluginToggleResult> {
    return this.request("pluginManager.setPluginEnabled", { id, enabled });
  }
  testKnowledgeSource(): Promise<{ status: "connected" | "unauthorized" | "forbidden" | "unavailable"; knowledgeBases: Array<{ id: string; name: string }> }> {
    return this.request("weknora/test", {});
  }
  mcpAppsRequest(path: string, method: "GET" | "POST", body?: Record<string, unknown>): Promise<unknown> {
    return this.request("mcpApps.request", { path, method, ...(body === undefined ? {} : { body }) });
  }

  subscribe(onFrame: (frame: DshFrame) => void, onError: (error: Error) => void): () => void {
    try {
      return this.transport.onDshFrame((frame: unknown) => onFrame(frame as DshFrame));
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
      return () => undefined;
    }
  }
}

function snapshotPromptContent(content: PromptContentPart[]): PromptContentPart[] {
  return content.map((part) => part.type === "text"
    ? { type: "text", text: part.text }
    : part.type === "image"
      ? { type: "image", mediaType: part.mediaType, data: part.data, ...(part.name ? { name: part.name } : {}) }
      : { type: "file", receiptId: part.receiptId });
}

// Svelte 5 state values are proxies; Electron IPC only accepts structured-cloneable
// plain data. Snapshot every RPC payload at this boundary so reactive arrays and
// objects cannot fail silently before reaching the official DSH runtime.
function snapshotRpcValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) throw new Error("DSH 请求参数不能包含循环引用");
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => snapshotRpcValue(item, seen));
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      result[key] = snapshotRpcValue(child, seen);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}
