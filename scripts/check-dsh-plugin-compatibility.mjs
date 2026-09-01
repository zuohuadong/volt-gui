#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { browserSkill } from "./third-party-browser-tools.mjs";

const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const dshVersion = packageJson.dependencies?.["@deepseek-ai/dsh"];
if (dshVersion !== "0.1.1-rc.2") {
  throw new Error(`Volt requires the audited official DSH version 0.1.1-rc.2, got ${JSON.stringify(dshVersion)}`);
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
if (browserSkill.version !== "0.1.2" || browserSkill.license !== "MIT") {
  throw new Error("BrowserSkill must remain pinned to the audited MIT 0.1.2 release");
}
if (!browserSkill.integrity.startsWith("sha512-")) {
  throw new Error("BrowserSkill integrity must be recorded as an npm sha512 value");
}

console.log(
  `DSH plugin compatibility passed: official DSH is pinned, BrowserSkill ${browserSkill.version} is audited, and no parallel workbench package is installed.`,
);
