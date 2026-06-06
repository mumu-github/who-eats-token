import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const next = getNextActions(args.target);
const manual = parseManualValidation();
const template = buildTemplate(next, manual, args.target);

if (args.json) {
  console.log(JSON.stringify(template, null, 2));
} else {
  printMarkdown(template);
}

function buildTemplate(nextActions, manual, target) {
  const sections = groupByTarget(nextActions.actions).map(([sectionTarget, actions]) => ({
    target: sectionTarget,
    title: titleForTarget(sectionTarget),
    checklist: checklistForTarget(manual, sectionTarget),
    actions: actions.map((action) => ({
      key: action.key,
      kind: action.kind,
      status: action.status,
      runOrCheck: action.command,
      requiredNotes: requiredNotesForAction(action),
      recordCommand: action.recordCommand
    }))
  }));

  return {
    ok: nextActions.ok,
    releaseCandidate: nextActions.releaseCandidate,
    target,
    generatedAt: new Date().toISOString(),
    openActionCount: nextActions.actions.length,
    summary: nextActions.summary,
    rules: [
      "Do not paste API keys, cookies, prompts, completions, source files, screenshots with secrets, or raw provider logs.",
      "Host-smoke-only evidence is partial and must not be recorded as a full manual pass.",
      "Record concrete host versions, app paths, command results, memory/CPU numbers, and observed HUD behavior in notes.",
      "After recording evidence, rerun npm run release:summary and npm run release:gaps."
    ],
    sections,
    commands: [
      `npm run validation:template -- -- --target ${target}`,
      `npm run validation:next -- -- --target ${target}`,
      "npm run release:evidence -- -- --list",
      "npm run release:summary"
    ]
  };
}

function getNextActions(target) {
  const result = spawnSync(process.execPath, ["scripts/validation-next.mjs", "--target", target, "--json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "validation-next failed.");
  }
  return JSON.parse(result.stdout);
}

function parseManualValidation() {
  const text = fs.readFileSync(path.join(root, "docs", "manual-validation.md"), "utf8");
  const sections = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = { title: heading[1], items: [] };
      sections.push(current);
      continue;
    }
    const item = line.match(/^-\s+(.+?)\s*$/);
    if (item && current) current.items.push(item[1]);
  }
  return sections;
}

function groupByTarget(actions) {
  const groups = new Map();
  for (const action of actions) {
    if (!groups.has(action.target)) groups.set(action.target, []);
    groups.get(action.target).push(action);
  }
  return [...groups.entries()].sort((left, right) => sortTarget(left[0]) - sortTarget(right[0]));
}

function checklistForTarget(manual, target) {
  if (target === "browser") return sectionItems(manual, "Browser Extension");
  if (target === "ide") return sectionItems(manual, "IDE Adapter");
  if (target === "macos") {
    return [
      ...sectionItems(manual, "macOS"),
      ...sectionItems(manual, "Cute But Quiet Visual QA").filter((item) => /macOS|HUD|desktop|permission|CPU|Memory|memory|idle|Reduced-motion|reduced/i.test(item))
    ];
  }
  if (target === "signing") {
    return [
      "Windows artifacts are Authenticode signed before public distribution.",
      "macOS artifacts are Developer ID signed and notarized before public distribution.",
      "Signing credentials stay in the release environment and are not copied into evidence notes."
    ];
  }
  if (target === "audit") {
    return [
      "Run dependency audit with network access.",
      "Record zero high-severity vulnerabilities or mark blocked with the advisory ids."
    ];
  }
  return [];
}

function sectionItems(manual, title) {
  return manual.find((section) => section.title === title)?.items || [];
}

function requiredNotesForAction(action) {
  const byKey = {
    "browserAdapter.hostSmoke": [
      "Chrome/Edge versions or exact policy skip reason.",
      "Temporary profile path or confirmation that the real browser profile was not touched.",
      "Whether the extension id was visible in the host."
    ],
    "browserAdapter.manualLoad": [
      "Chrome version and extension id.",
      "Edge version and extension id.",
      "Confirmation that non-matching websites did not inject the content script."
    ],
    "browserAdapter.manualConnection": [
      "Local token source was used without pasting the token into notes.",
      "Options /health result in Chrome.",
      "Options /health result in Edge."
    ],
    "ideAdapter.hostSmoke": [
      "VS Code version and install/list command result.",
      "Cursor version and install/list command result.",
      "Use host-smoke-only status unless the manual status-bar path was also checked."
    ],
    "ideAdapter.manualLoad": [
      "VS Code Extension Development Host or VSIX install result.",
      "Cursor VSIX or extension-folder load result.",
      "Adapter id visible in both hosts."
    ],
    "ideAdapter.manualConnection": [
      "Status bar /health display in VS Code.",
      "Status bar /health display in Cursor.",
      "Refresh and copy snapshot commands work without reading source files."
    ],
    "macosPackagedRuntime.smoke": [
      "macOS version, CPU architecture, and app path.",
      "Smoke command result and /snapshot health.",
      "Any permission prompt state observed."
    ],
    "macosPackagedRuntime.soak": [
      "Soak duration.",
      "Max RSS, memory growth, and max CPU.",
      "Local API shutdown after app exit."
    ],
    "macosPackagedRuntime.hudPermissionStates": [
      "HUD behavior with Accessibility and Screen Recording granted.",
      "HUD behavior when one or both permissions are denied.",
      "Confirmation the app does not crash or show stale placement."
    ],
    "signing.windowsAuthenticode": [
      "Signed Windows artifact names.",
      "Certificate subject or signing identity.",
      "Verification command result."
    ],
    "signing.macosNotarization": [
      "Signed/notarized macOS artifact names.",
      "Developer ID identity or notary result id.",
      "Verification command result."
    ],
    "dependencyAudit": [
      "Audit command result.",
      "High-severity vulnerability count.",
      "Advisory ids if blocked."
    ]
  };
  return byKey[action.key] || [
    "Host/tool version.",
    "Command result.",
    "Observed user-facing behavior."
  ];
}

function printMarkdown(template) {
  console.log("# Who Eats Token Validation Evidence Template");
  console.log("");
  console.log(`Release candidate: ${template.releaseCandidate}`);
  console.log(`Target: ${template.target}`);
  console.log(`Open actions: ${template.openActionCount}`);
  console.log("");
  console.log("Rules:");
  for (const rule of template.rules) console.log(`- ${rule}`);

  if (template.sections.length === 0) {
    console.log("");
    console.log("No remaining validation actions for this target.");
    return;
  }

  for (const section of template.sections) {
    console.log("");
    console.log(`## ${section.title}`);
    if (section.checklist.length) {
      console.log("");
      console.log("Checklist:");
      for (const item of section.checklist) console.log(`- [ ] ${item}`);
    }
    for (const action of section.actions) {
      console.log("");
      console.log(`### ${action.key}`);
      console.log(`Status: ${action.status}`);
      console.log(`Run/check: \`${action.runOrCheck}\``);
      console.log("");
      console.log("Required notes:");
      for (const note of action.requiredNotes) console.log(`- ${note}`);
      console.log("");
      console.log("Record when done:");
      console.log(`\`${action.recordCommand}\``);
    }
  }
}

function titleForTarget(target) {
  return {
    browser: "Browser Adapter",
    ide: "IDE Adapter",
    macos: "macOS Runtime",
    signing: "Signing And Notarization",
    audit: "Dependency Audit"
  }[target] || target;
}

function sortTarget(target) {
  return {
    browser: 10,
    ide: 20,
    macos: 30,
    signing: 40,
    audit: 50
  }[target] || 99;
}

function parseArgs(argv) {
  const parsed = {
    target: "all",
    json: argv.includes("--json")
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--target") {
      parsed.target = normalizeTarget(argv[index + 1]);
      index += 1;
    } else if (value.startsWith("--target=")) {
      parsed.target = normalizeTarget(value.slice("--target=".length));
    }
  }
  return parsed;
}

function normalizeTarget(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["browser", "ide", "macos", "signing", "audit", "all"].includes(text)) return text;
  if (["mac", "darwin", "osx"].includes(text)) return "macos";
  return "all";
}
