import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

assert.ok(packageJson.scripts?.["license:check"], "Missing license:check script.");
assert.ok(packageJson.scripts?.["test:license-check"], "Missing test:license-check script.");

const current = run(["--json"], 0);
assert.equal(current.ok, true, JSON.stringify(current.findings, null, 2));
assert.ok(current.packageCount > 0);
assert.ok(current.licenseCounts.MIT > 0);
assert.ok(current.reviewed.some((entry) => entry.package === "spdx-exceptions"));
assert.ok(current.reviewed.some((entry) => entry.package.startsWith("@vscode/vsce-sign")));

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "who-eats-token-license-"));
const badLockfile = path.join(tempDir, "package-lock.json");
fs.writeFileSync(badLockfile, JSON.stringify({
  name: "license-fixture",
  lockfileVersion: 3,
  packages: {
    "": {
      license: "MIT"
    },
    "node_modules/good": {
      version: "1.0.0",
      license: "MIT"
    },
    "node_modules/gpl-lib": {
      version: "1.0.0",
      license: "GPL-3.0-only"
    },
    "node_modules/custom-lib": {
      version: "1.0.0",
      license: "Custom-Internal"
    },
    "node_modules/missing-lib": {
      version: "1.0.0"
    }
  }
}, null, 2));

const bad = run(["--lockfile", badLockfile, "--json"], 1);
assert.equal(bad.ok, false);
assert.ok(bad.findings.some((finding) => finding.id === "forbidden-license"));
assert.ok(bad.findings.some((finding) => finding.id === "unreviewed-license"));
assert.ok(bad.findings.some((finding) => finding.id === "missing-license"));

console.log("License check tests passed.");

function run(args, expectedStatus) {
  const result = spawnSync(process.execPath, ["scripts/license-check.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
