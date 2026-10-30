import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import { browserExtensionDirectory, browserExtensionSourceDirectory, ensureBrowserExtension } from "./browser-extension.ts";

const fixtures: string[] = [];
afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

function scratch(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "anyong-browser-extension-"));
  fixtures.push(root);
  return root;
}

test("source directory follows packaged and development layouts", () => {
  assert.equal(
    browserExtensionSourceDirectory("/opt/anyong/resources", true),
    path.join("/opt/anyong/resources", "browser-extension-runtime", "extension"),
  );
  assert.equal(
    browserExtensionSourceDirectory("/repo/apps/desktop-electron", false),
    path.join("/repo/apps/desktop-electron", ".browser-extension-runtime", "extension"),
  );
});

test("extension lives in a stable userData directory", () => {
  assert.equal(browserExtensionDirectory("/home/demo/.config/Anyong"), path.join("/home/demo/.config/Anyong", "browser-extension"));
});

test("ensureBrowserExtension copies a staged extension once and then reuses it", async () => {
  const root = scratch();
  const source = path.join(root, "resources", "extension");
  mkdirSync(source, { recursive: true });
  writeFileSync(path.join(source, "manifest.json"), JSON.stringify({
    manifest_version: 3, name: "BrowserSkill", version: "0.4.0",
    background: { service_worker: "background.js" },
  }));
  writeFileSync(path.join(source, "background.js"), "console.log('fixture')");
  const destination = browserExtensionDirectory(path.join(root, "userData"));

  const first = ensureBrowserExtension(source, destination);
  assert.equal(first.installed, true);
  assert.equal(first.version, "0.4.0");
  assert.equal(first.changed, true);
  assert.equal(existsSync(path.join(destination, "manifest.json")), true);
  assert.match(readFileSync(path.join(destination, "background.js"), "utf8"), /./u);

  const second = ensureBrowserExtension(source, destination);
  assert.equal(second.changed, false);
});

test("missing packaged extension reports an actionable error instead of throwing", () => {
  const root = scratch();
  const state = ensureBrowserExtension(path.join(root, "missing"), browserExtensionDirectory(root));
  assert.equal(state.installed, false);
  assert.match(state.error ?? "", /重新安装/u);
});

test("a corrupt source manifest is reported, not installed", () => {
  const root = scratch();
  const source = path.join(root, "source");
  writeFileSync(path.join(root, "keep.txt"), "x");
  // 只放 manifest.json 但版本不符，确保校验失败被转换为状态而不是异常。
  mkdirSync(source, { recursive: true });
  writeFileSync(path.join(source, "manifest.json"), JSON.stringify({
    manifest_version: 3,
    name: "BrowserSkill",
    version: "0.0.1",
    background: { service_worker: "background.js" },
  }));
  const state = ensureBrowserExtension(source, path.join(root, "target"));
  assert.equal(state.installed, false);
  assert.match(state.error ?? "", /版本不符/u);
});
