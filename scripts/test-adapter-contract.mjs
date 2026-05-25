import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createIngestServer } = require("../src/collectors/ingest-server.cjs");

const accessToken = "adapter-contract-token";
const fakeApiKey = ["sk", "proj", "private", "key", "value"].join("-");
const port = await getFreePort();
const ingest = createIngestServer({ port, accessToken });

try {
  await waitForHealth(port);

  const blockedOrigin = await requestJson({
    port,
    route: "/health",
    method: "GET",
    origin: "https://example.com",
    accessToken,
    allowError: true
  });
  assert.equal(blockedOrigin.statusCode, 403);

  await requestJson({
    port,
    route: "/events",
    method: "POST",
    origin: localOrigin(port),
    accessToken,
    body: [
      {
        provider: "Codex",
        tool: "Codex",
        model: "gpt-5.5",
        input_tokens: 1000,
        output_tokens: 250,
        confidence: "reported",
        source: "codex-local-contract",
        rate_limits: {
          primary: {
            remaining_percent: 85,
            window_minutes: 300
          },
          secondary: {
            remaining_percent: 82,
            window_minutes: 10080
          }
        },
        metadata: {
          bucket: "contract",
          prompt: "private prompt should not survive",
          api_key: fakeApiKey,
          cookie: "api-platform_serviceToken=\"private\"",
          source_file: "C:/Users/demo/private.ts"
        }
      },
      {
        provider: "Hermes",
        tool: "Hermes",
        model: "mimo-v2.5-pro",
        total_tokens: 2000,
        output_tokens: 400,
        confidence: "reported",
        source: "hermes-bridge-contract"
      },
      {
        provider: "Anthropic",
        tool: "Cursor",
        model: "claude-4.1",
        input_tokens: 3200,
        output_tokens: 500,
        confidence: "reported",
        source: "ide-contract",
        context: {
          used_tokens: 3700,
          limit_tokens: 200000,
          remaining_percent: 98,
          source: "provider-context-window"
        }
      }
    ]
  });

  await requestJson({
    port,
    route: "/events",
    method: "POST",
    origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    accessToken,
    body: {
      provider: "OpenAI",
      tool: "ChatGPT",
      model: "gpt-4.1",
      input_tokens: 120,
      output_tokens: 80,
      confidence: "reported",
      source: "browser-extension-contract",
      rateLimits: {
        primary: {
          remainingPercent: 18,
          windowMinutes: 60
        }
      }
    }
  });

  await requestJson({
    port,
    route: "/events",
    method: "POST",
    accessToken,
    body: {
      provider: "Qwen",
      tool: "LiteLLM",
      model: "qwen-max",
      inputTokens: 700,
      outputTokens: 300,
      confidence: "derived",
      source: "local-gateway-contract"
    }
  });

  const snapshot = await requestJson({
    port,
    route: "/snapshot",
    method: "GET",
    origin: localOrigin(port),
    accessToken
  });
  const providerIds = snapshot.providers.map((provider) => provider.id).sort();
  assert.deepEqual(providerIds, ["anthropic", "codex", "hermes", "openai", "qwen"]);
  assert.equal(snapshot.eventCount, 5);
  assert.equal(findProvider(snapshot, "codex").latest.rateLimits.primary.usedPercent, 15);
  assert.equal(findProvider(snapshot, "codex").latest.rateLimits.secondary.usedPercent, 18);
  assert.equal(findProvider(snapshot, "anthropic").latest.model, "claude-4.1");
  assert.equal(findProvider(snapshot, "hermes").latest.lastTurnTokens, 2000);
  assert.equal(findProvider(snapshot, "qwen").confidence, "derived");

  const health = await requestJson({
    port,
    route: "/health",
    method: "GET",
    origin: localOrigin(port),
    accessToken
  });
  assert.equal(health.ok, true);
  assert.equal(health.eventCount, 5);
  assert.equal(health.providerHealth.summary.total, 5);
  assert.equal(findHealthProvider(health, "codex").displayMode, "capacity");
  assert.equal(findHealthProvider(health, "openai").lowestRemainingPercent, 18);
  assert.equal(findHealthProvider(health, "anthropic").displayMode, "context");
  assert.equal(findHealthProvider(health, "qwen").displayMode, "usage");
  assert.ok(health.providerHealth.summary.attention >= 1);

  const serialized = JSON.stringify({ snapshot, health });
  for (const forbidden of [
    "private prompt should not survive",
    fakeApiKey,
    "api-platform_serviceToken",
    "C:/Users/demo/private.ts"
  ]) {
    assert.equal(serialized.includes(forbidden), false, `Sensitive adapter data leaked: ${forbidden}`);
  }
} finally {
  await closeIngest(ingest);
}

console.log("Adapter contract checks passed.");

function findProvider(snapshot, id) {
  const provider = snapshot.providers.find((entry) => entry.id === id);
  assert.ok(provider, `Missing provider ${id}`);
  return provider;
}

function findHealthProvider(health, id) {
  const provider = health.providerHealth.providers.find((entry) => entry.id === id);
  assert.ok(provider, `Missing health provider ${id}`);
  return provider;
}

async function waitForHealth(targetPort) {
  const deadline = Date.now() + 2000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      await requestJson({
        port: targetPort,
        route: "/health",
        method: "GET",
        origin: localOrigin(targetPort),
        accessToken
      });
      return;
    } catch (error) {
      lastError = error;
      await delay(50);
    }
  }
  throw lastError || new Error("Timed out waiting for health endpoint.");
}

function requestJson({ port: targetPort, route, method, accessToken: token = "", body, origin = null, allowError = false }) {
  return new Promise((resolve, reject) => {
    const headers = {
      "Content-Type": "application/json"
    };
    if (token) headers["X-Who-Eats-Token"] = token;
    if (origin) headers.Origin = origin;

    const req = http.request({
      hostname: "127.0.0.1",
      port: targetPort,
      path: route,
      method,
      timeout: 1500,
      headers
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed = {};
        try {
          parsed = JSON.parse(text || "{}");
        } catch {
          if (!allowError) {
            reject(new Error("Invalid JSON response."));
            return;
          }
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          if (allowError) {
            resolve({ statusCode: res.statusCode, body: parsed });
            return;
          }
          reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
          return;
        }
        resolve(parsed);
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const assignedPort = server.address().port;
      server.close(() => resolve(assignedPort));
    });
  });
}

function closeIngest(target) {
  return new Promise((resolve) => target.close(resolve));
}

function localOrigin(targetPort) {
  return `http://127.0.0.1:${targetPort}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
