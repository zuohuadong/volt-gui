import assert from "node:assert/strict";
import test from "node:test";

import { applyAssistantStreamFrame, normalizeSessionSnapshot } from "./session-follow.ts";

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
    "user/message", "chunkrow/reasoning-chunks", "chunkrow/text-chunks",
  ]);
  assert.deepEqual(normalized.history.events[2].event.data, {
    turn: 1, step: 2, index: 1, dt: [1], texts: ["answer", "!"],
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
    turn: 3, step: 1, chunk: { type: "text-delta", text: "live" },
  });
  assert.equal(applyAssistantStreamFrame({ type: "end", attemptId: "attempt-2", index: 1 }, chunk.activeAttempt).activeAttempt, undefined);
});
