function getQuotaDelight(signal = {}) {
  const status = signal.status || "missing";
  const remaining = clampPercent(numericOrNull(signal.lowestRemainingPercent));
  const freshness = signal.freshness || "unknown";
  const displayMode = signal.displayMode || "missing";

  if (status === "disabled") return state("asleep", "睡觉中", "已关闭", "muted", "none");
  if (status === "planned") return state("queued", "排队中", "预留接入", "muted", "none");
  if (status === "auth-expired") return state("login", "要登录", "刷新凭据", "danger", "attention", {
    attention: true
  });
  if (status === "missing") return state("waiting", "等开饭", "等待数据", "muted", "none");
  if (status === "suspect") return state("wobbly", "别急吃", "数据疑似", "danger", "attention", {
    attention: true
  });
  if (status === "delayed" || freshness === "stale") {
    return remaining === null
      ? state("lagging", "慢半拍", "数据延迟", "caution", "breathe", {
          attention: true
        })
      : delayedStateByRemaining(remaining, { estimated: status === "estimated" });
  }
  if (status === "estimated") {
    return remaining === null
      ? state("counting", "小算盘", "估算中", "estimate", "none")
      : stateByRemaining(remaining, { estimated: true });
  }

  if (remaining !== null) return stateByRemaining(remaining, { estimated: false });
  if (displayMode === "usage") return state("snacking", "有在吃", "已有用量", "steady", "none");
  return state("watching", "观察中", "等待余量", "muted", "none");
}

function stateByRemaining(remaining, { estimated }) {
  if (remaining < 10) {
    return state("empty", "快见底", "余量紧急", "danger", "attention", {
      attention: true,
      estimated
    });
  }
  if (remaining < 20) {
    return state("low", "省着点", "余量告急", "danger", "attention", {
      attention: true,
      estimated
    });
  }
  if (remaining < 45) {
    return state("tight", "省着吃", "余量偏紧", "caution", "breathe", {
      estimated
    });
  }
  if (remaining < 75) {
    return state("steady", "刚刚好", "余量稳定", "steady", "none", {
      estimated
    });
  }
  return state("comfy", "放心吃", "余量充足", "comfy", "soft", {
    estimated
  });
}

function delayedStateByRemaining(remaining, { estimated }) {
  if (remaining < 20) return stateByRemaining(remaining, { estimated });
  const mood = remaining < 45
    ? "tight"
    : remaining < 75
      ? "steady"
      : "comfy";
  return state(mood, "慢半拍", "数据延迟", "caution", "breathe", {
    attention: true,
    estimated
  });
}

function state(mood, shortLabel, label, tone, motion, options = {}) {
  const attention = Boolean(options.attention);
  const estimated = Boolean(options.estimated);
  const cue = getCue(mood, tone, motion, attention);
  return {
    id: mood,
    mood,
    shortLabel,
    label,
    tone,
    motion,
    severity: getSeverity(tone, attention),
    priority: getPriority(tone, attention),
    attention,
    alert: attention,
    cue,
    a11yLabel: `${label}：${shortLabel}`,
    estimated
  };
}

function getCue(mood, tone, motion, attention) {
  const cue = CUES[mood] || CUES.watching;
  return {
    ...cue,
    tone,
    motion,
    attention,
    reducedMotion: "static"
  };
}

function getSeverity(tone, attention) {
  if (tone === "danger") return attention ? "critical" : "danger";
  if (tone === "caution") return attention ? "watch" : "caution";
  if (tone === "estimate") return "info";
  return "normal";
}

function getPriority(tone, attention) {
  if (tone === "danger") return attention ? 3 : 2;
  if (tone === "caution") return attention ? 2 : 1;
  return 0;
}

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampPercent(value) {
  if (value === null) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

const CUES = {
  asleep: {
    icon: "moon",
    mascot: "nap",
    chart: "quiet"
  },
  queued: {
    icon: "queue",
    mascot: "waiting",
    chart: "quiet"
  },
  login: {
    icon: "key",
    mascot: "locked",
    chart: "alert"
  },
  waiting: {
    icon: "bowl",
    mascot: "peek",
    chart: "quiet"
  },
  wobbly: {
    icon: "warning",
    mascot: "wobble",
    chart: "alert"
  },
  lagging: {
    icon: "clock",
    mascot: "blink",
    chart: "breathe"
  },
  counting: {
    icon: "abacus",
    mascot: "counting",
    chart: "quiet"
  },
  empty: {
    icon: "empty-bowl",
    mascot: "panic",
    chart: "alert"
  },
  low: {
    icon: "warning",
    mascot: "small-bites",
    chart: "alert"
  },
  tight: {
    icon: "gauge",
    mascot: "careful",
    chart: "breathe"
  },
  steady: {
    icon: "check",
    mascot: "sip",
    chart: "steady"
  },
  comfy: {
    icon: "spark",
    mascot: "stretch",
    chart: "soft"
  },
  snacking: {
    icon: "dot",
    mascot: "snack",
    chart: "steady"
  },
  watching: {
    icon: "eye",
    mascot: "watch",
    chart: "quiet"
  }
};

module.exports = {
  getQuotaDelight
};
