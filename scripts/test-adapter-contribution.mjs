import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const requiredFiles = [
  "adapters/templates/provider-adapter/README.md",
  "adapters/templates/provider-adapter/catalog-entry.json",
  "docs/adapter-review.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/ISSUE_TEMPLATE/adapter_request.yml",
  "CONTRIBUTING.md"
];

for (const file of requiredFiles) {
  assert.ok(fs.existsSync(path.join(root, file)), `Missing adapter contribution file: ${file}`);
}

const templateReadme = read("adapters/templates/provider-adapter/README.md");
const templateCatalog = JSON.parse(read("adapters/templates/provider-adapter/catalog-entry.json"));
const reviewDoc = read("docs/adapter-review.md");
const contributing = read("CONTRIBUTING.md");
const prTemplate = read(".github/PULL_REQUEST_TEMPLATE.md");
const adapterIssue = read(".github/ISSUE_TEMPLATE/adapter_request.yml");
const adapterGuide = read("docs/adapter-guide.md");
const adapterCatalogDoc = read("docs/adapter-catalog.md");

assert.equal(templateCatalog.id, "example-provider", "Template catalog entry should keep the example-provider placeholder.");
assert.equal(templateCatalog.status, "reference", "Template catalog entry should default to reference, not supported.");
assert.ok(templateCatalog.docs.includes("docs/adapter-guide.md"), "Template catalog entry should link the adapter guide.");
assert.ok(Array.isArray(templateCatalog.providedSignals), "Template catalog entry should declare providedSignals.");
assert.ok(templateCatalog.providedSignals.includes("usage-events"), "Template should declare explicit usage event support.");
for (const term of ["prompts", "completions", "API keys", "cookies"]) {
  assertIncludes(templateCatalog.privacyBoundary, term, `Template privacy boundary should mention ${term}.`);
}

for (const text of [templateReadme, reviewDoc, contributing, prTemplate, adapterIssue]) {
  assertIncludes(text, "adapters/catalog.json", "Adapter contribution path must mention the catalog.");
}

for (const text of [templateReadme, reviewDoc, contributing, prTemplate]) {
  assertIncludes(text, "npm run test:adapter-catalog", "Adapter contribution path must mention test:adapter-catalog.");
  assertIncludes(text, "npm run adapter:review", "Adapter contribution path must mention adapter:review.");
  assertIncludes(text, "npm run adapter:fixture", "Adapter contribution path must mention adapter:fixture.");
  assertIncludes(text, "npm run release:check", "Adapter contribution path must mention release:check.");
}

for (const text of [templateReadme, reviewDoc, contributing, prTemplate, adapterIssue]) {
  assertNoSecretBoundary(text);
}

assertIncludes(adapterGuide, "adapters/templates/provider-adapter", "Adapter guide should point contributors to the template.");
assertIncludes(adapterGuide, "providedSignals", "Adapter guide should explain providedSignals.");
assertIncludes(adapterGuide, "docs/adapter-review.md", "Adapter guide should point reviewers to the checklist.");
assertIncludes(reviewDoc, "providedSignals", "Adapter review checklist should require providedSignals.");
assertIncludes(reviewDoc, "npm run adapter:review", "Adapter review checklist should mention the review command.");
assertIncludes(adapterCatalogDoc, "adapters/templates/provider-adapter", "Adapter catalog docs should point contributors to the template.");
assertIncludes(adapterCatalogDoc, "providedSignals", "Adapter catalog docs should document providedSignals.");
assertIncludes(adapterCatalogDoc, "docs/adapter-review.md", "Adapter catalog docs should point reviewers to the checklist.");

console.log("Adapter contribution checks passed.");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertIncludes(text, needle, message) {
  assert.ok(text.includes(needle), message || `Expected text to include ${needle}`);
}

function assertNoSecretBoundary(text) {
  for (const needle of ["prompt", "completion", "API key", "cookie"]) {
    assertIncludes(text, needle, `Expected adapter contribution text to mention ${needle}.`);
  }
}
