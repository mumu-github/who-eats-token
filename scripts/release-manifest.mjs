import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const args = parseArgs(process.argv.slice(2));
const releaseDir = path.resolve(root, args.releaseDir || "release");
const manifestPath = path.join(releaseDir, "release-manifest.json");
const sumsPath = path.join(releaseDir, "SHA256SUMS.txt");

const manifest = buildManifest();

if (args.requireArtifacts && manifest.artifacts.length === 0) {
  console.error(`No release artifacts found under ${releaseDir}.`);
  process.exit(1);
}

if (args.check) {
  checkExistingManifest(manifest);
} else {
  fs.mkdirSync(releaseDir, { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(sumsPath, formatSha256Sums(manifest));
}

if (args.json) {
  console.log(JSON.stringify({
    ok: true,
    releaseDir,
    manifestPath,
    sumsPath,
    artifactCount: manifest.artifacts.length,
    artifacts: manifest.artifacts
  }, null, 2));
} else {
  console.log(`${args.check ? "Verified" : "Wrote"} release manifest with ${manifest.artifacts.length} artifact(s).`);
}

function buildManifest() {
  const artifacts = listCandidateFiles(releaseDir)
    .map((absolutePath) => {
      const relativePath = relativeToRelease(absolutePath);
      const stat = fs.statSync(absolutePath);
      return {
        path: relativePath,
        type: inferType(relativePath),
        platform: inferPlatform(relativePath),
        sizeBytes: stat.size,
        sha256: sha256File(absolutePath)
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));

  return {
    schemaVersion: 1,
    package: {
      name: packageJson.name,
      version: packageJson.version
    },
    generatedAt: new Date().toISOString(),
    artifacts
  };
}

function listCandidateFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  walk(dir, files);
  return files.filter(isReleaseArtifact);
}

function walk(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDirectory(absolutePath)) continue;
      walk(absolutePath, files);
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
}

function shouldSkipDirectory(absolutePath) {
  const relativePath = normalizePath(relativeToRelease(absolutePath));
  return relativePath === "win-unpacked" ||
    relativePath === "mac" ||
    relativePath.endsWith(".app") ||
    relativePath.includes("/Who Eats Token.app/");
}

function isReleaseArtifact(absolutePath) {
  const relativePath = normalizePath(relativeToRelease(absolutePath));
  if (relativePath === "release-manifest.json" || relativePath === "SHA256SUMS.txt") return false;
  if (/^builder-(debug|effective-config)\.ya?ml$/i.test(relativePath)) return false;
  if (relativePath.startsWith("adapters/")) return /\.(zip|vsix)$/i.test(relativePath);
  if (relativePath.includes("/")) return false;
  return /\.(exe|msi|zip|dmg|pkg|blockmap|yml|yaml)$/i.test(relativePath);
}

function checkExistingManifest(currentManifest) {
  assert.ok(fs.existsSync(manifestPath), `Missing release manifest: ${manifestPath}`);
  assert.ok(fs.existsSync(sumsPath), `Missing SHA256 sums file: ${sumsPath}`);

  const recordedManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const comparableRecorded = comparableManifest(recordedManifest);
  const comparableCurrent = comparableManifest(currentManifest);
  assert.deepEqual(comparableRecorded, comparableCurrent, "release-manifest.json is stale or does not match current artifacts.");

  const recordedSums = fs.readFileSync(sumsPath, "utf8");
  assert.equal(recordedSums, formatSha256Sums(currentManifest), "SHA256SUMS.txt is stale or does not match current artifacts.");
}

function comparableManifest(manifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    package: manifest.package,
    artifacts: [...(manifest.artifacts || [])]
      .map((artifact) => ({
        path: artifact.path,
        type: artifact.type,
        platform: artifact.platform,
        sizeBytes: artifact.sizeBytes,
        sha256: artifact.sha256
      }))
      .sort((left, right) => left.path.localeCompare(right.path))
  };
}

function formatSha256Sums(manifest) {
  return manifest.artifacts
    .map((artifact) => `${artifact.sha256}  ${artifact.path}`)
    .join("\n") + (manifest.artifacts.length ? "\n" : "");
}

function sha256File(absolutePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(absolutePath));
  return hash.digest("hex");
}

function inferType(relativePath) {
  const normalized = normalizePath(relativePath);
  if (normalized.startsWith("adapters/") && normalized.endsWith(".vsix")) return "vscode-extension";
  if (normalized.startsWith("adapters/") && normalized.endsWith(".zip")) return "browser-extension";
  if (/\.(exe|msi)$/i.test(normalized)) return "windows-installer";
  if (/\.(dmg|pkg)$/i.test(normalized)) return "macos-installer";
  if (/\.zip$/i.test(normalized)) return "desktop-archive";
  if (/\.blockmap$/i.test(normalized)) return "updater-blockmap";
  if (/\.ya?ml$/i.test(normalized)) return "updater-metadata";
  return "artifact";
}

function inferPlatform(relativePath) {
  const normalized = normalizePath(relativePath).toLowerCase();
  if (normalized.startsWith("adapters/")) return "cross-platform";
  if (/win|windows|\.exe$|\.msi$/.test(normalized)) return "windows";
  if (/mac|darwin|\.dmg$|\.pkg$/.test(normalized)) return "macos";
  return "unknown";
}

function relativeToRelease(absolutePath) {
  return path.relative(releaseDir, absolutePath).replaceAll("\\", "/");
}

function normalizePath(value) {
  return String(value || "").replaceAll("\\", "/");
}

function parseArgs(argv) {
  const parsed = {
    check: argv.includes("--check"),
    json: argv.includes("--json"),
    requireArtifacts: argv.includes("--require-artifacts"),
    releaseDir: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--release-dir") {
      parsed.releaseDir = argv[index + 1];
      index += 1;
    } else if (value.startsWith("--release-dir=")) {
      parsed.releaseDir = value.slice("--release-dir=".length);
    }
  }
  return parsed;
}
