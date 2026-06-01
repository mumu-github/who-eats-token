const TOKEN_ACCURACY_LEVELS = new Set(["official-usage", "tokenizer", "heuristic", "unknown"]);
const MAX_TEXT_LENGTH = 160;

function normalizeTokenAccuracy(value = null, fallback = {}) {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : { level: value };
  const level = normalizeTokenAccuracyLevel(
    input.level ??
      input.accuracy ??
      input.method ??
      fallback.level ??
      tokenAccuracyLevelFromConfidence(fallback.confidence) ??
      tokenAccuracyLevelFromSource(input.source ?? fallback.source)
  );

  return {
    level,
    source: optionalText(input.source ?? fallback.source ?? defaultTokenAccuracySource(level), MAX_TEXT_LENGTH),
    estimated: Boolean(input.estimated ?? fallback.estimated ?? level === "heuristic"),
    label: optionalText(input.label ?? fallback.label ?? defaultTokenAccuracyLabel(level), MAX_TEXT_LENGTH),
    reason: optionalText(input.reason ?? fallback.reason ?? defaultTokenAccuracyReason(level), MAX_TEXT_LENGTH)
  };
}

function mergeTokenAccuracies(values = []) {
  const normalized = values
    .filter(Boolean)
    .map((value) => normalizeTokenAccuracy(value));
  if (normalized.length === 0) return normalizeTokenAccuracy(null);

  const known = normalized.filter((entry) => entry.level !== "unknown");
  const candidates = known.length ? known : normalized;
  const worst = candidates.reduce((current, candidate) =>
    tokenAccuracyRank(candidate.level) < tokenAccuracyRank(current.level) ? candidate : current
  , candidates[0]);
  const levels = Array.from(new Set(candidates.map((entry) => entry.level)));
  if (levels.length === 1) return worst;

  return {
    ...worst,
    source: "mixed",
    estimated: normalized.some((entry) => entry.estimated),
    reason: `Mixed token accuracy levels: ${levels.join(", ")}.`
  };
}

function isTokenAccuracyEstimated(value) {
  if (!value) return false;
  return normalizeTokenAccuracy(value).estimated;
}

function tokenAccuracyLevelFromConfidence(confidence) {
  const value = String(confidence || "").toLowerCase();
  if (value === "exact" || value === "reported" || value === "reported-local") return "official-usage";
  if (value === "estimated" || value === "estimated-local" || value.includes("estimate")) return "heuristic";
  return null;
}

function tokenAccuracyLevelFromSource(source) {
  const value = String(source || "").toLowerCase();
  if (!value) return null;
  if (value.includes("session-token") || value.includes("official") || value.includes("usage")) return "official-usage";
  if (value.includes("token_count") || value.includes("token-count") || value.includes("tokenizer")) return "tokenizer";
  if (value.includes("estimate") || value.includes("heuristic") || value.includes("message-length")) return "heuristic";
  return null;
}

function normalizeTokenAccuracyLevel(value) {
  const normalized = String(value || "unknown").toLowerCase().replace(/_/g, "-");
  if (normalized === "official" || normalized === "reported" || normalized === "exact") return "official-usage";
  if (normalized === "estimated" || normalized === "local-estimate" || normalized === "message-estimate") return "heuristic";
  if (TOKEN_ACCURACY_LEVELS.has(normalized)) return normalized;
  return "unknown";
}

function tokenAccuracyRank(level) {
  if (level === "official-usage") return 4;
  if (level === "tokenizer") return 3;
  if (level === "unknown") return 2;
  if (level === "heuristic") return 1;
  return 0;
}

function defaultTokenAccuracySource(level) {
  if (level === "official-usage") return "official-usage";
  if (level === "tokenizer") return "tokenizer";
  if (level === "heuristic") return "heuristic-estimate";
  return "unknown";
}

function defaultTokenAccuracyLabel(level) {
  if (level === "official-usage") return "reported";
  if (level === "tokenizer") return "tokenizer";
  if (level === "heuristic") return "estimated";
  return "unknown";
}

function defaultTokenAccuracyReason(level) {
  if (level === "official-usage") return "Token counts came from explicit provider or local usage fields.";
  if (level === "tokenizer") return "Token counts came from tokenizer-level counts rather than an account usage API.";
  if (level === "heuristic") return "Token counts were estimated from local text length.";
  return "Token accuracy source was not declared.";
}

function optionalText(value, maxLength) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

module.exports = {
  isTokenAccuracyEstimated,
  mergeTokenAccuracies,
  normalizeTokenAccuracy,
  normalizeTokenAccuracyLevel,
  tokenAccuracyLevelFromConfidence,
  tokenAccuracyLevelFromSource
};
