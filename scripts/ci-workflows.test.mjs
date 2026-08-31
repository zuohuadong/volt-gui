import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = (name) => readFileSync(path.join(root, ".github", "workflows", name), "utf8");

test("CI is Node 26 only and verifies the official DSH migration boundary", () => {
  const ci = workflow("ci.yml");
  assert.match(ci, /node-version:\s*26\.8\.1/g);
  assert.match(ci, /pnpm run test:dsh-integration/);
  assert.match(ci, /node scripts\/check-migration-boundary\.mjs/);
  assert.doesNotMatch(ci, /setup-go|\bgo test\b|golangci|govulncheck|desktop-frontend|@dsh\//i);
});

test("CodeQL scans only current JavaScript, TypeScript, and Actions surfaces", () => {
  const codeql = workflow("codeql.yml");
  assert.match(codeql, /javascript-typescript/);
  assert.match(codeql, /actions/);
  assert.doesNotMatch(codeql, /language:\s*go|build-mode:\s*autobuild/);
});

test("desktop CI packages only the official DSH Electron shell on Windows x64", () => {
  const desktop = workflow("desktop-ci.yml");
  const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const electronPackageJson = JSON.parse(readFileSync(path.join(root, "apps", "desktop-electron", "package.json"), "utf8"));
  assert.match(desktop, /runs-on:\s*windows-latest/);
  assert.match(desktop, /node-version:\s*26\.8\.1/);
  assert.match(desktop, /version:\s*12\.1\.0/);
  assert.match(desktop, /pnpm run dist:desktop/);
  assert.match(desktop, /pnpm run test:dsh-integration/);
  assert.match(packageJson.scripts["dist:desktop"], /smoke:package/);
  assert.match(electronPackageJson.scripts.dist, /install:electron/);
  assert.equal(electronPackageJson.scripts["install:electron"], "install-electron");
  assert.match(desktop, /windows-x64-portable-\*\.zip/);
  assert.doesNotMatch(desktop, /desktop-frontend|packages\/dsh-|check-runtime-mocks|test:config/);
});

test("desktop release remains a manual unsigned-review artifact", () => {
  const release = workflow("release-desktop.yml");
  const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  assert.match(release, /workflow_dispatch/);
  assert.match(release, /CSC_IDENTITY_AUTO_DISCOVERY:\s*"false"/);
  assert.match(release, /Get-AuthenticodeSignature/);
  assert.match(release, /windows-x64-portable-\$env:DESKTOP_VERSION\.zip/);
  assert.match(release, /NotSigned/);
  assert.match(release, /unsigned-review/);
  assert.match(packageJson.scripts["dist:desktop"], /smoke:package/);
  assert.doesNotMatch(release, /gh release create|setup-go|approved_cli_tag|release-stable/);
});

test("retired release and upstream workflows stay absent", () => {
  for (const name of [
    "deploy-accounts-worker.yml",
    "deploy-crash-worker.yml",
    "deploy-forum-worker.yml",
    "release.yml",
    "release-npm.yml",
    "release-stable.yml",
    "release-stable-trigger.yml",
    "e2e-bot.yml",
    "upstream-sync.yml",
  ]) {
    assert.equal(existsSync(path.join(root, ".github", "workflows", name)), false, name);
  }

  for (const name of [
    "publish-desktop-github-release.sh",
    "verify-desktop-release-directory.sh",
  ]) {
    assert.equal(existsSync(path.join(root, "scripts", name)), false, name);
  }
});

test("repository governance files match the current runtime", () => {
  const dependabot = readFileSync(path.join(root, ".github", "dependabot.yml"), "utf8");
  const labeler = readFileSync(path.join(root, ".github", "labeler.yml"), "utf8");
  const bugTemplate = readFileSync(path.join(root, ".github", "ISSUE_TEMPLATE", "bug_report.yml"), "utf8");
  assert.match(dependabot, /package-ecosystem:\s*"npm"/);
  assert.doesNotMatch(dependabot, /gomod|desktop-frontend/);
  assert.match(labeler, /apps\/desktop-electron/);
  assert.doesNotMatch(labeler, /internal\/|packages\/dsh-|apps\/desktop-frontend/);
  assert.match(bugTemplate, /Official DSH Web workflow/);
  assert.doesNotMatch(bugTemplate, /Go rewrite|Legacy TypeScript/);
});

test("CNB validates the same Node 26 source contract", () => {
  const cnb = readFileSync(path.join(root, ".cnb.yml"), "utf8");
  assert.match(cnb, /runner:/);
  assert.match(cnb, /namespace:\s*group/);
  assert.match(cnb, /tags:\s*[\r\n]+\s+-\s+zhd/);
  assert.match(cnb, /^ {6}stages:/m);
  assert.doesNotMatch(cnb, /^ {8}stages:/m);
  assert.match(cnb, /node --version/);
  assert.match(cnb, /Expected Node v26\.8\.1/);
  assert.match(cnb, /Expected pnpm 12\.1\.0/);
  assert.match(cnb, /pnpm\.cmd/);
  assert.match(cnb, /Test-Path/);
  assert.match(cnb, /pnpm\.cmd run test:dsh-integration/);
  assert.match(cnb, /check-migration-boundary/);
  assert.match(cnb, /^\$:\s*[\r\n]+\s+tag_push:/m);
  assert.match(cnb, /Unsupported release tag/);
  assert.match(cnb, /set-electron-package-version\.mjs/);
  assert.match(cnb, /pnpm\.cmd run dist:desktop/);
  assert.match(cnb, /type: git:release/);
  assert.match(cnb, /preRelease: true/);
  assert.match(cnb, /upload-cnb-release-assets\.mjs/);
  assert.doesNotMatch(cnb, /docker:|test -f|desktop-frontend|check-runtime-mocks|\bgo\b|wails/i);
});

test("repository enforces the pinned pnpm version", () => {
  const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(packageJson.packageManager, "pnpm@12.1.0");
  assert.equal(packageJson.scripts.preinstall, "node ./scripts/ensure-pnpm.mjs");
  for (const packagePath of ["apps/desktop-electron/package.json", "apps/desktop-frontend/package.json"]) {
    const workspacePackage = JSON.parse(readFileSync(path.join(root, packagePath), "utf8"));
    assert.match(workspacePackage.scripts.prebuild, /ensure-pnpm\.mjs/);
  }
});

test("Pages builds the site with the exact repository Node version", () => {
  const pages = workflow("pages.yml");
  assert.match(pages, /node-version:\s*26\.8\.1/);
  assert.match(pages, /npm ci/);
  assert.match(pages, /npm run build/);
});
