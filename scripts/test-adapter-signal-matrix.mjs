import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const matrixPath = path.join(root, "docs", "adapter-signal-matrix.md");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "adapters", "catalog.json"), "utf8"));

assert.ok(fs.existsSync(matrixPath), "Adapter signal matrix must exist.");
const matrix = fs.readFileSync(matrixPath, "utf8");

for (const adapter of catalog.adapters) {
  assert.ok(matrix.includes(adapter.name), `Matrix missing adapter name: ${adapter.name}`);
  for (const signal of adapter.providedSignals || []) {
    assert.ok(matrix.includes(`\`${signal}\``), `Matrix missing signal key: ${signal}`);
  }
}

for (const heading of ["Usage", "Capacity", "Token Plan", "HUD Avoidance", "Health", "Snapshot", "Status Display", "Workflows"]) {
  assert.ok(matrix.includes(heading), `Matrix missing heading: ${heading}`);
}

const result = spawnSync(process.execPath, ["scripts/adapter-signal-matrix.mjs", "--check"], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
});
assert.equal(result.status, 0, result.stderr || result.stdout);

console.log("Adapter signal matrix checks passed.");
