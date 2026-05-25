import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const report = runJson(["--json"], 0);

assert.equal(report.ok, true);
assert.equal(report.browser.manifest.manifestVersion, 3);
assert.equal(report.browser.manifest.serviceWorker, "service-worker.js");
assert.equal(report.browser.manifest.optionsPage, "options.html");
assert.equal(report.browser.manifest.hasAllUrls, false, "Browser extension must not request <all_urls>.");
assert.ok(report.browser.manifest.localHostPermissions.some((entry) => entry.includes("127.0.0.1:17667")));
assert.ok(report.browser.sourceFiles.every((file) => file.exists), "Browser adapter source files must exist.");
assert.ok(report.browser.hosts.some((host) => host.name === "Chrome"));
assert.ok(report.browser.hosts.some((host) => host.name === "Edge"));

assert.equal(report.ide.manifest.name, "who-eats-token-vscode-adapter");
assert.ok(report.ide.manifest.engine);
assert.ok(report.ide.manifest.activationEvents.includes("onStartupFinished"));
assert.ok(report.ide.manifest.commands.includes("whoEatsToken.refresh"));
assert.ok(report.ide.manifest.commands.includes("whoEatsToken.copySnapshot"));
assert.ok(report.ide.sourceFiles.every((file) => file.exists), "IDE adapter source files must exist.");
assert.ok(report.ide.hosts.some((host) => host.name === "VS Code"));
assert.ok(report.ide.hosts.some((host) => host.name === "Cursor"));

const text = runText([]);
assert.match(text, /Adapter Manual Readiness/);
assert.match(text, /Browser Hosts/);
assert.match(text, /IDE Hosts/);

console.log("Adapter manual readiness checks passed.");

function runJson(args, expectedStatus) {
  const result = spawnSync(process.execPath, ["scripts/adapter-manual-readiness.mjs", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function runText(args) {
  const result = spawnSync(process.execPath, ["scripts/adapter-manual-readiness.mjs", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
