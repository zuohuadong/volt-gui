// Contract test for GitHub Actions workflow invariants.
// Run with: node --test scripts/ci-workflows.test.mjs
//
// Guards the Electron/DSH migration contracts:
//   1. Desktop CI and release packaging run on Windows x64.
//   2. Active desktop jobs use the Electron renderer/runtime boundary gates.
//   3. The release workflow uploads unsigned-review artifacts and stays fail-closed for signing.
//   4. Retired Reasonix upstream-sync assets cannot re-enter the repository.
//   5. ci.yml uses main for push/pull_request and supports workflow_dispatch.
//   6. Active desktop pipelines verify the locked official DSH integration.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readIfPresent = (path) => existsSync(path) ? readFileSync(path, "utf8") : null;
const wf = (name) => readIfPresent(join(root, ".github", "workflows", name));

const cnb = readIfPresent(join(root, ".cnb.yml"));
const releaseCli = wf("release.yml");
const releaseDesktop = wf("release-desktop.yml");
const releasePleaseDesktop = wf("release-please-desktop.yml");
const desktopCi = wf("desktop-ci.yml");
const ci = wf("ci.yml");

test("legacy release-please desktop publisher is retired", () => {
  assert.equal(releasePleaseDesktop, null, "release-please must not create a public Desktop GitHub Release");
});

if (releaseDesktop !== null) {
  test("release-desktop.yml builds an unsigned-review Electron Windows x64 artifact", () => {
    assert.match(releaseDesktop, /runs-on:\s*windows-latest/);
    assert.match(releaseDesktop, /pnpm install --frozen-lockfile/);
    assert.match(releaseDesktop, /node scripts\/set-electron-package-version\.mjs/);
    assert.match(releaseDesktop, /pnpm run dist:desktop/);
    assert.match(releaseDesktop, /CSC_IDENTITY_AUTO_DISCOVERY:\s*["']false["']/);
    assert.match(releaseDesktop, /Get-AuthenticodeSignature/);
    assert.match(releaseDesktop, /Status -ne 'NotSigned'/);
    assert.match(releaseDesktop, /actions\/upload-artifact@/);
    assert.match(releaseDesktop, /windows-x64-unsigned-review/);
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

test("Reasonix upstream synchronization remains retired", () => {
  for (const path of [
    join(root, ".upstream-sync-marker"),
    join(root, ".github", "workflows", "upstream-sync.yml"),
    join(root, "scripts", "upstream-sync.sh"),
    join(root, "scripts", "sync-upstream.sh"),
    join(root, "scripts", "check-upstream-feature-parity.mjs"),
    join(root, "scripts", "upstream-feature-parity.json"),
    join(root, ".github", "workflows", "update-acknowledgments.yml"),
    join(root, ".github", "workflows", "update-star-history.yml"),
    join(root, ".github", "workflows", "stale-report-sweep.yml"),
    join(root, ".github", "workflows", "release-verify-issues.yml"),
    join(root, "scripts", "update-acknowledgments.mjs"),
    join(root, "scripts", "update-star-history.mjs"),
    join(root, "scripts", "update-star-history.test.mjs"),
    join(root, "scripts", "stale-report-sweep.mjs"),
    join(root, "scripts", "stale-report-sweep.test.mjs"),
    join(root, "scripts", "release-verify-issues.mjs"),
    join(root, "scripts", "release-verify-issues.test.mjs"),
  ]) {
    assert.equal(existsSync(path), false, `retired upstream asset must stay absent: ${path}`);
  }
});

test("desktop-ci.yml tracks and verifies the active Electron/DSH workspace", () => {
  for (const path of [
    "apps/desktop-electron/**",
    "apps/desktop-frontend/**",
    "packages/dsh-*/**",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "scripts/anyong.mjs",
    "scripts/bundle.mjs",
    "scripts/dsh-integration.test.mjs",
    "scripts/package-dist.mjs",
    "scripts/set-electron-package-version.mjs",
    "profiles/anyong.yml",
  ]) {
    assert.equal(
      (desktopCi.match(new RegExp(`"${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g")) ?? []).length,
      2,
      `pull_request and push path filters must include ${path}`,
    );
  }
  assert.match(desktopCi, /runs-on:\s*windows-latest/);
  assert.match(desktopCi, /node-version:\s*["']26["']/);
  assert.match(desktopCi, /check-electron-runtime-boundary/);
  assert.match(desktopCi, /check-runtime-mocks/);
  assert.match(desktopCi, /@voltui\/desktop-electron run test:config/);
  assert.match(desktopCi, /@voltui\/desktop-electron run test:profile/);
  assert.match(desktopCi, /@voltui\/desktop-electron run test:security/);
  assert.match(desktopCi, /pnpm run test:dsh-integration/);
  assert.match(desktopCi, /pnpm run build:desktop/);
  assert.match(desktopCi, /pnpm run dist:desktop/);
  assert.doesNotMatch(desktopCi, /desktop\/go\.mod|prod_test|wails/i);
});

test("ci.yml: workflow_dispatch added while retaining main push/pull_request", () => {
  assert.match(ci, /workflow_dispatch:/, "ci.yml must allow manual dispatch");
  assert.match(
    ci,
    /push:\s*\n\s*branches:\s*\[main\]/,
    "ci.yml must retain push trigger on main"
  );
  assert.match(
    ci,
    /pull_request:\s*\n\s*branches:\s*\[main\]/,
    "ci.yml must retain pull_request trigger on main"
  );
  assert.equal((ci.match(/node-version:\s*["']26["']/g) ?? []).length, 2, "CI desktop and site jobs must use Node 26");
  assert.match(
    ci,
    /desktop:[\s\S]*pnpm run test:dsh-integration[\s\S]*pnpm run build:desktop/,
    "CI desktop job must verify the official DSH integration before building",
  );
  assert.match(
    ci,
    /site:[\s\S]*working-directory:\s*site[\s\S]*run:\s*npm ci[\s\S]*run:\s*npm test/,
    "site CI must install its locked dependencies before testing",
  );
});

if (cnb !== null) {
  test("CNB verifies the official DSH integration in regular and release-ready pipelines", () => {
    assert.equal(
      (cnb.match(/pnpm run test:dsh-integration/g) ?? []).length,
      2,
      "both CNB Electron validation pipelines must run the DSH integration test",
    );
  });
}
