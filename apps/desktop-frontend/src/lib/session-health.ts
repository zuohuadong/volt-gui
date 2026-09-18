import type { SessionSummary } from "./dsh-client";
import { t } from "./i18n";

export type SessionHealth = "ok" | "running" | "error";

export function sessionHealth(session: SessionSummary, hasRuntimeError = false): SessionHealth {
  if (session.running) return "running";
  if (hasRuntimeError || containsFailure(session.projections?.values)) return "error";
  return "ok";
}

export function sessionHealthLabel(health: SessionHealth): string {
  if (health === "running") return t("session.statusRunning");
  if (health === "error") return t("session.statusError");
  return t("session.statusAvailable");
}

export function agentPresetLocked(session: SessionSummary | undefined, messageCount: number): boolean {
  return !!session && (session.running || !session.blank || messageCount > 0);
}

export function visibleSessions(
  sessions: SessionSummary[],
  archivedSessionIds: string[],
  activeSessionId = "",
): SessionSummary[] {
  const archived = new Set(archivedSessionIds);
  return sessions.filter((session) =>
    !archived.has(session.sessionId) && (!session.blank || session.sessionId === activeSessionId)
  );
}

export function clearsSessionError(event: { type: string; data?: Record<string, unknown> }): boolean {
  if (event.type !== "turn/end") return false;
  const reason = event.data?.reason;
  const kind = reason && typeof reason === "object" && !Array.isArray(reason)
    ? (reason as Record<string, unknown>).kind
    : reason;
  return kind !== "error";
}

export function turnEndError(event: { type: string; data?: Record<string, unknown> }): string | undefined {
  if (event.type !== "turn/end") return undefined;
  const reason = event.data?.reason;
  if (!reason) return undefined;
  if (typeof reason === "string") {
    return reason === "error" ? "error" : undefined;
  }
  if (typeof reason === "object" && !Array.isArray(reason)) {
    const rec = reason as Record<string, unknown>;
    if (rec.kind === "error") {
      const err = rec.error ?? rec.message ?? rec.details ?? rec.reason;
      if (typeof err === "string" && err.trim()) return err;
      if (err && typeof err === "object") {
        const nestedMsg = (err as Record<string, unknown>).message;
        if (typeof nestedMsg === "string" && nestedMsg.trim()) return nestedMsg;
        try {
          return JSON.stringify(err);
        } catch {
          return "error";
        }
      }
      return "error";
    }
  }
  return undefined;
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
