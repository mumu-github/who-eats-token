# Diagnostics

## HUD Or Top Bar Missing

Check:

- `npm run diagnostics -- --json`
- `npm run status -- --json`
- `npm run release:check`
- active app/window detection in `src/system/active-window.cjs`
- provider enablement in settings
- whether another app instance owns the single-instance lock

Do not reset HUD placement or styling unless the symptom is specifically placement/styling.

## Stale Or Wrong Quota

Check:

- `npm run diagnostics -- --json`
- `npm run status -- --json`
- `/snapshot` from local API
- provider `confidence`, `source`, and `rateLimitsTrust`
- Codex JSONL `token_count` availability
- Hermes local SQLite state
- Xiaomi cookie freshness if Xiaomi Token Plan is enabled

Do not label estimated data as live.

## Lag Or High CPU

Check:

- `npm run diagnostics -- --json`
- `npm run stability -- --json`
- `npm run test:performance-budget`
- packaged smoke RSS/CPU output
- DOM code for `setInterval`, full-document scans, or unbounded observers
- watchdog/restart loops
- debug HUD log state

The browser extension and injected overlay must be event-driven.

Use the diagnostics bundle for public issue triage because it is redacted by construction and excludes cookies, tokens, prompts, completions, raw databases, and local paths.

## Packaging Failure

Check:

- `npm run test:packaging`
- `electron-builder.yml`
- app icon size
- Windows symlink/signing helper errors
- macOS signing/notarization environment

Use `npm run package:dir` for contributor smoke packages; reserve `dist:*` for release environments.
