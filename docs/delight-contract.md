# Delight Contract

Who Eats Token can be cute, but the cuteness must stay cheap, truthful, and consistent across tools.

The source of truth is `src/protocol/quota-delight.cjs`. Renderers may style the output, but they should not invent separate mood, warning, chart, icon, or mascot logic.

## Commands

```powershell
npm run delight:contract
npm run delight:contract -- --json
npm run delight:contract -- --check
npm run test:delight-contract
```

`delight:contract` is read-only. It does not launch Electron, inspect windows, poll providers, or scan browser pages.

## Contract

- Numeric quota values stay primary; cute labels only annotate them.
- The quota band uses the provider-specific remaining standard: capacity tools use the current 5-hour window when present; token-plan tools use remaining over total; context tools use context remaining.
- Low-quota alert begins below `20%` remaining.
- Below `10%` remaining uses the urgent `快见底` state.
- Estimated data keeps the same quota band but carries `estimated: true`.
- Delayed or stale data cannot look like live quota.
- Missing, disabled, or planned providers stay quiet.
- Icon, mascot, chart, tone, motion, priority, and accessibility label come from the shared delight state.
- Reduced-motion mode must reduce decorative movement to static UI.
- No delight feature may add a new polling loop.
- No delight image/animation/mascot asset may exceed `100 KB` without an explicit release-note exception.

## State Matrix

| Input | Label | Cue | Purpose |
| --- | --- | --- | --- |
| live 75%+ | `放心吃` | spark / stretch / soft | Relaxed, enough quota to keep working. |
| live 45-74% | `刚刚好` | check / sip / steady | Stable quota, no warning. |
| live 20-44% | `省着吃` | gauge / careful / breathe | Careful but not alarming. |
| live 10-19% | `省着点` | warning / small-bites / alert | Low-quota warning. |
| live below 10% | `快见底` | empty-bowl / panic / alert | Urgent warning. |
| estimated quota | quota band + estimate marker | same band | Same visual band, with estimate trust. |
| delayed/stale with known quota | `慢半拍` | quota band mascot + caution tone | Data is not fresh, but the pose still matches the visible remaining quota. |
| delayed/stale without quota | `慢半拍` | clock / blink / breathe | Data is not fresh and no quota band is known. |
| auth expired | `要登录` | key / locked / alert | User action is required. |
| missing | `等开饭` | bowl / peek / quiet | Quiet waiting state. |
| disabled | `睡觉中` | moon / nap / quiet | Explicitly disabled. |
| planned | `排队中` | queue / waiting / quiet | Reserved adapter, not an error. |

## Renderer Rules

- Top bar reads provider `delight` from the shared snapshot.
- Tool HUD reads provider `delight` from the active provider.
- Mini charts use existing provider snapshot values, not a separate timer.
- Warning pills use the same remaining value as the numbers.
- Data trust popovers must disclose the quota basis that drives mascot and frame state.
- `prefers-reduced-motion: reduce` must stop decorative animation.

## Checks

```powershell
npm run test:quota-delight
npm run test:delight-contract
npm run test:hud-stability
npm run release:check
```
