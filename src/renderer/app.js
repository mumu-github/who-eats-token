const els = {
  toggle: document.getElementById("toggle"),
  close: document.getElementById("close"),
  fiveHourMetric: document.getElementById("fiveHourMetric"),
  primaryMetricLabel: document.getElementById("primaryMetricLabel"),
  fiveHourRemaining: document.getElementById("fiveHourRemaining"),
  weekMetric: document.getElementById("weekMetric"),
  secondaryMetricLabel: document.getElementById("secondaryMetricLabel"),
  weekRemaining: document.getElementById("weekRemaining"),
  miniChart: document.getElementById("miniChart"),
  primaryChartCaption: document.getElementById("primaryChartCaption"),
  secondaryChartCaption: document.getElementById("secondaryChartCaption"),
  usageStrip: document.getElementById("usageStrip"),
  usageName: document.getElementById("usageName"),
  usageStatus: document.getElementById("usageStatus"),
  todayLabel: document.getElementById("todayLabel"),
  todayTokens: document.getElementById("todayTokens"),
  recentLabel: document.getElementById("recentLabel"),
  recentTokens: document.getElementById("recentTokens"),
  systemStrip: document.getElementById("systemStrip"),
  cpuUsage: document.getElementById("cpuUsage"),
  memoryUsage: document.getElementById("memoryUsage"),
  availableMemory: document.getElementById("availableMemory"),
  details: document.getElementById("details")
};

els.toggle.addEventListener("click", () => {
  els.toggle.blur();
  window.tokenBar.openSettings();
});

els.close.addEventListener("click", () => {
  window.tokenBar.close();
});

window.tokenBar.onUpdate(render);
window.tokenBar.onSystemUpdate?.(renderSystemStrip);
window.tokenBar.onSettingsUpdate(applyVisualSettings);
window.tokenBar.getSnapshot().then(render);
window.tokenBar.getSettings().then(applyVisualSettings);

function render(snapshot) {
  if (!snapshot) return;
  if (snapshot.settings) applyVisualSettings(snapshot.settings);
  const providers = snapshot.providers || [];
  const currentProvider = getCurrentProvider(providers, snapshot);
  const display = getCurrentDisplay(snapshot, currentProvider);
  renderMetric(els.fiveHourMetric, els.fiveHourRemaining, display.primary.value, display.primary);
  renderMetric(els.weekMetric, els.weekRemaining, display.secondary.value, display.secondary);
  renderMiniChart(display.chart);
  renderUsageStrip(snapshot, currentProvider, display);
  renderSystemStrip(snapshot.system);
}

function renderUsageStrip(snapshot, provider, display) {
  if (!els.usageStrip) return;
  const totals = snapshot?.totals || {};
  const remaining = display?.levelValue ?? (provider ? getProviderRemaining(provider) : null);
  const delight = display?.delight || getProviderDelight(snapshot, provider);

  els.usageName.textContent = provider?.name || "等待数据";
  els.usageStatus.textContent = delight?.shortLabel || display?.statusLabel || (provider ? getUsageStatus(provider) : "同步中");
  if (els.todayLabel) els.todayLabel.textContent = display?.usageLabels?.today || "今";
  if (els.recentLabel) els.recentLabel.textContent = display?.usageLabels?.recent || "1h";
  els.todayTokens.textContent = formatNullableTokens(display?.usageValues?.today ?? provider?.todayTokens ?? totals.todayTokens);
  els.recentTokens.textContent = formatNullableTokens(display?.usageValues?.recent ?? provider?.recentTokens ?? totals.recentTokens);
  els.usageStrip.dataset.level = getRemainingLevel(remaining);
  els.usageStrip.dataset.mode = display?.mode || "waiting";
  els.usageStrip.dataset.delightMood = delight?.mood || "watching";
  els.usageStrip.dataset.delightTone = delight?.tone || "muted";
  els.usageStrip.dataset.motion = delight?.motion || "none";
  els.usageStrip.title = provider
    ? `${delight?.label ? `${delight.label} · ` : ""}${display?.title || `${provider.name} · ${getSyncLabel(provider)} · 今日 ${formatTokens(provider.todayTokens)} · 近 1h ${formatTokens(provider.recentTokens)}`}`
    : `今日 ${formatTokens(totals.todayTokens)} · 近 1h ${formatTokens(totals.recentTokens)}`;
}

function renderSystemStrip(system) {
  if (!els.systemStrip) return;
  const cpuPercent = roundNumber(system?.cpu?.percent);
  const memoryPercent = roundNumber(system?.memory?.usedPercent);
  const availablePercent = roundNumber(system?.memory?.freePercent);

  els.cpuUsage.textContent = formatSystemPercent(cpuPercent);
  els.memoryUsage.textContent = formatSystemPercent(memoryPercent);
  els.availableMemory.textContent = formatBytes(system?.memory?.freeBytes);

  els.systemStrip.dataset.cpu = getSystemLevel(cpuPercent, 70, 88);
  els.systemStrip.dataset.memory = getSystemLevel(memoryPercent, 78, 90);
  els.systemStrip.dataset.available = getAvailableMemoryLevel(availablePercent);
  els.systemStrip.title = [
    `CPU ${formatSystemPercent(cpuPercent)}`,
    `内存 ${formatSystemPercent(memoryPercent)}${system?.memory ? ` · ${formatBytes(system.memory.usedBytes)} / ${formatBytes(system.memory.totalBytes)}` : ""}`,
    `可用 ${formatBytes(system?.memory?.freeBytes)}`
  ].join(" · ");
}

function applyVisualSettings(settings) {
  if (!settings?.appearance) return;
  const root = document.documentElement;
  root.style.setProperty("--glass-opacity", settings.appearance.glassOpacity);
  root.style.setProperty("--glass-blur", `${settings.appearance.glassBlur}px`);
  root.style.setProperty("--font-scale", settings.appearance.fontScale);
}

function renderMetric(metric, valueElement, value, options = {}) {
  if (!metric || !valueElement) return;
  const labelElement = options.labelElement || (
    metric.id === "weekMetric" ? els.secondaryMetricLabel : els.primaryMetricLabel
  );
  const formatter = options.formatter || formatPercent;
  const levelValue = options.levelValue ?? value;

  if (labelElement) labelElement.textContent = options.label || "";
  valueElement.textContent = formatter(value);
  metric.dataset.level = getRemainingLevel(levelValue);
  metric.dataset.format = options.format || "percent";
  metric.style.setProperty("--metric-color", getMetricColor(options.colorRole || metric.id, levelValue));
}

function renderProviderStrip(providers) {
  const provider = getTightestProvider(providers);
  if (!provider) {
    els.providerStrip.replaceChildren();
    return;
  }

  const primary = provider.latest?.rateLimits?.primary;
  const tokenPlan = provider.latest?.tokenPlan || null;
  const remaining = getProviderRemaining(provider);
  const level = getRemainingLevel(remaining);
  const item = document.createElement("div");
  item.className = `provider ${provider.status}`;
  item.dataset.level = level;
  item.dataset.sync = getSyncStatus(provider);
  item.dataset.trend = getTrendStatus(provider);
  item.dataset.forecast = getForecastStatus(provider);
  item.title = tokenPlan
    ? `${provider.name} · ${getSyncLabel(provider)} · Token Plan ${formatPercent(remaining)} · ${formatTokens(tokenPlan.usedCredits)} / ${formatTokens(tokenPlan.totalCredits)} Credits`
    : `${provider.name} · ${getSyncLabel(provider)} · ${getTrendLabel(provider)} · ${getForecastLabel(provider)} · 5小时 ${formatPercent(remaining)} · ${formatResetCountdown(primary?.resetsAt)}`;

  const icon = document.createElement("span");
  icon.className = "provider-icon";
  icon.setAttribute("aria-hidden", "true");

  const copy = document.createElement("span");
  copy.className = "provider-copy";

  const state = document.createElement("span");
  state.className = "provider-state";
  state.textContent = getStatusText(level, getTrendStatus(provider));

  const reset = document.createElement("span");
  reset.className = "provider-reset";
  reset.textContent = tokenPlan
    ? `${formatTokens(tokenPlan.usedCredits)} / ${formatTokens(tokenPlan.totalCredits)} C`
    : `${getProviderSubline(provider)} · ${formatResetCountdown(primary?.resetsAt)}`;

  copy.append(state, reset);
  item.append(icon, copy);
  els.providerStrip.replaceChildren(item);
}

function getRemainingPercent(providers, key) {
  const values = providers
    .map((provider) => {
      const window = provider.latest?.rateLimits?.[key];
      return window ? Math.max(0, 100 - Math.round(window.usedPercent)) : null;
    })
    .filter((value) => value !== null && value !== undefined);
  if (values.length === 0) return null;
  return values.reduce((lowest, remaining) => {
    return Math.min(lowest, remaining);
  }, 100);
}

function getCurrentProvider(providers, snapshot) {
  const available = (providers || []).filter(Boolean);
  const activeProviderIds = snapshot?.activeTool?.providerIds || [];
  const activeProvider = available.find((provider) => (
    activeProviderIds.includes(provider.id) && hasProviderDisplayData(provider)
  ));
  if (activeProvider) return activeProvider;
  return getTightestProvider(available);
}

function hasProviderDisplayData(provider) {
  return Boolean(
    provider?.latest?.rateLimits?.primary ||
    provider?.latest?.rateLimits?.secondary ||
    provider?.latest?.tokenPlan ||
    provider?.latest?.context
  );
}

function getCurrentDisplay(snapshot, provider) {
  const totals = snapshot?.totals || {};
  const delight = getProviderDelight(snapshot, provider);
  if (!provider) {
    return {
      mode: "waiting",
      levelValue: null,
      statusLabel: "同步中",
      delight,
      usageLabels: { today: "今", recent: "1h" },
      usageValues: { today: totals.todayTokens, recent: totals.recentTokens },
      primary: {
        label: "5小时",
        labelElement: els.primaryMetricLabel,
        value: null,
        levelValue: null,
        colorRole: "fiveHourMetric"
      },
      secondary: {
        label: "一周",
        labelElement: els.secondaryMetricLabel,
        value: null,
        levelValue: null,
        colorRole: "weekMetric"
      },
      chart: {
        primaryValue: null,
        secondaryValue: null,
        primaryCaption: "5h",
        secondaryCaption: "7d",
        levelValue: null
      }
    };
  }

  const tokenPlan = provider.latest?.tokenPlan || null;
  if (tokenPlan) {
    const remaining = roundNumber(tokenPlan.remainingPercent);
    const usedPercent = roundNumber(tokenPlan.usedPercent);
    const usedCredits = numberOrNull(tokenPlan.usedCredits);
    const totalCredits = numberOrNull(tokenPlan.totalCredits);
    const remainingCredits = numberOrNull(tokenPlan.remainingCredits);
    const statusLabel = tokenPlan.label || provider.latest?.rateLimitsTrust?.label || "Token Plan";
    return {
      mode: "token-plan",
      levelValue: remaining,
      statusLabel,
      delight,
      usageLabels: { today: "已", recent: "剩" },
      usageValues: { today: usedCredits, recent: remainingCredits },
      title: `${provider.name} · ${statusLabel} · 已用 ${formatNullableTokens(usedCredits)} / ${formatNullableTokens(totalCredits)} Credits · 余量 ${formatPercent(remaining)}`,
      primary: {
        label: "总余量",
        labelElement: els.primaryMetricLabel,
        value: remaining,
        levelValue: remaining,
        colorRole: "fiveHourMetric"
      },
      secondary: {
        label: "已用",
        labelElement: els.secondaryMetricLabel,
        value: usedCredits,
        levelValue: remaining,
        colorRole: "weekMetric",
        formatter: formatNullableTokens,
        format: "compact"
      },
      chart: {
        primaryValue: remaining,
        secondaryValue: usedPercent,
        primaryCaption: "left",
        secondaryCaption: "used",
        levelValue: remaining
      }
    };
  }

  const primaryWindow = provider.latest?.rateLimits?.primary || null;
  const secondaryWindow = provider.latest?.rateLimits?.secondary || null;
  if (primaryWindow || secondaryWindow) {
    const fiveHourRemaining = getWindowRemaining(primaryWindow);
    const weekRemaining = getWindowRemaining(secondaryWindow);
    return {
      mode: "capacity",
      levelValue: getLowestValue(fiveHourRemaining, weekRemaining),
      statusLabel: getUsageStatus(provider),
      delight,
      usageLabels: { today: "今", recent: "1h" },
      usageValues: { today: provider.todayTokens, recent: provider.recentTokens },
      title: `${provider.name} · ${getSyncLabel(provider)} · 5小时 ${formatPercent(fiveHourRemaining)} · 一周 ${formatPercent(weekRemaining)} · 今日 ${formatTokens(provider.todayTokens)} · 近 1h ${formatTokens(provider.recentTokens)}`,
      primary: {
        label: "5小时",
        labelElement: els.primaryMetricLabel,
        value: fiveHourRemaining,
        levelValue: fiveHourRemaining,
        colorRole: "fiveHourMetric"
      },
      secondary: {
        label: "一周",
        labelElement: els.secondaryMetricLabel,
        value: weekRemaining,
        levelValue: weekRemaining,
        colorRole: "weekMetric"
      },
      chart: {
        primaryValue: fiveHourRemaining,
        secondaryValue: weekRemaining,
        primaryCaption: "5h",
        secondaryCaption: "7d",
        levelValue: getLowestValue(fiveHourRemaining, weekRemaining)
      }
    };
  }

  const context = provider.latest?.context || null;
  const contextRemaining = roundNumber(context?.remainingPercent);
  const contextUsedTokens = numberOrNull(context?.usedTokens);
  return {
    mode: "context",
    levelValue: contextRemaining,
    statusLabel: getUsageStatus(provider),
    delight,
    usageLabels: { today: "今", recent: "1h" },
    usageValues: { today: provider.todayTokens, recent: provider.recentTokens },
    title: `${provider.name} · 上下文 ${formatPercent(contextRemaining)} · 今日 ${formatTokens(provider.todayTokens)} · 近 1h ${formatTokens(provider.recentTokens)}`,
    primary: {
      label: "上下文",
      labelElement: els.primaryMetricLabel,
      value: contextRemaining,
      levelValue: contextRemaining,
      colorRole: "fiveHourMetric"
    },
    secondary: {
      label: "本轮",
      labelElement: els.secondaryMetricLabel,
      value: contextUsedTokens,
      levelValue: contextRemaining,
      colorRole: "weekMetric",
      formatter: formatNullableTokens,
      format: "compact"
    },
    chart: {
      primaryValue: contextRemaining,
      secondaryValue: context?.usedPercent ? roundNumber(context.usedPercent) : null,
      primaryCaption: "ctx",
      secondaryCaption: "used",
      levelValue: contextRemaining
    }
  };
}

function getProviderDelight(snapshot, provider) {
  const health = getProviderHealth(snapshot, provider);
  return health?.delight || null;
}

function getProviderHealth(snapshot, provider) {
  if (!provider) return null;
  const healthProviders = snapshot?.providerHealth?.providers || [];
  return healthProviders.find((entry) => entry.id === provider.id) || null;
}

function getTightestProvider(providers) {
  const candidates = providers.filter((provider) => (
    provider.latest?.rateLimits?.primary || provider.latest?.tokenPlan
  ));
  if (candidates.length === 0) return providers[0] || null;
  return candidates.reduce((tightest, provider) => {
    const current = getProviderRemaining(provider);
    const best = getProviderRemaining(tightest);
    return current < best ? provider : tightest;
  }, candidates[0]);
}

function getProviderRemaining(provider) {
  if (provider.latest?.tokenPlan) return provider.latest.tokenPlan.remainingPercent;
  return getWindowRemaining(provider.latest?.rateLimits?.primary);
}

function getWindowRemaining(window) {
  if (!window) return null;
  return Math.max(0, 100 - Math.round(window.usedPercent));
}

function renderMiniChart(chart) {
  if (!els.miniChart) return;
  const fiveHourRemaining = chart?.primaryValue;
  const weekRemaining = chart?.secondaryValue;
  const five = fiveHourRemaining ?? 0;
  const week = weekRemaining ?? 0;
  const lowest = chart?.levelValue ?? getLowestValue(fiveHourRemaining, weekRemaining) ?? 100;
  if (els.primaryChartCaption) els.primaryChartCaption.textContent = chart?.primaryCaption || "5h";
  if (els.secondaryChartCaption) els.secondaryChartCaption.textContent = chart?.secondaryCaption || "7d";
  els.miniChart.style.setProperty("--five-fill", `${clamp(five, 0, 100)}%`);
  els.miniChart.style.setProperty("--week-fill", `${clamp(week, 0, 100)}%`);
  els.miniChart.style.setProperty("--pulse-speed", `${getPulseSpeed(lowest)}s`);
  els.miniChart.dataset.level = getRemainingLevel(lowest);
}

function formatPercent(value) {
  return value === null || value === undefined ? "--" : `${value}%`;
}

function formatSystemPercent(value) {
  return value === null || value === undefined ? "--" : `${value}%`;
}

function formatTemperature(value) {
  return value === null || value === undefined ? "--°" : `${value}°`;
}

function roundNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getLowestValue(...values) {
  const normalized = values.filter((value) => value !== null && value !== undefined);
  if (normalized.length === 0) return null;
  return Math.min(...normalized);
}

function getSystemLevel(value, caution, danger) {
  if (value === null || value === undefined) return "unknown";
  if (value >= danger) return "danger";
  if (value >= caution) return "caution";
  return "healthy";
}

function getTemperatureLevel(value) {
  if (value === null || value === undefined) return "unknown";
  if (value >= 88) return "danger";
  if (value >= 76) return "caution";
  return "healthy";
}

function getAvailableMemoryLevel(value) {
  if (value === null || value === undefined) return "unknown";
  if (value <= 10) return "danger";
  if (value <= 20) return "caution";
  return "healthy";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getRemainingLevel(value) {
  if (value === null || value === undefined) return "unknown";
  if (value < 20) return "danger";
  if (value < 45) return "caution";
  return "healthy";
}

function getStatusText(level, trendStatus) {
  if (level === "danger") return "告警";
  if (level === "caution") return "偏紧";
  if (level === "healthy" && trendStatus === "fast") return "消耗快";
  if (level === "healthy" && trendStatus === "using") return "消耗中";
  if (level === "healthy" && trendStatus === "recovering") return "回升";
  if (level === "healthy") return "健康";
  return "等待";
}

function getSyncStatus(provider) {
  return provider.latest?.rateLimitsTrust?.status || "missing";
}

function getSyncLabel(provider) {
  return provider.latest?.rateLimitsTrust?.label || "等待";
}

function getUsageStatus(provider) {
  const syncStatus = getSyncStatus(provider);
  const trendStatus = getTrendStatus(provider);
  if (syncStatus !== "live") return getSyncLabel(provider);
  if (["fast", "using", "recovering"].includes(trendStatus)) return getTrendLabel(provider);
  return getSyncLabel(provider);
}

function getTrendStatus(provider) {
  return provider.latest?.capacityTrend?.status || "unknown";
}

function getTrendLabel(provider) {
  return provider.latest?.capacityTrend?.label || "观察";
}

function getForecastStatus(provider) {
  return provider.latest?.capacityTrend?.forecast?.status || "unknown";
}

function getForecastLabel(provider) {
  return provider.latest?.capacityTrend?.forecast?.label || "等待估算";
}

function getForecastShortLabel(provider) {
  return provider.latest?.capacityTrend?.forecast?.shortLabel || getTrendLabel(provider);
}

function getProviderSubline(provider) {
  const syncStatus = getSyncStatus(provider);
  if (syncStatus !== "live") return getSyncLabel(provider);
  return getForecastShortLabel(provider);
}

function getWorstLevel(...values) {
  const levels = values.map(getRemainingLevel);
  if (levels.includes("danger")) return "danger";
  if (levels.includes("caution")) return "caution";
  if (levels.includes("healthy")) return "healthy";
  return "unknown";
}

function getMetricColor(metricId, value) {
  if (value === null || value === undefined) return "rgba(255, 255, 255, 0.68)";
  const isWeek = metricId === "weekMetric";
  if (getRemainingLevel(value) === "danger") return isWeek ? "#ff9f6e" : "#ff7f9f";
  return isWeek ? "#8bd7ff" : "#ffd36f";
}

function getPulseSpeed(value) {
  if (value < 20) return 0.78;
  if (value < 45) return 1.15;
  return 2.15;
}

function formatResetCountdown(value) {
  if (!value) return "等数据";
  const ms = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(ms)) return "等数据";
  if (ms <= 0) return "重置中";

  const minutes = Math.ceil(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours <= 0) return `${mins}m`;
  if (hours < 10) return `${hours}h${String(mins).padStart(2, "0")}m`;
  return `${hours}h`;
}

function formatTokens(value) {
  const number = Number(value || 0);
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(2)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}k`;
  return String(Math.round(number));
}

function formatNullableTokens(value) {
  if (value === null || value === undefined || value === "") return "--";
  return formatTokens(value);
}

function formatBytes(value) {
  if (value === null || value === undefined || value === "") return "--";
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  if (number >= 1024 ** 3) return `${(number / 1024 ** 3).toFixed(1)}G`;
  if (number >= 1024 ** 2) return `${(number / 1024 ** 2).toFixed(0)}M`;
  return `${Math.round(number / 1024)}K`;
}
