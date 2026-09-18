#!/usr/bin/env node

import { existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const officeCli = Object.freeze({
  packageName: "@officecli/officecli",
  version: "1.0.149",
  license: "Apache-2.0",
  integrity: "sha512-NddDky2Kb/xsrmYVP0Qgpxfu4DOTiiPXp5my/Pvf+z1ddpF4/RAkeBKyGjPdZP0XvRv8bSjxR4bFre7QtZDP2w==",
  repository: "https://github.com/iOfficeAI/OfficeCLI",
  windowsX64Sha256: "abd82dae417b66aae62d1ec8edbf88ba9d5be7442b55be470b34b764f10731e2",
  role: "officecli-mcp-server",
});

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function resolveOfficeCliEntry(fromPackageRoot = path.join(repositoryRoot, "apps", "desktop-electron")) {
  const require = createRequire(path.join(fromPackageRoot, "package.json"));
  return path.resolve(path.dirname(require.resolve("@officecli/officecli")), "..", "officecli.js");
}

export function officeCliEntryFromEnvironment(environment = {}) {
  const raw = environment?.ANYONG_OFFICECLI_ARGS_JSON;
  if (!raw) return undefined;
  try {
    const args = JSON.parse(raw);
    return typeof args?.[0] === "string" && args[0].trim() ? args[0] : undefined;
  } catch {
    return undefined;
  }
}

export async function ensureOfficeCliBinary(entryPath = resolveOfficeCliEntry()) {
  if (!entryPath || !existsSync(entryPath)) return null;
  const installerFile = path.join(path.dirname(entryPath), "lib", "install-binary.js");
  if (!existsSync(installerFile)) return null;
  const installer = createRequire(entryPath)("./lib/install-binary.js");
  const dest = installer.binaryPath();
  if (existsSync(dest) && statSync(dest).size > 0) return dest;
  return installer.ensureBinary();
}
