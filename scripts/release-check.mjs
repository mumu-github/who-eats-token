import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliArgs = parseArgs(process.argv.slice(2));
const npmRunner = getNpmRunner();
const commandTimeoutMs = cliArgs.commandTimeoutMs ?? numberFromEnv("WHO_EATS_TOKEN_RELEASE_CHECK_TIMEOUT_MS", 180_000);
const slowCommandMs = cliArgs.slowMs ?? numberFromEnv("WHO_EATS_TOKEN_RELEASE_CHECK_SLOW_MS", 30_000);
const requiredFiles = [
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "PRIVACY.md",
  "CONTRIBUTING.md",
  "package-lock.json"
];
const commands = [
  npmRunner(["run", "check"]),
  npmRunner(["run", "test:protocol"]),
  npmRunner(["run", "test:browser-extension"]),
  npmRunner(["run", "test:browser-extension-runtime"]),
  npmRunner(["run", "test:browser-host-smoke"]),
  npmRunner(["run", "test:ide-host-smoke"]),
  npmRunner(["run", "test:node-sdk"]),
  npmRunner(["run", "test:local-health"]),
  npmRunner(["run", "test:codex-collector"]),
  npmRunner(["run", "test:provider-health"]),
  npmRunner(["run", "test:quota-delight"]),
  npmRunner(["run", "test:delight-contract"]),
  npmRunner(["run", "test:external-summary-import"]),
  npmRunner(["run", "test:status"]),
  npmRunner(["run", "test:stability"]),
  npmRunner(["run", "test:diagnostics"]),
  npmRunner(["run", "test:lag-triage"]),
  npmRunner(["run", "test:support-bundle"]),
  npmRunner(["run", "test:secret-scan"]),
  npmRunner(["run", "test:license-check"]),
  npmRunner(["run", "test:docs"]),
  npmRunner(["run", "test:release-evidence"]),
  npmRunner(["run", "test:release-evidence-cli"]),
  npmRunner(["run", "test:release-evidence-quality"]),
  npmRunner(["run", "test:release-evidence-report"]),
  npmRunner(["run", "test:validation-next"]),
  npmRunner(["run", "test:validation-template"]),
  npmRunner(["run", "test:release-gaps"]),
  npmRunner(["run", "test:release-summary"]),
  npmRunner(["run", "test:release-check"]),
  npmRunner(["run", "test:release-manifest"]),
  npmRunner(["run", "test:release-validation-pack"]),
  npmRunner(["run", "test:manual-preflight"]),
  npmRunner(["run", "test:signing-readiness"]),
  npmRunner(["run", "test:performance-budget"]),
  npmRunner(["run", "test:performance-summary"]),
  npmRunner(["run", "test:soak-script"]),
  npmRunner(["run", "test:hud-stability"]),
  npmRunner(["run", "test:overlay-state"]),
  npmRunner(["run", "test:tool-detection"]),
  npmRunner(["run", "test:display-adapter"]),
  npmRunner(["run", "test:overlay-layout-geometry"]),
  npmRunner(["run", "test:overlay-layout-hud"]),
  npmRunner(["run", "test:hud-payload"]),
  npmRunner(["run", "test:window-detection"]),
  npmRunner(["run", "test:adapter-catalog"]),
  npmRunner(["run", "test:adapter-contract"]),
  npmRunner(["run", "test:adapter-review"]),
  npmRunner(["run", "test:adapter-fixture"]),
  npmRunner(["run", "test:adapter-guard"]),
  npmRunner(["run", "test:adapter-contribution"]),
  npmRunner(["run", "test:adapter-signal-matrix"]),
  npmRunner(["run", "test:adapter-manual-readiness"]),
  npmRunner(["run", "test:compatibility-matrix"]),
  npmRunner(["run", "test:release-readiness"]),
  npmRunner(["run", "test:packaging"]),
  npmRunner(["run", "test:adapter-packages"]),
  npmRunner(["run", "test:skills"]),
  npmRunner(["run", "test:plugin"]),
  npmRunner(["run", "test:vscode-extension"]),
  npmRunner(["run", "test:vscode-extension-runtime"]),
  npmRunner(["run", "test:mcp"]),
  npmRunner(["run", "test:hermes-bridge"])
];

if (cliArgs.list) {
  const report = buildListReport();
  if (cliArgs.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printListReport(report);
  }
  process.exit(0);
}

let failed = false;
const timings = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    failed = true;
    console.error(`Missing required open-source file: ${file}`);
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (manifest.private !== false) {
  failed = true;
  console.error("package.json must set private=false before release.");
}
if (!manifest.license) {
  failed = true;
  console.error("package.json must declare a license.");
}

for (const [command, commandArgs] of commands) {
  const startedAt = Date.now();
  const label = formatCommand(command, commandArgs);
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: "inherit",
    timeout: commandTimeoutMs > 0 ? commandTimeoutMs : undefined,
    windowsHide: true
  });
  const durationMs = Date.now() - startedAt;
  timings.push({ label, durationMs, status: result.status ?? 1 });
  console.log(`release-check: ${label} finished in ${formatDuration(durationMs)}`);
  if (result.error) {
    failed = true;
    if (result.error.code === "ETIMEDOUT") {
      console.error(`Timed out running ${label} after ${formatDuration(commandTimeoutMs)}.`);
    } else {
      console.error(`Failed to run ${label}: ${result.error.message}`);
    }
    continue;
  }
  if (result.status !== 0) failed = true;
}

if (failed) {
  process.exitCode = 1;
} else {
  printSlowCommands(timings);
  console.log("Release checks passed.");
}

function printSlowCommands(entries) {
  const slow = entries.filter((entry) => entry.durationMs >= slowCommandMs);
  if (slow.length === 0) return;
  console.log("");
  console.log("Slow release-check commands:");
  for (const entry of slow) {
    console.log(`- ${entry.label}: ${formatDuration(entry.durationMs)}`);
  }
}

function buildListReport() {
  return {
    ok: true,
    schema: "who-eats-token.release-check-list.v1",
    commandCount: commands.length,
    commandTimeoutMs,
    slowCommandMs,
    requiredFiles,
    commands: commands.map(([command, commandArgs]) => ({
      label: formatCommand(command, commandArgs)
    }))
  };
}

function printListReport(report) {
  console.log("# Release Check Command List");
  console.log("");
  console.log(`Commands: ${report.commandCount}`);
  console.log(`Per-command timeout: ${formatDuration(report.commandTimeoutMs)}`);
  console.log(`Slow-command threshold: ${formatDuration(report.slowCommandMs)}`);
  console.log("");
  for (const command of report.commands) {
    console.log(`- ${command.label}`);
  }
}

function formatCommand(command, commandArgs) {
  const runIndex = commandArgs.indexOf("run");
  if (runIndex !== -1 && commandArgs[runIndex + 1]) {
    return `npm run ${commandArgs[runIndex + 1]}`;
  }
  return [command, ...commandArgs].join(" ");
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "disabled";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function parseArgs(argv) {
  const parsed = {
    list: argv.includes("--list"),
    json: argv.includes("--json"),
    commandTimeoutMs: null,
    slowMs: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--command-timeout-ms") {
      parsed.commandTimeoutMs = Number(argv[++index]);
    } else if (value.startsWith("--command-timeout-ms=")) {
      parsed.commandTimeoutMs = Number(value.slice("--command-timeout-ms=".length));
    } else if (value === "--slow-ms") {
      parsed.slowMs = Number(argv[++index]);
    } else if (value.startsWith("--slow-ms=")) {
      parsed.slowMs = Number(value.slice("--slow-ms=".length));
    }
  }
  if (!Number.isFinite(parsed.commandTimeoutMs)) parsed.commandTimeoutMs = null;
  if (!Number.isFinite(parsed.slowMs)) parsed.slowMs = null;
  return parsed;
}

function getNpmRunner() {
  const npmCli = process.env.npm_execpath;
  if (npmCli) {
    return (args) => [process.execPath, [npmCli, ...args]];
  }

  if (process.platform === "win32") {
    return (args) => ["cmd.exe", ["/d", "/s", "/c", "npm", ...args]];
  }

  return (args) => ["npm", args];
}
