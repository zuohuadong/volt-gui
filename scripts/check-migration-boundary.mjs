#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const tracked = [...new Set(execFileSync(
  "git",
  ["ls-files", "-co", "--exclude-standard", "-z"],
  { encoding: "utf8" },
).split("\0").filter(Boolean))];
const failures = [];

for (const file of tracked) {
  if (/\.(?:go|sum)$|(?:^|\/)go\.mod$|(?:^|\/)(?:Makefile|\.goreleaser\.yaml)$/.test(file)) {
    failures.push(`${file}: retired Go build asset`);
  }
  if (/^(?:desktop|npm\/(?:reasonix|voltui))(?:\/|$)/.test(file)) {
    failures.push(`${file}: retired Wails/native package asset`);
  }
  if (/^(?:packages\/dsh-|workers\/)(?:\/|$)/.test(file)) {
    failures.push(`${file}: retired local Harness or service asset`);
  }
}

const activeRoots = [
  ".github/workflows/",
  ".cnb.yml",
  ".agents/AGENTS.local.md",
  ".agents/skills/volt-gui-design-language/",
  "references/skills/anyong-brand-config/SKILL.md",
  "references/skills/cnb-ci-cd/SKILL.md",
  "references/skills/volt-desktop-experience/",
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
const forbidden = /(?:\bgo(?:lang)?\b|\bwails\b|\breasonix\b|main-v2|@dsh\/(?:core|plugins|server)|packages\/dsh-|workers\/(?:accounts|forum|crash-report))/i;
const textFile = /\.(?:astro|css|js|json|md|mjs|ps1|sh|toml|ts|ya?ml)$/i;
const scannerFiles = new Set([
  "scripts/check-electron-runtime-boundary.mjs",
  "scripts/check-electron-runtime-boundary.test.mjs",
  "scripts/check-migration-boundary.mjs",
  "scripts/check-migration-boundary.test.mjs",
  "scripts/ci-workflows.test.mjs",
  "scripts/site-feature-smoke.mjs",
]);

for (const file of tracked.filter((candidate) =>
  existsSync(candidate) &&
  textFile.test(candidate) &&
  !scannerFiles.has(candidate) &&
  activeRoots.some((root) => candidate === root || candidate.startsWith(root)))) {
  const source = readFileSync(file, "utf8");
  if (forbidden.test(source)) failures.push(`${file}: retired runtime/upstream reference`);
}

if (failures.length) {
  console.error(`migration boundary failed (${failures.length} finding(s))`);
  for (const finding of failures) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`migration boundary passed (${tracked.length} tracked files checked)`);
