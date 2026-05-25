import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const browserManifest = JSON.parse(fs.readFileSync(path.join(root, "adapters", "browser-extension", "manifest.json"), "utf8"));
const vscodeManifest = JSON.parse(fs.readFileSync(path.join(root, "adapters", "vscode-extension", "package.json"), "utf8"));
const releaseWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "release-artifacts.yml"), "utf8");

for (const script of [
  "package:browser-extension",
  "package:vscode-extension",
  "package:adapters",
  "verify:adapter-artifacts",
  "test:adapter-packages"
]) {
  assert.ok(packageJson.scripts?.[script], `Missing package script: ${script}`);
}

assert.ok(packageJson.devDependencies?.["@vscode/vsce"], "@vscode/vsce must be a devDependency.");
assert.ok(fs.existsSync(path.join(root, "scripts", "package-browser-extension.mjs")), "Browser extension package script missing.");
assert.ok(fs.existsSync(path.join(root, "scripts", "package-vscode-extension.mjs")), "VS Code extension package script missing.");
assert.ok(fs.existsSync(path.join(root, "scripts", "verify-adapter-artifacts.mjs")), "Adapter artifact verification script missing.");
assert.ok(fs.existsSync(path.join(root, "scripts", "lib", "zip.mjs")), "ZIP helper missing.");
assert.ok(releaseWorkflow.includes("npm run package:adapters"), "Release workflow must package adapters.");

const browserZip = path.join(root, "release", "adapters", `who-eats-token-browser-extension-${browserManifest.version}.zip`);
const vsix = path.join(root, "release", "adapters", `${vscodeManifest.name}-${vscodeManifest.version}.vsix`);
if (fs.existsSync(browserZip)) {
  assert.ok(fs.statSync(browserZip).size > 1000, "Browser extension ZIP is unexpectedly small.");
}
if (fs.existsSync(vsix)) {
  assert.ok(fs.statSync(vsix).size > 1000, "VSIX is unexpectedly small.");
}

console.log("Adapter package checks passed.");
