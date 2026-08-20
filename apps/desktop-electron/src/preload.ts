import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronDsh', {
  getServerUrl: () => ipcRenderer.invoke('dsh:get-server-url'),
  openFolderDialog: () => ipcRenderer.invoke('dsh:open-folder-dialog'),
  getWorkingDir: () => ipcRenderer.invoke('dsh:get-working-dir'),
  setWorkingDir: (dir: string) => ipcRenderer.invoke('dsh:set-working-dir', dir),
  getConfig: () => ipcRenderer.invoke('dsh:get-config'),
  saveConfig: (cfg: any) => ipcRenderer.invoke('dsh:save-config', cfg),
  minimizeWindow: () => ipcRenderer.invoke('dsh:window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('dsh:window-maximize'),
  closeWindow: () => ipcRenderer.invoke('dsh:window-close'),
  isMaximized: () => ipcRenderer.invoke('dsh:window-is-maximized'),
  toggleDevTools: () => ipcRenderer.invoke('dsh:toggle-devtools'),
  onWindowStateChange: (callback: (state: { isMaximized: boolean }) => void) => {
    ipcRenderer.on('dsh:window-state-changed', (_e, state) => callback(state));
  },
});
