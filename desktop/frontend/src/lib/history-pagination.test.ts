import { describe, expect, test } from "vitest";
import type { TranscriptItem } from "./types";
import {
  anchoredScrollTop,
  isCurrentHistoryRequest,
  prependTranscriptPage,
  trimLiveTranscript,
} from "./history-pagination";

function item(id: string, role: TranscriptItem["role"]): TranscriptItem {
  return { id, role, body: id };
}

describe("history pagination", () => {
  test("prepends older pages without duplicating items already on screen", () => {
    const current = [item("turn-60-user", "user"), item("turn-60-assistant", "assistant")];
    const older = [item("turn-0-user", "user"), item("turn-0-assistant", "assistant"), item("turn-60-user", "user")];

    expect(prependTranscriptPage(current, older).map((entry) => entry.id)).toEqual([
      "turn-0-user",
      "turn-0-assistant",
      "turn-60-user",
      "turn-60-assistant",
    ]);
  });

  test("restores the same visual anchor after older content is prepended", () => {
    expect(anchoredScrollTop({ beforeTop: 240, beforeHeight: 900, afterHeight: 1300 })).toBe(640);
  });

  test("drops transient evidence before dialogue when applying the live item cap", () => {
    const result = trimLiveTranscript([
      item("first-user", "user"),
      item("first-tool", "tool"),
      item("first-assistant", "assistant"),
      item("second-user", "user"),
      item("second-assistant", "assistant"),
    ], 4);

    expect(result.items.map((entry) => entry.id)).toEqual([
      "first-user",
      "first-assistant",
      "second-user",
      "second-assistant",
    ]);
    expect(result.removedTurns).toBe(0);
  });

  test("removes a complete oldest turn when dialogue itself exceeds the live cap", () => {
    const result = trimLiveTranscript([
      item("first-user", "user"),
      item("first-assistant", "assistant"),
      item("second-user", "user"),
      item("second-assistant", "assistant"),
    ], 2);

    expect(result.items.map((entry) => entry.id)).toEqual(["second-user", "second-assistant"]);
    expect(result.removedTurns).toBe(1);
  });

  test("rejects a completed request after the user switches threads", () => {
    expect(isCurrentHistoryRequest({
      activeTabId: "tab-b",
      requestTabId: "tab-a",
      activeGeneration: 4,
      requestGeneration: 3,
    })).toBe(false);
    expect(isCurrentHistoryRequest({
      activeTabId: "tab-a",
      requestTabId: "tab-a",
      activeGeneration: 4,
      requestGeneration: 4,
      activeBeforeTurn: 61,
      requestBeforeTurn: 60,
    })).toBe(false);
    expect(isCurrentHistoryRequest({
      activeTabId: "tab-a",
      requestTabId: "tab-a",
      activeGeneration: 4,
      requestGeneration: 4,
      activeBeforeTurn: 60,
      requestBeforeTurn: 60,
    })).toBe(true);
  });
});
