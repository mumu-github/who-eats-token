import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = path.join(root, "docs", "release-evidence.json");
const schemaPath = path.join(root, "docs", "release-evidence.schema.json");
const markdownPath = path.join(root, "docs", "release-evidence.md");
const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const markdown = fs.readFileSync(markdownPath, "utf8");

validateShape(evidence, schema);
validateReleasePolicy(evidence);
validateMarkdownCrossReferences(evidence, markdown);

console.log("Release evidence checks passed.");

function validateShape(payload, schema) {
  assert.equal(payload.schemaVersion, schema.properties.schemaVersion.const, "Unexpected release evidence schema version.");
  assert.ok(payload.releaseCandidate, "releaseCandidate must be set.");

  const requiredEvidence = schema.properties.evidence.required;
  for (const key of requiredEvidence) {
    assert.ok(payload.evidence[key], `Missing evidence group: ${key}`);
  }

  for (const [groupName, group] of Object.entries(payload.evidence)) {
    assertObject(group, groupName);
    if (isCheckEvidence(group)) {
      validateCheck(group, groupName);
      continue;
    }
    for (const [checkName, check] of Object.entries(group)) {
      validateCheck(check, `${groupName}.${checkName}`);
    }
  }
}

function validateCheck(check, name) {
  assertObject(check, name);
  assert.ok(["passed", "failed", "not-run", "blocked", "host-smoke-only"].includes(check.status), `${name} has invalid status.`);
  assert.equal(typeof check.recordedAt, "string", `${name}.recordedAt must be a string.`);
  assert.equal(typeof check.command, "string", `${name}.command must be a string.`);
  assert.equal(typeof check.notes, "string", `${name}.notes must be a string.`);
  assert.ok(check.command.length > 0, `${name}.command must explain how to reproduce evidence.`);
  if (check.status === "passed" || check.status === "host-smoke-only") {
    assert.ok(check.recordedAt.length > 0, `${name}.recordedAt is required when evidence was recorded.`);
    assert.ok(check.notes.length > 0, `${name}.notes should summarize the result.`);
  }
}

function isCheckEvidence(value) {
  return value && typeof value === "object" && typeof value.status === "string";
}

function validateReleasePolicy(payload) {
  const evidence = payload.evidence;
  assert.equal(evidence.windowsPackagedRuntime.smoke.status, "passed", "Windows packaged smoke must stay recorded.");
  assert.equal(evidence.windowsPackagedRuntime.soak.status, "passed", "Windows packaged soak must stay recorded.");
  assert.equal(evidence.dependencyAudit.status, "passed", "Dependency audit evidence must stay recorded before release.");

  assert.notEqual(evidence.browserAdapter.hostSmoke.status, "passed", "Browser host smoke alone must not be recorded as full manual pass.");
  assert.notEqual(evidence.ideAdapter.hostSmoke.status, "passed", "IDE host smoke alone must not be recorded as full manual pass.");

  for (const check of [
    evidence.browserAdapter.manualLoad,
    evidence.browserAdapter.manualConnection,
    evidence.ideAdapter.manualLoad,
    evidence.ideAdapter.manualConnection
  ]) {
    if (check.status === "passed") {
      assert.ok(/manual|Options|status bar|VSIX|Chrome|Edge|Cursor|VS Code/i.test(check.command), "Manual adapter pass must name the validated host/user path.");
    }
  }
}

function validateMarkdownCrossReferences(payload, markdown) {
  assert.ok(markdown.includes("docs/release-evidence.json"), "Markdown evidence log must point to structured evidence.");
  assert.ok(markdown.includes("release:evidence-quality"), "Markdown evidence log must point to the evidence quality gate.");
  assert.ok(markdown.includes("Windows packaged 10-minute soak"), "Markdown evidence must summarize Windows soak.");
  assert.ok(markdown.includes("Chrome manual load"), "Markdown evidence must keep Chrome manual gap visible.");

  const stillNeeded = markdown.split("## Evidence Still Needed Before Public Binary Release")[1] || "";
  const unresolved = flattenChecks(payload)
    .filter((entry) => !["passed"].includes(entry.check.status))
    .map((entry) => entry.name);
  assert.ok(stillNeeded.includes("macOS packaged smoke"), "Markdown must keep macOS smoke gap visible.");
  assert.ok(unresolved.length > 0, "Structured evidence should still expose unresolved public-release checks.");
}

function flattenChecks(payload) {
  const entries = [];
  for (const [groupName, group] of Object.entries(payload.evidence)) {
    if (group.status) {
      entries.push({ name: groupName, check: group });
      continue;
    }
    for (const [checkName, check] of Object.entries(group)) {
      entries.push({ name: `${groupName}.${checkName}`, check });
    }
  }
  return entries;
}

function assertObject(value, name) {
  assert.equal(typeof value, "object", `${name} must be an object.`);
  assert.notEqual(value, null, `${name} must not be null.`);
  assert.equal(Array.isArray(value), false, `${name} must not be an array.`);
}
