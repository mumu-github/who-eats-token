import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Import geometry functions ────────────────────────────────────────

function pathToFileURL(p) {
  return new URL("file:///" + p.replace(/\\/g, "/"));
}

const mod = await import(
  pathToFileURL(path.resolve(__dirname, "../src/main/overlay-layout.cjs")).href
);

const {
  getDesktopBarStageLayout,
  getDesktopBarWindowBounds,
  getDesktopBarVisualBounds,
  getDesktopBarRendererLayout,
  getDesktopBarHeight,
} = mod;

// ── Fixtures ─────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  windows: {
    desktopWidthRatio: 0.5,
    desktopBarHeight: 64,
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

const NEGATIVE_DISPLAY = {
  workArea: { x: -1280, y: 0, width: 1280, height: 720 },
  workAreaSize: { width: 1280, height: 768 },
};

// ── Test 1: Imports ──────────────────────────────────────────────────

console.log("\n[Test 1] Imports");

assert.strictEqual(typeof getDesktopBarStageLayout, "function");
assert.strictEqual(typeof getDesktopBarWindowBounds, "function");
assert.strictEqual(typeof getDesktopBarVisualBounds, "function");
assert.strictEqual(typeof getDesktopBarRendererLayout, "function");

console.log("  ✅ All geometry functions imported");

// ── Test 2: Main screen layout ───────────────────────────────────────

console.log("\n[Test 2] getDesktopBarStageLayout - main screen (workArea.x=0)");

const main = getDesktopBarStageLayout(DEFAULT_SETTINGS, MAIN_DISPLAY);

assert.ok(main.windowBounds);
assert.ok(main.barBounds);

const wb = main.windowBounds;
const bb = main.barBounds;

// Window centered in workArea
assert.strictEqual(wb.y, 4, "window y = workArea.y + 4");
assert.ok(wb.width >= 320);
assert.ok(wb.width <= 1920);

// Bar inside window
assert.ok(bb.x >= wb.x);
assert.ok(bb.y >= wb.y);
assert.ok(bb.x + bb.width <= wb.x + wb.width);
assert.ok(bb.y + bb.height <= wb.y + wb.height);

console.log("  windowBounds:", JSON.stringify(wb));
console.log("  barBounds:", JSON.stringify(bb));
console.log("  ✅ Main screen layout correct");

// ── Test 3: Sub screen (workArea.x=1920, workArea.y=100) ─────────────

console.log("\n[Test 3] getDesktopBarStageLayout - sub screen (workArea.x=1920)");

const sub = getDesktopBarStageLayout(DEFAULT_SETTINGS, SUB_DISPLAY);
const subWb = sub.windowBounds;
const subBb = sub.barBounds;

// Must use workArea offset, NOT origin
assert.ok(subWb.x >= 1920, "window x must be offset by workArea.x (1920)");
assert.strictEqual(subWb.y, 100 + 4, "window y = workArea.y + 4");
assert.ok(subBb.x >= subWb.x, "bar inside window on sub display");

console.log("  windowBounds:", JSON.stringify(subWb));
console.log("  barBounds:", JSON.stringify(subBb));
console.log("  ✅ Sub screen layout correct (workArea offsets applied)");

// ── Test 4: Negative workArea ────────────────────────────────────────

console.log("\n[Test 4] getDesktopBarStageLayout - negative workArea (-1280)");

const neg = getDesktopBarStageLayout(DEFAULT_SETTINGS, NEGATIVE_DISPLAY);

assert.ok(neg.windowBounds.x < 0, "window x must be negative on left-side display");
assert.ok(neg.barBounds.x >= neg.windowBounds.x, "bar inside window with negative coords");

console.log("  windowBounds:", JSON.stringify(neg.windowBounds));
console.log("  ✅ Negative workArea offsets correct");

// ── Test 5: getDesktopBarWindowBounds wrapper ────────────────────────

console.log("\n[Test 5] getDesktopBarWindowBounds wrapper");

const wbr = getDesktopBarWindowBounds(DEFAULT_SETTINGS, MAIN_DISPLAY);
assert.deepStrictEqual(wbr, main.windowBounds, "returns stageLayout.windowBounds");

console.log("  ✅ Wrapper correct");

// ── Test 6: getDesktopBarVisualBounds wrapper ────────────────────────

console.log("\n[Test 6] getDesktopBarVisualBounds wrapper");

const vbr = getDesktopBarVisualBounds(DEFAULT_SETTINGS, MAIN_DISPLAY);
assert.deepStrictEqual(vbr, main.barBounds, "returns stageLayout.barBounds");

console.log("  ✅ Wrapper correct");

// ── Test 7: getDesktopBarRendererLayout wrapper ──────────────────────

console.log("\n[Test 7] getDesktopBarRendererLayout wrapper");

const rlr = getDesktopBarRendererLayout(DEFAULT_SETTINGS, MAIN_DISPLAY);

assert.ok(rlr);
assert.strictEqual(typeof rlr.barX, "number");
assert.strictEqual(typeof rlr.barY, "number");
assert.strictEqual(rlr.barWidth, main.barBounds.width);
assert.strictEqual(rlr.barHeight, main.barBounds.height);
assert.strictEqual(rlr.stageWidth, main.windowBounds.width);
assert.strictEqual(rlr.stageHeight, main.windowBounds.height);

console.log("  rendererLayout:", JSON.stringify(rlr));
console.log("  ✅ Wrapper correct");

// ── Test 8: Determinism ──────────────────────────────────────────────

console.log("\n[Test 8] Determinism (pure function)");

const a = getDesktopBarStageLayout(DEFAULT_SETTINGS, MAIN_DISPLAY);
const b = getDesktopBarStageLayout(DEFAULT_SETTINGS, MAIN_DISPLAY);
const c = getDesktopBarStageLayout(DEFAULT_SETTINGS, MAIN_DISPLAY);

assert.deepStrictEqual(a, b);
assert.deepStrictEqual(b, c);

console.log("  ✅ Deterministic output");

// ── Test 9: Width ratio edge cases ───────────────────────────────────

console.log("\n[Test 9] Width ratio edge cases");

const wide = getDesktopBarStageLayout(
  { windows: { ...DEFAULT_SETTINGS.windows, desktopWidthRatio: 0.8 } },
  MAIN_DISPLAY
);
const narrow = getDesktopBarStageLayout(
  { windows: { ...DEFAULT_SETTINGS.windows, desktopWidthRatio: 0.3 } },
  MAIN_DISPLAY
);

assert.ok(wide.barBounds.width > narrow.barBounds.width, "wider ratio → wider bar");
assert.ok(narrow.barBounds.width >= 320, "bar width >= 320px minimum");

console.log(`  Wide (80%): barWidth=${wide.barBounds.width}`);
console.log(`  Narrow (30%): barWidth=${narrow.barBounds.width}`);
console.log("  ✅ Width ratio correct, 320px minimum enforced");

// ── Test 10: getDesktopBarHeight edge cases ──────────────────────────

console.log("\n[Test 10] getDesktopBarHeight edge cases");

assert.strictEqual(getDesktopBarHeight(DEFAULT_SETTINGS), 64, "valid → 64");
assert.strictEqual(getDesktopBarHeight({ windows: { desktopBarHeight: "bad" } }), 64, "invalid → default");
assert.strictEqual(getDesktopBarHeight({}), 64, "missing → default");

console.log("  ✅ getDesktopBarHeight defaults correct");

// ── Test 11: Sub screen determinism ──────────────────────────────────

console.log("\n[Test 11] Sub screen determinism");

const sub1 = getDesktopBarStageLayout(DEFAULT_SETTINGS, SUB_DISPLAY);
const sub2 = getDesktopBarStageLayout(DEFAULT_SETTINGS, SUB_DISPLAY);
assert.deepStrictEqual(sub1, sub2, "sub screen is also deterministic");

console.log("  ✅ Sub screen deterministic");

// ── Summary ──────────────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════");
console.log("All 11 test groups passed ✅");
console.log("═══════════════════════════════════════════════");
console.log("\nWhat was verified:");
console.log("  1. All geometry functions imported from overlay-layout.cjs");
console.log("  2. Main screen layout (workArea.x=0)");
console.log("  3. Sub screen layout (workArea.x=1920, workArea.y=100)");
console.log("  4. Negative workArea offsets (-1280)");
console.log("  5. getDesktopBarWindowBounds wrapper");
console.log("  6. getDesktopBarVisualBounds wrapper");
console.log("  7. getDesktopBarRendererLayout wrapper");
console.log("  8. Determinism (pure function guarantee)");
console.log("  9. Width ratio edge cases (0.8/0.3, 320px minimum)");
console.log("  10. getDesktopBarHeight defaults");
console.log("  11. Sub screen determinism");
