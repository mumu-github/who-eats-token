# Risk Register

This register turns known product and open-source risks into checks that maintainers can run before a public release. It is intentionally practical: each risk must have an owner surface, an automated guard when possible, and a manual validation path when real OS or host behavior is required.

## Runtime Risks

| Risk | User impact | Guardrail |
| --- | --- | --- |
| HUD appears in the wrong app or on unrelated browser pages | Users lose trust because the visible quota belongs to the wrong tool. | `npm run test:hud-stability`, active-tool provider routing, browser host allowlists, and Cute But Quiet Visual QA. |
| HUD covers a send button, modal, or chat boundary | The monitor interrupts the workflow it is meant to help. | Overlay hints are short-lived, hide/move decisions require actual rectangle overlap, and Hermes placement is locked by `test:hud-stability`. |
| Desktop top bar appears inside a work app or is slow to disappear on desktop switches | Work area feels blocked or laggy. | Desktop/window detection tests, bounded active-window refresh, and manual desktop-only validation on Windows/macOS. |
| Provider quota is stale, estimated, or auth-expired but looks live | Users may plan work from bad remaining-capacity data. | `providerHealth.status`, `freshness`, `rateLimitsTrust`, and shared `quota-delight` states must mark delayed, estimated, missing, and auth-expired data differently. |
| Codex and Hermes data are mixed in one display | A user may think Codex has Hermes capacity or the reverse. | Active tool `providerIds` choose the display provider first; `test:hud-stability` guards Codex fallback and Hermes Token Plan rendering. |
| Xiaomi Token Plan cookie expires or leaks | Live Hermes quota stops syncing, or credentials are exposed. | Cookie files stay local and ignored; `/events` and `/overlays` must never accept cookies; docs warn that the cookie is a login credential. |
| Extra polling or DOM scanning makes the machine stutter | The app becomes more annoying than useful. | `test:performance-budget` blocks new `setInterval` loops in high-risk scripts, overlay injection is opt-in, and packaged soak checks RSS/CPU growth. |
| Cute animation becomes heavy or distracting | The differentiator turns into visual noise. | `quota-delight` is pure and event-driven, reduced-motion CSS is required, and visual QA checks low-quota alert transitions. |
| Temperature or hardware metrics are unavailable on a platform | UI may show misleading blanks or broken labels. | System strip should degrade to CPU, memory, and available memory; do not claim thermal support without platform evidence. |

## Open-Source Risks

| Risk | Project impact | Guardrail |
| --- | --- | --- |
| Project positioning overclaims against TokenTracker, ccusage, or other tools | The project looks like a clone or makes a claim it cannot defend. | Keep `docs/open-source-landscape.md` and `docs/token-tracker-lessons.md` linked from README and checked by `test:release-readiness`. |
| Adapters become a parser warehouse | Maintenance cost grows quickly and privacy risk increases. | Keep adapter logic thin, require `adapters/catalog.json`, and review new adapters with `docs/adapter-review.md`. |
| Browser or IDE hosts change install policy | Automated host smoke may pass on one machine but fail on user machines. | Treat host smoke as compatibility evidence, not full validation; keep manual Chrome/Edge and VS Code/Cursor checks as release blockers. |
| macOS permission behavior drifts | HUD placement may fail or become stale when Accessibility or Screen Recording is denied. | macOS real-device smoke, soak, and permission-state checks remain external release blockers. |
| Unsigned binaries trigger warnings or are blocked | Users cannot safely install public releases. | `npm run signing:readiness -- --platform all --require`, Authenticode, Developer ID signing, and notarization before public binaries. |
| Debug logs, screenshots, or bug reports contain secrets | Public issues or artifacts may leak private data. | Debug HUD logs are off by default and capped; issue/PR templates warn against API keys, cookies, prompts, completions, and source files. |
| Release artifacts are hard to verify | Users and maintainers cannot tell which binaries match the source. | `release/release-manifest.json`, `SHA256SUMS.txt`, and `npm run verify:release-manifest` are required after packaging. |

## Triage Rules

- If a bug affects window placement, provider selection, quota freshness, secrets, CPU, memory, or startup behavior, treat it as release-blocking until it has a test or a manual validation step.
- If a feature adds a new loop, watcher, browser content script, image asset, cloud API call, or credential, update this register and the performance/privacy guardrails in the same change.
- If a provider cannot supply reliable quota, show it as `estimated`, `missing`, `delayed`, or `auth-expired`; never make guessed data look live.
