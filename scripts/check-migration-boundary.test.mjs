import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { scanMigrationBoundary } from "./check-migration-boundary.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scanner = path.join(repositoryRoot, "scripts", "check-migration-boundary.mjs");

function createSnapshot(files) {
  const root = mkdtempSync(path.join(tmpdir(), "voltui-migration-"));
  for (const [relativePath, contents] of Object.entries(files)) {
    const target = path.join(root, ...relativePath.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  return root;
}

function scanSnapshot(files) {
  const root = createSnapshot({
    ".gitignore": "node_modules/\n",
    ...files,
  });
  try {
    return scanMigrationBoundary({ root });
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  }
}

test("the repository migration boundary passes", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, [scanner], {
    cwd: repositoryRoot,
    stdio: "pipe",
  }));
});

test("gitless snapshots still scan source files", () => {
  const result = scanSnapshot({
    "README.md": "ok\n",
    "scripts/note.md": "official DSH\n",
  });
  assert.equal(result.failures.length, 0);
  assert.equal(result.tracked.includes("README.md"), true);
  assert.equal(result.tracked.includes("scripts/note.md"), true);
});

test("gitless snapshots reject retired Go assets", () => {
  const result = scanSnapshot({ "go.mod": "module example\n" });
  assert.equal(result.failures.some((finding) => finding.includes("retired Go build asset")), true);
});

test("gitless snapshots ignore dependency trees", () => {
  const result = scanSnapshot({
    "README.md": "ok\n",
    "node_modules/pkg/go.mod": "module wails\n",
    "node_modules/pkg/readme.md": "sk_abcdefghijklmnopqrstuvwxyz123456\n",
  });
  assert.equal(result.failures.length, 0);
  assert.equal(result.tracked.some((file) => file.startsWith("node_modules/")), false);
});

test("gitless snapshots still reject embedded secrets and retired references", () => {
  const secret = scanSnapshot({ "docs/note.md": "sk_abcdefghijklmnopqrstuvwxyz123456\n" });
  const retired = scanSnapshot({ "scripts/old.md": "this still mentions wails\n" });
  assert.equal(secret.failures.some((finding) => finding.includes("embedded secret-like token")), true);
  assert.equal(retired.failures.some((finding) => finding.includes("retired runtime/upstream reference")), true);
});
