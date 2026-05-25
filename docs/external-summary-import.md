# External Summary Import

This adapter is the lightweight interop path for tools such as TokenTracker and ccusage.

It does not parse private tool databases, install hooks, or run a background process. It accepts JSON that another tool has already exported, extracts only usage/cost/quota metadata, and posts `who-eats-token.usage.v1` events to the local desktop app.

## Why This Exists

TokenTracker and ccusage already do strong parser/reporting work. Who Eats Token should not duplicate that parsing inside the Electron runtime. Instead:

- TokenTracker/ccusage can keep owning parser breadth and historical reports.
- Who Eats Token owns ambient desktop HUD display, local `/events`, `providerHealth`, and low-cost quota delight states.
- Users can pipe trusted summaries into the HUD without adding another watcher.

## Command

Dry-run first:

```powershell
npm run import:usage-report -- --dry-run --provider codex --source tokentracker-summary path\to\summary.json
```

Live post:

```powershell
npm run import:usage-report -- --provider claude --tool ccusage --source ccusage-json path\to\ccusage.json
```

Pipe from another command:

```sh
some-usage-tool --json | npm run import:usage-report -- --provider claude --tool ccusage --source ccusage-json
```

Options:

| Option | Purpose |
| --- | --- |
| `--dry-run` | Print normalized events instead of posting to `/events`. |
| `--input <path>` or positional path | Read JSON from a file. Without a path, reads stdin. |
| `--provider <id>` | Default provider id when the summary does not include one. |
| `--tool <name>` | Default tool name, for example `TokenTracker` or `ccusage`. |
| `--source <label>` | Source label stored on the event. |
| `--model <name>` | Default model when absent. |
| `--confidence <value>` | Defaults to `derived`; use `reported` only for official provider output. |
| `--endpoint <url>` | Local Who Eats Token API endpoint. Defaults to `http://127.0.0.1:17667`. |
| `--token <value>` | Local API token. Defaults to the app data token or `WHO_EATS_TOKEN_API_TOKEN`. |

## Accepted Shapes

The importer accepts:

- a single JSON object
- an array of objects
- an object with `events`, `items`, `rows`, `records`, `summaries`, or `data`

Recognized fields include:

| Meaning | Accepted fields |
| --- | --- |
| Provider | `provider`, `provider_id`, `providerId`, `service`, `vendor` |
| Tool | `tool`, `app`, `client`, `sourceTool`, `source_tool` |
| Model | `model`, `model_id`, `modelId` |
| Input tokens | `input_tokens`, `inputTokens`, `prompt_tokens`, `promptTokens` |
| Output tokens | `output_tokens`, `outputTokens`, `completion_tokens`, `completionTokens` |
| Total tokens | `total_tokens`, `totalTokens`, `tokens`, `token_count`, `tokenCount`, `total` |
| Cost | `cost_usd`, `costUsd`, `costUSD`, `cost`, `usd`, `total_cost`, `totalCost` |
| Timestamp | `timestamp`, `date`, `day`, `created_at`, `createdAt` |

Nested `usage` objects are supported.

## Privacy Boundary

The importer does not copy prompts, completions, source files, API keys, cookies, bearer tokens, or arbitrary metadata into `/events`.

Only a small allowlist of scalar metadata is preserved: bucket, period, range, currency, source, source id, original id, and project id. This keeps interop useful without accidentally turning exported summaries into content exfiltration.

## Performance Boundary

- No background service.
- No file watcher.
- No polling loop.
- One-shot JSON normalization and best-effort local POST.
- Safe to run manually, from a scheduled job, or from another tool after it exports a summary.

## Checks

```powershell
npm run test:external-summary-import
npm run test:adapter-catalog
npm run release:check
```
