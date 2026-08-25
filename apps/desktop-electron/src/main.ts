import { app, BrowserWindow, dialog, Menu, session } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { OfficialDshRuntime, resolveOfficialDshBin } from "./official-dsh-runtime.js";
import { resolveElectronProfile } from "./electron-profile.js";

const electronProfile = resolveElectronProfile();
const gotSingleInstanceLock = app.requestSingleInstanceLock();

let mainWindow: BrowserWindow | null = null;
let dshRuntime: OfficialDshRuntime | null = null;
let quitting = false;

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
    : path.resolve(app.getAppPath(), "..", "..", "profiles", "anyong.yml");
}

function dshHomePath(): string {
  return process.env.DSH_HOME?.trim() || path.join(app.getPath("userData"), "dsh");
}

function nodeRuntimePath(): string {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, "node-runtime")
    : path.join(app.getAppPath(), ".node-runtime");
  return path.join(root, process.platform === "win32" ? "node.exe" : "node");
}

function createWindow(dshUrl: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 960,
    minHeight: 640,
    title: electronProfile.productName,
    backgroundColor: "#f6f6f5",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  const trustedOrigin = new URL(dshUrl).origin;
  window.removeMenu();
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (new URL(targetUrl).origin !== trustedOrigin) event.preventDefault();
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
  void window.loadURL(dshUrl);
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
  dshRuntime = new OfficialDshRuntime({
    dshBin: resolveOfficialDshBin(app.isPackaged ? process.resourcesPath : undefined),
    dshHome: dshHomePath(),
    patchFile: profilePatchPath(),
    workspace,
    executable: nodeRuntimePath(),
    executableArgs: ["--expose-internals"],
    onLog: (line) => console.log(`[DSH] ${line}`),
    onExit: (code, signal) => {
      if (quitting) return;
      console.error(`[Electron] Official DSH exited unexpectedly: code=${code} signal=${signal}`);
      dialog.showErrorBox("DSH runtime stopped", "The official DeepSeek Harness process exited. Restart the application to continue.");
      app.quit();
    },
  });
  const dshUrl = await dshRuntime.start();
  mainWindow = createWindow(dshUrl);
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

  app.whenReady().then(async () => {
    configureBrowserPermissions();
    await startDesktop();
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Electron] Failed to start official DSH:", error);
    dialog.showErrorBox("DSH startup failed", message);
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length > 0 || !dshRuntime?.url) return;
    mainWindow = createWindow(dshRuntime.url);
  });
}

app.on("before-quit", (event) => {
  if (quitting || !dshRuntime) return;
  event.preventDefault();
  quitting = true;
  void dshRuntime.stop().finally(() => app.quit());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
