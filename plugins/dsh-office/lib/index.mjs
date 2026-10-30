import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as office from "@deepseek-ai/dsh-skill-office";
import * as filesystem from "@deepseek-ai/dsh-skill-filesystem";

export const name = "anyong-office";
export const inject = ["skills"];

// Office conversion is optional in the desktop package. Keep the official
// skills and OfficeCLI MCP, but do not bundle a second office suite: users can
// open documents with their installed Office/WPS, or the official skill can
// offer the LibreOffice sidecar download after explicit consent.
function enginePackageName() {
  if (process.platform === "darwin" || process.platform === "win32") {
    return `@deepseek-ai/libreoffice-kit-${process.platform}-${process.arch}`;
  }
  return process.platform === "linux" ? "@deepseek-ai/libreoffice-kit-wasm" : "";
}

export function resolveLibreOfficeCli() {
  try {
    const kitPackage = fileURLToPath(import.meta.resolve("@deepseek-ai/libreoffice-kit/package.json"));
    const kitRoot = dirname(kitPackage);
    const cli = join(kitRoot, "lib", "cli.js");
    if (!existsSync(cli)) return false;
    // The adapter package is small, but its platform engine is ~190MB. The
    // desktop package prunes the engine; only advertise the CLI when both the
    // adapter and its matching native/wasm engine are installed.
    const engine = enginePackageName();
    if (!engine) return false;
    createRequire(kitPackage).resolve(`${engine}/package.json`);
    return cli;
  } catch {
    return false;
  }
}

export async function apply(ctx) {
  const officeRoot = dirname(fileURLToPath(import.meta.resolve("@deepseek-ai/dsh-skill-office/package.json")));
  await ctx.plugin(office, {
    assetRoot: join(officeRoot, "assets"),
    node: process.execPath,
    cli: resolveLibreOfficeCli(),
  });
  await ctx.plugin(filesystem, {
    providerName: "anyong-office-workflows",
    includeDefaultRoots: false,
    bundledSkillDir: fileURLToPath(new URL("../skills/", import.meta.url)),
    watch: false,
  });
}
