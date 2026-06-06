# Adapter Contribution Checklist

Use this checklist before opening or reviewing an adapter PR. It keeps community adapters small, auditable, and privacy-safe.

## Catalog Metadata

Every adapter entry in `adapters/catalog.json` must include:

- `id`, `name`, `type`, `status`, `platforms`, and `entrypoints`.
- `docs` links that explain setup, data source, disable path, privacy boundary, performance boundary, and manual validation.
- `checks` with the npm scripts or host checks maintainers can actually run.
- `providedSignals` with only the signals the adapter really implements.
- `privacyBoundary`, `performanceBoundary`, and `disablePath` in plain reviewer-readable text.

Do not mark a new adapter `supported` until it is on the release path and has real Windows/macOS or host smoke evidence. Use `planned` for design placeholders and `reference` for runnable examples.

## Signal Metadata

`providedSignals` is the compatibility contract. Claim only exact signals such as `usage-events`, `quota-capacity`, `quota-token-plan`, `context-window`, `hud-overlays`, `local-health`, `snapshot-read`, or `status-display`.

Each signal must name a source and trust level in docs or code comments when the value can be estimated, delayed, cached, missing, or auth-expired. UI code must not infer extra capability from a broad provider name.

## Disable Path

Document how a user can stop the adapter without uninstalling Who Eats Token:

- Browser extension: extension toggle, host permission removal, or Options disable switch.
- IDE extension: workspace/user setting and command palette disable path.
- Gateway or SDK wrapper: environment variable, config flag, or removing the wrapper import.
- CLI importer or skill: do nothing unless the user runs it explicitly.

The adapter must fail quietly when the desktop app or local token is missing.

## Privacy Boundary

Reject the PR if prompts, completions, source files, API keys, bearer tokens, cookies, local access tokens, raw databases, raw logs, or account screenshots are posted to `/events`, `/overlays`, logs, fixtures, docs, or public issues.

Allowed data is compact metadata: token counts, model ids, provider ids, quota windows, credit balances, status labels, confidence/source labels, local health, and HUD avoidance rectangles. Browser page state must be sanitized through an allowlist before it leaves the content script.

## Performance Budget

Adapters should be event-driven where possible. If a poll is unavoidable, document the interval, cache window, timeout, retry/backoff behavior, and queue bounds.

Required boundaries:

- Short local HTTP timeouts.
- Bounded queues, caches, and logs.
- No watchdog loop that repeatedly restarts host apps or services.
- No broad DOM scanning, source-tree walking, or per-second cloud billing checks.
- No runtime behavior that makes the desktop HUD laggy when the adapter host is idle.

## Review Commands

Use the npm 11-safe separator form when passing flags through `npm run`:

```powershell
npm run test:adapter-catalog
npm run adapter:review -- -- --id <adapter-id>
npm run adapter:fixture -- -- --json
npm run test:adapter-contribution
npm run release:check
```

Use direct Node script calls only when documenting a maintainer-only debugging path, for example `node scripts/adapter-review.mjs --id <adapter-id>`.

## PR Checklist

- Catalog entry is present and minimal.
- `providedSignals` matches real behavior.
- Disable path is documented and tested or manually checked.
- Privacy boundary explicitly excludes prompts, completions, source files, API keys, cookies, and local tokens.
- Performance boundary covers polling, retries, queues, and cache windows.
- Fixture/review commands above pass, or the PR explains why a host-only signal cannot be simulated.
- Manual Windows/macOS or host validation is documented for every claimed platform.
