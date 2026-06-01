const els = {
  trust: document.getElementById("hitboxTrust"),
  settings: document.getElementById("hitboxSettings")
};

const HITBOX_INPUT_GRACE_MS = 650;

let currentTrustPopover = null;
let trustPopoverHideTimer = null;
let trustPopoverAutoHideTimer = null;
let hitboxPointerInteractive = null;
let hitboxInputReadyAt = 0;
let latestHitboxPayloadKey = "";

window.tokenBar.onHudUpdate(renderHitbox);
window.tokenBar.getHudSnapshot().then(renderHitbox);
setupHitboxPointerRegion();

els.settings?.addEventListener("click", () => {
  window.tokenBar.openSettings("hud");
});

els.trust?.addEventListener("pointerenter", () => {
  if (!isHitboxInputReady()) return;
  showTrustPopover();
});

els.trust?.addEventListener("pointerleave", () => {
  scheduleHideTrustPopover();
});

els.trust?.addEventListener("click", () => {
  showTrustPopover({ autoHideMs: 4200 });
});

function renderHitbox(payload) {
  if (!payload || !payload.visible) {
    currentTrustPopover = null;
    latestHitboxPayloadKey = "";
    hitboxInputReadyAt = 0;
    setHitboxPointerRegion(false);
    hideTrustPopover();
    return;
  }
  const payloadKey = getHitboxPayloadKey(payload);
  if (payloadKey !== latestHitboxPayloadKey) {
    latestHitboxPayloadKey = payloadKey;
    hitboxInputReadyAt = Date.now() + HITBOX_INPUT_GRACE_MS;
    setHitboxPointerRegion(false);
    hideTrustPopover();
  }
  const trust = getTrustInfo(payload.provider);
  currentTrustPopover = getTrustPopoverDetails(trust, payload.provider);
}

function setupHitboxPointerRegion() {
  if (!window.tokenBar.setToolHudHitboxMouseRegion || typeof window.addEventListener !== "function") return;
  window.addEventListener("mousemove", updateHitboxPointerRegion);
  window.addEventListener("mouseleave", () => setHitboxPointerRegion(false));
  window.addEventListener("blur", () => setHitboxPointerRegion(false));
  setHitboxPointerRegion(false);
}

function updateHitboxPointerRegion(event) {
  if (!isHitboxInputReady()) {
    setHitboxPointerRegion(false);
    return;
  }
  setHitboxPointerRegion(
    isPointerInsideElement(event, els.trust) ||
    isPointerInsideElement(event, els.settings)
  );
}

function setHitboxPointerRegion(interactive) {
  const nextInteractive = Boolean(interactive);
  if (hitboxPointerInteractive === nextInteractive) return;
  hitboxPointerInteractive = nextInteractive;
  const result = window.tokenBar.setToolHudHitboxMouseRegion?.(nextInteractive);
  result?.catch?.(() => {});
}

function isPointerInsideElement(event, element) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
}

function getTrustInfo(provider) {
  const trust = provider?.trust || provider?.health?.trust || {};
  const level = trust.level || provider?.trustLevel || "missing";
  return {
    label: trust.label || provider?.trustLabel || provider?.syncLabel || "等待",
    level,
    sourceLabel: trust.sourceLabel || provider?.tokenPlanSource || provider?.sourceLabel || provider?.id || "--",
    ageMs: trust.ageMs,
    freshness: trust.freshness || provider?.syncStatus || "unknown",
    unitLabel: trust.unitLabel || provider?.unitLabel || provider?.displayMode || "capacity",
    refreshPolicy: trust.refreshPolicy || provider?.refreshPolicy || "跟随前台工具与全局刷新策略",
    explain: trust.explain || "来自本地或 provider 明确用量信号。"
  };
}

function getTrustPopoverDetails(trust, provider) {
  const age = trust.ageMs !== null && trust.ageMs !== undefined
    ? `${formatAge(trust.ageMs)} (${formatClock(Date.now() - Number(trust.ageMs))})`
    : "--";
  return {
    status: trust.label || "等待",
    level: trust.level || "missing",
    rows: [
      { label: "来源", value: trust.sourceLabel || "--" },
      { label: "更新时间", value: age },
      { label: "新鲜度", value: trust.freshness || provider?.syncStatus || "--" },
      { label: "单位", value: trust.unitLabel || "--" },
      { label: "刷新策略", value: trust.refreshPolicy || "--" },
      { label: "判定口径", value: provider?.remainingStandardLabel || provider?.displayMode || "--" }
    ],
    privacy: "未读取 prompt / completion / API key",
    explain: trust.explain || "等待数据。",
    action: "了解更多数据口径"
  };
}

function showTrustPopover(options = {}) {
  if (!isHitboxInputReady()) return;
  if (!currentTrustPopover || !els.trust || !window.tokenBar.showHudTrustPopover) return;
  clearTimeout(trustPopoverHideTimer);
  clearTimeout(trustPopoverAutoHideTimer);
  const rect = els.trust.getBoundingClientRect();
  window.tokenBar.showHudTrustPopover({
    anchor: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    },
    details: currentTrustPopover
  });
  if (options.autoHideMs) {
    trustPopoverAutoHideTimer = setTimeout(hideTrustPopover, options.autoHideMs);
  }
}

function scheduleHideTrustPopover() {
  clearTimeout(trustPopoverHideTimer);
  hideTrustPopover();
}

function hideTrustPopover() {
  clearTimeout(trustPopoverHideTimer);
  clearTimeout(trustPopoverAutoHideTimer);
  window.tokenBar.hideHudTrustPopover?.();
}

function isHitboxInputReady() {
  return Date.now() >= hitboxInputReadyAt;
}

function getHitboxPayloadKey(payload) {
  return [
    payload?.tool?.id || "",
    payload?.activeWindow?.hwnd || "",
    payload?.activeWindow?.pid || ""
  ].join(":");
}

function formatAge(ageMs) {
  const ms = Number(ageMs);
  if (!Number.isFinite(ms) || ms < 0) return "--";
  if (ms < 1000) return "刚刚";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s 前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min 前`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h 前`;
}

function formatClock(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}
