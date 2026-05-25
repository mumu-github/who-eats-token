import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createWhoEatsTokenClient } = require("../src/sdk/client.cjs");
const { summarizeProviderHealth } = require("../src/protocol/provider-health.cjs");

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
    console.error(`Who Eats Token local API unavailable at ${client.endpoint}: ${payload.error}`);
    console.error("Start the desktop app, then rerun `npm run status`.");
  }
  process.exit(2);
}

const snapshot = result.body || {};
const health = snapshot.providerHealth || summarizeProviderHealth(snapshot);

if (args.json) {
  console.log(JSON.stringify({
    ok: true,
    endpoint: client.endpoint,
    collectedAt: snapshot.collectedAt || health.collectedAt || null,
    providerHealth: health
  }, null, 2));
} else {
  console.log(formatStatus({
    endpoint: client.endpoint,
    collectedAt: snapshot.collectedAt || health.collectedAt || null,
    health
  }));
}

function formatStatus({ endpoint, collectedAt, health }) {
  const lines = [];
  const summary = health.summary || {};
  const ingest = health.ingest || {};
  lines.push("Who Eats Token status");
  lines.push(`Endpoint: ${endpoint}`);
  if (collectedAt) lines.push(`Collected: ${collectedAt}`);
  lines.push(`Local API: ${ingest.listening === false ? "not listening" : "listening"}${ingest.port ? ` on ${ingest.port}` : ""}`);
  lines.push(`Providers: live ${summary.live || 0}, delayed ${summary.delayed || 0}, estimated ${summary.estimated || 0}, missing ${summary.missing || 0}, disabled ${summary.disabled || 0}, planned ${summary.planned || 0}, attention ${summary.attention || 0}`);
  lines.push("");

  for (const provider of health.providers || []) {
    lines.push(formatProvider(provider));
  }

  return lines.join("\n");
}

function formatProvider(provider) {
  const delight = provider.delight || {};
  const remaining = provider.lowestRemainingPercent === null || provider.lowestRemainingPercent === undefined
    ? "--"
    : `${provider.lowestRemainingPercent}%`;
  const parts = [
    `- ${provider.name || provider.id}`,
    `[${provider.status || "unknown"}]`,
    delight.shortLabel ? delight.shortLabel : null,
    `remaining ${remaining}`,
    provider.displayMode ? `mode ${provider.displayMode}` : null,
    provider.freshness ? `freshness ${provider.freshness}` : null,
    provider.reason ? `reason ${provider.reason}` : null
  ].filter(Boolean);
  return parts.join(" · ");
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
