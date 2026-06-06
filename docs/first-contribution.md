# First Contribution Path

This repo is a source beta. Good first contributions are small, privacy-safe, and easy to verify locally.

## Starter Paths

1. Docs cleanup: improve setup steps, release notes, screenshots wording, adapter docs, or troubleshooting without changing runtime behavior.
2. Adapter catalog work: add missing catalog metadata, tighten `providedSignals`, or improve the [adapter contribution checklist](adapter-contribution-checklist.md).
3. Fixture and review coverage: add safe fixture cases, update adapter review expectations, or improve tests that do not need a real provider account.
4. Validation evidence: run a documented manual checklist on a real Windows/macOS/browser/IDE host and record privacy-safe results.

## What Needs Special Access

Some work cannot be completed by every contributor:

- Real macOS packaged runtime validation needs a macOS machine and permission-state checks.
- Browser extension manual QA needs Chrome or Edge with a local desktop app token and sanitized screenshots/results.
- Public binary release work needs Windows Authenticode or Apple Developer ID signing credentials.
- Provider-specific quota work may need a provider account, but public issues and PRs must not include API keys, cookies, prompts, completions, or account screenshots.

## Before Opening A PR

Run the smallest checks that match the change:

```powershell
npm run check
npm run test:docs
npm run secret:scan
```

For adapter changes, also run:

```powershell
npm run test:adapter-catalog
npm run adapter:review -- -- --id <adapter-id>
npm run adapter:fixture -- -- --json
npm run test:adapter-contribution
```

If npm 11 on Windows drops script flags, use the extra separator shown above: `npm run <script> -- -- --flag`.

## Issue Choice

Use the docs/improvement issue template for documentation gaps, starter tasks, or unclear contributor paths. Use the source beta feedback template after trying the app. Use the adapter request template for a new tool integration.
