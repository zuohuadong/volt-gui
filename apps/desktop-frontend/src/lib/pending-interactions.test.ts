import { describe, expect, it } from "vitest";

import type { PendingApproval, PendingQuestion } from "./dsh-client";
import {
  clearPendingApproval,
  clearPendingQuestion,
  setPendingApproval,
  setPendingQuestion,
  setQuestionAnswer,
  type PendingInteractionsBySession,
} from "./pending-interactions";

const approval = (sessionId: string, rpcId: string): PendingApproval => ({
  rpcId,
  sessionId,
  approvalId: `approval-${rpcId}`,
  toolName: "filesystem.read",
});

const question = (sessionId: string, rpcId: string): PendingQuestion => ({
  rpcId,
  sessionId,
  questions: [{ id: "choice", type: "single-choice", options: ["A"] }],
});

describe("pending interactions by session", () => {
  it("keeps requests for different sessions independent", () => {
    let states: PendingInteractionsBySession = {};
    states = setPendingApproval(states, "s1", approval("s1", "a1"));
    states = setPendingQuestion(states, "s2", question("s2", "q2"));
    expect(states.s1.approval?.rpcId).toBe("a1");
    expect(states.s2.question?.rpcId).toBe("q2");
  });

  it("clears only the matching interaction and resets completed question answers", () => {
    let states: PendingInteractionsBySession = {};
    states = setPendingQuestion(states, "s1", question("s1", "q1"));
    states = setQuestionAnswer(states, "s1", "choice", "A", false);
    states = setPendingApproval(states, "s1", approval("s1", "a1"));
    states = clearPendingQuestion(states, "s1", "q1");
    expect(states.s1.approval?.rpcId).toBe("a1");
    expect(states.s1.answers).toEqual({});
    expect(clearPendingApproval(states, "s1", "other")).toBe(states);
  });
});
