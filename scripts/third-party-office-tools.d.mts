export const officeCli: {
  readonly packageName: "@officecli/officecli";
  readonly version: string;
  readonly license: string;
  readonly integrity: string;
  readonly repository: string;
  readonly windowsX64Sha256: string;
  readonly role: string;
};

export function resolveOfficeCliEntry(fromPackageRoot?: string): string;
export function officeCliEntryFromEnvironment(environment?: Readonly<Record<string, string>>): string | undefined;
export function ensureOfficeCliBinary(entryPath?: string): Promise<string | null>;
