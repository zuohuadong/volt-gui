import { describe, expect, it } from "vitest";
import {
  AUTO_CONTINUE_LIMIT, approachingOutputLimit, hasRetryableTask, latestOutputTokens, latestTurnEndSeq,
  latestUserPrompt, outputTokensFromUsage, shouldAutoContinue, taskRecoveryReason, turnEndKind,
} from "./task-retry";
import type { TodoItem, TranscriptMessage } from "./transcript";

const user = (text: string): TranscriptMessage => ({ id: `user-${text}`, role: "user", text });
const tool = (state: "running" | "success" | "error" | "interrupted"): TranscriptMessage => ({
  id: `tool-${state}`,
  role: "tool",
  text: "",
  tool: { callId: state, name: "tool", state },
});

describe("task retry state", () => {
  it("reports malformed tool markup but does not retry during execution or after a clean response", () => {
    const malformed: TranscriptMessage = { id: "bad", role: "assistant", text: "", reasoning: "<|DSML|parameter>command" };
    expect(taskRecoveryReason([user("task"), malformed], [], false)).toBe("protocol");
    expect(taskRecoveryReason([user("task"), malformed], [], true)).toBeUndefined();
    expect(taskRecoveryReason([user("task"), malformed, { id: "ok", role: "assistant", text: "Verified" }], [], false)).toBeUndefined();
  });

  it("returns the latest user prompt", () => {
    expect(latestUserPrompt([user("旧任务"), user("新任务")])).toBe("新任务");
  });

  it("offers retry for an unfinished plan or interrupted tool", () => {
    const pending: TodoItem[] = [{ content: "继续处理", status: "in_progress" }];
    expect(hasRetryableTask([user("完成这个任务")], pending, false)).toBe(true);
    expect(hasRetryableTask([user("完成这个任务"), tool("running")], [], false)).toBe(true);
    expect(hasRetryableTask([user("完成这个任务"), tool("error")], [], false)).toBe(true);
    expect(hasRetryableTask([user("完成这个任务")], [], false, [
      { event: { type: "turn/end", seq: 2, time: 2, data: { reason: { kind: "interrupted" } } } },
    ])).toBe(true);
  });

  it("does not offer retry while running or after a completed task", () => {
    expect(hasRetryableTask([user("完成这个任务"), tool("success")], [], true)).toBe(false);
    expect(hasRetryableTask([user("完成这个任务"), tool("success")], [{ content: "完成", status: "completed" }], false)).toBe(false);
  });

  it("reads official turn end kinds without treating output limits as success", () => {
    expect(turnEndKind([
      { event: { type: "turn/end", seq: 2, time: 2, data: { reason: { kind: "completed" } } } },
    ])).toBe("completed");
    expect(turnEndKind([
      { event: { type: "turn/end", seq: 3, time: 3, data: { reason: { kind: "interrupted" } } } },
    ])).toBe("interrupted");
    expect(turnEndKind([
      { event: { type: "turn/end", seq: 6, time: 6, data: { reason: { kind: "completed" } } } },
      { event: { type: "turn/end", seq: 3, time: 3, data: { reason: { kind: "interrupted" } } } },
    ])).toBe("completed");
  });

  it.each([
    ["max-tokens", "maxTokens"], ["blocked", "blocked"], ["error", "error"],
    ["aborted", "interrupted"], ["interrupted", "interrupted"],
  ] as const)("reports %s without claiming that the task finished", (kind, expected) => {
    expect(taskRecoveryReason([user("task")], [], false, [
      { event: { type: "turn/end", seq: 3, time: 3, data: { reason: { kind } } } },
    ])).toBe(expected);
  });

  it("keeps interrupted tools retryable and ignores old turn errors for a new prompt", () => {
    expect(taskRecoveryReason([user("task"), tool("interrupted")], [], false)).toBe("interrupted");
    expect(taskRecoveryReason([{ ...user("new task"), seq: 4 }], [], false, [
      { event: { type: "turn/end", seq: 3, time: 3, data: { reason: { kind: "aborted" } } } },
    ])).toBeUndefined();
  });
  it("ignores failures from tasks before the latest prompt", () => {
    expect(hasRetryableTask([user("旧任务"), tool("error"), user("新任务"), tool("success")], [], false)).toBe(false);
  });
});

describe("output limit auto continue", () => {
  const idle = { sending: false, continuing: false, attempts: 0 } as const;

  it("only auto continues on max-tokens and respects the attempt budget", () => {
    expect(shouldAutoContinue("maxTokens", idle)).toBe(true);
    expect(shouldAutoContinue("maxTokens", { ...idle, attempts: AUTO_CONTINUE_LIMIT })).toBe(false);
    expect(shouldAutoContinue("unfinished", idle)).toBe(false);
    expect(shouldAutoContinue("interrupted", idle)).toBe(false);
    expect(shouldAutoContinue(undefined, idle)).toBe(false);
  });

  it("stops auto continuation while busy, blocked, disconnected or disabled", () => {
    expect(shouldAutoContinue("maxTokens", { ...idle, sending: true })).toBe(false);
    expect(shouldAutoContinue("maxTokens", { ...idle, continuing: true })).toBe(false);
    expect(shouldAutoContinue("maxTokens", { ...idle, hasPendingInteraction: true })).toBe(false);
    expect(shouldAutoContinue("maxTokens", { ...idle, connectionError: true })).toBe(false);
    expect(shouldAutoContinue("maxTokens", { ...idle, sessionRunning: true })).toBe(false);
    expect(shouldAutoContinue("maxTokens", { ...idle, enabled: false })).toBe(false);
  });

  it("reads output tokens from the DSH usage shapes", () => {
    expect(outputTokensFromUsage({ outputTokens: 1200 })).toBe(1200);
    expect(outputTokensFromUsage({ completion_tokens: 800 })).toBe(800);
    expect(outputTokensFromUsage({ totals: { outputTokens: 640 } })).toBe(640);
    expect(outputTokensFromUsage({ totalTokens: 4100 })).toBe(4100);
    expect(outputTokensFromUsage({ inputTokens: 20 })).toBeUndefined();
    expect(outputTokensFromUsage(undefined)).toBeUndefined();
  });

  it("uses the largest assistant output in the current turn for the usage line", () => {
    const usageMessage = (id: string, usage: Record<string, unknown>): TranscriptMessage => ({ id, role: "assistant", text: "", usage });
    expect(latestOutputTokens([
      user("task"),
      usageMessage("a1", { outputTokens: 900 }),
      usageMessage("a2", { outputTokens: 3200 }),
      usageMessage("a3", { outputTokens: 10 }),
    ])).toBe(3200);
    expect(latestOutputTokens([user("old"), usageMessage("a", { outputTokens: 32768 }), user("new")])).toBeUndefined();
  });

  it("warns before the limit is reached", () => {
    expect(approachingOutputLimit(28000, 32768)).toBe(true);
    expect(approachingOutputLimit(1000, 32768)).toBe(false);
    expect(approachingOutputLimit(32768, 32768)).toBe(false);
    expect(approachingOutputLimit(28000, undefined)).toBe(false);
  });

  it("keys auto continuation on the latest turn end", () => {
    expect(latestTurnEndSeq([
      { event: { type: "turn/end", seq: 3, time: 3, data: {} } },
      { event: { type: "turn/end", seq: 9, time: 9, data: {} } },
      { event: { type: "assistant/message", seq: 11, time: 11, data: {} } },
    ])).toBe(9);
    expect(latestTurnEndSeq([])).toBeUndefined();
  });
});
