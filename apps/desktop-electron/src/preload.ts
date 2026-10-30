import { contextBridge, ipcRenderer, webUtils } from "electron";

contextBridge.exposeInMainWorld("voltDesktop", {
  bootstrap: () => ipcRenderer.invoke("desktop:bootstrap"),
  retryRuntime: () => ipcRenderer.invoke("desktop:retry-runtime"),
  setNetworkMode: (mode: string) => ipcRenderer.invoke("desktop:network-mode", mode),
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
});
