export type RpcResult<T> = { ok: true; value: T } | { ok: false; error: { message: string; code?: string } };
export type SessionSummary = {
  sessionId: string;
  updatedAt: number;
  running: boolean;
  blank: boolean;
  cwd?: string;
  agentPreset?: string;
  projections?: { values?: Record<string, unknown> };
};
export type Workspace = { workspaceId: string; path: string; title: string; sessionIds: string[] };
export type SessionSearchItem = { sessionId: string; snippet: string };
export type HistoryEntry = { event: { type: string; seq: number; time: number; data: Record<string, unknown> }; view?: unknown };
export type ModelGroup = { id: string; name: string; models: { id: string; name: string; description?: string }[] };
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
    return unwrap<T>(await this.transport.dshRequest(method, payload) as { result?: RpcResult<T> });
  }

  listSessions(): Promise<{ items: SessionSummary[] }> { return this.request("session.list", {}); }
  searchSessions(query: string): Promise<{ items: SessionSearchItem[]; hasMore: boolean }> { return this.request("session.search", { query }); }
  listWorkspaces(): Promise<{ items: Workspace[]; archivedSessionIds: string[] }> { return this.request("workspace.list", {}); }
  createSession(cwd?: string): Promise<{ sessionId: string; agentPreset?: string }> {
    return this.request("session.create", cwd ? { cwd } : {});
  }
  history(sessionId: string): Promise<{ events: HistoryEntry[]; hasMore: boolean }> {
    return this.request("session.history", { sessionId, maxMessages: 80 });
  }
  prompt(sessionId: string, text: string): Promise<{ accepted: true }> {
    return this.request("session.prompt", { sessionId, mode: "queue", content: [{ type: "text", text }], clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  }
  cancel(sessionId: string): Promise<{ accepted: true }> { return this.request("session.cancel", { sessionId }); }
  rename(sessionId: string, title: string): Promise<{ title: string; seq: number }> { return this.request("session.rename", { sessionId, title }); }
  fork(sessionId: string, atSeq?: number): Promise<{ sessionId: string }> { return this.request("session.fork", { sessionId, ...(atSeq === undefined ? {} : { atSeq }) }); }
  archiveSession(sessionId: string): Promise<{ archivedSessionIds: string[] }> { return this.request("workspace.archiveSession", { sessionId }); }
  updateQueue(sessionId: string, itemId: string, action: unknown): Promise<{ accepted: true }> { return this.request("session.updateQueue", { sessionId, itemId, action }); }
  respond(message: unknown): Promise<unknown> { return this.transport.dshRespond(message); }
  models(sessionId: string): Promise<{ current: { provider: string; model: string; reasoningEffort?: string }; groups: ModelGroup[]; routable: boolean }> {
    return this.request("session.models", { sessionId });
  }
  selectModel(sessionId: string, provider: string, model: string, reasoningEffort?: string): Promise<{ selected: { provider: string; model: string; reasoningEffort?: string } }> {
    return this.request("session.selectModel", { sessionId, provider, model, ...(reasoningEffort ? { reasoningEffort } : {}) });
  }
  listSkills(sessionId: string): Promise<{ skills: DshSkill[] }> { return this.request("skill.list", { sessionId }); }
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

  subscribe(onFrame: (frame: DshFrame) => void, onError: (error: Error) => void): () => void {
    try {
      return this.transport.onDshFrame((frame: unknown) => onFrame(frame as DshFrame));
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
      return () => undefined;
    }
  }
}
