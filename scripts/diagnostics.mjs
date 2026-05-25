import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageInfo = require("../package.json");
const { createWhoEatsTokenClient } = require("../src/sdk/client.cjs");
const {
  buildDiagnosticsBundle,
  buildUnavailableBundle,
  formatDiagnosticsBundle
} = require("../src/diagnostics/diagnostics-bundle.cjs");

const args = parseArgs(process.argv.slice(2));
const client = createWhoEatsTokenClient({
  endpoint: args.endpoint,
  token: args.token,
  timeoutMs: args.timeoutMs
});
const result = await client.getSnapshot();

const baseOptions = {
  endpoint: client.endpoint,
  packageInfo
};

if (!result.ok) {
  const bundle = buildUnavailableBundle(result.error || result.body?.error || `HTTP ${result.status || "unknown"}`, baseOptions);
  if (args.json) {
    console.log(JSON.stringify(bundle, null, 2));
  } else {
    console.error(formatDiagnosticsBundle(bundle));
  }
  process.exit(2);
}

const bundle = buildDiagnosticsBundle(result.body || {}, baseOptions);

if (args.json) {
  console.log(JSON.stringify(bundle, null, 2));
} else {
  console.log(formatDiagnosticsBundle(bundle));
}

function parseArgs(argv) {
  const options = {
    json: false,
    endpoint: undefined,
    token: undefined,
    timeoutMs: undefined
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
    }
  }

  return options;
}
