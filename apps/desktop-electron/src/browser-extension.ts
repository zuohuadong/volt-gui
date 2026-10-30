import { existsSync } from "node:fs";
import path from "node:path";

import { readExtensionManifest, syncBrowserSkillExtension } from "../../../scripts/browser-skill-extension.mjs";
import { browserSkillExtension } from "../../../scripts/third-party-browser-tools.mjs";

export interface BrowserExtensionState {
  version: string;
  directory: string;
  installed: boolean;
  changed: boolean;
  error?: string;
}

/**
 * 扩展目录必须跨版本稳定，Chrome 加载已解压扩展后记住的是绝对路径。
 * 因此打包资源只作为只读来源，首次启动/版本变化时复制到 userData。
 */
export function browserExtensionSourceDirectory(baseDirectory: string, isPackaged: boolean): string {
  return isPackaged
    ? path.join(baseDirectory, "browser-extension-runtime", "extension")
    : path.join(baseDirectory, ".browser-extension-runtime", "extension");
}

export function browserExtensionDirectory(userDataPath: string): string {
  return path.join(userDataPath, "browser-extension");
}

export function ensureBrowserExtension(source: string, destination: string): BrowserExtensionState {
  if (!existsSync(path.join(source, "manifest.json"))) {
    return {
      version: browserSkillExtension.version,
      directory: destination,
      installed: false,
      changed: false,
      error: "未找到内置的 BrowserSkill 浏览器扩展：请重新安装完整版本，或先运行 pnpm --filter @voltui/desktop-electron run stage:browser-extension。",
    };
  }
  try {
    const result = syncBrowserSkillExtension({ source, destination, version: browserSkillExtension.version });
    const manifest = readExtensionManifest(destination);
    return {
      version: manifest.version,
      directory: destination,
      installed: true,
      changed: result.changed,
    };
  } catch (error) {
    return {
      version: browserSkillExtension.version,
      directory: destination,
      installed: false,
      changed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
