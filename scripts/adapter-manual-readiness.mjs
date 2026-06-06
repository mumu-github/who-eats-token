import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const packageJson = readJson("package.json");
const browserManifest = readJson("adapters/browser-extension/manifest.json");
const vscodeManifest = readJson("adapters/vscode-extension/package.json");
const report = {
  ok: true,
  platform: process.platform,
  checkedAt: new Date().toISOString(),
  browser: checkBrowserAdapter(),
  ide: checkIdeAdapter(),
  commands: buildManualCommands()
};

const requiredFailures = [];
if (args.requireInstalled) {
  for (const candidate of [...report.browser.hosts, ...report.ide.hosts]) {
    if (!candidate.found) requiredFailures.push(candidate.name);
  }
  if (!report.browser.artifact.exists) requiredFailures.push("browser-extension-artifact");
  if (!report.ide.artifact.exists) requiredFailures.push("vscode-vsix-artifact");
}

report.ok = requiredFailures.length === 0;
report.requiredFailures = requiredFailures;

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report);
}

if (!report.ok) process.exitCode = 1;

function checkBrowserAdapter() {
  const sourceFiles = [
    "adapters/browser-extension/manifest.json",
    "adapters/browser-extension/service-worker.js",
    "adapters/browser-extension/content-script.js",
    "adapters/browser-extension/options.html",
    "adapters/browser-extension/options.js"
  ].map(fileStatus);

  const hostPermissions = browserManifest.host_permissions || [];
  const contentMatches = browserManifest.content_scripts?.flatMap((entry) => entry.matches || []) || [];
  const artifacts = findFiles("release/adapters", /^who-eats-token-browser-extension-.+\.zip$/);
  const artifact = {
    exists: artifacts.length > 0,
    files: artifacts.map((file) => relative(file))
  };

  return {
    sourceFiles,
    artifact,
    manifest: {
      manifestVersion: browserManifest.manifest_version,
      serviceWorker: browserManifest.background?.service_worker || null,
      optionsPage: browserManifest.options_page || null,
      hasAllUrls: hostPermissions.includes("<all_urls>") || contentMatches.includes("<all_urls>"),
      localHostPermissions: hostPermissions.filter((entry) => /127\.0\.0\.1|localhost/.test(entry)),
      contentMatches
    },
    hosts: detectBrowserHosts()
  };
}

function checkIdeAdapter() {
  const sourceFiles = [
    "adapters/vscode-extension/package.json",
    "adapters/vscode-extension/extension.js",
    "adapters/vscode-extension/README.md"
  ].map(fileStatus);
  const artifacts = findFiles("release/adapters", /^who-eats-token-vscode-adapter-.+\.vsix$/);

  return {
    sourceFiles,
    artifact: {
      exists: artifacts.length > 0,
      files: artifacts.map((file) => relative(file))
    },
    manifest: {
      name: vscodeManifest.name,
      engine: vscodeManifest.engines?.vscode || null,
      activationEvents: vscodeManifest.activationEvents || [],
      commands: vscodeManifest.contributes?.commands?.map((command) => command.command) || []
    },
    hosts: detectIdeHosts()
  };
}

function detectBrowserHosts() {
  return [
    detectHost("Chrome", browserCandidates("chrome")),
    detectHost("Edge", browserCandidates("edge"))
  ];
}

function detectIdeHosts() {
  return [
    detectHost("VS Code", ideCandidates("vscode")),
    detectHost("Cursor", ideCandidates("cursor"))
  ];
}

function browserCandidates(name) {
  const home = os.homedir();
  const pathCandidates = executablePathCandidates(name === "chrome" ? ["chrome.exe", "chrome"] : ["msedge.exe", "microsoft-edge"]);
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    if (name === "chrome") {
      return [
        ...pathCandidates,
        path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe")
      ];
    }
    return [
      ...pathCandidates,
      path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe")
    ];
  }

  if (process.platform === "darwin") {
    if (name === "chrome") return [...pathCandidates, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
    return [...pathCandidates, "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"];
  }

  return name === "chrome"
    ? [...pathCandidates, "/usr/bin/google-chrome", "/usr/bin/chromium"]
    : [...pathCandidates, "/usr/bin/microsoft-edge"];
}

function ideCandidates(name) {
  const home = os.homedir();
  const pathCandidates = executablePathCandidates(name === "vscode" ? ["code.cmd", "code.exe", "code"] : ["cursor.cmd", "cursor.exe", "cursor"]);
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    if (name === "vscode") {
      return [
        ...pathCandidates,
        path.join(localAppData, "Programs", "Microsoft VS Code", "bin", "code.cmd"),
        path.join(localAppData, "Programs", "Microsoft VS Code", "Code.exe"),
        path.join(programFiles, "Microsoft VS Code", "bin", "code.cmd"),
        path.join(programFiles, "Microsoft VS Code", "Code.exe"),
        path.join(programFilesX86, "Microsoft VS Code", "bin", "code.cmd"),
        path.join(programFilesX86, "Microsoft VS Code", "Code.exe")
      ];
    }
    return [
      ...pathCandidates,
      path.join(localAppData, "Programs", "Cursor", "resources", "app", "bin", "cursor.cmd"),
      path.join(localAppData, "Programs", "Cursor", "Cursor.exe"),
      path.join(programFiles, "Cursor", "resources", "app", "bin", "cursor.cmd"),
      path.join(programFiles, "Cursor", "Cursor.exe"),
      path.join(programFilesX86, "Cursor", "resources", "app", "bin", "cursor.cmd"),
      path.join(programFilesX86, "Cursor", "Cursor.exe")
    ];
  }

  if (process.platform === "darwin") {
    if (name === "vscode") return [...pathCandidates, "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"];
    return [...pathCandidates, "/Applications/Cursor.app/Contents/Resources/app/bin/cursor"];
  }

  return name === "vscode" ? [...pathCandidates, "/usr/bin/code"] : [...pathCandidates, "/usr/bin/cursor"];
}

function executablePathCandidates(names) {
  const pathValue = process.env.PATH || process.env.Path || "";
  return pathValue
    .split(path.delimiter)
    .filter(Boolean)
    .flatMap((entry) => names.map((name) => path.join(entry, name)));
}

function detectHost(name, candidates) {
  const foundPath = candidates.find((candidate) => fs.existsSync(candidate)) || null;
  const payload = {
    name,
    found: Boolean(foundPath),
    path: foundPath,
    candidateCount: candidates.length
  };
  if (args.verbose) payload.candidates = candidates;
  return payload;
}

function buildManualCommands() {
  return {
    packageAdapters: "npm run package:adapters",
    browserReadiness: "npm run adapter:manual-readiness -- -- --json",
    browserManual: [
      "Open chrome://extensions and edge://extensions.",
      "Enable Developer mode.",
      "Load adapters/browser-extension unpacked.",
      "Open extension Options and test /health with the local token."
    ],
    ideManual: [
      "Run npm run package:vscode-extension.",
      "Run npm run smoke:ide-hosts -- -- --require on a host validation machine.",
      "Install release/adapters/who-eats-token-vscode-adapter-*.vsix in VS Code.",
      "Install the same VSIX or extension folder in Cursor.",
      "Confirm status bar /health, Refresh, and Copy Snapshot."
    ]
  };
}

function fileStatus(relativePath) {
  const absolutePath = path.join(root, relativePath);
  return {
    path: relativePath,
    exists: fs.existsSync(absolutePath),
    bytes: fs.existsSync(absolutePath) ? fs.statSync(absolutePath).size : 0
  };
}

function findFiles(relativeDir, pattern) {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];
  return fs.readdirSync(absoluteDir)
    .filter((name) => pattern.test(name))
    .map((name) => path.join(absoluteDir, name));
}

function printReport(payload) {
  console.log("# Adapter Manual Readiness");
  console.log("");
  console.log(`Platform: ${payload.platform}`);
  console.log(`Browser artifact: ${payload.browser.artifact.exists ? "yes" : "no"}`);
  console.log(`IDE artifact: ${payload.ide.artifact.exists ? "yes" : "no"}`);
  console.log("");

  console.log("## Browser Hosts");
  for (const host of payload.browser.hosts) {
    console.log(`- ${host.name}: ${host.found ? host.path : "not found"}`);
  }
  console.log("");

  console.log("## IDE Hosts");
  for (const host of payload.ide.hosts) {
    console.log(`- ${host.name}: ${host.found ? host.path : "not found"}`);
  }
  console.log("");

  if (payload.requiredFailures.length > 0) {
    console.log(`Missing required items: ${payload.requiredFailures.join(", ")}`);
  }
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function relative(absolutePath) {
  return path.relative(root, absolutePath).replaceAll("\\", "/");
}

function parseArgs(argv) {
  return {
    json: argv.includes("--json"),
    verbose: argv.includes("--verbose"),
    requireInstalled: argv.includes("--require-installed")
  };
}
