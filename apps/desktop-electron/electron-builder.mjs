import { resolveElectronProfile } from "./src/electron-profile.ts";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  assertWindowsX64PeExecutable,
  ensureWindowsKoffiPackage,
  ensureWindowsNodePtyPrebuild,
  WINDOWS_DSH_NODE_MODULES_FILTER,
  windowsRuntimeNativeBinaries,
} from "../../scripts/native-executable.mjs";

const profile = resolveElectronProfile();
const desktopDir = path.dirname(fileURLToPath(import.meta.url));
const bundledEnvPath = path.join(desktopDir, "build", "bundled.env");
const packaging = process.argv.some((arg) => arg.includes("electron-builder"));
const packagingWindows = packaging && (process.argv.includes("--win") || process.platform === "win32");
if (process.env.REQUIRE_XG_MODEL_BUNDLE === "1" && !fs.existsSync(bundledEnvPath) && packaging) {
  throw new Error(`发布构建要求内置模型凭据，但未找到 ${bundledEnvPath}`);
}
if (packaging) {
  for (const source of [
    path.resolve(desktopDir, "../desktop-frontend/dist"),
    path.resolve(desktopDir, "../../profiles/anyong.yml"),
    path.resolve(desktopDir, ".dsh-runtime/node_modules"),
    path.resolve(desktopDir, ".dsh-runtime/scripts"),
    path.resolve(desktopDir, ".node-runtime"),
    path.resolve(desktopDir, ".browser-skill-runtime"),
  ]) {
    if (!fs.existsSync(source)) throw new Error(`Packaging extraResources source is missing: ${source}`);
  }
}
if (packagingWindows) {
  const nodeExecutable = path.resolve(desktopDir, ".node-runtime", "node.exe");
  if (!fs.existsSync(nodeExecutable)) throw new Error(`Windows packaging extraResources binary is missing: ${nodeExecutable}`);
  assertWindowsX64PeExecutable(nodeExecutable, "Node");
  const runtimeRoot = path.resolve(desktopDir, ".dsh-runtime");
  const nativeSearchRoots = [desktopDir, path.resolve(desktopDir, "../..")];
  ensureWindowsNodePtyPrebuild(runtimeRoot, nativeSearchRoots, "packaging node-pty");
  ensureWindowsKoffiPackage(runtimeRoot, nativeSearchRoots, "packaging Koffi");
  const windowsBinaries = [
    [path.resolve(desktopDir, ".dsh-runtime", "node_modules", "@officecli", "officecli", "vendor", "officecli.exe"), "OfficeCLI"],
    [path.resolve(desktopDir, ".browser-skill-runtime", "bsk.exe"), "BrowserSkill CLI"],
    ...windowsRuntimeNativeBinaries(runtimeRoot),
  ];
  for (const [file, label] of windowsBinaries) {
    if (!fs.existsSync(file)) throw new Error(`Windows packaging extraResources binary is missing: ${file}`);
    assertWindowsX64PeExecutable(file, label);
  }
}
export default {
  appId: profile.appId,
  productName: profile.productName,
  executableName: profile.executableName,
  directories: { output: "dist-package" },
  // pnpm deploy stages the complete DSH graph, including peer and optional
  // packages. electron-builder must not reconstruct that graph itself.
  beforeBuild: () => false,
  electronDist: path.resolve("node_modules/electron/dist"),
  npmRebuild: false,
  nodeGypRebuild: false,
  buildDependenciesFromSource: false,
  files: [
    "dist/main.js",
    "dist/preload.cjs",
    "package.json",
    "!node_modules/**/*",
  ],
  extraResources: [
    { from: "../desktop-frontend/dist", to: "frontend" },
    { from: "../../profiles", to: "profiles", filter: ["anyong.yml"] },
    { from: ".dsh-runtime/node_modules", to: "dsh-runtime/node_modules", filter: [...WINDOWS_DSH_NODE_MODULES_FILTER] },
    { from: ".dsh-runtime/scripts", to: "dsh-runtime/scripts" },
    { from: ".node-runtime", to: "node-runtime" },
    { from: ".browser-skill-runtime", to: "browser-skill-runtime" },
    ...(fs.existsSync(bundledEnvPath) ? [{ from: bundledEnvPath, to: "bundled.env" }] : []),
  ],
  win: {
    icon: "icon.ico",
    target: [{ target: "nsis", arch: ["x64"] }, { target: "zip", arch: ["x64"] }],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    include: path.resolve("build/installer.nsh"),
    guid: profile.nsisGuid,
    uninstallDisplayName: `${profile.productName} Desktop`,
    artifactName: `${profile.productName} Setup ${"${version}"}.exe`,
  },
  zip: {
    artifactName: `${profile.productName}-${"${version}"}-win.zip`,
  },
};
