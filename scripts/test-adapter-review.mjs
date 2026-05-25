import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

assert.ok(packageJson.scripts?.["adapter:review"], "Missing adapter:review script.");
assert.ok(packageJson.scripts?.["test:adapter-review"], "Missing test:adapter-review script.");

const all = runJson([]);
assert.equal(all.ok, true);
assert.ok(all.adapterCount >= 10);
assert.equal(all.errorCount, 0);
assert.equal(all.warningCount, 0);
assert.ok(all.reviews.some((review) => review.id === "browser-extension"));
assert.ok(all.reviews.some((review) => review.id === "provider-specific-adapters"));

const browser = runJson(["--id", "browser-extension"]);
assert.equal(browser.adapterCount, 1);
assert.equal(browser.reviews[0].id, "browser-extension");
assert.ok(browser.reviews[0].providedSignals.includes("hud-overlays"));
assert.ok(browser.reviews[0].commands.includes("npm run adapter:guard"));
assert.ok(browser.reviews[0].commands.includes("npm run test:browser-extension"));
assert.equal(browser.reviews[0].errorCount, 0);

const planned = runJson(["--id=provider-specific-adapters"]);
assert.equal(planned.adapterCount, 1);
assert.equal(planned.reviews[0].status, "planned");
assert.equal(planned.reviews[0].errorCount, 0);

const text = runText(["--id", "vscode-extension"]);
assert.match(text, /Adapter Review Report/);
assert.match(text, /VS Code\/Cursor Adapter/);
assert.match(text, /status-display/);

const unknown = spawnSync(process.execPath, ["scripts/adapter-review.mjs", "--id", "missing-adapter"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
});
assert.notEqual(unknown.status, 0);
assert.match(unknown.stderr, /Unknown adapter id/);

console.log("Adapter review checks passed.");

function runJson(args) {
  const result = spawnSync(process.execPath, ["scripts/adapter-review.mjs", ...args, "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function runText(args) {
  const result = spawnSync(process.execPath, ["scripts/adapter-review.mjs", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
