import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const platform = args.platform || currentPlatform();
const required = Boolean(args.require);
const outputJson = Boolean(args.json);
const reports = platformsFor(platform).map(buildReport);
const missingRequired = reports.flatMap((report) =>
  report.checks
    .filter((check) => check.required && check.status !== "present")
    .map((check) => `${report.platform}:${check.id}`)
);
const result = {
  ok: !required || missingRequired.length === 0,
  mode: required ? "required" : "advisory",
  platform,
  missingRequired,
  reports
};

if (outputJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printMarkdown(result);
}

if (!result.ok) process.exitCode = 1;

function buildReport(targetPlatform) {
  const checks = targetPlatform === "windows"
    ? windowsChecks()
    : macosChecks();
  return {
    platform: targetPlatform,
    ready: checks.every((check) => !check.required || check.status === "present"),
    checks
  };
}

function windowsChecks() {
  const builder = read("electron-builder.yml");
  const packageJson = JSON.parse(read("package.json"));
  return [
    oneOf("authenticode-cert", "Authenticode certificate", ["WIN_CSC_LINK", "CSC_LINK"], "Set WIN_CSC_LINK or CSC_LINK to a certificate file/base64/secret URL."),
    oneOf("authenticode-password", "Authenticode certificate password", ["WIN_CSC_KEY_PASSWORD", "CSC_KEY_PASSWORD"], "Set WIN_CSC_KEY_PASSWORD or CSC_KEY_PASSWORD in release secrets."),
    contains("windows-targets", "Windows NSIS/ZIP targets", builder, ["target: nsis", "target: zip"], "electron-builder.yml must keep signed installer and ZIP targets."),
    script("dist-win-script", "Windows distributable build script", packageJson, "dist:win", "package.json must keep dist:win.")
  ];
}

function macosChecks() {
  const builder = read("electron-builder.yml");
  const packageJson = JSON.parse(read("package.json"));
  return [
    macSigningStrategy(),
    macNotaryAuth(),
    contains("hardened-runtime", "macOS hardened runtime", builder, ["hardenedRuntime: true"], "electron-builder.yml must keep hardened runtime enabled."),
    contains("mac-targets", "macOS DMG/ZIP targets", builder, ["target: dmg", "target: zip"], "electron-builder.yml must keep DMG and ZIP targets."),
    script("dist-mac-script", "macOS distributable build script", packageJson, "dist:mac", "package.json must keep dist:mac.")
  ];
}

function oneOf(id, label, envNames, hint) {
  const present = envNames.some((name) => hasEnv(name));
  return {
    id,
    label,
    required: true,
    status: present ? "present" : "missing",
    evidence: envNames.map((name) => `${name}=${hasEnv(name) ? "present" : "missing"}`),
    hint
  };
}

function macSigningStrategy() {
  const configPath = process.env.WHO_EATS_TOKEN_MAC_SIGNING_CONFIG || "";
  const configExists = configPath ? fs.existsSync(path.resolve(configPath)) : false;
  const postBuildSigning = process.env.WHO_EATS_TOKEN_MAC_POST_BUILD_SIGNING === "1";
  const certPair = (hasEnv("MAC_CSC_LINK") && hasEnv("MAC_CSC_KEY_PASSWORD")) ||
    (hasEnv("CSC_LINK") && hasEnv("CSC_KEY_PASSWORD"));
  const identityName = hasEnv("CSC_NAME");
  const present = configExists || postBuildSigning || certPair || identityName;
  return {
    id: "mac-signing-strategy",
    label: "Developer ID signing strategy",
    required: true,
    status: present ? "present" : "missing",
    evidence: [
      `WHO_EATS_TOKEN_MAC_SIGNING_CONFIG=${configExists ? "present" : "missing"}`,
      `WHO_EATS_TOKEN_MAC_POST_BUILD_SIGNING=${postBuildSigning ? "present" : "missing"}`,
      `MAC_CSC_LINK+MAC_CSC_KEY_PASSWORD=${hasEnv("MAC_CSC_LINK") && hasEnv("MAC_CSC_KEY_PASSWORD") ? "present" : "missing"}`,
      `CSC_LINK+CSC_KEY_PASSWORD=${hasEnv("CSC_LINK") && hasEnv("CSC_KEY_PASSWORD") ? "present" : "missing"}`,
      `CSC_NAME=${identityName ? "present" : "missing"}`
    ],
    hint: "Provide a Developer ID cert through electron-builder env vars, a signing override config, or an explicit post-build signing path."
  };
}

function macNotaryAuth() {
  const apiKey = hasEnv("APPLE_API_KEY") && hasEnv("APPLE_API_KEY_ID") && hasEnv("APPLE_API_ISSUER");
  const appleId = hasEnv("APPLE_ID") && hasEnv("APPLE_APP_SPECIFIC_PASSWORD") && hasEnv("APPLE_TEAM_ID");
  return {
    id: "mac-notary-auth",
    label: "Apple notarization credentials",
    required: true,
    status: apiKey || appleId ? "present" : "missing",
    evidence: [
      `APPLE_API_KEY+APPLE_API_KEY_ID+APPLE_API_ISSUER=${apiKey ? "present" : "missing"}`,
      `APPLE_ID+APPLE_APP_SPECIFIC_PASSWORD+APPLE_TEAM_ID=${appleId ? "present" : "missing"}`
    ],
    hint: "Use App Store Connect API key credentials or Apple ID app-specific password credentials for notarization."
  };
}

function contains(id, label, text, needles, hint) {
  const present = needles.every((needle) => text.includes(needle));
  return {
    id,
    label,
    required: true,
    status: present ? "present" : "missing",
    evidence: needles.map((needle) => `${needle}=${text.includes(needle) ? "present" : "missing"}`),
    hint
  };
}

function script(id, label, packageJson, scriptName, hint) {
  return {
    id,
    label,
    required: true,
    status: packageJson.scripts?.[scriptName] ? "present" : "missing",
    evidence: [`scripts.${scriptName}=${packageJson.scripts?.[scriptName] ? "present" : "missing"}`],
    hint
  };
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--json") {
      parsed.json = true;
      continue;
    }
    if (value === "--require") {
      parsed.require = true;
      continue;
    }
    if (value === "--platform") {
      parsed.platform = normalizePlatform(argv[index + 1]);
      index += 1;
      continue;
    }
    if (value.startsWith("--platform=")) parsed.platform = normalizePlatform(value.slice("--platform=".length));
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

function platformsFor(value) {
  if (value === "all") return ["windows", "macos"];
  return [value];
}

function currentPlatform() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "macos";
  return "all";
}

function hasEnv(name) {
  return String(process.env[name] || "").trim().length > 0;
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function printMarkdown(payload) {
  console.log("# Who Eats Token Signing Readiness");
  console.log("");
  console.log(`Mode: ${payload.mode}`);
  console.log(`Platform: ${payload.platform}`);
  console.log(`Host: ${os.type()} ${os.release()} ${os.arch()}`);
  console.log("");

  for (const report of payload.reports) {
    console.log(`## ${report.platform}`);
    console.log(`Ready: ${report.ready ? "yes" : "no"}`);
    for (const check of report.checks) {
      const marker = check.status === "present" ? "x" : " ";
      console.log(`- [${marker}] ${check.label}`);
      if (check.status !== "present") console.log(`  Hint: ${check.hint}`);
    }
    console.log("");
  }

  if (payload.missingRequired.length > 0) {
    console.log(`Missing required checks: ${payload.missingRequired.join(", ")}`);
  }
}
