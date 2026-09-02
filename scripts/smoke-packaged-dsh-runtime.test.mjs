import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import { inspectPackagedResources, resolvePackagedResources } from "./smoke-packaged-dsh-runtime.mjs";

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
    path.join(resources, "dsh-runtime", "node_modules", "@officecli", "officecli", "vendor", platform === "win32" ? "officecli.exe" : "officecli"),
    path.join(resources, "browser-skill-runtime", platform === "win32" ? "bsk.exe" : "bsk"),
  ];
  for (const file of files) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "fixture");
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
