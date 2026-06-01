# TokenTracker Lessons And Breakthrough Plan

Checked on 2026-05-24 from [TokenTracker GitHub](https://github.com/mm7894215/TokenTracker), [TokenTracker site](https://www.tokentracker.cc/), and [TokenTracker Chinese README](https://github.com/mm7894215/TokenTracker/blob/main/README.zh-CN.md).

TokenTracker is the closest known open-source neighbor. It is already strong at broad local parsing, dashboards, cost analysis, macOS menu bar/widgets, and zero-config hook installation. Who Eats Token should learn from those strengths without becoming a heavier clone.

## What To Learn

| TokenTracker Strength | Why It Works | What We Should Adopt |
| --- | --- | --- |
| Zero-config first run | `npx tokentracker-cli` installs hooks, syncs data, and opens a local dashboard quickly. | Make first-run setup explain exactly which collectors/adapters are enabled, which are skipped, and why. Keep `setup` and `doctor` skills aligned with a machine-readable status surface. |
| Adapter categories | It clearly separates hook-based tools, plugin-based tools, and passive readers. | Keep `adapters/catalog.json` as the source of truth, and require each adapter to declare whether it is a bridge, passive reader, extension, SDK wrapper, or agent workflow. |
| Local aggregation | It normalizes heterogeneous usage into time buckets and serves one local dashboard/snapshot. | Keep one local `/snapshot` as the shared truth for desktop HUD, MCP, browser extension, IDE extension, and future widgets. |
| Status and doctor commands | Users can check integration state instead of guessing why a tool is missing. | Add or preserve a compact health surface for each provider: live, delayed, missing, skipped, auth-expired, estimated, and disabled. |
| Privacy wording | It states that token counts/timestamps are recorded, not prompts/responses/file contents. | Keep the same clarity, but go stricter: no prompts, completions, source files, API keys, cookies, bearer tokens, or local access tokens in events. |
| Rate-limit reset UX | Reset countdowns are more useful than raw totals when the user is planning work. | Keep 5-hour and weekly windows prominent, and add reset countdowns or "safe until" wording only when backed by provider evidence. |
| Fun companion/widgets | A companion character and widgets make quota monitoring less grim. | Use low-cost, optional micro-interactions tied to real quota state instead of heavy animations or decorative dashboards. |

## What Not To Copy

- Do not turn the core desktop app into a parser warehouse. TokenTracker can own broad parser coverage; Who Eats Token should prefer local adapters and `/events`.
- Do not become dashboard-first. Our differentiator is ambient desktop visibility while work is happening.
- Do not make macOS the only polished surface. This project must treat Windows 10+ and macOS as first-class.
- Do not add cloud leaderboard behavior to the default path. Fun should be local-first and private by default.
- Do not use a companion or animation that costs continuous CPU/GPU. Delight must be event-driven and reducible to static UI under `prefers-reduced-motion`.

## Breakthrough Thesis

Who Eats Token should become an **ambient token companion**, not another accounting dashboard.

The user should feel:

- "I know whether I can keep working right now."
- "The HUD stays out of my way."
- "Different tools report into one lightweight local protocol."
- "The UI has personality, but it never steals focus or slows the machine."

## Lightweight Product Bets

| Bet | User Value | Lightweight Rule |
| --- | --- | --- |
| Desktop-only top bar | Shows global capacity only when the desktop is visible. | Finder/Explorer desktop checks stay bounded and tested by `test:window-detection`. |
| In-tool bottom-right HUD | Shows the active tool's quota near the work context. | HUD placement must be active-window driven; no unrelated browser pages should show provider HUDs. |
| Local event protocol | Lets external tools integrate without pulling parser logic into the app. | `/events` accepts compact usage metadata only; SDK wrappers must fail quietly. |
| Health and trust labels | Users can tell live data from delayed/estimated/missing data. | Every provider should expose source/trust status; stale data should not look live. |
| Token Plan aware display | Supports credit-style plans like Hermes/Xiaomi without pretending everything is raw tokens. | UI labels should switch by provider plan type: token, credit, window, cost, or estimate. |
| Tiny adapter packages | Community integrations can ship independently. | Each adapter must declare disable path, privacy boundary, performance boundary, and verification command. |

## Fun Interaction Direction

Make the project cute by making the data feel alive, not by adding weight.

The shared `quota-delight` state machine is the source of truth for this layer. It maps provider health and remaining quota into short labels such as `放心吃`, `刚刚好`, `省着吃`, `省着点`, `慢半拍`, and `等开饭`. It also emits stable cue keys for icon choice, tiny chart behavior, and optional mascot pose. Renderers may style these states, but they should not invent separate mood logic. The enforceable contract lives in [delight-contract.md](delight-contract.md) and can be checked with `npm run delight:contract -- --check`.

| Interaction | Good Version | Avoid |
| --- | --- | --- |
| Quota mood | Safe, warm, tight, urgent states derived from the same remaining percentages shown as text. | Decorative mood that disagrees with numbers. |
| Micro mascot | Optional static/CSS companion that changes pose only on quota/state changes; freshness can change the label/tone, but known quota still owns the pose. | GIF/Lottie/canvas loops, high-refresh animation, large asset bundles, or a worried pose when the visible quota is healthy. |
| Mini chart | A tiny sparkline/bar linked to actual 5-hour and weekly remaining data. | Per-frame chart animation or fake waves unrelated to quota. |
| Warning | Low quota warning below 20%, quiet until state changes or user dismisses it. | Repeating toasts or sounds while the user types. |
| Reset relief | Show reset countdown as a small "safe again at..." hint when reliable. | Guessing reset times when provider data is missing. |
| Personal flavor | Local-only labels, art title, and theme accents. | Public leaderboards or social comparison by default. |

## Interaction Performance Guardrails

- Animations must be CSS-only or renderer-local, event-driven, and pause under `prefers-reduced-motion`.
- Delight labels must come from `src/protocol/quota-delight.cjs` or a direct extension of that shared state machine.
- Icons, mascot poses, chart cues, and warning priority must come from the same `delight.cue`, `delight.severity`, and `delight.priority` fields used by `/snapshot` and `/health`.
- No animation may require a new polling loop.
- No new UI asset for delight should exceed 100 KB without an explicit reason.
- Mini charts must read from existing provider snapshot data, never from a separate timer.
- Low-quota alerts should trigger on state transitions, not on every refresh tick.
- Cute labels must never replace numeric values; they can only annotate them.

## Interop Strategy With TokenTracker And ccusage

The best long-term relationship is interop, not rivalry.

| Source | Possible Adapter | Why |
| --- | --- | --- |
| TokenTracker status JSON | Use `npm run import:usage-report -- --source tokentracker-summary` against an exported summary or future stable JSON endpoint. | Lets TokenTracker keep parser breadth while Who Eats Token owns ambient display. |
| TokenTracker local buckets | Optional passive reader only if the file format is stable and documented. | Good for historical trends, but should stay an adapter, not core logic. |
| ccusage output | Use `npm run import:usage-report -- --provider claude --tool ccusage --source ccusage-json`. | Useful for users who already trust ccusage for Claude/Codex-style reporting. |
| Direct provider APIs | Use only when official usage/billing APIs exist and can be polled slowly. | Keeps exactness high without scraping private content. |

## Next Product Slices

1. Keep the shared `providerHealth` snapshot layer healthy: it should mirror the HUD/MCP/doctor view of provider status, quota source, freshness, and missing/disabled reasons without extra polling.
2. Keep the external summary importer small and privacy-safe so TokenTracker/ccusage interop does not become a hidden parser warehouse.
3. Keep the lightweight delight contract current before new animations: state names, color mapping, reduced-motion behavior, and asset budget are guarded by `npm run test:delight-contract`.
4. Add a manual visual QA checklist for "cute but not distracting": desktop top bar, Codex HUD, Hermes HUD, low-quota warning, reduced-motion mode.
5. Keep `release:check` responsible for preventing accidental drift: if delight or competitor positioning docs disappear, the release should fail.
