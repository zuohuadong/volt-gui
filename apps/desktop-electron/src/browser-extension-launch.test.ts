import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";

import {
  extensionPageUrl,
  installedBrowsers,
  launchExtensionPage,
  resolveBrowserCandidate,
  type BrowserCandidate,
} from "./browser-extension-launch.ts";

test("detects installed Chromium browsers in a stable order", () => {
  const env = {
    PROGRAMFILES: "C:\\Program Files",
    "PROGRAMFILES(X86)": "C:\\Program Files (x86)",
    LOCALAPPDATA: "C:\\Users\\demo\\AppData\\Local",
  };
  const present = new Set([
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Users\\demo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe",
  ]);
  const browsers = installedBrowsers({
    platform: "win32",
    env,
    exists: (file) => present.has(file),
  });
  assert.deepEqual(browsers.map((browser) => browser.id), ["chrome", "edge"]);
  assert.equal(browsers[0].path, "C:\\Users\\demo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe");
});

test("uses browser specific extension management URLs", () => {
  assert.equal(extensionPageUrl("chrome"), "chrome://extensions/");
  assert.equal(extensionPageUrl("chromium"), "chrome://extensions/");
  assert.equal(extensionPageUrl("brave"), "chrome://extensions/");
  assert.equal(extensionPageUrl("edge"), "edge://extensions/");
});

test("returns no candidates when nothing is installed", () => {
  assert.deepEqual(installedBrowsers({ platform: "linux", env: {}, exists: () => false }), []);
});

test("only accepts browser ids from the detected candidate list", () => {
  const browsers: BrowserCandidate[] = [
    { id: "chrome", name: "Chrome", path: "/usr/bin/google-chrome" },
  ];
  assert.equal(resolveBrowserCandidate(browsers, "chrome")?.path, "/usr/bin/google-chrome");
  assert.equal(resolveBrowserCandidate(browsers, "edge"), undefined);
  assert.equal(resolveBrowserCandidate(browsers, "/usr/bin/google-chrome"), undefined);
});

test("launches the extension page detached and resolves once spawned", async () => {
  const invocations: Array<{ command: string; args: readonly string[]; detached?: boolean }> = [];
  const fakeSpawn = ((command: string, args: readonly string[], options: { detached?: boolean }) => {
    invocations.push({ command, args, detached: options.detached });
    const child = new EventEmitter() as EventEmitter & { unref: () => void };
    child.unref = () => {};
    queueMicrotask(() => child.emit("spawn"));
    return child;
  }) as never;
  const result = await launchExtensionPage(
    { id: "edge", name: "Edge", path: "/usr/bin/microsoft-edge" },
    { spawnImpl: fakeSpawn },
  );
  assert.equal(result.launched, true);
  assert.deepEqual(invocations, [{
    command: "/usr/bin/microsoft-edge",
    args: ["edge://extensions/"],
    detached: true,
  }]);
});

test("reports a launch failure instead of throwing", async () => {
  const fakeSpawn = (() => {
    const child = new EventEmitter() as EventEmitter & { unref: () => void };
    child.unref = () => {};
    queueMicrotask(() => child.emit("error", new Error("ENOENT: missing browser")));
    return child;
  }) as never;
  const result = await launchExtensionPage(
    { id: "chrome", name: "Chrome", path: "/missing/chrome" },
    { spawnImpl: fakeSpawn },
  );
  assert.equal(result.launched, false);
  assert.match(result.launched ? "" : result.error, /missing browser/u);
});