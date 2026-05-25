import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const packageJson = readJson("package.json");
const catalog = readJson("adapters/catalog.json");
const selected = selectAdapters(catalog.adapters || [], args.id);
const reviews = selected.map(reviewAdapter);
const report = {
  ok: reviews.every((review) => review.errorCount === 0),
  checkedAt: new Date().toISOString(),
  adapterCount: reviews.length,
  errorCount: reviews.reduce((total, review) => total + review.errorCount, 0),
  warningCount: reviews.reduce((total, review) => total + review.warningCount, 0),
  reviews
};

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report);
}

if (args.requireClean && !report.ok) {
  process.exitCode = 1;
}

function reviewAdapter(adapter) {
  const findings = [];
  const signals = new Set(adapter.providedSignals || []);
  const scripts = adapter.automatedChecks || [];

  requireText(adapter.id, "id", findings);
  requireText(adapter.name, "name", findings);
  requireText(adapter.scope, "scope", findings);
  requireText(adapter.privacyBoundary, "privacyBoundary", findings);
  requireText(adapter.performanceBoundary, "performanceBoundary", findings);
  requireText(adapter.disablePath, "disablePath", findings);
  requireArray(adapter.platforms, "platforms", findings);
  requireArray(adapter.providedSignals, "providedSignals", findings);
  requireArray(adapter.docs, "docs", findings);
  requireArray(adapter.manualChecks, "manualChecks", findings);

  for (const doc of adapter.docs || []) {
    if (!exists(doc)) addFinding(findings, "error", "missing-doc", `Missing documented file: ${doc}`);
  }

  if (adapter.status === "planned") {
    if ((adapter.entrypoints || []).length > 0) {
      addFinding(findings, "error", "planned-entrypoints", "Planned adapters must not claim runtime entrypoints.");
    }
  } else {
    requireArray(adapter.entrypoints, "entrypoints", findings);
    requireArray(adapter.automatedChecks, "automatedChecks", findings);
    for (const entrypoint of adapter.entrypoints || []) {
      if (!exists(entrypoint)) addFinding(findings, "error", "missing-entrypoint", `Missing implementation entrypoint: ${entrypoint}`);
    }
  }

  for (const script of scripts) {
    if (!packageJson.scripts?.[script]) addFinding(findings, "error", "missing-script", `Missing npm script: ${script}`);
  }

  reviewPrivacy(adapter, findings);
  reviewPerformance(adapter, findings);
  reviewSignalContract(adapter, signals, findings);
  reviewStatus(adapter, signals, scripts, findings);

  const commands = recommendedCommands(adapter, findings);
  return {
    id: adapter.id,
    name: adapter.name,
    type: adapter.type,
    status: adapter.status,
    platforms: adapter.platforms || [],
    providedSignals: adapter.providedSignals || [],
    errorCount: findings.filter((finding) => finding.severity === "error").length,
    warningCount: findings.filter((finding) => finding.severity === "warning").length,
    findings,
    commands
  };
}

function reviewPrivacy(adapter, findings) {
  const text = String(adapter.privacyBoundary || "").toLowerCase();
  for (const term of ["prompt", "completion", "api key", "cookie"]) {
    if (!text.includes(term)) {
      addFinding(findings, "error", "privacy-boundary", `privacyBoundary must mention ${term}.`);
    }
  }
  if (!/(source file|source files|workspace|源码)/i.test(adapter.privacyBoundary || "")) {
    addFinding(findings, "warning", "privacy-source-files", "privacyBoundary should explicitly address source files or workspace contents.");
  }
}

function reviewPerformance(adapter, findings) {
  const text = String(adapter.performanceBoundary || "").toLowerCase();
  const noRuntime = adapter.type === "agent-workflow" && /(no background runtime|only executes|仅在)/i.test(text);
  if (!noRuntime && !/(timeout|short|短)/i.test(text)) {
    addFinding(findings, "warning", "performance-timeout", "performanceBoundary should mention short timeouts.");
  }
  if (!/(poll|watchdog|loop|cache|queue|bounded|缓存|轮询|队列)/i.test(text)) {
    addFinding(findings, "warning", "performance-bounds", "performanceBoundary should mention polling, cache windows, queues, or watchdog limits.");
  }
}

function reviewSignalContract(adapter, signals, findings) {
  if (adapter.type === "browser-extension") {
    requireSignal(signals, "hud-overlays", adapter, findings);
    requireSignal(signals, "local-health", adapter, findings);
  }
  if (adapter.type === "ide-extension") {
    requireSignal(signals, "local-health", adapter, findings);
    requireSignal(signals, "status-display", adapter, findings);
  }
  if (adapter.type === "local-gateway" || adapter.type === "sdk-wrapper") {
    if (!signals.has("usage-events") && !signals.has("usage-tokens")) {
      addFinding(findings, "error", "usage-signal", `${adapter.type} adapters must declare usage-events or usage-tokens.`);
    }
  }
  if (signals.has("snapshot-read") && !signals.has("local-health") && adapter.type !== "mcp-server") {
    addFinding(findings, "warning", "snapshot-without-health", "snapshot-read adapters should also use local-health for cheap startup checks.");
  }
  if (signals.has("quota-token-plan") && !/credit|token plan|plan|credits/i.test(`${adapter.scope} ${adapter.privacyBoundary}`)) {
    addFinding(findings, "warning", "token-plan-source", "quota-token-plan adapters should describe credit or plan source clearly.");
  }
}

function reviewStatus(adapter, signals, scripts, findings) {
  if (adapter.status === "supported" && !signals.has("usage-tokens") && !signals.has("quota-capacity") && !signals.has("quota-token-plan")) {
    addFinding(findings, "error", "supported-runtime-signal", "Supported adapters must provide a runtime usage or quota signal.");
  }
  if (adapter.status === "supported" && !scripts.some((script) => /smoke|hud|health|bridge|runtime|contract/i.test(script))) {
    addFinding(findings, "warning", "supported-smoke", "Supported adapters should have runtime smoke or health coverage.");
  }
  if (adapter.status === "reference" && !scripts.some((script) => !["release:check", "test:adapter-catalog", "test:adapter-contribution"].includes(script))) {
    addFinding(findings, "warning", "reference-specific-test", "Reference adapters should have an adapter-specific test or package check.");
  }
}

function recommendedCommands(adapter, findings) {
  const commands = new Set([
    "npm run test:adapter-catalog",
    "npm run test:adapter-contract",
    "npm run test:adapter-contribution"
  ]);
  for (const script of adapter.automatedChecks || []) {
    commands.add(`npm run ${script}`);
  }
  if (adapter.type === "browser-extension") commands.add("npm run adapter:guard");
  if (adapter.type === "ide-extension") commands.add("npm run adapter:guard");
  if (findings.some((finding) => finding.severity === "error")) commands.add("npm run release:check");
  return [...commands];
}

function requireSignal(signals, signal, adapter, findings) {
  if (!signals.has(signal)) {
    addFinding(findings, "error", "missing-signal", `${adapter.id} must declare ${signal}.`);
  }
}

function requireText(value, field, findings) {
  if (!String(value || "").trim()) addFinding(findings, "error", "missing-field", `Missing ${field}.`);
}

function requireArray(value, field, findings) {
  if (!Array.isArray(value) || value.length === 0) addFinding(findings, "error", "missing-array", `${field} must be a non-empty array.`);
}

function addFinding(findings, severity, id, message) {
  findings.push({ severity, id, message });
}

function selectAdapters(adapters, id) {
  if (!id) return adapters;
  const found = adapters.filter((adapter) => adapter.id === id);
  if (found.length === 0) {
    throw new Error(`Unknown adapter id: ${id}`);
  }
  return found;
}

function printReport(report) {
  console.log("# Adapter Review Report");
  console.log("");
  console.log(`Adapters: ${report.adapterCount}`);
  console.log(`Errors: ${report.errorCount}`);
  console.log(`Warnings: ${report.warningCount}`);
  for (const review of report.reviews) {
    console.log("");
    console.log(`## ${review.name} (${review.id})`);
    console.log(`Type/status: ${review.type} / ${review.status}`);
    console.log(`Signals: ${review.providedSignals.join(", ")}`);
    if (review.findings.length === 0) {
      console.log("Findings: none");
    } else {
      console.log("Findings:");
      for (const finding of review.findings) {
        console.log(`- [${finding.severity}] ${finding.id}: ${finding.message}`);
      }
    }
    console.log("Commands:");
    for (const command of review.commands) console.log(`- ${command}`);
  }
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function parseArgs(argv) {
  const parsed = {
    id: null,
    json: argv.includes("--json"),
    requireClean: argv.includes("--require-clean")
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--id") {
      parsed.id = argv[index + 1];
      index += 1;
    } else if (value.startsWith("--id=")) {
      parsed.id = value.slice("--id=".length);
    }
  }
  return parsed;
}
