import assert from "node:assert/strict";
import { mkdtemp, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { removeIntegrationTree } from "./integration-temp-directory.mjs";

test("removes a real temporary directory and tolerates an already removed one", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "volt-integration-cleanup-"));
  await writeFile(path.join(root, "state.json"), "{}");
  await removeIntegrationTree(root);
  await assert.rejects(stat(root), { code: "ENOENT" });
  await removeIntegrationTree(root);
});

test("retries deletion and reports exhausted known Windows directory locks", async () => {
  for (const code of ["EBUSY", "ENOTEMPTY", "EPERM"]) {
    const warning = [];
    await removeIntegrationTree("fixture", {
      platform: "win32",
      remove: async (directory, options) => {
        assert.equal(directory, "fixture");
        assert.deepEqual(options, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
        throw Object.assign(new Error("locked"), { code });
      },
      warn: (message) => warning.push(message),
    });
    assert.equal(warning.length, 1);
    assert.match(warning[0], new RegExp(code));
  }
});

test("does not hide unexpected failures or non-Windows permission errors", async () => {
  for (const [platform, code] of [["win32", "EIO"], ["win32", "EACCES"], ["darwin", "EPERM"], ["linux", "EBUSY"]]) {
    const error = Object.assign(new Error("cleanup failure"), { code });
    await assert.rejects(removeIntegrationTree("fixture", {
      platform,
      remove: async () => { throw error; },
      warn: () => assert.fail("unexpected failures must not be swallowed"),
    }), (observed) => observed === error);
  }
});
