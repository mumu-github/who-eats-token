# Provider Adapter Template

Copy this folder when proposing a new provider-specific adapter. Replace every `example-provider` placeholder before opening a pull request.

## Purpose

- Adapter id: `example-provider`
- Tool/provider: `Example Provider`
- Integration surface: `official-api | local-gateway | browser-extension | ide-extension | sdk-wrapper`
- Supported platforms: `windows`, `macos`
- Data source: official usage response, billing API, local gateway response, or explicit user-provided event.
- `providedSignals`: declare only the real signals this adapter implements, such as `usage-events`, `quota-capacity`, `quota-token-plan`, `context-window`, `hud-overlays`, `local-health`, or `status-display`.

## Data Contract

This adapter may report only:

- provider id
- model id
- input/output/total token counts
- quota windows or credit balances
- confidence/source labels
- token accuracy labels (`official-usage`, `tokenizer`, `heuristic`, or `unknown`)
- small scalar metadata needed for debugging

This adapter must not report:

- prompts or completions
- source files
- API keys, bearer tokens, session cookies, or local access tokens
- raw databases, raw logs, screenshots, or account pages

## Runtime Rules

- Fail quietly when Who Eats Token is not running.
- Use `X-Who-Eats-Token` for every local request, including CLI/SDK calls without an `Origin` header.
- Keep request timeouts short.
- Avoid unbounded queues, watchdog loops, and per-second provider polling.
- Respect provider cache windows for billing or quota APIs.
- Provide a user-visible disable path.

## Required Changes

- Add or update implementation files.
- Add an entry to `adapters/catalog.json`.
- Keep `providedSignals` aligned with the actual implementation and tests.
- Add an adapter-specific test or extend an existing one.
- Update docs for setup, data source, privacy boundary, performance boundary, and manual validation.
- Run:

```powershell
npm run test:protocol
npm run test:adapter-catalog
npm run adapter:review -- -- --id your-adapter-id
npm run adapter:fixture -- -- --json
npm run test:adapter-contribution
npm run release:check
```

`npm run adapter:fixture -- -- --json` runs an isolated local compatibility simulator. Use it before touching a real host to confirm usage events, quota/window signals, overlay rectangles, provider health, low-quota attention, and prompt/API-key/cookie/source-file redaction.

Use [docs/adapter-review.md](../../../docs/adapter-review.md) as the PR review checklist.
