import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const checks = buildChecks();
const blocking = checks.filter((check) => !isReady(check.status));
const sourceBetaBlocking = checks.filter((check) => isSourceBetaGate(check.id) && !isReady(check.status));
const sourceBetaReady = sourceBetaBlocking.length === 0;
const publicReleaseReady = blocking.length === 0;
const targetBlocking = args.target === "source-beta" ? sourceBetaBlocking : blocking;
const report = {
  ok: targetBlocking.length === 0,
  target: args.target,
  sourceBetaReady,
  publicReleaseReady,
  checkedAt: new Date().toISOString(),
  summary: summarize(checks),
  sourceBeta: {
    ready: sourceBetaReady,
    blocking: sourceBetaBlocking.length,
    gateIds: sourceBetaGateIds()
  },
  checks
};

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report);
}

if (args.requireSourceBeta && !sourceBetaReady) {
  process.exitCode = 1;
} else if (args.requirePublicRelease && !publicReleaseReady) {
  process.exitCode = 1;
}

function buildChecks() {
  const packageJson = readJson("package.json");
  const releaseCheck = readText("scripts/release-check.mjs");
  const readiness = readText("docs/release-readiness.md");
  const manualValidation = readText("docs/manual-validation.md");
  const releaseEvidence = readText("docs/release-evidence.md");
  const recordedEvidence = releaseEvidence.split("## Evidence Still Needed Before Public Binary Release")[0] || "";
  const structuredEvidence = readJsonIfExists("docs/release-evidence.json");
  const ciWorkflow = readText(".github/workflows/ci.yml");
  const releaseWorkflow = readText(".github/workflows/release-artifacts.yml");

  return [
    {
      id: "project-form",
      requirement: "Layered open-source form decision is documented.",
      status: hasAll(readiness, ["Core runtime", "Integrations", "Agent workflows", "all of them"]) ? "automated" : "missing",
      evidence: ["docs/release-readiness.md", "docs/open-source-form-strategy.md"],
      next: "Keep the desktop app, adapters, MCP, skills, and plugin boundaries explicit."
    },
    {
      id: "windows-ci",
      requirement: "Windows source-level checks are wired.",
      status: hasAll(ciWorkflow, ["windows-2025"]) && hasScript(packageJson, "release:check") ? "automated" : "missing",
      evidence: [".github/workflows/ci.yml", "npm run release:check"],
      next: "Run release:check on Windows before tagging."
    },
    {
      id: "macos-ci",
      requirement: "macOS source-level checks are wired.",
      status: hasAll(ciWorkflow, ["macos-latest"]) ? "automated" : "missing",
      evidence: [".github/workflows/ci.yml"],
      next: "Run CI on a real macOS runner before tagging."
    },
    {
      id: "windows-packaged-runtime",
      requirement: "Windows packaged runtime smoke and low-memory soak have evidence.",
      status: hasPassed(structuredEvidence, ["windowsPackagedRuntime", "smoke"]) &&
        hasPassed(structuredEvidence, ["windowsPackagedRuntime", "soak"])
        ? "manual-recorded"
        : hasAll(recordedEvidence, ["Windows packaged smoke", "Windows packaged 10-minute soak", "maxWorkingSetMb: 152"]) ? "manual-recorded" : "manual-required",
      evidence: ["docs/release-evidence.md", "npm run smoke:packaged-win", "npm run soak:packaged-win"],
      next: "Refresh docs/release-evidence.md after each release candidate soak."
    },
    {
      id: "macos-packaged-runtime",
      requirement: "macOS packaged runtime and HUD behavior are verified on real macOS.",
      status: hasPassed(structuredEvidence, ["macosPackagedRuntime", "smoke"]) &&
        hasPassed(structuredEvidence, ["macosPackagedRuntime", "soak"]) &&
        hasPassed(structuredEvidence, ["macosPackagedRuntime", "hudPermissionStates"])
        ? "manual-recorded"
        : hasAll(recordedEvidence, ["macOS packaged smoke", "macOS packaged 10-minute soak", "Accessibility", "Screen Recording"]) ? "manual-recorded" : "external-required",
      evidence: ["docs/manual-validation.md", "npm run smoke:packaged-mac", "npm run soak:packaged-mac"],
      next: "Run smoke, soak, and permission-state HUD checks on a macOS host."
    },
    {
      id: "multi-tool-adapters",
      requirement: "Browser, IDE, MCP, SDK, local gateway, and importer adapters have automated coverage.",
      status: hasAll(releaseCheck, [
        "test:browser-extension-runtime",
        "test:browser-host-smoke",
        "test:ide-host-smoke",
        "test:vscode-extension-runtime",
        "test:mcp",
        "test:node-sdk",
        "test:hermes-bridge",
        "test:external-summary-import",
        "test:adapter-contract",
        "test:adapter-fixture",
        "test:adapter-guard",
        "test:adapter-manual-readiness"
      ]) ? "automated" : "missing",
      evidence: ["scripts/release-check.mjs", "adapters/catalog.json", "scripts/adapter-fixture.mjs"],
      next: "Keep adapters thin and update adapters/catalog.json for new tools."
    },
    {
      id: "browser-manual",
      requirement: "Browser extension is manually loaded in Chrome and Edge.",
      status: hasPassed(structuredEvidence, ["browserAdapter", "manualLoad"]) &&
        hasPassed(structuredEvidence, ["browserAdapter", "manualConnection"])
        ? "manual-recorded"
        : hasHostSmoke(structuredEvidence, ["browserAdapter", "hostSmoke"]) || hasAll(recordedEvidence, ["Chrome extension host smoke", "Edge extension host smoke"])
          ? "host-smoke-recorded"
          : hasAll(recordedEvidence, ["Chrome extension manual load", "Edge extension manual load"]) ? "manual-recorded" : "manual-required",
      evidence: ["docs/manual-validation.md", "npm run package:browser-extension", "npm run smoke:browser-hosts -- --require"],
      next: "Load adapters/browser-extension unpacked in Chrome and Edge, run the Options /health test, and record results."
    },
    {
      id: "ide-manual",
      requirement: "VS Code/Cursor adapter is manually verified.",
      status: hasPassed(structuredEvidence, ["ideAdapter", "manualLoad"]) &&
        hasPassed(structuredEvidence, ["ideAdapter", "manualConnection"])
        ? "manual-recorded"
        : hasHostSmoke(structuredEvidence, ["ideAdapter", "hostSmoke"]) || hasAll(recordedEvidence, ["VS Code extension host smoke", "Cursor extension host smoke"])
          ? "host-smoke-recorded"
          : hasAll(recordedEvidence, ["VS Code extension manual load", "Cursor extension manual load"]) ? "manual-recorded" : "manual-required",
      evidence: ["docs/manual-validation.md", "npm run package:vscode-extension", "npm run smoke:ide-hosts -- --require"],
      next: "Load the VSIX or extension folder in VS Code and Cursor and record results."
    },
    {
      id: "low-memory-gates",
      requirement: "Low-memory and low-polling rules are enforced.",
      status: hasAll(releaseCheck, ["test:performance-budget", "test:adapter-guard", "test:stability", "test:diagnostics", "test:lag-triage", "test:support-bundle", "test:soak-script", "test:hud-stability"]) ? "automated" : "missing",
      evidence: ["scripts/test-performance-budget.mjs", "scripts/performance-summary.mjs", "scripts/lag-triage.mjs", "scripts/support-bundle.mjs", "scripts/delight-contract.mjs", "scripts/adapter-guard.mjs", "scripts/test-stability.mjs", "scripts/test-diagnostics.mjs", "scripts/test-support-bundle.mjs", "scripts/test-soak-script.mjs", "scripts/test-hud-stability.mjs"],
      next: "Do not add new polling or animation loops without updating the budget."
    },
    {
      id: "privacy-security",
      requirement: "Privacy boundaries and secret redaction are documented and tested.",
      status: hasAll(releaseCheck, ["test:protocol", "test:secret-scan"]) && hasAll(readiness, ["Privacy/security"]) ? "automated" : "missing",
      evidence: ["docs/protocol.md", "PRIVACY.md", "SECURITY.md", "scripts/secret-scan.mjs", ".github/ISSUE_TEMPLATE/bug_report.yml"],
      next: "Never accept prompts, completions, cookies, API keys, or source files in events."
    },
    {
      id: "license-compliance",
      requirement: "Dependency licenses are compatible with open-source desktop and adapter distribution.",
      status: hasAll(releaseCheck, ["test:license-check"]) && hasAll(readiness, ["License compliance"]) ? "automated" : "missing",
      evidence: ["scripts/license-check.mjs", "docs/license-policy.md", "package-lock.json"],
      next: "Review or replace any dependency with unreviewed, missing, or copyleft license metadata."
    },
    {
      id: "signing",
      requirement: "Public binaries are signed/notarized.",
      status: hasPassed(structuredEvidence, ["signing", "windowsAuthenticode"]) &&
        hasPassed(structuredEvidence, ["signing", "macosNotarization"])
        ? "manual-recorded"
        : hasAll(recordedEvidence, ["Windows Authenticode signed", "macOS notarized"]) ? "manual-recorded" : "external-required",
      evidence: ["npm run signing:readiness -- --platform all --require", "docs/release.md"],
      next: "Run signing readiness with release secrets in the signing environment."
    },
    {
      id: "artifact-integrity",
      requirement: "Release artifacts have a manifest and SHA256 checksums.",
      status: hasAll(releaseCheck, ["test:release-manifest"]) &&
        hasScript(packageJson, "release:manifest") &&
        hasScript(packageJson, "verify:release-manifest") &&
        hasAll(releaseWorkflow, ["npm run release:manifest", "npm run verify:release-manifest"])
        ? "automated"
        : "missing",
      evidence: ["scripts/release-manifest.mjs", "release/release-manifest.json", "release/SHA256SUMS.txt"],
      next: "Generate and verify the release manifest after packaging artifacts."
    },
    {
      id: "npm-audit",
      requirement: "Dependency audit is clean at high severity.",
      status: hasPassed(structuredEvidence, ["dependencyAudit"]) || hasAll(recordedEvidence, ["npm audit --audit-level=high passed"]) ? "manual-recorded" : "network-required",
      evidence: ["npm audit --audit-level=high"],
      next: "Run npm audit with network access before publishing."
    },
    {
      id: "docs-quality",
      requirement: "Release-facing docs are readable and guard against mojibake.",
      status: hasAll(releaseCheck, ["test:docs"]) ? "automated" : "missing",
      evidence: ["scripts/test-doc-quality.mjs"],
      next: "Keep README and decision docs readable as UTF-8."
    }
  ];
}

function summarize(checks) {
  return checks.reduce((acc, check) => {
    acc.total += 1;
    acc[check.status] = (acc[check.status] || 0) + 1;
    if (!isReady(check.status)) acc.blocking += 1;
    return acc;
  }, { total: 0, blocking: 0 });
}

function printReport(report) {
  console.log("# Who Eats Token Release Gap Audit");
  console.log("");
  console.log(`Target: ${report.target}`);
  console.log(`Source beta ready: ${report.sourceBetaReady ? "yes" : "no"}`);
  console.log(`Public release ready: ${report.publicReleaseReady ? "yes" : "no"}`);
  console.log(`Blocking gaps: ${report.summary.blocking}/${report.summary.total}`);
  if (!report.sourceBetaReady) console.log(`Source beta blocking gaps: ${report.sourceBeta.blocking}/${report.sourceBeta.gateIds.length}`);
  console.log("");

  for (const check of report.checks) {
    const mark = isReady(check.status) ? "OK" : "TODO";
    console.log(`- ${mark} [${check.status}] ${check.id}: ${check.requirement}`);
    console.log(`  Evidence: ${check.evidence.join(", ")}`);
    if (!isReady(check.status)) console.log(`  Next: ${check.next}`);
  }
}

function isReady(status) {
  return status === "automated" || status === "manual-recorded";
}

function sourceBetaGateIds() {
  return [
    "project-form",
    "windows-ci",
    "macos-ci",
    "multi-tool-adapters",
    "low-memory-gates",
    "privacy-security",
    "license-compliance",
    "artifact-integrity",
    "npm-audit",
    "docs-quality"
  ];
}

function isSourceBetaGate(id) {
  return sourceBetaGateIds().includes(id);
}

function hasScript(packageJson, script) {
  return Boolean(packageJson.scripts?.[script]);
}

function hasAll(text, needles) {
  return needles.every((needle) => text.includes(needle));
}

function hasPassed(evidence, pathParts) {
  return getEvidence(evidence, pathParts)?.status === "passed";
}

function hasHostSmoke(evidence, pathParts) {
  return ["passed", "host-smoke-only"].includes(getEvidence(evidence, pathParts)?.status);
}

function getEvidence(evidence, pathParts) {
  return pathParts.reduce((value, key) => value?.[key], evidence?.evidence);
}

function readText(relativePath) {
  const absolutePath = path.join(root, relativePath);
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : "";
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readJsonIfExists(relativePath) {
  const text = readText(relativePath);
  return text ? JSON.parse(text) : null;
}

function parseArgs(argv) {
  const target = normalizeTarget(readArg(argv, "--target") || "public-binary");
  return {
    target,
    json: argv.includes("--json"),
    requirePublicRelease: argv.includes("--require-public-release"),
    requireSourceBeta: argv.includes("--require-source-beta")
  };
}

function readArg(argv, name) {
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === name) return argv[index + 1] || "";
    if (value.startsWith(`${name}=`)) return value.slice(name.length + 1);
  }
  return "";
}

function normalizeTarget(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["source", "source-beta", "beta"].includes(text)) return "source-beta";
  return "public-binary";
}
