import type { SessionSummary } from "./dsh-client";
import { t } from "./i18n";

export type SessionHealth = "ok" | "running" | "error" | "migration-required";

/**
 * 由更新版本写过、当前运行时读不了的会话（降级安装）。
 *
 * 这类会话不能当普通错误处理：重试解决不了，用户需要知道"是版本问题"。
 */
export function sessionNeedsMigration(session: SessionSummary): boolean {
  return session.formatStatus === "migration-required";
}

export function sessionHealth(session: SessionSummary, hasRuntimeError = false): SessionHealth {
  if (sessionNeedsMigration(session)) return "migration-required";
  if (session.running) return "running";
  if (hasRuntimeError || containsFailure(session.projections?.values)) return "error";
  return "ok";
}

export function sessionHealthLabel(health: SessionHealth): string {
  if (health === "migration-required") return t("session.statusMigrationRequired");
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
  draftSessionIds: string[] = [],
): SessionSummary[] {
  const archived = new Set(archivedSessionIds);
  const drafts = new Set(draftSessionIds);
  return sessions.filter((session) =>
    session.origin !== "subagent" && !archived.has(session.sessionId) && (!session.blank || session.sessionId === activeSessionId || drafts.has(session.sessionId))
  );
}

export function archivedSessionItems(
  sessions: SessionSummary[],
  archivedSessionIds: string[],
): SessionSummary[] {
  const archived = new Set(archivedSessionIds);
  return sessions
    .filter((session) => session.origin !== "subagent" && archived.has(session.sessionId))
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export function clearsSessionError(event: { type: string; data?: Record<string, unknown> }): boolean {
  if (event.type !== "turn/end") return false;
  const reason = event.data?.reason;
  const kind = reason && typeof reason === "object" && !Array.isArray(reason)
    ? (reason as Record<string, unknown>).kind
    : reason;
  return kind !== "error";
}

export type TurnEndFailure = { message: string; code?: string };

/**
 * turn/end 的失败信息（message + 结构化 code）。
 *
 * DSH 会把上游失败归类成 `AUTH` / `RATE_LIMIT` / `TIMEOUT` 等 code，只有 code 才
 * 能区分「模型凭据被拒」和「某个工具调用返回 401」——只按文案里的 401 判断会把
 * 外部知识库的 401 误报成模型 API Key 失效。
 */
export function turnEndFailure(event: { type: string; data?: Record<string, unknown> }): TurnEndFailure | undefined {
  if (event.type !== "turn/end") return undefined;
  const reason = event.data?.reason;
  if (!reason || typeof reason !== "object" || Array.isArray(reason)) return undefined;
  const rec = reason as Record<string, unknown>;
  if (rec.kind !== "error") return undefined;
  const err = rec.error ?? rec.message ?? rec.details ?? rec.reason;
  if (typeof err === "string" && err.trim()) return { message: err };
  if (err && typeof err === "object" && !Array.isArray(err)) {
    const failure = err as Record<string, unknown>;
    const message = typeof failure.message === "string" && failure.message.trim()
      ? failure.message
      : (() => {
        try {
          return JSON.stringify(failure);
        } catch {
          return "error";
        }
      })();
    const code = typeof failure.code === "string" && failure.code.trim() ? failure.code.trim() : undefined;
    return { message, ...(code ? { code } : {}) };
  }
  return { message: "error" };
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
