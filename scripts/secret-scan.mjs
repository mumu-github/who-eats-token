import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const scanRoot = path.resolve(root, args.path || ".");
const findings = scanTree(scanRoot);
const report = {
  ok: findings.length === 0,
  scannedRoot: path.relative(root, scanRoot) || ".",
  findingCount: findings.length,
  findings
};

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report);
}

if (findings.length > 0) process.exitCode = 1;

function scanTree(startDir) {
  const results = [];
  for (const filePath of listFiles(startDir)) {
    const relativePath = slash(path.relative(root, filePath));
    const text = readTextFile(filePath);
    if (text === null) continue;
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      for (const detector of detectors()) {
        if (!detector.test(line, relativePath)) continue;
        results.push({
          file: relativePath,
          line: index + 1,
          id: detector.id,
          severity: detector.severity,
          message: detector.message
        });
      }
    }
  }
  return results;
}

function* listFiles(startDir) {
  const stack = [startDir];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      const relativePath = slash(path.relative(root, absolutePath));
      if (entry.isDirectory()) {
        if (shouldSkipDirectory(entry.name, relativePath)) continue;
        stack.push(absolutePath);
      } else if (entry.isFile() && shouldScanFile(entry.name, relativePath)) {
        yield absolutePath;
      }
    }
  }
}

function detectors() {
  const serviceTokenName = ["api-platform", "serviceToken"].join("_");
  const slhName = ["api-platform", "slh"].join("_");
  const phName = ["api-platform", "ph"].join("_");
  const cookiePreferences = ["cookie", "preferences"].join("-");
  return [
    {
      id: "private-key",
      severity: "critical",
      message: "Private key material must never be committed.",
      test: (line) => /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/.test(line)
    },
    {
      id: "xiaomi-platform-cookie",
      severity: "critical",
      message: "Xiaomi platform cookies are login credentials; keep them outside the repo.",
      test: (line) => {
        if (!line.includes(serviceTokenName) && !line.includes(cookiePreferences)) return false;
        return line.length > 160 && hasLongQuotedOrBase64Value(line);
      }
    },
    {
      id: "xiaomi-platform-token-parts",
      severity: "critical",
      message: "Xiaomi platform token parts are login credentials; keep them outside the repo.",
      test: (line) => {
        if (!line.includes(slhName) && !line.includes(phName)) return false;
        return hasAssignmentValue(line, 20);
      }
    },
    {
      id: "openai-secret-key",
      severity: "critical",
      message: "OpenAI-style secret key detected.",
      test: (line) => /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/.test(line)
    },
    {
      id: "anthropic-secret-key",
      severity: "critical",
      message: "Anthropic-style secret key detected.",
      test: (line) => /\bsk-ant-[A-Za-z0-9_-]{24,}\b/.test(line)
    },
    {
      id: "github-token",
      severity: "critical",
      message: "GitHub token detected.",
      test: (line) => /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{30,}\b/.test(line)
    },
    {
      id: "bearer-token",
      severity: "warning",
      message: "Bearer token detected; use local ignored config or masked placeholders.",
      test: (line) => /\bBearer\s+[A-Za-z0-9._~+/=-]{32,}\b/.test(line) && !isPlaceholderLine(line)
    },
    {
      id: "local-api-token",
      severity: "warning",
      message: "Local API token value detected; do not commit api-token.txt contents.",
      test: (line) => hasNamedSecretValue(line, ["WHO_EATS_TOKEN_API_TOKEN", "whoEatsToken.token", "api-token"], 24)
    },
    {
      id: "xiaomi-env-secret",
      severity: "warning",
      message: "Xiaomi API key or platform cookie value detected; keep it in ignored local config.",
      test: (line) => hasNamedSecretValue(line, ["XIAOMI_API_KEY", "XIAOMI_PLATFORM_COOKIE"], 16)
    },
    {
      id: "generic-api-key",
      severity: "warning",
      message: "Potential API key assignment detected.",
      test: (line, relativePath) => {
        if (relativePath === "scripts/secret-scan.mjs") return false;
        if (!/\b(?:api[_-]?key|secret[_-]?key|access[_-]?token)\b/i.test(line)) return false;
        return hasAssignmentValue(line, 24);
      }
    }
  ];
}

function hasNamedSecretValue(line, names, minLength) {
  if (!names.some((name) => line.includes(name))) return false;
  return hasAssignmentValue(line, minLength) && !isPlaceholderLine(line);
}

function hasAssignmentValue(line, minLength) {
  const assignment = line.match(/[:=]\s*["']?([^"',\s#;]+)["']?/);
  if (!assignment) return false;
  const value = assignment[1].trim();
  if (value.startsWith("process.env.")) return false;
  if (!/^[A-Za-z0-9+/=._~-]+$/.test(value)) return false;
  return value.length >= minLength && !isPlaceholderValue(value);
}

function hasLongQuotedOrBase64Value(line) {
  const quoted = line.match(/["']([A-Za-z0-9+/=._~-]{40,})["']/);
  if (quoted && !isPlaceholderValue(quoted[1])) return true;
  return /[A-Za-z0-9+/=._~-]{80,}/.test(line) && !isPlaceholderLine(line);
}

function isPlaceholderLine(line) {
  return /(?:REDACTED|redacted|example|placeholder|\.\.\.|你的|<[^>]+>|\$\{[^}]+})/.test(line);
}

function isPlaceholderValue(value) {
  return value === "" ||
    value === "..." ||
    value.toLowerCase() === "redacted" ||
    value.toLowerCase().includes("example") ||
    value.toLowerCase().includes("placeholder") ||
    value.includes("你的") ||
    /^__.+__$/.test(value) ||
    /^<.+>$/.test(value) ||
    /^\$\{.+}$/.test(value);
}

function shouldSkipDirectory(name, relativePath) {
  return new Set([
    ".git",
    "node_modules",
    "release",
    "dist",
    "artifacts",
    "coverage",
    ".next",
    ".cache"
  ]).has(name) || relativePath.endsWith(".app");
}

function shouldScanFile(name, relativePath) {
  if (relativePath === "") return false;
  if (name.endsWith(".png") || name.endsWith(".ico") || name.endsWith(".icns")) return false;
  if (name.endsWith(".exe") || name.endsWith(".dmg") || name.endsWith(".msi")) return false;
  if (name.endsWith(".zip") || name.endsWith(".vsix")) return false;
  return true;
}

function readTextFile(filePath) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return null;
  }
  if (stat.size > 1024 * 1024) return null;
  const buffer = fs.readFileSync(filePath);
  if (buffer.includes(0)) return null;
  return buffer.toString("utf8");
}

function printReport(report) {
  console.log("# Secret Scan");
  console.log("");
  console.log(`Root: ${report.scannedRoot}`);
  console.log(`Findings: ${report.findingCount}`);
  for (const finding of report.findings) {
    console.log(`- [${finding.severity}] ${finding.file}:${finding.line} ${finding.id}: ${finding.message}`);
  }
}

function parseArgs(argv) {
  const parsed = {
    json: argv.includes("--json"),
    path: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--path") {
      parsed.path = argv[index + 1];
      index += 1;
    } else if (value.startsWith("--path=")) {
      parsed.path = value.slice("--path=".length);
    }
  }
  return parsed;
}

function slash(value) {
  return value.replaceAll(path.sep, "/");
}
