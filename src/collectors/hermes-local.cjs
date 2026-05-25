const fs = require("node:fs");
const path = require("node:path");
const { getXiaomiTokenPlan, shouldUseXiaomiTokenPlan } = require("./xiaomi-token-plan.cjs");
const { getHermesDataPath } = require("../system/paths.cjs");

const RECENT_MS = 60 * 60 * 1000;
const DEFAULT_CONTEXT_LIMIT = 200000;
const MIMO_CONTEXT_LIMIT = 1048576;

function collectHermesUsage({ localAppData = process.env.LOCALAPPDATA, hermesDataPath = null } = {}) {
  const collectedAt = new Date();
  const hermesDir = getHermesDataPath({ localAppData, hermesDataPath });
  const stateDbPath = path.join(hermesDir, "state.db");

  if (!fs.existsSync(stateDbPath)) {
    return buildMissingProvider(collectedAt, `Hermes state.db was not found at ${stateDbPath}.`);
  }

  try {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(stateDbPath, { readOnly: true });
    try {
      const sessions = db.prepare(`
        SELECT
          s.id,
          s.source,
          s.model,
          s.model_config AS modelConfig,
          s.system_prompt AS systemPrompt,
          s.started_at AS startedAt,
          s.message_count AS messageCount,
          s.input_tokens AS inputTokens,
          s.output_tokens AS outputTokens,
          s.cache_read_tokens AS cacheReadTokens,
          s.cache_write_tokens AS cacheWriteTokens,
          s.reasoning_tokens AS reasoningTokens,
          s.estimated_cost_usd AS estimatedCostUsd,
          COALESCE(MAX(m.timestamp), s.started_at) AS lastMessageAt
        FROM sessions s
        LEFT JOIN messages m ON m.session_id = s.id
        GROUP BY s.id
        ORDER BY lastMessageAt DESC
        LIMIT 80
      `).all();

      if (sessions.length === 0) {
        return buildMissingProvider(collectedAt, "Hermes has no local sessions yet.");
      }

      const latestSession = sessions[0];
      const latestMessages = readSessionMessages(db, latestSession.id);
      const model = latestSession.model || readModelFromConfig(latestSession.modelConfig) || "unknown";
      const contextLimit = getContextLimit(model, latestSession.modelConfig, hermesDir);
      const sessionTokens = getSessionTokenTotal(latestSession);
      const estimatedContextTokens = estimateSessionTokens(latestSession, latestMessages);
      const contextUsedTokens = Math.max(sessionTokens, estimatedContextTokens);
      const contextUsedPercent = percentage(contextUsedTokens, contextLimit);
      const contextRemaining = Math.max(0, Math.min(100, 100 - Math.round(contextUsedPercent)));
      const totals = summarizeSessions(sessions, collectedAt);
      const tokenPlan = shouldUseXiaomiTokenPlan({
        hermesDataPath: hermesDir,
        model,
        source: latestSession.source,
        modelConfig: latestSession.modelConfig
      })
        ? getXiaomiTokenPlan({
            localAppData,
            hermesDataPath: hermesDir,
            sessions,
            collectedAt,
            model
          })
        : null;

      return {
        id: "hermes",
        name: "Hermes",
        status: "live",
        source: "hermes-state-db",
        confidence: sessionTokens > 0 ? "reported-local" : "estimated-local",
        note: getHermesNote(tokenPlan),
        collectedAt: collectedAt.toISOString(),
        todayTokens: totals.todayTokens,
        recentTokens: totals.recentTokens,
        todayCostUsd: totals.todayCostUsd,
        latest: {
          timestamp: timestampToIso(latestSession.lastMessageAt) || collectedAt.toISOString(),
          model,
          lastTurnTokens: estimateLastTurnTokens(latestMessages),
          rateLimits: null,
          rateLimitsTrust: getHermesTrust(tokenPlan, latestSession, collectedAt),
          tokenPlan,
          context: {
            sessionId: latestSession.id,
            usedTokens: contextUsedTokens,
            limitTokens: contextLimit,
            usedPercent: contextUsedPercent,
            remainingPercent: contextRemaining,
            source: sessionTokens > 0 ? "session-tokens" : "message-estimate"
          }
        },
        models: [
          {
            model,
            todayTokens: totals.todayTokens,
            todayCostUsd: totals.todayCostUsd,
            requests: totals.todaySessions
          }
        ]
      };
    } finally {
      db.close();
    }
  } catch (error) {
    return buildMissingProvider(collectedAt, error.message);
  }
}

function getHermesNote(tokenPlan) {
  if (!tokenPlan) {
    return "Read local Hermes session usage and context. Provider-specific quota is not configured.";
  }
  return tokenPlan.status === "live"
    ? "Xiaomi Token Plan quota is read from the Xiaomi platform session."
    : "Xiaomi Token Plan usage is estimated from local Hermes sessions until a Xiaomi platform login cookie is configured.";
}

function getHermesTrust(tokenPlan, latestSession, collectedAt) {
  if (!tokenPlan) {
    return {
      status: "live",
      label: "本地",
      reason: null,
      ageMs: ageMs(latestSession.lastMessageAt, collectedAt)
    };
  }
  return {
    status: tokenPlan.status === "live" ? "live" : "estimated",
    label: tokenPlan.label || "Token Plan",
    reason: tokenPlan.status === "live"
      ? null
      : tokenPlan.platformReason || "Xiaomi platform quota is not authenticated; using local Token Plan credit estimate.",
    ageMs: ageMs(latestSession.lastMessageAt, collectedAt)
  };
}

function readSessionMessages(db, sessionId) {
  return db.prepare(`
    SELECT
      role,
      content,
      reasoning,
      reasoning_content AS reasoningContent,
      codex_reasoning_items AS codexReasoningItems,
      codex_message_items AS codexMessageItems,
      token_count AS tokenCount,
      timestamp
    FROM messages
    WHERE session_id = ?
    ORDER BY timestamp ASC
  `).all(sessionId);
}

function summarizeSessions(sessions, collectedAt) {
  const nowMs = collectedAt.getTime();
  const todayKey = localDateKey(collectedAt);
  return sessions.reduce(
    (acc, session) => {
      const sessionMs = timestampToMs(session.lastMessageAt);
      const tokens = getSessionTokenTotal(session);
      if (localDateKey(new Date(sessionMs)) === todayKey) {
        acc.todayTokens += tokens;
        acc.todayCostUsd += numberOrZero(session.estimatedCostUsd);
        acc.todaySessions += 1;
      }
      if (Number.isFinite(sessionMs) && nowMs - sessionMs <= RECENT_MS) {
        acc.recentTokens += tokens;
      }
      return acc;
    },
    { todayTokens: 0, recentTokens: 0, todayCostUsd: 0, todaySessions: 0 }
  );
}

function getSessionTokenTotal(session) {
  return (
    numberOrZero(session.inputTokens) +
    numberOrZero(session.outputTokens) +
    numberOrZero(session.cacheReadTokens) +
    numberOrZero(session.cacheWriteTokens) +
    numberOrZero(session.reasoningTokens)
  );
}

function estimateSessionTokens(session, messages) {
  const promptTokens = estimateTokens(session.systemPrompt || "");
  return messages.reduce((total, message) => total + getMessageTokens(message), promptTokens);
}

function estimateLastTurnTokens(messages) {
  const last = [...messages].reverse().find((message) => message.role !== "session_meta");
  return last ? getMessageTokens(last) : 0;
}

function getMessageTokens(message) {
  const reported = numberOrZero(message.tokenCount);
  if (reported > 0) return reported;
  return estimateTokens([
    message.content,
    message.reasoning,
    message.reasoningContent,
    message.codexReasoningItems,
    message.codexMessageItems
  ].filter(Boolean).join("\n"));
}

function estimateTokens(text) {
  const value = String(text || "");
  if (!value) return 0;
  const cjk = (value.match(/[\u3400-\u9fff]/g) || []).length;
  const rest = value.length - cjk;
  return Math.ceil(cjk * 1.1 + rest / 4);
}

function getContextLimit(model, modelConfig, hermesDataPath) {
  const configLimit = readLimitFromModelConfig(modelConfig);
  if (configLimit) return configLimit;

  const cacheLimit = readLimitFromModelCache(model, hermesDataPath);
  if (cacheLimit) return cacheLimit;

  if (/mimo/i.test(model || "")) return MIMO_CONTEXT_LIMIT;
  return DEFAULT_CONTEXT_LIMIT;
}

function readLimitFromModelConfig(modelConfig) {
  if (!modelConfig) return null;
  try {
    const parsed = JSON.parse(modelConfig);
    return numericLimit(parsed?.limit?.context ?? parsed?.context ?? parsed?.context_window);
  } catch {
    return null;
  }
}

function readModelFromConfig(modelConfig) {
  if (!modelConfig) return null;
  try {
    const parsed = JSON.parse(modelConfig);
    return firstText(parsed.model, parsed.id, parsed.name, parsed.model_id, parsed.modelId);
  } catch {
    return null;
  }
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return null;
}

function readLimitFromModelCache(model, hermesDataPath) {
  const cachePath = path.join(hermesDataPath || "", "models_dev_cache.json");
  if (!fs.existsSync(cachePath)) return null;
  try {
    const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    const entry = findModelEntry(cache, model);
    return numericLimit(entry?.limit?.context ?? entry?.context ?? entry?.context_window);
  } catch {
    return null;
  }
}

function findModelEntry(value, model) {
  const target = normalizeModelId(model);
  const xiaomiTarget = normalizeModelId(`xiaomi/${model}`);
  let looseMatch = null;

  function visit(node, key = "") {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = visit(child);
        if (found) return found;
      }
      return null;
    }

    const id = normalizeModelId(node.id || node.model || key);
    if (id === target || id === xiaomiTarget) return node;
    if (!looseMatch && (id.endsWith(`/${target}`) || target.endsWith(`/${id}`))) {
      looseMatch = node;
    }

    for (const [childKey, child] of Object.entries(node)) {
      const found = visit(child, childKey);
      if (found) return found;
    }
    return null;
  }

  return visit(value) || looseMatch;
}

function normalizeModelId(value) {
  return String(value || "").trim().toLowerCase();
}

function numericLimit(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function percentage(value, max) {
  if (!max) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function timestampToMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return NaN;
  return number > 10_000_000_000 ? number : number * 1000;
}

function timestampToIso(value) {
  const ms = timestampToMs(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function ageMs(value, now) {
  const ms = timestampToMs(value);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, now.getTime() - ms);
}

function localDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "unknown";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function buildMissingProvider(collectedAt, reason) {
  return {
    id: "hermes",
    name: "Hermes",
    status: "missing",
    source: "hermes-state-db",
    confidence: "missing",
    note: reason,
    collectedAt: collectedAt.toISOString(),
    todayTokens: 0,
    recentTokens: 0,
    todayCostUsd: 0,
    latest: {
      timestamp: collectedAt.toISOString(),
      model: null,
      lastTurnTokens: 0,
      rateLimits: null,
      rateLimitsTrust: {
        status: "missing",
        label: "等待",
        reason,
        ageMs: null
      },
      context: null
    },
    models: []
  };
}

module.exports = {
  collectHermesUsage,
  estimateTokens,
  getContextLimit
};
