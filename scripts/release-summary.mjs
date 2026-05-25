import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const packageJson = readJson("package.json");

const releaseGaps = runJsonCommand("release:gaps", ["scripts/release-gap-audit.mjs", "--json"]);
const nextActions = runJsonCommand("validation:next", ["scripts/validation-next.mjs", "--json"]);
const secretScan = runJsonCommand("secret:scan", ["scripts/secret-scan.mjs", "--json"]);
const licenseCheck = runJsonCommand("license:check", ["scripts/license-check.mjs", "--json"]);
const guards = buildGuards(secretScan, licenseCheck);
const blocking = Array.isArray(releaseGaps.data?.checks)
  ? releaseGaps.data.checks.filter((check) => !isReady(check.status))
  : [];
const report = {
  ok: Boolean(releaseGaps.data?.publicReleaseReady) && guards.ready,
  generatedAt: new Date().toISOString(),
  package: {
    name: packageJson.name,
    version: packageJson.version
  },
  publicReleaseReady: Boolean(releaseGaps.data?.publicReleaseReady),
  guardReady: guards.ready,
  guards,
  releaseGaps: {
    ok: releaseGaps.ok,
    status: releaseGaps.status,
    summary: releaseGaps.data?.summary || { total: 0, blocking: 0 },
    blocking: blocking.map((check) => ({
      id: check.id,
      status: check.status,
      requirement: check.requirement,
      evidence: check.evidence,
      next: check.next
    }))
  },
  nextActions: {
    ok: nextActions.ok,
    status: nextActions.status,
    releaseCandidate: nextActions.data?.releaseCandidate || "",
    summary: nextActions.data?.summary || { total: 0 },
    actions: Array.isArray(nextActions.data?.actions)
      ? nextActions.data.actions.map((action) => ({
        target: action.target,
        key: action.key,
        status: action.status,
        kind: action.kind,
        command: action.command,
        recordCommand: action.recordCommand
      }))
      : []
  },
  commands: [
    "npm run release:summary",
    "npm run release:summary -- --json",
    "npm run release:check -- --list --json",
    "npm run release:gaps -- --require-public-release",
    "npm run validation:next",
    "npm run validation:template -- --target browser",
    "npm run release:evidence-quality -- --require-clean",
    "npm run release:evidence-report -- --check",
    "npm run adapter:review",
    "npm run secret:scan",
    "npm run license:check"
  ]
};

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report);
}

if (args.requirePublicRelease && !report.ok) {
  process.exitCode = 1;
}

function buildGuards(secretScanResult, licenseCheckResult) {
  const secretFindings = Number(secretScanResult.data?.findingCount || secretScanResult.data?.findings?.length || 0);
  const licenseFindings = Number(licenseCheckResult.data?.findingCount || licenseCheckResult.data?.findings?.length || 0);
  return {
    ready: Boolean(secretScanResult.data?.ok) && Boolean(licenseCheckResult.data?.ok) && secretFindings === 0 && licenseFindings === 0,
    secret: {
      ok: Boolean(secretScanResult.data?.ok) && secretFindings === 0,
      status: secretScanResult.status,
      findingCount: secretFindings
    },
    license: {
      ok: Boolean(licenseCheckResult.data?.ok) && licenseFindings === 0,
      status: licenseCheckResult.status,
      findingCount: licenseFindings,
      packageCount: Number(licenseCheckResult.data?.packageCount || 0),
      reviewedCount: Number(licenseCheckResult.data?.reviewed?.length || 0)
    }
  };
}

function runJsonCommand(name, commandArgs) {
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const data = parseJson(result.stdout, name);
  return {
    name,
    ok: result.status === 0 && Boolean(data?.ok),
    status: result.status ?? 1,
    data,
    stderr: result.stderr.trim()
  };
}

function parseJson(stdout, name) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    return {
      ok: false,
      parseError: `Could not parse ${name} JSON output: ${error.message}`
    };
  }
}

function printReport(report) {
  console.log("# Who Eats Token Release Summary");
  console.log("");
  console.log(`Version: ${report.package.name}@${report.package.version}`);
  console.log(`Public release ready: ${report.publicReleaseReady ? "yes" : "no"}`);
  console.log(`Source guards: ${report.guardReady ? "OK" : "needs attention"}`);
  console.log(`- secret: ${report.guards.secret.ok ? "OK" : "TODO"} (${report.guards.secret.findingCount} findings)`);
  console.log(`- license: ${report.guards.license.ok ? "OK" : "TODO"} (${report.guards.license.findingCount} findings, ${report.guards.license.packageCount} packages, ${report.guards.license.reviewedCount} reviewed exceptions)`);
  console.log(`Blocking gaps: ${report.releaseGaps.summary.blocking || 0}/${report.releaseGaps.summary.total || 0}`);
  console.log(`Open validation actions: ${report.nextActions.summary.total || 0}`);
  console.log("");

  const targets = summarizeActionTargets(report.nextActions.actions);
  if (targets.length > 0) {
    console.log("Next action targets:");
    for (const [target, count] of targets) {
      console.log(`- ${target}: ${count}`);
    }
    console.log("");
  }

  if (report.releaseGaps.blocking.length > 0) {
    console.log("Blocking checks:");
    for (const check of report.releaseGaps.blocking) {
      console.log(`- [${check.status}] ${check.id}: ${check.requirement}`);
      console.log(`  Next: ${check.next}`);
    }
    console.log("");
  }

  console.log("Useful commands:");
  for (const command of report.commands) {
    console.log(`- ${command}`);
  }
}

function summarizeActionTargets(actions) {
  const counts = new Map();
  for (const action of actions) {
    counts.set(action.target, (counts.get(action.target) || 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => left[0].localeCompare(right[0]));
}

function isReady(status) {
  return status === "automated" || status === "manual-recorded";
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function parseArgs(argv) {
  return {
    json: argv.includes("--json"),
    requirePublicRelease: argv.includes("--require-public-release")
  };
}
