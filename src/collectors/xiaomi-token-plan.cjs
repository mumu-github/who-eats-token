const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const { getHermesDataPath } = require("../system/paths.cjs");

const PLATFORM_BASE_URL = "https://platform.xiaomimimo.com/api/v1";
const TOKEN_PLAN_CACHE_MS = 15 * 1000;
const TOKEN_PLAN_STALE_MS = 45 * 1000;
const DEFAULT_TOTAL_CREDITS = 60_000_000;
const DEFAULT_FIVE_HOUR_CREDITS = 2_000_000;
const FIVE_HOUR_MS = 5 * 60 * 60 * 1000;

let quotaCache = null;
let quotaRefreshPromise = null;
let quotaRefreshStartedAt = 0;
let quotaRefreshCookieKey = null;

function getXiaomiTokenPlan({ localAppData, hermesDataPath, sessions, collectedAt, model }) {
  const hermesDir = getHermesDataPath({ localAppData, hermesDataPath });
  const env = loadHermesEnv(hermesDir);
  const platformCookie = readPlatformCookie(env, hermesDir);
  const hasPlatformCookie = Boolean(platformCookie);
  queuePlatformRefresh(env, hermesDir, platformCookie);

  const localEstimate = estimateLocalTokenPlan({
    env,
    sessions,
    collectedAt,
    model
  });

  if (quotaCache?.quota && Date.now() - quotaCache.fetchedAt <= TOKEN_PLAN_STALE_MS) {
    return {
      ...localEstimate,
      ...quotaCache.quota,
      localUsedCredits: localEstimate.usedCredits,
      localRecentCredits: localEstimate.recentCredits
    };
  }

  const platformStatus = quotaCache?.status || (hasPlatformCookie ? "refreshing" : "auth-missing");
  const platformReason =
    quotaCache?.reason ||
    (hasPlatformCookie
      ? "Xiaomi platform quota refresh is still pending; using local Token Plan estimate."
      : `Set XIAOMI_PLATFORM_COOKIE or ${path.join(hermesDir, "xiaomi-platform-cookie.txt")} to read live token plan quota from Xiaomi platform.`);

  return {
    ...localEstimate,
    label: getEstimatedLabel(localEstimate, platformStatus),
    platformStatus,
    platformReason
  };
}

function shouldUseXiaomiTokenPlan({ env = null, hermesDataPath = null, model = "", source = "", modelConfig = "" } = {}) {
  const resolvedEnv = env || loadHermesEnv(hermesDataPath);
  if (Object.keys(resolvedEnv).some((key) => key.startsWith("XIAOMI_"))) return true;
  if (hermesDataPath && readPlatformCookie(resolvedEnv, hermesDataPath)) return true;

  const haystack = [
    model,
    source,
    modelConfig,
    resolvedEnv.XIAOMI_BASE_URL,
    resolvedEnv.XIAOMI_API_KEY
  ].filter(Boolean).join(" ");
  return /(xiaomi|xiaomimimo|mimo-v?2|mimo.*pro|token-plan-cn)/i.test(haystack);
}

function getEstimatedLabel(localEstimate, platformStatus) {
  if (platformStatus === "auth-missing") return "登录过期";
  if (platformStatus === "refreshing") return "刷新中";
  if (platformStatus === "error" || platformStatus === "unparsed") return "非实时";
  return localEstimate.label;
}

function queuePlatformRefresh(env, hermesDataPath, platformCookie = readPlatformCookie(env, hermesDataPath)) {
  if (typeof fetch !== "function") return;
  if (quotaRefreshPromise) return;
  const nextCookieKey = fingerprintCookie(platformCookie);
  const cookieChanged = nextCookieKey !== quotaRefreshCookieKey;
  if (!cookieChanged && Date.now() - quotaRefreshStartedAt < TOKEN_PLAN_CACHE_MS) return;

  quotaRefreshStartedAt = Date.now();
  quotaRefreshCookieKey = nextCookieKey;
  quotaRefreshPromise = refreshPlatformQuota(env, hermesDataPath, platformCookie)
    .then((result) => {
      quotaCache = result;
    })
    .catch((error) => {
      quotaCache = {
        status: "error",
        reason: error.message,
        fetchedAt: Date.now(),
        quota: null
      };
    })
    .finally(() => {
      quotaRefreshPromise = null;
    });
}

async function refreshPlatformQuota(env, hermesDataPath, platformCookie = readPlatformCookie(env, hermesDataPath)) {
  const cookie = platformCookie;
  if (!cookie) {
    return {
      status: "auth-missing",
      reason: "Xiaomi platform login cookie is not configured.",
      fetchedAt: Date.now(),
      quota: null
    };
  }

  const [detail, usage] = await Promise.all([
    fetchPlatformJson("/tokenPlan/detail", cookie),
    fetchPlatformJson("/tokenPlan/usage", cookie)
  ]);

  if (detail.status === 401 || usage.status === 401) {
    return {
      status: "auth-missing",
      reason: "Xiaomi platform cookie is missing, expired, or not authorized.",
      fetchedAt: Date.now(),
      quota: null
    };
  }

  const quota = normalizePlatformQuota(detail.body, usage.body);
  if (!quota) {
    return {
      status: "unparsed",
      reason: "Xiaomi platform quota response did not contain recognizable credit totals.",
      fetchedAt: Date.now(),
      quota: null
    };
  }

  return {
    status: "live",
    reason: null,
    fetchedAt: Date.now(),
    quota: {
      ...quota,
      source: "xiaomi-platform",
      status: "live",
      label: "Token Plan",
      fetchedAt: new Date().toISOString()
    }
  };
}

async function fetchPlatformJson(url, cookie) {
  const res = await fetch(`${PLATFORM_BASE_URL}${url}`, {
    headers: {
      "accept": "application/json",
      "accept-language": "zh",
      "content-type": "application/json",
      "cookie": cookie,
      "user-agent": "who-eats-token/0.1"
    },
    credentials: "include"
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { status: res.status, body };
}

function normalizePlatformQuota(detailBody, usageBody) {
  const detail = unwrapData(detailBody);
  const usage = unwrapData(usageBody);
  const candidates = [detail, usage, detailBody, usageBody].filter(Boolean);
  const tokenPlanItem =
    findUsageItem(usage, ["plan_total_token", "month_total_token"]) ||
    findUsageItem(usageBody, ["plan_total_token", "month_total_token"]);

  const totalCredits =
    numberOrNull(tokenPlanItem?.limit) ??
    findNumericByKeys(candidates, [
      "totalCredits",
      "totalCredit",
      "creditLimit",
      "creditsLimit",
      "limitCredits",
      "limitCredit",
      "totalLimit",
      "quotaCredits",
      "limit"
    ]) ?? findNumericByPath(candidates, ["credit", "limit"]);

  const usedCredits =
    numberOrNull(tokenPlanItem?.used) ??
    findNumericByKeys(candidates, [
      "usedCredits",
      "usedCredit",
      "consumedCredits",
      "consumedCredit",
      "usageCredits",
      "creditUsed",
      "currentPlanUsage",
      "planUsage",
      "used"
    ]) ?? findNumericByPath(candidates, ["credit", "used"]);

  const remainingCredits =
    findNumericByKeys(candidates, [
      "remainingCredits",
      "remainingCredit",
      "remainCredits",
      "remainCredit",
      "availableCredits",
      "availableCredit",
      "leftCredits",
      "leftCredit"
    ]) ?? findNumericByPath(candidates, ["credit", "remain"]);

  const total = totalCredits ?? (
    remainingCredits !== null && usedCredits !== null
      ? remainingCredits + usedCredits
      : null
  );
  const used = usedCredits ?? (
    total !== null && remainingCredits !== null
      ? total - remainingCredits
      : null
  );
  const remaining = remainingCredits ?? (
    total !== null && used !== null
      ? total - used
      : null
  );

  if (total === null && used === null && remaining === null) return null;
  const planName = findStringByKeys(candidates, ["planName", "name", "planType", "subscriptionName"]);
  const validUntil = findStringByKeys(candidates, ["currentPeriodEnd", "validUntil", "expiresAt", "expireAt"]);

  return buildQuota({
    totalCredits: total,
    usedCredits: used,
    remainingCredits: remaining,
    recentCredits: null,
    planName,
    validUntil
  });
}

function estimateLocalTokenPlan({ env, sessions, collectedAt, model }) {
  const totalCredits = numberOrNull(env.XIAOMI_TOKEN_PLAN_TOTAL_CREDITS) ?? DEFAULT_TOTAL_CREDITS;
  const fiveHourCredits = numberOrNull(env.XIAOMI_TOKEN_PLAN_FIVE_HOUR_CREDITS) ?? DEFAULT_FIVE_HOUR_CREDITS;
  const planName = env.XIAOMI_TOKEN_PLAN_NAME || "Token Plan";
  const nowMs = collectedAt.getTime();
  const planStartMs = parsePlanStart(env.XIAOMI_TOKEN_PLAN_START_AT);
  const manualUsedCredits = numberOrNull(env.XIAOMI_TOKEN_PLAN_USED_CREDITS);
  const manualRemainingCredits = numberOrNull(env.XIAOMI_TOKEN_PLAN_REMAINING_CREDITS);
  const snapshotMs = parsePlanStart(env.XIAOMI_TOKEN_PLAN_SNAPSHOT_AT);
  const localDeltaStartMs = manualUsedCredits !== null && Number.isFinite(snapshotMs)
    ? snapshotMs
    : planStartMs;
  let localUsedCredits = 0;
  let recentCredits = 0;

  for (const session of sessions || []) {
    const sessionMs = timestampToMs(session.lastMessageAt || session.startedAt);
    const credits = estimateSessionCredits(session, session.model || model);
    if (
      !Number.isFinite(localDeltaStartMs) ||
      !Number.isFinite(sessionMs) ||
      sessionMs >= localDeltaStartMs
    ) {
      localUsedCredits += credits;
    }
    if (Number.isFinite(sessionMs) && nowMs - sessionMs <= FIVE_HOUR_MS) {
      recentCredits += credits;
    }
  }

  const usedCredits = manualUsedCredits !== null
    ? manualUsedCredits + localUsedCredits
    : localUsedCredits;
  const remainingCredits = manualRemainingCredits !== null && manualUsedCredits === null
    ? manualRemainingCredits
    : totalCredits - usedCredits;

  return {
    ...buildQuota({
      totalCredits,
      usedCredits,
      remainingCredits,
      recentCredits,
      fiveHourCredits,
      planName
    }),
    validUntil: env.XIAOMI_TOKEN_PLAN_VALID_UNTIL || null,
    localDeltaCredits: manualUsedCredits !== null ? localUsedCredits : null,
    snapshotAt: Number.isFinite(snapshotMs) ? new Date(snapshotMs).toISOString() : null,
    source: "local-token-plan-estimate",
    status: "estimated",
    label: manualUsedCredits !== null ? "截图校准" : "本地估算",
    fetchedAt: collectedAt.toISOString()
  };
}

function estimateSessionCredits(session, model) {
  const tokens =
    numberOrZero(session.inputTokens) +
    numberOrZero(session.outputTokens) +
    numberOrZero(session.cacheReadTokens) +
    numberOrZero(session.cacheWriteTokens) +
    numberOrZero(session.reasoningTokens);
  const rate = getModelCreditRate(model);
  const offPeak = isBeijingOffPeak(timestampToMs(session.lastMessageAt || session.startedAt)) ? 0.8 : 1;
  return Math.round(tokens * rate * offPeak);
}

function getModelCreditRate(model) {
  const value = String(model || "").toLowerCase();
  if (/mimo-v?2\.5-pro|mimo.*pro/.test(value)) return 2;
  if (/mimo-v?2\.5/.test(value)) return 1;
  return 2;
}

function isBeijingOffPeak(timestampMs) {
  if (!Number.isFinite(timestampMs)) return false;
  const rawHour = Number(new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(new Date(timestampMs)));
  const hour = rawHour === 24 ? 0 : rawHour;
  return hour >= 0 && hour < 8;
}

function buildQuota({ totalCredits, usedCredits, remainingCredits, recentCredits, fiveHourCredits, planName, validUntil }) {
  const total = clampNonNegative(totalCredits);
  const used = clampNonNegative(usedCredits);
  const remaining = clampNonNegative(remainingCredits);
  const usedPercent = total ? percentage(used, total) : null;
  const remainingPercent = total ? Math.max(0, Math.min(100, 100 - Math.round(usedPercent))) : null;
  return {
    totalCredits: total,
    usedCredits: used,
    remainingCredits: remaining,
    usedPercent,
    remainingPercent,
    recentCredits: clampNonNegative(recentCredits),
    fiveHourCredits: clampNonNegative(fiveHourCredits),
    fiveHourUsedPercent: fiveHourCredits ? percentage(recentCredits || 0, fiveHourCredits) : null,
    planName: planName || "Token Plan",
    validUntil: validUntil || null
  };
}

function readPlatformCookie(env, hermesDataPath) {
  const fromEnv =
    env.XIAOMI_PLATFORM_COOKIE ||
    env.XIAOMI_MIMO_PLATFORM_COOKIE ||
    env.XIAOMI_TOKEN_PLAN_COOKIE;
  if (fromEnv) return fromEnv.trim();

  const cookiePath = path.join(hermesDataPath || "", "xiaomi-platform-cookie.txt");
  try {
    const cookie = fs.readFileSync(cookiePath, "utf8").trim();
    return cookie || null;
  } catch {
    return null;
  }
}

function fingerprintCookie(cookie) {
  if (!cookie) return "missing";
  return crypto.createHash("sha256").update(cookie).digest("hex");
}

function loadHermesEnv(hermesDataPath) {
  const envPath = path.join(hermesDataPath || "", ".env");
  try {
    return parseEnv(fs.readFileSync(envPath, "utf8"));
  } catch {
    return {};
  }
}

function parseEnv(text) {
  const env = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    env[match[1]] = unquote(match[2].trim());
  }
  return env;
}

function unquote(value) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function unwrapData(value) {
  if (!value || typeof value !== "object") return value;
  if (value.data && typeof value.data === "object") return value.data;
  return value;
}

function findUsageItem(value, names) {
  const normalizedNames = new Set(names.map(normalizeKey));
  let fallback = null;

  function visit(node) {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = visit(child);
        if (found) return found;
      }
      return null;
    }

    const itemName = normalizeKey(node.name);
    const hasUsageShape = numberOrNull(node.used) !== null && numberOrNull(node.limit) !== null;
    if (hasUsageShape && normalizedNames.has(itemName)) return node;
    if (!fallback && hasUsageShape) fallback = node;

    for (const child of Object.values(node)) {
      const found = visit(child);
      if (found) return found;
    }
    return null;
  }

  return visit(value) || fallback;
}

function findNumericByKeys(values, keys) {
  const normalized = new Set(keys.map(normalizeKey));
  for (const { key, value } of walkValues(values)) {
    if (normalized.has(normalizeKey(key))) {
      const number = numberOrNull(value);
      if (number !== null) return number;
    }
  }
  return null;
}

function findNumericByPath(values, fragments) {
  for (const { path: valuePath, value } of walkValues(values)) {
    const normalizedPath = valuePath.map(normalizeKey).join(".");
    if (fragments.every((fragment) => normalizedPath.includes(normalizeKey(fragment)))) {
      const number = numberOrNull(value);
      if (number !== null) return number;
    }
  }
  return null;
}

function findStringByKeys(values, keys) {
  const normalized = new Set(keys.map(normalizeKey));
  for (const { key, value } of walkValues(values)) {
    if (normalized.has(normalizeKey(key)) && typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function* walkValues(values) {
  for (const value of Array.isArray(values) ? values : [values]) {
    yield* walkValue(value, []);
  }
}

function* walkValue(value, currentPath) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      yield* walkValue(value[index], [...currentPath, String(index)]);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      yield { key, path: [...currentPath, key], value: child };
      yield* walkValue(child, [...currentPath, key]);
    }
  }
}

function normalizeKey(value) {
  return String(value || "").replace(/[_\-\s]/g, "").toLowerCase();
}

function parsePlanStart(value) {
  if (!value) return NaN;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function timestampToMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return NaN;
  return number > 10_000_000_000 ? number : number * 1000;
}

function percentage(value, max) {
  if (!max) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clampNonNegative(value) {
  const number = numberOrNull(value);
  if (number === null) return null;
  return Math.max(0, number);
}

module.exports = {
  getXiaomiTokenPlan,
  estimateSessionCredits,
  getModelCreditRate,
  normalizePlatformQuota,
  shouldUseXiaomiTokenPlan
};
