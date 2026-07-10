// Contract test for GitHub Actions workflow + sync script invariants.
// Run with: node --test scripts/ci-workflows.test.mjs
//
// Guards the full-regression-repair-20260711 fixes:
//   1. release-desktop cache save/restore enable cross-OS archive handoff
//   2. upstream-sync.sh uses public HTTPS (no SSH) upstream
//   3. upstream-sync.yml commits as github-actions[bot]
//   4. missing upstream-sync label does not fail PR creation
//   5. desktop-ci path filters include root go.mod/go.sum/internal/**
//   6. ci.yml keeps main-v2 push/pull_request AND adds workflow_dispatch
//   7. desktop-ci gates the local production packaging regression contract
//   8. upstream sync preserves VoltUI's fork-specific Windows sandbox boundary
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wf = (name) => readFileSync(join(root, ".github", "workflows", name), "utf8");
const script = (name) => readFileSync(join(root, "scripts", name), "utf8");

const releaseDesktop = wf("release-desktop.yml");
const desktopCi = wf("desktop-ci.yml");
const ci = wf("ci.yml");
const upstreamSyncYml = wf("upstream-sync.yml");
const upstreamSyncSh = script("upstream-sync.sh");

// Collect the `with:` text that follows each actions/cache save|restore step,
// stopping at the next step or job-level key. Used to assert per-step inputs.
function cacheWithBlocks(yaml) {
  const lines = yaml.split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/uses:\s*actions\/cache\/(save|restore)@v6\b/.test(lines[i])) continue;
    const collected = [];
    for (let j = i + 1; j < lines.length; j++) {
      // next step (`      - `) or a job/structure key at 2-space indent ends the step
      if (/^      - /.test(lines[j]) || /^  [A-Za-z]/.test(lines[j])) break;
      collected.push(lines[j]);
    }
    blocks.push({ lineNo: i + 1, uses: lines[i].trim(), text: collected.join("\n") });
  }
  return blocks;
}

test("release-desktop.yml: every cache save/restore enables cross-OS archive", () => {
  const blocks = cacheWithBlocks(releaseDesktop);
  assert.ok(blocks.length >= 1, "expected at least one actions/cache save/restore step");
  for (const b of blocks) {
    assert.match(
      b.text,
      /enableCrossOsArchive:\s*true/,
      `line ${b.lineNo} (${b.uses}): missing enableCrossOsArchive in with: block`
    );
    assert.doesNotMatch(
      b.text,
      /enable-cross-os-archive:/,
      `line ${b.lineNo} (${b.uses}): actions/cache input must use camelCase enableCrossOsArchive`
    );
  }
});

test("upstream-sync.sh uses public HTTPS upstream (no SSH git@ URL)", () => {
  assert.match(
    upstreamSyncSh,
    /https:\/\/github\.com\/esengine\/DeepSeek-Reasonix/,
    "upstream URL must be public HTTPS"
  );
  assert.doesNotMatch(
    upstreamSyncSh,
    /git@github\.com:/,
    "upstream URL must not be SSH (git@github.com)"
  );
});

test("upstream-sync.sh preserves the fork-specific Windows sandbox boundary", () => {
  assert.match(
    upstreamSyncSh,
    /"internal\/sandbox\/"/,
    "sandbox conflicts must be treated as fork-divergent",
  );
  assert.match(
    upstreamSyncSh,
    /"desktop\/main\.go"/,
    "desktop helper dispatch conflicts must keep the VoltUI side",
  );
  for (const protectedPath of [
    "internal/winsandbox/",
    "internal/sandbox/seatbelt_windows.go",
    "internal/sandbox/seatbelt_windows_test.go",
    "internal/sandbox/seatbelt_other.go",
  ]) {
    assert.ok(
      upstreamSyncSh.includes(`':(exclude)${protectedPath}'`),
      `upstream patch stream must exclude ${protectedPath}`,
    );
  }
});

test("upstream-sync.yml commits as github-actions[bot]", () => {
  assert.match(upstreamSyncYml, /github-actions\[bot\]/, "must configure github-actions[bot] name");
  assert.match(
    upstreamSyncYml,
    /41898282\+github-actions\[bot\]@users\.noreply\.github\.com/,
    "must configure the bot noreply email"
  );
});

test("upstream-sync.yml: missing upstream-sync label does not fail PR creation", () => {
  // `gh pr create --label` hard-fails when the label is absent in the repo.
  // The contract: create the PR unconditionally, then attach the label only if
  // it already exists (never create a remote label).
  assert.doesNotMatch(
    upstreamSyncYml,
    /--label\s+"upstream-sync"/,
    "gh pr create must not hard-pass --label \"upstream-sync\""
  );
  assert.match(
    upstreamSyncYml,
    /gh label list/,
    "must check label existence before attaching"
  );
  assert.match(
    upstreamSyncYml,
    /--add-label "upstream-sync"/,
    "must conditionally attach the label via gh pr edit --add-label"
  );
});

test("desktop-ci.yml: path filters include root Go module dependency paths", () => {
  // Desktop builds compile root-module Go code, so changes to go.mod, go.sum,
  // and internal/** must trigger desktop-ci. Quoted entries only appear in the
  // paths filter (go-version-file/cache-dependency-path use prefixed, unquoted
  // values like desktop/go.mod).
  assert.match(desktopCi, /"go\.mod"/, 'paths filter must include "go.mod"');
  assert.match(desktopCi, /"go\.sum"/, 'paths filter must include "go.sum"');
  assert.match(desktopCi, /"internal\/\*\*"/, 'paths filter must include "internal/**"');
});

test("desktop-ci.yml: local production packaging regressions are gated on macOS", () => {
  assert.match(desktopCi, /"prod_test"/, 'paths filter must include "prod_test"');
  assert.match(
    desktopCi,
    /"scripts\/prod-test\.test\.mjs"/,
    'paths filter must include "scripts/prod-test.test.mjs"',
  );
  assert.match(
    desktopCi,
    /if:\s*runner\.os == 'macOS'\s*\n\s*run:\s*node --test scripts\/prod-test\.test\.mjs/,
    "macOS Desktop CI must execute the local production packaging contract",
  );
});

test("ci.yml: workflow_dispatch added while retaining main-v2 push/pull_request", () => {
  assert.match(ci, /workflow_dispatch:/, "ci.yml must allow manual dispatch");
  assert.match(
    ci,
    /push:\s*\n\s*branches:\s*\[main-v2\]/,
    "ci.yml must retain push trigger on main-v2"
  );
  assert.match(
    ci,
    /pull_request:\s*\n\s*branches:\s*\[main-v2\]/,
    "ci.yml must retain pull_request trigger on main-v2"
  );
});
