import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manualPath = path.join(root, "docs", "manual-validation.md");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const args = parseArgs(process.argv.slice(2));
const platform = args.platform || currentPlatform();
const outputJson = Boolean(args.json);
const sections = parseManualValidation(fs.readFileSync(manualPath, "utf8"));
const selectedSections = selectSections(sections, platform);
const commands = commandsForPlatform(platform);
const missingScripts = commands
  .map((command) => command.match(/^npm run ([^\s]+)/)?.[1])
  .filter(Boolean)
  .filter((script) => !packageJson.scripts?.[script]);

const result = {
  ok: missingScripts.length === 0 && selectedSections.length > 0,
  platform,
  source: path.relative(root, manualPath).replaceAll("\\", "/"),
  commands,
  missingScripts,
  sections: selectedSections
};

if (outputJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printMarkdown(result);
}

if (!result.ok) process.exitCode = 1;

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--json") {
      parsed.json = true;
      continue;
    }
    if (value === "--platform") {
      parsed.platform = normalizePlatform(argv[index + 1]);
      index += 1;
      continue;
    }
    if (value.startsWith("--platform=")) {
      parsed.platform = normalizePlatform(value.slice("--platform=".length));
    }
  }
  return parsed;
}

function normalizePlatform(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["win", "windows", "windows10", "windows11"].includes(text)) return "windows";
  if (["mac", "macos", "darwin", "osx"].includes(text)) return "macos";
  if (text === "all") return "all";
  return currentPlatform();
}

function currentPlatform() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "macos";
  return "all";
}

function parseManualValidation(markdown) {
  const parsed = [];
  let current = null;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = {
        title: heading[1],
        items: []
      };
      parsed.push(current);
      continue;
    }

    const item = line.match(/^-\s+(.+?)\s*$/);
    if (item && current) current.items.push(item[1]);
  }
  return parsed;
}

function selectSections(allSections, targetPlatform) {
  const wanted = new Set(["Browser Extension", "IDE Adapter", "Cute But Quiet Visual QA", "Failure Cases"]);
  if (targetPlatform === "windows" || targetPlatform === "all") wanted.add("Windows 10+");
  if (targetPlatform === "macos" || targetPlatform === "all") wanted.add("macOS");
  return allSections.filter((section) => wanted.has(section.title));
}

function commandsForPlatform(targetPlatform) {
  const commands = [
    "npm run release:check",
    "npm run adapter:manual-readiness",
    "npm run package:adapters",
    "npm run smoke:browser-hosts -- -- --require",
    "npm run smoke:ide-hosts -- -- --require",
    "npm run verify:adapter-artifacts"
  ];
  if (targetPlatform === "windows" || targetPlatform === "all") {
    commands.splice(1, 0, "npm run package:dir", "npm run smoke:packaged-win", "npm run soak:packaged-win");
  }
  if (targetPlatform === "macos" || targetPlatform === "all") {
    commands.splice(1, 0, "npm run package:dir", "npm run smoke:packaged-mac", "npm run soak:packaged-mac");
  }
  return [...new Set(commands)];
}

function printMarkdown(payload) {
  console.log("# Who Eats Token Manual Preflight");
  console.log("");
  console.log(`Platform: ${payload.platform}`);
  console.log(`Source: ${payload.source}`);
  console.log(`Host: ${os.type()} ${os.release()} ${os.arch()}`);
  console.log("");

  console.log("## Commands To Run First");
  for (const command of payload.commands) {
    console.log(`- [ ] \`${command}\``);
  }
  if (payload.missingScripts.length > 0) {
    console.log("");
    console.log(`Missing package scripts: ${payload.missingScripts.join(", ")}`);
  }
  console.log("");

  for (const section of payload.sections) {
    console.log(`## ${section.title}`);
    for (const item of section.items) {
      console.log(`- [ ] ${item}`);
    }
    console.log("");
  }
}
