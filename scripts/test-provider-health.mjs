import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { summarizeProviderHealth } = require("../src/protocol/provider-health.cjs");

const collectedAt = "2026-05-24T10:00:00.000Z";
const health = summarizeProviderHealth({
  collectedAt,
  ingest: {
    port: 17667,
    listening: true,
    eventCount: 2,
    recentEventCount: 1,
    overlayCount: 1
  },
  totals: {
    liveProviders: 1,
    missingProviders: 1
  },
  settings: {
    providerRegistry: [
      { id: "codex", name: "Codex", source: "codex-jsonl", enabled: true },
      { id: "hermes", name: "Hermes", source: "hermes-local", enabled: true },
      { id: "cursor", name: "Cursor", source: "planned", enabled: false },
      { id: "claude", name: "Claude", source: "planned", enabled: true }
    ]
  },
  providers: [
    {
      id: "codex",
      name: "Codex",
      status: "live",
      source: "Codex Desktop session JSONL",
      confidence: "exact",
      todayTokens: 1000,
      recentTokens: 200,
      latest: {
        model: "gpt-5.5",
        latestTokenAt: "2026-05-24T09:59:00.000Z",
        rateLimitsTrust: { status: "live", label: "实时" },
        rateLimits: {
          primary: { usedPercent: 18, windowMinutes: 300 },
          secondary: { usedPercent: 42, windowMinutes: 10080 }
        }
      }
    },
    {
      id: "hermes",
      name: "Hermes",
      status: "live",
      source: "hermes-local",
      confidence: "estimated",
      latest: {
        model: "mimo-v2.5-pro",
        tokenPlan: {
          remainingPercent: 17,
          platformStatus: "estimated",
          snapshotAt: "2026-05-24T09:50:00.000Z"
        },
        rateLimitsTrust: { status: "estimated", label: "估算" }
      }
    },
    {
      id: "packaged-smoke",
      name: "Packaged Smoke",
      status: "live",
      source: "test",
      confidence: "reported",
      latest: {
        timestamp: "2026-05-24T09:58:00.000Z",
        rateLimits: {
          primary: { usedPercent: 12, windowMinutes: 300 }
        },
        rateLimitsTrust: { status: "live", label: "实时" }
      }
    }
  ]
});

assert.equal(health.ingest.port, 17667);
assert.equal(health.summary.total, 5);
assert.equal(health.summary.live, 2);
assert.equal(health.summary.estimated, 1);
assert.equal(health.summary.disabled, 1);
assert.equal(health.summary.planned, 1);
assert.equal(health.summary.attention, 1);
assert.equal(health.summary.lowestRemainingPercent, 17);

const codex = health.providers.find((provider) => provider.id === "codex");
assert.equal(codex.status, "live");
assert.equal(codex.displayMode, "capacity");
assert.equal(codex.primaryRemainingPercent, 82);
assert.equal(codex.secondaryRemainingPercent, 58);
assert.equal(codex.freshness, "fresh");
assert.equal(codex.delight.id, "steady");
assert.equal(codex.delight.shortLabel, "刚刚好");
assert.equal(codex.delight.motion, "none");
assert.equal(codex.delight.cue.reducedMotion, "static");

const hermes = health.providers.find((provider) => provider.id === "hermes");
assert.equal(hermes.status, "estimated");
assert.equal(hermes.displayMode, "token-plan");
assert.equal(hermes.tokenPlanRemainingPercent, 17);
assert.equal(hermes.lowestRemainingPercent, 17);
assert.equal(hermes.delight.shortLabel, "省着点");
assert.equal(hermes.delight.attention, true);
assert.equal(hermes.delight.severity, "critical");
assert.equal(hermes.delight.cue.chart, "alert");
assert.equal(hermes.delight.estimated, true);

const cursor = health.providers.find((provider) => provider.id === "cursor");
assert.equal(cursor.status, "disabled");
assert.equal(cursor.delight.shortLabel, "睡觉中");

const claude = health.providers.find((provider) => provider.id === "claude");
assert.equal(claude.status, "planned");
assert.equal(claude.delight.shortLabel, "排队中");

const smoke = health.providers.find((provider) => provider.id === "packaged-smoke");
assert.equal(smoke.status, "live");
assert.equal(smoke.source, "test");

console.log("Provider health checks passed.");
