(function attachTrustPopoverShared() {
  const root = window.TokenBarShared || {};
  const format = root.format || {};

  function formatTrustTitle(trust, options = {}) {
    if (!trust) return options.empty || "等待数据可信度";
    const age = format.formatAge ? format.formatAge(trust.ageMs, { empty: "" }) : "";
    return [
      `数据可信度：${trust.label}`,
      `来源：${trust.sourceLabel || "--"}`,
      age ? `更新：${age}` : null,
      `级别：${trust.level || "--"}`,
      trust.explain || null
    ].filter(Boolean).join("\n");
  }

  function buildTrustPopoverDetails({
    trust,
    source,
    age,
    freshness,
    unit,
    quotaBasis,
    refreshStrategy,
    explainFallback = "来自本地或 provider 明确用量信号。"
  }) {
    return {
      status: trust?.label || "等待",
      level: trust?.level || "missing",
      rows: [
        { label: "来源", value: source || "--" },
        { label: "更新时间", value: age || "--" },
        { label: "新鲜度", value: freshness || "unknown" },
        { label: "单位", value: unit || "Tokens" },
        { label: "判定口径", value: quotaBasis || "等待可用余量口径" },
        { label: "刷新策略", value: refreshStrategy || "等待同步" }
      ],
      privacy: "未读取 prompt / completion / API key",
      explain: trust?.explain || explainFallback,
      action: "了解更多数据口径"
    };
  }

  window.TokenBarShared = {
    ...root,
    trustPopover: {
      ...(root.trustPopover || {}),
      buildTrustPopoverDetails,
      formatTrustTitle
    }
  };
})();
