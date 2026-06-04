const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow } = require("electron");
const { getQuotaDelight } = require("../src/protocol/quota-delight.cjs");

const root = path.resolve(__dirname, "..");
const rendererDir = path.join(root, "src", "renderer");
const outputDir = path.join(root, "docs", "assets", "screenshots");
const tempDir = path.join(root, "output", "readme-screenshots");
const only = getOnlyArg(process.argv.slice(2));

const settings = {
  appearance: {
    glassOpacity: 0.43,
    glassBlur: 28,
    fontScale: 1
  },
  windows: {
    desktopBarEnabled: true,
    desktopWidthRatio: 0.86,
    desktopBarHeight: 64,
    toolHudEnabled: true,
    toolHudWidth: 360,
    toolHudHeight: 148,
    toolHudOffsetX: -20,
    toolHudOffsetY: 20
  },
  behavior: {
    alertsEnabled: true,
    refreshMs: 15000,
    activeWindowMs: 7000
  },
  alertThresholds: {
    caution: 45,
    danger: 20,
    critical: 10
  },
  system: {
    startAtLogin: false
  },
  providers: {
    codex: { enabled: true },
    hermes: { enabled: true },
    browser: { enabled: true },
    vscode: { enabled: true }
  },
  providerRegistry: [
    { id: "codex", name: "Codex Desktop", source: "codex-jsonl", enabled: true },
    { id: "hermes", name: "Hermes Bridge", source: "hermes-bridge", enabled: true },
    { id: "browser", name: "Browser Adapter", source: "http-ingest", enabled: true },
    { id: "vscode", name: "VS Code / Cursor", source: "planned", enabled: false }
  ]
};

const codexDelight = getQuotaDelight({
  status: "live",
  freshness: "fresh",
  lowestRemainingPercent: 72
});

const hermesDelight = getQuotaDelight({
  status: "estimated",
  freshness: "fresh",
  lowestRemainingPercent: 34
});

const lowQuotaDelight = getQuotaDelight({
  status: "live",
  freshness: "fresh",
  lowestRemainingPercent: 12
});

const snapshot = {
  collectedAt: "2026-06-04T10:00:00.000Z",
  activeTool: {
    name: "Codex Desktop",
    providerIds: ["codex"]
  },
  totals: {
    todayTokens: 212000,
    recentTokens: 18400
  },
  system: {
    cpu: { percent: 8 },
    memory: {
      usedPercent: 48,
      freePercent: 52,
      usedBytes: 8.2 * 1024 ** 3,
      totalBytes: 16 * 1024 ** 3,
      freeBytes: 7.8 * 1024 ** 3
    },
    process: {
      rssBytes: 152 * 1024 ** 2
    }
  },
  settings,
  providerHealth: {
    providers: [
      {
        id: "codex",
        name: "Codex Desktop",
        status: "live",
        freshness: "fresh",
        displayMode: "capacity",
        lowestRemainingPercent: 72,
        delight: codexDelight,
        trust: {
          level: "exact-local",
          label: "本地精确",
          sourceLabel: "Codex JSONL",
          ageMs: 32000,
          freshness: "fresh",
          explain: "来自本机 token_count 事件。"
        }
      },
      {
        id: "hermes",
        name: "Hermes Bridge",
        status: "estimated",
        freshness: "fresh",
        displayMode: "token-plan",
        lowestRemainingPercent: 34,
        delight: hermesDelight,
        trust: {
          level: "estimate",
          label: "估算",
          sourceLabel: "Hermes local",
          ageMs: 48000,
          freshness: "fresh",
          explain: "来自本地 bridge usage。"
        }
      }
    ]
  },
  providers: [
    {
      id: "codex",
      name: "Codex Desktop",
      source: "codex-jsonl",
      status: "live",
      todayTokens: 212000,
      recentTokens: 18400,
      collectedAt: "2026-06-04T10:00:00.000Z",
      latest: {
        timestamp: "2026-06-04T09:59:28.000Z",
        rateLimitsTrust: {
          status: "live",
          label: "本地精确",
          reason: "来自本机 token_count 事件。"
        },
        rateLimits: {
          primary: {
            usedPercent: 28,
            windowMinutes: 300,
            resetsAt: "2026-06-04T14:32:00+08:00"
          },
          secondary: {
            usedPercent: 16,
            windowMinutes: 10080,
            resetsAt: "2026-06-11T10:00:00+08:00"
          }
        },
        capacityTrend: {
          status: "using",
          label: "消耗中",
          forecast: {
            status: "safe",
            label: "可以继续工作"
          }
        }
      }
    },
    {
      id: "hermes",
      name: "Hermes Bridge",
      source: "hermes-bridge",
      status: "estimated",
      todayTokens: 98000,
      recentTokens: 9200,
      latest: {
        timestamp: "2026-06-04T09:59:12.000Z",
        rateLimitsTrust: {
          status: "estimated",
          label: "估算"
        },
        tokenPlan: {
          planName: "Local Token Plan",
          usedCredits: 22400000,
          totalCredits: 200000000,
          remainingCredits: 177600000,
          usedPercent: 11,
          remainingPercent: 89,
          recentCredits: 9200,
          source: "local-estimate",
          snapshotAt: "2026-06-04T09:59:12.000Z",
          validUntil: "2026-06-30T23:59:00+08:00"
        }
      }
    }
  ]
};

const hudPayload = {
  visible: true,
  tool: { name: "Codex Desktop" },
  provider: {
    id: "codex",
    name: "Codex Desktop",
    displayMode: "capacity",
    fiveHourRemaining: 72,
    weekRemaining: 84,
    todayTokens: 212000,
    recentTokens: 18400,
    syncStatus: "live",
    syncLabel: "本地精确",
    trendStatus: "using",
    trendLabel: "消耗中",
    fiveHourResetsAt: "2026-06-04T14:32:00+08:00",
    capacityTrend: {
      forecast: {
        status: "safe",
        label: "可以继续工作"
      }
    },
    delight: codexDelight,
    trust: {
      level: "exact-local",
      label: "本地精确",
      sourceLabel: "Codex JSONL",
      ageMs: 32000,
      freshness: "fresh",
      explain: "来自本机 token_count 事件。"
    }
  }
};

const lowQuotaHudPayload = {
  visible: true,
  tool: { name: "Codex Desktop" },
  provider: {
    id: "codex-low",
    name: "Codex Desktop",
    displayMode: "capacity",
    fiveHourRemaining: 12,
    weekRemaining: 28,
    todayTokens: 286000,
    recentTokens: 31200,
    syncStatus: "live",
    syncLabel: "本地精确",
    trendStatus: "fast",
    trendLabel: "消耗偏快",
    fiveHourResetsAt: "2026-06-04T14:32:00+08:00",
    capacityTrend: {
      forecast: {
        status: "soon",
        label: "建议等重置更稳"
      }
    },
    delight: lowQuotaDelight,
    trust: {
      level: "exact-local",
      label: "本地精确",
      sourceLabel: "Codex JSONL",
      ageMs: 18000,
      freshness: "fresh",
      explain: "来自本机 token_count 事件。"
    }
  }
};

const tokenPlanHudPayload = {
  visible: true,
  tool: { name: "Hermes Bridge" },
  provider: {
    id: "hermes",
    name: "Hermes Bridge",
    displayMode: "token-plan",
    tokenPlanPlanName: "Local Token Plan",
    tokenPlanRemaining: 34,
    tokenPlanUsedPercent: 66,
    tokenPlanUsedCredits: 132000000,
    tokenPlanTotalCredits: 200000000,
    tokenPlanRemainingCredits: 68000000,
    tokenPlanRecentCredits: 820000,
    tokenPlanSource: "local-estimate",
    todayTokens: 2280000,
    recentTokens: 410000,
    syncStatus: "live",
    syncLabel: "本地估算",
    trendStatus: "using",
    trendLabel: "计划余量",
    delight: hermesDelight,
    trust: {
      level: "estimate",
      label: "估算",
      sourceLabel: "Hermes local",
      ageMs: 48000,
      freshness: "fresh",
      explain: "来自本地 bridge usage。"
    }
  }
};

const hudPayloads = {
  hud: hudPayload,
  "hud-low": lowQuotaHudPayload,
  "hud-plan": tokenPlanHudPayload
};

const watchdog = setTimeout(() => {
  console.error("README screenshot generation timed out.");
  app.exit(1);
}, 45000);

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  app.exit(1);
});

async function main() {
  await app.whenReady();
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });

  const targets = [
    {
      source: "index.html",
      output: "desktop-top-bar.png",
      width: 1280,
      height: 210,
      mockKind: "desktop",
      extraStyle: `
        html, body, .shell {
          background:
            radial-gradient(circle at 10% 10%, rgba(125, 242, 173, 0.16), transparent 28%),
            radial-gradient(circle at 92% 18%, rgba(139, 215, 255, 0.14), transparent 30%),
            linear-gradient(135deg, #101821 0%, #18212b 48%, #12171f 100%) !important;
        }
        .bar { top: 44px; }
      `
    },
    {
      source: "hud.html",
      output: "in-tool-hud.png",
      width: 430,
      height: 260,
      mockKind: "hud",
      extraStyle: `
        html, body {
          background:
            radial-gradient(circle at 20% 12%, rgba(255, 211, 111, 0.13), transparent 34%),
            radial-gradient(circle at 88% 22%, rgba(139, 215, 255, 0.16), transparent 34%),
            linear-gradient(135deg, #101821 0%, #171f2a 100%) !important;
        }
        .hud {
          position: absolute;
          left: 34px;
          top: 38px;
          width: calc(100vw - 68px);
          height: calc(100vh - 76px);
        }
      `
    },
    {
      source: "hud.html",
      output: "token-plan-hud.png",
      width: 430,
      height: 260,
      mockKind: "hud-plan",
      extraStyle: `
        html, body {
          background:
            radial-gradient(circle at 18% 18%, rgba(125, 242, 173, 0.14), transparent 33%),
            radial-gradient(circle at 86% 20%, rgba(139, 215, 255, 0.18), transparent 34%),
            linear-gradient(135deg, #0f1820 0%, #17212a 100%) !important;
        }
        .hud {
          position: absolute;
          left: 34px;
          top: 38px;
          width: calc(100vw - 68px);
          height: calc(100vh - 76px);
        }
      `
    },
    {
      source: "hud.html",
      output: "low-quota-hud.png",
      width: 430,
      height: 260,
      mockKind: "hud-low",
      extraStyle: `
        html, body {
          background:
            radial-gradient(circle at 18% 16%, rgba(255, 211, 111, 0.16), transparent 33%),
            radial-gradient(circle at 88% 18%, rgba(255, 111, 111, 0.11), transparent 34%),
            linear-gradient(135deg, #151821 0%, #211920 100%) !important;
        }
        .hud {
          position: absolute;
          left: 34px;
          top: 38px;
          width: calc(100vw - 68px);
          height: calc(100vh - 76px);
        }
      `
    },
    {
      source: "settings.html",
      output: "settings-panel.png",
      width: 430,
      height: 690,
      mockKind: "settings",
      extraStyle: `
        html, body {
          background:
            radial-gradient(circle at 8% 0%, rgba(255, 211, 111, 0.16), transparent 28%),
            radial-gradient(circle at 92% 10%, rgba(139, 215, 255, 0.16), transparent 30%),
            linear-gradient(135deg, #111822 0%, #161e29 100%) !important;
        }
      `
    },
    {
      output: "runtime-showcase.png",
      width: 1280,
      height: 540,
      mockKind: "runtime-showcase",
      html: getRuntimeShowcaseHtml
    },
    {
      output: "visual-assets-showcase.png",
      width: 1280,
      height: 620,
      mockKind: "visual-assets",
      html: getVisualAssetsShowcaseHtml
    }
  ];

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    frame: false,
    useContentSize: true,
    show: false,
    resizable: false,
    transparent: false,
    backgroundColor: "#101821",
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.setMenuBarVisibility(false);

  for (const target of targets) {
    if (only && target.mockKind !== only) continue;
    await capture(win, target);
  }
  win.destroy();
  clearTimeout(watchdog);
  app.quit();
}

async function capture(win, { source, output, width, height, mockKind, extraStyle, html }) {
  win.setContentSize(width, height);
  const htmlPath = html
    ? writeStaticHtml(`${mockKind}.html`, html())
    : writeInjectedHtml(source, mockKind, extraStyle);
  const url = `${pathToFileURL(htmlPath).href}?kind=${encodeURIComponent(mockKind)}`;
  await withTimeout(win.loadURL(url), 15000, `load ${source}`);
  await waitForIdle(win);
  const image = await win.webContents.capturePage();
  const outputPath = path.join(outputDir, output);
  fs.writeFileSync(outputPath, image.toPNG());
  console.log(`wrote ${path.relative(root, outputPath).replace(/\\/g, "/")}`);
}

function writeStaticHtml(name, html) {
  const htmlPath = path.join(tempDir, name);
  fs.writeFileSync(htmlPath, html);
  return htmlPath;
}

function writeInjectedHtml(source, mockKind, extraStyle) {
  const sourcePath = path.join(rendererDir, source);
  const html = fs.readFileSync(sourcePath, "utf8");
  const base = pathToFileURL(rendererDir + path.sep).href;
  const mock = `<script>${mockScript(mockKind)}</script>`;
  const injected = html
    .replace("<head>", `<head>\n    <base href="${base}" />`)
    .replace("</head>", `    <style>${extraStyle}</style>\n  </head>`)
    .replace('<script src="./app.js"></script>', `${mock}\n    <script src="./app.js"></script>`)
    .replace('<script src="./hud.js"></script>', `${mock}\n    <script src="./hud.js"></script>`)
    .replace('<script src="./settings.js"></script>', `${mock}\n    <script src="./settings.js"></script>`);
  const htmlPath = path.join(tempDir, `${path.basename(source, ".html")}-screenshot.html`);
  fs.writeFileSync(htmlPath, injected);
  return htmlPath;
}

function mockScript(kind) {
  return `
    (() => {
      const settings = ${JSON.stringify(settings)};
      const snapshot = ${JSON.stringify(snapshot)};
      const hudPayload = ${JSON.stringify(getHudPayload(kind))};
      const listeners = {
        update: [],
        system: [],
        settings: [],
        hud: []
      };
      window.tokenBar = {
        close() {},
        closeSettings() {},
        openSettings() {},
        openGuide() { return Promise.resolve({ ok: true }); },
        saveSettings(next) { return Promise.resolve(next || settings); },
        resetSettings() { return Promise.resolve(settings); },
        previewSettings() { return Promise.resolve({ ok: true }); },
        setDesktopBarMouseRegion() { return Promise.resolve({ ok: true }); },
        showHudTrustPopover() {},
        hideHudTrustPopover() {},
        getSettings() { return Promise.resolve(settings); },
        getSnapshot() { return Promise.resolve(snapshot); },
        getHudSnapshot() { return Promise.resolve(hudPayload); },
        getLocalSetupInfo() {
          return Promise.resolve({
            endpoint: "http://127.0.0.1:17667",
            tokenSource: "local token file",
            tokenFile: "%APPDATA%/who-eats-token/api-token.txt"
          });
        },
        onUpdate(callback) { listeners.update.push(callback); },
        onSystemUpdate(callback) { listeners.system.push(callback); },
        onSettingsUpdate(callback) { listeners.settings.push(callback); },
        onHudUpdate(callback) { listeners.hud.push(callback); }
      };
      window.__whoEatsTokenScreenshotKind = ${JSON.stringify(kind)};
    })();
  `;
}

function getHudPayload(kind) {
  return hudPayloads[kind] || hudPayload;
}

function getRuntimeShowcaseHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      ${showcaseBaseCss()}
      .runtime {
        display: grid;
        grid-template-rows: 204px auto;
        gap: 20px;
      }
      .bar-frame {
        min-width: 0;
      }
      .bar-shot {
        overflow: hidden;
        border: 1px solid rgba(160, 206, 236, 0.16);
        background: rgba(16, 24, 33, 0.78);
      }
      .bar-shot img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      .hud-row {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 18px;
      }
      .hud-shot {
        overflow: hidden;
        border: 1px solid rgba(160, 206, 236, 0.13);
        background: rgba(15, 22, 31, 0.78);
      }
      .hud-shot img {
        display: block;
        width: 100%;
        height: auto;
        object-fit: contain;
      }
    </style>
  </head>
  <body>
    <main class="stage runtime">
      <section class="bar-frame">
        <div class="bar-shot">
          <img src="${screenshotUrl("desktop-top-bar.png")}" alt="" />
        </div>
      </section>
      <section class="hud-row">
        <div class="hud-shot"><img src="${screenshotUrl("in-tool-hud.png")}" alt="" /></div>
        <div class="hud-shot"><img src="${screenshotUrl("token-plan-hud.png")}" alt="" /></div>
        <div class="hud-shot"><img src="${screenshotUrl("low-quota-hud.png")}" alt="" /></div>
      </section>
    </main>
  </body>
</html>`;
}

function getVisualAssetsShowcaseHtml() {
  const mascots = [
    ["comfy", "mascot-comfy.png"],
    ["careful", "mascot-careful.png"],
    ["low", "mascot-low.png"],
    ["login", "mascot-login.png"],
    ["asleep", "mascot-asleep.png"]
  ];
  const roaming = [
    ["catch", "roaming/token-catch.png"],
    ["eat", "roaming/token-eat.png"],
    ["guard", "roaming/token-guard.png"],
    ["panic", "roaming/token-panic.png"],
    ["run", "roaming/token-run.png"]
  ];
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      ${showcaseBaseCss()}
      .assets {
        display: grid;
        grid-template-columns: 430px 1fr;
        gap: 28px;
      }
      .settings-preview {
        overflow: hidden;
        border: 1px solid rgba(160, 206, 236, 0.16);
        background: rgba(16, 24, 33, 0.78);
      }
      .settings-preview img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: top center;
      }
      .asset-board {
        display: grid;
        grid-template-rows: auto 1fr;
        gap: 18px;
        min-width: 0;
      }
      .asset-head {
        display: grid;
        grid-template-columns: 1fr 208px;
        gap: 22px;
        align-items: center;
      }
      .asset-copy h1 {
        margin: 0 0 10px;
        font-size: 34px;
        line-height: 1.08;
      }
      .asset-copy p {
        margin: 0;
        max-width: 560px;
        color: rgba(234, 244, 255, 0.68);
        font-size: 17px;
        line-height: 1.45;
      }
      .generator-hero {
        position: relative;
        display: grid;
        place-items: center;
        min-height: 172px;
        overflow: hidden;
        border: 1px solid rgba(255, 211, 111, 0.22);
        background:
          radial-gradient(circle at 50% 40%, rgba(255, 211, 111, 0.19), transparent 56%),
          rgba(26, 31, 41, 0.76);
      }
      .generator-hero img {
        width: 158px;
        height: 158px;
        object-fit: contain;
        filter: drop-shadow(0 16px 24px rgba(0, 0, 0, 0.32));
      }
      .asset-grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 14px;
      }
      .asset-tile {
        position: relative;
        display: grid;
        grid-template-rows: 1fr auto;
        align-items: center;
        justify-items: center;
        min-height: 154px;
        padding: 14px 10px 12px;
        overflow: hidden;
        border: 1px solid rgba(160, 206, 236, 0.13);
        background:
          radial-gradient(circle at 50% 34%, rgba(139, 215, 255, 0.12), transparent 48%),
          rgba(18, 26, 36, 0.78);
      }
      .asset-tile[data-tone="warm"] {
        background:
          radial-gradient(circle at 50% 34%, rgba(255, 211, 111, 0.16), transparent 50%),
          rgba(24, 26, 34, 0.8);
      }
      .asset-tile img {
        max-width: 110px;
        max-height: 104px;
        object-fit: contain;
        filter: drop-shadow(0 12px 18px rgba(0, 0, 0, 0.28));
      }
      .asset-tile[data-large="true"] img {
        max-width: 126px;
        max-height: 122px;
      }
      .asset-tile span {
        color: rgba(234, 244, 255, 0.7);
        font-size: 13px;
        letter-spacing: 0;
        text-transform: uppercase;
      }
    </style>
  </head>
  <body>
    <main class="stage assets">
      <section class="settings-preview">
        <img src="${screenshotUrl("settings-panel.png")}" alt="" />
      </section>
      <section class="asset-board">
        <div class="asset-head">
          <div class="asset-copy">
            <h1>Mascot and token asset system</h1>
            <p>README evidence now shows the actual delight assets used by the HUD: mascot moods, flying token coins, and the token generator scene.</p>
          </div>
          <div class="generator-hero">
            <img src="${delightUrl("roaming/token-generator.png")}" alt="" />
          </div>
        </div>
        <div class="asset-grid">
          ${mascots.map(([label, file]) => assetTile(label, delightUrl(file), "warm")).join("")}
          ${roaming.map(([label, file]) => assetTile(label, delightUrl(file))).join("")}
        </div>
      </section>
    </main>
  </body>
</html>`;
}

function assetTile(label, url, tone = "") {
  const large = label === "generator" || label === "desktop" ? " data-large=\"true\"" : "";
  const toneAttr = tone ? ` data-tone="${tone}"` : "";
  return `<div class="asset-tile"${toneAttr}${large}><img src="${url}" alt="" /><span>${label}</span></div>`;
}

function showcaseBaseCss() {
  return `
      * {
        box-sizing: border-box;
      }
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background:
          radial-gradient(circle at 10% 12%, rgba(125, 242, 173, 0.13), transparent 26%),
          radial-gradient(circle at 88% 10%, rgba(139, 215, 255, 0.16), transparent 28%),
          radial-gradient(circle at 78% 88%, rgba(255, 211, 111, 0.12), transparent 28%),
          linear-gradient(135deg, #0e141d 0%, #121a24 48%, #0f131b 100%);
        color: #f4f8fb;
        font-family: "Comic Sans MS", "Segoe UI", Arial, sans-serif;
      }
      .stage {
        width: 100vw;
        height: 100vh;
        padding: 34px;
      }
      .bar-shot,
      .signal,
      .hud-shot,
      .settings-preview,
      .generator-hero,
      .asset-tile {
        border-radius: 18px;
        box-shadow:
          0 22px 48px rgba(0, 0, 0, 0.28),
          inset 0 1px 0 rgba(255, 255, 255, 0.06);
      }
  `;
}

function screenshotUrl(file) {
  return assetUrl("docs", "assets", "screenshots", file);
}

function delightUrl(file) {
  return assetUrl("src", "assets", "delight", file);
}

function assetUrl(...segments) {
  return pathToFileURL(path.join(root, ...segments)).href;
}

function waitForIdle(win) {
  return new Promise((resolve) => {
    setTimeout(async () => {
      await win.webContents.executeJavaScript(`
        Promise.all(
          Array.from(document.images || []).map((image) => {
            if (image.complete) return Promise.resolve();
            return new Promise((resolve) => {
              image.addEventListener("load", resolve, { once: true });
              image.addEventListener("error", resolve, { once: true });
            });
          })
        ).then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      `);
      resolve();
    }, 500);
  });
}

function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}

function getOnlyArg(argv) {
  const arg = argv.find((item) => item.startsWith("--only="));
  if (!arg) return "";
  const value = arg.slice("--only=".length);
  if (!["desktop", "hud", "hud-low", "hud-plan", "settings", "runtime-showcase", "visual-assets"].includes(value)) {
    throw new Error(`Unknown --only value: ${value}`);
  }
  return value;
}
