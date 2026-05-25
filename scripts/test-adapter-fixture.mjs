import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const jsonRun = runFixture(["--json", "--require-clean"]);
assert.equal(jsonRun.status, 0, jsonRun.stderr || jsonRun.stdout);
const report = JSON.parse(jsonRun.stdout);

assert.equal(report.schema, "who-eats-token.adapter-fixture.v1");
assert.equal(report.ok, true);
assert.equal(report.mode, "isolated");
assert.equal(report.summary.scenarios, 5);
assert.equal(report.summary.acceptedEvents, 5);
assert.ok(report.summary.snapshotEvents >= 5);
assert.ok(report.summary.snapshotOverlays >= 1);
assert.equal(report.privacy.redactionOk, true);
assert.deepEqual(report.privacy.leakedSecrets, []);

const providers = new Map(report.providers.map((provider) => [provider.id, provider]));
for (const id of ["codex", "hermes", "openai", "anthropic", "qwen"]) {
  assert.ok(providers.has(id), `Missing provider ${id}`);
}
assert.equal(providers.get("codex").displayMode, "capacity");
assert.equal(providers.get("openai").lowestRemainingPercent, 18);
assert.equal(providers.get("anthropic").displayMode, "context");
assert.equal(providers.get("qwen").displayMode, "usage");
assert.ok(report.summary.providerHealthAttention >= 1, "Fixture should keep one attention/low-quota provider.");

const serialized = JSON.stringify(report);
for (const forbidden of [
  "private prompt should not survive",
  "api-key-placeholder-for-redaction",
  "api-platform_serviceToken",
  "Bearer private-fixture-token",
  "C:/Users/demo/private.ts"
]) {
  assert.equal(serialized.includes(forbidden), false, `Sensitive fixture data leaked: ${forbidden}`);
}

const textRun = runFixture([]);
assert.equal(textRun.status, 0, textRun.stderr || textRun.stdout);
assert.match(textRun.stdout, /Who Eats Token Adapter Fixture/);
assert.match(textRun.stdout, /Status: ok/);
assert.match(textRun.stdout, /Providers:/);
assert.match(textRun.stdout, /Privacy: redacted/);

console.log("Adapter fixture checks passed.");

function runFixture(args) {
  return spawnSync(process.execPath, ["scripts/adapter-fixture.mjs", ...args], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}
