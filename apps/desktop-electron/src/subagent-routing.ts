type RecordValue = Record<string, unknown>;
type Remote = { call(method: string, args: RecordValue): Promise<unknown> };

function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

export function subagentAddress(request: RecordValue): RecordValue {
  if (typeof request.parentSessionId !== "string" || !request.parentSessionId
    || typeof request.childSessionId !== "string" || !request.childSessionId
    || !["one-shot", "continuable"].includes(String(request.mode))) {
    throw new Error("Subagent Sessions require their durable parent address.");
  }
  return { kind: "subagent", parentSessionId: request.parentSessionId, childSessionId: request.childSessionId, mode: request.mode };
}

export async function listSubagents(client: Remote, parentSessionId: string): Promise<RecordValue> {
  if (!parentSessionId) throw new Error("Subagent Sessions require their durable parent address.");
  const [baseline, listed] = await Promise.all([
    client.call("session/projections", { request: { sessionId: parentSessionId } }),
    client.call("session/list", { _request: {} }),
  ]);
  if (!baseline) throw new Error("Subagent parent session is unavailable.");
  const rows = record(listed).items;
  const sessions = (Array.isArray(rows) ? rows : []).map(record);
  const parent = sessions.find((item) => item.sessionId === parentSessionId);
  const catalog = record(record(baseline).values).subagentCatalog;
  const entries = (Array.isArray(catalog) ? catalog : []).map((value) => {
    const entry = record(value);
    const child = sessions.find((item) => item.sessionId === entry.id);
    if (entry.mode !== "one-shot" && entry.mode !== "continuable") {
      return { kind: "diagnostic", id: entry.id, reason: "unsupported" };
    }
    if (!child) return { kind: "diagnostic", id: entry.id, reason: "unavailable" };
    if (child.origin !== "subagent" || child.parentSessionId !== parentSessionId) {
      return { kind: "diagnostic", id: entry.id, reason: "corrupt" };
    }
    return {
      kind: "child", id: entry.id, mode: entry.mode, label: entry.label,
      activity: child.running ? "running" : "inactive",
      hasChildren: sessions.some((item) => item.origin === "subagent" && item.parentSessionId === entry.id),
    };
  });
  return { entries, parentAvailable: parent?.agentAvailable === true };
}
