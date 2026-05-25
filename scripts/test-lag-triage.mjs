import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";

const snapshot = {
  collectedAt: "2026-05-24T10:30:00.000Z",
  ingest: {
    port: 18184,
    listening: true,
    eventCount: 8,
    recentEventCount: 2,
    overlayCount: 1
  },
  system: {
    collectedAt: "2026-05-24T10:30:00.000Z",
    cpu: {
      percent: 91,
      cores: 8
    },
    memory: {
      totalBytes: 16 * 1024 * 1024 * 1024,
      freeBytes: 5 * 1024 * 1024 * 1024,
      usedBytes: 11 * 1024 * 1024 * 1024,
      usedPercent: 69,
      freePercent: 31
    },
    process: {
      rssBytes: 180 * 1024 * 1024,
      heapUsedBytes: 48 * 1024 * 1024
    },
    uptimeSeconds: 900
  },
  settings: {
    behavior: {
      refreshMs: 15000,
      activeWindowMs: 15000,
      debugHud: false
    },
    providerRegistry: [
      { id: "codex", name: "Codex", source: "codex-jsonl", enabled: true },
      { id: "hermes", name: "Hermes", source: "hermes-local", enabled: true }
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
await listen(server, 18184);

const jsonRun = await runLagTriage([
  "--endpoint",
  "http://127.0.0.1:18184",
  "--token",
  "test-token",
  "--json"
]);
assert.equal(jsonRun.status, 0, jsonRun.stderr || jsonRun.stdout);
const parsed = JSON.parse(jsonRun.stdout);
assert.equal(parsed.schema, "who-eats-token.lag-triage.v1");
assert.equal(parsed.ok, false);
assert.equal(parsed.staticPerformance.ok, true);
assert.equal(parsed.staticPerformance.intervalAudit.adapterDomIntervalCount, 0);
assert.equal(parsed.runtime.available, true);
assert.equal(parsed.runtime.system.cpuPercent, 91);
assert.equal(parsed.likelyCause.id, "cpu-pressure");
assert.ok(parsed.runtime.topFindings.some((finding) => finding.id === "cpu-critical"));
assert.ok(parsed.nextActions.some((action) => action.includes("diagnostics")));
assert.equal(parsed.privacy.redacted, true);

const textRun = await runLagTriage([
  "--endpoint",
  "http://127.0.0.1:18184",
  "--token",
  "test-token"
]);
assert.equal(textRun.status, 0, textRun.stderr || textRun.stdout);
assert.match(textRun.stdout, /Who Eats Token lag triage/);
assert.match(textRun.stdout, /Static performance gates/);
assert.match(textRun.stdout, /Runtime snapshot/);
assert.match(textRun.stdout, /cpu-critical/);

const failRun = await runLagTriage([
  "--endpoint",
  "http://127.0.0.1:18184",
  "--token",
  "test-token",
  "--require-clean"
]);
assert.equal(failRun.status, 1, failRun.stderr || failRun.stdout);

server.close();

const unavailableRun = await runLagTriage([
  "--endpoint",
  "http://127.0.0.1:18185",
  "--token",
  "test-token",
  "--timeout-ms",
  "100",
  "--json"
]);
assert.equal(unavailableRun.status, 0, unavailableRun.stderr || unavailableRun.stdout);
const unavailable = JSON.parse(unavailableRun.stdout);
assert.equal(unavailable.ok, false);
assert.equal(unavailable.runtime.available, false);
assert.equal(unavailable.likelyCause.id, "app-unavailable");
assert.ok(unavailable.nextActions.some((action) => action.includes("Start the desktop app")));

const partialServer = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/snapshot") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      port: 18186,
      listening: true,
      eventCount: 1,
      recentEventCount: 0,
      overlayCount: 0,
      providers: [
        {
          id: "local-demo",
          name: "Local Demo",
          status: "live",
          latest: {
            timestamp: "2026-05-24T10:29:00.000Z",
            rateLimits: {
              primary: { usedPercent: 28, remainingPercent: 72 }
            }
          }
        }
      ]
    }));
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: false }));
});
await listen(partialServer, 18186);

const partialRun = await runLagTriage([
  "--endpoint",
  "http://127.0.0.1:18186",
  "--token",
  "test-token",
  "--json"
]);
assert.equal(partialRun.status, 0, partialRun.stderr || partialRun.stdout);
const partial = JSON.parse(partialRun.stdout);
assert.equal(partial.ok, false);
assert.equal(partial.likelyCause.id, "partial-snapshot");
assert.ok(partial.runtime.topFindings.some((finding) => finding.id === "partial-snapshot"));
assert.ok(partial.nextActions.some((action) => action.includes("full Who Eats Token runtime")));
partialServer.close();

console.log("Lag triage checks passed.");

function runLagTriage(extraArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "scripts/lag-triage.mjs",
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
