import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import { normalizeReleaseVersion, updateElectronPackageVersion } from "./set-electron-package-version.mjs";

const fixtures = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

test("normalizes release tag versions", () => {
  assert.equal(normalizeReleaseVersion("desktop-v2.4.0"), "2.4.0");
  assert.equal(normalizeReleaseVersion("v2.4.0-preview.7"), "2.4.0-preview.7");
  assert.throws(() => normalizeReleaseVersion("2.4"), /must be semver/);
});

test("updates only the Electron package version", () => {
  const fixture = mkdtempSync(join(tmpdir(), "voltui-version-"));
  fixtures.push(fixture);
  const packagePath = join(fixture, "package.json");
  writeFileSync(packagePath, JSON.stringify({ name: "@voltui/desktop-electron", version: "1.0.0", private: true }));

  const version = updateElectronPackageVersion(packagePath, "desktop-v3.1.4");
  const updatedPackage = JSON.parse(readFileSync(packagePath, "utf8"));

  assert.equal(version, "3.1.4");
  assert.deepEqual(updatedPackage, { name: "@voltui/desktop-electron", version: "3.1.4", private: true });
});
