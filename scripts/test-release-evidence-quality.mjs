import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const current = run(["--json", "--require-clean"], 0);
const currentReport = JSON.parse(current.stdout);
assert.equal(currentReport.schema, "who-eats-token.release-evidence-quality.v1");
assert.equal(currentReport.ok, true);
assert.equal(currentReport.summary.errors, 0);
assert.ok(currentReport.summary.recorded >= 1);

const goodPath = writeTempEvidence((payload) => {
  payload.evidence.browserAdapter.manualLoad = passed(
    "Chrome and Edge load adapters/browser-extension unpacked",
    "Chrome version 148 and Edge version 148 loaded unpacked extension id abcdefghijklmnopabcdefghijklmnop and it was enabled in both hosts."
  );
  payload.evidence.browserAdapter.manualConnection = passed(
    "Browser extension Options /health connection test",
    "Local token was used without pasting it into notes; /health succeeded in Chrome and Edge Options pages."
  );
  payload.evidence.ideAdapter.manualLoad = passed(
    "Install VSIX in VS Code and Cursor",
    "VS Code version 1.102 and Cursor version 0.51 loaded the VSIX; adapter id visible in both hosts."
  );
  payload.evidence.ideAdapter.manualConnection = passed(
    "VS Code/Cursor status bar /health, refresh, and copy snapshot checks",
    "Status bar /health succeeded in VS Code and Cursor; refresh worked; copy snapshot worked without reading source files."
  );
});
const good = run(["--path", goodPath, "--json", "--require-clean"], 0);
assert.equal(JSON.parse(good.stdout).ok, true);

const badPath = writeTempEvidence((payload) => {
  payload.evidence.browserAdapter.manualLoad = passed(
    "Browser looked okay",
    "Loaded it."
  );
  payload.evidence.ideAdapter.manualConnection = passed(
    "IDE checked",
    "Works."
  );
});
const bad = run(["--path", badPath, "--json", "--require-clean"], 1);
const badReport = JSON.parse(bad.stdout);
assert.equal(badReport.ok, false);
assert.ok(badReport.findings.some((finding) => finding.key === "browserAdapter.manualLoad" && finding.id === "browser-chrome"));
assert.ok(badReport.findings.some((finding) => finding.key === "ideAdapter.manualConnection" && finding.id === "ide-status-bar"));

const hostSmokePath = writeTempEvidence((payload) => {
  payload.evidence.browserAdapter.hostSmoke = passed(
    "npm run smoke:browser-hosts -- -- --require",
    "Incorrectly marked as full pass."
  );
});
const hostSmoke = run(["--path", hostSmokePath, "--json", "--require-clean"], 1);
assert.ok(JSON.parse(hostSmoke.stdout).findings.some((finding) => finding.id === "host-smoke-as-full-pass"));

console.log("Release evidence quality checks passed.");

function run(args, expectedStatus) {
  const result = spawnSync(process.execPath, ["scripts/release-evidence-quality.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}

function writeTempEvidence(mutator) {
  const fixture = JSON.parse(fs.readFileSync(path.join(root, "docs", "release-evidence.json"), "utf8"));
  mutator(fixture);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "who-eats-token-evidence-"));
  const file = path.join(dir, "release-evidence.json");
  fs.writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`);
  return file;
}

function passed(command, notes) {
  return {
    status: "passed",
    recordedAt: "2026-05-25T12:00:00+08:00",
    command,
    notes
  };
}
