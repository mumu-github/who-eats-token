import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  normalizeExternalUsageSummary,
  _test
} = require("../src/adapters/external-summary-import.cjs");

const tokenTrackerLike = {
  summaries: [
    {
      id: "tt-1",
      provider: "codex",
      tool: "Codex",
      model: "gpt-5.5",
      inputTokens: 1200,
      outputTokens: 300,
      costUSD: 0.012,
      date: "2026-05-24T09:00:00.000Z",
      metadata: {
        bucket: "today",
        prompt: "do not copy",
        apiKey: "secret"
      }
    }
  ]
};

const tokenTrackerEvents = normalizeExternalUsageSummary(tokenTrackerLike, {
  source: "tokentracker-summary"
});
assert.equal(tokenTrackerEvents.length, 1);
assert.equal(tokenTrackerEvents[0].provider, "codex");
assert.equal(tokenTrackerEvents[0].tool, "Codex");
assert.equal(tokenTrackerEvents[0].input_tokens, 1200);
assert.equal(tokenTrackerEvents[0].output_tokens, 300);
assert.equal(tokenTrackerEvents[0].total_tokens, 1500);
assert.equal(tokenTrackerEvents[0].source, "tokentracker-summary");
assert.equal(tokenTrackerEvents[0].metadata.bucket, "today");
assert.equal(tokenTrackerEvents[0].metadata.prompt, undefined);
assert.equal(tokenTrackerEvents[0].metadata.api_key, undefined);

const ccusageLike = [
  {
    model: "claude-sonnet-4",
    totalTokens: 4096,
    cost: 0.42,
    day: "2026-05-24",
    metadata: {
      period: "daily"
    }
  },
  {
    model: "empty-row"
  }
];
const ccusageEvents = normalizeExternalUsageSummary(ccusageLike, {
  provider: "claude",
  tool: "ccusage",
  source: "ccusage-json"
});
assert.equal(ccusageEvents.length, 1);
assert.equal(ccusageEvents[0].provider, "claude");
assert.equal(ccusageEvents[0].tool, "ccusage");
assert.equal(ccusageEvents[0].total_tokens, 4096);
assert.equal(ccusageEvents[0].cost_usd, 0.42);
assert.equal(ccusageEvents[0].metadata.period, "daily");

const metadata = _test.buildSafeMetadata({
  prompt: "private",
  completion: "private",
  cookie: "private",
  source: "safe-source",
  metadata: {
    currency: "USD"
  }
}, "test");
assert.equal(metadata.prompt, undefined);
assert.equal(metadata.completion, undefined);
assert.equal(metadata.cookie, undefined);
assert.equal(metadata.source, "safe-source");
assert.equal(metadata.currency, "USD");

const cli = spawnSync(process.execPath, [
  "scripts/import-usage-report.mjs",
  "--dry-run",
  "--provider",
  "codex",
  "--source",
  "test-cli"
], {
  cwd: new URL("..", import.meta.url),
  input: JSON.stringify([{ totalTokens: 10, model: "demo" }]),
  encoding: "utf8"
});
assert.equal(cli.status, 0, cli.stderr || cli.stdout);
const cliOutput = JSON.parse(cli.stdout);
assert.equal(cliOutput.ok, true);
assert.equal(cliOutput.accepted, 1);
assert.equal(cliOutput.events[0].provider, "codex");
assert.equal(cliOutput.events[0].source, "test-cli");

console.log("External summary import checks passed.");
