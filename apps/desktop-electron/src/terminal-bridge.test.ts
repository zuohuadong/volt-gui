import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { TerminalInputQueue } from "./terminal-input.ts";

const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
const start = main.indexOf("function forwardTerminalFrame(");
const end = main.indexOf('handleTrustedIpc("desktop:observe-job-roster"', start);
assert.ok(start > 0 && end > start);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function harness(call: (endpoint: string, args?: Record<string, unknown>) => Promise<unknown>) {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const streams: string[] = [];
  const client = {
    call,
    async *openStream(endpoint: string, _args: unknown, signal: AbortSignal) {
      streams.push(endpoint);
      yield { type: "retained" };
      await new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }));
    },
    openDuplexStream(endpoint: string) {
      streams.push(endpoint);
      return { items: (async function* () {})(), send: () => true, close() {} };
    },
  };
  const state = {
    handleTrustedIpc: (name: string, handler: (...args: unknown[]) => Promise<unknown>) => handlers.set(name, handler),
    dshClient: client, terminalAttachment: undefined, terminalPending: undefined,
    terminalAttempt: 0, terminalCleanup: new Map(), TerminalInputQueue,
    randomUUID: () => "00000000-0000-0000-0000-000000000001",
    recordValue: (value: unknown) => value && typeof value === "object" ? value : {},
    mainWindow: undefined, AbortController, Buffer,
  };
  const functions = runInNewContext(`${stripTypeScriptTypes(main.slice(start, end))}\n({ startTerminalAttachment })`, state);
  return { handlers, streams, client, state, start: (id: string) => functions.startTerminalAttachment(client, "session", { id }) };
}

for (const phase of ["terminal/create", "terminal/environment"]) {
  test(`closing while ${phase} is pending cancels late attachment`, async () => {
    const pending = deferred<unknown>();
    const entered = deferred<unknown>();
    const closed: unknown[] = [];
    const h = harness(async (endpoint, args) => {
      if (endpoint === phase) { entered.resolve(undefined); return pending.promise; }
      if (endpoint === "terminal/create") return { id: "old" };
      if (endpoint === "terminal/close") { closed.push(args?.id); return {}; }
      return { maxInputBytes: 64 };
    });
    const creating = h.start("old");
    await entered.promise;
    await h.handlers.get("desktop:terminal-close")!(undefined, "old");
    pending.resolve(phase === "terminal/create" ? { id: "old" } : { maxInputBytes: 64 });
    assert.equal((await creating).stale, true);
    assert.deepEqual(closed, ["old"]);
    assert.deepEqual(h.streams, []);
  });
}

test("failed close really retries the same identity without cancelling a newer pending terminal", async () => {
  let attempts = 0;
  const pending = deferred<unknown>();
  const h = harness(async (endpoint, args) => {
    if (endpoint === "terminal/create") return args?.request && (args.request as { id: string }).id === "new" ? pending.promise : { id: "old" };
    if (endpoint === "terminal/close" && args?.id === "old" && ++attempts === 1) throw new Error("close failed");
    return { maxInputBytes: 64 };
  });
  await h.start("old");
  const close = h.handlers.get("desktop:terminal-close")!;
  assert.equal((await close(undefined, "old") as { closed: boolean }).closed, false);
  const creating = h.start("new");
  assert.equal((await close(undefined, "old") as { closed: boolean }).closed, true);
  assert.equal(attempts, 2);
  pending.resolve({ id: "new" });
  assert.equal((await creating).terminalId, "new");
});
