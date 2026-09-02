import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

import electronBuilderConfig from "../apps/desktop-electron/electron-builder.mjs";
import { resolveElectronProfile } from "../apps/desktop-electron/src/electron-profile.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktopRequire = createRequire(path.join(root, "apps", "desktop-electron", "package.json"));
const { parse } = desktopRequire("yaml");

test("Node 26 loads the default Anyong Electron profile directly", () => {
  assert.deepEqual(resolveElectronProfile(), {
    productName: "西谷智灯暗涌平台",
    appId: "cn.aizhuliren.anyong.desktop",
    nsisGuid: "anyong-desktop-guid",
    artifactSlug: "anyong",
    executableName: "Anyong",
  });
});

test("resolves the explicit Anyong OEM identity", () => {
  assert.deepEqual(resolveElectronProfile(" ANYONG "), {
    productName: "西谷智灯暗涌平台",
    appId: "cn.aizhuliren.anyong.desktop",
    nsisGuid: "anyong-desktop-guid",
    artifactSlug: "anyong",
    executableName: "Anyong",
  });
});

test("rejects unknown Electron profiles", () => {
  assert.throws(() => resolveElectronProfile("unknown"), /Unsupported Electron desktop profile/);
  assert.throws(() => resolveElectronProfile("voltui"), /Unsupported Electron desktop profile/);
});

test("packages only explicit production Electron files", () => {
  assert.deepEqual(electronBuilderConfig.files, [
    "dist/main.js",
    "dist/preload.cjs",
    "package.json",
    "!node_modules/**/*",
  ]);
  assert.equal(electronBuilderConfig.files.includes("dist/**/*"), false);
  assert.deepEqual(electronBuilderConfig.extraResources, [
    { from: "../desktop-frontend/dist", to: "frontend" },
    { from: "../../profiles", to: "profiles", filter: ["anyong.yml"] },
    { from: ".dsh-runtime/node_modules", to: "dsh-runtime/node_modules" },
    { from: ".node-runtime", to: "node-runtime" },
    { from: ".browser-skill-runtime", to: "browser-skill-runtime" },
  ]);
  assert.equal(electronBuilderConfig.beforeBuild(), false);
  assert.equal(electronBuilderConfig.asarUnpack, undefined);

  const packageJson = JSON.parse(readFileSync(path.join(root, "apps/desktop-electron/package.json"), "utf8"));
  assert.equal(packageJson.scripts.typecheck, "tsc --noEmit");
  assert.equal(packageJson.scripts["test:security"], "node --test ../../scripts/check-electron-runtime-boundary.test.mjs");
  assert.equal(packageJson.scripts["stage:runtime"], "node ./scripts/stage-dsh-runtime.mjs");
  assert.equal(packageJson.dependencies["@deepseek-ai/dsh"], "0.1.1-rc.2");
  assert.equal(packageJson.dependencies["@officecli/officecli"], "1.0.146");
  assert.equal(packageJson.dependencies["@wxg-prc-cpg/browser-skill-dsh-plugin"], "0.1.2");
  assert.equal(packageJson.dependencies["js-yaml"], undefined);
});

test("packages the XG GOModel route without embedding its credential", () => {
  const profilePath = path.join(root, "profiles", "anyong.yml");
  const source = readFileSync(profilePath, "utf8");
  const entries = parse(source);
  const defaultModel = entries.find((entry) => entry.id === "agent-default-model");
  const piAi = entries.find((entry) => entry.id === "llm-pi-ai");
  const route = piAi?.config?.providers?.["xg-gomodel"];

  assert.deepEqual(defaultModel?.config, {
    provider: "xg-gomodel",
    model: "vlm",
  });
  assert.equal(route?.apiKeyEnv, "XG_GOMODEL_API_KEY");
  assert.equal(route?.api, "openai-completions");
  assert.equal(route?.baseURL, "http://192.168.1.47:9010/v1");
  assert.deepEqual(route?.models?.map((model) => model.id), [
    "vlm",
    "deepseek-v4-flash",
    "qwen3.8-flash-next",
  ]);
  assert.deepEqual(route?.models?.[0]?.input, ["text"]);
  assert.doesNotMatch(source, /master_key\s*:/i);
});
