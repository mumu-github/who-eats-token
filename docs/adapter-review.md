# Adapter Review Checklist

Use this checklist when reviewing new or changed adapters. The contributor-facing version is [docs/adapter-contribution-checklist.md](adapter-contribution-checklist.md). The goal is to keep Who Eats Token multi-tool compatible without letting integrations become heavy, secret-hungry, or fragile.

## Required Evidence

- `adapters/catalog.json` includes the adapter with the correct `status`, `type`, platforms, entrypoints, docs, checks, privacy boundary, performance boundary, and disable path.
- `providedSignals` says exactly which signals the adapter can provide, such as `usage-events`, `quota-capacity`, `quota-token-plan`, `hud-overlays`, `local-health`, or `status-display`.
- The implementation has an adapter-specific test, or clearly extends an existing adapter test.
- `npm run test:adapter-catalog` passes.
- `npm run adapter:review -- -- --id <adapter-id>` shows no errors.
- `npm run adapter:fixture -- -- --json` passes for adapter-facing protocol, provider-health, overlay, and redaction changes.
- `npm run adapter:guard` passes for browser/IDE adapter changes.
- `npm run test:adapter-contribution` passes.
- `npm run release:check` passes.
- Manual validation is documented for every platform claimed in the catalog entry.

## Data Boundary

Reject or request changes if the adapter sends any of these to `/events`, `/overlays`, logs, screenshots, or issue templates:

- prompts or completions
- source files or workspace contents
- API keys, bearer tokens, session cookies, local access tokens, or provider secrets
- raw databases, raw logs, account pages, or screenshots with account details

Allowed data is narrow: token counts, quota windows, credit balances, model ids, provider ids, confidence/source labels, and compact scalar metadata.

## Runtime Boundary

The adapter must:

- fail quietly when the desktop app is closed
- sanitize untrusted page or IDE payloads through an allowlist before posting to `/events`
- use short local request timeouts
- avoid persistent per-second polling
- avoid watchdog loops that restart external services repeatedly
- bound queues, caches, and logs
- respect provider cache windows for cloud billing or quota APIs
- provide a documented disable path

## Status Decisions

| Status | Review bar |
| --- | --- |
| `planned` | Request or design placeholder only. No runtime support claim. |
| `reference` | Runnable example with tests, docs, and privacy/performance boundaries. |
| `supported` | Release-path integration with platform smoke evidence and maintainer ownership. |

Do not mark a provider adapter as `supported` just because the code compiles.

## Review Command

Use the machine-readable catalog review before merging adapter changes:

```powershell
npm run adapter:review
npm run adapter:review -- -- --id browser-extension
npm run adapter:review -- -- --id <adapter-id> --json
npm run adapter:fixture -- -- --json
```

The review command is read-only. It checks docs, entrypoints, npm scripts, signal claims, privacy boundaries, performance boundaries, and status expectations, then prints the commands reviewers should run for that adapter. The fixture command starts an isolated local ingest server unless `--endpoint` is passed; it verifies that representative adapter events and overlay reports stay compatible with the shared protocol.

## Signal Decisions

| Signal claim | Review bar |
| --- | --- |
| `usage-tokens` / `usage-events` | Usage must come from official response fields, local metadata, or explicit caller-provided data. |
| `quota-capacity` | Remaining percentage and reset window must be provider-backed, cached, and visibly marked stale/estimated when needed. |
| `quota-token-plan` | Credit totals and used credits must identify source and auth state; expired credentials cannot look live. |
| `context-window` | Limit and used tokens must come from provider metadata or a documented estimate. |
| `hud-overlays` | Rectangles must be bounded, short-lived, and about UI avoidance only, not page content. |
| `local-health` / `snapshot-read` | Reads must use localhost only and short timeouts. |
| `status-display` | Display-only adapters must not claim they collect usage. |

## Form Choice

- Use a local gateway when the provider already returns `usage`.
- Use a browser extension only for web pages and HUD avoidance, with precise host permissions.
- Use an IDE extension for status display and IDE commands, not private AI interception.
- Use an SDK wrapper when the caller controls the model request.
- Use MCP for agent-facing snapshot access, not background collection.
- Use skills/plugins for setup, diagnosis, and authoring workflows, not realtime monitoring.
