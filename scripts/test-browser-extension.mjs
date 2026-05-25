import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = path.join(root, "adapters", "browser-extension");
const manifestPath = path.join(extensionDir, "manifest.json");
const requiredFiles = [
  "manifest.json",
  "service-worker.js",
  "content-script.js",
  "options.html",
  "options.js",
  "README.md"
];

let failed = false;

for (const file of requiredFiles) {
  assert(fs.existsSync(path.join(extensionDir, file)), `Missing browser extension file: ${file}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
assert(manifest.manifest_version === 3, "Browser extension must use Manifest V3.");
assert(manifest.permissions?.includes("storage"), "Browser extension must request storage permission.");
assert(manifest.background?.service_worker === "service-worker.js", "Manifest must use service-worker.js.");
assert(manifest.options_page === "options.html", "Manifest must expose options.html.");
assert(hasHostPermission(manifest, "http://127.0.0.1:17667/*"), "Manifest must allow 127.0.0.1 API.");
assert(hasHostPermission(manifest, "http://localhost:17667/*"), "Manifest must allow localhost API.");

const contentScripts = manifest.content_scripts || [];
assert(contentScripts.length > 0, "Manifest must include a content script.");
for (const script of contentScripts) {
  assert(!script.matches?.includes("<all_urls>"), "Browser extension must not use <all_urls>.");
  assert(script.js?.includes("content-script.js"), "Content script entry must include content-script.js.");
}

const scriptFiles = ["service-worker.js", "content-script.js", "options.js"];
for (const file of scriptFiles) {
  const absolute = path.join(extensionDir, file);
  const result = spawnSync(process.execPath, ["--check", absolute], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert(result.status === 0, `Syntax check failed for ${file}\n${result.stderr || result.stdout}`);
}

const contentScript = fs.readFileSync(path.join(extensionDir, "content-script.js"), "utf8");
const serviceWorker = fs.readFileSync(path.join(extensionDir, "service-worker.js"), "utf8");
const optionsHtml = fs.readFileSync(path.join(extensionDir, "options.html"), "utf8");
const optionsJs = fs.readFileSync(path.join(extensionDir, "options.js"), "utf8");

assert(!contentScript.includes("setInterval("), "Content script must not use setInterval.");
assert(!serviceWorker.includes("setInterval("), "Service worker must not use setInterval.");
assert(contentScript.includes("MutationObserver"), "Content script must observe DOM changes.");
assert(serviceWorker.includes("chrome.runtime.onMessage"), "Service worker must handle runtime messages.");
assert(serviceWorker.includes('getLocal("/health"'), "Browser extension connection test must use lightweight /health.");
assert(!serviceWorker.includes('getLocal("/snapshot"'), "Browser extension must not fetch full /snapshot for connection tests.");
assert(optionsHtml.includes("options.js"), "Options page must load options.js.");
assert(optionsJs.includes("providerHealth"), "Options connection output must read providerHealth from /health.");

if (failed) {
  process.exitCode = 1;
} else {
  console.log("Browser extension adapter checks passed.");
}

function hasHostPermission(manifest, permission) {
  return Array.isArray(manifest.host_permissions) && manifest.host_permissions.includes(permission);
}

function assert(condition, message) {
  if (condition) return;
  failed = true;
  console.error(message);
}
