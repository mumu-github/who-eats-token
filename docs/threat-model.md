# Threat Model

This document summarizes the security-sensitive boundaries for Who Eats Token as a source beta. It is intentionally scoped to the local desktop app, localhost protocol, adapters, MCP server, and optional bridge surfaces that are present in the public repository.

## Assets

| Asset | Why it matters | Expected handling |
| --- | --- | --- |
| Local API token | Gates access to `127.0.0.1:17667` and `127.0.0.1:17668`. | Generated locally, stored under the platform app-data directory, never committed, and sent as `X-Who-Eats-Token`. |
| Provider cookies and API keys | May grant access to external accounts. | Never posted to `/events`, never included in diagnostics, and covered by `npm run secret:scan`. |
| Codex and Hermes local state | May include account, session, or usage metadata. | Read locally for quota and usage signals; raw databases and logs must not be shared. |
| Usage and quota metadata | Drives HUD display and agent-visible status. | Stored and exposed as compact scalar status, not prompts, completions, source files, or chat content. |
| Adapter packages | Browser, IDE, SDK, MCP, and bridge integrations can cross trust boundaries. | Each adapter must document allowed signals, tests, privacy limits, and disable paths before moving beyond planned status. |

## Trust Boundaries

| Boundary | Entry point | Main risk | Current controls |
| --- | --- | --- | --- |
| Localhost ingest API | `POST /events`, `POST /overlays`, `GET /snapshot`, `GET /health` on `127.0.0.1:17667` | Local web content or tools could try to post forged data or read local status. | Local binding, origin checks, required `X-Who-Eats-Token`, explicit legacy compatibility setting, payload size limits, sensitive metadata filtering. |
| Optional Hermes bridge | `127.0.0.1:17668/v1/chat/completions` | Bridge could leak request content or credentials if it became network-exposed. | Local binding, token-protected health endpoint, forwards only to the local Hermes gateway, reports usage from response metadata. |
| Browser extension adapter | `adapters/browser-extension` | Web pages could trigger excessive reporting or expose page content. | Explicit host permissions, local token setup, overlay rectangle reports only, no default chat-content collection. |
| IDE adapter | `adapters/vscode-extension` | IDE integration could accidentally inspect source or private prompts. | Reads `/health` by default, reads `/snapshot` only through explicit user action, does not intercept private IDE AI traffic. |
| MCP server | `scripts/mcp-server.mjs` | Agent clients could over-read local state or post unreliable data. | No provider polling, capped local API responses, fast timeouts, no file/window inspection, `post_usage_event` limited to explicit usage metadata. |
| Support bundles | `npm run support:bundle` | Public issue attachments could contain secrets or local account data. | Redaction rules, static secret scan, diagnostics docs, no raw token/cookie/database collection. |

## Abuse Cases

| Scenario | Impact | Mitigation |
| --- | --- | --- |
| A malicious local page posts fake usage events. | HUD and agent clients could show misleading usage. | Require local token, restrict browser origins, keep event confidence/source labels visible, and keep adapter catalog reviewable. |
| A support attachment includes a token, cookie, or database copy. | Account compromise or local data exposure. | Document forbidden files, run `npm run secret:scan`, and prefer redacted support bundles. |
| A new adapter reads prompts, completions, or source files to estimate usage. | Private content exposure. | Reject adapters that need private content; require signal, privacy, performance, and disable-path documentation. |
| The optional bridge is bound beyond localhost. | External callers could reach a local model gateway path. | Keep bridge local-only and verify release checks before public binary distribution. |
| Agent clients treat estimated data as official quota. | Bad automation decisions or unnecessary interruptions. | Preserve confidence, freshness, source labels, and status values in `/health`, `/snapshot`, and MCP tools. |

## Maintainer Review Checklist

Run these checks before source-beta release notes, public issues, or OpenAI Codex for OSS application updates cite security readiness:

```powershell
npm run secret:scan
npm run test:docs
npm run test:local-health
npm run test:mcp
npm run test:browser-extension
npm run test:vscode-extension
npm run test:support-bundle
npm run adapter:review
npm run release:gaps -- --target source-beta --require-source-beta
```

Source beta security claims should stay narrow:

- Say the project has documented local trust boundaries and maintainer checks.
- Say Codex Security would be used to review localhost API, adapter, MCP, bridge, and redaction surfaces.
- Do not claim production-ready binaries, signed installers, macOS notarization, or broad real-world adoption until those are recorded as release evidence.
