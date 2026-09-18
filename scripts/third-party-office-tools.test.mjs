import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ensureOfficeCliBinary,
  officeCli,
  officeCliEntryFromEnvironment,
  resolveOfficeCliEntry,
} from "./third-party-office-tools.mjs";

test("OfficeCLI metadata stays pinned to the audited npm package", () => {
  assert.equal(officeCli.packageName, "@officecli/officecli");
  assert.equal(officeCli.version, "1.0.149");
  assert.match(officeCli.windowsX64Sha256, /^[a-f0-9]{64}$/u);
});

test("ensureOfficeCliBinary reuses the installed vendor binary", async () => {
  const dest = await ensureOfficeCliBinary(resolveOfficeCliEntry());
  assert.ok(dest);
  assert.equal(existsSync(dest), true);
  assert.ok(statSync(dest).size > 0);
});

test("ensureOfficeCliBinary ignores non-package shims", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "anyong-officecli-shim-"));
  const shim = path.join(root, "officecli.js");
  try {
    await writeFile(shim, "console.log(\"shim\")\n");
    assert.equal(await ensureOfficeCliBinary(shim), null);
    assert.equal(await ensureOfficeCliBinary(path.join(root, "missing.js")), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("officeCliEntryFromEnvironment reads the first OfficeCLI launcher argument", () => {
  assert.equal(officeCliEntryFromEnvironment({}), undefined);
  assert.equal(officeCliEntryFromEnvironment({ ANYONG_OFFICECLI_ARGS_JSON: "not-json" }), undefined);
  assert.equal(
    officeCliEntryFromEnvironment({ ANYONG_OFFICECLI_ARGS_JSON: JSON.stringify(["/runtime/officecli.js", "mcp"]) }),
    "/runtime/officecli.js",
  );
});
