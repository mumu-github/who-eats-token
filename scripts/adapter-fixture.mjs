import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createIngestServer } = require("../src/collectors/ingest-server.cjs");

const args = parseArgs(process.argv.slice(2));
const accessToken = args.token || "adapter-fixture-token";
const sensitiveNeedles = [
  "private prompt should not survive",
  "api-key-placeholder-for-redaction",
  "api-platform_serviceToken",
  "Bearer private-fixture-token",
  "C:/Users/demo/private.ts"
];

let server = null;
let endpoint = args.endpoint;
let mode = "live-endpoint";

try {
  if (!endpoint) {
    const port = await getFreePort();
    server = createIngestServer({ port, accessToken });
    endpoint = `http://127.0.0.1:${port}`;
    mode = "isolated";
    await waitForHealth(endpoint, accessToken);
  }

  const report = await runFixture({ endpoint, accessToken, mode });
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatReport(report));
  }
  if (args.requireClean && !report.ok) process.exitCode = 1;
} finally {
  if (server) await closeServer(server);
}

async function runFixture({ endpoint: targetEndpoint, accessToken: token, mode: runMode }) {
  const scenarios = buildScenarios();
  const overlays = buildOverlayReport();
  const origin = new URL(targetEndpoint).origin;
  const eventResult = await requestJson({
    endpoint: targetEndpoint,
    route: "/events",
    method: "POST",
    token,
    origin,
    body: scenarios.map((scenario) => scenario.event)
  });
  const overlayResult = await requestJson({
    endpoint: targetEndpoint,
    route: "/overlays",
    method: "POST",
    token,
    origin,
    body: overlays
  });
  const snapshot = await requestJson({
    endpoint: targetEndpoint,
    route: "/snapshot",
    method: "GET",
    token,
    origin
  });
  const health = await requestJson({
    endpoint: targetEndpoint,
    route: "/health",
    method: "GET",
    token,
    origin
  });
  const overlaySnapshot = await requestJson({
    endpoint: targetEndpoint,
    route: "/overlays",
    method: "GET",
    token,
    origin
  });

  const providerIds = new Set((snapshot.providers || []).map((provider) => provider.id));
  const missingProviders = [...new Set(scenarios.map((scenario) => scenario.expectedProviderId))]
    .filter((id) => !providerIds.has(id));
  const serialized = JSON.stringify({ snapshot, health, overlaySnapshot });
  const leakedSecrets = sensitiveNeedles.filter((needle) => serialized.includes(needle));
  const healthProviders = health.providerHealth?.providers || [];

  const report = {
    ok: missingProviders.length === 0 && leakedSecrets.length === 0 && Number(snapshot.overlayCount || 0) >= 1,
    schema: "who-eats-token.adapter-fixture.v1",
    generatedAt: new Date().toISOString(),
    mode: runMode,
    endpoint: targetEndpoint,
    summary: {
      scenarios: scenarios.length,
      acceptedEvents: Number(eventResult.accepted || 0),
      acceptedOverlays: Number(overlayResult.accepted || 0),
      snapshotEvents: Number(snapshot.eventCount || 0),
      snapshotOverlays: Number(snapshot.overlayCount || 0),
      providers: providerIds.size,
      providerHealthAttention: Number(health.providerHealth?.summary?.attention || 0),
      missingProviders: missingProviders.length,
      leakedSecrets: leakedSecrets.length
    },
    scenarios: scenarios.map((scenario) => ({
      id: scenario.id,
      adapterType: scenario.adapterType,
      expectedProviderId: scenario.expectedProviderId,
      providedSignals: scenario.providedSignals
    })),
    providers: healthProviders.map((provider) => ({
      id: provider.id,
      name: provider.name,
      status: provider.status,
      displayMode: provider.displayMode,
      lowestRemainingPercent: provider.lowestRemainingPercent,
      delight: provider.delight
        ? {
            id: provider.delight.id,
            shortLabel: provider.delight.shortLabel,
            alert: provider.delight.alert
          }
        : null
    })),
    privacy: {
      redactionOk: leakedSecrets.length === 0,
      leakedSecrets,
      checkedNeedles: sensitiveNeedles.length
    },
    nextActions: buildNextActions({ missingProviders, leakedSecrets, snapshot, health })
  };
  return report;
}

function buildScenarios() {
  return [
    {
      id: "codex-capacity",
      adapterType: "native-collector",
      expectedProviderId: "codex",
      providedSignals: ["usage-tokens", "quota-capacity", "provider-health"],
      event: {
        provider: "Codex",
        tool: "Codex",
        model: "gpt-5.5",
        input_tokens: 1200,
        output_tokens: 360,
        confidence: "reported",
        source: "adapter-fixture-codex",
        rate_limits: {
          primary: { remaining_percent: 84, window_minutes: 300 },
          secondary: { remaining_percent: 78, window_minutes: 10080 }
        },
        metadata: {
          fixture: true,
          prompt: "private prompt should not survive",
          api_key: "api-key-placeholder-for-redaction",
          cookie: "api-platform_serviceToken=\"private\"",
          authorization: "Bearer private-fixture-token",
          source_file: "C:/Users/demo/private.ts"
        }
      }
    },
    {
      id: "hermes-credit-plan",
      adapterType: "local-gateway",
      expectedProviderId: "hermes",
      providedSignals: ["usage-events", "quota-token-plan", "local-health"],
      event: {
        provider: "Hermes",
        tool: "Hermes",
        model: "mimo-v2.5-pro",
        input_tokens: 4200,
        output_tokens: 900,
        confidence: "reported",
        source: "adapter-fixture-hermes",
        rate_limits: {
          plan_type: "token-plan",
          primary: { remaining_percent: 61, window_minutes: 1440 },
          secondary: { remaining_percent: 61, window_minutes: 43200 }
        },
        metadata: {
          plan_label: "Token Plan fixture",
          credits_total_m: 200,
          credits_used_m: 78
        }
      }
    },
    {
      id: "browser-low-quota",
      adapterType: "browser-extension",
      expectedProviderId: "openai",
      providedSignals: ["hud-overlays", "usage-events", "local-health"],
      event: {
        provider: "OpenAI",
        tool: "ChatGPT",
        model: "gpt-4.1",
        inputTokens: 800,
        outputTokens: 220,
        confidence: "reported",
        source: "adapter-fixture-browser",
        rateLimits: {
          primary: { remainingPercent: 18, windowMinutes: 180 }
        }
      }
    },
    {
      id: "ide-context-window",
      adapterType: "ide-extension",
      expectedProviderId: "anthropic",
      providedSignals: ["local-health", "snapshot-read", "status-display"],
      event: {
        provider: "Anthropic",
        tool: "Cursor",
        model: "claude-4.1",
        input_tokens: 3000,
        output_tokens: 640,
        confidence: "reported",
        source: "adapter-fixture-ide",
        context: {
          used_tokens: 3640,
          limit_tokens: 200000,
          remaining_percent: 98,
          source: "fixture-context-window"
        }
      }
    },
    {
      id: "local-gateway-usage",
      adapterType: "sdk-wrapper",
      expectedProviderId: "qwen",
      providedSignals: ["usage-events", "local-health"],
      event: {
        provider: "Qwen",
        tool: "LiteLLM",
        model: "qwen-max",
        total_tokens: 1600,
        output_tokens: 450,
        confidence: "derived",
        source: "adapter-fixture-gateway"
      }
    }
  ];
}

function buildOverlayReport() {
  return {
    source: "adapter-fixture-browser",
    url: "https://example.local/hermes-web-ui",
    title: "Fixture tool",
    overlays: [
      {
        type: "composer",
        label: "send button",
        bounds: { x: 1120, y: 760, width: 260, height: 120 }
      },
      {
        type: "modal",
        label: "confirm dialog",
        bounds: { x: 780, y: 420, width: 360, height: 220 }
      }
    ]
  };
}

function buildNextActions({ missingProviders, leakedSecrets, snapshot, health }) {
  const actions = [];
  if (missingProviders.length > 0) {
    actions.push(`Missing providers in snapshot: ${missingProviders.join(", ")}.`);
  }
  if (leakedSecrets.length > 0) {
    actions.push("Fix usage-event metadata redaction before accepting adapter contributions.");
  }
  if (Number(snapshot.overlayCount || 0) === 0) {
    actions.push("Check /overlays support before validating browser HUD avoidance.");
  }
  if (Number(health.providerHealth?.summary?.attention || 0) === 0) {
    actions.push("Keep at least one low-quota fixture so warning/delight paths stay covered.");
  }
  if (actions.length === 0) {
    actions.push("Use this fixture output as a baseline when reviewing a new adapter's providedSignals.");
  }
  return actions;
}

function formatReport(report) {
  const lines = [];
  lines.push("# Who Eats Token Adapter Fixture");
  lines.push("");
  lines.push(`Status: ${report.ok ? "ok" : "needs attention"}`);
  lines.push(`Mode: ${report.mode}`);
  lines.push(`Endpoint: ${report.endpoint}`);
  lines.push(`Scenarios: ${report.summary.scenarios}`);
  lines.push(`Events: accepted ${report.summary.acceptedEvents}, snapshot ${report.summary.snapshotEvents}`);
  lines.push(`Overlays: accepted ${report.summary.acceptedOverlays}, snapshot ${report.summary.snapshotOverlays}`);
  lines.push(`Providers: ${report.summary.providers}, attention ${report.summary.providerHealthAttention}`);
  lines.push(`Privacy: ${report.privacy.redactionOk ? "redacted" : "leaked"}`);
  lines.push("");
  lines.push("Providers:");
  for (const provider of report.providers) {
    lines.push(`- ${provider.id}: ${provider.status} / ${provider.displayMode} / remaining ${provider.lowestRemainingPercent ?? "--"} / ${provider.delight?.shortLabel || "--"}`);
  }
  lines.push("");
  lines.push("Next actions:");
  for (const action of report.nextActions) lines.push(`- ${action}`);
  return lines.join("\n");
}

async function waitForHealth(endpoint, token) {
  const deadline = Date.now() + 2000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      await requestJson({
        endpoint,
        route: "/health",
        method: "GET",
        token,
        origin: new URL(endpoint).origin
      });
      return;
    } catch (error) {
      lastError = error;
      await delay(50);
    }
  }
  throw lastError || new Error("Timed out waiting for fixture ingest server.");
}

function requestJson({ endpoint, route, method, token, origin, body }) {
  const url = new URL(route, endpoint);
  return new Promise((resolve, reject) => {
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers["X-Who-Eats-Token"] = token;
    if (origin) headers.Origin = origin;

    const request = http.request({
      hostname: url.hostname,
      port: url.port || 80,
      path: `${url.pathname}${url.search}`,
      method,
      timeout: args.timeoutMs,
      headers
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed = {};
        try {
          parsed = JSON.parse(text || "{}");
        } catch {
          reject(new Error(`Invalid JSON from ${route}: ${text.slice(0, 120)}`));
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode} from ${route}: ${text.slice(0, 200)}`));
          return;
        }
        resolve(parsed);
      });
    });
    request.on("timeout", () => request.destroy(new Error(`Timeout from ${route}`)));
    request.on("error", reject);
    if (body !== undefined) request.write(JSON.stringify(body));
    request.end();
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

function closeServer(target) {
  return new Promise((resolve) => target.close(resolve));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const parsed = {
    endpoint: null,
    token: null,
    json: false,
    requireClean: false,
    timeoutMs: 1500
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--json") {
      parsed.json = true;
    } else if (value === "--require-clean") {
      parsed.requireClean = true;
    } else if (value === "--endpoint") {
      parsed.endpoint = argv[++index];
    } else if (value.startsWith("--endpoint=")) {
      parsed.endpoint = value.slice("--endpoint=".length);
    } else if (value === "--token") {
      parsed.token = argv[++index];
    } else if (value.startsWith("--token=")) {
      parsed.token = value.slice("--token=".length);
    } else if (value === "--timeout-ms") {
      parsed.timeoutMs = Number(argv[++index]);
    } else if (value.startsWith("--timeout-ms=")) {
      parsed.timeoutMs = Number(value.slice("--timeout-ms=".length));
    }
  }
  if (!Number.isFinite(parsed.timeoutMs) || parsed.timeoutMs <= 0) parsed.timeoutMs = 1500;
  return parsed;
}
