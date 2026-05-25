import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const lockPath = path.resolve(root, args.lockfile || "package-lock.json");
const report = checkLicenses(lockPath);

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report);
}

if (!report.ok) process.exitCode = 1;

function checkLicenses(targetLockPath) {
  const lock = JSON.parse(fs.readFileSync(targetLockPath, "utf8"));
  const packages = Object.entries(lock.packages || {})
    .filter(([key]) => key.startsWith("node_modules/"))
    .map(([key, value]) => packageRecord(key, value));
  const findings = [];
  const reviewed = [];
  const licenseCounts = {};

  for (const entry of packages) {
    const license = String(entry.license || "").trim();
    const licenseKey = license || "(missing)";
    licenseCounts[licenseKey] = (licenseCounts[licenseKey] || 0) + 1;

    if (!license) {
      findings.push(finding("missing-license", "warning", entry, "Package is missing license metadata in package-lock.json."));
      continue;
    }
    if (isForbiddenLicense(license)) {
      findings.push(finding("forbidden-license", "critical", entry, `Forbidden or high-risk license detected: ${license}`));
      continue;
    }
    const review = reviewedLicense(entry.name, license);
    if (review) {
      reviewed.push({
        package: entry.name,
        version: entry.version,
        license,
        reason: review
      });
      continue;
    }
    if (!isAllowedLicenseExpression(license)) {
      findings.push(finding("unreviewed-license", "warning", entry, `License needs maintainer review: ${license}`));
    }
  }

  return {
    ok: findings.length === 0,
    lockfile: slash(path.relative(root, targetLockPath)) || "package-lock.json",
    packageCount: packages.length,
    licenseCounts: Object.fromEntries(Object.entries(licenseCounts).sort((left, right) => left[0].localeCompare(right[0]))),
    reviewed,
    findings
  };
}

function packageRecord(lockKey, value) {
  return {
    key: slash(lockKey),
    name: packageNameFromLockKey(lockKey),
    version: value.version || "",
    license: value.license || "",
    dev: value.dev === true
  };
}

function packageNameFromLockKey(lockKey) {
  const parts = slash(lockKey).split("/").slice(1);
  if (parts[0]?.startsWith("@")) return `${parts[0]}/${parts[1]}`;
  return parts[0] || lockKey;
}

function isForbiddenLicense(license) {
  const text = license.toUpperCase();
  return [
    "AGPL",
    "GPL-",
    "LGPL",
    "SSPL",
    "BUSL",
    "COMMONS CLAUSE",
    "NON-COMMERCIAL",
    "NONCOMMERCIAL",
    "POLYFORM"
  ].some((needle) => text.includes(needle));
}

function reviewedLicense(packageName, license) {
  if (packageName === "spdx-exceptions" && license === "CC-BY-3.0") {
    return "SPDX license metadata package; attribution-only data dependency.";
  }
  if (packageName === "@vscode/vsce-sign" || packageName.startsWith("@vscode/vsce-sign-")) {
    return "VS Code extension signing helper from @vscode/vsce; package-lock uses SEE LICENSE IN LICENSE.txt.";
  }
  return "";
}

function isAllowedLicenseExpression(license) {
  const tokens = license
    .replace(/[()]/g, " ")
    .split(/\s+(?:OR|AND)\s+|\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  return tokens.length > 0 && tokens.every((token) => allowedLicenses().has(token));
}

function allowedLicenses() {
  return new Set([
    "0BSD",
    "Apache-2.0",
    "Artistic-2.0",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "BlueOak-1.0.0",
    "CC0-1.0",
    "ISC",
    "MIT",
    "Python-2.0",
    "Unlicense",
    "WTFPL"
  ]);
}

function finding(id, severity, entry, message) {
  return {
    id,
    severity,
    package: entry.name,
    version: entry.version,
    lockKey: entry.key,
    license: entry.license || null,
    dev: entry.dev,
    message
  };
}

function printReport(report) {
  console.log("# License Check");
  console.log("");
  console.log(`Lockfile: ${report.lockfile}`);
  console.log(`Packages: ${report.packageCount}`);
  console.log(`Findings: ${report.findings.length}`);
  if (report.reviewed.length) {
    console.log(`Reviewed exceptions: ${report.reviewed.length}`);
  }
  for (const finding of report.findings) {
    console.log(`- [${finding.severity}] ${finding.package}@${finding.version} ${finding.license || "(missing)"}: ${finding.message}`);
  }
}

function parseArgs(argv) {
  const parsed = {
    json: argv.includes("--json"),
    lockfile: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--lockfile") {
      parsed.lockfile = argv[index + 1];
      index += 1;
    } else if (value.startsWith("--lockfile=")) {
      parsed.lockfile = value.slice("--lockfile=".length);
    }
  }
  return parsed;
}

function slash(value) {
  return value.replaceAll(path.sep, "/");
}
