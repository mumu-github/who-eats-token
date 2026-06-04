# Release Evidence Log

This file is generated from `docs/release-evidence.json`. Do not edit it by hand.

Release candidate: `0.1.0-local`

Validate and refresh it with:

```powershell
npm run test:release-evidence
npm run release:evidence-quality -- --require-clean
npm run release:evidence-report -- --check
npm run release:evidence-report -- --write
```

## Recorded Evidence

### Windows packaged smoke

- Key: `windowsPackagedRuntime.smoke`
- Status: `passed`
- Recorded at: 2026-05-24T00:00:00+08:00
- Command: `npm run smoke:packaged-win`
- Notes: ok true, workingSetMb 167, cpuPercent 0

### Windows packaged 10-minute soak

- Key: `windowsPackagedRuntime.soak`
- Status: `passed`
- Recorded at: 2026-05-24T00:00:00+08:00
- Command: `npm run soak:packaged-win`
- Notes: 10-minute soak, maxWorkingSetMb 152, growthMb -49, maxCpuPercent 0.21

### Windows HUD desktop/tool placement check

- Key: `windowsPackagedRuntime.hudPermissionStates`
- Status: `passed`
- Recorded at: 2026-05-24T00:00:00+08:00
- Command: `manual Windows HUD desktop/tool placement check`
- Notes: Windows does not require macOS Accessibility or Screen Recording gates.

### Browser host smoke

- Key: `browserAdapter.hostSmoke`
- Status: `host-smoke-only`
- Recorded at: 2026-05-25T09:28:59.636Z
- Command: `npm run smoke:browser-hosts -- --require --test-options-health with Chrome for Testing PATH`
- Notes: Chrome for Testing 149.0.7827.22 and Edge 148.0.3967.83 host smoke passed with temporary profiles; extension id ndknfhgaojabhngfhalaapmgchajelck loaded in both hosts; Options /health also checked.
- Public release note: this is partial host smoke evidence, not a full manual pass.

### Chrome manual load and Edge manual load

- Key: `browserAdapter.manualLoad`
- Status: `passed`
- Recorded at: 2026-05-25T09:28:59.645Z
- Command: `Chrome for Testing and Edge load adapters/browser-extension unpacked`
- Notes: Chrome for Testing version 149.0.7827.22 and Edge version 148.0.3967.83 loaded the unpacked adapter from adapters/browser-extension; extension id ndknfhgaojabhngfhalaapmgchajelck was enabled in both hosts.

### Browser extension Options /health connection

- Key: `browserAdapter.manualConnection`
- Status: `passed`
- Recorded at: 2026-05-25T09:29:00.351Z
- Command: `Browser extension Options /health connection test via real Chrome for Testing and Edge hosts`
- Notes: Local token source was userData api-token.txt without pasting the token into notes; /health returned HTTP 200 in Chrome for Testing and Edge Options pages; both reported Connected: 6 providers, 2 need attention.

### VS Code/Cursor host smoke

- Key: `ideAdapter.hostSmoke`
- Status: `host-smoke-only`
- Recorded at: 2026-05-25T09:29:01.099Z
- Command: `npm run smoke:ide-hosts -- --require`
- Notes: Validation machine host smoke passed: VS Code 1.121.0 and Cursor 3.5.33 installed the VSIX and listed who-eats-token.who-eats-token-vscode-adapter.
- Public release note: this is partial host smoke evidence, not a full manual pass.

### VS Code extension manual load and Cursor extension manual load

- Key: `ideAdapter.manualLoad`
- Status: `passed`
- Recorded at: 2026-05-25T09:29:41.251Z
- Command: `Install VSIX in VS Code and Cursor`
- Notes: VS Code version 1.121.0 and Cursor version 3.5.33 installed release/adapters/who-eats-token-vscode-adapter-0.1.0.vsix; adapter id who-eats-token.who-eats-token-vscode-adapter was listed as loaded in both hosts.

### VS Code/Cursor status bar and snapshot manual check

- Key: `ideAdapter.manualConnection`
- Status: `passed`
- Recorded at: 2026-06-04T17:50:17.112Z
- Command: `VS Code/Cursor status bar /health, refresh, and copy snapshot checks`
- Notes: VS Code 1.122.1 isolated profile: VSIX installed; status bar showed local /health summary for Who Eats Token with 6 providers; Refresh Token Status executed; Copy Token Snapshot showed the copied notification and clipboard contained snapshot JSON with collectedAt, ingest, bridges, system, totals, providers, settings, and providerHealth keys. Cursor 3.6.31 logged-in profile: installed release/adapters/who-eats-token-vscode-adapter-0.1.0.vsix; workspace status bar showed Who Eats Token /health summary as 5h 93% and 7d 68% with Providers: 6 and Endpoint: http://127.0.0.1:17667; status-bar refresh executed successfully; command palette Copy Token Snapshot showed the copied notification and clipboard contained the same structured snapshot keys. No API keys, local token value, prompts, completions, cookies, raw source files, or full snapshot payload were recorded in evidence.

### Dependency audit

- Key: `dependencyAudit`
- Status: `passed`
- Recorded at: 2026-05-25T10:23:50.456Z
- Command: `npm audit --audit-level=high`
- Notes: 2026-05-25 Windows source-beta audit completed with zero high-severity vulnerabilities.

## Evidence Still Needed Before Public Binary Release

- macOS packaged smoke: `not-run` - Requires a real macOS host.
- macOS packaged 10-minute soak: `not-run` - Requires a real macOS host.
- macOS Accessibility and Screen Recording permission-state HUD checks: `not-run` - Must verify HUD behavior with permissions both granted and denied.
- Windows Authenticode signed artifact: `not-run` - Requires Windows code-signing certificate and password in release environment.
- macOS notarized artifact: `not-run` - Requires Developer ID signing and Apple notarization credentials.

## Source Of Truth

- Machine-readable record: `docs/release-evidence.json`
- Schema: `docs/release-evidence.schema.json`
- Recorder: `npm run release:evidence -- --list` and `npm run release:evidence -- --set ...`
- Quality gate: `npm run release:evidence-quality -- --require-clean`
- Gap audit: `npm run release:gaps -- --require-public-release`
