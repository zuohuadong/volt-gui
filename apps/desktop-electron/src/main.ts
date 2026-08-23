import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DshServer } from '@dsh/server';
// 彻底清除 Windows/Linux 默认英文菜单栏 (File / Edit / View / Window / Help)
Menu.setApplicationMenu(null);

interface AppConfig {
  model: string;
  apiKey: string;
  baseURL: string;
  port: number;
  host: '127.0.0.1';
  compactReasoning: boolean;
  degenerationGuard: boolean;
}

interface PublicAppConfig extends Omit<AppConfig, 'apiKey'> {
  apiKeySet: boolean;
  brandName: string;
  brandShortName: string;
}

interface DshConnection {
  baseUrl: string;
  accessToken: string;
}

interface AppConfigPatch {
  model?: unknown;
  apiKey?: unknown;
  clearApiKey?: unknown;
  baseURL?: unknown;
  compactReasoning?: unknown;
  degenerationGuard?: unknown;
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let dshServer: DshServer | null = null;
let serverUrl = '';
const serverAccessToken = randomBytes(32).toString('base64url');
let restartQueue: Promise<void> = Promise.resolve();

function resolveInitialWorkingDirectory(): string {
  const configuredDirectory = process.env.DSH_WORKSPACE || process.env.INIT_CWD;
  if (configuredDirectory) {
    try {
      const resolvedDirectory = path.resolve(configuredDirectory);
      if (fs.statSync(resolvedDirectory).isDirectory()) return resolvedDirectory;
    } catch {
      console.warn(`[Electron Main] 初始工作区不可用，回退到用户主目录: ${configuredDirectory}`);
    }
  }
  return homedir();
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

function publicConfig(config = appConfig): PublicAppConfig {
  const { apiKey, ...safeConfig } = config;
  return { ...safeConfig, apiKeySet: Boolean(apiKey), brandName, brandShortName };
}

function serverConnection(): DshConnection {
  return { baseUrl: serverUrl, accessToken: serverAccessToken };
}

function normalizedConfigPatch(patch: AppConfigPatch): AppConfig {
  const next = { ...appConfig };

  if (patch.model !== undefined) {
    if (typeof patch.model !== 'string' || !patch.model.trim()) throw new Error('模型名称不能为空。');
    next.model = patch.model.trim();
  }

  if (patch.baseURL !== undefined) {
    if (typeof patch.baseURL !== 'string' || !patch.baseURL.trim()) throw new Error('接口地址不能为空。');
    const parsed = new URL(patch.baseURL.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('接口地址仅支持 HTTP 或 HTTPS。');
    next.baseURL = parsed.toString().replace(/\/$/, '');
  }

  if (patch.apiKey !== undefined) {
    if (typeof patch.apiKey !== 'string') throw new Error('API 密钥格式无效。');
    if (patch.apiKey.trim()) next.apiKey = patch.apiKey.trim();
  }
  if (patch.clearApiKey === true) next.apiKey = '';
  if (typeof patch.compactReasoning === 'boolean') next.compactReasoning = patch.compactReasoning;
  if (typeof patch.degenerationGuard === 'boolean') next.degenerationGuard = patch.degenerationGuard;

  return next;
}

async function launchDshBackend(config: AppConfig, workingDirectory: string) {
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

async function replaceDshBackend(nextConfig: AppConfig, nextWorkingDir: string): Promise<DshConnection> {
  const previousServer = dshServer;
  const launchConfig = previousServer ? { ...nextConfig, port: 0 } : nextConfig;
  const launched = await launchDshBackend(launchConfig, nextWorkingDir);

  if (previousServer) {
    try {
      await previousServer.stop();
    } catch (error) {
      await launched.server.stop().catch(() => undefined);
      throw error;
    }
  }

  dshServer = launched.server;
  serverUrl = launched.url;
  appConfig = { ...nextConfig, port: launched.port };
  currentWorkingDir = nextWorkingDir;
  console.log(`[Electron Main] DSH 智能后端已就绪: ${serverUrl}`);
  return serverConnection();
}

function startDshBackend(resolveTarget = () => ({ config: appConfig, workingDirectory: currentWorkingDir })): Promise<DshConnection> {
  const restart = restartQueue.then(() => {
    const target = resolveTarget();
    return replaceDshBackend({ ...target.config }, target.workingDirectory);
  });
  restartQueue = restart.then(() => undefined, () => undefined);
  return restart;
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
    mainWindow = null;
  });
}

// IPC 接口注册
ipcMain.handle('dsh:get-server-connection', () => serverConnection());
ipcMain.handle('dsh:get-working-dir', () => currentWorkingDir);
ipcMain.handle('dsh:get-config', () => publicConfig());

ipcMain.handle('dsh:save-config', async (_evt, patch: AppConfigPatch) => {
  try {
    await startDshBackend(() => ({
      config: normalizedConfigPatch(patch ?? {}),
      workingDirectory: currentWorkingDir,
    }));
    return { success: true, config: publicConfig(), connection: serverConnection() };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('重启后端服务失败:', error);
    return { success: false, config: publicConfig(), connection: serverConnection(), error: message };
  }
});

ipcMain.handle('dsh:set-working-dir', async (_evt, dirPath) => {
  if (typeof dirPath !== 'string') return { success: false, error: '目标路径无效' };

  try {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      return { success: false, error: '目标路径不存在或不是目录' };
    }
    await startDshBackend(() => ({ config: appConfig, workingDirectory: dirPath }));
    return { success: true, workingDir: currentWorkingDir, connection: serverConnection() };
  } catch (error: unknown) {
    return { success: false, workingDir: currentWorkingDir, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('dsh:open-folder-dialog', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    defaultPath: currentWorkingDir,
    title: '选择工作区目录',
  });
  if (result.filePaths && result.filePaths.length > 0) {
    try {
      await startDshBackend(() => ({ config: appConfig, workingDirectory: result.filePaths[0] }));
      return { success: true, workingDir: currentWorkingDir, connection: serverConnection() };
    } catch (error: unknown) {
      return { success: false, workingDir: currentWorkingDir, error: error instanceof Error ? error.message : String(error) };
    }
  }
  return null;
});

ipcMain.handle('dsh:window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('dsh:window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('dsh:window-close', () => {
  mainWindow?.close();
});

ipcMain.handle('dsh:window-is-maximized', () => {
  return mainWindow?.isMaximized() ?? false;
});

ipcMain.handle('dsh:toggle-devtools', () => {
  mainWindow?.webContents.toggleDevTools();
});

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
      await startDshBackend();
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
  if (dshServer) {
    await dshServer.stop();
    dshServer = null;
    serverUrl = '';
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
