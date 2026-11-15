import { describe, expect, it } from "vitest";
import { windowTranscriptGroups } from "./transcript-window";
import type { TranscriptGroup } from "./transcript-groups";

function messageGroup(id: string): TranscriptGroup {
  return { kind: "message", id, message: { id, role: "assistant", text: id } };
}

describe("windowTranscriptGroups", () => {
  it("returns all groups when under the limit", () => {
    const groups = [messageGroup("a"), messageGroup("b")];
    expect(windowTranscriptGroups(groups, 80)).toEqual({
      visibleGroups: groups,
      hiddenGroupCount: 0,
      totalGroupCount: 2,
    });
  });

  it("keeps only the trailing window", () => {
    const groups = Array.from({ length: 5 }, (_, index) => messageGroup(String(index)));
    const windowed = windowTranscriptGroups(groups, 3);
    expect(windowed.hiddenGroupCount).toBe(2);
    expect(windowed.visibleGroups.map((group) => group.id)).toEqual(["2", "3", "4"]);
    expect(windowed.totalGroupCount).toBe(5);
  });
});
