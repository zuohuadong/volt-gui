import { resolveElectronProfile } from "./src/electron-profile.ts";
const profile = resolveElectronProfile();
export default {
  appId: profile.appId,
  productName: profile.productName,
  executableName: profile.executableName,
  directories: { output: "dist-package" },
  npmRebuild: false,
  nodeGypRebuild: false,
  buildDependenciesFromSource: false,
  files: [
    "dist/main.js",
    "dist/preload.cjs",
    "dist/workbench.html",
    "dist/renderer/**/*",
    "package.json",
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
