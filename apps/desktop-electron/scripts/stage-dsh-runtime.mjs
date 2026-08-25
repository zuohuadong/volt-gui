import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(appDir, ".dsh-runtime");
const nodeTargetDir = path.join(appDir, ".node-runtime");
const nodeTarget = path.join(nodeTargetDir, process.platform === "win32" ? "node.exe" : "node");
const pnpmEntrypoint = process.env.npm_execpath;

if (!pnpmEntrypoint) throw new Error("stage:runtime must be launched through pnpm");
if (process.version !== "v26.7.0") throw new Error(`Node 26.7.0 is required to stage the desktop runtime; received ${process.version}`);

fs.rmSync(target, { recursive: true, force: true });
fs.rmSync(nodeTargetDir, { recursive: true, force: true });
fs.mkdirSync(nodeTargetDir, { recursive: true });
const nodeBytes = fs.readFileSync(process.execPath);
fs.writeFileSync(nodeTarget, nodeBytes, { mode: process.platform === "win32" ? undefined : 0o755 });
const sourceHash = createHash("sha256").update(nodeBytes).digest("hex");
const targetHash = createHash("sha256").update(fs.readFileSync(nodeTarget)).digest("hex");
if (targetHash !== sourceHash) throw new Error("staged Node runtime checksum mismatch");
const result = spawnSync(process.execPath, [
  pnpmEntrypoint,
  "--filter",
  "@voltui/desktop-electron",
  "deploy",
  "--prod",
  target,
], {
  cwd: appDir,
  stdio: "inherit",
  env: { ...process.env, CI: process.env.CI || "true" },
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const required = [
  "node_modules/@deepseek-ai/dsh/lib/bin.js",
  "node_modules/.pnpm/node_modules/@deepseek-ai/cordis-plugin-group/package.json",
  "node_modules/.pnpm/node_modules/js-yaml/package.json",
  "node_modules/.pnpm/node_modules/node-pty/package.json",
  "node_modules/.pnpm/node_modules/koffi/package.json",
];
for (const relativePath of required) {
  if (!fs.existsSync(path.join(target, relativePath))) {
    throw new Error(`staged DSH runtime is incomplete: ${relativePath}`);
  }
}

const version = spawnSync(process.execPath, [path.join(target, required[0]), "--version"], {
  cwd: appDir,
  encoding: "utf8",
  env: process.env,
});
if (version.error) throw version.error;
if (version.status !== 0 || version.stdout.trim() !== "0.1.1-rc.2") {
  throw new Error(`staged DSH runtime version check failed: ${version.stdout}${version.stderr}`);
}

console.log(`Staged Node ${process.version} with official DSH ${version.stdout.trim()}.`);
