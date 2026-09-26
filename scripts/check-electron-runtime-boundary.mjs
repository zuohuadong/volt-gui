#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const boundaryFiles = {
  main: "apps/desktop-electron/src/main.ts",
  preload: "apps/desktop-electron/src/preload.ts",
  runtime: "apps/desktop-electron/src/official-dsh-runtime.ts",
  package: "apps/desktop-electron/package.json",
  builder: "apps/desktop-electron/electron-builder.mjs",
  native: "scripts/native-executable.mjs",
  client: "apps/desktop-frontend/src/lib/dsh-client.ts",
};

async function loadSources(root) {
  return Object.fromEntries(await Promise.all(
    Object.entries(boundaryFiles).map(async ([name, relativePath]) => [
      name,
      await readFile(path.join(root, relativePath), "utf8"),
    ]),
  ));
}

function requirePattern(findings, source, file, rule, pattern, message) {
  if (!pattern.test(source)) findings.push({ file, rule, message });
}

function forbidPattern(findings, source, file, rule, pattern, message) {
  if (pattern.test(source)) findings.push({ file, rule, message });
}

function extractQuotedMethods(block) {
  return [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

export function extractAllowedDshMethods(source) {
  const match = source.match(/const allowedDshMethods = new Set\(\[([\s\S]*?)\]\)/);
  return match ? extractQuotedMethods(match[1]) : [];
}

export function extractRendererDshMethods(source) {
  return [...source.matchAll(/this\.request\(\s*"([^"]+)"/g)].map((match) => match[1]);
}

export async function scanElectronRuntimeBoundary({ root = repositoryRoot } = {}) {
  const sources = await loadSources(root);
  const findings = [];

  for (const [rule, pattern, message] of [
    ["context-isolation", /contextIsolation:\s*true/, "Renderer must keep context isolation enabled."],
    ["node-integration", /nodeIntegration:\s*false/, "Renderer must keep Node integration disabled."],
    ["sandbox", /sandbox:\s*true/, "Renderer must run inside the Electron sandbox."],
    ["window-open", /setWindowOpenHandler\(\s*\([^)]*\)\s*=>\s*\{[\s\S]*?return\s*\{\s*action:\s*["']deny["']\s*\}\s*;?\s*\}\s*\)/, "New windows must be denied."],
    ["navigation-origin", /will-navigate[\s\S]*isAllowedNavigationUrl\(targetUrl/, "Local renderer navigation must stay on the trusted frontend or managed DSH origin."],
    ["ipc-sender-origin", /assertTrustedIpcSender[\s\S]*isTrustedIpcSenderUrl/, "Every privileged IPC handler must verify its renderer sender."],
    ["permission-check", /setPermissionCheckHandler\(\(\)\s*=>\s*false\)/, "Browser permission checks must fail closed."],
    ["permission-request", /setPermissionRequestHandler[\s\S]*callback\(false\)/, "Browser permission requests must fail closed."],
  ]) {
    requirePattern(findings, sources.main, boundaryFiles.main, rule, pattern, message);
  }

  for (const [rule, pattern, message] of [
    ["ipc-method-allowlist", /allowedDshMethods\.has\(method\)/, "DSH IPC calls must be limited to an explicit method allowlist."],
    ["preload-context-bridge", /contextBridge\.exposeInMainWorld\(["']voltDesktop["']/, "Renderer APIs must be exposed through contextBridge."],
    ["preload-dsh-request", /desktop:dsh-request/, "Preload must proxy DSH requests through the isolated main process."],
  ]) {
    requirePattern(findings, rule === "preload-context-bridge" || rule === "preload-dsh-request" ? sources.preload : sources.main, rule === "preload-context-bridge" || rule === "preload-dsh-request" ? boundaryFiles.preload : boundaryFiles.main, rule, pattern, message);
  }

  for (const [rule, pattern, message] of [
    ["local-harness-import", /["']@dsh\//, "Electron must not import the retired in-repository Harness."],
    ["renderer-bundle", /workbench\.html|dist\/renderer/, "Electron must not package the retired renderer bundle."],
    ["remote-content", /loadURL\((?!dshUrl)/, "Electron may only load the URL published by its managed DSH process."],
    ["electron-node-child", /ELECTRON_RUN_AS_NODE/, "Electron must not substitute its embedded Node version for the staged Node 26 runtime."],
  ]) {
    forbidPattern(findings, sources.main, boundaryFiles.main, rule, pattern, message);
  }

  for (const [rule, pattern, message] of [
    ["loopback-url", /127\\\.0\\\.0\\\.1:\\d\+/, "DSH startup output must be restricted to IPv4 loopback."],
    ["loopback-host", /["']--host["'],\s*["']127\.0\.0\.1["']/, "DSH must bind to 127.0.0.1."],
    ["ephemeral-port", /["']--port["'],\s*["']0["']/, "DSH must request an ephemeral port."],
    ["no-browser", /["']--no-open["']/, "DSH must not open an unmanaged browser window."],
    ["staged-runtime", /dsh-runtime["'],\s*["']node_modules["']/, "Packaged DSH must resolve from the staged runtime resources."],
  ]) {
    requirePattern(findings, sources.runtime, boundaryFiles.runtime, rule, pattern, message);
  }

  const packageJson = JSON.parse(sources.package);
  if (packageJson.dependencies?.["@deepseek-ai/dsh"] !== "0.1.5-rc.2") {
    findings.push({
      file: boundaryFiles.package,
      rule: "official-dsh-version",
      message: "Electron must exactly pin the approved latest official DSH version.",
    });
  }
  if (Object.keys(packageJson.dependencies ?? {}).some((name) => name.startsWith("@dsh/"))) {
    findings.push({
      file: boundaryFiles.package,
      rule: "local-harness-dependency",
      message: "Electron must not depend on retired local @dsh packages.",
    });
  }

  requirePattern(
    findings,
    sources.main,
    boundaryFiles.main,
    "node26-child",
    /executable:\s*nodeRuntimePath\(\)/,
    "The managed DSH child must use the staged Node 26 runtime.",
  );
  requirePattern(
    findings,
    sources.builder,
    boundaryFiles.builder,
    "staged-runtime-graph",
    /beforeBuild:\s*\(\)\s*=>\s*false[\s\S]*\.dsh-runtime\/node_modules[\s\S]*dsh-runtime\/node_modules[\s\S]*\.node-runtime[\s\S]*node-runtime/,
    "electron-builder must package the complete pnpm-deployed DSH graph and staged Node runtime as external resources.",
  );
  requirePattern(
    findings,
    sources.builder,
    boundaryFiles.builder,
    "windows-x64-pe",
    /assertWindowsX64PeExecutable/,
    "Windows packaging must fail closed unless native extras are Windows x64 PE images.",
  );
  requirePattern(
    findings,
    sources.native,
    boundaryFiles.native,
    "windows-koffi-native",
    /koffi-win32-x64/,
    "Windows packaging must include the official Windows x64 Koffi native addon.",
  );
  requirePattern(
    findings,
    sources.native,
    boundaryFiles.native,
    "windows-conpty-native",
    /OpenConsole\.exe/,
    "Windows packaging must include the official Windows x64 ConPTY OpenConsole executable.",
  );
  requirePattern(
    findings,
    sources.builder,
    boundaryFiles.builder,
    "windows-koffi-copy",
    /ensureWindowsKoffiPackage/,
    "Windows packaging must copy missing Windows x64 Koffi before PE inspect.",
  );
  requirePattern(
    findings,
    sources.builder,
    boundaryFiles.builder,
    "windows-node-pty-copy",
    /ensureWindowsNodePtyPrebuild/,
    "Windows packaging must copy missing Windows x64 node-pty ConPTY files before PE inspect.",
  );
  requirePattern(
    findings,
    sources.builder,
    boundaryFiles.builder,
    "windows-native-filter",
    /WINDOWS_DSH_NODE_MODULES_FILTER/,
    "Windows packaging must omit foreign-arch natives and PDB files from extraResources.",
  );
  forbidPattern(
    findings,
    sources.builder,
    boundaryFiles.builder,
    "retired-renderer-package",
    /workbench\.html|dist\/renderer/,
    "electron-builder must not package retired renderer assets.",
  );

  const allowedMethods = new Set(extractAllowedDshMethods(sources.main));
  if (allowedMethods.size === 0) {
    findings.push({
      file: boundaryFiles.main,
      rule: "ipc-method-allowlist-parse",
      message: "Electron DSH method allowlist must be parseable.",
    });
  }
  const rendererMethods = [...new Set(extractRendererDshMethods(sources.client))];
  const missingRendererMethods = rendererMethods.filter((method) => !allowedMethods.has(method));
  if (missingRendererMethods.length > 0) {
    findings.push({
      file: boundaryFiles.client,
      rule: "ipc-client-allowlist",
      message: `Renderer DSH methods must be in the Electron allowlist: ${missingRendererMethods.join(", ")}.`,
    });
  }
  const extraAllowlistMethods = [...allowedMethods].filter((method) => !rendererMethods.includes(method));
  if (extraAllowlistMethods.length > 0) {
    findings.push({
      file: boundaryFiles.main,
      rule: "ipc-allowlist-unused",
      message: `Electron DSH allowlist must not include unused methods: ${extraAllowlistMethods.join(", ")}.`,
    });
  }

  requirePattern(
    findings,
    sources.main,
    boundaryFiles.main,
    "desktop-error-import",
    /from "\.\/desktop-error\.ts"/,
    "IPC-facing Electron errors must use stable desktop error codes.",
  );
  requirePattern(
    findings,
    sources.main,
    boundaryFiles.main,
    "desktop-error-throw",
    /throw desktopError\(DesktopErrorCode\./,
    "Trusted IPC failures must throw stable desktop error codes.",
  );
  requirePattern(
    findings,
    sources.runtime,
    boundaryFiles.runtime,
    "desktop-error-runtime",
    /from "\.\/desktop-error\.ts"/,
    "Official DSH runtime failures must use stable desktop error codes.",
  );

  return findings;
}

async function main() {
  const findings = await scanElectronRuntimeBoundary();
  if (findings.length === 0) {
    console.log("Electron runtime boundary check passed.");
    return;
  }
  for (const finding of findings) {
    console.error(`${finding.file}: ${finding.message} [${finding.rule}]`);
  }
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
