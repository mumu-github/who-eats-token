import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { DEFAULT_SETTINGS, sanitizeSettings } = require("../src/config/settings.cjs");

const mainSource = read("src/main.cjs");
const settingsSource = read("src/config/settings.cjs");
const stylesSource = read("src/renderer/styles.css");
const quotaDelightSource = read("src/protocol/quota-delight.cjs");
const statusSource = read("scripts/status.mjs");
const stabilitySource = read("scripts/stability.mjs");
const diagnosticsSource = read("scripts/diagnostics.mjs");
const lagTriageSource = read("scripts/lag-triage.mjs");
const supportBundleSource = read("scripts/support-bundle.mjs");
const delightContractSource = read("scripts/delight-contract.mjs");
const adapterFixtureSource = read("scripts/adapter-fixture.mjs");
const diagnosticsBundleSource = read("src/diagnostics/diagnostics-bundle.cjs");
const stabilityReportSource = read("src/diagnostics/stability-report.cjs");
const importUsageReportSource = read("scripts/import-usage-report.mjs");
const hermesOverlayInstaller = read("src/integrations/hermes-overlay-installer.cjs");
const browserContentScript = read("adapters/browser-extension/content-script.js");
const browserServiceWorker = read("adapters/browser-extension/service-worker.js");

assert.equal(DEFAULT_SETTINGS.behavior.debugHud, false, "Debug HUD must stay disabled by default.");
assert.equal(DEFAULT_SETTINGS.integrations.hermesOverlayAutoInstall, false, "Hermes Web UI injection must stay opt-in.");
assert.ok(DEFAULT_SETTINGS.behavior.refreshMs >= 15000, "Default provider refresh must be at least 15s.");
assert.ok(DEFAULT_SETTINGS.behavior.activeWindowMs >= 15000, "Default active-window refresh must be at least 15s.");

const aggressive = sanitizeSettings({
  behavior: {
    refreshMs: 1,
    activeWindowMs: 1
  },
  windows: {
    desktopWidthRatio: 0.9
  }
});
assert.ok(aggressive.behavior.refreshMs >= 5000, "Provider refresh lower clamp must be at least 5s.");
assert.ok(aggressive.behavior.activeWindowMs >= 3000, "Active-window lower clamp must be at least 3s.");
assert.ok(aggressive.windows.desktopWidthRatio <= 0.5, "Desktop bar width must stay capped at 1/2 screen.");

assertNumericConstant(mainSource, "SYSTEM_REFRESH_MS", 2000, Infinity);
assertNumericConstant(mainSource, "DESKTOP_BAR_REFRESH_MS", 1000, Infinity);
assertNumericConstant(mainSource, "CODEX_SESSION_WATCH_DEBOUNCE_MS", 250, 2000);
assert.ok(mainSource.includes("fs.watch("), "Codex session updates should be event-driven, not a tighter polling loop.");
assert.ok(mainSource.includes("scheduleCodexSessionRefresh"), "Codex session watcher must debounce snapshot refreshes.");
assert.ok(mainSource.includes("HUD_DEBUG_LOG_MAX_BYTES = 1 * 1024 * 1024"), "Debug log cap must stay <= 1MB.");

assert.ok(!hermesOverlayInstaller.includes("setInterval("), "Hermes overlay installer must not inject setInterval.");
assert.ok(!browserContentScript.includes("setInterval("), "Browser content script must not use setInterval.");
assert.ok(!browserServiceWorker.includes("setInterval("), "Browser service worker must not use setInterval.");
assert.ok(!quotaDelightSource.includes("setInterval("), "Quota delight state must be pure and event-driven.");
assert.ok(!statusSource.includes("setInterval("), "Status command must be one-shot and not poll.");
assert.ok(!stabilitySource.includes("setInterval("), "Stability command must be one-shot and not poll.");
assert.ok(!diagnosticsSource.includes("setInterval("), "Diagnostics command must be one-shot and not poll.");
assert.ok(!lagTriageSource.includes("setInterval("), "Lag triage command must be one-shot and not poll.");
assert.ok(!supportBundleSource.includes("setInterval("), "Support bundle command must be one-shot and not poll.");
assert.ok(!delightContractSource.includes("setInterval("), "Delight contract command must be one-shot and not poll.");
assert.ok(!adapterFixtureSource.includes("setInterval("), "Adapter fixture command must be one-shot and not poll.");
assert.ok(!diagnosticsBundleSource.includes("setInterval("), "Diagnostics bundle builder must be one-shot and not poll.");
assert.ok(!stabilityReportSource.includes("setInterval("), "Stability report builder must be pure and not poll.");
assert.ok(!importUsageReportSource.includes("setInterval("), "External summary importer must be one-shot and not poll.");
assert.ok(stylesSource.includes("prefers-reduced-motion"), "Renderer styles must respect reduced-motion preferences.");
assert.ok(!settingsSource.includes("hermesOverlayAutoInstall: true"), "Hermes overlay auto-install must not default to true.");
assert.ok(fs.existsSync(path.join(root, "docs", "performance-budget.md")), "Performance budget doc is required.");

console.log("Performance budget checks passed.");

function assertNumericConstant(source, name, min, max) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)`));
  assert.ok(match, `Missing numeric constant: ${name}`);
  const value = Number(match[1]);
  assert.ok(value >= min, `${name} must be >= ${min}.`);
  assert.ok(value <= max, `${name} must be <= ${max}.`);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}
