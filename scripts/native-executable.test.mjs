import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  IMAGE_FILE_MACHINE_ARM64,
  NODE_PTY_WIN32_X64_FILES,
  WINDOWS_DSH_NODE_MODULES_FILTER,
  assertWindowsPackagedRuntimeNatives,
  assertWindowsX64PeExecutable,
  ensureWindowsKoffiPackage,
  ensureWindowsNodePtyPrebuild,
  isWindowsX64PeExecutable,
  windowsPeStub,
  windowsRuntimeNativeBinaries,
  windowsX64PeStub,
} from "./native-executable.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function writePe(file, machine = null) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, machine == null ? windowsX64PeStub() : windowsPeStub(machine));
}

function writeNodePtyPrebuild(directory, machine = null) {
  for (const relativeFile of NODE_PTY_WIN32_X64_FILES) {
    writePe(path.join(directory, relativeFile), machine);
  }
}

test("accepts Windows x64 PE images and rejects MZ-only, ARM64 PE, and Mach-O stand-ins", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "voltui-pe-"));
  fixtures.push(dir);
  const x64 = path.join(dir, "node.exe");
  const mzOnly = path.join(dir, "mz-only.exe");
  const arm64 = path.join(dir, "arm64.exe");
  const macho = path.join(dir, "node");
  writeFileSync(x64, windowsX64PeStub());
  writeFileSync(mzOnly, Buffer.from([0x4d, 0x5a, 0x00, 0x00]));
  writeFileSync(arm64, windowsPeStub(IMAGE_FILE_MACHINE_ARM64));
  writeFileSync(macho, Buffer.from([0xcf, 0xfa, 0xed, 0xfe]));
  assert.equal(isWindowsX64PeExecutable(x64), true);
  assert.equal(isWindowsX64PeExecutable(mzOnly), false);
  assert.equal(isWindowsX64PeExecutable(arm64), false);
  assert.equal(isWindowsX64PeExecutable(macho), false);
  assert.doesNotThrow(() => assertWindowsX64PeExecutable(x64, "Node"));
  assert.throws(() => assertWindowsX64PeExecutable(mzOnly, "Node"), /not a Windows x64 PE executable/);
  assert.throws(() => assertWindowsX64PeExecutable(arm64, "Node"), /PE machine 0xaa64/);
});

test("staging, packaging, and inspect gates require Windows x64 PE binaries including Koffi and node-pty", () => {
  const stage = readFileSync(path.join(root, "apps/desktop-electron/scripts/stage-dsh-runtime.mjs"), "utf8");
  const browserSkill = readFileSync(path.join(root, "apps/desktop-electron/scripts/stage-browser-skill-cli.mjs"), "utf8");
  const builder = readFileSync(path.join(root, "apps/desktop-electron/electron-builder.mjs"), "utf8");
  const smoke = readFileSync(path.join(root, "scripts/smoke-packaged-dsh-runtime.mjs"), "utf8");
  assert.match(stage, /assertWindowsX64PeExecutable/);
  assert.match(stage, /ensureWindowsKoffiPackage/);
  assert.match(stage, /ensureWindowsNodePtyPrebuild/);
  assert.match(browserSkill, /assertWindowsX64PeExecutable/);
  assert.match(builder, /assertWindowsX64PeExecutable/);
  assert.match(builder, /ensureWindowsKoffiPackage/);
  assert.match(builder, /ensureWindowsNodePtyPrebuild/);
  assert.match(builder, /filter: \[\.\.\.WINDOWS_DSH_NODE_MODULES_FILTER\]/);
  assert.match(builder, /packagingWindows/);
  assert.equal(WINDOWS_DSH_NODE_MODULES_FILTER.includes("!**/*.pdb"), true);
  assert.match(smoke, /assertWindowsX64PeExecutable/);
  assert.match(smoke, /koffi-win32-x64/);
  assert.match(smoke, /OpenConsole\.exe/);
  assert.match(smoke, /windowsRuntimeNativeBinaries/);
});

test("copies Windows x64 Koffi into the staged runtime from a search root", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "voltui-koffi-"));
  fixtures.push(dir);
  const sourceRoot = path.join(dir, "workspace");
  const targetRoot = path.join(dir, "staged");
  const sourceNode = path.join(sourceRoot, "node_modules", "@koromix", "koffi-win32-x64", "win32_x64", "koffi.node");
  mkdirSync(path.dirname(sourceNode), { recursive: true });
  writeFileSync(path.join(path.dirname(sourceNode), "..", "package.json"), "{\"name\":\"@koromix/koffi-win32-x64\"}\n");
  writeFileSync(sourceNode, windowsX64PeStub());
  const staged = ensureWindowsKoffiPackage(targetRoot, [sourceRoot]);
  assert.equal(staged, path.join(targetRoot, "node_modules", "@koromix", "koffi-win32-x64", "win32_x64", "koffi.node"));
  assert.equal(isWindowsX64PeExecutable(staged), true);
  assert.throws(() => ensureWindowsKoffiPackage(path.join(dir, "empty")), /Koffi is missing/);
});

test("copies Windows x64 Koffi from a pnpm virtual store", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "voltui-koffi-pnpm-"));
  fixtures.push(dir);
  const sourceRoot = path.join(dir, "workspace");
  const targetRoot = path.join(dir, "staged");
  const sourceNode = path.join(
    sourceRoot,
    "node_modules",
    ".pnpm",
    "@koromix+koffi-win32-x64@3.1.6",
    "node_modules",
    "@koromix",
    "koffi-win32-x64",
    "win32_x64",
    "koffi.node",
  );
  writePe(sourceNode);
  const staged = ensureWindowsKoffiPackage(targetRoot, [sourceRoot]);
  assert.equal(isWindowsX64PeExecutable(staged), true);
});

test("replaces a staged ARM64 Koffi binary with the Windows x64 package", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "voltui-koffi-arch-"));
  fixtures.push(dir);
  const sourceRoot = path.join(dir, "workspace");
  const targetRoot = path.join(dir, "staged");
  const sourceNode = path.join(sourceRoot, "node_modules", "@koromix", "koffi-win32-x64", "win32_x64", "koffi.node");
  const destNode = path.join(targetRoot, "node_modules", "@koromix", "koffi-win32-x64", "win32_x64", "koffi.node");
  writePe(sourceNode);
  writePe(destNode, IMAGE_FILE_MACHINE_ARM64);
  const staged = ensureWindowsKoffiPackage(targetRoot, [sourceRoot]);
  assert.equal(staged, destNode);
  assert.equal(isWindowsX64PeExecutable(staged), true);
});

test("copies the complete Windows x64 node-pty ConPTY prebuild and replaces mixed-arch leftovers", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "voltui-pty-"));
  fixtures.push(dir);
  const sourceRoot = path.join(dir, "workspace");
  const targetRoot = path.join(dir, "staged");
  const sourceDir = path.join(sourceRoot, "node_modules", "node-pty", "prebuilds", "win32-x64");
  const destDir = path.join(targetRoot, "node_modules", "node-pty", "prebuilds", "win32-x64");
  writeNodePtyPrebuild(sourceDir);
  writePe(path.join(destDir, "conpty.node"));
  writePe(path.join(destDir, "conpty_console_list.node"));
  writePe(path.join(destDir, "conpty", "conpty.dll"));
  writePe(path.join(destDir, "conpty", "OpenConsole.exe"), IMAGE_FILE_MACHINE_ARM64);
  const staged = ensureWindowsNodePtyPrebuild(targetRoot, [sourceRoot]);
  assert.equal(staged, destDir);
  for (const relativeFile of NODE_PTY_WIN32_X64_FILES) {
    assert.equal(isWindowsX64PeExecutable(path.join(destDir, relativeFile)), true);
  }
  assert.throws(() => ensureWindowsNodePtyPrebuild(path.join(dir, "empty")), /node-pty is missing/);
});

test("windows runtime native binary list covers ConPTY extras and Koffi", () => {
  const binaries = windowsRuntimeNativeBinaries("/runtime");
  assert.equal(binaries.some(([, label]) => label === "OpenConsole"), true);
  assert.equal(binaries.some(([, label]) => label === "ConPTY"), true);
  assert.equal(binaries.some(([, label]) => label === "Koffi"), true);
});

test("rejects Darwin leftovers, ARM64 ConPTY, and PDB files in a Windows runtime graph", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "voltui-foreign-native-"));
  fixtures.push(dir);
  const darwinDir = path.join(dir, "node_modules", "node-pty", "prebuilds", "darwin-arm64");
  mkdirSync(darwinDir, { recursive: true });
  assert.doesNotThrow(() => assertWindowsPackagedRuntimeNatives(dir));
  writeFileSync(path.join(darwinDir, "pty.node"), "macho");
  assert.throws(() => assertWindowsPackagedRuntimeNatives(dir), /foreign or debug native files/);
  rmSync(darwinDir, { recursive: true, force: true });
  const pdb = path.join(dir, "node_modules", "node-pty", "prebuilds", "win32-x64", "conpty.pdb");
  mkdirSync(path.dirname(pdb), { recursive: true });
  writeFileSync(pdb, "pdb");
  assert.throws(() => assertWindowsPackagedRuntimeNatives(dir), /foreign or debug native files/);
});
