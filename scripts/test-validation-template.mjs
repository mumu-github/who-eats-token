import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

assert.ok(packageJson.scripts?.["validation:template"], "Missing validation:template script.");
assert.ok(packageJson.scripts?.["test:validation-template"], "Missing test:validation-template script.");

const browser = runJson(["--target", "browser"]);
assert.equal(browser.target, "browser");
assert.equal(browser.openActionCount, 2);
assert.equal(browser.sections.length, 1);
assert.equal(browser.sections[0].target, "browser");
assert.ok(browser.sections[0].checklist.some((item) => item.includes("Chrome loads")));
assert.ok(findAction(browser, "browserAdapter.manualLoad").recordCommand.includes("--status passed"));
assert.ok(findAction(browser, "browserAdapter.manualConnection").requiredNotes.some((note) => note.includes("/health")));

const ide = runJson(["--target=ide"]);
assert.equal(ide.target, "ide");
assert.ok(findAction(ide, "ideAdapter.hostSmoke").recordCommand.includes("--status host-smoke-only"));
assert.ok(findAction(ide, "ideAdapter.manualConnection").requiredNotes.some((note) => note.includes("copy snapshot")));

const macos = runJson(["--target", "macos"]);
assert.equal(macos.target, "macos");
assert.ok(findAction(macos, "macosPackagedRuntime.hudPermissionStates").requiredNotes.some((note) => note.includes("Accessibility")));
assert.ok(JSON.stringify(macos).includes("Screen Recording"));

const signing = runJson(["--target", "signing"]);
assert.equal(signing.target, "signing");
assert.ok(findAction(signing, "signing.windowsAuthenticode"));
assert.ok(findAction(signing, "signing.macosNotarization"));

const audit = runJson(["--target", "audit"]);
assert.equal(audit.target, "audit");
assert.equal(audit.openActionCount, 0);
assert.equal(audit.sections.length, 0);

const text = runText(["--target", "browser"]);
assert.match(text, /Validation Evidence Template/);
assert.match(text, /browserAdapter\.manualLoad/);
assert.match(text, /Record when done/);
assert.match(text, /Do not paste API keys/);

console.log("Validation template checks passed.");

function runJson(args) {
  const result = spawnSync(process.execPath, ["scripts/validation-template.mjs", ...args, "--json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function runText(args) {
  const result = spawnSync(process.execPath, ["scripts/validation-template.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function findAction(template, key) {
  const action = template.sections.flatMap((section) => section.actions).find((entry) => entry.key === key);
  assert.ok(action, `Missing action: ${key}`);
  return action;
}
