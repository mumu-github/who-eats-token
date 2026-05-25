import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { getQuotaDelight } = require("../src/protocol/quota-delight.cjs");

assert.deepEqual(
  pick(getQuotaDelight({ status: "live", lowestRemainingPercent: 82, freshness: "fresh" })),
  {
    id: "comfy",
    mood: "comfy",
    shortLabel: "放心吃",
    tone: "comfy",
    motion: "soft",
    severity: "normal",
    priority: 0,
    attention: false,
    cue: {
      icon: "spark",
      mascot: "stretch",
      chart: "soft",
      reducedMotion: "static"
    }
  },
  "High live quota should feel relaxed."
);

assert.deepEqual(
  pick(getQuotaDelight({ status: "live", lowestRemainingPercent: 34, freshness: "fresh" })),
  {
    id: "tight",
    mood: "tight",
    shortLabel: "省着吃",
    tone: "caution",
    motion: "breathe",
    severity: "caution",
    priority: 1,
    attention: false,
    cue: {
      icon: "gauge",
      mascot: "careful",
      chart: "breathe",
      reducedMotion: "static"
    }
  },
  "Mid-low quota should feel careful but not alarming."
);

assert.deepEqual(
  pick(getQuotaDelight({ status: "live", lowestRemainingPercent: 17, freshness: "fresh" })),
  {
    id: "low",
    mood: "low",
    shortLabel: "省着点",
    tone: "danger",
    motion: "attention",
    severity: "critical",
    priority: 3,
    attention: true,
    cue: {
      icon: "warning",
      mascot: "small-bites",
      chart: "alert",
      reducedMotion: "static"
    }
  },
  "Below 20% must become an attention state."
);

assert.deepEqual(
  pick(getQuotaDelight({ status: "delayed", lowestRemainingPercent: 70, freshness: "warm" })),
  {
    id: "lagging",
    mood: "lagging",
    shortLabel: "慢半拍",
    tone: "caution",
    motion: "breathe",
    severity: "watch",
    priority: 2,
    attention: true,
    cue: {
      icon: "clock",
      mascot: "blink",
      chart: "breathe",
      reducedMotion: "static"
    }
  },
  "Delayed data must be visibly distinct from live quota."
);

assert.deepEqual(
  pick(getQuotaDelight({ status: "missing", lowestRemainingPercent: null, freshness: "unknown" })),
  {
    id: "waiting",
    mood: "waiting",
    shortLabel: "等开饭",
    tone: "muted",
    motion: "none",
    severity: "normal",
    priority: 0,
    attention: false,
    cue: {
      icon: "bowl",
      mascot: "peek",
      chart: "quiet",
      reducedMotion: "static"
    }
  },
  "Missing data should be quiet and non-alarming."
);

const estimatedLow = getQuotaDelight({
  status: "estimated",
  lowestRemainingPercent: 17,
  freshness: "fresh"
});
assert.equal(estimatedLow.estimated, true, "Estimated state should retain estimate marker.");
assert.equal(estimatedLow.mood, "low", "Estimated low quota should use the same quota band.");
assert.equal(estimatedLow.cue.chart, "alert", "Estimated low quota must still drive alert chart cue.");

const clamped = getQuotaDelight({
  status: "live",
  lowestRemainingPercent: 145,
  freshness: "fresh"
});
assert.equal(clamped.mood, "comfy", "Out-of-range remaining values should be safely clamped.");

console.log("Quota delight checks passed.");

function pick(delight) {
  return {
    id: delight.id,
    mood: delight.mood,
    shortLabel: delight.shortLabel,
    tone: delight.tone,
    motion: delight.motion,
    severity: delight.severity,
    priority: delight.priority,
    attention: delight.attention,
    cue: {
      icon: delight.cue.icon,
      mascot: delight.cue.mascot,
      chart: delight.cue.chart,
      reducedMotion: delight.cue.reducedMotion
    }
  };
}
