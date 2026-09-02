import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolvePnpmInvocation } from "./pnpm-invocation.mjs";
import { stageBrowserSkillCli } from "./stage-browser-skill-cli.mjs";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(appDir, ".dsh-runtime");
const nodeTargetDir = path.join(appDir, ".node-runtime");
const nodeTarget = path.join(nodeTargetDir, process.platform === "win32" ? "node.exe" : "node");
const pnpmEntrypoint = process.env.npm_execpath;

if (process.version !== "v26.8.1") throw new Error(`Node 26.8.1 is required to stage the desktop runtime; received ${process.version}`);
const pnpm = resolvePnpmInvocation(pnpmEntrypoint);

await stageBrowserSkillCli();

fs.rmSync(target, { recursive: true, force: true });
fs.rmSync(nodeTargetDir, { recursive: true, force: true });
fs.mkdirSync(nodeTargetDir, { recursive: true });
const nodeBytes = fs.readFileSync(process.execPath);
fs.writeFileSync(nodeTarget, nodeBytes, { mode: process.platform === "win32" ? undefined : 0o755 });
const sourceHash = createHash("sha256").update(nodeBytes).digest("hex");
const targetHash = createHash("sha256").update(fs.readFileSync(nodeTarget)).digest("hex");
if (targetHash !== sourceHash) throw new Error("staged Node runtime checksum mismatch");
const result = spawnSync(pnpm.command, [
  ...pnpm.args,
  "--config.node-linker=hoisted",
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
  "node_modules/@deepseek-ai/dsh-app-boot/package.json",
  "node_modules/@deepseek-ai/cordis-plugin-group/package.json",
  "node_modules/@officecli/officecli/officecli.js",
  `node_modules/@officecli/officecli/vendor/${process.platform === "win32" ? "officecli.exe" : "officecli"}`,
  "node_modules/@wxg-prc-cpg/browser-skill-dsh-plugin/package.json",
  "node_modules/js-yaml/package.json",
  "node_modules/node-pty/package.json",
  "node_modules/koffi/package.json",
];

if (process.platform === "win32") {
  const officeBinary = path.join(target, "node_modules", "@officecli", "officecli", "vendor", "officecli.exe");
  if (!fs.existsSync(officeBinary) || fs.statSync(officeBinary).size === 0) {
    const cacheRoot = process.env.CNB_OFFICECLI_CACHE || "C:\\data\\orange-ci\\tool-cache\\officecli\\1.0.146";
    const sourceCandidates = [
      path.resolve(appDir, "..", "..", "node_modules", "@officecli", "officecli", "vendor", "officecli.exe"),
      path.join(cacheRoot, "officecli.exe"),
    ];
    const expectedHash = "ad36ca99a50102d8f953e8ed1742fab65c9e201a29733601ea6ca9e676b2eed0";
    const sourceBinary = sourceCandidates.find((candidate) => {
      if (!fs.existsSync(candidate)) return false;
      return createHash("sha256").update(fs.readFileSync(candidate)).digest("hex") === expectedHash;
    });
    if (!sourceBinary) throw new Error("A verified OfficeCLI binary is unavailable for runtime staging");
    fs.mkdirSync(path.dirname(officeBinary), { recursive: true });
    fs.copyFileSync(sourceBinary, officeBinary);
  }
}

for (const relativePath of required) {
  if (!fs.existsSync(path.join(target, relativePath))) {
    throw new Error(`staged DSH runtime is incomplete: ${relativePath}`);
  }
}

const linkedEntries = [];
for (const entry of fs.globSync("node_modules/**/*", { cwd: target, withFileTypes: true })) {
  if (entry.isSymbolicLink()) linkedEntries.push(path.join(entry.parentPath, entry.name));
}
if (linkedEntries.length > 0) {
  throw new Error(`staged DSH runtime contains package links that installers cannot preserve:\n${linkedEntries.join("\n")}`);
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
