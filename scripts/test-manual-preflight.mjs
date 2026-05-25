import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const windows = runPreflight(["--platform", "windows", "--json"]);
assert.equal(windows.ok, true);
assert.equal(windows.platform, "windows");
assert.deepEqual(sectionTitles(windows), ["Windows 10+", "Browser Extension", "IDE Adapter", "Cute But Quiet Visual QA", "Failure Cases"]);
assert.ok(windows.commands.includes("npm run smoke:packaged-win"));
assert.ok(windows.commands.includes("npm run soak:packaged-win"));
assert.ok(windows.commands.includes("npm run adapter:manual-readiness"));
assert.ok(windows.commands.includes("npm run smoke:browser-hosts -- --require"));
assert.ok(windows.commands.includes("npm run smoke:ide-hosts -- --require"));
assert.ok(!windows.commands.includes("npm run smoke:packaged-mac"));
assert.ok(sectionByTitle(windows, "Windows 10+").items.some((item) => item.includes("Desktop top bar")));
assert.ok(sectionByTitle(windows, "Browser Extension").items.some((item) => item.includes("/health")));
assert.ok(sectionByTitle(windows, "Cute But Quiet Visual QA").items.some((item) => item.includes("does not fall back to Hermes")));
assert.ok(sectionByTitle(windows, "Cute But Quiet Visual QA").items.some((item) => item.includes("Reduced-motion mode")));

const macos = runPreflight(["--platform=macos", "--json"]);
assert.equal(macos.ok, true);
assert.equal(macos.platform, "macos");
assert.deepEqual(sectionTitles(macos), ["macOS", "Browser Extension", "IDE Adapter", "Cute But Quiet Visual QA", "Failure Cases"]);
assert.ok(macos.commands.includes("npm run smoke:packaged-mac"));
assert.ok(macos.commands.includes("npm run soak:packaged-mac"));
assert.ok(macos.commands.includes("npm run adapter:manual-readiness"));
assert.ok(macos.commands.includes("npm run smoke:browser-hosts -- --require"));
assert.ok(macos.commands.includes("npm run smoke:ide-hosts -- --require"));
assert.ok(!macos.commands.includes("npm run smoke:packaged-win"));
assert.ok(sectionByTitle(macos, "macOS").items.some((item) => item.includes("Accessibility")));
assert.ok(sectionByTitle(macos, "macOS").items.some((item) => item.includes("Screen Recording")));

const all = runPreflight(["--platform", "all", "--json"]);
assert.equal(all.ok, true);
assert.deepEqual(sectionTitles(all), ["Windows 10+", "macOS", "Browser Extension", "IDE Adapter", "Cute But Quiet Visual QA", "Failure Cases"]);
assert.ok(all.commands.includes("npm run smoke:packaged-win"));
assert.ok(all.commands.includes("npm run smoke:packaged-mac"));
assert.ok(all.commands.includes("npm run soak:packaged-win"));
assert.ok(all.commands.includes("npm run soak:packaged-mac"));

const text = runText(["--platform", "windows"]);
assert.match(text, /# Who Eats Token Manual Preflight/);
assert.match(text, /- \[ \] `npm run release:check`/);
assert.match(text, /## Windows 10\+/);
assert.match(text, /## Browser Extension/);
assert.match(text, /## Cute But Quiet Visual QA/);

console.log("Manual preflight checks passed.");

function runPreflight(args) {
  const result = spawnSync(process.execPath, ["scripts/manual-preflight.mjs", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function runText(args) {
  const result = spawnSync(process.execPath, ["scripts/manual-preflight.mjs", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function sectionTitles(payload) {
  return payload.sections.map((section) => section.title);
}

function sectionByTitle(payload, title) {
  const section = payload.sections.find((entry) => entry.title === title);
  assert.ok(section, `Missing section: ${title}`);
  return section;
}
