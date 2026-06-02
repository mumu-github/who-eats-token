"use strict";

const { clampNumber, normalizeBounds } = require("./geometry-service.cjs");

/**
 * Pure overlay layout calculations — no Electron imports, no mutable state.
 * All inputs are passed as parameters.
 */

const DEFAULT_BAR_HEIGHT = 64;
const DEFAULT_HUD_WIDTH = 396;
const DEFAULT_HUD_HEIGHT = 136;
const TOOL_HUD_HITBOX_WIDTH = 164;
const TOOL_HUD_HITBOX_HEIGHT = 30;
const DESKTOP_BAR_STAGE_MIN_SIDE_PAD = 42;
const DESKTOP_BAR_STAGE_MAX_SIDE_PAD = 88;
const DESKTOP_BAR_STAGE_MIN_TOP_PAD = 0;
const DESKTOP_BAR_STAGE_MAX_TOP_PAD = 4;
const DESKTOP_BAR_STAGE_MIN_BOTTOM_PAD = 82;
const DESKTOP_BAR_STAGE_MAX_BOTTOM_PAD = 130;
const WINDOW_BOUNDS_JITTER_TOLERANCE_PX = 2;

// ── Desktop bar sizing ──────────────────────────────────────────────

function getDesktopBarHeight(sourceSettings) {
  const height = Number(sourceSettings?.windows?.desktopBarHeight);
  return Number.isFinite(height) ? Math.round(height) : DEFAULT_BAR_HEIGHT;
}

function getDesktopBarStagePadding(sourceSettings) {
  const barHeight = getDesktopBarHeight(sourceSettings);
  return {
    x: clampNumber(Math.round(barHeight * 1.12), DESKTOP_BAR_STAGE_MIN_SIDE_PAD, DESKTOP_BAR_STAGE_MAX_SIDE_PAD),
    top: clampNumber(Math.round(barHeight * 0.06), DESKTOP_BAR_STAGE_MIN_TOP_PAD, DESKTOP_BAR_STAGE_MAX_TOP_PAD),
    bottom: clampNumber(Math.round(barHeight * 1.46), DESKTOP_BAR_STAGE_MIN_BOTTOM_PAD, DESKTOP_BAR_STAGE_MAX_BOTTOM_PAD)
  };
}

// ── Tool HUD sizing ─────────────────────────────────────────────────

function getToolHudSize(sourceSettings) {
  const width = Number(sourceSettings?.windows?.toolHudWidth);
  const height = Number(sourceSettings?.windows?.toolHudHeight);
  return {
    width: Number.isFinite(width) ? Math.round(width) : DEFAULT_HUD_WIDTH,
    height: Number.isFinite(height) ? Math.round(height) : DEFAULT_HUD_HEIGHT
  };
}

function getToolHudOffset(sourceSettings) {
  const offsetX = Number(sourceSettings?.windows?.toolHudOffsetX);
  const offsetY = Number(sourceSettings?.windows?.toolHudOffsetY);
  return {
    x: Number.isFinite(offsetX) ? Math.round(offsetX) : 0,
    y: Number.isFinite(offsetY) ? Math.round(offsetY) : 0
  };
}

// ── HUD positioning ─────────────────────────────────────────────────

function getHudPosition(display, tool, activeWindow, sourceSettings) {
  const workArea = display.workArea;
  const rightGap = 12;
  const bottomOffset = getHudBottomOffset(tool);
  const targetArea = getHudTargetArea(display, activeWindow, sourceSettings);
  const size = getToolHudSize(sourceSettings);
  const offset = getToolHudOffset(sourceSettings);
  const minX = workArea.x + 12;
  const maxX = workArea.x + workArea.width - size.width - rightGap;
  const minY = workArea.y + 12;
  const maxY = workArea.y + workArea.height - size.height - rightGap;
  const x = targetArea.x + targetArea.width - size.width - rightGap - offset.x;
  const y = targetArea.y + targetArea.height - size.height - bottomOffset - offset.y;
  return {
    x: clampNumber(x, minX, maxX),
    y: clampNumber(y, minY, maxY)
  };
}

function getHudBounds(display, tool, activeWindow, sourceSettings) {
  const size = getToolHudSize(sourceSettings);
  return {
    ...getHudPosition(display, tool, activeWindow, sourceSettings),
    width: size.width,
    height: size.height
  };
}

function getHudTargetArea(display, activeWindow, sourceSettings) {
  const bounds = activeWindow?.bounds;
  const size = getToolHudSize(sourceSettings);
  if (!bounds || bounds.width <= size.width || bounds.height <= size.height) {
    return display.workArea;
  }
  return bounds;
}

function getHudBottomOffset(tool) {
  const offset = Number(tool?.hud?.bottomOffset);
  if (!Number.isFinite(offset) || offset < 12) return 12;
  return offset;
}

// ── Bounds comparison ───────────────────────────────────────────────

function boundsCloseEnough(first, second, tolerancePx = WINDOW_BOUNDS_JITTER_TOLERANCE_PX) {
  const left = normalizeBounds(first);
  const right = normalizeBounds(second);
  if (!left || !right) return false;
  return (
    Math.abs(left.x - right.x) <= tolerancePx &&
    Math.abs(left.y - right.y) <= tolerancePx &&
    Math.abs(left.width - right.width) <= tolerancePx &&
    Math.abs(left.height - right.height) <= tolerancePx
  );
}

function hudAnchorBoundsCloseEnough(first, second) {
  if (boundsCloseEnough(first, second)) return true;
  return scaledHudAnchorBoundsCloseEnough(first, second);
}

function scaledHudAnchorBoundsCloseEnough(first, second) {
  const left = normalizeBounds(first);
  const right = normalizeBounds(second);
  if (!left || !right) return false;

  for (const scale of [0.5, 2]) {
    const scaledLeft = scaleBounds(left, scale);
    if (boundsCloseEnough(scaledLeft, right, WINDOW_BOUNDS_JITTER_TOLERANCE_PX * 2) &&
        isDisplayFillingBounds(scaledLeft) &&
        isDisplayFillingBounds(right)) {
      return true;
    }

    const scaledRight = scaleBounds(right, scale);
    if (boundsCloseEnough(left, scaledRight, WINDOW_BOUNDS_JITTER_TOLERANCE_PX * 2) &&
        isDisplayFillingBounds(left) &&
        isDisplayFillingBounds(scaledRight)) {
      return true;
    }
  }

  return false;
}

function scaleBounds(bounds, scale) {
  return {
    x: Math.round(bounds.x * scale),
    y: Math.round(bounds.y * scale),
    width: Math.round(bounds.width * scale),
    height: Math.round(bounds.height * scale)
  };
}

// ── Desktop bar geometry ────────────────────────────────────────────
/**
 * Calculate desktop bar stage layout from a primary display.
 * @param {object} sourceSettings
 * @param {object} primaryDisplay - Result of screen.getPrimaryDisplay()
 *   Must provide { workArea: {x,y,width,height}, workAreaSize: {width,height} }.
 *   Passed explicitly so overlay-layout never imports Electron.
 */
function getDesktopBarStageLayout(sourceSettings, primaryDisplay) {
  const ratio = sourceSettings.windows.desktopWidthRatio;
  const barHeight = getDesktopBarHeight(sourceSettings);
  const padding = getDesktopBarStagePadding(sourceSettings);
  const desiredBarWidth = Math.round(primaryDisplay.workAreaSize.width * ratio);
  const stageWidth = Math.min(primaryDisplay.workAreaSize.width, desiredBarWidth + padding.x * 2);
  const availableBarWidth = Math.max(320, stageWidth - padding.x * 2);
  const barWidth = Math.min(desiredBarWidth, availableBarWidth);
  const stageHeight = Math.min(primaryDisplay.workAreaSize.height, padding.top + barHeight + padding.bottom);
  const localBarX = Math.round((stageWidth - barWidth) / 2);
  const localBarY = Math.min(padding.top, Math.max(0, stageHeight - barHeight - padding.bottom));
  const stageX = primaryDisplay.workArea.x + Math.round((primaryDisplay.workAreaSize.width - stageWidth) / 2);
  const stageY = primaryDisplay.workArea.y + 4;
  return {
    windowBounds: {
      x: stageX,
      y: stageY,
      width: stageWidth,
      height: stageHeight
    },
    barBounds: {
      x: stageX + localBarX,
      y: stageY + localBarY,
      width: barWidth,
      height: barHeight
    }
  };
}

function getDesktopBarWindowBounds(sourceSettings, primaryDisplay) {
  return getDesktopBarStageLayout(sourceSettings, primaryDisplay).windowBounds;
}

function getDesktopBarVisualBounds(sourceSettings, primaryDisplay) {
  return getDesktopBarStageLayout(sourceSettings, primaryDisplay).barBounds;
}

function getDesktopBarRendererLayout(sourceSettings, primaryDisplay) {
  const layout = getDesktopBarStageLayout(sourceSettings, primaryDisplay);
  return {
    barX: layout.barBounds.x - layout.windowBounds.x,
    barY: layout.barBounds.y - layout.windowBounds.y,
    barWidth: layout.barBounds.width,
    barHeight: layout.barBounds.height,
    stageWidth: layout.windowBounds.width,
    stageHeight: layout.windowBounds.height
  };
}

module.exports = {
  DEFAULT_BAR_HEIGHT,
  DEFAULT_HUD_WIDTH,
  DEFAULT_HUD_HEIGHT,
  TOOL_HUD_HITBOX_WIDTH,
  TOOL_HUD_HITBOX_HEIGHT,
  WINDOW_BOUNDS_JITTER_TOLERANCE_PX,
  boundsCloseEnough,
  getDesktopBarHeight,
  getDesktopBarStagePadding,
  getDesktopBarStageLayout,
  getDesktopBarWindowBounds,
  getDesktopBarVisualBounds,
  getDesktopBarRendererLayout,
  getHudBottomOffset,
  getHudBounds,
  getHudPosition,
  getHudTargetArea,
  getToolHudOffset,
  getToolHudSize,
  hudAnchorBoundsCloseEnough,
  scaleBounds,
  scaledHudAnchorBoundsCloseEnough
};
