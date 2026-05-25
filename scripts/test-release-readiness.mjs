import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(read("package.json"));
const releaseCheck = read("scripts/release-check.mjs");
const ci = read(".github/workflows/ci.yml");
const releaseWorkflow = read(".github/workflows/release-artifacts.yml");
const catalog = JSON.parse(read("adapters/catalog.json"));
const readiness = read("docs/release-readiness.md");
const manualValidation = read("docs/manual-validation.md");
const releaseDoc = read("docs/release.md");
const strategy = read("docs/open-source-form-strategy.md");
const landscape = read("docs/open-source-landscape.md");
const tokenTrackerLessons = read("docs/token-tracker-lessons.md");
const protocol = read("docs/protocol.md");
const adapterGuide = read("docs/adapter-guide.md");
const riskRegister = read("docs/risk-register.md");
const quotaDelight = read("src/protocol/quota-delight.cjs");
const readme = read("README.md");
const prTemplate = read(".github/PULL_REQUEST_TEMPLATE.md");
const bugTemplate = read(".github/ISSUE_TEMPLATE/bug_report.yml");
const performanceTemplate = read(".github/ISSUE_TEMPLATE/performance_report.yml");

const requiredScripts = [
  "release:check",
  "check",
  "test:protocol",
  "test:browser-extension",
  "test:browser-extension-runtime",
  "test:browser-host-smoke",
  "test:ide-host-smoke",
  "test:node-sdk",
  "test:local-health",
  "test:provider-health",
  "test:quota-delight",
  "test:delight-contract",
  "test:external-summary-import",
  "test:status",
  "test:stability",
  "test:diagnostics",
  "test:lag-triage",
  "test:support-bundle",
  "test:secret-scan",
  "test:license-check",
  "test:docs",
  "test:release-evidence",
  "test:release-evidence-cli",
  "test:release-evidence-quality",
  "test:release-evidence-report",
  "test:validation-next",
  "test:validation-template",
  "test:release-gaps",
  "test:release-summary",
  "test:release-check",
  "test:release-manifest",
  "test:release-validation-pack",
  "test:manual-preflight",
  "test:signing-readiness",
  "test:performance-budget",
  "test:performance-summary",
  "test:soak-script",
  "test:hud-stability",
  "test:window-detection",
  "test:adapter-catalog",
  "test:adapter-contract",
  "test:adapter-review",
  "test:adapter-fixture",
  "test:adapter-guard",
  "test:adapter-contribution",
  "test:adapter-signal-matrix",
  "test:adapter-manual-readiness",
  "test:compatibility-matrix",
  "test:packaging",
  "test:adapter-packages",
  "test:skills",
  "test:plugin",
  "test:vscode-extension",
  "test:vscode-extension-runtime",
  "test:mcp",
  "test:hermes-bridge",
  "test:release-readiness",
  "package:dir",
  "status",
  "stability",
  "diagnostics",
  "lag:triage",
  "support:bundle",
  "delight:contract",
  "secret:scan",
  "license:check",
  "manual:preflight",
  "adapter:manual-readiness",
  "adapter:review",
  "adapter:fixture",
  "adapter:signal-matrix",
  "compatibility:matrix",
  "adapter:guard",
  "signing:readiness",
  "performance:summary",
  "release:evidence",
  "release:evidence-report",
  "release:evidence-quality",
  "release:validation-pack",
  "validation:next",
  "validation:template",
  "release:gaps",
  "release:summary",
  "release:manifest",
  "verify:release-manifest",
  "import:usage-report",
  "smoke:packaged-win",
  "smoke:packaged-mac",
  "smoke:browser-hosts",
  "smoke:ide-hosts",
  "soak:packaged-win",
  "soak:packaged-mac",
  "package:adapters",
  "verify:adapter-artifacts",
  "dist:win",
  "dist:mac"
];

for (const script of requiredScripts) {
  assert.ok(packageJson.scripts?.[script], `Missing package script: ${script}`);
}

for (const script of requiredScripts.filter((script) => script.startsWith("test:"))) {
  assertIncludes(releaseCheck, script, `release-check must run ${script}.`);
}
assertIncludes(releaseCheck, "finished in", "release-check must print per-command timings.");
assertIncludes(releaseCheck, "Slow release-check commands", "release-check must summarize slow commands.");
assertIncludes(releaseCheck, "commandTimeoutMs", "release-check must expose a per-command timeout.");
assertIncludes(releaseCheck, "who-eats-token.release-check-list.v1", "release-check must expose a machine-readable command list.");

const requiredFiles = [
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "PRIVACY.md",
  "CONTRIBUTING.md",
  "electron-builder.yml",
  "docs/open-source-form-strategy.md",
  "docs/open-source-landscape.md",
  "docs/compatibility-matrix.md",
  "docs/token-tracker-lessons.md",
  "docs/delight-contract.md",
  "docs/compatibility.md",
  "docs/protocol.md",
  "docs/adapter-guide.md",
  "docs/adapter-catalog.md",
  "docs/adapter-signal-matrix.md",
  "docs/adapter-fixture.md",
  "docs/adapter-review.md",
  "docs/performance-budget.md",
  "docs/release.md",
  "docs/release-readiness.md",
  "docs/release-evidence.md",
  "docs/release-evidence.json",
  "docs/release-evidence.schema.json",
  "docs/risk-register.md",
  "docs/license-policy.md",
  "docs/manual-validation.md",
  "docs/stability.md",
  "docs/diagnostics.md",
  "docs/support-bundle.md",
  "scripts/manual-preflight.mjs",
  "scripts/signing-readiness.mjs",
  "scripts/performance-summary.mjs",
  "scripts/delight-contract.mjs",
  "scripts/adapter-manual-readiness.mjs",
  "scripts/adapter-review.mjs",
  "scripts/adapter-fixture.mjs",
  "scripts/adapter-signal-matrix.mjs",
  "scripts/compatibility-matrix.mjs",
  "scripts/adapter-guard.mjs",
  "scripts/test-adapter-contract.mjs",
  "scripts/test-adapter-review.mjs",
  "scripts/test-adapter-fixture.mjs",
  "scripts/stability.mjs",
  "scripts/test-stability.mjs",
  "scripts/diagnostics.mjs",
  "scripts/test-diagnostics.mjs",
  "scripts/lag-triage.mjs",
  "scripts/test-lag-triage.mjs",
  "scripts/support-bundle.mjs",
  "scripts/test-support-bundle.mjs",
  "scripts/test-delight-contract.mjs",
  "scripts/secret-scan.mjs",
  "scripts/test-secret-scan.mjs",
  "scripts/license-check.mjs",
  "scripts/test-license-check.mjs",
  "scripts/test-performance-summary.mjs",
  "src/diagnostics/stability-report.cjs",
  "src/diagnostics/diagnostics-bundle.cjs",
  "scripts/test-doc-quality.mjs",
  "scripts/release-evidence.mjs",
  "scripts/test-release-evidence.mjs",
  "scripts/test-release-evidence-cli.mjs",
  "scripts/release-evidence-quality.mjs",
  "scripts/test-release-evidence-quality.mjs",
  "scripts/release-evidence-report.mjs",
  "scripts/test-release-evidence-report.mjs",
  "scripts/validation-next.mjs",
  "scripts/test-validation-next.mjs",
  "scripts/validation-template.mjs",
  "scripts/test-validation-template.mjs",
  "scripts/release-gap-audit.mjs",
  "scripts/release-summary.mjs",
  "scripts/test-release-summary.mjs",
  "scripts/test-release-check.mjs",
  "scripts/release-manifest.mjs",
  "scripts/test-release-manifest.mjs",
  "scripts/release-validation-pack.mjs",
  "scripts/test-release-validation-pack.mjs",
  "scripts/test-adapter-signal-matrix.mjs",
  "scripts/test-compatibility-matrix.mjs",
  "scripts/smoke-browser-hosts.mjs",
  "scripts/smoke-ide-hosts.mjs",
  "scripts/lib/packaged-soak.mjs",
  "docs/status.md",
  "docs/stability.md",
  "docs/mcp-server.md",
  "docs/node-sdk.md",
  "docs/browser-extension.md",
  "docs/ide-extension.md",
  "docs/skills.md",
  "docs/plugin.md",
  "adapters/catalog.json",
  "adapters/templates/provider-adapter/README.md",
  "plugins/who-eats-token/.codex-plugin/plugin.json"
];

for (const file of requiredFiles) {
  assert.ok(fs.existsSync(path.join(root, file)), `Missing readiness evidence file: ${file}`);
}

assertCrossPlatformEvidence();
assertMultiToolEvidence();
assertLowMemoryEvidence();
assertPrivacyEvidence();
assertOpenSourceFormEvidence();
assertPackagingEvidence();

console.log("Release readiness checks passed.");

function assertCrossPlatformEvidence() {
  assertIncludes(ci, "windows-2025", "CI must include Windows.");
  assertIncludes(ci, "macos-latest", "CI must include macOS.");
  assertIncludes(releaseWorkflow, "windows-2025", "Release artifacts must include Windows.");
  assertIncludes(releaseWorkflow, "macos-latest", "Release artifacts must include macOS.");
  assertIncludes(manualValidation, "## Windows 10+", "Manual validation must cover Windows 10+.");
  assertIncludes(manualValidation, "## macOS", "Manual validation must cover macOS.");
  assertIncludes(read("scripts/manual-preflight.mjs"), "manual-validation.md", "Manual preflight must read the manual validation checklist.");
  assertIncludes(read("scripts/signing-readiness.mjs"), "Authenticode", "Signing readiness must cover Windows Authenticode.");
  assertIncludes(read("scripts/signing-readiness.mjs"), "notarization", "Signing readiness must cover macOS notarization.");
  assertIncludes(read("scripts/test-manual-preflight.mjs"), "Windows 10+", "Manual preflight test must cover Windows.");
  assertIncludes(read("scripts/test-manual-preflight.mjs"), "macOS", "Manual preflight test must cover macOS.");
  assertIncludes(manualValidation, "Accessibility", "macOS validation must cover Accessibility permission behavior.");
  assertIncludes(manualValidation, "Screen Recording", "macOS validation must cover Screen Recording permission behavior.");
  assertIncludes(manualValidation, "Cute But Quiet Visual QA", "Manual validation must cover cute-but-quiet visual QA.");
  assertIncludes(manualValidation, "Reduced-motion mode", "Visual QA must cover reduced-motion behavior.");
  assertIncludes(manualValidation, "does not fall back to Hermes", "Visual QA must guard Codex-vs-Hermes provider routing.");
  assertIncludes(manualValidation, "does not repeat noisy alerts", "Visual QA must guard alert transition behavior.");
  assertIncludes(readiness, "Windows 10+ desktop runtime", "Readiness matrix must cover Windows runtime.");
  assertIncludes(readiness, "macOS desktop runtime", "Readiness matrix must cover macOS runtime.");
  assertIncludes(readiness, "Visual delight behavior", "Readiness matrix must cover visual delight behavior.");
}

function assertMultiToolEvidence() {
  const types = new Set(catalog.adapters.map((adapter) => adapter.type));
  for (const type of ["native-collector", "local-gateway", "browser-extension", "ide-extension", "sdk-wrapper", "cli-importer", "mcp-server", "agent-workflow", "planned-provider"]) {
    assert.ok(types.has(type), `Adapter catalog missing ${type}.`);
  }
  assert.ok(catalog.adapters.some((adapter) => adapter.status === "supported"), "Catalog must include supported adapters.");
  assert.ok(catalog.adapters.some((adapter) => adapter.status === "reference"), "Catalog must include reference adapters.");
  assert.ok(catalog.adapters.some((adapter) => adapter.status === "planned"), "Catalog must include planned adapters.");
  assertIncludes(adapterGuide, "adapters/catalog.json", "Adapter guide must point to catalog.");
  assertIncludes(read("scripts/adapter-manual-readiness.mjs"), "Chrome", "Adapter manual readiness must check Chrome.");
  assertIncludes(read("scripts/adapter-manual-readiness.mjs"), "Cursor", "Adapter manual readiness must check Cursor.");
  assertIncludes(read("scripts/smoke-browser-hosts.mjs"), "--load-extension", "Browser host smoke must load the unpacked extension.");
  assertIncludes(read("scripts/smoke-ide-hosts.mjs"), "--install-extension", "IDE host smoke must install the packaged VSIX.");
  assertIncludes(read("scripts/adapter-guard.mjs"), "SAFE_USAGE_KEYS", "Adapter guard must enforce browser usage allowlists.");
  assertIncludes(read("scripts/adapter-guard.mjs"), "workspace.findFiles", "Adapter guard must protect IDE source-file boundaries.");
  assertIncludes(read("scripts/test-adapter-contract.mjs"), "codex", "Adapter contract test must cover Codex provider routing.");
  assertIncludes(read("scripts/test-adapter-contract.mjs"), "hermes", "Adapter contract test must cover Hermes provider routing.");
  assertIncludes(read("scripts/test-adapter-contract.mjs"), "chrome-extension://", "Adapter contract test must cover browser extension origin handling.");
  assertIncludes(read("scripts/adapter-review.mjs"), "providedSignals", "Adapter review command must inspect providedSignals.");
  assertIncludes(read("scripts/test-adapter-review.mjs"), "browser-extension", "Adapter review test must cover browser adapters.");
  assertIncludes(read("scripts/adapter-fixture.mjs"), "adapter-fixture-codex", "Adapter fixture must cover Codex-style events.");
  assertIncludes(read("scripts/adapter-fixture.mjs"), "adapter-fixture-browser", "Adapter fixture must cover browser-style events.");
  assertIncludes(read("scripts/adapter-fixture.mjs"), "adapter-fixture-ide", "Adapter fixture must cover IDE-style events.");
  assertIncludes(read("scripts/adapter-fixture.mjs"), "private prompt should not survive", "Adapter fixture must probe redaction.");
  assertIncludes(read("scripts/test-adapter-fixture.mjs"), "redactionOk", "Adapter fixture test must assert redaction.");
  assertIncludes(readiness, "Multi-tool adapter signal contract", "Readiness matrix must cover multi-tool adapter signal contract.");
  assertIncludes(readiness, "providedSignals", "Readiness matrix must mention adapter providedSignals.");
  assertIncludes(read("docs/adapter-catalog.md"), "providedSignals", "Adapter catalog docs must document signal contracts.");
  assertIncludes(read("docs/adapter-signal-matrix.md"), "Adapter Signal Matrix", "Adapter signal matrix doc must exist.");
  assertIncludes(read("docs/adapter-signal-matrix.md"), "Generated from `adapters/catalog.json`", "Adapter signal matrix must be generated from catalog.");
  assertIncludes(read("docs/adapter-fixture.md"), "safe compatibility simulator", "Adapter fixture doc must explain the simulator role.");
  assertIncludes(read("scripts/adapter-signal-matrix.mjs"), "--check", "Adapter signal matrix generator must support check mode.");
  assertIncludes(read("scripts/test-adapter-catalog.mjs"), "allowedSignals", "Adapter catalog test must validate allowed signal names.");
  assertIncludes(read("scripts/compatibility-matrix.mjs"), "release-gap-audit.mjs", "Compatibility matrix must include current release gaps.");
  assertIncludes(read("scripts/compatibility-matrix.mjs"), "adapters/catalog.json", "Compatibility matrix must read the adapter catalog.");
  assertIncludes(read("scripts/test-compatibility-matrix.mjs"), "macos-packaged-runtime", "Compatibility matrix test must keep public blockers visible.");
  assertIncludes(read("docs/compatibility-matrix.md"), "Platform Targets", "Compatibility matrix doc must include platform table.");
  assertIncludes(read("docs/compatibility-matrix.md"), "Adapter Compatibility", "Compatibility matrix doc must include adapter table.");
  assertIncludes(readiness, "Compatibility matrix", "Readiness matrix must cover compatibility matrix.");
}

function assertLowMemoryEvidence() {
  assertIncludes(read("scripts/lib/packaged-smoke.mjs"), "WHO_EATS_TOKEN_SMOKE_MAX_RSS_MB", "Packaged smoke must enforce RSS budget.");
  assertIncludes(read("scripts/lib/packaged-smoke.mjs"), "WHO_EATS_TOKEN_SMOKE_MAX_CPU_PERCENT", "Packaged smoke must enforce CPU budget.");
  assertIncludes(read("scripts/lib/packaged-soak.mjs"), "WHO_EATS_TOKEN_SOAK_MAX_GROWTH_MB", "Packaged soak must enforce memory growth budget.");
  assertIncludes(read("scripts/test-performance-budget.mjs"), "setInterval(", "Performance test must guard interval usage.");
  assertIncludes(read("scripts/performance-summary.mjs"), "adapter-review.mjs", "Performance summary must aggregate adapter review.");
  assertIncludes(read("scripts/performance-summary.mjs"), "release-evidence.json", "Performance summary must read recorded soak evidence.");
  assertIncludes(read("scripts/test-performance-summary.mjs"), "Windows packaged soak", "Performance summary test must cover text output.");
  assertIncludes(read("scripts/lag-triage.mjs"), "performance-summary.mjs", "Lag triage must aggregate static performance summary.");
  assertIncludes(read("scripts/lag-triage.mjs"), "buildStabilityReport", "Lag triage must use the live stability report.");
  assertIncludes(read("scripts/test-lag-triage.mjs"), "cpu-critical", "Lag triage test must cover high CPU findings.");
  assertIncludes(read("scripts/support-bundle.mjs"), "release-summary.mjs", "Support bundle must aggregate release summary.");
  assertIncludes(read("scripts/support-bundle.mjs"), "compatibility-matrix.mjs", "Support bundle must aggregate compatibility matrix.");
  assertIncludes(read("scripts/support-bundle.mjs"), "performance-summary.mjs", "Support bundle must aggregate performance summary.");
  assertIncludes(read("scripts/support-bundle.mjs"), "delight-contract.mjs", "Support bundle must aggregate delight contract.");
  assertIncludes(read("scripts/support-bundle.mjs"), "lag-triage.mjs", "Support bundle must aggregate lag triage.");
  assertIncludes(read("scripts/support-bundle.mjs"), "diagnostics.mjs", "Support bundle must aggregate diagnostics.");
  assertIncludes(read("scripts/support-bundle.mjs"), "api keys", "Support bundle must state secret exclusions.");
  assertIncludes(read("scripts/test-support-bundle.mjs"), "secret-should-not-leak", "Support bundle test must guard secret redaction.");
  assertIncludes(read("scripts/delight-contract.mjs"), "quota-delight.cjs", "Delight contract must use quota-delight as source of truth.");
  assertIncludes(read("scripts/delight-contract.mjs"), "maxDelightAssetBytes", "Delight contract must enforce asset budget.");
  assertIncludes(read("scripts/test-delight-contract.mjs"), "Low-quota alert", "Delight contract test must cover the text report.");
  assertIncludes(read("scripts/adapter-guard.mjs"), "prompt/completion scraping", "Adapter guard must describe prompt/completion scraping protection.");
  assertIncludes(releaseDoc, "RSS/CPU budgets", "Release doc must describe packaged smoke budgets.");
  assertIncludes(releaseDoc, "performance:summary", "Release doc must describe the performance summary.");
  assertIncludes(readiness, "soak:packaged-win", "Readiness matrix must cover packaged soak.");
  assertIncludes(readiness, "Low memory/stability", "Readiness matrix must cover low memory and stability.");
  assertIncludes(readiness, "Lag triage", "Readiness matrix must cover lag triage.");
  assertIncludes(readiness, "Performance summary", "Readiness matrix must cover one-shot performance summary.");
  assertIncludes(readiness, "Delight contract", "Readiness matrix must cover delight contract.");
  assertIncludes(read("docs/stability.md"), "one-shot diagnostic", "Stability doc must describe one-shot diagnostics.");
  assertIncludes(read("scripts/stability.mjs"), "getSnapshot", "Stability command must read the local snapshot.");
  assertIncludes(read("scripts/test-stability.mjs"), "cpu-critical", "Stability test must cover high CPU findings.");
  assertIncludes(read("docs/diagnostics.md"), "redacted bundle", "Diagnostics doc must describe the redacted bundle.");
  assertIncludes(read("docs/support-bundle.md"), "one redacted report", "Support bundle doc must describe the redacted report.");
  assertIncludes(read("docs/support-bundle.md"), "does not launch Electron", "Support bundle doc must keep runtime side effects out.");
  assertIncludes(read("scripts/diagnostics.mjs"), "getSnapshot", "Diagnostics command must read the local snapshot.");
  assertIncludes(read("scripts/test-diagnostics.mjs"), "secret-should-not-leak", "Diagnostics test must guard secret redaction.");
  assertIncludes(read("docs/release-evidence.md"), "Windows packaged 10-minute soak", "Release evidence must record Windows long soak.");
  assertIncludes(read("scripts/release-gap-audit.mjs"), "macos-packaged-runtime", "Release gap audit must track macOS runtime gap.");
}

function assertPrivacyEvidence() {
  assertIncludes(protocol, "Do not send provider API keys, cookies, prompts, completions", "Protocol must state secret/prompt boundary.");
  assertIncludes(prTemplate, "No API keys, cookies, local tokens", "PR template must include secret boundary.");
  assertIncludes(bugTemplate, "Please do not paste API keys", "Bug template must warn against secrets.");
  assertIncludes(bugTemplate, "npm run support:bundle -- --json", "Bug template must request the support bundle for lag/stale quota issues.");
  assertIncludes(performanceTemplate, "npm run support:bundle -- --json", "Performance report must request support bundle.");
  assertIncludes(performanceTemplate, "npm run diagnostics -- --json", "Performance report must still mention focused diagnostics.");
  assertIncludes(read("scripts/secret-scan.mjs"), "xiaomi-platform-cookie", "Secret scan must detect Xiaomi platform cookies.");
  assertIncludes(read("scripts/test-secret-scan.mjs"), "api-platform_serviceToken", "Secret scan test must cover Xiaomi cookie leakage.");
  assertIncludes(read("SECURITY.md"), "npm run secret:scan", "Security doc must mention secret scanning.");
  assertIncludes(read("scripts/license-check.mjs"), "forbidden-license", "License check must block forbidden licenses.");
  assertIncludes(read("scripts/test-license-check.mjs"), "GPL-3.0-only", "License check test must cover copyleft blocking.");
  assertIncludes(read("docs/license-policy.md"), "Blocked By Default", "License policy must document blocked licenses.");
  assertIncludes(read("PRIVACY.md"), "prompt", "Privacy doc must mention prompt boundaries.");
  assertIncludes(read("SECURITY.md"), "secret", "Security doc must mention secrets.");
  assertIncludes(readiness, "Privacy/security", "Readiness matrix must cover privacy and security.");
}

function assertOpenSourceFormEvidence() {
  assertIncludes(strategy, "Core Desktop App", "Strategy must name core desktop app layer.");
  assertIncludes(strategy, "Integration Adapters", "Strategy must name adapter layer.");
  assertIncludes(strategy, "Agent Skills / Codex Plugin", "Strategy must name skills/plugin layer.");
  assertIncludes(strategy, "open-source-landscape.md", "Strategy must point to landscape research.");
  assertIncludes(strategy, "token-tracker-lessons.md", "Strategy must point to TokenTracker lessons.");
  assertIncludes(landscape, "TokenTracker", "Landscape must mention closest GitHub tracker.");
  assertIncludes(landscape, "ccusage", "Landscape must mention CLI usage tracker reference.");
  assertIncludes(landscape, "Do not publish Who Eats Token as", "Landscape must prevent generic tracker overclaiming.");
  assertIncludes(landscape, "lightweight ambient interaction", "Landscape must state lightweight interaction differentiator.");
  assertIncludes(tokenTrackerLessons, "What To Learn", "TokenTracker lessons must capture strengths to learn from.");
  assertIncludes(tokenTrackerLessons, "What Not To Copy", "TokenTracker lessons must capture clone risks.");
  assertIncludes(tokenTrackerLessons, "Breakthrough Thesis", "TokenTracker lessons must define breakthrough thesis.");
  assertIncludes(tokenTrackerLessons, "Fun Interaction Direction", "TokenTracker lessons must cover fun interaction.");
  assertIncludes(tokenTrackerLessons, "No animation may require a new polling loop", "Fun interaction must stay lightweight.");
  assertIncludes(tokenTrackerLessons, "quota-delight", "TokenTracker lessons must name the shared delight state machine.");
  assertIncludes(tokenTrackerLessons, "delight-contract.md", "TokenTracker lessons must point to the delight contract.");
  assertIncludes(tokenTrackerLessons, "Interop Strategy With TokenTracker And ccusage", "Lessons must include integration path with adjacent projects.");
  assertIncludes(quotaDelight, "放心吃", "Quota delight state must include relaxed quota label.");
  assertIncludes(quotaDelight, "省着吃", "Quota delight state must include caution label.");
  assertIncludes(read("docs/delight-contract.md"), "Low-quota alert begins below `20%`", "Delight contract doc must state warning threshold.");
  assertIncludes(read("docs/delight-contract.md"), "100 KB", "Delight contract doc must state asset budget.");
  assertIncludes(protocol, "delight", "Protocol must document providerHealth delight state.");
  assertIncludes(readme, "open-source-landscape.md", "README must link landscape research.");
  assertIncludes(readme, "token-tracker-lessons.md", "README must link TokenTracker lessons.");
  assertIncludes(readme, "delight-contract.md", "README must link delight contract.");
  assertIncludes(readiness, "Desktop app owns realtime HUD", "Readiness must state desktop runtime boundary.");
  assertIncludes(readiness, "Adapters own tool-specific usage capture", "Readiness must state adapter boundary.");
  assertIncludes(readiness, "Skills/plugin own setup", "Readiness must state skills/plugin boundary.");
  assertIncludes(readiness, "Local doctor/status", "Readiness must cover status command.");
  assertIncludes(readiness, "Shareable diagnostics", "Readiness must cover diagnostics command.");
  assertIncludes(readiness, "Support bundle", "Readiness must cover support bundle command.");
  assertIncludes(read("docs/status.md"), "providerHealth", "Status doc must mention providerHealth.");
  assertIncludes(read("docs/diagnostics.md"), "npm run diagnostics -- --json", "Diagnostics doc must document JSON output.");
  assertIncludes(protocol, "GET /health", "Protocol must document the lightweight local health endpoint.");
  assertIncludes(adapterGuide, "GET http://127.0.0.1:17667/health", "Adapter guide must prefer lightweight health checks.");
  assertIncludes(read("docs/node-sdk.md"), "getHealth()", "Node SDK docs must document getHealth.");
  assertIncludes(read("src/sdk/client.cjs"), "getHealth", "Node SDK must expose getHealth.");
  assertIncludes(read("adapters/browser-extension/service-worker.js"), 'getLocal("/health"', "Browser extension connection test must use /health.");
  assertIncludes(read("adapters/vscode-extension/extension.js"), '`${settings.endpoint}/health`', "VS Code adapter refresh must use /health.");
  assertIncludes(read("scripts/test-browser-extension-runtime.mjs"), "/health", "Browser extension runtime test must exercise /health.");
  assertIncludes(read("scripts/test-vscode-extension-runtime.mjs"), "/health", "VS Code runtime test must exercise /health.");
  assertIncludes(readiness, "Local health", "Readiness must cover local health probe.");
  assertIncludes(readiness, "generic token tracking", "Readiness must cover landscape positioning.");
  assertIncludes(readiness, "Lightweight ambient interaction", "Readiness must cover lightweight/fun differentiation.");
  assertIncludes(readiness, "Risk register", "Readiness must cover the risk register.");
  assertIncludes(readme, "risk-register.md", "README must link the risk register.");
  assertIncludes(riskRegister, "HUD appears in the wrong app", "Risk register must cover wrong-app HUD display.");
  assertIncludes(riskRegister, "Codex and Hermes data are mixed", "Risk register must cover provider mixing.");
  assertIncludes(riskRegister, "Extra polling or DOM scanning", "Risk register must cover performance regressions.");
  assertIncludes(riskRegister, "Xiaomi Token Plan cookie", "Risk register must cover Xiaomi credential risk.");
  assertIncludes(riskRegister, "Unsigned binaries", "Risk register must cover signing risk.");
}

function assertPackagingEvidence() {
  assert.equal(packageJson.private, false, "package.json must remain publishable.");
  assert.equal(packageJson.license, "MIT", "package.json must declare MIT license.");
  assertIncludes(releaseDoc, "Authenticode", "Release doc must cover Windows signing.");
  assertIncludes(releaseDoc, "notarize", "Release doc must cover macOS notarization.");
  assertIncludes(releaseDoc, "signing:readiness", "Release doc must mention signing readiness.");
  assertIncludes(releaseDoc, "SHA256SUMS.txt", "Release doc must mention checksum artifacts.");
  assertIncludes(releaseDoc, "release-manifest.json", "Release doc must mention release manifest.");
  assertIncludes(releaseDoc, "release:evidence", "Release doc must mention structured evidence update command.");
  assertIncludes(releaseDoc, "release:evidence-report", "Release doc must mention evidence report sync.");
  assertIncludes(releaseDoc, "release:evidence-quality", "Release doc must mention evidence quality checks.");
  assertIncludes(releaseDoc, "release:validation-pack", "Release doc must mention validation pack generation.");
  assertIncludes(releaseDoc, "adapter:review", "Release doc must mention adapter review.");
  assertIncludes(releaseDoc, "validation:next", "Release doc must mention next validation actions.");
  assertIncludes(releaseDoc, "validation:template", "Release doc must mention validation evidence templates.");
  assertIncludes(releaseDoc, "release:summary", "Release doc must mention release summary.");
  assertIncludes(releaseDoc, "license:check", "Release doc must mention dependency license check.");
  assertIncludes(releaseWorkflow, "actions/upload-artifact", "Release workflow must upload artifacts.");
  assertIncludes(releaseWorkflow, "npm run release:manifest", "Release workflow must write the release manifest.");
  assertIncludes(readiness, "Known Release Blockers", "Readiness doc must list binary release blockers.");
  assertIncludes(readiness, "release:gaps", "Readiness doc must mention release gap audit.");
  assertIncludes(readiness, "validation:template", "Readiness doc must mention validation templates.");
  assertIncludes(readiness, "release:summary", "Readiness doc must mention release summary.");
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertIncludes(text, needle, message) {
  assert.ok(text.includes(needle), message || `Expected text to include ${needle}.`);
}
