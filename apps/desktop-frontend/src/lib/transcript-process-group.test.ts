import { describe, expect, test } from "vitest";

import type { TranscriptItem } from "./types";
import { groupTranscriptProcessItems } from "./transcript-process-group";

function transcriptItem(id: string, role: TranscriptItem["role"], patch: Partial<TranscriptItem> = {}): TranscriptItem {
  return { id, role, body: id, ...patch };
}

describe("transcript process grouping", () => {
  test("handles empty and single-item transcripts", () => {
    expect(groupTranscriptProcessItems([])).toEqual([]);
    expect(groupTranscriptProcessItems([transcriptItem("tool-1", "tool")])).toEqual([
      { kind: "process", id: "process-tool-1", items: [transcriptItem("tool-1", "tool")] },
    ]);
  });

  test("folds adjacent reasoning and tools without losing live or failed state", () => {
    const reasoning = transcriptItem("reasoning-1", "reasoning", { pending: true });
    const tool = transcriptItem("tool-1", "tool", { error: "command failed" });

    expect(groupTranscriptProcessItems([reasoning, tool])).toEqual([
      { kind: "process", id: "process-reasoning-1", items: [reasoning, tool] },
    ]);
  });

  test("keeps answers, user messages, and notices outside process folds in timeline order", () => {
    const entries = groupTranscriptProcessItems([
      transcriptItem("user-1", "user"),
      transcriptItem("reasoning-1", "reasoning"),
      transcriptItem("tool-1", "tool"),
      transcriptItem("assistant-1", "assistant"),
      transcriptItem("tool-2", "tool"),
      transcriptItem("notice-1", "notice"),
    ]);

    expect(entries.map((entry) => [entry.kind, entry.id])).toEqual([
      ["item", "user-1"],
      ["process", "process-reasoning-1"],
      ["item", "assistant-1"],
      ["process", "process-tool-2"],
      ["item", "notice-1"],
    ]);
  });
});
