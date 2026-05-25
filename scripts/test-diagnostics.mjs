import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";

const snapshot = {
  collectedAt: "2026-05-24T10:30:00.000Z",
  ingest: {
    port: 18183,
    listening: true,
    eventCount: 12,
    recentEventCount: 3,
    overlayCount: 0
  },
  system: {
    collectedAt: "2026-05-24T10:30:00.000Z",
    cpu: {
      percent: 12,
      cores: 8
    },
    memory: {
      totalBytes: 16 * 1024 * 1024 * 1024,
      freeBytes: 6 * 1024 * 1024 * 1024,
      usedBytes: 10 * 1024 * 1024 * 1024,
      usedPercent: 62,
      freePercent: 38
    },
    process: {
      rssBytes: 155 * 1024 * 1024,
      heapUsedBytes: 45 * 1024 * 1024
    },
    uptimeSeconds: 420
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
        databasePath: "C:\\Users\\example\\secret.db"
      },
      {
        id: "hermes",
        name: "Hermes",
        source: "hermes-local",
        enabled: true,
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
          primary: { usedPercent: 10, windowMinutes: 300 },
          secondary: { usedPercent: 20, windowMinutes: 10080 }
        }
      }
    },
    {
      id: "hermes",
      name: "Hermes",
      status: "live",
      source: "test",
      confidence: "reported",
      latest: {
        timestamp: "2026-05-24T10:29:30.000Z",
        rateLimitsTrust: { status: "live", label: "实时" },
        tokenPlan: {
          remainingPercent: 76,
          usedCredits: 48_000_000,
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
await listen(server, 18183);

const jsonRun = await runDiagnostics(["--json"]);
assert.equal(jsonRun.status, 0, jsonRun.stderr || jsonRun.stdout);
const parsed = JSON.parse(jsonRun.stdout);
assert.equal(parsed.ok, true);
assert.equal(parsed.schema, "who-eats-token.diagnostics.v1");
assert.equal(parsed.status.providers.length, 2);
assert.equal(parsed.stability.system.appRssMb, 155);
assert.equal(parsed.configuration.providers.sources["codex-jsonl"], 1);
assert.equal(parsed.privacy.redacted, true);
assert.doesNotMatch(jsonRun.stdout, /secret-should-not-leak|cookie-should-not-leak|secret\.db|C:\\Users/);

const textRun = await runDiagnostics([]);
assert.equal(textRun.status, 0, textRun.stderr || textRun.stdout);
assert.match(textRun.stdout, /Who Eats Token diagnostics bundle/);
assert.match(textRun.stdout, /Redaction:/);

server.close();
console.log("Diagnostics bundle checks passed.");

function runDiagnostics(extraArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "scripts/diagnostics.mjs",
      "--endpoint",
      "http://127.0.0.1:18183",
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
