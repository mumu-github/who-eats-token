import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const script = fs.readFileSync(path.join(root, "scripts", "release-manifest.mjs"), "utf8");
const tempReleaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "who-eats-token-manifest-test-"));

try {
  assert.ok(packageJson.scripts?.["release:manifest"], "Missing release:manifest script.");
  assert.ok(packageJson.scripts?.["verify:release-manifest"], "Missing verify:release-manifest script.");
  assert.ok(packageJson.scripts?.["test:release-manifest"], "Missing test:release-manifest script.");

  assert.ok(script.includes("sha256"), "Release manifest script must compute SHA256.");
  assert.ok(script.includes("SHA256SUMS.txt"), "Release manifest script must write SHA256SUMS.");
  assert.ok(script.includes("release-manifest.json"), "Release manifest script must write release-manifest.json.");
  assert.ok(script.includes("win-unpacked"), "Release manifest script must skip unpacked app internals.");

  fs.mkdirSync(path.join(tempReleaseDir, "adapters"), { recursive: true });
  fs.writeFileSync(path.join(tempReleaseDir, "who-eats-token-setup.exe"), "desktop installer fixture");
  fs.writeFileSync(path.join(tempReleaseDir, "adapters", "who-eats-token-browser-extension-0.1.0.zip"), "browser fixture");
  fs.writeFileSync(path.join(tempReleaseDir, "adapters", "who-eats-token-vscode-adapter-0.1.0.vsix"), "ide fixture");
  fs.writeFileSync(path.join(tempReleaseDir, "builder-debug.yml"), "debug config should not ship");
  fs.mkdirSync(path.join(tempReleaseDir, "win-unpacked"), { recursive: true });
  fs.writeFileSync(path.join(tempReleaseDir, "win-unpacked", "ignored.dll"), "not a public artifact");

  run(["--release-dir", tempReleaseDir, "--require-artifacts"]);
  const manifestPath = path.join(tempReleaseDir, "release-manifest.json");
  const sumsPath = path.join(tempReleaseDir, "SHA256SUMS.txt");
  assert.ok(fs.existsSync(manifestPath), "Manifest was not written.");
  assert.ok(fs.existsSync(sumsPath), "SHA256SUMS was not written.");

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.package.name, packageJson.name);
  assert.deepEqual(manifest.artifacts.map((artifact) => artifact.path), [
    "adapters/who-eats-token-browser-extension-0.1.0.zip",
    "adapters/who-eats-token-vscode-adapter-0.1.0.vsix",
    "who-eats-token-setup.exe"
  ]);
  assert.ok(manifest.artifacts.every((artifact) => /^[a-f0-9]{64}$/.test(artifact.sha256)), "Every artifact must have a SHA256.");
  assert.equal(manifest.artifacts.find((artifact) => artifact.path.endsWith(".vsix")).type, "vscode-extension");
  assert.equal(manifest.artifacts.find((artifact) => artifact.path.endsWith(".exe")).platform, "windows");
  assert.ok(!JSON.stringify(manifest).includes("ignored.dll"), "Unpacked internals must not be included.");
  assert.ok(!JSON.stringify(manifest).includes("builder-debug.yml"), "Builder debug files must not be included.");

  run(["--release-dir", tempReleaseDir, "--check", "--require-artifacts"]);
  console.log("Release manifest checks passed.");
} finally {
  fs.rmSync(tempReleaseDir, { recursive: true, force: true });
}

function run(args) {
  const result = spawnSync(process.execPath, ["scripts/release-manifest.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}
