import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const releaseCheckSource = fs.readFileSync("scripts/release-check.mjs", "utf8");

assert.ok(packageJson.scripts?.["release:check"], "Missing release:check script.");
assert.ok(packageJson.scripts?.["test:release-check"], "Missing test:release-check script.");
assert.ok(releaseCheckSource.includes("WHO_EATS_TOKEN_RELEASE_CHECK_TIMEOUT_MS"), "release-check must expose timeout env override.");
assert.ok(releaseCheckSource.includes("timeout:"), "release-check must pass a timeout to spawnSync.");
assert.ok(releaseCheckSource.includes("--list"), "release-check must support command listing.");
assert.ok(releaseCheckSource.includes("Slow release-check commands"), "release-check must summarize slow commands.");

const listed = run(["--list", "--json", "--command-timeout-ms", "1234", "--slow-ms", "55"], 0);
const payload = JSON.parse(listed.stdout);
assert.equal(payload.schema, "who-eats-token.release-check-list.v1");
assert.equal(payload.ok, true);
assert.equal(payload.commandTimeoutMs, 1234);
assert.equal(payload.slowCommandMs, 55);
assert.ok(payload.commandCount > 40);
assert.ok(payload.commands.some((command) => command.label === "npm run test:release-check"));
assert.ok(payload.commands.some((command) => command.label === "npm run test:support-bundle"));
assert.ok(payload.commands.some((command) => command.label === "npm run test:adapter-fixture"));
assert.ok(payload.requiredFiles.includes("README.md"));

const text = run(["--list", "--command-timeout-ms", "1000"], 0);
assert.match(text.stdout, /Release Check Command List/);
assert.match(text.stdout, /Per-command timeout: 1.0s/);
assert.match(text.stdout, /npm run test:release-check/);

console.log("Release check wiring checks passed.");

function run(args, expectedStatus) {
  const result = spawnSync(process.execPath, ["scripts/release-check.mjs", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}
