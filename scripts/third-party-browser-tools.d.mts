export interface BrowserSkillPackage {
  packageName: string;
  version: string;
  license: string;
  integrity: string;
  repository: string;
  role: string;
}

export interface BrowserSkillCliAsset {
  name: string;
  sha256: string;
  binarySha256?: string;
}

export interface BrowserSkillCliPackage {
  version: string;
  releaseUrl: string;
  assets: Record<string, BrowserSkillCliAsset>;
}

export interface BrowserSkillExtensionPackage {
  version: string;
  license: string;
  releaseUrl: string;
  archive: string;
  sha256: string;
  vendorPath: string;
  repository: string;
}

export const browserSkill: BrowserSkillPackage;
export const browserSkillExtension: BrowserSkillExtensionPackage;
export const browserSkillCli: BrowserSkillCliPackage;