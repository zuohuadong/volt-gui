#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(scriptDir, "..");
const reactFrontendDir = resolve(desktopDir, "frontend");
const svelteFrontendDir = resolve(desktopDir, "frontend-svelte");

const selected = (process.argv[2] ?? process.env.VOLTUI_DESKTOP_FRONTEND ?? "react")
  .trim()
  .toLowerCase();

function run(label, args, cwd) {
  console.log(`[frontend] ${label}`);
  const result = spawnSync("pnpm", args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (selected === "react" || selected === "legacy") {
  run("building React shell for Wails embed", ["run", "build:react"], reactFrontendDir);
} else if (selected === "svelte" || selected === "workbench") {
  run("building Svelte workbench", ["--dir", svelteFrontendDir, "build"], desktopDir);
  run("syncing Svelte workbench into frontend/dist", ["run", "sync:svelte-dist"], reactFrontendDir);
} else {
  console.error(
    `Unsupported VOLTUI_DESKTOP_FRONTEND=${JSON.stringify(selected)}. Use "react" or "svelte".`,
  );
  process.exit(1);
}
