const els = {
  toolName: document.getElementById("toolName"),
  hudFiveLabelText: document.getElementById("hudFiveLabelText"),
  hudFiveMetric: document.getElementById("hudFiveMetric"),
  hudFiveHour: document.getElementById("hudFiveHour"),
  hudWeekLabelText: document.getElementById("hudWeekLabelText"),
  hudWeekMetric: document.getElementById("hudWeekMetric"),
  hudWeek: document.getElementById("hudWeek"),
  hudChart: document.getElementById("hudChart"),
  hudFiveCaption: document.getElementById("hudFiveCaption"),
  hudWeekCaption: document.getElementById("hudWeekCaption"),
  hudPill: document.getElementById("hudPill"),
  hudMeta: document.getElementById("hudMeta")
};

window.tokenBar.onHudUpdate(renderHud);
window.tokenBar.onSettingsUpdate(applyVisualSettings);
window.tokenBar.getHudSnapshot().then(renderHud);
window.tokenBar.getSettings().then(applyVisualSettings);

function renderHud(payload) {
  if (!payload || !payload.visible) return;

  const provider = payload.provider;
  const delight = provider?.delight || null;
  els.toolName.textContent = payload.tool?.name || "LLM";
  document.body.dataset.delightMood = delight?.mood || "watching";
  document.body.dataset.delightTone = delight?.tone || "muted";
  document.body.dataset.motion = delight?.motion || "none";
  renderHudMetrics(provider);
  renderHudChart(provider);
  renderHudPill(provider);
  els.hudMeta.textContent = getHudMeta(provider);
}

function applyVisualSettings(settings) {
  if (!settings?.appearance) return;
  const root = document.documentElement;
  root.style.setProperty("--glass-opacity", settings.appearance.glassOpacity);
  root.style.setProperty("--glass-blur", `${settings.appearance.glassBlur}px`);
  root.style.setProperty("--font-scale", settings.appearance.fontScale);
}

function renderMetric(metric, valueElement, value) {
  valueElement.textContent = formatPercent(value);
  metric.dataset.level = getRemainingLevel(value);
  metric.style.setProperty("--metric-color", getMetricColor(metric.id, value));
}

function renderTokenMetric(metric, valueElement, value, referenceRemaining = null) {
  valueElement.textContent = value === null || value === undefined ? "--" : formatTokens(value);
  metric.dataset.level = getRemainingLevel(referenceRemaining);
  metric.style.setProperty("--metric-color", getMetricColor(metric.id, referenceRemaining));
}

function renderHudMetrics(provider) {
  const mode = provider?.displayMode || "waiting";
  if (mode === "token-plan") {
    setHudLabels("总余量", "已用", "left", "used");
    renderMetric(els.hudFiveMetric, els.hudFiveHour, provider?.tokenPlanRemaining);
    renderCreditMetric(els.hudWeekMetric, els.hudWeek, provider?.tokenPlanUsedCredits, provider?.tokenPlanRemaining);
    return;
  }

  if (mode === "context") {
    setHudLabels("上下文", "今日", "ctx", "day");
    renderMetric(els.hudFiveMetric, els.hudFiveHour, provider?.contextRemaining);
    renderTokenMetric(els.hudWeekMetric, els.hudWeek, provider?.todayTokens, provider?.contextRemaining);
    return;
  }

  if (mode === "usage") {
    setHudLabels("近1h", "今日", "1h", "day");
    renderTokenMetric(els.hudFiveMetric, els.hudFiveHour, provider?.recentTokens);
    renderTokenMetric(els.hudWeekMetric, els.hudWeek, provider?.todayTokens);
    return;
  }

  setHudLabels("5小时", "一周", "5h", "7d");
  renderMetric(els.hudFiveMetric, els.hudFiveHour, provider?.fiveHourRemaining);
  renderMetric(els.hudWeekMetric, els.hudWeek, provider?.weekRemaining);
}

function renderCreditMetric(metric, valueElement, value, referenceRemaining = null) {
  valueElement.textContent = value === null || value === undefined ? "--" : formatCredits(value);
  metric.dataset.level = getRemainingLevel(referenceRemaining);
  metric.style.setProperty("--metric-color", getMetricColor(metric.id, referenceRemaining));
}

function setHudLabels(first, second, firstCaption, secondCaption) {
  els.hudFiveLabelText.textContent = first;
  els.hudWeekLabelText.textContent = second;
  els.hudFiveCaption.textContent = firstCaption;
  els.hudWeekCaption.textContent = secondCaption;
}

function renderHudChart(provider) {
  if (!els.hudChart) return;
  const mode = provider?.displayMode || "waiting";
  const five = mode === "token-plan"
    ? provider?.tokenPlanRemaining ?? 0
    : mode === "context"
      ? provider?.contextRemaining ?? 0
      : provider?.fiveHourRemaining ?? 0;
  const week = mode === "token-plan"
    ? provider?.tokenPlanUsedPercent ?? 0
    : mode === "context"
      ? getContextTodayFill(provider)
      : provider?.weekRemaining ?? 0;
  const lowest = mode === "token-plan"
    ? provider?.tokenPlanRemaining ?? 100
    : mode === "context"
    ? provider?.contextRemaining ?? 100
    : Math.min(
        provider?.fiveHourRemaining ?? 100,
        provider?.weekRemaining ?? 100
      );
  els.hudChart.style.setProperty("--five-fill", `${clamp(five, 0, 100)}%`);
  els.hudChart.style.setProperty("--week-fill", `${clamp(week, 0, 100)}%`);
  els.hudChart.style.setProperty("--pulse-speed", `${getPulseSpeed(lowest)}s`);
  els.hudChart.dataset.level = mode === "token-plan"
    ? getRemainingLevel(provider?.tokenPlanRemaining)
    : mode === "context"
      ? getRemainingLevel(provider?.contextRemaining)
      : getWorstLevel(provider?.fiveHourRemaining, provider?.weekRemaining);
}

function renderHudPill(provider) {
  const level = provider?.displayMode === "token-plan"
    ? getRemainingLevel(provider?.tokenPlanRemaining)
    : provider?.displayMode === "context"
      ? getRemainingLevel(provider?.contextRemaining)
      : getWorstLevel(provider?.fiveHourRemaining, provider?.weekRemaining);
  els.hudPill.dataset.level = level;
  els.hudPill.dataset.sync = provider?.syncStatus || "missing";
  els.hudPill.dataset.trend = provider?.trendStatus || "unknown";
  els.hudPill.dataset.forecast = provider?.capacityTrend?.forecast?.status || "unknown";
  els.hudPill.dataset.delightMood = provider?.delight?.mood || "watching";
  els.hudPill.dataset.delightTone = provider?.delight?.tone || "muted";
  els.hudPill.dataset.motion = provider?.delight?.motion || "none";
  if (level === "danger") {
    els.hudPill.textContent = provider?.delight?.shortLabel || "告警";
  } else if (level === "caution") {
    els.hudPill.textContent = provider?.delight?.shortLabel || "偏紧";
  } else if (provider?.displayMode === "token-plan") {
    els.hudPill.textContent = provider?.delight?.shortLabel || "Token Plan";
  } else if (provider?.displayMode === "context") {
    els.hudPill.textContent = provider?.delight?.shortLabel || "上下文";
  } else if (provider?.syncStatus && provider.syncStatus !== "live") {
    els.hudPill.textContent = provider?.delight?.shortLabel || provider.syncLabel || "等待";
  } else {
    els.hudPill.textContent = provider?.delight?.shortLabel || provider?.trendLabel || "观察";
  }
}

function getForecastLabel(provider) {
  if (provider?.syncStatus && provider.syncStatus !== "live") return provider.syncLabel || "等待同步";
  return provider?.capacityTrend?.forecast?.label || provider?.trendLabel || "观察";
}

function getHudMeta(provider) {
  if (!provider) return "等待接入";
  const delightPrefix = provider.delight?.label ? `${provider.delight.label} · ` : "";
  if (provider.displayMode === "token-plan") {
    const source = provider.tokenPlanSource === "xiaomi-platform"
      ? "平台实时"
      : provider.tokenPlanSnapshotAt
        ? "截图校准"
        : "本地估算";
    const validUntil = formatDate(provider.tokenPlanValidUntil);
    return `${delightPrefix}${formatCredits(provider.tokenPlanUsedCredits)} / ${formatCredits(provider.tokenPlanTotalCredits)} Credits · ${source}${validUntil}`;
  }
  if (provider.displayMode === "context") {
    const source = provider.contextSource === "message-estimate" ? "估算" : "本地同步";
    return `${delightPrefix}已用 ${formatTokens(provider.contextUsedTokens)} / ${formatTokens(provider.contextLimitTokens)} · ${source}`;
  }
  if (provider.displayMode === "usage") {
    return `${delightPrefix}近1h ${formatTokens(provider.recentTokens)} · 今日 ${formatTokens(provider.todayTokens)} · 等待限额`;
  }
  return `${delightPrefix}${formatTokens(provider.recentTokens)} / 1h · ${getForecastLabel(provider)}${formatReset(provider.fiveHourResetsAt)}`;
}

function getContextTodayFill(provider) {
  const today = Number(provider?.todayTokens || 0);
  const limit = Number(provider?.contextLimitTokens || 0);
  if (!limit) return 0;
  return (today / limit) * 100;
}

function formatPercent(value) {
  return value === null || value === undefined ? "--" : `${value}%`;
}

function formatTokens(value) {
  const number = Number(value || 0);
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(2)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}k`;
  return String(Math.round(number));
}

function formatCredits(value) {
  const number = Number(value || 0);
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(2)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}k`;
  return String(Math.round(number));
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

function getWorstLevel(...values) {
  const levels = values.map(getRemainingLevel);
  if (levels.includes("danger")) return "danger";
  if (levels.includes("caution")) return "caution";
  if (levels.includes("healthy")) return "healthy";
  return "unknown";
}

function getMetricColor(metricId, value) {
  if (value === null || value === undefined) return "rgba(255, 255, 255, 0.68)";
  const isWeek = metricId === "hudWeekMetric";
  if (getRemainingLevel(value) === "danger") return isWeek ? "#ff9f6e" : "#ff7f9f";
  return isWeek ? "#8bd7ff" : "#ffd36f";
}

function getPulseSpeed(value) {
  if (value < 20) return 0.78;
  if (value < 45) return 1.15;
  return 2.15;
}

function formatReset(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return ` · ${date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return ` · ${date.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric"
  })}`;
}
