import assert from "node:assert/strict";
import test from "node:test";

import { createSingleFlight } from "./single-flight.ts";

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
