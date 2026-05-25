# Setup Commands

Use these commands from the repository root.

## Clean Install

```powershell
npm ci
npm run release:check
npm audit --audit-level=high
```

## Desktop Package

```powershell
npm run package:dir
npm run smoke:packaged-win
```

macOS:

```sh
npm run package:dir
npm run smoke:packaged-mac
```

## Adapter Packages

```powershell
npm run package:adapters
npm run verify:adapter-artifacts
```

Expected adapter outputs live under `release/adapters/`:

- `who-eats-token-browser-extension-*.zip`
- `who-eats-token-vscode-adapter-*.vsix`

## MCP

Launch with:

```powershell
npm run mcp
```

The MCP server talks to the local desktop API at `http://127.0.0.1:17667`.
