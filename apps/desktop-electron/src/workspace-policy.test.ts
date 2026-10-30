import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalProjectDirectory, defaultWorkspaceBase, unsafeWorkspacePath } from "./workspace-policy.ts";

const roots = { home: "C:\\Users\\demo", temp: "C:\\Users\\demo\\AppData\\Local\\Temp", platform: "win32" as const };
test("rejects home, ancestors, drive roots and both directions of temp overlap", () => {
  for (const folder of [roots.home, "C:\\Users", "C:\\", "D:\\", "\\\\server\\share\\", roots.temp, `${roots.temp}\\project`, "C:\\Users\\demo\\AppData"]) {
    assert.equal(unsafeWorkspacePath(folder, roots), true, folder);
  }
  assert.equal(unsafeWorkspacePath("c:\\users\\DEMO", roots), true);
});
test("allows project directories, UNC and sibling prefix paths", () => {
  for (const folder of ["C:\\Users\\demo\\Projects\\one", "D:\\project", "C:\\Users\\demonstration", "C:\\Users\\demo\\AppData\\Local\\Temporary"]) {
    assert.equal(unsafeWorkspacePath(folder, roots), false, folder);
  }
  assert.equal(unsafeWorkspacePath("D:\\project", { ...roots, home: "D:\\", temp: "D:\\temp" }), false);
  assert.equal(unsafeWorkspacePath("\\\\server\\share\\project", roots), false);
});
test("anchors a missing or misplaced Windows profile Documents folder under the real profile", () => {
  expectDefault("D:\\27852", "C:\\Users\\27852", "C:\\Users\\27852\\Documents");
  expectDefault("D:\\27852", "D:\\27852", "D:\\27852\\Documents");
  expectDefault("D:\\", "C:\\Users\\27852", "C:\\Users\\27852\\Documents");
  expectDefault("D:\\Data\\Documents", "C:\\Users\\27852", "D:\\Data\\Documents");
  expectDefault("/home/demo/Documents", "/home/demo", "/home/demo/Documents", "linux");
});

function expectDefault(documents: string, home: string, expected: string, platform: NodeJS.Platform = "win32"): void {
  assert.equal(defaultWorkspaceBase(documents, home, platform), expected);
}

test("resolves junctions and rejects missing directories and files", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-policy-"));
  try {
    const home = path.join(root, "home");
    const temp = path.join(home, "temp");
    const project = path.join(home, "project");
    mkdirSync(temp, { recursive: true });
    mkdirSync(project);
    const context = { home, temp, platform: process.platform };
    assert.equal(canonicalProjectDirectory(project, context), realpathSync.native(project));
    assert.throws(() => canonicalProjectDirectory(home, context), /WORKSPACE_UNSAFE/);
    assert.throws(() => canonicalProjectDirectory("", context), /WORKSPACE_UNAVAILABLE/);
    assert.throws(() => canonicalProjectDirectory(path.join(root, "missing"), context), /WORKSPACE_UNAVAILABLE/);
    const file = path.join(root, "file");
    writeFileSync(file, "");
    assert.throws(() => canonicalProjectDirectory(file, context), /WORKSPACE_UNAVAILABLE/);
    const link = path.join(root, "alias");
    symlinkSync(home, link, process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => canonicalProjectDirectory(link, context), /WORKSPACE_UNSAFE/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
