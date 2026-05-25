const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MAX_FILES = 12;
const MAX_AGE_MS = 8 * 24 * 60 * 60 * 1000;
const HEAD_BYTES = 64 * 1024;
const TAIL_BYTES = 768 * 1024;
const STALE_RATE_LIMIT_MS = 2 * 60 * 1000;
const FAST_JUMP_WINDOW_MS = 60 * 1000;
const MAX_FAST_REMAINING_JUMP = 8;

let lastTrustedRateLimits = null;

function collectCodexUsage(options = {}) {
  const sessionsRoot =
    options.sessionsRoot || path.join(os.homedir(), ".codex", "sessions");
  const now = new Date();

  if (!fs.existsSync(sessionsRoot)) {
    return missingProvider("Codex", "Codex session directory not found");
  }

  const files = listRecentJsonlFiles(sessionsRoot, now.getTime());
  if (files.length === 0) {
    return missingProvider("Codex", "No recent Codex session files found");
  }

  const sessions = files.map(parseSessionFile).filter(Boolean);
  const latestSession = sessions
    .filter((session) => session.latestTokenAt)
    .sort((a, b) => new Date(b.latestTokenAt) - new Date(a.latestTokenAt))[0];
  const bestRateLimitSession = chooseBestRateLimitSession(sessions);
  const stabilizedRateLimits = stabilizeRateLimits({
    rateLimits: bestRateLimitSession?.rateLimits || latestSession?.rateLimits || null,
    sourceSession: bestRateLimitSession || latestSession || null,
    now
  });

  const todayKey = localDateKey(now);
  const todayTokens = sessions.reduce(
    (sum, session) => sum + session.todayTokens,
    0
  );
  const recentTokens = sessions.reduce(
    (sum, session) => sum + session.recentTokens,
    0
  );

  return {
    id: "codex",
    name: "Codex",
    status: latestSession ? "live" : "missing",
    source: "Codex Desktop session JSONL",
    confidence: "exact",
    note: latestSession
      ? "Read from recent local token_count events."
      : "Session files exist, but no token_count events were found.",
    collectedAt: now.toISOString(),
    todayKey,
    todayTokens,
    recentTokens,
    todayCostUsd: 0,
    latest: latestSession
      ? {
          sessionId: latestSession.sessionId,
          threadName: latestSession.threadName,
          model: latestSession.model,
          provider: latestSession.modelProvider,
          lastTurnTokens: latestSession.lastTurnTokens,
          latestTokenAt: latestSession.latestTokenAt,
          rateLimits: normalizeRateLimits(stabilizedRateLimits.rateLimits),
          rateLimitsTrust: stabilizedRateLimits.trust,
          rateLimitsSource: stabilizedRateLimits.sourceSession
            ? {
                sessionId: stabilizedRateLimits.sourceSession.sessionId,
                updatedAt: stabilizedRateLimits.sourceSession.rateLimitsUpdatedAt
              }
            : null
        }
      : null,
    sessions: sessions
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      .slice(0, 8)
      .map((session) => ({
        id: session.sessionId,
        threadName: session.threadName,
        model: session.model,
        todayTokens: session.todayTokens,
        recentTokens: session.recentTokens,
        lastTurnTokens: session.lastTurnTokens,
        updatedAt: session.updatedAt,
        latestTokenAt: session.latestTokenAt
      }))
  };
}

function stabilizeRateLimits({ rateLimits, sourceSession, now }) {
  const nowMs = now.getTime();
  const sourceMs = Date.parse(sourceSession?.rateLimitsUpdatedAt || sourceSession?.latestTokenAt || "");
  const ageMs = Number.isFinite(sourceMs) ? nowMs - sourceMs : Infinity;
  const baseTrust = {
    status: ageMs > STALE_RATE_LIMIT_MS ? "delayed" : "live",
    label: ageMs > STALE_RATE_LIMIT_MS ? "延迟" : "实时",
    reason: ageMs > STALE_RATE_LIMIT_MS ? "Rate limit data is older than two minutes." : null,
    ageMs: Number.isFinite(ageMs) ? Math.max(0, ageMs) : null
  };
  const trust = isCodexModelQuotaBucket(rateLimits?.limit_id)
    ? {
        status: "suspect",
        label: "模型桶",
        reason: "Using a model-specific Codex quota bucket because the aggregate Codex UI quota bucket was not found.",
        ageMs: baseTrust.ageMs
      }
    : baseTrust;

  if (!rateLimits) {
    if (lastTrustedRateLimits) {
      return {
        rateLimits: lastTrustedRateLimits.rateLimits,
        sourceSession: lastTrustedRateLimits.sourceSession,
        trust: {
          status: "delayed",
          label: "延迟",
          reason: "Using last trusted rate limit data because no current rate limit was found.",
          ageMs: nowMs - lastTrustedRateLimits.acceptedAt
        }
      };
    }
    return {
      rateLimits: null,
      sourceSession: null,
      trust: {
        status: "missing",
        label: "等待",
        reason: "No rate limit data found.",
        ageMs: null
      }
    };
  }

  if (lastTrustedRateLimits && isSuspiciousJump(lastTrustedRateLimits, rateLimits, nowMs)) {
    return {
      rateLimits: lastTrustedRateLimits.rateLimits,
      sourceSession: lastTrustedRateLimits.sourceSession,
      trust: {
        status: "suspect",
        label: "疑似",
        reason: "Held previous quota because the remaining percentage jumped up too fast without a window reset.",
        ageMs: nowMs - lastTrustedRateLimits.acceptedAt
      }
    };
  }

  lastTrustedRateLimits = {
    rateLimits,
    sourceSession,
    acceptedAt: nowMs
  };

  return {
    rateLimits,
    sourceSession,
    trust
  };
}

function isSuspiciousJump(previous, nextRateLimits, nowMs) {
  if (nowMs - previous.acceptedAt > FAST_JUMP_WINDOW_MS) return false;
  if (hasResetWindowChanged(previous.rateLimits, nextRateLimits)) return false;
  if (isResetBoundary(previous.rateLimits, nextRateLimits, nowMs)) return false;

  const primaryJump = remainingJump(previous.rateLimits.primary, nextRateLimits.primary);
  const secondaryJump = remainingJump(previous.rateLimits.secondary, nextRateLimits.secondary);
  return primaryJump > MAX_FAST_REMAINING_JUMP || secondaryJump > MAX_FAST_REMAINING_JUMP;
}

function hasResetWindowChanged(previous, next) {
  return hasResetChanged(previous?.primary, next?.primary) || hasResetChanged(previous?.secondary, next?.secondary);
}

function hasResetChanged(previous, next) {
  const previousReset = Number(previous?.resets_at);
  const nextReset = Number(next?.resets_at);
  if (!Number.isFinite(previousReset) || !Number.isFinite(nextReset)) return true;
  return Math.abs(nextReset - previousReset) > 60;
}

function isResetBoundary(previous, next, nowMs) {
  return isWindowResetBoundary(previous?.primary, next?.primary, nowMs) ||
    isWindowResetBoundary(previous?.secondary, next?.secondary, nowMs);
}

function isWindowResetBoundary(previous, next, nowMs) {
  if (!previous || !next) return false;
  const previousResetMs = Number(previous.resets_at) * 1000;
  if (!Number.isFinite(previousResetMs)) return false;
  const nextRemaining = remainingPercent(next);
  return previousResetMs <= nowMs + 30 * 1000 && nextRemaining >= 95;
}

function remainingJump(previous, next) {
  if (!previous || !next) return 0;
  return remainingPercent(next) - remainingPercent(previous);
}

function remainingPercent(window) {
  return Math.max(0, 100 - Math.round(numberOrZero(window?.used_percent)));
}

function chooseBestRateLimitSession(sessions) {
  const candidates = sessions.filter((session) => session.rateLimits);
  if (candidates.length === 0) return null;

  return candidates.reduce((best, session) => {
    const bestScore = scoreRateLimits(best.rateLimits);
    const currentScore = scoreRateLimits(session.rateLimits);
    if (currentScore !== bestScore) {
      return currentScore > bestScore ? session : best;
    }

    const bestMs = Date.parse(best.rateLimitsUpdatedAt || best.latestTokenAt || "");
    const currentMs = Date.parse(session.rateLimitsUpdatedAt || session.latestTokenAt || "");
    if (!Number.isFinite(bestMs)) return session;
    if (!Number.isFinite(currentMs)) return best;
    return currentMs > bestMs ? session : best;
  }, candidates[0]);
}

function missingProvider(name, note) {
  return {
    id: name.toLowerCase(),
    name,
    status: "missing",
    source: "local",
    confidence: "none",
    note,
    collectedAt: new Date().toISOString(),
    todayTokens: 0,
    recentTokens: 0,
    todayCostUsd: 0,
    latest: null,
    sessions: []
  };
}

function listRecentJsonlFiles(root, nowMs) {
  const files = [];
  walk(root, (filePath, stat) => {
    if (!filePath.endsWith(".jsonl")) return;
    if (nowMs - stat.mtimeMs > MAX_AGE_MS) return;
    files.push({ filePath, mtimeMs: stat.mtimeMs });
  });
  return files
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, MAX_FILES)
    .map((entry) => entry.filePath);
}

function walk(dir, onFile) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, onFile);
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      onFile(fullPath, fs.statSync(fullPath));
    } catch {
      // Ignore files that rotate while we are scanning.
    }
  }
}

function parseSessionFile(filePath) {
  let content;
  try {
    content = readSessionSample(filePath);
  } catch {
    return null;
  }

  const session = {
    filePath,
    sessionId: path.basename(filePath, ".jsonl"),
    threadName: "",
    modelProvider: "openai",
    model: "",
    updatedAt: null,
    latestTokenAt: null,
    lastTurnTokens: 0,
    cumulativeSessionTokens: 0,
    todayTokens: 0,
    recentTokens: 0,
    rateLimits: null,
    rateLimitsUpdatedAt: null
  };

  const calls = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if (event.timestamp) session.updatedAt = event.timestamp;

    if (event.type === "session_meta") {
      const payload = event.payload || {};
      session.sessionId = payload.id || session.sessionId;
      session.threadName = payload.thread_name || session.threadName;
      session.modelProvider = payload.model_provider || session.modelProvider;
      continue;
    }

    if (event.type === "turn_context") {
      if (event.payload?.model) session.model = event.payload.model;
      continue;
    }

    if (event.type !== "event_msg") continue;
    const payload = event.payload || {};
    if (payload.type !== "token_count") continue;

    session.latestTokenAt = event.timestamp || session.latestTokenAt;
    const rateLimits = chooseRateLimits(session.rateLimits, payload.rate_limits, {
      currentTimestamp: session.rateLimitsUpdatedAt,
      candidateTimestamp: event.timestamp
    });
    if (rateLimits !== session.rateLimits) {
      session.rateLimits = rateLimits;
      session.rateLimitsUpdatedAt = event.timestamp || session.rateLimitsUpdatedAt;
    }

    const tokenInfo = payload.info || {};
    const totalUsage = tokenInfo.total_token_usage || {};
    const lastUsage = tokenInfo.last_token_usage || {};
    const totalTokens = numberOrZero(totalUsage.total_tokens);
    const lastTokens = numberOrZero(lastUsage.total_tokens);
    const effectiveTokens = lastTokens || totalTokens;

    if (effectiveTokens > 0) {
      calls.push({
        tokens: effectiveTokens,
        timestamp: event.timestamp || session.updatedAt
      });
      session.lastTurnTokens = lastTokens || effectiveTokens;
      session.cumulativeSessionTokens = totalTokens || session.cumulativeSessionTokens;
    }
  }

  const now = new Date();
  const todayKey = localDateKey(now);
  const recentCutoff = now.getTime() - 60 * 60 * 1000;

  for (const call of calls) {
    const timestamp = call.timestamp ? new Date(call.timestamp) : null;
    if (!timestamp || Number.isNaN(timestamp.getTime())) continue;
    if (localDateKey(timestamp) === todayKey) {
      session.todayTokens += call.tokens;
    }
    if (timestamp.getTime() >= recentCutoff) {
      session.recentTokens += call.tokens;
    }
  }

  return session;
}

function readSessionSample(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size <= HEAD_BYTES + TAIL_BYTES) {
    return fs.readFileSync(filePath, "utf8");
  }

  const fd = fs.openSync(filePath, "r");
  try {
    const headBuffer = Buffer.alloc(HEAD_BYTES);
    const tailBuffer = Buffer.alloc(TAIL_BYTES);
    const headBytes = fs.readSync(fd, headBuffer, 0, HEAD_BYTES, 0);
    const tailStart = Math.max(0, stat.size - TAIL_BYTES);
    const tailBytes = fs.readSync(fd, tailBuffer, 0, TAIL_BYTES, tailStart);

    return `${headBuffer.subarray(0, headBytes).toString("utf8")}\n${tailBuffer
      .subarray(0, tailBytes)
      .toString("utf8")}`;
  } finally {
    fs.closeSync(fd);
  }
}

function normalizeRateLimits(rateLimits) {
  if (!rateLimits) return null;
  return {
    limitId: rateLimits.limit_id || null,
    planType: rateLimits.plan_type || null,
    primary: normalizeWindow(rateLimits.primary),
    secondary: normalizeWindow(rateLimits.secondary),
    reachedType: rateLimits.rate_limit_reached_type || null
  };
}

function chooseRateLimits(current, candidate, timestamps = {}) {
  if (!isUsableRateLimits(candidate)) return current;
  if (!current) return candidate;

  const currentScore = scoreRateLimits(current);
  const candidateScore = scoreRateLimits(candidate);
  if (candidateScore !== currentScore) {
    return candidateScore > currentScore ? candidate : current;
  }

  const currentMs = Date.parse(timestamps.currentTimestamp || "");
  const candidateMs = Date.parse(timestamps.candidateTimestamp || "");
  if (!Number.isFinite(currentMs)) return candidate;
  if (!Number.isFinite(candidateMs)) return current;
  return candidateMs >= currentMs ? candidate : current;
}

function isUsableRateLimits(rateLimits) {
  if (!rateLimits) return false;
  return scoreRateLimits(rateLimits) > 0;
}

function scoreRateLimits(rateLimits) {
  if (!rateLimits) return 0;
  const nowSeconds = Date.now() / 1000;
  let score = 0;
  if (isExactCodexQuotaBucket(rateLimits.limit_id)) score += 20;
  else if (isCodexModelQuotaBucket(rateLimits.limit_id)) score += 5;
  if (rateLimits.limit_name) score += 1;
  if (rateLimits.plan_type) score += 1;
  if (isExpectedWindow(rateLimits.primary, 300, nowSeconds)) score += 2;
  if (isExpectedWindow(rateLimits.secondary, 10080, nowSeconds)) score += 2;
  return score;
}

function isExactCodexQuotaBucket(limitId) {
  const value = String(limitId || "").toLowerCase();
  return value === "codex";
}

function isCodexModelQuotaBucket(limitId) {
  const value = String(limitId || "").toLowerCase();
  return value.startsWith("codex_");
}

function isExpectedWindow(window, minutes, nowSeconds) {
  if (!window) return false;
  const windowMinutes = numberOrZero(window.window_minutes);
  const resetsAt = Number(window.resets_at);
  if (windowMinutes !== minutes) return false;
  if (!Number.isFinite(resetsAt)) return false;
  return resetsAt > nowSeconds;
}

function normalizeWindow(window) {
  if (!window) return null;
  return {
    usedPercent: numberOrZero(window.used_percent),
    windowMinutes: numberOrZero(window.window_minutes),
    resetsAt: window.resets_at ? new Date(window.resets_at * 1000).toISOString() : null
  };
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

module.exports = {
  collectCodexUsage
};
