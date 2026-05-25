---
name: who-eats-token-doctor
description: Diagnose and repair Who Eats Token issues. Use when the desktop bar or HUD does not show, quota is stale or wrong, the machine feels laggy, adapters disappear, browser/IDE packages fail, local APIs are unreachable, or packaged Windows/macOS smoke checks fail.
---

# Who Eats Token Doctor

## Triage Order

1. Ask what is broken only if the symptom is ambiguous; otherwise inspect current state.
2. Preserve the user's current HUD behavior. Do not rewrite placement, hiding, or styling while diagnosing unrelated failures.
3. Measure before guessing: check release gates, packaged smoke output, local API `/snapshot`, process CPU/RSS, and adapter package verification.
4. Separate runtime failures from packaging failures:
   - runtime: desktop app, local API, foreground detection, provider collectors
   - adapter: browser extension, VS Code/Cursor extension, MCP, Node SDK
   - packaging: electron-builder, app icon, signing/symlink permissions, artifacts
5. Make the smallest repair that restores the broken contract, then rerun the relevant test.

## Standard Checks

Run narrow checks first, then broader checks:

```powershell
npm run status
npm run status -- --json
npm run diagnostics -- --json
npm run test:performance-budget
npm run validation:next
npm run test:packaging
npm run test:adapter-packages
npm run release:check
```

For packaged runtime issues:

```powershell
npm run package:dir
npm run smoke:packaged-win
```

On macOS, use `npm run smoke:packaged-mac`.

## Safety Rules

- Never paste cookies, local tokens, full databases, raw chat logs, or account screenshots.
- Use temporary userData and random ports for smoke tests.
- Treat browser DOM overlay and extension code as privacy-sensitive: it must not read prompt/completion text.
- If investigating lag, look for tight intervals, DOM full scans, aggressive watchdogs, and debug logs.

## References

- For symptom-specific evidence and commands, read `references/diagnostics.md`.
- For low-overhead invariants, read `docs/performance-budget.md`.
