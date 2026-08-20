import type { TranscriptItem } from "./types";

export type TranscriptProcessItem = TranscriptItem & { role: "reasoning" | "tool" };
export type TranscriptConversationItem = TranscriptItem & {
  role: Exclude<TranscriptItem["role"], "reasoning" | "tool">;
};

export type TranscriptRenderEntry =
  | { kind: "item"; id: string; item: TranscriptConversationItem }
  | { kind: "process"; id: string; items: TranscriptProcessItem[] };

function isProcessItem(transcriptItem: TranscriptItem): transcriptItem is TranscriptProcessItem {
  return transcriptItem.role === "reasoning" || transcriptItem.role === "tool";
}

export function groupTranscriptProcessItems(transcriptItems: TranscriptItem[]): TranscriptRenderEntry[] {
  const entries: TranscriptRenderEntry[] = [];
  for (const transcriptItem of transcriptItems) {
    if (!isProcessItem(transcriptItem)) {
      entries.push({ kind: "item", id: transcriptItem.id, item: transcriptItem as TranscriptConversationItem });
      continue;
    }
    const previousEntry = entries[entries.length - 1];
    if (previousEntry?.kind === "process") {
      previousEntry.items.push(transcriptItem);
      continue;
    }
    entries.push({ kind: "process", id: `process-${transcriptItem.id}`, items: [transcriptItem] });
  }
  return entries;
}
