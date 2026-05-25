import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = path.join(root, "adapters", "vscode-extension");
const manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, "package.json"), "utf8"));
const outputDir = path.join(root, "release", "adapters");
const outputPath = path.join(outputDir, `${manifest.name}-${manifest.version}.vsix`);
const vsceEntry = path.join(root, "node_modules", "@vscode", "vsce", "vsce");

fs.mkdirSync(outputDir, { recursive: true });

const result = spawnSync(process.execPath, [
  vsceEntry,
  "package",
  "--no-dependencies",
  "--allow-missing-repository",
  "--out",
  outputPath
], {
  cwd: extensionDir,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status || 1);
}

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

const stats = fs.statSync(outputPath);
console.log(JSON.stringify({
  ok: true,
  type: "vscode-extension",
  outputPath,
  bytes: stats.size
}, null, 2));
