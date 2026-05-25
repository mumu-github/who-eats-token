# MCP Server

Who Eats Token includes a lightweight MCP server for agent clients such as Codex, Claude, Cursor, and other MCP-compatible tools.

The MCP server is an adapter, not the desktop monitor. It does not collect files, inspect windows, poll providers, or draw HUD UI. It only talks to the local desktop app API at `http://127.0.0.1:17667`.

## Start

```sh
npm run mcp
```

The server uses stdio JSON-RPC transport. Configure your MCP client to launch:

```text
node scripts/mcp-server.mjs
```

Optional environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `WHO_EATS_TOKEN_BASE_URL` | `http://127.0.0.1:17667` | Local desktop app API base URL. |
| `WHO_EATS_TOKEN_API_TOKEN` | token file | Overrides the local API token. |
| `WHO_EATS_TOKEN_USER_DATA_DIR` | platform app-data path | Custom token/settings directory. |

## Tools

### `get_token_snapshot`

Reads the raw local snapshot.

Use this when an agent needs the full current provider state.

### `list_provider_health`

Returns a compact health summary:

- provider id/name/status
- confidence and source
- recent/today token totals
- quota sync state
- 5-hour, weekly, token-plan, and context remaining percentages when available
- display mode, freshness, reason, and attention summary

Use this for quick decisions before starting a large task.

The MCP tool reuses the desktop snapshot's `providerHealth` logic, so doctor workflows, plugins, and agent clients see the same live/delayed/missing/disabled labels as the local API.

### `post_usage_event`

Posts a `who-eats-token.usage.v1` event to `/events`.

Use this only when the agent has reliable token usage from a tool response. Do not post prompts, completions, API keys, cookies, or local file contents.

## Resource

### `who-eats-token://snapshot`

Reads the current local snapshot as JSON.

## Stability Rules

- If the desktop app is closed, tool calls return a local API unavailable error.
- The MCP server has no polling loop.
- Each local API request times out quickly.
- Responses are capped to avoid accidentally streaming large local state into the agent.
- The server reuses the local access token and does not introduce a new credential.

## Checks

```sh
npm run test:mcp
```

The test starts a fake local API and verifies `initialize`, `tools/list`, `tools/call`, and `resources/read` over stdio.
