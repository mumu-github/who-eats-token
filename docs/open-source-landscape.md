# Open Source Landscape

Checked on 2026-05-24 against public GitHub project pages and official project docs.

This file keeps the project honest about what already exists. The goal is not to clone another token dashboard; it is to decide where Who Eats Token should fit in the open-source ecosystem.

The deeper product lessons from TokenTracker are captured in [docs/token-tracker-lessons.md](token-tracker-lessons.md).

## Closest Existing Projects

| Project | What It Already Covers | Gap For This Project |
| --- | --- | --- |
| [TokenTracker](https://github.com/mm7894215/TokenTracker) | Local-first token aggregation for many AI coding tools, dashboard, native macOS menu bar app, desktop widgets, rate-limit tracking, and privacy-first local parsing. | It is already a strong general token tracker. Who Eats Token should not compete as another generic dashboard; it should focus on Windows/macOS realtime HUD placement, desktop-only top bar behavior, local adapter protocol, and explicit in-tool overlay avoidance. |
| [ccusage](https://github.com/ryoppippi/ccusage) | CLI-first local usage and cost reports for coding-agent sources such as Claude Code, Codex, OpenCode, Hermes, Goose, Kimi, Qwen, Copilot, and Gemini. | It is an excellent parser/reporting reference. Who Eats Token should interoperate with CLI/parsing projects through `/events` or adapters instead of rebuilding every parser inside the desktop runtime. |

## Positioning Decision

Do not publish Who Eats Token as "the universal LLM token tracker." That market position is already crowded and TokenTracker is especially close.

Publish it as a layered desktop runtime:

1. **Realtime desktop HUD** for Windows 10+ and macOS, including desktop-only top bar rules and in-tool bottom-right HUD rules.
2. **Local protocol and adapter host** for tools that can report usage or quota data without exposing prompts, completions, API keys, cookies, or source files.
3. **Bridge and extension examples** for Hermes, browser tools, VS Code/Cursor, SDK wrappers, and MCP clients.
4. **Agent workflows** through skills and a Codex plugin for setup, diagnosis, and adapter authoring.

This means the answer is still "all of them," but with strict boundaries:

- Core app is the product.
- Adapters are the extensibility model.
- MCP is the agent-facing access layer.
- Skills/plugin are installation and maintenance workflows.

The open-source differentiator should be lightweight ambient interaction: desktop-only top bar, in-tool HUD, precise overlay avoidance, and cute state changes that are driven by real quota data.

## Build, Fork, Or Integrate

Before a public release, maintainers should make an explicit choice:

| Path | When To Use It | Current Recommendation |
| --- | --- | --- |
| Use or contribute upstream | If TokenTracker already solves the user's workflow and only small integration changes are needed. | Prefer this for generic dashboards, historical reports, and parser breadth. |
| Fork | If the desired UX is close to TokenTracker but needs incompatible UI/runtime decisions. | Avoid unless upstream contribution is not viable; a fork inherits maintenance cost. |
| Continue this project | If the differentiator is cross-platform desktop HUD behavior, low-latency local overlay avoidance, or local protocol hosting. | Recommended only with a clear "desktop HUD and adapter host" positioning. |
| Integrate | If another project can provide parsed usage while Who Eats Token provides display and local protocol. | Preferred long-term: add adapters that import or accept snapshots from projects like TokenTracker/ccusage instead of duplicating all parsing logic. |

The first concrete integration path is [docs/external-summary-import.md](external-summary-import.md): a one-shot CLI importer for already-parsed JSON summaries from TokenTracker, ccusage, or similar local tools.

## Open-Source Scope Guardrails

- Do not add a new parser to the core app unless it is required for realtime HUD correctness.
- Prefer a small adapter over a core dependency when a provider/tool can report usage through `/events`.
- Keep competitors and adjacent projects documented; reassess positioning before every public release.
- Any adapter that reads private tool files must document exact paths, fields, privacy boundary, performance boundary, disable path, and verification command.
- If an existing open-source tool is better for a workflow, document the interop path instead of absorbing the whole workflow.

## Release Implication

Public release messaging should lead with:

- "Realtime desktop HUD for token capacity"
- "Local-first adapter protocol"
- "Windows 10+ and macOS"
- "No prompt/completion collection"

It should avoid claiming:

- "first token tracker"
- "complete universal parser"
- "supports every tool automatically"
- "exact billing without provider evidence"
