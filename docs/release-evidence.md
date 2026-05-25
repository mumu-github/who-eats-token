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
- Recorded at: 2026-05-24T00:00:00+08:00
- Command: `npm run smoke:browser-hosts -- --require`
- Notes: Edge host smoke passed. Official Chrome 148 command-line extension loading was policy-skipped; Chrome manual load or Chrome for Testing/Chromium automation is still required.
- Public release note: this is partial host smoke evidence, not a full manual pass.

### Dependency audit

- Key: `dependencyAudit`
- Status: `passed`
- Recorded at: 2026-05-24T00:00:00+08:00
- Command: `npm audit --audit-level=high`
- Notes: found 0 vulnerabilities

## Evidence Still Needed Before Public Binary Release

- macOS packaged smoke: `not-run` - Requires a real macOS host.
- macOS packaged 10-minute soak: `not-run` - Requires a real macOS host.
- macOS Accessibility and Screen Recording permission-state HUD checks: `not-run` - Must verify HUD behavior with permissions both granted and denied.
- Browser host smoke: `host-smoke-only` - Edge host smoke passed. Official Chrome 148 command-line extension loading was policy-skipped; Chrome manual load or Chrome for Testing/Chromium automation is still required.
- Chrome manual load and Edge manual load: `not-run` - Must verify Chrome and Edge extension pages manually.
- Browser extension Options /health connection: `not-run` - Must verify local token and /health connection in the Options page.
- VS Code/Cursor host smoke: `not-run` - Requires VS Code and Cursor installed on a validation machine.
- VS Code extension manual load and Cursor extension manual load: `not-run` - Must verify the packaged VSIX or extension folder in both hosts.
- VS Code/Cursor status bar and snapshot manual check: `not-run` - Must verify the status bar and commands inside each host.
- Windows Authenticode signed artifact: `not-run` - Requires Windows code-signing certificate and password in release environment.
- macOS notarized artifact: `not-run` - Requires Developer ID signing and Apple notarization credentials.

## Source Of Truth

- Machine-readable record: `docs/release-evidence.json`
- Schema: `docs/release-evidence.schema.json`
- Recorder: `npm run release:evidence -- --list` and `npm run release:evidence -- --set ...`
- Quality gate: `npm run release:evidence-quality -- --require-clean`
- Gap audit: `npm run release:gaps -- --require-public-release`
