import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, BrowserWindow } from "electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "output", "playwright");
const htmlOut = path.join(os.tmpdir(), "who-eats-token-ui-mock");

const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8")
  .replaceAll("../assets/", `${pathToFileURL(path.join(root, "src/assets")).href}/`);
const appJs = fs.readFileSync(path.join(root, "src/renderer/app.js"), "utf8");
const hudJs = fs.readFileSync(path.join(root, "src/renderer/hud.js"), "utf8");
const hudTrustPopoverJs = fs.readFileSync(path.join(root, "src/renderer/hud-trust-popover.js"), "utf8");
const settingsJs = fs.readFileSync(path.join(root, "src/renderer/settings.js"), "utf8");
const demoMood = String(process.env.WHO_EATS_TOKEN_DEMO_MOOD || "tight").trim().toLowerCase();
const demoDelight = getDemoDelight(demoMood);
const demoRemaining = getDemoRemaining(demoMood);
const showPreview = process.argv.includes("--show") || process.env.WHO_EATS_TOKEN_DEMO_SHOW === "1";

const snapshot = {
  collectedAt: "2026-05-25T12:25:43.000Z",
  activeTool: { providerIds: ["hermes"], name: "Hermes" },
  totals: { todayTokens: 50_860_000, recentTokens: 560_000 },
  providerHealth: {
    providers: [
      {
        id: "hermes",
        name: "Hermes",
        displayMode: "token-plan",
        status: "live",
        statusLabel: "实时",
        confidence: "reported",
        lowestRemainingPercent: demoRemaining,
        trust: {
          level: "exact-provider",
          label: "精确",
          sourceLabel: "Provider plan usage API",
          ageMs: 15_000,
          freshness: "fresh",
          explain: "来自 provider 官方使用量接口，未读取 prompt / completion / API key。"
        },
        delight: demoDelight
      }
    ]
  },
  providers: [
    {
      id: "hermes",
      name: "Hermes",
      status: "live",
      source: "hermes-local",
      confidence: "reported",
      todayTokens: 50_860_000,
      recentTokens: 560_000,
      latest: {
        timestamp: "2026-05-25T12:25:43.000Z",
        rateLimitsTrust: { status: "live", label: "实时" },
        tokenPlan: {
          remainingPercent: demoRemaining,
          usedPercent: 100 - demoRemaining,
          usedCredits: 152_750_000,
          totalCredits: 200_000_000,
          remainingCredits: 47_250_000,
          recentCredits: 560_000,
          label: "Token Plan",
          source: "xiaomi-platform",
          planName: "Token Plan",
          validUntil: "2026-05-29T00:00:00.000Z",
          snapshotAt: "2026-05-25T12:25:28.000Z"
        }
      }
    }
  ],
  system: {
    cpu: { percent: 13 },
    memory: {
      usedPercent: 57,
      freePercent: 43,
      freeBytes: 13.5 * 1024 ** 3,
      usedBytes: 18 * 1024 ** 3,
      totalBytes: 31.5 * 1024 ** 3
    }
  }
};

const hudPayload = {
  visible: true,
  tool: { name: "Hermes" },
  provider: {
    id: "hermes",
    name: "Hermes",
    displayMode: "token-plan",
    tokenPlanRemaining: demoRemaining,
    tokenPlanUsedPercent: 100 - demoRemaining,
    tokenPlanUsedCredits: 152_750_000,
    tokenPlanTotalCredits: 200_000_000,
    tokenPlanRemainingCredits: 47_250_000,
    tokenPlanRecentCredits: 560_000,
    tokenPlanSource: "xiaomi-platform",
    tokenPlanPlanName: "Token Plan",
    tokenPlanValidUntil: "2026-05-29T00:00:00.000Z",
    recentTokens: 560_000,
    syncStatus: "live",
    syncLabel: "实时",
    trust: snapshot.providerHealth.providers[0].trust,
    delight: snapshot.providerHealth.providers[0].delight
  }
};
const trustPopoverPayload = {
  status: "精确",
  level: "exact-provider",
  rows: [
    { label: "来源", value: "Provider plan usage API" },
    { label: "更新时间", value: "15 秒前（12:25:43）" },
    { label: "新鲜度", value: "fresh" },
    { label: "单位", value: "Credits" },
    { label: "判定口径", value: `Token Plan 剩余 / 总量 = ${demoRemaining}%（47.25M / 200.00M Credits）` },
    { label: "刷新策略", value: "15s cache window" }
  ],
  privacy: "未读取 prompt / completion / API key",
  explain: "来自 provider 官方使用量接口，未读取对话内容或密钥。",
  action: "了解更多数据口径"
};
const settingsPayload = {
  appearance: { glassOpacity: 0.43, glassBlur: 28, fontScale: 1 },
  windows: {
    desktopBarEnabled: true,
    toolHudEnabled: true,
    desktopWidthRatio: 0.5,
    desktopBarHeight: 64,
    toolHudWidth: 396,
    toolHudHeight: 136,
    toolHudOffsetX: 0,
    toolHudOffsetY: 0
  },
  behavior: {
    alertsEnabled: true,
    refreshMs: 15000,
    activeWindowMs: 15000,
    debugHud: false
  },
  system: { startAtLogin: false },
  alertThresholds: { caution: 40, danger: 20, critical: 10 },
  providers: {
    codex: { enabled: true, name: "Codex", source: "codex-jsonl" },
    ingest: { enabled: true, name: "本地接入 API", source: "http-ingest" },
    hermes: { enabled: true, name: "Hermes", source: "hermes-local" },
    cursor: { enabled: false, name: "Cursor", source: "planned" },
    claude: { enabled: false, name: "Claude", source: "planned" },
    gemini: { enabled: false, name: "Gemini", source: "planned" }
  },
  providerRegistry: [
    { id: "codex", name: "Codex", source: "codex-jsonl", enabled: true },
    { id: "ingest", name: "本地接入 API", source: "http-ingest", enabled: true },
    { id: "hermes", name: "Hermes", source: "hermes-local", enabled: true },
    { id: "cursor", name: "Cursor", source: "planned", enabled: false },
    { id: "claude", name: "Claude", source: "planned", enabled: false },
    { id: "gemini", name: "Gemini", source: "planned", enabled: false }
  ],
  desktopBarStage: { barX: 72, barY: 52, barWidth: 856, barHeight: 64, stageWidth: 1000, stageHeight: 220 }
};

fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(htmlOut, { recursive: true });
const windows = [];

app.whenReady().then(async () => {
  await capture(
    "topbar-ui",
    1000,
    220,
    `<body style="margin:0;background:#07131b;height:220px;overflow:hidden">${htmlFrom("index.html", appJs)}</body>`
  );
  await capture("hud-ui", 396, 136, htmlFrom("hud.html", hudJs));
  await capture("trust-popover-ui", 460, 376, htmlFrom("hud-trust-popover.html", hudTrustPopoverJs));
  await capture("settings-ui", 420, 560, htmlFrom("settings.html", settingsJs));
  await capture("settings-guide-ui", 420, 560, htmlFrom("settings.html", settingsJs), {
    scrollSelector: "[data-guide=\"user\"]"
  });
  console.log(JSON.stringify({
    topbar: path.join(out, "topbar-ui.png"),
    hud: path.join(out, "hud-ui.png"),
    trustPopover: path.join(out, "trust-popover-ui.png"),
    settings: path.join(out, "settings-ui.png"),
    settingsGuide: path.join(out, "settings-guide-ui.png"),
    mood: demoMood,
    previewVisible: showPreview
  }, null, 2));
  if (!showPreview) app.quit();
});

async function capture(name, width, height, html, options = {}) {
  const htmlPath = path.join(htmlOut, `${name}.html`);
  fs.writeFileSync(htmlPath, html, "utf8");
  const win = new BrowserWindow({
    width,
    height,
    show: showPreview,
    frame: false,
    transparent: true,
    webPreferences: {
      offscreen: !showPreview,
      contextIsolation: false,
      nodeIntegration: false
    }
  });
  windows.push(win);
  await win.loadURL(pathToFileURL(htmlPath).href);
  await new Promise((resolve) => setTimeout(resolve, 350));
  if (options.scrollSelector) {
    await win.webContents.executeJavaScript(`
      document.querySelector(${JSON.stringify(options.scrollSelector)})?.scrollIntoView({
        block: "center",
        inline: "nearest"
      });
    `);
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(out, `${name}.png`), image.toPNG());
}

function getDemoRemaining(mood) {
  if (mood === "comfy") return 85;
  if (mood === "steady") return 70;
  if (mood === "low") return 17;
  if (mood === "asleep" || mood === "login") return 0;
  return 34;
}

function getDemoDelight(mood) {
  const states = {
    comfy: {
      id: "live-comfy",
      mood: "comfy",
      shortLabel: "放心吃",
      label: "余量充足",
      tone: "comfy",
      motion: "soft",
      severity: "ok",
      cue: { mascot: "stretch" }
    },
    steady: {
      id: "live-steady",
      mood: "steady",
      shortLabel: "刚刚好",
      label: "余量稳定",
      tone: "steady",
      motion: "none",
      severity: "ok",
      cue: { mascot: "sip" }
    },
    tight: {
      id: "live-tight",
      mood: "tight",
      shortLabel: "省着吃",
      label: "余量偏紧",
      tone: "caution",
      motion: "breathe",
      severity: "warning",
      cue: { mascot: "careful" }
    },
    low: {
      id: "live-low",
      mood: "low",
      shortLabel: "省着点",
      label: "余量告急",
      tone: "danger",
      motion: "attention",
      severity: "critical",
      cue: { mascot: "small-bites" }
    },
    asleep: {
      id: "disabled",
      mood: "asleep",
      shortLabel: "睡觉中",
      label: "已关闭",
      tone: "muted",
      motion: "none",
      severity: "muted",
      cue: { mascot: "nap" }
    },
    login: {
      id: "auth-expired",
      mood: "login",
      shortLabel: "要登录",
      label: "刷新凭据",
      tone: "danger",
      motion: "attention",
      severity: "critical",
      cue: { mascot: "locked" }
    }
  };
  return states[mood] || states.tight;
}

function htmlFrom(file, js) {
  let html = fs.readFileSync(path.join(root, "src/renderer", file), "utf8");
  html = html.replace("<link rel=\"stylesheet\" href=\"./styles.css\" />", `<style>${css}</style>`);
  html = html.replace(
    /<script src="\.\/(app|hud|hud-trust-popover|settings)\.js"><\/script>/,
    `<script>${mockScript()}</script><script>${js}</script>`
  );
  return html;
}

function mockScript() {
  return `window.tokenBar={
    onUpdate(cb){setTimeout(()=>cb(${JSON.stringify(snapshot)}),0);},
    onSystemUpdate(cb){setTimeout(()=>cb(${JSON.stringify(snapshot.system)}),0);},
    onHudUpdate(cb){setTimeout(()=>cb(${JSON.stringify(hudPayload)}),0);},
    onHudTrustPopoverUpdate(cb){setTimeout(()=>cb(${JSON.stringify(trustPopoverPayload)}),0);},
    onSettingsUpdate(){},
    getSnapshot(){return Promise.resolve(${JSON.stringify(snapshot)});},
    getHudSnapshot(){return Promise.resolve(${JSON.stringify(hudPayload)});},
    getSettings(){return Promise.resolve(${JSON.stringify(settingsPayload)});},
    getLocalSetupInfo(){return Promise.resolve({endpoint:"http://127.0.0.1:17667",tokenFile:"C:\\\\Users\\\\demo\\\\AppData\\\\Roaming\\\\who-eats-token\\\\api-token.txt",statusCommand:"npm run status"});},
    openGuide(){return Promise.resolve({ok:true});},
    saveSettings(){return Promise.resolve(${JSON.stringify(settingsPayload)});},
    resetSettings(){return Promise.resolve(${JSON.stringify(settingsPayload)});},
    closeSettings(){return Promise.resolve(true);},
    previewSettings(){return Promise.resolve({ok:true});},
    setDesktopBarMouseRegion(){return Promise.resolve(true);},
    showHudTrustPopover(){return Promise.resolve(true);},
    hideHudTrustPopover(){return Promise.resolve(true);},
    resizeHudTrustPopover(){return Promise.resolve(true);},
    openSettings(){},
    close(){}
  };`;
}
