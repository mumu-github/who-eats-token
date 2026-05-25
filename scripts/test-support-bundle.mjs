import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";

const snapshot = {
  collectedAt: "2026-05-24T10:30:00.000Z",
  ingest: {
    port: 18186,
    listening: true,
    eventCount: 12,
    recentEventCount: 3,
    overlayCount: 0
  },
  system: {
    collectedAt: "2026-05-24T10:30:00.000Z",
    cpu: {
      percent: 11,
      cores: 8
    },
    memory: {
      totalBytes: 16 * 1024 * 1024 * 1024,
      freeBytes: 7 * 1024 * 1024 * 1024,
      usedBytes: 9 * 1024 * 1024 * 1024,
      usedPercent: 56,
      freePercent: 44
    },
    process: {
      rssBytes: 150 * 1024 * 1024,
      heapUsedBytes: 42 * 1024 * 1024
    },
    uptimeSeconds: 600
  },
  settings: {
    behavior: {
      refreshMs: 15000,
      activeWindowMs: 15000,
      debugHud: false
    },
    providerRegistry: [
      {
        id: "codex",
        name: "Codex",
        source: "codex-jsonl",
        enabled: true,
        apiKey: "secret-should-not-leak",
        cookie: "cookie-should-not-leak"
      }
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
await listen(server, 18186);

const jsonRun = await runSupportBundle([
  "--endpoint",
  "http://127.0.0.1:18186",
  "--token",
  "test-token",
  "--json"
]);
assert.equal(jsonRun.status, 0, jsonRun.stderr || jsonRun.stdout);
assert.doesNotMatch(jsonRun.stdout, /secret-should-not-leak|cookie-should-not-leak/);
const parsed = JSON.parse(jsonRun.stdout);
assert.equal(parsed.schema, "who-eats-token.support-bundle.v1");
assert.equal(parsed.static.compatibilityMatrix.ok, true);
assert.equal(parsed.static.performanceSummary.ok, true);
assert.equal(parsed.static.delightContract.ok, true);
assert.equal(parsed.summary.guardReady, true);
assert.equal(parsed.summary.runtimeAvailable, true);
assert.equal(parsed.runtime.diagnostics.ok, true);
assert.equal(parsed.runtime.lagTriage.runtime.available, true);
assert.equal(parsed.collections.compatibilityMatrix.collected, true);
assert.equal(parsed.collections.diagnostics.collected, true);
assert.equal(parsed.privacy.redacted, true);

const textRun = await runSupportBundle([
  "--endpoint",
  "http://127.0.0.1:18186",
  "--token",
  "test-token"
]);
assert.equal(textRun.status, 0, textRun.stderr || textRun.stdout);
assert.match(textRun.stdout, /Who Eats Token support bundle/);
assert.match(textRun.stdout, /Static guards/);
assert.match(textRun.stdout, /Collections:/);
assert.match(textRun.stdout, /Redaction:/);

server.close();

const unavailableRun = await runSupportBundle([
  "--endpoint",
  "http://127.0.0.1:18187",
  "--token",
  "test-token",
  "--timeout-ms",
  "100",
  "--json"
]);
assert.equal(unavailableRun.status, 0, unavailableRun.stderr || unavailableRun.stdout);
const unavailable = JSON.parse(unavailableRun.stdout);
assert.equal(unavailable.summary.runtimeAvailable, false);
assert.equal(unavailable.runtime.lagTriage.likelyCause.id, "app-unavailable");
assert.equal(unavailable.collections.diagnostics.collected, true, "Unavailable diagnostics should still produce a redacted JSON bundle.");
assert.ok(unavailable.nextActions.some((action) => action.includes("Start the desktop app")));

console.log("Support bundle checks passed.");

function runSupportBundle(extraArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "scripts/support-bundle.mjs",
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
