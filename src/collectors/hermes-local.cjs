const fs = require("node:fs");
const path = require("node:path");
const { getXiaomiTokenPlan, shouldUseXiaomiTokenPlan } = require("./xiaomi-token-plan.cjs");
const { isTokenAccuracyEstimated, normalizeTokenAccuracy } = require("../protocol/token-accuracy.cjs");
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
      const capabilities = detectHermesSchemaCapabilities(db);
      const schemaError = getHermesSchemaError(capabilities);
      if (schemaError) {
        return buildMissingProvider(collectedAt, schemaError, capabilities);
      }

      const sessions = readSessions(db, capabilities);

      if (sessions.length === 0) {
        return buildMissingProvider(collectedAt, "Hermes has no local sessions yet.", capabilities);
      }

      const latestSession = sessions[0];
      const latestMessages = readSessionMessages(db, latestSession.id, capabilities);
      const model = latestSession.model || readModelFromConfig(latestSession.modelConfig) || "unknown";
      const contextLimit = getContextLimit(model, latestSession.modelConfig, hermesDir);
      const contextTokenEvidence = getContextTokenEvidence(latestSession, latestMessages);
      const contextUsedTokens = contextTokenEvidence.tokens;
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
        sourceId: "hermes-local",
        name: "Hermes",
        status: "live",
        source: "hermes-state-db",
        confidence: contextTokenEvidence.confidence,
        tokenAccuracy: contextTokenEvidence.tokenAccuracy,
        tokenEstimated: contextTokenEvidence.tokenAccuracy.estimated,
        note: getHermesNote(tokenPlan, capabilities, contextTokenEvidence.tokenAccuracy),
        schema: summarizeHermesCapabilities(capabilities),
        collectedAt: collectedAt.toISOString(),
        todayTokens: totals.todayTokens,
        recentTokens: totals.recentTokens,
        todayCostUsd: totals.todayCostUsd,
        latest: {
          timestamp: timestampToIso(latestSession.lastMessageAt) || collectedAt.toISOString(),
          model,
          lastTurnTokens: getLastTurnTokenEvidence(latestMessages).tokens,
          rateLimits: null,
          rateLimitsTrust: getHermesTrust(tokenPlan, latestSession, collectedAt, contextTokenEvidence.tokenAccuracy),
          tokenPlan,
          context: {
            sessionId: latestSession.id,
            usedTokens: contextUsedTokens,
            limitTokens: contextLimit,
            usedPercent: contextUsedPercent,
            remainingPercent: contextRemaining,
            source: contextTokenEvidence.source,
            estimated: contextTokenEvidence.tokenAccuracy.estimated,
            tokenAccuracy: contextTokenEvidence.tokenAccuracy
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

function getHermesNote(tokenPlan, capabilities = null, tokenAccuracy = null) {
  const schemaNote = capabilities?.warnings?.length
    ? ` Schema fallback: ${capabilities.warnings.slice(0, 3).join("; ")}.`
    : "";
  const accuracy = normalizeTokenAccuracy(tokenAccuracy);
  const accuracyNote = accuracy.estimated
    ? " Token usage is heuristic estimated; health/UI must mark it estimated."
    : "";
  if (!tokenPlan) {
    return `Read local Hermes session usage and context. Provider-specific quota is not configured.${schemaNote}${accuracyNote}`;
  }
  return tokenPlan.status === "live"
    ? `Xiaomi Token Plan quota is read from the Xiaomi platform session.${schemaNote}${accuracyNote}`
    : `Xiaomi Token Plan usage is estimated from local Hermes sessions until a Xiaomi platform login cookie is configured.${schemaNote}${accuracyNote}`;
}

function getHermesTrust(tokenPlan, latestSession, collectedAt, tokenAccuracy = null) {
  if (!tokenPlan) {
    const accuracy = normalizeTokenAccuracy(tokenAccuracy);
    const estimated = isTokenAccuracyEstimated(accuracy);
    return {
      status: estimated ? "estimated" : "live",
      label: estimated ? "估算" : "本地",
      reason: estimated ? accuracy.reason : null,
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

function detectHermesSchemaCapabilities(db) {
  const sessions = getTableCapabilities(db, "sessions");
  const messages = getTableCapabilities(db, "messages");
  const warnings = [];
  for (const column of [
    "source",
    "model",
    "model_config",
    "system_prompt",
    "message_count",
    "input_tokens",
    "output_tokens",
    "cache_read_tokens",
    "cache_write_tokens",
    "reasoning_tokens",
    "estimated_cost_usd"
  ]) {
    if (sessions.exists && !sessions.columns.has(column)) warnings.push(`missing sessions.${column}`);
  }
  for (const column of [
    "role",
    "content",
    "reasoning",
    "reasoning_content",
    "codex_reasoning_items",
    "codex_message_items",
    "token_count",
    "timestamp",
    "session_id"
  ]) {
    if (messages.exists && !messages.columns.has(column)) warnings.push(`missing messages.${column}`);
  }
  if (!messages.exists) warnings.push("missing messages table");
  return { sessions, messages, warnings };
}

function getTableCapabilities(db, tableName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return {
    exists: rows.length > 0,
    columns: new Set(rows.map((row) => row.name))
  };
}

function getHermesSchemaError(capabilities) {
  if (!capabilities.sessions.exists) {
    return "Hermes 数据库存在，但 schema 不兼容：缺少 sessions 表。";
  }
  const missing = [];
  for (const column of ["id", "started_at"]) {
    if (!capabilities.sessions.columns.has(column)) missing.push(`sessions.${column}`);
  }
  if (missing.length > 0) {
    return `Hermes 数据库存在，但 schema 不兼容：缺少 ${missing.join(", ")}。`;
  }
  return null;
}

function summarizeHermesCapabilities(capabilities) {
  return {
    status: capabilities.warnings.length ? "compatible-with-fallbacks" : "compatible",
    sessionsColumns: Array.from(capabilities.sessions.columns).sort(),
    messagesColumns: Array.from(capabilities.messages.columns).sort(),
    warnings: capabilities.warnings
  };
}

function readSessions(db, capabilities) {
  const sessionColumn = (column, alias, fallback = "NULL") =>
    capabilities.sessions.columns.has(column) ? `s.${column} AS ${alias}` : `${fallback} AS ${alias}`;
  const canJoinMessages =
    capabilities.messages.exists &&
    capabilities.messages.columns.has("session_id") &&
    capabilities.messages.columns.has("timestamp");
  const lastMessageAt = canJoinMessages
    ? "COALESCE(MAX(m.timestamp), s.started_at) AS lastMessageAt"
    : "s.started_at AS lastMessageAt";
  const join = canJoinMessages ? "LEFT JOIN messages m ON m.session_id = s.id" : "";

  return db.prepare(`
    SELECT
      s.id,
      ${sessionColumn("source", "source")},
      ${sessionColumn("model", "model")},
      ${sessionColumn("model_config", "modelConfig")},
      ${sessionColumn("system_prompt", "systemPrompt")},
      ${sessionColumn("started_at", "startedAt")},
      ${sessionColumn("message_count", "messageCount", "0")},
      ${sessionColumn("input_tokens", "inputTokens", "0")},
      ${sessionColumn("output_tokens", "outputTokens", "0")},
      ${sessionColumn("cache_read_tokens", "cacheReadTokens", "0")},
      ${sessionColumn("cache_write_tokens", "cacheWriteTokens", "0")},
      ${sessionColumn("reasoning_tokens", "reasoningTokens", "0")},
      ${sessionColumn("estimated_cost_usd", "estimatedCostUsd", "0")},
      ${lastMessageAt}
    FROM sessions s
    ${join}
    GROUP BY s.id
    ORDER BY lastMessageAt DESC
    LIMIT 80
  `).all();
}

function readSessionMessages(db, sessionId, capabilities) {
  if (!capabilities.messages.exists || !capabilities.messages.columns.has("session_id")) return [];
  const messageColumn = (column, alias) =>
    capabilities.messages.columns.has(column) ? column === alias ? column : `${column} AS ${alias}` : `NULL AS ${alias}`;
  const orderBy = capabilities.messages.columns.has("timestamp") ? "timestamp ASC" : "rowid ASC";
  return db.prepare(`
    SELECT
      ${messageColumn("role", "role")},
      ${messageColumn("content", "content")},
      ${messageColumn("reasoning", "reasoning")},
      ${messageColumn("reasoning_content", "reasoningContent")},
      ${messageColumn("codex_reasoning_items", "codexReasoningItems")},
      ${messageColumn("codex_message_items", "codexMessageItems")},
      ${messageColumn("token_count", "tokenCount")},
      ${messageColumn("timestamp", "timestamp")}
    FROM messages
    WHERE session_id = ?
    ORDER BY ${orderBy}
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

function getContextTokenEvidence(session, messages) {
  const sessionTokens = getSessionTokenTotal(session);
  if (sessionTokens > 0) {
    return {
      tokens: sessionTokens,
      confidence: "reported",
      source: "session-token-columns",
      tokenAccuracy: normalizeTokenAccuracy("official-usage", {
        source: "session-token-columns",
        estimated: false,
        reason: "Hermes session token columns include explicit local usage counters."
      })
    };
  }

  const fallback = getMessageTokenEvidenceSummary(session, messages);
  return {
    tokens: fallback.tokens,
    confidence: fallback.tokenAccuracy.estimated ? "estimated" : "derived",
    source: fallback.source,
    tokenAccuracy: fallback.tokenAccuracy
  };
}

function getMessageTokenEvidenceSummary(session, messages) {
  const promptText = session.systemPrompt || "";
  let tokens = promptText ? estimateTokens(promptText) : 0;
  let usedTokenizer = false;
  let usedHeuristic = Boolean(promptText);

  for (const message of messages) {
    const evidence = getMessageTokenEvidence(message);
    tokens += evidence.tokens;
    usedTokenizer = usedTokenizer || evidence.tokenAccuracy.level === "tokenizer";
    usedHeuristic = usedHeuristic || evidence.tokenAccuracy.level === "heuristic";
  }

  if (usedHeuristic || !usedTokenizer) {
    return {
      tokens,
      source: "message-length-heuristic",
      tokenAccuracy: normalizeTokenAccuracy("heuristic", {
        source: "message-length-heuristic",
        estimated: true,
        reason: "Hermes session token columns were unavailable; local text length was used."
      })
    };
  }

  return {
    tokens,
    source: "message-token-count",
    tokenAccuracy: normalizeTokenAccuracy("tokenizer", {
      source: "message-token-count",
      estimated: false,
      reason: "Hermes message token_count fields were used because session totals were unavailable."
    })
  };
}

function getLastTurnTokenEvidence(messages) {
  const last = [...messages].reverse().find((message) => message.role !== "session_meta");
  return last ? getMessageTokenEvidence(last) : {
    tokens: 0,
    tokenAccuracy: normalizeTokenAccuracy("heuristic", {
      source: "message-length-heuristic",
      estimated: true
    })
  };
}

function getMessageTokenEvidence(message) {
  const reported = numberOrZero(message.tokenCount);
  if (reported > 0) {
    return {
      tokens: reported,
      tokenAccuracy: normalizeTokenAccuracy("tokenizer", {
        source: "message-token-count",
        estimated: false
      })
    };
  }
  const tokens = estimateTokens([
    message.content,
    message.reasoning,
    message.reasoningContent,
    message.codexReasoningItems,
    message.codexMessageItems
  ].filter(Boolean).join("\n"));
  return {
    tokens,
    tokenAccuracy: normalizeTokenAccuracy("heuristic", {
      source: "message-length-heuristic",
      estimated: true
    })
  };
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

function buildMissingProvider(collectedAt, reason, capabilities = null) {
  return {
    id: "hermes",
    sourceId: "hermes-local",
    name: "Hermes",
    status: "missing",
    source: "hermes-state-db",
    confidence: "missing",
    tokenAccuracy: normalizeTokenAccuracy("unknown", { source: "hermes-state-db" }),
    tokenEstimated: false,
    note: reason,
    schema: capabilities ? summarizeHermesCapabilities(capabilities) : null,
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
