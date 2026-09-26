import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolvePnpmInvocation } from "./pnpm-invocation.mjs";
import { stageBrowserSkillCli } from "./stage-browser-skill-cli.mjs";
import { assertWindowsX64PeExecutable, ensureWindowsKoffiPackage, ensureWindowsNodePtyPrebuild } from "../../../scripts/native-executable.mjs";
import { ensureOfficeCliBinary, officeCli } from "../../../scripts/third-party-office-tools.mjs";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(appDir, ".dsh-runtime");
const nodeTargetDir = path.join(appDir, ".node-runtime");
const nodeTarget = path.join(nodeTargetDir, process.platform === "win32" ? "node.exe" : "node");
const pnpmEntrypoint = process.env.npm_execpath;

if (process.version !== "v26.8.1") throw new Error(`Node 26.8.1 is required to stage the desktop runtime; received ${process.version}`);
const pnpm = resolvePnpmInvocation(pnpmEntrypoint);

await stageBrowserSkillCli();

fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
fs.rmSync(nodeTargetDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
fs.mkdirSync(nodeTargetDir, { recursive: true });
const nodeBytes = fs.readFileSync(process.execPath);
fs.writeFileSync(nodeTarget, nodeBytes, { mode: process.platform === "win32" ? undefined : 0o755 });
const sourceHash = createHash("sha256").update(nodeBytes).digest("hex");
const targetHash = createHash("sha256").update(fs.readFileSync(nodeTarget)).digest("hex");
if (targetHash !== sourceHash) throw new Error("staged Node runtime checksum mismatch");
if (process.platform === "win32") assertWindowsX64PeExecutable(nodeTarget, "staged Node");
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

const integrationsScriptTarget = path.join(target, "scripts", "anyong-integrations-mcp.mjs");
fs.mkdirSync(path.dirname(integrationsScriptTarget), { recursive: true });
fs.copyFileSync(path.resolve(appDir, "..", "..", "scripts", "anyong-integrations-mcp.mjs"), integrationsScriptTarget);

const required = [
  "node_modules/@deepseek-ai/dsh/lib/bin.js",
  "node_modules/@deepseek-ai/dsh-app-boot/package.json",
  "node_modules/@deepseek-ai/cordis-plugin-group/package.json",
  "node_modules/@officecli/officecli/officecli.js",
  `node_modules/@officecli/officecli/vendor/${process.platform === "win32" ? "officecli.exe" : "officecli"}`,
  "node_modules/@wxg-prc-cpg/browser-skill-dsh-plugin/package.json",
  "node_modules/@wxg-prc-cpg/dsh-weknora/package.json",
  "node_modules/@voltui/dsh-intranet-auth/package.json",
  "node_modules/zod/package.json",
  "scripts/anyong-integrations-mcp.mjs",
  "node_modules/js-yaml/package.json",
  "node_modules/node-pty/package.json",
  "node_modules/koffi/package.json",
];

const officeBinaryName = process.platform === "win32" ? "officecli.exe" : "officecli";
const officeBinary = path.join(target, "node_modules", "@officecli", "officecli", "vendor", officeBinaryName);
const stagedOfficeEntry = path.join(target, "node_modules", "@officecli", "officecli", "officecli.js");
if (!fs.existsSync(officeBinary) || fs.statSync(officeBinary).size === 0) {
  await ensureOfficeCliBinary(fs.existsSync(stagedOfficeEntry) ? stagedOfficeEntry : undefined);
}
if (!fs.existsSync(officeBinary) || fs.statSync(officeBinary).size === 0) {
  const workspaceBinary = await ensureOfficeCliBinary();
  const cacheRoot = process.env.CNB_OFFICECLI_CACHE || (process.platform === "win32"
    ? path.join("C:\\data\\orange-ci\\tool-cache\\officecli", officeCli.version)
    : "");
  const sourceCandidates = [
    workspaceBinary,
    path.resolve(appDir, "..", "..", "node_modules", "@officecli", "officecli", "vendor", officeBinaryName),
    cacheRoot ? path.join(cacheRoot, officeBinaryName) : "",
  ].filter(Boolean);
  const sourceBinary = sourceCandidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).size > 0);
  if (!sourceBinary) throw new Error("A verified OfficeCLI binary is unavailable for runtime staging");
  fs.mkdirSync(path.dirname(officeBinary), { recursive: true });
  fs.copyFileSync(sourceBinary, officeBinary);
}
if (process.platform === "win32") {
  assertWindowsX64PeExecutable(officeBinary, "staged OfficeCLI");
  if (createHash("sha256").update(fs.readFileSync(officeBinary)).digest("hex") !== officeCli.windowsX64Sha256) {
    throw new Error(`Staged OfficeCLI ${officeCli.version} binary checksum mismatch`);
  }
}

for (const relativePath of required) {
  if (!fs.existsSync(path.join(target, relativePath))) {
    throw new Error(`staged DSH runtime is incomplete: ${relativePath}`);
  }
}
if (process.platform === "win32") {
  const nativeSearchRoots = [
    appDir,
    path.resolve(appDir, "..", ".."),
  ];
  ensureWindowsNodePtyPrebuild(target, nativeSearchRoots, "staged node-pty");
  ensureWindowsKoffiPackage(target, nativeSearchRoots, "staged Koffi");
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
if (version.status !== 0 || version.stdout.trim() !== "0.1.5-rc.2") {
  throw new Error(`staged DSH runtime version check failed: ${version.stdout}${version.stderr}`);
}

console.log(`Staged Node ${process.version} with official DSH ${version.stdout.trim()}.`);
