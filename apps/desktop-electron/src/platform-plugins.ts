export const WINDOWS_ONLY_PLUGIN = "dsh-ab-ocr";

export function platformProfilePluginNames(platform: string = process.platform): ReadonlySet<string> {
  return new Set(platform === "win32" ? [WINDOWS_ONLY_PLUGIN] : []);
}

export function isPlatformProfilePlugin(name: string, platform: string = process.platform): boolean {
  return platformProfilePluginNames(platform).has(name);
}
