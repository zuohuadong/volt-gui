import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElectronProfile } from "../apps/desktop-electron/src/electron-profile.ts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const profile = resolveElectronProfile();

export function normalizeDesktopVersion(rawVersion) {
  const version = String(rawVersion || "").trim().replace(/^desktop-v/, "").replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`invalid desktop version: ${version || "<empty>"}`);
  }
  return version;
}

function releaseArtifact(file, version, desktopProfile = profile) {
  const installerName = `${desktopProfile.productName} Setup ${version}.exe`;
  const portableName = `${desktopProfile.productName}-${version}-win.zip`;
  if (file === installerName) {
    return { kind: "installer", targetName: `${desktopProfile.artifactSlug}-windows-x64-installer-${version}.exe` };
  }
  if (file === portableName) {
    return { kind: "portable", targetName: `${desktopProfile.artifactSlug}-windows-x64-portable-${version}.zip` };
  }
  if (file === `${installerName}.blockmap`) {
    return { kind: "blockmap", targetName: `${desktopProfile.artifactSlug}-windows-x64-installer-${version}.exe.blockmap` };
  }
  return null;
}

export function packageElectronArtifacts({ sourceDir, outputDir, version, desktopProfile = profile }) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Electron package directory does not exist: ${sourceDir}`);
  }

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const copiedKinds = new Set();
  for (const file of fs.readdirSync(sourceDir).sort()) {
    const source = path.join(sourceDir, file);
    if (!fs.statSync(source).isFile()) continue;

    const artifact = releaseArtifact(file, version, desktopProfile);
    if (!artifact) continue;
    copiedKinds.add(artifact.kind);
    fs.copyFileSync(source, path.join(outputDir, artifact.targetName));
    console.log(`Copied ${file} to ${path.relative(rootDir, path.join(outputDir, artifact.targetName))}`);
  }

  if (!copiedKinds.has("installer") || !copiedKinds.has("portable")) {
    throw new Error(`missing Electron artifacts: installer=${copiedKinds.has("installer")} portable=${copiedKinds.has("portable")}`);
  }
}

function main() {
  const packagePath = path.join(rootDir, "apps", "desktop-electron", "package.json");
  const electronPackage = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const version = normalizeDesktopVersion(process.env.DESKTOP_VERSION || electronPackage.version);
  const sourceDir = path.resolve(process.env.PACKAGE_DIST_SOURCE || path.join(rootDir, "apps", "desktop-electron", "dist-package"));
  const outputDir = path.resolve(process.env.PACKAGE_DIST_OUTPUT || path.join(rootDir, "dist"));
  packageElectronArtifacts({ sourceDir, outputDir, version });
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main();
}
