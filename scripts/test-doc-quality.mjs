import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const keyDocs = [
  "README.md",
  "docs/getting-started.md",
  "docs/agent-getting-started.md",
  "docs/open-source-form-strategy.md",
  "docs/open-source-landscape.md",
  "docs/compatibility-matrix.md",
  "docs/token-tracker-lessons.md",
  "docs/delight-contract.md",
  "docs/release-readiness.md",
  "docs/first-contribution.md",
  "docs/performance-budget.md",
  "docs/license-policy.md",
  "docs/risk-register.md",
  "docs/release.md",
  "docs/manual-validation.md",
  "docs/adapter-guide.md",
  "docs/adapter-contribution-checklist.md",
  "docs/adapter-signal-matrix.md",
  "docs/adapter-fixture.md",
  "docs/browser-extension.md",
  "docs/ide-extension.md",
  "docs/protocol.md",
  "docs/status.md",
  "docs/stability.md",
  "docs/diagnostics.md",
  "docs/support-bundle.md"
];

const forbiddenPatterns = [
  {
    label: "replacement character",
    pattern: /\uFFFD/
  },
  {
    label: "mojibake product title",
    pattern: /\u748b\u4f78\u6e6a\u935a/
  },
  {
    label: "latin-1 mojibake",
    pattern: /(?:Ã|Â|â€|â€™|â€œ|â€�)/
  }
];

for (const relativePath of keyDocs) {
  const text = read(relativePath);
  assert.equal(Buffer.from(text, "utf8").toString("utf8"), text, `${relativePath} must be readable as UTF-8.`);
  for (const { label, pattern } of forbiddenPatterns) {
    assert.equal(pattern.test(text), false, `${relativePath} contains ${label}.`);
  }
}

const readme = read("README.md");
assertIncludes(readme, "# 谁在吃 token");
assertIncludes(readme, "Windows 10+");
assertIncludes(readme, "macOS");
assertIncludes(readme, "docs/compatibility-matrix.md");
assertIncludes(readme, "docs/adapter-fixture.md");
assertIncludes(readme, "npm run release:check");
assertIncludes(readme, "npm run release:check -- -- --list");
assertIncludes(readme, "npm run release:summary");
assertIncludes(readme, "npm run performance:summary");
assertIncludes(readme, "npm run lag:triage");
assertIncludes(readme, "docs/support-bundle.md");
assertIncludes(readme, "npm run support:bundle");
assertIncludes(readme, "docs/delight-contract.md");
assertIncludes(readme, "docs/getting-started.md");
assertIncludes(readme, "docs/agent-getting-started.md");
assertIncludes(readme, "docs/first-contribution.md");
assertIncludes(readme, "docs/adapter-contribution-checklist.md");
assertIncludes(readme, "npm run compatibility:matrix");
assertIncludes(readme, "npm run soak:packaged-win");
assertIncludes(readme, "npm run secret:scan");
assertIncludes(readme, "npm run release:evidence-report -- -- --check");
assertIncludes(readme, "npm run release:evidence-quality");
assertIncludes(readme, "docs/license-policy.md");
assertIncludes(readme, "npm run test:adapter-contract");
assertIncludes(readme, "npm run adapter:review");
assertIncludes(readme, "npm run adapter:fixture");

const strategy = read("docs/open-source-form-strategy.md");
assertIncludes(strategy, "分层开源");
assertIncludes(strategy, "Core Desktop App");
assertIncludes(strategy, "Integration Adapters");
assertIncludes(strategy, "Agent Skills / Codex Plugin");

const compatibilityMatrix = read("docs/compatibility-matrix.md");
assertIncludes(compatibilityMatrix, "Compatibility Matrix");
assertIncludes(compatibilityMatrix, "Platform Targets");
assertIncludes(compatibilityMatrix, "Adapter Compatibility");
assertIncludes(compatibilityMatrix, "Signal Coverage");

const lessons = read("docs/token-tracker-lessons.md");
assertIncludes(lessons, "TokenTracker");
assertIncludes(lessons, "ambient token companion");
assertIncludes(lessons, "No animation may require a new polling loop");
assertIncludes(lessons, "delight-contract.md");

const gettingStarted = read("docs/getting-started.md");
assertIncludes(gettingStarted, "第一次使用");
assertIncludes(gettingStarted, "displayMode");
assertIncludes(gettingStarted, "remainingStandardPercent");
assertIncludes(gettingStarted, "npm run status");
assertIncludes(gettingStarted, "不会用 GIF");

const agentGettingStarted = read("docs/agent-getting-started.md");
assertIncludes(agentGettingStarted, "Agent 接入指南");
assertIncludes(agentGettingStarted, "不要读取");
assertIncludes(agentGettingStarted, "/health");
assertIncludes(agentGettingStarted, "/snapshot");
assertIncludes(agentGettingStarted, "/events");
assertIncludes(agentGettingStarted, "displayMode");

const delightContract = read("docs/delight-contract.md");
assertIncludes(delightContract, "Delight Contract");
assertIncludes(delightContract, "npm run delight:contract");
assertIncludes(delightContract, "Low-quota alert begins below `20%`");
assertIncludes(delightContract, "100 KB");

const readiness = read("docs/release-readiness.md");
assertIncludes(readiness, "all of them");
assertIncludes(readiness, "Desktop app owns realtime HUD");
assertIncludes(readiness, "Low memory/stability");
assertIncludes(readiness, "Lag triage");
assertIncludes(readiness, "Support bundle");
assertIncludes(readiness, "Delight contract");
assertIncludes(readiness, "Compatibility matrix");
assertIncludes(readiness, "validation:next");
assertIncludes(readiness, "validation:template");
assertIncludes(readiness, "release:summary");
assertIncludes(readiness, "Release check profiling");
assertIncludes(readiness, "Performance summary");
assertIncludes(readiness, "release:evidence-report");
assertIncludes(readiness, "Release evidence quality");
assertIncludes(readiness, "Adapter privacy/performance guard");
assertIncludes(readiness, "test:adapter-contract");
assertIncludes(readiness, "test:adapter-review");
assertIncludes(readiness, "test:secret-scan");
assertIncludes(readiness, "License compliance");

const performance = read("docs/performance-budget.md");
assertIncludes(performance, "adapter:guard");
assertIncludes(performance, "usage payload allowlists");
assertIncludes(performance, "performance:summary");
assertIncludes(performance, "lag triage");
assertIncludes(performance, "delight contract");
assertIncludes(performance, "One-shot Performance Summary");

const risks = read("docs/risk-register.md");
assertIncludes(risks, "HUD appears in the wrong app");
assertIncludes(risks, "Xiaomi Token Plan cookie");
assertIncludes(risks, "Extra polling or DOM scanning");

const stability = read("docs/stability.md");
assertIncludes(stability, "one-shot diagnostic");
assertIncludes(stability, "npm run stability");
assertIncludes(stability, "npm run lag:triage");
assertIncludes(stability, "npm run support:bundle");
assertIncludes(stability, "does not poll");

const diagnostics = read("docs/diagnostics.md");
assertIncludes(diagnostics, "redacted bundle");
assertIncludes(diagnostics, "npm run diagnostics -- -- --json");
assertIncludes(diagnostics, "npm run lag:triage");
assertIncludes(diagnostics, "npm run support:bundle");
assertIncludes(diagnostics, "does not poll");

const supportBundle = read("docs/support-bundle.md");
assertIncludes(supportBundle, "Support Bundle");
assertIncludes(supportBundle, "npm run support:bundle");
assertIncludes(supportBundle, "release:summary");
assertIncludes(supportBundle, "compatibility:matrix");
assertIncludes(supportBundle, "performance:summary");
assertIncludes(supportBundle, "delight:contract");
assertIncludes(supportBundle, "lag:triage");
assertIncludes(supportBundle, "diagnostics");
assertIncludes(supportBundle, "does not launch Electron");
assertIncludes(supportBundle, "does not poll");

const security = read("SECURITY.md");
assertIncludes(security, "npm run secret:scan");

const licensePolicy = read("docs/license-policy.md");
assertIncludes(licensePolicy, "npm run license:check");
assertIncludes(licensePolicy, "Blocked By Default");

const signalMatrix = read("docs/adapter-signal-matrix.md");
assertIncludes(signalMatrix, "Adapter Signal Matrix");
assertIncludes(signalMatrix, "Generated from `adapters/catalog.json`");
assertIncludes(signalMatrix, "HUD Avoidance");

const adapterGuide = read("docs/adapter-guide.md");
assertIncludes(adapterGuide, "adapter:fixture");
assertIncludes(adapterGuide, "test:adapter-fixture");
assertIncludes(adapterGuide, "adapter-contribution-checklist.md");

const adapterChecklist = read("docs/adapter-contribution-checklist.md");
assertIncludes(adapterChecklist, "providedSignals");
assertIncludes(adapterChecklist, "privacyBoundary");
assertIncludes(adapterChecklist, "performanceBoundary");
assertIncludes(adapterChecklist, "disablePath");
assertIncludes(adapterChecklist, "npm run adapter:review -- -- --id");
assertIncludes(adapterChecklist, "npm run adapter:fixture -- -- --json");

const firstContribution = read("docs/first-contribution.md");
assertIncludes(firstContribution, "Starter Paths");
assertIncludes(firstContribution, "What Needs Special Access");
assertIncludes(firstContribution, "npm run check");
assertIncludes(firstContribution, "npm run adapter:fixture -- -- --json");

const adapterFixture = read("docs/adapter-fixture.md");
assertIncludes(adapterFixture, "Adapter Fixture");
assertIncludes(adapterFixture, "npm run adapter:fixture");
assertIncludes(adapterFixture, "isolated local ingest server");
assertIncludes(adapterFixture, "prompt text");
assertIncludes(adapterFixture, "Xiaomi platform cookie");
assertIncludes(adapterFixture, "test:adapter-fixture");

const releaseDoc = read("docs/release.md");
assertIncludes(releaseDoc, "per-command timeout");
assertIncludes(releaseDoc, "release:check -- -- --list --json");

console.log("Documentation quality checks passed.");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertIncludes(text, needle) {
  assert.ok(text.includes(needle), `Expected text to include ${needle}.`);
}
