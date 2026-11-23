const { app, BrowserWindow, ipcMain, Tray, Menu, powerSaveBlocker, nativeImage } = require("electron");
const path = require("path");

let mainWindow = null;
let tray = null;
let powerSaveId = null;
let isQuitting = false;
let isPinned = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 780,
    height: 580,
    minWidth: 460,
    minHeight: 420,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#F6F3EC",
    icon: path.join(__dirname, "assets", "icon.png"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("enter-full-screen", () => {
    mainWindow.webContents.send("window:fullscreen-changed", true);
  });

  mainWindow.on("leave-full-screen", () => {
    mainWindow.webContents.send("window:fullscreen-changed", false);
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const trayIconPath = path.join(__dirname, "assets", "tray.png");
  const icon = nativeImage.createFromPath(trayIconPath);
  tray = new Tray(icon);
  tray.setToolTip("随机提示音 · 准备专注");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "显示主窗口",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: "开始 / 暂停专注",
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send("tray:toggle-timer");
        }
      },
    },
    { type: "separator" },
    {
      label: "退出随机提示音",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
    }
  });
}

ipcMain.handle("window:minimize", () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle("window:hide-to-tray", () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.handle("window:close", () => {
  isQuitting = true;
  app.quit();
});

ipcMain.handle("window:toggle-fullscreen", () => {
  if (!mainWindow) return false;
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  return next;
});

ipcMain.handle("window:toggle-pin", () => {
  if (!mainWindow) return false;
  isPinned = !isPinned;
  mainWindow.setAlwaysOnTop(isPinned, "floating");
  return isPinned;
});

ipcMain.handle("window:set-theme-bg", (_event, isDark) => {
  if (mainWindow) {
    mainWindow.setBackgroundColor(isDark ? "#141413" : "#F6F3EC");
  }
});

ipcMain.handle("power:set-prevent-sleep", (_event, enabled) => {
  if (enabled) {
    if (powerSaveId === null || !powerSaveBlocker.isStarted(powerSaveId)) {
      powerSaveId = powerSaveBlocker.start("prevent-display-sleep");
    }
  } else if (powerSaveId !== null && powerSaveBlocker.isStarted(powerSaveId)) {
    powerSaveBlocker.stop(powerSaveId);
    powerSaveId = null;
  }
});

ipcMain.handle("tray:update-tooltip", (_event, text) => {
  if (tray && typeof text === "string") {
    tray.setToolTip(text);
  }
});

function resolveApiBase(baseUrl) {
  const cleaned = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!cleaned) return "";
  if (cleaned.endsWith("/chat/completions")) {
    return cleaned.slice(0, -"/chat/completions".length);
  }
  if (/\/v\d+$/i.test(cleaned)) {
    return cleaned;
  }
  return cleaned + "/v1";
}

function resolveChatEndpoint(baseUrl) {
  const cleaned = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!cleaned) return "";
  if (cleaned.endsWith("/chat/completions")) return cleaned;
  return resolveApiBase(cleaned) + "/chat/completions";
}

ipcMain.handle("ai:models", async (_event, payload) => {
  try {
    const { baseUrl, apiKey } = payload || {};
    const apiBase = resolveApiBase(baseUrl);
    if (!apiBase) return { ok: false, error: "请先填写 API Base URL。" };
    const headers = { Accept: "application/json" };
    if (apiKey && String(apiKey).trim()) {
      headers.Authorization = "Bearer " + String(apiKey).trim();
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let res;
    try {
      res = await fetch(apiBase + "/models", { method: "GET", headers, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    if (!res.ok) {
      return { ok: false, error: "拉取模型失败 (" + res.status + ")" };
    }
    const list = Array.isArray(data && data.data)
      ? data.data.map((m) => m && m.id).filter(Boolean).sort()
      : [];
    return { ok: true, models: list };
  } catch (err) {
    return { ok: false, error: "拉取失败: " + (err && err.message ? err.message : String(err)) };
  }
});

ipcMain.handle("ai:chat", async (_event, payload) => {
  try {
    const { baseUrl, apiKey, model, messages } = payload || {};
    const endpoint = resolveChatEndpoint(baseUrl);
    if (!endpoint) {
      return { ok: false, error: "请先填写有效的 API Base URL。" };
    }
    if (!model || !String(model).trim()) {
      return { ok: false, error: "请先填写模型名称（例如 deepseek-chat）。" };
    }

    const headers = {
      "Content-Type": "application/json",
    };
    if (apiKey && String(apiKey).trim()) {
      headers.Authorization = "Bearer " + String(apiKey).trim();
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    let res;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: String(model).trim(),
          messages,
          temperature: 0.6,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const rawText = await res.text();
    let data = null;
    try {
      data = JSON.parse(rawText);
    } catch {}

    if (!res.ok) {
      const msg =
        (data && data.error && (data.error.message || data.error.type)) ||
        rawText.slice(0, 240) ||
        "HTTP " + res.status;
      return { ok: false, error: "接口返回错误 (" + res.status + "): " + msg };
    }

    const content =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;

    if (!content) {
      return { ok: false, error: "模型未返回有效文本内容，请检查模型名称与接口格式。" };
    }
    return { ok: true, content: String(content) };
  } catch (err) {
    if (err && err.name === "AbortError") {
      return { ok: false, error: "请求超时（60秒），请检查网络或代理设置。" };
    }
    return { ok: false, error: "请求失败: " + (err && err.message ? err.message : String(err)) };
  }
});

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on("before-quit", () => {
  isQuitting = true;
  if (powerSaveId !== null && powerSaveBlocker.isStarted(powerSaveId)) {
    powerSaveBlocker.stop(powerSaveId);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
