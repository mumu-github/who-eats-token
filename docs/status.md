# Status Command

`npm run status` is the lightweight local doctor surface for Who Eats Token.

It reads the desktop app's local `/snapshot`, reuses `providerHealth`, and prints a compact provider summary. It does not inspect prompts, files, windows, browser pages, or external services.

For adapters and extensions that only need a cheap liveness check, use `GET /health` or the Node SDK `client.getHealth()`. `npm run status` still uses `/snapshot` because it is a human-facing doctor command and benefits from the full aggregate view.

## Commands

Human-readable:

```powershell
npm run status
```

Machine-readable for skills, plugins, and issue reports:

```powershell
npm run status -- -- --json
```

For public issue reports, prefer `npm run diagnostics -- -- --json` because it includes this provider status plus stability findings with an explicit redaction contract.

Custom local API endpoint:

```powershell
npm run status -- -- --endpoint http://127.0.0.1:17667 --token $env:WHO_EATS_TOKEN_API_TOKEN
```

## Output Meaning

The command reports:

- local API endpoint and listening state
- collected timestamp
- live, delayed, estimated, missing, disabled, planned, and attention counts
- each provider's `providerHealth.status`
- quota delight label such as `放心吃`, `省着吃`, `省着点`, `慢半拍`, or `等开饭`
- lowest remaining percentage, display mode, freshness, and reason

Use it before changing HUD placement or styling. If `status` says the data is missing, delayed, disabled, or auth-expired, fix the provider/adaptor path first.

## Checks

```powershell
npm run test:status
npm run release:check
```
