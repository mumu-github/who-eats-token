import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const packageInfo = require("../package.json");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));

const report = buildSupportBundle();

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatSupportBundle(report));
}

if (args.requireClean && !report.ok) {
  process.exitCode = 1;
}

function buildSupportBundle() {
  const generatedAt = new Date().toISOString();
  const staticReports = {
    releaseSummary: runJsonScript("release-summary.mjs", ["--json"]),
    compatibilityMatrix: runJsonScript("compatibility-matrix.mjs", ["--json"]),
    performanceSummary: runJsonScript("performance-summary.mjs", ["--json"]),
    delightContract: runJsonScript("delight-contract.mjs", ["--json"])
  };
  const runtimeArgs = runtimeCommandArgs();
  const runtimeReports = {
    lagTriage: runJsonScript("lag-triage.mjs", ["--json", ...runtimeArgs], { allowNonZeroJson: true }),
    diagnostics: runJsonScript("diagnostics.mjs", ["--json", ...runtimeArgs], { allowNonZeroJson: true })
  };
  const collections = { ...staticReports, ...runtimeReports };
  const summary = summarizeBundle(collections);

  return {
    ok: summary.collectionFailed === 0 && summary.staticGuardFailures === 0 && summary.criticalRuntimeFindings === 0,
    schema: "who-eats-token.support-bundle.v1",
    generatedAt,
    package: {
      name: packageInfo.name,
      version: packageInfo.version
    },
    summary,
    static: {
      releaseSummary: staticReports.releaseSummary.data,
      compatibilityMatrix: staticReports.compatibilityMatrix.data,
      performanceSummary: staticReports.performanceSummary.data,
      delightContract: staticReports.delightContract.data
    },
    runtime: {
      lagTriage: runtimeReports.lagTriage.data,
      diagnostics: runtimeReports.diagnostics.data
    },
    collections: Object.fromEntries(
      Object.entries(collections).map(([key, value]) => [key, compactCollection(value)])
    ),
    nextActions: buildNextActions(staticReports, runtimeReports, summary),
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

function summarizeBundle(collections) {
  const values = Object.values(collections);
  const releaseSummary = collections.releaseSummary.data || {};
  const lagTriage = collections.lagTriage.data || {};
  const diagnostics = collections.diagnostics.data || {};
  const performance = collections.performanceSummary.data || {};
  const compatibility = collections.compatibilityMatrix.data || {};
  const delight = collections.delightContract.data || {};

  return {
    collectionTotal: values.length,
    collectionFailed: values.filter((item) => !item.collected).length,
    staticGuardFailures: [
      releaseSummary.guardReady === false,
      performance.ok === false,
      compatibility.ok === false,
      delight.ok === false
    ].filter(Boolean).length,
    publicReleaseReady: releaseSummary.publicReleaseReady === true,
    guardReady: releaseSummary.guardReady === true,
    compatibilityOk: compatibility.ok === true,
    performanceOk: performance.ok === true,
    delightOk: delight.ok === true,
    runtimeAvailable: lagTriage.runtime?.available === true || diagnostics.ok === true,
    lagLikelyCause: lagTriage.likelyCause?.id || null,
    criticalRuntimeFindings: Number(lagTriage.runtime?.critical || diagnostics.stability?.summary?.critical || 0),
    warningRuntimeFindings: Number(lagTriage.runtime?.warning || diagnostics.stability?.summary?.warning || 0),
    releaseBlockers: releaseSummary.releaseGaps?.summary?.blocking ?? null,
    packageCount: releaseSummary.guards?.license?.packageCount ?? performance.packageWeight?.lockPackageCount ?? null
  };
}

function buildNextActions(staticReports, runtimeReports, summary) {
  const actions = [];
  const release = staticReports.releaseSummary.data || {};
  const lag = runtimeReports.lagTriage.data || {};

  if (!summary.runtimeAvailable) {
    actions.push("Start the desktop app and rerun `npm run support:bundle -- --json`.");
  }
  if (summary.criticalRuntimeFindings > 0 || summary.warningRuntimeFindings > 0) {
    actions.push("Review `runtime.lagTriage.nextActions` first; it already separates CPU, memory, provider, overlay, and app-unavailable causes.");
  }
  if (summary.staticGuardFailures > 0) {
    actions.push("Run `npm run release:check` and fix static guard failures before profiling UI behavior.");
  }
  if (summary.releaseBlockers > 0) {
    actions.push("Use `npm run release:summary -- --json` for the current public-release blockers.");
  }
  if (release.nextActions?.actions?.length > 0) {
    actions.push("Use `npm run validation:next` before assigning manual macOS, browser, IDE, or signing work.");
  }
  if (lag.nextActions?.length > 0) {
    actions.push(...lag.nextActions.slice(0, 2));
  }
  if (actions.length === 0) {
    actions.push("Attach this redacted bundle to the issue and include the exact app/tool window that was active.");
  }
  return [...new Set(actions)];
}

function runJsonScript(scriptName, scriptArgs = [], options = {}) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", scriptName), ...scriptArgs], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
  const status = typeof result.status === "number" ? result.status : 1;
  const raw = result.stdout || "";
  const parsed = parseJson(raw);
  const collected = status === 0 || (options.allowNonZeroJson && parsed !== null);

  return {
    collected,
    status,
    script: `scripts/${scriptName}`,
    error: collected ? null : (result.error?.message || result.stderr || `exited ${status}`),
    data: parsed
  };
}

function runtimeCommandArgs() {
  const output = [];
  if (args.endpoint) output.push("--endpoint", args.endpoint);
  if (args.token) output.push("--token", args.token);
  if (args.timeoutMs) output.push("--timeout-ms", String(args.timeoutMs));
  return output;
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function compactCollection(collection) {
  return {
    collected: collection.collected,
    status: collection.status,
    script: collection.script,
    error: collection.error
  };
}

function formatSupportBundle(bundle) {
  const lines = [];
  lines.push("Who Eats Token support bundle");
  lines.push(`Package: ${bundle.package.name} ${bundle.package.version}`);
  lines.push(`Status: ${bundle.ok ? "quiet" : "needs attention"}`);
  lines.push(`Static guards: release ${bundle.summary.guardReady ? "ready" : "attention"}, compatibility ${bundle.summary.compatibilityOk ? "ok" : "attention"}, performance ${bundle.summary.performanceOk ? "ok" : "attention"}, delight ${bundle.summary.delightOk ? "ok" : "attention"}`);
  lines.push(`Runtime: ${bundle.summary.runtimeAvailable ? "available" : "unavailable"} · likely ${bundle.summary.lagLikelyCause || "--"} · critical ${bundle.summary.criticalRuntimeFindings} · warning ${bundle.summary.warningRuntimeFindings}`);
  lines.push(`Public release blockers: ${bundle.summary.releaseBlockers ?? "--"}`);
  lines.push("");
  lines.push("Collections:");
  for (const [key, item] of Object.entries(bundle.collections)) {
    lines.push(`- ${key}: ${item.collected ? "collected" : "failed"} (${item.script})`);
  }
  lines.push("");
  lines.push("Next actions:");
  for (const action of bundle.nextActions) lines.push(`- ${action}`);
  lines.push("");
  lines.push("Redaction: secrets, prompts, completions, cookies, raw databases, and local paths are excluded.");
  return lines.join("\n");
}

function parseArgs(argv) {
  const options = {
    json: false,
    requireClean: false,
    endpoint: undefined,
    token: undefined,
    timeoutMs: undefined
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
