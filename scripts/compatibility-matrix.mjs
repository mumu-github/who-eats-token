import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "docs", "compatibility-matrix.md");
const args = parseArgs(process.argv.slice(2));

const packageJson = readJson("package.json");
const catalog = readJson("adapters/catalog.json");
const manualValidation = read("docs/manual-validation.md");
const ciWorkflow = read(".github/workflows/ci.yml");
const releaseGaps = runReleaseGaps();
const matrix = buildMatrix();
const markdown = renderMarkdown(matrix);

if (args.json) {
  console.log(JSON.stringify(matrix, null, 2));
} else if (args.check) {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  if (normalizeNewlines(current) !== normalizeNewlines(markdown)) {
    console.error("docs/compatibility-matrix.md is out of date. Run `npm run compatibility:matrix`.");
    process.exit(1);
  }
  console.log("Compatibility matrix is up to date.");
} else {
  fs.writeFileSync(outputPath, markdown, "utf8");
  console.log(`Wrote ${path.relative(root, outputPath).replaceAll("\\", "/")}`);
}

if (args.requireClean && !matrix.ok) {
  process.exitCode = 1;
}

function buildMatrix() {
  const adapters = (catalog.adapters || []).map(summarizeAdapter);
  const platformRows = [
    platformRow("windows", "Windows 10+", {
      ciNeedle: "windows-2025-vs2026",
      manualNeedle: "## Windows 10+",
      smokeScript: "smoke:packaged-win",
      soakScript: "soak:packaged-win",
      releaseGapId: "windows-packaged-runtime"
    }),
    platformRow("macos", "macOS", {
      ciNeedle: "macos-latest",
      manualNeedle: "## macOS",
      smokeScript: "smoke:packaged-mac",
      soakScript: "soak:packaged-mac",
      releaseGapId: "macos-packaged-runtime"
    })
  ];
  const signals = summarizeSignals(adapters);
  const findings = [
    ...validatePlatforms(platformRows),
    ...validateAdapters(adapters),
    ...validateSignals(signals)
  ];

  return {
    ok: findings.every((finding) => finding.severity !== "error"),
    schema: "who-eats-token.compatibility-matrix.v1",
    generatedAt: new Date().toISOString(),
    catalogUpdated: catalog.updated || null,
    platformTargets: platformRows,
    adapterSummary: {
      total: adapters.length,
      supported: adapters.filter((adapter) => adapter.status === "supported").length,
      reference: adapters.filter((adapter) => adapter.status === "reference").length,
      planned: adapters.filter((adapter) => adapter.status === "planned").length,
      windows: adapters.filter((adapter) => adapter.platforms.includes("windows")).length,
      macos: adapters.filter((adapter) => adapter.platforms.includes("macos")).length
    },
    signalCoverage: signals,
    adapters,
    releaseBlockers: releaseGaps.blocking,
    commands: [
      "npm run compatibility:matrix",
      "npm run compatibility:matrix -- -- --json",
      "npm run compatibility:matrix -- -- --check",
      "npm run test:compatibility-matrix",
      "npm run adapter:review",
      "npm run adapter:signal-matrix -- -- --check",
      "npm run release:gaps -- -- --json"
    ],
    findings
  };
}

function platformRow(id, label, config) {
  const gap = releaseGaps.checks.find((check) => check.id === config.releaseGapId);
  return {
    id,
    label,
    sourceLevelCi: ciWorkflow.includes(config.ciNeedle),
    manualChecklist: manualValidation.includes(config.manualNeedle),
    packagedSmokeScript: Boolean(packageJson.scripts?.[config.smokeScript]),
    packagedSoakScript: Boolean(packageJson.scripts?.[config.soakScript]),
    releaseStatus: gap?.status || "missing",
    releaseRequirement: gap?.requirement || "",
    next: gap?.next || "",
    commands: [config.smokeScript, config.soakScript].filter((script) => packageJson.scripts?.[script]).map((script) => `npm run ${script}`)
  };
}

function summarizeAdapter(adapter) {
  const automatedChecks = Array.isArray(adapter.automatedChecks) ? adapter.automatedChecks : [];
  const docs = Array.isArray(adapter.docs) ? adapter.docs : [];
  const entrypoints = Array.isArray(adapter.entrypoints) ? adapter.entrypoints : [];
  return {
    id: adapter.id,
    name: adapter.name,
    type: adapter.type,
    status: adapter.status,
    platforms: adapter.platforms || [],
    providedSignals: adapter.providedSignals || [],
    docs,
    entrypoints,
    automatedChecks,
    manualChecks: adapter.manualChecks || [],
    hasWindows: (adapter.platforms || []).includes("windows"),
    hasMacos: (adapter.platforms || []).includes("macos"),
    automatedChecksExist: automatedChecks.every((script) => Boolean(packageJson.scripts?.[script])),
    docsExist: docs.every((doc) => exists(doc)),
    entrypointsExist: adapter.status === "planned" || entrypoints.every((entrypoint) => exists(entrypoint)),
    verificationLevel: getVerificationLevel(adapter, automatedChecks),
    publicClaim: getPublicClaim(adapter)
  };
}

function getVerificationLevel(adapter, automatedChecks) {
  if (adapter.status === "planned") return "planned";
  if (automatedChecks.some((script) => /smoke|package|runtime|hud|health|bridge/i.test(script))) return "runtime-check";
  if (automatedChecks.length > 0) return "static-check";
  return "manual-only";
}

function getPublicClaim(adapter) {
  if (adapter.status === "supported") return "first-class";
  if (adapter.status === "reference") return "reference";
  return "planned";
}

function summarizeSignals(adapters) {
  const counts = {};
  for (const adapter of adapters) {
    for (const signal of adapter.providedSignals) {
      if (!counts[signal]) {
        counts[signal] = {
          signal,
          adapters: [],
          supported: 0,
          reference: 0,
          planned: 0
        };
      }
      counts[signal].adapters.push(adapter.id);
      counts[signal][adapter.status] += 1;
    }
  }
  return Object.values(counts).sort((a, b) => a.signal.localeCompare(b.signal));
}

function validatePlatforms(platforms) {
  const findings = [];
  for (const platform of platforms) {
    if (!platform.sourceLevelCi) add(findings, "error", "platform-ci", `${platform.label} is missing source-level CI.`);
    if (!platform.manualChecklist) add(findings, "error", "platform-manual", `${platform.label} is missing manual validation checklist.`);
    if (!platform.packagedSmokeScript) add(findings, "error", "platform-smoke", `${platform.label} is missing packaged smoke script.`);
    if (!platform.packagedSoakScript) add(findings, "error", "platform-soak", `${platform.label} is missing packaged soak script.`);
  }
  return findings;
}

function validateAdapters(adapters) {
  const findings = [];
  for (const adapter of adapters) {
    if (!adapter.hasWindows || !adapter.hasMacos) {
      add(findings, "error", "adapter-platforms", `${adapter.id} must explicitly target both Windows and macOS or stay out of public compatibility claims.`);
    }
    if (!adapter.docsExist) add(findings, "error", "adapter-docs", `${adapter.id} references missing docs.`);
    if (!adapter.entrypointsExist) add(findings, "error", "adapter-entrypoints", `${adapter.id} references missing entrypoints.`);
    if (!adapter.automatedChecksExist) add(findings, "error", "adapter-checks", `${adapter.id} references missing automated checks.`);
    if (adapter.status === "supported" && adapter.verificationLevel === "manual-only") {
      add(findings, "error", "supported-coverage", `${adapter.id} is supported but has no automated verification.`);
    }
  }
  return findings;
}

function validateSignals(signals) {
  const findings = [];
  const available = new Set(signals.map((entry) => entry.signal));
  for (const required of ["usage-tokens", "usage-events", "quota-capacity", "quota-token-plan", "hud-overlays", "local-health", "provider-health", "snapshot-read"]) {
    if (!available.has(required)) add(findings, "error", "signal-coverage", `Missing compatibility signal coverage: ${required}.`);
  }
  return findings;
}

function runReleaseGaps() {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "release-gap-audit.mjs"), "--json"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0 || result.error) {
    return {
      ok: false,
      checks: [],
      blocking: [],
      error: result.error?.message || result.stderr || `release-gap-audit exited ${result.status}`
    };
  }
  const parsed = JSON.parse(result.stdout);
  return {
    ok: parsed.ok,
    checks: parsed.checks || [],
    blocking: (parsed.checks || []).filter((check) => ["external-required", "manual-required", "host-smoke-recorded"].includes(check.status))
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Compatibility Matrix",
    "",
    "Generated from `adapters/catalog.json`, `docs/manual-validation.md`, CI workflows, and the release gap audit. Do not edit this file by hand; run `npm run compatibility:matrix`.",
    "",
    `Catalog updated: ${report.catalogUpdated || "--"}`,
    "",
    "## Platform Targets",
    "",
    "| Platform | Source CI | Manual checklist | Packaged smoke | Packaged soak | Release status | Next |",
    "| --- | --- | --- | --- | --- | --- | --- |"
  ];

  for (const platform of report.platformTargets) {
    lines.push([
      platform.label,
      yes(platform.sourceLevelCi),
      yes(platform.manualChecklist),
      yes(platform.packagedSmokeScript),
      yes(platform.packagedSoakScript),
      code(platform.releaseStatus),
      escapePipe(platform.next || "")
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  lines.push(
    "",
    "## Adapter Compatibility",
    "",
    "| Adapter | Claim | Status | Type | Platforms | Verification | Signals |",
    "| --- | --- | --- | --- | --- | --- | --- |"
  );

  for (const adapter of report.adapters) {
    lines.push([
      linkAdapter(adapter),
      code(adapter.publicClaim),
      code(adapter.status),
      code(adapter.type),
      adapter.platforms.map(code).join(", "),
      code(adapter.verificationLevel),
      adapter.providedSignals.map(code).join(", ")
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  lines.push(
    "",
    "## Signal Coverage",
    "",
    "| Signal | Adapters | Supported | Reference | Planned |",
    "| --- | --- | --- | --- | --- |"
  );

  for (const signal of report.signalCoverage) {
    lines.push([
      code(signal.signal),
      signal.adapters.map(code).join(", "),
      String(signal.supported),
      String(signal.reference),
      String(signal.planned)
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  lines.push(
    "",
    "## Current Public Release Blockers",
    ""
  );

  if (report.releaseBlockers.length === 0) {
    lines.push("None recorded.");
  } else {
    for (const blocker of report.releaseBlockers) {
      lines.push(`- \`${blocker.id}\` (${blocker.status}): ${blocker.next}`);
    }
  }

  lines.push(
    "",
    "## Checks",
    "",
    "```powershell",
    "npm run compatibility:matrix -- -- --check",
    "npm run test:compatibility-matrix",
    "npm run adapter:review",
    "npm run release:gaps -- -- --json",
    "npm run release:check",
    "```",
    ""
  );

  return `${lines.join("\n")}`;
}

function linkAdapter(adapter) {
  const firstDoc = adapter.docs.find((doc) => doc.endsWith(".md"));
  if (!firstDoc) return code(adapter.name || adapter.id);
  return `[${escapePipe(adapter.name || adapter.id)}](../${firstDoc})`;
}

function yes(value) {
  return value ? "yes" : "no";
}

function code(value) {
  return `\`${escapePipe(String(value || ""))}\``;
}

function escapePipe(value) {
  return String(value).replaceAll("|", "\\|");
}

function normalizeNewlines(value) {
  return String(value).replace(/\r\n/g, "\n");
}

function add(findings, severity, id, message) {
  findings.push({ severity, id, message });
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function parseArgs(argv) {
  return {
    json: argv.includes("--json"),
    check: argv.includes("--check"),
    requireClean: argv.includes("--require-clean")
  };
}
