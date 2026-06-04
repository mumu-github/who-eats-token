# Manual Validation Checklist

Automated checks catch syntax, protocol, packaging config, and low-memory rules. A release candidate still needs real Windows/macOS behavior checks.

Generate a platform-specific checklist before manual validation:

```powershell
npm run manual:preflight -- --platform windows
npm run manual:preflight -- --platform macos
npm run manual:preflight -- --platform all --json
npm run adapter:manual-readiness
npm run signing:readiness -- --platform all
npm run validation:next
npm run validation:template -- --target browser
```

Use `npm run validation:next -- --target browser|ide|macos|signing` when assigning a specific manual validation task. It reads the current recorded evidence and prints only the remaining checks plus the matching `release:evidence` commands.

Use `npm run validation:template -- --target browser|ide|macos|signing` when handing work to a tester. It prints the remaining actions, checklist items, required note fields, and exact record commands without marking anything passed.

## Recorded Source-Beta Evidence

The source-beta release already has reviewer-facing validation evidence in `docs/release-evidence.json` and the generated `docs/release-evidence.md` report:

- Windows packaged runtime smoke passed on 2026-05-24 with `npm run smoke:packaged-win`.
- Windows packaged 10-minute soak passed on 2026-05-24 with stable memory and quiet CPU.
- Windows HUD desktop/tool placement was manually checked; Windows has no macOS Accessibility or Screen Recording permission gate.
- Browser adapter host smoke covered Chrome for Testing 149.0.7827.22 and Edge 148.0.3967.83, including extension load and Options `/health`.
- Browser adapter manual connection passed in Chrome for Testing and Edge; `/health` returned HTTP 200 and reported connected local providers without recording the local token.
- IDE adapter host smoke and manual VSIX install passed on VS Code 1.121.0 and Cursor 3.5.33.
- IDE adapter partial manual connection now has VS Code 1.122.1 evidence: an isolated VS Code profile loaded the VSIX, showed the local `/health` status bar summary, executed Refresh Token Status, and copied a structured `/snapshot` JSON. Cursor 3.6.21 still needs a logged-in host check because isolated and default profiles stopped at the Cursor login screen.
- Dependency audit passed on 2026-05-25 with zero high-severity vulnerabilities.

Remaining honest gaps before a public binary release:

- Real macOS packaged smoke, 10-minute soak, and permission-state HUD checks.
- Cursor status bar, refresh command, and copy snapshot manual checks.
- Windows Authenticode signing and macOS notarization.

## Windows 10+

- `npm run package:dir` succeeds.
- `npm run smoke:packaged-win` succeeds.
- `npm run soak:packaged-win` succeeds.
- `npm run test:hud-stability` succeeds.
- `npm run test:window-detection` succeeds.
- App starts from unpacked package.
- Desktop top bar appears only on desktop.
- Taskbar previews, tray overflow, Start menu, ordinary popups, and full-screen apps hide both the desktop top bar and in-tool HUD.
- Opening the app settings window from the desktop top bar keeps the top bar visible for live preview.
- In-tool HUD appears in Codex/Hermes and does not cover send buttons.
- Switching from Codex/Hermes to File Explorer allows rename/edit focus immediately and removes the stale in-tool HUD.
- Opening a plain cmd or PowerShell window does not inherit the Codex/Hermes HUD or move it to the terminal.
- Closing from tray exits all app windows and local servers.
- Local API responds on `127.0.0.1:17667/snapshot`.
- Local `/snapshot` contains `ingest`, `bridges`, `system`, `settings`, and `providers`.
- Hermes bridge responds on `127.0.0.1:17668/health` when Hermes is enabled.
- CPU is quiet when idle for 10 minutes.
- Memory does not grow continuously over 10 minutes.
- Start-at-login toggle persists and does not error.

## macOS

- `npm run package:dir` succeeds.
- `npm run smoke:packaged-mac` succeeds.
- `npm run soak:packaged-mac` succeeds.
- `npm run test:hud-stability` succeeds.
- `npm run test:window-detection` succeeds.
- App starts from unpacked package.
- Finder desktop detection shows the top bar only on desktop.
- HUD placement works with Accessibility and Screen Recording permissions granted.
- With Accessibility or Screen Recording denied, the app does not crash, does not show stale HUD placement, and still exposes `/snapshot`.
- Local API responds on `127.0.0.1:17667/snapshot`.
- Local `/snapshot` contains `ingest`, `bridges`, `system`, `settings`, and `providers`.
- CPU is quiet when idle for 10 minutes.
- Memory does not grow continuously over 10 minutes.

## Browser Extension

- `npm run package:browser-extension` succeeds.
- `npm run adapter:manual-readiness` shows the browser artifact and available Chrome/Edge hosts.
- `npm run smoke:browser-hosts -- --require` succeeds for automatable hosts. Official Chrome 137+ may be reported as a policy skip; use manual load or Chrome for Testing/Chromium for automated host smoke.
- Chrome loads `adapters/browser-extension` unpacked.
- Edge loads `adapters/browser-extension` unpacked.
- Options test connection succeeds with local token through `/health`.
- Hermes Web UI reports overlay hints when dialogs/buttons appear.
- Non-matching websites do not inject the content script.
- Hermes HUD behavior in Chrome/Edge matches the desktop app rules: only Hermes pages show it, unrelated tabs hide it, and overlapping dialogs trigger hide or reposition.

## IDE Adapter

- `npm run package:vscode-extension` succeeds.
- `npm run adapter:manual-readiness` shows the VSIX artifact and available VS Code/Cursor hosts.
- `npm run smoke:ide-hosts -- --require` succeeds on a validation machine with VS Code and Cursor installed.
- VS Code Extension Development Host loads `adapters/vscode-extension`.
- Status bar shows compact local `/health` state or a clear disconnected state.
- Refresh command works.
- Copy snapshot command works.
- Cursor can manually load the VSIX or extension folder.

## Cute But Quiet Visual QA

- Desktop top bar is centered, does not cover desktop icons that are being selected, and never appears inside an active work app.
- Desktop top bar and in-tool HUD are never visible at the same time.
- Codex in-tool HUD stays in the bottom-right work area, uses Codex provider data, and does not fall back to Hermes when Codex has live quota.
- Hermes in-tool HUD stays near the configured chat boundary, uses Hermes Token Plan data, and hides only when it actually overlaps a dialog or send control.
- Quota text, mini chart fill, warning pill, and `delight` label agree with the same remaining value.
- 75%+ remaining feels relaxed (`放心吃` or `刚刚好`) without urgent animation.
- 20%-44% remaining shows a caution tone (`省着吃`) without stealing focus.
- Below 20% remaining shows a clear warning (`省着点`, `快见底`, or equivalent) and does not repeat noisy alerts while the value stays in the same band.
- Delayed, stale, estimated, missing, and auth-expired data states are visibly different from live quota.
- Reduced-motion mode stops decorative movement while keeping numeric quota, chart values, and warning state readable.
- CPU remains quiet and memory does not grow continuously during a 10-minute idle desktop check with the top bar visible.
- No new image, animation, or mascot asset is larger than the asset budget in `docs/token-tracker-lessons.md` unless the release notes explain why.

## Failure Cases

- App closed: adapters fail quietly.
- Missing token: browser/IDE requests show a clear local auth failure.
- Hermes unavailable: Hermes provider shows missing/delayed, not stale live data.
- Xiaomi cookie expired: Xiaomi Token Plan shows auth-expired/missing, not fake live data.
