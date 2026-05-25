const os = require("node:os");
const { buildStabilityReport } = require("./stability-report.cjs");

const SCHEMA = "who-eats-token.diagnostics.v1";

function buildDiagnosticsBundle(snapshot = {}, options = {}) {
  const stability = buildStabilityReport(snapshot, {
    endpoint: options.endpoint
  });
  const generatedAt = options.generatedAt || new Date().toISOString();

  return {
    ok: true,
    schema: SCHEMA,
    generatedAt,
    package: compactPackage(options.packageInfo),
    runtime: compactRuntime(options.runtime),
    endpoint: options.endpoint,
    collectedAt: stability.collectedAt,
    status: {
      providerSummary: stability.providerHealth.summary || null,
      providers: stability.providerHealth.providers || []
    },
    stability: {
      summary: stability.summary,
      system: stability.system,
      ingest: stability.ingest,
      findings: stability.findings
    },
    configuration: compactConfiguration(snapshot.settings),
    privacy: {
      redacted: true,
      excludes: [
        "api keys",
        "cookies",
        "local access tokens",
        "prompts",
        "completions",
        "chat logs",
        "raw databases",
        "local file paths"
      ]
    }
  };
}

function buildUnavailableBundle(error, options = {}) {
  return {
    ok: false,
    schema: SCHEMA,
    generatedAt: options.generatedAt || new Date().toISOString(),
    package: compactPackage(options.packageInfo),
    runtime: compactRuntime(options.runtime),
    endpoint: options.endpoint,
    error,
    nextSteps: [
      "Start the Who Eats Token desktop app.",
      "Verify the local API token if the app is already running.",
      "Rerun `npm run diagnostics -- --json`."
    ],
    privacy: {
      redacted: true,
      excludes: [
        "api keys",
        "cookies",
        "local access tokens",
        "prompts",
        "completions",
        "chat logs",
        "raw databases",
        "local file paths"
      ]
    }
  };
}

function formatDiagnosticsBundle(bundle) {
  const lines = [];
  lines.push("Who Eats Token diagnostics bundle");
  lines.push(`Package: ${bundle.package.name || "unknown"} ${bundle.package.version || ""}`.trim());
  lines.push(`Endpoint: ${bundle.endpoint || "--"}`);
  lines.push(`Runtime: ${bundle.runtime.platform}/${bundle.runtime.arch} · node ${bundle.runtime.node}`);
  if (!bundle.ok) {
    lines.push(`Status: unavailable · ${bundle.error || "unknown error"}`);
    lines.push("Next: start the desktop app and rerun `npm run diagnostics -- --json`.");
    return lines.join("\n");
  }

  if (bundle.collectedAt) lines.push(`Collected: ${bundle.collectedAt}`);
  const system = bundle.stability.system;
  if (system) {
    lines.push(`System: CPU ${formatPercent(system.cpuPercent)} · memory ${formatPercent(system.memoryUsedPercent)} used · app RSS ${formatMb(system.appRssMb)}`);
  } else {
    lines.push("System: unavailable");
  }
  const providerSummary = bundle.status.providerSummary || {};
  lines.push(`Providers: live ${providerSummary.live || 0}, delayed ${providerSummary.delayed || 0}, estimated ${providerSummary.estimated || 0}, missing ${providerSummary.missing || 0}, attention ${providerSummary.attention || 0}`);
  const summary = bundle.stability.summary || {};
  lines.push(`Findings: critical ${summary.critical || 0}, warning ${summary.warning || 0}, info ${summary.info || 0}`);
  lines.push(`Configuration: refresh ${formatMs(bundle.configuration.refreshMs)} · active-window ${formatMs(bundle.configuration.activeWindowMs)} · debug HUD ${bundle.configuration.debugHud ? "on" : "off"}`);
  lines.push("Redaction: secrets, prompts, chat logs, raw databases, and local paths are excluded.");
  lines.push("");

  for (const item of bundle.stability.findings || []) {
    lines.push(`- [${item.severity}] ${item.id}: ${item.message}`);
  }

  return lines.join("\n");
}

function compactPackage(packageInfo = {}) {
  return {
    name: packageInfo.name || "who-eats-token",
    version: packageInfo.version || null
  };
}

function compactRuntime(runtime = {}) {
  return {
    platform: runtime.platform || process.platform,
    arch: runtime.arch || process.arch,
    node: runtime.node || process.versions.node,
    release: runtime.release || os.release()
  };
}

function compactConfiguration(settings = {}) {
  const registry = Array.isArray(settings.providerRegistry) ? settings.providerRegistry : [];
  const sources = {};
  for (const provider of registry) {
    const source = provider?.source || "unknown";
    sources[source] = (sources[source] || 0) + 1;
  }

  return {
    refreshMs: numberOrNull(settings.behavior?.refreshMs),
    activeWindowMs: numberOrNull(settings.behavior?.activeWindowMs),
    debugHud: settings.behavior?.debugHud === true,
    providers: {
      total: registry.length,
      enabled: registry.filter((provider) => provider?.enabled !== false).length,
      disabled: registry.filter((provider) => provider?.enabled === false).length,
      sources
    }
  };
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatPercent(value) {
  return value === null || value === undefined ? "--" : `${value}%`;
}

function formatMb(value) {
  return value === null || value === undefined ? "--" : `${value} MB`;
}

function formatMs(value) {
  return value === null || value === undefined ? "--" : `${value}ms`;
}

module.exports = {
  SCHEMA,
  buildDiagnosticsBundle,
  buildUnavailableBundle,
  compactConfiguration,
  formatDiagnosticsBundle
};
