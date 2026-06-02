"use strict";

/**
 * Runtime smoke tests for overlay-layout.cjs HUD positioning functions.
 *
 * Covers: getHudPosition, getHudBounds, getHudTargetArea, boundsCloseEnough,
 * hudAnchorBoundsCloseEnough, scaleBounds, getToolHudSize, getToolHudOffset,
 * getHudBottomOffset, getDesktopBarHeight, getDesktopBarStagePadding.
 *
 * Run: node scripts/test-overlay-layout-hud.mjs
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
  pathToFileURL(path.resolve(__dirname, "../src/main/overlay-layout.cjs")).href
);

const {
  getHudPosition,
  getHudBounds,
  getHudTargetArea,
  getHudBottomOffset,
  getToolHudSize,
  getToolHudOffset,
  getDesktopBarHeight,
  getDesktopBarStagePadding,
  boundsCloseEnough,
  hudAnchorBoundsCloseEnough,
  scaledHudAnchorBoundsCloseEnough,
  scaleBounds,
  WINDOW_BOUNDS_JITTER_TOLERANCE_PX,
} = mod;

// ── Fixtures ─────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  windows: {
    desktopWidthRatio: 0.5,
    desktopBarHeight: 64,
    toolHudWidth: 396,
    toolHudHeight: 136,
    toolHudOffsetX: 0,
    toolHudOffsetY: 0,
  },
};

const MAIN_DISPLAY = {
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  workAreaSize: { width: 1920, height: 1040 },
};

const SUB_DISPLAY = {
  workArea: { x: 1920, y: 100, width: 2560, height: 1400 },
  workAreaSize: { width: 2560, height: 1440 },
};

const MOCK_TOOL = { hud: { bottomOffset: 20 } };

const MOCK_ACTIVE_WINDOW = {
  bounds: { x: 100, y: 100, width: 800, height: 600 },
};

const SMALL_ACTIVE_WINDOW = {
  bounds: { x: 100, y: 100, width: 10, height: 10 },
};

// ── Test 1: Imports ──────────────────────────────────────────────────

console.log("\n[Test 1] HUD function imports");

assert.strictEqual(typeof getHudPosition, "function");
assert.strictEqual(typeof getHudBounds, "function");
assert.strictEqual(typeof getHudTargetArea, "function");
assert.strictEqual(typeof getHudBottomOffset, "function");
assert.strictEqual(typeof getToolHudSize, "function");
assert.strictEqual(typeof getToolHudOffset, "function");
assert.strictEqual(typeof getDesktopBarHeight, "function");
assert.strictEqual(typeof getDesktopBarStagePadding, "function");
assert.strictEqual(typeof boundsCloseEnough, "function");
assert.strictEqual(typeof hudAnchorBoundsCloseEnough, "function");
assert.strictEqual(typeof scaleBounds, "function");

console.log("  ✅ All HUD functions imported");

// ── Test 2: getToolHudSize ───────────────────────────────────────────

console.log("\n[Test 2] getToolHudSize");

const size = getToolHudSize(DEFAULT_SETTINGS);
assert.strictEqual(size.width, 396, "default hud width 396");
assert.strictEqual(size.height, 136, "default hud height 136");

const customSize = getToolHudSize({
  windows: { toolHudWidth: 500, toolHudHeight: 200 },
});
assert.strictEqual(customSize.width, 500);
assert.strictEqual(customSize.height, 200);

const badSize = getToolHudSize({ windows: { toolHudWidth: "abc" } });
assert.strictEqual(badSize.width, 396, "invalid width → default");
assert.strictEqual(badSize.height, 136, "invalid height → default");

console.log("  ✅ getToolHudSize correct (defaults, custom, invalid)");

// ── Test 3: getToolHudOffset ─────────────────────────────────────────

console.log("\n[Test 3] getToolHudOffset");

const offset = getToolHudOffset(DEFAULT_SETTINGS);
assert.strictEqual(offset.x, 0, "default offsetX 0");
assert.strictEqual(offset.y, 0, "default offsetY 0");

const customOffset = getToolHudOffset({
  windows: { toolHudOffsetX: 50, toolHudOffsetY: -10 },
});
assert.strictEqual(customOffset.x, 50);
assert.strictEqual(customOffset.y, -10);

console.log("  ✅ getToolHudOffset correct");

// ── Test 4: getHudBottomOffset ───────────────────────────────────────

console.log("\n[Test 4] getHudBottomOffset");

assert.strictEqual(getHudBottomOffset(MOCK_TOOL), 20, "custom bottomOffset 20");
assert.strictEqual(getHudBottomOffset({}), 12, "default bottomOffset 12");
assert.strictEqual(getHudBottomOffset({ hud: { bottomOffset: -5 } }), 12, "negative → 12");
assert.strictEqual(getHudBottomOffset({ hud: { bottomOffset: "abc" } }), 12, "invalid → 12");

console.log("  ✅ getHudBottomOffset correct");

// ── Test 5: getDesktopBarHeight ──────────────────────────────────────

console.log("\n[Test 5] getDesktopBarHeight");

assert.strictEqual(getDesktopBarHeight(DEFAULT_SETTINGS), 64, "default height 64");
assert.strictEqual(
  getDesktopBarHeight({ windows: { desktopBarHeight: 80 } }),
  80,
  "custom height"
);
assert.strictEqual(getDesktopBarHeight({}), 64, "missing → default 64");
assert.strictEqual(
  getDesktopBarHeight({ windows: { desktopBarHeight: "abc" } }),
  64,
  "invalid → default 64"
);

console.log("  ✅ getDesktopBarHeight correct");

// ── Test 6: getDesktopBarStagePadding ────────────────────────────────

console.log("\n[Test 6] getDesktopBarStagePadding");

const padding = getDesktopBarStagePadding(DEFAULT_SETTINGS);
assert.ok(padding, "padding must exist");
assert.ok(typeof padding.x === "number", "padding.x is number");
assert.ok(typeof padding.top === "number", "padding.top is number");
assert.ok(typeof padding.bottom === "number", "padding.bottom is number");
assert.ok(padding.x >= 42, "padding.x >= DESKTOP_BAR_STAGE_MIN_SIDE_PAD");
assert.ok(padding.top >= 0, "padding.top >= 0");

console.log("  padding:", JSON.stringify(padding));
console.log("  ✅ getDesktopBarStagePadding correct");

// ── Test 7: getHudTargetArea ─────────────────────────────────────────

console.log("\n[Test 7] getHudTargetArea");

// Normal sized window → returns activeWindow bounds
const targetArea = getHudTargetArea(
  MAIN_DISPLAY,
  MOCK_ACTIVE_WINDOW,
  DEFAULT_SETTINGS
);
assert.deepStrictEqual(
  targetArea,
  MOCK_ACTIVE_WINDOW.bounds,
  "normal window → use window bounds as target"
);

// Small window (smaller than HUD) → fallback to display.workArea
const smallTarget = getHudTargetArea(
  MAIN_DISPLAY,
  SMALL_ACTIVE_WINDOW,
  DEFAULT_SETTINGS
);
assert.deepStrictEqual(
  smallTarget,
  MAIN_DISPLAY.workArea,
  "tiny window → fallback to display workArea"
);

// Null active window → fallback to workArea
const nullTarget = getHudTargetArea(MAIN_DISPLAY, null, DEFAULT_SETTINGS);
assert.deepStrictEqual(
  nullTarget,
  MAIN_DISPLAY.workArea,
  "null window → fallback to display workArea"
);

console.log("  ✅ getHudTargetArea correct (normal, small, null)");

// ── Test 8: getHudPosition ───────────────────────────────────────────

console.log("\n[Test 8] getHudPosition");

const pos = getHudPosition(
  MAIN_DISPLAY,
  MOCK_TOOL,
  MOCK_ACTIVE_WINDOW,
  DEFAULT_SETTINGS
);
assert.ok(pos, "position must exist");
assert.ok(typeof pos.x === "number");
assert.ok(typeof pos.y === "number");

// Position must be within display workArea bounds
assert.ok(pos.x >= MAIN_DISPLAY.workArea.x, "x >= workArea.x");
assert.ok(pos.y >= MAIN_DISPLAY.workArea.y, "y >= workArea.y");
assert.ok(
  pos.x + 396 <= MAIN_DISPLAY.workArea.x + MAIN_DISPLAY.workArea.width,
  "hud fits in workArea width"
);
assert.ok(
  pos.y + 136 <= MAIN_DISPLAY.workArea.y + MAIN_DISPLAY.workArea.height,
  "hud fits in workArea height"
);

console.log("  position:", JSON.stringify(pos));
console.log("  ✅ getHudPosition correct (clamped to workArea)");

// ── Test 9: getHudPosition on sub display ────────────────────────────

console.log("\n[Test 9] getHudPosition - sub display (workArea.x=1920)");

const subPos = getHudPosition(
  SUB_DISPLAY,
  MOCK_TOOL,
  { bounds: { x: 2000, y: 200, width: 800, height: 600 } },
  DEFAULT_SETTINGS
);
assert.ok(subPos.x >= SUB_DISPLAY.workArea.x, "x >= sub workArea.x (1920)");
assert.ok(subPos.y >= SUB_DISPLAY.workArea.y, "y >= sub workArea.y (100)");

console.log("  sub position:", JSON.stringify(subPos));
console.log("  ✅ Sub display HUD position correct");

// ── Test 10: getHudBounds ────────────────────────────────────────────

console.log("\n[Test 10] getHudBounds");

const hBounds = getHudBounds(
  MAIN_DISPLAY,
  MOCK_TOOL,
  MOCK_ACTIVE_WINDOW,
  DEFAULT_SETTINGS
);
assert.ok(hBounds, "bounds must exist");
assert.strictEqual(hBounds.width, 396, "width matches HUD size");
assert.strictEqual(hBounds.height, 136, "height matches HUD size");
assert.strictEqual(hBounds.x, pos.x, "x matches position");
assert.strictEqual(hBounds.y, pos.y, "y matches position");

console.log("  hudBounds:", JSON.stringify(hBounds));
console.log("  ✅ getHudBounds correct");

// ── Test 11: boundsCloseEnough ───────────────────────────────────────

console.log("\n[Test 11] boundsCloseEnough");

const boundsA = { x: 100, y: 200, width: 300, height: 400 };
const boundsB = { x: 101, y: 199, width: 302, height: 398 };
const boundsC = { x: 200, y: 300, width: 300, height: 400 };

assert.ok(boundsCloseEnough(boundsA, boundsA), "identical → true");
assert.ok(
  boundsCloseEnough(boundsA, boundsB),
  "within tolerance (2px) → true"
);
assert.ok(!boundsCloseEnough(boundsA, boundsC), "far apart → false");
assert.ok(!boundsCloseEnough(null, boundsA), "null first → false");
assert.ok(!boundsCloseEnough(boundsA, null), "null second → false");

console.log("  tolerance:", WINDOW_BOUNDS_JITTER_TOLERANCE_PX, "px");
console.log("  ✅ boundsCloseEnough correct");

// ── Test 12: scaleBounds ─────────────────────────────────────────────

console.log("\n[Test 12] scaleBounds");

const original = { x: 100, y: 200, width: 400, height: 600 };

assert.deepStrictEqual(scaleBounds(original, 1), original, "scale 1 → same");

const half = scaleBounds(original, 0.5);
assert.strictEqual(half.x, 50);
assert.strictEqual(half.y, 100);
assert.strictEqual(half.width, 200);
assert.strictEqual(half.height, 300);

const double = scaleBounds(original, 2);
assert.strictEqual(double.x, 200);
assert.strictEqual(double.y, 400);
assert.strictEqual(double.width, 800);
assert.strictEqual(double.height, 1200);

console.log("  ✅ scaleBounds correct (0.5x, 1x, 2x)");

// ── Test 13: hudAnchorBoundsCloseEnough ──────────────────────────────

console.log("\n[Test 13] hudAnchorBoundsCloseEnough");

assert.ok(
  hudAnchorBoundsCloseEnough(boundsA, boundsA),
  "identical → true"
);
assert.ok(
  hudAnchorBoundsCloseEnough(boundsA, boundsB),
  "close → true"
);
assert.ok(
  !hudAnchorBoundsCloseEnough(boundsA, boundsC),
  "far apart → false"
);

console.log("  ✅ hudAnchorBoundsCloseEnough correct");

// ── Test 13b: scaledHudAnchorBoundsCloseEnough (DI fix) ──────────────

console.log("\n[Test 13b] scaledHudAnchorBoundsCloseEnough");

// Without DI function → safe fallback to false (no ReferenceError)
assert.ok(
  !scaledHudAnchorBoundsCloseEnough(boundsA, boundsB, null),
  "without DI fn → false (safe fallback)"
);

// With mock DI that rejects all → false
assert.ok(
  !scaledHudAnchorBoundsCloseEnough(boundsA, boundsB, () => false),
  "DI rejects all → false"
);

// With mock DI that accepts all, scaled bounds within tolerance → true
const displayFilling = { x: 0, y: 0, width: 1920, height: 1080 };
const halfDisplay = { x: 0, y: 0, width: 960, height: 540 };
const alwaysTrue = () => true;
assert.ok(
  scaledHudAnchorBoundsCloseEnough(displayFilling, halfDisplay, alwaysTrue),
  "display-filling vs half, DI accepts → true (scale 2x right match)"
);

// Selective DI: only accepts display-filling bounds → still matches
const onlyDisplayFilling = (b) => b.width >= 1920 && b.height >= 1080;
assert.ok(
  scaledHudAnchorBoundsCloseEnough(displayFilling, halfDisplay, onlyDisplayFilling),
  "display-filling vs half, selective DI → true (scaledRight={0,0,1920,1080})"
);

console.log("  ✅ scaledHudAnchorBoundsCloseEnough DI injection correct");

// ── Test 14: HUD position determinism ────────────────────────────────

console.log("\n[Test 14] HUD position determinism");

const pos1 = getHudPosition(
  MAIN_DISPLAY,
  MOCK_TOOL,
  MOCK_ACTIVE_WINDOW,
  DEFAULT_SETTINGS
);
const pos2 = getHudPosition(
  MAIN_DISPLAY,
  MOCK_TOOL,
  MOCK_ACTIVE_WINDOW,
  DEFAULT_SETTINGS
);
assert.deepStrictEqual(pos1, pos2, "same input → same output");

console.log("  ✅ Pure function: deterministic output");

// ── Summary ─────────────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════");
console.log("All 14 test groups passed ✅");
console.log("═══════════════════════════════════════════════");
console.log("\nWhat was verified:");
console.log("  1. HUD function imports");
console.log("  2. getToolHudSize (defaults, custom, invalid)");
console.log("  3. getToolHudOffset (defaults, custom)");
console.log("  4. getHudBottomOffset (custom, default, negative, invalid)");
console.log("  5. getDesktopBarHeight (defaults, custom, invalid)");
console.log("  6. getDesktopBarStagePadding (shape + range)");
console.log("  7. getHudTargetArea (normal, small, null window)");
console.log("  8. getHudPosition (main screen, clamped to workArea)");
console.log("  9. getHudPosition (sub display, workArea.x=1920)");
console.log(" 10. getHudBounds (size + position match)");
console.log(" 11. boundsCloseEnough (identical, near, far, null)");
console.log(" 12. scaleBounds (0.5x, 1x, 2x)");
console.log(" 13. hudAnchorBoundsCloseEnough");
console.log(" 14. HUD position determinism (pure function)");
