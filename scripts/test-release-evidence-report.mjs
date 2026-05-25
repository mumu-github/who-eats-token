import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

assert.ok(packageJson.scripts?.["release:evidence-report"], "Missing release:evidence-report script.");
assert.ok(packageJson.scripts?.["test:release-evidence-report"], "Missing test:release-evidence-report script.");

const json = runJson([]);
assert.equal(json.ok, true);
assert.equal(json.releaseCandidate, "0.1.0-local");
assert.ok(json.recorded.some((entry) => entry.key === "windowsPackagedRuntime.soak"));
assert.ok(json.recorded.some((entry) => entry.key === "browserAdapter.hostSmoke" && entry.check.status === "host-smoke-only"));
assert.ok(json.unresolved.some((entry) => entry.key === "macosPackagedRuntime.smoke"));
assert.ok(json.unresolved.some((entry) => entry.key === "browserAdapter.manualLoad"));
assert.ok(json.unresolved.some((entry) => entry.key === "signing.windowsAuthenticode"));

const text = runText([]);
assert.match(text, /Release Evidence Log/);
assert.match(text, /This file is generated from `docs\/release-evidence\.json`/);
assert.match(text, /Windows packaged 10-minute soak/);
assert.match(text, /Chrome manual load and Edge manual load/);
assert.match(text, /macOS packaged smoke/);
assert.match(text, /host-smoke-only/);

const check = spawnSync(process.execPath, ["scripts/release-evidence-report.mjs", "--check"], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
});
assert.equal(check.status, 0, check.stderr || check.stdout);

console.log("Release evidence report checks passed.");

function runJson(args) {
  const result = spawnSync(process.execPath, ["scripts/release-evidence-report.mjs", ...args, "--json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function runText(args) {
  const result = spawnSync(process.execPath, ["scripts/release-evidence-report.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
