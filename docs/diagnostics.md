# Diagnostics Bundle

`npm run diagnostics` is the safest default command to ask users and contributors for when something feels wrong.

It combines the compact provider status and the one-shot stability report into a redacted bundle. It does not poll, inspect browser pages, read prompts, read completions, collect cookies, collect API keys, dump local databases, or include local file paths.

For public issue reports, prefer `npm run support:bundle -- -- --json` first. It includes this diagnostics bundle plus release summary, compatibility matrix, performance summary, delight contract, and lag triage in one redacted attachment.

## Commands

Human-readable:

```powershell
npm run diagnostics
```

Machine-readable for issues, skills, plugins, and maintainer triage:

```powershell
npm run diagnostics -- -- --json
```

For first-pass lag triage, run the combined static/live view:

```powershell
npm run lag:triage
npm run lag:triage -- -- --json
```

For the full support attachment:

```powershell
npm run support:bundle
npm run support:bundle -- -- --json
```

Custom local API endpoint:

```powershell
npm run diagnostics -- -- --endpoint http://127.0.0.1:17667 --token $env:WHO_EATS_TOKEN_API_TOKEN
```

## What It Reports

- project name/version and platform/runtime
- local API endpoint and collected timestamp
- provider health summary and compact per-provider state
- CPU, memory, app RSS, local ingest state, and stability findings
- low-memory configuration signals such as refresh interval and debug HUD state
- provider registry counts grouped by source, without provider secrets or local paths
- explicit redaction metadata so issue reports have a shared privacy contract

## What It Excludes

- provider API keys
- Xiaomi or other provider cookies
- local access tokens
- prompts, completions, raw chat logs, and message text
- raw SQLite/database contents
- local user paths and account screenshots

## When To Use It

- HUD disappears or shows in the wrong tool
- Codex/Hermes quotas look stale or mixed
- the desktop feels laggy or memory usage grows
- browser or IDE adapters stop connecting
- maintainers need one attachment before deciding whether to inspect `status`, `stability`, adapter logs, or packaged smoke output

Use `npm run support:bundle -- -- --json` for public issue reports because it includes release, compatibility, performance, delight, lag, and diagnostics views with one privacy boundary. Use `npm run lag:triage -- -- --json` when a user reports "it is laggy" and you need only a likely-cause bucket before deciding what to inspect. Use `npm run status -- -- --json` when you only need provider health. Use `npm run stability -- -- --json` when the issue is specifically CPU, memory, stale quota, or local API health.

If lag triage reports `partial-snapshot`, the local API is reachable but is serving an ingest-only or stale instance instead of the full desktop runtime. Restart the desktop app, then rerun `npm run diagnostics -- -- --json` and confirm `stability.system` is populated before changing HUD positioning, hiding, or provider-routing code.

## Checks

```powershell
npm run test:diagnostics
npm run test:lag-triage
npm run test:support-bundle
npm run release:check
```
