export interface ZipEntry {
  name: string;
  directory: boolean;
  content: Buffer;
}

export interface ExtensionStageResult {
  directory: string;
  version: string;
  sha256: string;
  changed: boolean;
}

export interface ExtensionManifest {
  manifest_version: number;
  name: string;
  version: string;
  background?: { service_worker?: string };
}

export function sha256(input: Uint8Array): string;
export function readZipEntries(buffer: Buffer): ZipEntry[];
export function safeExtensionPath(name: string): string[];
export function readExtensionManifest(directory: string, expectedVersion?: string): ExtensionManifest;
export function stageBrowserSkillExtension(options?: {
  archive?: string;
  destination?: string;
  version?: string;
  sha256?: string;
}): ExtensionStageResult;
export function syncBrowserSkillExtension(options?: {
  source?: string;
  destination?: string;
  version?: string;
}): ExtensionStageResult;
export function extensionInstructions(directory: string): string;