#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const retiredAssetPath = /\.(?:go|sum)$|(?:^|\/)go\.mod$|(?:^|\/)(?:Makefile|\.goreleaser\.yaml)$/;
const retiredPackagePath = /^(?:desktop|npm\/(?:reasonix|voltui))(?:\/|$)/;
const retiredHarnessPath = /^(?:packages\/dsh-|workers\/)(?:\/|$)/;
const forbiddenReference = /(?:\bgo(?:lang)?\b|\bwails\b|\breasonix\b|main-v2|@dsh\/(?:core|plugins|server)|packages\/dsh-|workers\/(?:accounts|forum|crash-report))/i;
const embeddedSecret = /\bsk_[A-Za-z0-9_-]{20,}\b/;
const textFile = /(?:\.(?:astro|css|js|json|md|mjs|ps1|sh|toml|ts|ya?ml|log|svg)|^\.env(?:\..*)?$)$/i;
const activeRoots = [
  ".github/workflows/",
  ".cnb.yml",
  ".agents/AGENTS.local.md",
  ".agents/skills/volt-gui-design-language/",
  "references/skills/anyong-brand-config/SKILL.md",
  "references/skills/cnb-ci-cd/SKILL.md",
  "references/skills/volt-desktop-experience/",
  "references/skills/volt-ops/SKILL.md",
  "references/skills/xigu-ai-ops/SKILL.md",
  "AGENTS.md",
  "CHANGELOG.md",
  "暗涌.md",
  "package.json",
  "pnpm-workspace.yaml",
  "apps/",
  "profiles/",
  "scripts/",
  "site/",
  "README.md",
  "README.zh-CN.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "VOLTUI.md",
  "DESIGN.md",
  "docs/PRODUCT_REQUIREMENTS.md",
  "docs/WORKBENCH.md",
  "docs/WORKBENCH.zh-CN.md",
  "docs/WORKBENCH_FEATURE_MATRIX.md",
  "docs/RELEASING.md",
];
const scannerFiles = new Set([
  "scripts/check-electron-runtime-boundary.mjs",
  "scripts/check-electron-runtime-boundary.test.mjs",
  "scripts/check-migration-boundary.mjs",
  "scripts/check-migration-boundary.test.mjs",
  "scripts/ci-workflows.test.mjs",
  "scripts/site-feature-smoke.mjs",
]);

function gitCommandEnv(overrides = {}) {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  return { ...env, ...overrides };
}

function runGit(args, options = {}) {
  const { env, ...rest } = options;
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    ...rest,
    env: gitCommandEnv(env),
  });
}

function parseNulPaths(output) {
  return [...new Set(output.split("\0").filter(Boolean))];
}

function isMissingGitRepository(error) {
  return error.status === 128 && /not a git repository/i.test(`${error.stderr ?? error.message ?? ""}`);
}

function listGitIndexFiles(root) {
  return parseNulPaths(runGit(["ls-files", "-co", "--exclude-standard", "-z"], { cwd: root }));
}

function listSnapshotFiles(root) {
  const gitDir = mkdtempSync(path.join(tmpdir(), "voltui-migration-git-"));
  try {
    // CNB source snapshots do not include .git; reuse gitignore matching via an ephemeral git dir.
    runGit(["--git-dir", gitDir, "init", "--quiet"]);
    return parseNulPaths(runGit([
      "--git-dir",
      gitDir,
      "--work-tree",
      root,
      "ls-files",
      "-co",
      "--exclude-per-directory=.gitignore",
      "-z",
    ]));
  } finally {
    rmSync(gitDir, { recursive: true, force: true, maxRetries: 5 });
  }
}

function listRepositoryFiles(root) {
  if (!existsSync(path.join(root, ".git"))) return listSnapshotFiles(root);
  try {
    return listGitIndexFiles(root);
  } catch (error) {
    if (!isMissingGitRepository(error)) throw error;
    return listSnapshotFiles(root);
  }
}

function collectPathFailures(tracked) {
  const failures = [];
  for (const file of tracked) {
    if (retiredAssetPath.test(file)) failures.push(`${file}: retired Go build asset`);
    if (retiredPackagePath.test(file)) failures.push(`${file}: retired Wails/native package asset`);
    if (retiredHarnessPath.test(file)) failures.push(`${file}: retired local Harness or service asset`);
  }
  return failures;
}

function collectContentFailures(root, tracked) {
  const failures = [];
  for (const file of tracked) {
    if (!existsSync(path.join(root, file)) || !textFile.test(file) || scannerFiles.has(file)) continue;
    const source = readFileSync(path.join(root, file), "utf8");
    const inActiveRoot = activeRoots.some((prefix) => file === prefix || file.startsWith(prefix));
    if (inActiveRoot && forbiddenReference.test(source)) failures.push(`${file}: retired runtime/upstream reference`);
    if (embeddedSecret.test(source)) failures.push(`${file}: embedded secret-like token`);
  }
  return failures;
}

export function scanMigrationBoundary({ root = repositoryRoot } = {}) {
  const tracked = listRepositoryFiles(root);
  return {
    tracked,
    failures: [...collectPathFailures(tracked), ...collectContentFailures(root, tracked)],
  };
}

function main() {
  const { tracked, failures } = scanMigrationBoundary();
  if (failures.length) {
    console.error(`migration boundary failed (${failures.length} finding(s))`);
    for (const finding of failures) console.error(`- ${finding}`);
    process.exit(1);
  }
  console.log(`migration boundary passed (${tracked.length} tracked files checked)`);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main();
}
