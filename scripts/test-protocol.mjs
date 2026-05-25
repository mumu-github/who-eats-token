import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  PROTOCOL_VERSION,
  normalizeOverlayReport,
  normalizeUsageEvent
} = require("../src/protocol/usage-event.cjs");

const fakeApiKey = ["sk", "proj", "super", "secret", "value"].join("-");
const event = normalizeUsageEvent({
  provider: "OpenAI",
  tool: "Cursor",
  model: "gpt-4.1",
  input_tokens: 120,
  outputTokens: 30,
  cost_usd: 0.01,
  confidence: "reported",
  rate_limits: {
    primary: {
      remaining_percent: 75,
      window_minutes: 300,
      resets_at: "2026-05-24T18:00:00+08:00"
    }
  },
  metadata: {
    workspace: "demo",
    prompt: "should never be stored",
    api_key: fakeApiKey,
    cookie: "api-platform_serviceToken=\"secret\"",
    source_file: "C:/Users/demo/project/private.ts",
    ignored: { nested: true }
  }
});

assert.equal(event.schema, PROTOCOL_VERSION);
assert.equal(event.provider, "openai");
assert.equal(event.tool, "Cursor");
assert.equal(event.inputTokens, 120);
assert.equal(event.outputTokens, 30);
assert.equal(event.totalTokens, 150);
assert.equal(event.rateLimits.primary.usedPercent, 25);
assert.equal(event.metadata.workspace, "demo");
assert.equal(Object.hasOwn(event.metadata, "prompt"), false);
assert.equal(Object.hasOwn(event.metadata, "api_key"), false);
assert.equal(Object.hasOwn(event.metadata, "cookie"), false);
assert.equal(Object.hasOwn(event.metadata, "source_file"), false);

const totalOnly = normalizeUsageEvent({
  provider: "anthropic",
  total_tokens: 500,
  output_tokens: 80
});
assert.equal(totalOnly.inputTokens, 420);
assert.equal(totalOnly.outputTokens, 80);

assert.throws(
  () => normalizeUsageEvent({ provider: "empty" }),
  /token usage or rate limit/
);

const overlayReport = normalizeOverlayReport({
  source: "browser-dom",
  url: "http://localhost:8648",
  title: "Hermes",
  overlays: [
    { type: "content-interactive", label: "发送", bounds: { x: 10, y: 20, width: 80, height: 40 } },
    { type: "too-small", bounds: { x: 0, y: 0, width: 2, height: 2 } }
  ]
});
assert.equal(overlayReport.overlays.length, 1);
assert.equal(overlayReport.overlays[0].label, "发送");

console.log("Protocol checks passed.");
