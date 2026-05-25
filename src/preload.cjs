const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tokenBar", {
  getSnapshot: () => ipcRenderer.invoke("metrics:snapshot"),
  getHudSnapshot: () => ipcRenderer.invoke("hud:snapshot"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  resetSettings: () => ipcRenderer.invoke("settings:reset"),
  openSettings: () => ipcRenderer.invoke("settings:open"),
  closeSettings: () => ipcRenderer.invoke("settings:close"),
  toggleExpanded: () => ipcRenderer.invoke("window:toggle-expanded"),
  close: () => ipcRenderer.invoke("window:close"),
  onUpdate: (callback) => {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on("metrics:update", listener);
    return () => ipcRenderer.removeListener("metrics:update", listener);
  },
  onSystemUpdate: (callback) => {
    const listener = (_event, system) => callback(system);
    ipcRenderer.on("system:update", listener);
    return () => ipcRenderer.removeListener("system:update", listener);
  },
  onHudUpdate: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("hud:update", listener);
    return () => ipcRenderer.removeListener("hud:update", listener);
  },
  onSettingsUpdate: (callback) => {
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on("settings:update", listener);
    return () => ipcRenderer.removeListener("settings:update", listener);
  }
});
