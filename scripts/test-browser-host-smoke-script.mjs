import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(read("package.json"));
const source = read("scripts/smoke-browser-hosts.mjs");

assert.ok(packageJson.scripts?.["smoke:browser-hosts"], "Missing smoke:browser-hosts script.");
assert.ok(packageJson.scripts?.["test:browser-host-smoke"], "Missing test:browser-host-smoke script.");

assertIncludes(source, "--load-extension");
assertIncludes(source, "--enable-unsafe-extension-debugging");
assertIncludes(source, "DisableLoadExtensionCommandLineSwitch");
assertIncludes(source, "--disable-extensions-except");
assertIncludes(source, "--remote-debugging-port");
assertIncludes(source, "--user-data-dir");
assertIncludes(source, "Who Eats Token Adapter");
assertIncludes(source, "chrome-extension");
assertIncludes(source, "--headed");
assertIncludes(source, "--require");
assertIncludes(source, "--test-options-health");
assertIncludes(source, "Options /health");
assertIncludes(source, "readLocalTokenInfo");
assertIncludes(source, "chrome-137-command-line-extension-disabled");
assertIncludes(source, "requiredFailure");
assertIncludes(source, "taskkill.exe");
assertIncludes(source, "cleanupDir");

console.log("Browser host smoke script checks passed.");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertIncludes(text, needle) {
  assert.ok(text.includes(needle), `Expected text to include ${needle}.`);
}
