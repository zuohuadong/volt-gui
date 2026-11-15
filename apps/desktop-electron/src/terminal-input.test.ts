import assert from "node:assert/strict";
import test from "node:test";
import { TerminalInputQueue } from "./terminal-input.ts";

function harness(buffer = 1024, window = 1024) {
  const sent: Array<{ sequence: number; type: string }> = [];
  const queue = new TerminalInputQueue(512, buffer, (command) => { sent.push(command); return true; });
  queue.configure({ writable: true, inputWindow: { maxBytes: window, frameOverheadBytes: 80 } });
  return { sent, queue };
}

test("delayed ACK serializes writes and resize within one bounded input budget", () => {
  const { queue, sent } = harness(500);
  assert.equal(queue.enqueue({ type: "write", data: "first" }).accepted, true);
  assert.equal(queue.enqueue({ type: "resize", cols: 80, rows: 24 }).accepted, true);
  assert.equal(queue.enqueue({ type: "write", data: "third" }).accepted, true);
  assert.deepEqual(sent.map(item => item.sequence), [1]);
  assert.equal(queue.enqueue({ type: "write", data: "x".repeat(100) }).reason, "backpressure");
  queue.acknowledge(100);
  assert.equal(sent.length, 1);
  queue.acknowledge(1);
  assert.deepEqual(sent.map(item => item.type), ["write", "resize"]);
  queue.acknowledge(2);
  assert.deepEqual(sent.map(item => item.sequence), [1, 2, 3]);
});

test("encoded JSON expansion and UTF-8 both count toward official limits", () => {
  const { queue, sent } = harness(2048, 200);
  assert.equal(queue.enqueue({ type: "write", data: "\0".repeat(30) }).reason, "too-large");
  assert.equal(queue.enqueue({ type: "write", data: "中".repeat(200) }).reason, "too-large");
  assert.equal(sent.length, 0);
  assert.equal(queue.enqueue({ type: "write", data: "small" }).accepted, true);
  assert.equal(sent[0].sequence, 1);
});

test("closing and transport failure drop queued input without automatic replay", () => {
  const { queue, sent } = harness();
  queue.enqueue({ type: "write", data: "first" });
  queue.enqueue({ type: "write", data: "must not replay" });
  queue.close();
  queue.acknowledge(1);
  assert.equal(sent.length, 1);
  assert.equal(queue.enqueue({ type: "write", data: "late" }).accepted, false);
  const failed = new TerminalInputQueue(512, 1024, () => false);
  failed.configure({ writable: true });
  assert.equal(failed.enqueue({ type: "write", data: "uncertain" }).accepted, false);
  assert.equal(failed.enqueue({ type: "write", data: "retry" }).accepted, false);
});

test("input waits for snapshot and read-only state drops pending commands", () => {
  const sent: unknown[] = [];
  const queue = new TerminalInputQueue(512, 1024, (command) => { sent.push(command); return true; });
  assert.equal(queue.enqueue({ type: "write", data: "early" }).accepted, false);
  queue.configure({ writable: true });
  queue.enqueue({ type: "write", data: "one" });
  queue.enqueue({ type: "write", data: "two" });
  queue.setWritable(false);
  queue.acknowledge(1);
  assert.equal(sent.length, 1);
});
