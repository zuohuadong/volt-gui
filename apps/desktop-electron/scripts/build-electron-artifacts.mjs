import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolvePnpmInvocation } from "./pnpm-invocation.mjs";
import { resolveElectronProfile } from "../src/electron-profile.ts";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = path.resolve(appDir, "..", "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8"));
const profile = resolveElectronProfile();
const version = String(process.env.DESKTOP_VERSION || packageJson.version).trim();
const outputDir = path.join(appDir, "dist-package");
const pnpm = resolvePnpmInvocation(process.env.npm_execpath);
const targets = ["nsis", "zip"];

function artifactNames(target) {
  if (target === "nsis") {
    const installer = `${profile.productName} Setup ${version}.exe`;
    return [installer, `${installer}.blockmap`];
  }
  return [`${profile.productName}-${version}-win.zip`];
}

function runTarget(target) {
  const targetOutput = path.join(appDir, `.electron-builder-${target}`);
  fs.rmSync(targetOutput, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.mkdirSync(targetOutput, { recursive: true });
  const result = spawnSync(
    pnpm.command,
    [
      ...pnpm.args,
      "--filter",
      "@voltui/desktop-electron",
      "exec",
      "electron-builder",
      "--config",
      "electron-builder.mjs",
      "--win",
      "--x64",
      "--publish",
      "never",
    ],
    {
      cwd: rootDir,
      stdio: "inherit",
      windowsHide: true,
      env: {
        ...process.env,
        ELECTRON_BUILDER_TARGET: target,
        ELECTRON_BUILDER_OUTPUT_DIR: path.relative(appDir, targetOutput),
      },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Electron Builder ${target} target failed with exit code ${result.status}`);

  for (const name of artifactNames(target)) {
    const source = path.join(targetOutput, name);
    if (!fs.existsSync(source)) throw new Error(`Electron Builder did not produce ${name}`);
    fs.copyFileSync(source, path.join(outputDir, name));
  }
  if (target === "zip") {
    const unpackedSource = path.join(targetOutput, "win-unpacked");
    const unpackedTarget = path.join(outputDir, "win-unpacked");
    if (!fs.existsSync(unpackedSource)) throw new Error("Electron Builder did not produce win-unpacked");
    fs.rmSync(unpackedTarget, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    fs.renameSync(unpackedSource, unpackedTarget);
  }
  fs.rmSync(targetOutput, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

fs.rmSync(outputDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
fs.mkdirSync(outputDir, { recursive: true });
for (const target of targets) runTarget(target);
console.log(`Built Windows x64 Electron artifacts sequentially for ${version}.`);
