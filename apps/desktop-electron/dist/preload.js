"use strict";

// src/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electronDsh", {
  getServerUrl: () => import_electron.ipcRenderer.invoke("dsh:get-server-url"),
  openFolderDialog: () => import_electron.ipcRenderer.invoke("dsh:open-folder-dialog"),
  getWorkingDir: () => import_electron.ipcRenderer.invoke("dsh:get-working-dir"),
  setWorkingDir: (dir) => import_electron.ipcRenderer.invoke("dsh:set-working-dir", dir),
  getConfig: () => import_electron.ipcRenderer.invoke("dsh:get-config"),
  saveConfig: (cfg) => import_electron.ipcRenderer.invoke("dsh:save-config", cfg),
  minimizeWindow: () => import_electron.ipcRenderer.invoke("dsh:window-minimize"),
  maximizeWindow: () => import_electron.ipcRenderer.invoke("dsh:window-maximize"),
  closeWindow: () => import_electron.ipcRenderer.invoke("dsh:window-close"),
  isMaximized: () => import_electron.ipcRenderer.invoke("dsh:window-is-maximized"),
  toggleDevTools: () => import_electron.ipcRenderer.invoke("dsh:toggle-devtools"),
  onWindowStateChange: (callback) => {
    import_electron.ipcRenderer.on("dsh:window-state-changed", (_e, state) => callback(state));
  }
});
//# sourceMappingURL=preload.js.map
