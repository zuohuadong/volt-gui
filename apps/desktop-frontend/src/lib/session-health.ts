import type { SessionSummary } from "./dsh-client";

export type SessionHealth = "ok" | "running" | "error";

export function sessionHealth(session: SessionSummary, hasRuntimeError = false): SessionHealth {
  if (session.running) return "running";
  if (hasRuntimeError || containsFailure(session.projections?.values)) return "error";
  return "ok";
}

export function sessionHealthLabel(health: SessionHealth): string {
  return health === "running" ? "运行中" : health === "error" ? "运行异常" : "可用";
}

export function agentPresetLocked(session: SessionSummary | undefined, messageCount: number): boolean {
  return !!session && (session.running || !session.blank || messageCount > 0);
}

export function clearsSessionError(event: { type: string; data?: Record<string, unknown> }): boolean {
  if (event.type !== "turn/end") return false;
  const reason = event.data?.reason;
  const kind = reason && typeof reason === "object" && !Array.isArray(reason)
    ? (reason as Record<string, unknown>).kind
    : reason;
  return kind !== "error";
}

function containsFailure(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsFailure);
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const text = typeof child === "string" ? child.toLowerCase() : "";
    if ((key.toLowerCase().includes("error") || key.toLowerCase().includes("failure")) && text.trim()) return true;
    if (containsFailure(child)) return true;
  }
  return false;
}
