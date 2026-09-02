import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

import {
  migrateLegacyDshCredentials,
  OfficialDshRuntime,
  resolveOfficialDshBin,
  rethrowUnlessBrokenPipe,
  startOfficialDshWithRetry,
} from "./official-dsh-runtime.js";
import { resolveElectronProfile } from "./electron-profile.js";
import { SmbMountManager } from "./smb-mounts.js";

const electronProfile = resolveElectronProfile();
app.setName(electronProfile.executableName);
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(moduleDir, "..");
const gotSingleInstanceLock = app.requestSingleInstanceLock();

function desktopAppVersion(): string {
  if (app.isPackaged) return app.getVersion();
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(desktopRoot, "package.json"), "utf8")) as { version?: unknown };
    if (typeof packageJson.version === "string" && packageJson.version.trim()) return packageJson.version.trim();
  } catch (error) {
    console.warn("[Electron] Failed to read the desktop package version", error);
  }
  return app.getVersion();
}

const allowedDshMethods = new Set([
  "session.list", "session.search", "session.create", "session.history", "session.prompt",
  "session.cancel", "session.models", "session.selectModel", "session.rename", "session.fork",
  "session.attachment", "session.updateQueue", "workspace.list", "workspace.create",
  "workspace.rename", "workspace.delete", "workspace.insertBefore", "workspace.insertSessionBefore",
  "workspace.archiveSession", "host.describe", "host.listDirectory", "host.createDirectory", "host.openPath",
  "agentPreset.list", "agentPreset.select", "agentPreset.read", "agentPreset.copy", "agentPreset.openDocument", "agentPreset.remove",
  "subagent.list", "subagent.history", "subagent.prompt", "subagent.interrupt",
  "goal.create", "goal.edit", "goal.pause",
  "goal.resume", "goal.complete", "goal.clear", "settings.describe", "settings.openDocument",
  "settings.update", "settings.replace", "settings.mutate", "credentials.describe",
  "credentials.set", "credentials.unset", "llm.providers", "llm.models", "llm.discoverModels", "skill.list",
  "fileReferences/list", "sessionReferenceResolver/candidates", "pluginInventory/list",
]);

process.stdout.on("error", rethrowUnlessBrokenPipe);
process.stderr.on("error", rethrowUnlessBrokenPipe);

let mainWindow: BrowserWindow | null = null;
let dshRuntime: OfficialDshRuntime | null = null;
let quitting = false;
let dshEventController: AbortController | null = null;
let smbMountManager: SmbMountManager | null = null;
let runtimeStartPromise: Promise<void> | null = null;
const DSH_REQUEST_TIMEOUT_MS = 30_000;
let desktopBootstrap = {
  dshReady: false,
  productName: electronProfile.productName,
  version: desktopAppVersion(),
  workspace: os.homedir(),
  startupError: "",
};

app.setAppUserModelId(electronProfile.appId);
Menu.setApplicationMenu(null);

function canonicalWorkspace(candidate: string | undefined): string {
  const requested = candidate?.trim() || os.homedir();
  try {
    const canonical = fs.realpathSync(path.resolve(requested));
    if (fs.statSync(canonical).isDirectory()) return canonical;
  } catch (error) {
    console.warn(`[Electron] DSH workspace is unavailable: ${requested}`, error);
  }
  return fs.realpathSync(os.homedir());
}

function profilePatchPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "profiles", "anyong.yml")
    : path.resolve(desktopRoot, "..", "..", "profiles", "anyong.yml");
}

function dshHomePath(): string {
  return process.env.DSH_HOME?.trim() || path.join(app.getPath("userData"), "dsh");
}

function legacyDshHomePaths(): string[] {
  const appData = app.getPath("appData");
  return [
    path.join(appData, "voltui", "dsh"),
    path.join(appData, "@voltui", "desktop-electron", "dsh"),
    path.join(appData, "@anyong", "desktop-electron", "dsh"),
  ];
}

function smbConfigPath(): string {
  return path.join(app.getPath("userData"), "smb-mounts.json");
}

function requireSmbManager(): SmbMountManager {
  if (!smbMountManager) smbMountManager = new SmbMountManager({ configPath: smbConfigPath() });
  return smbMountManager;
}

function nodeRuntimePath(): string {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, "node-runtime")
    : path.join(desktopRoot, ".node-runtime");
  return path.join(root, process.platform === "win32" ? "node.exe" : "node");
}

function browserSkillCliPath(): string {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, "browser-skill-runtime")
    : path.join(desktopRoot, ".browser-skill-runtime");
  return path.join(root, process.platform === "win32" ? "bsk.exe" : "bsk");
}

function officeCliEntryPath(): string {
  const runtimeRoot = app.isPackaged
    ? path.join(process.resourcesPath, "dsh-runtime")
    : path.join(desktopRoot, ".dsh-runtime");
  return path.join(runtimeRoot, "node_modules", "@officecli", "officecli", "officecli.js");
}

function browserSkillPluginPackagePath(): string {
  const runtimeRoot = app.isPackaged
    ? path.join(process.resourcesPath, "dsh-runtime")
    : path.join(desktopRoot, ".dsh-runtime");
  return path.join(runtimeRoot, "node_modules", "@wxg-prc-cpg", "browser-skill-dsh-plugin");
}

function frontendIndexPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "frontend", "index.html")
    : path.resolve(desktopRoot, "..", "desktop-frontend", "dist", "index.html");
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 960,
    minHeight: 640,
    title: electronProfile.productName,
    backgroundColor: "#f4f5f7",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: app.isPackaged
        ? path.join(process.resourcesPath, "app.asar", "dist", "preload.cjs")
        : path.join(moduleDir, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.removeMenu();
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (!targetUrl.startsWith("file://")) event.preventDefault();
  });
  window.once("ready-to-show", () => {
    window.show();
    window.focus();
  });
  window.webContents.once("did-fail-load", (_event, code, description) => {
    console.error(`[Electron] DSH Web failed to load (${code}): ${description}`);
    window.show();
  });
  window.on("closed", () => {
    mainWindow = null;
  });
  void window.loadFile(frontendIndexPath());
  return window;
}

function configureBrowserPermissions(): void {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

async function startDesktop(): Promise<void> {
  const workspace = canonicalWorkspace(process.env.DSH_WORKSPACE || process.env.INIT_CWD);
  const dshHome = dshHomePath();
  const credentialMigration = migrateLegacyDshCredentials(dshHome, legacyDshHomePaths());
  for (const warning of credentialMigration.warnings) console.warn(`[Electron] ${warning}`);
  if (credentialMigration.migratedFrom) {
    console.log(`[Electron] 已迁移旧版官方 DSH 凭据: ${credentialMigration.migratedFrom}`);
  }
  desktopBootstrap = { ...desktopBootstrap, workspace, startupError: "" };
  dshRuntime = new OfficialDshRuntime({
    dshBin: resolveOfficialDshBin(app.isPackaged ? process.resourcesPath : undefined),
    dshHome,
    patchFile: profilePatchPath(),
    workspace,
    bundledBrowserSkillPackageDir: browserSkillPluginPackagePath(),
    executable: nodeRuntimePath(),
    executableArgs: ["--expose-internals"],
    environment: {
      ANYONG_BSK_PATH: browserSkillCliPath(),
      ANYONG_OFFICECLI_COMMAND: nodeRuntimePath(),
      ANYONG_OFFICECLI_ARGS_JSON: JSON.stringify([officeCliEntryPath(), "mcp"]),
    },
    onExit: (code, signal) => {
      if (quitting) return;
      console.error(`[Electron] Official DSH exited unexpectedly: code=${code} signal=${signal}`);
      const message = `官方 DSH 已停止：code=${code} signal=${signal}`;
      desktopBootstrap = { ...desktopBootstrap, dshReady: false, startupError: message };
      mainWindow?.webContents.send("desktop:runtime-error", message);
    },
  });
  const dshUrl = await startOfficialDshWithRetry(dshRuntime);
  desktopBootstrap = { ...desktopBootstrap, dshReady: true, startupError: "" };
  startDshEventBridge(dshUrl);
  mainWindow?.webContents.send("desktop:runtime-ready");
}

function beginDesktopStart(): Promise<void> {
  if (runtimeStartPromise) return runtimeStartPromise;
  desktopBootstrap = { ...desktopBootstrap, dshReady: false, startupError: "" };
  runtimeStartPromise = startDesktop()
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[Electron] Failed to start official DSH:", error);
      desktopBootstrap = { ...desktopBootstrap, dshReady: false, startupError: message };
      mainWindow?.webContents.send("desktop:runtime-error", message);
    })
    .finally(() => {
      runtimeStartPromise = null;
    });
  return runtimeStartPromise;
}

async function restartDesktopRuntime(): Promise<typeof desktopBootstrap> {
  if (runtimeStartPromise) await runtimeStartPromise;
  dshEventController?.abort();
  dshEventController = null;
  await dshRuntime?.stop();
  dshRuntime = null;
  await beginDesktopStart();
  return desktopBootstrap;
}

ipcMain.handle("desktop:bootstrap", () => desktopBootstrap);
ipcMain.handle("desktop:retry-runtime", () => restartDesktopRuntime());
ipcMain.handle("desktop:dsh-request", async (_event, method: string, payload: unknown) => {
  if (!dshRuntime?.url) throw new Error("官方 DSH 尚未启动");
  if (!allowedDshMethods.has(method)) {
    throw new Error(`不允许的 DSH 方法：${method}`);
  }
  const response = await fetch(`${dshRuntime.url}/api/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "client-request", rpcId: randomUUID(), method, payload }),
    signal: AbortSignal.timeout(DSH_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`DSH 请求失败（HTTP ${response.status}）`);
  return response.json();
});
ipcMain.handle("desktop:dsh-respond", async (_event, message: unknown) => {
  if (!dshRuntime?.url) throw new Error("官方 DSH 尚未启动");
  if (!message || typeof message !== "object") throw new Error("DSH 响应格式无效");
  const responseMessage = message as Record<string, unknown>;
  if (responseMessage.type !== "client-response" || typeof responseMessage.rpcId !== "string" || !responseMessage.rpcId) {
    throw new Error("DSH 响应关联信息无效");
  }
  const response = await fetch(`${dshRuntime.url}/api/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(DSH_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`DSH 响应失败（HTTP ${response.status}）`);
  return response.json();
});
ipcMain.handle("desktop:minimize", () => mainWindow?.minimize());
ipcMain.handle("desktop:maximize", () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});
ipcMain.handle("desktop:close", () => mainWindow?.close());
ipcMain.handle("desktop:open-external", async (_event, value: unknown) => {
  if (typeof value !== "string") throw new Error("外部链接格式无效");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("外部链接格式无效");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("仅允许打开 HTTP(S) 链接");
  await shell.openExternal(url.toString());
  return { opened: true as const };
});
ipcMain.handle("desktop:pick-workspace", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0] ?? null;
});
ipcMain.handle("desktop:export-session", async (_event, sessionId: unknown) => {
  if (!dshRuntime?.url) throw new Error("官方 DSH 尚未启动");
  if (typeof sessionId !== "string" || !sessionId.trim() || sessionId.length > 256) throw new Error("会话 ID 无效");
  const url = new URL("/api/session.export", dshRuntime.url);
  url.searchParams.set("sessionId", sessionId);
  url.searchParams.set("includeDescendants", "true");
  const preflight = await fetch(url, { method: "HEAD" });
  if (!preflight.ok) throw new Error(`官方 DSH 导出准备失败（HTTP ${preflight.status}）`);
  const filename = `dsh-session-${sessionId.replace(/[^A-Za-z0-9_-]/gu, "_")}.zip`;
  const saveOptions = { defaultPath: path.join(app.getPath("downloads"), filename), filters: [{ name: "ZIP archive", extensions: ["zip"] }] };
  const selected = mainWindow
    ? await dialog.showSaveDialog(mainWindow, saveOptions)
    : await dialog.showSaveDialog(saveOptions);
  if (selected.canceled || !selected.filePath) return { saved: false as const };
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`官方 DSH 导出失败（HTTP ${response.status}）`);
  await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), fs.createWriteStream(selected.filePath, { flags: "wx" }));
  return { saved: true as const, path: selected.filePath };
});
ipcMain.handle("desktop:smb-list", async () => requireSmbManager().list());
ipcMain.handle("desktop:smb-mount", async (_event, request: unknown) => {
  if (!request || typeof request !== "object") throw new Error("SMB 配置格式无效");
  return requireSmbManager().mount(request as Parameters<SmbMountManager["mount"]>[0]);
});
ipcMain.handle("desktop:smb-unmount", async (_event, id: unknown) => {
  if (typeof id !== "string") throw new Error("SMB 配置 ID 无效");
  return requireSmbManager().unmount(id);
});
ipcMain.handle("desktop:smb-remove", async (_event, id: unknown) => {
  if (typeof id !== "string") throw new Error("SMB 配置 ID 无效");
  return requireSmbManager().remove(id);
});
ipcMain.handle("desktop:smb-open", async (_event, localPath: unknown) => {
  if (typeof localPath !== "string" || !/^[A-Z]:$/iu.test(localPath.trim())) throw new Error("本地路径必须是 Windows 盘符");
  if (process.platform !== "win32") return { opened: false as const, error: "当前平台不支持打开 SMB 盘符" };
  const configuredPath = await requireSmbManager().resolveOpenPath(localPath);
  const error = await shell.openPath(configuredPath);
  return error ? { opened: false as const, error } : { opened: true as const };
});

function startDshEventBridge(dshUrl: string): void {
  dshEventController?.abort();
  const controller = new AbortController();
  dshEventController = controller;
  for (const endpoint of ["/api/events.mux", "/api/events.host"]) {
    connectDshEventSocket(dshUrl, endpoint, controller.signal);
  }
}

function connectDshEventSocket(dshUrl: string, endpoint: string, signal: AbortSignal): void {
  if (signal.aborted) return;
  const url = new URL(endpoint, dshUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(url);
  const close = () => {
    if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close();
  };
  signal.addEventListener("abort", close, { once: true });
  socket.addEventListener("open", () => {
    if (desktopBootstrap.dshReady && desktopBootstrap.startupError.startsWith("DSH 事件流")) {
      desktopBootstrap = { ...desktopBootstrap, startupError: "" };
      mainWindow?.webContents.send("desktop:runtime-error", "");
    }
  }, { once: true });
  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    try {
      const frame = JSON.parse(event.data) as { rpcId?: unknown; payload?: unknown };
      if (typeof frame.rpcId !== "string" || !frame.payload || typeof frame.payload !== "object") return;
      mainWindow?.webContents.send("desktop:dsh-frame", frame);
    } catch (error) {
      console.warn(`[Electron] Ignoring malformed DSH event frame from ${endpoint}`, error);
    }
  });
  socket.addEventListener("error", () => {
    if (!signal.aborted) reportRuntimeError(new Error(`DSH 事件流连接失败：${endpoint}`));
  }, { once: true });
  socket.addEventListener("close", () => {
    if (!signal.aborted) {
      setTimeout(() => connectDshEventSocket(dshUrl, endpoint, signal), 1_000);
    }
  }, { once: true });
}

function reportRuntimeError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  desktopBootstrap = { ...desktopBootstrap, startupError: message };
  mainWindow?.webContents.send("desktop:runtime-error", message);
}

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    configureBrowserPermissions();
    void requireSmbManager().mountAuto().catch((error) => console.warn("[Electron] SMB 自动挂载失败", error));
    mainWindow = createWindow();
    void beginDesktopStart();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length > 0) return;
    mainWindow = createWindow();
  });
}

app.on("before-quit", (event) => {
  if (quitting || !dshRuntime) return;
  event.preventDefault();
  quitting = true;
  dshEventController?.abort();
  void dshRuntime.stop().finally(() => app.quit());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
