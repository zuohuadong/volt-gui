import { contextBridge, ipcRenderer } from 'electron';

interface DshConfigPatch {
  model?: string;
  apiKey?: string;
  clearApiKey?: boolean;
  baseURL?: string;
  compactReasoning?: boolean;
  degenerationGuard?: boolean;
}

contextBridge.exposeInMainWorld('electronDsh', {
  getServerConnection: () => ipcRenderer.invoke('dsh:get-server-connection'),
  openFolderDialog: () => ipcRenderer.invoke('dsh:open-folder-dialog'),
  getWorkingDir: () => ipcRenderer.invoke('dsh:get-working-dir'),
  setWorkingDir: (dir: string) => ipcRenderer.invoke('dsh:set-working-dir', dir),
  getConfig: () => ipcRenderer.invoke('dsh:get-config'),
  saveConfig: (config: DshConfigPatch) => ipcRenderer.invoke('dsh:save-config', config),
  minimizeWindow: () => ipcRenderer.invoke('dsh:window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('dsh:window-maximize'),
  closeWindow: () => ipcRenderer.invoke('dsh:window-close'),
  isMaximized: () => ipcRenderer.invoke('dsh:window-is-maximized'),
  toggleDevTools: () => ipcRenderer.invoke('dsh:toggle-devtools'),
  onWindowStateChange: (callback: (state: { isMaximized: boolean }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: { isMaximized: boolean }) => callback(state);
    ipcRenderer.on('dsh:window-state-changed', listener);
    return () => ipcRenderer.removeListener('dsh:window-state-changed', listener);
  },
});
