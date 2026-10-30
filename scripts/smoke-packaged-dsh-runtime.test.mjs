import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import { IMAGE_FILE_MACHINE_ARM64, windowsPeStub, windowsX64PeStub } from "./native-executable.mjs";
import { inspectPackagedResources, inspectPackagedWindowsApp, packagedRuntimeLayout, resolvePackagedResources } from "./smoke-packaged-dsh-runtime.mjs";
import { desktopToolRequiredFiles } from "../apps/desktop-electron/src/desktop-tool-environment.ts";
import duckdbExtensionLock from "./duckdb-extension.lock.json" with { type: "json" };

const fixtures = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function createResources(platform = "win32") {
  const output = mkdtempSync(path.join(os.tmpdir(), "voltui-packaged-layout-"));
  fixtures.push(output);
  const resources = platform === "darwin"
    ? path.join(output, "mac-arm64", "VoltUI.app", "Contents", "Resources")
    : path.join(output, platform === "win32" ? "win-unpacked" : "linux-unpacked", "resources");
  const files = [
    path.join(resources, "node-runtime", platform === "win32" ? "node.exe" : "node"),
    path.join(resources, "dsh-runtime", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
    path.join(resources, "dsh-runtime", "node_modules", "@deepseek-ai", "dsh-app-boot", "package.json"),
    path.join(resources, "dsh-runtime", "node_modules", "@deepseek-ai", "cordis-plugin-group", "package.json"),
    path.join(resources, "dsh-runtime", "node_modules", "js-yaml", "package.json"),
    path.join(resources, "dsh-runtime", "node_modules", "node-pty", "package.json"),
    path.join(resources, "dsh-runtime", "node_modules", "koffi", "package.json"),
    path.join(resources, "profiles", "anyong.yml"),
    path.join(resources, "dsh-runtime", "node_modules", "@officecli", "officecli", "officecli.js"),
    path.join(resources, "dsh-runtime", "node_modules", "@wxg-prc-cpg", "browser-skill-dsh-plugin", "package.json"),
    path.join(resources, "dsh-runtime", "node_modules", "@wxg-prc-cpg", "dsh-weknora", "package.json"),
    path.join(resources, "dsh-runtime", "node_modules", "@voltui", "dsh-intranet-auth", "package.json"),
    path.join(resources, "dsh-runtime", "node_modules", "zod", "package.json"),
    path.join(resources, "dsh-runtime", "scripts", "anyong-integrations-mcp.mjs"),
    ...["office-control.ps1", "report-docx.py", "sheet-engine.py", "network-policy.mjs"].map(file => path.join(resources, "dsh-runtime", "scripts", file)),
    ...["@voltui/dsh-office", "@voltui/dsh-mcp-apps", "@voltui/dsh-native-ui", "@deepseek-ai/dsh-experimental-voice-input-bundle", "undici"].map(name => path.join(resources, "dsh-runtime/node_modules", name, "package.json")),
    path.join(resources, "dsh-runtime/node_modules/memorix/dist/cli/index.js"),
    path.join(resources, "dsh-runtime", "node_modules", "@officecli", "officecli", "vendor", platform === "win32" ? "officecli.exe" : "officecli"),
    path.join(resources, "browser-skill-runtime", platform === "win32" ? "bsk.exe" : "bsk"),
    ...(platform === "win32" ? [
      path.join(resources, "dsh-runtime", "node_modules", "node-pty", "prebuilds", "win32-x64", "conpty.node"),
      path.join(resources, "dsh-runtime", "node_modules", "node-pty", "prebuilds", "win32-x64", "conpty_console_list.node"),
      path.join(resources, "dsh-runtime", "node_modules", "node-pty", "prebuilds", "win32-x64", "conpty", "conpty.dll"),
      path.join(resources, "dsh-runtime", "node_modules", "node-pty", "prebuilds", "win32-x64", "conpty", "OpenConsole.exe"),
      path.join(resources, "dsh-runtime", "node_modules", "@koromix", "koffi-win32-x64", "win32_x64", "koffi.node"),
      path.join(resources, "dsh-runtime/node_modules/dsh-ab-ocr/python/ocr_worker.py"),
      ...desktopToolRequiredFiles.map(file => path.join(resources, "tool-runtime", file)),
      path.join(resources, `dsh-runtime/scripts/duckdb-extensions/v${duckdbExtensionLock.duckdbVersion}/${duckdbExtensionLock.platform}/excel.duckdb_extension`),
      path.join(resources, "browser-extension-runtime/extension/manifest.json"),
      path.join(resources, "browser-extension-runtime/extension/background.js"),
      ...["model.int8.onnx", "tokens.txt", "silero_vad.onnx"].map(file => path.join(resources, "speech-runtime/sensevoice", file)),
    ] : []),
  ];
  for (const file of files) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, platform === "win32" && /\.(exe|node|dll)$/i.test(file) ? windowsX64PeStub() : "fixture");
  }
  return { output, resources };
}

test("resolves Windows and macOS packaged resource directories", () => {
  const windows = createResources("win32");
  const mac = createResources("darwin");
  assert.equal(resolvePackagedResources(windows.output, "win32"), windows.resources);
  assert.equal(resolvePackagedResources(mac.output, "darwin"), mac.resources);
});

test("accepts one staged Node and official DSH production graph", () => {
  const fixture = createResources("win32");
  const runtime = inspectPackagedResources(fixture.resources, "win32");
  assert.equal(runtime.nodeExecutable, path.join(fixture.resources, "node-runtime", "node.exe"));
  assert.match(runtime.dshBin, /@deepseek-ai[\\/]dsh[\\/]lib[\\/]bin\.js$/);
});

test("rejects a second DSH copy under app.asar.unpacked", () => {
  const fixture = createResources("win32");
  const duplicate = path.join(fixture.resources, "app.asar.unpacked", "node_modules", "@deepseek-ai", "dsh");
  mkdirSync(duplicate, { recursive: true });
  assert.throws(() => inspectPackagedResources(fixture.resources, "win32"), /duplicate DSH runtime/);
});

test("rejects missing Windows tools, offline speech, extension and spreadsheet resources", () => {
  const fixture = createResources("win32");
  for (const relative of [
    "tool-runtime/powershell/pwsh.exe",
    "tool-runtime/python/python.exe",
    "tool-runtime/python/Lib/site-packages/rapidocr/models/PP-OCRv6_rec_small.onnx",
    "speech-runtime/sensevoice/model.int8.onnx",
    "speech-runtime/sensevoice/tokens.txt",
    "browser-extension-runtime/extension/background.js",
    `dsh-runtime/scripts/duckdb-extensions/v${duckdbExtensionLock.duckdbVersion}/${duckdbExtensionLock.platform}/excel.duckdb_extension`,
  ]) {
    const file = path.join(fixture.resources, relative);
    rmSync(file);
    assert.throws(() => inspectPackagedResources(fixture.resources, "win32"), /incomplete/u);
    writeFileSync(file, relative.endsWith(".exe") ? windowsX64PeStub() : "fixture");
  }
});

test("rejects Windows resources whose executables are not PE images", () => {
  const fixture = createResources("win32");
  writeFileSync(path.join(fixture.resources, "node-runtime", "node.exe"), "Mach-O fixture");
  assert.throws(() => inspectPackagedResources(fixture.resources, "win32"), /not a Windows x64 PE executable/);
});

test("rejects ARM64 PE native addons with the machine code in the error", () => {
  const fixture = createResources("win32");
  writeFileSync(
    path.join(fixture.resources, "dsh-runtime", "node_modules", "@koromix", "koffi-win32-x64", "win32_x64", "koffi.node"),
    windowsPeStub(IMAGE_FILE_MACHINE_ARM64),
  );
  assert.throws(
    () => inspectPackagedResources(fixture.resources, "win32"),
    /packaged Koffi is not a Windows x64 PE executable \(PE machine 0xaa64\)/,
  );
  writeFileSync(
    path.join(fixture.resources, "dsh-runtime", "node_modules", "@koromix", "koffi-win32-x64", "win32_x64", "koffi.node"),
    windowsX64PeStub(),
  );
  writeFileSync(
    path.join(fixture.resources, "dsh-runtime", "node_modules", "node-pty", "prebuilds", "win32-x64", "conpty", "OpenConsole.exe"),
    windowsPeStub(IMAGE_FILE_MACHINE_ARM64),
  );
  assert.throws(
    () => inspectPackagedResources(fixture.resources, "win32"),
    /packaged OpenConsole is not a Windows x64 PE executable \(PE machine 0xaa64\)/,
  );
});

test("rejects Darwin or PDB leftovers in packaged Windows resources", () => {
  const fixture = createResources("win32");
  const leftover = path.join(fixture.resources, "dsh-runtime", "node_modules", "node-pty", "prebuilds", "darwin-arm64", "pty.node");
  mkdirSync(path.dirname(leftover), { recursive: true });
  writeFileSync(leftover, "macho");
  assert.throws(() => inspectPackagedResources(fixture.resources, "win32"), /foreign or debug native files/);
});

test("PE-checks the packaged Anyong.exe host before inspecting resources", () => {
  const fixture = createResources("win32");
  const executable = path.join(fixture.output, "win-unpacked", "Anyong.exe");
  writeFileSync(executable, windowsX64PeStub());
  const inspected = inspectPackagedWindowsApp(fixture.output);
  assert.equal(inspected.nodeExecutable, path.join(fixture.resources, "node-runtime", "node.exe"));
  writeFileSync(executable, windowsPeStub(IMAGE_FILE_MACHINE_ARM64));
  assert.throws(
    () => inspectPackagedWindowsApp(fixture.output),
    /packaged Electron host is not a Windows x64 PE executable \(PE machine 0xaa64\)/,
  );
});

test("packaged plugin paths are derived from the resources root", () => {
  const fixture = createResources("win32");
  const layout = packagedRuntimeLayout(fixture.resources, "win32");
  const inspected = inspectPackagedResources(fixture.resources, "win32");
  assert.equal(inspected.resourcesDir, fixture.resources);
  assert.equal(layout.resourcesDir, fixture.resources);
  assert.equal(layout.nodeExecutable, inspected.nodeExecutable);
  assert.equal(layout.dshBin, inspected.dshBin);
  assert.equal(layout.officeCliEntry, path.join(fixture.resources, "dsh-runtime", "node_modules", "@officecli", "officecli", "officecli.js"));
  assert.equal(layout.browserSkillCli, path.join(fixture.resources, "browser-skill-runtime", "bsk.exe"));
  assert.equal(layout.integrationsScript, path.join(fixture.resources, "dsh-runtime", "scripts", "anyong-integrations-mcp.mjs"));
  assert.equal(layout.browserSkillPlugin, path.join(fixture.resources, "dsh-runtime", "node_modules", "@wxg-prc-cpg", "browser-skill-dsh-plugin"));
  assert.equal(layout.intranetAuthPlugin, path.join(fixture.resources, "dsh-runtime", "node_modules", "@voltui", "dsh-intranet-auth"));
});
