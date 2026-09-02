import type { HistoryEntry } from "./dsh-client";
import { extractSources, type TranscriptSource } from "./ai-elements-adapter";

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
  sources?: TranscriptSource[];
};
export type TodoItem = { content: string; status: "pending" | "in_progress" | "completed" };
export type TranscriptState = { messages: TranscriptMessage[]; todos: TodoItem[] };
export type SessionEvent = { type: string; seq: number; data: Record<string, unknown> };

export function foldHistory(entries: HistoryEntry[]): TranscriptState {
  let state: TranscriptState = { messages: [], todos: [] };
  for (const entry of entries) state = applyTranscriptEvent(state, entry.event, entry.view as Record<string, unknown> | undefined);
  state.messages = state.messages.filter(hasMessageContent);
  return state;
}

export function hasMessageContent(message: TranscriptMessage): boolean {
  if (message.role === "tool" || message.pending) return true;
  return !!message.text?.trim() || !!message.reasoning?.trim() || !!message.tool;
}

function extractChunkDelta(data: Record<string, unknown>): { text?: string; reasoning?: string } {
  const chunk = data.chunk;
  if (typeof chunk === "string") {
    return { text: chunk };
  }
  if (typeof data.delta === "string") {
    return { text: data.delta };
  }
  if (typeof data.text === "string" && !data.message) {
    return { text: data.text };
  }
  const record = asRecord(chunk);
  if (!record) return {};

  const type = typeof record.type === "string" ? record.type.toLowerCase() : "";
  const isReasoning = type.includes("reasoning") || type.includes("thought");

  const rawText = typeof record.text === "string"
    ? record.text
    : typeof record.delta === "string"
      ? record.delta
      : typeof record.content === "string"
        ? record.content
        : typeof (asRecord(record.delta)?.content) === "string"
          ? String(asRecord(record.delta)!.content)
          : typeof (asRecord(record.delta)?.text) === "string"
            ? String(asRecord(record.delta)!.text)
            : undefined;

  const rawReasoning = typeof record.reasoning === "string"
    ? record.reasoning
    : typeof record.thought === "string"
      ? record.thought
      : typeof (asRecord(record.delta)?.reasoning) === "string"
        ? String(asRecord(record.delta)!.reasoning)
        : typeof (asRecord(record.delta)?.thought) === "string"
          ? String(asRecord(record.delta)!.thought)
          : undefined;

  if (isReasoning) {
    return { reasoning: rawText || rawReasoning };
  }
  return { text: rawText, reasoning: rawReasoning };
}

export function applyTranscriptEvent(state: TranscriptState, event: SessionEvent, view?: Record<string, unknown>): TranscriptState {
  const messages: TranscriptMessage[] = state.messages.map((item) => ({ ...item, ...(item.tool ? { tool: { ...item.tool } } : {}) }));
  let todos = state.todos;
  const data = event.data || {};

  if (event.type === "user/message") {
    const text = visibleText(data.message ?? data.content ?? data.text);
    if (!text) return { messages, todos };
    const pendingIndex = messages.findIndex((item) => item.pending && item.role === "user" && item.text === text);
    if (pendingIndex >= 0) messages.splice(pendingIndex, 1);
    messages.push({ id: `user-${event.seq}`, role: "user", text, seq: event.seq });
  } else if (event.type === "assistant/chunk") {
    const key = `stream-${String(data.turn ?? "0")}-${String(data.step ?? "0")}`;
    let existing: TranscriptMessage | undefined = messages.find((item) => item.id === key);
    if (!existing) {
      existing = { id: key, role: "assistant", text: "", reasoning: "", pending: true, seq: event.seq };
      messages.push(existing);
    }
    const { text, reasoning } = extractChunkDelta(data);
    if (text) existing.text += text;
    if (reasoning) existing.reasoning = `${existing.reasoning || ""}${reasoning}`;
  } else if (event.type === "assistant/message") {
    const message = data.message;
    const key = `stream-${String(data.turn ?? "0")}-${String(data.step ?? "0")}`;
    const usage = asRecord(data.usage);
    let index = messages.findIndex((item) => item.id === key);
    if (index < 0) {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "assistant" && messages[i].pending) {
          index = i;
          break;
        }
      }
    }
    const existing = index >= 0 ? messages[index] : undefined;
    const rawPayload = message ?? data.content ?? data.text;
    const isFilteredInternal =
      (typeof rawPayload === "string" && isInternalRuntimeText(rawPayload)) ||
      (typeof message === "string" && isInternalRuntimeText(message)) ||
      (typeof data.content === "string" && isInternalRuntimeText(data.content));

    const extractedText = visibleText(rawPayload);
    let resolvedText = extractedText;
    if (!resolvedText && !isFilteredInternal) {
      if (existing?.text && !isInternalRuntimeText(existing.text)) {
        resolvedText = existing.text;
      }
    }

    const extractedReasoning = reasoningText(message ?? data.reasoning);
    const resolvedReasoning = extractedReasoning || (isFilteredInternal ? "" : existing?.reasoning || "");
    const sources = extractSources(message ?? data.content);

    const next: TranscriptMessage = {
      id: `assistant-${event.seq}`,
      role: "assistant",
      text: resolvedText,
      reasoning: resolvedReasoning,
      pending: false,
      seq: event.seq,
      usage,
      sources,
    };

    if (!resolvedText && !resolvedReasoning) {
      if (index >= 0) messages.splice(index, 1);
      return { messages, todos };
    }
    if (index >= 0) messages[index] = next; else messages.push(next);
  } else if (event.type === "tool/call") {
    const callId = String(data.callId ?? `call-${event.seq}`);
    messages.push({ id: `tool-${callId}`, role: "tool", text: String(data.name || "工具调用"), seq: event.seq, sources: extractSources(view), tool: { callId, name: String(data.name || "工具"), args: String(data.arguments || ""), state: "running", view } });
  } else if (event.type === "tool/result") {
    const message = asRecord(data.message);
    const block = Array.isArray(message?.content) ? message.content.map(asRecord).find((item) => item?.type === "tool-result") : undefined;
    const callId = String(data.callId ?? data.toolCallId ?? block?.toolCallId ?? "");
    const existing = messages.find((item) => item.tool?.callId === callId);
    const result = visibleText(block?.content ?? data.message ?? data.content ?? data.result ?? data.meta);
    if (existing?.tool) {
      existing.tool.result = result;
      existing.tool.state = data.error || block?.isError ? "error" : "success";
      existing.tool.view = view || existing.tool.view;
      existing.sources = extractSources([block, data.message, data.content, data.result, data.meta, view]);
    } else {
      messages.push({ id: `tool-result-${event.seq}`, role: "tool", text: "工具结果", seq: event.seq, sources: extractSources([block, data.message, data.content, data.result, data.meta, view]), tool: { callId, name: "工具结果", result, state: data.error || block?.isError ? "error" : "success", view } });
    }
  } else if (event.type === "todo/write") {
    const items = Array.isArray(data.items) ? data.items : Array.isArray(data.todos) ? data.todos : [];
    todos = items.filter(isTodoItem);
  } else if (event.type === "turn/end") {
    return {
      messages: messages.map((m) => (m.pending ? { ...m, pending: false } : m)).filter(hasMessageContent),
      todos,
    };
  }

  return { messages, todos };
}

export function assistantMessageForEvent(
  messages: readonly TranscriptMessage[],
  event: SessionEvent,
): TranscriptMessage | undefined {
  if (event.type !== "assistant/message") return undefined;
  return messages.find((message) => message.id === `assistant-${event.seq}` && message.role === "assistant");
}

export function visibleText(value: unknown): string {
  if (typeof value === "string") return isInternalRuntimeText(value) ? "" : value;
  if (Array.isArray(value)) return value.map((item) => {
    const block = asRecord(item);
    if (block?.type === "reasoning" || block?.type === "thought") return "";
    if (block?.type === "image") return `[图片${asRecord(block.attachment)?.name ? `：${String(asRecord(block.attachment)?.name)}` : ""}]`;
    return visibleText(item);
  }).filter(Boolean).join("\n");
  const record = asRecord(value);
  if (!record) return value == null ? "" : String(value);
  if (record.type === "reasoning" || record.type === "thought") return "";
  if (typeof record.type === "string" && (record.type.includes("source") || record.type.includes("citation"))) return "";
  if (typeof record.text === "string") return visibleText(record.text);
  if (typeof record.content === "string") return visibleText(record.content);
  if (Array.isArray(record.content)) return visibleText(record.content);
  if (Array.isArray(record.parts)) return visibleText(record.parts);
  if (typeof record.value === "string") return visibleText(record.value);
  if (typeof record.delta === "string") return visibleText(record.delta);
  if (typeof record.output === "string") return record.output;
  if (record.message) return visibleText(record.message);
  const serialized = JSON.stringify(value, null, 2);
  return isInternalRuntimeText(serialized) ? "" : serialized;
}

function isInternalRuntimeText(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  const isSnapshotPrompt =
    (normalized.startsWith("current runtime context") || normalized.startsWith("runtime context snapshot")) &&
    normalized.includes("supersedes");
  const isPolicyPrompt =
    normalized.startsWith("current dsh file policy:") ||
    (normalized.startsWith("dsh file policy:") && (normalized.includes("workspace-write") || normalized.includes("readonly")));
  return isSnapshotPrompt || isPolicyPrompt;
}

export function reasoningText(value: unknown): string {
  if (Array.isArray(value)) return value.map(reasoningText).filter(Boolean).join("\n");
  const record = asRecord(value);
  if (!record) return "";
  if ((record.type === "reasoning" || record.type === "thought") && typeof record.text === "string") return record.text;
  if (Array.isArray(record.content)) return reasoningText(record.content);
  if (typeof record.reasoning === "string") return record.reasoning;
  if (typeof record.thought === "string") return record.thought;
  return "";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function isTodoItem(value: unknown): value is TodoItem {
  const item = asRecord(value);
  return !!item && typeof item.content === "string" && (item.status === "pending" || item.status === "in_progress" || item.status === "completed");
}
