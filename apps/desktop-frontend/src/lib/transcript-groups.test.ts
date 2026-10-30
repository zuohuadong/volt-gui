import { describe, expect, it } from "vitest";
import { groupTranscript } from "./transcript-groups";
import type { TranscriptMessage } from "./transcript";

const tool = (id: string, state: "running" | "success" | "error" = "success"): TranscriptMessage => ({
  id, role: "tool", text: "", tool: { callId: id, name: "pwsh", state },
});

describe("transcript tool groups", () => {
  it("handles empty and single message transcripts", () => {
    expect(groupTranscript([])).toEqual([]);
    expect(groupTranscript([tool("a")])).toEqual([{ kind: "tools", id: "a", messages: [tool("a")] }]);
  });
  it("groups consecutive tools without changing input or hiding failures", () => {
    const messages = Object.freeze([tool("a"), tool("b", "error"), tool("c", "running")]);
    expect(groupTranscript(messages)).toEqual([{ kind: "tools", id: "a", messages }]);
    expect(messages).toHaveLength(3);
  });
  it("does not group across assistant text, user messages, or unrecognized tool events", () => {
    const boundary: TranscriptMessage[] = [
      { id: "assistant", role: "assistant", text: "Next step" },
      { id: "user", role: "user", text: "Stop" },
      { id: "unknown", role: "tool", text: "Raw tool event" },
    ];
    for (const message of boundary) {
      expect(groupTranscript([tool("a"), message, tool("b")]).map((group) => group.kind)).toEqual(["tools", "message", "tools"]);
    }
  });
  it("keeps group identity stable when calls complete and new calls arrive", () => {
    expect(groupTranscript([tool("a", "running")])[0].id).toBe(groupTranscript([tool("a"), tool("b")])[0].id);
  });
});
