# Adapter Guide

Adapters make Who Eats Token multi-tool compatible without bloating the desktop app. An adapter should be small, local-first, and easy to disable. Use [docs/adapter-contribution-checklist.md](adapter-contribution-checklist.md) before opening a community adapter PR.

## Adapter Types

当前支持状态以 [Adapter Catalog](adapter-catalog.md) 和 `adapters/catalog.json` 为准。
新增工具请从 `adapters/templates/provider-adapter` 开始，维护者评审按 [docs/adapter-review.md](adapter-review.md) 执行。
没有真实宿主工具时，先用 [Adapter Fixture](adapter-fixture.md) 验证本地协议、provider health、overlay、低余量提示和脱敏边界。

Every catalog entry must declare `providedSignals`. Treat it as the adapter's compatibility contract: UI and docs can rely on those signals, and nothing else.

| Adapter | Best for | First target |
| --- | --- | --- |
| Local gateway bridge | OpenAI-compatible APIs, Hermes, LiteLLM | Capture response `usage` and post `/events`. |
| Browser extension | ChatGPT, Claude, Gemini, Hermes Web UI | Report HUD avoid rectangles and visible quota text. |
| IDE extension | VS Code, Cursor | Report tool/model usage and show status in the IDE. |
| SDK wrapper | Node/Python apps | Wrap provider calls and post usage after responses. |
| CLI importer | TokenTracker, ccusage, other local reports | Import already-parsed JSON summaries without copying parser logic into the desktop app. |
| MCP server | Agents | Let agents read snapshots and health status. |
| Skill/plugin | Setup and repair | Install, configure, diagnose, and author adapters. |

Common `providedSignals`:

| Signal | Use when the adapter can... |
| --- | --- |
| `usage-events` | Post explicit usage events to `/events`. |
| `usage-tokens` | Read token counts from a local/native source. |
| `quota-capacity` | Provide 5-hour, weekly, or similar capacity windows. |
| `quota-token-plan` | Provide credit-plan total/used/remaining values. |
| `context-window` | Provide context limit and current context usage. |
| `hud-overlays` | Report rectangles that the HUD should avoid. |
| `local-health` | Use the lightweight `/health` probe. |
| `snapshot-read` | Read full aggregate `/snapshot` state. |
| `status-display` | Display health without collecting usage. |
| `setup-workflow` / `adapter-authoring` | Help install, diagnose, or build adapters. |

## Minimal Adapter Flow

1. Load the local token from the app data directory or `WHO_EATS_TOKEN_API_TOKEN`.
2. Optionally call `GET http://127.0.0.1:17667/health` for a cheap local app/provider-health check.
3. Call the target provider/tool normally.
4. Extract usage from the official response whenever possible.
5. Post a `who-eats-token.usage.v1` event to `http://127.0.0.1:17667/events`.
6. If the app is not running, fail quietly and never block the user request.

## JavaScript Wrapper Example

```js
async function reportUsage(event, token) {
  try {
    await fetch("http://127.0.0.1:17667/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Who-Eats-Token": token
      },
      body: JSON.stringify({
        schema: "who-eats-token.usage.v1",
        confidence: "reported",
        source: "adapter-example",
        ...event
      })
    });
  } catch {
    // Monitoring must never break the model call.
  }
}
```

## OpenAI-Compatible Response Mapping

| Response field | Event field |
| --- | --- |
| `usage.prompt_tokens` | `input_tokens` |
| `usage.completion_tokens` | `output_tokens` |
| `usage.input_tokens` | `input_tokens` |
| `usage.output_tokens` | `output_tokens` |
| `usage.total_tokens` | `total_tokens` |
| `model` | `model` |

Use `confidence=reported`.

## Node SDK Reference

Use `src/sdk/client.cjs` or the package subpath `who-eats-token/sdk` as the reference Node adapter helper.

```js
const { createWhoEatsTokenClient } = require("who-eats-token/sdk");

const tokenClient = createWhoEatsTokenClient();
await tokenClient.getHealth();
await tokenClient.reportOpenAIResponse(response, {
  provider: "hermes",
  tool: "Hermes"
});
```

The SDK is intentionally best-effort: it has a short timeout, defaults to no throws, and returns `{ ok: false }` if the local app is closed.

## External Summary Import

Use `scripts/import-usage-report.mjs` or `npm run import:usage-report` when another local tool has already produced a JSON usage summary.

This is the preferred interop path for TokenTracker, ccusage, and similar projects: they keep parser breadth, Who Eats Token receives compact usage events for ambient HUD display.

```powershell
npm run import:usage-report -- -- --dry-run --provider claude --tool ccusage --source ccusage-json path\to\summary.json
```

See [docs/external-summary-import.md](external-summary-import.md).

## Adapter Fixture

Use `npm run adapter:fixture` before wiring a real host. It runs isolated by default, posts representative usage and overlay events, verifies `/snapshot` and `/health`, and fails if prompt/API-key/cookie/source-file-shaped metadata leaks through normalization:

```powershell
npm run adapter:fixture
npm run adapter:fixture -- -- --json
npm run test:adapter-fixture
```

Pass `--endpoint http://127.0.0.1:17667 --token ...` only when you intentionally want to post fixture events to a running desktop app.

## Browser Extension Rules

- Use Manifest V3.
- Keep the service worker event-driven.
- Use `adapters/browser-extension` as the reference implementation.
- Do not scrape prompts or completions.
- Send `/overlays` only for visible controls or panels that may overlap the HUD.
- Send `/events` only when visible quota or official API usage is reliable.
- Back off after failures; do not retry in a tight loop.

## IDE Extension Rules

- Prefer status-bar commands and opt-in telemetry forwarding.
- Use `adapters/vscode-extension` as the reference read-only status-bar adapter.
- Report only token usage and quota metadata, not source files or prompts.
- Support workspace-level enable/disable.
- If the extension wraps a provider call, report after the response returns.

## MCP Server Rules

The MCP server is implemented as a read-mostly adapter. See `docs/mcp-server.md`.

- `get_token_snapshot`: read current aggregate status.
- `list_provider_health`: summarize live/missing/delayed providers.
- `post_usage_event`: optional write path for local agents.

Do not duplicate the desktop collector logic inside the MCP server.

## Stability And Memory Rules

- Keep adapters stateless when possible.
- Bound queues and caches.
- Avoid per-second polling unless it is local and cheap.
- Browser DOM adapters should be event-driven and pass `npm run test:performance-budget`.
- Browser and IDE adapters must pass `npm run adapter:guard`; it rejects broad host permissions, prompt/completion scraping, unsafe browser APIs, and unbounded adapter behavior.
- Use provider cache windows for billing/quota endpoints.
- Never start watchdog loops that restart external services every minute.
- Prefer health checks over PID-file assumptions.
- Log only compact status by default; verbose logs must be opt-in.

## Acceptance Checklist

- The adapter has an entry in `adapters/catalog.json`.
- The adapter satisfies [docs/adapter-contribution-checklist.md](adapter-contribution-checklist.md).
- `providedSignals` matches the real behavior; do not claim quota, overlay, health, or snapshot support unless the adapter implements it.
- `npm run test:adapter-catalog` passes.
- `npm run adapter:review -- -- --id your-adapter-id` shows no errors.
- `npm run test:adapter-fixture` passes.
- `npm run adapter:guard` passes.
- `npm run test:adapter-contribution` passes when templates, issue forms, PR rules, or catalog docs changed.
- The adapter works when Who Eats Token is closed.
- The adapter works when the local token is missing by skipping reports gracefully.
- Reported events pass `npm run test:protocol`.
- Browser extension changes pass `npm run test:browser-extension`.
- Node SDK changes pass `npm run test:node-sdk`.
- IDE extension changes pass `npm run test:vscode-extension`.
- No prompts, completions, provider API keys, or cookies are sent to `/events`.
- Retry/backoff behavior is documented.
- The adapter can be disabled without uninstalling the desktop app.
