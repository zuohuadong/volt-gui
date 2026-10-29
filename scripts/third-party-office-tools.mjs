#!/usr/bin/env node

import { existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const officeCli = Object.freeze({
  packageName: "@officecli/officecli",
  version: "1.0.159",
  license: "Apache-2.0",
  integrity: "sha512-k6S2PbPRVNwcRKaKpRwAcqPqzjZsqI2iOylW2foGAviQYP8GCbHnsylduTM+pL57uZGs5f+EKpLqecrODIxpCw==",
  repository: "https://github.com/iOfficeAI/OfficeCLI",
  windowsX64Sha256: "572c0a4da35333cf866fa5a2fb8259a4a2a8c9922be031d6b7a86936282ef94e",
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
