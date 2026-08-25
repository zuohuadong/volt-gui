import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";

test("the repository migration boundary passes", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, ["scripts/check-migration-boundary.mjs"], { stdio: "pipe" }));
});
