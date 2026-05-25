## Summary

- 

## Verification

- [ ] `npm run release:check`
- [ ] For bug/performance/diagnostics changes: `npm run support:bundle -- --json`
- [ ] `npm audit --audit-level=high`
- [ ] For release candidates: `npm run manual:preflight -- --platform all`
- [ ] For public binary releases: `npm run signing:readiness -- --platform all --require`
- [ ] For release candidates: `npm run soak:packaged-win` or `npm run soak:packaged-mac`
- [ ] Relevant packaged smoke or adapter package check
- [ ] For adapter changes: `npm run test:adapter-catalog`
- [ ] For adapter changes: `npm run adapter:review -- --id <adapter-id>`
- [ ] For adapter changes: `npm run adapter:fixture -- --json`
- [ ] For adapter changes: `npm run test:adapter-contribution`

## Safety

- [ ] No API keys, cookies, local tokens, databases, or raw logs are committed.
- [ ] New adapters fail quietly when the desktop app is not running.
- [ ] Browser or IDE changes do not read prompts, completions, or source files unless explicitly documented.

## Adapter Changes

- [ ] `adapters/catalog.json` was added or updated.
- [ ] The adapter has a documented disable path.
- [ ] The adapter has a privacy boundary covering prompts, completions, API keys, and cookies.
- [ ] The adapter has a performance boundary covering polling, retries, queues, and cache windows.
- [ ] Manual Windows/macOS validation is documented, or unsupported platforms are explicitly excluded.
