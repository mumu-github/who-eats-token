import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";

const snapshot = {
  collectedAt: "2026-05-24T10:30:00.000Z",
  ingest: {
    port: 18181,
    listening: true,
    eventCount: 2
  },
  settings: {
    providerRegistry: [
      { id: "codex", name: "Codex", source: "codex-jsonl", enabled: true },
      { id: "cursor", name: "Cursor", source: "planned", enabled: false }
    ]
  },
  providers: [
    {
      id: "codex",
      name: "Codex",
      status: "live",
      source: "test",
      confidence: "reported",
      latest: {
        timestamp: "2026-05-24T10:29:00.000Z",
        rateLimitsTrust: { status: "live", label: "实时" },
        rateLimits: {
          primary: { usedPercent: 12, windowMinutes: 300 },
          secondary: { usedPercent: 20, windowMinutes: 10080 }
        }
      }
    }
  ]
};

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/snapshot") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(snapshot));
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: false }));
});
await listen(server, 18181);

const jsonRun = await runStatus(["--json"]);
assert.equal(jsonRun.status, 0, jsonRun.stderr || jsonRun.stdout);
const parsed = JSON.parse(jsonRun.stdout);
assert.equal(parsed.ok, true);
assert.equal(parsed.providerHealth.providers[0].id, "codex");
assert.equal(parsed.providerHealth.providers[0].delight.shortLabel, "放心吃");

const textRun = await runStatus([]);
assert.equal(textRun.status, 0, textRun.stderr || textRun.stdout);
assert.match(textRun.stdout, /Who Eats Token status/);
assert.match(textRun.stdout, /Codex/);
assert.match(textRun.stdout, /放心吃/);
assert.match(textRun.stdout, /Cursor/);
assert.match(textRun.stdout, /disabled/);

server.close();
console.log("Status command checks passed.");

function runStatus(extraArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "scripts/status.mjs",
      "--endpoint",
      "http://127.0.0.1:18181",
      "--token",
      "test-token",
      ...extraArgs
    ], {
      cwd: new URL("..", import.meta.url),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

function listen(target, port) {
  return new Promise((resolve) => target.listen(port, "127.0.0.1", resolve));
}
