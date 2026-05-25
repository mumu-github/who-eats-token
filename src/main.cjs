const { app, BrowserWindow, ipcMain, screen, Notification, Tray, Menu, nativeImage } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { collectCodexUsage } = require("./collectors/codex.cjs");
const { createHermesBridgeServer } = require("./collectors/hermes-bridge.cjs");
const { collectHermesUsage } = require("./collectors/hermes-local.cjs");
const { createIngestServer } = require("./collectors/ingest-server.cjs");
const { getProviderRegistry } = require("./config/providers.cjs");
const { loadSettings, saveSettings, sanitizeSettings } = require("./config/settings.cjs");
const { ensureHermesOverlayInstalled } = require("./integrations/hermes-overlay-installer.cjs");
const { summarizeProviderHealth } = require("./protocol/provider-health.cjs");
const { getLocalApiAccess } = require("./security/local-token.cjs");
const { getActiveWindow } = require("./system/active-window.cjs");
const { collectSystemMetrics } = require("./system/system-metrics.cjs");
const { detectTool, getHudCoveringDialog, isDialogWindow } = require("./system/tool-detector.cjs");

if (process.env.WHO_EATS_TOKEN_DISABLE_GPU === "1") {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-compositing");
}

const BAR_HEIGHT = 64;
const HUD_WIDTH = 396;
const HUD_HEIGHT = 136;
const SYSTEM_REFRESH_MS = 2000;
const DESKTOP_BAR_REFRESH_MS = 1000;
const HUD_TRANSIENT_MISS_MS = 5000;
const ACTIVE_TOOL_TTL_MS = 10 * 60 * 1000;
const HUD_DEBUG_LOG_MAX_BYTES = 1 * 1024 * 1024;
const CODEX_SESSION_WATCH_DEBOUNCE_MS = 750;
const SETTINGS_WIDTH = 420;
const SETTINGS_HEIGHT = 560;
const TREND_WINDOW_MS = 15 * 60 * 1000;
const TREND_MIN_SAMPLE_MS = 2 * 60 * 1000;
const INGEST_PORT = readPortEnv("WHO_EATS_TOKEN_INGEST_PORT", 17667);
const HERMES_BRIDGE_PORT = readPortEnv("WHO_EATS_TOKEN_HERMES_BRIDGE_PORT", 17668);

let desktopBarWindow;
let toolHudWindow;
let settingsWindow;
let tray;
let ingestServer;
let hermesBridgeServer;
let localApiAccess = null;
let latestSnapshot = null;
let latestSystemMetrics = null;
let latestHudPayload = { visible: false };
let latestActiveTool = null;
let latestActiveToolAt = 0;
let latestActiveToolWindow = null;
let lastVisibleHudPayload = null;
let lastVisibleHudBounds = null;
let lastVisibleHudAt = 0;
let snapshotInFlight = false;
let hudRefreshInFlight = false;
let hudDebugSequence = 0;
let capacityAlertKeys = new Set();
let capacityHistory = new Map();
let settings = sanitizeSettings();
let snapshotTimer = null;
let desktopBarTimer = null;
let hudTimer = null;
let systemTimer = null;
let codexSessionWatcher = null;
let codexSessionWatchTimer = null;
let isQuitting = false;

applyUserDataOverride();
const gotSingleInstanceLock = app.requestSingleInstanceLock();

app.setName("谁在吃 token");
if (process.platform === "win32") {
  app.setAppUserModelId("local.who-eats-token");
}

if (!gotSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (!desktopBarWindow || desktopBarWindow.isDestroyed()) return;
  refreshDesktopBarFromForeground();
});

function createDesktopBarWindow() {
  const bounds = getDesktopBarBounds();

  desktopBarWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: BAR_HEIGHT,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: false,
    skipTaskbar: true,
    show: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  desktopBarWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  desktopBarWindow.once("ready-to-show", () => {
    desktopBarWindow.webContents.send("settings:update", getPublicSettings());
    sendSnapshot();
    sendSystemMetrics();
    refreshDesktopBarFromForeground();
  });
}

function getDesktopBarBounds() {
  const primary = screen.getPrimaryDisplay();
  const ratio = settings.windows.desktopWidthRatio;
  const width = Math.round(primary.workAreaSize.width * ratio);
  return {
    x: primary.workArea.x + Math.round((primary.workAreaSize.width - width) / 2),
    y: primary.bounds.y + 12,
    width,
    height: BAR_HEIGHT
  };
}

function resizeDesktopBar() {
  if (!desktopBarWindow || desktopBarWindow.isDestroyed()) return;
  desktopBarWindow.setBounds(getDesktopBarBounds());
}

function createToolHudWindow() {
  const primary = screen.getPrimaryDisplay();
  const { x, y } = getHudPosition(primary);

  toolHudWindow = new BrowserWindow({
    x,
    y,
    width: HUD_WIDTH,
    height: HUD_HEIGHT,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    show: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  toolHudWindow.setAlwaysOnTop(true, "pop-up-menu");
  toolHudWindow.setIgnoreMouseEvents(true, { forward: true });
  toolHudWindow.loadFile(path.join(__dirname, "renderer", "hud.html"));
  toolHudWindow.webContents.once("did-finish-load", () => {
    toolHudWindow.webContents.send("settings:update", getPublicSettings());
  });
}

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  const primary = screen.getPrimaryDisplay();
  const x = primary.workArea.x + Math.round((primary.workArea.width - SETTINGS_WIDTH) / 2);
  const y = primary.workArea.y + Math.round((primary.workArea.height - SETTINGS_HEIGHT) / 2);

  settingsWindow = new BrowserWindow({
    x,
    y,
    width: SETTINGS_WIDTH,
    height: SETTINGS_HEIGHT,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, "renderer", "settings.html"));
  settingsWindow.once("ready-to-show", () => {
    settingsWindow.show();
    settingsWindow.webContents.send("settings:update", getPublicSettings());
  });
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

function closeSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
  }
}

function createTray() {
  if (tray) return;
  tray = new Tray(createTrayIcon());
  tray.setIgnoreDoubleClickEvents(true);
  tray.on("click", () => openSettingsWindow());
  updateTray();
}

function updateTray() {
  if (!tray) return;
  tray.setToolTip(getTrayTooltip());
  tray.setContextMenu(Menu.buildFromTemplate(getTrayMenuTemplate()));
}

function getTrayMenuTemplate() {
  return [
    {
      label: "谁在吃 token",
      enabled: false
    },
    {
      label: getTrayStatusLabel(),
      enabled: false
    },
    { type: "separator" },
    {
      label: "打开设置",
      click: () => openSettingsWindow()
    },
    {
      label: "桌面顶部条",
      type: "checkbox",
      checked: settings.windows.desktopBarEnabled,
      click: (item) => updateSettings({
        ...settings,
        windows: {
          ...settings.windows,
          desktopBarEnabled: item.checked
        }
      })
    },
    {
      label: "工具内 HUD",
      type: "checkbox",
      checked: settings.windows.toolHudEnabled,
      click: (item) => updateSettings({
        ...settings,
        windows: {
          ...settings.windows,
          toolHudEnabled: item.checked
        }
      })
    },
    {
      label: "系统提醒",
      type: "checkbox",
      checked: settings.behavior.alertsEnabled,
      click: (item) => updateSettings({
        ...settings,
        behavior: {
          ...settings.behavior,
          alertsEnabled: item.checked
        }
      })
    },
    {
      label: "开机自启",
      type: "checkbox",
      checked: settings.system.startAtLogin,
      click: (item) => updateSettings({
        ...settings,
        system: {
          ...settings.system,
          startAtLogin: item.checked
        }
      })
    },
    { type: "separator" },
    {
      label: "立即刷新",
      click: () => {
        sendSnapshot();
        refreshToolHud();
      }
    },
    {
      label: "退出",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ];
}

function getTrayTooltip() {
  return `谁在吃 token\n${getTrayStatusLabel()}`;
}

function getTrayStatusLabel() {
  const provider = latestSnapshot?.providers?.find((candidate) => candidate.latest?.rateLimits?.primary);
  if (!provider) return "等待数据";
  const fiveHour = getWindowRemaining(provider.latest.rateLimits.primary);
  const week = getWindowRemaining(provider.latest.rateLimits.secondary);
  const syncLabel = provider.latest.rateLimitsTrust?.label || "等待";
  return `${provider.name} ${syncLabel} · 5小时 ${formatPercentForTray(fiveHour)} · 一周 ${formatPercentForTray(week)}`;
}

function formatPercentForTray(value) {
  return value === null || value === undefined ? "--" : `${value}%`;
}

function createTrayIcon() {
  const png = nativeImage.createFromPath(path.join(__dirname, "assets", "tray.png"));
  if (!png.isEmpty()) return png.resize({ width: 16, height: 16 });
  return nativeImage.createFromPath(path.join(__dirname, "assets", "tray.ico"));
}

function getHudPosition(display, tool = null, activeWindow = null) {
  const workArea = display.workArea;
  const rightGap = 12;
  const bottomOffset = getHudBottomOffset(tool);
  const targetArea = getHudTargetArea(display, activeWindow);
  const minX = workArea.x + 12;
  const maxX = workArea.x + workArea.width - HUD_WIDTH - rightGap;
  const minY = workArea.y + 12;
  const maxY = workArea.y + workArea.height - HUD_HEIGHT - rightGap;
  const x = targetArea.x + targetArea.width - HUD_WIDTH - rightGap;
  const y = targetArea.y + targetArea.height - HUD_HEIGHT - bottomOffset;
  return {
    x: clampNumber(x, minX, maxX),
    y: clampNumber(y, minY, maxY)
  };
}

function getHudBounds(display, tool = null, activeWindow = null) {
  return {
    ...getHudPosition(display, tool, activeWindow),
    width: HUD_WIDTH,
    height: HUD_HEIGHT
  };
}

function getHudTargetArea(display, activeWindow) {
  const bounds = activeWindow?.bounds;
  if (!bounds || bounds.width <= HUD_WIDTH || bounds.height <= HUD_HEIGHT) {
    return display.workArea;
  }
  return bounds;
}

function getHudBottomOffset(tool) {
  const offset = Number(tool?.hud?.bottomOffset);
  if (!Number.isFinite(offset) || offset < 12) return 12;
  return offset;
}

function clampNumber(value, min, max) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

async function refreshDesktopBarFromForeground() {
  const activeWindow = await getActiveWindow(getFastWindowInspectionOptions());
  updateActiveToolFromWindow(activeWindow);
  updateDesktopBarVisibility(activeWindow);
}

function updateActiveToolFromWindow(activeWindow) {
  const anchorWindow = getHudAnchorWindow(activeWindow);
  const tool = detectTool(activeWindow) || detectTool(anchorWindow);
  if (!tool) return;
  rememberActiveTool(tool, anchorWindow || activeWindow);
}

function rememberActiveTool(tool, activeWindow) {
  if (!tool) return;
  const previousId = latestActiveTool?.id || null;
  latestActiveTool = tool;
  latestActiveToolAt = Date.now();
  latestActiveToolWindow = summarizeHudWindow(activeWindow);

  if (tool.id !== previousId) {
    sendActiveToolSnapshot();
  }
}

function getActiveToolContext() {
  if (!latestActiveTool) return null;
  const ageMs = Date.now() - latestActiveToolAt;
  if (ageMs > ACTIVE_TOOL_TTL_MS) return null;
  return {
    ...summarizeHudTool(latestActiveTool),
    updatedAt: new Date(latestActiveToolAt).toISOString(),
    ageMs,
    window: latestActiveToolWindow
  };
}

function getSnapshotForRenderer(snapshot) {
  const base = snapshot || latestSnapshot || collectSnapshot();
  return {
    ...base,
    activeTool: getActiveToolContext()
  };
}

function sendActiveToolSnapshot() {
  if (!desktopBarWindow || desktopBarWindow.isDestroyed()) return;
  desktopBarWindow.webContents.send("metrics:update", getSnapshotForRenderer(latestSnapshot));
}

function updateDesktopBarVisibility(activeWindow) {
  if (!desktopBarWindow || desktopBarWindow.isDestroyed()) return;

  if (!settings.windows.desktopBarEnabled) {
    desktopBarWindow.setAlwaysOnTop(false);
    if (desktopBarWindow.isVisible()) desktopBarWindow.hide();
    return;
  }

  if (!isDesktopAvailable(activeWindow)) {
    desktopBarWindow.setAlwaysOnTop(false);
    if (desktopBarWindow.isVisible()) {
      desktopBarWindow.hide();
    }
    return;
  }

  hideToolHudForDesktop(activeWindow);
  desktopBarWindow.setAlwaysOnTop(true, "floating");
  desktopBarWindow.show();
}

function hideToolHudForDesktop(activeWindow) {
  if (!toolHudWindow || toolHudWindow.isDestroyed()) return;

  const shouldLog =
    Boolean(latestHudPayload?.visible) ||
    toolHudWindow.isVisible() ||
    Boolean(lastVisibleHudPayload);

  latestHudPayload = {
    visible: false,
    hiddenReason: "desktop",
    activeWindow
  };
  lastVisibleHudPayload = null;
  lastVisibleHudBounds = null;
  lastVisibleHudAt = 0;

  if (toolHudWindow.isVisible()) {
    toolHudWindow.hide();
  }
  toolHudWindow.webContents.send("hud:update", latestHudPayload);

  if (shouldLog) {
    writeHudDebugLog({
      event: "hud-refresh",
      outcome: "hidden-desktop",
      activeWindow: summarizeHudWindow(activeWindow),
      payload: summarizeHudPayload(latestHudPayload),
      hudWindowVisible: false
    });
  }
}

function isDesktopAvailable(activeWindow) {
  if (activeWindow?.desktop?.clear === true) return true;
  return isDesktopForeground(activeWindow);
}

function isDesktopForeground(activeWindow) {
  if (!activeWindow) return false;

  const processName = String(activeWindow.processName || "").toLowerCase();
  const title = String(activeWindow.title || "").trim().toLowerCase();
  const bundleId = String(activeWindow.bundleId || "").toLowerCase();

  if (isOwnDesktopBar(activeWindow)) return true;
  if (process.platform === "darwin") {
    return (processName === "finder" || bundleId === "com.apple.finder") &&
      (title === "" || title === "desktop" || title === "桌面");
  }

  if (processName !== "explorer") return false;

  return title === "" || title === "program manager" || title === "desktop" || title === "桌面";
}

function getWindowInspectionOptions() {
  const primary = screen.getPrimaryDisplay();
  return {
    ignoredHwnds: getOwnedWindowHwnds(),
    desktopArea: primary.workArea
  };
}

function getFastWindowInspectionOptions() {
  return {
    ...getWindowInspectionOptions(),
    fast: "desktop"
  };
}

function getHudWindowInspectionOptions() {
  return {
    ...getWindowInspectionOptions(),
    inspectExplorer: false,
    inspectUnreliableShell: false,
    inspectSmallWindows: Boolean(lastVisibleHudPayload?.visible)
  };
}

function getOwnedWindowHwnds() {
  return [desktopBarWindow, toolHudWindow]
    .filter((window) => window && !window.isDestroyed())
    .map(getWindowHwnd)
    .filter(Boolean);
}

function getWindowHwnd(window) {
  const handle = window.getNativeWindowHandle();
  return process.arch === "x64" ? handle.readBigUInt64LE(0).toString() : String(handle.readUInt32LE(0));
}

function isOwnDesktopBar(activeWindow) {
  if (!desktopBarWindow || desktopBarWindow.isDestroyed()) return false;
  const activeHwnd = String(activeWindow?.hwnd || "");
  if (!activeHwnd) return false;
  return activeHwnd === getWindowHwnd(desktopBarWindow);
}

function collectSnapshot() {
  const collectedAt = new Date();
  const codex = isProviderEnabled("codex") ? collectCodexUsage() : null;
  const hermes = isProviderEnabled("hermes") ? collectHermesUsage() : null;
  const ingest = ingestServer ? ingestServer.getSummary() : null;
  const providers = annotateCapacityTrends(
    mergeProviders([
      codex,
      hermes,
      ...(isProviderEnabled("ingest") ? ingest?.providers || [] : [])
    ].filter(Boolean)),
    collectedAt
  );
  const publicSettings = getPublicSettings();
  const baseSnapshot = {
    collectedAt: collectedAt.toISOString(),
    ingest: ingest
      ? {
          port: ingest.port,
        listening: ingest.listening,
        error: ingest.error,
        eventCount: ingest.eventCount,
        recentEventCount: ingest.recentEventCount,
        overlayCount: ingest.overlayCount
      }
      : null,
    bridges: {
      hermes: hermesBridgeServer ? hermesBridgeServer.getStatus() : null
    },
    system: latestSystemMetrics || refreshSystemMetrics(),
    totals: summarizeProviders(providers),
    providers,
    settings: publicSettings
  };

  return {
    ...baseSnapshot,
    providerHealth: summarizeProviderHealth(baseSnapshot)
  };
}

function mergeProviders(providers) {
  const byId = new Map();
  for (const provider of providers) {
    const current = byId.get(provider.id);
    byId.set(provider.id, current ? mergeProvider(current, provider) : provider);
  }
  return Array.from(byId.values());
}

function mergeProvider(base, incoming) {
  const baseTimestamp = Date.parse(base.latest?.timestamp || "");
  const incomingTimestamp = Date.parse(incoming.latest?.timestamp || "");
  const preferred = Number.isFinite(baseTimestamp) && Number.isFinite(incomingTimestamp)
    ? incomingTimestamp >= baseTimestamp
      ? incoming
      : base
    : incoming.latest
      ? incoming
      : base;
  const other = preferred === incoming ? base : incoming;

  return {
    ...other,
    ...preferred,
    status: preferred.status === "live" || other.status === "live" ? "live" : preferred.status,
    confidence: preferred.confidence || other.confidence,
    todayTokens: Math.max(numberOrZero(base.todayTokens), numberOrZero(incoming.todayTokens)),
    recentTokens: Math.max(numberOrZero(base.recentTokens), numberOrZero(incoming.recentTokens)),
    todayCostUsd: Math.max(numberOrZero(base.todayCostUsd), numberOrZero(incoming.todayCostUsd)),
    latest: mergeLatestState(base.latest, incoming.latest, preferred.latest),
    models: preferred.models?.length ? preferred.models : other.models || []
  };
}

function mergeLatestState(baseLatest, incomingLatest, preferredLatest) {
  if (!baseLatest && !incomingLatest && !preferredLatest) return null;
  const preferred = preferredLatest || incomingLatest || baseLatest;
  return {
    ...baseLatest,
    ...incomingLatest,
    ...preferred,
    rateLimits: incomingLatest?.rateLimits || baseLatest?.rateLimits || preferred?.rateLimits || null,
    rateLimitsTrust:
      incomingLatest?.rateLimitsTrust ||
      baseLatest?.rateLimitsTrust ||
      preferred?.rateLimitsTrust ||
      null,
    context: incomingLatest?.context || baseLatest?.context || preferred?.context || null,
    tokenPlan: incomingLatest?.tokenPlan || baseLatest?.tokenPlan || preferred?.tokenPlan || null
  };
}

function isProviderEnabled(providerId) {
  return settings.providers?.[providerId]?.enabled !== false;
}

function annotateCapacityTrends(providers, collectedAt) {
  return providers.map((provider) => annotateProviderTrend(provider, collectedAt));
}

function annotateProviderTrend(provider, collectedAt) {
  const primaryWindow = provider.latest?.rateLimits?.primary || null;
  const remaining = getWindowRemaining(primaryWindow);
  const trend = calculateCapacityTrend({
    key: `${provider.id}:primary:${primaryWindow?.resetsAt || "unknown"}`,
    remaining,
    collectedAt,
    resetsAt: primaryWindow?.resetsAt || null
  });

  if (!provider.latest) return provider;
  return {
    ...provider,
    latest: {
      ...provider.latest,
      capacityTrend: trend
    }
  };
}

function calculateCapacityTrend({ key, remaining, collectedAt, resetsAt }) {
  if (remaining === null || remaining === undefined) {
    return withCapacityForecast({
      status: "unknown",
      label: "等待",
      delta: null,
      burnPerHour: null,
      sampleMinutes: 0
    }, remaining, resetsAt, collectedAt);
  }

  const timestamp = collectedAt.getTime();
  const currentPoints = capacityHistory.get(key) || [];
  const points = [...currentPoints, { timestamp, remaining }].filter(
    (point) => timestamp - point.timestamp <= TREND_WINDOW_MS
  );
  capacityHistory.set(key, points);

  const baseline = points[0];
  const elapsedMs = timestamp - baseline.timestamp;
  const sampleMinutes = elapsedMs / 60000;
  const delta = remaining - baseline.remaining;

  if (points.length < 2 || elapsedMs < TREND_MIN_SAMPLE_MS) {
    return withCapacityForecast({
      status: "new",
      label: "观察",
      delta,
      burnPerHour: null,
      sampleMinutes
    }, remaining, resetsAt, collectedAt);
  }

  if (delta >= 4) {
    return withCapacityForecast({
      status: "recovering",
      label: "回升",
      delta,
      burnPerHour: 0,
      sampleMinutes
    }, remaining, resetsAt, collectedAt);
  }

  const burnPerHour = delta < 0 ? (-delta / sampleMinutes) * 60 : 0;
  if (burnPerHour >= 12 || delta <= -8) {
    return withCapacityForecast({
      status: "fast",
      label: "消耗快",
      delta,
      burnPerHour,
      sampleMinutes
    }, remaining, resetsAt, collectedAt);
  }

  if (burnPerHour >= 4 || delta <= -3) {
    return withCapacityForecast({
      status: "using",
      label: "消耗中",
      delta,
      burnPerHour,
      sampleMinutes
    }, remaining, resetsAt, collectedAt);
  }

  return withCapacityForecast({
    status: "steady",
    label: "稳定",
    delta,
    burnPerHour,
    sampleMinutes
  }, remaining, resetsAt, collectedAt);
}

function withCapacityForecast(trend, remaining, resetsAt, collectedAt) {
  const forecast =
    trend.status === "new" || trend.status === "unknown"
      ? buildWaitingForecast()
      : buildCapacityForecast({
          remaining,
          burnPerHour: trend.burnPerHour,
          resetsAt,
          collectedAt
        });
  return {
    ...trend,
    forecast,
    forecastLabel: forecast.label,
    forecastShortLabel: forecast.shortLabel
  };
}

function buildWaitingForecast() {
  return {
    status: "unknown",
    label: "等待估算",
    shortLabel: "估算中",
    targetThreshold: null,
    minutesToTarget: null
  };
}

function buildCapacityForecast({ remaining, burnPerHour, resetsAt, collectedAt }) {
  if (remaining === null || remaining === undefined) {
    return buildWaitingForecast();
  }

  if (remaining < 10) {
    return {
      status: "critical",
      label: "已低于10%",
      shortLabel: "<10%",
      targetThreshold: 10,
      minutesToTarget: 0
    };
  }

  if (remaining < 20) {
    return {
      status: "danger",
      label: "已低于20%",
      shortLabel: "<20%",
      targetThreshold: 20,
      minutesToTarget: 0
    };
  }

  const targetThreshold = getNextCapacityThreshold(remaining);
  if (!targetThreshold || !burnPerHour || burnPerHour <= 0) {
    return {
      status: "safe",
      label: "当前速度安全",
      shortLabel: "安全",
      targetThreshold,
      minutesToTarget: null
    };
  }

  const minutesToTarget = ((remaining - targetThreshold) / burnPerHour) * 60;
  const resetMs = resetsAt ? new Date(resetsAt).getTime() - collectedAt.getTime() : null;
  if (
    Number.isFinite(resetMs) &&
    resetMs > 0 &&
    Number.isFinite(minutesToTarget) &&
    minutesToTarget * 60000 > resetMs
  ) {
    return {
      status: "safe",
      label: "重置前安全",
      shortLabel: "安全",
      targetThreshold,
      minutesToTarget
    };
  }

  const timeLabel = formatForecastMinutes(minutesToTarget);
  return {
    status: minutesToTarget <= 60 ? "soon" : "watch",
    label: `约${timeLabel}到${targetThreshold}%`,
    shortLabel: `${timeLabel}到${targetThreshold}`,
    targetThreshold,
    minutesToTarget
  };
}

function getNextCapacityThreshold(remaining) {
  if (remaining > 40) return 40;
  if (remaining > 20) return 20;
  if (remaining > 10) return 10;
  return null;
}

function formatForecastMinutes(value) {
  if (!Number.isFinite(value) || value < 0) return "--";
  const minutes = Math.max(1, Math.ceil(value));
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 10 && mins > 0) return `${hours}h${String(mins).padStart(2, "0")}m`;
  return `${hours}h`;
}

function summarizeProviders(providers) {
  return providers.reduce(
    (acc, provider) => {
      acc.todayTokens += provider.todayTokens || 0;
      acc.recentTokens += provider.recentTokens || 0;
      acc.todayCostUsd += provider.todayCostUsd || 0;
      if (provider.status === "live") acc.liveProviders += 1;
      if (provider.status === "missing") acc.missingProviders += 1;
      return acc;
    },
    {
      todayTokens: 0,
      recentTokens: 0,
      todayCostUsd: 0,
      liveProviders: 0,
      missingProviders: 0
    }
  );
}

function refreshSystemMetrics() {
  latestSystemMetrics = collectSystemMetrics();
  return latestSystemMetrics;
}

function sendSystemMetrics() {
  const system = refreshSystemMetrics();
  if (desktopBarWindow && !desktopBarWindow.isDestroyed()) {
    desktopBarWindow.webContents.send("system:update", system);
  }
}

function sendSnapshot() {
  if (snapshotInFlight) return;
  snapshotInFlight = true;
  try {
    latestSnapshot = collectSnapshot();
    maybeSendLowCapacityAlerts(latestSnapshot);
    updateTray();
    if (desktopBarWindow && !desktopBarWindow.isDestroyed()) {
      desktopBarWindow.webContents.send("metrics:update", getSnapshotForRenderer(latestSnapshot));
    }
    if (toolHudWindow && !toolHudWindow.isDestroyed()) {
      toolHudWindow.webContents.send("hud:update", latestHudPayload);
    }
  } finally {
    snapshotInFlight = false;
  }
}

async function refreshToolHud() {
  if (hudRefreshInFlight) return;
  if (!toolHudWindow || toolHudWindow.isDestroyed()) return;
  if (!settings.windows.toolHudEnabled) {
    if (toolHudWindow.isVisible()) toolHudWindow.hide();
    latestHudPayload = { visible: false };
    lastVisibleHudPayload = null;
    lastVisibleHudBounds = null;
    lastVisibleHudAt = 0;
    writeHudDebugLog({
      event: "hud-refresh",
      outcome: "disabled"
    });
    return;
  }
  hudRefreshInFlight = true;
  const debugId = ++hudDebugSequence;
  try {
    const snapshot = latestSnapshot || collectSnapshot();
    const activeWindow = enrichActiveWindowWithOverlayReports(
      await getActiveWindow(getHudWindowInspectionOptions())
    );
    const anchorWindow = getHudAnchorWindow(activeWindow);
    const tool = detectTool(activeWindow) || detectTool(anchorWindow);
    rememberActiveTool(tool, anchorWindow || activeWindow);
    latestHudPayload = buildHudPayload(snapshot, activeWindow, tool);
    const debugBase = isHudDebugEnabled()
      ? buildHudDebugEntry({
          id: debugId,
          snapshot,
          activeWindow,
          anchorWindow,
          tool,
          payload: latestHudPayload
        })
      : null;

    if (!latestHudPayload.visible) {
      if (shouldKeepHudDuringTransientMiss(activeWindow, lastVisibleHudPayload, lastVisibleHudAt)) {
        latestHudPayload = {
          ...lastVisibleHudPayload,
          transient: true,
          transientReason: "active-window-miss"
        };
        if (lastVisibleHudBounds) {
          toolHudWindow.setBounds(lastVisibleHudBounds);
        }
        toolHudWindow.webContents.send("hud:update", latestHudPayload);
        showToolHudWindow();
        writeHudDebugLog({
          ...(debugBase || {}),
          payload: summarizeHudPayload(latestHudPayload),
          outcome: "transient-keep",
          hudWindowVisible: toolHudWindow.isVisible(),
          lastVisibleAgeMs: Date.now() - lastVisibleHudAt
        });
        return;
      }
      toolHudWindow.hide();
      writeHudDebugLog({
        ...(debugBase || {}),
        outcome: "hidden-no-tool",
        hudWindowVisible: false
      });
      return;
    }

    const display = getDisplayForActiveWindow(anchorWindow || activeWindow);
    const hudBounds = getHudBounds(display, tool, anchorWindow || activeWindow);
    const coveringDialog = getHudCoveringDialog(activeWindow, hudBounds, anchorWindow);
    if (coveringDialog) {
      const alternativeHudBounds = getAlternativeHudBounds(display, tool, anchorWindow || activeWindow, activeWindow);
      if (alternativeHudBounds) {
        latestHudPayload = {
          ...latestHudPayload,
          repositioned: true,
          repositionReason: "avoid-content"
        };
        toolHudWindow.setBounds(alternativeHudBounds);
        toolHudWindow.webContents.send("hud:update", latestHudPayload);
        lastVisibleHudPayload = latestHudPayload;
        lastVisibleHudBounds = alternativeHudBounds;
        lastVisibleHudAt = Date.now();
        showToolHudWindow();
        writeHudDebugLog({
          ...(debugBase || {}),
          payload: summarizeHudPayload(latestHudPayload),
          outcome: "repositioned",
          hudBounds: alternativeHudBounds,
          coveringDialog: summarizeHudWindow(coveringDialog),
          hudWindowVisible: toolHudWindow.isVisible()
        });
        return;
      }
      latestHudPayload = {
        ...latestHudPayload,
        visible: false,
        hiddenReason: "dialog-overlap",
        coveringDialog
      };
      toolHudWindow.hide();
      writeHudDebugLog({
        ...(debugBase || {}),
        payload: summarizeHudPayload(latestHudPayload),
        outcome: "hidden-dialog-overlap",
        hudBounds,
        coveringDialog: summarizeHudWindow(coveringDialog),
        hudWindowVisible: false
      });
      return;
    }

    toolHudWindow.setBounds(hudBounds);
    toolHudWindow.webContents.send("hud:update", latestHudPayload);
    lastVisibleHudPayload = latestHudPayload;
    lastVisibleHudBounds = hudBounds;
    lastVisibleHudAt = Date.now();
    showToolHudWindow();
    writeHudDebugLog({
      ...(debugBase || {}),
      outcome: "shown",
      hudBounds,
      hudWindowVisible: toolHudWindow.isVisible()
    });
  } finally {
    hudRefreshInFlight = false;
  }
}

function showToolHudWindow() {
  if (!toolHudWindow || toolHudWindow.isDestroyed()) return;
  toolHudWindow.setAlwaysOnTop(true, "pop-up-menu");
  toolHudWindow.setIgnoreMouseEvents(true, { forward: true });
  toolHudWindow.showInactive();
}

function buildHudDebugEntry({ id, snapshot, activeWindow, anchorWindow, tool, payload }) {
  return {
    event: "hud-refresh",
    id,
    snapshotAt: snapshot?.collectedAt || null,
    activeWindow: summarizeHudWindow(activeWindow),
    anchorWindow: summarizeHudWindow(anchorWindow),
    detectedTool: summarizeHudTool(tool),
    payload: summarizeHudPayload(payload)
  };
}

function summarizeHudWindow(windowInfo) {
  if (!windowInfo) return null;
  return {
    source: windowInfo.source || "powershell",
    hwnd: windowInfo.hwnd || null,
    pid: numberOrNull(windowInfo.pid),
    processName: windowInfo.processName || "",
    bundleId: windowInfo.bundleId || "",
    title: windowInfo.title || "",
    path: windowInfo.path || "",
    url: windowInfo.url || "",
    platform: windowInfo.platform || null,
    memoryUsageBytes: numberOrNull(windowInfo.memoryUsageBytes),
    className: windowInfo.className || "",
    bounds: normalizeBounds(windowInfo.bounds),
    desktopClear: windowInfo.desktop?.clear ?? null,
    desktopBlockerCount: numberOrNull(windowInfo.desktop?.blockerCount),
    overlayCount: Array.isArray(windowInfo.contentOverlays) ? windowInfo.contentOverlays.length : 0
  };
}

function summarizeHudTool(tool) {
  if (!tool) return null;
  return {
    id: tool.id,
    name: tool.name,
    providerIds: tool.providerIds || [],
    bottomOffset: numberOrNull(tool.hud?.bottomOffset)
  };
}

function summarizeHudPayload(payload) {
  if (!payload) return null;
  const provider = payload.provider || null;
  return {
    visible: Boolean(payload.visible),
    hiddenReason: payload.hiddenReason || null,
    transient: Boolean(payload.transient),
    transientReason: payload.transientReason || null,
    repositioned: Boolean(payload.repositioned),
    repositionReason: payload.repositionReason || null,
    toolId: payload.tool?.id || null,
    toolName: payload.tool?.name || null,
    collectedAt: payload.collectedAt || null,
    provider: provider
      ? {
          id: provider.id,
          name: provider.name,
          displayMode: provider.displayMode,
          syncStatus: provider.syncStatus,
          syncLabel: provider.syncLabel,
          remainingPercent: provider.remainingPercent,
          fiveHourRemaining: provider.fiveHourRemaining,
          weekRemaining: provider.weekRemaining,
          tokenPlanRemaining: provider.tokenPlanRemaining,
          tokenPlanUsedCredits: provider.tokenPlanUsedCredits,
          tokenPlanTotalCredits: provider.tokenPlanTotalCredits,
          tokenPlanSource: provider.tokenPlanSource,
          tokenPlanPlatformStatus: provider.tokenPlanPlatformStatus
        }
      : null
  };
}

function writeHudDebugLog(entry) {
  if (!isHudDebugEnabled()) return;
  try {
    const filePath = getHudDebugLogPath();
    trimHudDebugLog(filePath);
    const line = `${JSON.stringify({
      timestamp: new Date().toISOString(),
      ...entry
    })}\n`;
    fs.appendFileSync(filePath, line, "utf8");
  } catch {
    // Debug logging must never affect HUD behavior.
  }
}

function isHudDebugEnabled() {
  return Boolean(settings.behavior?.debugHud || process.env.WHO_EATS_TOKEN_DEBUG_HUD === "1");
}

function getHudDebugLogPath() {
  return path.join(app.getPath("userData"), "hud-debug.ndjson");
}

function cleanupHudDebugLog() {
  const filePath = getHudDebugLogPath();
  try {
    if (!fs.existsSync(filePath)) return;
    if (!isHudDebugEnabled()) {
      fs.rmSync(filePath, { force: true });
      return;
    }
    trimHudDebugLog(filePath);
  } catch {
    // Debug cleanup must never affect app startup.
  }
}

function trimHudDebugLog(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size <= HUD_DEBUG_LOG_MAX_BYTES) return;
    const fd = fs.openSync(filePath, "r");
    try {
      const keepBytes = Math.floor(HUD_DEBUG_LOG_MAX_BYTES / 2);
      const buffer = Buffer.alloc(keepBytes);
      fs.readSync(fd, buffer, 0, keepBytes, Math.max(0, stat.size - keepBytes));
      const text = buffer.toString("utf8");
      const firstNewline = text.indexOf("\n");
      fs.writeFileSync(filePath, firstNewline >= 0 ? text.slice(firstNewline + 1) : text, "utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Debug trimming must stay best-effort.
  }
}

function getAlternativeHudBounds(display, tool, anchorWindow, activeWindow) {
  const baseOffset = Number(tool?.hud?.bottomOffset);
  const offsets = tool?.id === "hermes-web-ui" && Number.isFinite(baseOffset)
    ? [baseOffset + 24, baseOffset + 48, baseOffset + 72, baseOffset + 96]
    : [12, 24, 48, 72].filter((offset) => offset !== baseOffset);
  for (const offset of offsets) {
    const candidateTool = {
      ...tool,
      hud: {
        ...(tool?.hud || {}),
        bottomOffset: offset
      }
    };
    const candidateBounds = getHudBounds(display, candidateTool, anchorWindow);
    if (!getHudCoveringDialog(activeWindow, candidateBounds, anchorWindow)) {
      return candidateBounds;
    }
  }
  return null;
}

function shouldKeepHudDuringTransientMiss(activeWindow, previousPayload, previousVisibleAt) {
  if (!previousPayload?.visible || !previousVisibleAt) return false;
  if (Date.now() - previousVisibleAt > HUD_TRANSIENT_MISS_MS) return false;
  if (!activeWindow) return true;

  const previousToolId = previousPayload.tool?.id;
  const processName = String(activeWindow.processName || "").toLowerCase();
  const haystack = `${activeWindow.title || ""} ${activeWindow.path || ""} ${activeWindow.url || ""}`;

  if (previousToolId === "codex") {
    return processName === "codex" || /\bcodex\b/i.test(haystack);
  }

  if (previousToolId === "hermes-web-ui") {
    return (
      processName === "hermes-web-ui" ||
      ["arc", "brave browser", "chrome", "firefox", "google chrome", "microsoft edge", "msedge", "browser", "safari"].includes(processName)
    ) && (
      /^hermes(?:\s+(?:web\s*ui|agent|chat))?(?:\s*-\s*(google chrome|microsoft edge|mozilla firefox|firefox|safari))?$/i.test(String(activeWindow.title || "").trim()) ||
      /(127\.0\.0\.1:8648|localhost:8648|\/hermes\/chat)/i.test(haystack)
    );
  }

  return false;
}

function enrichActiveWindowWithOverlayReports(activeWindow) {
  if (!activeWindow || !ingestServer?.getOverlayReports) return activeWindow;

  const reports = ingestServer.getOverlayReports();
  if (reports.length === 0) return activeWindow;

  const activeBounds = normalizeBounds(activeWindow.bounds);
  const relevantReports = reports.filter((report) => {
    if (!isOverlayReportForActiveWindow(activeWindow, report)) return false;
    if (!activeBounds) return true;
    if (!Array.isArray(report.overlays) || report.overlays.length === 0) return true;
    return report.overlays.some((overlay) => boundsOverlap(activeBounds, normalizeBounds(overlay.bounds)));
  });
  if (relevantReports.length === 0) return activeWindow;

  const overlayHints = relevantReports.flatMap((report) =>
    (report.overlays || []).map((overlay) => ({
      ...overlay,
      source: report.source,
      url: report.url,
      title: report.title,
      timestamp: report.timestamp
    }))
  );

  return {
    ...activeWindow,
    contentOverlays: [
      ...(Array.isArray(activeWindow.contentOverlays) ? activeWindow.contentOverlays : []),
      ...overlayHints
    ]
  };
}

function isOverlayReportForActiveWindow(activeWindow, report) {
  const processName = String(activeWindow?.processName || "").toLowerCase();
  const title = String(activeWindow?.title || "");
  const url = String(activeWindow?.url || "");
  const reportTitle = String(report?.title || "");
  const reportUrl = String(report?.url || "");

  if (processName === "hermes-web-ui") return true;
  if (!["arc", "brave browser", "chrome", "firefox", "google chrome", "microsoft edge", "msedge", "browser", "safari"].includes(processName)) return false;

  const titleLooksHermes =
    /^hermes(?:\s+(?:web\s*ui|agent|chat))?(?:\s*-\s*(google chrome|microsoft edge|mozilla firefox|firefox|safari))?$/i.test(title.trim()) ||
    /(127\.0\.0\.1:8648|localhost:8648|\/hermes\/chat)/i.test(url);
  const reportLooksHermes = /(127\.0\.0\.1:8648|localhost:8648|\/hermes\/chat|title=Hermes)/i.test(reportUrl) ||
    /^hermes(?:\s+(?:web\s*ui|agent|chat))?$/i.test(reportTitle.trim());

  return titleLooksHermes && reportLooksHermes;
}

function normalizeBounds(bounds = {}) {
  const x = Number(bounds?.x);
  const y = Number(bounds?.y);
  const width = Number(bounds?.width);
  const height = Number(bounds?.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return { x, y, width, height };
}

function boundsOverlap(first, second) {
  if (!first || !second) return false;
  const firstRight = first.x + first.width;
  const firstBottom = first.y + first.height;
  const secondRight = second.x + second.width;
  const secondBottom = second.y + second.height;
  return firstRight > second.x && first.x < secondRight && firstBottom > second.y && first.y < secondBottom;
}

function getHudAnchorWindow(activeWindow) {
  if (!isDialogWindow(activeWindow)) return activeWindow;

  const activePid = Number(activeWindow?.pid) || null;
  const blockers = Array.isArray(activeWindow?.desktop?.blockers)
    ? activeWindow.desktop.blockers
    : [];
  const candidates = blockers
    .filter((windowInfo) => !isDialogWindow(windowInfo))
    .filter((windowInfo) => {
      const pid = Number(windowInfo?.pid) || null;
      return activePid && pid === activePid;
    })
    .filter((windowInfo) => {
      const bounds = windowInfo?.bounds;
      return Number(bounds?.width) > HUD_WIDTH && Number(bounds?.height) > HUD_HEIGHT;
    })
    .sort((a, b) => getWindowArea(b) - getWindowArea(a));

  return candidates[0] || activeWindow;
}

function getWindowArea(windowInfo) {
  const bounds = windowInfo?.bounds || {};
  const width = Number(bounds.width);
  const height = Number(bounds.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return 0;
  return width * height;
}

function buildHudPayload(snapshot, activeWindow, tool) {
  if (!tool) {
    return { visible: false, activeWindow };
  }

  const provider = findProvider(snapshot.providers, tool.providerIds);
  const providerHealth = findProvider(snapshot.providerHealth?.providers || [], tool.providerIds);
  const primaryWindow = provider?.latest?.rateLimits?.primary || null;
  const secondaryWindow = provider?.latest?.rateLimits?.secondary || null;
  const usedPercent = primaryWindow ? Math.round(primaryWindow.usedPercent) : null;
  const fiveHourRemaining = getWindowRemaining(primaryWindow);
  const weekRemaining = getWindowRemaining(secondaryWindow);
  const context = provider?.latest?.context || null;
  const tokenPlan = provider?.latest?.tokenPlan || null;
  const tokenPlanRemaining = roundedNumberOrNull(tokenPlan?.remainingPercent);
  const contextRemaining = roundedNumberOrNull(context?.remainingPercent);
  const displayMode = tokenPlan
    ? "token-plan"
    : primaryWindow || secondaryWindow
    ? "capacity"
    : context
      ? "context"
      : provider
        ? "usage"
        : "waiting";
  const capacityTrend = provider?.latest?.capacityTrend || null;

  return {
    visible: true,
    activeWindow,
    tool,
    provider: provider
      ? {
          id: provider.id,
          name: provider.name,
          confidence: provider.confidence,
          todayTokens: provider.todayTokens || 0,
          recentTokens: provider.recentTokens || 0,
          model: provider.latest?.model || null,
          usedPercent: usedPercent ?? roundedNumberOrNull(tokenPlan?.usedPercent) ?? roundedNumberOrNull(context?.usedPercent),
          remainingPercent: fiveHourRemaining ?? tokenPlanRemaining ?? contextRemaining,
          fiveHourRemaining,
          weekRemaining,
          displayMode,
          tokenPlanRemaining,
          tokenPlanUsedPercent: roundedNumberOrNull(tokenPlan?.usedPercent),
          tokenPlanUsedCredits: numberOrNull(tokenPlan?.usedCredits),
          tokenPlanTotalCredits: numberOrNull(tokenPlan?.totalCredits),
          tokenPlanRemainingCredits: numberOrNull(tokenPlan?.remainingCredits),
          tokenPlanRecentCredits: numberOrNull(tokenPlan?.recentCredits),
          tokenPlanFiveHourCredits: numberOrNull(tokenPlan?.fiveHourCredits),
          tokenPlanSource: tokenPlan?.source || null,
          tokenPlanPlanName: tokenPlan?.planName || null,
          tokenPlanValidUntil: tokenPlan?.validUntil || null,
          tokenPlanSnapshotAt: tokenPlan?.snapshotAt || null,
          tokenPlanLocalDeltaCredits: numberOrNull(tokenPlan?.localDeltaCredits),
          tokenPlanPlatformStatus: tokenPlan?.platformStatus || null,
          contextRemaining,
          contextUsedTokens: numberOrNull(context?.usedTokens),
          contextLimitTokens: numberOrNull(context?.limitTokens),
          contextSource: context?.source || null,
          syncStatus: provider.latest?.rateLimitsTrust?.status || "missing",
          syncLabel: provider.latest?.rateLimitsTrust?.label || "等待",
          health: providerHealth || null,
          trust: providerHealth?.trust || null,
          delight: providerHealth?.delight || null,
          capacityTrend,
          trendStatus: capacityTrend?.status || "unknown",
          trendLabel: capacityTrend?.label || "观察",
          fiveHourResetsAt: primaryWindow?.resetsAt || null,
          weekResetsAt: secondaryWindow?.resetsAt || null
        }
      : null,
    collectedAt: snapshot.collectedAt
  };
}

function getWindowRemaining(window) {
  if (!window) return null;
  const usedPercent = Math.round(window.usedPercent);
  return Math.max(0, Math.min(100, 100 - usedPercent));
}

function maybeSendLowCapacityAlerts(snapshot) {
  if (!Notification.isSupported()) return;
  if (!settings.behavior.alertsEnabled) return;

  for (const provider of snapshot.providers || []) {
    const windows = [
      ["primary", "5小时", provider.latest?.rateLimits?.primary],
      ["secondary", "一周", provider.latest?.rateLimits?.secondary]
    ];

    for (const [windowId, label, window] of windows) {
      const remaining = getWindowRemaining(window);
      const tier = getAlertTier(remaining);
      if (!tier) continue;

      const key = `${provider.id}:${windowId}:${tier.id}:${window.resetsAt || "unknown"}`;
      if (capacityAlertKeys.has(key)) continue;
      capacityAlertKeys.add(key);

      new Notification({
        title: tier.title,
        body: `${provider.name} ${label}余量 ${remaining}%${formatResetForNotification(window.resetsAt)}`
      }).show();
    }

    const tokenPlan = provider.latest?.tokenPlan;
    const tokenPlanRemaining = roundedNumberOrNull(tokenPlan?.remainingPercent);
    const tokenPlanTier = getAlertTier(tokenPlanRemaining);
    if (tokenPlanTier) {
      const key = `${provider.id}:token-plan:${tokenPlanTier.id}:${tokenPlan.planName || "unknown"}`;
      if (!capacityAlertKeys.has(key)) {
        capacityAlertKeys.add(key);
        new Notification({
          title: tokenPlanTier.title,
          body: `${provider.name} Token Plan 余量 ${tokenPlanRemaining}%`
        }).show();
      }
    }

    const context = provider.latest?.context;
    const contextRemaining = roundedNumberOrNull(context?.remainingPercent);
    const contextTier = getAlertTier(contextRemaining);
    if (contextTier) {
      const key = `${provider.id}:context:${contextTier.id}:${context.sessionId || "unknown"}`;
      if (!capacityAlertKeys.has(key)) {
        capacityAlertKeys.add(key);
        new Notification({
          title: contextTier.title,
          body: `${provider.name} 上下文余量 ${contextRemaining}%`
        }).show();
      }
    }
  }
}

function getAlertTier(remaining) {
  if (remaining === null || remaining === undefined) return null;
  return getAlertTiers().find((tier) => remaining < tier.threshold) || null;
}

function getAlertTiers() {
  return [
    { id: "critical", threshold: settings.alertThresholds.critical, title: "LLM 余量紧急" },
    { id: "danger", threshold: settings.alertThresholds.danger, title: "LLM 余量告警" },
    { id: "caution", threshold: settings.alertThresholds.caution, title: "LLM 余量偏紧" }
  ];
}

function formatResetForNotification(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `，${date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  })} 重置`;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundedNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function findProvider(providers, providerIds) {
  return providers.find((provider) => providerIds.includes(provider.id));
}

function getDisplayForActiveWindow(activeWindow) {
  const bounds = activeWindow?.bounds;
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return screen.getPrimaryDisplay();
  }
  return screen.getDisplayMatching(bounds);
}

function getPublicSettings() {
  return {
    ...settings,
    providerRegistry: getProviderRegistry(settings)
  };
}

function updateSettings(nextSettings) {
  const previous = settings;
  settings = saveSettings(app.getPath("userData"), nextSettings);
  applySettings(previous, settings);
  return getPublicSettings();
}

function applySettings(previous, current) {
  resizeDesktopBar();
  restartIngestServerIfNeeded(previous, current);
  restartHermesBridgeIfNeeded(previous, current);
  restartCodexSessionWatcher();
  maybeInstallHermesOverlay(previous, current);
  applyLoginItemSettings();
  scheduleTimers();
  broadcastSettings();
  updateTray();
  refreshDesktopBarFromForeground();
  refreshToolHud();
  sendSnapshot();
}

function maybeInstallHermesOverlay(previous = null, current = settings) {
  const enabled = Boolean(current.integrations?.hermesOverlayAutoInstall);
  if (!enabled) return [];

  const wasEnabled = Boolean(previous?.integrations?.hermesOverlayAutoInstall);
  if (previous && wasEnabled) return [];

  try {
    return ensureHermesOverlayInstalled({ accessToken: localApiAccess?.token || "" });
  } catch {
    // Optional third-party UI injection must never break the monitor itself.
    return [];
  }
}

function broadcastSettings() {
  const publicSettings = getPublicSettings();
  for (const window of [desktopBarWindow, toolHudWindow, settingsWindow]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send("settings:update", publicSettings);
    }
  }
}

function restartIngestServerIfNeeded(previous, current) {
  const previousEnabled = previous?.providers?.ingest?.enabled !== false;
  const currentEnabled = current.providers?.ingest?.enabled !== false;
  if (previousEnabled === currentEnabled && ingestServer) return;
  restartIngestServer();
}

function restartIngestServer() {
  if (ingestServer) {
    ingestServer.close();
    ingestServer = null;
  }
  if (isProviderEnabled("ingest")) {
    ingestServer = createIngestServer({
      port: INGEST_PORT,
      accessToken: localApiAccess?.token || null,
      getSnapshot: () => collectSnapshot()
    });
  }
}

function restartHermesBridgeIfNeeded(previous, current) {
  const previousEnabled = previous?.providers?.hermes?.enabled !== false;
  const currentEnabled = current.providers?.hermes?.enabled !== false;
  if (previousEnabled === currentEnabled && hermesBridgeServer) return;
  restartHermesBridge();
}

function restartHermesBridge() {
  if (hermesBridgeServer) {
    hermesBridgeServer.close();
    hermesBridgeServer = null;
  }
  if (isProviderEnabled("hermes")) {
    hermesBridgeServer = createHermesBridgeServer({
      port: HERMES_BRIDGE_PORT,
      targetBaseUrl: "http://127.0.0.1:8642",
      ingestUrl: `http://127.0.0.1:${INGEST_PORT}/events`,
      accessToken: localApiAccess?.token || null,
      ingestToken: localApiAccess?.token || null
    });
  }
}

function restartCodexSessionWatcher() {
  stopCodexSessionWatcher();
  if (!isProviderEnabled("codex")) return;

  const codexSessionsRoot = path.join(os.homedir(), ".codex", "sessions");
  if (!fs.existsSync(codexSessionsRoot)) return;

  try {
    codexSessionWatcher = fs.watch(
      codexSessionsRoot,
      { recursive: true, persistent: false },
      (_eventType, filename) => {
        if (filename && !String(filename).endsWith(".jsonl")) return;
        scheduleCodexSessionRefresh();
      }
    );
    codexSessionWatcher.on("error", stopCodexSessionWatcher);
  } catch {
    codexSessionWatcher = null;
  }
}

function stopCodexSessionWatcher() {
  if (codexSessionWatchTimer) {
    clearTimeout(codexSessionWatchTimer);
    codexSessionWatchTimer = null;
  }
  if (!codexSessionWatcher) return;
  try {
    codexSessionWatcher.close();
  } catch {
    // File watchers can already be closed during app shutdown.
  }
  codexSessionWatcher = null;
}

function scheduleCodexSessionRefresh() {
  if (isQuitting) return;
  if (codexSessionWatchTimer) clearTimeout(codexSessionWatchTimer);
  codexSessionWatchTimer = setTimeout(() => {
    codexSessionWatchTimer = null;
    sendSnapshot();
    refreshToolHud();
  }, CODEX_SESSION_WATCH_DEBOUNCE_MS);
  codexSessionWatchTimer.unref?.();
}

function applyUserDataOverride() {
  const override = String(process.env.WHO_EATS_TOKEN_USER_DATA_DIR || "").trim();
  if (!override) return;
  try {
    const resolved = path.resolve(override);
    fs.mkdirSync(resolved, { recursive: true });
    app.setPath("userData", resolved);
  } catch {
    // Smoke tests can use an isolated userData directory; production falls back to Electron defaults.
  }
}

function readPortEnv(name, fallback) {
  const port = Number.parseInt(process.env[name] || "", 10);
  return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : fallback;
}

function scheduleTimers() {
  if (snapshotTimer) clearInterval(snapshotTimer);
  if (desktopBarTimer) clearInterval(desktopBarTimer);
  if (hudTimer) clearInterval(hudTimer);
  if (systemTimer) clearInterval(systemTimer);
  snapshotTimer = setInterval(sendSnapshot, settings.behavior.refreshMs);
  systemTimer = setInterval(sendSystemMetrics, SYSTEM_REFRESH_MS);
  if (isHeadlessRuntime()) return;
  desktopBarTimer = setInterval(refreshDesktopBarFromForeground, DESKTOP_BAR_REFRESH_MS);
  hudTimer = setInterval(refreshToolHud, settings.behavior.activeWindowMs);
}

function applyLoginItemSettings() {
  try {
    const options = {
      openAtLogin: settings.system.startAtLogin
    };
    if (!app.isPackaged) {
      options.path = process.execPath;
      options.args = [app.getAppPath()];
    }
    app.setLoginItemSettings(options);
  } catch {
    // Windows may reject this under unusual packaged/dev contexts; the UI still keeps the saved preference.
  }
}

ipcMain.handle("metrics:snapshot", () => getSnapshotForRenderer(latestSnapshot || collectSnapshot()));
ipcMain.handle("hud:snapshot", () => latestHudPayload);
ipcMain.handle("settings:get", () => getPublicSettings());
ipcMain.handle("settings:save", (_event, nextSettings) => updateSettings(nextSettings));
ipcMain.handle("settings:reset", () => updateSettings(sanitizeSettings()));
ipcMain.handle("settings:open", () => {
  openSettingsWindow();
  return true;
});
ipcMain.handle("settings:close", () => {
  closeSettingsWindow();
  return true;
});

ipcMain.handle("window:toggle-expanded", () => {
  openSettingsWindow();
  return true;
});

ipcMain.handle("window:close", () => {
  isQuitting = true;
  app.quit();
});

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;
  const headless = isHeadlessRuntime();
  settings = loadSettings(app.getPath("userData"));
  localApiAccess = getLocalApiAccess(app.getPath("userData"));
  cleanupHudDebugLog();
  maybeInstallHermesOverlay(null, settings);
  applyLoginItemSettings();
  restartIngestServer();
  restartHermesBridge();
  restartCodexSessionWatcher();
  if (!headless) {
    createDesktopBarWindow();
    createToolHudWindow();
    createTray();
  }
  scheduleTimers();
  if (headless) {
    sendSystemMetrics();
    sendSnapshot();
  } else {
    setTimeout(refreshToolHud, 500);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createDesktopBarWindow();
      createToolHudWindow();
    }
  });
});

function isHeadlessRuntime() {
  return process.env.WHO_EATS_TOKEN_HEADLESS_SMOKE === "1";
}

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("will-quit", () => {
  if (snapshotTimer) clearInterval(snapshotTimer);
  if (desktopBarTimer) clearInterval(desktopBarTimer);
  if (hudTimer) clearInterval(hudTimer);
  if (systemTimer) clearInterval(systemTimer);
  stopCodexSessionWatcher();
  if (ingestServer) ingestServer.close();
  if (hermesBridgeServer) hermesBridgeServer.close();
});

app.on("window-all-closed", () => {
  if (isQuitting && process.platform !== "darwin") app.quit();
});
