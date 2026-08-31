import assert from "node:assert/strict";
import { test } from "node:test";

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
