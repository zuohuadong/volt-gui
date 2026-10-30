import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export interface BrowserCandidate {
  id: "chrome" | "edge" | "chromium" | "brave";
  name: string;
  path: string;
}

interface CandidateDefinition {
  id: BrowserCandidate["id"];
  name: string;
  /** 相对路径：windows 相对百分比变量，darwin 相对 /，linux 绝对路径。 */
  windows: string[];
  darwin: string[];
  linux: string[];
}

const DEFINITIONS: readonly CandidateDefinition[] = [
  {
    id: "chrome",
    name: "Chrome",
    windows: [
      "PROGRAMFILES/Google/Chrome/Application/chrome.exe",
      "PROGRAMFILES(X86)/Google/Chrome/Application/chrome.exe",
      "LOCALAPPDATA/Google/Chrome/Application/chrome.exe",
    ],
    darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
    linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"],
  },
  {
    id: "edge",
    name: "Edge",
    windows: [
      "PROGRAMFILES(X86)/Microsoft/Edge/Application/msedge.exe",
      "PROGRAMFILES/Microsoft/Edge/Application/msedge.exe",
      "LOCALAPPDATA/Microsoft/Edge/Application/msedge.exe",
    ],
    darwin: ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
    linux: ["/usr/bin/microsoft-edge", "/usr/bin/microsoft-edge-stable"],
  },
  {
    id: "chromium",
    name: "Chromium",
    windows: ["LOCALAPPDATA/Chromium/Application/chrome.exe"],
    darwin: ["/Applications/Chromium.app/Contents/MacOS/Chromium"],
    linux: ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium"],
  },
  {
    id: "brave",
    name: "Brave",
    windows: [
      "PROGRAMFILES/BraveSoftware/Brave-Browser/Application/brave.exe",
      "LOCALAPPDATA/BraveSoftware/Brave-Browser/Application/brave.exe",
    ],
    darwin: ["/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"],
    linux: ["/usr/bin/brave-browser", "/usr/bin/brave"],
  },
];

/** 扩展内固定连接的 bsk 守护进程端口；仅用于界面提示，不做强校验。 */
export const BROWSER_SKILL_PORT = 52800;

export function extensionPageUrl(browserId: BrowserCandidate["id"]): string {
  return browserId === "edge" ? "edge://extensions/" : "chrome://extensions/";
}

function windowsPath(base: string, relative: string): string {
  return path.win32.join(base, ...relative.split("/"));
}

function candidatePaths(definition: CandidateDefinition, platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  if (platform === "win32") {
    return definition.windows.flatMap((relative) => {
      const [variable, ...rest] = relative.split("/");
      const base = env[variable];
      return base ? [windowsPath(base, rest.join("/"))] : [];
    });
  }
  if (platform === "darwin") return [...definition.darwin];
  return [...definition.linux];
}

/**
 * 只返回真实存在的浏览器可执行文件，顺序按 Chrome → Edge → Chromium → Brave。
 * 内网机器上 Chrome/Edge 是最可能的组合，找不到时界面会给出保底说明。
 */
export function installedBrowsers(options: {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  exists?: (file: string) => boolean;
} = {}): BrowserCandidate[] {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;
  const found: BrowserCandidate[] = [];
  const seen = new Set<string>();
  for (const definition of DEFINITIONS) {
    for (const file of candidatePaths(definition, platform, env)) {
      if (seen.has(file) || !exists(file)) continue;
      seen.add(file);
      found.push({ id: definition.id, name: definition.name, path: file });
      break;
    }
  }
  return found;
}

export type LaunchExtensionPageResult =
  | { launched: true; browser: BrowserCandidate }
  | { launched: false; error: string };

/**
 * Chrome/Edge 出于安全设计不允许程序静默安装扩展，但允许命令行打开扩展管理页。
 * 这里只负责把用户送到 `chrome://extensions`，加载目录的动作仍由用户点击完成。
 */
export async function launchExtensionPage(
  browser: BrowserCandidate,
  options: { spawnImpl?: typeof spawn } = {},
): Promise<LaunchExtensionPageResult> {
  const spawnImpl = options.spawnImpl ?? spawn;
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnImpl(browser.path, [extensionPageUrl(browser.id)], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
    } catch (error) {
      resolve({ launched: false, error: error instanceof Error ? error.message : String(error) });
      return;
    }
    const fail = (error: unknown) => {
      resolve({
        launched: false,
        error: error instanceof Error ? error.message : String(error ?? "浏览器启动失败"),
      });
    };
    child.once("error", fail);
    child.once("spawn", () => {
      child.removeListener("error", fail);
      child.unref();
      resolve({ launched: true, browser });
    });
  });
}

/** 从受信任的 IPC 输入中解析浏览器路径，只接受本机检测到的候选。 */
export function resolveBrowserCandidate(
  browsers: readonly BrowserCandidate[],
  id: unknown,
): BrowserCandidate | undefined {
  if (typeof id !== "string") return undefined;
  return browsers.find((browser) => browser.id === id);
}