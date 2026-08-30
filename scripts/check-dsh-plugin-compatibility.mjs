#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

console.log("DSH plugin compatibility passed: official DSH is pinned and no parallel workbench package is installed.");
