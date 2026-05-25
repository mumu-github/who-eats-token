import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { collectCodexUsage } = require("../src/collectors/codex.cjs");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "who-eats-token-codex-"));
const now = Date.now();

try {
  writeSession("old-codex.jsonl", [
    sessionMeta("old-codex"),
    turnContext("gpt-5.5"),
    tokenCount({
      timestamp: new Date(now - 75 * 60 * 1000).toISOString(),
      totalTokens: 10_000,
      limitId: "codex",
      limitName: null,
      planType: "prolite",
      primaryUsed: 7,
      secondaryUsed: 18,
      primaryResetSeconds: Math.floor((now + 10 * 60 * 1000) / 1000),
      secondaryResetSeconds: Math.floor((now + 6 * 24 * 60 * 60 * 1000) / 1000)
    })
  ]);

  writeSession("current-codex-bucket.jsonl", [
    sessionMeta("current-codex-bucket"),
    turnContext("gpt-5.5"),
    tokenCount({
      timestamp: new Date(now - 10 * 1000).toISOString(),
      totalTokens: 20_000,
      limitId: "codex_bengalfox",
      limitName: "GPT-5.3-Codex-Spark",
      planType: null,
      primaryUsed: 23,
      secondaryUsed: 11,
      primaryResetSeconds: Math.floor((now + 4 * 60 * 60 * 1000) / 1000),
      secondaryResetSeconds: Math.floor((now + 6 * 24 * 60 * 60 * 1000) / 1000)
    })
  ]);

  const provider = collectCodexUsage({ sessionsRoot: tempRoot });
  assert.equal(provider.latest?.rateLimits?.limitId, "codex");
  assert.equal(provider.latest?.rateLimits?.primary?.usedPercent, 7);
  assert.equal(provider.latest?.rateLimitsTrust?.status, "delayed");
  assert.equal(provider.latest?.rateLimitsSource?.sessionId, "old-codex");

  fs.rmSync(path.join(tempRoot, "old-codex.jsonl"));
  const modelBucketProvider = collectCodexUsage({ sessionsRoot: tempRoot });
  assert.equal(modelBucketProvider.latest?.rateLimits?.limitId, "codex_bengalfox");
  assert.equal(modelBucketProvider.latest?.rateLimits?.primary?.usedPercent, 23);
  assert.equal(modelBucketProvider.latest?.rateLimitsTrust?.status, "suspect");
  assert.equal(modelBucketProvider.latest?.rateLimitsTrust?.label, "模型桶");

  console.log("Codex collector checks passed.");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function writeSession(name, events) {
  fs.writeFileSync(
    path.join(tempRoot, name),
    `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
    "utf8"
  );
}

function sessionMeta(id) {
  return {
    timestamp: new Date(now - 90 * 60 * 1000).toISOString(),
    type: "session_meta",
    payload: {
      id,
      thread_name: "",
      model_provider: "openai"
    }
  };
}

function turnContext(model) {
  return {
    timestamp: new Date(now - 90 * 60 * 1000).toISOString(),
    type: "turn_context",
    payload: { model }
  };
}

function tokenCount({
  timestamp,
  totalTokens,
  limitId,
  limitName,
  planType,
  primaryUsed,
  secondaryUsed,
  primaryResetSeconds,
  secondaryResetSeconds
}) {
  return {
    timestamp,
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: { total_tokens: totalTokens },
        last_token_usage: { total_tokens: totalTokens }
      },
      rate_limits: {
        limit_id: limitId,
        limit_name: limitName,
        primary: {
          used_percent: primaryUsed,
          window_minutes: 300,
          resets_at: primaryResetSeconds
        },
        secondary: {
          used_percent: secondaryUsed,
          window_minutes: 10080,
          resets_at: secondaryResetSeconds
        },
        credits: null,
        plan_type: planType,
        rate_limit_reached_type: null
      }
    }
  };
}
