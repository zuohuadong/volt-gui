import { contextBridge, ipcRenderer, webUtils } from "electron";

/** 协议名大小写不敏感（Windows 注册表就是这样）；主进程已统一规范化后再取用。 */
function isAgentConfigLink(value: string): boolean {
  return value.slice(0, "agentconfig://".length).toLowerCase() === "agentconfig://";
}

contextBridge.exposeInMainWorld("voltDesktop", {
  bootstrap: () => ipcRenderer.invoke("desktop:bootstrap"),
  retryRuntime: () => ipcRenderer.invoke("desktop:retry-runtime"),
  setNetworkMode: (mode: string) => ipcRenderer.invoke("desktop:network-mode", mode),
  setCapabilities: (patch: Record<string, boolean>) => ipcRenderer.invoke("desktop:capabilities", patch),
  minimize: () => ipcRenderer.invoke("desktop:minimize"),
  maximize: () => ipcRenderer.invoke("desktop:maximize"),
  close: () => ipcRenderer.invoke("desktop:close"),
  openExternal: (url: string) => ipcRenderer.invoke("desktop:open-external", url),
  microphoneAccess: () => ipcRenderer.invoke("desktop:microphone-access"),
  openMicrophoneSettings: () => ipcRenderer.invoke("desktop:open-microphone-settings"),
  copyText: (text: string) => ipcRenderer.invoke("desktop:copy-text", text),
  checkForUpdate: () => ipcRenderer.invoke("desktop:check-for-update"),
  resetBundledModelCredential: () => ipcRenderer.invoke("desktop:reset-bundled-model-credential"),
  captureScreen: () => ipcRenderer.invoke("desktop:capture-screen"),
  cropScreenshot: (image: string, selection: unknown) => ipcRenderer.invoke("desktop:crop-screenshot", { image, selection }),
  browserExtension: () => ipcRenderer.invoke("desktop:browser-extension"),
  openBrowserExtensionFolder: () => ipcRenderer.invoke("desktop:browser-extension-open"),
  browserExtensionBrowsers: () => ipcRenderer.invoke("desktop:browser-extension-browsers"),
  openBrowserExtensionPage: (browserId: string) => ipcRenderer.invoke("desktop:browser-extension-open-page", browserId),
  pickWorkspace: () => ipcRenderer.invoke("desktop:pick-workspace"),
  exportSession: (sessionId: string) => ipcRenderer.invoke("desktop:export-session", sessionId),
  deleteArchivedSession: (sessionId: string) => ipcRenderer.invoke("desktop:delete-archived-session", sessionId),
  smbList: () => ipcRenderer.invoke("desktop:smb-list"),
  smbMount: (request: unknown) => ipcRenderer.invoke("desktop:smb-mount", request),
  smbUnmount: (id: string) => ipcRenderer.invoke("desktop:smb-unmount", id),
  smbRemove: (id: string) => ipcRenderer.invoke("desktop:smb-remove", id),
  smbOpen: (localPath: string) => ipcRenderer.invoke("desktop:smb-open", localPath),
  skillsList: () => ipcRenderer.invoke("desktop:skills-list"),
  skillsInstall: (id: string, version?: string) => ipcRenderer.invoke("desktop:skills-install", id, version),
  skillsRemove: (id: string) => ipcRenderer.invoke("desktop:skills-remove", id),
  skillsRollback: (id: string) => ipcRenderer.invoke("desktop:skills-rollback", id),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  dshRequest: (method: string, payload: unknown) => ipcRenderer.invoke("desktop:dsh-request", method, payload),
  dshRespond: (message: unknown) => ipcRenderer.invoke("desktop:dsh-respond", message),
  onDshFrame: (listener: (frame: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, frame: unknown) => listener(frame);
    ipcRenderer.on("desktop:dsh-frame", handler);
    return () => ipcRenderer.removeListener("desktop:dsh-frame", handler);
  },
  onRuntimeError: (listener: (message: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, message: string) => listener(message);
    ipcRenderer.on("desktop:runtime-error", handler);
    return () => ipcRenderer.removeListener("desktop:runtime-error", handler);
  },
  onRuntimeReady: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on("desktop:runtime-ready", handler);
    return () => ipcRenderer.removeListener("desktop:runtime-ready", handler);
  },
  onAgentConfigLink: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on("desktop:agentconfig-link", handler);
    return () => ipcRenderer.removeListener("desktop:agentconfig-link", handler);
  },
  pendingAgentConfigLinks: async () => {
    const links = await ipcRenderer.invoke("desktop:agentconfig-pending");
    if (!Array.isArray(links)) return [];
    // 与 onAgentConfigLink 用同一套过滤，避免把主进程的意外值透给渲染层。
    return links.filter((link): link is string => typeof link === "string" && isAgentConfigLink(link));
  },
  /** 已处理完这条链接；主进程会把它（以及更早的）移出队列。 */
  ackAgentConfigLink: (link: string) => ipcRenderer.invoke("desktop:agentconfig-ack", link),
  // 待发送队列来自官方 session/observeState 流：渲染层告诉主进程现在看哪个会话。
  observeSessionState: (sessionId: string) => ipcRenderer.invoke("desktop:observe-session-state", sessionId),
  // 官方 host 的变更记录路由：由主进程带 cookie 读取，渲染层只拿结构化结果。
  readChangesSummary: (sessionId: string, seq: number) => ipcRenderer.invoke("desktop:changes-summary", sessionId, seq),
  readChangesDiff: (sessionId: string, seq: number, index: number) => ipcRenderer.invoke("desktop:changes-diff", sessionId, seq, index),
  // 后台任务：花名册与输出都是宿主流，主进程转成帧；终止是一次普通 RPC。
  observeJobRoster: (sessionId: string) => ipcRenderer.invoke("desktop:observe-job-roster", sessionId),
  killJob: (sessionId: string, jobId: string) => ipcRenderer.invoke("desktop:job-kill", sessionId, jobId),
  followJob: (sessionId: string, jobId: string) => ipcRenderer.invoke("desktop:follow-job", sessionId, jobId),
  unfollowJob: () => ipcRenderer.invoke("desktop:unfollow-job"),
  // 终端：创建会分配一个官方 shell 并打开双向 attach 流；输入/尺寸/关闭都走这里。
  startTerminal: (sessionId: string, cols: number, rows: number, terminalId?: string) => ipcRenderer.invoke("desktop:terminal-start", sessionId, cols, rows, terminalId),
  writeTerminal: (data: string, typed = false) => ipcRenderer.invoke("desktop:terminal-input", data, typed),
  resizeTerminal: (cols: number, rows: number) => ipcRenderer.invoke("desktop:terminal-resize", cols, rows),
  closeTerminal: (terminalId?: string) => ipcRenderer.invoke("desktop:terminal-close", terminalId),
});
