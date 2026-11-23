const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopAPI", {
  minimize: () => ipcRenderer.invoke("window:minimize"),
  hideToTray: () => ipcRenderer.invoke("window:hide-to-tray"),
  closeApp: () => ipcRenderer.invoke("window:close"),
  toggleFullscreen: () => ipcRenderer.invoke("window:toggle-fullscreen"),
  togglePin: () => ipcRenderer.invoke("window:toggle-pin"),
  setThemeBg: (isDark) => ipcRenderer.invoke("window:set-theme-bg", isDark),
  setPreventSleep: (enabled) => ipcRenderer.invoke("power:set-prevent-sleep", enabled),
  updateTrayTooltip: (text) => ipcRenderer.invoke("tray:update-tooltip", text),
  aiChat: (payload) => ipcRenderer.invoke("ai:chat", payload),
  onFullscreenChanged: (cb) => {
    ipcRenderer.on("window:fullscreen-changed", (_e, val) => cb(val));
  },
  onTrayToggleTimer: (cb) => {
    ipcRenderer.on("tray:toggle-timer", () => cb());
  },
});
