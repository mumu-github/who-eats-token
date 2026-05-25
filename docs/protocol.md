# Local Protocol

Who Eats Token exposes a localhost protocol for adapters. The protocol is intentionally small so browser extensions, IDE extensions, MCP servers, CLI wrappers, and local gateways can all report usage without linking to the desktop app internals.

## Security Boundary

- Base URL: `http://127.0.0.1:17667`
- Browser-origin requests must come from `localhost`, `127.0.0.1`, or an installed extension origin such as `chrome-extension://...`.
- Browser-origin requests must include `X-Who-Eats-Token`.
- CLI/SDK requests without an `Origin` header are accepted for local compatibility, but adapters should still send the token.
- Do not send provider API keys, cookies, prompts, completions, or full chat content.
- The ingest normalizer drops sensitive metadata keys and obvious secret-looking values as a safety net, but adapters should still avoid collecting them in the first place.

## Usage Event

Endpoint:

```text
POST /events
```

Schema:

```json
{
  "schema": "who-eats-token.usage.v1",
  "timestamp": "2026-05-24T12:00:00.000+08:00",
  "provider": "openai",
  "tool": "cursor",
  "model": "gpt-4.1",
  "request_id": "optional-stable-id",
  "session_id": "optional-session-id",
  "input_tokens": 1200,
  "output_tokens": 480,
  "total_tokens": 1680,
  "cost_usd": 0.0078,
  "confidence": "reported",
  "source": "openai-compatible-response-usage",
  "rate_limits": {
    "limit_id": "codex",
    "plan_type": "pro",
    "primary": {
      "remaining_percent": 72,
      "window_minutes": 300,
      "resets_at": "2026-05-24T18:00:00+08:00"
    },
    "secondary": {
      "remaining_percent": 88,
      "window_minutes": 10080,
      "resets_at": "2026-05-31T09:20:00+08:00"
    }
  },
  "context": {
    "used_tokens": 42000,
    "limit_tokens": 200000,
    "remaining_percent": 79,
    "source": "provider-context-window"
  },
  "metadata": {
    "adapter": "example-wrapper",
    "version": "0.1.0"
  }
}
```

Accepted aliases:

- `input_tokens` or `inputTokens`
- `output_tokens` or `outputTokens`
- `total_tokens` or `totalTokens`
- `cost_usd` or `costUsd`
- `request_id` or `requestId`
- `session_id` or `sessionId`
- `rate_limits` or `rateLimits`
- `remaining_percent` or `remainingPercent`
- `used_percent` or `usedPercent`
- `window_minutes` or `windowMinutes`
- `resets_at` or `resetsAt`

Field rules:

| Field | Required | Notes |
| --- | --- | --- |
| `provider` | recommended | Lowercase id after normalization, for example `openai`, `anthropic`, `gemini`, `hermes`, `cursor`. |
| `tool` | optional | User-facing tool/app name, for example `Codex`, `Cursor`, `Hermes`. |
| `model` | optional | Defaults to `unknown`. |
| `input_tokens` / `output_tokens` | recommended | Non-negative numbers. |
| `total_tokens` | optional | If only total and output are known, input is inferred as `total - output`. |
| `confidence` | optional | One of `reported`, `estimated`, `derived`, `manual`, `unknown`. |
| `rate_limits` | optional | Use when provider returns quota windows. |
| `context` | optional | Use when the useful limit is context-window capacity, not account quota. |
| `metadata` | optional | Small scalar values only; no prompts or secrets. |

At least token usage or rate-limit data must be present. Empty events are rejected.

## Overlay Report

Endpoint:

```text
POST /overlays
```

Use this only for UI avoidance. It should describe rectangles that the HUD should not cover, not page content.

```json
{
  "schema": "who-eats-token.overlay.v1",
  "timestamp": "2026-05-24T12:00:00.000+08:00",
  "source": "hermes-web-ui-dom",
  "url": "http://localhost:8648",
  "title": "Hermes",
  "overlays": [
    {
      "type": "content-interactive",
      "label": "send-button",
      "bounds": {
        "x": 1540,
        "y": 820,
        "width": 120,
        "height": 64
      }
    }
  ]
}
```

Overlay reports expire quickly and are not persisted.

## Snapshot

Endpoint:

```text
GET /snapshot
```

Returns the desktop app's current aggregate snapshot when served by the packaged app: native collectors such as Codex/Hermes, local ingest summaries, bridge status, system metrics, public settings, provider summaries, and `providerHealth`.

`providerHealth` is a compact status surface for HUDs, MCP clients, doctor workflows, and future plugins. It is derived from the same snapshot data and does not perform extra polling. Each provider health entry includes:

- `status`: `live`, `estimated`, `delayed`, `suspect`, `missing`, `auth-expired`, `planned`, or `disabled`
- `displayMode`: `capacity`, `token-plan`, `context`, `usage`, or `missing`
- `delight`: a low-cost, quota-driven interaction state such as `放心吃`, `省着吃`, `省着点`, `慢半拍`, or `等开饭`
  - `id`/`mood`: stable state id, for example `comfy`, `steady`, `tight`, `low`, `lagging`, or `waiting`
  - `tone`, `severity`, and `priority`: styling and alert urgency without each adapter inventing its own thresholds
  - `motion` and `cue`: event-driven hints for CSS-only charts or optional mascot poses; `cue.reducedMotion` must stay `static`
  - `alert`/`attention`: true only for states that deserve user attention, such as low quota, stale quota, or expired auth
- remaining percentages for 5-hour, weekly, token-plan, and context signals when available
- freshness, reason, source, confidence, and the latest model when available

If the ingest server is embedded without a desktop snapshot callback, it falls back to the local `/events` summary only.

## Health

Endpoint:

```text
GET /health
```

Returns a compact local health payload for adapters, browser extensions, IDE extensions, SDK wrappers, skills, and plugins that only need to know whether the desktop app is alive and whether provider health is available.

`/health` uses the same local origin and `X-Who-Eats-Token` rules as `/snapshot`, but intentionally omits full settings, system metrics, and full provider objects. It returns:

- `ok`, `service`, `port`, `listening`, and local API error state
- `snapshotAvailable` and `snapshotError`
- compact ingest counters: `eventCount`, `recentEventCount`, and `overlayCount`
- compact `providerHealth.summary`
- compact `providerHealth.providers` with status, display mode, remaining percentages, freshness, and quota delight state

Adapters should prefer `/health` for startup checks and only call `/snapshot` when they need the full aggregate view.

## Adapter Requirements

- Batch events when possible, but keep each payload under 1 MB.
- Do not poll provider APIs aggressively; respect provider cache windows.
- Use `confidence=reported` only when usage came from an official response or billing API.
- Use `confidence=estimated` for tokenizer or local message-length estimates.
- Include `source` so users can tell live data from guesses.
- Treat secrets as write-only local config, never event metadata.
