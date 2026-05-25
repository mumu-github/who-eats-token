#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  process.env.WHO_EATS_TOKEN_REPO_ROOT,
  path.resolve(pluginRoot, "..", "..")
].filter(Boolean);

const repoRoot = candidates.find((candidate) => (
  fs.existsSync(path.join(candidate, "scripts", "mcp-server.mjs")) &&
  fs.existsSync(path.join(candidate, "package.json"))
));

if (!repoRoot) {
  console.error("Could not locate Who Eats Token repository root. Set WHO_EATS_TOKEN_REPO_ROOT.");
  process.exit(1);
}

const child = spawn(process.execPath, [path.join(repoRoot, "scripts", "mcp-server.mjs")], {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
