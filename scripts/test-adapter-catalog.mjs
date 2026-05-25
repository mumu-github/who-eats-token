import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "adapters", "catalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const allowedTypes = new Set([
  "native-collector",
  "local-gateway",
  "browser-extension",
  "ide-extension",
  "sdk-wrapper",
  "cli-importer",
  "mcp-server",
  "agent-workflow",
  "planned-provider"
]);
const allowedStatuses = new Set(["supported", "reference", "planned"]);
const allowedPlatforms = new Set(["windows", "macos"]);
const allowedSignals = new Set([
  "usage-tokens",
  "usage-events",
  "quota-capacity",
  "quota-token-plan",
  "context-window",
  "hud-overlays",
  "local-health",
  "snapshot-read",
  "provider-health",
  "status-display",
  "setup-workflow",
  "adapter-authoring"
]);
const requiredSignalCoverage = new Set([
  "usage-tokens",
  "usage-events",
  "quota-capacity",
  "quota-token-plan",
  "hud-overlays",
  "local-health",
  "snapshot-read",
  "provider-health",
  "setup-workflow"
]);

assert.equal(catalog.schemaVersion, 1, "Adapter catalog schemaVersion must be 1.");
assert.match(catalog.updated, /^\d{4}-\d{2}-\d{2}$/, "Adapter catalog updated date must be YYYY-MM-DD.");
assert.ok(Array.isArray(catalog.adapters), "Adapter catalog must contain adapters array.");
assert.ok(catalog.adapters.length >= 8, "Adapter catalog should cover current integration surfaces.");

const ids = new Set();
const coveredSignals = new Set();
const requiredIds = new Set([
  "codex-local-collector",
  "hermes-local-collector",
  "hermes-bridge",
  "browser-extension",
  "vscode-extension",
  "node-sdk",
  "external-summary-import",
  "mcp-server",
  "agent-workflows",
  "provider-specific-adapters"
]);

for (const adapter of catalog.adapters) {
  assert.match(adapter.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${adapter.id} must use kebab-case id.`);
  assert.equal(ids.has(adapter.id), false, `Duplicate adapter id: ${adapter.id}`);
  ids.add(adapter.id);

  assert.ok(adapter.name?.length >= 4, `${adapter.id} needs a name.`);
  assert.ok(allowedTypes.has(adapter.type), `${adapter.id} has unknown type ${adapter.type}.`);
  assert.ok(allowedStatuses.has(adapter.status), `${adapter.id} has unknown status ${adapter.status}.`);
  assertNonEmptyArray(adapter.platforms, `${adapter.id} platforms`);
  assertNonEmptyArray(adapter.providedSignals, `${adapter.id} providedSignals`);
  for (const platform of adapter.platforms) {
    assert.ok(allowedPlatforms.has(platform), `${adapter.id} has unknown platform ${platform}.`);
  }
  for (const signal of adapter.providedSignals) {
    assert.ok(allowedSignals.has(signal), `${adapter.id} has unknown provided signal ${signal}.`);
    coveredSignals.add(signal);
  }

  assertMinText(adapter.scope, 40, `${adapter.id} scope`);
  assertMinText(adapter.privacyBoundary, 60, `${adapter.id} privacyBoundary`);
  assertMinText(adapter.performanceBoundary, 40, `${adapter.id} performanceBoundary`);
  assertMinText(adapter.disablePath, 8, `${adapter.id} disablePath`);
  assertNonEmptyArray(adapter.docs, `${adapter.id} docs`);
  assertNonEmptyArray(adapter.manualChecks, `${adapter.id} manualChecks`);
  assertPrivacyBoundary(adapter);
  assertSignalContract(adapter);

  for (const doc of adapter.docs) {
    assertPathExists(doc, `${adapter.id} doc`);
  }

  if (adapter.status === "planned") {
    assert.equal(adapter.entrypoints.length, 0, `${adapter.id} planned adapter should not pretend to have implementation entrypoints.`);
    continue;
  }

  assertNonEmptyArray(adapter.entrypoints, `${adapter.id} entrypoints`);
  assertNonEmptyArray(adapter.automatedChecks, `${adapter.id} automatedChecks`);
  for (const entrypoint of adapter.entrypoints) {
    assertPathExists(entrypoint, `${adapter.id} entrypoint`);
  }
  for (const scriptName of adapter.automatedChecks) {
    assert.ok(packageJson.scripts?.[scriptName], `${adapter.id} references missing npm script ${scriptName}.`);
  }
}

for (const requiredId of requiredIds) {
  assert.ok(ids.has(requiredId), `Adapter catalog missing ${requiredId}.`);
}

for (const signal of requiredSignalCoverage) {
  assert.ok(coveredSignals.has(signal), `Adapter catalog lacks coverage for signal: ${signal}.`);
}

const supported = catalog.adapters.filter((adapter) => adapter.status === "supported");
assert.ok(supported.length >= 3, "Catalog should mark core runtime integrations as supported.");
assert.ok(catalog.adapters.some((adapter) => adapter.type === "browser-extension"), "Catalog must include browser extension surface.");
assert.ok(catalog.adapters.some((adapter) => adapter.type === "ide-extension"), "Catalog must include IDE extension surface.");
assert.ok(catalog.adapters.some((adapter) => adapter.type === "cli-importer"), "Catalog must include CLI import surface.");
assert.ok(catalog.adapters.some((adapter) => adapter.type === "mcp-server"), "Catalog must include MCP surface.");
assert.ok(catalog.adapters.some((adapter) => adapter.type === "agent-workflow"), "Catalog must include skills/plugin surface.");

console.log("Adapter catalog checks passed.");

function assertNonEmptyArray(value, label) {
  assert.ok(Array.isArray(value), `${label} must be an array.`);
  assert.ok(value.length > 0, `${label} must not be empty.`);
}

function assertMinText(value, minLength, label) {
  assert.equal(typeof value, "string", `${label} must be a string.`);
  assert.ok(value.length >= minLength, `${label} is too short.`);
}

function assertPathExists(relativePath, label) {
  assert.equal(path.isAbsolute(relativePath), false, `${label} must be repo-relative: ${relativePath}`);
  assert.ok(fs.existsSync(path.join(root, relativePath)), `${label} missing: ${relativePath}`);
}

function assertPrivacyBoundary(adapter) {
  const text = adapter.privacyBoundary.toLowerCase();
  for (const term of ["prompt", "completion", "api key", "cookie"]) {
    assert.ok(text.includes(term), `${adapter.id} privacyBoundary should explicitly mention ${term}.`);
  }
}

function assertSignalContract(adapter) {
  const signals = new Set(adapter.providedSignals);
  if (adapter.type === "browser-extension") {
    assert.ok(signals.has("hud-overlays"), `${adapter.id} browser extension must declare hud-overlays.`);
    assert.ok(signals.has("local-health"), `${adapter.id} browser extension must use local-health for connection checks.`);
  }
  if (adapter.type === "ide-extension") {
    assert.ok(signals.has("local-health"), `${adapter.id} IDE extension must declare local-health.`);
    assert.ok(signals.has("status-display"), `${adapter.id} IDE extension must declare status-display.`);
  }
  if (adapter.type === "local-gateway" || adapter.type === "sdk-wrapper") {
    assert.ok(
      signals.has("usage-tokens") || signals.has("usage-events"),
      `${adapter.id} ${adapter.type} must declare usage reporting.`
    );
  }
  if (adapter.status === "supported") {
    assert.ok(
      signals.has("usage-tokens") || signals.has("quota-capacity") || signals.has("quota-token-plan"),
      `${adapter.id} supported adapter must provide a runtime usage or quota signal.`
    );
  }
}
