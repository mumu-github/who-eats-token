import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(read("package.json"));
const source = read("scripts/smoke-ide-hosts.mjs");

assert.ok(packageJson.scripts?.["smoke:ide-hosts"], "Missing smoke:ide-hosts script.");
assert.ok(packageJson.scripts?.["test:ide-host-smoke"], "Missing test:ide-host-smoke script.");

assertIncludes(source, "--install-extension");
assertIncludes(source, "--list-extensions");
assertIncludes(source, "--extensions-dir");
assertIncludes(source, "--user-data-dir");
assertIncludes(source, "who-eats-token.who-eats-token-vscode-adapter");
assertIncludes(source, "VS Code");
assertIncludes(source, "Cursor");
assertIncludes(source, "--ide");
assertIncludes(source, "--require");
assertIncludes(source, "args.require");
assertIncludes(source, "requiredFailure");
assertIncludes(source, "cleanupDir");

console.log("IDE host smoke script checks passed.");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertIncludes(text, needle) {
  assert.ok(text.includes(needle), `Expected text to include ${needle}.`);
}
