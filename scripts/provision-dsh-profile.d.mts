export interface BundledBrowserSkillProfileOptions {
  dshHome: string;
  profileName: "web" | "headless";
  bundledPackageDir: string;
}

export function provisionBundledBrowserSkillProfile(options: BundledBrowserSkillProfileOptions): void;
