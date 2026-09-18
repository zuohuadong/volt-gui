import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

import electronBuilderConfig from "../apps/desktop-electron/electron-builder.mjs";
import { resolveElectronProfile } from "../apps/desktop-electron/src/electron-profile.ts";
import { WINDOWS_DSH_NODE_MODULES_FILTER } from "./native-executable.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktopRequire = createRequire(path.join(root, "apps", "desktop-electron", "package.json"));
const { parseDocument } = desktopRequire("yaml");

function parseAnyongProfile(source) {
  return parseDocument(source, {
    customTags: [{
      tag: "tag:yaml.org,2002:js",
      resolve: (value) => value,
    }],
  }).toJS();
}

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
  const actualResources = electronBuilderConfig.extraResources.filter(
    (resource) => resource.to !== "bundled.env",
  );
  assert.deepEqual(actualResources, [
    { from: "../desktop-frontend/dist", to: "frontend" },
    { from: "../../profiles", to: "profiles", filter: ["anyong.yml"] },
    { from: ".dsh-runtime/node_modules", to: "dsh-runtime/node_modules", filter: [...WINDOWS_DSH_NODE_MODULES_FILTER] },
    { from: ".dsh-runtime/scripts", to: "dsh-runtime/scripts" },
    { from: ".node-runtime", to: "node-runtime" },
    { from: ".browser-skill-runtime", to: "browser-skill-runtime" },
  ]);
  assert.equal(electronBuilderConfig.beforeBuild(), false);
  assert.equal(electronBuilderConfig.asarUnpack, undefined);
  assert.equal(electronBuilderConfig.nsis.artifactName, "西谷智灯暗涌平台 Setup ${version}.exe");
  assert.equal(electronBuilderConfig.zip.artifactName, "西谷智灯暗涌平台-${version}-win.zip");
  const builderSource = readFileSync(path.join(root, "apps/desktop-electron/electron-builder.mjs"), "utf8");
  assert.match(builderSource, /Packaging extraResources source is missing/);
  assert.match(builderSource, /assertWindowsX64PeExecutable/);
  assert.match(builderSource, /ensureWindowsKoffiPackage/);
  assert.match(builderSource, /ensureWindowsNodePtyPrebuild/);
  assert.match(builderSource, /packagingWindows/);
  assert.match(builderSource, /WINDOWS_DSH_NODE_MODULES_FILTER/);

  const packageJson = JSON.parse(readFileSync(path.join(root, "apps/desktop-electron/package.json"), "utf8"));
  assert.equal(packageJson.scripts.typecheck, "tsc --noEmit");
  assert.equal(packageJson.scripts["test:security"], "node --test ../../scripts/check-electron-runtime-boundary.test.mjs");
  assert.equal(packageJson.scripts["stage:runtime"], "node ./scripts/stage-dsh-runtime.mjs");
  assert.equal(packageJson.dependencies["@deepseek-ai/dsh"], "0.1.5-rc.1");
  assert.equal(packageJson.optionalDependencies["@koromix/koffi-win32-x64"], "3.1.6");
  assert.equal(packageJson.dependencies["@officecli/officecli"], "1.0.149");
  assert.equal(packageJson.dependencies["@wxg-prc-cpg/browser-skill-dsh-plugin"], "0.2.1");
    assert.equal(packageJson.dependencies["@wxg-prc-cpg/dsh-weknora"], "0.1.0");
    assert.equal(packageJson.dependencies.zod, "4.4.3");
  assert.equal(packageJson.dependencies["js-yaml"], undefined);
});

test("packages the XG GOModel route without embedding its credential", () => {
  const profilePath = path.join(root, "profiles", "anyong.yml");
  const source = readFileSync(profilePath, "utf8");
  const entries = parseAnyongProfile(source);
  const defaultModel = entries.find((entry) => entry.id === "agent-default-model");
  const piAi = entries.find((entry) => entry.id === "llm-pi-ai");
  const route = piAi?.config?.providers?.["xg-gomodel"];

  assert.deepEqual(defaultModel?.config, {
    provider: "xg-gomodel",
    model: "vlm",
  });
  assert.equal(route?.apiKeyEnv, "XG_GOMODEL_API_KEY");
  assert.equal(route?.api, "openai-completions");
  assert.equal(route?.baseURL, "process.env.XG_MODEL_BASE_URL || 'http://192.168.1.47:9010/v1'");
  assert.deepEqual(route?.models?.map((model) => model.id), [
    "vlm",
    "deepseek-v4-flash",
    "qwen3.8-flash-next",
  ]);
  assert.deepEqual(route?.models?.[0]?.input, ["text"]);
  assert.doesNotMatch(source, /master_key\s*:/i);
});
