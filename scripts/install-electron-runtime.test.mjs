import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { installElectronRuntime } from "./install-electron-runtime.mjs";

function fixture(context) {
  const electronPackage = fs.mkdtempSync(path.join(os.tmpdir(), "volt-electron-install-"));
  context.after(() => fs.rmSync(electronPackage, { recursive: true, force: true }));
  const marker = path.join(electronPackage, "dist", "electron");
  fs.writeFileSync(path.join(electronPackage, "install.js"), "");
  fs.writeFileSync(path.join(electronPackage, "package.json"), JSON.stringify({ version: "44.0.0" }));
  const options = {
    electronPackage,
    platform: "linux",
    environment: { ELECTRON_CACHE: path.join(electronPackage, "cache") },
  };
  const completeRuntime = (platform = "linux") => {
    const marker = platform === "win32"
      ? path.join(electronPackage, "dist", "electron.exe")
      : platform === "darwin"
        ? path.join(electronPackage, "dist", "Electron.app", "Contents", "MacOS", "Electron")
        : path.join(electronPackage, "dist", "electron");
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, "runtime");
    fs.writeFileSync(path.join(electronPackage, "path.txt"), platform === "win32" ? "electron.exe"
      : platform === "darwin" ? "Electron.app/Contents/MacOS/Electron" : "electron");
    fs.writeFileSync(path.join(electronPackage, "dist", "version"), "44.0.0");
    return marker;
  };
  const install = () => {
    completeRuntime();
  };
  return { options, marker, completeRuntime, install };
}

test("reuses installed runtimes without downloading on every supported platform", (context) => {
  const { options, completeRuntime } = fixture(context);
  for (const platform of ["win32", "darwin", "linux"]) {
    const marker = completeRuntime(platform);
    assert.equal(installElectronRuntime({ ...options, platform, run() { assert.fail("unexpected download"); } }), marker);
  }
});

test("repairs an incomplete extracted runtime instead of trusting its binary", (context) => {
  const { options } = fixture(context);
  const partial = path.join(options.electronPackage, "dist", "electron");
  fs.mkdirSync(path.dirname(partial), { recursive: true });
  fs.writeFileSync(partial, "runtime");
  let calls = 0;
  const marker = installElectronRuntime({ ...options, run() {
    calls += 1;
    fs.writeFileSync(path.join(options.electronPackage, "path.txt"), "electron");
    fs.writeFileSync(path.join(options.electronPackage, "dist", "version"), "44.0.0");
    return { status: 0 };
  } });
  assert.equal(marker, partial);
  assert.equal(calls, 1);
});

test("repairs stale version and platform metadata", (context) => {
  const { options, marker, install } = fixture(context);
  for (const [filename, value] of [["dist/version", "43.0.0"], ["path.txt", "wrong-binary"]]) {
    install();
    fs.writeFileSync(path.join(options.electronPackage, filename), value);
    let calls = 0;
    assert.equal(installElectronRuntime({ ...options, run() {
      calls += 1;
      install();
      return { status: 0 };
    } }), marker);
    assert.equal(calls, 1);
  }
});

test("preserves the official Electron cache setting", (context) => {
  const { options, install } = fixture(context);
  options.environment.electron_config_cache = path.join(options.electronPackage, "official-cache");
  installElectronRuntime({ ...options, run(command, args, config) {
    assert.equal(config.env.electron_config_cache, options.environment.electron_config_cache);
    assert.equal(config.env.ELECTRON_CACHE, options.environment.electron_config_cache);
    install();
    return { status: 0 };
  } });
});

test("retries failures, honors cache and mirror, and requires an installed runtime", (context) => {
  const { options, marker, install } = fixture(context);
  let calls = 0;
  options.environment.ELECTRON_MIRROR = "https://mirror.invalid/electron/";
  const result = installElectronRuntime({ ...options, run(command, args, config) {
    calls += 1;
    assert.equal(command, process.execPath);
    assert.deepEqual(args, [path.join(options.electronPackage, "install.js")]);
    assert.equal(config.cwd, options.electronPackage);
    assert.equal(config.timeout, 180_000);
    assert.equal(config.killSignal, "SIGKILL");
    assert.equal(config.env.ELECTRON_CACHE, options.environment.ELECTRON_CACHE);
    assert.equal(config.env.electron_config_cache, options.environment.ELECTRON_CACHE);
    assert.equal(config.env.ELECTRON_MIRROR, options.environment.ELECTRON_MIRROR);
    if (calls === 1) return { status: null, error: { code: "ETIMEDOUT" } };
    if (calls === 2) return { status: 0 };
    install();
    return { status: 0 };
  } });
  assert.equal(result, marker);
  assert.equal(calls, 3);
});

test("stops at the configured attempt limit and rejects missing output", (context) => {
  const { options } = fixture(context);
  options.environment.ELECTRON_INSTALL_ATTEMPTS = "2";
  options.environment.ELECTRON_INSTALL_TIMEOUT_MS = "1234";
  let calls = 0;
  assert.throws(() => installElectronRuntime({ ...options, run(command, args, config) {
    calls += 1;
    assert.equal(config.timeout, 1234);
    return { status: 0 };
  } }), /failed after 2 attempts: exit code 0; runtime incomplete/);
  assert.equal(calls, 2);
});

test("rejects malformed bounds before launching an installer", (context) => {
  const { options } = fixture(context);
  for (const name of ["ELECTRON_INSTALL_ATTEMPTS", "ELECTRON_INSTALL_TIMEOUT_MS"]) {
    for (const value of ["0", "-1", "NaN", "Infinity", "2seconds", "1.5", "9007199254740992"]) {
      assert.throws(() => installElectronRuntime({ ...options,
        environment: { ...options.environment, [name]: value },
        run() { assert.fail("unexpected download"); },
      }), /must be a positive integer/);
    }
  }
});

test("fails clearly when the package has no installer", (context) => {
  const { options } = fixture(context);
  fs.rmSync(path.join(options.electronPackage, "install.js"));
  assert.throws(() => installElectronRuntime(options), /Electron installer was not found/);
});

test("terminates a real stalled installer even when it ignores SIGTERM", { timeout: 10_000 }, (context) => {
  const { options } = fixture(context);
  fs.writeFileSync(path.join(options.electronPackage, "install.js"), 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);');
  options.environment.ELECTRON_INSTALL_ATTEMPTS = "1";
  options.environment.ELECTRON_INSTALL_TIMEOUT_MS = "500";
  let result;
  assert.throws(() => installElectronRuntime({ ...options, run(...args) {
    result = spawnSync(...args);
    return result;
  } }), /failed after 1 attempts: ETIMEDOUT/);
  assert.equal(result.error.code, "ETIMEDOUT");
  assert.equal(result.status, null);
});
