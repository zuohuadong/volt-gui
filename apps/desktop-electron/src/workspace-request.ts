import { canonicalProjectDirectory, INVALID_WORKSPACE_MESSAGE } from "./workspace-policy.ts";

type Remote = {
  call(method: string, args: Record<string, unknown>): Promise<unknown>;
  readFirstStreamItem(method: string, args: Record<string, unknown>): Promise<unknown>;
};
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
const executionMethods = new Set([
  "session.prompt", "session.fork", "session.updateQueue",
  "fileUploads.upload",
  "commands.execute",
  "goal.create", "goal.edit", "goal.resume", "subagent.prompt",
]);

// 只读取官方会话目录，不维护第二份会话状态；历史、取消和暂停无需执行权限。
export async function checkWorkspaceRequest(
  client: Remote,
  method: string,
  payload: unknown,
  defaultCwd: string,
  validate: (cwd: string) => string = canonicalProjectDirectory,
): Promise<unknown> {
  const request = record(payload);
  if (method === "session.create" || method === "workspace.create") {
    if (method === "session.create" && request.workspaceId !== undefined) {
      if (request.cwd !== undefined || typeof request.workspaceId !== "string" || !request.workspaceId) {
        throw new Error(INVALID_WORKSPACE_MESSAGE);
      }
      const baseline = record(await client.readFirstStreamItem("workspace/follow", {}));
      const items = record(baseline.value).items;
      const workspace = (Array.isArray(items) ? items : []).map(record)
        .find((item) => item.workspaceId === request.workspaceId);
      if (typeof workspace?.path !== "string") throw new Error(INVALID_WORKSPACE_MESSAGE);
      validate(workspace.path);
      return payload;
    }
    const field = method === "session.create" ? "cwd" : "path";
    const cwd = request[field] ?? (field === "cwd" ? defaultCwd : "");
    if (typeof cwd !== "string") throw new Error(INVALID_WORKSPACE_MESSAGE);
    try {
      return { ...request, [field]: validate(cwd) };
    } catch (error) {
      if (method === "session.create" && String(error).includes("WORKSPACE_UNSAFE")) {
        return { ...request, cwd: validate(defaultCwd) };
      }
      throw error;
    }
  }
  if (!executionMethods.has(method)) return payload;
  let cwd: unknown;
  if (method === "subagent.prompt") {
    const snapshot = record(await client.readFirstStreamItem("session/follow", {
      request: {
        address: { kind: "subagent", parentSessionId: request.parentSessionId, childSessionId: request.childSessionId, mode: request.mode },
        maxMessages: 1,
      },
    }));
    cwd = record(snapshot.header).cwd;
  } else {
    const result = record(await client.call("session/list", { _request: {} }));
    const session = (Array.isArray(result.items) ? result.items : []).map(record)
      .find((item) => item.sessionId === (method === "fileUploads.upload" ? request.agentId : request.sessionId));
    if (session?.origin === "subagent") throw new Error("Subagent Sessions require their durable parent address.");
    cwd = session?.cwd;
  }
  if (typeof cwd !== "string" || !cwd) throw new Error(INVALID_WORKSPACE_MESSAGE);
  validate(cwd);
  return payload;
}
