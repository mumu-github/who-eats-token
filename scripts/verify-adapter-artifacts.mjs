import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readZipArchive } from "./lib/zip.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browserManifest = JSON.parse(fs.readFileSync(path.join(root, "adapters", "browser-extension", "manifest.json"), "utf8"));
const vscodeManifest = JSON.parse(fs.readFileSync(path.join(root, "adapters", "vscode-extension", "package.json"), "utf8"));
const releaseDir = path.join(root, "release", "adapters");
const browserZipPath = path.join(releaseDir, `who-eats-token-browser-extension-${browserManifest.version}.zip`);
const vsixPath = path.join(releaseDir, `${vscodeManifest.name}-${vscodeManifest.version}.vsix`);

verifyBrowserExtensionZip();
verifyVsix();

console.log("Adapter artifact verification passed.");

function verifyBrowserExtensionZip() {
  assert.ok(fs.existsSync(browserZipPath), `Missing browser extension ZIP: ${browserZipPath}`);
  const archive = readZipArchive(browserZipPath);
  const required = [
    "manifest.json",
    "service-worker.js",
    "content-script.js",
    "options.html",
    "options.js",
    "README.md"
  ];

  for (const entry of required) {
    assert.ok(archive.entries.has(entry), `Browser extension ZIP missing ${entry}.`);
  }
  for (const entry of archive.entryNames) {
    assert.ok(!entry.startsWith("node_modules/"), "Browser extension ZIP must not include node_modules.");
    assert.ok(!entry.includes(".env"), "Browser extension ZIP must not include env files.");
    assert.ok(!entry.endsWith(".map"), "Browser extension ZIP must not include source maps.");
  }

  const manifest = JSON.parse(archive.readText("manifest.json"));
  assert.equal(manifest.manifest_version, 3, "Browser extension artifact must be MV3.");
  assert.equal(manifest.background?.service_worker, "service-worker.js", "Browser extension service worker mismatch.");
  assert.ok(manifest.permissions?.includes("storage"), "Browser extension artifact must keep storage permission.");
  assert.ok(manifest.host_permissions?.includes("http://127.0.0.1:17667/*"), "Browser extension artifact missing local API host permission.");
  assert.ok(!JSON.stringify(manifest).includes("<all_urls>"), "Browser extension artifact must not use <all_urls>.");
  assert.ok(archive.readText("content-script.js").includes("MutationObserver"), "Browser extension content script must observe DOM changes.");
}

function verifyVsix() {
  assert.ok(fs.existsSync(vsixPath), `Missing VSIX: ${vsixPath}`);
  const archive = readZipArchive(vsixPath);
  const required = [
    "[Content_Types].xml",
    "extension.vsixmanifest",
    "extension/package.json",
    "extension/extension.js",
    "extension/LICENSE.txt",
    "extension/readme.md"
  ];

  for (const entry of required) {
    assert.ok(archive.entries.has(entry), `VSIX missing ${entry}.`);
  }
  for (const entry of archive.entryNames) {
    assert.ok(!entry.startsWith("extension/node_modules/"), "VSIX must not include node_modules.");
    assert.ok(!entry.includes(".env"), "VSIX must not include env files.");
    assert.ok(!entry.includes("api-token"), "VSIX must not include local token files.");
  }

  const manifest = JSON.parse(archive.readText("extension/package.json"));
  assert.equal(manifest.name, vscodeManifest.name, "VSIX package name mismatch.");
  assert.equal(manifest.version, vscodeManifest.version, "VSIX package version mismatch.");
  assert.equal(manifest.main, "./extension.js", "VSIX package main mismatch.");
  assert.ok(manifest.contributes?.commands?.some((command) => command.command === "whoEatsToken.refresh"), "VSIX missing refresh command.");
  assert.ok(manifest.contributes?.configuration?.properties?.["whoEatsToken.endpoint"], "VSIX missing endpoint setting.");
  assert.ok(archive.readText("extension/extension.js").includes("createStatusBarItem"), "VSIX extension entry must create status bar item.");
  assert.ok(archive.readText("extension.vsixmanifest").includes(vscodeManifest.name), "VSIX manifest missing extension name.");
}
