import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { assertDesktopTools, desktopToolEnvironment, desktopToolPaths, desktopToolRequiredFiles, mergeDshEnvironment } from "./desktop-tool-environment.ts";

const fixtures: string[] = [];
afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "anyong tools \u4e2d\u6587 "));
  fixtures.push(root);
  for (const relative of desktopToolRequiredFiles) {
    const file = path.join(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "fixture");
  }
  writeFileSync(path.join(root, "runtime.json"), JSON.stringify({ schemaVersion: 1, target: `${process.platform}-${process.arch}` }));
  return root;
}

test("normalizes Windows environment overrides without changing the parent", () => {
  const parent = { Path: "old", PATH: "other", PythonHome: "foreign", node_options: "--invalid", KEEP: "yes" };
  assert.deepEqual(mergeDshEnvironment(parent, { Path: "bundled", PYTHONPATH: "foreign" }, "win32"), {
    PATH: "bundled", KEEP: "yes",
  });
  assert.equal(parent.Path, "old");
  assert.equal(parent.PythonHome, "foreign");
});

test("keeps POSIX variable case sensitivity and removes interpreter startup pollution", () => {
  assert.deepEqual(mergeDshEnvironment({
    PATH: "/bin", Path: "unrelated", NODE_OPTIONS: "--bad", NODE_PATH: "foreign",
    PYTHONHOME: "foreign", PYTHONPATH: "foreign", ELECTRON_RUN_AS_NODE: "1",
  }, {}, "linux"), { PATH: "/bin", Path: "unrelated" });
});

test("bundled tools win over system aliases while explicit project environments remain possible", () => {
  const root = fixture();
  const foreignBin = path.join(root, "user-bin");
  const parent = { PATH: [foreignBin, "", ".", "relative", foreignBin].join(path.delimiter) };
  const environment = desktopToolEnvironment(root, process.execPath, parent);
  const entries = environment.PATH!.split(path.delimiter);
  assert.equal(entries[0], path.dirname(process.execPath));
  assert.equal(entries.filter((entry) => entry === foreignBin).length, 1);
  assert.ok(entries.every((entry) => path.isAbsolute(entry)));
  assert.equal(parent.PATH!.includes("relative"), true);
  assert.equal(environment.PYTHONNOUSERSITE, "1");
  assert.equal(environment.PIP_REQUIRE_VIRTUALENV, "true");
  assert.equal(environment.ANYONG_PYTHON_COMMAND, desktopToolPaths(root).python);
  assert.equal(environment.ANYONG_BUN_COMMAND, desktopToolPaths(root).bun);
  assert.equal(environment.ANYONG_PWSH_PATH, desktopToolPaths(root).powershell);
  assert.equal(environment.VIRTUAL_ENV, undefined);
});

test("missing and wrong-target tool payloads fail without a system fallback", () => {
  const root = fixture();
  writeFileSync(path.join(root, "runtime.json"), JSON.stringify({ schemaVersion: 1, target: "unsupported" }));
  assert.throws(() => assertDesktopTools(root), /target mismatch/);
  rmSync(path.join(root, "python", "python314.dll"));
  assert.throws(() => desktopToolEnvironment(root, process.execPath), /incomplete/);
});

test("a real child ignores inherited Node injection and sees the bundled paths", () => {
  const root = fixture();
  const environment = desktopToolEnvironment(root, process.execPath, {
    ...process.env, NODE_OPTIONS: "--require=nonexistent-anyong-test-module", NODE_PATH: root,
    PYTHONHOME: root, PYTHONPATH: root,
  });
  const output = execFileSync(process.execPath, ["-e", "console.log(JSON.stringify({python:process.env.ANYONG_PYTHON_COMMAND,nodeOptions:process.env.NODE_OPTIONS,pythonHome:process.env.PYTHONHOME}))"], {
    env: environment, encoding: "utf8", windowsHide: true, timeout: 10_000,
  });
  assert.deepEqual(JSON.parse(output), { python: desktopToolPaths(root).python });
});

test("preserves user-owned temporary directories without introducing a shared ACL root", () => {
  const root = fixture();
  const workspace = path.join(root, "workspace");
  mkdirSync(workspace);
  const environment = desktopToolEnvironment(root, process.execPath, {
    TEMP: path.join(workspace, "AppData", "Local", "Temp"),
    TMP: path.join(workspace, "AppData", "Local", "Temp"),
    SystemRoot: "C:\\Windows",
  });
  if (process.platform === "win32") {
    assert.equal(environment.TEMP, path.join(workspace, "AppData", "Local", "Temp"));
    assert.equal(environment.TMP, environment.TEMP);
  }
});
