# Source Beta Release Next Steps

This document is the handoff checklist after publishing the repository as a source beta. The beta can be public while the polished binary release remains blocked by manual host validation, macOS validation, and signing.

## Current Beta State

Source beta is acceptable when these pass on Windows:

```powershell
npm ci
npm run check
npm run test:docs
npm run test:release-readiness
npm run test:release-check
npm run secret:scan
npm run license:check
npm audit --audit-level=high
npm run release:gaps -- --target source-beta --require-source-beta
npm run release:summary -- --require-source-beta
npm run release:evidence-quality -- --require-clean
npm run release:summary -- --json
```

`release:gaps -- --target source-beta --require-source-beta` and `release:summary -- --require-source-beta` should pass before pushing the source beta. `release:summary` is still expected to report `publicReleaseReady: false` until the manual and signing blockers below are recorded. That does not block a source beta.

Before recording runtime evidence, make sure `npm run lag:triage -- --json` does not report `partial-snapshot`. If it does, restart the desktop app and confirm `npm run diagnostics -- --json` includes `stability.system`.

## Current Windows Non-macOS Blockers

These items do not block the source beta, but they still block a polished public binary/adapters release. Current Windows validation status:

- Browser adapter: recorded. Chrome for Testing 149.0.7827.22 and Edge 148.0.3967.83 loaded the unpacked extension, and Options `/health` returned HTTP 200 in both hosts without recording the local token.
- IDE adapter: VS Code 1.121.0 and Cursor 3.5.33 installed the generated VSIX and listed `who-eats-token.who-eats-token-vscode-adapter`. The remaining IDE item is the visible status bar `/health`, refresh command, and copy snapshot behavior in both hosts.
- Windows signing: `npm run signing:readiness -- --platform windows --require` is blocked until `WIN_CSC_LINK` or `CSC_LINK`, plus `WIN_CSC_KEY_PASSWORD` or `CSC_KEY_PASSWORD`, are present in the release environment.

Do not mark `ideAdapter.manualConnection` or `signing.windowsAuthenticode` as passed until those exact host/certificate checks have really been completed.

## macOS Real-Machine Validation

Run this on the macOS validation machine:

```sh
git clone https://github.com/mumu-github/who-eats-token.git
cd who-eats-token
npm ci
npm run check
npm run test:release-readiness
npm run package:dir
npm run smoke:packaged-mac
npm run soak:packaged-mac
npm run manual:preflight -- --platform macos
npm run validation:template -- --target macos
```

Manual checks:

- Start the unpacked app.
- Grant Accessibility and Screen Recording, then verify desktop top bar and in-tool HUD placement.
- Deny Accessibility or Screen Recording, then verify the app does not crash and does not show stale HUD placement.
- Confirm `http://127.0.0.1:17667/snapshot` contains `ingest`, `bridges`, `system`, `settings`, and `providers`.
- Leave the app idle for 10 minutes and record max RSS, memory growth, and CPU.

Record passing evidence with the commands printed by:

```sh
npm run validation:next -- --target macos
```

## Browser Extension Validation

Run on Windows or macOS with Chrome and Edge installed:

```powershell
npm ci
npm run package:browser-extension
npm run adapter:manual-readiness
npm run smoke:browser-hosts -- --require
npm run validation:template -- --target browser
```

Manual checks:

- Load `adapters/browser-extension` as an unpacked extension in Chrome.
- Load `adapters/browser-extension` as an unpacked extension in Edge.
- Open the extension Options page.
- Paste the local API token from the desktop app data directory, but do not record the token in evidence.
- Run the Options `/health` connection test.
- Open Hermes Web UI and confirm overlay hints appear only on matching pages.
- Confirm unrelated websites do not show the HUD/content-script behavior.

Record evidence with the commands printed by:

```powershell
npm run validation:next -- --target browser
```

## VS Code and Cursor Adapter Validation

Run on a machine with VS Code and Cursor installed:

```powershell
npm ci
npm run package:vscode-extension
npm run adapter:manual-readiness
npm run smoke:ide-hosts -- --require
npm run validation:template -- --target ide
```

Manual checks:

- Install the generated VSIX in VS Code.
- Install the same VSIX or extension folder in Cursor.
- Verify the status bar shows compact local health or a clear disconnected state.
- Run refresh.
- Run copy snapshot.
- Confirm no source files, prompts, completions, cookies, or local tokens are copied into issue evidence.

Record evidence with the commands printed by:

```powershell
npm run validation:next -- --target ide
```

## Signing and Notarization

Signing is not required for source beta, but it blocks public binary release.

Windows signing readiness:

```powershell
$env:WIN_CSC_LINK = "<path-or-base64-certificate>"
$env:WIN_CSC_KEY_PASSWORD = "<password>"
npm run signing:readiness -- --platform windows --require
npm run dist:win
```

macOS signing and notarization readiness:

```sh
export MAC_CSC_LINK="<path-or-base64-certificate>"
export MAC_CSC_KEY_PASSWORD="<password>"
export APPLE_API_KEY="<path-or-key>"
export APPLE_API_KEY_ID="<key-id>"
export APPLE_API_ISSUER="<issuer-id>"
npm run signing:readiness -- --platform macos --require
npm run dist:mac
```

Record evidence with:

```powershell
npm run validation:next -- --target signing
```

Do not commit certificates, passwords, Apple API keys, cookies, local access tokens, logs, databases, or screenshots containing account data.

## Final Public Binary Gate

After all evidence is recorded:

```powershell
npm run release:evidence-quality -- --require-clean
npm run release:evidence-report -- --check
npm run release:gaps -- --require-public-release
npm run release:summary
npm run release:check
```

Only create a public binary release when `release:gaps -- --require-public-release` passes.
