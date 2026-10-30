import type { ChatMessage } from "@svadmin/core";
import { appendTranscriptGroup, type TranscriptGroup } from "./transcript-groups";
import { hasMessageContent, presentAssistantMessage, type TranscriptMessage } from "./transcript";

export type TranscriptView = {
  displayMessages: TranscriptMessage[];
  aiMessages: ChatMessage[];
  displayGroups: TranscriptGroup[];
  sourceMessages: readonly TranscriptMessage[];
  sourceIndexes: number[];
};

export function transcriptMessageRole(message: TranscriptMessage): ChatMessage["role"] {
  if (message.role === "user") return "user";
  if (message.role === "system") return "system";
  return "assistant";
}

function toAiMessage(message: TranscriptMessage): ChatMessage {
  return {
    id: message.id,
    role: transcriptMessageRole(message),
    parts: [{ type: "text", text: message.text }],
    status: message.pending ? "streaming" : "complete",
    createdAt: message.seq ?? 0,
  };
}

function appendVisibleMessage(
  view: Pick<TranscriptView, "displayMessages" | "aiMessages" | "displayGroups" | "sourceIndexes">,
  message: TranscriptMessage,
  sourceIndex: number,
): void {
  if (!hasMessageContent(message)) return;
  message = presentAssistantMessage(message);
  view.displayMessages.push(message);
  view.aiMessages.push(toAiMessage(message));
  view.sourceIndexes.push(sourceIndex);
  appendTranscriptGroup(view.displayGroups, message);
}

function buildFreshTranscriptView(messages: readonly TranscriptMessage[]): TranscriptView {
  const displayMessages: TranscriptMessage[] = [];
  const aiMessages: ChatMessage[] = [];
  const displayGroups: TranscriptGroup[] = [];
  const sourceIndexes: number[] = [];

  messages.forEach((message, sourceIndex) =>
    appendVisibleMessage({ displayMessages, aiMessages, displayGroups, sourceIndexes }, message, sourceIndex));

  return { displayMessages, aiMessages, displayGroups, sourceMessages: messages, sourceIndexes };
}

function commonPrefixLength(messages: readonly TranscriptMessage[], previous: TranscriptView): number {
  let index = 0;
  while (index < messages.length && index < previous.sourceMessages.length && messages[index] === previous.sourceMessages[index]) {
    index += 1;
  }
  return index;
}

function groupSize(group: TranscriptGroup): number {
  return group.kind === "tools" ? group.messages.length : 1;
}

function rebuildStart(previous: TranscriptView, displayPrefixLength: number, sourcePrefixLength: number): {
  displayIndex: number;
  groupIndex: number;
  sourceIndex: number;
} {
  let displayIndex = 0;
  let groupIndex = 0;
  while (groupIndex < previous.displayGroups.length) {
    const size = groupSize(previous.displayGroups[groupIndex]);
    if (displayIndex + size > displayPrefixLength) break;
    displayIndex += size;
    groupIndex += 1;
  }
  return {
    displayIndex,
    groupIndex,
    sourceIndex: previous.sourceIndexes[displayIndex] ?? sourcePrefixLength,
  };
}

function cloneRetainedGroups(groups: readonly TranscriptGroup[], count: number): TranscriptGroup[] {
  return groups.slice(0, count).map((group, index) => {
    if (index !== count - 1 || group.kind !== "tools") return group;
    return { ...group, messages: [...group.messages] };
  });
}

export function buildTranscriptView(
  messages: readonly TranscriptMessage[],
  previous?: TranscriptView,
): TranscriptView {
  if (!previous) return buildFreshTranscriptView(messages);
  const sourcePrefixLength = commonPrefixLength(messages, previous);
  if (sourcePrefixLength === messages.length && sourcePrefixLength === previous.sourceMessages.length) return previous;

  const displayPrefixLength = previous.sourceIndexes.filter((index) => index < sourcePrefixLength).length;
  const start = rebuildStart(previous, displayPrefixLength, sourcePrefixLength);
  const next: TranscriptView = {
    displayMessages: previous.displayMessages.slice(0, start.displayIndex),
    aiMessages: previous.aiMessages.slice(0, start.displayIndex),
    displayGroups: cloneRetainedGroups(previous.displayGroups, start.groupIndex),
    sourceMessages: messages,
    sourceIndexes: previous.sourceIndexes.slice(0, start.displayIndex),
  };

  messages.slice(start.sourceIndex).forEach((message, offset) =>
    appendVisibleMessage(next, message, start.sourceIndex + offset));
  return next;
}
