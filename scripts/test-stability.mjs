import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";

const snapshot = {
  collectedAt: "2026-05-24T10:30:00.000Z",
  ingest: {
    port: 18182,
    listening: true,
    eventCount: 4,
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
      freeBytes: 900 * 1024 * 1024,
      usedBytes: 15 * 1024 * 1024 * 1024,
      usedPercent: 94,
      freePercent: 6
    },
    process: {
      rssBytes: 512 * 1024 * 1024,
      heapUsedBytes: 64 * 1024 * 1024
    },
    uptimeSeconds: 1234
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
    },
    {
      id: "hermes",
      name: "Hermes",
      status: "live",
      source: "test",
      confidence: "estimated",
      latest: {
        timestamp: "2026-05-24T09:00:00.000Z",
        rateLimitsTrust: { status: "estimated", label: "估算" },
        tokenPlan: {
          remainingPercent: 17,
          usedCredits: 166_510_000,
          totalCredits: 200_000_000
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
await listen(server, 18182);

const jsonRun = await runStability(["--json"]);
assert.equal(jsonRun.status, 0, jsonRun.stderr || jsonRun.stdout);
const parsed = JSON.parse(jsonRun.stdout);
assert.equal(parsed.ok, true);
assert.equal(parsed.system.cpuPercent, 91);
assert.equal(parsed.system.appRssMb, 512);
assert.ok(parsed.summary.critical >= 2);
assert.ok(parsed.findings.some((finding) => finding.id === "cpu-critical"));
assert.ok(parsed.findings.some((finding) => finding.id === "memory-critical"));
assert.ok(parsed.findings.some((finding) => finding.id === "provider-attention"));
assert.ok(parsed.findings.some((finding) => finding.id === "overlays-active"));

const textRun = await runStability([]);
assert.equal(textRun.status, 0, textRun.stderr || textRun.stdout);
assert.match(textRun.stdout, /Who Eats Token stability report/);
assert.match(textRun.stdout, /CPU 91%/);
assert.match(textRun.stdout, /cpu-critical/);

const failRun = await runStability(["--fail-on", "critical"]);
assert.equal(failRun.status, 1, failRun.stderr || failRun.stdout);

server.close();

const partialServer = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/snapshot") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      port: 18183,
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
await listen(partialServer, 18183);

const partialRun = await runStability([
  "--endpoint",
  "http://127.0.0.1:18183",
  "--token",
  "test-token",
  "--json"
]);
assert.equal(partialRun.status, 0, partialRun.stderr || partialRun.stdout);
const partial = JSON.parse(partialRun.stdout);
assert.equal(partial.system, null);
assert.ok(partial.findings.some((finding) => finding.id === "partial-snapshot"));
partialServer.close();

console.log("Stability command checks passed.");

function runStability(extraArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "scripts/stability.mjs",
      "--endpoint",
      "http://127.0.0.1:18182",
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
