export interface BundledBrowserSkillProfileOptions {
  dshHome: string;
  profileName: "web" | "headless";
  bundledPackageDir: string;
  additionalPlugins?: ReadonlyArray<{
    packageName: string;
    packageDir: string;
    version?: string;
  }>;
  profilePlugins?: ReadonlyArray<{
    packageName: string;
    packageDir: string;
    version?: string;
    previousVersion?: string;
  }>;
}

export function provisionBundledBrowserSkillProfile(options: BundledBrowserSkillProfileOptions): void;
