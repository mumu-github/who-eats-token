# Contributing

Thanks for helping make Who Eats Token stable across tools and systems.

## Development Setup

```powershell
npm install
npm start
```

Useful checks:

```powershell
npm run check
npm run test:protocol
npm run test:adapter-catalog
npm run adapter:review
npm run adapter:fixture
npm run support:bundle -- --json
npm run test:adapter-contribution
npm run demo:api
npm run test:hermes-bridge
```

## Project Rules

- Keep integrations local-first unless a provider API explicitly requires network access.
- Do not commit cookies, API keys, bearer tokens, local databases, raw logs, or screenshots containing account secrets.
- Browser-origin local API calls must stay restricted to localhost and require the local access token.
- Hermes Web UI DOM overlay changes must remain opt-in and documented.
- Avoid broad polling, shell inspection, or debug logging that can make the desktop feel laggy.
- When changing HUD placement or hiding rules, test both desktop top bar and in-tool right-bottom HUD behavior.
- New adapters must follow `docs/protocol.md`, `docs/adapter-guide.md`, `docs/adapter-review.md`, and `adapters/catalog.json`.

## Adding an Adapter

1. Start from `adapters/templates/provider-adapter`.
2. Add or update implementation files and docs.
3. Add an entry to `adapters/catalog.json`.
4. Keep the adapter local-first and make it fail quietly when the desktop app is closed.
5. Do not send prompts, completions, source files, API keys, cookies, bearer tokens, local access tokens, raw databases, or screenshots to `/events`, `/overlays`, logs, or issues.
6. Document the disable path and the manual Windows/macOS validation path.
7. Run:

```powershell
npm run test:protocol
npm run test:adapter-catalog
npm run adapter:review -- --id your-adapter-id
npm run adapter:fixture -- --json
npm run test:adapter-contribution
npm run release:check
```

## Adding a Provider

Prefer this order:

1. Official provider usage or billing API.
2. Local gateway or SDK wrapper that returns usage.
3. Explicit user-provided events posted to the ingest API.
4. Clearly labeled estimates when exact usage is unavailable.

Provider output should include the source and confidence so the UI can explain whether data is live, estimated, delayed, or missing.

## Pull Request Checklist

- `npm run check` passes.
- `npm run test:protocol` passes when event, overlay, or adapter code changed.
- `npm run test:adapter-catalog`, `npm run adapter:review -- --id <adapter-id>`, `npm run adapter:fixture -- --json`, and `npm run test:adapter-contribution` pass when adapter docs, templates, or catalog entries changed.
- `npm run support:bundle -- --json` was run for bug, performance, diagnostics, or provider-routing changes.
- Relevant provider or bridge test passes.
- README or privacy/security docs are updated if data sources, ports, secrets, or third-party file writes changed.
- UI changes were checked at desktop and app-window sizes.
