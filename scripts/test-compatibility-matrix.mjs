import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const jsonOutput = execFileSync(process.execPath, ["scripts/compatibility-matrix.mjs", "--json"], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true
});
const matrix = JSON.parse(jsonOutput);

assert.equal(matrix.ok, true, "Compatibility matrix should be clean.");
assert.equal(matrix.schema, "who-eats-token.compatibility-matrix.v1");
assert.ok(matrix.platformTargets.some((platform) => platform.id === "windows" && platform.sourceLevelCi && platform.packagedSmokeScript && platform.packagedSoakScript));
assert.ok(matrix.platformTargets.some((platform) => platform.id === "macos" && platform.sourceLevelCi && platform.packagedSmokeScript && platform.packagedSoakScript));
assert.ok(matrix.adapterSummary.total >= 10, "Compatibility matrix should cover all current adapter surfaces.");
assert.equal(matrix.adapterSummary.windows, matrix.adapterSummary.total, "Every public adapter entry should explicitly target Windows.");
assert.equal(matrix.adapterSummary.macos, matrix.adapterSummary.total, "Every public adapter entry should explicitly target macOS.");
assert.ok(matrix.adapters.some((adapter) => adapter.id === "codex-local-collector" && adapter.publicClaim === "first-class"));
assert.ok(matrix.adapters.some((adapter) => adapter.id === "browser-extension" && adapter.verificationLevel === "runtime-check"));
assert.ok(matrix.adapters.some((adapter) => adapter.id === "provider-specific-adapters" && adapter.verificationLevel === "planned"));
assert.ok(matrix.signalCoverage.some((entry) => entry.signal === "hud-overlays" && entry.adapters.includes("browser-extension")));
assert.ok(matrix.signalCoverage.some((entry) => entry.signal === "quota-token-plan" && entry.adapters.includes("hermes-local-collector")));
assert.ok(matrix.releaseBlockers.some((blocker) => blocker.id === "macos-packaged-runtime"), "Current public blockers must stay visible.");
assert.ok(matrix.commands.includes("npm run compatibility:matrix -- --check"));
assert.deepEqual(matrix.findings, []);

const docPath = path.join(root, "docs", "compatibility-matrix.md");
assert.ok(fs.existsSync(docPath), "Generated compatibility matrix doc is required.");
const checkRun = spawnSync(process.execPath, ["scripts/compatibility-matrix.mjs", "--check"], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true
});
assert.equal(checkRun.status, 0, checkRun.stderr || checkRun.stdout);

const doc = fs.readFileSync(docPath, "utf8");
assert.match(doc, /# Compatibility Matrix/);
assert.match(doc, /Platform Targets/);
assert.match(doc, /Adapter Compatibility/);
assert.match(doc, /Signal Coverage/);
assert.match(doc, /Current Public Release Blockers/);

console.log("Compatibility matrix checks passed.");
