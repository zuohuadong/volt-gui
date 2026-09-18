import { describe, expect, it } from "vitest";
import { assistantMessageForEvent, applyTranscriptEvent, foldHistory, hasMessageContent, isVisibleMessageText, isVisibleReasoning, stripInternalPromptSuffix, visibleText, type TranscriptState } from "./transcript";
import { setLocale, t } from "./i18n";

const event = (type: string, seq: number, data: Record<string, unknown>) => ({ type, seq, time: seq, data });

describe("transcript folding", () => {
  it("hides serialized tool calls from the reasoning presentation", () => {
    expect(isVisibleReasoning('{ "type": "tool-call", "name": "browser_session" }')).toBe(false);
    expect(isVisibleReasoning('```json\n{"type":"tool-use","name":"skill"}\n```')).toBe(false);
    expect(isVisibleReasoning('{ "type": "tool-call", "arguments": "{action:start,url: https://example.com\\\"}" }')).toBe(false);
    expect(isVisibleReasoning("先检查页面结构，再决定如何操作。")).toBe(true);
    expect(isVisibleReasoning("这里解释 tool-call 和 tool-result 的区别。")).toBe(true);
  });

  it("hides serialized tool calls from the assistant message body", () => {
    expect(isVisibleMessageText('{ "type": "tool-call", "name": "browser_session" }')).toBe(false);
    expect(isVisibleMessageText('解释 {"type":"tool-call"} 的结构')).toBe(true);
    expect(isVisibleMessageText("请检查 tool-call 和 tool-result 的区别")).toBe(true);
    expect(isVisibleMessageText("页面已打开并读取到结果。")).toBe(true);
  });

  it("keeps user-authored tool JSON visible while filtering assistant payloads", () => {
    const toolJson = '{ "type": "tool-call", "name": "browser_session" }';
    expect(hasMessageContent({ id: "user-1", role: "user", text: toolJson })).toBe(true);
    expect(hasMessageContent({ id: "assistant-1", role: "assistant", text: toolJson })).toBe(false);

    const next = applyTranscriptEvent({ messages: [], todos: [] }, event("user/message", 1, { message: toolJson }));
    expect(next.messages).toMatchObject([{ role: "user", text: toolJson }]);
  });

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

  it("folds official packed history chunks without losing token boundaries", () => {
    const next = foldHistory([
      { event: event("chunkrow/text-chunks", 1, { turn: 1, step: 1, index: 0, dt: [1], texts: ["你好", "，世界"] }) },
      { event: event("chunkrow/reasoning-chunks", 3, { turn: 1, step: 1, index: 1, dt: [], texts: ["先判断"] }) },
      { event: event("assistant/message", 4, { turn: 1, step: 1, message: "" }) },
    ]);
    expect(next.messages[0]).toMatchObject({ text: "你好，世界", reasoning: "先判断", pending: false });
  });

  it("joins a tool result to its call card and keeps error state", () => {
    const next = foldHistory([
      { event: event("tool/call", 1, { callId: "c1", name: "bash", arguments: "{\"command\":\"pwd\"}" }) },
      { event: event("tool/result", 2, { callId: "c1", message: { content: [{ type: "text", text: "denied" }] }, error: { name: "Denied", code: "approval-denied" } }) },
    ]);
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0].tool).toMatchObject({ callId: "c1", result: "denied", state: "error" });
  });

  it("preserves structured tool arguments for user-facing summaries", () => {
    const next = applyTranscriptEvent({ messages: [], todos: [] }, event("tool/call", 2, {
      callId: "browser-1",
      name: "browser_session",
      arguments: { action: "start", url: "https://example.com" },
    }));
    expect(next.messages[0].tool?.args).toBe(JSON.stringify({ action: "start", url: "https://example.com" }));
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

  it("discards empty ghost messages and clears pending on turn/end", () => {
    const stateWithEmpty: TranscriptState = {
      messages: [
        { id: "user-1", role: "user", text: "你好", seq: 1 },
        { id: "stream-0-0", role: "assistant", text: "", reasoning: "", pending: true, seq: 2 },
      ],
      todos: [],
    };
    const ended = applyTranscriptEvent(stateWithEmpty, event("turn/end", 3, {}));
    expect(ended.messages).toHaveLength(1);
    expect(ended.messages[0].id).toBe("user-1");
  });

  it("ignores internal user messages from agent-instructions, plugin, or skill-catalog sources", () => {
    const initial: TranscriptState = { messages: [], todos: [] };
    const instructions = applyTranscriptEvent(initial, event("user/message", 1, {
      content: [{ type: "text", text: "<system-reminder>\nInstructions from: AGENTS.md\n# Agent Configuration" }],
      source: { kind: "agent-instructions" },
    }));
    expect(instructions.messages).toHaveLength(0);

    const skills = applyTranscriptEvent(initial, event("user/message", 2, {
      content: [{ type: "text", text: "<system-reminder>\nA skill is a reusable set of task-specific instructions." }],
      source: { kind: "skill-catalog" },
    }));
    expect(skills.messages).toHaveLength(0);

    const textOnlyReminder = applyTranscriptEvent(initial, event("user/message", 3, {
      content: [{ type: "text", text: "<system-reminder>\n<available_skills>\n- browser-skill\n</available_skills></system-reminder>" }],
    }));
    expect(textOnlyReminder.messages).toHaveLength(0);
  });

  it("ignores finish chunks with no text or reasoning to prevent ghost bubbles", () => {
    const state = applyTranscriptEvent({ messages: [], todos: [] }, event("assistant/chunk", 1, {
      turn: 1,
      step: 1,
      chunk: { type: "finish", reason: { kind: "error", failure: { message: "no credential" } } },
    }));
    expect(state.messages).toHaveLength(0);
  });

  it("strips internal protocol suffixes from echoed user prompts", () => {
    const uiPrompt = "切换到紧凑模式\n\n[Volt UI customization protocol]\n如果请求包含界面...";
    expect(stripInternalPromptSuffix(uiPrompt)).toBe("切换到紧凑模式");

    const hostPolicy = "Current task context...\nUser request: 生成看板\n\n[Volt host policy]\n所有界面只读...";
    expect(stripInternalPromptSuffix(hostPolicy)).toBe("生成看板");
  });

  it("reconciles user message with stripped protocol text against optimistic message", () => {
    const initial: TranscriptState = {
      messages: [{ id: "pending-1", role: "user", text: "切换到紧凑模式", pending: true }],
      todos: [],
    };
    const next = applyTranscriptEvent(initial, event("user/message", 1, {
      content: [{ type: "text", text: "切换到紧凑模式\n\n[Volt UI customization protocol]\n如果请求包含界面..." }],
    }));
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0].text).toBe("切换到紧凑模式");
    expect(next.messages[0].pending).toBeUndefined();
  });

  it("localizes unnamed tool fallbacks and image placeholders", () => {
    setLocale("en-US");
    const unnamed = applyTranscriptEvent({ messages: [], todos: [] }, event("tool/call", 8, { callId: "anon" }));
    expect(unnamed.messages[0].text).toBe(t("transcript.toolCallFallback"));
    expect(unnamed.messages[0].tool?.name).toBe(t("transcript.toolNameFallback"));

    const orphanResult = applyTranscriptEvent({ messages: [], todos: [] }, event("tool/result", 9, { result: "ok" }));
    expect(orphanResult.messages[0].text).toBe(t("transcript.toolResultFallback"));

    expect(visibleText({ type: "image", attachment: { name: "shot.png" } })).toBe(t("transcript.imageNamedPlaceholder", { name: "shot.png" }));
    expect(visibleText({ type: "image" })).toBe(t("transcript.imagePlaceholder"));
  });
});
