(function attachQuotaViewModelShared() {
  const root = window.TokenBarShared || {};
  const format = root.format || {};

  function getCapacityStandardRemaining(fiveHourRemaining, weekRemaining) {
    return fiveHourRemaining ?? weekRemaining ?? null;
  }

  function getWindowRemaining(windowValue) {
    if (!windowValue) return null;
    const usedPercent = Number(windowValue.usedPercent);
    if (!Number.isFinite(usedPercent)) return 0;
    return Math.max(0, Math.min(100, 100 - Math.round(usedPercent)));
  }

  function getRemainingLevel(value) {
    return format.getRemainingLevel
      ? format.getRemainingLevel(value)
      : value === null || value === undefined
        ? "unknown"
        : value < 20
          ? "danger"
          : value < 45
            ? "caution"
            : "healthy";
  }

  function getWorstLevel(...values) {
    const levels = values.map(getRemainingLevel);
    if (levels.includes("danger")) return "danger";
    if (levels.includes("caution")) return "caution";
    if (levels.includes("healthy")) return "healthy";
    return "unknown";
  }

  function getMetricColor(metricId, value, weekMetricId) {
    if (value === null || value === undefined) return "rgba(255, 255, 255, 0.68)";
    const isWeek = metricId === weekMetricId;
    if (getRemainingLevel(value) === "danger") return isWeek ? "#ff9f6e" : "#ff7f9f";
    return isWeek ? "#8bd7ff" : "#ffd36f";
  }

  function getPulseSpeed(value) {
    if (value < 20) return 0.78;
    if (value < 45) return 1.15;
    return 2.15;
  }

  window.TokenBarShared = {
    ...root,
    quotaViewModel: {
      ...(root.quotaViewModel || {}),
      getCapacityStandardRemaining,
      getMetricColor,
      getPulseSpeed,
      getRemainingLevel,
      getWindowRemaining,
      getWorstLevel
    }
  };
})();
