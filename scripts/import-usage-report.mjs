import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { normalizeExternalUsageSummary } = require("../src/adapters/external-summary-import.cjs");
const { createWhoEatsTokenClient } = require("../src/sdk/client.cjs");

const args = parseArgs(process.argv.slice(2));
const rawInput = await readInput(args.input);
const parsed = JSON.parse(rawInput || "null");
const events = normalizeExternalUsageSummary(parsed, {
  provider: args.provider,
  tool: args.tool,
  source: args.source,
  model: args.model,
  confidence: args.confidence
});

if (args.dryRun) {
  console.log(JSON.stringify({ ok: true, dryRun: true, accepted: events.length, events }, null, 2));
  process.exit(0);
}

const client = createWhoEatsTokenClient({
  endpoint: args.endpoint,
  token: args.token,
  timeoutMs: args.timeoutMs
});
const results = [];
for (const event of events) {
  results.push(await client.postUsageEvent(event));
}
const failed = results.filter((result) => !result.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  dryRun: false,
  accepted: events.length,
  posted: results.length - failed.length,
  failed: failed.length
}, null, 2));
if (failed.length > 0) process.exitCode = 1;

function parseArgs(argv) {
  const options = {
    dryRun: false,
    input: null,
    provider: null,
    tool: null,
    source: "external-summary-import",
    model: null,
    confidence: "derived",
    endpoint: undefined,
    token: undefined,
    timeoutMs: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--input") {
      options.input = argv[++index];
      continue;
    }
    if (arg === "--provider") {
      options.provider = argv[++index];
      continue;
    }
    if (arg === "--tool") {
      options.tool = argv[++index];
      continue;
    }
    if (arg === "--source") {
      options.source = argv[++index];
      continue;
    }
    if (arg === "--model") {
      options.model = argv[++index];
      continue;
    }
    if (arg === "--confidence") {
      options.confidence = argv[++index];
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
    if (!options.input) options.input = arg;
  }

  return options;
}

async function readInput(inputPath) {
  if (inputPath) return fs.readFileSync(inputPath, "utf8");
  return new Promise((resolve, reject) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      raw += chunk;
    });
    process.stdin.on("end", () => resolve(raw));
    process.stdin.on("error", reject);
    if (process.stdin.isTTY) resolve("");
  });
}
