import { resolveElectronProfile } from "./src/electron-profile.ts";
const profile = resolveElectronProfile();
export default {
  appId: profile.appId,
  productName: profile.productName,
  executableName: profile.executableName,
  directories: { output: "dist-package" },
  // pnpm deploy stages the complete DSH graph, including peer and optional
  // packages. electron-builder must not reconstruct that graph itself.
  beforeBuild: () => false,
  npmRebuild: true,
  nodeGypRebuild: false,
  buildDependenciesFromSource: false,
  files: [
    "dist/main.js",
    "package.json",
  ],
  extraResources: [
    { from: "../../profiles", to: "profiles", filter: ["anyong.yml"] },
    { from: ".dsh-runtime/node_modules", to: "dsh-runtime/node_modules" },
    { from: ".node-runtime", to: "node-runtime" },
  ],
  win: {
    icon: "icon.ico",
    target: [{ target: "nsis", arch: ["x64"] }, { target: "portable", arch: ["x64"] }],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    guid: profile.nsisGuid,
    uninstallDisplayName: `${profile.productName} Desktop`,
    artifactName: `${profile.productName} Setup ${"${version}"}.exe`,
  },
  portable: {
    artifactName: `${profile.productName} ${"${version}"}.exe`,
  },
};
