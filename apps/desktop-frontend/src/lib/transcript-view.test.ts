import { describe, expect, it } from "vitest";
import { buildTranscriptView } from "./transcript-view";
import { applyTranscriptEvent, foldHistory, type TranscriptMessage, type TranscriptState } from "./transcript";
import { groupTranscript } from "./transcript-groups";

function message(id: string, role: TranscriptMessage["role"], text = id): TranscriptMessage {
  return { id, role, text };
}

describe("buildTranscriptView", () => {
  // 空值、完整/残缺标记、分片、全角竖线、正常正文、用户引用、持久化回放。
  it.each([
    '<|DSML|function_calls><|DSML|invoke name="pwsh">',
    '<| DSML| parameter name="command" string="true">',
    "<|/DSML| parameter>",
    "</| DSML| invoke>",
    "</| DSML| calls>",
    "<｜DSML｜parameter>",
  ])("hides malformed protocol tails in presentation and download: %s", (markup) => {
    const original: TranscriptMessage = {
      id: "assistant", role: "assistant", text: `Answer\n${markup}hidden command`,
      reasoning: `Thinking\n${markup}hidden command`, pending: false,
    };
    const view = buildTranscriptView([original]);
    expect(view.displayMessages[0]).toMatchObject({ text: "Answer", reasoning: "Thinking", protocolWarning: true });
    expect(view.aiMessages[0].parts).toEqual([{ type: "text", text: "Answer" }]);
    expect(original.text).toContain(markup);
  });

  it("retains protocol-only messages as diagnostics after history replay", () => {
    const folded = foldHistory([{ event: { type: "assistant/attempt", seq: 1, time: 1, data: {
      turn: 1, step: 1, stream: [{ type: "reasoning-chunks", texts: ["<|DSML|", "parameter>command"] }],
    } } }]);
    expect(folded.messages).toHaveLength(1);
    expect(buildTranscriptView(folded.messages).displayMessages[0]).toMatchObject({
      text: "", reasoning: "", protocolWarning: true,
    });
  });

  it("buffers split protocol prefixes without exposing partial markers", () => {
    let state: TranscriptState = { messages: [], todos: [] };
    for (const [index, text] of [..."Thinking <|DSML|parameter>command"].entries()) {
      state = applyTranscriptEvent(state, { type: "assistant/chunk", seq: index, data: {
        turn: 1, step: 1, chunk: { type: "reasoning-delta", text },
      } });
      expect(buildTranscriptView(state.messages).displayMessages[0].reasoning).not.toMatch(/[|>]/u);
    }
    expect(buildTranscriptView(state.messages).displayMessages[0].protocolWarning).toBe(true);
    expect(state.messages[0].tool).toBeUndefined();
  });

  it("preserves normal markdown, comparison symbols and user protocol examples", () => {
    const messages = [
      message("normal", "assistant", "a < b\n```python\nprint('ok')\n```\nDSML documentation"),
      message("user", "user", "Explain <|DSML|parameter>"),
    ];
    expect(buildTranscriptView(messages).displayMessages).toEqual(messages);
    expect(buildTranscriptView([{ ...messages[0], text: "a <", pending: false }]).displayMessages[0].text).toBe("a <");
    expect(buildTranscriptView([{ ...messages[0], text: "a <", pending: true }]).displayMessages[0].text).toBe("a <");
  });

  it.each(["<|DS", "<|DSM", "<|DSML"])("keeps a truncated DSML token hidden after interruption: %s", (markup) => {
    const view = buildTranscriptView([{ id: "ended", role: "assistant", text: `Prefix ${markup}`, pending: false }]);
    expect(view.displayMessages[0]).toMatchObject({ text: "Prefix", protocolWarning: true });
  });

  it("preserves DSML documentation inside inline and fenced code", () => {
    const messages = [
      message("inline", "assistant", "Use `<|DSML|invoke>` as a protocol example."),
      message("fenced", "assistant", "```text\n<|DSML|invoke>\n```\nThe example is documented."),
    ];
    expect(buildTranscriptView(messages).displayMessages).toEqual(messages);
  });

  it("returns an empty view for empty or invisible input", () => {
    for (const messages of [[], [message("empty", "assistant", " ")]] ) {
      expect(buildTranscriptView(messages)).toEqual({
        displayMessages: [], aiMessages: [], displayGroups: [], sourceMessages: messages, sourceIndexes: [],
      });
    }
  });

  it("preserves reasoning-only and pending messages and download fields", () => {
    const messages: TranscriptMessage[] = [
      { ...message("reasoning", "assistant", ""), reasoning: "Thinking" },
      { ...message("pending", "assistant", ""), pending: true, seq: 7 },
      message("system", "system"),
      { ...message("user", "user", "Original"), displayText: "Display" },
      message("raw-tool", "tool", ""),
    ];
    const view = buildTranscriptView(messages);
    expect(view.displayMessages).toEqual(messages);
    expect(view.aiMessages).toEqual(messages.map((entry) => ({
      id: entry.id,
      role: entry.role === "tool" ? "assistant" : entry.role,
      parts: [{ type: "text", text: entry.text }],
      status: entry.pending ? "streaming" : "complete",
      createdAt: entry.seq ?? 0,
    })));
    expect(view.displayGroups).toEqual(groupTranscript(messages));
  });

  it("does not mutate previous views when a streaming message is replaced", () => {
    const first = Object.freeze({ ...message("stream", "assistant"), pending: true });
    const before = buildTranscriptView(Object.freeze([first]));
    const after = buildTranscriptView([{ ...first, text: "Completed", pending: false }]);
    expect(before.displayMessages[0]).toBe(first);
    expect(before.aiMessages[0].status).toBe("streaming");
    expect(after.aiMessages[0].status).toBe("complete");
    expect(after.aiMessages[0].parts).toEqual([{ type: "text", text: "Completed" }]);
  });

  it("reuses unchanged prefixes while rebuilding the changed tail", () => {
    const firstMessages: TranscriptMessage[] = [
      message("user", "user", "问题"),
      { ...message("stream", "assistant", "第一段"), pending: true },
    ];
    const first = buildTranscriptView(firstMessages);
    const secondMessages = [
      firstMessages[0],
      { ...firstMessages[1], text: "第一段第二段" },
      { ...message("tool", "tool", ""), tool: { callId: "tool", name: "搜索", state: "success" as const } },
    ];
    const second = buildTranscriptView(secondMessages, first);

    expect(second.displayMessages[0]).toBe(first.displayMessages[0]);
    expect(second.aiMessages[0]).toBe(first.aiMessages[0]);
    expect(second.displayMessages.slice(1).map((item) => item.id)).toEqual(["stream", "tool"]);
    expect(second.displayGroups.map((group) => group.kind)).toEqual(["message", "message", "tools"]);
  });

  it("filters hidden messages while preserving visible message order", () => {
    const result = buildTranscriptView([
      message("hidden", "assistant", '{"type":"tool-call"}'),
      message("user", "user", "你好"),
      message("assistant", "assistant", "答复"),
    ]);

    expect(result.displayMessages.map((item) => item.id)).toEqual(["user", "assistant"]);
    expect(result.aiMessages.map((item) => item.id)).toEqual(["user", "assistant"]);
  });

  it("groups consecutive tool messages in the same order as the transcript", () => {
    const result = buildTranscriptView([
      message("user", "user", "问题"),
      { ...message("tool-a", "tool"), tool: { callId: "a", name: "读取", state: "success" } },
      { ...message("tool-b", "tool"), tool: { callId: "b", name: "搜索", state: "success" } },
      message("assistant", "assistant", "结果"),
    ]);

    expect(result.displayGroups.map((group) => group.kind)).toEqual(["message", "tools", "message"]);
    expect(result.displayGroups[1]).toMatchObject({ id: "tool-a", messages: [{ id: "tool-a" }, { id: "tool-b" }] });
  });
});
