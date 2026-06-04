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

async function capture(win, { source, output, width, height, mockKind, extraStyle }) {
  win.setContentSize(width, height);
  const htmlPath = writeInjectedHtml(source, mockKind, extraStyle);
  await withTimeout(win.loadURL(pathToFileURL(htmlPath).href), 15000, `load ${source}`);
  await waitForIdle(win);
  const image = await win.webContents.capturePage();
  const outputPath = path.join(outputDir, output);
  fs.writeFileSync(outputPath, image.toPNG());
  console.log(`wrote ${path.relative(root, outputPath).replace(/\\/g, "/")}`);
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
      const hudPayload = ${JSON.stringify(hudPayload)};
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

function waitForIdle(win) {
  return new Promise((resolve) => {
    setTimeout(async () => {
      await win.webContents.executeJavaScript(`
        new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
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
  if (!["desktop", "hud", "settings"].includes(value)) {
    throw new Error(`Unknown --only value: ${value}`);
  }
  return value;
}
