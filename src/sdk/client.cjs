const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_ENDPOINT = "http://127.0.0.1:17667";
const DEFAULT_TIMEOUT_MS = 1500;

function createWhoEatsTokenClient(options = {}) {
  const endpoint = normalizeEndpoint(options.endpoint);
  const token = String(options.token ?? readDefaultLocalToken()).trim();
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Math.max(100, Number(options.timeoutMs))
    : DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetch || globalThis.fetch;
  const throwOnError = Boolean(options.throwOnError);

  return {
    endpoint,
    postUsageEvent: (event) => requestJson("/events", {
      method: "POST",
      body: event
    }),
    postOverlayReport: (report) => requestJson("/overlays", {
      method: "POST",
      body: report
    }),
    getSnapshot: () => requestJson("/snapshot", {
      method: "GET"
    }),
    getHealth: () => requestJson("/health", {
      method: "GET"
    }),
    reportOpenAIResponse: (response, defaults = {}) => {
      const event = usageEventFromOpenAIResponse(response, defaults);
      if (!event) return Promise.resolve({ ok: false, skipped: "missing-usage" });
      return requestJson("/events", {
        method: "POST",
        body: event
      });
    }
  };

  async function requestJson(route, requestOptions) {
    if (typeof fetchImpl !== "function") {
      return handleResult({ ok: false, skipped: "missing-fetch" });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${endpoint}${route}`, {
        method: requestOptions.method,
        headers: buildHeaders(token),
        body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body),
        signal: controller.signal
      });
      const body = await readResponse(response);
      return handleResult({
        ok: response.ok,
        status: response.status,
        body
      });
    } catch (error) {
      return handleResult({
        ok: false,
        error: error.name === "AbortError" ? "timeout" : error.message
      });
    } finally {
      clearTimeout(timer);
    }
  }

  function handleResult(result) {
    if (throwOnError && !result.ok) {
      const error = new Error(result.error || result.body?.error || "Who Eats Token request failed.");
      error.result = result;
      throw error;
    }
    return result;
  }
}

function usageEventFromOpenAIResponse(response = {}, defaults = {}) {
  const usage = response?.usage;
  if (!usage || typeof usage !== "object") return null;

  const inputTokens = numberOrZero(usage.prompt_tokens ?? usage.input_tokens ?? usage.inputTokens);
  const outputTokens = numberOrZero(
    usage.completion_tokens ?? usage.output_tokens ?? usage.outputTokens
  );
  const totalTokens = numberOrZero(usage.total_tokens ?? usage.totalTokens);
  if (inputTokens === 0 && outputTokens === 0 && totalTokens === 0) return null;

  return {
    schema: "who-eats-token.usage.v1",
    timestamp: defaults.timestamp || new Date().toISOString(),
    provider: defaults.provider || "openai-compatible",
    tool: defaults.tool,
    model: defaults.model || response.model || "unknown",
    request_id: defaults.requestId || response.id,
    session_id: defaults.sessionId,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens || inputTokens + outputTokens,
    cost_usd: numberOrZero(defaults.costUsd),
    confidence: defaults.confidence || "reported",
    source: defaults.source || "node-sdk-openai-compatible-response",
    rate_limits: defaults.rateLimits,
    context: defaults.context,
    metadata: defaults.metadata
  };
}

function readDefaultLocalToken() {
  if (process.env.WHO_EATS_TOKEN_API_TOKEN) return process.env.WHO_EATS_TOKEN_API_TOKEN;
  const tokenPath = getDefaultTokenPath();
  try {
    return fs.readFileSync(tokenPath, "utf8").trim();
  } catch {
    return "";
  }
}

function getDefaultTokenPath() {
  if (process.platform === "win32") {
    const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(base, "who-eats-token", "api-token.txt");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "who-eats-token", "api-token.txt");
  }
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "who-eats-token", "api-token.txt");
}

function normalizeEndpoint(value) {
  const endpoint = String(value || DEFAULT_ENDPOINT).trim().replace(/\/+$/, "");
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(endpoint)) return endpoint;
  return DEFAULT_ENDPOINT;
}

function buildHeaders(token) {
  const headers = {
    "Content-Type": "application/json"
  };
  if (token) headers["X-Who-Eats-Token"] = token;
  return headers;
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 500);
  }
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

module.exports = {
  DEFAULT_ENDPOINT,
  createWhoEatsTokenClient,
  getDefaultTokenPath,
  readDefaultLocalToken,
  usageEventFromOpenAIResponse
};
