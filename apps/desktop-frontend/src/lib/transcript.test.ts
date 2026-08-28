import { describe, expect, it } from "vitest";
import { applyTranscriptEvent, foldHistory, type TranscriptState } from "./transcript";

const event = (type: string, seq: number, data: Record<string, unknown>) => ({ type, seq, time: seq, data });

describe("transcript folding", () => {
  it("reconciles optimistic user messages instead of duplicating them", () => {
    const initial: TranscriptState = { messages: [{ id: "pending", role: "user", text: "检查项目", pending: true }], todos: [] };
    const next = applyTranscriptEvent(initial, event("user/message", 1, { message: { content: [{ type: "text", text: "检查项目" }] } }));
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0]).toMatchObject({ role: "user", text: "检查项目" });
    expect(next.messages[0].pending).toBeUndefined();
  });

  it("merges text and reasoning deltas into one assistant item", () => {
    const next = foldHistory([
      { event: event("assistant/chunk", 1, { turn: 1, step: 1, chunk: { type: "text-delta", text: "你好" } }) },
      { event: event("assistant/chunk", 2, { turn: 1, step: 1, chunk: { type: "reasoning-delta", text: "先判断" } }) },
      { event: event("assistant/chunk", 3, { turn: 1, step: 1, chunk: { type: "text-delta", text: "，世界" } }) },
    ]);
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0]).toMatchObject({ text: "你好，世界", reasoning: "先判断", pending: true });
  });

  it("joins a tool result to its call card and keeps error state", () => {
    const next = foldHistory([
      { event: event("tool/call", 1, { callId: "c1", name: "bash", arguments: "{\"command\":\"pwd\"}" }) },
      { event: event("tool/result", 2, { callId: "c1", message: { content: [{ type: "text", text: "denied" }] }, error: { name: "Denied", code: "approval-denied" } }) },
    ]);
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0].tool).toMatchObject({ callId: "c1", result: "denied", state: "error" });
  });
});
