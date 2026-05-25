import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/snapshot") {
    writeJson(res, {
      port: 18081,
      listening: true,
      eventCount: 1,
      providers: [
        {
          id: "demo",
          name: "Demo",
          status: "live",
          source: "test",
          confidence: "reported",
          todayTokens: 123,
          recentTokens: 45,
          latest: {
            model: "demo-model",
            rateLimitsTrust: {
              status: "live",
              label: "实时"
            },
            rateLimits: {
              primary: {
                usedPercent: 20,
                windowMinutes: 300,
                resetsAt: "2026-05-24T18:00:00.000Z"
              }
            }
          }
        }
      ]
    });
    return;
  }

  if (req.method === "POST" && req.url === "/events") {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      const body = JSON.parse(raw || "{}");
      writeJson(res, {
        ok: true,
        accepted: 1,
        provider: body.provider,
        schema: body.schema
      });
    });
    return;
  }

  writeJson(res, { ok: false, error: "Not found" }, 404);
});

await listen(server, 18081);

const child = spawn(process.execPath, ["scripts/mcp-server.mjs"], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    WHO_EATS_TOKEN_BASE_URL: "http://127.0.0.1:18081",
    WHO_EATS_TOKEN_API_TOKEN: "test-token"
  },
  stdio: ["pipe", "pipe", "pipe"]
});

const responses = [];
let buffer = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let newlineIndex;
  while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    if (line) responses.push(JSON.parse(line));
  }
});

send(child, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
send(child, { jsonrpc: "2.0", method: "notifications/initialized" });
send(child, { jsonrpc: "2.0", id: 2, method: "tools/list" });
send(child, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_provider_health", arguments: {} } });
send(child, {
  jsonrpc: "2.0",
  id: 4,
  method: "tools/call",
  params: {
    name: "post_usage_event",
    arguments: {
      provider: "demo",
      model: "demo-model",
      input_tokens: 1,
      output_tokens: 2
    }
  }
});
send(child, { jsonrpc: "2.0", id: 5, method: "resources/read", params: { uri: "who-eats-token://snapshot" } });

await waitFor(() => responses.length >= 5, 3000);

const initialize = responseById(1);
assert.equal(initialize.result.serverInfo.name, "who-eats-token");

const tools = responseById(2).result.tools.map((tool) => tool.name);
assert.deepEqual(tools, ["get_token_snapshot", "list_provider_health", "post_usage_event"]);

const healthText = responseById(3).result.content[0].text;
const health = JSON.parse(healthText);
assert.equal(health.providers[0].id, "demo");
assert.equal(health.providers[0].primaryRemainingPercent, 80);

const postText = responseById(4).result.content[0].text;
const postResult = JSON.parse(postText);
assert.equal(postResult.ok, true);
assert.equal(postResult.provider, "demo");

const resource = responseById(5).result.contents[0];
assert.equal(resource.uri, "who-eats-token://snapshot");
assert.match(resource.text, /"providers"/);

child.kill();
server.close();
console.log("MCP server checks passed.");

function responseById(id) {
  const response = responses.find((candidate) => candidate.id === id);
  assert.ok(response, `Missing response id ${id}`);
  assert.equal(response.error, undefined, `Unexpected error for id ${id}: ${JSON.stringify(response.error)}`);
  return response;
}

function send(childProcess, message) {
  childProcess.stdin.write(`${JSON.stringify(message)}\n`);
}

function writeJson(res, payload, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function listen(target, port) {
  return new Promise((resolve) => target.listen(port, "127.0.0.1", resolve));
}

function waitFor(predicate, timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        reject(new Error("Timed out waiting for MCP responses."));
      }
    }, 20);
  });
}
