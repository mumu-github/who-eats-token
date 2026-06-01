(function attachFormatShared() {
  const root = window.TokenBarShared || {};

  function formatPercent(value) {
    return value === null || value === undefined ? "--" : `${value}%`;
  }

  function formatCompactNumber(value) {
    const number = Number(value || 0);
    if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(2)}M`;
    if (number >= 1_000) return `${(number / 1_000).toFixed(1)}k`;
    return String(Math.round(number));
  }

  function formatNullableCompactNumber(value) {
    if (value === null || value === undefined || value === "") return "--";
    return formatCompactNumber(value);
  }

  function formatBytes(value) {
    if (value === null || value === undefined || value === "") return "--";
    const number = Number(value);
    if (!Number.isFinite(number)) return "--";
    if (number >= 1024 ** 3) return `${(number / 1024 ** 3).toFixed(1)}G`;
    if (number >= 1024 ** 2) return `${(number / 1024 ** 2).toFixed(0)}M`;
    return `${Math.round(number / 1024)}K`;
  }

  function formatAge(ageMs, options = {}) {
    const empty = options.empty ?? "";
    if (ageMs === null || ageMs === undefined) return empty;
    const seconds = Math.round(Number(ageMs) / 1000);
    if (!Number.isFinite(seconds)) return empty;
    if (seconds < 60) return `${seconds} 秒前`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} 分钟前`;
    return `${Math.round(minutes / 60)} 小时前`;
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

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getRemainingLevel(value) {
    if (value === null || value === undefined) return "unknown";
    if (value < 20) return "danger";
    if (value < 45) return "caution";
    return "healthy";
  }

  window.TokenBarShared = {
    ...root,
    format: {
      ...(root.format || {}),
      clamp,
      formatAge,
      formatBytes,
      formatClock,
      formatCompactNumber,
      formatNullableCompactNumber,
      formatPercent,
      getRemainingLevel
    }
  };
})();
