import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createWhoEatsTokenClient } = require("../src/sdk/client.cjs");
const {
  buildStabilityReport,
  formatStabilityReport,
  shouldFail
} = require("../src/diagnostics/stability-report.cjs");

const args = parseArgs(process.argv.slice(2));
const client = createWhoEatsTokenClient({
  endpoint: args.endpoint,
  token: args.token,
  timeoutMs: args.timeoutMs
});
const result = await client.getSnapshot();

if (!result.ok) {
  const payload = {
    ok: false,
    endpoint: client.endpoint,
    error: result.error || result.body?.error || `HTTP ${result.status || "unknown"}`
  };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.error(`Who Eats Token stability report unavailable at ${client.endpoint}: ${payload.error}`);
    console.error("Start the desktop app, then rerun `npm run stability`.");
  }
  process.exit(2);
}

const report = buildStabilityReport(result.body || {}, {
  endpoint: client.endpoint
});

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatStabilityReport(report));
}

if (shouldFail(report, args.failOn)) process.exitCode = 1;

function parseArgs(argv) {
  const options = {
    json: false,
    endpoint: undefined,
    token: undefined,
    timeoutMs: undefined,
    failOn: "none"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
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
    if (arg === "--fail-on") {
      options.failOn = normalizeFailOn(argv[++index]);
      continue;
    }
    if (arg.startsWith("--fail-on=")) {
      options.failOn = normalizeFailOn(arg.slice("--fail-on=".length));
    }
  }

  return options;
}

function normalizeFailOn(value) {
  const text = String(value || "").trim().toLowerCase();
  return ["none", "critical", "warning"].includes(text) ? text : "none";
}
