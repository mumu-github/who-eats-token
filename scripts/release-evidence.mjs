import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = path.join(root, "docs", "release-evidence.json");
const args = parseArgs(process.argv.slice(2));
const evidence = readEvidence();
const checks = flattenChecks(evidence);

if (args.list) {
  const rows = checks.map(({ key, check }) => ({
    key,
    status: check.status,
    command: check.command,
    notes: check.notes
  }));
  if (args.json) {
    console.log(JSON.stringify({
      ok: true,
      releaseCandidate: evidence.releaseCandidate,
      checks: rows
    }, null, 2));
  } else {
    printList(rows);
  }
} else if (args.set) {
  updateCheck(evidence, args);
  writeEvidence(evidence);
  if (args.json) {
    console.log(JSON.stringify({
      ok: true,
      updated: args.set,
      status: getCheck(evidence, args.set).status
    }, null, 2));
  } else {
    console.log(`Updated ${args.set} -> ${getCheck(evidence, args.set).status}`);
  }
} else {
  printUsage();
  process.exitCode = 1;
}

function updateCheck(payload, args) {
  const check = getCheck(payload, args.set);
  assert.ok(check, `Unknown release evidence key: ${args.set}`);
  assert.ok(args.status, "--status is required when using --set.");
  assert.ok(["passed", "failed", "not-run", "blocked", "host-smoke-only"].includes(args.status), `Invalid status: ${args.status}`);
  assert.notEqual(
    ["browserAdapter.hostSmoke", "ideAdapter.hostSmoke"].includes(args.set) && args.status === "passed",
    true,
    "Host smoke evidence must use host-smoke-only, not passed."
  );
  if (args.status === "passed" || args.status === "host-smoke-only") {
    assert.ok(String(args.command || "").trim(), "--command is required for recorded evidence.");
    assert.ok(String(args.notes || "").trim(), "--notes is required for recorded evidence.");
  }

  check.status = args.status;
  check.recordedAt = args.recordedAt || (args.status === "not-run" ? "" : new Date().toISOString());
  if (args.command !== null) check.command = args.command;
  if (args.notes !== null) check.notes = args.notes;

  validateEvidence(payload);
}

function validateEvidence(payload) {
  assert.equal(payload.schemaVersion, 1, "Unsupported release evidence schema version.");
  assert.ok(payload.releaseCandidate, "releaseCandidate must be set.");
  for (const { key, check } of flattenChecks(payload)) {
    assert.ok(["passed", "failed", "not-run", "blocked", "host-smoke-only"].includes(check.status), `${key} has invalid status.`);
    assert.equal(typeof check.recordedAt, "string", `${key}.recordedAt must be a string.`);
    assert.equal(typeof check.command, "string", `${key}.command must be a string.`);
    assert.equal(typeof check.notes, "string", `${key}.notes must be a string.`);
    assert.ok(check.command.length > 0, `${key}.command must not be empty.`);
    if (check.status === "passed" || check.status === "host-smoke-only") {
      assert.ok(check.recordedAt.length > 0, `${key}.recordedAt is required for recorded evidence.`);
      assert.ok(check.notes.length > 0, `${key}.notes is required for recorded evidence.`);
    }
  }
}

function getCheck(payload, key) {
  const parts = key.split(".");
  if (parts.length === 1) return payload.evidence?.[parts[0]] || null;
  if (parts.length === 2) return payload.evidence?.[parts[0]]?.[parts[1]] || null;
  return null;
}

function flattenChecks(payload) {
  const rows = [];
  for (const [groupName, group] of Object.entries(payload.evidence || {})) {
    if (group?.status) {
      rows.push({ key: groupName, check: group });
      continue;
    }
    for (const [checkName, check] of Object.entries(group || {})) {
      rows.push({ key: `${groupName}.${checkName}`, check });
    }
  }
  return rows.sort((left, right) => left.key.localeCompare(right.key));
}

function printList(rows) {
  console.log("# Release Evidence");
  for (const row of rows) {
    const marker = row.status === "passed" ? "OK" : row.status === "host-smoke-only" ? "PARTIAL" : "TODO";
    console.log(`- ${marker} [${row.status}] ${row.key}`);
    console.log(`  Command: ${row.command}`);
    if (row.notes) console.log(`  Notes: ${row.notes}`);
  }
}

function readEvidence() {
  return JSON.parse(fs.readFileSync(evidencePath, "utf8"));
}

function writeEvidence(payload) {
  fs.writeFileSync(evidencePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function printUsage() {
  console.log("Usage:");
  console.log("  npm run release:evidence -- -- --list");
  console.log("  npm run release:evidence -- -- --set browserAdapter.manualLoad --status passed --command \"...\" --notes \"...\"");
}

function parseArgs(argv) {
  const parsed = {
    list: argv.includes("--list"),
    json: argv.includes("--json"),
    set: null,
    status: null,
    command: null,
    notes: null,
    recordedAt: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--set") {
      parsed.set = argv[index + 1];
      index += 1;
    } else if (value.startsWith("--set=")) {
      parsed.set = value.slice("--set=".length);
    } else if (value === "--status") {
      parsed.status = argv[index + 1];
      index += 1;
    } else if (value.startsWith("--status=")) {
      parsed.status = value.slice("--status=".length);
    } else if (value === "--command") {
      parsed.command = argv[index + 1];
      index += 1;
    } else if (value.startsWith("--command=")) {
      parsed.command = value.slice("--command=".length);
    } else if (value === "--notes") {
      parsed.notes = argv[index + 1];
      index += 1;
    } else if (value.startsWith("--notes=")) {
      parsed.notes = value.slice("--notes=".length);
    } else if (value === "--recorded-at") {
      parsed.recordedAt = argv[index + 1];
      index += 1;
    } else if (value.startsWith("--recorded-at=")) {
      parsed.recordedAt = value.slice("--recorded-at=".length);
    }
  }
  return parsed;
}
