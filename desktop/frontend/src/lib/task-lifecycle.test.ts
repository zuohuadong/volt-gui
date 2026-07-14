import { describe, expect, test } from "vitest";

import {
  acknowledgeSteeredMessage,
  enqueueQueuedMessage,
  moveQueuedMessage,
  parsePersistedQueuedMessages,
  pauseQueuedMessagesForReload,
  rekeyComposerDraft,
  resolveQueuedDeliveryFailure,
  removeQueuedMessage,
  settleQueuedTurn,
  takeNextFollowUp,
  updateQueuedMessage,
  type QueuedThreadMessage,
} from "./task-lifecycle";

function queued(id: string, overrides: Partial<QueuedThreadMessage> = {}): QueuedThreadMessage {
  return {
    id,
    tabId: "tab-1",
    display: `message ${id}`,
    submission: `message ${id}`,
    delivery: "follow-up",
    status: "queued",
    createdAtMs: 100,
    ...overrides,
  };
}

describe("thread message queue", () => {
  test("queues a trimmed follow-up for the active thread without losing the model submission", () => {
    const next = enqueueQueuedMessage([], {
      id: "q-1",
      tabId: "tab-1",
      display: "  展示文本  ",
      submission: "  带上下文的模型输入  ",
      delivery: "follow-up",
      createdAtMs: 123,
    });

    expect(next).toEqual([
      {
        id: "q-1",
        tabId: "tab-1",
        display: "展示文本",
        submission: "带上下文的模型输入",
        delivery: "follow-up",
        status: "queued",
        createdAtMs: 123,
      },
    ]);
  });

  test("supports editing, deleting, and reordering queued messages without crossing thread boundaries", () => {
    const initial = [queued("a"), queued("b"), queued("c"), queued("other", { tabId: "tab-2" })];
    const edited = updateQueuedMessage(initial, "b", {
      display: " edited display ",
      submission: " edited submission ",
    });
    const moved = moveQueuedMessage(edited, "c", -1);
    const removed = removeQueuedMessage(moved, "a");

    expect(removed.map((message) => message.id)).toEqual(["c", "b", "other"]);
    expect(removed.find((message) => message.id === "b")).toEqual(
      expect.objectContaining({ display: "edited display", submission: "edited submission" }),
    );
    expect(removed.find((message) => message.id === "other")?.tabId).toBe("tab-2");
  });

  test("takes only the next queued follow-up for a thread and marks it as sending", () => {
    const initial = [
      queued("steer", { delivery: "steer" }),
      queued("paused", { status: "paused" }),
      queued("next"),
      queued("other", { tabId: "tab-2" }),
    ];

    const result = takeNextFollowUp(initial, "tab-1");

    expect(result.message?.id).toBe("next");
    expect(result.queue.find((message) => message.id === "next")?.status).toBe("sending");
    expect(result.queue.find((message) => message.id === "steer")?.status).toBe("queued");
    expect(result.queue.find((message) => message.id === "other")?.status).toBe("queued");
  });

  test("pauses unsent messages after reload so persisted work never executes silently", () => {
    const paused = pauseQueuedMessagesForReload([
      queued("queued"),
      queued("sending", { status: "sending" }),
      queued("failed", { status: "failed", error: "network" }),
    ]);

    expect(paused.map((message) => message.status)).toEqual(["paused", "paused", "failed"]);
    expect(paused[1].error).toBe("应用已重新载入，请确认后继续发送");
    expect(paused[2].error).toBe("network");
  });

  test("loads only valid persisted messages and pauses them before exposing them to the UI", () => {
    const parsed = parsePersistedQueuedMessages(JSON.stringify([
      queued("valid"),
      { ...queued("bad-delivery"), delivery: "automatic" },
      { ...queued("missing-tab"), tabId: "" },
      "not-an-object",
    ]));

    expect(parsed).toEqual([
      expect.objectContaining({ id: "valid", status: "paused" }),
    ]);
    expect(parsePersistedQueuedMessages("not json")).toEqual([]);
  });

  test("settles a background thread without changing queued work owned by another thread", () => {
    const initial = [
      queued("background-next", { tabId: "tab-2" }),
      queued("background-sending", { tabId: "tab-2", status: "sending" }),
      queued("foreground-next", { tabId: "tab-1" }),
    ];

    const completed = settleQueuedTurn(initial, "tab-2");
    expect(completed.deliverNext).toBe(true);
    expect(completed.queue).toEqual(initial);

    const failed = settleQueuedTurn(initial, "tab-2", "上一轮失败");
    expect(failed.deliverNext).toBe(false);
    expect(failed.queue.map((message) => [message.id, message.status, message.error])).toEqual([
      ["background-next", "paused", "上一轮失败"],
      ["background-sending", "paused", "上一轮失败"],
      ["foreground-next", "queued", undefined],
    ]);
  });

  test("acknowledges only the delivered steer message for the reported thread", () => {
    const initial = [
      queued("foreground-steer", { delivery: "steer", status: "sending" }),
      queued("background-steer", { tabId: "tab-2", delivery: "steer", status: "sending" }),
      queued("background-follow-up", { tabId: "tab-2" }),
    ];

    expect(acknowledgeSteeredMessage(initial, "tab-2").map((message) => message.id)).toEqual([
      "foreground-steer",
      "background-follow-up",
    ]);
  });

  test("pauses an unacknowledged steer instead of leaving it stuck after turn completion", () => {
    const result = settleQueuedTurn([
      queued("steer", { delivery: "steer", status: "sending" }),
      queued("next"),
      queued("other", { tabId: "tab-2" }),
    ], "tab-1");

    expect(result.deliverNext).toBe(false);
    expect(result.queue.map((message) => [message.id, message.status])).toEqual([
      ["steer", "paused"],
      ["next", "paused"],
      ["other", "queued"],
    ]);
  });

  test("keeps a busy-race follow-up authoritative in the queue without fabricating a failed receipt", () => {
    expect(resolveQueuedDeliveryFailure({ backendSubmissionAttempted: true, alreadyRunning: true })).toEqual({
      backendSubmissionMayHaveStarted: false,
      status: "queued",
      recordFailure: false,
    });

    expect(resolveQueuedDeliveryFailure({ backendSubmissionAttempted: true, alreadyRunning: false })).toEqual({
      backendSubmissionMayHaveStarted: true,
      status: "failed",
      recordFailure: true,
    });

    expect(resolveQueuedDeliveryFailure({ backendSubmissionAttempted: false, alreadyRunning: false })).toEqual({
      backendSubmissionMayHaveStarted: false,
      status: "failed",
      recordFailure: false,
    });
  });

  test("migrates a provisional conversation draft to the bound backend thread without clearing the composer", () => {
    expect(rekeyComposerDraft({
      drafts: { "work:inbox:task-1": "保留这份草稿" },
      from: "work:inbox:task-1",
      to: "tab-1",
      owner: "work:inbox:task-1",
      input: "保留这份草稿",
    })).toEqual({
      drafts: { "tab-1": "保留这份草稿" },
      owner: "tab-1",
      input: "保留这份草稿",
    });

    expect(rekeyComposerDraft({
      drafts: { "work:inbox:task-1": "旧草稿", "tab-1": "已绑定草稿" },
      from: "work:inbox:task-1",
      to: "tab-1",
      owner: "work:inbox:task-1",
      input: "旧草稿",
    })).toEqual({
      drafts: { "tab-1": "已绑定草稿" },
      owner: "tab-1",
      input: "已绑定草稿",
    });
  });
});
