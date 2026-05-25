import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = path.join(root, "adapters", "vscode-extension");
const manifestPath = path.join(extensionDir, "package.json");
const extensionPath = path.join(extensionDir, "extension.js");

for (const file of ["package.json", "extension.js", "README.md"]) {
  assert.ok(fs.existsSync(path.join(extensionDir, file)), `Missing VS Code adapter file: ${file}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
assert.equal(manifest.main, "./extension.js", "VS Code adapter must use extension.js as entrypoint.");
assert.ok(manifest.engines?.vscode, "VS Code adapter must declare engines.vscode.");
assert.ok(Array.isArray(manifest.activationEvents), "VS Code adapter must declare activationEvents.");
assert.ok(manifest.activationEvents.includes("onStartupFinished"), "VS Code adapter should refresh after startup.");
assert.ok(hasCommand(manifest, "whoEatsToken.refresh"), "VS Code adapter must contribute refresh command.");
assert.ok(hasCommand(manifest, "whoEatsToken.copySnapshot"), "VS Code adapter must contribute copy snapshot command.");
assert.ok(hasSetting(manifest, "whoEatsToken.endpoint"), "VS Code adapter must expose endpoint setting.");
assert.ok(hasSetting(manifest, "whoEatsToken.token"), "VS Code adapter must expose token setting.");
assert.equal(manifest.dependencies, undefined, "VS Code adapter should not add runtime dependencies.");
assert.equal(manifest.devDependencies, undefined, "VS Code adapter should not add local dev dependencies.");
assert.deepEqual(manifest.files, ["extension.js", "README.md", "LICENSE"], "VS Code adapter must package only required files.");

const source = fs.readFileSync(extensionPath, "utf8");
assert.ok(!source.includes("setInterval("), "VS Code adapter must not use setInterval.");
assert.ok(source.includes("createStatusBarItem"), "VS Code adapter must create a status bar item.");
assert.ok(source.includes("REQUEST_TIMEOUT_MS = 1500"), "VS Code adapter must keep short request timeout.");
assert.ok(source.includes("127.0.0.1:17667"), "VS Code adapter must default to local API.");
assert.ok(source.includes('`${settings.endpoint}/health`'), "VS Code status refresh must use lightweight /health.");
assert.ok(source.includes('`${settings.endpoint}/snapshot`'), "VS Code copy command must keep full /snapshot access.");
assert.ok(source.includes("formatHealth"), "VS Code adapter must format compact providerHealth.");

const result = spawnSync(process.execPath, ["--check", extensionPath], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
});
assert.equal(result.status, 0, result.stderr || result.stdout);

console.log("VS Code adapter checks passed.");

function hasCommand(manifest, commandId) {
  return manifest.contributes?.commands?.some((command) => command.command === commandId);
}

function hasSetting(manifest, settingId) {
  return Boolean(manifest.contributes?.configuration?.properties?.[settingId]);
}
