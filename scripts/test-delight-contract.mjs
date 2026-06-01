import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const jsonOutput = execFileSync(process.execPath, ["scripts/delight-contract.mjs", "--json"], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true
});
const contract = JSON.parse(jsonOutput);

assert.equal(contract.ok, true, "Delight contract should be clean.");
assert.equal(contract.schema, "who-eats-token.delight-contract.v1");
assert.equal(contract.guardrails.sourceOfTruth, "src/protocol/quota-delight.cjs");
assert.equal(contract.guardrails.alertBelowPercent, 20);
assert.equal(contract.guardrails.reducedMotion, "static");
assert.equal(contract.guardrails.maxDelightAssetBytes, 102400);
assert.ok(contract.states.length >= 12, "Contract must cover core provider and quota states.");

const byId = new Map(contract.states.map((state) => [state.id, state.output]));
assert.equal(byId.get("live-comfy").shortLabel, "放心吃");
assert.equal(byId.get("live-tight").shortLabel, "省着吃");
assert.equal(byId.get("live-low").alert, true);
assert.equal(byId.get("live-low").cue.chart, "alert");
assert.equal(byId.get("live-empty").priority, 3);
assert.equal(byId.get("estimated-low").estimated, true);
assert.equal(byId.get("delayed").shortLabel, "慢半拍");
assert.equal(byId.get("delayed").cue.mascot, "stretch");
assert.equal(byId.get("delayed").tone, "caution");
assert.equal(byId.get("missing").alert, false);

for (const state of contract.states) {
  assert.equal(state.output.cue.reducedMotion, "static", `${state.id} must reduce to static motion.`);
  assert.ok(state.output.a11yLabel.includes(state.output.shortLabel), `${state.id} must expose readable a11y label.`);
}

assert.equal(contract.renderer.topBarReadsProviderDelight, true);
assert.equal(contract.renderer.hudReadsProviderDelight, true);
assert.equal(contract.renderer.reducedMotionStopsAnimation, true);
assert.ok(contract.renderer.chartAnimations >= 2, "Chart animations should be explicit and reducible.");
assert.ok(contract.assets.length > 0, "Asset budget should inspect renderer assets.");
assert.ok(contract.assets.every((asset) => asset.bytes <= contract.guardrails.maxDelightAssetBytes), "All delight assets must stay below budget.");

const textOutput = execFileSync(process.execPath, ["scripts/delight-contract.mjs"], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true
});
assert.match(textOutput, /# Delight Contract/);
assert.match(textOutput, /Source of truth/);
assert.match(textOutput, /Low-quota alert/);
assert.match(textOutput, /Renderer Coupling/);

execFileSync(process.execPath, ["scripts/delight-contract.mjs", "--check"], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true
});

console.log("Delight contract checks passed.");
