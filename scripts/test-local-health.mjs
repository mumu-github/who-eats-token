import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createIngestServer } = require("../src/collectors/ingest-server.cjs");

const token = "health-test-token";
const primaryPort = await getFreePort();
let snapshotCalls = 0;
const primary = createIngestServer({
  port: primaryPort,
  accessToken: token,
  getSnapshot: () => {
    snapshotCalls += 1;
    return {
      collectedAt: "2026-05-24T10:30:00.000Z",
      activeTool: {
        id: "hermes-web-ui",
        name: "Hermes Web UI",
        providerIds: ["hermes"]
      },
      settings: {
        providerRegistry: [
          {
            id: "hermes",
            name: "Hermes",
            source: "native-collector",
            enabled: true
          }
        ]
      },
      providers: [
        {
          id: "hermes",
          name: "Hermes",
          status: "live",
          source: "xiaomi-token-plan",
          confidence: "reported",
          latest: {
            timestamp: "2026-05-24T10:29:30.000Z",
            model: "mimo-v2.5-pro",
            tokenPlan: {
              status: "live",
              remainingPercent: 64,
              usedCredits: 72000000,
              totalCredits: 200000000,
              snapshotAt: "2026-05-24T10:29:30.000Z"
            }
          },
          todayTokens: 72000000,
          recentTokens: 1024
        }
      ]
    };
  }
});

await waitForHealth(primaryPort, token);
await requestJson({
  port: primaryPort,
  route: "/events",
  method: "POST",
  accessToken: token,
  origin: localOrigin(primaryPort),
  body: {
    provider: "hermes",
    tool: "Hermes",
    model: "mimo-v2.5-pro",
    input_tokens: 10,
    output_tokens: 5,
    confidence: "reported",
    source: "local-health-test"
  }
});

const health = await requestJson({
  port: primaryPort,
  route: "/health",
  method: "GET",
  accessToken: token,
  origin: localOrigin(primaryPort)
});

assert.equal(health.ok, true);
assert.equal(health.service, "who-eats-token");
assert.equal(health.port, primaryPort);
assert.equal(health.snapshotAvailable, true);
assert.equal(health.eventCount, 1);
assert.equal(health.providerHealth.summary.total, 1);
assert.equal(health.providerHealth.activeTool.id, "hermes-web-ui");
assert.equal(health.providerHealth.providers[0].id, "hermes");
assert.equal(health.providerHealth.providers[0].displayMode, "token-plan");
assert.equal(health.providerHealth.providers[0].lowestRemainingPercent, 64);
assert.ok(health.providerHealth.providers[0].delight?.id);
assert.equal(health.providerHealth.providers[0].delight.cue?.reducedMotion, "static");
assert.equal(health.providerHealth.providers[0].delight.priority, 0);
assert.equal(Object.hasOwn(health, "settings"), false);
assert.equal(Object.hasOwn(health, "providers"), false);
assert.ok(snapshotCalls >= 1);

const denied = await requestJson({
  port: primaryPort,
  route: "/health",
  method: "GET",
  accessToken: "wrong-token",
  origin: localOrigin(primaryPort),
  allowError: true
});
assert.equal(denied.statusCode, 401);

const noOriginDenied = await requestJson({
  port: primaryPort,
  route: "/health",
  method: "GET",
  allowError: true
});
assert.equal(noOriginDenied.statusCode, 401);

const overlayNow = Date.now();
await requestJson({
  port: primaryPort,
  route: "/overlays",
  method: "POST",
  accessToken: token,
  origin: localOrigin(primaryPort),
  body: {
    source: "overlay-stale-window",
    timestamp: new Date(overlayNow - 5000).toISOString(),
    url: "http://127.0.0.1/demo",
    title: "Demo overlay",
    overlays: [
      {
        type: "modal-overlay",
        label: "Modal overlay",
        bounds: { x: 20, y: 20, width: 120, height: 80 }
      }
    ]
  }
});

const staleOverlayState = await requestJson({
  port: primaryPort,
  route: "/overlays",
  method: "GET",
  accessToken: token,
  origin: localOrigin(primaryPort)
});
const staleReport = staleOverlayState.reports.find((report) => report.source === "overlay-stale-window");
assert.equal(staleReport.freshness, "stale");
assert.equal(staleReport.stale, true);
assert.ok(Date.parse(staleReport.expiresAt) > overlayNow);
assert.equal(staleOverlayState.overlays.find((overlay) => overlay.source === "overlay-stale-window").stale, true);

await requestJson({
  port: primaryPort,
  route: "/overlays",
  method: "POST",
  accessToken: token,
  origin: localOrigin(primaryPort),
  body: {
    source: "overlay-expired-window",
    timestamp: new Date(overlayNow - 16000).toISOString(),
    overlays: [
      {
        type: "modal-overlay",
        label: "Expired modal",
        bounds: { x: 30, y: 30, width: 120, height: 80 }
      }
    ]
  }
});

const prunedOverlayState = await requestJson({
  port: primaryPort,
  route: "/overlays",
  method: "GET",
  accessToken: token,
  origin: localOrigin(primaryPort)
});
assert.equal(prunedOverlayState.reports.some((report) => report.source === "overlay-expired-window"), false);

await closeIngest(primary);

const fallbackPort = await getFreePort();
const fallback = createIngestServer({ port: fallbackPort });
await waitForHealth(fallbackPort, "");
await requestJson({
  port: fallbackPort,
  route: "/events",
  method: "POST",
  origin: localOrigin(fallbackPort),
  body: {
    provider: "fallback-provider",
    model: "fallback-model",
    input_tokens: 12,
    output_tokens: 3,
    confidence: "reported",
    source: "local-health-fallback-test"
  }
});

const fallbackHealth = await requestJson({
  port: fallbackPort,
  route: "/health",
  method: "GET",
  origin: localOrigin(fallbackPort)
});
assert.equal(fallbackHealth.ok, true);
assert.equal(fallbackHealth.snapshotAvailable, false);
assert.equal(fallbackHealth.eventCount, 1);
assert.ok(fallbackHealth.providerHealth.providers.some((provider) => provider.id === "fallback-provider"));

await closeIngest(fallback);

console.log("Local health endpoint checks passed.");

async function waitForHealth(port, accessToken) {
  const deadline = Date.now() + 2000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      await requestJson({
        port,
        route: "/health",
        method: "GET",
        accessToken,
        origin: localOrigin(port)
      });
      return;
    } catch (error) {
      lastError = error;
      await delay(50);
    }
  }
  throw lastError || new Error("Timed out waiting for health endpoint.");
}

function requestJson({ port, route, method, accessToken = "", body, origin = null, allowError = false }) {
  return new Promise((resolve, reject) => {
    const headers = {
      "Content-Type": "application/json"
    };
    if (accessToken) headers["X-Who-Eats-Token"] = accessToken;
    if (origin) headers.Origin = origin;

    const req = http.request({
      hostname: "127.0.0.1",
      port,
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
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function closeIngest(ingest) {
  return new Promise((resolve) => ingest.close(resolve));
}

function localOrigin(port) {
  return `http://127.0.0.1:${port}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
