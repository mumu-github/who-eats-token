import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browserDir = path.join(root, "adapters", "browser-extension");
const vscodeDir = path.join(root, "adapters", "vscode-extension");
const PURPOSE = "prompt/completion scraping and low-memory adapter guard";

checkBrowserAdapter();
checkIdeAdapter();

console.log("Adapter privacy and performance guard checks passed.");

function checkBrowserAdapter() {
  const manifest = readJson("adapters/browser-extension/manifest.json");
  const contentScript = read("adapters/browser-extension/content-script.js");
  const serviceWorker = read("adapters/browser-extension/service-worker.js");

  assert.equal(manifest.manifest_version, 3, "Browser adapter must stay on Manifest V3.");
  assert.deepEqual(manifest.permissions, ["storage"], "Browser adapter must only request storage permission.");
  assert.ok(Array.isArray(manifest.host_permissions), "Browser adapter must declare host_permissions.");
  for (const permission of manifest.host_permissions) {
    assert.match(permission, /^http:\/\/(127\.0\.0\.1|localhost):17667\/\*$/, `Host permission must stay local: ${permission}`);
  }

  for (const script of manifest.content_scripts || []) {
    for (const match of script.matches || []) {
      assert.notEqual(match, "<all_urls>", "Browser adapter must not use <all_urls>.");
      assert.doesNotMatch(match, /^\*:\/\/\*\/\*$/, "Browser adapter must not match every host.");
      assert.doesNotMatch(match, /^https?:\/\/\*\/\*$/, "Browser adapter must not match every HTTP(S) host.");
    }
  }

  assertNoNeedles(contentScript, [
    "setInterval(",
    "document.body.innerText",
    "document.body.textContent",
    "document.documentElement.innerText",
    "document.documentElement.textContent",
    "document.querySelectorAll(\"*\")",
    "document.querySelectorAll('*')",
    "document.cookie",
    "localStorage",
    "sessionStorage",
    "navigator.clipboard",
    "getSelection(",
    "innerHTML",
    "outerHTML",
    "XMLHttpRequest",
    "fetch("
  ], "browser content script");

  assert.ok(contentScript.includes("MutationObserver"), "Browser content script should be event-driven through MutationObserver.");
  assert.ok(contentScript.includes("slice(0, 32)"), "Browser content script must bound button/control labels.");
  assert.ok(contentScript.includes("slice(0, 80)"), "Browser content script must bound overlay labels.");
  assert.ok(contentScript.includes("MAX_OVERLAYS = 16"), "Browser content script must bound overlay count.");

  assertNoNeedles(serviceWorker, [
    "setInterval(",
    "chrome.tabs",
    "chrome.cookies",
    "chrome.webRequest",
    "chrome.scripting",
    "chrome.debugger"
  ], "browser service worker");
  const withUsageMetadata = functionSource(serviceWorker, "withUsageMetadata");
  assert.equal(withUsageMetadata.includes("...safeObject(payload)"), false, "browser usage events must not forward untrusted payloads wholesale.");
  assert.ok(serviceWorker.includes("SAFE_USAGE_KEYS"), "Browser service worker must use a usage-field allowlist.");
  assert.ok(serviceWorker.includes("safeUsagePayload"), "Browser service worker must sanitize usage payloads.");
  assert.ok(serviceWorker.includes("getLocal(\"/health\""), "Browser connection test must use /health.");
  assert.ok(!serviceWorker.includes("getLocal(\"/snapshot\""), "Browser service worker must not use /snapshot for routine status.");
  assert.ok(fs.existsSync(path.join(browserDir, "README.md")), "Browser adapter must document its privacy boundary.");
}

function checkIdeAdapter() {
  const manifest = readJson("adapters/vscode-extension/package.json");
  const extension = read("adapters/vscode-extension/extension.js");

  assert.equal(manifest.dependencies, undefined, "IDE adapter must not add runtime dependencies.");
  assert.equal(manifest.devDependencies, undefined, "IDE adapter must not add local dev dependencies.");
  assert.deepEqual(manifest.files, ["extension.js", "README.md", "LICENSE"], "IDE adapter package must only include required files.");
  assert.ok(manifest.activationEvents?.includes("onStartupFinished"), "IDE adapter should wait for startup to refresh.");

  assertNoNeedles(extension, [
    "setInterval(",
    "workspace.findFiles",
    "workspace.fs.readFile",
    "workspace.openTextDocument",
    ".document.getText(",
    "activeTextEditor",
    "env.clipboard.readText",
    "child_process",
    "exec(",
    "spawn("
  ], "IDE adapter");
  assert.ok(extension.includes("REQUEST_TIMEOUT_MS = 1500"), "IDE adapter must keep short local request timeout.");
  assert.ok(extension.includes("Math.max(5000"), "IDE adapter must clamp refresh interval to at least 5s.");
  assert.ok(extension.includes("normalizeEndpoint"), "IDE adapter must normalize endpoints.");
  assert.ok(extension.includes("127.0.0.1"), "IDE adapter must default to localhost.");
  assert.ok(extension.includes("/health"), "IDE status refresh must use /health.");
  assert.ok(fs.existsSync(path.join(vscodeDir, "README.md")), "IDE adapter must document its privacy boundary.");
}

function assertNoNeedles(source, needles, label) {
  for (const needle of needles) {
    assert.equal(source.includes(needle), false, `${label} must not include ${needle}`);
  }
}

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}
