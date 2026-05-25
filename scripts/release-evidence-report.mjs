import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = path.join(root, "docs", "release-evidence.json");
const markdownPath = path.join(root, "docs", "release-evidence.md");
const args = parseArgs(process.argv.slice(2));
const evidence = readJson(evidencePath);
const report = buildReport(evidence);
const markdown = renderMarkdown(report);

if (args.json) {
  console.log(JSON.stringify({
    ok: true,
    releaseCandidate: report.releaseCandidate,
    recordedCount: report.recorded.length,
    unresolvedCount: report.unresolved.length,
    recorded: report.recorded,
    unresolved: report.unresolved
  }, null, 2));
} else if (args.check) {
  const current = fs.existsSync(markdownPath) ? fs.readFileSync(markdownPath, "utf8") : "";
  if (normalizeText(current) !== normalizeText(markdown)) {
    console.error("docs/release-evidence.md is out of sync with docs/release-evidence.json.");
    console.error("Run: npm run release:evidence-report -- --write");
    process.exitCode = 1;
  } else {
    console.log("Release evidence report is in sync.");
  }
} else if (args.write) {
  fs.writeFileSync(markdownPath, markdown);
  console.log("Updated docs/release-evidence.md from docs/release-evidence.json.");
} else {
  console.log(markdown.trimEnd());
}

function buildReport(payload) {
  const entries = flattenEvidence(payload).map((entry) => ({
    ...entry,
    label: labelFor(entry.key),
    groupLabel: groupLabelFor(entry.key),
    readyForPublicRelease: isFullPass(entry.check)
  }));
  return {
    releaseCandidate: payload.releaseCandidate,
    generatedFrom: "docs/release-evidence.json",
    generatedAt: new Date().toISOString(),
    recorded: entries
      .filter((entry) => isRecorded(entry.check))
      .sort(compareEntries),
    unresolved: entries
      .filter((entry) => !isFullPass(entry.check))
      .sort(compareEntries)
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Release Evidence Log",
    "",
    "This file is generated from `docs/release-evidence.json`. Do not edit it by hand.",
    "",
    `Release candidate: \`${report.releaseCandidate}\``,
    "",
    "Validate and refresh it with:",
    "",
    "```powershell",
    "npm run test:release-evidence",
    "npm run release:evidence-quality -- --require-clean",
    "npm run release:evidence-report -- --check",
    "npm run release:evidence-report -- --write",
    "```",
    "",
    "## Recorded Evidence",
    ""
  ];

  if (report.recorded.length === 0) {
    lines.push("No recorded manual or external evidence yet.", "");
  } else {
    for (const entry of report.recorded) {
      lines.push(`### ${entry.label}`, "");
      lines.push(`- Key: \`${entry.key}\``);
      lines.push(`- Status: \`${entry.check.status}\``);
      lines.push(`- Recorded at: ${entry.check.recordedAt || "not recorded"}`);
      lines.push(`- Command: \`${entry.check.command}\``);
      lines.push(`- Notes: ${entry.check.notes || "not recorded"}`);
      if (entry.check.status === "host-smoke-only") {
        lines.push("- Public release note: this is partial host smoke evidence, not a full manual pass.");
      }
      lines.push("");
    }
  }

  lines.push("## Evidence Still Needed Before Public Binary Release", "");

  if (report.unresolved.length === 0) {
    lines.push("No unresolved release evidence remains.", "");
  } else {
    for (const entry of report.unresolved) {
      lines.push(`- ${entry.label}: \`${entry.check.status}\` - ${entry.check.notes || entry.check.command}`);
    }
    lines.push("");
  }

  lines.push("## Source Of Truth", "");
  lines.push("- Machine-readable record: `docs/release-evidence.json`");
  lines.push("- Schema: `docs/release-evidence.schema.json`");
  lines.push("- Recorder: `npm run release:evidence -- --list` and `npm run release:evidence -- --set ...`");
  lines.push("- Quality gate: `npm run release:evidence-quality -- --require-clean`");
  lines.push("- Gap audit: `npm run release:gaps -- --require-public-release`");
  lines.push("");

  return `${lines.join("\n")}`;
}

function flattenEvidence(payload) {
  const entries = [];
  for (const [groupName, group] of Object.entries(payload.evidence || {})) {
    if (group?.status) {
      entries.push({ key: groupName, check: group });
      continue;
    }
    for (const [checkName, check] of Object.entries(group || {})) {
      entries.push({ key: `${groupName}.${checkName}`, check });
    }
  }
  return entries;
}

function isRecorded(check) {
  return check.status === "passed" || check.status === "host-smoke-only" || check.status === "failed" || check.status === "blocked";
}

function isFullPass(check) {
  return check.status === "passed";
}

function compareEntries(left, right) {
  return orderFor(left.key) - orderFor(right.key) || left.key.localeCompare(right.key);
}

function orderFor(key) {
  const order = [
    "windowsPackagedRuntime.smoke",
    "windowsPackagedRuntime.soak",
    "windowsPackagedRuntime.hudPermissionStates",
    "macosPackagedRuntime.smoke",
    "macosPackagedRuntime.soak",
    "macosPackagedRuntime.hudPermissionStates",
    "browserAdapter.hostSmoke",
    "browserAdapter.manualLoad",
    "browserAdapter.manualConnection",
    "ideAdapter.hostSmoke",
    "ideAdapter.manualLoad",
    "ideAdapter.manualConnection",
    "signing.windowsAuthenticode",
    "signing.macosNotarization",
    "dependencyAudit"
  ];
  const index = order.indexOf(key);
  return index === -1 ? 999 : index;
}

function labelFor(key) {
  return {
    "windowsPackagedRuntime.smoke": "Windows packaged smoke",
    "windowsPackagedRuntime.soak": "Windows packaged 10-minute soak",
    "windowsPackagedRuntime.hudPermissionStates": "Windows HUD desktop/tool placement check",
    "macosPackagedRuntime.smoke": "macOS packaged smoke",
    "macosPackagedRuntime.soak": "macOS packaged 10-minute soak",
    "macosPackagedRuntime.hudPermissionStates": "macOS Accessibility and Screen Recording permission-state HUD checks",
    "browserAdapter.hostSmoke": "Browser host smoke",
    "browserAdapter.manualLoad": "Chrome manual load and Edge manual load",
    "browserAdapter.manualConnection": "Browser extension Options /health connection",
    "ideAdapter.hostSmoke": "VS Code/Cursor host smoke",
    "ideAdapter.manualLoad": "VS Code extension manual load and Cursor extension manual load",
    "ideAdapter.manualConnection": "VS Code/Cursor status bar and snapshot manual check",
    "signing.windowsAuthenticode": "Windows Authenticode signed artifact",
    "signing.macosNotarization": "macOS notarized artifact",
    "dependencyAudit": "Dependency audit"
  }[key] || key;
}

function groupLabelFor(key) {
  return key.split(".")[0];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trimEnd();
}

function parseArgs(argv) {
  return {
    check: argv.includes("--check"),
    write: argv.includes("--write"),
    json: argv.includes("--json")
  };
}
