import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { parse } = createRequire(path.join(root, "apps", "desktop-electron", "package.json"))("yaml");
const workflow = (name) => readFileSync(path.join(root, ".github", "workflows", name), "utf8");

test("CI is Node 26 only and verifies the official DSH migration boundary", () => {
  const ci = workflow("ci.yml");
  assert.match(ci, /node-version:\s*26\.8\.1/g);
  assert.match(ci, /version:\s*12\.1\.0/);
  assert.match(ci, /pnpm run test:dsh-integration/);
  assert.match(ci, /node scripts\/check-migration-boundary\.mjs/);
  assert.match(ci, /node scripts\/check-skills-sync\.mjs/);
  assert.match(ci, /pnpm-invocation\.test\.mjs/);
  assert.match(ci, /native-executable\.test\.mjs/);
  assert.match(ci, /smoke-packaged-dsh-runtime\.test\.mjs/);
  assert.match(ci, /smoke-staged-dsh-runtime\.test\.mjs/);
  assert.doesNotMatch(ci, /publish-cnb-release|upload-cnb-release-assets/);
  assert.doesNotMatch(ci, /setup-go|\bgo test\b|golangci|govulncheck|@dsh\//i);
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
  assert.match(desktop, /check-skills-sync/);
  assert.match(packageJson.scripts["dist:desktop"], /smoke:package/);
  assert.match(electronPackageJson.scripts.dist, /install:electron/);
  assert.equal(electronPackageJson.scripts["install:electron"], "install-electron");
  assert.match(desktop, /windows-x64-portable-\*\.zip/);
  assert.match(desktop, /Get-AuthenticodeSignature/);
  assert.match(desktop, /NotSigned/);
  assert.match(desktop, /apps\/desktop-frontend\/\*\*/);
  assert.match(desktop, /scripts\/provision-dsh-profile/);
  assert.match(desktop, /scripts\/native-executable/);
  assert.match(desktop, /scripts\/smoke-staged-dsh-runtime/);
  assert.match(desktop, /scripts\/check-skills-sync/);
  assert.match(desktop, /scripts\/anyong-integrations-mcp/);
  assert.match(desktop, /scripts\/third-party-\*\.mjs/);
  assert.match(desktop, /scripts\/stage-bundled-model-credentials/);
  assert.doesNotMatch(desktop, /packages\/dsh-|check-runtime-mocks|test:config/);
});

test("desktop release remains a manual unsigned-review artifact", () => {
  const release = workflow("release-desktop.yml");
  const stageBundle = readFileSync(path.join(root, "scripts", "stage-bundled-model-credentials.mjs"), "utf8");
  const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  assert.match(release, /workflow_dispatch/);
  assert.match(release, /CSC_IDENTITY_AUTO_DISCOVERY:\s*"false"/);
  assert.match(release, /Get-AuthenticodeSignature/);
  assert.match(release, /windows-x64-portable-\$env:DESKTOP_VERSION\.zip/);
  assert.match(release, /NotSigned/);
  assert.match(release, /unsigned-review/);
  assert.match(release, /secrets\.XG_GOMODEL_API_KEY/);
  assert.match(release, /REQUIRE_XG_MODEL_BUNDLE:\s*["']1["']/);
  assert.match(release, /verify-bundled-model-credentials/);
  assert.match(release, /check-skills-sync/);
  assert.match(release, /name: Require bundled model credential[\s\S]*?env:\s*[\s\S]*?XG_GOMODEL_API_KEY:/);
  assert.match(release, /name: Package Windows x64[\s\S]*?env:\s*[\s\S]*?XG_GOMODEL_API_KEY:/);
  assert.match(stageBundle, /bundled\.env/);
  assert.match(stageBundle, /XG_GOMODEL_API_KEY/);
  assert.match(stageBundle, /env = process\.env/);
  assert.match(stageBundle, /env\.XG_GOMODEL_API_KEY/);
  assert.doesNotMatch(stageBundle, /\.cnb\/envs\.yml|cnbEnvs/);
  assert.match(packageJson.scripts["dist:desktop"], /smoke:package/);
  assert.doesNotMatch(release, /gh release create|setup-go|approved_cli_tag|release-stable/);
});

test("desktop CI reruns when validation or packaging helpers change", () => {
  const desktop = parse(workflow("desktop-ci.yml"));
  for (const file of [
    "scripts/ci-workflows.test.mjs",
    "scripts/pnpm-invocation.test.mjs",
    "scripts/ensure-pnpm.mjs",
    "scripts/verify-bundled-model-credentials.mjs",
  ]) {
    for (const event of ["push", "pull_request"]) {
      assert.ok(desktop.on[event].paths.some((pattern) => path.matchesGlob(file, pattern)), `${event}: ${file}`);
    }
  }
});

test("release secrets are isolated from dependency installation, audit, and tests", () => {
  const job = parse(workflow("release-desktop.yml")).jobs.package;
  assert.equal(job.env.XG_GOMODEL_API_KEY, undefined);
  assert.equal(job.env.XG_GOMODEL_ENDPOINT, undefined);
  const secretSteps = job.steps.filter((step) => Object.values(step.env ?? {}).some((value) => /secrets\./.test(String(value))));
  assert.deepEqual(secretSteps.map((step) => step.name), ["Require bundled model credential", "Package Windows x64"]);
  assert.ok(job.steps.findIndex((step) => step.name === "Verify candidate") < job.steps.indexOf(secretSteps[0]));
  assert.doesNotMatch(workflow("release-desktop.yml"), /GITHUB_ENV|::set-env/);
});

test("Windows packaging refuses high-severity dependencies before creating or uploading artifacts", () => {
  for (const name of ["desktop-ci.yml", "release-desktop.yml"]) {
    const source = workflow(name);
    const audit = source.indexOf("pnpm audit --prod --audit-level high");
    const packaging = source.indexOf("pnpm run dist:desktop");
    const upload = source.indexOf("actions/upload-artifact@");
    assert.ok(audit >= 0 && audit < packaging && packaging < upload, name);
    assert.match(source, /pnpm audit --prod --audit-level high\s+if \(\$LASTEXITCODE -ne 0\) \{ throw "Production dependency audit failed" \}/);
    assert.doesNotMatch(source, /continue-on-error:\s*true|always\(\)|--ignore-registry-errors|--ignore-unfixable/);
  }
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
  assert.match(labeler, /apps\/desktop-frontend/);
  assert.doesNotMatch(labeler, /internal\/|packages\/dsh-/);
  assert.match(bugTemplate, /Official DSH Web workflow/);
  assert.doesNotMatch(bugTemplate, /Go rewrite|Legacy TypeScript/);
});

test("CNB validates the same Node 26 source contract", () => {
  const cnb = readFileSync(path.join(root, ".cnb.yml"), "utf8");
  assert.match(cnb, /node:26\.8\.1/);
  assert.match(cnb, /pnpm@12\.1\.0/);
  assert.match(cnb, /pnpm run test:dsh-integration/);
  assert.match(cnb, /check-migration-boundary/);
  assert.match(cnb, /check-skills-sync/);
  assert.match(cnb, /pnpm-invocation\.test\.mjs/);
  assert.match(cnb, /native-executable\.test\.mjs/);
  assert.match(cnb, /smoke-packaged-dsh-runtime\.test\.mjs/);
  assert.match(cnb, /smoke-staged-dsh-runtime\.test\.mjs/);
  assert.doesNotMatch(cnb, /imports:[\s\S]*\.cnb\/envs\.yml/);
  assert.doesNotMatch(cnb, /tag_push:|publish-cnb-release\.mjs|dist:desktop|vendor\/bsk/);
  assert.doesNotMatch(cnb, /desktop-frontend|check-runtime-mocks|\bgo\b|wails/i);
});

test("tracked OEM files never contain live credentials or vendored BrowserSkill binaries", () => {
  const envs = readFileSync(path.join(root, ".cnb", "envs.yml"), "utf8");
  assert.match(envs, /must never contain credentials/);
  assert.doesNotMatch(envs, /XG_GOMODEL_API_KEY:\s*[^\s"#']{16,}/);
  assert.equal(existsSync(path.join(root, "vendor", "bsk", "bsk.exe")), false);
  const gitignore = readFileSync(path.join(root, ".gitignore"), "utf8");
  assert.match(gitignore, /bundled\.env/);
  assert.match(gitignore, /browser-skill-runtime/);
  assert.match(gitignore, /publish-cnb-\*\.mjs/);
  assert.match(gitignore, /install-cnb-\*\.ps1/);
  assert.match(gitignore, /ensure-cnb-workspace\.ps1/);
  assert.match(gitignore, /worktrees/);
});

test("repository enforces the pinned pnpm version", () => {
  const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(packageJson.packageManager, "pnpm@12.1.0");
  assert.equal(packageJson.scripts.preinstall, "node ./scripts/ensure-pnpm.mjs");
  assert.equal(packageJson.license, "MIT");
  assert.equal(packageJson.repository?.url, "https://github.com/zuohuadong/volt-gui.git");
  assert.equal(packageJson.main, undefined);
  assert.doesNotMatch(JSON.stringify(packageJson), /cnb\.cool/);
  for (const packagePath of ["apps/desktop-electron/package.json", "apps/desktop-frontend/package.json"]) {
    const workspacePackage = JSON.parse(readFileSync(path.join(root, packagePath), "utf8"));
    assert.match(workspacePackage.scripts.prebuild, /ensure-pnpm\.mjs/);
  }
});

test("Pages builds the site with the exact repository Node version", () => {
  const pages = workflow("pages.yml");
  assert.match(pages, /node-version:\s*26\.8\.1/);
  assert.match(pages, /npm ci/);
  assert.match(pages, /npm test/);
  assert.match(pages, /npm run build/);
});
