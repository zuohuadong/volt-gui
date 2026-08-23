// Contract test for GitHub Actions workflow + sync script invariants.
// Run with: node --test scripts/ci-workflows.test.mjs
//
// Guards the Electron/DSH migration contracts:
//   1. Desktop CI and release packaging run on Windows x64.
//   2. Active desktop jobs use the Electron renderer/runtime boundary gates.
//   3. The release workflow uploads unsigned artifacts and stays fail-closed for signing.
//   4. Reasonix sync uses a dedicated public-HTTPS remote and preserves fork boundaries.
//   5. ci.yml keeps main-v2 push/pull_request and adds workflow_dispatch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readIfPresent = (path) => existsSync(path) ? readFileSync(path, "utf8") : null;
const wf = (name) => readIfPresent(join(root, ".github", "workflows", name));
const script = (name) => readIfPresent(join(root, "scripts", name));

const cnb = readIfPresent(join(root, ".cnb.yml"));
const releaseCli = wf("release.yml");
const releaseDesktop = wf("release-desktop.yml");
const desktopCi = wf("desktop-ci.yml");
const ci = wf("ci.yml");
const upstreamSyncYml = wf("upstream-sync.yml");
const upstreamSyncSh = script("upstream-sync.sh");
const upstreamParityManifestPath = join(root, "scripts", "upstream-feature-parity.json");
const upstreamParityManifest = existsSync(upstreamParityManifestPath)
  ? JSON.parse(readFileSync(upstreamParityManifestPath, "utf8"))
  : null;

if (releaseDesktop !== null) {
  test("release-desktop.yml builds an unsigned Electron Windows x64 artifact", () => {
    assert.match(releaseDesktop, /runs-on:\s*windows-latest/);
    assert.match(releaseDesktop, /pnpm install --frozen-lockfile/);
    assert.match(releaseDesktop, /node scripts\/set-electron-package-version\.mjs/);
    assert.match(releaseDesktop, /pnpm run dist:desktop/);
    assert.match(releaseDesktop, /CSC_IDENTITY_AUTO_DISCOVERY:\s*["']false["']/);
    assert.match(releaseDesktop, /Get-AuthenticodeSignature/);
    assert.match(releaseDesktop, /Status -ne 'NotSigned'/);
    assert.match(releaseDesktop, /actions\/upload-artifact@/);
    assert.match(releaseDesktop, /windows-x64-unsigned/);
  });

  test("release-desktop.yml rejects unsupported signing and publication claims", () => {
    assert.match(releaseDesktop, /Reject unsupported signing claims/);
    assert.match(releaseDesktop, /Electron production signing is not migrated yet/);
    assert.doesNotMatch(releaseDesktop, /signpath\/github-action-submit-signing-request/i);
    assert.doesNotMatch(releaseDesktop, /gh release create/i);
  });
}

if (releaseCli !== null) {
  test("CLI release no longer republishes the legacy Wails updater manifest", () => {
    assert.doesNotMatch(releaseCli, /desktop manifest compatibility|compatibility manifest/i);
    assert.doesNotMatch(releaseCli, /latest\.json|dl\.reasonix\.io|reasonix\.io\/\?download=desktop/);
    assert.doesNotMatch(releaseCli, /R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|R2_ACCOUNT_ID|R2_BUCKET/);
  });
}

if (cnb !== null) {
  test("CNB validates the Linux Electron source bundle without claiming Windows packaging", () => {
    assert.match(cnb, /pnpm run build:desktop/);
    assert.match(cnb, /apps\/desktop-electron\/dist\/preload\.cjs/);
    assert.doesNotMatch(cnb, /apps\/desktop-electron\/dist\/preload\.js/);
    assert.doesNotMatch(cnb, /electron-builder --win/);
  });
}

test("upstream-sync.yml requires the sync script to be present", () => {
  // The GitHub Actions workflow delegates to upstream-sync.sh, so shipping the
  // yml without the script is never valid. The reverse (script without the yml)
  // is fine: forks on non-GitHub hosts keep the script for manual sync.
  if (upstreamSyncYml !== null) {
    assert.ok(upstreamSyncSh !== null, "upstream-sync.yml requires upstream-sync.sh to be present");
  }
});

if (upstreamSyncSh !== null) {
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
    assert.match(
      upstreamSyncSh,
      /UPSTREAM_REMOTE="reasonix-upstream"/,
      "Reasonix sync must not overwrite the Volt GUI contribution remote",
    );
  });

  test("upstream-sync.sh preserves the fork-specific Windows sandbox boundary", () => {
    assert.ok(
      upstreamSyncSh.includes("'internal/shellsafe/testdata/command_effects.json'"),
      "shell effect tests require their shared command fixture",
    );
    assert.ok(
      upstreamSyncSh.includes("':(exclude,glob)internal/sandbox/**'"),
      "sandbox conflicts must be treated as fork-divergent",
    );
    assert.ok(upstreamSyncSh.includes("':(exclude,glob)desktop/**'"), "legacy desktop sources stay outside selective Go sync");
    assert.match(upstreamSyncSh, /SNAPSHOT \(missing fork path\)/);
    assert.match(upstreamSyncSh, /git checkout "\$UPSTREAM_HEAD" -- "\$\{SNAPSHOT_PATHS\[@\]\}"/);
    assert.doesNotMatch(upstreamSyncSh, /SKIP \(missing fork path\)/);
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

  test("upstream-sync.sh rejects an invalid sync marker before diffing", () => {
    const markerValidation = upstreamSyncSh.indexOf('git cat-file -e "$LAST_SYNC^{commit}"');
    const cumulativeDiff = upstreamSyncSh.indexOf('git diff --name-status -M "$LAST_SYNC" "$UPSTREAM_HEAD"');
    assert.ok(markerValidation >= 0, "sync must validate a non-empty marker as a fetched commit");
    assert.ok(cumulativeDiff > markerValidation, "marker validation must happen before cumulative diffing");
  });

  if (upstreamParityManifest !== null) {
    test("upstream-sync.sh gates marker advancement on reviewed excluded features", () => {
      const parityCheck = upstreamSyncSh.indexOf('node "$PARITY_CHECK" "$LAST_SYNC" "$UPSTREAM_HEAD"');
      const markerWrite = upstreamSyncSh.indexOf('echo "$UPSTREAM_HEAD" > "$MARKER_FILE"');
      assert.ok(parityCheck >= 0, "sync must run the excluded-feature parity check");
      assert.ok(markerWrite > parityCheck, "sync marker must advance only after parity check passes");
      assert.match(upstreamParityManifest.reviewedUpstreamHead, /^[0-9a-f]{40}$/, "parity manifest must pin a reviewed upstream head");
      const syncExclusions = [...upstreamSyncSh.matchAll(/^\s+'(\:\(exclude(?:,glob)?\)[^']+)'\s*$/gm)].map((match) => match[1]);
      assert.deepEqual(
        new Set(upstreamParityManifest.syncExcludedPathspecs),
        new Set(syncExclusions),
        "parity manifest must cover every upstream-sync exclusion",
      );
      assert.ok(upstreamParityManifest.features.some((feature) => feature.status === "reviewed-deferred"), "deferred features must stay explicit");
    });
  }

}

if (upstreamSyncYml !== null) {
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
}

test("desktop-ci.yml tracks and verifies the active Electron/DSH workspace", () => {
  for (const path of [
    "apps/desktop-electron/**",
    "apps/desktop-frontend/**",
    "packages/dsh-*/**",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "scripts/package-dist.mjs",
    "scripts/set-electron-package-version.mjs",
  ]) {
    assert.ok(desktopCi.includes(`"${path}"`), `paths filter must include ${path}`);
  }
  assert.match(desktopCi, /runs-on:\s*windows-latest/);
  assert.match(desktopCi, /check-electron-runtime-boundary/);
  assert.match(desktopCi, /check-runtime-mocks/);
  assert.match(desktopCi, /pnpm run build:desktop/);
  assert.match(desktopCi, /pnpm run dist:desktop/);
  assert.doesNotMatch(desktopCi, /desktop\/go\.mod|prod_test|wails/i);
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
