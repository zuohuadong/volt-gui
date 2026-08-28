#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageOutput = path.join(root, "apps", "desktop-electron", "dist-package");
const expectedNodeVersion = "v26.7.0";
const expectedDshVersion = "0.1.1-rc.2";
const startupTimeoutMs = 180_000;
const startupPattern = /^dsh web:\s+(http:\/\/127\.0\.0\.1:\d+\/?$)/;
const requiredRuntimeFiles = [
  "dsh-runtime/node_modules/@deepseek-ai/dsh/lib/bin.js",
  "dsh-runtime/node_modules/@deepseek-ai/dsh-app-boot/package.json",
  "dsh-runtime/node_modules/@deepseek-ai/cordis-plugin-group/package.json",
  "dsh-runtime/node_modules/js-yaml/package.json",
  "dsh-runtime/node_modules/node-pty/package.json",
  "dsh-runtime/node_modules/koffi/package.json",
  "profiles/anyong.yml",
];

function resolveMacResources(outputDir) {
  for (const directory of readdirSync(outputDir, { withFileTypes: true })) {
    if (!directory.isDirectory() || !directory.name.startsWith("mac")) continue;
    const applicationRoot = path.join(outputDir, directory.name);
    for (const entry of readdirSync(applicationRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.endsWith(".app")) {
        return path.join(applicationRoot, entry.name, "Contents", "Resources");
      }
    }
  }
  return "";
}

export function resolvePackagedResources(outputDir = packageOutput, platform = process.platform) {
  if (platform === "win32") return path.join(outputDir, "win-unpacked", "resources");
  if (platform === "linux") return path.join(outputDir, "linux-unpacked", "resources");
  const macResources = platform === "darwin" ? resolveMacResources(outputDir) : "";
  if (macResources) return macResources;
  throw new Error(`unsupported packaged runtime layout: platform=${platform} output=${outputDir}`);
}

export function inspectPackagedResources(resourcesDir, platform = process.platform) {
  const nodeExecutable = path.join(resourcesDir, "node-runtime", platform === "win32" ? "node.exe" : "node");
  const missing = [nodeExecutable, ...requiredRuntimeFiles.map((file) => path.join(resourcesDir, file))]
    .filter((file) => !existsSync(file));
  if (missing.length > 0) {
    throw new Error(`packaged DSH runtime is incomplete:\n${missing.map((file) => `- ${file}`).join("\n")}`);
  }

  const linkedRuntimeFiles = requiredRuntimeFiles
    .filter((file) => file.startsWith("dsh-runtime/node_modules/"))
    .map((file) => path.join(resourcesDir, file))
    .filter((file) => lstatSync(file).isSymbolicLink());
  if (linkedRuntimeFiles.length > 0) {
    throw new Error(`packaged DSH runtime contains links that installers cannot preserve:\n${linkedRuntimeFiles.map((file) => `- ${file}`).join("\n")}`);
  }

  const duplicateDsh = path.join(resourcesDir, "app.asar.unpacked", "node_modules", "@deepseek-ai", "dsh");
  if (existsSync(duplicateDsh)) {
    throw new Error(`retired duplicate DSH runtime was packaged: ${duplicateDsh}`);
  }

  return {
    nodeExecutable,
    dshBin: path.join(resourcesDir, requiredRuntimeFiles[0]),
    patchFile: path.join(resourcesDir, "profiles", "anyong.yml"),
  };
}

function waitForExit(child, timeoutMs = 5_000) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

function waitForRuntimeUrl(child, timeoutMs = startupTimeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      fail(new Error(`packaged DSH did not publish a loopback URL within ${timeoutMs}ms`));
    }, timeoutMs);

    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };
    const publish = (line) => {
      const match = line.trim().match(startupPattern);
      if (!match || settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(match[1]);
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", createLineConsumer(publish));
    child.stderr.on("data", createLineConsumer(publish));
    child.once("error", fail);
    child.once("exit", (code, signal) => {
      fail(new Error(`packaged DSH exited before startup: code=${code} signal=${signal}`));
    });
  });
}

function createLineConsumer(consumeLine) {
  let pendingText = "";
  return (chunk) => {
    const lines = `${pendingText}${chunk}`.split(/\r?\n/);
    pendingText = lines.pop() ?? "";
    for (const line of lines) consumeLine(line);
  };
}

function readProcessOutput(executable, args, timeoutMs = startupTimeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error, output) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(output);
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`process timed out after ${timeoutMs}ms: ${executable}`));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => finish(error));
    child.once("exit", (code) => {
      if (code === 0) finish(null, stdout.trim());
      else finish(new Error(`process exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

function verifyVersion(name, actual, expected) {
  if (actual !== expected) {
    throw new Error(`packaged ${name} version mismatch: expected ${expected}, received ${actual}`);
  }
}

async function verifyPackagedVersions(runtime) {
  const nodeVersion = await readProcessOutput(runtime.nodeExecutable, ["--version"]);
  verifyVersion("Node", nodeVersion, expectedNodeVersion);
  const dshVersion = await readProcessOutput(runtime.nodeExecutable, [runtime.dshBin, "--version"]);
  verifyVersion("DSH", dshVersion, expectedDshVersion);
  return { nodeVersion, dshVersion };
}

function startPackagedDsh(runtime, temporaryRoot) {
  return spawn(runtime.nodeExecutable, [
    "--expose-internals", runtime.dshBin, "web",
    "--patch", runtime.patchFile,
    "--host", "127.0.0.1", "--port", "0", "--no-open",
  ], {
    cwd: temporaryRoot,
    env: { ...process.env, DSH_HOME: path.join(temporaryRoot, "home") },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

async function verifyDshWeb(child) {
  const runtimeUrl = await waitForRuntimeUrl(child);
  const response = await fetch(runtimeUrl, { signal: AbortSignal.timeout(30_000) });
  if (response.status !== 200) throw new Error(`packaged DSH Web returned HTTP ${response.status}`);
  await response.body?.cancel();
  return new URL(runtimeUrl).origin;
}

export async function smokePackagedDshRuntime(resourcesDir, platform = process.platform) {
  const runtime = inspectPackagedResources(resourcesDir, platform);
  const versions = await verifyPackagedVersions(runtime);
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "voltui-packaged-dsh-"));
  const child = startPackagedDsh(runtime, temporaryRoot);

  try {
    const origin = await verifyDshWeb(child);
    console.log(`Packaged ${versions.nodeVersion}, official DSH ${versions.dshVersion}, and Web passed at ${origin}.`);
  } finally {
    await waitForExit(child);
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

async function main() {
  const resourcesDir = path.resolve(process.argv[2] || resolvePackagedResources());
  await smokePackagedDshRuntime(resourcesDir);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  await main();
}
