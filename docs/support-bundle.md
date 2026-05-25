# Support Bundle

`npm run support:bundle` is the maintainer-friendly first attachment for public bug reports, performance reports, and "HUD disappeared or feels laggy" triage.

It aggregates the existing one-shot guards into one redacted report. It does not poll, does not launch Electron, does not start a sampler, inspect browser pages, read prompts, read completions, collect provider cookies, collect API keys, dump raw databases, or include local file paths.

## Commands

Human-readable:

```powershell
npm run support:bundle
```

Machine-readable for GitHub issues, skills, plugins, and maintainer tools:

```powershell
npm run support:bundle -- --json
```

Fail in automation when static guards or critical runtime findings fail:

```powershell
npm run support:bundle -- --json --require-clean
```

Custom local API endpoint:

```powershell
npm run support:bundle -- --endpoint http://127.0.0.1:17667 --token $env:WHO_EATS_TOKEN_API_TOKEN
npm run support:bundle -- --endpoint http://127.0.0.1:17667 --token $env:WHO_EATS_TOKEN_API_TOKEN --timeout-ms 1000 --json
```

## What It Includes

- `release:summary` for current release guard and public blocker state
- `compatibility:matrix` for Windows/macOS, adapter, signal, and blocker coverage
- `performance:summary` for dependency weight, interval risk, adapter boundaries, and recorded soak evidence
- `delight:contract` for cute-but-cheap interaction rules and warning thresholds
- `lag:triage` for CPU, memory, app RSS, provider freshness, overlay avoidance, or app-unavailable classification
- `diagnostics` for provider/stability state with a shared redaction boundary

## What It Excludes

- provider API keys
- Xiaomi or other provider cookies
- local access tokens
- prompts, completions, raw chat logs, and message text
- raw SQLite/database contents
- local user paths and account screenshots

## How To Use It

Use the support bundle before changing HUD positioning, hiding, or animation code. The bundle separates static release/readiness failures from live runtime causes, so a stale quota issue, active overlay avoidance rectangle, high CPU, high memory, or closed desktop app does not get misdiagnosed as a visual regression.

For public issues, attach the JSON output and describe the active app/tool window. For local-only debugging, the text output is usually enough to pick the next focused command.

## Checks

```powershell
npm run test:support-bundle
npm run test:performance-budget
npm run test:docs
npm run release:check
```
