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
    "package.json",
  ]);
  assert.equal(electronBuilderConfig.files.includes("dist/**/*"), false);
  assert.deepEqual(electronBuilderConfig.extraResources, [
    { from: "../../profiles", to: "profiles", filter: ["anyong.yml"] },
    { from: ".dsh-runtime/node_modules", to: "dsh-runtime/node_modules" },
    { from: ".node-runtime", to: "node-runtime" },
  ]);
  assert.equal(electronBuilderConfig.beforeBuild(), false);
  assert.equal(electronBuilderConfig.asarUnpack, undefined);

  const packageJson = JSON.parse(readFileSync(path.join(root, "apps/desktop-electron/package.json"), "utf8"));
  assert.equal(packageJson.scripts.typecheck, "tsc --noEmit");
  assert.equal(packageJson.scripts["test:security"], "node --test ../../scripts/check-electron-runtime-boundary.test.mjs");
  assert.equal(packageJson.scripts["stage:runtime"], "node ./scripts/stage-dsh-runtime.mjs");
  assert.equal(packageJson.dependencies["@deepseek-ai/dsh"], "0.1.1-rc.2");
  assert.equal(packageJson.dependencies["js-yaml"], undefined);
});
