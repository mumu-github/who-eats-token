import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scanRoots = [
  "README.md",
  "CONTRIBUTING.md",
  "docs",
  ".github",
  "scripts",
  path.join("adapters", "templates")
];
const textExtensions = new Set([".cjs", ".js", ".json", ".md", ".mjs", ".txt", ".yaml", ".yml"]);
const unsafePattern = /\bnpm run\s+[A-Za-z0-9:_-]+\s+--\s+--[A-Za-z0-9]/;
const findings = [];

for (const entry of scanRoots) {
  const absolutePath = path.join(root, entry);
  if (!fs.existsSync(absolutePath)) continue;
  for (const file of walkTextFiles(absolutePath)) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (unsafePattern.test(line)) {
        findings.push(`${path.relative(root, file)}:${index + 1}: ${line.trim()}`);
      }
    });
  }
}

assert.deepEqual(
  findings,
  [],
  `Use the npm 11-safe separator form "npm run <script> -- -- --flag" in docs and generated commands:\n${findings.join("\n")}`
);

console.log("npm run argument forwarding docs are npm 11-safe.");

function* walkTextFiles(absolutePath) {
  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) {
    if (textExtensions.has(path.extname(absolutePath))) yield absolutePath;
    return;
  }
  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "release" || entry.name === "dist") continue;
    yield* walkTextFiles(path.join(absolutePath, entry.name));
  }
}
