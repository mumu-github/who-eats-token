# Security Policy

## Supported Versions

This project is still pre-1.0. Security fixes target the latest `main` branch.

## Local Trust Boundary

Who Eats Token is designed as a local desktop monitor. By default it binds local HTTP services to `127.0.0.1`:

- `17667`: local ingest and snapshot API
- `17668`: optional Hermes bridge API

Browser-origin requests must come from localhost or an installed browser extension origin and include the local access token stored at:

```text
Windows: %APPDATA%\who-eats-token\api-token.txt
macOS: ~/Library/Application Support/who-eats-token/api-token.txt
```

Local CLI or SDK requests without an `Origin` header are allowed for compatibility, but integrations should still send `X-Who-Eats-Token`.

For a reviewer-facing map of assets, trust boundaries, abuse cases, and release checks, see [docs/threat-model.md](docs/threat-model.md).

## Secret Handling

Never commit or share these files:

- `%APPDATA%\who-eats-token\api-token.txt`
- `%LOCALAPPDATA%\hermes\xiaomi-platform-cookie.txt`
- `%LOCALAPPDATA%\hermes\.env`
- `~/Library/Application Support/who-eats-token/api-token.txt`
- `~/Library/Application Support/hermes/xiaomi-platform-cookie.txt`
- `~/Library/Application Support/hermes/.env`
- any copied provider cookies, bearer tokens, API keys, SQLite databases, or raw NDJSON logs

The Xiaomi platform cookie is equivalent to a login credential. If it is exposed, refresh it by signing out and signing in again on the Xiaomi platform.

Before publishing source or attaching diagnostics, run:

```powershell
npm run secret:scan
```

The scan is local and static. It skips build outputs and dependencies, then checks repository text files for Xiaomi platform cookies, OpenAI/Anthropic/GitHub-style tokens, bearer tokens, local API tokens, and private-key material. Placeholder examples such as `...`, `<redacted>`, or `你的 Cookie` are allowed.

## Third-Party UI Injection

The Hermes Web UI overlay is opt-in. The app does not modify Hermes Web UI files on normal startup. Run `npm run install:hermes-overlay` only if you want DOM-level HUD avoidance inside Hermes Web UI.

The browser extension adapter is the preferred open-source path for web tools because it is installed and disabled through the browser, uses explicit host permissions, and still requires the local access token.

## Reporting a Vulnerability

Please avoid opening public issues that contain secrets, cookies, local tokens, or account screenshots. Report with:

- affected version or commit
- operating system
- local port or integration involved
- steps to reproduce
- redacted logs or screenshots

Until a private reporting channel exists, create a public issue with the sensitive parts removed and mention that details can be shared privately.
