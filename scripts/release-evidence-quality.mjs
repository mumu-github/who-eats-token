import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const evidencePath = path.resolve(root, args.path || "docs/release-evidence.json");
const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
const findings = validateEvidenceQuality(evidence);
const report = {
  ok: findings.every((finding) => finding.severity !== "error"),
  schema: "who-eats-token.release-evidence-quality.v1",
  checkedAt: new Date().toISOString(),
  releaseCandidate: evidence.releaseCandidate,
  summary: summarize(evidence, findings),
  findings
};

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report);
}

if (args.requireClean && !report.ok) process.exitCode = 1;

function validateEvidenceQuality(payload) {
  const results = [];
  for (const { key, check } of flattenChecks(payload)) {
    validateRecordedShape(key, check, results);
    validateHostSmoke(key, check, results);
    validateRequiredTerms(key, check, results);
  }
  return results;
}

function validateRecordedShape(key, check, results) {
  if (!["passed", "host-smoke-only"].includes(check.status)) return;
  if (!check.recordedAt) addFinding(results, "error", key, "missing-recorded-at", "Recorded evidence must include recordedAt.");
  if (!check.command) addFinding(results, "error", key, "missing-command", "Recorded evidence must include the exact command or manual path.");
  if (!check.notes) addFinding(results, "error", key, "missing-notes", "Recorded evidence must include concrete notes.");
}

function validateHostSmoke(key, check, results) {
  if (!key.endsWith(".hostSmoke")) return;
  if (check.status === "passed") {
    addFinding(results, "error", key, "host-smoke-as-full-pass", "Host smoke must be recorded as host-smoke-only, not passed.");
  }
  if (check.status === "host-smoke-only" && !/host smoke|host-smoke|policy|temporary profile|validation machine|Chrome|Edge|VS Code|Cursor/i.test(check.notes)) {
    addFinding(results, "warning", key, "host-smoke-notes-thin", "Host-smoke notes should name host results or policy skips.");
  }
}

function validateRequiredTerms(key, check, results) {
  const rule = qualityRules()[key];
  if (!rule || check.status !== rule.status) return;
  const haystack = `${check.command}\n${check.notes}`;
  for (const requirement of rule.required) {
    if (!requirement.pattern.test(haystack)) {
      addFinding(results, "error", key, requirement.id, requirement.message);
    }
  }
}

function qualityRules() {
  return {
    "windowsPackagedRuntime.smoke": {
      status: "passed",
      required: [
        term("windows-smoke-command", /smoke:packaged-win/i, "Windows smoke evidence must name smoke:packaged-win."),
        term("windows-smoke-memory", /workingSetMb|RSS|memory/i, "Windows smoke notes must include memory/RSS evidence."),
        term("windows-smoke-cpu", /cpu/i, "Windows smoke notes must include CPU evidence.")
      ]
    },
    "windowsPackagedRuntime.soak": {
      status: "passed",
      required: [
        term("windows-soak-command", /soak:packaged-win/i, "Windows soak evidence must name soak:packaged-win."),
        term("windows-soak-duration", /duration|minute|10-minute|10\s*min/i, "Windows soak notes must include duration."),
        term("windows-soak-memory", /maxWorkingSetMb|RSS|growthMb|memory/i, "Windows soak notes must include memory growth evidence."),
        term("windows-soak-cpu", /maxCpuPercent|cpu/i, "Windows soak notes must include CPU evidence.")
      ]
    },
    "macosPackagedRuntime.smoke": {
      status: "passed",
      required: [
        term("macos-smoke-command", /smoke:packaged-mac/i, "macOS smoke evidence must name smoke:packaged-mac."),
        term("macos-host", /macOS|Darwin|Apple Silicon|Intel|arm64|x64/i, "macOS smoke notes must include host OS/architecture."),
        term("macos-snapshot", /snapshot|health/i, "macOS smoke notes must include /snapshot or health result.")
      ]
    },
    "macosPackagedRuntime.soak": {
      status: "passed",
      required: [
        term("macos-soak-command", /soak:packaged-mac/i, "macOS soak evidence must name soak:packaged-mac."),
        term("macos-soak-duration", /duration|minute|10-minute|10\s*min/i, "macOS soak notes must include duration."),
        term("macos-soak-memory", /RSS|memory|growthMb|maxWorkingSetMb/i, "macOS soak notes must include memory evidence."),
        term("macos-soak-cpu", /cpu|maxCpuPercent/i, "macOS soak notes must include CPU evidence.")
      ]
    },
    "macosPackagedRuntime.hudPermissionStates": {
      status: "passed",
      required: [
        term("macos-accessibility", /Accessibility/i, "macOS HUD permission evidence must mention Accessibility."),
        term("macos-screen-recording", /Screen Recording/i, "macOS HUD permission evidence must mention Screen Recording."),
        term("macos-granted-denied", /granted|denied/i, "macOS HUD permission evidence must cover granted and denied states."),
        term("macos-hud", /HUD|top bar|desktop/i, "macOS HUD permission evidence must mention observed HUD behavior.")
      ]
    },
    "browserAdapter.manualLoad": {
      status: "passed",
      required: [
        term("browser-chrome", /Chrome/i, "Browser manual load evidence must include Chrome."),
        term("browser-edge", /Edge/i, "Browser manual load evidence must include Edge."),
        term("browser-version", /version|v\d+|\d+\.\d+/i, "Browser manual load notes must include host versions."),
        term("browser-extension-id", /extension id|enabled|unpacked/i, "Browser manual load notes must include extension id, enabled state, or unpacked load state.")
      ]
    },
    "browserAdapter.manualConnection": {
      status: "passed",
      required: [
        term("browser-health", /\/health|health/i, "Browser connection evidence must include /health result."),
        term("browser-token-redacted", /token|redacted|not pasted|without pasting/i, "Browser connection notes must mention local token handling without exposing it."),
        term("browser-both-hosts", /Chrome.*Edge|Edge.*Chrome/i, "Browser connection notes must cover both Chrome and Edge.")
      ]
    },
    "ideAdapter.manualLoad": {
      status: "passed",
      required: [
        term("ide-vscode", /VS Code/i, "IDE manual load evidence must include VS Code."),
        term("ide-cursor", /Cursor/i, "IDE manual load evidence must include Cursor."),
        term("ide-version", /version|v\d+|\d+\.\d+/i, "IDE manual load notes must include host versions."),
        term("ide-vsix", /VSIX|extension folder|adapter id|loaded/i, "IDE manual load notes must include VSIX/folder load state or adapter id.")
      ]
    },
    "ideAdapter.manualConnection": {
      status: "passed",
      required: [
        term("ide-status-bar", /status bar/i, "IDE connection evidence must mention status bar behavior."),
        term("ide-health", /\/health|health/i, "IDE connection evidence must include /health result."),
        term("ide-refresh", /refresh/i, "IDE connection evidence must include refresh command behavior."),
        term("ide-snapshot", /snapshot/i, "IDE connection evidence must include copy snapshot behavior."),
        term("ide-source-boundary", /source files|does not read source|without reading source/i, "IDE connection evidence must confirm source files are not read.")
      ]
    },
    "signing.windowsAuthenticode": {
      status: "passed",
      required: [
        term("windows-signing-command", /signing:readiness/i, "Windows signing evidence must name signing:readiness."),
        term("windows-authenticode", /Authenticode|certificate|signed/i, "Windows signing notes must include certificate/signing result.")
      ]
    },
    "signing.macosNotarization": {
      status: "passed",
      required: [
        term("macos-signing-command", /signing:readiness/i, "macOS signing evidence must name signing:readiness."),
        term("macos-notary", /notary|notarized|Developer ID/i, "macOS signing notes must include notary or Developer ID result.")
      ]
    },
    dependencyAudit: {
      status: "passed",
      required: [
        term("audit-command", /npm audit/i, "Dependency audit evidence must name npm audit."),
        term("audit-zero-high", /0 vulnerabilities|zero high|high-severity.*0|0 high/i, "Dependency audit notes must state the high-severity result.")
      ]
    }
  };
}

function term(id, pattern, message) {
  return { id, pattern, message };
}

function summarize(payload, findings) {
  const checks = flattenChecks(payload);
  return {
    total: checks.length,
    recorded: checks.filter((entry) => ["passed", "host-smoke-only"].includes(entry.check.status)).length,
    passed: checks.filter((entry) => entry.check.status === "passed").length,
    hostSmokeOnly: checks.filter((entry) => entry.check.status === "host-smoke-only").length,
    pending: checks.filter((entry) => entry.check.status === "not-run").length,
    blocked: checks.filter((entry) => entry.check.status === "blocked").length,
    failed: checks.filter((entry) => entry.check.status === "failed").length,
    errors: findings.filter((finding) => finding.severity === "error").length,
    warnings: findings.filter((finding) => finding.severity === "warning").length
  };
}

function addFinding(findings, severity, key, id, message) {
  findings.push({ severity, key, id, message });
}

function flattenChecks(payload) {
  const rows = [];
  for (const [groupName, group] of Object.entries(payload.evidence || {})) {
    if (group && typeof group.status === "string") {
      rows.push({ key: groupName, check: group });
      continue;
    }
    for (const [checkName, check] of Object.entries(group || {})) {
      rows.push({ key: `${groupName}.${checkName}`, check });
    }
  }
  return rows.sort((left, right) => left.key.localeCompare(right.key));
}

function printReport(report) {
  console.log("# Release Evidence Quality");
  console.log("");
  console.log(`Release candidate: ${report.releaseCandidate}`);
  console.log(`Status: ${report.ok ? "ok" : "needs attention"}`);
  console.log(`Recorded: ${report.summary.recorded}/${report.summary.total}`);
  console.log(`Errors: ${report.summary.errors}`);
  console.log(`Warnings: ${report.summary.warnings}`);
  if (report.findings.length === 0) {
    console.log("");
    console.log("Findings: none");
    return;
  }
  console.log("");
  console.log("Findings:");
  for (const finding of report.findings) {
    console.log(`- [${finding.severity}] ${finding.key} ${finding.id}: ${finding.message}`);
  }
}

function parseArgs(argv) {
  const parsed = {
    json: argv.includes("--json"),
    requireClean: argv.includes("--require-clean"),
    path: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--path") {
      parsed.path = argv[++index];
    } else if (value.startsWith("--path=")) {
      parsed.path = value.slice("--path=".length);
    }
  }
  return parsed;
}
