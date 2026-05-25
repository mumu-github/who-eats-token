import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = path.join(root, "adapters", "vscode-extension");
const releaseAdapterDir = path.join(root, "release", "adapters");
const extensionId = "who-eats-token.who-eats-token-vscode-adapter";
const args = parseArgs(process.argv.slice(2));
const hosts = selectHosts(args.ide);
const vsixPath = findLatestVsix();
const results = [];

if (!fs.existsSync(path.join(extensionDir, "package.json"))) {
  console.error("Missing VS Code adapter manifest.");
  process.exit(1);
}

for (const host of hosts) {
  const executable = findExecutable(host.candidates);
  if (!executable) {
    results.push({
      name: host.name,
      ok: false,
      skipped: "host-not-found",
      requiredFailure: true,
      candidateCount: host.candidates.length
    });
    continue;
  }

  if (!vsixPath) {
    results.push({
      name: host.name,
      ok: false,
      executable,
      error: "Missing packaged VSIX under release/adapters. Run npm run package:vscode-extension first."
    });
    continue;
  }

  results.push(smokeHost({
    ...host,
    executable,
    vsixPath
  }));
}

const report = {
  ok: args.require
    ? results.every((result) => result.ok || result.requiredFailure === false)
    : results.every((result) => result.ok || result.skipped),
  checkedAt: new Date().toISOString(),
  vsix: vsixPath ? relative(vsixPath) : null,
  results
};

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report);
}

if (args.require && results.some((result) => !result.ok && result.requiredFailure !== false)) {
  process.exitCode = 1;
}

function smokeHost({ name, executable, vsixPath }) {
  const dataRoot = path.join(os.tmpdir(), `who-eats-token-${slug(name)}-ide-${process.pid}-${Date.now()}`);
  const userDataDir = path.join(dataRoot, "user-data");
  const extensionsDir = path.join(dataRoot, "extensions");
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(extensionsDir, { recursive: true });

  try {
    const install = runHost(executable, [
      "--user-data-dir", userDataDir,
      "--extensions-dir", extensionsDir,
      "--install-extension", vsixPath,
      "--force"
    ]);
    assert.equal(install.status, 0, `${name} failed to install VSIX: ${install.stderr || install.stdout}`);

    const listed = runHost(executable, [
      "--user-data-dir", userDataDir,
      "--extensions-dir", extensionsDir,
      "--list-extensions"
    ]);
    assert.equal(listed.status, 0, `${name} failed to list extensions: ${listed.stderr || listed.stdout}`);
    assert.ok(
      listed.stdout.split(/\r?\n/).map((line) => line.trim()).includes(extensionId),
      `${name} did not report ${extensionId} after VSIX install.`
    );

    return {
      name,
      ok: true,
      executable,
      extensionInstalled: true,
      listedExtension: extensionId,
      stdoutTail: tail(listed.stdout)
    };
  } catch (error) {
    return {
      name,
      ok: false,
      executable,
      error: error.message,
      dataRoot: args.keepData ? dataRoot : undefined
    };
  } finally {
    cleanupDir(dataRoot);
  }
}

function runHost(executable, commandArgs) {
  const isCmdShim = process.platform === "win32" && /\.(cmd|bat)$/i.test(executable);
  const result = spawnSync(
    isCmdShim ? (process.env.ComSpec || "cmd.exe") : executable,
    isCmdShim ? ["/d", "/c", quoteCmdCommand(["call", executable, ...commandArgs])] : commandArgs,
    {
    cwd: root,
    encoding: "utf8",
    timeout: args.timeoutMs,
    windowsHide: true,
    windowsVerbatimArguments: isCmdShim,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
    }
  );

  return {
    status: result.status,
    error: result.error?.message || "",
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

function quoteCmdCommand(parts) {
  return parts.map(quoteCmdArg).join(" ");
}

function quoteCmdArg(value) {
  const text = String(value);
  if (!/[ \t&()^|<>"]/u.test(text)) return text;
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function findLatestVsix() {
  if (!fs.existsSync(releaseAdapterDir)) return null;
  const files = fs.readdirSync(releaseAdapterDir)
    .filter((name) => /^who-eats-token-vscode-adapter-.+\.vsix$/.test(name))
    .map((name) => path.join(releaseAdapterDir, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  return files[0] || null;
}

function cleanupDir(dir) {
  if (args.keepData) return;
  try {
    const resolved = fs.realpathSync.native(dir);
    const tempRoot = fs.realpathSync.native(os.tmpdir());
    if (!resolved.toLowerCase().startsWith(tempRoot.toLowerCase())) return;
    fs.rmSync(resolved, { recursive: true, force: true });
  } catch {}
}

function selectHosts(ide) {
  const all = [
    { name: "VS Code", id: "vscode", candidates: ideCandidates("vscode") },
    { name: "Cursor", id: "cursor", candidates: ideCandidates("cursor") }
  ];
  if (ide === "all") return all;
  return all.filter((host) => host.id === ide);
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
        path.join(programFiles, "Microsoft VS Code", "bin", "code.cmd"),
        path.join(programFilesX86, "Microsoft VS Code", "bin", "code.cmd"),
        path.join(localAppData, "Programs", "Microsoft VS Code", "Code.exe"),
        path.join(programFiles, "Microsoft VS Code", "Code.exe"),
        path.join(programFilesX86, "Microsoft VS Code", "Code.exe")
      ];
    }
    return [
      ...pathCandidates,
      path.join(localAppData, "Programs", "Cursor", "resources", "app", "bin", "cursor.cmd"),
      path.join(programFiles, "Cursor", "resources", "app", "bin", "cursor.cmd"),
      path.join(programFilesX86, "Cursor", "resources", "app", "bin", "cursor.cmd"),
      path.join(localAppData, "Programs", "Cursor", "Cursor.exe"),
      path.join(programFiles, "Cursor", "Cursor.exe"),
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

function findExecutable(candidates) {
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function printReport(report) {
  console.log("# IDE Host Smoke");
  console.log("");
  console.log(`VSIX: ${report.vsix || "missing"}`);
  for (const result of report.results) {
    if (result.ok) {
      console.log(`- OK ${result.name}: ${result.listedExtension} installed via ${result.executable}`);
    } else if (result.skipped) {
      console.log(`- SKIP ${result.name}: ${result.skipped}`);
    } else {
      console.log(`- FAIL ${result.name}: ${result.error}`);
    }
  }
}

function parseArgs(argv) {
  const parsed = {
    ide: "all",
    json: argv.includes("--json"),
    keepData: argv.includes("--keep-data"),
    require: argv.includes("--require"),
    timeoutMs: 60_000
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--ide") {
      parsed.ide = normalizeIde(argv[index + 1]);
      index += 1;
    } else if (value.startsWith("--ide=")) {
      parsed.ide = normalizeIde(value.slice("--ide=".length));
    } else if (value === "--timeout-ms") {
      parsed.timeoutMs = normalizeTimeout(argv[index + 1]);
      index += 1;
    } else if (value.startsWith("--timeout-ms=")) {
      parsed.timeoutMs = normalizeTimeout(value.slice("--timeout-ms=".length));
    }
  }
  return parsed;
}

function normalizeIde(value) {
  const text = String(value || "").toLowerCase();
  if (["vscode", "cursor", "all"].includes(text)) return text;
  return "all";
}

function normalizeTimeout(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(300_000, Math.max(5_000, Math.round(number))) : 60_000;
}

function relative(absolutePath) {
  return path.relative(root, absolutePath).replaceAll("\\", "/");
}

function slug(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "-");
}

function tail(value) {
  return String(value || "").trim().slice(-1000);
}
