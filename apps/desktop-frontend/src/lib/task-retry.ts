import { hasUnparsedToolMarkup, type TodoItem, type TranscriptMessage } from "./transcript";
import type { HistoryEntry } from "./dsh-client";

export function turnEndKind(history: readonly HistoryEntry[]): string {
  const lastEnd = history.reduce<HistoryEntry | undefined>((latest, entry) =>
    entry.event.type === "turn/end" && (!latest || entry.event.seq > latest.event.seq) ? entry : latest, undefined);
  const reason = lastEnd?.event.data.reason;
  if (reason && typeof reason === "object" && !Array.isArray(reason)) {
    return typeof (reason as Record<string, unknown>).kind === "string"
      ? String((reason as Record<string, unknown>).kind)
      : "";
  }
  return typeof reason === "string" ? reason : "";
}

export function latestTurnEndSeq(history: readonly HistoryEntry[]): number | undefined {
  return history.reduce<number | undefined>((latest, entry) =>
    entry.event.type === "turn/end" && (latest === undefined || entry.event.seq > latest) ? entry.event.seq : latest, undefined);
}

export function latestUserPrompt(messages: readonly TranscriptMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") continue;
    const text = (message.text || message.displayText || "").trim();
    if (text) return text;
  }
  return "";
}

export function hasRetryableTask(
  messages: readonly TranscriptMessage[],
  todos: readonly TodoItem[],
  sending: boolean,
  history: readonly HistoryEntry[] = [],
): boolean {
  return taskRecoveryReason(messages, todos, sending, history) !== undefined;
}

export type TaskRecoveryReason = "unfinished" | "interrupted" | "blocked" | "error" | "maxTokens" | "protocol";

/** 单轮输出上限自动续写的次数上限，超过后交回用户手动决定。 */
export const AUTO_CONTINUE_LIMIT = 3;

/** 输出用量接近上限时的预警阈值。 */
export const OUTPUT_LIMIT_WARNING_RATIO = 0.85;

export interface AutoContinueContext {
  readonly sending: boolean;
  readonly continuing: boolean;
  readonly attempts: number;
  readonly limit?: number;
  readonly enabled?: boolean;
  readonly hasPendingInteraction?: boolean;
  readonly connectionError?: boolean;
  readonly sessionRunning?: boolean;
}

/**
 * 命中输出上限时是否自动续写。
 * 只对 `max-tokens` 生效：用户中断、协议错误、权限阻塞仍需人工确认。
 */
export function shouldAutoContinue(
  reason: TaskRecoveryReason | undefined,
  context: AutoContinueContext,
): boolean {
  if (reason !== "maxTokens") return false;
  if (context.enabled === false) return false;
  if (context.sending || context.continuing) return false;
  if (context.hasPendingInteraction || context.connectionError || context.sessionRunning) return false;
  return context.attempts < (context.limit ?? AUTO_CONTINUE_LIMIT);
}

const OUTPUT_TOKEN_KEYS = ["outputTokens", "output_tokens", "completionTokens", "completion_tokens", "output"];

function numeric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** 从官方 DSH 的 usage 对象中读取输出 token 数，字段命名兼容三套约定。 */
export function outputTokensFromUsage(usage: unknown): number | undefined {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return undefined;
  const record = usage as Record<string, unknown>;
  for (const key of OUTPUT_TOKEN_KEYS) {
    const value = numeric(record[key]);
    if (value !== undefined) return value;
  }
  for (const nested of [record.totals, record.total, record.usage]) {
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) continue;
    const inner = nested as Record<string, unknown>;
    for (const key of OUTPUT_TOKEN_KEYS) {
      const value = numeric(inner[key]);
      if (value !== undefined) return value;
    }
  }
  return numeric(record.totalTokens) ?? numeric(record.total_tokens);
}

/** 最近一轮中单条回复的最大输出 token 数；达到输出上限时通常就是它触顶。 */
export function latestOutputTokens(messages: readonly TranscriptMessage[]): number | undefined {
  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") {
      lastUserIndex = index;
      break;
    }
  }
  let tokens: number | undefined;
  for (let index = lastUserIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role !== "assistant") continue;
    const value = outputTokensFromUsage(message.usage);
    if (value !== undefined && (tokens === undefined || value > tokens)) tokens = value;
  }
  return tokens;
}

/** 是否应当在命中上限前提示用户先拆分任务。 */
export function approachingOutputLimit(tokens: number | undefined, limit: number | undefined): boolean {
  if (!tokens || !limit || limit <= 0) return false;
  return tokens >= limit * OUTPUT_LIMIT_WARNING_RATIO && tokens < limit;
}

export function taskRecoveryReason(
  messages: readonly TranscriptMessage[],
  todos: readonly TodoItem[],
  sending: boolean,
  history: readonly HistoryEntry[] = [],
): TaskRecoveryReason | undefined {
  if (sending || !latestUserPrompt(messages)) return undefined;
  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") {
      lastUserIndex = index;
      break;
    }
  }
  const currentTaskMessages = lastUserIndex >= 0 ? messages.slice(lastUserIndex + 1) : messages;
  const userSeq = messages[lastUserIndex]?.seq;
  const currentHistory = userSeq === undefined ? history : history.filter((entry) => entry.event.seq > userSeq);
  const kind = turnEndKind(currentHistory);
  if (kind === "max-tokens") return "maxTokens";
  if (kind === "blocked") return "blocked";
  let latestAssistant: TranscriptMessage | undefined;
  for (let index = currentTaskMessages.length - 1; index >= 0; index -= 1) {
    if (currentTaskMessages[index].role === "assistant") {
      latestAssistant = currentTaskMessages[index];
      break;
    }
  }
  if (latestAssistant && hasUnparsedToolMarkup(latestAssistant)) return "protocol";
  if (kind === "error") return "error";
  if (["interrupted", "aborted", "cancelled", "canceled", "timeout", "incomplete", "stopped", "stop", "forked"].includes(kind)) return "interrupted";
  if (todos.some((todo) => todo.status !== "completed")) return "unfinished";
  if (currentTaskMessages.some((message) => message.tool?.state === "interrupted" || message.tool?.state === "running")) return "interrupted";
  if (currentTaskMessages.some((message) => message.tool?.state === "error")) return "error";
  return undefined;
}
