import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function fixture(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "volt-artifacts-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const appDir = path.join(root, "apps", "desktop-electron");
  fs.mkdirSync(path.join(appDir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(appDir, "src"), { recursive: true });
  for (const filename of ["build-electron-artifacts.mjs", "pnpm-invocation.mjs"]) {
    fs.copyFileSync(path.join(import.meta.dirname, filename), path.join(appDir, "scripts", filename));
  }
  fs.copyFileSync(path.resolve(import.meta.dirname, "../src/electron-profile.ts"), path.join(appDir, "src", "electron-profile.ts"));
  fs.writeFileSync(path.join(appDir, "package.json"), JSON.stringify({ version: "1.2.3", type: "module" }));
  for (const directory of ["dist-package", ".electron-builder-nsis", ".electron-builder-zip"]) {
    fs.mkdirSync(path.join(appDir, directory), { recursive: true });
    fs.writeFileSync(path.join(appDir, directory, "stale"), "old build");
  }
  const fakePnpm = path.join(root, "pnpm.mjs");
  fs.writeFileSync(fakePnpm, `
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { resolveElectronProfile } from "./apps/desktop-electron/src/electron-profile.ts";
const appDir = path.resolve("apps/desktop-electron");
const target = process.env.ELECTRON_BUILDER_TARGET;
const output = path.join(appDir, process.env.ELECTRON_BUILDER_OUTPUT_DIR);
for (const directory of ["dist-package", ".electron-builder-nsis", ".electron-builder-zip"]) {
  assert.equal(fs.existsSync(path.join(appDir, directory, "stale")), false);
}
if (target === "nsis") assert.equal(fs.existsSync(path.join(appDir, ".electron-builder-zip")), false);
if (target === "zip") assert.equal(fs.existsSync(path.join(appDir, ".electron-builder-nsis")), false);
fs.appendFileSync("targets.log", target + "\\n");
if (process.env.TEST_FAIL_TARGET === target) process.exit(7);
const { productName } = resolveElectronProfile();
const names = target === "nsis"
  ? [productName + " Setup 1.2.3.exe", productName + " Setup 1.2.3.exe.blockmap"]
  : [productName + "-1.2.3-win.zip"];
for (const name of names) fs.writeFileSync(path.join(output, name), target);
if (target === "zip") {
  fs.mkdirSync(path.join(output, "win-unpacked"));
  fs.writeFileSync(path.join(output, "win-unpacked", "app.exe"), "runtime");
}
`);
  const run = (environment = {}) => spawnSync(process.execPath, [path.join(appDir, "scripts", "build-electron-artifacts.mjs")], {
    cwd: root,
    encoding: "utf8",
    timeout: 20_000,
    env: { ...process.env, npm_execpath: fakePnpm, DESKTOP_VERSION: "1.2.3", ...environment },
  });
  return { root, appDir, run };
}

test("clears all stale targets before building and collects each target sequentially", (context) => {
  const { root, appDir, run } = fixture(context);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(root, "targets.log"), "utf8"), "nsis\nzip\n");
  const artifacts = fs.readdirSync(path.join(appDir, "dist-package"));
  assert.equal(artifacts.length, 4);
  for (const suffix of [".exe", ".exe.blockmap", "-win.zip"]) assert.ok(artifacts.some((name) => name.endsWith(suffix)));
  assert.equal(fs.readFileSync(path.join(appDir, "dist-package", "win-unpacked", "app.exe"), "utf8"), "runtime");
  for (const target of ["nsis", "zip"]) assert.equal(fs.existsSync(path.join(appDir, `.electron-builder-${target}`)), false);
});

test("a failed first target stops packaging without starting the second target", (context) => {
  const { root, appDir, run } = fixture(context);
  const result = run({ TEST_FAIL_TARGET: "nsis" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /nsis target failed with exit code 7/);
  assert.equal(fs.readFileSync(path.join(root, "targets.log"), "utf8"), "nsis\n");
  assert.equal(fs.existsSync(path.join(appDir, ".electron-builder-zip")), false);
  assert.deepEqual(fs.readdirSync(path.join(appDir, "dist-package")), []);
});
