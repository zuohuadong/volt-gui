import assert from "node:assert/strict";
import test from "node:test";

import { applyAssistantStreamFrame, normalizeSessionSnapshot, sessionHistoryRequest } from "./session-follow.ts";

test("restores packed text and reasoning from an active assistant snapshot", () => {
  const normalized = normalizeSessionSnapshot({
    type: "snapshot", cursor: 8, hasMore: false,
    records: [{ type: "event", event: { type: "user/message", seq: 8, time: 1, data: { text: "hello" } } }],
    assistantStream: {
      revision: 2,
      activeAttempt: {
        attemptId: "attempt-1", startedAfterSeq: 8, turn: 1, step: 2, nextIndex: 3,
        stream: [
          { type: "reasoning-chunks", time0: 2, index: 0, dt: [], texts: ["think"] },
          { type: "text-chunks", time0: 3, index: 1, dt: [1], texts: ["answer", "!"] },
        ],
      },
    },
  });

  assert.equal(normalized.cursor, 8);
  assert.deepEqual(normalized.history.events.map((entry) => entry.event.type), [
    "user/message", "assistant/chunk", "assistant/chunk", "assistant/chunk",
  ]);
  assert.deepEqual(normalized.history.events[2].event.data, {
    attemptId: "attempt-1", startedAfterSeq: 8,
    turn: 1, step: 2, index: 1, chunk: { type: "text-delta", index: 1, text: "answer" },
  });
});

test("converts matching live assistant chunks and retires the attempt", () => {
  const started = applyAssistantStreamFrame({
    type: "start", attemptId: "attempt-2", startedAfterSeq: 4, turn: 3, step: 1,
  });
  const chunk = applyAssistantStreamFrame({
    type: "chunk", attemptId: "attempt-2", revision: 1, index: 0, time: 9,
    chunk: { type: "text-delta", text: "live" },
  }, started.activeAttempt);
  assert.deepEqual(chunk.entry?.event.data, {
    attemptId: "attempt-2", startedAfterSeq: 4, index: 0,
    turn: 3, step: 1, chunk: { type: "text-delta", text: "live" },
  });
  assert.equal(applyAssistantStreamFrame({ type: "end", attemptId: "attempt-2", index: 1 }, chunk.activeAttempt).activeAttempt, undefined);
});

test("uses follow for opening history and page for older history without replacing the live stream", () => {
  assert.deepEqual(sessionHistoryRequest({ sessionId: "s1", maxMessages: 80 }), {
    endpoint: "session/follow",
    args: { request: { address: { kind: "session", sessionId: "s1" }, maxMessages: 80, assistantStream: true } },
  });
  assert.deepEqual(sessionHistoryRequest({ sessionId: "s1", beforeSeq: 40, throughSeq: 90 }), {
    endpoint: "session/page",
    args: { request: { address: { kind: "session", sessionId: "s1" }, maxMessages: 80, beforeSeq: 40, throughSeq: 90 } },
  });
  assert.equal(sessionHistoryRequest({ sessionId: "s1", beforeSeq: 0, throughSeq: 0 }).endpoint, "session/page");
  for (const beforeSeq of [-1, 1.5, NaN, "40"]) {
    assert.throws(() => sessionHistoryRequest({ sessionId: "s1", beforeSeq, throughSeq: 90 }), /游标无效/);
  }
  assert.throws(() => sessionHistoryRequest({ sessionId: "s1", beforeSeq: 40 }), /游标无效/);
});

test("preserves the durable opening cursor and projections independently of transient chunks", () => {
  const projections = { asOfSeq: 8, values: { title: "A" } };
  const snapshot = normalizeSessionSnapshot({
    type: "snapshot", cursor: 8, hasMore: true, projections,
    records: [{ type: "event", event: { type: "user/message", seq: 8, time: 1, data: { text: "hello" } } }],
    assistantStream: {
      activeAttempt: {
        attemptId: "a", startedAfterSeq: 8, turn: 1, step: 1,
        stream: [{ type: "text-chunks", time0: 2, index: 0, dt: [], texts: ["live"] }],
      },
    },
  });
  assert.equal(snapshot.history.cursor, 8);
  assert.equal(snapshot.history.events.at(-1)?.event.seq, 9);
  assert.deepEqual(snapshot.history.projections, projections);
  assert.equal(snapshot.history.hasMore, true);
});
