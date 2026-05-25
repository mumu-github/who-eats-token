import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const report = runAudit(["--json"], 0);
const auditSource = fs.readFileSync("scripts/release-gap-audit.mjs", "utf8");

assert.equal(report.publicReleaseReady, false, "Known public-release gaps should remain explicit until manual evidence is recorded.");
assert.ok(report.summary.total >= 10, "Audit should cover the main release dimensions.");
assert.ok(report.summary.blocking > 0, "Audit should expose remaining manual/external gaps.");
assert.ok(!/status\s*===\s*["']host-smoke-recorded["']/.test(auditSource), "Host smoke must not replace manual browser validation.");
assert.equal(find("project-form").status, "automated");
assert.equal(find("windows-packaged-runtime").status, "manual-recorded");
assert.equal(find("multi-tool-adapters").status, "automated");
assert.ok(find("multi-tool-adapters").evidence.includes("scripts/adapter-fixture.mjs"));
assert.equal(find("low-memory-gates").status, "automated");
assert.ok(find("low-memory-gates").evidence.includes("scripts/adapter-guard.mjs"));
assert.ok(find("low-memory-gates").evidence.includes("scripts/support-bundle.mjs"));
assert.ok(find("low-memory-gates").evidence.includes("scripts/delight-contract.mjs"));
assert.ok(find("low-memory-gates").evidence.includes("scripts/test-stability.mjs"));
assert.ok(find("low-memory-gates").evidence.includes("scripts/test-diagnostics.mjs"));
assert.equal(find("privacy-security").status, "automated");
assert.ok(find("privacy-security").evidence.includes("scripts/secret-scan.mjs"));
assert.equal(find("license-compliance").status, "automated");
assert.ok(find("license-compliance").evidence.includes("scripts/license-check.mjs"));
assert.equal(find("docs-quality").status, "automated");
assert.equal(find("artifact-integrity").status, "automated");
assert.equal(find("macos-packaged-runtime").status, "external-required");
assert.ok(["manual-required", "host-smoke-recorded"].includes(find("browser-manual").status));
assert.ok(["manual-required", "host-smoke-recorded"].includes(find("ide-manual").status));
assert.equal(find("signing").status, "external-required");
assert.equal(find("npm-audit").status, "manual-recorded");

const required = runAudit(["--json", "--require-public-release"], 1);
assert.equal(required.publicReleaseReady, false);

const text = runText([]);
assert.match(text, /Who Eats Token Release Gap Audit/);
assert.match(text, /Public release ready: no/);
assert.match(text, /macos-packaged-runtime/);

console.log("Release gap audit checks passed.");

function runAudit(args, expectedStatus) {
  const result = spawnSync(process.execPath, ["scripts/release-gap-audit.mjs", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function runText(args) {
  const result = spawnSync(process.execPath, ["scripts/release-gap-audit.mjs", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function find(id) {
  const check = report.checks.find((entry) => entry.id === id);
  assert.ok(check, `Missing audit check: ${id}`);
  return check;
}
