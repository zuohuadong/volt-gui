import type { TranscriptMessage } from "./transcript";

export type TranscriptGroup =
  | { kind: "message"; id: string; message: TranscriptMessage }
  | { kind: "tools"; id: string; messages: TranscriptMessage[] };

export function groupTranscript(messages: readonly TranscriptMessage[]): TranscriptGroup[] {
  const groups: TranscriptGroup[] = [];
  for (const message of messages) {
    appendTranscriptGroup(groups, message);
  }
  return groups;
}

export function appendTranscriptGroup(groups: TranscriptGroup[], message: TranscriptMessage): void {
  const previous = groups.at(-1);
  if (message.role !== "tool" || !message.tool) {
    groups.push({ kind: "message", id: message.id, message });
  } else if (previous?.kind === "tools") {
    previous.messages.push(message);
  } else {
    groups.push({ kind: "tools", id: message.id, messages: [message] });
  }
}
