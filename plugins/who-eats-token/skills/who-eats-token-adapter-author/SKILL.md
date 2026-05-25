---
name: who-eats-token-adapter-author
description: Create or update safe low-overhead Who Eats Token adapters. Use when adding support for a provider, browser LLM web app, VS Code/Cursor-like IDE, OpenAI-compatible gateway, SDK wrapper, MCP client, or setup/diagnostic skill/plugin workflow.
---

# Who Eats Token Adapter Author

## Adapter Selection

Prefer integration surfaces in this order:

1. Official provider usage or billing API.
2. OpenAI-compatible local gateway bridge that extracts response `usage`.
3. SDK wrapper that reports after a provider response.
4. Browser extension for DOM overlay avoidance and explicit usage events.
5. IDE extension for status display and explicit opt-in reporting.
6. MCP server for agent reads/writes.
7. Skill/plugin for setup, diagnosis, and authoring workflows.

Do not put always-on runtime monitoring inside a skill.

## Implementation Rules

- Read `docs/protocol.md` and `docs/adapter-guide.md` before editing adapter code.
- Report usage to `POST /events` with `confidence=reported` only when usage comes from official usage fields or billing APIs.
- Report UI avoidance to `POST /overlays`; never send prompt/completion text.
- Keep adapters best-effort: failures must not block the user's model call or editor/browser session.
- Bound polling, queues, logs, payload sizes, and retries.
- Add or update tests for the adapter type.

## Required Validation

Run the relevant subset, then `npm run release:check`:

```powershell
npm run test:protocol
npm run test:browser-extension
npm run test:vscode-extension
npm run test:node-sdk
npm run test:mcp
npm run test:performance-budget
npm run package:adapters
```

## References

- For adapter type details, read `references/adapter-types.md`.
- For event schema, read `docs/protocol.md`.
- For packaging, read `docs/release.md`.
