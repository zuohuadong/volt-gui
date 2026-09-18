export interface BundledBrowserSkillProfileOptions {
  dshHome: string;
  profileName: "web" | "headless";
  bundledPackageDir: string;
  additionalPlugins?: ReadonlyArray<{
    packageName: string;
    packageDir: string;
    version?: string;
  }>;
}

export function provisionBundledBrowserSkillProfile(options: BundledBrowserSkillProfileOptions): void;
