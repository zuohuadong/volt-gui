import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const fixtureKey = "__voltMainLifecycleFixture";
const source = fileURLToPath(new URL("./main.ts", import.meta.url));

function untilAborted(signal) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => signal?.addEventListener("abort", resolve, { once: true }));
}

async function waitFor(check) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("main lifecycle fixture timed out");
}

async function createFixture(options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "volt-main-lifecycle-"));
  const originalResources = Object.getOwnPropertyDescriptor(process, "resourcesPath");
  const originalStdoutErrors = process.stdout.listeners("error");
  const originalStderrErrors = process.stderr.listeners("error");
  const fixture = {
    handlers: new Map(), events: new Map(), runtimes: [], frames: [], quitCount: 0,
    stopFailures: 0, authError: options.authError, authPending: options.authPending ?? false, startHook: options.startHook,
    stopHook: options.stopHook, provisionHook: options.provisionHook, preventedQuits: 0,
    historyMode: options.historyMode ?? "pending", historyStarted: false, maxAlive: 0,
  };
  class Window {
    constructor() {
      fixture.window = this;
      this.events = new Map();
      this.destroyed = false;
      this.webContents = {
        mainFrame: { url: "" },
        send: (...args) => fixture.frames.push(args),
        on() {}, once() {}, setWindowOpenHandler() {},
      };
    }
    static getAllWindows() { return fixture.window ? [fixture.window] : []; }
    isDestroyed() { return this.destroyed; }
    isMinimized() { return false; }
    removeMenu() {} setMenuBarVisibility() {} once() {} show() {} focus() {} restore() {}
    on(event, handler) { this.events.set(event, handler); }
    close() {
      this.destroyed = true;
      fixture.window = null;
      this.events.get("closed")?.();
    }
    async loadFile(file) { this.webContents.mainFrame.url = pathToFileURL(file).href; }
  }
  class Runtime {
    constructor(runtimeOptions) {
      this.options = runtimeOptions;
      this.stops = 0;
      this.alive = false;
      fixture.runtimes.push(this);
    }
    async start() {
      this.starting = true;
      if (fixture.startHook) await fixture.startHook();
      this.options.signal?.throwIfAborted();
      this.alive = true;
      fixture.maxAlive = Math.max(fixture.maxAlive, fixture.runtimes.filter((runtime) => runtime.alive).length);
      return `http://127.0.0.1:43123/?token=${"T".repeat(43)}`;
    }
    async stop() {
      this.stops += 1;
      if (fixture.stopHook) await fixture.stopHook();
      if (fixture.stopFailures > 0) {
        fixture.stopFailures -= 1;
        throw new Error("VOLT_DSH_STOPPED: injected stop failure");
      }
      this.alive = false;
      this.options.onExit?.(0, null);
    }
  }
  class Client {
    async authenticate(signal) {
      if (fixture.authPending) await untilAborted(signal);
      signal?.throwIfAborted();
      if (fixture.authError) {
        const error = fixture.authError;
        fixture.authError = undefined;
        throw error;
      }
    }
    async runEvents(_onEvent, signal) { await untilAborted(signal); }
    async *openStream(endpoint, _args, signal) {
      if (endpoint === "session/follow") {
        fixture.historyStarted = true;
        if (fixture.historyMode === "empty") return;
      }
      await untilAborted(signal);
    }
  }
  fixture.electron = {
    app: {
      isPackaged: true, isReady: () => true, setName() {}, setAppUserModelId() {},
      requestSingleInstanceLock: () => true, getVersion: () => "0.31.56",
      getPath: () => root, whenReady: () => Promise.resolve(),
      on: (event, handler) => fixture.events.set(event, handler),
      quit: () => { fixture.quitCount += 1; },
    },
    BrowserWindow: Window, dialog: {}, shell: {}, Menu: { setApplicationMenu() {} },
    ipcMain: { handle: (channel, handler) => fixture.handlers.set(channel, handler) },
    session: { defaultSession: { setPermissionCheckHandler() {}, setPermissionRequestHandler() {} } },
  };
  fixture.Runtime = Runtime;
  fixture.Client = Client;
  globalThis[fixtureKey] = fixture;
  Object.defineProperty(process, "resourcesPath", { configurable: true, value: root });
  fixture.invoke = (channel, ...args) => fixture.handlers.get(channel)({
    sender: fixture.window.webContents, senderFrame: fixture.window.webContents.mainFrame,
  }, ...args);
  fixture.bootstrap = () => fixture.invoke("desktop:bootstrap");
  fixture.requestQuit = () => fixture.events.get("before-quit")({ preventDefault() { fixture.preventedQuits += 1; } });
  fixture.close = async () => {
    fixture.stopFailures = 0;
    fixture.requestQuit();
    await waitFor(() => fixture.quitCount > 0);
    for (const [stream, previous] of [[process.stdout, originalStdoutErrors], [process.stderr, originalStderrErrors]]) {
      for (const listener of stream.listeners("error")) if (!previous.includes(listener)) stream.off("error", listener);
    }
    if (originalResources) Object.defineProperty(process, "resourcesPath", originalResources);
    else delete process.resourcesPath;
    delete globalThis[fixtureKey];
    await rm(root, { recursive: true, force: true });
  };
  const shared = `const fixture = globalThis[${JSON.stringify(fixtureKey)}];`;
  const stubs = {
    electron: `${shared} export const { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } = fixture.electron;`,
    runtime: `${shared}
      export const OfficialDshRuntime = fixture.Runtime;
      export const startOfficialDshWithRetry = (runtime) => runtime.start();
      export const bundledDshModelEnvironment = () => ({});
      export const migrateLegacyDshCredentials = () => ({ warnings: [] });
      export const provisionBundledDshCredential = async (_client, _path, signal) => {
        if (fixture.provisionHook) await fixture.provisionHook(signal);
        signal?.throwIfAborted();
        return { provisioned: false };
      };
      export const resolveOfficialDshBin = () => "fixture-dsh";
      export const resolveOfficialDshVersion = () => "0.1.5-rc.2";
      export const rethrowUnlessBrokenPipe = (error) => { if (error.code !== "EPIPE") throw error; };`,
    client: `${shared} export const DshRemoteClient = fixture.Client;`,
    smb: `export class SmbMountManager { async mountAuto() {} }`,
  };
  const output = path.join(root, "main.mjs");
  try {
    const bundled = await build({
      entryPoints: [source], bundle: true, write: false, platform: "node", format: "esm", outfile: output,
      plugins: [{
        name: "main-lifecycle-fixtures",
        setup(builder) {
          builder.onResolve({ filter: /^(electron|\.\/official-dsh-runtime\.js|\.\/dsh-remote-client\.js|\.\/smb-mounts\.js)$/ }, ({ path: imported }) => ({
            namespace: "fixture", path: imported === "electron" ? "electron"
              : imported.includes("official-dsh") ? "runtime" : imported.includes("remote-client") ? "client" : "smb",
          }));
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: imported }) => ({ contents: stubs[imported], loader: "js" }));
        },
      }],
    });
    await writeFile(output, bundled.outputFiles[0].contents);
    await import(pathToFileURL(output).href);
    await waitFor(() => fixture.runtimes.length > 0);
    return fixture;
  } catch (error) {
    if (fixture.events.has("before-quit")) await fixture.close();
    throw error;
  }
}

test("stop failure retains ownership and the next retry stops the old runtime first", async () => {
  const fixture = await createFixture();
  try {
    await waitFor(() => fixture.bootstrap().dshReady);
    fixture.stopFailures = 1;
    await assert.rejects(fixture.invoke("desktop:retry-runtime"), /injected stop failure/);
    assert.equal(fixture.runtimes.length, 1);
    assert.equal(fixture.bootstrap().dshReady, false);
    assert.equal((await fixture.invoke("desktop:retry-runtime")).dshReady, true);
    assert.equal(fixture.runtimes[0].stops, 2);
    assert.equal(fixture.runtimes[0].alive, false);
    assert.equal(fixture.runtimes.length, 2);
    assert.equal(fixture.maxAlive, 1);
  } finally { await fixture.close(); }
});

for (const message of ["authentication timed out", "invalid redirect", "missing cookie"]) {
  test(`authentication failure cleans up the runtime: ${message}`, async () => {
    const fixture = await createFixture({ authError: new Error(message) });
    try {
      await waitFor(() => fixture.bootstrap().startupError);
      assert.equal(fixture.runtimes[0].stops, 1);
      assert.equal(fixture.runtimes[0].alive, false);
      assert.equal(fixture.bootstrap().dshReady, false);
      assert.equal((await fixture.invoke("desktop:retry-runtime")).dshReady, true);
      assert.equal(fixture.maxAlive, 1);
    } finally { await fixture.close(); }
  });
}

for (const ending of ["exit", "restart", "empty"]) {
  test(`history before its first snapshot settles on ${ending}`, async () => {
    const fixture = await createFixture({ historyMode: ending === "empty" ? "empty" : "pending" });
    try {
      await waitFor(() => fixture.bootstrap().dshReady);
      const history = fixture.invoke("desktop:dsh-request", "session.history", { sessionId: "s1" });
      const rejected = assert.rejects(history, /VOLT_DSH_(?:STOPPED|FOLLOW_EMPTY|FOLLOW_REPLACED)/);
      await waitFor(() => fixture.historyStarted);
      if (ending === "exit") {
        fixture.runtimes[0].alive = false;
        fixture.runtimes[0].options.onExit(1, null);
      } else if (ending === "restart") await fixture.invoke("desktop:retry-runtime");
      await rejected;
    } finally { await fixture.close(); }
  });
}

test("shutdown waits for the pending startup and never publishes runtime readiness", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const fixture = await createFixture({ startHook: () => pending });
  try {
    fixture.requestQuit();
    assert.equal(fixture.quitCount, 0);
    release();
    await waitFor(() => fixture.quitCount > 0);
    assert.equal(fixture.runtimes.length, 1);
    assert.equal(fixture.runtimes[0].alive, false);
    assert.equal(fixture.frames.some(([channel]) => channel === "desktop:runtime-ready"), false);
  } finally { release(); await fixture.close(); }
});

test("shutdown cancels authentication before waiting for the runtime to stop", async () => {
  const fixture = await createFixture({ authPending: true });
  try {
    await waitFor(() => fixture.runtimes[0]?.alive === true);
    fixture.requestQuit();
    await waitFor(() => fixture.runtimes[0]?.alive === false);
    assert.equal(fixture.runtimes[0].stops, 1);
  } finally { await fixture.close(); }
});

test("stop failure restores a recovery window instead of leaving a headless process", async () => {
  const fixture = await createFixture();
  try {
    await waitFor(() => fixture.bootstrap().dshReady);
    fixture.stopFailures = 1;
    const oldWindow = fixture.window;
    oldWindow.close();
    fixture.requestQuit();
    await waitFor(() => fixture.window !== null);
    assert.notEqual(fixture.window, oldWindow);
    assert.equal(fixture.bootstrap().dshReady, false);
    assert.equal(fixture.frames.some(([channel, message]) => channel === "desktop:runtime-error" && /injected stop failure/.test(message)), true);
    await fixture.invoke("desktop:retry-runtime");
    assert.equal(fixture.runtimes[0].alive, false);
    assert.equal(fixture.runtimes.length, 2);
  } finally { await fixture.close(); }
});

test("shutdown cancels credential provisioning with the startup signal", async () => {
  let provisioning = false;
  const fixture = await createFixture({ provisionHook: async (signal) => {
    provisioning = true;
    await untilAborted(signal);
  } });
  try {
    await waitFor(() => provisioning);
    fixture.requestQuit();
    await waitFor(() => fixture.quitCount > 0);
    assert.equal(fixture.runtimes[0].alive, false);
    assert.equal(fixture.frames.some(([channel]) => channel === "desktop:runtime-ready"), false);
  } finally { await fixture.close(); }
});

test("repeated quit requests cannot bypass an unfinished stop transaction", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const fixture = await createFixture({ stopHook: () => pending });
  try {
    await waitFor(() => fixture.bootstrap().dshReady);
    fixture.requestQuit();
    fixture.requestQuit();
    assert.equal(fixture.preventedQuits, 2);
    assert.equal(fixture.quitCount, 0);
    release();
    await waitFor(() => fixture.quitCount > 0);
  } finally { release(); await fixture.close(); }
});

test("late close after stop failure is not reported as an unexpected exit", async () => {
  const fixture = await createFixture();
  try {
    await waitFor(() => fixture.bootstrap().dshReady);
    fixture.stopFailures = 1;
    await assert.rejects(fixture.invoke("desktop:retry-runtime"), /injected stop failure/);
    const runtime = fixture.runtimes[0];
    const frameCount = fixture.frames.length;
    runtime.alive = false;
    runtime.options.onExit(0, null);
    assert.equal(fixture.frames.length, frameCount);
    await fixture.invoke("desktop:retry-runtime");
    assert.equal(fixture.runtimes.length, 2);
    assert.equal(fixture.maxAlive, 1);
  } finally { await fixture.close(); }
});
