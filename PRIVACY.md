# Privacy

Who Eats Token is a local-first desktop monitor. It does not include telemetry, analytics, or a hosted backend.

## Data Read Locally

Depending on enabled providers, the app may read:

- Codex Desktop local session JSONL files containing `token_count` events
- Hermes local SQLite state at `%LOCALAPPDATA%\hermes\state.db` or `~/Library/Application Support/hermes/state.db`
- optional Xiaomi platform cookie or `.env` values under the Hermes data directory
- local events posted to `http://127.0.0.1:17667/events`

## Data Stored Locally

The app stores settings and a local API token under:

```text
Windows: %APPDATA%\who-eats-token
macOS: ~/Library/Application Support/who-eats-token
```

Debug HUD logs are disabled by default. If explicitly enabled with `behavior.debugHud` or `WHO_EATS_TOKEN_DEBUG_HUD=1`, logs are capped and stored locally.

## Network Activity

Normal operation stays on localhost. The optional Hermes bridge forwards requests to the local Hermes gateway. Xiaomi Token Plan sync uses the Xiaomi platform only when a Xiaomi platform cookie is configured.

The optional browser extension adapter talks only to the local ingest API unless a supported page explicitly sends a usage event through the extension. Its DOM overlay reports contain rectangles and short control labels, not chat content.

## Sensitive Inputs

Do not paste cookies, API keys, account tokens, or full local databases into public issues. Redact values before sharing screenshots or logs.

For release candidates and public issue triage, maintainers should run `npm run secret:scan` before publishing source snapshots or attaching copied local output. The scanner is a local static guard for common provider keys, Xiaomi platform cookies, bearer tokens, local API tokens, and private-key material.

## Prompt And Content Boundary

Who Eats Token does not collect, store, or transmit prompt text, completions, full chat content, source files, workspace contents, API keys, provider cookies, bearer tokens, or local access tokens.

Adapters should report only token counts, quota windows, credit balances, model or provider labels, confidence/source labels, and compact scalar metadata needed to render usage. If an integration cannot estimate usage without reading private content, it should stay out of the default adapter catalog.
