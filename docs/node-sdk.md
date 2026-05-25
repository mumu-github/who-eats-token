# Node SDK

`src/sdk/client.cjs` is the lightweight client for adapters, scripts, local gateways, and OpenAI-compatible wrappers. It does not start background services; it only talks to the local Who Eats Token API.

## Basic Usage

```js
const { createWhoEatsTokenClient } = require("who-eats-token/sdk");

const client = createWhoEatsTokenClient({
  token: process.env.WHO_EATS_TOKEN_API_TOKEN
});

await client.postUsageEvent({
  provider: "openai",
  tool: "my-script",
  model: "gpt-4.1",
  input_tokens: 1200,
  output_tokens: 320,
  confidence: "reported"
});
```

If no `token` is provided, the SDK tries to read the local token file:

- Windows: `%APPDATA%\who-eats-token\api-token.txt`
- macOS: `~/Library/Application Support/who-eats-token/api-token.txt`

## Local Health

Use `getHealth()` for a cheap local app and provider-health probe before requesting the full `/snapshot`.

```js
const health = await client.getHealth();
if (health.ok) {
  console.log(health.body.providerHealth.summary);
}
```

`/health` is compact: it returns local API state, ingest counters, and compact `providerHealth`, but not full settings, system metrics, or full provider objects.

## OpenAI-Compatible Response

```js
await client.reportOpenAIResponse(response, {
  provider: "hermes",
  tool: "Hermes",
  source: "node-sdk-openai-compatible-response"
});
```

Supported usage fields:

- `usage.prompt_tokens`
- `usage.completion_tokens`
- `usage.input_tokens`
- `usage.output_tokens`
- `usage.total_tokens`

If `usage` is missing, the SDK returns `{ ok: false, skipped: "missing-usage" }` and does not throw by default.

## Design Constraints

- Endpoint is restricted to `127.0.0.1` or `localhost`.
- Default timeout is short, so monitoring cannot slow down model calls.
- Default behavior is best-effort and no-throw.
- Never read or send prompts, completions, API keys, cookies, or local access tokens as event metadata.

## Tests

```powershell
npm run test:node-sdk
npm run test:local-health
```
