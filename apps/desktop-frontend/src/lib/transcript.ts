import type { HistoryEntry } from "./dsh-client";

export type MessageRole = "user" | "assistant" | "tool" | "system";
export type ToolState = "running" | "success" | "error";
export type ToolInfo = {
  callId: string;
  name: string;
  args?: string;
  result?: string;
  state: ToolState;
  view?: Record<string, unknown>;
};
export type TranscriptMessage = {
  id: string;
  role: MessageRole;
  text: string;
  pending?: boolean;
  reasoning?: string;
  tool?: ToolInfo;
  seq?: number;
  usage?: Record<string, unknown>;
};
export type TodoItem = { content: string; status: "pending" | "in_progress" | "completed" };
export type TranscriptState = { messages: TranscriptMessage[]; todos: TodoItem[] };
export type SessionEvent = { type: string; seq: number; data: Record<string, unknown> };

export function foldHistory(entries: HistoryEntry[]): TranscriptState {
  let state: TranscriptState = { messages: [], todos: [] };
  for (const entry of entries) state = applyTranscriptEvent(state, entry.event, entry.view as Record<string, unknown> | undefined);
  return state;
}

export function applyTranscriptEvent(state: TranscriptState, event: SessionEvent, view?: Record<string, unknown>): TranscriptState {
  const messages: TranscriptMessage[] = state.messages.map((item) => ({ ...item, ...(item.tool ? { tool: { ...item.tool } } : {}) }));
  let todos = state.todos;
  const data = event.data || {};

  if (event.type === "user/message") {
    const text = visibleText(data.message ?? data.content);
    const pendingIndex = messages.findIndex((item) => item.pending && item.role === "user" && item.text === text);
    if (pendingIndex >= 0) messages.splice(pendingIndex, 1);
    messages.push({ id: `user-${event.seq}`, role: "user", text, seq: event.seq });
  } else if (event.type === "assistant/chunk") {
    const chunk = asRecord(data.chunk);
    const key = `stream-${String(data.turn ?? "0")}-${String(data.step ?? "0")}`;
    let existing: TranscriptMessage | undefined = messages.find((item) => item.id === key);
    if (!existing) {
      existing = { id: key, role: "assistant", text: "", reasoning: "", pending: true, seq: event.seq };
      messages.push(existing);
    }
    if (chunk?.type === "text-delta" && typeof chunk.text === "string") existing.text += chunk.text;
    if (chunk?.type === "reasoning-delta" && typeof chunk.text === "string") existing.reasoning = `${existing.reasoning || ""}${chunk.text}`;
  } else if (event.type === "assistant/message") {
    const message = data.message;
    const key = `stream-${String(data.turn ?? "0")}-${String(data.step ?? "0")}`;
    const usage = asRecord(data.usage);
    const next = { id: `assistant-${event.seq}`, role: "assistant" as const, text: visibleText(message ?? data.content), reasoning: reasoningText(message ?? data.reasoning), pending: false, seq: event.seq, usage };
    const index = messages.findIndex((item) => item.id === key);
    if (index >= 0) messages[index] = next; else messages.push(next);
  } else if (event.type === "tool/call") {
    const callId = String(data.callId ?? `call-${event.seq}`);
    messages.push({ id: `tool-${callId}`, role: "tool", text: String(data.name || "工具调用"), seq: event.seq, tool: { callId, name: String(data.name || "工具"), args: String(data.arguments || ""), state: "running", view } });
  } else if (event.type === "tool/result") {
    const message = asRecord(data.message);
    const block = Array.isArray(message?.content) ? message.content.map(asRecord).find((item) => item?.type === "tool-result") : undefined;
    const callId = String(data.callId ?? data.toolCallId ?? block?.toolCallId ?? "");
    const existing = messages.find((item) => item.tool?.callId === callId);
    const result = visibleText(block?.content ?? data.message ?? data.content ?? data.result ?? data.meta);
    if (existing?.tool) {
      existing.tool.result = result;
      existing.tool.state = data.error || block?.isError ? "error" : "success";
    } else {
      messages.push({ id: `tool-result-${event.seq}`, role: "tool", text: "工具结果", seq: event.seq, tool: { callId, name: "工具结果", result, state: data.error || block?.isError ? "error" : "success", view } });
    }
  } else if (event.type === "todo/write") {
    const items = Array.isArray(data.items) ? data.items : Array.isArray(data.todos) ? data.todos : [];
    todos = items.filter(isTodoItem);
  }

  return { messages, todos };
}

export function visibleText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => {
    const block = asRecord(item);
    if (block?.type === "reasoning") return "";
    if (block?.type === "image") return `[图片${asRecord(block.attachment)?.name ? `：${String(asRecord(block.attachment)?.name)}` : ""}]`;
    return visibleText(item);
  }).filter(Boolean).join("\n");
  const record = asRecord(value);
  if (!record) return value == null ? "" : String(value);
  if (record.type === "reasoning") return "";
  if (typeof record.text === "string") return record.text;
  if (typeof record.content === "string") return record.content;
  if (Array.isArray(record.content)) return visibleText(record.content);
  if (typeof record.output === "string") return record.output;
  return JSON.stringify(value, null, 2);
}

export function reasoningText(value: unknown): string {
  if (Array.isArray(value)) return value.map(reasoningText).filter(Boolean).join("\n");
  const record = asRecord(value);
  if (!record) return "";
  if (record.type === "reasoning" && typeof record.text === "string") return record.text;
  if (Array.isArray(record.content)) return reasoningText(record.content);
  if (typeof record.reasoning === "string") return record.reasoning;
  return "";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function isTodoItem(value: unknown): value is TodoItem {
  const item = asRecord(value);
  return !!item && typeof item.content === "string" && (item.status === "pending" || item.status === "in_progress" || item.status === "completed");
}
