import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

assert.ok(packageJson.scripts?.["validation:next"], "Missing validation:next script.");
assert.ok(packageJson.scripts?.["test:validation-next"], "Missing test:validation-next script.");

const all = runJson([]);
assert.equal(all.ok, false);
assert.ok(all.summary.total > 0);
assert.ok(all.actions.some((action) => action.key === "browserAdapter.manualLoad"));
assert.ok(all.actions.some((action) => action.key === "ideAdapter.hostSmoke"));
assert.ok(all.actions.some((action) => action.key === "macosPackagedRuntime.smoke"));
assert.ok(!all.actions.some((action) => action.key === "browserAdapter.hostSmoke"), "host-smoke-only browser evidence should not appear as a remaining action.");

const browser = runJson(["--target", "browser"]);
assert.equal(browser.target, "browser");
assert.deepEqual(browser.actions.map((action) => action.key), [
  "browserAdapter.manualConnection",
  "browserAdapter.manualLoad"
].sort());
assert.ok(browser.actions.every((action) => action.recordCommand.includes("npm run release:evidence")));

const ide = runJson(["--target=ide"]);
assert.equal(ide.target, "ide");
assert.ok(ide.actions.some((action) => action.key === "ideAdapter.hostSmoke"));
assert.ok(ide.actions.some((action) => action.recordCommand.includes("--status host-smoke-only")));

const audit = runJson(["--target", "audit"]);
assert.equal(audit.ok, true);
assert.equal(audit.summary.total, 0);

const text = runText(["--target", "browser"]);
assert.match(text, /Next Release Validation Actions/);
assert.match(text, /browserAdapter\.manualLoad/);
assert.doesNotMatch(text, /browserAdapter\.hostSmoke/);

console.log("Validation next-action checks passed.");

function runJson(args) {
  const result = spawnSync(process.execPath, ["scripts/validation-next.mjs", ...args, "--json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function runText(args) {
  const result = spawnSync(process.execPath, ["scripts/validation-next.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
