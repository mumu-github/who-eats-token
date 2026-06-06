# Adapter Catalog

`adapters/catalog.json` is the machine-readable source of truth for supported, reference, and planned integration surfaces. Community adapter PRs should use [docs/adapter-contribution-checklist.md](adapter-contribution-checklist.md) before review.

The human-readable signal table is generated in [docs/adapter-signal-matrix.md](adapter-signal-matrix.md). The platform/tool compatibility view is generated in [docs/compatibility-matrix.md](compatibility-matrix.md). Run `npm run adapter:signal-matrix` and `npm run compatibility:matrix` after changing catalog entries.

The catalog exists so the project can grow beyond Codex and Hermes without turning the desktop app into a pile of tool-specific code. Every adapter entry must describe:

- what it integrates
- which platforms it targets
- where the implementation lives
- which runtime signals it can provide
- which tests or package commands verify it
- what data it is allowed to read or send
- how it avoids long-running CPU or memory cost
- how users can disable it

## Status Levels

| Status | Meaning |
| --- | --- |
| `supported` | Part of the core desktop app or a first-class runtime integration. |
| `reference` | A maintained example adapter or agent workflow that shows the expected pattern. |
| `planned` | A placeholder for future community or maintainer work; it cannot claim support yet. |

## Provided Signals

`providedSignals` is the compatibility contract for UI, health, MCP, and docs. It prevents vague claims such as "supports Claude" when the adapter only knows how to display a status bar or post one-shot usage.

Allowed signal keys:

| Signal | Meaning |
| --- | --- |
| `usage-tokens` | Reads token counts from a local/native source. |
| `usage-events` | Posts explicit `who-eats-token.usage.v1` events. |
| `quota-capacity` | Provides account/window capacity, such as 5-hour or weekly quota. |
| `quota-token-plan` | Provides credit-plan totals, used credits, or remaining credits. |
| `context-window` | Provides context-window used/remaining data. |
| `hud-overlays` | Reports rectangles that the in-tool HUD should avoid. |
| `local-health` | Reads or exposes the lightweight `/health` probe. |
| `snapshot-read` | Reads `/snapshot` or equivalent aggregate state. |
| `provider-health` | Reads, produces, or formats compact provider-health state. |
| `status-display` | Displays compact status without collecting new usage. |
| `setup-workflow` | Helps install, configure, or diagnose the app. |
| `adapter-authoring` | Helps contributors create or review adapters. |

## Validation

```powershell
npm run test:adapter-catalog
npm run adapter:review
npm run adapter:fixture -- -- --json
npm run test:adapter-signal-matrix
npm run compatibility:matrix -- -- --check
npm run test:compatibility-matrix
npm run release:check
```

`test:adapter-catalog` verifies schema shape, unique ids, `providedSignals`, existing docs/entrypoints, package scripts, and minimum privacy/performance boundaries. It intentionally rejects vague adapters that do not say what signals they provide, how they are tested, or how users can disable them.

`adapter:review` is the contributor-facing report for the same catalog. Run `npm run adapter:review -- -- --id <adapter-id>` in PR review to see the adapter's signals, boundary findings, and recommended verification commands.

`adapter:fixture` is the local protocol simulator for adapter authors. It runs isolated by default, posts representative usage and overlay events, and verifies provider health, low-quota attention, and redaction before a real host integration is available.

## Adding A Tool

1. Start with `status: "planned"` if there is no runnable implementation.
2. Copy `adapters/templates/provider-adapter` when a runnable implementation is being proposed.
3. Add docs and an adapter-specific test before moving to `reference`.
4. Move to `supported` only when the integration is in the release path and has real platform smoke coverage.
5. Never add an adapter that requires prompts, completions, source code, API keys, or cookies to be posted to `/events`.

For implementation rules, see [docs/adapter-guide.md](adapter-guide.md). For contribution rules, see [docs/adapter-contribution-checklist.md](adapter-contribution-checklist.md). For review rules, see [docs/adapter-review.md](adapter-review.md).
