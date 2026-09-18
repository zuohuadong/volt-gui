import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { resolvePnpmInvocation } from "../apps/desktop-electron/scripts/pnpm-invocation.mjs";

test("launches JavaScript pnpm entrypoints through Node", () => {
  assert.deepEqual(resolvePnpmInvocation("C:\\pnpm\\pnpm.cjs", "C:\\node\\node.exe"), {
    command: "C:\\node\\node.exe",
    args: ["C:\\pnpm\\pnpm.cjs"],
  });
});

test("launches native pnpm executables directly", () => {
  assert.deepEqual(resolvePnpmInvocation("C:\\Program Files\\nodejs\\node_modules\\pnpm\\pnpm.exe"), {
    command: "C:\\Program Files\\nodejs\\node_modules\\pnpm\\pnpm.exe",
    args: [],
  });
});

test("requires a pnpm entrypoint", () => {
  assert.throws(() => resolvePnpmInvocation(""), /launched through pnpm/);
});

test("root desktop scripts invoke workspace packages with --dir", () => {
  const packageJson = JSON.parse(readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"));
  for (const name of ["test", "desktop", "build:desktop", "dist:desktop"]) {
    assert.match(packageJson.scripts[name], /pnpm --dir apps\/desktop-/);
    assert.doesNotMatch(packageJson.scripts[name], /pnpm --filter /);
  }
});
