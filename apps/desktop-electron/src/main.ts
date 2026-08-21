import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DshServer } from '@dsh/server';
// 彻底清除 Windows/Linux 默认英文菜单栏 (File / Edit / View / Window / Help)
Menu.setApplicationMenu(null);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let dshServer: DshServer | null = null;
let serverUrl = '';
let currentWorkingDir = process.cwd();

let appConfig = {
  model: process.env.DEEPSEEK_MODEL || process.env.DSH_MODEL || 'deepseek-v4-flash',
  apiKey: process.env.DEEPSEEK_API_KEY || process.env.DSH_API_KEY || '[REDACTED_SECRET]',
  baseURL: process.env.DEEPSEEK_BASE_URL || process.env.DSH_BASE_URL || 'http://192.168.1.47:9010/v1',
  port: 3210,
  host: '127.0.0.1',
  align64Prefix: true,
  compactReasoning: true,
  degenerationGuard: true,
  autoCollapseThinking: false,
  fontSize: '14px',
  sandboxLevel: 'standard',
};

async function startDshBackend(): Promise<string> {
  if (dshServer) {
    try {
      await dshServer.stop();
    } catch (e) {
      console.warn('[Electron Main] 停止旧后端服务警告:', e);
    }
  }

  dshServer = new DshServer({
    port: appConfig.port,
    host: appConfig.host,
    config: {
      model: appConfig.model,
      apiKey: appConfig.apiKey,
      baseURL: appConfig.baseURL,
      workingDirectory: currentWorkingDir,
      compactReasoningInHistory: appConfig.compactReasoning,
      enableDegenerationGuard: appConfig.degenerationGuard,
    },
  });

  serverUrl = await dshServer.start();
  console.log(`[Electron Main] DSH 智能后端已就绪: ${serverUrl}`);
  return serverUrl;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1060,
    minHeight: 680,
    title: '暗涌智能 · Anyong DSH 工作台',
    backgroundColor: '#080b12',
    frame: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      spellcheck: false,
    },
  });

  mainWindow.removeMenu();
  mainWindow.setMenuBarVisibility(false);

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

  // 监听窗口最大化与还原事件同步给渲染层
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('dsh:window-state-changed', { isMaximized: true });
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('dsh:window-state-changed', { isMaximized: false });
  });

  const htmlCandidates = [
    path.join(__dirname, 'renderer', 'index.html'),
    path.join(__dirname, 'workbench.html'),
    path.join(__dirname, '..', 'dist', 'renderer', 'index.html'),
    path.join(__dirname, '..', 'src', 'workbench.html'),
  ];

  let targetHtml = '';
  for (const candidate of htmlCandidates) {
    if (fs.existsSync(candidate)) {
      targetHtml = candidate;
      break;
    }
  }

  if (targetHtml) {
    await mainWindow.loadFile(targetHtml);
  } else {
    const fallbackPath = path.join(__dirname, 'workbench.html');
    if (fs.existsSync(fallbackPath)) {
      await mainWindow.loadFile(fallbackPath);
    }
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC 接口注册
ipcMain.handle('dsh:get-server-url', () => serverUrl);
ipcMain.handle('dsh:get-working-dir', () => currentWorkingDir);
ipcMain.handle('dsh:get-config', () => appConfig);

ipcMain.handle('dsh:save-config', async (_evt, newConfig) => {
  appConfig = { ...appConfig, ...newConfig };
  try {
    await startDshBackend();
  } catch (err: any) {
    console.error('重启后端服务失败:', err);
  }
  return { success: true, config: appConfig, serverUrl };
});

ipcMain.handle('dsh:set-working-dir', async (_evt, dirPath) => {
  if (dirPath && fs.existsSync(dirPath)) {
    currentWorkingDir = dirPath;
    try {
      await startDshBackend();
    } catch {}
    return { success: true, workingDir: currentWorkingDir };
  }
  return { success: false, error: '目标路径不存在' };
});

ipcMain.handle('dsh:open-folder-dialog', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    defaultPath: currentWorkingDir,
    title: '选择工作区目录',
  });
  if (result.filePaths && result.filePaths.length > 0) {
    currentWorkingDir = result.filePaths[0];
    try {
      await startDshBackend();
    } catch {}
    return currentWorkingDir;
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

app.whenReady().then(async () => {
  await startDshBackend();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  if (dshServer) {
    await dshServer.stop();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
