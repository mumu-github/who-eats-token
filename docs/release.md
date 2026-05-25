# Release And Packaging

Who Eats Token is a desktop-first open-source project. Source-only installation is useful for contributors, but normal users need predictable Windows/macOS artifacts.

## Packaging Choice

Use `electron-builder` for the desktop app:

- one config covers Windows and macOS
- supports unpacked dev packages, NSIS, ZIP, DMG, and macOS ZIP
- leaves code signing and notarization as explicit release responsibilities
- works in GitHub Actions matrix jobs

The current config is `electron-builder.yml`.

## Commands

```powershell
npm run release:check
npm run secret:scan
npm run license:check
npm run diagnostics -- --json
npm run lag:triage -- --json
npm run support:bundle -- --json
npm run performance:summary
npm run performance:summary -- --json
npm run delight:contract -- --check
npm run test:release-readiness
npm run test:release-evidence
npm run package:dir
npm run smoke:packaged-win
npm run smoke:packaged-mac
npm run soak:packaged-win
npm run soak:packaged-mac
npm run package:adapters
npm run verify:adapter-artifacts
npm run release:manifest
npm run verify:release-manifest
npm run smoke:browser-hosts
npm run smoke:ide-hosts
npm run adapter:review
npm run adapter:fixture
npm run compatibility:matrix -- --check
npm run manual:preflight -- --platform all
npm run release:validation-pack -- --platform all
npm run validation:next
npm run validation:template -- --target browser
npm run release:evidence -- --list
npm run release:evidence-quality -- --require-clean
npm run release:evidence-report -- --check
npm run release:gaps
npm run release:gaps -- --target source-beta --require-source-beta
npm run release:summary
npm run release:summary -- --require-source-beta
npm run release:check -- --list
npm run release:check -- --list --json
npm run signing:readiness -- --platform all
```

Platform artifacts:

```powershell
npm run dist:win
```

macOS:

```sh
npm run dist:mac
```

`package:dir` creates an unpacked app for smoke testing. On Windows it disables executable resource editing so normal contributor accounts do not need symlink privileges just to validate an unpacked package. `dist:*` creates distributable artifacts under `release/`.

`release:check` runs the source-level release guard suite. It prints per-command timings, summarizes slow commands, and applies a per-command timeout so a stuck test does not silently hang the release lane. The default timeout is 180 seconds per command and can be changed with `WHO_EATS_TOKEN_RELEASE_CHECK_TIMEOUT_MS` or `--command-timeout-ms`. Use `--list --json` to inspect the command list without running it:

```powershell
npm run release:check -- --list
npm run release:check -- --list --json
npm run release:check -- --command-timeout-ms 180000 --slow-ms 30000
```

`secret:scan` is a local source-release guard. It skips dependencies and generated artifacts, then checks repository text files for common provider keys, Xiaomi platform cookies, bearer tokens, local API tokens, and private-key material. It allows documented placeholders such as `...`, `<redacted>`, or `你的 Cookie`.

`license:check` reads `package-lock.json` without network access and fails on forbidden or unreviewed dependency licenses. See [docs/license-policy.md](license-policy.md) for the allowlist, blocked families, and reviewed exceptions.

`smoke:packaged-win` launches `release/win-unpacked/Who Eats Token.exe` with isolated temp user data and random localhost ports. It uses a headless, `--no-sandbox` test mode for CI stability, then checks full `/snapshot` data, local API `/health`, browser-origin token rejection, Hermes bridge `/health`, overlay reporting, a tiny local usage event, RSS/CPU budgets, absence of default HUD debug logs, and local API shutdown after exit. Manual validation still covers normal sandboxed launch, real transparent windows, and HUD placement.

`smoke:packaged-mac` does the same for `release/mac/Who Eats Token.app/Contents/MacOS/Who Eats Token`. It skips automatically on non-macOS hosts.

Packaged smoke budgets can be adjusted for CI runners with:

```sh
WHO_EATS_TOKEN_SMOKE_MAX_RSS_MB=450
WHO_EATS_TOKEN_SMOKE_MAX_CPU_PERCENT=35
```

`soak:packaged-win` and `soak:packaged-mac` run a longer idle soak against the unpacked app. They check `/health`, sample RSS/CPU, enforce memory-growth and CPU budgets, and verify local API shutdown after exit. The default duration is 10 minutes; use `WHO_EATS_TOKEN_SOAK_DURATION_MS` for shorter local checks.

`package:adapters` creates browser extension and VS Code/Cursor adapter artifacts under `release/adapters/`, then verifies their internal manifests and required files. `verify:adapter-artifacts` can be run separately when reviewing release uploads.

`release:manifest` writes `release/release-manifest.json` and `release/SHA256SUMS.txt` for public artifacts. It records relative path, type, platform, size, and SHA256. `verify:release-manifest` recomputes the same data and fails if artifacts changed after the manifest was generated. The manifest intentionally skips unpacked smoke-test app internals such as `win-unpacked/` and `.app` bundle contents; public installers, desktop archives, browser ZIPs, and VSIX files are included.

`release:evidence` lists or updates structured manual/external evidence in `docs/release-evidence.json`. It rejects invalid evidence keys and prevents host-smoke checks from being recorded as a full manual pass:

```powershell
npm run release:evidence -- --list
npm run release:evidence -- --set browserAdapter.manualLoad --status passed --command "Chrome and Edge loaded adapters/browser-extension unpacked" --notes "Options page visible in both hosts"
```

`release:evidence-quality` checks whether recorded evidence is specific enough to be useful later. It is especially strict for browser and IDE manual passes: notes must include host names/versions, `/health` or status-bar results, token handling, and source-file privacy boundaries where relevant.

```powershell
npm run release:evidence-quality
npm run release:evidence-quality -- --json
npm run release:evidence-quality -- --require-clean
```

`release:evidence-report` keeps the human-readable `docs/release-evidence.md` synchronized with the JSON source of truth:

```powershell
npm run release:evidence-report -- --check
npm run release:evidence-report -- --write
npm run release:evidence-report -- --json
```

`release:validation-pack` generates a platform-specific validation pack for external testers. It groups the commands to run, the manual checklist, and the exact `release:evidence -- --set ...` commands to record successful macOS, browser, IDE, and signing evidence:

```powershell
npm run release:validation-pack -- --platform windows
npm run release:validation-pack -- --platform macos
npm run release:validation-pack -- --platform all --json
```

`validation:next` reads the current `docs/release-evidence.json` and prints only the remaining validation actions. Use it before asking someone to verify a release candidate so they do not repeat completed checks or accidentally record host smoke as full manual evidence:

```powershell
npm run validation:next
npm run validation:next -- --target browser
npm run validation:next -- --target ide --json
```

`validation:template` turns those remaining actions into a tester-facing evidence template. It is read-only: it lists the checklist, required note fields, and exact `release:evidence` command to run after the human validation is complete:

```powershell
npm run validation:template -- --target browser
npm run validation:template -- --target ide --json
npm run validation:template -- --target macos
```

`release:gaps` has two release targets. The default target is `public-binary`, which keeps macOS runtime validation and signing/notarization as hard blockers. `source-beta` checks only the source-level gates needed to publish the repository as an open beta:

```powershell
npm run release:gaps -- --target source-beta
npm run release:gaps -- --target source-beta --require-source-beta
npm run release:gaps -- --require-public-release
```

`release:summary` is the short maintainer dashboard. It aggregates `release:gaps`, `validation:next`, `secret:scan`, and `license:check` without running the longer packaged or browser/IDE smoke tests:

```powershell
npm run release:summary
npm run release:summary -- --json
npm run release:summary -- --require-source-beta
npm run release:summary -- --require-public-release
```

`performance:summary` is the short low-memory dashboard. It aggregates static interval risk, dependency weight, adapter performance boundaries, packaged smoke/soak budgets, and recorded soak evidence without launching Electron or scanning live browser pages:

```powershell
npm run performance:summary
npm run performance:summary -- --json
npm run performance:summary -- --require-clean
```

`lag:triage` is the first-pass support command for "the app feels laggy" reports. It combines `performance:summary` with a single live `/snapshot`, labels the likely cause, and suggests the next command without starting a background sampler:

```powershell
npm run lag:triage
npm run lag:triage -- --json
npm run lag:triage -- --require-clean
```

`support:bundle` is the all-in-one support attachment for public bug and performance reports. It combines release summary, compatibility matrix, performance summary, delight contract, lag triage, and diagnostics into one redacted report without launching Electron or scanning browser pages:

```powershell
npm run support:bundle
npm run support:bundle -- --json
npm run support:bundle -- --json --require-clean
```

`delight:contract` is the release guard for lightweight fun. It verifies that cute labels, icon/mascot/chart cues, warning thresholds, reduced-motion behavior, renderer coupling, and delight asset size stay tied to `quota-delight`:

```powershell
npm run delight:contract
npm run delight:contract -- --json
npm run delight:contract -- --check
```

`smoke:browser-hosts` launches installed Chrome/Edge with an isolated temporary profile and loads the unpacked browser extension through `--load-extension` when that host allows it. Official Chrome 137+ branded builds may block this command-line path; in that case the script records a policy skip and maintainers should use manual loading or Chrome for Testing/Chromium for automated Chrome coverage. It is a machine smoke test for extension-host compatibility; it does not replace the manual Options-page connection check in `docs/manual-validation.md`.

`smoke:ide-hosts` installs the packaged VSIX into temporary VS Code/Cursor extension directories, lists installed extensions through each host CLI, and confirms the adapter id is visible. It validates host/package compatibility without touching the user's real IDE profile. It does not replace the manual status-bar and command checks in `docs/manual-validation.md`.

`adapter:review` reads `adapters/catalog.json` and prints a maintainer-friendly report for each adapter: claimed signals, privacy/performance boundary findings, and recommended verification commands. Use `npm run adapter:review -- --id <adapter-id>` in adapter pull requests.

`adapter:fixture` is the safe compatibility simulator for adapter authors. It starts an isolated ingest server by default, posts representative Codex/Hermes/browser/IDE/gateway usage and overlay events, verifies `/snapshot`, `/health`, provider health, low-quota attention, and secret redaction, and does not touch a running desktop app unless `--endpoint` is passed:

```powershell
npm run adapter:fixture
npm run adapter:fixture -- --json
npm run test:adapter-fixture
```

`compatibility:matrix` generates the cross-platform and multi-tool compatibility table from the adapter catalog, manual validation checklist, CI workflow, and release gap audit:

```powershell
npm run compatibility:matrix
npm run compatibility:matrix -- --json
npm run compatibility:matrix -- --check
```

## Signing Policy

Unsigned artifacts are acceptable for internal smoke testing only.

Before a public release:

- Windows: sign `.exe` artifacts with an Authenticode code-signing certificate.
- macOS: sign with Apple Developer ID and notarize.
- Keep signing credentials in CI secrets, never in the repository.
- Publish `release-manifest.json` and `SHA256SUMS.txt` next to artifacts.

Check signing readiness without printing secrets:

```powershell
npm run signing:readiness -- --platform all
```

For a real public release, require every signing check to pass:

```powershell
npm run signing:readiness -- --platform all --require
```

Expected release secrets/config:

| Platform | Required readiness inputs |
| --- | --- |
| Windows | `WIN_CSC_LINK` or `CSC_LINK`, plus `WIN_CSC_KEY_PASSWORD` or `CSC_KEY_PASSWORD` |
| macOS signing | `WHO_EATS_TOKEN_MAC_SIGNING_CONFIG`, `WHO_EATS_TOKEN_MAC_POST_BUILD_SIGNING=1`, `MAC_CSC_LINK` plus `MAC_CSC_KEY_PASSWORD`, `CSC_LINK` plus `CSC_KEY_PASSWORD`, or `CSC_NAME` |
| macOS notarization | `APPLE_API_KEY` plus `APPLE_API_KEY_ID` plus `APPLE_API_ISSUER`, or `APPLE_ID` plus `APPLE_APP_SPECIFIC_PASSWORD` plus `APPLE_TEAM_ID` |

The default config sets `mac.identity: null` so contributors without certificates can still package locally. Release maintainers should override signing settings in CI or a local ignored config.

On Windows, full `dist:win` may require Developer Mode or a signing environment because electron-builder extracts signing helper binaries that contain symlinks. Use `package:dir` for ordinary smoke testing; use `dist:win` only in the release environment.

## GitHub Release Flow

1. Bump version in `package.json`.
2. Run `npm ci`.
3. Run `npm run release:check`.
4. Run `npm run secret:scan` and `npm run license:check`.
5. Run `npm run performance:summary -- --require-clean`.
6. Run `npm run delight:contract -- --check`.
7. Run `npm run lag:triage -- --json` while the desktop app is running.
8. Run `npm run support:bundle -- --json` and keep it with the release notes or issue handoff.
9. Run `npm run package:dir` on Windows and macOS.
10. Run the packaged smoke for the current OS: `npm run smoke:packaged-win` or `npm run smoke:packaged-mac`.
11. Run the packaged soak for the current OS: `npm run soak:packaged-win` or `npm run soak:packaged-mac`.
12. Run `npm run package:adapters`.
13. Run `npm run compatibility:matrix -- --check`.
14. Run `npm run release:manifest` and `npm run verify:release-manifest`.
15. Run `npm run smoke:browser-hosts -- --require` on a browser validation machine.
16. Run `npm run smoke:ide-hosts -- --require` on an IDE validation machine.
17. Run `npm run adapter:fixture -- --json` as a protocol/signal sanity check for adapter-facing changes.
18. Generate a checklist with `npm run manual:preflight -- --platform all`, a handoff pack with `npm run release:validation-pack -- --platform all`, or a focused evidence template with `npm run validation:template -- --target browser|ide|macos|signing`.
19. Update `docs/release-evidence.json` with the generated `npm run release:evidence -- --set ...` commands, then run `npm run release:evidence-report -- --write` to refresh `docs/release-evidence.md`.
20. Run `npm run release:evidence-quality -- --require-clean` to reject vague browser/IDE/manual evidence.
21. Run `npm run release:summary` for the short maintainer overview.
22. Run `npm run release:gaps -- --require-public-release`; it should pass only when public-release blockers are cleared.
23. Run `npm run signing:readiness -- --platform all --require` in the signing environment.
24. Run the manual smoke tests in `docs/manual-validation.md`.
25. Create a tag: `v0.x.y`.
26. Let `.github/workflows/release-artifacts.yml` create build artifacts.
27. Sign/notarize final artifacts before public announcement.

## Artifact Expectations

| Platform | Test artifact | Public artifact |
| --- | --- | --- |
| Windows 10+ | unpacked app, ZIP | signed NSIS installer, signed ZIP |
| macOS Intel | unpacked app, ZIP | signed and notarized DMG/ZIP |
| macOS Apple Silicon | unpacked app, ZIP | signed and notarized DMG/ZIP |

## What Must Stay Out

Do not package or publish:

- local token files
- Xiaomi cookies
- Hermes SQLite databases
- debug logs
- screenshots
- `node_modules` outside the builder output
- local `.env` files
