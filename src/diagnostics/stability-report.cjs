const { summarizeProviderHealth } = require("../protocol/provider-health.cjs");

function buildStabilityReport(snapshot = {}, { endpoint } = {}) {
  const health = snapshot.providerHealth || summarizeProviderHealth(snapshot);
  const findings = [
    ...snapshotShapeFindings(snapshot),
    ...systemFindings(snapshot.system),
    ...ingestFindings(health.ingest || snapshot.ingest),
    ...providerFindings(health),
    ...settingsFindings(snapshot.settings)
  ];

  return {
    ok: true,
    endpoint,
    collectedAt: snapshot.collectedAt || health.collectedAt || null,
    summary: summarizeFindings(findings),
    system: compactSystem(snapshot.system),
    ingest: health.ingest || null,
    providerHealth: {
      summary: health.summary || null,
      providers: compactProviders(health.providers || [])
    },
    findings
  };
}

function snapshotShapeFindings(snapshot) {
  const hasDesktopShape = Boolean(snapshot.system || snapshot.settings || snapshot.bridges || snapshot.totals);
  const hasIngestRootShape = "port" in snapshot || "listening" in snapshot || "eventCount" in snapshot || "overlayCount" in snapshot;
  if (hasDesktopShape || !hasIngestRootShape) return [];

  return [
    finding("warning", "partial-snapshot", "Local API is serving an ingest-only snapshot; restart the desktop app or check for a stale instance on this port.", {
      port: snapshot.port || null,
      providerCount: Array.isArray(snapshot.providers) ? snapshot.providers.length : null,
      hasSystem: Boolean(snapshot.system),
      hasSettings: Boolean(snapshot.settings)
    })
  ];
}

function systemFindings(system) {
  if (!system) {
    return [finding("warning", "system-missing", "System metrics are missing from /snapshot.")];
  }

  const findings = [];
  const cpu = numberOrNull(system.cpu?.percent);
  const memoryUsed = numberOrNull(system.memory?.usedPercent);
  const memoryFree = numberOrNull(system.memory?.freePercent);
  const rssMb = bytesToMb(system.process?.rssBytes);

  if (cpu !== null && cpu >= 88) {
    findings.push(finding("critical", "cpu-critical", `CPU is very high at ${cpu}%.`, { cpuPercent: cpu }));
  } else if (cpu !== null && cpu >= 70) {
    findings.push(finding("warning", "cpu-high", `CPU is high at ${cpu}%.`, { cpuPercent: cpu }));
  }

  if (memoryUsed !== null && memoryUsed >= 90) {
    findings.push(finding("critical", "memory-critical", `System memory usage is very high at ${memoryUsed}%.`, { memoryUsedPercent: memoryUsed }));
  } else if (memoryUsed !== null && memoryUsed >= 78) {
    findings.push(finding("warning", "memory-high", `System memory usage is high at ${memoryUsed}%.`, { memoryUsedPercent: memoryUsed }));
  }

  if (memoryFree !== null && memoryFree <= 10) {
    findings.push(finding("critical", "memory-free-critical", `Available memory is low at ${memoryFree}%.`, { memoryFreePercent: memoryFree }));
  } else if (memoryFree !== null && memoryFree <= 20) {
    findings.push(finding("warning", "memory-free-low", `Available memory is getting low at ${memoryFree}%.`, { memoryFreePercent: memoryFree }));
  }

  if (rssMb !== null && rssMb >= 450) {
    findings.push(finding("warning", "app-rss-high", `App RSS is above the packaged smoke budget at ${rssMb} MB.`, { rssMb }));
  }

  if (findings.length === 0) {
    findings.push(finding("info", "system-quiet", "CPU, memory, and app RSS are within the lightweight budget."));
  }

  return findings;
}

function ingestFindings(ingest) {
  if (!ingest) return [finding("warning", "ingest-missing", "Local ingest summary is missing.")];
  const findings = [];
  if (ingest.listening === false) {
    findings.push(finding("critical", "ingest-not-listening", "Local ingest API is not listening.", { port: ingest.port || null }));
  }
  if (ingest.error) {
    findings.push(finding("critical", "ingest-error", `Local ingest API reports an error: ${ingest.error}`, { error: ingest.error }));
  }
  if (Number(ingest.overlayCount || 0) > 0) {
    findings.push(finding("info", "overlays-active", `${ingest.overlayCount} short-lived HUD overlay hints are active.`, { overlayCount: ingest.overlayCount }));
  }
  if (findings.length === 0) {
    findings.push(finding("info", "ingest-healthy", "Local ingest API is listening with no reported error."));
  }
  return findings;
}

function providerFindings(health) {
  const summary = health.summary || {};
  const findings = [];
  const attention = numberOrNull(summary.attention) || 0;
  const delayed = numberOrNull(summary.delayed) || 0;
  const missing = numberOrNull(summary.missing) || 0;
  const estimated = numberOrNull(summary.estimated) || 0;

  if (attention > 0) {
    findings.push(finding("warning", "provider-attention", `${attention} provider(s) need attention.`, { attention }));
  }
  if (delayed > 0) {
    findings.push(finding("warning", "provider-delayed", `${delayed} provider(s) have delayed or suspect quota data.`, { delayed }));
  }
  if (missing > 0) {
    findings.push(finding("warning", "provider-missing", `${missing} provider(s) are missing or need login.`, { missing }));
  }
  if (estimated > 0) {
    findings.push(finding("info", "provider-estimated", `${estimated} provider(s) are using estimated quota data.`, { estimated }));
  }

  for (const provider of health.providers || []) {
    if (provider.freshness === "stale") {
      findings.push(finding("warning", "provider-stale", `${provider.name || provider.id} data is stale.`, {
        provider: provider.id,
        dataAgeMs: provider.dataAgeMs
      }));
    }
  }

  if (findings.length === 0) {
    findings.push(finding("info", "providers-healthy", "Provider health has no attention, delayed, missing, or stale entries."));
  }

  return findings;
}

function settingsFindings(settings) {
  if (!settings) return [];
  const findings = [];
  const refreshMs = numberOrNull(settings.behavior?.refreshMs);
  const activeWindowMs = numberOrNull(settings.behavior?.activeWindowMs);
  if (refreshMs !== null && refreshMs < 5000) {
    findings.push(finding("warning", "refresh-too-fast", `Provider refresh is below the low-memory floor at ${refreshMs}ms.`, { refreshMs }));
  }
  if (activeWindowMs !== null && activeWindowMs < 3000) {
    findings.push(finding("warning", "active-window-too-fast", `Active-window refresh is below the low-memory floor at ${activeWindowMs}ms.`, { activeWindowMs }));
  }
  if (settings.behavior?.debugHud === true) {
    findings.push(finding("warning", "debug-hud-enabled", "Debug HUD logging is enabled; leave it off outside short diagnostics."));
  }
  return findings;
}

function compactSystem(system) {
  if (!system) return null;
  return {
    collectedAt: system.collectedAt || null,
    cpuPercent: numberOrNull(system.cpu?.percent),
    cpuCores: numberOrNull(system.cpu?.cores),
    memoryUsedPercent: numberOrNull(system.memory?.usedPercent),
    memoryFreePercent: numberOrNull(system.memory?.freePercent),
    memoryFreeMb: bytesToMb(system.memory?.freeBytes),
    memoryTotalMb: bytesToMb(system.memory?.totalBytes),
    appRssMb: bytesToMb(system.process?.rssBytes),
    appHeapUsedMb: bytesToMb(system.process?.heapUsedBytes),
    uptimeSeconds: numberOrNull(system.uptimeSeconds)
  };
}

function compactProviders(providers) {
  return providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    status: provider.status,
    displayMode: provider.displayMode,
    freshness: provider.freshness,
    lowestRemainingPercent: provider.lowestRemainingPercent,
    delight: provider.delight?.shortLabel || null
  }));
}

function summarizeFindings(findings) {
  return {
    total: findings.length,
    critical: findings.filter((item) => item.severity === "critical").length,
    warning: findings.filter((item) => item.severity === "warning").length,
    info: findings.filter((item) => item.severity === "info").length
  };
}

function formatStabilityReport(report) {
  const lines = [];
  lines.push("Who Eats Token stability report");
  lines.push(`Endpoint: ${report.endpoint}`);
  if (report.collectedAt) lines.push(`Collected: ${report.collectedAt}`);
  const system = report.system;
  if (system) {
    lines.push(`System: CPU ${formatPercent(system.cpuPercent)} · memory ${formatPercent(system.memoryUsedPercent)} used · app RSS ${formatMb(system.appRssMb)}`);
  } else {
    lines.push("System: unavailable");
  }
  const summary = report.providerHealth.summary || {};
  lines.push(`Providers: live ${summary.live || 0}, delayed ${summary.delayed || 0}, estimated ${summary.estimated || 0}, missing ${summary.missing || 0}, attention ${summary.attention || 0}`);
  lines.push(`Findings: critical ${report.summary.critical}, warning ${report.summary.warning}, info ${report.summary.info}`);
  lines.push("");

  for (const item of report.findings) {
    lines.push(`- [${item.severity}] ${item.id}: ${item.message}`);
  }

  return lines.join("\n");
}

function finding(severity, id, message, evidence = {}) {
  return {
    severity,
    id,
    message,
    evidence
  };
}

function shouldFail(report, failOn) {
  if (failOn === "none") return false;
  if (failOn === "critical") return report.summary.critical > 0;
  if (failOn === "warning") return report.summary.critical > 0 || report.summary.warning > 0;
  return false;
}

function bytesToMb(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number / 1024 / 1024);
}

function formatPercent(value) {
  return value === null || value === undefined ? "--" : `${value}%`;
}

function formatMb(value) {
  return value === null || value === undefined ? "--" : `${value} MB`;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

module.exports = {
  buildStabilityReport,
  bytesToMb,
  formatStabilityReport,
  numberOrNull,
  shouldFail,
  summarizeFindings
};
