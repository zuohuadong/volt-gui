import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DshServer } from '@dsh/server';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let dshServer: DshServer | null = null;
let serverUrl = '';

async function startDshBackend(): Promise<string> {
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const apiKey = process.env.DEEPSEEK_API_KEY || '';
  const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

  dshServer = new DshServer({
    port: 3210,
    host: '127.0.0.1',
    config: {
      model,
      apiKey,
      baseURL,
      workingDirectory: process.cwd(),
      compactReasoningInHistory: true,
      enableDegenerationGuard: true,
    },
  });

  serverUrl = await dshServer.start();
  console.log(`[Electron Main] DSH backend running at ${serverUrl}`);
  return serverUrl;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    title: '西谷智灯暗涌系统 (Anyong DSH)',
    backgroundColor: '#0f172a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Check frontend dist candidates
  const frontendCandidates = [
    path.join(__dirname, '..', '..', '..', 'anyong-agent', 'desktop', 'frontend', 'dist', 'index.html'),
    path.join(__dirname, '..', 'renderer', 'index.html'),
  ];

  let frontendPath = '';
  for (const p of frontendCandidates) {
    if (fs.existsSync(p)) {
      frontendPath = p;
      break;
    }
  }

  if (frontendPath) {
    await mainWindow.loadFile(frontendPath);
  } else {
    // If frontend is not yet built, serve clean embedded workbench shell
    const fallbackHtml = `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8" />
        <title>Anyong DSH</title>
        <style>
          body { margin: 0; background: #0b0f19; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; flex-direction: column; height: 100vh; }
          header { padding: 18px 24px; background: #111827; border-bottom: 1px solid #1f2937; display: flex; justify-content: space-between; align-items: center; }
          h1 { margin: 0; font-size: 1.1rem; color: #38bdf8; }
          .badge { font-size: 0.75rem; background: #0369a1; color: #e0f2fe; padding: 2px 8px; border-radius: 9999px; }
          main { flex: 1; display: flex; }
          #chat { flex: 1; display: flex; flex-direction: column; padding: 24px; gap: 16px; overflow-y: auto; }
          .bubble { background: #1e293b; padding: 14px 18px; border-radius: 8px; max-width: 80%; border: 1px solid #334155; }
          .thinking { color: #94a3b8; font-style: italic; font-size: 0.9rem; margin-bottom: 8px; border-left: 2px solid #38bdf8; padding-left: 8px; }
          .footer { padding: 16px 24px; background: #111827; border-top: 1px solid #1f2937; display: flex; gap: 12px; }
          input { flex: 1; background: #1e293b; border: 1px solid #334155; color: white; padding: 10px 14px; border-radius: 6px; outline: none; }
          button { background: #0284c7; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 600; }
          button:hover { background: #0369a1; }
        </style>
      </head>
      <body>
        <header>
          <h1>西谷智灯暗涌系统 <span class="badge">DSH 64-Token Cache Aligned</span></h1>
          <div id="status" style="font-size: 0.85rem; color: #94a3b8;">后端状态: 连接中...</div>
        </header>
        <main>
          <div id="chat">
            <div class="bubble">欢迎使用西谷智灯暗涌系统（Anyong DSH 深度重构版）。<br/>已启用 64-token 静态前缀对齐、双轨思考流与 MCP 插件原生集成。</div>
          </div>
        </main>
        <div class="footer">
          <input type="text" id="promptInput" placeholder="输入编码任务或问题，按回车提交..." />
          <button id="sendBtn">发送</button>
        </div>
        <script>
          const chat = document.getElementById('chat');
          const input = document.getElementById('promptInput');
          const btn = document.getElementById('sendBtn');
          const status = document.getElementById('status');

          async function checkHealth() {
            try {
              const res = await fetch('${serverUrl}/api/health');
              const data = await res.json();
              status.textContent = '已连接: ' + data.model + ' (' + data.toolsCount + ' 个工具可用)';
              status.style.color = '#4ade80';
            } catch (e) {
              status.textContent = '后端未响应';
              status.style.color = '#f87171';
            }
          }
          checkHealth();

          async function submit() {
            const val = input.value.trim();
            if (!val) return;
            input.value = '';

            const userBubble = document.createElement('div');
            userBubble.className = 'bubble';
            userBubble.style.alignSelf = 'flex-end';
            userBubble.style.background = '#0369a1';
            userBubble.textContent = val;
            chat.appendChild(userBubble);

            const aiBubble = document.createElement('div');
            aiBubble.className = 'bubble';
            aiBubble.innerHTML = '<div class="thinking" id="thk">正在思考...</div><div class="content" id="cnt"></div>';
            chat.appendChild(aiBubble);
            chat.scrollTop = chat.scrollHeight;

            const thkEl = aiBubble.querySelector('#thk');
            const cntEl = aiBubble.querySelector('#cnt');

            try {
              const res = await fetch('${serverUrl}/api/turn', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: val })
              });

              const reader = res.body.getReader();
              const dec = new TextDecoder();
              let buf = '';
              let hasContent = false;

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += dec.decode(value, { stream: true });
                const lines = buf.split('\\n');
                buf = lines.pop() || '';
                for (const line of lines) {
                  if (!line.startsWith('data: ')) continue;
                  const dataStr = line.slice(6);
                  if (dataStr === '[DONE]') return;
                  const evt = JSON.parse(dataStr);
                  if (evt.type === 'reasoning_delta') {
                    thkEl.textContent += evt.delta;
                  } else if (evt.type === 'content_delta') {
                    hasContent = true;
                    cntEl.textContent += evt.delta;
                  } else if (evt.type === 'tool_exec_start') {
                    cntEl.textContent += '\\n[执行工具: ' + evt.name + ']...';
                  }
                  chat.scrollTop = chat.scrollHeight;
                }
              }
            } catch (err) {
              cntEl.textContent = '错误: ' + err.message;
            }
          }

          btn.addEventListener('click', submit);
          input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
        </script>
      </body>
      </html>
    `;
    await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fallbackHtml)}`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('dsh:get-server-url', () => serverUrl);
ipcMain.handle('dsh:open-folder-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  });
  return result.filePaths[0] || null;
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
