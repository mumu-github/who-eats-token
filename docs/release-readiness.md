# Release Readiness Matrix

This matrix is the top-level audit for the open-source goal: Windows 10+ and macOS support, multi-tool compatibility, stability, low memory use, and a clear choice of project form.

Run it with:

```powershell
npm run test:release-readiness
npm run manual:preflight -- --platform all
npm run signing:readiness -- --platform all
npm run release:gaps
npm run release:gaps -- --target source-beta --require-source-beta
npm run release:summary
npm run release:check -- --list --json
npm run performance:summary
npm run lag:triage
npm run support:bundle
npm run adapter:fixture
npm run compatibility:matrix -- --check
npm run release:check
npm run secret:scan
npm run license:check
```

`test:release-readiness` does not replace real platform smoke tests. It checks that each release requirement has an evidence path in the repository.

## Form Decision

Who Eats Token should be released as a layered project:

| Layer | Release form | Evidence |
| --- | --- | --- |
| Core runtime | Desktop app | `src/main.cjs`, `electron-builder.yml`, `docs/release.md` |
| Local protocol | Localhost API | `docs/protocol.md`, `src/protocol/usage-event.cjs` |
| Local health | Compact liveness and provider-health probe | `GET /health`, `npm run test:local-health`, `src/collectors/ingest-server.cjs` |
| Integrations | Adapters | `adapters/catalog.json`, `docs/adapter-catalog.md`, `docs/adapter-guide.md` |
| External interop | One-shot summary importer for TokenTracker/ccusage-style JSON | `docs/external-summary-import.md`, `npm run test:external-summary-import` |
| Local doctor/status | One-shot provider health summary for users, skills, and plugins | `docs/status.md`, `npm run status`, `npm run test:status` |
| Shareable diagnostics | Redacted provider/stability bundle for issue reports and maintainers | `docs/diagnostics.md`, `npm run diagnostics -- --json`, `npm run test:diagnostics` |
| Support bundle | Redacted all-in-one issue and performance triage attachment | `docs/support-bundle.md`, `npm run support:bundle -- --json`, `npm run test:support-bundle` |
| Agent access | MCP server | `src/mcp/server.cjs`, `docs/mcp-server.md` |
| Agent workflows | Skills and Codex plugin | `skills/`, `plugins/who-eats-token`, `docs/skills.md`, `docs/plugin.md` |
| Market position | Desktop HUD and adapter host, not a generic tracker clone | `docs/open-source-landscape.md` |
| Differentiation | Lightweight ambient interaction and fun quota states | `docs/token-tracker-lessons.md`, `src/protocol/quota-delight.cjs`, `npm run test:quota-delight` |
| Delight contract | Cute-but-cheap interaction rules for labels, cues, reduced motion, and asset budget | `docs/delight-contract.md`, `npm run delight:contract -- --check`, `npm run test:delight-contract` |

So the answer is not "skills or tool or plugin". The stable public shape is all of them, with strict boundaries:

- Desktop app owns realtime HUD, local collection, system metrics, and local API.
- Adapters own tool-specific usage capture.
- MCP owns agent-facing snapshot access.
- Skills/plugin own setup, diagnosis, and adapter-authoring workflows.

The closest GitHub projects are already strong at generic token tracking and CLI/dashboard reporting. This project should lead with realtime desktop HUD behavior, local protocol hosting, and adapter interoperability instead of claiming to be the first or only universal token tracker.

TokenTracker is the closest learning target. Release planning should borrow its zero-config, status/doctor, local aggregation, privacy clarity, reset countdowns, and companion/widget ideas, while deliberately avoiding a heavy parser warehouse or dashboard-first clone.

## Release Evidence

| Requirement | Automated evidence | Manual evidence |
| --- | --- | --- |
| Windows 10+ desktop runtime | `npm run package:dir`, `npm run smoke:packaged-win`, `npm run test:window-detection` | Windows section in `docs/manual-validation.md` |
| macOS desktop runtime | `npm run smoke:packaged-mac` on macOS, `npm run test:window-detection` | macOS section in `docs/manual-validation.md` |
| Multi-tool adapter signal contract | `npm run test:adapter-catalog`, `npm run test:adapter-contract`, `npm run test:adapter-review`, `npm run test:adapter-fixture`, `npm run test:adapter-contribution` | `providedSignals` in `adapters/catalog.json`, fixture events for Codex/Hermes/browser/IDE/gateway, plus `npm run adapter:review -- --id <adapter-id>` and `npm run adapter:fixture -- --json` |
| Compatibility matrix | `npm run test:compatibility-matrix`, `npm run compatibility:matrix -- --check` | Generated Windows/macOS, adapter, signal, and public blocker matrix in `docs/compatibility-matrix.md` |
| Adapter privacy/performance guard | `npm run adapter:guard`, `npm run test:adapter-guard` | Browser/IDE adapters keep precise permissions, usage allowlists, and no prompt/completion scraping |
| Local health probe | `npm run test:local-health`, packaged smoke `/health` check | Adapter and extension startup checks |
| Stability diagnostics | `npm run test:stability`, `npm run stability -- --json` | Attach the stability report to lag, memory, stale quota, or HUD disappearance issues |
| Lag triage | `npm run test:lag-triage`, `npm run lag:triage -- --json` | Use before changing HUD code to separate CPU, memory, app RSS, provider freshness, overlay avoidance, and static polling risks |
| Shareable diagnostics bundle | `npm run test:diagnostics`, `npm run diagnostics -- --json` | Attach the redacted diagnostics bundle to public bug/performance reports |
| Support bundle | `npm run test:support-bundle`, `npm run support:bundle -- --json` | Attach this first for public bug/performance reports; it combines release summary, compatibility matrix, performance summary, delight contract, lag triage, and diagnostics |
| Performance summary | `npm run test:performance-summary`, `npm run performance:summary -- --json` | Use before profiling to review dependency weight, interval risk, adapter boundaries, and recorded soak evidence |
| Browser adapter | `npm run test:browser-extension`, `npm run test:browser-extension-runtime`, `npm run test:browser-host-smoke`, `npm run package:browser-extension` | `npm run smoke:browser-hosts -- --require`, plus Chrome/Edge manual load checks |
| IDE adapter | `npm run test:vscode-extension`, `npm run test:vscode-extension-runtime`, `npm run test:ide-host-smoke`, `npm run package:vscode-extension` | `npm run smoke:ide-hosts -- --require`, plus VS Code/Cursor manual checks |
| Adapter manual readiness | `npm run test:adapter-manual-readiness` | `npm run adapter:manual-readiness -- --require-installed` on a release validation machine |
| MCP/agent access | `npm run test:mcp`, `npm run test:plugin`, `npm run test:skills` | Plugin install/manual MCP client check |
| Low memory/stability | `npm run test:performance-budget`, `npm run test:soak-script`, `npm run test:hud-stability`, packaged smoke RSS/CPU budgets | `npm run soak:packaged-win`, `npm run soak:packaged-mac`, and 10-minute idle checks in `docs/manual-validation.md` |
| Visual delight behavior | `npm run test:quota-delight`, `npm run test:hud-stability` | Cute But Quiet Visual QA section in `docs/manual-validation.md` |
| Delight contract | `npm run test:delight-contract`, `npm run delight:contract -- --check` | Confirm labels, cue keys, warning thresholds, reduced-motion behavior, and asset budget before adding new visual flourish |
| Manual validation preflight | `npm run test:manual-preflight` | `npm run manual:preflight -- --platform windows` and `npm run manual:preflight -- --platform macos` |
| Release gap audit | `npm run test:release-gaps` | `npm run release:gaps -- --require-public-release` before publishing public binaries |
| Release summary | `npm run test:release-summary` | `npm run release:summary` for a short maintainer dashboard before assigning release work |
| Release check profiling | `npm run test:release-check` | `npm run release:check -- --list --json` keeps the release lane inspectable and bounded by per-command timeout |
| Structured release evidence | `npm run test:release-evidence`, `npm run test:release-evidence-report`, `docs/release-evidence.json` | Update recorded manual/external evidence before tagging, then sync Markdown with `npm run release:evidence-report -- --write` |
| Release evidence recorder | `npm run test:release-evidence-cli` | `npm run release:evidence -- --list` and `--set ...` after manual/external validation |
| Release evidence quality | `npm run test:release-evidence-quality` | `npm run release:evidence-quality -- --require-clean` rejects vague browser, IDE, macOS, signing, and audit evidence |
| External validation handoff | `npm run test:release-validation-pack` | `npm run release:validation-pack -- --platform windows|macos|all` for validation owners |
| Next validation actions | `npm run test:validation-next` | `npm run validation:next -- --target browser|ide|macos|signing` before assigning manual work |
| Focused validation template | `npm run test:validation-template` | `npm run validation:template -- --target browser|ide|macos|signing` for tester-facing evidence notes and record commands |
| Release artifact integrity | `npm run test:release-manifest`, `release/release-manifest.json`, `release/SHA256SUMS.txt` | `npm run release:manifest` then `npm run verify:release-manifest` after packaging |
| Signing/notarization readiness | `npm run test:signing-readiness` | `npm run signing:readiness -- --platform all --require` in the release signing environment |
| Privacy/security | `npm run test:protocol`, `npm run test:secret-scan`, `npm audit --audit-level=high`, docs and templates | Secret redaction checks in issue/PR templates and source secret scanning |
| License compliance | `npm run test:license-check`, `npm run license:check` | Dependency license policy in `docs/license-policy.md` |
| Documentation quality | `npm run test:docs` | README and key docs render as readable UTF-8, with no mojibake in release-facing guidance |
| Risk register | `npm run test:release-readiness` | `docs/risk-register.md` tracks runtime, adapter, privacy, host, and signing risks |
| Open-source release hygiene | `npm run test:packaging`, `npm run test:adapter-packages`, `npm run verify:adapter-artifacts` | Signing/notarization checklist in `docs/release.md` |

## Current Hard Gates

For a source beta, use the source-only gate first:

```powershell
npm ci
npm run release:check
npm run secret:scan
npm run license:check
npm audit --audit-level=high
npm run release:gaps -- --target source-beta --require-source-beta
npm run release:summary -- --require-source-beta
```

This gate is allowed to pass while public binary release blockers remain open. It does not waive signing, notarization, macOS runtime, or manual adapter evidence for a later binary release.

Before publishing a public release, maintainers should run:

```powershell
npm ci
npm run release:check
npm run secret:scan
npm run license:check
npm run diagnostics -- --json
npm run lag:triage -- --json
npm run support:bundle -- --json
npm run performance:summary -- --require-clean
npm run delight:contract -- --check
npm run test:release-evidence
npm run package:dir
npm run smoke:packaged-win
npm run soak:packaged-win
npm run package:adapters
npm run verify:adapter-artifacts
npm run compatibility:matrix -- --check
npm run release:manifest
npm run verify:release-manifest
npm run smoke:browser-hosts -- --require
npm run smoke:ide-hosts -- --require
npm run adapter:review
npm run adapter:fixture -- --json
npm run adapter:guard
npm run release:validation-pack -- --platform all
npm run validation:next
npm run validation:template -- --target browser
npm run release:evidence -- --list
npm run release:evidence-quality -- --require-clean
npm run release:evidence-report -- --check
npm run manual:preflight -- --platform windows
npm run release:summary
npm run release:gaps
npm run signing:readiness -- --platform windows
npm run secret:scan
npm run license:check
npm audit --audit-level=high
```

On macOS:

```sh
npm ci
npm run release:check
npm run secret:scan
npm run license:check
npm run package:dir
npm run smoke:packaged-mac
npm run soak:packaged-mac
npm run dist:mac
npm run manual:preflight -- --platform macos
npm run validation:template -- --target macos
npm run release:evidence-quality -- --require-clean
npm run release:evidence-report -- --check
npm run release:summary
npm run release:gaps
npm run signing:readiness -- --platform macos
```

## Known Release Blockers

These do not block source-level development, but they do block a polished public binary release:

- Windows binaries must be Authenticode-signed.
- macOS binaries must be Developer ID signed and notarized.
- `npm run signing:readiness -- --platform all --require` must pass in the release signing environment.
- macOS HUD placement still needs real-device checks with Accessibility and Screen Recording both granted and denied.
- Browser extension should be manually loaded in Chrome and Edge before release.
- VSIX should be manually loaded in VS Code and Cursor before release.
- `npm audit --audit-level=high` requires working network access to the npm registry.
- `npm run license:check` must pass after dependency updates; new unreviewed or copyleft licenses block release.
- Public release messaging must be checked against `docs/open-source-landscape.md` so the project does not overclaim against existing open-source trackers.
- New "cute" UI must follow `docs/token-tracker-lessons.md` and `src/protocol/quota-delight.cjs`: quota-driven, optional, reduced-motion aware, and not backed by new polling loops.
- New delight UI must also pass `npm run delight:contract -- --check` so labels, cues, reduced-motion behavior, and asset budget stay aligned.

Use `npm run release:gaps -- --require-public-release` as the final public-release audit. It is expected to fail while manual macOS, browser, IDE, signing, notarization, or network audit evidence is missing.
