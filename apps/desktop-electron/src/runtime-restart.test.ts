import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createSingleFlight } from "./single-flight.ts";
import { DesktopErrorCode, desktopError, desktopErrorMessage } from "./desktop-error.ts";

const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
const stopStart = main.indexOf("async function stopDesktopRuntime(");
const stopEnd = main.indexOf("\nfunction beginDesktopStart(", stopStart);
const restartStart = main.indexOf("const restartDesktopRuntime =");
const restartEnd = main.indexOf("\nfunction recordValue(", restartStart);
assert.ok(stopStart >= 0 && stopEnd > stopStart && restartStart > stopEnd && restartEnd > restartStart);
const restart = `${main.slice(stopStart, stopEnd)}\n${main.slice(restartStart, restartEnd)}`;
const exitStart = main.indexOf("onExit: (code, signal) => {");
const exitEnd = main.indexOf("\n    },\n  });", exitStart);
if (exitStart < 0 || exitEnd < 0) throw new Error("无法提取官方 DSH onExit 测试夹具");
const exit = main.slice(exitStart + "onExit: ".length, exitEnd + "\n    },".length).replace(/,$/u, "");

function harness(failFirstStop = false) {
  const events: string[] = [];
  let stops = 0;
  let starts = 0;
  let alive = true;
  let onExit: (code: number, signal: null) => void;
  const runtime = { async stop() {
    stops++;
    if (failFirstStop && stops === 1) throw new Error("stop failed");
    alive = false;
    onExit(1, null);
  } };
  const state = {
    runtime, dshRuntime: runtime as unknown, quitting: false,
    dshClient: {}, runtimeStartPromise: null, stoppingRuntime: null,
    desktopBootstrap: { dshReady: true, startupError: "" },
    dshEventController: { abort() {} },
    sessionFollowControllers: new Map(), pendingRemoteEvents: new Map(),
    createSingleFlight, DesktopErrorCode, desktopError, desktopErrorMessage,
    reportRuntimeError() {},
    runtimeResponds: async () => true,
    console: { error() {} },
    mainWindow: { webContents: { send: (event: string) => events.push(event) } },
    beginDesktopStart: async () => {
      assert.equal(alive, false, "replacement must not overlap an old process");
      starts++;
      state.dshRuntime = {};
      state.desktopBootstrap = { dshReady: true, startupError: "" };
    },
  };
  const functions = runInNewContext(stripTypeScriptTypes(`${restart}\n({ restartDesktopRuntime, onExit: ${exit} })`), state);
  onExit = functions.onExit;
  return { state, events, functions, starts: () => starts, stops: () => stops };
}

test("planned stop and delayed old exit do not poison a ready replacement", async () => {
  const h = harness();
  await h.functions.restartDesktopRuntime();
  h.functions.onExit(1, null);
  assert.equal(h.starts(), 1);
  assert.deepEqual(h.events, []);
  assert.equal(h.state.desktopBootstrap.dshReady, true);
});

test("a failed stop retains the process for a safe retry", async () => {
  const h = harness(true);
  await assert.rejects(h.functions.restartDesktopRuntime(), /stop failed/);
  assert.equal(h.starts(), 0);
  assert.equal(h.state.dshRuntime, h.state.runtime);
  await h.functions.restartDesktopRuntime();
  assert.equal(h.stops(), 2);
  assert.equal(h.starts(), 1);
});

test("an unplanned active runtime exit still reports failure", () => {
  const h = harness();
  h.functions.onExit(1, null);
  assert.deepEqual(h.events, ["desktop:runtime-error"]);
  assert.equal(h.state.desktopBootstrap.dshReady, false);
});
