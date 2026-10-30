import assert from "node:assert/strict";
import { createRequire, registerHooks } from "node:module";
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = realpathSync(path.resolve(root, process.env.OCR_PLUGIN_ENTRY ?? "apps/desktop-electron/node_modules/dsh-ab-ocr/lib/index.js"));
const entryUrl = pathToFileURL(entry).href;
const desktopRequire = createRequire(path.join(root, "apps/desktop-electron/package.json"));
const pluginRequire = createRequire(desktopRequire.resolve("dsh-ab-ocr/package.json"));
// Only relocate the plugin's bare imports; use the actual official defineTool.
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL === entryUrl && specifier.startsWith("@deepseek-ai/")) {
      return next(pathToFileURL(pluginRequire.resolve(specifier)).href, context);
    }
    return next(specifier, context);
  },
});
const plugin = await import(entryUrl);
hooks.deregister();

function fixture(options = {}) {
  const calls = { reads: [], spawns: [], confines: [], writes: [], order: [], waits: 0, terminated: 0 };
  const cwd = path.resolve(root, "ocr-test-workspace");
  const source = path.join(cwd, "source.pdf");
  const python = path.join(root, "fixed-python", "python.exe");
  const controller = new AbortController();
  const session = { header: { cwd }, id: "ocr-session" };
  const policy = { mode: options.mode ?? "workspace-write", workspaceRoot: cwd, sessionId: session.id };
  let tool;
  const config = {
    pythonPath: python, workerScript: "", outputDir: "", pageDirName: ".ocr-pages",
    maxDocuments: 3, maxPages: 50, maxPixels: 12000000, dpi: 200,
    timeoutMs: 1000, startupTimeoutMs: 1000, engineLifetime: "perDocument",
    writePageFiles: false, ...options.config,
  };
  const ctx = {
    get(name) { return this[name]; },
    systemPrompt: { section() {} },
    tools: { register(value) { tool = value; }, get() { return tool; } },
    sandboxPolicy: {
      resolve({ session: current }) {
        assert.equal(current, session);
        return policy;
      },
    },
    fs: {
      sandboxMode: "workspace-write",
      async resolve(value, opts) {
        opts?.signal?.throwIfAborted();
        return { path: value };
      },
      processPath(target) { return options.resolvedPath ?? target.path; },
      async stat(target, signal) {
        signal?.throwIfAborted();
        calls.order.push("stat");
        if (options.statError) throw options.statError;
        if (target.path.endsWith(".pdf")) return options.stat ?? { type: "file", size: 8 };
        return undefined;
      },
      async readBytes(target, signal, limit) {
        signal?.throwIfAborted();
        calls.order.push("read");
        calls.reads.push({ path: target.path, limit });
        if (options.readError) throw options.readError;
        const bytes = options.bytes ?? Buffer.from("snapshot");
        if (bytes.byteLength > limit) throw new Error("FS_TOO_LARGE");
        options.afterRead?.(controller);
        return bytes;
      },
      async writeText(target, content, expected, signal, fence) {
        signal?.throwIfAborted();
        assert.equal(fence, policy);
        if (options.writeError) throw options.writeError;
        calls.writes.push({ path: target.path, content });
      },
    },
    sandbox: {
      async confine(argv, fence, signal) {
        signal.throwIfAborted();
        assert.deepEqual(fence, { ...policy, mode: "read-only" });
        assert.equal(policy.mode, options.mode ?? "workspace-write");
        calls.confines.push({ argv, fence });
        if (options.confineError) throw options.confineError;
        options.afterConfine?.(controller);
        return { argv: ["sandbox-runner", ...argv], enforcement: options.enforcement ?? "full" };
      },
    },
    subprocess: {
      async resolveExecutable(value, env, signal) {
        signal.throwIfAborted();
        assert.equal(value, python);
        assert.equal(env, undefined);
        if (options.executableError) throw options.executableError;
        return value;
      },
      spawn(spec) {
        spec.signal.throwIfAborted();
        calls.order.push("spawn");
        calls.spawns.push(spec);
        const stdout = new PassThrough();
        let finish;
        const done = new Promise((resolve) => { finish = resolve; });
        let ended = false;
        const stop = () => {
          if (ended) return;
          ended = true;
          stdout.end();
          finish({ exitCode: spec.signal.aborted ? null : options.exitCode ?? 0 });
        };
        spec.signal.addEventListener("abort", () => {
          if (!options.keepPipeUntilTerminate) stop();
        }, { once: true });
        const selfTest = spec.argv.includes("--self-test");
        const handle = {
          stdout, done, collected: { stderr: { readFrom() { return { text: options.stderr ?? "" }; } } },
          terminate() { calls.terminated++; stop(); },
          async waitForExit(signal) {
            assert.ok(signal instanceof AbortSignal);
            await done;
            if (options.exitGate) await options.exitGate;
            calls.waits++;
            return options.exitConfirmed !== false;
          },
        };
        queueMicrotask(() => {
          if (options.hang === "all" || (!selfTest && options.hang === "recognize")) {
            options.onHang?.(controller);
            return;
          }
          if (selfTest) {
            stdout.write(JSON.stringify({ event: "ready", ready: true }) + "\n");
          } else {
            const specInput = JSON.parse(spec.stdio.stdin.data);
            options.inspectJobs?.(specInput.jobs);
            for (const job of specInput.jobs) {
              for (const event of [
                { event: "start", id: job.id, pages: [1], totalPages: 1, sourceDigest: "snapshot-digest" },
                { event: "done", id: job.id, pages: 1, totalPages: 1, markdown: "recognized", outline: [] },
              ]) stdout.write(JSON.stringify(event) + "\n");
            }
            stdout.write(JSON.stringify({ event: "end", documents: specInput.jobs.length, failures: [] }) + "\n");
          }
          stop();
        });
        return handle;
      },
    },
  };
  plugin.apply(ctx, config);
  return {
    calls, controller, policy, source, ctx, config,
    run(args = { path: source }) { return tool.execute(args, { agent: { session }, signal: controller.signal }); },
  };
}

test("real apply uses bounded snapshots, official confinement and managed processes", async () => {
  let job;
  const f = fixture({ inspectJobs(jobs) { [job] = jobs; } });
  const result = await f.run();
  assert.equal(result.documents.length, 1);
  assert.equal(job.input, f.source);
  assert.equal(Buffer.from(job.inputBase64, "base64").toString(), "snapshot");
  assert.deepEqual(f.calls.reads, [{ path: f.source, limit: 32 * 1024 * 1024 }]);
  assert.ok(f.calls.order.indexOf("read") < f.calls.order.indexOf("spawn"));
  assert.equal(f.calls.confines.length, 2);
  assert.equal(f.calls.spawns.length, 2);
  assert.equal(f.calls.waits, 2);
  assert.equal(f.calls.terminated, 2);
  for (const spec of f.calls.spawns) {
    assert.equal(spec.argv[0], "sandbox-runner");
    assert.deepEqual(spec.argv.slice(2, 5), ["-E", "-s", "-B"]);
    assert.equal(spec.cwd, path.resolve(path.dirname(entry), "../python"));
    assert.deepEqual(Object.keys(spec.env).sort(), ["PYTHONHOME", "PYTHONPATH", "PYTHONSTARTUP"]);
  }
  assert.ok(f.calls.writes.length > 0);
});

for (const [name, options, args, expected] of [
  ["read-only", { mode: "read-only" }, undefined, /sandbox/i],
  ["levels", {}, { path: "source.pdf", levels: "h1=1" }, /disabled/],
  ["network path", {}, { path: "\\\\server\\share\\source.pdf" }, /network/],
  ["device target", { resolvedPath: "\\\\?\\C:\\source.pdf" }, undefined, /network/],
  ["stat denial", { statError: new Error("FS_DENIED") }, undefined, /FS_DENIED/],
  ["read denial", { readError: new Error("FS_DENIED") }, undefined, /FS_DENIED/],
  ["directory", { stat: { type: "directory", size: 8 } }, undefined, /regular file/],
  ["oversize", { stat: { type: "file", size: 33 * 1024 * 1024 } }, undefined, /byte limit/],
  ["missing Python", { config: { pythonPath: "" } }, undefined, /absolute/],
  ["PATH Python", { config: { pythonPath: "python" } }, undefined, /absolute/],
  ["worker override", { config: { workerScript: "evil.py" } }, undefined, /overrides/],
  ["unavailable executable", { executableError: new Error("missing executable") }, undefined, /missing executable/],
  ["unavailable sandbox", { confineError: new Error("SANDBOX_UNAVAILABLE") }, undefined, /SANDBOX_UNAVAILABLE/],
  ["unknown enforcement", { enforcement: "unknown" }, undefined, /unknown sandbox/],
]) {
  test(`${name} fails before any process starts`, async () => {
    const f = fixture(options);
    await assert.rejects(f.run(args), expected);
    assert.equal(f.calls.spawns.length, 0);
    assert.equal(f.calls.writes.length, 0);
  });
}

test("official partial enforcement still uses the confined argv", async () => {
  const f = fixture({ enforcement: "partial" });
  const result = await f.run();
  assert.equal(result.documents.length, 1);
  assert.equal(f.calls.confines.length, 2);
  assert.equal(f.calls.spawns.length, 2);
  for (const [index, spec] of f.calls.spawns.entries()) {
    assert.deepEqual(spec.argv, ["sandbox-runner", ...f.calls.confines[index].argv]);
    assert.equal(f.calls.confines[index].fence.mode, "read-only");
    assert.notEqual(f.calls.confines[index].fence, f.policy);
    assert.equal(f.policy.mode, "workspace-write");
  }
});

test("missing sandbox service never falls back to an unconfined process", async () => {
  const f = fixture();
  delete f.ctx.sandbox;
  await assert.rejects(f.run(), /official process and sandbox services/);
  assert.equal(f.calls.spawns.length, 0);
});

test("artifact writes preserve official filesystem denial", async () => {
  const f = fixture({ writeError: Object.assign(new Error("denied"), { code: "FS_SANDBOX_DENIED" }) });
  await assert.rejects(f.run(), /sandbox/i);
  assert.equal(f.calls.writes.length, 0);
  assert.equal(f.calls.waits, f.calls.spawns.length);
});

test("pre-cancelled request does not read or start", async () => {
  const f = fixture();
  f.controller.abort();
  await assert.rejects(f.run(), /abort/i);
  assert.equal(f.calls.reads.length, 0);
  assert.equal(f.calls.spawns.length, 0);
});

for (const phase of ["afterRead", "afterConfine"]) {
  test(`cancellation ${phase} prevents spawn`, async () => {
    const f = fixture({ [phase](controller) { controller.abort(); } });
    await assert.rejects(f.run(), /abort/i);
    assert.equal(f.calls.spawns.length, 0);
  });
}

test("cancellation waits for managed exit before settling", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const f = fixture({ hang: "all", exitGate: gate, onHang(controller) { controller.abort(); } });
  let settled = false;
  const result = f.run().finally(() => { settled = true; });
  const rejected = assert.rejects(result, /cancel/i);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  release();
  await rejected;
  assert.equal(f.calls.waits, 1);
});

test("recognition timeout terminates and awaits exit", async () => {
  const f = fixture({ hang: "recognize", config: { timeoutMs: 20 } });
  await assert.rejects(f.run(), /timed out/);
  assert.equal(f.calls.waits, 2);
  assert.equal(f.calls.terminated, 2);
});

test("timeout reaches termination even while stdout and done remain open", async () => {
  const f = fixture({ hang: "recognize", keepPipeUntilTerminate: true, config: { timeoutMs: 20 } });
  await assert.rejects(f.run(), /timed out/);
  assert.equal(f.calls.terminated, 2);
  assert.equal(f.calls.waits, 2);
});

test("unconfirmed exit fails closed", async () => {
  const f = fixture({ exitConfirmed: false });
  await assert.rejects(f.run(), /exit could not be confirmed/);
  assert.equal(f.calls.spawns.length, 1);
});

test("nonzero worker exit fails and is awaited", async () => {
  const f = fixture({ exitCode: 1, stderr: "windows-acl-run: CreateProcessAsUserW failed (Win32 1314)" });
  await assert.rejects(f.run(), /exit code 1: windows-acl-run: CreateProcessAsUserW failed \(Win32 1314\)/);
  assert.equal(f.calls.waits, 1);
});

test("snapshot budget applies across the batch", async () => {
  const f = fixture({ bytes: Buffer.alloc(24 * 1024 * 1024) });
  await assert.rejects(f.run({ paths: ["a.pdf", "b.pdf", "c.pdf"] }), /FS_TOO_LARGE/);
  assert.deepEqual(f.calls.reads.map(({ limit }) => limit), [32, 32, 16].map((n) => n * 1024 * 1024));
  assert.equal(f.calls.spawns.length, 0);
});

test("entry has no raw process API and requires official capabilities", async () => {
  const text = await readFile(entry, "utf8");
  assert.doesNotMatch(text, /node:child_process|\bexistsSync\b/);
  for (const capability of ["fs", "sandboxPolicy", "sandbox", "subprocess"]) {
    assert.ok(plugin.inject.includes(capability));
  }
});
