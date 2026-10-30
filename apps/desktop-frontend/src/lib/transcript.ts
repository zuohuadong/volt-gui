import type { HistoryEntry } from "./dsh-client";
import { extractSources, type TranscriptSource } from "./ai-elements-adapter";

export type MessageRole = "user" | "assistant" | "tool" | "system";
export type ToolState = "running" | "success" | "error" | "interrupted";
export type ToolInfo = {
  callId: string;
  name: string;
  args?: string;
  result?: string;
  state: ToolState;
  turn?: number;
  view?: Record<string, unknown>;
};
export type TranscriptMessage = {
  id: string;
  role: MessageRole;
  text: string;
  displayText?: string;
  pending?: boolean;
  reasoning?: string;
  protocolWarning?: boolean;
  tool?: ToolInfo;
  seq?: number;
  usage?: Record<string, unknown>;
  sources?: TranscriptSource[];
  attachments?: TranscriptAttachment[];
};
export type TranscriptAttachment = {
  attachmentId?: string;
  name: string;
  bytes?: number;
  mediaType?: string;
  kind: "file" | "image";
};
export type TodoItem = { content: string; status: "pending" | "in_progress" | "completed" };
export type TranscriptState = { messages: TranscriptMessage[]; todos: TodoItem[] };
export type SessionEvent = { type: string; seq: number; data: Record<string, unknown> };

export function mergeHistoryEntries(...groups: readonly HistoryEntry[][]): HistoryEntry[] {
  const byIdentity = new Map<string, HistoryEntry>();
  for (const group of groups) {
    for (const entry of group) {
      const { type, seq, data } = entry.event;
      const identity = isStreamEntry(entry)
        ? `stream:${data.attemptId ?? `${data.turn}:${data.step}`}:${type}:${data.index ?? seq}`
        : `event:${seq}`;
      const existing = byIdentity.get(identity);
      if (!existing || (!existing.view && entry.view)) byIdentity.set(identity, entry);
    }
  }
  return [...byIdentity.values()].sort((left, right) =>
    historyOrder(left) - historyOrder(right)
    || Number(left.event.data.index ?? 0) - Number(right.event.data.index ?? 0));
}

function isStreamEntry(entry: HistoryEntry): boolean {
  return entry.event.type === "assistant/chunk" || entry.event.type.startsWith("chunkrow/");
}

function historyOrder(entry: HistoryEntry): number {
  // 实时片段的 seq 是展示用合成值，必须排在其 durable 起点之后、结束事件之前。
  return isStreamEntry(entry) && typeof entry.event.data.startedAfterSeq === "number"
    ? entry.event.data.startedAfterSeq + 0.5 : entry.event.seq;
}

export function foldHistory(entries: HistoryEntry[]): TranscriptState {
  let state: TranscriptState = { messages: [], todos: [] };
  for (const entry of mergeHistoryEntries(entries)) {
    state = applyTranscriptEvent(state, entry.event, entry.view as Record<string, unknown> | undefined);
  }
  state.messages = state.messages.filter(hasMessageContent);
  return state;
}

export function interruptRunningTools(state: TranscriptState): TranscriptState {
  let changed = false;
  const messages = state.messages.map((message) => {
    const next = message.tool?.state === "running"
      ? { ...message, tool: { ...message.tool, state: "interrupted" as const } }
      : message;
    if (next !== message) changed = true;
    return next;
  });
  return changed ? { messages, todos: state.todos } : state;
}

export function hasMessageContent(message: TranscriptMessage): boolean {
  if (message.role === "tool" || message.pending) return true;
  if (message.protocolWarning || (message.role === "assistant" && hasUnparsedToolMarkup(message))) return true;
  return isVisibleMessageText(message.text) || isVisibleReasoning(message.reasoning) || !!message.tool;
}

const dsmlMarker = /<\s*\/?\s*[|｜]\s*\/?\s*DSML(?:\s*[|｜]|\s*$)/iu;
const partialDsmlMarker = /<\s*(?:\/\s*)?[|｜]\s*\/?\s*D(?:S(?:M(?:L)?)?)?\s*$/iu;

export function hasUnparsedToolMarkup(message: TranscriptMessage): boolean {
  return findUnparsedToolMarkup(message.text) >= 0 || findUnparsedToolMarkup(message.reasoning ?? "") >= 0;
}

export function presentAssistantMessage(message: TranscriptMessage): TranscriptMessage {
  if (message.role !== "assistant") return message;
  const present = (text: string): string => {
    const marker = findUnparsedToolMarkup(text);
    // 异常协议之后可能仍是命令参数，不能只删标签后把参数当正文，也不能在 UI 执行它们。
    if (marker >= 0) return text.slice(0, marker).trimEnd();
    return message.pending ? text.replace(/<\s*(?:\/\s*)?[|｜]\s*\/?\s*(?:D(?:S(?:M(?:L\s*)?)?)?)?$/iu, "") : text;
  };
  const text = present(message.text);
  const reasoning = message.reasoning === undefined ? undefined : present(message.reasoning);
  const protocolWarning = message.protocolWarning || hasUnparsedToolMarkup(message);
  return text === message.text && reasoning === message.reasoning && !protocolWarning
    ? message : { ...message, text, reasoning, protocolWarning };
}

function findUnparsedToolMarkup(text: string): number {
  const masked = markdownCodeMask(text);
  const complete = new RegExp(dsmlMarker.source, "giu");
  for (const match of text.matchAll(complete)) {
    if (!masked[match.index ?? 0]) return match.index ?? -1;
  }
  const partial = text.match(partialDsmlMarker);
  if (partial && !masked[text.length - partial[0].length]) return text.length - partial[0].length;
  return -1;
}

function markdownCodeMask(text: string): boolean[] {
  const masked = Array.from({ length: text.length }, () => false);
  let fenced = false;
  let inline = false;
  for (let index = 0; index < text.length; index += 1) {
    if (index === 0 || text[index - 1] === "\n") {
      const lineEnd = text.indexOf("\n", index);
      const line = text.slice(index, lineEnd < 0 ? text.length : lineEnd);
      if (/^\s*```/u.test(line)) {
        for (let lineIndex = index; lineIndex < (lineEnd < 0 ? text.length : lineEnd); lineIndex += 1) masked[lineIndex] = true;
        fenced = !fenced;
        if (lineEnd >= 0) masked[lineEnd] = true;
        index = lineEnd < 0 ? text.length : lineEnd;
        continue;
      }
    }
    if (fenced) {
      masked[index] = true;
      continue;
    }
    if (text[index] === "`") {
      masked[index] = true;
      inline = !inline;
      continue;
    }
    if (inline) masked[index] = true;
  }
  return masked;
}

export function isVisibleMessageText(value: string | undefined): value is string {
  const text = value?.trim();
  if (!text) return false;
  return !/['"]type['"]\s*:\s*['"]tool[-_](?:call|use|result)['"]/iu.test(text);
}

export function isVisibleReasoning(value: string | undefined): value is string {
  const text = value?.trim();
  if (!text) return false;
  if (!isVisibleMessageText(text)) return false;

  const json = text.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  try {
    const parsed = JSON.parse(json) as unknown;
    const record = asRecord(parsed);
    const type = typeof record?.type === "string" ? record.type.toLowerCase() : "";
    return !["tool-call", "tool-use", "tool-result", "tool_result"].includes(type);
  } catch {
    return true;
  }
}

function extractChunkDelta(data: Record<string, unknown>): { text?: string; reasoning?: string } {
  const chunk = data.chunk;
  const topLevelText = typeof data.delta === "string"
    ? data.delta
    : typeof data.text === "string" && !data.message
      ? data.text
      : undefined;
  const topLevelReasoning = typeof data.reasoning === "string"
    ? data.reasoning
    : typeof data.thought === "string"
      ? data.thought
      : undefined;
  let chunkText = "";
  let chunkReasoning = "";
  if (typeof chunk === "string") {
    chunkText = chunk;
  } else {
    const record = asRecord(chunk);
    if (record) {
      const type = typeof record.type === "string" ? record.type.toLowerCase() : "";
      const rawText = typeof record.text === "string"
        ? record.text
        : typeof record.delta === "string"
          ? record.delta
          : typeof record.content === "string"
            ? record.content
            : undefined;
      const rawReasoning = reasoningText(record);
      if (type.includes("reasoning") || type.includes("thought")) chunkReasoning = rawText || rawReasoning;
      else {
        chunkText = rawText || "";
        chunkReasoning = rawReasoning;
      }
    }
  }
  const text = chunkText || topLevelText || "";
  const reasoning = mergeReasoning(chunkReasoning, topLevelReasoning || "");
  return { text: text || undefined, reasoning: reasoning || undefined };
}

function extractPackedChunkDelta(event: SessionEvent): { text?: string; reasoning?: string } {
  const texts = Array.isArray(event.data.texts)
    ? event.data.texts.filter((text): text is string => typeof text === "string")
    : [];
  if (texts.length === 0) return {};
  const content = texts.join("");
  return event.type === "chunkrow/reasoning-chunks" ? { reasoning: content } : { text: content };
}

export function applyTranscriptEvent(state: TranscriptState, event: SessionEvent, view?: Record<string, unknown>): TranscriptState {
  const messages: TranscriptMessage[] = state.messages.slice();
  let todos = state.todos;
  const data = event.data || {};

  if (event.type === "assistant/attempt") {
    // 持久化 attempt 是完整快照；替换实时片段，不能再次追加。
    const stream = Array.isArray(data.stream) ? data.stream : [];
    let text = "";
    let reasoning = "";
    for (const item of stream) {
      const record = asRecord(item);
      if (!record) continue;
      const delta = record.type === "reasoning-chunks" || record.type === "text-chunks"
        ? extractPackedChunkDelta({ type: `chunkrow/${record.type}`, seq: event.seq, data: record })
        : record.type === "chunk" ? extractChunkDelta({ chunk: record.chunk }) : {};
      text += delta.text || "";
      reasoning += delta.reasoning || "";
    }
    const key = `stream-${String(data.turn ?? "0")}-${String(data.step ?? "0")}`;
    const index = messages.findIndex((item) => item.id === key);
    const next: TranscriptMessage = {
      id: `attempt-${event.seq}`, role: "assistant", text, reasoning, pending: false, seq: event.seq,
    };
    if (index >= 0) messages.splice(index, 1);
    if (hasMessageContent(next)) {
      if (index >= 0) messages.splice(index, 0, next);
      else messages.push(next);
    }
    return { messages, todos };
  } else if (event.type === "user/message") {
    const source = asRecord(data.source);
    if (source && typeof source.kind === "string" && source.kind !== "user") {
      return { messages, todos };
    }
    const rawText = visibleText(data.message ?? data.content ?? data.text);
    if (!rawText) return { messages, todos };
    const text = stripInternalPromptSuffix(rawText);
    if (!text) return { messages, todos };
    const pendingIndex = messages.findIndex((item) =>
      item.pending && item.role === "user" && (item.text.trim() === text.trim() || item.text.trim() === rawText.trim() || rawText.trim().startsWith(item.text.trim()))
    );
    if (pendingIndex >= 0) messages.splice(pendingIndex, 1);
    messages.push({
      id: `user-${event.seq}`, role: "user", text, seq: event.seq,
      displayText: stripInternalPromptSuffix(visibleText(data.message ?? data.content ?? data.text, false)),
      attachments: extractAttachments(data.message ?? data.content ?? data.text),
    });
  } else if (event.type === "assistant/chunk" || event.type === "chunkrow/text-chunks" || event.type === "chunkrow/reasoning-chunks") {
    const { text, reasoning } = event.type === "assistant/chunk" ? extractChunkDelta(data) : extractPackedChunkDelta(event);
    if (!text && !reasoning) return { messages, todos };
    const key = `stream-${String(data.turn ?? "0")}-${String(data.step ?? "0")}`;
    const existingIndex = messages.findIndex((item) => item.id === key);
    const existing = existingIndex >= 0 ? messages[existingIndex] : undefined;
    if (!existing) {
      messages.push({ id: key, role: "assistant", text: text || "", reasoning: reasoning || "", pending: true, seq: event.seq });
    } else {
      messages[existingIndex] = {
        ...existing,
        text: text ? `${existing.text}${text}` : existing.text,
        reasoning: reasoning ? `${existing.reasoning || ""}${reasoning}` : existing.reasoning,
      };
    }
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

    const extractedReasoning = mergeReasoning(
      typeof message === "string" ? "" : reasoningText(message),
      reasoningText(data.reasoning),
    );
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
      attachments: extractAttachments(rawPayload),
    };

    if (!resolvedText && !resolvedReasoning) {
      if (index >= 0) messages.splice(index, 1);
      return { messages, todos };
    }
    if (index >= 0) messages[index] = next; else messages.push(next);
  } else if (event.type === "tool/call") {
    const callId = String(data.callId ?? `call-${event.seq}`);
    // 历史快照与实时缓冲可能重叠；重放不能覆盖已收到的结果。
    if (messages.some((item) => item.tool?.callId === callId
      && (data.turn === undefined || item.tool.turn === undefined || item.tool.turn === data.turn))) return state;
    const nextTool: TranscriptMessage = {
      id: `tool-${event.seq}-${callId}`,
      role: "tool",
      text: String(data.name || "工具调用"),
      seq: event.seq,
      sources: extractSources(view),
      tool: {
        callId,
        name: String(data.name || "工具"),
        args: serializeToolArguments(data.arguments),
        state: "running",
        turn: typeof data.turn === "number" ? data.turn : undefined,
        view,
      },
    };
    messages.push(nextTool);
  } else if (event.type === "tool/result") {
    const message = asRecord(data.message);
    const block = Array.isArray(message?.content) ? message.content.map(asRecord).find((item) => item?.type === "tool-result") : undefined;
    const explicitCallId = String(data.callId ?? data.toolCallId ?? message?.toolCallId ?? block?.toolCallId ?? "");
    const resultToolName = String(data.name ?? message?.name ?? block?.name ?? "");
    const resultState: ToolState = data.error || message?.isError || block?.isError ? "error" : "success";
    let existingIndex = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const item = messages[index];
      const callIdMatches = explicitCallId
        ? item.tool?.callId === explicitCallId
        : item.tool?.state === "running" && (!resultToolName || item.tool.name === resultToolName);
      if (callIdMatches
        && (data.turn === undefined || item.tool?.turn === undefined || item.tool.turn === data.turn)
        && (item.seq === undefined || item.seq <= event.seq)) {
        existingIndex = index;
        break;
      }
    }
    const existing = existingIndex >= 0 ? messages[existingIndex] : undefined;
    const callId = explicitCallId || existing?.tool?.callId || "";
    const result = visibleText(block?.content ?? data.message ?? data.content ?? data.result ?? data.meta)
      || visibleText(data.error ?? message?.error ?? block?.error);
    if (existing?.tool) {
      messages[existingIndex] = {
        ...existing,
        sources: extractSources([block, data.message, data.content, data.result, data.meta, view]),
        tool: {
          ...existing.tool,
          result,
          state: resultState,
          view: view || existing.tool.view,
        },
      };
    } else {
      messages.push({ id: `tool-result-${event.seq}`, role: "tool", text: "工具结果", seq: event.seq, sources: extractSources([block, data.message, data.content, data.result, data.meta, view]), tool: { callId, name: "工具结果", result, state: resultState, turn: typeof data.turn === "number" ? data.turn : undefined, view } });
    }
  } else if (event.type === "todo/write") {
    const items = Array.isArray(data.items) ? data.items : Array.isArray(data.todos) ? data.todos : [];
    todos = items.filter(isTodoItem);
  } else if (event.type === "turn/end") {
    // 结束只确认不再执行；没有结果不能伪造成功或工具错误。
    const closedMessages = messages.map((message) => {
      if (message.seq !== undefined && message.seq > event.seq) return message;
      if (message.tool?.state === "running"
        && (data.turn === undefined || message.tool.turn === undefined || message.tool.turn === data.turn)) {
        return { ...message, tool: { ...message.tool, state: "interrupted" as const } };
      }
      return message.pending ? { ...message, pending: false } : message;
    }).filter(hasMessageContent);
    return {
      messages: closedMessages.every((message, index) => message === state.messages[index])
        && closedMessages.length === state.messages.length ? state.messages : closedMessages,
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

export function visibleText(value: unknown, includeAttachments = true): string {
  if (typeof value === "string") return isInternalRuntimeText(value) ? "" : value;
  if (Array.isArray(value)) return value.map((item) => {
    const block = asRecord(item);
    if (block?.type === "reasoning" || block?.type === "thought") return "";
    if (block?.type === "image") return includeAttachments ? `[图片${asRecord(block.attachment)?.name ? `：${String(asRecord(block.attachment)?.name)}` : ""}]` : "";
    if (block?.type === "file") return includeAttachments ? `[文件：${String(asRecord(block.attachment)?.name || "附件")}]` : "";
    return visibleText(item, includeAttachments);
  }).filter(Boolean).join("\n");
  const record = asRecord(value);
  if (!record) return value == null ? "" : String(value);
  if (record.type === "reasoning" || record.type === "thought") return "";
  if (typeof record.type === "string" && (record.type.includes("source") || record.type.includes("citation"))) return "";
  if (typeof record.text === "string") return visibleText(record.text);
  if (typeof record.content === "string") return visibleText(record.content);
  if (Array.isArray(record.content)) return visibleText(record.content, includeAttachments);
  if (Array.isArray(record.parts)) return visibleText(record.parts, includeAttachments);
  if (typeof record.value === "string") return visibleText(record.value);
  if (typeof record.delta === "string") return visibleText(record.delta);
  if (typeof record.output === "string") return record.output;
  if (record.message) return visibleText(record.message, includeAttachments);
  const serialized = JSON.stringify(value, null, 2);
  return isInternalRuntimeText(serialized) ? "" : serialized;
}

export function extractAttachments(value: unknown): TranscriptAttachment[] {
  const attachments: TranscriptAttachment[] = [];
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    const record = asRecord(candidate);
    if (!record) return;
    if (record.type === "file" || record.type === "image") {
      const attachment = asRecord(record.attachment);
      attachments.push({
        attachmentId: typeof attachment?.attachmentId === "string" ? attachment.attachmentId : undefined,
        name: typeof attachment?.name === "string" && attachment.name.trim() ? attachment.name : record.type === "image" ? "图片" : "附件",
        bytes: typeof attachment?.bytes === "number" ? attachment.bytes : undefined,
        mediaType: typeof attachment?.mediaType === "string" ? attachment.mediaType : undefined,
        kind: record.type,
      });
      return;
    }
    visit(record.message);
    visit(record.content);
    visit(record.parts);
  };
  visit(value);
  return attachments.filter((attachment, index, all) =>
    all.findIndex((candidate) => candidate.attachmentId === attachment.attachmentId && candidate.name === attachment.name) === index
  );
}

function isInternalRuntimeText(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  const isSystemReminder =
    normalized.startsWith("<system-reminder>") ||
    (normalized.includes("<system-reminder>") &&
      (normalized.includes("<available_skills>") ||
        normalized.includes("instructions from:") ||
        normalized.includes("workspace instructions") ||
        normalized.includes("reusable set of task-specific instructions")));
  const isSnapshotPrompt =
    (normalized.startsWith("current runtime context") || normalized.startsWith("runtime context snapshot")) &&
    normalized.includes("supersedes");
  const isPolicyPrompt =
    normalized.startsWith("current dsh file policy:") ||
    (normalized.startsWith("dsh file policy:") && (normalized.includes("workspace-write") || normalized.includes("readonly")));
  const isInternalProtocolOnly =
    normalized.startsWith("[volt ui customization protocol]") ||
    normalized.startsWith("[volt host policy]");
  return isSystemReminder || isSnapshotPrompt || isPolicyPrompt || isInternalProtocolOnly;
}

export function stripInternalPromptSuffix(text: string): string {
  const voltUiProtocolIndex = text.indexOf("\n\n[Volt UI customization protocol]");
  if (voltUiProtocolIndex >= 0) return text.slice(0, voltUiProtocolIndex).trim();
  const voltHostPolicyIndex = text.indexOf("\n\n[Volt host policy]");
  if (voltHostPolicyIndex >= 0) {
    const match = text.match(/User request:\s*([\s\S]*?)(?:\n\n\[Volt host policy\]|$)/);
    if (match && match[1].trim()) return match[1].trim();
    return text.slice(0, voltHostPolicyIndex).trim();
  }
  return text;
}

export function reasoningText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(reasoningText).filter(Boolean).join("\n");
  const record = asRecord(value);
  if (!record) return "";
  if (record.type === "reasoning" || record.type === "thought") {
    return reasoningText(record.text ?? record.content ?? record.delta ?? record.reasoning ?? record.thought);
  }
  if (Array.isArray(record.content)) return reasoningText(record.content);
  if (typeof record.reasoning === "string") return record.reasoning;
  if (typeof record.thought === "string") return record.thought;
  return "";
}

function mergeReasoning(primary: string, secondary: string): string {
  if (!primary) return secondary;
  if (!secondary || primary === secondary || primary.endsWith(secondary)) return primary;
  if (secondary.startsWith(primary)) return secondary;
  return `${primary}${secondary}`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function serializeToolArguments(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isTodoItem(value: unknown): value is TodoItem {
  const item = asRecord(value);
  return !!item && typeof item.content === "string" && (item.status === "pending" || item.status === "in_progress" || item.status === "completed");
}
