import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { getQuotaDelight } = require("../src/protocol/quota-delight.cjs");
const args = parseArgs(process.argv.slice(2));

const scenarios = [
  scenario("live-comfy", "Live 75%+ should feel relaxed.", { status: "live", freshness: "fresh", lowestRemainingPercent: 82 }),
  scenario("live-steady", "Live 45-74% should feel steady.", { status: "live", freshness: "fresh", lowestRemainingPercent: 60 }),
  scenario("live-tight", "Live 20-44% should feel careful without alerting.", { status: "live", freshness: "fresh", lowestRemainingPercent: 34 }),
  scenario("live-low", "Live 10-19% should alert quietly.", { status: "live", freshness: "fresh", lowestRemainingPercent: 17 }),
  scenario("live-empty", "Live below 10% should be urgent.", { status: "live", freshness: "fresh", lowestRemainingPercent: 7 }),
  scenario("estimated-low", "Estimated low quota should keep the same low band and estimate marker.", { status: "estimated", freshness: "fresh", lowestRemainingPercent: 17 }),
  scenario("delayed", "Delayed data should be visually distinct from live quota.", { status: "delayed", freshness: "warm", lowestRemainingPercent: 70 }),
  scenario("stale", "Stale data should not look live.", { status: "live", freshness: "stale", lowestRemainingPercent: 70 }),
  scenario("auth-expired", "Expired credentials should ask for login.", { status: "auth-expired", freshness: "unknown", lowestRemainingPercent: null }),
  scenario("missing", "Missing data should stay quiet.", { status: "missing", freshness: "unknown", lowestRemainingPercent: null }),
  scenario("disabled", "Disabled providers should stay asleep.", { status: "disabled", freshness: "unknown", lowestRemainingPercent: null }),
  scenario("planned", "Planned adapters should look reserved, not broken.", { status: "planned", freshness: "unknown", lowestRemainingPercent: null })
];

const contract = buildContract();

if (args.json) {
  console.log(JSON.stringify(contract, null, 2));
} else {
  printContract(contract);
}

if (args.check && !contract.ok) {
  process.exitCode = 1;
}

function buildContract() {
  const rendered = scenarios.map((item) => ({
    ...item,
    delight: getQuotaDelight(item.signal)
  }));
  const findings = [
    ...validateDelightStates(rendered),
    ...validateAlertThresholds(),
    ...validateRendererCoupling(),
    ...validateAssetBudget()
  ];

  return {
    ok: findings.every((finding) => finding.severity !== "error"),
    schema: "who-eats-token.delight-contract.v1",
    generatedAt: new Date().toISOString(),
    guardrails: {
      sourceOfTruth: "src/protocol/quota-delight.cjs",
      alertBelowPercent: 20,
      reducedMotion: "static",
      maxDelightAssetBytes: 100 * 1024,
      noNewPollingLoops: true,
      numericValuesStayPrimary: true
    },
    states: rendered.map((item) => ({
      id: item.id,
      purpose: item.purpose,
      input: item.signal,
      output: compactDelight(item.delight)
    })),
    renderer: inspectRendererCoupling(),
    assets: inspectDelightAssets(),
    findings
  };
}

function validateDelightStates(items) {
  const findings = [];
  const ids = new Set();
  const allowedTones = new Set(["muted", "danger", "caution", "estimate", "steady", "comfy"]);
  const allowedMotion = new Set(["none", "soft", "breathe", "attention"]);
  const allowedSeverity = new Set(["normal", "info", "caution", "watch", "danger", "critical"]);
  const allowedCharts = new Set(["quiet", "alert", "breathe", "steady", "soft"]);

  for (const item of items) {
    const delight = item.delight;
    if (!delight?.id) add(findings, "error", "missing-id", `${item.id} is missing delight id.`);
    if (ids.has(delight.id) && !["live-low", "estimated-low", "delayed", "stale"].includes(item.id)) {
      add(findings, "warning", "duplicate-state", `${item.id} reuses delight id ${delight.id}.`);
    }
    ids.add(delight.id);
    if (!delight.shortLabel || !delight.label) add(findings, "error", "missing-label", `${item.id} must include short and long labels.`);
    if (!allowedTones.has(delight.tone)) add(findings, "error", "unknown-tone", `${item.id} tone ${delight.tone} is not allowed.`);
    if (!allowedMotion.has(delight.motion)) add(findings, "error", "unknown-motion", `${item.id} motion ${delight.motion} is not allowed.`);
    if (!allowedSeverity.has(delight.severity)) add(findings, "error", "unknown-severity", `${item.id} severity ${delight.severity} is not allowed.`);
    if (!Number.isInteger(delight.priority) || delight.priority < 0 || delight.priority > 3) {
      add(findings, "error", "priority-range", `${item.id} priority must be 0-3.`);
    }
    if (!delight.a11yLabel || !delight.a11yLabel.includes(delight.shortLabel)) {
      add(findings, "error", "a11y-label", `${item.id} must expose a readable a11y label.`);
    }
    if (!delight.cue?.icon || !delight.cue?.mascot || !delight.cue?.chart) {
      add(findings, "error", "missing-cue", `${item.id} must include icon, mascot, and chart cues.`);
    }
    if (delight.cue?.reducedMotion !== "static") {
      add(findings, "error", "reduced-motion", `${item.id} must reduce to static motion.`);
    }
    if (!allowedCharts.has(delight.cue?.chart)) {
      add(findings, "error", "unknown-chart-cue", `${item.id} chart cue ${delight.cue?.chart} is not allowed.`);
    }
  }

  return findings;
}

function validateAlertThresholds() {
  const findings = [];
  const at20 = getQuotaDelight({ status: "live", freshness: "fresh", lowestRemainingPercent: 20 });
  const at19 = getQuotaDelight({ status: "live", freshness: "fresh", lowestRemainingPercent: 19 });
  const at9 = getQuotaDelight({ status: "live", freshness: "fresh", lowestRemainingPercent: 9 });
  if (at20.alert) add(findings, "error", "alert-boundary", "Live 20% must not alert; alerts start below 20%.");
  if (!at19.alert || at19.priority !== 3 || at19.cue.chart !== "alert") {
    add(findings, "error", "low-alert", "Live 19% must trigger the low-quota alert cue.");
  }
  if (!at9.alert || at9.id !== "empty") {
    add(findings, "error", "empty-alert", "Live below 10% must use the empty urgent state.");
  }
  return findings;
}

function validateRendererCoupling() {
  const findings = [];
  const app = read("src/renderer/app.js");
  const hud = read("src/renderer/hud.js");
  const styles = read("src/renderer/styles.css");
  const ingest = read("src/collectors/ingest-server.cjs");
  const providerHealth = read("src/protocol/provider-health.cjs");

  requireIncludes(findings, providerHealth, "getQuotaDelight(entry)", "provider-health-source", "Provider health must attach shared delight state.");
  requireIncludes(findings, ingest, "compactDelight", "ingest-compact-delight", "Local API must compact delight without leaking raw provider data.");
  requireIncludes(findings, app, "display?.delight || getProviderDelight", "topbar-delight-source", "Top bar must read provider delight instead of inventing mood logic.");
  requireIncludes(findings, hud, "provider?.delight || null", "hud-delight-source", "HUD must read provider delight instead of inventing mood logic.");
  requireIncludes(findings, app, "renderMiniChart(display.chart)", "topbar-chart-source", "Top bar mini chart must use existing display data.");
  requireIncludes(findings, hud, "renderHudChart(provider)", "hud-chart-source", "HUD chart must use provider data.");
  requireIncludes(findings, styles, "prefers-reduced-motion", "reduced-motion-css", "Renderer CSS must honor reduced-motion.");
  requireIncludes(findings, styles, "animation: none !important", "reduced-motion-stop", "Reduced motion must stop decorative animation.");
  return findings;
}

function validateAssetBudget() {
  const findings = [];
  for (const asset of inspectDelightAssets()) {
    if (asset.bytes > 100 * 1024) {
      add(findings, "error", "asset-budget", `${asset.path} is ${asset.bytes} bytes, above the 100KB delight asset budget.`);
    }
  }
  return findings;
}

function inspectRendererCoupling() {
  const styles = read("src/renderer/styles.css");
  return {
    topBarReadsProviderDelight: read("src/renderer/app.js").includes("display?.delight || getProviderDelight"),
    hudReadsProviderDelight: read("src/renderer/hud.js").includes("provider?.delight || null"),
    reducedMotionStopsAnimation: styles.includes("prefers-reduced-motion") && styles.includes("animation: none !important"),
    chartAnimations: countMatches(styles, /@keyframes\s+chart-/g)
  };
}

function inspectDelightAssets() {
  const assetRoot = path.join(root, "src", "assets");
  if (!fs.existsSync(assetRoot)) return [];
  return fs.readdirSync(assetRoot)
    .filter((name) => /\.(png|ico|jpg|jpeg|gif|webp|svg|json)$/i.test(name))
    .map((name) => {
      const filePath = path.join(assetRoot, name);
      return {
        path: path.relative(root, filePath).replace(/\\/g, "/"),
        bytes: fs.statSync(filePath).size
      };
    });
}

function compactDelight(delight) {
  return {
    id: delight.id,
    shortLabel: delight.shortLabel,
    label: delight.label,
    tone: delight.tone,
    motion: delight.motion,
    severity: delight.severity,
    priority: delight.priority,
    alert: delight.alert,
    estimated: delight.estimated,
    cue: delight.cue,
    a11yLabel: delight.a11yLabel
  };
}

function printContract(contract) {
  console.log("# Delight Contract");
  console.log("");
  console.log(`Status: ${contract.ok ? "clean" : "needs attention"}`);
  console.log(`Source of truth: ${contract.guardrails.sourceOfTruth}`);
  console.log(`Low-quota alert: below ${contract.guardrails.alertBelowPercent}%`);
  console.log(`Asset budget: ${contract.guardrails.maxDelightAssetBytes} bytes`);
  console.log("");
  console.log("## States");
  for (const item of contract.states) {
    console.log(`- ${item.id}: ${item.output.shortLabel} / ${item.output.label} · ${item.output.tone} · ${item.output.cue.icon}/${item.output.cue.mascot}/${item.output.cue.chart}`);
  }
  console.log("");
  console.log("## Renderer Coupling");
  console.log(`- top bar reads provider delight: ${contract.renderer.topBarReadsProviderDelight}`);
  console.log(`- HUD reads provider delight: ${contract.renderer.hudReadsProviderDelight}`);
  console.log(`- reduced motion stops animation: ${contract.renderer.reducedMotionStopsAnimation}`);
  console.log("");
  console.log("## Assets");
  for (const asset of contract.assets) console.log(`- ${asset.path}: ${asset.bytes} bytes`);
  if (contract.findings.length > 0) {
    console.log("");
    console.log("## Findings");
    for (const finding of contract.findings) console.log(`- [${finding.severity}] ${finding.id}: ${finding.message}`);
  }
}

function scenario(id, purpose, signal) {
  return { id, purpose, signal };
}

function requireIncludes(findings, text, needle, id, message) {
  if (!text.includes(needle)) add(findings, "error", id, message);
}

function add(findings, severity, id, message) {
  findings.push({ severity, id, message });
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function parseArgs(argv) {
  return {
    json: argv.includes("--json"),
    check: argv.includes("--check")
  };
}
