import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(root, "plugins", "who-eats-token");
const manifestPath = path.join(pluginRoot, ".codex-plugin", "plugin.json");
const mcpPath = path.join(pluginRoot, ".mcp.json");
const wrapperPath = path.join(pluginRoot, "scripts", "mcp-server.mjs");
const envCheckPath = path.join(pluginRoot, "scripts", "check-plugin-env.mjs");
const expectedSkills = [
  "who-eats-token-setup",
  "who-eats-token-doctor",
  "who-eats-token-adapter-author"
];

assert.ok(fs.existsSync(manifestPath), "Plugin manifest is required.");
assert.ok(fs.existsSync(mcpPath), "Plugin MCP config is required.");
assert.ok(fs.existsSync(wrapperPath), "Plugin MCP wrapper is required.");
assert.ok(fs.existsSync(envCheckPath), "Plugin environment check script is required.");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
assert.equal(manifest.name, "who-eats-token", "Plugin name should match its directory.");
assert.equal(manifest.version, readPackageVersion(), "Plugin version should match package.json.");
assert.equal(manifest.license, "MIT", "Plugin should inherit the project license.");
assert.equal(manifest.skills, "./skills/", "Plugin should expose bundled skills.");
assert.equal(manifest.mcpServers, "./.mcp.json", "Plugin should expose bundled MCP config.");
assert.equal(manifest.interface?.displayName, "Who Eats Token", "Plugin display name is required.");
assert.ok(manifest.interface?.shortDescription?.length > 20, "Plugin needs a useful short description.");
assert.ok(manifest.interface?.longDescription?.includes("not the desktop HUD runtime"), "Plugin must state it is not the runtime.");
assert.ok(Array.isArray(manifest.interface?.defaultPrompt), "defaultPrompt should be an array.");
assert.ok(manifest.interface.defaultPrompt.length >= 3, "Plugin should include setup, doctor, and adapter prompts.");

const mcp = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
const server = mcp.mcpServers?.["who-eats-token"];
assert.ok(server, "MCP config must expose who-eats-token server.");
assert.equal(server.command, "node", "Plugin MCP server should launch through node.");
assert.deepEqual(server.args, ["./scripts/mcp-server.mjs"], "Plugin MCP server should use the wrapper.");
assert.equal(server.env?.WHO_EATS_TOKEN_BASE_URL, "http://127.0.0.1:17667", "Plugin MCP base URL should be localhost.");

const wrapper = fs.readFileSync(wrapperPath, "utf8");
assert.ok(wrapper.includes("WHO_EATS_TOKEN_REPO_ROOT"), "Wrapper should support explicit repo root override.");
assert.ok(wrapper.includes("scripts\", \"mcp-server.mjs"), "Wrapper should launch the repo MCP server.");
assert.ok(wrapper.includes("stdio: \"inherit\""), "Wrapper should preserve MCP stdio.");

for (const skillName of expectedSkills) {
  const projectSkillDir = path.join(root, "skills", skillName);
  const pluginSkillDir = path.join(pluginRoot, "skills", skillName);
  assert.ok(fs.existsSync(pluginSkillDir), `Plugin is missing ${skillName}.`);
  assertDirectoriesMatch(projectSkillDir, pluginSkillDir, skillName);
}

console.log("Plugin checks passed.");

function readPackageVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  return pkg.version;
}

function assertDirectoriesMatch(sourceDir, targetDir, label) {
  const sourceFiles = listFiles(sourceDir);
  const targetFiles = listFiles(targetDir);
  assert.deepEqual(targetFiles, sourceFiles, `${label} plugin copy drifted from skills/.`);

  for (const relativePath of sourceFiles) {
    const source = fs.readFileSync(path.join(sourceDir, relativePath), "utf8");
    const target = fs.readFileSync(path.join(targetDir, relativePath), "utf8");
    assert.equal(target, source, `${label}/${relativePath} drifted from skills/.`);
    assert.ok(!target.includes("[TODO"), `${label}/${relativePath} contains TODO placeholder.`);
  }
}

function listFiles(dir) {
  const files = [];
  walk(dir, "");
  return files.sort();

  function walk(currentDir, prefix) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const relativePath = prefix ? path.join(prefix, entry.name) : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(currentDir, entry.name), relativePath);
      } else {
        files.push(relativePath.replaceAll(path.sep, "/"));
      }
    }
  }
}
