import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultPackagePath = path.resolve(scriptDir, "..", "apps", "desktop-electron", "package.json");

export function normalizeReleaseVersion(rawVersion) {
  const version = String(rawVersion || "").trim().replace(/^desktop-v/, "").replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`RELEASE_VERSION must be semver, got: ${rawVersion || "<empty>"}`);
  }
  return version;
}

export function updateElectronPackageVersion(packagePath, rawVersion) {
  const version = normalizeReleaseVersion(rawVersion);
  const electronPackage = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  electronPackage.version = version;
  fs.writeFileSync(packagePath, `${JSON.stringify(electronPackage, null, 2)}\n`);
  return version;
}

function main() {
  const rawVersion = process.env.RELEASE_VERSION || process.argv[2];
  const version = updateElectronPackageVersion(defaultPackagePath, rawVersion);
  console.log(`Electron package version set to ${version}`);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main();
}
