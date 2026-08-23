"use strict";

// src/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electronDsh", {
  getServerConnection: () => import_electron.ipcRenderer.invoke("dsh:get-server-connection"),
  openFolderDialog: () => import_electron.ipcRenderer.invoke("dsh:open-folder-dialog"),
  getWorkingDir: () => import_electron.ipcRenderer.invoke("dsh:get-working-dir"),
  setWorkingDir: (dir) => import_electron.ipcRenderer.invoke("dsh:set-working-dir", dir),
  getConfig: () => import_electron.ipcRenderer.invoke("dsh:get-config"),
  saveConfig: (config) => import_electron.ipcRenderer.invoke("dsh:save-config", config),
  minimizeWindow: () => import_electron.ipcRenderer.invoke("dsh:window-minimize"),
  maximizeWindow: () => import_electron.ipcRenderer.invoke("dsh:window-maximize"),
  closeWindow: () => import_electron.ipcRenderer.invoke("dsh:window-close"),
  isMaximized: () => import_electron.ipcRenderer.invoke("dsh:window-is-maximized"),
  toggleDevTools: () => import_electron.ipcRenderer.invoke("dsh:toggle-devtools"),
  onWindowStateChange: (callback) => {
    const listener = (_event, state) => callback(state);
    import_electron.ipcRenderer.on("dsh:window-state-changed", listener);
    return () => import_electron.ipcRenderer.removeListener("dsh:window-state-changed", listener);
  }
});
//# sourceMappingURL=preload.cjs.map
