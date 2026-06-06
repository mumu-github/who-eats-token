import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const evidencePath = path.join(root, "docs", "release-evidence.json");
const originalEvidence = fs.readFileSync(evidencePath, "utf8");

try {
  assert.ok(packageJson.scripts?.["release:evidence"], "Missing release:evidence script.");
  assert.ok(packageJson.scripts?.["test:release-evidence-cli"], "Missing test:release-evidence-cli script.");

  const list = run(["--list", "--json"], 0);
  const payload = JSON.parse(list.stdout);
  assert.equal(payload.ok, true);
  assert.ok(payload.checks.some((check) => check.key === "browserAdapter.manualLoad"));
  assert.ok(payload.checks.some((check) => check.status === "host-smoke-only"));

  run([
    "--set", "ideAdapter.hostSmoke",
    "--status", "host-smoke-only",
    "--recorded-at", "2026-05-24T12:00:00+08:00",
    "--command", "npm run smoke:ide-hosts -- -- --require",
    "--notes", "VS Code and Cursor host smoke passed on validation fixture."
  ], 0);
  let evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  assert.equal(evidence.evidence.ideAdapter.hostSmoke.status, "host-smoke-only");
  assert.equal(evidence.evidence.ideAdapter.hostSmoke.recordedAt, "2026-05-24T12:00:00+08:00");

  const forbidden = run([
    "--set", "browserAdapter.hostSmoke",
    "--status", "passed",
    "--command", "npm run smoke:browser-hosts -- -- --require",
    "--notes", "Should not be allowed."
  ], 1);
  assert.match(forbidden.stderr || forbidden.stdout, /host-smoke-only/);

  const unknown = run(["--set", "missing.path", "--status", "passed"], 1);
  assert.match(unknown.stderr || unknown.stdout, /Unknown release evidence key/);

  console.log("Release evidence CLI checks passed.");
} finally {
  fs.writeFileSync(evidencePath, originalEvidence);
}

function run(args, expectedStatus) {
  const result = spawnSync(process.execPath, ["scripts/release-evidence.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}
