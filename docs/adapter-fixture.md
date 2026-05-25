# Adapter Fixture

`npm run adapter:fixture` is a safe compatibility simulator for adapter authors and maintainers.

By default it starts an isolated local ingest server on a random localhost port, posts fixture events for native collectors, local gateways, browser extensions, IDE extensions, SDK wrappers, and overlay reports, then verifies `/snapshot`, `/health`, `/overlays`, provider health, low-quota attention, and secret redaction. It does not touch a running desktop app unless you explicitly pass `--endpoint`.

## Commands

Run the isolated fixture:

```powershell
npm run adapter:fixture
npm run adapter:fixture -- --json
npm run adapter:fixture -- --json --require-clean
```

Run against a live local app only when you want to intentionally add fixture events to that app's snapshot:

```powershell
npm run adapter:fixture -- --endpoint http://127.0.0.1:17667 --token $env:WHO_EATS_TOKEN_API_TOKEN
```

Use a shorter local timeout:

```powershell
npm run adapter:fixture -- --timeout-ms 750 --json
```

## Scenarios

The fixture covers:

- Codex-style 5-hour and weekly capacity windows
- Hermes-style credit-plan usage metadata through the local gateway path
- browser-extension usage plus HUD overlay rectangles
- IDE context-window reporting
- OpenAI-compatible local gateway / SDK wrapper usage events

Each scenario declares the adapter type, expected provider id, and `providedSignals` so maintainers can compare a proposed adapter with the public compatibility contract.

## Privacy Boundary

The fixture deliberately posts sensitive-looking metadata:

- prompt text
- provider API key shape
- Xiaomi platform cookie shape
- bearer token shape
- local source-file path

The report fails if any of those strings survive into `/snapshot`, `/health`, `/overlays`, or the fixture output.

## When To Use It

- before opening a PR for a new adapter
- after changing `src/protocol/usage-event.cjs`
- after changing provider health or delight classification
- when a tool claims `usage-events`, `quota-capacity`, `context-window`, `hud-overlays`, or `local-health`

Run `npm run adapter:review -- --id <adapter-id>` alongside the fixture. Review checks the catalog entry; the fixture checks whether the local protocol can safely carry the signals a real adapter would emit.

## Checks

```powershell
npm run test:adapter-fixture
npm run test:adapter-contract
npm run adapter:guard
npm run release:check
```
