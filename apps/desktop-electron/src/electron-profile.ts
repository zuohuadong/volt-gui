import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ElectronProfileName = "anyong";

export interface ElectronDesktopProfile {
  productName: string;
  appId: string;
  nsisGuid: string;
  artifactSlug: string;
  executableName: string;
}

const profiles = {
  anyong: Object.freeze({
    productName: "西谷智灯暗涌平台",
    appId: "cn.aizhuliren.anyong.desktop",
    nsisGuid: "anyong-desktop-guid",
    artifactSlug: "anyong",
    executableName: "Anyong",
  }),
} as const satisfies Record<ElectronProfileName, Readonly<ElectronDesktopProfile>>;

function isElectronProfileName(value: string): value is ElectronProfileName {
  return Object.hasOwn(profiles, value);
}

export function resolveElectronProfile(
  name = process.env.ELECTRON_DESKTOP_PROFILE || "anyong",
): Readonly<ElectronDesktopProfile> {
  const profileName = String(name).trim().toLowerCase();
  if (!isElectronProfileName(profileName)) {
    throw new Error(`Unsupported Electron desktop profile: ${name}`);
  }
  return profiles[profileName];
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  console.log(JSON.stringify(resolveElectronProfile(), null, 2));
}
