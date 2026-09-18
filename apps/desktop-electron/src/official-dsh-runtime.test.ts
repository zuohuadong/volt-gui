import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";

import {
  acknowledgeOfficialDshWelcomeNotice,
  bundledDshModelEnvironment,
  extractTrustedDshUrl,
  migrateLegacyDshCredentials,
  OfficialDshRuntime,
  officialDshChildEnvironment,
  provisionBundledDshCredential,
  resolveOfficialDshBin,
  resolveOfficialDshVersion,
  rethrowUnlessBrokenPipe,
  startOfficialDshWithRetry,
  STARTUP_TIMEOUT_MS,
  WELCOME_NOTICE_VERSION,
} from "./official-dsh-runtime.ts";

async function removeTempRoot(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}

test("a child that never closes causes bounded stop failure without releasing ownership", { timeout: 15_000 }, async () => {
  const signals: string[] = [];
  const child = Object.assign(new EventEmitter(), {
    exitCode: null, signalCode: null,
    stdout: { closed: false }, stderr: { closed: false },
    kill(signal: string) { signals.push(signal); return true; },
  });
  const runtime = new OfficialDshRuntime({ dshBin: "unused", dshHome: "unused", patchFile: "unused", workspace: "unused" });
  const internal = runtime as unknown as { child: typeof child | null };
  internal.child = child;
  await assert.rejects(runtime.stop(), /VOLT_DSH_STOPPED/);
  assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
  assert.equal(internal.child, child);
  assert.equal(child.listenerCount("close"), 0);
  internal.child = null;
});

test("drops inherited provider credentials from the official DSH child environment", () => {
  const env = officialDshChildEnvironment({
    PATH: "/bin",
    DEEPSEEK_API_KEY: "parent-deepseek",
    OPENAI_API_KEY: "parent-openai",
    XG_GOMODEL_API_KEY: "parent-gateway",
    XG_MODEL_BASE_URL: "http://evil.example/v1",
    XG_GOMODEL_ENDPOINT: "http://evil.example/v1",
  }, {
    DSH_HOME: "/tmp/home",
    XG_MODEL_BASE_URL: "http://192.168.1.47:9010/v1",
    DEEPSEEK_API_KEY: "override-should-not-win",
  });
  assert.equal(env.PATH, "/bin");
  assert.equal(env.DSH_HOME, "/tmp/home");
  assert.equal(env.XG_GOMODEL_API_KEY, "");
  assert.equal(env.DEEPSEEK_API_KEY, undefined);
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.XG_GOMODEL_ENDPOINT, undefined);
  assert.equal(env.XG_MODEL_BASE_URL, "http://192.168.1.47:9010/v1");
});

test("resolves the installed official DSH launcher", () => {
  assert.match(resolveOfficialDshBin(), /@deepseek-ai[\\/]dsh[\\/]lib[\\/]bin\.js$/);
  assert.equal(resolveOfficialDshVersion(), "0.1.5-rc.1");
});

test("resolves the staged official DSH launcher in packaged resources", () => {
  assert.equal(
    resolveOfficialDshBin(path.join("package", "resources")),
    path.join("package", "resources", "dsh-runtime", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
  );
});

test("ignores only closed GUI log pipes", () => {
  assert.doesNotThrow(() => rethrowUnlessBrokenPipe(Object.assign(new Error("closed"), { code: "EPIPE" })));
  assert.throws(
    () => rethrowUnlessBrokenPipe(Object.assign(new Error("denied"), { code: "EACCES" })),
    /denied/,
  );
});

test("migrates legacy official DSH credentials into a new branded home", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voltui-dsh-credential-migration-"));
  const legacyHome = path.join(root, "voltui", "dsh");
  const targetHome = path.join(root, "Anyong", "dsh");
  const source = "version: 1\nrefs: { XG_GOMODEL_API_KEY: test-value }\n";
  await mkdir(legacyHome, { recursive: true });
  await writeFile(path.join(legacyHome, ".credentials.yaml"), source);
  try {
    const result = migrateLegacyDshCredentials(targetHome, [legacyHome]);
    assert.equal(result.migratedFrom, path.join(legacyHome, ".credentials.yaml"));
    assert.deepEqual(result.warnings, []);
    assert.equal(await readFile(path.join(targetHome, ".credentials.yaml"), "utf8"), source);
  } finally {
    await removeTempRoot(root);
  }
});

test("never overwrites credentials already stored in the current DSH home", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voltui-dsh-credential-preserve-"));
  const legacyHome = path.join(root, "voltui", "dsh");
  const targetHome = path.join(root, "Anyong", "dsh");
  await mkdir(legacyHome, { recursive: true });
  await mkdir(targetHome, { recursive: true });
  await writeFile(path.join(legacyHome, ".credentials.yaml"), "version: 1\nrefs: { XG_GOMODEL_API_KEY: old-value }\n");
  await writeFile(path.join(targetHome, ".credentials.yaml"), "version: 1\nrefs: { XG_GOMODEL_API_KEY: current-value }\n");
  try {
    const result = migrateLegacyDshCredentials(targetHome, [legacyHome]);
    assert.equal(result.migratedFrom, undefined);
    assert.deepEqual(result.warnings, []);
    assert.equal(
      await readFile(path.join(targetHome, ".credentials.yaml"), "utf8"),
      "version: 1\nrefs: { XG_GOMODEL_API_KEY: current-value }\n",
    );
  } finally {
    await removeTempRoot(root);
  }
});

test("provisions the bundled model credential through the official DSH credentials service", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voltui-bundled-credential-"));
  const bundledPath = path.join(root, "bundled.env");
  await writeFile(bundledPath, "XG_GOMODEL_API_KEY=build-time-value\n");
  const originalFetch = globalThis.fetch;
  const requests: Array<{ method: string; payload: unknown }> = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { method: string; payload: unknown };
    requests.push({ method: body.method, payload: body.payload });
    const value = body.method === "credentials.describe"
      ? { credentials: { XG_GOMODEL_API_KEY: { configured: false } } }
      : { ok: true };
    return new Response(JSON.stringify({ result: { ok: true, value } }), { status: 200 });
  };
  try {
    const result = await provisionBundledDshCredential("http://127.0.0.1:43123", bundledPath);
    assert.deepEqual(result, { provisioned: true, skipped: false, reason: "provisioned" });
    assert.deepEqual(requests, [
      { method: "credentials.describe", payload: { refs: ["XG_GOMODEL_API_KEY"] } },
      { method: "credentials.set", payload: { ref: "XG_GOMODEL_API_KEY", value: "build-time-value" } },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    await removeTempRoot(root);
  }
});

test("fails closed when a bundled credential sidecar is present but invalid", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voltui-invalid-bundled-credential-"));
  const bundledPath = path.join(root, "bundled.env");
  await writeFile(bundledPath, "XG_MODEL_BASE_URL=http://127.0.0.1:9010/v1\n");
  try {
    await assert.rejects(
      provisionBundledDshCredential("http://127.0.0.1:43123", bundledPath),
      /sidecar 无效.*XG_GOMODEL_API_KEY/u,
    );
  } finally {
    await removeTempRoot(root);
  }
});

for (const phase of ["credentials/describe", "credentials/set"]) {
  test(`credential provisioning cancels ${phase} without starting another request`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "voltui-credential-cancellation-"));
    const bundledPath = path.join(root, "bundled.env");
    await writeFile(bundledPath, "XG_GOMODEL_API_KEY=synthetic-cancel-value\n");
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const controller = new AbortController();
    const methods: string[] = [];
    const client = {
      async call(method: string, _args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
        methods.push(method);
        assert.equal(signal, controller.signal);
        if (method !== phase) return { XG_GOMODEL_API_KEY: { configured: false } };
        markStarted();
        return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason), { once: true }));
      },
    };
    try {
      const running = provisionBundledDshCredential(client, bundledPath, controller.signal);
      const rejected = assert.rejects(running, /synthetic provisioning cancellation/);
      await started;
      controller.abort(new Error("synthetic provisioning cancellation"));
      await rejected;
      assert.deepEqual(methods, phase === "credentials/describe" ? [phase] : ["credentials/describe", phase]);
    } finally { await removeTempRoot(root); }
  });
}

for (const source of ["project-env", "user-env", "env", "unknown"]) {
  test(`handles ${source} credentials without overwriting an unrecognized source`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "voltui-credential-source-"));
    const bundledPath = path.join(root, "bundled.env");
    await writeFile(bundledPath, "XG_GOMODEL_API_KEY=synthetic-bundled-value\n");
    const originalFetch = globalThis.fetch;
    const methods: string[] = [];
    globalThis.fetch = async (_input, init) => {
      const request = JSON.parse(String(init?.body));
      methods.push(request.method);
      const value = request.method === "credentials.describe"
        ? { credentials: { XG_GOMODEL_API_KEY: { configured: true, source, writable: true } } }
        : {};
      return new Response(JSON.stringify({ result: { ok: true, value } }));
    };
    try {
      if (source === "env") {
        await assert.rejects(provisionBundledDshCredential("http://127.0.0.1:43123", bundledPath), /启动环境覆盖/u);
        assert.deepEqual(methods, ["credentials.describe"]);
        return;
      }
      if (source === "unknown") {
        assert.equal((await provisionBundledDshCredential("http://127.0.0.1:43123", bundledPath)).reason, "already-configured");
        assert.deepEqual(methods, ["credentials.describe"]);
        return;
      }
      assert.equal((await provisionBundledDshCredential("http://127.0.0.1:43123", bundledPath)).provisioned, true);
      assert.deepEqual(methods, ["credentials.describe", "credentials.set"]);
    } finally {
      globalThis.fetch = originalFetch;
      await removeTempRoot(root);
    }
  });
}

test("validates the packaged gateway endpoint without exposing secrets", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voltui-bundled-endpoint-"));
  const bundledPath = path.join(root, "bundled.env");
  try {
    assert.deepEqual(bundledDshModelEnvironment(bundledPath), { XG_MODEL_BASE_URL: "" });
    await writeFile(bundledPath, "XG_MODEL_BASE_URL=https://example.invalid/v1/\n");
    assert.deepEqual(bundledDshModelEnvironment(bundledPath), { XG_MODEL_BASE_URL: "https://example.invalid/v1" });
    for (const endpoint of ["invalid", "file:///tmp/test", "https://user:synthetic-password@example.invalid/v1", "https://example.invalid/v1?token=synthetic"]) {
      await writeFile(bundledPath, `XG_MODEL_BASE_URL=${endpoint}\n`);
      assert.throws(() => bundledDshModelEnvironment(bundledPath), (error: Error) => {
        assert.doesNotMatch(error.message, /synthetic/);
        return true;
      });
    }
  } finally {
    await removeTempRoot(root);
  }
});

test("does not overwrite an existing DSH credential with the bundled value", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voltui-bundled-credential-"));
  const bundledPath = path.join(root, "bundled.env");
  await writeFile(bundledPath, "XG_GOMODEL_API_KEY=build-time-value\n");
  const originalFetch = globalThis.fetch;
  const methods: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { method: string };
    methods.push(body.method);
    return new Response(JSON.stringify({ result: { ok: true, value: { credentials: { XG_GOMODEL_API_KEY: { configured: true, source: "file" } } } } }), { status: 200 });
  };
  try {
    const result = await provisionBundledDshCredential("http://127.0.0.1:43123", bundledPath);
    assert.deepEqual(result, { provisioned: false, skipped: true, reason: "already-configured" });
    assert.deepEqual(methods, ["credentials.describe"]);
  } finally {
    globalThis.fetch = originalFetch;
    await removeTempRoot(root);
  }
});

test("acknowledges the official DSH welcome notice without replacing user settings", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voltui-official-dsh-settings-"));
  const settingsPath = path.join(root, "settings.yaml");
  await writeFile(settingsPath, "# Keep this user setting\nllm-deepseek:\n  providers:\n    custom: true\n");
  try {
    acknowledgeOfficialDshWelcomeNotice(root);
    const source = await readFile(settingsPath, "utf8");
    const settings = parse(source);
    assert.match(source, /# Keep this user setting/);
    assert.equal(settings["llm-deepseek"].providers.custom, true);
    assert.equal(settings["ui-onboarding"].welcomeNoticeVersion, WELCOME_NOTICE_VERSION);
  } finally {
    await removeTempRoot(root);
  }
});

test("keeps the official DSH welcome acknowledgement idempotent", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voltui-official-dsh-settings-"));
  const settingsPath = path.join(root, "settings.yaml");
  try {
    acknowledgeOfficialDshWelcomeNotice(root);
    const first = await readFile(settingsPath, "utf8");
    acknowledgeOfficialDshWelcomeNotice(root);
    assert.equal(await readFile(settingsPath, "utf8"), first);
  } finally {
    await removeTempRoot(root);
  }
});

test("does not overwrite invalid official DSH settings", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voltui-official-dsh-settings-"));
  const settingsPath = path.join(root, "settings.yaml");
  const invalid = "ui-onboarding: [\n";
  await writeFile(settingsPath, invalid);
  try {
    assert.throws(() => acknowledgeOfficialDshWelcomeNotice(root), /settings are invalid/);
    assert.equal(await readFile(settingsPath, "utf8"), invalid);
  } finally {
    await removeTempRoot(root);
  }
});

test("extracts a trusted loopback URL when DSH also prints a LAN address", () => {
  const token = "A".repeat(43);
  const loopback = `http://127.0.0.1:60935/?token=${token}`;
  assert.equal(
    extractTrustedDshUrl(`dsh web: ${loopback} (LAN: http://192.168.1.10:60935/?token=${token})`),
    loopback,
  );
  assert.equal(extractTrustedDshUrl(`dsh web: ${loopback}`), loopback);
  assert.equal(extractTrustedDshUrl(`dsh web: http://192.168.1.10:60935/?token=${token}`), undefined);
});

test("starts the official DSH child with a loopback-only web profile", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voltui-official-dsh-"));
  const childScript = path.join(root, "fake-dsh.mjs");
  const argsFile = path.join(root, "args.json");
  const patchFile = path.join(root, "profile.yml");
  await writeFile(patchFile, "[]\n");
  await writeFile(childScript, `
    import { writeFile } from "node:fs/promises";
    await writeFile(process.env.ARGS_FILE, JSON.stringify({
      argv: process.argv.slice(2),
      dshHome: process.env.DSH_HOME,
      dshCwd: process.env.DSH_CWD,
      officeCliCommand: process.env.ANYONG_OFFICECLI_COMMAND,
      officeCliArgs: process.env.ANYONG_OFFICECLI_ARGS_JSON,
      gatewayKey: process.env.XG_GOMODEL_API_KEY ?? "",
      deepseekKey: process.env.DEEPSEEK_API_KEY ?? "",
      openaiKey: process.env.OPENAI_API_KEY ?? "",
    }));
    console.log("dsh web: http://127.0.0.1:43123/?token=${"A".repeat(43)}");
    setInterval(() => {}, 1000);
  `);
  const runtime = new OfficialDshRuntime({
    executable: process.execPath,
    dshBin: childScript,
    dshHome: path.join(root, "home"),
    patchFile,
    workspace: root,
    environment: {
      ANYONG_OFFICECLI_COMMAND: process.execPath,
      ANYONG_OFFICECLI_ARGS_JSON: JSON.stringify([path.join(root, "officecli.js"), "mcp"]),
    },
    startupTimeoutMs: 5_000,
  });
  const previousArgsFile = process.env.ARGS_FILE;
  const previousGatewayKey = process.env.XG_GOMODEL_API_KEY;
  const previousDeepseekKey = process.env.DEEPSEEK_API_KEY;
  const previousOpenaiKey = process.env.OPENAI_API_KEY;
  process.env.ARGS_FILE = argsFile;
  process.env.XG_GOMODEL_API_KEY = "should-not-leak";
  process.env.DEEPSEEK_API_KEY = "should-not-leak-deepseek";
  process.env.OPENAI_API_KEY = "should-not-leak-openai";
  try {
    assert.equal(await runtime.start(), `http://127.0.0.1:43123/?token=${"A".repeat(43)}`);
    const observed = JSON.parse(await readFile(argsFile, "utf8"));
    assert.deepEqual(observed.argv, [
      "web", "--patch", path.join(root, "profile.yml"),
      "--host", "127.0.0.1", "--port", "0", "--no-open",
    ]);
    assert.equal(observed.dshHome, path.join(root, "home"));
    assert.equal(observed.dshCwd, root);
    assert.equal(observed.officeCliCommand, process.execPath);
    assert.deepEqual(JSON.parse(observed.officeCliArgs), [path.join(root, "officecli.js"), "mcp"]);
    assert.equal(observed.gatewayKey, "");
    assert.equal(observed.deepseekKey, "");
    assert.equal(observed.openaiKey, "");
  } finally {
    if (previousArgsFile === undefined) delete process.env.ARGS_FILE;
    else process.env.ARGS_FILE = previousArgsFile;
    if (previousGatewayKey === undefined) delete process.env.XG_GOMODEL_API_KEY;
    else process.env.XG_GOMODEL_API_KEY = previousGatewayKey;
    if (previousDeepseekKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousDeepseekKey;
    if (previousOpenaiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenaiKey;
    await runtime.stop();
    await removeTempRoot(root);
  }
});

test("accepts a loopback URL split across output chunks without a trailing newline", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voltui-official-dsh-"));
  const childScript = path.join(root, "fake-dsh.mjs");
  const patchFile = path.join(root, "profile.yml");
  await writeFile(patchFile, "[]\n");
  await writeFile(childScript, `
    process.stdout.write("\\u001b[2KDSH web: http://127.");
    setTimeout(() => process.stdout.write("0.0.1:43124/?token=${"B".repeat(43)}"), 25);
    setInterval(() => {}, 1000);
  `);
  const runtime = new OfficialDshRuntime({
    executable: process.execPath,
    dshBin: childScript,
    dshHome: path.join(root, "home"),
    patchFile,
    workspace: root,
    startupTimeoutMs: 5_000,
  });
  try {
    assert.equal(await runtime.start(), `http://127.0.0.1:43124/?token=${"B".repeat(43)}`);
  } finally {
    await runtime.stop();
    await removeTempRoot(root);
  }
});

test("stops the complete official DSH process tree on Windows", { skip: process.platform !== "win32" }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voltui-official-dsh-tree-"));
  const childScript = path.join(root, "fake-dsh.mjs");
  const grandchildScript = path.join(root, "grandchild.mjs");
  const grandchildPidFile = path.join(root, "grandchild.pid");
  const patchFile = path.join(root, "profile.yml");
  await writeFile(patchFile, "[]\n");
  await writeFile(grandchildScript, "setInterval(() => {}, 1000);\n");
  await writeFile(childScript, `
    import { spawn } from "node:child_process";
    import { writeFile } from "node:fs/promises";
    const grandchild = spawn(process.execPath, [${JSON.stringify(grandchildScript)}], {
      detached: false,
      stdio: "ignore",
      windowsHide: true,
    });
    await writeFile(${JSON.stringify(grandchildPidFile)}, String(grandchild.pid));
    console.log("dsh web: http://127.0.0.1:43123/?token=${"C".repeat(43)}");
    setInterval(() => {}, 1000);
  `);
  const runtime = new OfficialDshRuntime({
    executable: process.execPath,
    dshBin: childScript,
    dshHome: path.join(root, "home"),
    patchFile,
    workspace: root,
    startupTimeoutMs: 5_000,
  });
  try {
    await runtime.start();
    const grandchildPid = Number.parseInt(await readFile(grandchildPidFile, "utf8"), 10);
    assert.doesNotThrow(() => process.kill(grandchildPid, 0));
    await runtime.stop();
    assert.throws(() => process.kill(grandchildPid, 0));
  } finally {
    await runtime.stop();
    await removeTempRoot(root);
  }
});

test("rejects child output that never publishes a trusted loopback URL", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voltui-official-dsh-"));
  const childScript = path.join(root, "fake-dsh.mjs");
  const patchFile = path.join(root, "profile.yml");
  await writeFile(patchFile, "[]\n");
  await writeFile(childScript, `console.log("dsh web: http://0.0.0.0:43123"); setInterval(() => {}, 1000);`);
  const runtime = new OfficialDshRuntime({
    executable: process.execPath,
    dshBin: childScript,
    dshHome: path.join(root, "home"),
    patchFile,
    workspace: root,
    startupTimeoutMs: 100,
  });
  try {
    await assert.rejects(runtime.start(), /did not publish its loopback URL/);
  } finally {
    await runtime.stop();
    await removeTempRoot(root);
  }
});

test("includes buffered DSH output when the child exits before startup", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voltui-official-dsh-"));
  const childScript = path.join(root, "fake-dsh.mjs");
  const patchFile = path.join(root, "profile.yml");
  await writeFile(patchFile, "[]\n");
  await writeFile(childScript, `process.stderr.write("invalid profile overlay"); process.exit(1);`);
  const runtime = new OfficialDshRuntime({
    executable: process.execPath,
    dshBin: childScript,
    dshHome: path.join(root, "nested", "home"),
    patchFile,
    workspace: root,
    startupTimeoutMs: 5_000,
  });
  try {
    await assert.rejects(
      runtime.start(),
      /Official DSH exited before startup: code=1 signal=null[\s\S]*invalid profile overlay/,
    );
  } finally {
    await runtime.stop();
    await removeTempRoot(root);
  }
});

test("retries one transient code=1 startup failure", async () => {
  let attempts = 0;
  const runtime = {
    async start() {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("Official DSH exited before startup: code=1 signal=null");
      }
      return "http://127.0.0.1:43123";
    },
  };

  assert.equal(await startOfficialDshWithRetry(runtime, 0), "http://127.0.0.1:43123");
  assert.equal(attempts, 2);
});

test("does not retry deterministic startup errors", async () => {
  let attempts = 0;
  const runtime = {
    async start(): Promise<string> {
      attempts += 1;
      throw new Error("Official DSH profile patch is missing");
    },
  };

  await assert.rejects(startOfficialDshWithRetry(runtime, 0), /profile patch is missing/);
  assert.equal(attempts, 1);
});

test("does not launch a retry after shutdown interrupts the retry delay", async () => {
  const controller = new AbortController();
  let attempts = 0;
  const runtime = {
    async start(): Promise<string> {
      attempts += 1;
      setTimeout(() => controller.abort(new Error("shutdown")), 5);
      throw new Error("Official DSH exited before startup: code=1 signal=null");
    },
  };
  await assert.rejects(startOfficialDshWithRetry(runtime, 20, controller.signal), /shutdown/);
  assert.equal(attempts, 1);
});

test("cancels a running startup and reaps the child before rejecting", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "volt-dsh-cancel-"));
  const childScript = path.join(root, "fake-dsh.mjs");
  const patchFile = path.join(root, "profile.yml");
  const controller = new AbortController();
  await writeFile(patchFile, "[]\n");
  await writeFile(childScript, "console.log('preparing'); setInterval(() => {}, 1000);\n");
  const runtime = new OfficialDshRuntime({
    executable: process.execPath, dshBin: childScript, dshHome: path.join(root, "home"),
    patchFile, workspace: root, signal: controller.signal,
    onLog: () => controller.abort(new Error("shutdown")),
  });
  try {
    await assert.rejects(runtime.start(), /shutdown/);
    assert.equal(runtime.url, "");
    await runtime.stop();
    await assert.rejects(runtime.start(), /shutdown/);
  } finally {
    await runtime.stop();
    await removeTempRoot(root);
  }
});

test("allows a bounded cold startup including the official MCP handshake", () => {
  assert.equal(STARTUP_TIMEOUT_MS, 240_000);
});

test("includes unterminated diagnostic output on timeout and allows a clean retry", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voltui-dsh-timeout-"));
  const childScript = path.join(root, "fake-dsh.mjs");
  const patchFile = path.join(root, "profile.yml");
  await writeFile(patchFile, "[]\n");
  await writeFile(childScript, `process.stderr.write("waiting for plugin initialization"); setInterval(() => {}, 1000);`);
  const runtime = new OfficialDshRuntime({
    executable: process.execPath, dshBin: childScript,
    dshHome: path.join(root, "home"), patchFile, workspace: root, startupTimeoutMs: 2_000,
  });
  try {
    await assert.rejects(runtime.start(), /did not publish its loopback URL[\s\S]*waiting for plugin initialization/);
    await writeFile(childScript, `console.log("dsh web: http://127.0.0.1:43123/?token=${"D".repeat(43)}"); setInterval(() => {}, 1000);`);
    assert.equal(await runtime.start(), `http://127.0.0.1:43123/?token=${"D".repeat(43)}`);
  } finally {
    await runtime.stop();
    await removeTempRoot(root);
  }
});

test("redacts startup tokens from unterminated timeout diagnostics", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voltui-dsh-timeout-redaction-"));
  const childScript = path.join(root, "fake-dsh.mjs");
  const patchFile = path.join(root, "profile.yml");
  const token = "S".repeat(43);
  await writeFile(patchFile, "[]\n");
  await writeFile(childScript, `process.stderr.write("pending http://127.0.0.1:43123/?token=${token}"); setInterval(() => {}, 1000);`);
  const runtime = new OfficialDshRuntime({
    executable: process.execPath, dshBin: childScript,
    dshHome: path.join(root, "home"), patchFile, workspace: root, startupTimeoutMs: 500,
  });
  try {
    await assert.rejects(runtime.start(), (error: Error) => {
      assert.doesNotMatch(error.message, new RegExp(token, "u"));
      assert.match(error.message, /token=\[redacted\]/u);
      return true;
    });
  } finally {
    await runtime.stop();
    await removeTempRoot(root);
  }
});

test("keeps the desktop shell visible while the official runtime starts and exposes recovery IPC", async () => {
  const source = await readFile(new URL("./main.ts", import.meta.url), "utf8");
  assert.match(source, /mainWindow\s*=\s*createWindow\(\);\s*\n\s*void beginDesktopStart\(\);/);
  assert.match(source, /mainWindow\?\.webContents\.send\("desktop:runtime-ready"\)/);
  assert.match(source, /handleTrustedIpc\("desktop:retry-runtime"/);
  assert.match(source, /new DshRemoteClient\(dshUrl\)[\s\S]*await authenticatedClient\.authenticate\(signal\)/);
});

test("does not inherit the built-in gateway key from the user's process environment", async () => {
  const mainSource = await readFile(new URL("./main.ts", import.meta.url), "utf8");
  const runtimeSource = await readFile(new URL("./official-dsh-runtime.ts", import.meta.url), "utf8");
  assert.match(mainSource, /XG_GOMODEL_API_KEY:\s*["']{2}/);
  assert.match(runtimeSource, /officialDshChildEnvironment/);
  assert.match(runtimeSource, /XG_GOMODEL_API_KEY\s*=\s*["']{2}/);
});
