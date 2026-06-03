"use strict";

const { normalizeBounds } = require("./geometry-service.cjs");

/**
 * Display adapter — sole screen.* boundary for main.cjs.
 * All physical display geometry reads go through this module.
 * External dependencies are injected via createDisplayAdapter().
 */

function createDisplayAdapter({ screen }) {
  // ── Primitives (sole screen.* boundary) ───────────────────────────

  function getPrimaryDisplay() {
    return screen.getPrimaryDisplay();
  }

  function getMatchingDisplay(bounds) {
    return screen.getDisplayMatching(bounds);
  }

  // ── Adapter functions ─────────────────────────────────────────────

  function getDisplayBounds(activeWindow) {
    const bounds = activeWindow?.bounds;
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      return getPrimaryDisplay().bounds;
    }
    return normalizeBounds(getMatchingDisplay(bounds)?.bounds);
  }

  function isDisplayFillingBounds(bounds) {
    const normalized = normalizeBounds(bounds);
    if (!normalized) return false;
    const display = getMatchingDisplay(normalized);
    const area = display?.bounds || getPrimaryDisplay().bounds;
    if (!area?.width || !area?.height) return false;
    const horizontalCoverage = normalized.width / area.width;
    const verticalCoverage = normalized.height / area.height;
    const leftAligned = normalized.x <= area.x + 16;
    const topAligned = normalized.y <= area.y + 16;
    return horizontalCoverage >= 0.9 && verticalCoverage >= 0.9 && leftAligned && topAligned;
  }

  function getDisplayForActiveWindow(activeWindow) {
    const bounds = activeWindow?.bounds;
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      return getPrimaryDisplay();
    }
    return getMatchingDisplay(bounds);
  }

  return {
    getPrimaryDisplay,
    getMatchingDisplay,
    getDisplayBounds,
    isDisplayFillingBounds,
    getDisplayForActiveWindow
  };
}

module.exports = { createDisplayAdapter };
