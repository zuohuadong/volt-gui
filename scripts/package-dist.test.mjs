import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import { normalizeDesktopVersion, packageElectronArtifacts } from "./package-dist.mjs";

const fixtures = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function createFixture() {
  const fixture = mkdtempSync(join(tmpdir(), "voltui-package-dist-"));
  fixtures.push(fixture);
  return { sourceDir: join(fixture, "source"), outputDir: join(fixture, "output") };
}

test("normalizes supported desktop tag formats", () => {
  assert.equal(normalizeDesktopVersion("desktop-v1.2.3"), "1.2.3");
  assert.equal(normalizeDesktopVersion("v1.2.3-preview.4"), "1.2.3-preview.4");
  assert.throws(() => normalizeDesktopVersion("latest"), /invalid desktop version/);
});

test("copies only current VoltUI installer and portable artifacts", () => {
  const fixture = createFixture();
  mkdirSync(fixture.sourceDir, { recursive: true });
  writeFileSync(join(fixture.sourceDir, "VoltUI Setup 1.2.3.exe"), "installer");
  writeFileSync(join(fixture.sourceDir, "VoltUI 1.2.3.exe"), "portable");
  writeFileSync(join(fixture.sourceDir, "VoltUI Setup 1.2.3.exe.blockmap"), "blockmap");
  writeFileSync(join(fixture.sourceDir, "Anyong Setup 1.2.3.exe"), "old-brand-installer");
  writeFileSync(join(fixture.sourceDir, "Anyong 1.2.3.exe"), "old-brand-portable");
  writeFileSync(join(fixture.sourceDir, "VoltUI Setup 1.2.2.exe"), "stale-installer");
  writeFileSync(join(fixture.sourceDir, "builder-debug.yml"), "debug-data");

  packageElectronArtifacts({ ...fixture, version: "1.2.3" });

  assert.deepEqual(readdirSync(fixture.outputDir).sort(), [
    "VoltUI Setup 1.2.3.exe.blockmap",
    "VoltUI-windows-x64-installer-1.2.3.exe",
    "VoltUI-windows-x64-portable-1.2.3.exe",
  ]);
  assert.equal(readFileSync(join(fixture.outputDir, "VoltUI-windows-x64-installer-1.2.3.exe"), "utf8"), "installer");
});

test("fails when either Windows executable is missing", () => {
  const fixture = createFixture();
  mkdirSync(fixture.sourceDir, { recursive: true });
  writeFileSync(join(fixture.sourceDir, "VoltUI Setup 1.2.3.exe"), "installer");

  assert.throws(
    () => packageElectronArtifacts({ ...fixture, version: "1.2.3" }),
    /missing Electron artifacts: installer=true portable=false/,
  );
});
