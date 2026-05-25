#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(pluginRoot, "..", "..");
const required = [
  "package.json",
  "scripts/mcp-server.mjs",
  "docs/skills.md",
  "skills/who-eats-token-setup/SKILL.md",
  "skills/who-eats-token-doctor/SKILL.md",
  "skills/who-eats-token-adapter-author/SKILL.md"
];

let ok = true;
for (const relativePath of required) {
  const fullPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    ok = false;
    console.error(`Missing ${relativePath}`);
  }
}

if (!ok) process.exit(1);
console.log("Who Eats Token plugin environment looks ready.");
