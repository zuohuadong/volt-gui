import { describe, expect, it } from "vitest";
import { assistantMessageForEvent, applyTranscriptEvent, extractAttachments, foldHistory, interruptRunningTools, isVisibleMessageText, isVisibleReasoning, mergeHistoryEntries, stripInternalPromptSuffix, type TranscriptState } from "./transcript";

const event = (type: string, seq: number, data: Record<string, unknown>) => ({ type, seq, time: seq, data });

describe("transcript folding", () => {
  it("merges overlapping durable and live history by event identity", () => {
    const durable = { event: event("assistant/chunk", 10, {
      attemptId: "a1", index: 2, turn: 1, step: 1, chunk: { type: "text-delta", text: "same" },
    }) };
    const live = { event: event("assistant/chunk", 11, {
      attemptId: "a1", index: 2, turn: 1, step: 1, chunk: { type: "text-delta", text: "same" },
    }) };
    expect(mergeHistoryEntries([durable], [live])).toEqual([durable]);
  });

  it("deduplicates unordered durable records without losing transient sequence collisions", () => {
    const user = { event: event("user/message", 8, { text: "task" }) };
    const final = { event: event("assistant/message", 9, { turn: 1, step: 1, message: "done" }) };
    const stream = { event: event("assistant/chunk", 9, {
      attemptId: "a1", startedAfterSeq: 8, index: 0, turn: 1, step: 1,
      chunk: { type: "text-delta", text: "done" },
    }) };
    const merged = mergeHistoryEntries([user, final], [stream, user, final]);
    expect(merged).toHaveLength(3);
    expect(merged.map((entry) => entry.event.type)).toEqual(["user/message", "assistant/chunk", "assistant/message"]);
    expect(foldHistory(merged).messages.map((message) => message.text)).toEqual(["task", "done"]);
  });

  it("keeps uploaded attachment metadata separate from visible message text", () => {
    expect(extractAttachments([{ type: "file", attachment: { attachmentId: "a1", name: "说明.md", bytes: 12 } }]))
      .toEqual([{ attachmentId: "a1", name: "说明.md", bytes: 12, kind: "file" }]);
    const result = applyTranscriptEvent({ messages: [], todos: [] }, event("user/message", 1, {
      message: { content: [{ type: "text", text: "请查看" }, { type: "file", attachment: { attachmentId: "a1", name: "说明.md", bytes: 12 } }] },
    }));
    expect(result.messages[0].attachments).toHaveLength(1);
    expect(result.messages[0].displayText).toBe("请查看");
    expect(result.messages[0].text).toContain("说明.md");
    const imageOnly = foldHistory([{ event: event("user/message", 2, {
      message: { content: [{ type: "image", attachment: { attachmentId: "i1", name: "图片.png", mediaType: "image/png", bytes: 32 } }] },
    }) }]);
    expect(imageOnly.messages).toHaveLength(1);
    expect(imageOnly.messages[0].displayText).toBe("");
    expect(imageOnly.messages[0].attachments?.[0].mediaType).toBe("image/png");
    expect(extractAttachments([{ type: "text", text: "[文件：说明.md]" }])).toEqual([]);
  });
  it("hides serialized tool calls from the reasoning presentation", () => {
    expect(isVisibleReasoning('{ "type": "tool-call", "name": "browser_session" }')).toBe(false);
    expect(isVisibleReasoning('```json\n{"type":"tool-use","name":"skill"}\n```')).toBe(false);
    expect(isVisibleReasoning('{ "type": "tool-call", "arguments": "{action:start,url: https://example.com\\\"}" }')).toBe(false);
    expect(isVisibleReasoning("先检查页面结构，再决定如何操作。")).toBe(true);
  });

  it("hides serialized tool calls from the assistant message body", () => {
    expect(isVisibleMessageText('{ "type": "tool-call", "name": "browser_session" }')).toBe(false);
    expect(isVisibleMessageText("页面已打开并读取到结果。")).toBe(true);
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

  it("shares unchanged transcript messages across streaming updates", () => {
    const initial: TranscriptState = {
      messages: [
        { id: "user-1", role: "user", text: "问题" },
        { id: "stream-1-1", role: "assistant", text: "第一段", reasoning: "", pending: true },
      ],
      todos: [],
    };
    const next = applyTranscriptEvent(initial, event("assistant/chunk", 3, {
      turn: 1, step: 1, chunk: { type: "text-delta", text: "第二段" },
    }));

    expect(next.messages[0]).toBe(initial.messages[0]);
    expect(next.messages[1]).not.toBe(initial.messages[1]);
    expect(next.messages[1].text).toBe("第一段第二段");
  });

  it("folds official packed history chunks without losing token boundaries", () => {
    const next = foldHistory([
      { event: event("chunkrow/text-chunks", 1, { turn: 1, step: 1, index: 0, dt: [1], texts: ["你好", "，世界"] }) },
      { event: event("chunkrow/reasoning-chunks", 3, { turn: 1, step: 1, index: 1, dt: [], texts: ["先判断"] }) },
      { event: event("assistant/message", 4, { turn: 1, step: 1, message: "" }) },
    ]);
    expect(next.messages[0]).toMatchObject({ text: "你好，世界", reasoning: "先判断", pending: false });
  });

  it("keeps reasoning from an interrupted assistant attempt", () => {
    const next = foldHistory([{
      event: event("assistant/attempt", 4, {
        turn: 1,
        step: 2,
        stream: [{
          type: "reasoning-chunks",
          texts: ["中断前的思考"],
        }],
      }),
    }]);
    expect(next.messages).toMatchObject([{ role: "assistant", reasoning: "中断前的思考", pending: false }]);
  });

  it("replaces live chunks with the durable attempt without repeating text or merging a retry", () => {
    const next = foldHistory([
      { event: event("assistant/chunk", 1, { turn: 1, step: 2, chunk: { type: "reasoning-delta", text: "first" } }) },
      { event: event("assistant/attempt", 2, { turn: 1, step: 2, stream: [
        { type: "reasoning-chunks", texts: ["first"] },
        { type: "chunk", chunk: { type: "text-delta", text: "partial" } },
      ] }) },
      { event: event("assistant/chunk", 3, { turn: 1, step: 2, chunk: { type: "reasoning-delta", text: "retry" } }) },
      { event: event("turn/end", 4, {}) },
    ]);
    expect(next.messages).toMatchObject([
      { text: "partial", reasoning: "first", pending: false },
      { text: "", reasoning: "retry", pending: false },
    ]);
  });

  it("keeps reasoning-only messages after completion and in durable history", () => {
    const live = foldHistory([
      { event: event("assistant/chunk", 1, { turn: 1, step: 1, chunk: { type: "reasoning-delta", text: "analysis" } }) },
      { event: event("assistant/message", 2, { turn: 1, step: 1, message: {
        content: [{ type: "reasoning", text: "analysis" }],
      } }) },
    ]);
    const restored = foldHistory([{ event: event("assistant/message", 2, { message: {
      content: [{ type: "reasoning", text: "analysis" }],
    } }) }]);
    expect(live.messages).toHaveLength(1);
    expect(live.messages[0]).toMatchObject({ text: "", reasoning: "analysis", pending: false });
    expect(restored.messages[0]).toMatchObject({ text: "", reasoning: "analysis", pending: false });
  });

  it("keeps top-level reasoning when the final message carries text separately", () => {
    const live = applyTranscriptEvent({ messages: [], todos: [] }, event("assistant/chunk", 1, {
      turn: 1, step: 1, reasoning: "先分析问题",
    }));
    const final = applyTranscriptEvent(live, event("assistant/message", 2, {
      turn: 1, step: 1, message: { content: [{ type: "text", text: "结论" }] }, reasoning: "先分析问题",
    }));
    expect(live.messages[0]).toMatchObject({ text: "", reasoning: "先分析问题", pending: true });
    expect(final.messages[0]).toMatchObject({ text: "结论", reasoning: "先分析问题", pending: false });
  });

  it("accepts string reasoning in the final assistant event", () => {
    const next = applyTranscriptEvent({ messages: [], todos: [] }, event("assistant/message", 1, {
      message: "结论", reasoning: "思考过程",
    }));
    expect(next.messages[0]).toMatchObject({ text: "结论", reasoning: "思考过程", pending: false });
  });

  it("keeps text and reasoning when one chunk carries both fields", () => {
    const next = applyTranscriptEvent({ messages: [], todos: [] }, event("assistant/chunk", 1, {
      turn: 1, step: 1,
      chunk: { type: "text-delta", text: "正文" },
      reasoning: "思考",
    }));
    expect(next.messages[0]).toMatchObject({ text: "正文", reasoning: "思考", pending: true });
  });

  it("reads structured reasoning content and merges final reasoning sources", () => {
    const next = applyTranscriptEvent({ messages: [], todos: [] }, event("assistant/message", 1, {
      message: { content: [{ type: "reasoning", content: "先判断" }] },
      reasoning: "再验证",
    }));
    expect(next.messages[0]).toMatchObject({ reasoning: "先判断再验证", pending: false });
  });

  it("joins a tool result to its call card and keeps error state", () => {
    const next = foldHistory([
      { event: event("tool/call", 1, { callId: "c1", name: "bash", arguments: "{\"command\":\"pwd\"}" }) },
      { event: event("tool/result", 2, { callId: "c1", message: { content: [{ type: "text", text: "denied" }] }, error: { name: "Denied", code: "approval-denied" } }) },
    ]);
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0].tool).toMatchObject({ callId: "c1", result: "denied", state: "error" });
  });

  it("keeps a tool error visible when the result only carries an error object", () => {
    const next = foldHistory([
      { event: event("tool/call", 1, { callId: "c1", name: "bash", arguments: "{\"command\":\"npm test\"}" }) },
      { event: event("tool/result", 2, { callId: "c1", error: { name: "CommandFailed", message: "process exited with code 1" } }) },
    ]);
    expect(next.messages[0].tool).toMatchObject({ callId: "c1", state: "error" });
    expect(next.messages[0].tool?.result).toContain("process exited with code 1");
  });

  it("attaches a result without a call id to the running tool instead of adding an orphan card", () => {
    const first = applyTranscriptEvent({ messages: [], todos: [] }, event("tool/call", 1, {
      callId: "call-1",
      turn: 3,
      name: "bash",
      arguments: "{\"command\":\"pwd\"}",
    }));
    const next = applyTranscriptEvent(first, event("tool/result", 2, {
      turn: 3,
      message: { content: [{ type: "text", text: "/workspace" }] },
    }));
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0].tool).toMatchObject({ callId: "call-1", result: "/workspace", state: "success" });
  });

  it("marks running tools interrupted as soon as a stop is confirmed", () => {
    const state = foldHistory([
      { event: event("tool/call", 1, { callId: "running", name: "bash", arguments: "{}" }) },
      { event: event("tool/call", 2, { callId: "done", name: "bash", arguments: "{}" }) },
      { event: event("tool/result", 3, { callId: "done", result: "ok" }) },
    ]);
    const stopped = interruptRunningTools(state);
    expect(stopped.messages.find((message) => message.tool?.callId === "running")?.tool?.state).toBe("interrupted");
    expect(stopped.messages.find((message) => message.tool?.callId === "done")?.tool?.state).toBe("success");
    expect(interruptRunningTools(stopped)).toBe(stopped);
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

  it("closes tools without a result when a turn ends", () => {
    const state = applyTranscriptEvent({ messages: [], todos: [] }, event("tool/call", 1, {
      callId: "call-1",
      name: "write_file",
      arguments: { path: "a.txt" },
    }));
    const ended = applyTranscriptEvent(state, event("turn/end", 2, {
      reason: { kind: "completed" },
    }));
    expect(ended.messages[0].tool).toMatchObject({
      callId: "call-1",
      state: "interrupted",
    });
    expect(ended.messages[0].tool?.result).toBeUndefined();
    expect(state.messages[0].tool?.state).toBe("running");
    const lateResult = applyTranscriptEvent(ended, event("tool/result", 3, { callId: "call-1", result: "ok" }));
    expect(lateResult.messages[0].tool).toMatchObject({ state: "success", result: "ok" });
  });

  it("replaces a replayed tool call instead of leaving a running duplicate", () => {
    const first = applyTranscriptEvent({ messages: [], todos: [] }, event("tool/call", 1, {
      callId: "call-1",
      name: "write_file",
      arguments: { path: "a.txt" },
    }));
    const result = applyTranscriptEvent(first, event("tool/result", 2, {
      callId: "call-1",
      result: "ok",
    }));
    const replayed = applyTranscriptEvent(result, event("tool/call", 7, {
      callId: "call-1",
      name: "write_file",
      arguments: { path: "a.txt" },
    }));
    expect(replayed.messages).toHaveLength(1);
    expect(replayed.messages[0].tool?.state).toBe("success");
    expect(replayed).toBe(result);
  });

  it("deduplicates a repeated callId within the same turn even when sequence numbers differ", () => {
    const first = applyTranscriptEvent({ messages: [], todos: [] }, event("tool/call", 1, {
      callId: "call-1",
      turn: 2,
      name: "write_file",
    }));
    const replayed = applyTranscriptEvent(first, event("tool/call", 9, {
      callId: "call-1",
      turn: 2,
      name: "write_file",
    }));
    expect(replayed).toBe(first);
  });

  it("does not close a later turn when an old ending is replayed", () => {
    const first = applyTranscriptEvent({ messages: [], todos: [] }, event("tool/call", 1, { callId: "same", turn: 1 }));
    const nextTurn = applyTranscriptEvent(first, event("tool/call", 4, { callId: "same", turn: 2 }));
    const ended = applyTranscriptEvent(nextTurn, event("turn/end", 3, { turn: 1 }));
    expect(ended.messages.map((message) => message.tool?.state)).toEqual(["interrupted", "running"]);
    const result = applyTranscriptEvent(ended, event("tool/result", 5, { callId: "same", turn: 2, result: "ok" }));
    expect(result.messages.map((message) => message.tool?.state)).toEqual(["interrupted", "success"]);
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
});
