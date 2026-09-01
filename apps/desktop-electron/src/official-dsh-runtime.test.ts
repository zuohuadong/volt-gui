import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";

import {
  acknowledgeOfficialDshWelcomeNotice,
  migrateLegacyDshCredentials,
  OfficialDshRuntime,
  resolveOfficialDshBin,
  rethrowUnlessBrokenPipe,
  startOfficialDshWithRetry,
  WELCOME_NOTICE_VERSION,
} from "./official-dsh-runtime.ts";

async function removeTempRoot(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}

test("resolves the installed official DSH launcher", () => {
  assert.match(resolveOfficialDshBin(), /@deepseek-ai[\\/]dsh[\\/]lib[\\/]bin\.js$/);
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

test("starts the official DSH child with a loopback-only web profile", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voltui-official-dsh-"));
  const childScript = path.join(root, "fake-dsh.mjs");
  const argsFile = path.join(root, "args.json");
  const patchFile = path.join(root, "profile.yml");
  await writeFile(patchFile, "[]\n");
  await writeFile(childScript, `
    import { writeFile } from "node:fs/promises";
    await writeFile(process.env.ARGS_FILE, JSON.stringify({ argv: process.argv.slice(2), dshHome: process.env.DSH_HOME }));
    console.log("dsh web: http://127.0.0.1:43123");
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
  const previousArgsFile = process.env.ARGS_FILE;
  process.env.ARGS_FILE = argsFile;
  try {
    assert.equal(await runtime.start(), "http://127.0.0.1:43123");
    const observed = JSON.parse(await readFile(argsFile, "utf8"));
    assert.deepEqual(observed.argv, [
      "web", "--patch", path.join(root, "profile.yml"),
      "--host", "127.0.0.1", "--port", "0", "--no-open",
    ]);
    assert.equal(observed.dshHome, path.join(root, "home"));
  } finally {
    if (previousArgsFile === undefined) delete process.env.ARGS_FILE;
    else process.env.ARGS_FILE = previousArgsFile;
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
    console.log("dsh web: http://127.0.0.1:43123");
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

test("allows the packaged DSH cold start budget", async () => {
  const source = await readFile(new URL("./official-dsh-runtime.ts", import.meta.url), "utf8");
  assert.match(source, /STARTUP_TIMEOUT_MS\s*=\s*180_000/);
});
