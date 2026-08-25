import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { OfficialDshRuntime, resolveOfficialDshBin } from "./official-dsh-runtime.ts";

test("resolves the installed official DSH launcher", () => {
  assert.match(resolveOfficialDshBin(), /@deepseek-ai[\\/]dsh[\\/]lib[\\/]bin\.js$/);
});

test("resolves the staged official DSH launcher in packaged resources", () => {
  assert.equal(
    resolveOfficialDshBin(path.join("package", "resources")),
    path.join("package", "resources", "dsh-runtime", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
  );
});

test("starts the official DSH child with a loopback-only web profile", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voltui-official-dsh-"));
  const childScript = path.join(root, "fake-dsh.mjs");
  const argsFile = path.join(root, "args.json");
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
    patchFile: path.join(root, "profile.yml"),
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
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects child output that never publishes a trusted loopback URL", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voltui-official-dsh-"));
  const childScript = path.join(root, "fake-dsh.mjs");
  await writeFile(childScript, `console.log("dsh web: http://0.0.0.0:43123"); setInterval(() => {}, 1000);`);
  const runtime = new OfficialDshRuntime({
    executable: process.execPath,
    dshBin: childScript,
    dshHome: path.join(root, "home"),
    patchFile: path.join(root, "profile.yml"),
    workspace: root,
    startupTimeoutMs: 100,
  });
  try {
    await assert.rejects(runtime.start(), /did not publish its loopback URL/);
  } finally {
    await runtime.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("allows the packaged DSH cold start budget", async () => {
  const source = await readFile(new URL("./official-dsh-runtime.ts", import.meta.url), "utf8");
  assert.match(source, /STARTUP_TIMEOUT_MS\s*=\s*180_000/);
});
