import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { assembleStagedPackagedResources, assertTempStagedResourcesDestination } from "./smoke-staged-dsh-runtime.mjs";

const fixtures = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function tempFixture() {
  const fixture = mkdtempSync(path.join(os.tmpdir(), "voltui-staged-safety-"));
  fixtures.push(fixture);
  return fixture;
}

function stagedFixture() {
  const source = tempFixture();
  const desktop = path.join(source, "apps", "desktop-electron");
  for (const directory of [".node-runtime", ".dsh-runtime/node_modules", ".dsh-runtime/scripts", ".browser-skill-runtime"]) {
    mkdirSync(path.join(desktop, directory), { recursive: true });
  }
  mkdirSync(path.join(source, "profiles"));
  writeFileSync(path.join(source, "profiles", "anyong.yml"), "fixture profile\n");
  writeFileSync(path.join(desktop, ".node-runtime", "sentinel"), "preserve source");
  return { source, desktop };
}

test("staged resource assembly stays inside the temp directory", () => {
  const dest = assertTempStagedResourcesDestination(path.join(os.tmpdir(), "voltui-staged-resources-test"));
  assert.equal(path.dirname(dest), os.tmpdir());
  assert.throws(
    () => assertTempStagedResourcesDestination(path.resolve("/Volumes/Data/workspace/volt-gui/oops")),
    /temp directory/,
  );
});

test("rejects the temp root, traversal, and sibling prefix paths", () => {
  const root = tempFixture();
  for (const dest of [root, path.join(root, "child", ".."), path.join(root, "..", "outside"), `${root}-sibling`]) {
    assert.throws(() => assertTempStagedResourcesDestination(dest, root), /temp directory/);
  }
});

test("rejects an ancestor link escaping the selected temp root", () => {
  const root = tempFixture();
  const outside = tempFixture();
  symlinkSync(outside, path.join(root, "escape"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => assertTempStagedResourcesDestination(path.join(root, "escape", "new"), root), /link outside/);
  assert.equal(existsSync(path.join(outside, "new")), false);
});

test("existing target directories and their content are never replaced", () => {
  const target = tempFixture();
  const sentinel = path.join(target, "sentinel");
  writeFileSync(sentinel, "preserve existing");
  assert.throws(() => assembleStagedPackagedResources(target), { code: "EEXIST" });
  assert.equal(readFileSync(sentinel, "utf8"), "preserve existing");
});

test("existing target files are never removed or truncated", () => {
  const target = path.join(tempFixture(), "existing-file");
  writeFileSync(target, "preserve existing file");
  assert.throws(() => assembleStagedPackagedResources(target), { code: "EEXIST" });
  assert.equal(lstatSync(target).isFile(), true);
  assert.equal(readFileSync(target, "utf8"), "preserve existing file");
});

test("allows a new nested destination below the temp root", () => {
  const fixture = tempFixture();
  const { source } = stagedFixture();
  const nested = path.join(fixture, "new", "nested", "resources");
  assert.equal(assertTempStagedResourcesDestination(nested, fixture), nested);
  assert.equal(assembleStagedPackagedResources(nested, source), nested);
  assert.equal(existsSync(path.join(nested, "profiles", "anyong.yml")), true);
});

test("missing descendants do not hide an escaping ancestor link", () => {
  const fixture = tempFixture();
  const outside = tempFixture();
  symlinkSync(outside, path.join(fixture, "escape"), process.platform === "win32" ? "junction" : "dir");
  const nested = path.join(fixture, "escape", "new", "nested", "resources");
  assert.throws(() => assertTempStagedResourcesDestination(nested, fixture), /link outside/);
  assert.equal(existsSync(path.join(outside, "new")), false);
});

test("assembly never creates directories through a link outside the system temp root", (context) => {
  const relativeHome = path.relative(realpathSync(os.tmpdir()), realpathSync(os.homedir()));
  if (relativeHome !== ".." && !relativeHome.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeHome)) {
    context.skip("HOME is inside the system temp directory");
    return;
  }
  const fixture = tempFixture();
  const outside = mkdtempSync(path.join(os.homedir(), ".voltui-staged-safety-"));
  fixtures.push(outside);
  symlinkSync(outside, path.join(fixture, "escape"), process.platform === "win32" ? "junction" : "dir");
  const nested = path.join(fixture, "escape", "new", "resources");
  assert.throws(() => assembleStagedPackagedResources(nested, fixture), /link outside/);
  assert.equal(existsSync(path.join(outside, "new")), false);
});

test("dangling ancestor links fail closed without creating their targets", () => {
  const fixture = tempFixture();
  const missing = path.join(tempFixture(), "missing");
  symlinkSync(missing, path.join(fixture, "dangling"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => assertTempStagedResourcesDestination(path.join(fixture, "dangling", "resources"), fixture), { code: "ENOENT" });
  assert.throws(() => assembleStagedPackagedResources(path.join(fixture, "dangling", "resources"), fixture), { code: "ENOENT" });
  assert.equal(existsSync(missing), false);
});

test("existing target links are never followed or removed", () => {
  const fixture = tempFixture();
  const outside = tempFixture();
  writeFileSync(path.join(outside, "sentinel"), "preserve linked");
  const target = path.join(fixture, "linked");
  symlinkSync(outside, target, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => assembleStagedPackagedResources(target), { code: "EEXIST" });
  assert.equal(lstatSync(target).isSymbolicLink(), true);
  assert.equal(readFileSync(path.join(outside, "sentinel"), "utf8"), "preserve linked");
});

test("dangling target links are preserved without creating their targets", () => {
  const fixture = tempFixture();
  const target = path.join(fixture, "dangling-leaf");
  const missing = path.join(fixture, "missing");
  symlinkSync(missing, target, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => assembleStagedPackagedResources(target), { code: "EEXIST" });
  assert.equal(lstatSync(target).isSymbolicLink(), true);
  assert.equal(existsSync(missing), false);
});

test("assembly creates an exclusive target without changing staged sources", () => {
  const { source, desktop } = stagedFixture();
  const target = path.join(tempFixture(), "resources");
  assert.equal(assembleStagedPackagedResources(target, source), target);
  assert.equal(realpathSync(path.join(target, "node-runtime")), realpathSync(path.join(desktop, ".node-runtime")));
  assert.equal(readFileSync(path.join(target, "profiles", "anyong.yml"), "utf8"), "fixture profile\n");
  if (process.platform !== "win32") assert.equal(lstatSync(target).mode & 0o777, 0o700);
  rmSync(target, { recursive: true, force: true });
  assert.equal(readFileSync(path.join(desktop, ".node-runtime", "sentinel"), "utf8"), "preserve source");
});

test("default resource targets are unique between invocations", () => {
  const { source } = stagedFixture();
  const first = assembleStagedPackagedResources(undefined, source);
  fixtures.push(first);
  const second = assembleStagedPackagedResources(undefined, source);
  fixtures.push(second);
  assert.notEqual(first, second);
});

test("missing staging cleans up only the newly created target", () => {
  const source = tempFixture();
  const fixture = tempFixture();
  const target = path.join(fixture, "resources");
  writeFileSync(path.join(fixture, "sentinel"), "preserve parent");
  assert.throws(() => assembleStagedPackagedResources(target, source), /Staged nodeRuntime is missing/);
  assert.equal(existsSync(target), false);
  assert.equal(readFileSync(path.join(fixture, "sentinel"), "utf8"), "preserve parent");
});

test("partial assembly failure removes links without removing staged sources", () => {
  const { source, desktop } = stagedFixture();
  const profile = path.join(source, "profiles", "anyong.yml");
  rmSync(profile);
  mkdirSync(profile);
  const target = path.join(tempFixture(), "resources");
  assert.throws(() => assembleStagedPackagedResources(target, source), { code: "EISDIR" });
  assert.equal(existsSync(target), false);
  assert.equal(readFileSync(path.join(desktop, ".node-runtime", "sentinel"), "utf8"), "preserve source");
});
