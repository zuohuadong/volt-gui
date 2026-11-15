import { describe, expect, it } from "vitest";

import {
  EXIT_PLAN_MODE_TOOL,
  isPlanReviewQuestion,
  planCardsFromHistory,
  planState,
  planTextFromArgs,
  planTitle,
  planToggleCommand,
} from "./plan-mode";

describe("planState", () => {
  it("reads the official plan projection", () => {
    expect(planState({ plan: { active: true, pending: false } })).toEqual({ active: true, pending: false });
    expect(planState({ plan: { active: false, pending: true } })).toEqual({ active: false, pending: true });
  });

  it("treats a missing or malformed projection as unavailable", () => {
    expect(planState(undefined)).toBeNull();
    expect(planState({})).toBeNull();
    expect(planState({ plan: { pending: true } })).toBeNull();
    expect(planState({ plan: true })).toBeNull();
  });
});

describe("planToggleCommand", () => {
  it("uses /plan off to leave and bare /plan to enter", () => {
    expect(planToggleCommand(true)).toBe("/plan off");
    expect(planToggleCommand(false)).toBe("/plan");
  });
});

describe("planTextFromArgs", () => {
  it("accepts only a non-empty plan string", () => {
    expect(planTextFromArgs({ plan: "# Plan\n\nDo it" })).toBe("# Plan\n\nDo it");
    expect(planTextFromArgs({ plan: "  " })).toBeNull();
    expect(planTextFromArgs({ plan: 3 })).toBeNull();
    expect(planTextFromArgs(null)).toBeNull();
  });
});

describe("planTitle", () => {
  it("uses the first heading and falls back when there is none", () => {
    expect(planTitle("intro\n## Upgrade the runtime\nbody", "Plan")).toBe("Upgrade the runtime");
    expect(planTitle("no heading here", "Plan")).toBe("Plan");
  });
});

describe("isPlanReviewQuestion", () => {
  it("recognises the official plan-review intent", () => {
    expect(isPlanReviewQuestion({ kind: "plan-review", approve: "Approve", callId: "c1" })).toEqual({ approve: "Approve" });
    expect(isPlanReviewQuestion({ kind: "other" })).toBeNull();
    expect(isPlanReviewQuestion(undefined)).toBeNull();
  });
});

describe("planCardsFromHistory", () => {
  // 官方 `tool/call.arguments` 是模型产出的原始 JSON 字符串。
  let seq = 0;
  const call = (callId: string, plan: string) => ({
    event: { type: "tool/call", seq: ++seq, data: { name: EXIT_PLAN_MODE_TOOL, callId, arguments: JSON.stringify({ plan }) } },
  });
  const result = (callId: string, data: Record<string, unknown> = {}) => ({
    event: { type: "tool/result", seq: ++seq, data: { message: { role: "tool", toolCallId: callId, content: [] }, ...data } },
  });
  const planMode = (active: boolean) => ({ event: { type: "plan/mode", seq: ++seq, data: { active } } });

  it("marks a plan approved only when the log turns plan mode off afterwards", () => {
    const cards = planCardsFromHistory([
      call("c1", "# First"),
      result("c1"),
      planMode(false),
      call("c2", "# Second"),
      result("c2"),
    ]);
    expect(cards).toEqual([
      { callId: "c1", text: "# First", approved: true },
      { callId: "c2", text: "# Second", approved: false },
    ]);
  });

  it("keeps a plan whose review is still open", () => {
    expect(planCardsFromHistory([call("c1", "# Waiting")])).toEqual([
      { callId: "c1", text: "# Waiting", approved: null },
    ]);
  });

  it("drops failed calls and unrelated tools", () => {
    const cards = planCardsFromHistory([
      call("c1", "# Failed"),
      result("c1", { error: { name: "UserQuestionError", code: "ASK_CANCELLED" } }),
      { event: { type: "tool/call", seq: ++seq, data: { name: "bash", callId: "c2", arguments: "{}" } } },
      result("c2"),
      planMode(false),
    ]);
    expect(cards).toEqual([]);
  });

  it("ignores calls without a callId, unparsable arguments, or plan text", () => {
    expect(planCardsFromHistory([
      { event: { type: "tool/call", seq: ++seq, data: { name: EXIT_PLAN_MODE_TOOL, arguments: JSON.stringify({ plan: "# x" }) } } },
      { event: { type: "tool/call", seq: ++seq, data: { name: EXIT_PLAN_MODE_TOOL, callId: "c1", arguments: "{}" } } },
      { event: { type: "tool/call", seq: ++seq, data: { name: EXIT_PLAN_MODE_TOOL, callId: "c2", arguments: "not json" } } },
    ])).toEqual([]);
  });
});
