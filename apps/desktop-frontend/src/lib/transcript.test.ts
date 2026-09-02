import { describe, expect, it } from "vitest";
import { assistantMessageForEvent, applyTranscriptEvent, foldHistory, type TranscriptState } from "./transcript";

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

  it("keeps source metadata separate from assistant text", () => {
    const next = applyTranscriptEvent({ messages: [], todos: [] }, event("assistant/message", 3, {
      message: { content: [
        { type: "text", text: "结论" },
        { type: "source-url", id: "docs", title: "文档", url: "https://example.com/docs" },
      ] },
    }));
    expect(next.messages[0]).toMatchObject({ text: "结论", sources: [{ id: "docs", title: "文档", url: "https://example.com/docs" }] });
  });

  it("selects only the assistant message created by the current event", () => {
    const previous = { id: "assistant-4", role: "assistant" as const, text: "old proposal", seq: 4 };
    const currentEvent = event("assistant/message", 5, { message: "new proposal" });
    const next = applyTranscriptEvent({ messages: [previous], todos: [] }, currentEvent);

    expect(assistantMessageForEvent(next.messages, currentEvent)?.text).toBe("new proposal");
    expect(assistantMessageForEvent(next.messages, event("turn/end", 6, {}))).toBeUndefined();
  });

  it("hides internal runtime context from user-visible history", () => {
    const next = applyTranscriptEvent({ messages: [], todos: [] }, event("assistant/message", 7, {
      message: "Current runtime context. This snapshot supersedes earlier runtime-context snapshots.",
    }));
    expect(next.messages).toHaveLength(0);
    expect(applyTranscriptEvent({ messages: [], todos: [] }, event("assistant/message", 8, {
      message: { content: [{ type: "text", text: "Current DSH file policy: workspace-write" }] },
    })).messages).toHaveLength(0);
  });

  it("removes a streamed runtime context when the final message is filtered", () => {
    const chunk = applyTranscriptEvent({ messages: [], todos: [] }, event("assistant/chunk", 9, {
      turn: 1,
      step: 1,
      chunk: { type: "text-delta", text: "Current runtime context." },
    }));
    expect(chunk.messages).toHaveLength(1);
    const final = applyTranscriptEvent(chunk, event("assistant/message", 10, {
      turn: 1,
      step: 1,
      message: "Current runtime context. This snapshot supersedes earlier snapshots.",
    }));
    expect(final.messages).toHaveLength(0);
  });
  it("merges raw string and delta chunks without truncation", () => {
    const next = foldHistory([
      { event: event("assistant/chunk", 1, { turn: 1, step: 1, chunk: "第一段" }) },
      { event: event("assistant/chunk", 2, { turn: 1, step: 1, chunk: { delta: "第二段" } }) },
      { event: event("assistant/chunk", 3, { turn: 1, step: 1, chunk: { text: "第三段" } }) },
    ]);
    expect(next.messages[0]).toMatchObject({ text: "第一段第二段第三段", pending: true });
  });

  it("preserves streamed text when assistant/message only carries status or empty text", () => {
    const chunk = foldHistory([
      { event: event("assistant/chunk", 1, { turn: 1, step: 1, chunk: { type: "text-delta", text: "已完整生成的长文本回复" } }) },
    ]);
    expect(chunk.messages[0].text).toBe("已完整生成的长文本回复");
    const final = applyTranscriptEvent(chunk, event("assistant/message", 2, {
      turn: 1,
      step: 1,
      message: null,
      usage: { totalTokens: 100 },
    }));
    expect(final.messages).toHaveLength(1);
    expect(final.messages[0]).toMatchObject({ text: "已完整生成的长文本回复", pending: false, usage: { totalTokens: 100 } });
  });

  it("does not falsely filter out assistant text that mentions policy words", () => {
    const next = applyTranscriptEvent({ messages: [], todos: [] }, event("assistant/message", 1, {
      message: "这里我们可以使用 workspace-write 权限来进行目录写入操作。",
    }));
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0].text).toContain("workspace-write");
  });
});
