import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const platform = args.platform || currentPlatform();
const pack = buildPack(platform);

if (args.json) {
  console.log(JSON.stringify(pack, null, 2));
} else {
  printMarkdown(pack);
}

function buildPack(platform) {
  const manual = buildManual(platform);
  return {
    ok: true,
    platform,
    generatedAt: new Date().toISOString(),
    host: {
      os: os.type(),
      release: os.release(),
      arch: os.arch()
    },
    phases: [
      {
        id: "preflight",
        title: "Automated preflight",
        commands: [
          "npm ci",
          "npm run release:check",
          "npm run package:dir",
          ...platformCommands(platform),
          "npm run package:adapters",
          "npm run verify:adapter-artifacts",
          "npm run release:manifest",
          "npm run verify:release-manifest",
          `npm run manual:preflight -- -- --platform ${platform}`,
          "npm run release:evidence -- -- --list"
        ],
        evidenceUpdates: []
      },
      {
        id: "runtime",
        title: "Desktop runtime evidence",
        commands: runtimeCommands(platform),
        checklist: runtimeChecklist(platform),
        evidenceUpdates: runtimeEvidenceUpdates(platform)
      },
      {
        id: "browser-adapter",
        title: "Browser adapter evidence",
        commands: [
          "npm run package:browser-extension",
          "npm run adapter:manual-readiness",
          "npm run smoke:browser-hosts -- -- --require"
        ],
        checklist: sectionItems(manual, "Browser Extension"),
        evidenceUpdates: [
          evidenceCommand("browserAdapter.hostSmoke", "host-smoke-only", "npm run smoke:browser-hosts -- -- --require", "Record Chrome/Edge host smoke result. Use host-smoke-only unless full manual Options flow was also checked."),
          evidenceCommand("browserAdapter.manualLoad", "passed", "Chrome and Edge load adapters/browser-extension unpacked", "Record exact Chrome/Edge versions and that the extension was enabled in both hosts."),
          evidenceCommand("browserAdapter.manualConnection", "passed", "Browser extension Options /health connection test", "Record that local token and /health succeeded in both Chrome and Edge.")
        ]
      },
      {
        id: "ide-adapter",
        title: "IDE adapter evidence",
        commands: [
          "npm run package:vscode-extension",
          "npm run adapter:manual-readiness",
          "npm run smoke:ide-hosts -- -- --require"
        ],
        checklist: sectionItems(manual, "IDE Adapter"),
        evidenceUpdates: [
          evidenceCommand("ideAdapter.hostSmoke", "host-smoke-only", "npm run smoke:ide-hosts -- -- --require", "Record VS Code/Cursor VSIX install/list result on the validation machine."),
          evidenceCommand("ideAdapter.manualLoad", "passed", "Install VSIX in VS Code and Cursor", "Record exact VS Code/Cursor versions and that the extension loaded in both hosts."),
          evidenceCommand("ideAdapter.manualConnection", "passed", "VS Code/Cursor status bar /health, refresh, and copy snapshot checks", "Record status bar, refresh, and copy snapshot behavior in both hosts.")
        ]
      },
      {
        id: "signing",
        title: "Signing and notarization evidence",
        commands: signingCommands(platform),
        evidenceUpdates: signingEvidenceUpdates(platform)
      },
      {
        id: "final-audit",
        title: "Final public-release audit",
        commands: [
          "npm run test:release-evidence",
          "npm run release:gaps -- -- --require-public-release",
          "npm run verify:release-manifest"
        ],
        evidenceUpdates: []
      }
    ]
  };
}

function buildManual(platform) {
  const markdown = fs.readFileSync(path.join(root, "docs", "manual-validation.md"), "utf8");
  const sections = [];
  let current = null;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = { title: heading[1], items: [] };
      sections.push(current);
      continue;
    }
    const item = line.match(/^-\s+(.+?)\s*$/);
    if (item && current) current.items.push(item[1]);
  }
  return {
    platform,
    sections
  };
}

function platformCommands(platform) {
  const commands = [];
  if (platform === "windows" || platform === "all") {
    commands.push("npm run smoke:packaged-win", "npm run soak:packaged-win");
  }
  if (platform === "macos" || platform === "all") {
    commands.push("npm run smoke:packaged-mac", "npm run soak:packaged-mac");
  }
  return commands;
}

function runtimeCommands(platform) {
  if (platform === "windows") return ["npm run smoke:packaged-win", "npm run soak:packaged-win"];
  if (platform === "macos") return ["npm run smoke:packaged-mac", "npm run soak:packaged-mac"];
  return ["npm run smoke:packaged-win", "npm run soak:packaged-win", "npm run smoke:packaged-mac", "npm run soak:packaged-mac"];
}

function runtimeChecklist(platform) {
  const manual = buildManual(platform);
  if (platform === "windows") return sectionItems(manual, "Windows 10+");
  if (platform === "macos") return sectionItems(manual, "macOS");
  return [
    ...sectionItems(manual, "Windows 10+"),
    ...sectionItems(manual, "macOS")
  ];
}

function runtimeEvidenceUpdates(platform) {
  const commands = [];
  if (platform === "windows" || platform === "all") {
    commands.push(
      evidenceCommand("windowsPackagedRuntime.smoke", "passed", "npm run smoke:packaged-win", "Record workingSetMb, cpuPercent, and local API health result."),
      evidenceCommand("windowsPackagedRuntime.soak", "passed", "npm run soak:packaged-win", "Record duration, maxWorkingSetMb, growthMb, and maxCpuPercent."),
      evidenceCommand("windowsPackagedRuntime.hudPermissionStates", "passed", "manual Windows HUD desktop/tool placement check", "Record desktop top bar visibility and in-tool HUD placement.")
    );
  }
  if (platform === "macos" || platform === "all") {
    commands.push(
      evidenceCommand("macosPackagedRuntime.smoke", "passed", "npm run smoke:packaged-mac", "Record macOS packaged smoke result."),
      evidenceCommand("macosPackagedRuntime.soak", "passed", "npm run soak:packaged-mac", "Record macOS 10-minute idle soak result."),
      evidenceCommand("macosPackagedRuntime.hudPermissionStates", "passed", "manual macOS Accessibility and Screen Recording granted/denied check", "Record behavior with both permissions granted and denied.")
    );
  }
  return commands;
}

function signingCommands(platform) {
  if (platform === "windows") return ["npm run signing:readiness -- -- --platform windows --require"];
  if (platform === "macos") return ["npm run signing:readiness -- -- --platform macos --require"];
  return ["npm run signing:readiness -- -- --platform all --require"];
}

function signingEvidenceUpdates(platform) {
  const commands = [];
  if (platform === "windows" || platform === "all") {
    commands.push(evidenceCommand("signing.windowsAuthenticode", "passed", "npm run signing:readiness -- -- --platform windows --require", "Record signed Windows artifact names and certificate subject."));
  }
  if (platform === "macos" || platform === "all") {
    commands.push(evidenceCommand("signing.macosNotarization", "passed", "npm run signing:readiness -- -- --platform macos --require", "Record notarized macOS artifact names and notary tool result."));
  }
  return commands;
}

function evidenceCommand(key, status, command, notes) {
  return `npm run release:evidence -- -- --set ${key} --status ${status} --command "${command}" --notes "${notes}"`;
}

function sectionItems(manual, title) {
  return manual.sections.find((section) => section.title === title)?.items || [];
}

function printMarkdown(pack) {
  console.log("# Who Eats Token Release Validation Pack");
  console.log("");
  console.log(`Platform: ${pack.platform}`);
  console.log(`Generated: ${pack.generatedAt}`);
  console.log(`Host: ${pack.host.os} ${pack.host.release} ${pack.host.arch}`);
  for (const phase of pack.phases) {
    console.log("");
    console.log(`## ${phase.title}`);
    if (phase.commands?.length) {
      console.log("");
      console.log("Commands:");
      for (const command of phase.commands) console.log(`- \`${command}\``);
    }
    if (phase.checklist?.length) {
      console.log("");
      console.log("Checklist:");
      for (const item of phase.checklist) console.log(`- [ ] ${item}`);
    }
    if (phase.evidenceUpdates?.length) {
      console.log("");
      console.log("Evidence update commands:");
      for (const command of phase.evidenceUpdates) console.log(`- \`${command}\``);
    }
  }
}

function parseArgs(argv) {
  const parsed = {
    platform: null,
    json: argv.includes("--json")
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--platform") {
      parsed.platform = normalizePlatform(argv[index + 1]);
      index += 1;
    } else if (value.startsWith("--platform=")) {
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
