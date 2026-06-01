function clampNumber(value, min, max) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeBounds(bounds = {}) {
  const x = Number(bounds?.x);
  const y = Number(bounds?.y);
  const width = Number(bounds?.width);
  const height = Number(bounds?.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return { x, y, width, height };
}

function boundsOverlap(first, second) {
  if (!first || !second) return false;
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}

function boundsEqual(first, second) {
  if (!first || !second) return false;
  return first.x === second.x &&
    first.y === second.y &&
    first.width === second.width &&
    first.height === second.height;
}

function getWindowArea(windowInfo) {
  const bounds = normalizeBounds(windowInfo?.bounds);
  if (!bounds) return 0;
  return Math.max(0, bounds.width) * Math.max(0, bounds.height);
}

module.exports = {
  boundsEqual,
  boundsOverlap,
  clampNumber,
  getWindowArea,
  normalizeBounds
};
