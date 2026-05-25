# Adapter Types

## Browser Extension

- Directory: `adapters/browser-extension`
- Tests: `npm run test:browser-extension`
- Package: `npm run package:browser-extension`
- Rules: Manifest V3, no `<all_urls>`, no prompt/completion scraping, no `setInterval`.

## VS Code/Cursor Extension

- Directory: `adapters/vscode-extension`
- Tests: `npm run test:vscode-extension`
- Package: `npm run package:vscode-extension`
- Rules: status bar first, no source/prompt reading, short timeout, no persistent polling loops.

## Node SDK

- File: `src/sdk/client.cjs`
- Tests: `npm run test:node-sdk`
- Rules: localhost only, short timeout, no throws by default, report after provider response.

## MCP Server

- File: `src/mcp/server.cjs`
- Tests: `npm run test:mcp`
- Rules: read-mostly agent adapter; do not duplicate desktop collector logic.

## Local Gateway Bridge

- Example: `src/collectors/hermes-bridge.cjs`
- Tests: `npm run test:hermes-bridge`
- Rules: preserve original request/response behavior; extract official `usage`; fail transparently.

## Skill Or Plugin

- Directory: `skills/`
- Tests: `npm run test:skills`
- Rules: setup/doctor/authoring workflows only; no always-on monitoring or background service.
