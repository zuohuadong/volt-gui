#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { browserSkill } from "./third-party-browser-tools.mjs";
import { officeCli } from "./third-party-office-tools.mjs";
import { weknora } from "./third-party-weknora-tools.mjs";

const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const desktopPackageJson = JSON.parse(readFileSync(resolve(root, "apps", "desktop-electron", "package.json"), "utf8"));
const intranetAuthPackageJson = JSON.parse(readFileSync(resolve(root, "plugins", "dsh-intranet-auth", "package.json"), "utf8"));
const profileSource = readFileSync(resolve(root, "profiles", "anyong.yml"), "utf8");
const dshVersion = packageJson.dependencies?.["@deepseek-ai/dsh"];
if (dshVersion !== "0.1.5-rc.2") {
  throw new Error(`Volt requires the audited official DSH version 0.1.5-rc.2, got ${JSON.stringify(dshVersion)}`);
}

const disallowedPackages = [
  "dsh-workbench",
  "dsh-better-sidebar",
  "dsh-ide-sidebar",
  "dsh-conversation-navigator",
  "@tecfancy/dsh-dock-terminal",
];
const allDependencies = {
  ...packageJson.dependencies,
  ...packageJson.devDependencies,
  ...packageJson.optionalDependencies,
};
const installed = disallowedPackages.filter((name) => Object.hasOwn(allDependencies, name));
if (installed.length > 0) {
  throw new Error(`React/parallel DSH workbench packages are not allowed in Volt: ${installed.join(", ")}`);
}

if (browserSkill.packageName !== "@wxg-prc-cpg/browser-skill-dsh-plugin"
  || browserSkill.repository !== "https://github.com/Tencent/BrowserSkill") {
  throw new Error(`Unexpected BrowserSkill package name: ${browserSkill.packageName}`);
}
if (browserSkill.version !== "0.2.1" || browserSkill.license !== "MIT") {
  throw new Error("BrowserSkill must remain pinned to the audited MIT 0.2.1 release");
}
if (!browserSkill.integrity.startsWith("sha512-")) {
  throw new Error("BrowserSkill integrity must be recorded as an npm sha512 value");
}
if (officeCli.packageName !== "@officecli/officecli" || officeCli.version !== "1.0.149" || officeCli.license !== "Apache-2.0") {
  throw new Error("OfficeCLI must remain pinned to the audited Apache-2.0 1.0.149 release");
}
if (!officeCli.integrity.startsWith("sha512-") || !/^[a-f0-9]{64}$/i.test(officeCli.windowsX64Sha256)) {
  throw new Error("OfficeCLI integrity metadata is incomplete");
}
if (weknora.packageName !== "@wxg-prc-cpg/dsh-weknora"
  || weknora.repository !== "https://github.com/Tencent/WeKnora") {
  throw new Error(`Unexpected WeKnora package metadata: ${weknora.packageName}`);
}
if (weknora.version !== "0.1.0" || weknora.license !== "MIT") {
  throw new Error("WeKnora DSH plugin must remain pinned to the audited MIT 0.1.0 release");
}
if (!weknora.integrity.startsWith("sha512-")) {
  throw new Error("WeKnora integrity must be recorded as an npm sha512 value");
}
if (packageJson.dependencies?.[weknora.packageName] !== weknora.version
  || desktopPackageJson.dependencies?.[weknora.packageName] !== weknora.version) {
  throw new Error("WeKnora must be pinned to the same exact version in root and Electron manifests");
}
if (intranetAuthPackageJson.name !== "@voltui/dsh-intranet-auth"
  || intranetAuthPackageJson.version !== "0.1.0"
  || intranetAuthPackageJson.dsh?.bundle?.patch !== "./cordis.patch.yml") {
  throw new Error("内网认证 DSH Bundle manifest is invalid");
}
if (packageJson.dependencies?.[intranetAuthPackageJson.name] !== "file:plugins/dsh-intranet-auth"
  || desktopPackageJson.dependencies?.[intranetAuthPackageJson.name] !== "file:../../plugins/dsh-intranet-auth") {
  throw new Error("内网认证 DSH Bundle must be pinned to the repository plugin in root and Electron manifests");
}
for (const manifest of [packageJson, desktopPackageJson]) {
  if (manifest.dependencies?.zod !== "4.4.3") {
    throw new Error("Anyong integrations MCP runtime must pin zod 4.4.3");
  }
}
if (!profileSource.includes("id: weknora")
  || !profileSource.includes("WEKNORA_API_KEY")
  || !profileSource.includes("WEKNORA_BASE_URL")
  || !profileSource.includes("WEKNORA_ALLOWED_HOSTS")
  || !profileSource.includes("ANYONG_WEB_RETRIEVAL_ENABLED")
  || !profileSource.includes("id: mcp-github")
  || !profileSource.includes("id: mcp-cnb")
  || !profileSource.includes("id: mcp-sentry")
  || !profileSource.includes("id: mcp-feishu")
  || !profileSource.includes("id: mcp-document-import")) {
  throw new Error("Anyong profile must override WeKnora with environment-backed configuration");
}

console.log(
  `DSH plugin compatibility passed: official DSH is pinned, BrowserSkill ${browserSkill.version}, OfficeCLI ${officeCli.version}, WeKnora ${weknora.version}, intranet auth bundle ${intranetAuthPackageJson.version}, and optional integrations MCP are audited, and no parallel workbench package is installed.`,
);
