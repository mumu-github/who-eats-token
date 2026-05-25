const SAFE_METADATA_KEYS = new Set([
  "bucket",
  "period",
  "range",
  "currency",
  "source",
  "source_id",
  "original_id",
  "project_id"
]);

function normalizeExternalUsageSummary(input, defaults = {}) {
  const records = extractRecords(input);
  return records
    .map((record) => eventFromExternalRecord(record, defaults))
    .filter(Boolean);
}

function extractRecords(input) {
  if (Array.isArray(input)) return input.filter(isObject);
  if (!isObject(input)) return [];
  for (const key of ["events", "items", "rows", "records", "summaries", "data"]) {
    if (Array.isArray(input[key])) return input[key].filter(isObject);
  }
  return [input];
}

function eventFromExternalRecord(record, defaults = {}) {
  const usage = isObject(record.usage) ? record.usage : record;
  const inputTokens = numberOrZero(
    pick(usage, ["input_tokens", "inputTokens", "prompt_tokens", "promptTokens"])
  );
  const outputTokens = numberOrZero(
    pick(usage, ["output_tokens", "outputTokens", "completion_tokens", "completionTokens"])
  );
  const totalTokens = numberOrZero(
    pick(usage, ["total_tokens", "totalTokens", "tokens", "token_count", "tokenCount", "total"])
  );
  const costUsd = numberOrZero(
    pick(record, ["cost_usd", "costUsd", "costUSD", "cost", "usd", "total_cost", "totalCost"])
  );
  const rateLimits = pick(record, ["rate_limits", "rateLimits"]);
  const context = pick(record, ["context"]);

  if (inputTokens === 0 && outputTokens === 0 && totalTokens === 0 && !rateLimits && !context) {
    return null;
  }

  const sourceLabel = optionalText(defaults.source || pick(record, ["adapter", "source_name", "sourceName"]), 80) ||
    "external-summary-import";

  return {
    schema: "who-eats-token.usage.v1",
    timestamp: normalizeTimestamp(pick(record, ["timestamp", "date", "day", "created_at", "createdAt"]) || defaults.timestamp),
    provider: optionalText(
      defaults.provider || pick(record, ["provider", "provider_id", "providerId", "service", "vendor"]),
      80
    ) || "external-summary",
    tool: optionalText(defaults.tool || pick(record, ["tool", "app", "client", "sourceTool", "source_tool"]), 80),
    model: optionalText(defaults.model || pick(record, ["model", "model_id", "modelId"]), 160) || "unknown",
    request_id: optionalText(pick(record, ["request_id", "requestId", "id"]), 80),
    session_id: optionalText(pick(record, ["session_id", "sessionId", "conversation_id", "conversationId"]), 80),
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens || inputTokens + outputTokens,
    cost_usd: costUsd,
    confidence: optionalText(defaults.confidence || record.confidence, 32) || "derived",
    source: sourceLabel,
    rate_limits: isObject(rateLimits) ? rateLimits : undefined,
    context: isObject(context) ? context : undefined,
    metadata: buildSafeMetadata(record, sourceLabel)
  };
}

function buildSafeMetadata(record, sourceLabel) {
  const metadata = {
    adapter: "external-summary-import",
    external_source: sourceLabel
  };
  const sourceMetadata = isObject(record.metadata) ? record.metadata : {};

  for (const [rawKey, rawValue] of Object.entries({ ...sourceMetadata, ...record })) {
    const key = normalizeMetadataKey(rawKey);
    if (!SAFE_METADATA_KEYS.has(key)) continue;
    if (rawValue === null || rawValue === undefined) continue;
    if (typeof rawValue === "object") continue;
    metadata[key] = typeof rawValue === "number" || typeof rawValue === "boolean"
      ? rawValue
      : String(rawValue).slice(0, 160);
  }

  return metadata;
}

function normalizeMetadataKey(value) {
  return String(value || "")
    .trim()
    .replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function pick(record, keys) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function normalizeTimestamp(value) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function optionalText(value, maxLength) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

module.exports = {
  normalizeExternalUsageSummary,
  _test: {
    buildSafeMetadata,
    eventFromExternalRecord
  }
};
