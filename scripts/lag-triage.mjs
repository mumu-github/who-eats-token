import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { createWhoEatsTokenClient } = require("../src/sdk/client.cjs");
const {
  buildStabilityReport,
  formatStabilityReport
} = require("../src/diagnostics/stability-report.cjs");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const performance = runPerformanceSummary();
const runtime = await readRuntime();
const report = buildLagTriageReport(performance, runtime);

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatLagTriageReport(report));
}

if (args.requireClean && !report.ok) {
  process.exitCode = 1;
}

async function readRuntime() {
  const client = createWhoEatsTokenClient({
    endpoint: args.endpoint,
    token: args.token,
    timeoutMs: args.timeoutMs
  });
  const result = await client.getSnapshot();

  if (!result.ok) {
    return {
      available: false,
      endpoint: client.endpoint,
      error: result.error || result.body?.error || `HTTP ${result.status || "unknown"}`,
      nextSteps: [
        "Start the Who Eats Token desktop app.",
        "Verify the local API token if the app is already running.",
        "Run `npm run diagnostics -- -- --json` after the app is reachable."
      ]
    };
  }

  const stability = buildStabilityReport(result.body || {}, {
    endpoint: client.endpoint
  });

  return {
    available: true,
    endpoint: client.endpoint,
    stability
  };
}

function buildLagTriageReport(staticPerformance, runtimeResult) {
  const runtimeSummary = summarizeRuntime(runtimeResult);
  const likelyCause = classifyLikelyCause(staticPerformance, runtimeSummary);
  const nextActions = buildNextActions(staticPerformance, runtimeSummary, likelyCause);
  const ok = staticPerformance.ok === true && runtimeSummary.available === true && runtimeSummary.critical === 0 && runtimeSummary.warning === 0;

  return {
    ok,
    schema: "who-eats-token.lag-triage.v1",
    generatedAt: new Date().toISOString(),
    staticPerformance,
    runtime: runtimeSummary,
    likelyCause,
    nextActions,
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

function summarizeRuntime(runtimeResult) {
  if (!runtimeResult.available) {
    return {
      available: false,
      endpoint: runtimeResult.endpoint,
      error: runtimeResult.error,
      critical: 0,
      warning: 0,
      info: 0,
      system: null,
      providerSummary: null,
      topFindings: [],
      nextSteps: runtimeResult.nextSteps
    };
  }

  const report = runtimeResult.stability;
  const topFindings = report.findings
    .filter((finding) => finding.severity !== "info")
    .slice(0, 8)
    .map((finding) => ({
      severity: finding.severity,
      id: finding.id,
      message: finding.message,
      evidence: finding.evidence || {}
    }));

  return {
    available: true,
    endpoint: report.endpoint,
    collectedAt: report.collectedAt,
    critical: report.summary.critical,
    warning: report.summary.warning,
    info: report.summary.info,
    system: report.system,
    providerSummary: report.providerHealth.summary || null,
    ingest: report.ingest,
    topFindings,
    stabilityText: formatStabilityReport(report)
  };
}

function classifyLikelyCause(staticPerformance, runtimeSummary) {
  if (!runtimeSummary.available) {
    return {
      id: "app-unavailable",
      label: "App unavailable",
      message: "The desktop app local API is not reachable, so runtime lag cannot be measured yet."
    };
  }

  const findingIds = new Set(runtimeSummary.topFindings.map((finding) => finding.id));
  if (findingIds.has("cpu-critical") || findingIds.has("cpu-high")) {
    return {
      id: "cpu-pressure",
      label: "CPU pressure",
      message: "CPU pressure is visible in the live snapshot; inspect competing processes before changing HUD behavior."
    };
  }
  if (findingIds.has("memory-critical") || findingIds.has("memory-high") || findingIds.has("memory-free-critical") || findingIds.has("memory-free-low")) {
    return {
      id: "memory-pressure",
      label: "Memory pressure",
      message: "System memory is tight; compare app RSS against packaged soak evidence and close unrelated heavy apps."
    };
  }
  if (findingIds.has("partial-snapshot")) {
    return {
      id: "partial-snapshot",
      label: "Partial snapshot",
      message: "The local API is reachable, but it looks like an ingest-only or stale instance instead of the full desktop snapshot."
    };
  }
  if (findingIds.has("app-rss-high")) {
    return {
      id: "app-rss-high",
      label: "App RSS high",
      message: "The app process is above the lightweight RSS budget; run packaged soak and inspect recent runtime changes."
    };
  }
  if (findingIds.has("provider-stale") || findingIds.has("provider-delayed") || findingIds.has("provider-missing") || findingIds.has("provider-attention")) {
    return {
      id: "provider-data",
      label: "Provider data issue",
      message: "Quota data is stale, delayed, missing, or needs attention; fix the adapter/provider path before UI tuning."
    };
  }
  if (findingIds.has("overlays-active")) {
    return {
      id: "overlay-avoidance",
      label: "Overlay avoidance active",
      message: "A browser/tool overlay is actively asking the HUD to avoid UI; inspect overlay rectangles if the HUD disappears."
    };
  }
  if (staticPerformance.ok !== true) {
    return {
      id: "static-performance-risk",
      label: "Static performance risk",
      message: "Static low-memory guards found adapter or interval risks even though runtime data is not critical."
    };
  }

  return {
    id: "quiet",
    label: "Quiet",
    message: "Static guards and the live snapshot do not show an obvious lag source."
  };
}

function buildNextActions(staticPerformance, runtimeSummary, likelyCause) {
  const actions = [];

  if (!runtimeSummary.available) {
    actions.push("Start the desktop app and rerun `npm run lag:triage`.");
    actions.push("If the app is running, verify the local API token and endpoint.");
    return actions;
  }

  if (["cpu-pressure", "memory-pressure", "app-rss-high"].includes(likelyCause.id)) {
    actions.push("Run `npm run diagnostics -- -- --json` and attach the redacted bundle to the issue.");
    actions.push("Run `npm run performance:summary -- -- --json` to confirm no static polling regression.");
    actions.push("Run `npm run soak:packaged-win` or `npm run soak:packaged-mac` on the affected OS.");
  }

  if (likelyCause.id === "provider-data") {
    actions.push("Run `npm run status -- -- --json` and compare provider freshness with the tool's own quota UI.");
    actions.push("Check the adapter source before changing HUD rendering code.");
  }

  if (likelyCause.id === "partial-snapshot") {
    actions.push("Restart the desktop app so port 17667 is owned by the full Who Eats Token runtime.");
    actions.push("Rerun `npm run diagnostics -- -- --json` and confirm `stability.system` is no longer null.");
    actions.push("If the wrong instance keeps returning, identify the process with `netstat -ano | Select-String \":17667\"` before changing HUD code.");
  }

  if (likelyCause.id === "overlay-avoidance") {
    actions.push("Run `npm run diagnostics -- -- --json` while the popup is visible.");
    actions.push("Check whether overlay rectangles overlap the HUD before changing hide/move rules.");
  }

  if (staticPerformance.ok !== true) {
    actions.push("Run `npm run adapter:review` and fix any adapter performance boundary findings.");
    actions.push("Run `npm run test:performance-budget` before profiling runtime behavior.");
  }

  if (actions.length === 0) {
    actions.push("Record the current `npm run diagnostics -- -- --json` output if the user still sees lag.");
    actions.push("Compare against OS Task Manager or Activity Monitor to identify non-app pressure.");
  }

  return [...new Set(actions)];
}

function runPerformanceSummary() {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "performance-summary.mjs"), "--json"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });

  if (result.status !== 0 || result.error) {
    return {
      ok: false,
      error: result.error?.message || result.stderr || `performance-summary exited ${result.status}`,
      adapterReview: { ok: false, errorCount: 1, warningCount: 0 },
      intervalAudit: {
        unreviewedRuntimeIntervalCount: 1,
        adapterDomIntervalCount: 0
      }
    };
  }

  try {
    const parsed = JSON.parse(result.stdout);
    return compactPerformanceSummary(parsed);
  } catch (error) {
    return {
      ok: false,
      error: `Could not parse performance summary JSON: ${error.message}`,
      adapterReview: { ok: false, errorCount: 1, warningCount: 0 },
      intervalAudit: {
        unreviewedRuntimeIntervalCount: 1,
        adapterDomIntervalCount: 0
      }
    };
  }
}

function compactPerformanceSummary(summary) {
  return {
    ok: summary.ok === true,
    packageWeight: summary.packageWeight,
    runtimeBudgets: summary.runtimeBudgets,
    intervalAudit: {
      reviewedRuntimeIntervalCount: summary.intervalAudit?.reviewedRuntimeIntervalCount || 0,
      adapterDomIntervalCount: summary.intervalAudit?.adapterDomIntervalCount || 0,
      unreviewedRuntimeIntervalCount: summary.intervalAudit?.unreviewedRuntimeIntervalCount || 0
    },
    adapterReview: summary.adapterReview,
    releaseEvidence: summary.releaseEvidence
  };
}

function formatLagTriageReport(report) {
  const lines = [];
  lines.push("Who Eats Token lag triage");
  lines.push(`Status: ${report.ok ? "quiet" : "needs attention"}`);
  lines.push(`Likely cause: ${report.likelyCause.label} · ${report.likelyCause.message}`);
  lines.push("");
  lines.push("Static performance gates");
  lines.push(`- adapter review: ${report.staticPerformance.adapterReview?.errorCount || 0} errors, ${report.staticPerformance.adapterReview?.warningCount || 0} warnings`);
  lines.push(`- intervals: ${report.staticPerformance.intervalAudit?.reviewedRuntimeIntervalCount || 0} reviewed runtime, ${report.staticPerformance.intervalAudit?.unreviewedRuntimeIntervalCount || 0} unreviewed runtime, ${report.staticPerformance.intervalAudit?.adapterDomIntervalCount || 0} adapter DOM`);
  if (report.staticPerformance.packageWeight) {
    lines.push(`- packages: ${report.staticPerformance.packageWeight.runtimeDependencyCount} runtime deps, ${report.staticPerformance.packageWeight.lockPackageCount} locked packages`);
  }
  lines.push("");
  lines.push("Runtime snapshot");
  if (!report.runtime.available) {
    lines.push(`- unavailable at ${report.runtime.endpoint}: ${report.runtime.error}`);
  } else {
    const system = report.runtime.system || {};
    lines.push(`- CPU ${formatPercent(system.cpuPercent)} · memory ${formatPercent(system.memoryUsedPercent)} used · app RSS ${formatMb(system.appRssMb)}`);
    lines.push(`- findings: critical ${report.runtime.critical}, warning ${report.runtime.warning}, info ${report.runtime.info}`);
    for (const finding of report.runtime.topFindings) {
      lines.push(`- [${finding.severity}] ${finding.id}: ${finding.message}`);
    }
  }
  lines.push("");
  lines.push("Next actions");
  for (const action of report.nextActions) lines.push(`- ${action}`);
  lines.push("");
  lines.push("Redaction: secrets, prompts, completions, cookies, raw databases, and local paths are excluded.");
  return lines.join("\n");
}

function formatPercent(value) {
  return value === null || value === undefined ? "--" : `${value}%`;
}

function formatMb(value) {
  return value === null || value === undefined ? "--" : `${value} MB`;
}

function parseArgs(argv) {
  const options = {
    json: false,
    endpoint: undefined,
    token: undefined,
    timeoutMs: undefined,
    requireClean: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--require-clean") {
      options.requireClean = true;
      continue;
    }
    if (arg === "--endpoint") {
      options.endpoint = argv[++index];
      continue;
    }
    if (arg === "--token") {
      options.token = argv[++index];
      continue;
    }
    if (arg === "--timeout-ms") {
      options.timeoutMs = Number(argv[++index]);
      continue;
    }
  }

  return options;
}
