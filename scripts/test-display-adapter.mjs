/**
 * Runtime smoke tests for display-adapter.cjs.
 *
 * Uses DI mock for Electron `screen` to verify adapter functions
 * without requiring Electron runtime.
 */

import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const { createDisplayAdapter } = await import("file://" + path.resolve(root, "src", "main", "display-adapter.cjs"));

// ── Mock screen ─────────────────────────────────────────────────────

const PRIMARY_DISPLAY = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1016 },
  scaleFactor: 1.0,
  label: "Primary",
};

const SECONDARY_DISPLAY = {
  id: 2,
  bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
  workArea: { x: 1920, y: 0, width: 2560, height: 1376 },
  scaleFactor: 1.5,
  label: "Secondary",
};

function mockGetDisplayMatching(bounds) {
  if (!bounds) return PRIMARY_DISPLAY;
  if (bounds.x >= 1920) return SECONDARY_DISPLAY;
  return PRIMARY_DISPLAY;
}

const mockScreen = {
  getPrimaryDisplay: () => PRIMARY_DISPLAY,
  getDisplayMatching: mockGetDisplayMatching,
};

const {
  getPrimaryDisplay,
  getMatchingDisplay,
  getDisplayBounds,
  isDisplayFillingBounds,
  getDisplayForActiveWindow
} = createDisplayAdapter({ screen: mockScreen });

// ── Test 1: Factory instantiation ───────────────────────────────────

console.log("\n[Test 1] Factory instantiation");

assert(typeof getPrimaryDisplay === "function", "getPrimaryDisplay must be a function");
assert(typeof getMatchingDisplay === "function", "getMatchingDisplay must be a function");
assert(typeof getDisplayBounds === "function", "getDisplayBounds must be a function");
assert(typeof isDisplayFillingBounds === "function", "isDisplayFillingBounds must be a function");
assert(typeof getDisplayForActiveWindow === "function", "getDisplayForActiveWindow must be a function");

console.log("  ✅ All exports are functions");

// ── Test 2: getPrimaryDisplay ───────────────────────────────────────

console.log("\n[Test 2] getPrimaryDisplay");

const primary = getPrimaryDisplay();
assert.deepStrictEqual(primary, PRIMARY_DISPLAY, "returns primary display object");
assert.strictEqual(primary.id, 1, "id matches");
assert.strictEqual(primary.bounds.width, 1920, "width matches");

console.log("  ✅ getPrimaryDisplay correct");

// ── Test 3: getMatchingDisplay ──────────────────────────────────────

console.log("\n[Test 3] getMatchingDisplay");

const matchPrimary = getMatchingDisplay({ x: 0, y: 0, width: 800, height: 600 });
assert.deepStrictEqual(matchPrimary, PRIMARY_DISPLAY, "primary region → primary display");

const matchSecondary = getMatchingDisplay({ x: 2000, y: 100, width: 800, height: 600 });
assert.deepStrictEqual(matchSecondary, SECONDARY_DISPLAY, "secondary region → secondary display");

const matchNull = getMatchingDisplay(null);
assert.deepStrictEqual(matchNull, PRIMARY_DISPLAY, "null → primary display (fallback)");

console.log("  ✅ getMatchingDisplay correct");

// ── Test 4: getDisplayBounds ────────────────────────────────────────

console.log("\n[Test 4] getDisplayBounds");

const nullBounds = getDisplayBounds(null);
assert.deepStrictEqual(nullBounds, PRIMARY_DISPLAY.bounds, "null → primary bounds");

const noBounds = getDisplayBounds({});
assert.deepStrictEqual(noBounds, PRIMARY_DISPLAY.bounds, "no bounds → primary bounds");

const zeroSize = getDisplayBounds({ bounds: { x: 0, y: 0, width: 0, height: 0 } });
assert.deepStrictEqual(zeroSize, PRIMARY_DISPLAY.bounds, "zero size → primary bounds");

const validBounds = getDisplayBounds({ bounds: { x: 100, y: 100, width: 800, height: 600 } });
assert.strictEqual(typeof validBounds, "object", "returns bounds object");
assert.strictEqual(typeof validBounds.width, "number", "has width");
assert.strictEqual(typeof validBounds.height, "number", "has height");

console.log("  ✅ getDisplayBounds correct");

// ── Test 5: isDisplayFillingBounds ──────────────────────────────────

console.log("\n[Test 5] isDisplayFillingBounds");

assert.strictEqual(isDisplayFillingBounds(null), false, "null → false");
assert.strictEqual(isDisplayFillingBounds({}), false, "empty → false");
assert.strictEqual(
  isDisplayFillingBounds({ x: 0, y: 0, width: 100, height: 100 }),
  false,
  "small window → false"
);
assert.strictEqual(
  isDisplayFillingBounds({ x: 0, y: 0, width: 1920, height: 1080 }),
  true,
  "exact primary bounds → true"
);
assert.strictEqual(
  isDisplayFillingBounds({ x: 0, y: 0, width: 1900, height: 1060 }),
  true,
  "near-full coverage (>0.9) → true"
);
assert.strictEqual(
  isDisplayFillingBounds({ x: 200, y: 200, width: 500, height: 500 }),
  false,
  "offset small window → false"
);

console.log("  ✅ isDisplayFillingBounds correct");

// ── Test 6: getDisplayForActiveWindow ───────────────────────────────

console.log("\n[Test 6] getDisplayForActiveWindow");

const nullDisplay = getDisplayForActiveWindow(null);
assert.deepStrictEqual(nullDisplay, PRIMARY_DISPLAY, "null → primary display");

const noBoundsDisplay = getDisplayForActiveWindow({});
assert.deepStrictEqual(noBoundsDisplay, PRIMARY_DISPLAY, "no bounds → primary display");

const zeroSizeDisplay = getDisplayForActiveWindow({ bounds: { x: 0, y: 0, width: 0, height: 0 } });
assert.deepStrictEqual(zeroSizeDisplay, PRIMARY_DISPLAY, "zero size → primary display");

const validDisplay = getDisplayForActiveWindow({ bounds: { x: 100, y: 100, width: 800, height: 600 } });
assert.deepStrictEqual(validDisplay, PRIMARY_DISPLAY, "primary region → primary display");

const secondaryDisplay = getDisplayForActiveWindow({ bounds: { x: 2000, y: 100, width: 800, height: 600 } });
assert.deepStrictEqual(secondaryDisplay, SECONDARY_DISPLAY, "secondary region → secondary display");

console.log("  ✅ getDisplayForActiveWindow correct");

// ── Test 7: DI isolation ────────────────────────────────────────────

console.log("\n[Test 7] DI isolation");

const altPrimary = {
  id: 99,
  bounds: { x: 0, y: 0, width: 3840, height: 2160 },
  workArea: { x: 0, y: 0, width: 3840, height: 2100 },
  scaleFactor: 2.0,
  label: "4K Display",
};

const altAdapter = createDisplayAdapter({
  screen: {
    getPrimaryDisplay: () => altPrimary,
    getDisplayMatching: () => altPrimary,
  },
});

assert.deepStrictEqual(altAdapter.getPrimaryDisplay(), altPrimary, "DI override works");
assert.deepStrictEqual(
  altAdapter.getDisplayForActiveWindow(null),
  altPrimary,
  "null → DI primary"
);
assert.strictEqual(
  altAdapter.isDisplayFillingBounds({ x: 0, y: 0, width: 3840, height: 2160 }),
  true,
  "4K exact → true"
);

console.log("  ✅ DI isolation correct");

// ── Summary ─────────────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════");
console.log("All 7 test groups passed ✅");
console.log("═══════════════════════════════════════════════");
console.log("\nWhat was verified:");
console.log("  1. Factory instantiation (all 5 exports)");
console.log("  2. getPrimaryDisplay → primary display object");
console.log("  3. getMatchingDisplay → correct display by bounds");
console.log("  4. getDisplayBounds → normalized bounds (null/zero/valid)");
console.log("  5. isDisplayFillingBounds → coverage check (null/small/full/offset)");
console.log("  6. getDisplayForActiveWindow → display object (null/zero/valid/secondary)");
console.log("  7. DI isolation → alternate screen mock works independently");
