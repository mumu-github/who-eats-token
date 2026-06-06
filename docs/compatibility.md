# Compatibility

This project targets Windows 10+ and macOS as a local desktop monitor.

The generated compatibility matrix is [docs/compatibility-matrix.md](compatibility-matrix.md). Run `npm run compatibility:matrix` after changing adapters, platform claims, or release validation evidence.

## Operating Systems

| Area | Windows 10+ | macOS |
| --- | --- | --- |
| Desktop top bar | Supported | Supported through Finder desktop detection |
| In-tool HUD | Supported | Supported for native apps and browser windows reported by `get-windows` |
| Active window metadata | `get-windows`, with PowerShell fallback for dialog detection | `get-windows`; title and URL detection may require macOS Screen Recording and Accessibility permissions |
| System CPU/memory | Supported | Supported |
| Codex collector | `~/.codex/sessions` | `~/.codex/sessions` |
| Hermes local collector | `%LOCALAPPDATA%\hermes`; Xiaomi Token Plan is optional | `~/Library/Application Support/hermes`; Xiaomi Token Plan is optional |
| Local ingest API | `127.0.0.1:17667` | `127.0.0.1:17667` |
| Hermes bridge | `127.0.0.1:17668` | `127.0.0.1:17668` |

## Tool Compatibility Strategy

Prefer stable integration surfaces in this order:

1. Official provider usage or billing APIs.
2. Local gateway bridges that preserve the original request and capture response `usage`.
3. Local SDK or CLI wrappers that post usage to `/events`.
4. DOM overlays only for HUD avoidance, and only when explicitly installed.
5. Estimates only when the provider does not expose exact usage.

Each provider should label its data source and confidence so the UI can distinguish live, delayed, estimated, missing, and auth-expired data.

Hermes is treated as a generic local provider first. Xiaomi/MiMo Token Plan credits are a provider-specific quota adapter layered on top only when Xiaomi configuration, MiMo models, or a Xiaomi platform cookie is present.

## Low-Overhead Rules

- Keep debug logs off by default.
- Keep browser DOM overlays opt-in.
- Keep browser DOM scanning event-driven; no extension or injected overlay should use a persistent `setInterval`.
- Avoid polling third-party cloud APIs faster than their cache window.
- Prefer incremental file reads and bounded tail reads for local logs.
- Do not run heavy UI automation on every foreground-window check.
- Keep the automated performance gate in `npm run test:performance-budget` green.
- Keep the generated compatibility matrix current with `npm run compatibility:matrix -- -- --check`.

## Window Detection Fallbacks

`npm run test:window-detection` protects the cross-platform foreground-window rules without needing a real GUI session in CI.

- Windows uses `get-windows` first, and only falls back to PowerShell inspection for Explorer desktop checks, Hermes native windows, unreliable shell foregrounds, and selected small dialogs.
- macOS desktop checks pass `accessibilityPermission: false` and `screenRecordingPermission: false` so the top bar can decide Finder desktop visibility without prompting.
- macOS in-tool HUD checks request full active-window metadata when permissions are available. If permissions are missing, the app should hide the in-tool HUD rather than guess or show stale placement.
- Finder desktop windows, the app's own overlay windows, tiny tooltips, and offscreen windows are ignored as desktop blockers.

## Current Gaps

- Packaging config and CI artifact workflow are wired, but signed public installers still need release-certificate validation.
- macOS HUD placement still needs real-device verification with Accessibility and Screen Recording permission states, but the fallback rules are now covered by `npm run test:window-detection`.
- Cursor, Claude, Gemini, and other tools still need provider-specific collectors or wrapper examples beyond the generic ingest API.
