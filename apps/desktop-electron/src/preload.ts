import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("voltDesktop", {
  bootstrap: () => ipcRenderer.invoke("desktop:bootstrap"),
  minimize: () => ipcRenderer.invoke("desktop:minimize"),
  maximize: () => ipcRenderer.invoke("desktop:maximize"),
  close: () => ipcRenderer.invoke("desktop:close"),
  pickWorkspace: () => ipcRenderer.invoke("desktop:pick-workspace"),
  exportSession: (sessionId: string) => ipcRenderer.invoke("desktop:export-session", sessionId),
  smbList: () => ipcRenderer.invoke("desktop:smb-list"),
  smbMount: (request: unknown) => ipcRenderer.invoke("desktop:smb-mount", request),
  smbUnmount: (id: string) => ipcRenderer.invoke("desktop:smb-unmount", id),
  smbRemove: (id: string) => ipcRenderer.invoke("desktop:smb-remove", id),
  smbOpen: (localPath: string) => ipcRenderer.invoke("desktop:smb-open", localPath),
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
});
