import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  detectTool,
  getHudCoveringDialog
} = require("../src/system/tool-detector.cjs");

testToolDetectionAndOverlayAvoidance();
testDesktopRendererProviderSelection();
testHudRendererCoupledVisuals();
testHudWindowLifecycleGuards();

console.log("HUD stability checks passed.");

function testToolDetectionAndOverlayAvoidance() {
  const codex = detectTool({
    processName: "Codex",
    title: "要在 谁在吃token 中构建什么?"
  });
  assert.equal(codex?.id, "codex", "Codex windows should resolve to the Codex tool.");
  assert.deepEqual(codex.providerIds, ["codex"], "Codex HUD must only read Codex provider data.");

  const terminalCodex = detectTool({
    processName: "pwsh",
    title: "Codex - 谁在吃token"
  });
  assert.equal(terminalCodex?.id, "codex", "An explicit Codex terminal session should resolve to Codex.");

  const codexPathOnlyTerminal = detectTool({
    processName: "powershell",
    title: "C:\\Users\\lhy10\\.codex\\worktrees\\95d9"
  });
  assert.equal(codexPathOnlyTerminal, null, "A path-only terminal title containing .codex must not show the Codex HUD.");

  const codexFolderOnlyTerminal = detectTool({
    processName: "cmd",
    title: "Command Prompt - C:\\Users\\lhy10\\Documents\\Codex\\2026-05-26"
  });
  assert.equal(codexFolderOnlyTerminal, null, "A Codex-named folder in cmd must not be treated as an active Codex tool.");

  const plainTerminal = detectTool({
    processName: "powershell",
    title: "Windows PowerShell"
  });
  assert.equal(plainTerminal, null, "Plain cmd/PowerShell windows should not inherit a stale in-tool HUD.");

  const hermes = detectTool({
    processName: "Google Chrome",
    title: "Hermes - Google Chrome",
    url: "http://127.0.0.1:8648/hermes/chat"
  });
  assert.equal(hermes?.id, "hermes-web-ui", "Hermes Web UI should be detected inside supported browsers.");
  assert.equal(hermes.hud?.bottomOffset, 115, "Hermes HUD offset should stay aligned above the chat boundary.");
  assert.deepEqual(hermes.providerIds, ["hermes"], "Hermes HUD must only read Hermes provider data.");

  const unrelatedChrome = detectTool({
    processName: "Google Chrome",
    title: "Example Domain - Google Chrome",
    url: "https://example.com"
  });
  assert.equal(unrelatedChrome, null, "Non-Hermes browser tabs must not show the Hermes HUD.");

  const activeWindow = {
    processName: "Google Chrome",
    title: "Hermes - Google Chrome",
    pid: 101,
    bounds: { x: 0, y: 0, width: 1100, height: 700 },
    contentOverlays: [
      {
        type: "message-queue",
        label: "继续",
        bounds: { x: 760, y: 430, width: 120, height: 90 }
      }
    ]
  };
  const hudBounds = { x: 740, y: 420, width: 324, height: 112 };
  const blocker = getHudCoveringDialog(activeWindow, hudBounds, activeWindow);
  assert.equal(blocker?.title, "继续", "Overlapping content controls should hide or move the HUD.");

  const safeWindow = {
    ...activeWindow,
    contentOverlays: [
      {
        type: "message-queue",
        label: "继续",
        bounds: { x: 40, y: 40, width: 120, height: 90 }
      }
    ]
  };
  assert.equal(
    getHudCoveringDialog(safeWindow, hudBounds, safeWindow),
    null,
    "Non-overlapping dialogs should not hide the HUD."
  );

  const rootLayoutWindow = {
    ...activeWindow,
    contentOverlays: [
      {
        type: "app-main",
        label: "app-main",
        bounds: { x: 0, y: 0, width: 1100, height: 700 }
      }
    ]
  };
  assert.equal(
    getHudCoveringDialog(rootLayoutWindow, hudBounds, rootLayoutWindow),
    null,
    "Large root layout panels should not be treated as blocking popups."
  );
}

function testDesktopRendererProviderSelection() {
  const harness = loadRendererScript("src/renderer/app.js");
  const snapshot = buildRendererSnapshot();

  harness.callbacks.onUpdate(snapshot);
  assert.equal(harness.text("usageName"), "Codex", "Active Codex tool should select Codex, not the tightest provider.");
  assert.equal(harness.text("primaryMetricLabel"), "5小时", "Codex should render capacity labels.");
  assert.equal(harness.text("secondaryMetricLabel"), "一周", "Codex should render weekly capacity labels.");
  assert.equal(harness.text("fiveHourRemaining"), "85%", "Codex five-hour remaining should render from Codex data.");
  assert.equal(harness.text("weekRemaining"), "80%", "Codex weekly remaining should render from Codex data.");
  assert.equal(harness.text("trustBadge"), "本地精确", "Top bar should expose Codex trust status.");
  assert.equal(harness.style("miniChart", "--five-fill"), "85%", "Mini chart should track Codex five-hour remaining.");
  assert.equal(harness.style("miniChart", "--week-fill"), "80%", "Mini chart should track Codex weekly remaining.");
  assert.equal(harness.dataset("usageStrip", "delightMood"), "comfy", "Top bar mascot mood should follow Codex delight state.");
  assert.equal(harness.dataset("usageStrip", "mascot"), "stretch", "Top bar mascot sprite should follow Codex delight cue.");

  harness.callbacks.onUpdate({
    ...snapshot,
    activeTool: { providerIds: ["hermes"] }
  });
  assert.equal(harness.text("usageName"), "Hermes", "Active Hermes tool should select Hermes data.");
  assert.equal(harness.text("primaryMetricLabel"), "总余量", "Hermes token plan should render total remaining.");
  assert.equal(harness.text("secondaryMetricLabel"), "已用", "Hermes token plan should render used credits.");
  assert.equal(harness.text("fiveHourRemaining"), "24%", "Hermes remaining should render from token plan.");
  assert.equal(harness.text("weekRemaining"), "152.75M", "Hermes used credits should render compactly.");
  assert.equal(harness.text("trustBadge"), "本地精确", "Top bar should expose Hermes trust fallback when provider health is absent.");
  assert.equal(harness.style("miniChart", "--five-fill"), "24%", "Mini chart should track Hermes remaining.");
  assert.equal(harness.style("miniChart", "--week-fill"), "76%", "Mini chart should track Hermes used percent.");
  assert.equal(harness.dataset("usageStrip", "delightMood"), "low", "Top bar should switch to the low-quota mascot state.");
  assert.equal(harness.dataset("usageStrip", "mascot"), "small-bites", "Top bar should switch to the anxious low-quota sprite cue.");

  harness.callbacks.onUpdate({
    ...snapshot,
    activeTool: null
  });
  assert.equal(harness.text("usageName"), "Hermes", "Without an active tool, the top bar should fall back to the tightest provider.");
}

function testHudRendererCoupledVisuals() {
  const harness = loadRendererScript("src/renderer/hud.js");

  harness.callbacks.onHudUpdate({
    visible: true,
    tool: { name: "Hermes" },
    provider: {
      id: "hermes",
      name: "Hermes",
      displayMode: "token-plan",
      tokenPlanRemaining: 17,
      tokenPlanUsedPercent: 83,
      tokenPlanUsedCredits: 166_510_000,
      tokenPlanTotalCredits: 200_000_000,
      tokenPlanSource: "xiaomi-platform",
      tokenPlanValidUntil: "2026-05-28T23:59:00Z",
      delight: {
        mood: "low",
        cue: { mascot: "small-bites" },
        a11yLabel: "余量告急：省着点"
      }
    }
  });
  assert.equal(harness.text("toolName"), "Hermes", "HUD should show the active tool name.");
  assert.equal(harness.text("hudFiveLabelText"), "总余量", "Token plan HUD should label remaining credits.");
  assert.equal(harness.text("hudWeekLabelText"), "已用", "Token plan HUD should label used credits.");
  assert.equal(harness.text("hudFiveHour"), "17%", "Token plan remaining should render as percent.");
  assert.equal(harness.text("hudWeek"), "166.51M", "Token plan used credits should render compactly.");
  assert.equal(harness.text("hudPlan"), "Token Plan", "HUD plan pill should show the active plan.");
  assert.equal(harness.text("hudTrust"), "精确", "HUD trust pill should expose provider exactness.");
  assert.equal(harness.text("hudPredict"), "轻量对话更稳", "HUD should show an action-oriented low-quota hint.");
  assert.equal(harness.dataset("hudChart", "level"), "danger", "HUD chart level must follow low remaining.");
  assert.equal(harness.dataset("hudMascot", "delightMood"), "low", "HUD mascot mood must follow provider delight.");
  assert.equal(harness.dataset("hudMascot", "mascot"), "small-bites", "HUD mascot sprite must follow provider delight cue.");
  assert.equal(harness.style("hudChart", "--five-fill"), "17%", "HUD chart left bar should follow remaining.");
  assert.equal(harness.style("hudChart", "--week-fill"), "83%", "HUD chart used bar should follow used percent.");
  assert.match(harness.text("hudMeta"), /平台实时/, "HUD meta should expose live platform source.");

  harness.callbacks.onHudUpdate({
    visible: true,
    tool: { name: "Codex" },
    provider: {
      id: "codex",
      name: "Codex",
      displayMode: "capacity",
      fiveHourRemaining: 95,
      weekRemaining: 80,
      recentTokens: 7_190_000,
      syncStatus: "live",
      trendLabel: "稳定",
      delight: {
        mood: "comfy",
        cue: { mascot: "stretch" },
        a11yLabel: "余量充足：放心吃"
      }
    }
  });
  assert.equal(harness.text("toolName"), "Codex", "HUD should switch tool names.");
  assert.equal(harness.text("hudFiveLabelText"), "5小时", "Codex HUD should label five-hour capacity.");
  assert.equal(harness.text("hudWeekLabelText"), "一周", "Codex HUD should label weekly capacity.");
  assert.equal(harness.text("hudFiveHour"), "95%", "Codex five-hour remaining should render.");
  assert.equal(harness.text("hudWeek"), "80%", "Codex weekly remaining should render.");
  assert.equal(harness.text("hudTrust"), "本地精确", "Codex HUD should expose local exactness.");
  assert.equal(harness.text("hudPredict"), "可以继续工作", "Healthy Codex HUD should show a calm work hint.");
  assert.equal(harness.dataset("hudChart", "level"), "healthy", "HUD chart level should recover with healthy capacity.");
  assert.equal(harness.dataset("hudMascot", "delightMood"), "comfy", "Healthy HUD should use the relaxed mascot state.");
  assert.equal(harness.dataset("hudMascot", "mascot"), "stretch", "Healthy HUD should use the overflow-token mascot cue.");
  assert.equal(harness.style("hudChart", "--five-fill"), "95%", "HUD chart should follow Codex five-hour remaining.");
  assert.equal(harness.style("hudChart", "--week-fill"), "80%", "HUD chart should follow Codex weekly remaining.");
}

function testHudWindowLifecycleGuards() {
  const mainSource = read("src/main.cjs");
  assert.match(
    mainSource,
    /function hideToolHudForUnsupportedForeground/,
    "The fast desktop foreground pass should also retire stale in-tool HUDs."
  );
  assert.match(
    mainSource,
    /function getDetectedToolContext/,
    "HUD tool detection should be shared by fast and full foreground passes."
  );
  assert.match(
    mainSource,
    /activeWindow\?\.desktop\?\.blockers/,
    "Windows shell/taskbar foreground reports should inspect desktop blockers before hiding the HUD."
  );
  assert.match(
    mainSource,
    /const fastActiveWindow = await getActiveWindow\(getFastWindowInspectionOptions\(\)\)/,
    "Full HUD refresh should recover from unreliable shell foreground misses using the low-overhead desktop pass."
  );
  assert.match(
    mainSource,
    /hiddenReason:\s*"unsupported-foreground"/,
    "Unsupported foreground windows should clear stale HUD payloads immediately."
  );
  assert.match(
    mainSource,
    /hidden-unsupported-foreground/,
    "Unsupported foreground HUD hides should be logged for diagnostics."
  );
  assert.match(
    mainSource,
    /setFocusable\(false\)/,
    "The HUD window must stay non-focusable so Explorer rename/edit focus is not stolen."
  );
}

function buildRendererSnapshot() {
  return {
    collectedAt: "2026-05-24T08:00:00.000Z",
    activeTool: {
      providerIds: ["codex"]
    },
    totals: {
      todayTokens: 0,
      recentTokens: 0
    },
    providers: [
      {
        id: "hermes",
        name: "Hermes",
        status: "live",
        todayTokens: 0,
        recentTokens: 0,
        latest: {
          timestamp: "2026-05-24T08:00:00.000Z",
          rateLimitsTrust: { status: "live", label: "Token Plan" },
          tokenPlan: {
            remainingPercent: 24,
            usedPercent: 76,
            usedCredits: 152_750_000,
            totalCredits: 200_000_000,
            remainingCredits: 47_250_000,
            label: "Token Plan"
          }
        }
      },
      {
        id: "codex",
        name: "Codex",
        status: "live",
        todayTokens: 1_100_000,
        recentTokens: 7_190_000,
        latest: {
          timestamp: "2026-05-24T08:00:00.000Z",
          rateLimitsTrust: { status: "live", label: "稳定" },
          rateLimits: {
            primary: { usedPercent: 15, resetsAt: "2026-05-24T13:00:00.000Z" },
            secondary: { usedPercent: 20, resetsAt: "2026-05-31T08:00:00.000Z" }
          },
          capacityTrend: { status: "steady", label: "稳定" }
        }
      }
    ],
    providerHealth: {
      providers: [
        {
          id: "codex",
          trust: { level: "exact-local", label: "本地精确", sourceLabel: "codex-jsonl" },
          delight: {
            mood: "comfy",
            shortLabel: "放心吃",
            cue: { mascot: "stretch" }
          }
        },
        {
          id: "hermes",
          trust: { level: "exact-local", label: "本地精确", sourceLabel: "hermes-local" },
          delight: {
            mood: "low",
            shortLabel: "省着点",
            cue: { mascot: "small-bites" }
          }
        }
      ]
    },
    system: {
      cpu: { percent: 7 },
      memory: {
        usedPercent: 61,
        freePercent: 39,
        freeBytes: 12.4 * 1024 ** 3
      }
    }
  };
}

function loadRendererScript(relativePath) {
  const elements = new Map();
  const callbacks = {};
  const context = {
    console,
    Promise,
    Date,
    Math,
    Number,
    RegExp,
    document: {
      body: createElement("body"),
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, createElement(id));
        return elements.get(id);
      },
      createElement(tagName) {
        return createElement(tagName);
      },
      documentElement: createElement("documentElement")
    },
    window: {
      tokenBar: {
        onUpdate(callback) {
          callbacks.onUpdate = callback;
        },
        onHudUpdate(callback) {
          callbacks.onHudUpdate = callback;
        },
        onSystemUpdate(callback) {
          callbacks.onSystemUpdate = callback;
        },
        onSettingsUpdate(callback) {
          callbacks.onSettingsUpdate = callback;
        },
        getSnapshot() {
          return Promise.resolve(null);
        },
        getHudSnapshot() {
          return Promise.resolve(null);
        },
        getSettings() {
          return Promise.resolve(null);
        },
        openSettings() {},
        close() {}
      }
    }
  };

  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read(relativePath), context, { filename: relativePath });

  return {
    callbacks,
    text(id) {
      return elements.get(id)?.textContent ?? "";
    },
    dataset(id, key) {
      return elements.get(id)?.dataset?.[key];
    },
    style(id, key) {
      return elements.get(id)?.style?.values?.get(key);
    }
  };

  function createElement(id) {
    return {
      id,
      tagName: id,
      textContent: "",
      title: "",
      className: "",
      dataset: {},
      children: [],
      style: {
        values: new Map(),
        setProperty(key, value) {
          this.values.set(key, value);
        }
      },
      append(...children) {
        this.children.push(...children);
      },
      replaceChildren(...children) {
        this.children = children;
      },
      setAttribute(name, value) {
        this[name] = value;
      },
      addEventListener() {},
      blur() {}
    };
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}
