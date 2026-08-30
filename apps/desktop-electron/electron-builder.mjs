import { resolveElectronProfile } from "./src/electron-profile.ts";
import path from "node:path";

const profile = resolveElectronProfile();
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
  ],
  extraResources: [
    { from: "../desktop-frontend/dist", to: "frontend" },
    { from: "../../profiles", to: "profiles", filter: ["anyong.yml"] },
    { from: ".dsh-runtime/node_modules", to: "dsh-runtime/node_modules" },
    { from: ".node-runtime", to: "node-runtime" },
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
};
