import http from "node:http";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  createWhoEatsTokenClient,
  usageEventFromOpenAIResponse
} = require("../src/sdk/client.cjs");

const received = [];
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const bodyText = Buffer.concat(chunks).toString("utf8");
    received.push({
      method: req.method,
      url: req.url,
      token: req.headers["x-who-eats-token"] || "",
      body: bodyText ? JSON.parse(bodyText) : null
    });

    if (req.url === "/snapshot") {
      writeJson(res, { providers: [{ id: "sdk-test" }] });
      return;
    }

    if (req.url === "/health") {
      writeJson(res, {
        ok: true,
        service: "who-eats-token",
        providerHealth: {
          summary: { total: 1 },
          providers: [{ id: "sdk-test", status: "live" }]
        }
      });
      return;
    }

    writeJson(res, { ok: true });
  });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const client = createWhoEatsTokenClient({
  endpoint: `http://127.0.0.1:${port}`,
  token: "local-test-token",
  timeoutMs: 1000
});

const event = usageEventFromOpenAIResponse({
  id: "chatcmpl-test",
  model: "mimo-v2.5-pro",
  usage: {
    prompt_tokens: 123,
    completion_tokens: 45,
    total_tokens: 168
  }
}, {
  provider: "hermes",
  tool: "Hermes",
  metadata: {
    adapter: "node-sdk-test"
  }
});

assert.equal(event.provider, "hermes");
assert.equal(event.input_tokens, 123);
assert.equal(event.output_tokens, 45);
assert.equal(event.total_tokens, 168);
assert.equal(event.request_id, "chatcmpl-test");

assert.equal((await client.postUsageEvent(event)).ok, true);
assert.equal((await client.reportOpenAIResponse({
  model: "gpt-test",
  usage: {
    input_tokens: 20,
    output_tokens: 10
  }
}, {
  provider: "openai"
})).ok, true);
assert.equal((await client.reportOpenAIResponse({ model: "gpt-test" })).skipped, "missing-usage");

const snapshot = await client.getSnapshot();
assert.equal(snapshot.ok, true);
assert.equal(snapshot.body.providers[0].id, "sdk-test");

const health = await client.getHealth();
assert.equal(health.ok, true);
assert.equal(health.body.service, "who-eats-token");
assert.equal(health.body.providerHealth.providers[0].id, "sdk-test");

await new Promise((resolve) => server.close(resolve));

assert.equal(received[0].url, "/events");
assert.equal(received[0].token, "local-test-token");
assert.equal(received[1].body.provider, "openai");
assert.equal(received[2].url, "/snapshot");
assert.equal(received[3].url, "/health");

console.log("Node SDK checks passed.");

function writeJson(res, payload) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}
