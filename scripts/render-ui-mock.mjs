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
        lowestRemainingPercent: 24,
        trust: {
          level: "exact-provider",
          label: "精确",
          sourceLabel: "Provider plan usage API",
          ageMs: 15_000,
          freshness: "fresh",
          explain: "来自 provider 官方使用量接口，未读取 prompt / completion / API key。"
        },
        delight: {
          id: "live-tight",
          mood: "tight",
          shortLabel: "省着吃",
          label: "余量偏紧",
          tone: "caution",
          motion: "breathe",
          severity: "warning",
          cue: { mascot: "careful" }
        }
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
          remainingPercent: 24,
          usedPercent: 76,
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
    tokenPlanRemaining: 24,
    tokenPlanUsedPercent: 76,
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

fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(htmlOut, { recursive: true });
const windows = [];

app.whenReady().then(async () => {
  await capture(
    "topbar-ui",
    1000,
    96,
    `<body style="margin:0;background:#07131b;display:grid;place-items:center;height:96px;overflow:hidden">${htmlFrom("index.html", appJs)}</body>`
  );
  await capture("hud-ui", 396, 136, htmlFrom("hud.html", hudJs));
  console.log(JSON.stringify({
    topbar: path.join(out, "topbar-ui.png"),
    hud: path.join(out, "hud-ui.png")
  }, null, 2));
  app.quit();
});

async function capture(name, width, height, html) {
  const htmlPath = path.join(htmlOut, `${name}.html`);
  fs.writeFileSync(htmlPath, html, "utf8");
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: {
      offscreen: true,
      contextIsolation: false,
      nodeIntegration: false
    }
  });
  windows.push(win);
  await win.loadURL(pathToFileURL(htmlPath).href);
  await new Promise((resolve) => setTimeout(resolve, 350));
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(out, `${name}.png`), image.toPNG());
}

function htmlFrom(file, js) {
  let html = fs.readFileSync(path.join(root, "src/renderer", file), "utf8");
  html = html.replace("<link rel=\"stylesheet\" href=\"./styles.css\" />", `<style>${css}</style>`);
  html = html.replace(
    /<script src="\.\/(app|hud)\.js"><\/script>/,
    `<script>${mockScript()}</script><script>${js}</script>`
  );
  return html;
}

function mockScript() {
  return `window.tokenBar={
    onUpdate(cb){setTimeout(()=>cb(${JSON.stringify(snapshot)}),0);},
    onSystemUpdate(cb){setTimeout(()=>cb(${JSON.stringify(snapshot.system)}),0);},
    onHudUpdate(cb){setTimeout(()=>cb(${JSON.stringify(hudPayload)}),0);},
    onSettingsUpdate(){},
    getSnapshot(){return Promise.resolve(${JSON.stringify(snapshot)});},
    getHudSnapshot(){return Promise.resolve(${JSON.stringify(hudPayload)});},
    getSettings(){return Promise.resolve({appearance:{glassOpacity:.43,glassBlur:28,fontScale:1}});},
    openSettings(){},
    close(){}
  };`;
}
