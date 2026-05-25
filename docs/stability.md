# Stability Report

`npm run stability` is a one-shot diagnostic for lag, memory pressure, provider freshness, and local API health. It is meant for issue reports, doctor skills, and release validation notes.

It reads the desktop app's local `/snapshot`, reuses `providerHealth`, and exits. It does not poll, inspect windows, read browser pages, or collect prompts, completions, files, API keys, or cookies.

When the symptom is simply "it feels laggy" and the cause is unclear, start with `npm run lag:triage`. It combines this live stability snapshot with the static low-memory gates from `npm run performance:summary`, then suggests the next focused command.

For public issues or repeated regressions, start with `npm run support:bundle -- --json` instead. It includes lag triage, diagnostics, release summary, compatibility matrix, performance summary, and delight contract in one redacted report.

## Commands

Human-readable:

```powershell
npm run stability
```

Machine-readable:

```powershell
npm run stability -- --json
```

Lag triage:

```powershell
npm run lag:triage
npm run lag:triage -- --json
```

Full support bundle:

```powershell
npm run support:bundle
npm run support:bundle -- --json
```

For public issue reports, prefer `npm run support:bundle -- --json` because it includes this stability report, provider status, lag classification, and static guard state with an explicit redaction contract.

Fail in automation when severe findings are present:

```powershell
npm run stability -- --fail-on critical
npm run stability -- --fail-on warning
```

Custom local API endpoint:

```powershell
npm run stability -- --endpoint http://127.0.0.1:17667 --token $env:WHO_EATS_TOKEN_API_TOKEN
```

## What It Reports

- local API endpoint and collected timestamp
- CPU percent, memory used/free percent, app RSS, and heap usage from the app snapshot
- ingest listening/error/overlay state
- provider health summary, including attention, delayed, missing, estimated, and stale data
- low-memory configuration risks such as too-fast refresh intervals or debug HUD logging
- findings grouped by `critical`, `warning`, and `info`

`lag:triage` adds:

- static interval and adapter-boundary status from `performance:summary`
- likely-cause grouping for CPU pressure, memory pressure, app RSS, stale provider data, overlay avoidance, or app-unavailable cases
- next actions that avoid jumping straight into HUD code changes

## How To Use Findings

- `cpu-critical`, `memory-critical`, or `app-rss-high`: run packaged soak next and compare against [docs/performance-budget.md](performance-budget.md).
- `provider-attention`, `provider-delayed`, `provider-missing`, or `provider-stale`: fix the provider or adapter path before changing HUD visuals.
- `ingest-not-listening` or `ingest-error`: verify the local API port and token setup before checking browser/IDE adapters.
- `overlays-active`: a web/adapter overlay is currently telling the HUD to avoid UI; useful when diagnosing "HUD disappeared" reports.
- `refresh-too-fast`, `active-window-too-fast`, or `debug-hud-enabled`: restore low-memory settings before profiling.

## Checks

```powershell
npm run test:stability
npm run test:lag-triage
npm run test:support-bundle
npm run release:check
```
