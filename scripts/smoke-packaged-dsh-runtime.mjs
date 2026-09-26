#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundledDshModelEnvironment, OfficialDshRuntime, provisionBundledDshCredential, STARTUP_TIMEOUT_MS, startOfficialDshWithRetry } from "../apps/desktop-electron/src/official-dsh-runtime.ts";
import { DshRemoteClient } from "../apps/desktop-electron/src/dsh-remote-client.ts";
import { resolveElectronProfile } from "../apps/desktop-electron/src/electron-profile.ts";
import { assertWindowsX64PeExecutable, assertWindowsPackagedRuntimeNatives, windowsRuntimeNativeBinaries } from "./native-executable.mjs";


const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktopRequire = createRequire(path.join(root, "apps", "desktop-electron", "package.json"));
const electronBuilderRequire = createRequire(desktopRequire.resolve("electron-builder/package.json"));
const { listPackage } = electronBuilderRequire("@electron/asar");
const packageOutput = path.join(root, "apps", "desktop-electron", "dist-package");
const expectedNodeVersion = "v26.8.1";
const expectedDshVersion = "0.1.5-rc.2";
const startupTimeoutMs = STARTUP_TIMEOUT_MS;
const requiredRuntimeFiles = [
  "dsh-runtime/node_modules/@deepseek-ai/dsh/lib/bin.js",
  "dsh-runtime/node_modules/@deepseek-ai/dsh-app-boot/package.json",
  "dsh-runtime/node_modules/@deepseek-ai/cordis-plugin-group/package.json",
  "dsh-runtime/node_modules/js-yaml/package.json",
  "dsh-runtime/node_modules/node-pty/package.json",
  "dsh-runtime/node_modules/koffi/package.json",
  "profiles/anyong.yml",
  "dsh-runtime/node_modules/@officecli/officecli/officecli.js",
  "dsh-runtime/node_modules/@wxg-prc-cpg/browser-skill-dsh-plugin/package.json",
  "dsh-runtime/node_modules/@wxg-prc-cpg/dsh-weknora/package.json",
  "dsh-runtime/node_modules/@voltui/dsh-intranet-auth/package.json",
  "dsh-runtime/node_modules/zod/package.json",
  "dsh-runtime/scripts/anyong-integrations-mcp.mjs",
];

function requiredRuntimeFilesForPlatform(platform) {
  const officeBinary = platform === "win32" ? "officecli.exe" : "officecli";
  const bskBinary = platform === "win32" ? "bsk.exe" : "bsk";
  const files = [
    ...requiredRuntimeFiles,
    `dsh-runtime/node_modules/@officecli/officecli/vendor/${officeBinary}`,
    `browser-skill-runtime/${bskBinary}`,
  ];
  if (platform === "win32") {
    files.push("dsh-runtime/node_modules/node-pty/prebuilds/win32-x64/conpty.node");
    files.push("dsh-runtime/node_modules/node-pty/prebuilds/win32-x64/conpty_console_list.node");
    files.push("dsh-runtime/node_modules/node-pty/prebuilds/win32-x64/conpty/conpty.dll");
    files.push("dsh-runtime/node_modules/node-pty/prebuilds/win32-x64/conpty/OpenConsole.exe");
    files.push("dsh-runtime/node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node");
  }
  return files;
}

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
  const platformFiles = requiredRuntimeFilesForPlatform(platform);
  const missing = [nodeExecutable, ...platformFiles.map((file) => path.join(resourcesDir, file))]
    .filter((file) => !existsSync(file));
  if (missing.length > 0) {
    throw new Error(`packaged DSH runtime is incomplete:\n${missing.map((file) => `- ${file}`).join("\n")}`);
  }

  const linkedRuntimeFiles = platformFiles
    .filter((file) => file.startsWith("dsh-runtime/node_modules/"))
    .map((file) => path.join(resourcesDir, file))
    .filter((file) => lstatSync(file).isSymbolicLink());
  if (linkedRuntimeFiles.length > 0) {
    throw new Error(`packaged DSH runtime contains links that installers cannot preserve:\n${linkedRuntimeFiles.map((file) => `- ${file}`).join("\n")}`);
  }

  if (platform === "win32") {
    const layout = packagedRuntimeLayout(resourcesDir, platform);
    assertWindowsX64PeExecutable(layout.nodeExecutable, "packaged Node");
    assertWindowsX64PeExecutable(
      path.join(resourcesDir, "dsh-runtime", "node_modules", "@officecli", "officecli", "vendor", "officecli.exe"),
      "packaged OfficeCLI",
    );
    assertWindowsX64PeExecutable(layout.browserSkillCli, "packaged BrowserSkill CLI");
    for (const [file, label] of windowsRuntimeNativeBinaries(path.join(resourcesDir, "dsh-runtime"))) {
      assertWindowsX64PeExecutable(file, `packaged ${label}`);
    }
    assertWindowsPackagedRuntimeNatives(path.join(resourcesDir, "dsh-runtime"));
  }

  const duplicateDsh = path.join(resourcesDir, "app.asar.unpacked", "node_modules", "@deepseek-ai", "dsh");
  if (existsSync(duplicateDsh)) {
    throw new Error(`retired duplicate DSH runtime was packaged: ${duplicateDsh}`);
  }
  const appAsar = path.join(resourcesDir, "app.asar");
  if (existsSync(appAsar)) {
    const bundledModules = listPackage(appAsar).map((entry) => entry.replaceAll("\\", "/"));
    const duplicatePrefixes = [
      "/node_modules/@deepseek-ai/dsh/",
      "/node_modules/@officecli/officecli/",
      "/node_modules/@wxg-prc-cpg/browser-skill-dsh-plugin/",
      "/node_modules/@wxg-prc-cpg/dsh-weknora/",
      "/node_modules/@voltui/dsh-intranet-auth/",
    ];
    const duplicate = bundledModules.find((entry) => duplicatePrefixes.some((prefix) => entry.startsWith(prefix)));
    if (duplicate) throw new Error(`runtime dependency was duplicated inside app.asar: ${duplicate}`);
  }

  return {
    resourcesDir,
    nodeExecutable,
    dshBin: path.join(resourcesDir, requiredRuntimeFiles[0]),
    patchFile: path.join(resourcesDir, "profiles", "anyong.yml"),
  };
}

export function packagedRuntimeLayout(resourcesDir, platform = process.platform) {
  const runtimeRoot = path.join(resourcesDir, "dsh-runtime");
  return {
    resourcesDir,
    nodeExecutable: path.join(resourcesDir, "node-runtime", platform === "win32" ? "node.exe" : "node"),
    dshBin: path.join(runtimeRoot, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
    patchFile: path.join(resourcesDir, "profiles", "anyong.yml"),
    officeCliEntry: path.join(runtimeRoot, "node_modules", "@officecli", "officecli", "officecli.js"),
    integrationsScript: path.join(runtimeRoot, "scripts", "anyong-integrations-mcp.mjs"),
    browserSkillCli: path.join(resourcesDir, "browser-skill-runtime", platform === "win32" ? "bsk.exe" : "bsk"),
    browserSkillPlugin: path.join(runtimeRoot, "node_modules", "@wxg-prc-cpg", "browser-skill-dsh-plugin"),
    weknoraPlugin: path.join(runtimeRoot, "node_modules", "@wxg-prc-cpg", "dsh-weknora"),
    intranetAuthPlugin: path.join(runtimeRoot, "node_modules", "@voltui", "dsh-intranet-auth"),
    bundledEnv: path.join(resourcesDir, "bundled.env"),
  };
}

function readProcessOutput(executable, args, timeoutMs = 30_000) {
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
      finish(new Error(`process timed out after ${timeoutMs}ms: ${executable} ${args.join(" ")}`.trim()));
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

function createPackagedDsh(runtime, temporaryRoot, platform = process.platform) {
  const dshHome = path.join(temporaryRoot, "home");
  const layout = packagedRuntimeLayout(runtime.resourcesDir, platform);
  if (layout.nodeExecutable !== runtime.nodeExecutable || layout.dshBin !== runtime.dshBin) {
    throw new Error("packaged DSH layout does not match the inspected resource root");
  }
  for (const file of [layout.officeCliEntry, layout.integrationsScript, layout.browserSkillCli, layout.dshBin, layout.patchFile]) {
    if (!existsSync(file)) throw new Error(`packaged DSH resource is missing: ${file}`);
  }
  const userProfile = path.join(temporaryRoot, "user");
  const appData = path.join(userProfile, "AppData", "Roaming");
  const localAppData = path.join(userProfile, "AppData", "Local");
  mkdirSync(appData, { recursive: true });
  mkdirSync(localAppData, { recursive: true });
  return new OfficialDshRuntime({
    executable: runtime.nodeExecutable,
    executableArgs: ["--expose-internals"],
    dshBin: runtime.dshBin,
    patchFile: runtime.patchFile,
    dshHome,
    workspace: temporaryRoot,
    bundledBrowserSkillPackageDir: layout.browserSkillPlugin,
    bundledProfilePlugins: [{
      packageName: "@wxg-prc-cpg/dsh-weknora",
      packageDir: layout.weknoraPlugin,
    }, {
      packageName: "@voltui/dsh-intranet-auth",
      packageDir: layout.intranetAuthPlugin,
    }],
    environment: {
      ...bundledDshModelEnvironment(layout.bundledEnv),
      HOME: userProfile,
      USERPROFILE: userProfile,
      APPDATA: appData,
      LOCALAPPDATA: localAppData,
      PATH: process.platform === "win32"
        ? `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}`
        : "/usr/bin:/bin",
      NODE_OPTIONS: "",
      NODE_PATH: "",
      XG_GOMODEL_API_KEY: "",
      ANYONG_BSK_PATH: layout.browserSkillCli,
      ANYONG_OFFICECLI_COMMAND: runtime.nodeExecutable,
      ANYONG_OFFICECLI_ARGS_JSON: JSON.stringify([layout.officeCliEntry, "mcp"]),
      ANYONG_INTEGRATIONS_MCP_COMMAND: runtime.nodeExecutable,
      ANYONG_INTEGRATIONS_MCP_SCRIPT: layout.integrationsScript,
    },
  });
}

async function verifyDshRuntime(runtime) {
  const runtimeUrl = await startOfficialDshWithRetry(runtime);
  const client = new DshRemoteClient(runtimeUrl);
  await client.authenticate();
  const inventory = await client.call("pluginInventory/list", {});
  const entries = inventory?.entries;
  if (!Array.isArray(entries)) throw new Error("packaged DSH plugin inventory response is invalid");
  for (const moduleName of ["@wxg-prc-cpg/browser-skill-dsh-plugin", "@wxg-prc-cpg/dsh-weknora", "@voltui/dsh-intranet-auth", "@deepseek-ai/dsh-mcp-client"]) {
    const entry = entries.find((candidate) => candidate?.moduleName === moduleName);
    if (!entry?.enabled || entry.fiberPhase !== "active") throw new Error(`packaged DSH plugin is not active: ${moduleName}`);
  }
  return client;
}

export async function smokePackagedDshRuntime(resourcesDir, platform = process.platform) {
  const runtime = inspectPackagedResources(resourcesDir, platform);
  const versions = await verifyPackagedVersions(runtime);
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "voltui-packaged-dsh-"));
  const desktopRuntime = createPackagedDsh(runtime, temporaryRoot);

  try {
    const client = await verifyDshRuntime(desktopRuntime);
    const credential = await provisionBundledDshCredential(client, packagedRuntimeLayout(resourcesDir, platform).bundledEnv);
    if (process.env.REQUIRE_XG_MODEL_BUNDLE === "1" && !credential.provisioned) {
      throw new Error("packaged DSH did not import its required bundled model credential into the clean home");
    }
    console.log(`Packaged ${versions.nodeVersion}, official DSH ${versions.dshVersion}, and plugin RPC passed at ${client.cleanOrigin}.`);
  } finally {
    await desktopRuntime.stop();
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

export function packagedWindowsExecutable(outputDir, executableName = resolveElectronProfile().executableName) {
  return path.join(outputDir, "win-unpacked", `${executableName}.exe`);
}

export function inspectPackagedWindowsApp(outputDir = packageOutput) {
  const executable = packagedWindowsExecutable(outputDir);
  if (!existsSync(executable)) throw new Error(`packaged Windows executable is missing: ${executable}`);
  assertWindowsX64PeExecutable(executable, "packaged Electron host");
  return inspectPackagedResources(resolvePackagedResources(outputDir, "win32"), "win32");
}

async function main() {
  if (process.argv[2]) {
    await smokePackagedDshRuntime(path.resolve(process.argv[2]));
    return;
  }
  if (process.platform === "win32") inspectPackagedWindowsApp();
  await smokePackagedDshRuntime(resolvePackagedResources());
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  await main();
}
