# Adapter Signal Matrix

Generated from `adapters/catalog.json`. Do not edit this table by hand; run `npm run adapter:signal-matrix` after changing adapter entries.

Legend: `yes` means the adapter may provide that signal. Blank means it must not be treated as available.

| Adapter | Status | Platforms | Type | Usage | Capacity | Token Plan | Context | HUD Avoidance | Health | Snapshot | Status Display | Workflows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [Codex Local Collector](../README.md) | `supported` | `windows`, `macos` | `native-collector` | yes | yes |  |  |  | yes |  |  |  |
| [Hermes Local Collector](../README.md) | `supported` | `windows`, `macos` | `native-collector` | yes |  | yes | yes |  | yes |  |  |  |
| [Hermes OpenAI-Compatible Bridge](../README.md) | `supported` | `windows`, `macos` | `local-gateway` | yes |  |  |  |  | yes |  |  |  |
| [Browser Extension Adapter](../docs/browser-extension.md) | `reference` | `windows`, `macos` | `browser-extension` | yes |  |  |  | yes | yes |  |  |  |
| [VS Code/Cursor Adapter](../docs/ide-extension.md) | `reference` | `windows`, `macos` | `ide-extension` |  |  |  |  |  | yes | yes | yes |  |
| [Node SDK Wrapper](../docs/node-sdk.md) | `reference` | `windows`, `macos` | `sdk-wrapper` | yes |  |  |  | yes | yes |  |  |  |
| [External Summary Import](../docs/external-summary-import.md) | `reference` | `windows`, `macos` | `cli-importer` | yes | yes | yes | yes |  |  |  |  |  |
| [MCP Server Adapter](../docs/mcp-server.md) | `reference` | `windows`, `macos` | `mcp-server` | yes |  |  |  |  | yes | yes |  |  |
| [Agent Skills And Codex Plugin](../docs/skills.md) | `reference` | `windows`, `macos` | `agent-workflow` |  |  |  |  |  | yes |  |  | yes |
| [Provider-Specific Adapters](../docs/adapter-guide.md) | `planned` | `windows`, `macos` | `planned-provider` | yes | yes | yes | yes |  |  |  |  |  |

## Signal Keys

| Signal | Meaning |
| --- | --- |
| `usage-tokens` | Reads token counts from a local or native source. |
| `usage-events` | Posts explicit `who-eats-token.usage.v1` events. |
| `quota-capacity` | Provides account or window capacity such as 5-hour or weekly quota. |
| `quota-token-plan` | Provides credit-plan total, used, or remaining values. |
| `context-window` | Provides context-window used or remaining values. |
| `hud-overlays` | Reports short-lived rectangles that the in-tool HUD should avoid. |
| `local-health` | Reads or exposes the lightweight `/health` probe. |
| `snapshot-read` | Reads `/snapshot` or equivalent aggregate state. |
| `provider-health` | Reads, produces, or formats compact provider-health state. |
| `status-display` | Displays compact status without collecting new usage. |
| `setup-workflow` | Helps install, configure, or diagnose the app. |
| `adapter-authoring` | Helps contributors create or review adapters. |

