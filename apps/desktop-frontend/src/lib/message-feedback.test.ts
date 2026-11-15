import { describe, expect, it } from "vitest";

import { canRateMessage, feedbackAction, isFeedbackItem, readFeedbackList } from "./message-feedback";

const item = { messageId: "m1", rating: "positive", version: "v1", createdAt: 1, updatedAt: 2 };

describe("isFeedbackItem", () => {
  it("requires identity, a known rating and a version", () => {
    expect(isFeedbackItem(item)).toBe(true);
    expect(isFeedbackItem({ ...item, rating: "neutral" })).toBe(false);
    expect(isFeedbackItem({ ...item, version: "" })).toBe(false);
    expect(isFeedbackItem(null)).toBe(false);
  });
});

describe("readFeedbackList", () => {
  it("reads the success arm", () => {
    expect(readFeedbackList({ ok: true, value: { items: [item, { messageId: "bad" }] } })).toEqual({ items: [item] });
  });

  it("reports the official rejection code instead of pretending the list is empty", () => {
    expect(readFeedbackList({ ok: false, error: { code: "message-feedback/session-not-found" } }))
      .toEqual({ items: [], error: "message-feedback/session-not-found" });
    expect(readFeedbackList(undefined)).toEqual({ items: [], error: "invalid" });
  });
});

describe("feedbackAction", () => {
  it("creates with a null version requirement", () => {
    expect(feedbackAction(undefined, "positive")).toEqual({ kind: "put", ifVersion: null });
  });

  it("switches rating with the observed version", () => {
    expect(feedbackAction(item as never, "negative")).toEqual({ kind: "put", ifVersion: "v1" });
  });

  it("retracts when the same rating is clicked again", () => {
    expect(feedbackAction(item as never, "positive")).toEqual({ kind: "delete", ifVersion: "v1" });
  });
});

describe("canRateMessage", () => {
  it("only rates assistant messages", () => {
    expect(canRateMessage("assistant")).toBe(true);
    expect(canRateMessage("user")).toBe(false);
    expect(canRateMessage("tool")).toBe(false);
  });
});