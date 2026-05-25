import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

assert.ok(packageJson.scripts?.["release:validation-pack"], "Missing release:validation-pack script.");
assert.ok(packageJson.scripts?.["test:release-validation-pack"], "Missing test:release-validation-pack script.");

const macos = runPack(["--platform", "macos", "--json"]);
assert.equal(macos.ok, true);
assert.equal(macos.platform, "macos");
assert.ok(findPhase(macos, "preflight").commands.includes("npm run manual:preflight -- --platform macos"));
assert.ok(findPhase(macos, "runtime").commands.includes("npm run smoke:packaged-mac"));
assert.ok(findPhase(macos, "runtime").evidenceUpdates.some((command) => command.includes("macosPackagedRuntime.hudPermissionStates")));
assert.ok(findPhase(macos, "signing").evidenceUpdates.some((command) => command.includes("signing.macosNotarization")));
assert.ok(!JSON.stringify(macos).includes("windowsPackagedRuntime.smoke"), "macOS pack should not ask for Windows runtime evidence.");

const windows = runPack(["--platform=windows", "--json"]);
assert.equal(windows.platform, "windows");
assert.ok(findPhase(windows, "runtime").commands.includes("npm run smoke:packaged-win"));
assert.ok(findPhase(windows, "browser-adapter").evidenceUpdates.some((command) => command.includes("browserAdapter.manualConnection")));
assert.ok(findPhase(windows, "ide-adapter").evidenceUpdates.some((command) => command.includes("ideAdapter.manualLoad")));
assert.ok(findPhase(windows, "signing").evidenceUpdates.some((command) => command.includes("signing.windowsAuthenticode")));

const all = runPack(["--platform", "all", "--json"]);
assert.equal(all.platform, "all");
assert.ok(findPhase(all, "preflight").commands.includes("npm run manual:preflight -- --platform all"));
assert.ok(findPhase(all, "runtime").evidenceUpdates.some((command) => command.includes("windowsPackagedRuntime.soak")));
assert.ok(findPhase(all, "runtime").evidenceUpdates.some((command) => command.includes("macosPackagedRuntime.soak")));
assert.ok(findPhase(all, "final-audit").commands.includes("npm run release:gaps -- --require-public-release"));

const text = runText(["--platform", "macos"]);
assert.match(text, /Who Eats Token Release Validation Pack/);
assert.match(text, /macosPackagedRuntime\.smoke/);
assert.match(text, /Browser adapter evidence/);

console.log("Release validation pack checks passed.");

function runPack(args) {
  const result = spawnSync(process.execPath, ["scripts/release-validation-pack.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function runText(args) {
  const result = spawnSync(process.execPath, ["scripts/release-validation-pack.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function findPhase(pack, id) {
  const phase = pack.phases.find((entry) => entry.id === id);
  assert.ok(phase, `Missing phase: ${id}`);
  return phase;
}
