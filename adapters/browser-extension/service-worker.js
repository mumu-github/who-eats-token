const DEFAULT_SETTINGS = {
  enabled: true,
  endpoint: "http://127.0.0.1:17667",
  token: ""
};
const SAFE_USAGE_KEYS = new Set([
  "schema",
  "type",
  "timestamp",
  "provider",
  "tool",
  "app",
  "client",
  "model",
  "request_id",
  "requestId",
  "session_id",
  "sessionId",
  "input_tokens",
  "inputTokens",
  "output_tokens",
  "outputTokens",
  "total_tokens",
  "totalTokens",
  "cost_usd",
  "costUsd",
  "confidence",
  "source",
  "rate_limits",
  "rateLimits",
  "context"
]);

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
    chrome.storage.local.set({
      enabled: Boolean(settings.enabled),
      endpoint: normalizeEndpoint(settings.endpoint),
      token: String(settings.token || "")
    });
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function handleMessage(message, sender) {
  if (!message || typeof message !== "object") {
    return { ok: false, error: "Invalid message." };
  }

  const settings = await readSettings();
  if (!settings.enabled) return { ok: false, skipped: "disabled" };

  if (message.type === "WHO_EATS_TOKEN_OVERLAYS") {
    return postLocal("/overlays", withSenderMetadata(message.payload, sender), settings);
  }

  if (message.type === "WHO_EATS_TOKEN_USAGE") {
    return postLocal("/events", withUsageMetadata(message.payload, sender), settings);
  }

  if (message.type === "WHO_EATS_TOKEN_PING") {
    return getLocal("/health", settings);
  }

  return { ok: false, error: `Unsupported message type: ${String(message.type)}` };
}

function readSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
      resolve({
        enabled: Boolean(settings.enabled),
        endpoint: normalizeEndpoint(settings.endpoint),
        token: String(settings.token || "").trim()
      });
    });
  });
}

async function postLocal(path, payload, settings) {
  const response = await fetch(`${settings.endpoint}${path}`, {
    method: "POST",
    headers: buildHeaders(settings),
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  const body = await readResponse(response);
  return {
    ok: response.ok,
    status: response.status,
    body
  };
}

async function getLocal(path, settings) {
  const response = await fetch(`${settings.endpoint}${path}`, {
    method: "GET",
    headers: buildHeaders(settings),
    cache: "no-store"
  });

  const body = await readResponse(response);
  return {
    ok: response.ok,
    status: response.status,
    body
  };
}

function buildHeaders(settings) {
  const headers = {
    "Content-Type": "application/json"
  };
  if (settings.token) headers["X-Who-Eats-Token"] = settings.token;
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

function withSenderMetadata(payload, sender) {
  const senderUrl = sender?.url || sender?.tab?.url || payload?.url || "";
  const source = senderUrl ? hostFromUrl(senderUrl) : "browser-extension";
  return {
    ...safeObject(payload),
    source: `browser-extension:${source}`,
    url: senderUrl,
    title: sender?.tab?.title || payload?.title || ""
  };
}

function withUsageMetadata(payload, sender) {
  const senderUrl = sender?.url || sender?.tab?.url || "";
  const event = safeUsagePayload(payload);
  return {
    ...event,
    source: event.source || "browser-extension",
    metadata: {
      tabHost: senderUrl ? hostFromUrl(senderUrl) : ""
    }
  };
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeUsagePayload(payload) {
  const source = safeObject(payload);
  const event = {};
  for (const [key, value] of Object.entries(source)) {
    if (!SAFE_USAGE_KEYS.has(key)) continue;
    event[key] = value;
  }
  return event;
}

function hostFromUrl(value) {
  try {
    return new URL(value).host || "unknown";
  } catch {
    return "unknown";
  }
}

function normalizeEndpoint(value) {
  const text = String(value || DEFAULT_SETTINGS.endpoint).trim().replace(/\/+$/, "");
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(text)) return text;
  return DEFAULT_SETTINGS.endpoint;
}
