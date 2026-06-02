"use strict";

/**
 * Runtime smoke tests for hud-payload.cjs.
 *
 * Covers: buildHudPayload, getWindowRemaining, summarizeHudWindow,
 * summarizeHudTool, summarizeHudPayload, summarizeProviders,
 * buildHudDebugEntry, numberOrZero, numberOrNull, roundedNumberOrNull,
 * findProvider, formatResetForNotification.
 *
 * Run: node scripts/test-hud-payload.mjs
 */

import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function pathToFileURL(p) {
  return new URL("file:///" + p.replace(/\\/g, "/"));
}

const mod = await import(
  pathToFileURL(path.resolve(__dirname, "../src/main/hud-payload.cjs")).href
);

const {
  buildHudPayload,
  getWindowRemaining,
  summarizeHudWindow,
  summarizeHudTool,
  summarizeHudPayload,
  summarizeProviders,
  buildHudDebugEntry,
  numberOrZero,
  numberOrNull,
  roundedNumberOrNull,
  findProvider,
  formatResetForNotification,
} = mod;

// ── Fixtures ─────────────────────────────────────────────────────────

const MOCK_TOOL = {
  id: "codex",
  name: "Codex",
  providerIds: ["codex"],
  hud: { bottomOffset: 20 },
};

const MOCK_SNAPSHOT = {
  collectedAt: "2026-06-02T10:00:00.000Z",
  providers: [
    {
      id: "codex",
      name: "Codex",
      confidence: 0.95,
      todayTokens: 50000,
      recentTokens: 120000,
      status: "live",
      latest: {
        model: "o3",
        rateLimits: {
          primary: { usedPercent: 35, resetsAt: "2026-06-02T15:00:00.000Z" },
          secondary: { usedPercent: 10, resetsAt: "2026-06-09T00:00:00.000Z" },
        },
        rateLimitsTrust: { status: "ok", label: "正常" },
        capacityTrend: { status: "stable", label: "稳定" },
        context: { remainingPercent: 72, usedTokens: 28000, limitTokens: 100000 },
      },
    },
    {
      id: "openai",
      name: "OpenAI",
      confidence: 0.8,
      todayTokens: 20000,
      recentTokens: 50000,
      status: "missing",
      latest: {},
    },
  ],
  providerHealth: {
    providers: [
      { id: "codex", tokenAccuracy: 0.9, trust: "high", delight: true },
    ],
  },
};

const MOCK_ACTIVE_WINDOW = {
  processName: "Codex",
  title: "My Project",
  bounds: { x: 100, y: 100, width: 800, height: 600 },
  className: "Chrome_WidgetWin_1",
};

// ── Test 1: Imports ──────────────────────────────────────────────────

console.log("\n[Test 1] Imports");

assert.strictEqual(typeof buildHudPayload, "function");
assert.strictEqual(typeof getWindowRemaining, "function");
assert.strictEqual(typeof summarizeHudWindow, "function");
assert.strictEqual(typeof summarizeHudTool, "function");
assert.strictEqual(typeof summarizeHudPayload, "function");
assert.strictEqual(typeof summarizeProviders, "function");
assert.strictEqual(typeof buildHudDebugEntry, "function");
assert.strictEqual(typeof numberOrZero, "function");
assert.strictEqual(typeof numberOrNull, "function");
assert.strictEqual(typeof roundedNumberOrNull, "function");
assert.strictEqual(typeof findProvider, "function");
assert.strictEqual(typeof formatResetForNotification, "function");

console.log("  ✅ All 12 functions imported");

// ── Test 2: numberOrZero ─────────────────────────────────────────────

console.log("\n[Test 2] numberOrZero");

assert.strictEqual(numberOrZero(42), 42, "number → number");
assert.strictEqual(numberOrZero(0), 0, "zero → 0");
assert.strictEqual(numberOrZero("100"), 100, "string number → number");
assert.strictEqual(numberOrZero("abc"), 0, "invalid → 0");
assert.strictEqual(numberOrZero(null), 0, "null → 0");
assert.strictEqual(numberOrZero(undefined), 0, "undefined → 0");
assert.strictEqual(numberOrZero(NaN), 0, "NaN → 0");

console.log("  ✅ numberOrZero correct");

// ── Test 3: numberOrNull ─────────────────────────────────────────────

console.log("\n[Test 3] numberOrNull");

assert.strictEqual(numberOrNull(42), 42, "number → number");
assert.strictEqual(numberOrNull(0), 0, "zero → 0");
assert.strictEqual(numberOrNull("100"), 100, "string number → number");
assert.strictEqual(numberOrNull("abc"), null, "invalid → null");
assert.strictEqual(numberOrNull(null), 0, "null → 0 (Number(null)=0)");
assert.strictEqual(numberOrNull(undefined), null, "undefined → null");

console.log("  ✅ numberOrNull correct");

// ── Test 4: roundedNumberOrNull ──────────────────────────────────────

console.log("\n[Test 4] roundedNumberOrNull");

assert.strictEqual(roundedNumberOrNull(42.6), 43, "42.6 → 43");
assert.strictEqual(roundedNumberOrNull(42.4), 42, "42.4 → 42");
assert.strictEqual(roundedNumberOrNull("75.5"), 76, "string → rounded");
assert.strictEqual(roundedNumberOrNull("abc"), null, "invalid → null");
assert.strictEqual(roundedNumberOrNull(null), 0, "null → 0 (Number(null)=0)");

console.log("  ✅ roundedNumberOrNull correct");

// ── Test 5: findProvider ─────────────────────────────────────────────

console.log("\n[Test 5] findProvider");

const providers = [
  { id: "codex", name: "Codex" },
  { id: "openai", name: "OpenAI" },
];

assert.deepStrictEqual(
  findProvider(providers, ["codex"]),
  { id: "codex", name: "Codex" },
  "find codex"
);
assert.strictEqual(
  findProvider(providers, ["claude"]),
  undefined,
  "missing → undefined"
);
assert.strictEqual(
  findProvider([], ["codex"]),
  undefined,
  "empty array → undefined"
);

console.log("  ✅ findProvider correct");

// ── Test 6: getWindowRemaining ───────────────────────────────────────

console.log("\n[Test 6] getWindowRemaining");

assert.strictEqual(getWindowRemaining(null), null, "null → null");
assert.strictEqual(
  getWindowRemaining({ usedPercent: 35 }),
  65,
  "35% used → 65% remaining"
);
assert.strictEqual(
  getWindowRemaining({ usedPercent: 100 }),
  0,
  "100% used → 0"
);
assert.strictEqual(
  getWindowRemaining({ usedPercent: 0 }),
  100,
  "0% used → 100"
);
assert.strictEqual(
  getWindowRemaining({ usedPercent: 110 }),
  0,
  "over 100% → clamp to 0"
);

console.log("  ✅ getWindowRemaining correct");

// ── Test 7: summarizeHudTool ─────────────────────────────────────────

console.log("\n[Test 7] summarizeHudTool");

assert.strictEqual(summarizeHudTool(null), null, "null → null");

const toolSummary = summarizeHudTool(MOCK_TOOL);
assert.strictEqual(toolSummary.id, "codex");
assert.strictEqual(toolSummary.name, "Codex");
assert.deepStrictEqual(toolSummary.providerIds, ["codex"]);
assert.strictEqual(toolSummary.bottomOffset, 20);

const noHud = summarizeHudTool({ id: "test", name: "Test" });
assert.strictEqual(noHud.bottomOffset, null, "no hud → null bottomOffset");

console.log("  ✅ summarizeHudTool correct");

// ── Test 8: summarizeHudWindow ───────────────────────────────────────

console.log("\n[Test 8] summarizeHudWindow");

assert.strictEqual(summarizeHudWindow(null), null, "null → null");

const winSummary = summarizeHudWindow(MOCK_ACTIVE_WINDOW);
assert.strictEqual(winSummary.processName, "Codex");
assert.strictEqual(winSummary.title, "My Project");
assert.strictEqual(winSummary.className, "Chrome_WidgetWin_1");
assert.ok(winSummary.bounds, "bounds must be normalized");

console.log("  ✅ summarizeHudWindow correct");

// ── Test 9: summarizeProviders ───────────────────────────────────────

console.log("\n[Test 9] summarizeProviders");

const summary = summarizeProviders(MOCK_SNAPSHOT.providers);
assert.strictEqual(summary.todayTokens, 70000, "50000+20000=70000");
assert.strictEqual(summary.recentTokens, 170000, "120000+50000=170000");
assert.strictEqual(summary.liveProviders, 1, "1 live");
assert.strictEqual(summary.missingProviders, 1, "1 missing");
assert.strictEqual(summary.todayCostUsd, 0, "no cost data → 0");

console.log("  ✅ summarizeProviders correct");

// ── Test 10: buildHudPayload - no tool ───────────────────────────────

console.log("\n[Test 10] buildHudPayload - no tool (null)");

const noToolPayload = buildHudPayload(MOCK_SNAPSHOT, MOCK_ACTIVE_WINDOW, null);
assert.strictEqual(noToolPayload.visible, false, "no tool → invisible");
assert.deepStrictEqual(
  noToolPayload.activeWindow,
  MOCK_ACTIVE_WINDOW,
  "preserves activeWindow"
);
assert.strictEqual(noToolPayload.provider, undefined, "no provider key");

console.log("  ✅ No-tool payload correct");

// ── Test 11: buildHudPayload - full provider ─────────────────────────

console.log("\n[Test 11] buildHudPayload - full provider data");

const payload = buildHudPayload(MOCK_SNAPSHOT, MOCK_ACTIVE_WINDOW, MOCK_TOOL);

assert.strictEqual(payload.visible, true, "with tool → visible");
assert.strictEqual(payload.tool, MOCK_TOOL, "tool preserved");
assert.strictEqual(payload.collectedAt, MOCK_SNAPSHOT.collectedAt, "collectedAt");

const p = payload.provider;
assert.ok(p, "provider must exist");
assert.strictEqual(p.id, "codex");
assert.strictEqual(p.name, "Codex");
assert.strictEqual(p.confidence, 0.95);
assert.strictEqual(p.todayTokens, 50000);
assert.strictEqual(p.recentTokens, 120000);
assert.strictEqual(p.model, "o3");
assert.strictEqual(p.usedPercent, 35, "primary window usedPercent 35");
assert.strictEqual(p.fiveHourRemaining, 65, "100-35=65");
assert.strictEqual(p.weekRemaining, 90, "100-10=90");
assert.strictEqual(p.displayMode, "capacity", "has rate limits → capacity mode");
assert.strictEqual(p.syncStatus, "ok");
assert.strictEqual(p.syncLabel, "正常");
assert.strictEqual(p.trendStatus, "stable");
assert.strictEqual(p.trendLabel, "稳定");
assert.strictEqual(p.contextRemaining, 72);
assert.strictEqual(p.tokenAccuracy, 0.9, "from providerHealth");
assert.strictEqual(p.delight, true, "from providerHealth");
assert.strictEqual(p.fiveHourResetsAt, "2026-06-02T15:00:00.000Z");

console.log("  ✅ Full provider payload correct");

// ── Test 12: buildHudPayload - token plan mode ───────────────────────

console.log("\n[Test 12] buildHudPayload - token plan displayMode");

const tokenPlanSnapshot = {
  collectedAt: "2026-06-02T10:00:00.000Z",
  providers: [
    {
      id: "openai",
      name: "OpenAI",
      confidence: 0.9,
      todayTokens: 10000,
      recentTokens: 30000,
      status: "live",
      latest: {
        tokenPlan: {
          remainingPercent: 55,
          usedPercent: 45,
          usedCredits: 450,
          totalCredits: 1000,
          remainingCredits: 550,
          source: "api",
          planName: "Pro",
        },
      },
    },
  ],
  providerHealth: { providers: [] },
};

const tpPayload = buildHudPayload(
  tokenPlanSnapshot,
  MOCK_ACTIVE_WINDOW,
  { id: "openai", name: "OpenAI", providerIds: ["openai"] }
);

assert.strictEqual(tpPayload.visible, true);
assert.strictEqual(tpPayload.provider.displayMode, "token-plan", "token plan mode");
assert.strictEqual(tpPayload.provider.tokenPlanRemaining, 55);
assert.strictEqual(tpPayload.provider.tokenPlanUsedCredits, 450);
assert.strictEqual(tpPayload.provider.tokenPlanTotalCredits, 1000);
assert.strictEqual(tpPayload.provider.tokenPlanSource, "api");
assert.strictEqual(tpPayload.provider.tokenPlanPlanName, "Pro");

console.log("  ✅ Token plan payload correct");

// ── Test 13: buildHudPayload - no provider found ─────────────────────

console.log("\n[Test 13] buildHudPayload - provider not found");

const noProviderPayload = buildHudPayload(
  { collectedAt: "2026-06-02T10:00:00.000Z", providers: [] },
  MOCK_ACTIVE_WINDOW,
  { id: "claude", name: "Claude", providerIds: ["claude"] }
);

assert.strictEqual(noProviderPayload.visible, true, "still visible");
assert.strictEqual(noProviderPayload.provider, null, "no matching provider → null");

console.log("  ✅ No-provider payload correct");

// ── Test 14: summarizeHudPayload ─────────────────────────────────────

console.log("\n[Test 14] summarizeHudPayload");

assert.strictEqual(summarizeHudPayload(null), null, "null → null");

const payloadSummary = summarizeHudPayload(payload);
assert.strictEqual(payloadSummary.visible, true);
assert.strictEqual(payloadSummary.toolId, "codex");
assert.strictEqual(payloadSummary.toolName, "Codex");
assert.strictEqual(payloadSummary.provider.id, "codex");
assert.strictEqual(payloadSummary.provider.displayMode, "capacity");
assert.strictEqual(payloadSummary.provider.remainingPercent, 65);

console.log("  ✅ summarizeHudPayload correct");

// ── Test 15: buildHudDebugEntry ──────────────────────────────────────

console.log("\n[Test 15] buildHudDebugEntry");

const debugEntry = buildHudDebugEntry({
  id: "test-123",
  snapshot: MOCK_SNAPSHOT,
  activeWindow: MOCK_ACTIVE_WINDOW,
  anchorWindow: MOCK_ACTIVE_WINDOW,
  tool: MOCK_TOOL,
  payload,
});

assert.strictEqual(debugEntry.event, "hud-refresh");
assert.strictEqual(debugEntry.id, "test-123");
assert.strictEqual(debugEntry.snapshotAt, MOCK_SNAPSHOT.collectedAt);
assert.ok(debugEntry.activeWindow, "activeWindow summarized");
assert.ok(debugEntry.anchorWindow, "anchorWindow summarized");
assert.ok(debugEntry.detectedTool, "tool summarized");
assert.ok(debugEntry.payload, "payload summarized");
assert.strictEqual(debugEntry.detectedTool.id, "codex");

console.log("  ✅ buildHudDebugEntry correct");

// ── Test 16: formatResetForNotification ──────────────────────────────

console.log("\n[Test 16] formatResetForNotification");

assert.strictEqual(formatResetForNotification(null), "", "null → empty");
assert.strictEqual(formatResetForNotification(""), "", "empty → empty");
assert.strictEqual(formatResetForNotification("invalid-date"), "", "invalid → empty");

const formatted = formatResetForNotification("2026-06-02T15:00:00.000Z");
assert.ok(formatted.length > 0, "valid date → non-empty");
assert.ok(formatted.includes("重置"), "contains '重置'");

console.log("  formatted:", formatted);
console.log("  ✅ formatResetForNotification correct");

// ── Test 17: buildHudPayload determinism ──────────────────────────────

console.log("\n[Test 17] buildHudPayload determinism");

const p1 = buildHudPayload(MOCK_SNAPSHOT, MOCK_ACTIVE_WINDOW, MOCK_TOOL);
const p2 = buildHudPayload(MOCK_SNAPSHOT, MOCK_ACTIVE_WINDOW, MOCK_TOOL);
assert.deepStrictEqual(p1, p2, "same input → same output");

console.log("  ✅ Pure function: deterministic output");

// ── Summary ─────────────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════");
console.log("All 17 test groups passed ✅");
console.log("═══════════════════════════════════════════════");
console.log("\nWhat was verified:");
console.log("  1. All 12 function imports");
console.log("  2. numberOrZero (number, 0, string, invalid, null, undefined, NaN)");
console.log("  3. numberOrNull (number, 0, string, invalid, null, undefined)");
console.log("  4. roundedNumberOrNull (rounding, string, invalid, null)");
console.log("  5. findProvider (found, missing, empty)");
console.log("  6. getWindowRemaining (null, 35%, 100%, 0%, overflow)");
console.log("  7. summarizeHudTool (null, full, no hud)");
console.log("  8. summarizeHudWindow (null, full)");
console.log("  9. summarizeProviders (token aggregation)");
console.log(" 10. buildHudPayload - no tool (invisible)");
console.log(" 11. buildHudPayload - full provider (capacity mode)");
console.log(" 12. buildHudPayload - token plan (token-plan mode)");
console.log(" 13. buildHudPayload - no provider found");
console.log(" 14. summarizeHudPayload");
console.log(" 15. buildHudDebugEntry");
console.log(" 16. formatResetForNotification");
console.log(" 17. buildHudPayload determinism (pure function)");
