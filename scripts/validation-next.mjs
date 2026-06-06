import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const evidence = JSON.parse(fs.readFileSync(path.join(root, "docs", "release-evidence.json"), "utf8"));
const actions = buildActions(evidence, args.target);
const report = {
  ok: actions.length === 0,
  releaseCandidate: evidence.releaseCandidate,
  target: args.target,
  generatedAt: new Date().toISOString(),
  summary: summarize(actions),
  actions
};

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report);
}

function buildActions(payload, target) {
  return validationPlan()
    .filter((entry) => target === "all" || entry.target === target)
    .map((entry) => {
      const check = getCheck(payload, entry.key);
      return {
        ...entry,
        status: check?.status || "missing",
        recordedAt: check?.recordedAt || "",
        currentCommand: check?.command || "",
        currentNotes: check?.notes || "",
        recordCommand: evidenceCommand(entry.key, entry.recordStatus, entry.command, entry.notesTemplate)
      };
    })
    .filter((entry) => needsAction(entry))
    .sort((left, right) => priority(left) - priority(right) || left.key.localeCompare(right.key));
}

function validationPlan() {
  return [
    {
      target: "macos",
      phase: "macOS runtime",
      key: "macosPackagedRuntime.smoke",
      kind: "external",
      command: "npm run smoke:packaged-mac",
      recordStatus: "passed",
      notesTemplate: "macOS version, app path, /snapshot health, and smoke result."
    },
    {
      target: "macos",
      phase: "macOS runtime",
      key: "macosPackagedRuntime.soak",
      kind: "external",
      command: "npm run soak:packaged-mac",
      recordStatus: "passed",
      notesTemplate: "Duration, max RSS, memory growth, max CPU, and local API shutdown result."
    },
    {
      target: "macos",
      phase: "macOS runtime",
      key: "macosPackagedRuntime.hudPermissionStates",
      kind: "manual",
      command: "manual macOS Accessibility and Screen Recording granted/denied check",
      recordStatus: "passed",
      notesTemplate: "HUD behavior with both permissions granted and denied."
    },
    {
      target: "browser",
      phase: "Browser adapter",
      key: "browserAdapter.hostSmoke",
      kind: "host-smoke",
      command: "npm run smoke:browser-hosts -- -- --require",
      recordStatus: "host-smoke-only",
      notesTemplate: "Chrome/Edge host smoke result. Use host-smoke-only unless full Options flow was checked."
    },
    {
      target: "browser",
      phase: "Browser adapter",
      key: "browserAdapter.manualLoad",
      kind: "manual",
      command: "Chrome and Edge load adapters/browser-extension unpacked",
      recordStatus: "passed",
      notesTemplate: "Chrome and Edge versions, extension id, and enabled state."
    },
    {
      target: "browser",
      phase: "Browser adapter",
      key: "browserAdapter.manualConnection",
      kind: "manual",
      command: "Browser extension Options /health connection test",
      recordStatus: "passed",
      notesTemplate: "Local token, /health result, and Options page status in Chrome and Edge."
    },
    {
      target: "ide",
      phase: "IDE adapter",
      key: "ideAdapter.hostSmoke",
      kind: "host-smoke",
      command: "npm run smoke:ide-hosts -- -- --require",
      recordStatus: "host-smoke-only",
      notesTemplate: "VS Code/Cursor VSIX install and list result on the validation machine."
    },
    {
      target: "ide",
      phase: "IDE adapter",
      key: "ideAdapter.manualLoad",
      kind: "manual",
      command: "Install VSIX in VS Code and Cursor",
      recordStatus: "passed",
      notesTemplate: "VS Code and Cursor versions, adapter id, and loaded state."
    },
    {
      target: "ide",
      phase: "IDE adapter",
      key: "ideAdapter.manualConnection",
      kind: "manual",
      command: "VS Code/Cursor status bar /health, refresh, and copy snapshot checks",
      recordStatus: "passed",
      notesTemplate: "Status bar, refresh command, and copy snapshot behavior in both hosts."
    },
    {
      target: "signing",
      phase: "Signing",
      key: "signing.windowsAuthenticode",
      kind: "external",
      command: "npm run signing:readiness -- -- --platform windows --require",
      recordStatus: "passed",
      notesTemplate: "Signed Windows artifact names and certificate subject."
    },
    {
      target: "signing",
      phase: "Signing",
      key: "signing.macosNotarization",
      kind: "external",
      command: "npm run signing:readiness -- -- --platform macos --require",
      recordStatus: "passed",
      notesTemplate: "Notarized macOS artifact names and notary result."
    },
    {
      target: "audit",
      phase: "Dependency audit",
      key: "dependencyAudit",
      kind: "network",
      command: "npm audit --audit-level=high --registry=https://registry.npmjs.org/",
      recordStatus: "passed",
      notesTemplate: "Audit completed against the public npm registry with zero high-severity vulnerabilities."
    }
  ];
}

function needsAction(entry) {
  if (entry.status === "passed") return false;
  if (entry.kind === "host-smoke" && entry.status === "host-smoke-only") return false;
  return true;
}

function priority(entry) {
  const weights = {
    browser: 10,
    ide: 20,
    macos: 30,
    signing: 40,
    audit: 50
  };
  return weights[entry.target] || 99;
}

function summarize(actions) {
  return actions.reduce((summary, action) => {
    summary.total += 1;
    summary[action.target] = (summary[action.target] || 0) + 1;
    summary[action.kind] = (summary[action.kind] || 0) + 1;
    return summary;
  }, { total: 0 });
}

function getCheck(payload, key) {
  const parts = key.split(".");
  if (parts.length === 1) return payload.evidence?.[parts[0]] || null;
  if (parts.length === 2) return payload.evidence?.[parts[0]]?.[parts[1]] || null;
  return null;
}

function evidenceCommand(key, status, command, notes) {
  return `npm run release:evidence -- -- --set ${key} --status ${status} --command "${command}" --notes "${notes}"`;
}

function printReport(report) {
  console.log("# Next Release Validation Actions");
  console.log("");
  console.log(`Release candidate: ${report.releaseCandidate}`);
  console.log(`Target: ${report.target}`);
  console.log(`Open actions: ${report.summary.total}`);
  if (report.actions.length === 0) {
    console.log("");
    console.log("No remaining validation actions for this target.");
    return;
  }

  for (const action of report.actions) {
    console.log("");
    console.log(`- TODO [${action.status}] ${action.key}`);
    console.log(`  Phase: ${action.phase}`);
    console.log(`  Run/check: ${action.command}`);
    console.log(`  Record: ${action.recordCommand}`);
  }
}

function parseArgs(argv) {
  const parsed = {
    target: "all",
    json: argv.includes("--json")
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--target") {
      parsed.target = normalizeTarget(argv[index + 1]);
      index += 1;
    } else if (value.startsWith("--target=")) {
      parsed.target = normalizeTarget(value.slice("--target=".length));
    }
  }
  return parsed;
}

function normalizeTarget(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["browser", "ide", "macos", "signing", "audit", "all"].includes(text)) return text;
  if (["mac", "darwin", "osx"].includes(text)) return "macos";
  return "all";
}
