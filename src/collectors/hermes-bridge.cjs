const http = require("node:http");

const DEFAULT_TARGET = "http://127.0.0.1:8642";
const DEFAULT_INGEST = "http://127.0.0.1:17667/events";
const MAX_BODY_BYTES = 16 * 1024 * 1024;

function createHermesBridgeServer({
  port = 17668,
  targetBaseUrl = DEFAULT_TARGET,
  ingestUrl = DEFAULT_INGEST,
  accessToken = null,
  ingestToken = null
} = {}) {
  let listening = false;
  let listenError = null;
  let proxiedCount = 0;
  let usageEventCount = 0;
  let lastUsageEvent = null;

  const server = http.createServer(async (req, res) => {
    const originAllowed = setCors(req, res);

    if (req.method === "OPTIONS") {
      res.writeHead(originAllowed ? 204 : 403);
      res.end();
      return;
    }

    if (!originAllowed) {
      writeJson(res, { ok: false, error: "Origin not allowed" }, 403);
      return;
    }

    if (!isAuthorizedBrowserRequest(req, accessToken)) {
      writeJson(res, { ok: false, error: "Missing or invalid local access token" }, 401);
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      writeJson(res, {
        ok: true,
        port,
        targetBaseUrl,
        ingestUrl,
        listening,
        error: listenError ? listenError.message : null,
        proxiedCount,
        usageEventCount,
        lastUsageEvent
      });
      return;
    }

    if (req.method !== "POST") {
      writeJson(res, { ok: false, error: "Hermes Bridge only proxies POST requests and GET /health." }, 404);
      return;
    }

    let requestBody = Buffer.alloc(0);
    try {
      requestBody = await readBody(req);
    } catch (error) {
      writeJson(res, { ok: false, error: error.message }, 400);
      return;
    }

    let requestPayload = null;
    try {
      requestPayload = JSON.parse(requestBody.toString("utf8") || "{}");
    } catch {
      requestPayload = null;
    }

    try {
      const proxyResult = await proxyRequest({
        method: req.method,
        path: req.url,
        headers: req.headers,
        body: requestBody,
        targetBaseUrl
      });
      proxiedCount += 1;

      writeProxyResponse(res, proxyResult);
      const usageEvent = extractUsageEvent({
        requestPayload,
        responseBody: proxyResult.body,
        contentType: proxyResult.headers["content-type"] || proxyResult.headers["Content-Type"] || ""
      });

      if (usageEvent) {
        lastUsageEvent = usageEvent;
        usageEventCount += 1;
        postUsageEvent(ingestUrl, usageEvent, ingestToken).catch(() => {});
      }
    } catch (error) {
      writeJson(res, { ok: false, error: error.message }, 502);
    }
  });

  server.on("listening", () => {
    listening = true;
    listenError = null;
  });
  server.on("error", (error) => {
    listenError = error;
  });
  server.listen(port, "127.0.0.1");

  return {
    port,
    close: () => server.close(),
    getStatus: () => ({
      port,
      targetBaseUrl,
      listening,
      error: listenError ? listenError.message : null,
      proxiedCount,
      usageEventCount,
      lastUsageEvent
    })
  };
}

function proxyRequest({ method, path, headers, body, targetBaseUrl }) {
  const target = new URL(path, targetBaseUrl);
  const proxyHeaders = { ...headers };
  delete proxyHeaders.host;
  delete proxyHeaders.connection;
  delete proxyHeaders["content-length"];
  delete proxyHeaders["x-who-eats-token"];
  proxyHeaders["content-length"] = Buffer.byteLength(body);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method,
        headers: proxyHeaders
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode || 200,
            headers: res.headers,
            body: Buffer.concat(chunks)
          });
        });
      }
    );
    req.on("error", reject);
    req.end(body);
  });
}

function writeProxyResponse(res, proxyResult) {
  const headers = { ...proxyResult.headers };
  delete headers["transfer-encoding"];
  headers["content-length"] = Buffer.byteLength(proxyResult.body);
  res.writeHead(proxyResult.statusCode, headers);
  res.end(proxyResult.body);
}

function extractUsageEvent({ requestPayload, responseBody, contentType }) {
  const model = getModelName(requestPayload);
  const payloads = parsePossibleResponsePayloads(responseBody, contentType);
  for (const payload of payloads) {
    const usage = findUsage(payload);
    if (!usage) continue;
    const inputTokens = numberOrZero(usage.input_tokens ?? usage.prompt_tokens ?? usage.inputTokens ?? usage.promptTokens);
    const outputTokens = numberOrZero(usage.output_tokens ?? usage.completion_tokens ?? usage.outputTokens ?? usage.completionTokens);
    const totalTokens = numberOrZero(usage.total_tokens ?? usage.totalTokens);
    if (inputTokens <= 0 && outputTokens <= 0 && totalTokens <= 0) continue;

    return {
      provider: "hermes",
      model: getModelName(payload) || model || "hermes",
      input_tokens: inputTokens || Math.max(0, totalTokens - outputTokens),
      output_tokens: outputTokens,
      confidence: "reported",
      timestamp: new Date().toISOString()
    };
  }
  return null;
}

function parsePossibleResponsePayloads(responseBody, contentType) {
  const text = responseBody.toString("utf8").trim();
  if (!text) return [];

  if (/text\/event-stream/i.test(contentType) || text.includes("\ndata:")) {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter((line) => line && line !== "[DONE]")
      .map(parseJsonOrNull)
      .filter(Boolean);
  }

  const parsed = parseJsonOrNull(text);
  return parsed ? [parsed] : [];
}

function findUsage(value) {
  if (!value || typeof value !== "object") return null;
  if (value.usage && typeof value.usage === "object") return value.usage;
  if (value.response?.usage && typeof value.response.usage === "object") return value.response.usage;
  if (value.data?.usage && typeof value.data.usage === "object") return value.data.usage;

  for (const key of ["response", "data", "result", "output"]) {
    const nested = findUsage(value[key]);
    if (nested) return nested;
  }
  return null;
}

function getModelName(value) {
  if (!value || typeof value !== "object") return null;
  return value.model || value.response?.model || value.data?.model || null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function postUsageEvent(url, payload, accessToken = null) {
  const target = new URL(url);
  const body = JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body)
  };
  if (accessToken) headers["X-Who-Eats-Token"] = accessToken;

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        headers
      },
      (res) => {
        res.resume();
        res.on("end", resolve);
      }
    );
    req.on("error", reject);
    req.end(body);
  });
}

function parseJsonOrNull(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function writeJson(res, payload, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function setCors(req, res) {
  const origin = String(req.headers.origin || "");
  if (origin && !isAllowedLocalOrigin(origin)) return false;

  res.setHeader("Access-Control-Allow-Origin", origin || "http://127.0.0.1");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, X-Who-Eats-Token");
  res.setHeader("Vary", "Origin");
  return true;
}

function isAllowedLocalOrigin(origin) {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin);
}

function isAuthorizedBrowserRequest(req, accessToken) {
  if (!accessToken) return true;
  if (!req.headers.origin) return true;
  return safeEqual(String(req.headers["x-who-eats-token"] || "").trim(), accessToken);
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return require("node:crypto").timingSafeEqual(leftBuffer, rightBuffer);
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

module.exports = {
  createHermesBridgeServer,
  extractUsageEvent
};
