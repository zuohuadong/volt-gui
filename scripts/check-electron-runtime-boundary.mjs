#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const boundaryFiles = {
  main: "apps/desktop-electron/src/main.ts",
  runtime: "apps/desktop-electron/src/official-dsh-runtime.ts",
  package: "apps/desktop-electron/package.json",
  builder: "apps/desktop-electron/electron-builder.mjs",
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

export async function scanElectronRuntimeBoundary({ root = repositoryRoot } = {}) {
  const sources = await loadSources(root);
  const findings = [];

  for (const [rule, pattern, message] of [
    ["context-isolation", /contextIsolation:\s*true/, "Renderer must keep context isolation enabled."],
    ["node-integration", /nodeIntegration:\s*false/, "Renderer must keep Node integration disabled."],
    ["sandbox", /sandbox:\s*true/, "Renderer must run inside the Electron sandbox."],
    ["window-open", /setWindowOpenHandler\(\(\)\s*=>\s*\(\{\s*action:\s*["']deny["']\s*\}\)\)/, "New windows must be denied."],
    ["navigation-origin", /will-navigate[\s\S]*origin\s*!==\s*trustedOrigin/, "Navigation must stay on the launched DSH loopback origin."],
    ["permission-check", /setPermissionCheckHandler\(\(\)\s*=>\s*false\)/, "Browser permission checks must fail closed."],
    ["permission-request", /setPermissionRequestHandler[\s\S]*callback\(false\)/, "Browser permission requests must fail closed."],
  ]) {
    requirePattern(findings, sources.main, boundaryFiles.main, rule, pattern, message);
  }

  for (const [rule, pattern, message] of [
    ["local-harness-import", /["']@dsh\//, "Electron must not import the retired in-repository Harness."],
    ["renderer-bundle", /desktop-frontend|workbench\.html|preload\.(?:ts|cjs)/, "Electron must not package or load the retired renderer/preload bridge."],
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
  if (packageJson.dependencies?.["@deepseek-ai/dsh"] !== "0.1.1-rc.2") {
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
  forbidPattern(
    findings,
    sources.builder,
    boundaryFiles.builder,
    "retired-renderer-package",
    /desktop-frontend|preload\.cjs|workbench\.html|dist\/renderer/,
    "electron-builder must not package retired renderer assets.",
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
