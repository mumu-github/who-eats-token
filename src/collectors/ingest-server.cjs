const http = require("node:http");
const { summarizeProviderHealth } = require("../protocol/provider-health.cjs");
const { normalizeOverlayReport, normalizeUsageEvent } = require("../protocol/usage-event.cjs");

const MAX_EVENTS = 5000;
const RECENT_MS = 60 * 60 * 1000;
const OVERLAY_RECENT_MS = 3000;

function createIngestServer({ port, accessToken = null, getSnapshot = null } = {}) {
  const events = [];
  const overlayReports = new Map();
  let listening = false;
  let listenError = null;

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

    if (!isAuthorizedRequest(req, accessToken)) {
      writeJson(res, { ok: false, error: "Missing or invalid local access token" }, 401);
      return;
    }

    if (req.method === "POST" && req.url === "/events") {
      try {
        const body = await readJson(req);
        const payloads = Array.isArray(body) ? body : [body];
        for (const payload of payloads) {
          events.push(normalizeUsageEvent(payload));
        }
        while (events.length > MAX_EVENTS) events.shift();
        writeJson(res, { ok: true, accepted: payloads.length });
      } catch (error) {
        writeJson(res, { ok: false, error: error.message }, 400);
      }
      return;
    }

    if (req.method === "POST" && req.url === "/overlays") {
      try {
        const report = normalizeOverlayReport(await readJson(req));
        overlayReports.set(report.source, report);
        pruneOverlayReports();
        writeJson(res, { ok: true, accepted: report.overlays.length });
      } catch (error) {
        writeJson(res, { ok: false, error: error.message }, 400);
      }
      return;
    }

    if (req.method === "GET" && req.url === "/overlays") {
      writeJson(res, { reports: getOverlayReports(), overlays: getOverlayHints() });
      return;
    }

    if (req.method === "GET" && req.url === "/snapshot") {
      try {
        writeJson(res, typeof getSnapshot === "function" ? getSnapshot() : getSummary());
      } catch (error) {
        writeJson(res, { ok: false, error: error.message }, 500);
      }
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      writeJson(res, getHealth());
      return;
    }

    writeJson(res, { ok: false, error: "Not found" }, 404);
  });

  server.on("listening", () => {
    listening = true;
  });
  server.on("error", (error) => {
    listenError = error;
  });
  server.listen(port, "127.0.0.1");

  function getSummary() {
    const now = Date.now();
    const todayKey = localDateKey(new Date());
    const recentEvents = events.filter(
      (event) => now - new Date(event.timestamp).getTime() <= RECENT_MS
    );

    const grouped = new Map();
    for (const event of events) {
      const key = event.provider || "custom";
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: key,
          name: displayName(key),
          status: "live",
          source: "local ingest API",
          confidence: event.confidence || "reported",
          note: "Posted to http://127.0.0.1:17667/events.",
          collectedAt: new Date().toISOString(),
          todayTokens: 0,
          recentTokens: 0,
          todayCostUsd: 0,
          latest: null,
          models: new Map()
        });
      }

      const provider = grouped.get(key);
      const eventDateKey = localDateKey(new Date(event.timestamp));
      const eventTokens = event.inputTokens + event.outputTokens;
      if (eventDateKey === todayKey) {
        provider.todayTokens += eventTokens;
        provider.todayCostUsd += event.costUsd;
      }
      if (recentEvents.includes(event)) provider.recentTokens += eventTokens;

      const modelKey = event.model || "unknown";
      const model = provider.models.get(modelKey) || {
        model: modelKey,
        todayTokens: 0,
        todayCostUsd: 0,
        requests: 0
      };
      if (eventDateKey === todayKey) {
        model.todayTokens += eventTokens;
        model.todayCostUsd += event.costUsd;
      }
      model.requests += 1;
      provider.models.set(modelKey, model);

      if (!provider.latest || event.timestamp > provider.latest.timestamp) {
        provider.latest = {
          timestamp: event.timestamp,
          model: event.model,
          lastTurnTokens: eventTokens,
          rateLimits: event.rateLimits || null,
          context: event.context || null,
          rateLimitsTrust: event.rateLimits
            ? {
                status: "live",
                label: "实时",
                reason: null,
                ageMs: Date.now() - new Date(event.timestamp).getTime()
              }
            : {
                status: "missing",
                label: "等待",
                reason: "No rate limit fields were reported.",
                ageMs: null
              }
        };
      }
    }

    return {
      port,
      listening,
      error: listenError ? listenError.message : null,
      eventCount: events.length,
      recentEventCount: recentEvents.length,
      overlayCount: getOverlayHints().length,
      providers: Array.from(grouped.values()).map((provider) => ({
        ...provider,
        models: Array.from(provider.models.values()).sort(
          (a, b) => b.todayTokens - a.todayTokens
        )
      }))
    };
  }

  return {
    port,
    close: (callback) => server.close(callback),
    getSummary,
    getHealth,
    getOverlayHints,
    getOverlayReports
  };

  function getHealth() {
    const summary = getSummary();
    let snapshot = null;
    let snapshotError = null;

    if (typeof getSnapshot === "function") {
      try {
        snapshot = getSnapshot();
      } catch (error) {
        snapshotError = error;
      }
    }

    const healthSource = snapshot && typeof snapshot === "object"
      ? snapshot
      : summary;
    const providerHealth = healthSource.providerHealth || summarizeProviderHealth(healthSource);

    return {
      ok: listening && !listenError,
      service: "who-eats-token",
      port,
      listening,
      error: listenError ? listenError.message : null,
      snapshotAvailable: Boolean(snapshot),
      snapshotError: snapshotError ? snapshotError.message : null,
      collectedAt: healthSource.collectedAt || providerHealth.collectedAt || new Date().toISOString(),
      eventCount: summary.eventCount,
      recentEventCount: summary.recentEventCount,
      overlayCount: summary.overlayCount,
      providerHealth: compactProviderHealth(providerHealth)
    };
  }

  function getOverlayReports() {
    pruneOverlayReports();
    return Array.from(overlayReports.values());
  }

  function getOverlayHints() {
    return getOverlayReports()
      .flatMap((report) => report.overlays.map((overlay) => ({
        ...overlay,
        source: report.source,
        url: report.url,
        title: report.title,
        timestamp: report.timestamp
      })));
  }

  function pruneOverlayReports() {
    const now = Date.now();
    for (const [key, report] of overlayReports) {
      if (now - new Date(report.timestamp).getTime() > OVERLAY_RECENT_MS) {
        overlayReports.delete(key);
      }
    }
  }
}

function compactProviderHealth(providerHealth = {}) {
  const providers = Array.isArray(providerHealth.providers) ? providerHealth.providers : [];
  return {
    collectedAt: providerHealth.collectedAt || null,
    activeTool: compactActiveTool(providerHealth.activeTool),
    ingest: providerHealth.ingest || null,
    summary: providerHealth.summary || {
      total: providers.length,
      live: 0,
      delayed: 0,
      estimated: 0,
      missing: 0,
      disabled: 0,
      planned: 0,
      attention: 0,
      lowestRemainingPercent: null
    },
    providers: providers.map(compactProvider)
  };
}

function compactActiveTool(activeTool) {
  if (!activeTool || typeof activeTool !== "object") return null;
  return {
    id: activeTool.id || null,
    name: activeTool.name || null,
    providerIds: Array.isArray(activeTool.providerIds) ? activeTool.providerIds.slice(0, 8) : []
  };
}

function compactProvider(provider) {
  return {
    id: provider.id,
    name: provider.name,
    enabled: provider.enabled,
    source: provider.source || null,
    status: provider.status,
    statusLabel: provider.statusLabel || null,
    reason: provider.reason || null,
    confidence: provider.confidence || null,
    latestModel: provider.latestModel || null,
    displayMode: provider.displayMode || "missing",
    syncStatus: provider.syncStatus || null,
    syncLabel: provider.syncLabel || null,
    primaryRemainingPercent: provider.primaryRemainingPercent,
    secondaryRemainingPercent: provider.secondaryRemainingPercent,
    tokenPlanRemainingPercent: provider.tokenPlanRemainingPercent,
    contextRemainingPercent: provider.contextRemainingPercent,
    lowestRemainingPercent: provider.lowestRemainingPercent,
    freshness: provider.freshness || "unknown",
    dataAgeMs: provider.dataAgeMs,
    todayTokens: provider.todayTokens || 0,
    recentTokens: provider.recentTokens || 0,
    todayCostUsd: provider.todayCostUsd || 0,
    delight: compactDelight(provider.delight)
  };
}

function compactDelight(delight) {
  if (!delight || typeof delight !== "object") return null;
  return {
    id: delight.id || delight.mood || null,
    shortLabel: delight.shortLabel || null,
    label: delight.label || null,
    tone: delight.tone || null,
    motion: delight.motion || null,
    severity: delight.severity || null,
    priority: Number.isFinite(Number(delight.priority)) ? Number(delight.priority) : 0,
    cue: compactCue(delight.cue),
    a11yLabel: delight.a11yLabel || null,
    estimated: Boolean(delight.estimated),
    alert: Boolean(delight.alert || delight.attention)
  };
}

function compactCue(cue) {
  if (!cue || typeof cue !== "object") return null;
  return {
    icon: cue.icon || null,
    mascot: cue.mascot || null,
    chart: cue.chart || null,
    tone: cue.tone || null,
    motion: cue.motion || null,
    reducedMotion: cue.reducedMotion || "static"
  };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
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
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin) ||
    /^chrome-extension:\/\/[a-p]{32}$/i.test(origin) ||
    /^moz-extension:\/\/[0-9a-f-]+$/i.test(origin);
}

function isAuthorizedRequest(req, accessToken) {
  if (!accessToken) return true;
  if (!req.headers.origin) return true;
  return safeEqual(readRequestToken(req), accessToken);
}

function readRequestToken(req) {
  const explicit = req.headers["x-who-eats-token"] || req.headers["x-api-key"];
  if (explicit) return String(explicit).trim();

  const authorization = String(req.headers.authorization || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return require("node:crypto").timingSafeEqual(leftBuffer, rightBuffer);
}

function displayName(value) {
  return value
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

module.exports = {
  createIngestServer
};
