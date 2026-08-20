import { describe, expect, test } from "vitest";

import type { TranscriptItem } from "./types";
import { insertTurnTranscriptItem } from "./transcript-order";

function transcriptItem(id: string, role: TranscriptItem["role"]): TranscriptItem {
  return { id, role, body: id };
}

describe("turn transcript ordering", () => {
  test("places late reasoning before the pending final answer", () => {
    const transcript = [
      transcriptItem("user", "user"),
      { ...transcriptItem("assistant", "assistant"), pending: true },
    ];

    const nextTranscript = insertTurnTranscriptItem(
      transcript,
      { ...transcriptItem("reasoning", "reasoning"), pending: true },
    );

    expect(nextTranscript.map((entry) => entry.id)).toEqual(["user", "reasoning", "assistant"]);
    expect(transcript.map((entry) => entry.id)).toEqual(["user", "assistant"]);
  });

  test("keeps reasoning and tools in arrival order ahead of the final answer", () => {
    let transcript = [
      transcriptItem("user", "user"),
      { ...transcriptItem("assistant", "assistant"), pending: true },
    ];

    transcript = insertTurnTranscriptItem(transcript, { ...transcriptItem("reasoning", "reasoning"), pending: true });
    transcript = insertTurnTranscriptItem(transcript, { ...transcriptItem("tool", "tool"), pending: true });

    expect(transcript.map((entry) => entry.id)).toEqual(["user", "reasoning", "tool", "assistant"]);
  });

  test("does not move evidence across turns or completed answers", () => {
    const completed = [
      transcriptItem("old-user", "user"),
      transcriptItem("old-answer", "assistant"),
      transcriptItem("new-user", "user"),
    ];

    expect(insertTurnTranscriptItem(completed, transcriptItem("tool", "tool")).map((entry) => entry.id)).toEqual([
      "old-user",
      "old-answer",
      "new-user",
      "tool",
    ]);
  });
});
