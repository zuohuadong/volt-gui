import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronDsh', {
  getServerUrl: () => ipcRenderer.invoke('dsh:get-server-url'),
  openFolderDialog: () => ipcRenderer.invoke('dsh:open-folder-dialog'),
});
