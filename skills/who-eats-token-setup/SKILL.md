---
name: who-eats-token-setup
description: Install, configure, package, and verify Who Eats Token from this repository. Use when a user asks an agent to set up the desktop app, local API token, MCP server, browser extension, VS Code/Cursor adapter, packaged smoke checks, or release artifacts on Windows 10+ or macOS.
---

# Who Eats Token Setup

## Workflow

1. Inspect the repository first: `package.json`, `docs/release.md`, `docs/manual-validation.md`, and the relevant adapter docs.
2. Install dependencies with `npm ci` for a clean checkout, or `npm install` only when intentionally changing dependencies.
3. Run `npm run release:check` before declaring setup healthy.
4. For desktop packaging, run `npm run package:dir`, then the packaged smoke for the current OS:
   - Windows: `npm run smoke:packaged-win`
   - macOS: `npm run smoke:packaged-mac`
5. For adapter distribution, run `npm run package:adapters` and `npm run verify:adapter-artifacts`.
6. Never print or commit API keys, provider cookies, local access tokens, Hermes databases, or raw logs.

## Decision Points

- Use the desktop app as the runtime core. Do not try to replace HUD/top-bar monitoring with a skill.
- Use the MCP server for agent reads of snapshot/health.
- Use skills for installation, diagnosis, and adapter-authoring workflows.
- Use browser/IDE extensions only for their own host surfaces.

## Local Token

The desktop app creates a local API token under the app data directory. Read it only when needed for local adapter configuration, and mask it in output.

## References

- For command groups and expected outputs, read `references/commands.md`.
- For release behavior, prefer repository docs over assumptions: `docs/release.md`, `docs/manual-validation.md`, and `docs/performance-budget.md`.
