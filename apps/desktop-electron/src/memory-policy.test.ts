import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { hasGitWorkspace, resolveMemoryStatus } from "./memory-policy.ts";

function isolatedTemp(): string {
  const fallback = process.platform === "win32" ? path.parse(os.tmpdir()).root : "/tmp";
  for (const base of [os.tmpdir(), fallback, os.homedir()]) {
    if (!hasGitWorkspace(base)) return mkdtempSync(path.join(base, "memory-policy-"));
  }
  throw new Error("No non-git temporary directory is available");
}

test("detects a git workspace in the current or a parent directory", () => {
  const root = isolatedTemp();
  try {
    const project = path.join(root, "project");
    const nested = path.join(project, "packages", "app");
    mkdirSync(nested, { recursive: true });
    assert.equal(hasGitWorkspace(project), false);
    assert.equal(resolveMemoryStatus(project, false), "requiresGit");

    mkdirSync(path.join(project, ".git"));
    assert.equal(hasGitWorkspace(project), true);
    assert.equal(hasGitWorkspace(nested), true);
    assert.equal(resolveMemoryStatus(nested, false), "active");

    const worktree = path.join(root, "worktree");
    mkdirSync(worktree);
    writeFileSync(path.join(worktree, ".git"), "gitdir: ../project/.git/worktrees/worktree\n");
    assert.equal(hasGitWorkspace(worktree), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an explicit environment disable wins even for git workspaces", () => {
  const root = isolatedTemp();
  try {
    mkdirSync(path.join(root, ".git"));
    assert.equal(resolveMemoryStatus(root, false), "active");
    assert.equal(resolveMemoryStatus(root, true), "disabled");
    assert.equal(resolveMemoryStatus("", false), "requiresGit");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
