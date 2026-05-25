import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createZipArchive, listFilesRecursive } from "./lib/zip.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = path.join(root, "adapters", "browser-extension");
const manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, "manifest.json"), "utf8"));
const outputDir = path.join(root, "release", "adapters");
const outputPath = path.join(outputDir, `who-eats-token-browser-extension-${manifest.version}.zip`);
const ignored = new Set([".DS_Store", "node_modules", "dist", "release"]);
const entries = listFilesRecursive(extensionDir, ignored);

for (const required of ["manifest.json", "service-worker.js", "content-script.js", "options.html", "options.js", "README.md"]) {
  if (!entries.includes(required)) {
    throw new Error(`Missing browser extension package entry: ${required}`);
  }
}

const result = createZipArchive({
  rootDir: extensionDir,
  entries,
  outputPath
});

console.log(JSON.stringify({
  ok: true,
  type: "browser-extension",
  outputPath: result.outputPath,
  entryCount: result.entryCount,
  bytes: result.bytes
}, null, 2));
