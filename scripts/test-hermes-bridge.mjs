import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  createHermesBridgeServer,
  extractUsageEvent
} = require("../src/collectors/hermes-bridge.cjs");

const event = extractUsageEvent({
  requestPayload: {
    model: "mimo-v2.5-pro"
  },
  contentType: "application/json",
  responseBody: Buffer.from(
    JSON.stringify({
      id: "chatcmpl_demo",
      model: "mimo-v2.5-pro",
      usage: {
        prompt_tokens: 1234,
        completion_tokens: 321,
        total_tokens: 1555
      }
    })
  )
});

assert.deepEqual(event, {
  provider: "hermes",
  model: "mimo-v2.5-pro",
  input_tokens: 1234,
  output_tokens: 321,
  confidence: "reported",
  source: "hermes-bridge",
  timestamp: event.timestamp
});
assert.ok(Date.parse(event.timestamp));

const chatStreamEvent = extractUsageEvent({
  requestPayload: { model: "gpt-4.1" },
  contentType: "text/event-stream; charset=utf-8",
  responseBody: Buffer.from([
    'data: {"id":"chatcmpl_stream","model":"gpt-4.1","choices":[{"delta":{"content":"partial"}}]}',
    "",
    'data: {"id":"chatcmpl_stream","model":"gpt-4.1","choices":[],"usage":{"prompt_tokens":12,"completion_tokens":5,"total_tokens":17}}',
    "",
    "data: [DONE]"
  ].join("\n"))
});
assertUsageEvent(chatStreamEvent, { model: "gpt-4.1", inputTokens: 12, outputTokens: 5 });

const responsesStreamEvent = extractUsageEvent({
  requestPayload: { model: "gpt-4.1-mini" },
  contentType: "text/event-stream",
  responseBody: Buffer.from([
    "event: response.output_text.delta",
    'data: {"type":"response.output_text.delta","delta":"partial"}',
    "",
    "event: ping",
    "data: not-json",
    "",
    "event: response.completed",
    'data: {"type":"response.completed","response":{"model":"gpt-4.1-mini","usage":{"input_tokens":20,"output_tokens":8,"total_tokens":28}}}',
    "",
    "data: [DONE]"
  ].join("\n"))
});
assertUsageEvent(responsesStreamEvent, { model: "gpt-4.1-mini", inputTokens: 20, outputTokens: 8 });

const accessToken = "bridge-test-token";
const upstreamPort = await getFreePort();
const bridgePort = await getFreePort();
const ingestPort = await getFreePort();
let ingestRequests = 0;
const upstream = http.createServer((req, res) => {
  req.resume();
  if (req.url.includes("timeout")) {
    // Keep the connection open so the bridge's upstream timeout is exercised.
    return;
  }
  if (req.url.includes("interrupted")) {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write("data: ");
    setImmediate(() => res.destroy(new Error("interrupted upstream stream")));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8" });
  res.end(openAiResponsesStream());
});
const ingest = http.createServer((req, res) => {
  ingestRequests += 1;
  req.resume();
  res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: false, error: "ingest unavailable" }));
});
await listen(upstream, upstreamPort);
await listen(ingest, ingestPort);

const bridge = createHermesBridgeServer({
  port: bridgePort,
  targetBaseUrl: `http://127.0.0.1:${upstreamPort}`,
  ingestUrl: `http://127.0.0.1:${ingestPort}/events`,
  accessToken,
  ingestToken: accessToken,
  upstreamTimeoutMs: 50,
  ingestTimeoutMs: 100
});

try {
  await waitForBridgeHealth(bridgePort, accessToken);

  const noOriginWithoutToken = await requestJson({
    port: bridgePort,
    route: "/health",
    method: "GET",
    allowError: true
  });
  assert.equal(noOriginWithoutToken.statusCode, 401);

  const timeoutResponse = await requestJson({
    port: bridgePort,
    route: "/v1/chat/completions?case=timeout",
    method: "POST",
    origin: localOrigin(bridgePort),
    accessToken,
    body: { model: "mimo-v2.5-pro", messages: [] },
    allowError: true
  });
  assert.equal(timeoutResponse.statusCode, 502);
  assert.match(timeoutResponse.body.error, /timeout/i);

  const health = await requestJson({
    port: bridgePort,
    route: "/health",
    method: "GET",
    origin: localOrigin(bridgePort),
    accessToken
  });
  assert.equal(health.upstreamReachable, false);
  assert.match(health.lastUpstreamError, /timeout/i);
  assert.ok(Number.isFinite(health.lastUpstreamLatencyMs));

  const interruptedResponse = await requestJson({
    port: bridgePort,
    route: "/v1/responses?case=interrupted",
    method: "POST",
    origin: localOrigin(bridgePort),
    accessToken,
    body: { model: "gpt-4.1-mini", input: "hello" },
    allowError: true
  });
  assert.equal(interruptedResponse.statusCode, 502);
  assert.match(interruptedResponse.body.error, /interrupted|socket|aborted|reset/i);

  const streamResponse = await requestRaw({
    port: bridgePort,
    route: "/v1/responses",
    method: "POST",
    origin: localOrigin(bridgePort),
    accessToken,
    body: { model: "gpt-4.1-mini", input: "hello" }
  });
  assert.equal(streamResponse.statusCode, 200);
  assert.match(String(streamResponse.headers["content-type"] || ""), /event-stream/i);
  assert.match(streamResponse.body, /response\.completed/);

  const usageHealth = await waitForBridgeStatus(bridgePort, accessToken, (status) => status.usagePostFailureCount >= 1);
  assert.equal(usageHealth.usageEventCount, 1);
  assert.equal(usageHealth.lastUsageEvent.model, "gpt-4.1-mini");
  assert.equal(usageHealth.lastUsageEvent.input_tokens, 20);
  assert.equal(usageHealth.lastUsageEvent.output_tokens, 8);
  assert.equal(usageHealth.usagePostFailureCount, 1);
  assert.equal(usageHealth.lastUsagePostStatusCode, 500);
  assert.match(usageHealth.lastUsagePostError, /HTTP 500/);
  assert.equal(ingestRequests, 1);
} finally {
  await closeBridge(bridge);
  await closeServer(upstream);
  await closeServer(ingest);
}

console.log("Hermes bridge checks passed.");

async function waitForBridgeHealth(port, token) {
  const deadline = Date.now() + 2000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      await requestJson({
        port,
        route: "/health",
        method: "GET",
        origin: localOrigin(port),
        accessToken: token
      });
      return;
    } catch (error) {
      lastError = error;
      await delay(50);
    }
  }
  throw lastError || new Error("Timed out waiting for bridge health.");
}

async function waitForBridgeStatus(port, token, predicate) {
  const deadline = Date.now() + 2000;
  let lastStatus = null;
  while (Date.now() < deadline) {
    lastStatus = await requestJson({
      port,
      route: "/health",
      method: "GET",
      origin: localOrigin(port),
      accessToken: token
    });
    if (predicate(lastStatus)) return lastStatus;
    await delay(50);
  }
  assert.fail(`Timed out waiting for bridge status. Last status: ${JSON.stringify(lastStatus)}`);
}

function assertUsageEvent(actual, { model, inputTokens, outputTokens }) {
  assert.equal(actual.provider, "hermes");
  assert.equal(actual.model, model);
  assert.equal(actual.input_tokens, inputTokens);
  assert.equal(actual.output_tokens, outputTokens);
  assert.equal(actual.confidence, "reported");
  assert.equal(actual.source, "hermes-bridge");
  assert.ok(Date.parse(actual.timestamp));
}

function requestJson({ port, route, method, accessToken: token = "", body, origin = null, allowError = false }) {
  return new Promise((resolve, reject) => {
    const headers = {
      "Content-Type": "application/json"
    };
    if (token) headers["X-Who-Eats-Token"] = token;
    if (origin) headers.Origin = origin;
    const rawBody = body === undefined ? null : JSON.stringify(body);
    if (rawBody) headers["Content-Length"] = Buffer.byteLength(rawBody);

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
    if (rawBody) req.write(rawBody);
    req.end();
  });
}

function requestRaw({ port, route, method, accessToken: token = "", body, origin = null, allowError = false }) {
  return new Promise((resolve, reject) => {
    const headers = {
      "Content-Type": "application/json"
    };
    if (token) headers["X-Who-Eats-Token"] = token;
    if (origin) headers.Origin = origin;
    const rawBody = body === undefined ? null : JSON.stringify(body);
    if (rawBody) headers["Content-Length"] = Buffer.byteLength(rawBody);

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
        if (res.statusCode < 200 || res.statusCode >= 300) {
          if (allowError) {
            resolve({ statusCode: res.statusCode, headers: res.headers, body: text });
            return;
          }
          reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
          return;
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: text });
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (rawBody) req.write(rawBody);
    req.end();
  });
}

function openAiResponsesStream() {
  return [
    "event: response.output_text.delta",
    'data: {"type":"response.output_text.delta","delta":"partial"}',
    "",
    "event: response.completed",
    'data: {"type":"response.completed","response":{"model":"gpt-4.1-mini","usage":{"input_tokens":20,"output_tokens":8,"total_tokens":28}}}',
    "",
    "data: [DONE]"
  ].join("\n");
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

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function closeBridge(bridge) {
  return new Promise((resolve) => bridge.close(resolve));
}

function localOrigin(port) {
  return `http://127.0.0.1:${port}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
