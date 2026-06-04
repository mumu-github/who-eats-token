import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

assert.ok(packageJson.scripts?.["release:summary"], "Missing release:summary script.");
assert.ok(packageJson.scripts?.["test:release-summary"], "Missing test:release-summary script.");

const report = runSummary(["--json"], 0);

assert.equal(report.package.name, "who-eats-token");
assert.equal(report.sourceBetaReady, true, "Source beta should be ready when source gates and guards are clean.");
assert.equal(report.sourceBetaOk, true);
assert.equal(report.publicReleaseReady, false, "Manual/external evidence is still required before public release.");
assert.equal(report.guardReady, true, "Secret and license guards should be clean.");
assert.equal(report.guards.secret.findingCount, 0);
assert.equal(report.guards.license.findingCount, 0);
assert.ok(report.guards.license.packageCount > 0);
assert.equal(report.releaseGaps.summary.total, 15);
assert.equal(report.releaseGaps.summary.blocking, 2);
assertBlocking("macos-packaged-runtime");
assertBlocking("signing");
for (const target of ["macos", "signing"]) {
  assert.ok(report.nextActions.actions.some((action) => action.target === target), `Missing next action target: ${target}`);
}
assert.ok(!report.nextActions.actions.some((action) => action.target === "ide"), "IDE adapter validation should be complete.");
assert.ok(!report.nextActions.actions.some((action) => action.target === "browser"), "Browser adapter validation should be complete.");
assert.ok(report.commands.includes("npm run release:summary -- --json"));
assert.ok(report.commands.includes("npm run release:check -- --list --json"));

const text = runText([]);
assert.match(text, /Who Eats Token Release Summary/);
assert.match(text, /Source beta ready: yes/);
assert.match(text, /Public release ready: no/);
assert.match(text, /Source guards: OK/);
assert.match(text, /Blocking gaps: 2\/15/);
assert.match(text, /macos-packaged-runtime/);

const required = runSummary(["--json", "--require-public-release"], 1);
assert.equal(required.ok, false);
assert.equal(required.publicReleaseReady, false);

const sourceRequired = runSummary(["--json", "--require-source-beta"], 0);
assert.equal(sourceRequired.ok, true);
assert.equal(sourceRequired.target, "source-beta");
assert.equal(sourceRequired.sourceBetaOk, true);

console.log("Release summary checks passed.");

function runSummary(args, expectedStatus) {
  const result = spawnSync(process.execPath, ["scripts/release-summary.mjs", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function runText(args) {
  const result = spawnSync(process.execPath, ["scripts/release-summary.mjs", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function assertBlocking(id) {
  assert.ok(report.releaseGaps.blocking.some((check) => check.id === id), `Missing blocking check: ${id}`);
}
