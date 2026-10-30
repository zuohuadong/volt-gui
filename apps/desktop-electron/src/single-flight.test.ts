import assert from "node:assert/strict";
import test from "node:test";

import { createSingleFlight, reuseReadyRuntime, runtimeResponds } from "./single-flight.ts";

test("serializes concurrent runtime restart requests as one transaction", async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const restart = createSingleFlight(async () => {
    calls += 1;
    await gate;
    return calls;
  });

  const first = restart();
  const second = restart();
  assert.equal(first, second);
  assert.equal(calls, 1);
  release();
  assert.deepEqual(await Promise.all([first, second]), [1, 1]);
  assert.equal(await restart(), 2);
});

test("retry reuses a pending startup that becomes ready without restarting it", async () => {
  let ready = false;
  let complete!: () => void;
  const startup = new Promise<void>((resolve) => { complete = resolve; });
  const reused = reuseReadyRuntime(startup, () => ready);
  ready = true;
  complete();
  assert.equal(await reused, true);
  assert.equal(await reuseReadyRuntime(null, () => true), true);
  assert.equal(await reuseReadyRuntime(Promise.resolve(), () => false), false);
});

test("runtime health probe makes exactly one read-only session list request", async () => {
  const calls: Array<{ endpoint: string; args: Record<string, unknown> }> = [];
  const healthy = await runtimeResponds({
    async call(endpoint, args) {
      calls.push({ endpoint, args });
      return { items: [] };
    },
  });
  assert.equal(healthy, true);
  assert.deepEqual(calls, [{ endpoint: "session/list", args: { _request: {} } }]);
});

test("runtime health probe fails closed without a client or on connection failure", async () => {
  let calls = 0;
  assert.equal(await runtimeResponds(null), false);
  assert.equal(await runtimeResponds({
    async call() {
      calls += 1;
      throw new Error("connection lost");
    },
  }), false);
  assert.equal(calls, 1);
});

test("concurrent failed recovery is shared and a later explicit retry can succeed", async () => {
  let attempts = 0;
  const recover = createSingleFlight(async () => {
    if (++attempts === 1) throw new Error("recovery failed");
    return true;
  });
  const first = recover();
  const second = recover();
  assert.equal(first, second);
  await assert.rejects(first, /recovery failed/);
  assert.equal(attempts, 1);
  assert.equal(await recover(), true);
  assert.equal(attempts, 2);
});

test("passes the first request arguments to the shared operation", async () => {
  const received: string[] = [];
  const operation = createSingleFlight(async (value: string) => {
    received.push(value);
    return value;
  });

  assert.equal(await operation("first"), "first");
  assert.deepEqual(received, ["first"]);
});
