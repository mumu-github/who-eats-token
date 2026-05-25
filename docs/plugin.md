# Codex Plugin Skeleton

The plugin skeleton lives at `plugins/who-eats-token`.

It is intentionally an agent workflow layer:

- exposes setup, doctor, and adapter-authoring skills
- exposes an MCP launch config for local snapshot and provider health access
- points agents toward existing desktop/app/adapter packaging commands
- does not run the HUD or collect usage itself

## Structure

```text
plugins/who-eats-token/
  .codex-plugin/plugin.json
  .mcp.json
  scripts/
    mcp-server.mjs
    check-plugin-env.mjs
  skills/
    who-eats-token-setup/
    who-eats-token-doctor/
    who-eats-token-adapter-author/
```

## Local Validation

```powershell
npm run test:plugin
npm run release:check
```

The plugin MCP wrapper resolves the repository root from `WHO_EATS_TOKEN_REPO_ROOT` or the repo-local plugin path. It then launches `scripts/mcp-server.mjs`.

`npm run test:plugin` validates:

- manifest metadata and local MCP config
- wrapper path resolution
- bundled setup, doctor, and adapter-authoring skills
- byte-for-byte sync between `skills/` and `plugins/who-eats-token/skills/`

When editing a skill, update the plugin copy in the same change. This keeps future marketplace packaging from shipping stale troubleshooting or adapter instructions.

## Future Distribution

A future marketplace entry can point to `./plugins/who-eats-token`. Keep that separate from the desktop app installers and adapter artifacts:

- desktop app: `release/win-unpacked`, NSIS/ZIP, DMG/ZIP
- adapters: `release/adapters/*.zip` and `release/adapters/*.vsix`
- plugin: `plugins/who-eats-token`

The plugin can bundle workflows and launch config, but users still need the desktop app running for live HUD and local snapshot data.
