import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

assert.ok(packageJson.scripts?.["secret:scan"], "Missing secret:scan script.");
assert.ok(packageJson.scripts?.["test:secret-scan"], "Missing test:secret-scan script.");

const cleanDir = fs.mkdtempSync(path.join(os.tmpdir(), "who-eats-token-clean-"));
fs.writeFileSync(path.join(cleanDir, "README.md"), [
  "XIAOMI_PLATFORM_COOKIE=...",
  "OPENAI_API_KEY=<redacted>",
  "Bearer ${TOKEN}",
  "Set-Content -Value \"你的 platform Cookie\""
].join("\n"));

const clean = runScan(cleanDir, 0);
assert.equal(clean.ok, true);
assert.equal(clean.findingCount, 0);

const dirtyDir = fs.mkdtempSync(path.join(os.tmpdir(), "who-eats-token-dirty-"));
fs.writeFileSync(path.join(dirtyDir, "secrets.txt"), [
  [
    "cookie-preferences=%7B%7D; ",
    "api-platform_serviceToken=\"",
    "/548hYF2WheY6RSeYVlLgwce+UbMh9Ro560hWMUEQQulfYKkQh2SnD5HZXuOjXDiNToM3mTHAYViUSgH9gDXQKIOvdseTx5prfQzQvlOr93k5ysaroZHMOdTcOCbNiJIDrOYCcGB4TtP5osLFl0WmkRjOC9s+xg2UXxl3gT",
    "\"; userId=1; api-platform_slh=\"GY68geU39FHrc0UXccsMveuhM1c=\""
  ].join(""),
  ["OPENAI_API_KEY=", "sk-proj-", "abcdefghijklmnopqrstuvwxyz0123456789"].join(""),
  ["Authorization: Bearer ", "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"].join(""),
  ["-----BEGIN ", "PRIVATE KEY-----"].join("")
].join("\n"));

const dirty = runScan(dirtyDir, 1);
assert.equal(dirty.ok, false);
assert.ok(dirty.findings.some((finding) => finding.id === "xiaomi-platform-cookie"));
assert.ok(dirty.findings.some((finding) => finding.id === "openai-secret-key"));
assert.ok(dirty.findings.some((finding) => finding.id === "bearer-token"));
assert.ok(dirty.findings.some((finding) => finding.id === "private-key"));

const repo = runScan(root, 0);
assert.equal(repo.ok, true, JSON.stringify(repo.findings, null, 2));

console.log("Secret scan checks passed.");

function runScan(targetPath, expectedStatus) {
  const result = spawnSync(process.execPath, [
    "scripts/secret-scan.mjs",
    "--path",
    targetPath,
    "--json"
  ], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
