"use strict";

const { normalizeBounds } = require("./geometry-service.cjs");

/**
 * Pure HUD payload builder — no mutable state, no Electron imports.
 * All inputs are passed in; outputs are plain objects.
 */

// ── Payload builder ─────────────────────────────────────────────────

function buildHudPayload(snapshot, activeWindow, tool) {
  if (!tool) {
    return { visible: false, activeWindow };
  }

  const provider = findProvider(snapshot.providers, tool.providerIds);
  const providerHealth = findProvider(snapshot.providerHealth?.providers || [], tool.providerIds);
  const primaryWindow = provider?.latest?.rateLimits?.primary || null;
  const secondaryWindow = provider?.latest?.rateLimits?.secondary || null;
  const usedPercent = primaryWindow ? Math.round(primaryWindow.usedPercent) : null;
  const fiveHourRemaining = getWindowRemaining(primaryWindow);
  const weekRemaining = getWindowRemaining(secondaryWindow);
  const context = provider?.latest?.context || null;
  const tokenPlan = provider?.latest?.tokenPlan || null;
  const tokenPlanRemaining = roundedNumberOrNull(tokenPlan?.remainingPercent);
  const contextRemaining = roundedNumberOrNull(context?.remainingPercent);
  const displayMode = tokenPlan
    ? "token-plan"
    : primaryWindow || secondaryWindow
    ? "capacity"
    : context
      ? "context"
      : provider
        ? "usage"
        : "waiting";
  const capacityTrend = provider?.latest?.capacityTrend || null;

  return {
    visible: true,
    activeWindow,
    tool,
    provider: provider
      ? {
          id: provider.id,
          name: provider.name,
          confidence: provider.confidence,
          todayTokens: provider.todayTokens || 0,
          recentTokens: provider.recentTokens || 0,
          model: provider.latest?.model || null,
          usedPercent: usedPercent ?? roundedNumberOrNull(tokenPlan?.usedPercent) ?? roundedNumberOrNull(context?.usedPercent),
          remainingPercent: displayMode === "token-plan"
            ? tokenPlanRemaining
            : displayMode === "context"
              ? contextRemaining
              : fiveHourRemaining ?? weekRemaining,
          fiveHourRemaining,
          weekRemaining,
          displayMode,
          tokenPlanRemaining,
          tokenPlanUsedPercent: roundedNumberOrNull(tokenPlan?.usedPercent),
          tokenPlanUsedCredits: numberOrNull(tokenPlan?.usedCredits),
          tokenPlanTotalCredits: numberOrNull(tokenPlan?.totalCredits),
          tokenPlanRemainingCredits: numberOrNull(tokenPlan?.remainingCredits),
          tokenPlanRecentCredits: numberOrNull(tokenPlan?.recentCredits),
          tokenPlanFiveHourCredits: numberOrNull(tokenPlan?.fiveHourCredits),
          tokenPlanSource: tokenPlan?.source || null,
          tokenPlanPlanName: tokenPlan?.planName || null,
          tokenPlanValidUntil: tokenPlan?.validUntil || null,
          tokenPlanSnapshotAt: tokenPlan?.snapshotAt || null,
          tokenPlanLocalDeltaCredits: numberOrNull(tokenPlan?.localDeltaCredits),
          tokenPlanPlatformStatus: tokenPlan?.platformStatus || null,
          contextRemaining,
          contextUsedTokens: numberOrNull(context?.usedTokens),
          contextLimitTokens: numberOrNull(context?.limitTokens),
          contextSource: context?.source || null,
          tokenAccuracy: providerHealth?.tokenAccuracy || provider.tokenAccuracy || context?.tokenAccuracy || null,
          tokenEstimated: Boolean(providerHealth?.tokenEstimated || provider.tokenEstimated || context?.estimated),
          syncStatus: provider.latest?.rateLimitsTrust?.status || "missing",
          syncLabel: provider.latest?.rateLimitsTrust?.label || "等待",
          health: providerHealth || null,
          trust: providerHealth?.trust || null,
          delight: providerHealth?.delight || null,
          capacityTrend,
          trendStatus: capacityTrend?.status || "unknown",
          trendLabel: capacityTrend?.label || "观察",
          fiveHourResetsAt: primaryWindow?.resetsAt || null,
          weekResetsAt: secondaryWindow?.resetsAt || null
        }
      : null,
    collectedAt: snapshot.collectedAt
  };
}

// ── Window remaining ────────────────────────────────────────────────

function getWindowRemaining(window) {
  if (!window) return null;
  const usedPercent = Number(window.usedPercent);
  if (!Number.isFinite(usedPercent)) return 0;
  return Math.max(0, Math.min(100, 100 - Math.round(usedPercent)));
}

// ── Summarizers (debug logging) ─────────────────────────────────────

function summarizeHudWindow(windowInfo) {
  if (!windowInfo) return null;
  return {
    source: windowInfo.source || "powershell",
    hwnd: windowInfo.hwnd || null,
    pid: numberOrNull(windowInfo.pid),
    processName: windowInfo.processName || "",
    bundleId: windowInfo.bundleId || "",
    title: windowInfo.title || "",
    path: windowInfo.path || "",
    url: windowInfo.url || "",
    platform: windowInfo.platform || null,
    memoryUsageBytes: numberOrNull(windowInfo.memoryUsageBytes),
    className: windowInfo.className || "",
    bounds: normalizeBounds(windowInfo.bounds),
    desktopClear: windowInfo.desktop?.clear ?? null,
    desktopBlockerCount: numberOrNull(windowInfo.desktop?.blockerCount),
    overlayCount: Array.isArray(windowInfo.contentOverlays) ? windowInfo.contentOverlays.length : 0
  };
}

function summarizeHudTool(tool) {
  if (!tool) return null;
  return {
    id: tool.id,
    name: tool.name,
    providerIds: tool.providerIds || [],
    bottomOffset: numberOrNull(tool.hud?.bottomOffset)
  };
}

function summarizeHudPayload(payload) {
  if (!payload) return null;
  const provider = payload.provider || null;
  return {
    visible: Boolean(payload.visible),
    hiddenReason: payload.hiddenReason || null,
    transient: Boolean(payload.transient),
    transientReason: payload.transientReason || null,
    repositioned: Boolean(payload.repositioned),
    repositionReason: payload.repositionReason || null,
    toolId: payload.tool?.id || null,
    toolName: payload.tool?.name || null,
    collectedAt: payload.collectedAt || null,
    provider: provider
      ? {
          id: provider.id,
          name: provider.name,
          displayMode: provider.displayMode,
          syncStatus: provider.syncStatus,
          syncLabel: provider.syncLabel,
          remainingPercent: provider.remainingPercent,
          fiveHourRemaining: provider.fiveHourRemaining,
          weekRemaining: provider.weekRemaining,
          tokenPlanRemaining: provider.tokenPlanRemaining,
          tokenPlanUsedCredits: provider.tokenPlanUsedCredits,
          tokenPlanTotalCredits: provider.tokenPlanTotalCredits,
          tokenPlanSource: provider.tokenPlanSource,
          tokenPlanPlatformStatus: provider.tokenPlanPlatformStatus,
          tokenAccuracy: provider.tokenAccuracy || null,
          tokenEstimated: Boolean(provider.tokenEstimated)
        }
      : null
  };
}

function summarizeProviders(providers) {
  return providers.reduce(
    (acc, provider) => {
      acc.todayTokens += provider.todayTokens || 0;
      acc.recentTokens += provider.recentTokens || 0;
      acc.todayCostUsd += provider.todayCostUsd || 0;
      if (provider.status === "live") acc.liveProviders += 1;
      if (provider.status === "missing") acc.missingProviders += 1;
      return acc;
    },
    {
      todayTokens: 0,
      recentTokens: 0,
      todayCostUsd: 0,
      liveProviders: 0,
      missingProviders: 0
    }
  );
}

function buildHudDebugEntry({ id, snapshot, activeWindow, anchorWindow, tool, payload }) {
  return {
    event: "hud-refresh",
    id,
    snapshotAt: snapshot?.collectedAt || null,
    activeWindow: summarizeHudWindow(activeWindow),
    anchorWindow: summarizeHudWindow(anchorWindow),
    detectedTool: summarizeHudTool(tool),
    payload: summarizeHudPayload(payload)
  };
}

// ── Utility ─────────────────────────────────────────────────────────

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundedNumberOrNull(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function findProvider(providers, providerIds) {
  return providers.find((provider) => providerIds.includes(provider.id));
}

function formatResetForNotification(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `，${date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  })} 重置`;
}

module.exports = {
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
  formatResetForNotification
};
