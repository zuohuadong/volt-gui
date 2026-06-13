#!/usr/bin/env node
import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(scriptDir, "..");
const sourceDir = resolve(desktopDir, "frontend-svelte", "dist");
const targetDir = resolve(desktopDir, "frontend", "dist");

async function assertBuiltWorkbench() {
  const indexPath = resolve(sourceDir, "index.html");
  const info = await stat(indexPath).catch(() => undefined);
  if (!info?.isFile()) {
    throw new Error(
      `Svelte workbench dist is missing ${indexPath}. Run pnpm --dir desktop/frontend-svelte build first.`,
    );
  }
}

async function cleanTarget() {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(targetDir, { withFileTypes: true });
  await Promise.all(
    entries.map((entry) => rm(resolve(targetDir, entry.name), { recursive: true, force: true })),
  );
}

await assertBuiltWorkbench();
await cleanTarget();
await cp(sourceDir, targetDir, { recursive: true });
await writeFile(resolve(targetDir, ".gitkeep"), "\n");

console.log(`[frontend] synced ${sourceDir} -> ${targetDir}`);
