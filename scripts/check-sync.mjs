import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { collectCodexUsage } = require("../src/collectors/codex.cjs");

const snapshot = collectCodexUsage();
const rateLimits = snapshot.latest?.rateLimits;
const trust = snapshot.latest?.rateLimitsTrust;

if (!rateLimits) {
  console.error("No Codex rate limit data found.");
  process.exitCode = 1;
} else {
  const primaryRemaining = remaining(rateLimits.primary);
  const secondaryRemaining = remaining(rateLimits.secondary);
  const rows = [
    ["limitId", rateLimits.limitId || "--"],
    ["sync", trust ? `${trust.label} (${trust.status})` : "--"],
    ["5h remaining", formatPercent(primaryRemaining)],
    ["5h resets", formatDate(rateLimits.primary?.resetsAt)],
    ["1w remaining", formatPercent(secondaryRemaining)],
    ["1w resets", formatDate(rateLimits.secondary?.resetsAt)]
  ];

  for (const [label, value] of rows) {
    console.log(`${label.padEnd(14)} ${value}`);
  }

  if (rateLimits.limitId !== "codex") {
    console.warn("Warning: selected rate limit is not the Codex UI quota bucket.");
    process.exitCode = 2;
  }
}

function remaining(window) {
  if (!window) return null;
  return Math.max(0, 100 - Math.round(Number(window.usedPercent || 0)));
}

function formatPercent(value) {
  return value === null || value === undefined ? "--" : `${value}%`;
}

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}
