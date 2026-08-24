import { app, BrowserWindow, ipcMain, dialog, Menu, safeStorage } from 'electron';
import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DshServer } from '@dsh/server';
import { normalizedConfigPatch } from './runtime-config.js';
import type { AppConfig, AppConfigPatch } from './runtime-config.js';
import { ElectronPersistence, resolveVoltHome } from './persistence.js';
import { ElectronToolPermissionBroker } from './tool-permission-broker.js';
import { discoverWorkspaceMcp, type DiscoveredMcpConfig } from '@dsh/plugins';
import { resolveElectronProfile } from './electron-profile.js';
import type { Message, ToolPermissionMode } from '@dsh/core';
// 彻底清除 Windows/Linux 默认英文菜单栏 (File / Edit / View / Window / Help)
const electronProfile = resolveElectronProfile();
app.setAppUserModelId(electronProfile.appId);
Menu.setApplicationMenu(null);

interface PublicAppConfig extends Omit<AppConfig, 'apiKey'> {
  apiKeySet: boolean;
  brandName: string;
  brandShortName: string;
  managedFields: Array<'model' | 'baseURL' | 'apiKey'>;
}

interface DshConnection {
  baseUrl: string;
  accessToken: string;
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let dshServer: DshServer | null = null;
let serverUrl = '';
const serverAccessToken = randomBytes(32).toString('base64url');
let restartQueue: Promise<void> = Promise.resolve();
let persistence: ElectronPersistence | null = null;
let permissionBroker: ElectronToolPermissionBroker | null = null;
let activeMcp: DiscoveredMcpConfig['servers'] = [];

function canonicalizeWorkingDirectory(directory: string): string {
  const canonical = fs.realpathSync(path.resolve(directory));
  if (!fs.statSync(canonical).isDirectory()) throw new Error('工作区路径不是目录。');
  return canonical;
}

function resolveInitialWorkingDirectory(): string {
  const configuredDirectory = process.env.DSH_WORKSPACE || process.env.INIT_CWD;
  if (configuredDirectory) {
    try {
      return canonicalizeWorkingDirectory(configuredDirectory);
    } catch {
      console.warn(`[Electron Main] 初始工作区不可用，回退到用户主目录: ${configuredDirectory}`);
    }
  }
  return canonicalizeWorkingDirectory(homedir());
}

let currentWorkingDir = resolveInitialWorkingDirectory();
const DEFAULT_DSH_PORT = 3210;
const DSH_PORT_SEARCH_LIMIT = 10;
const brandName = process.env.VOLTUI_BRAND_NAME?.trim() || 'VoltUI';
const brandShortName = process.env.VOLTUI_BRAND_SHORT_NAME?.trim() || 'Volt';

let appConfig: AppConfig = {
  model: process.env.DEEPSEEK_MODEL || process.env.DSH_MODEL || 'deepseek-chat',
  apiKey: process.env.DEEPSEEK_API_KEY || process.env.DSH_API_KEY || '',
  baseURL: process.env.DEEPSEEK_BASE_URL || process.env.DSH_BASE_URL || 'https://api.deepseek.com',
  port: DEFAULT_DSH_PORT,
  host: '127.0.0.1',
  compactReasoning: true,
  degenerationGuard: true,
};
function isTrustedSender(event: Electron.IpcMainInvokeEvent): boolean {
  return event.sender === mainWindow?.webContents;
}

function safeStorageAdapter() {
  let backend: string | undefined;
  try {
    backend = typeof safeStorage.getSelectedStorageBackend === 'function'
      ? safeStorage.getSelectedStorageBackend()
      : undefined;
  } catch {
    backend = undefined;
  }
  return {
    isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
    encryptString: (value: string) => safeStorage.encryptString(value),
    decryptString: (value: Buffer) => safeStorage.decryptString(value),
    backend,
  };
}

async function prepareWorkspace(directory: string, allowPrompt: boolean): Promise<{
  canonicalRoot: string;
  mcpServers: DiscoveredMcpConfig['servers'];
}> {
  const canonicalRoot = canonicalizeWorkingDirectory(directory);
  const discovered = await discoverWorkspaceMcp(canonicalRoot);
  if (discovered.servers.length === 0) return { canonicalRoot, mcpServers: [] };
  const trusted = persistence ? await persistence.isWorkspaceTrusted(canonicalRoot, discovered.fingerprint) : false;
  if (trusted) return { canonicalRoot, mcpServers: discovered.servers };
  if (!allowPrompt || !mainWindow) return { canonicalRoot, mcpServers: [] };

  const choice = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: '工作区 MCP 信任',
    message: '此工作区声明了 MCP 服务器。是否信任并启动这些外部进程？',
    detail: '未信任时仍可打开工作区，但不会启动 MCP。',
    buttons: ['信任并启动 MCP', '打开但不启动 MCP', '取消'],
    defaultId: 1,
    cancelId: 2,
  });
  if (choice.response === 2) throw new Error('已取消工作区切换。');
  if (choice.response === 0 && persistence) {
    await persistence.trustWorkspace({
      canonicalRoot,
      fingerprint: discovered.fingerprint,
      trustedAt: new Date().toISOString(),
    });
    return { canonicalRoot, mcpServers: discovered.servers };
  }
  return { canonicalRoot, mcpServers: [] };
}

function managedConfigFields(): PublicAppConfig['managedFields'] {
  const fields: PublicAppConfig['managedFields'] = [];
  if (process.env.DEEPSEEK_MODEL || process.env.DSH_MODEL) fields.push('model');
  if (process.env.DEEPSEEK_BASE_URL || process.env.DSH_BASE_URL) fields.push('baseURL');
  if (process.env.DEEPSEEK_API_KEY || process.env.DSH_API_KEY) fields.push('apiKey');
  return fields;
}

function assertConfigPatchWritable(patch: AppConfigPatch): void {
  const managed = new Set(managedConfigFields());
  if (managed.has('model') && patch.model !== undefined) throw new Error('模型由环境变量管理，无法在应用内修改。');
  if (managed.has('baseURL') && patch.baseURL !== undefined) throw new Error('接口地址由环境变量管理，无法在应用内修改。');
  if (managed.has('apiKey') && (patch.apiKey !== undefined || patch.clearApiKey !== undefined)) throw new Error('API 密钥由环境变量管理，无法在应用内修改。');
}

async function loadPersistedState(): Promise<void> {
  persistence = new ElectronPersistence(resolveVoltHome(app.getPath('appData')), safeStorageAdapter());
  const persisted = await persistence.loadRuntimeConfig({
    model: appConfig.model,
    baseURL: appConfig.baseURL,
    compactReasoning: appConfig.compactReasoning,
    degenerationGuard: appConfig.degenerationGuard,
  });
  const persistedWorkspace = await persistence.loadWorkspaceState();
  if (!process.env.DSH_WORKSPACE && !process.env.INIT_CWD && persistedWorkspace) {
    currentWorkingDir = canonicalizeWorkingDirectory(persistedWorkspace.canonicalRoot);
  }

  let persistedKey = '';
  if (!process.env.DEEPSEEK_API_KEY && !process.env.DSH_API_KEY) {
    try {
      persistedKey = await persistence.loadApiKey();
    } catch (error) {
      console.warn('[Electron Main] 已保存的 API 密钥不可用，需要重新输入。', error);
    }
  }
  appConfig = {
    ...appConfig,
    model: process.env.DEEPSEEK_MODEL || process.env.DSH_MODEL || persisted.model,
    baseURL: process.env.DEEPSEEK_BASE_URL || process.env.DSH_BASE_URL || persisted.baseURL,
    apiKey: process.env.DEEPSEEK_API_KEY || process.env.DSH_API_KEY || persistedKey,
    compactReasoning: persisted.compactReasoning,
    degenerationGuard: persisted.degenerationGuard,
  };
}

function publicConfig(config = appConfig): PublicAppConfig {
  const { apiKey, ...safeConfig } = config;
  return { ...safeConfig, apiKeySet: Boolean(apiKey), brandName, brandShortName, managedFields: managedConfigFields() };
}

function runtimeConfigForPersistence(config: AppConfig) {
  return {
    model: config.model,
    baseURL: config.baseURL,
    compactReasoning: config.compactReasoning,
    degenerationGuard: config.degenerationGuard,
  };
}

function apiKeyForPersistence(config: AppConfig): string | undefined {
  return managedConfigFields().includes("apiKey") ? undefined : config.apiKey;
}

function serverConnection(): DshConnection {
  return { baseUrl: serverUrl, accessToken: serverAccessToken };
}

interface BackendTarget {
  config: AppConfig;
  workingDirectory: string;
  mcpServers?: DiscoveredMcpConfig['servers'];
  initialHistory?: Message[];
  commit?: () => Promise<void>;
}

async function launchDshBackend(
  config: AppConfig,
  workingDirectory: string,
  mcpServers: DiscoveredMcpConfig['servers'],
  initialHistory: Message[],
) {
  const preferredPort = Number.isInteger(config.port) ? config.port : DEFAULT_DSH_PORT;
  const candidatePorts = preferredPort === 0
    ? [0]
    : [
        ...Array.from(new Set(Array.from({ length: DSH_PORT_SEARCH_LIMIT }, (_, index) => preferredPort + index))),
        0,
      ];

  for (const port of candidatePorts) {
    const candidate = new DshServer({
      port,
      host: config.host,
      authorizationBroker: permissionBroker ?? undefined,
      mcpServers,
      initialHistory,
      persistHistory: async (messages) => {
        if (persistence) await persistence.saveSession(workingDirectory, messages);
      },
      authToken: serverAccessToken,
      allowedOrigins: ['null'],
      config: {
        model: config.model,
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        workingDirectory,
        compactReasoningInHistory: config.compactReasoning,
        enableDegenerationGuard: config.degenerationGuard,
      },
    });

    try {
      const url = await candidate.start();
      return { server: candidate, url, port: Number(new URL(url).port) };
    } catch (error: unknown) {
      await candidate.stop().catch(() => undefined);
      const code = error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : undefined;
      if (code !== 'EADDRINUSE' || port === 0) throw error;
      console.warn(`[Electron Main] DSH 端口 ${port} 已被占用，尝试下一个端口。`);
    }
  }

  throw new Error('未能找到可用的 DSH 本机端口。');
}

async function replaceDshBackend(target: BackendTarget): Promise<DshConnection> {
  const nextConfig = target.config;
  const nextWorkingDir = target.workingDirectory;
  const nextMcp = target.mcpServers ?? activeMcp;
  const initialHistory = target.initialHistory ?? dshServer?.getEngine().getHistory() ?? [];
  const previousServer = dshServer;
  const previousConfig = { ...appConfig };
  const previousWorkingDir = currentWorkingDir;
  const previousMcp = activeMcp;
  const previousHistory = previousServer?.getEngine().getHistory() ?? [];
  const launchConfig = previousServer ? { ...nextConfig, port: 0 } : nextConfig;
  const launched = await launchDshBackend(launchConfig, nextWorkingDir, nextMcp, initialHistory);
  let previousStopped = false;

  try {
    if (previousServer) {
      await previousServer.stop();
      previousStopped = true;
      permissionBroker?.cancelAll("DSH runtime changed.");
    }
    await target.commit?.();
  } catch (error) {
    await launched.server.stop().catch(() => undefined);
    if (previousServer && previousStopped) {
      try {
        const restored = await launchDshBackend(
          { ...previousConfig, port: 0 },
          previousWorkingDir,
          previousMcp,
          previousHistory,
        );
        dshServer = restored.server;
        serverUrl = restored.url;
        appConfig = { ...previousConfig, port: restored.port };
        activeMcp = previousMcp;
        currentWorkingDir = previousWorkingDir;
      } catch (restoreError) {
        dshServer = null;
        serverUrl = "";
        console.error("[Electron Main] 旧 DSH 运行时恢复失败:", restoreError);
      }
    }
    throw error;
  }

  dshServer = launched.server;
  serverUrl = launched.url;
  appConfig = { ...nextConfig, port: launched.port };
  activeMcp = nextMcp;
  currentWorkingDir = nextWorkingDir;
  console.log("[Electron Main] DSH 智能后端已就绪: " + serverUrl);
  return serverConnection();
}

function startDshBackend(
  resolveTarget: () => BackendTarget = () => ({ config: appConfig, workingDirectory: currentWorkingDir }),
): Promise<DshConnection> {
  const restart = restartQueue.then(() => {
    const target = resolveTarget();
    return replaceDshBackend({ ...target, config: { ...target.config } });
  });
  restartQueue = restart.then(() => undefined, () => undefined);
  return restart;
}

async function prepareBackendTarget(directory: string, allowPrompt: boolean): Promise<BackendTarget> {
  if (dshServer?.hasActiveTurn()) throw new Error("当前任务正在执行，完成或停止后再切换运行配置。");
  const prepared = await prepareWorkspace(directory, allowPrompt);
  const session = persistence ? await persistence.loadSession(prepared.canonicalRoot) : { messages: [] as Message[] };
  if (session.warning) console.warn("[Electron Main] " + session.warning);
  return {
    config: appConfig,
    workingDirectory: prepared.canonicalRoot,
    mcpServers: prepared.mcpServers,
    initialHistory: session.messages,
    commit: async () => {
      if (persistence) await persistence.saveWorkspaceState(prepared.canonicalRoot);
    },
  };
}

function requireTrustedSender(event: Electron.IpcMainInvokeEvent): void {
  if (!isTrustedSender(event)) throw new Error("不受信任的 Electron IPC 调用。");
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1060,
    minHeight: 680,
    title: `${brandName} 工作台`,
    backgroundColor: '#F6F6F5',
    frame: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.removeMenu();
  mainWindow.setMenuBarVisibility(false);

  let showFallback: NodeJS.Timeout | undefined;
  const showMainWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (showFallback) {
      clearTimeout(showFallback);
      showFallback = undefined;
    }
    mainWindow.show();
    mainWindow.focus();
  };

  // 注册必须发生在 loadFile 之前。首次绘制可能在 loadFile 的 Promise
  // resolve 前完成，晚注册会让窗口永远保持 show: false。
  mainWindow.once('ready-to-show', showMainWindow);
  mainWindow.webContents.once('did-finish-load', showMainWindow);
  mainWindow.webContents.once('did-fail-load', (_event, code, description) => {
    console.error(`[Electron Main] 工作台页面加载失败 (${code}): ${description}`);
    showMainWindow();
  });
  showFallback = setTimeout(showMainWindow, 5_000);

  // 彻底屏蔽 Alt 键呼出 Windows 默认隐藏菜单
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Alt') {
      event.preventDefault();
    }
  });

  // 阻止默认英文右键菜单
  mainWindow.webContents.on('context-menu', (e) => {
    e.preventDefault();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (targetUrl !== mainWindow?.webContents.getURL()) event.preventDefault();
  });

  // 监听窗口最大化与还原事件同步给渲染层
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('dsh:window-state-changed', { isMaximized: true });
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('dsh:window-state-changed', { isMaximized: false });
  });

  const rendererPath = path.join(__dirname, 'renderer', 'electron.html');
  const fallbackPath = path.join(__dirname, 'workbench.html');

  if (fs.existsSync(rendererPath)) {
    await mainWindow.loadFile(rendererPath);
  } else if (fs.existsSync(fallbackPath)) {
    console.error(`[Electron Main] Electron 渲染产物缺失: ${rendererPath}`);
    await mainWindow.loadFile(fallbackPath);
  } else {
    console.error('[Electron Main] 未找到 Electron 工作台或故障提示页。');
    showMainWindow();
  }

  mainWindow.on('closed', () => {
    if (showFallback) clearTimeout(showFallback);
    permissionBroker?.cancelAll("Electron window closed.");
    mainWindow = null;
  });
}

// IPC 接口注册
ipcMain.handle("dsh:get-server-connection", (event) => { requireTrustedSender(event); return serverConnection(); });
ipcMain.handle("dsh:get-working-dir", (event) => { requireTrustedSender(event); return currentWorkingDir; });
ipcMain.handle("dsh:get-config", (event) => { requireTrustedSender(event); return publicConfig(); });
ipcMain.handle("dsh:get-permission-mode", (event) => {
  requireTrustedSender(event);
  return permissionBroker?.getMode() ?? "ask";
});
ipcMain.handle("dsh:set-permission-mode", (event, mode: unknown) => {
  requireTrustedSender(event);
  if (!permissionBroker) throw new Error("工具授权 broker 尚未就绪。");
  const nextMode: ToolPermissionMode = permissionBroker.setMode(mode);
  return nextMode;
});
ipcMain.handle("dsh:resolve-tool-approval", (event, requestId: unknown, decision: unknown) => {
  requireTrustedSender(event);
  if (typeof requestId !== "string" || !permissionBroker?.resolve(requestId, decision)) {
    return { success: false, error: "审批请求无效或已失效。" };
  }
  return { success: true };
});

ipcMain.handle("dsh:save-config", async (event, patch: AppConfigPatch) => {
  requireTrustedSender(event);
  try {
    const safePatch = patch ?? {};
    assertConfigPatchWritable(safePatch);
    const candidateConfig = normalizedConfigPatch(appConfig, safePatch);
    const keyUpdate = managedConfigFields().includes("apiKey")
      ? undefined
      : safePatch.clearApiKey === true
        ? ""
        : typeof safePatch.apiKey === "string" && safePatch.apiKey.trim()
          ? candidateConfig.apiKey
          : undefined;
    await startDshBackend(() => ({
      config: candidateConfig,
      workingDirectory: currentWorkingDir,
      commit: async () => {
        if (persistence) await persistence.saveRuntimeConfig(runtimeConfigForPersistence(candidateConfig), keyUpdate);
      },
    }));
    return { success: true, config: publicConfig(), connection: serverConnection() };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("重启后端服务失败:", error);
    return { success: false, config: publicConfig(), connection: serverConnection(), error: message };
  }
});

ipcMain.handle("dsh:set-working-dir", async (event, dirPath: unknown) => {
  requireTrustedSender(event);
  if (typeof dirPath !== "string") return { success: false, error: "目标路径无效" };
  try {
    const target = await prepareBackendTarget(dirPath, true);
    await startDshBackend(() => target);
    return { success: true, workingDir: currentWorkingDir, connection: serverConnection() };
  } catch (error: unknown) {
    return { success: false, workingDir: currentWorkingDir, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("dsh:open-folder-dialog", async (event) => {
  requireTrustedSender(event);
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    defaultPath: currentWorkingDir,
    title: "选择工作区目录",
  });
  if (!result.filePaths?.length) return null;
  try {
    const target = await prepareBackendTarget(result.filePaths[0], true);
    await startDshBackend(() => target);
    return { success: true, workingDir: currentWorkingDir, connection: serverConnection() };
  } catch (error: unknown) {
    return { success: false, workingDir: currentWorkingDir, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("dsh:window-minimize", (event) => { requireTrustedSender(event); mainWindow?.minimize(); });
ipcMain.handle("dsh:window-maximize", (event) => {
  requireTrustedSender(event);
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle("dsh:window-close", (event) => { requireTrustedSender(event); mainWindow?.close(); });
ipcMain.handle("dsh:window-is-maximized", (event) => { requireTrustedSender(event); return mainWindow?.isMaximized() ?? false; });
ipcMain.handle("dsh:toggle-devtools", (event) => { requireTrustedSender(event); mainWindow?.webContents.toggleDevTools(); });

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    try {
      await loadPersistedState();
      permissionBroker = new ElectronToolPermissionBroker((prompt) => {
        if (!mainWindow || mainWindow.isDestroyed()) return false;
        mainWindow.webContents.send("dsh:tool-approval-requested", prompt);
        return true;
      });
      const initialTarget = await prepareBackendTarget(currentWorkingDir, false);
      await startDshBackend(() => initialTarget);
    } catch (error) {
      console.error('[Electron Main] DSH 后端启动失败:', error);
      dialog.showErrorBox('DSH 后端启动失败', '本机服务未能启动，应用仍会打开以便查看配置。');
    }
    await createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', async () => {
  await restartQueue;
  permissionBroker?.cancelAll("Application is closing.");
  if (dshServer) {
    await dshServer.stop();
    dshServer = null;
    serverUrl = '';
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
