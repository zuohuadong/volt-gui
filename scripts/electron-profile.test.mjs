import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

import electronBuilderConfig from "../apps/desktop-electron/electron-builder.mjs";
import { resolveElectronProfile } from "../apps/desktop-electron/src/electron-profile.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Node 26 loads the checked-in TypeScript Electron profile directly", () => {
  assert.deepEqual(resolveElectronProfile("voltui"), {
    productName: "VoltUI",
    appId: "com.voltui.desktop",
    nsisGuid: "voltui-desktop-guid",
    artifactSlug: "voltui",
    executableName: "VoltUI",
  });
});

test("resolves the explicit Anyong OEM identity", () => {
  assert.deepEqual(resolveElectronProfile(" ANYONG "), {
    productName: "Anyong",
    appId: "cn.aizhuliren.anyong.desktop",
    nsisGuid: "anyong-desktop-guid",
    artifactSlug: "anyong",
    executableName: "Anyong",
  });
});

test("rejects unknown Electron profiles", () => {
  assert.throws(() => resolveElectronProfile("unknown"), /Unsupported Electron desktop profile/);
});

test("packages only explicit production Electron files", () => {
  assert.deepEqual(electronBuilderConfig.files, [
    "dist/main.js",
    "dist/preload.cjs",
    "dist/workbench.html",
    "dist/renderer/**/*",
    "package.json",
  ]);
  assert.equal(electronBuilderConfig.files.includes("dist/**/*"), false);

  const packageJson = JSON.parse(readFileSync(path.join(root, "apps/desktop-electron/package.json"), "utf8"));
  assert.equal(packageJson.scripts["test:security"], "node ./scripts/run-security-tests.mjs");
});
