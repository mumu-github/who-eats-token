import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const jsonOutput = execFileSync(process.execPath, ["scripts/performance-summary.mjs", "--json"], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true
});
const report = JSON.parse(jsonOutput);

assert.equal(report.ok, true, "Performance summary should be clean.");
assert.ok(report.packageWeight.lockPackageCount > 0, "Performance summary must include package-lock package count.");
assert.ok(report.packageWeight.runtimeDependencyCount >= 1, "Performance summary must include runtime dependency count.");
assert.equal(report.intervalAudit.unreviewedRuntimeIntervalCount, 0, "No unreviewed runtime intervals should be present.");
assert.equal(report.intervalAudit.adapterDomIntervalCount, 0, "Browser/overlay adapters must stay event-driven.");
assert.ok(report.intervalAudit.reviewedRuntimeIntervalCount >= 2, "Runtime refresh intervals must be explicitly reviewed.");
assert.equal(report.adapterReview.errorCount, 0, "Adapter review errors should be zero.");
assert.equal(report.adapterReview.warningCount, 0, "Adapter review warnings should be zero.");
assert.ok(report.adapterBoundaries.withShortTimeouts >= report.adapterBoundaries.supportedCount, "Supported adapters should have timeout/no-runtime boundaries.");
assert.equal(report.releaseEvidence.windowsPackagedSoak.status, "passed", "Windows packaged soak evidence should be recorded.");
assert.ok(report.commands.includes("npm run test:performance-budget"), "Summary must point to static performance budget test.");
assert.ok(report.commands.includes("npm run soak:packaged-win"), "Summary must point to Windows soak.");
assert.ok(report.commands.includes("npm run release:summary"), "Summary must connect to release summary.");

const textOutput = execFileSync(process.execPath, ["scripts/performance-summary.mjs"], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true
});

assertIncludes(textOutput, "# Performance Summary");
assertIncludes(textOutput, "Low-memory gates");
assertIncludes(textOutput, "Adapter boundaries");
assertIncludes(textOutput, "Windows packaged soak");
assertIncludes(textOutput, "Packaged soak");

console.log("Performance summary checks passed.");

function assertIncludes(text, needle) {
  assert.ok(text.includes(needle), `Expected text to include ${needle}.`);
}
