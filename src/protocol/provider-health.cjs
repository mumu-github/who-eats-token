const { getQuotaDelight } = require("./quota-delight.cjs");
const { isTokenAccuracyEstimated, mergeTokenAccuracies, normalizeTokenAccuracy } = require("./token-accuracy.cjs");

function summarizeProviderHealth(snapshot = {}) {
  const providers = Array.isArray(snapshot.providers) ? snapshot.providers : [];
  const registry = Array.isArray(snapshot.settings?.providerRegistry)
    ? snapshot.settings.providerRegistry
    : [];
  const providersById = new Map(providers.map((provider) => [provider.id, provider]));
  const registryIds = new Set(registry.map((provider) => provider.id));
  const entries = [
    ...registry.map((registered) => summarizeProvider(registered, providersById.get(registered.id), snapshot)),
    ...providers
      .filter((provider) => !registryIds.has(provider.id))
      .map((provider) => summarizeProvider(null, provider, snapshot))
  ];

  return {
    collectedAt: snapshot.collectedAt || null,
    activeTool: snapshot.activeTool || null,
    ingest: summarizeIngest(snapshot),
    bridges: snapshot.bridges || null,
    totals: snapshot.totals || null,
    summary: summarizeEntries(entries),
    providers: entries
  };
}

function summarizeIngest(snapshot) {
  if (!snapshot.ingest && !("port" in snapshot || "listening" in snapshot || "eventCount" in snapshot)) return null;
  return {
    port: snapshot.port || snapshot.ingest?.port || null,
    listening: snapshot.listening ?? snapshot.ingest?.listening ?? null,
    error: snapshot.error || snapshot.ingest?.error || null,
    eventCount: snapshot.eventCount ?? snapshot.ingest?.eventCount ?? null,
    recentEventCount: snapshot.recentEventCount ?? snapshot.ingest?.recentEventCount ?? null,
    overlayCount: snapshot.overlayCount ?? snapshot.ingest?.overlayCount ?? null
  };
}

function summarizeProvider(registered, provider, snapshot) {
  const enabled = registered ? registered.enabled !== false : true;
  const primaryRemainingPercent = remainingPercent(provider?.latest?.rateLimits?.primary);
  const secondaryRemainingPercent = remainingPercent(provider?.latest?.rateLimits?.secondary);
  const tokenPlanRemainingPercent = numericOrNull(provider?.latest?.tokenPlan?.remainingPercent);
  const contextRemainingPercent = numericOrNull(provider?.latest?.context?.remainingPercent);
  const displayMode = getDisplayMode(provider);
  const tokenAccuracy = getProviderTokenAccuracy(provider);
  const tokenEstimated = isTokenAccuracyEstimated(tokenAccuracy);
  const remainingStandardPercent = getRemainingStandardPercent({
    displayMode,
    primaryRemainingPercent,
    secondaryRemainingPercent,
    tokenPlanRemainingPercent,
    contextRemainingPercent
  });
  const remainingValues = [
    primaryRemainingPercent,
    secondaryRemainingPercent,
    tokenPlanRemainingPercent,
    contextRemainingPercent
  ].filter((value) => value !== null);
  const latestTimestamp = getLatestTimestamp(provider);
  const collectedMs = Date.parse(snapshot.collectedAt || "");
  const latestMs = Date.parse(latestTimestamp || "");
  const dataAgeMs = Number.isFinite(collectedMs) && Number.isFinite(latestMs)
    ? Math.max(0, collectedMs - latestMs)
    : null;
  const statusInfo = getHealthStatus({ registered, provider, enabled, remainingValues, displayMode, tokenEstimated });
  const trust = getTrustInfo({ registered, provider, statusInfo, dataAgeMs, latestTimestamp, tokenAccuracy, tokenEstimated });

  const entry = {
    id: provider?.id || registered?.id || "unknown",
    name: provider?.name || registered?.name || "Unknown",
    enabled,
    sourceId: provider?.sourceId || null,
    source: provider?.source || registered?.source || null,
    sources: compactProviderSources(provider?.sources),
    usageAggregation: provider?.usageAggregation || null,
    status: statusInfo.status,
    statusLabel: statusInfo.label,
    reason: statusInfo.reason,
    providerStatus: provider?.status || null,
    confidence: provider?.confidence || null,
    tokenAccuracy,
    tokenEstimated,
    latestModel: provider?.latest?.model || null,
    displayMode,
    syncStatus: provider?.latest?.rateLimitsTrust?.status || null,
    syncLabel: provider?.latest?.rateLimitsTrust?.label || null,
    syncReason: provider?.latest?.rateLimitsTrust?.reason || null,
    primaryRemainingPercent,
    secondaryRemainingPercent,
    tokenPlanRemainingPercent,
    contextRemainingPercent,
    remainingStandardPercent,
    remainingStandardLabel: getRemainingStandardLabel(displayMode),
    lowestRemainingPercent: remainingValues.length ? Math.min(...remainingValues) : null,
    dataAgeMs,
    latestTimestamp,
    freshness: getFreshness(dataAgeMs),
    todayTokens: provider?.todayTokens || 0,
    recentTokens: provider?.recentTokens || 0,
    todayCostUsd: provider?.todayCostUsd || 0,
    trust
  };
  return {
    ...entry,
    delight: getQuotaDelight({
      ...entry,
      lowestRemainingPercent: remainingStandardPercent
    })
  };
}

function compactProviderSources(sources) {
  if (!Array.isArray(sources)) return [];
  return sources.slice(0, 12).map((source) => {
    const tokenAccuracy = normalizeTokenAccuracy(source.tokenAccuracy, {
      confidence: source.confidence,
      source: source.source || source.sourceId,
      estimated: source.tokenEstimated
    });
    return {
      sourceId: source.sourceId || null,
      source: source.source || null,
      status: source.status || null,
      confidence: source.confidence || null,
      tokenAccuracy,
      tokenEstimated: Boolean(source.tokenEstimated || tokenAccuracy.estimated),
      todayTokens: source.todayTokens || 0,
      recentTokens: source.recentTokens || 0,
      todayCostUsd: source.todayCostUsd || 0,
      eventCount: source.eventCount ?? null,
      latestTimestamp: source.latestTimestamp || null
    };
  });
}

function getTrustInfo({ registered, provider, statusInfo, dataAgeMs, latestTimestamp, tokenAccuracy, tokenEstimated }) {
  const displayMode = getDisplayMode(provider);
  const tokenPlanSource = provider?.latest?.tokenPlan?.source || null;
  const sourceLabel = provider?.source || registered?.source || "unknown";
  const freshness = getFreshness(dataAgeMs);
  const syncStatus = provider?.latest?.rateLimitsTrust?.status || null;
  const syncReason = provider?.latest?.rateLimitsTrust?.reason || null;

  if (!provider) {
    return {
      level: registered?.source === "planned" ? "planned" : "missing",
      label: registered?.source === "planned" ? "预留" : "等待",
      sourceLabel,
      updatedAt: latestTimestamp || null,
      ageMs: dataAgeMs,
      freshness,
      explain: statusInfo.reason
    };
  }

  if (statusInfo.status === "auth-expired") {
    return {
      level: "auth-expired",
      label: "要登录",
      sourceLabel,
      updatedAt: latestTimestamp || null,
      ageMs: dataAgeMs,
      freshness,
      explain: statusInfo.reason || "Provider credential needs to be refreshed."
    };
  }

  if (statusInfo.status === "delayed" || statusInfo.status === "suspect" || freshness === "stale") {
    return {
      level: "delayed",
      label: freshness === "stale" ? "过期" : "延迟",
      sourceLabel,
      updatedAt: latestTimestamp || null,
      ageMs: dataAgeMs,
      freshness,
      explain: syncReason || statusInfo.reason || "Provider data is reliable but not fresh enough for an exact live claim."
    };
  }

  if (
    statusInfo.status === "estimated" ||
    syncStatus === "estimated" ||
    shouldSurfaceTokenEstimateAsStatus({ provider, displayMode, tokenEstimated })
  ) {
    return {
      level: "estimated",
      label: "估算",
      sourceLabel,
      updatedAt: latestTimestamp || null,
      ageMs: dataAgeMs,
      freshness,
      explain: syncReason || statusInfo.reason || tokenAccuracy?.reason || "Provider data is estimated from local usage or model context."
    };
  }

  if (statusInfo.status === "disabled") {
    return {
      level: "disabled",
      label: "已关闭",
      sourceLabel,
      updatedAt: latestTimestamp || null,
      ageMs: dataAgeMs,
      freshness,
      explain: statusInfo.reason
    };
  }

  const isProviderPlan = displayMode === "token-plan" && tokenPlanSource && tokenPlanSource !== "local-estimate";
  const isExact = provider.confidence === "exact" || provider.confidence === "reported" || statusInfo.status === "live";
  const level = isProviderPlan ? "exact-provider" : isExact ? "exact-local" : "derived";
  const label = isProviderPlan ? "精确" : isExact ? "本地精确" : "汇总";

  return {
    level,
    label,
    sourceLabel,
    updatedAt: latestTimestamp || null,
    ageMs: dataAgeMs,
    freshness,
    explain: isProviderPlan
      ? "Provider plan usage API reported this quota; prompts, completions, and API keys are not included."
      : "Local explicit usage events were aggregated; prompts, completions, and source files are not included."
  };
}

function summarizeEntries(entries) {
  const summary = {
    total: entries.length,
    live: 0,
    delayed: 0,
    estimated: 0,
    missing: 0,
    disabled: 0,
    planned: 0,
    attention: 0,
    lowestRemainingPercent: null
  };

  for (const entry of entries) {
    if (entry.status === "live") summary.live += 1;
    if (entry.status === "delayed" || entry.status === "suspect") summary.delayed += 1;
    if (entry.status === "estimated") summary.estimated += 1;
    if (entry.status === "missing" || entry.status === "auth-expired") summary.missing += 1;
    if (entry.status === "disabled") summary.disabled += 1;
    if (entry.status === "planned") summary.planned += 1;
    if (needsAttention(entry)) summary.attention += 1;
    if (entry.lowestRemainingPercent !== null) {
      summary.lowestRemainingPercent = summary.lowestRemainingPercent === null
        ? entry.lowestRemainingPercent
        : Math.min(summary.lowestRemainingPercent, entry.lowestRemainingPercent);
    }
  }

  return summary;
}

function getProviderTokenAccuracy(provider) {
  if (!provider) return normalizeTokenAccuracy("unknown");
  const providerAccuracy = normalizeTokenAccuracy(provider.tokenAccuracy, {
    confidence: provider.confidence,
    source: provider.source,
    estimated: provider.tokenEstimated
  });
  return mergeTokenAccuracies([
    providerAccuracy,
    provider.latest?.tokenAccuracy,
    provider.latest?.context?.tokenAccuracy,
    ...(Array.isArray(provider.sources) ? provider.sources.map((source) => source.tokenAccuracy) : [])
  ]);
}

function shouldSurfaceTokenEstimateAsStatus({ provider, displayMode, tokenEstimated }) {
  if (!provider || !tokenEstimated) return false;
  const tokenPlanStatus = provider.latest?.tokenPlan?.platformStatus || provider.latest?.tokenPlan?.status || null;
  if (displayMode === "token-plan" && tokenPlanStatus === "live") return false;
  if (displayMode === "capacity" && (provider.latest?.rateLimits?.primary || provider.latest?.rateLimits?.secondary)) return false;
  return true;
}

function getHealthStatus({ registered, provider, enabled, remainingValues, displayMode, tokenEstimated }) {
  if (!enabled) {
    return {
      status: "disabled",
      label: "已关闭",
      reason: "Provider is disabled in settings."
    };
  }

  if (!provider) {
    if (registered?.source === "planned") {
      return {
        status: "planned",
        label: "预留",
        reason: "Adapter entry is reserved but no runtime provider is enabled yet."
      };
    }
    return {
      status: "missing",
      label: "等待",
      reason: "No provider data is available in the current snapshot."
    };
  }

  const syncStatus = provider.latest?.rateLimitsTrust?.status || null;
  const tokenPlanStatus = provider.latest?.tokenPlan?.platformStatus || provider.latest?.tokenPlan?.status || null;
  if (tokenPlanStatus === "auth-missing" || tokenPlanStatus === "auth-expired") {
    return {
      status: "auth-expired",
      label: "需登录",
      reason: "Provider quota sync needs a refreshed local credential."
    };
  }

  if (syncStatus === "delayed" || syncStatus === "suspect") {
    return {
      status: syncStatus,
      label: provider.latest?.rateLimitsTrust?.label || "延迟",
      reason: provider.latest?.rateLimitsTrust?.reason || "Provider quota data is not fully fresh."
    };
  }

  if (syncStatus === "estimated" || shouldSurfaceTokenEstimateAsStatus({ provider, displayMode, tokenEstimated })) {
    return {
      status: "estimated",
      label: provider.latest?.rateLimitsTrust?.label || "估算",
      reason: provider.latest?.rateLimitsTrust?.reason || "Provider data is estimated rather than directly reported."
    };
  }

  if (provider.status === "live") {
    return {
      status: "live",
      label: provider.latest?.rateLimitsTrust?.label || (remainingValues.length ? "实时" : "有数据"),
      reason: null
    };
  }

  return {
    status: provider.status || "missing",
    label: provider.latest?.rateLimitsTrust?.label || "等待",
    reason: provider.note || provider.latest?.rateLimitsTrust?.reason || "Provider has no live usage or quota signal."
  };
}

function needsAttention(entry) {
  if (entry.lowestRemainingPercent !== null && entry.lowestRemainingPercent < 20) return true;
  return ["missing", "delayed", "suspect", "auth-expired"].includes(entry.status);
}

function getDisplayMode(provider) {
  if (!provider) return "missing";
  if (provider.latest?.tokenPlan) return "token-plan";
  if (provider.latest?.rateLimits?.primary || provider.latest?.rateLimits?.secondary) return "capacity";
  if (provider.latest?.context) return "context";
  if (provider.latest) return "usage";
  return "missing";
}

function getRemainingStandardPercent({
  displayMode,
  primaryRemainingPercent,
  secondaryRemainingPercent,
  tokenPlanRemainingPercent,
  contextRemainingPercent
}) {
  if (displayMode === "token-plan") return tokenPlanRemainingPercent;
  if (displayMode === "context") return contextRemainingPercent;
  if (displayMode === "capacity") return primaryRemainingPercent ?? secondaryRemainingPercent;
  return null;
}

function getRemainingStandardLabel(displayMode) {
  if (displayMode === "token-plan") return "Token Plan 剩余 / 总量";
  if (displayMode === "context") return "上下文剩余 / 上下文上限";
  if (displayMode === "capacity") return "当前 5 小时窗口余量";
  if (displayMode === "usage") return "仅用量节奏，无余量口径";
  return "等待可用余量口径";
}

function getLatestTimestamp(provider) {
  const displayMode = getDisplayMode(provider);
  if (displayMode === "capacity") {
    return provider?.latest?.rateLimitsSource?.updatedAt ||
      provider?.latest?.timestamp ||
      provider?.latest?.latestTokenAt ||
      provider?.collectedAt ||
      null;
  }
  if (displayMode === "token-plan") {
    return provider?.latest?.tokenPlan?.snapshotAt ||
      provider?.latest?.timestamp ||
      provider?.latest?.latestTokenAt ||
      provider?.collectedAt ||
      null;
  }
  return provider?.latest?.timestamp ||
    provider?.latest?.latestTokenAt ||
    provider?.latest?.tokenPlan?.snapshotAt ||
    provider?.collectedAt ||
    null;
}

function getFreshness(dataAgeMs) {
  if (dataAgeMs === null) return "unknown";
  if (dataAgeMs <= 2 * 60 * 1000) return "fresh";
  if (dataAgeMs <= 15 * 60 * 1000) return "warm";
  return "stale";
}

function remainingPercent(window) {
  const usedPercent = numericOrNull(window?.usedPercent);
  if (usedPercent === null) return null;
  return Math.max(0, Math.min(100, 100 - Math.round(usedPercent)));
}

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

module.exports = {
  summarizeProviderHealth,
  _test: {
    getDisplayMode,
    getFreshness,
    getTrustInfo,
    remainingPercent
  }
};
