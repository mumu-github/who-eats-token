import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const advisory = runJson(["--platform", "all", "--json"]);
assert.equal(advisory.mode, "advisory");
assert.equal(advisory.ok, true);
assert.deepEqual(advisory.reports.map((report) => report.platform), ["windows", "macos"]);
assert.ok(findCheck(advisory, "windows", "windows-targets").status === "present");
assert.ok(findCheck(advisory, "macos", "hardened-runtime").status === "present");

const missingRequired = spawnSync(process.execPath, [
  "scripts/signing-readiness.mjs",
  "--platform",
  "all",
  "--require",
  "--json"
], {
  encoding: "utf8",
  env: cleanSigningEnv()
});
assert.equal(missingRequired.status, 1);
const missing = JSON.parse(missingRequired.stdout);
assert.equal(missing.ok, false);
assert.ok(missing.missingRequired.includes("windows:authenticode-cert"));
assert.ok(missing.missingRequired.includes("macos:mac-notary-auth"));

const ready = runJson(["--platform", "all", "--require", "--json"], {
  ...cleanSigningEnv(),
  WIN_CSC_LINK: "set",
  WIN_CSC_KEY_PASSWORD: "set",
  WHO_EATS_TOKEN_MAC_POST_BUILD_SIGNING: "1",
  APPLE_API_KEY: "set",
  APPLE_API_KEY_ID: "set",
  APPLE_API_ISSUER: "set"
});
assert.equal(ready.ok, true);
assert.equal(findCheck(ready, "windows", "authenticode-cert").status, "present");
assert.equal(findCheck(ready, "windows", "authenticode-password").status, "present");
assert.equal(findCheck(ready, "macos", "mac-signing-strategy").status, "present");
assert.equal(findCheck(ready, "macos", "mac-notary-auth").status, "present");

const text = runText(["--platform", "windows"]);
assert.match(text, /# Who Eats Token Signing Readiness/);
assert.match(text, /Authenticode certificate/);
assert.doesNotMatch(text, /set-secret-value/);

console.log("Signing readiness checks passed.");

function runJson(args, env = process.env) {
  const result = spawnSync(process.execPath, ["scripts/signing-readiness.mjs", ...args], {
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function runText(args, env = process.env) {
  const result = spawnSync(process.execPath, ["scripts/signing-readiness.mjs", ...args], {
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function findCheck(payload, platform, id) {
  const report = payload.reports.find((entry) => entry.platform === platform);
  assert.ok(report, `Missing report: ${platform}`);
  const check = report.checks.find((entry) => entry.id === id);
  assert.ok(check, `Missing check: ${platform}:${id}`);
  return check;
}

function cleanSigningEnv() {
  const env = { ...process.env };
  for (const key of [
    "WIN_CSC_LINK",
    "WIN_CSC_KEY_PASSWORD",
    "CSC_LINK",
    "CSC_KEY_PASSWORD",
    "MAC_CSC_LINK",
    "MAC_CSC_KEY_PASSWORD",
    "CSC_NAME",
    "WHO_EATS_TOKEN_MAC_SIGNING_CONFIG",
    "WHO_EATS_TOKEN_MAC_POST_BUILD_SIGNING",
    "APPLE_API_KEY",
    "APPLE_API_KEY_ID",
    "APPLE_API_ISSUER",
    "APPLE_ID",
    "APPLE_APP_SPECIFIC_PASSWORD",
    "APPLE_TEAM_ID"
  ]) {
    delete env[key];
  }
  return env;
}
