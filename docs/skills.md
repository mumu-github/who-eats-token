# Agent Skills

Skills are the agent-facing workflow layer for Who Eats Token. They do not run the HUD, poll providers, or keep background services alive.

## Included Skills

| Skill | Purpose |
| --- | --- |
| `who-eats-token-setup` | Install dependencies, package the app, verify local API and adapter artifacts. |
| `who-eats-token-doctor` | Diagnose HUD, quota, lag, adapter, and packaging failures with measured evidence. |
| `who-eats-token-adapter-author` | Guide safe low-overhead adapter creation for providers, browsers, IDEs, gateways, SDKs, MCP, and plugins. |

## Why Skills Exist

Use skills for repeatable agent workflows:

- setup and release checks
- diagnosis and repair
- adapter authoring
- privacy and performance guardrails

For quick measured state, skills should prefer:

```powershell
npm run status
npm run status -- --json
npm run diagnostics -- --json
```

`status` reads the desktop app's local `/snapshot` and shared `providerHealth` summary. `diagnostics` adds the redacted stability bundle for issue-quality evidence. Neither command inspects prompts, files, windows, browser pages, or external services.

Do not use skills for:

- realtime desktop monitoring
- always-on HUD logic
- browser DOM observation
- provider polling
- background services

Those belong in the desktop app, adapters, SDKs, or MCP server.

## Validation

```powershell
npm run test:skills
npm run release:check
```

## Distribution

The `skills/` directory can be bundled into a future Codex/Claude plugin along with:

- MCP server launch config
- adapter package artifacts
- setup scripts
- release check commands

The plugin should make agent installation easier; it should not replace the desktop app.
