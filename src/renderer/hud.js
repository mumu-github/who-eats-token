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
  hudPlan: document.getElementById("hudPlan"),
  hudTrust: document.getElementById("hudTrust"),
  hudMascot: document.getElementById("hudMascot"),
  hudPredict: document.getElementById("hudPredict"),
  hudMeta: document.getElementById("hudMeta")
};

window.tokenBar.onHudUpdate(renderHud);
window.tokenBar.onSettingsUpdate(applyVisualSettings);
window.tokenBar.getHudSnapshot().then(renderHud);
window.tokenBar.getSettings().then(applyVisualSettings);

els.hudMascot?.addEventListener("pointerdown", () => {
  if (els.hudMascot.dataset.delightMood !== "login") return;
  triggerKeyholeHint(els.hudMascot);
});

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
  renderHudPills(provider);
  renderHudMascot(provider);
  els.hudPredict.textContent = getPredictLabel(provider);
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

function renderHudPills(provider) {
  const level = provider?.displayMode === "token-plan"
    ? getRemainingLevel(provider?.tokenPlanRemaining)
    : provider?.displayMode === "context"
      ? getRemainingLevel(provider?.contextRemaining)
      : getWorstLevel(provider?.fiveHourRemaining, provider?.weekRemaining);
  const trust = getTrustInfo(provider);
  setPillState(els.hudPlan, provider, level);
  setPillState(els.hudTrust, provider, level);
  els.hudPlan.textContent = getPlanLabel(provider);
  els.hudTrust.textContent = trust.label;
  els.hudTrust.dataset.trust = trust.level;
  els.hudTrust.title = formatTrustTitle(trust);
}

function setPillState(element, provider, level) {
  element.dataset.level = level;
  element.dataset.sync = provider?.syncStatus || "missing";
  element.dataset.trend = provider?.trendStatus || "unknown";
  element.dataset.forecast = provider?.capacityTrend?.forecast?.status || "unknown";
  element.dataset.delightMood = provider?.delight?.mood || "watching";
  element.dataset.delightTone = provider?.delight?.tone || "muted";
  element.dataset.motion = provider?.delight?.motion || "none";
}

function getPlanLabel(provider) {
  if (provider?.displayMode === "token-plan") return provider.tokenPlanPlanName || "Token Plan";
  if (provider?.displayMode === "context") return "上下文";
  if (provider?.displayMode === "usage") return "用量";
  if (provider?.syncStatus && provider.syncStatus !== "live") return provider.syncLabel || "等待";
  return provider?.delight?.shortLabel || provider?.trendLabel || "余量";
}

function renderHudMascot(provider) {
  if (!els.hudMascot) return;
  const remaining = provider?.displayMode === "token-plan"
    ? provider?.tokenPlanRemaining
    : provider?.displayMode === "context"
      ? provider?.contextRemaining
      : Math.min(provider?.fiveHourRemaining ?? 100, provider?.weekRemaining ?? 100);
  els.hudMascot.dataset.level = getRemainingLevel(remaining);
  els.hudMascot.dataset.delightMood = provider?.delight?.mood || "watching";
  els.hudMascot.dataset.mascot = provider?.delight?.cue?.mascot || "watch";
  els.hudMascot.title = provider?.delight?.mood === "login"
    ? "要登录：点击顶部条小人会出现钥匙孔提示"
    : provider?.delight?.a11yLabel || "";
  if (provider?.delight?.mood !== "login") {
    delete els.hudMascot.dataset.keyhole;
  }
}

function triggerKeyholeHint(element) {
  if (!element) return;
  element.dataset.keyhole = "on";
  clearTimeout(element._keyholeTimer);
  element._keyholeTimer = setTimeout(() => {
    delete element.dataset.keyhole;
  }, 1100);
}

function getPredictLabel(provider) {
  if (!provider) return "等待接入";
  if (provider.syncStatus && provider.syncStatus !== "live") return provider.syncLabel || "等待同步";
  if (provider.displayMode === "token-plan") {
    const remainingCredits = Number(provider.tokenPlanRemainingCredits || 0);
    const recentCredits = Number(provider.tokenPlanRecentCredits || 0) || Number(provider.recentTokens || 0);
    const rounds = estimateRounds(remainingCredits, recentCredits);
    return rounds ? `还能跑约 ${rounds} 轮` : "轻量对话更稳";
  }
  const remaining = provider.displayMode === "context"
    ? provider.contextRemaining
    : Math.min(provider.fiveHourRemaining ?? 100, provider.weekRemaining ?? 100);
  if (remaining < 20) return "建议等重置更稳";
  if (remaining < 45) return "还能轻量推进";
  return provider.capacityTrend?.forecast?.label || "可以继续工作";
}

function getForecastLabel(provider) {
  if (provider?.syncStatus && provider.syncStatus !== "live") return provider.syncLabel || "等待同步";
  return provider?.capacityTrend?.forecast?.label || provider?.trendLabel || "观察";
}

function getHudMeta(provider) {
  if (!provider) return "等待接入";
  if (provider.displayMode === "token-plan") {
    const source = provider.tokenPlanSource === "xiaomi-platform"
      ? "平台实时"
      : provider.tokenPlanSnapshotAt
        ? "截图校准"
        : "本地估算";
    const validUntil = formatDate(provider.tokenPlanValidUntil);
    const age = provider.trust?.ageMs !== null && provider.trust?.ageMs !== undefined
      ? ` · 更新 ${formatAge(provider.trust.ageMs)}`
      : "";
    return `${formatCredits(provider.tokenPlanUsedCredits)} / ${formatCredits(provider.tokenPlanTotalCredits)} · ${source}${age}${validUntil}`;
  }
  if (provider.displayMode === "context") {
    const source = provider.contextSource === "message-estimate" ? "估算" : "本地同步";
    return `已用 ${formatTokens(provider.contextUsedTokens)} / ${formatTokens(provider.contextLimitTokens)} · ${source}`;
  }
  if (provider.displayMode === "usage") {
    return `近1h ${formatTokens(provider.recentTokens)} · 今日 ${formatTokens(provider.todayTokens)} · 等待限额`;
  }
  return `${formatTokens(provider.recentTokens)} / 1h · ${getForecastLabel(provider)}${formatReset(provider.fiveHourResetsAt)}`;
}

function getTrustInfo(provider) {
  const trust = provider?.trust || provider?.health?.trust;
  if (trust) return trust;
  if (provider?.displayMode === "token-plan" && provider.tokenPlanSource && provider.tokenPlanSource !== "local-estimate") {
    return {
      level: "exact-provider",
      label: "精确",
      sourceLabel: provider.tokenPlanSource,
      explain: "来自 provider plan usage API。"
    };
  }
  if (provider?.syncStatus === "live") {
    return {
      level: provider.displayMode === "token-plan" && provider.tokenPlanSource && provider.tokenPlanSource !== "local-estimate"
        ? "exact-provider"
        : "exact-local",
      label: provider.displayMode === "token-plan" ? "精确" : "本地精确",
      sourceLabel: provider.tokenPlanSource || provider.id,
      explain: "来自本地或 provider 明确用量信号。"
    };
  }
  return {
    level: provider?.syncStatus || "missing",
    label: provider?.syncLabel || "等待",
    sourceLabel: provider?.id || "unknown",
    explain: "等待 provider 数据。"
  };
}

function formatTrustTitle(trust) {
  return [
    `数据可信度：${trust.label}`,
    `来源：${trust.sourceLabel || "--"}`,
    trust.ageMs !== null && trust.ageMs !== undefined ? `更新：${formatAge(trust.ageMs)}` : null,
    `级别：${trust.level || "--"}`,
    trust.explain || null
  ].filter(Boolean).join("\n");
}

function estimateRounds(remaining, recent) {
  if (!remaining || !recent) return "";
  const base = Math.max(1, recent);
  const estimate = Math.floor(remaining / base);
  if (estimate <= 0) return "";
  if (estimate <= 2) return "1-2";
  if (estimate <= 5) return "3-5";
  return "5+";
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

function formatAge(ageMs) {
  const seconds = Math.round(Number(ageMs) / 1000);
  if (!Number.isFinite(seconds)) return "--";
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  return `${Math.round(minutes / 60)} 小时前`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return ` · ${date.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric"
  })} 到期`;
}
