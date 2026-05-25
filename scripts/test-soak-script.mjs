import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(read("package.json"));
const soak = read("scripts/lib/packaged-soak.mjs");
const win = read("scripts/soak-packaged-win.mjs");
const mac = read("scripts/soak-packaged-mac.mjs");
const performanceBudget = read("docs/performance-budget.md");
const releaseReadiness = read("docs/release-readiness.md");

assert.ok(packageJson.scripts?.["soak:packaged-win"], "Missing soak:packaged-win script.");
assert.ok(packageJson.scripts?.["soak:packaged-mac"], "Missing soak:packaged-mac script.");
assert.ok(packageJson.scripts?.["test:soak-script"], "Missing test:soak-script script.");

assertIncludes(soak, "WHO_EATS_TOKEN_SOAK_DURATION_MS");
assertIncludes(soak, "WHO_EATS_TOKEN_SOAK_INTERVAL_MS");
assertIncludes(soak, "WHO_EATS_TOKEN_SOAK_MAX_RSS_MB");
assertIncludes(soak, "WHO_EATS_TOKEN_SOAK_MAX_GROWTH_MB");
assertIncludes(soak, "WHO_EATS_TOKEN_SOAK_MAX_CPU_PERCENT");
assertIncludes(soak, "WHO_EATS_TOKEN_DISABLE_GPU");
assertIncludes(soak, "WHO_EATS_TOKEN_HEADLESS_SMOKE");
assertIncludes(soak, "--no-sandbox");
assertIncludes(soak, "waitForPortClosed");
assertIncludes(soak, "hud-debug.ndjson");
assertIncludes(soak, "/health");
assert.ok(!soak.includes("setInterval("), "Packaged soak must use explicit sampling waits, not a persistent interval.");

assertIncludes(win, "win-unpacked");
assertIncludes(win, "Who Eats Token.exe");
assertIncludes(mac, "Who Eats Token.app");
assertIncludes(mac, "Contents");
assertIncludes(mac, "MacOS");
assertIncludes(performanceBudget, "soak:packaged-win");
assertIncludes(performanceBudget, "WHO_EATS_TOKEN_SOAK_DURATION_MS");
assertIncludes(releaseReadiness, "soak:packaged-win");

console.log("Packaged soak script checks passed.");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertIncludes(text, needle) {
  assert.ok(text.includes(needle), `Expected text to include ${needle}.`);
}
