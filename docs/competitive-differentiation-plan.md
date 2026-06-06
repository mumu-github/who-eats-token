# Competitive Differentiation Plan

调研日期：2026-05-25。

这份方案用于把“谁在吃 token”从一个能用的小工具，收敛成可以开源 beta 的产品路线。核心判断很简单：不要跟现有项目拼“谁解析的工具最多”，而是做一个 **ambient token companion**：在用户真实工作的地方，用很低的资源占用、很诚实的数据可信度、轻量但有趣的交互，回答“我现在还能不能继续用这个模型”。

## Research Scope

本轮看的是公开可访问的项目页、README、产品页和仓库描述。竞品分成四类：

1. **历史/成本仪表盘**：擅长读本地日志、汇总历史 token、估算成本。
2. **菜单栏/托盘余量工具**：擅长常驻显示当前模型或订阅状态。
3. **多 provider 额度监控**：擅长接 OpenAI、Anthropic、Azure、Gemini 等 API，做告警或可观测。
4. **Claude/Codex 专用监控**：围绕某个工具的本地日志、窗口、状态栏或用量窗口做窄场景优化。

公开资料显示，竞品已经覆盖了很多“通用 token tracking”场景，所以我们的差异化必须避开重复造 parser 仓库。

## Competitive Map

| Category | Projects | Strong At | Weak Spot For Our User |
| --- | --- | --- | --- |
| General local dashboard | [TokenTracker](https://github.com/mm7894215/TokenTracker), [Token Use](https://www.tokenuse.app/), [Token Meter](https://token-meter.dev/), [TokenBBQ](https://offbyone.cloud/), [tokenusage](https://tokenusage.org/) | 多工具本地统计、成本报表、dashboard/TUI、hook/plugin、MCP 或状态串。 | 用户工作时不会一直看 dashboard；如果核心变成解析仓库，会加重维护和性能负担。 |
| CLI/reporting parser | [ccusage](https://github.com/ryoppippi/ccusage) | Claude Code 等本地用量分析、CLI 报表、历史 cost/usage 复盘。 | 报表很强，但不是工作现场 HUD；也不应该把 CLI parser 逻辑塞进 Electron 常驻进程。 |
| Proxy/telemetry path | [toktap](https://toktap.co/), Tokentap-style tools | 通过代理或 request capture 记录实时 API token、burn rate、Grafana/JSONL。 | 代理链路改变调用路径，开源桌面工具默认不应要求用户改 provider endpoint。 |
| Menu bar/status app | [CodexBar](https://github.com/steipete/codexbar), CodexBar app/site 类工具 | 常驻轻量入口、菜单栏可见、当前用量提醒、reset countdown。 | 菜单栏适合 macOS，但 Windows 桌面/工具内浮层、遮挡避让、趣味状态通常不是重点。 |
| API quota monitor | [onWatch](https://github.com/onllm-dev/onwatch), AIMeter-style monitors | 多 provider API key 监控、额度或成本告警、服务端/daemon 化。 | 很容易变成 API key 管理器或后台轮询器；对本地桌面工具的焦点窗口和遮挡场景帮助有限。 |
| Claude-specific monitor | Claude Code Usage Monitor 类项目 | 对单一工具理解深，显示快，用户安装心智低。 | 单工具准确性不等于跨工具一致性；开源后每个 provider 都需要独立可信度边界。 |

## Positioning Decision

开源 beta 的一句话定位：

> Who Eats Token is a local-first desktop HUD and adapter protocol for LLM capacity awareness.

不要这样定位：

- “最全 token 统计器”
- “第一个 LLM 用量监控”
- “自动支持所有 AI 工具”
- “任何 provider 都能精确计费”

应该这样表达：

- “在桌面和当前工具旁边显示可用容量”
- “每个数字都说明来源、刷新时间和可信度”
- “本地适配器协议让不同工具接入，不收集 prompt/completion”
- “趣味互动由真实余量驱动，并受性能预算约束”

## Product Wedge

### 1. Ambient HUD, Not Dashboard First

竞品多是 dashboard、CLI、菜单栏或浏览器页面。我们的主场是：

- 桌面顶部：只在桌面显示全局容量，不压工作区。
- 工具内右下角：只显示当前活跃工具的容量，避免 Codex/Hermes 混用。
- 遮挡智能避让：只有浮层会挡住真实输入框、按钮、弹窗内容时才隐藏或移动。
- 窗口切换即时收敛：切到桌面时工具 HUD 应快速隐藏，顶部条快速出现。

差异化不是“更花”，而是用户不用思考 HUD 为什么出现、为什么消失、显示的是哪个工具。

### 2. Data Trust Ledger

竞品常把“本地统计”“API 用量”“订阅窗口余量”“估算成本”混在一个数字里。我们应该把可信度做成产品特性：

| Trust Level | Meaning | UI Label |
| --- | --- | --- |
| `exact-provider` | 官方 API 或 provider 自己给出的 plan/quota/billing 数字。 | 精确 |
| `exact-local` | 工具本地明确事件，例如 Codex token_count、SDK wrapper usage。 | 本地精确 |
| `derived` | 从多个精确事件汇总出的窗口值。 | 汇总 |
| `delayed` | 来源可靠，但刷新落后或有缓存窗口。 | 延迟 |
| `estimated` | 从日志、上下文长度、价格表或历史趋势估算。 | 估算 |
| `stale` | 数据超过新鲜度 SLA。 | 过期 |
| `auth-expired` | 需要用户刷新 cookie/API key/token。 | 授权失效 |

每个 provider 必须在 `/snapshot` 或 `/health` 里暴露：

- `sourceKind`
- `sourceLabel`
- `updatedAt`
- `ageMs`
- `confidence`
- `unit`
- `resetAt` 或明确 `resetUnknown`
- `explain`

这样即使数字暂时不准，用户也知道为什么不准，不会把估算当成真实余量。

### 3. Provider-Agnostic Plan Units

Hermes 不一定是小米的 API key；其他人也可能是 OpenAI-compatible endpoint、自建 gateway、LiteLLM、Anthropic、Gemini、Claude Code、OpenCode 或企业内部代理。

所以展示层不能写死“小米 Token Plan”。应该支持：

| Plan Type | Examples | Display Rule |
| --- | --- | --- |
| `rateLimitWindow` | Codex 5h / 7d window | 余量百分比、重置时间、窗口标签。 |
| `tokenPlan` | Xiaomi MiMo credits, prepaid tokens | 总量、已用、剩余、有效期。 |
| `contextWindow` | Hermes/local model context | 已用上下文、上限、是否接近截断。 |
| `billingBudget` | OpenAI/Anthropic project spend | 已花、预算、账期。 |
| `requestQuota` | RPM/TPM/RPD quota | 当前剩余额度、恢复速率。 |
| `summaryOnly` | ccusage/TokenTracker import | 历史汇总，不伪装成实时余量。 |

UI 只根据 plan type 渲染，不根据 provider 名称猜测单位。

### 4. Low-Memory Fun

趣味性不能靠重动画、GIF、Lottie、canvas 常驻循环。方案：

- 艺术字、状态短语、图标、mini chart 全部由 `quota-delight` 状态机驱动。
- 只有在 quota 状态变化时触发动效，不按帧刷新。
- `prefers-reduced-motion` 或 CPU/内存压力高时自动降级成静态。
- 每个趣味 asset 单个不超过 100 KB。
- 动效和颜色必须和实际余量一致：低于 20% 才进入告警语气；5h/7d 用不同色系。

可做的竞品差异化趣味功能：

| Feature | Why Users Care | Performance Rule |
| --- | --- | --- |
| “还能跑几轮？” predictor | 把 token 余量翻译成还能继续工作的感受。 | 只用已有快照和最近事件，刷新频率跟 provider 一致。 |
| “为什么是这个数字？” popover | 用户能看到来源、时间、可信度、重置规则。 | 静态展开，不启动新采样器。 |
| “饭量心情” states | `放心吃`、`刚刚好`、`省着吃`、`等开饭` 让工具有记忆点。 | 只由 shared state machine 输出。 |
| Source honesty badge | 明确显示 `精确`、`延迟`、`估算`、`授权失效`。 | 使用 provider health 字段，不额外请求。 |
| Focus-aware eco mode | 卡顿或内存高时自动降低刷新和动效。 | 只读已有 system metrics，切换到静态 UI。 |
| Local personality packs | 用户可以换标题字、图标、静态 mascot。 | 本地文件，不联网，不收集数据，资产预算受控。 |

## Precision Strategy

准确和及时不能靠“更频繁地扫”。要靠 source hierarchy：

1. 官方 provider quota/billing API。
2. provider 自己的本地 app-server 或明确限额事件。
3. SDK wrapper 返回的 `usage` 字段。
4. 工具本地日志里的已完成请求。
5. 外部工具导入的 summary。
6. 价格表或上下文长度估算。

实现要求：

- 每个 adapter 声明自己能提供的是 `quota`、`usage`、`context`、`cost` 还是 `summary`。
- `summary` 不能驱动实时 HUD 的“余量百分比”，只能作为趋势或历史。
- Codex 的 5h/7d 余量必须和 Codex 可验证来源绑定；如果只能读 token 事件，就标记为本地汇总，而不是 provider 余量。
- Hermes 默认是 provider-agnostic：只有检测到 Xiaomi/MiMo plan API 时才显示 Token Plan；否则显示 context/API usage/summary。
- cookie、API key、bearer token、prompt、completion、源码文件内容都不能进入事件或支持包。

Freshness SLA:

| Source | Live | Warm | Stale |
| --- | --- | --- | --- |
| Local usage event | <= 2 min | <= 15 min | > 15 min |
| Provider quota API | <= 2 min | <= 15 min | > 15 min |
| Imported summary | <= 15 min | <= 24 h | > 24 h |
| Manual/static fixture | never live | always labeled fixture | never used for HUD |

## Stability And Memory Plan

为了避免用户最近遇到的“一卡一卡”，新功能必须先过这些约束：

| Risk | Constraint |
| --- | --- |
| 高频轮询导致卡顿 | provider refresh 默认 >= 15s，active-window 默认 >= 15s，desktop check >= 1s，system metrics >= 2s。 |
| 浏览器页面被 content script 扫描 | DOM 检测必须 event-driven；不使用 unbounded `setInterval`。 |
| HUD 闪烁或消失 | overlay avoidance 只在真实矩形重叠时触发，且需要 debounce。 |
| 数据混用 | active tool provider 优先级必须有测试覆盖：Codex 窗口显示 Codex，Hermes 窗口显示 Hermes，普通浏览器不显示 Hermes。 |
| Debug 日志膨胀 | 默认关闭，公开支持包脱敏，日志上限 <= 1 MB。 |
| Electron 常驻太重 | beta 先守住现有 packaged RSS budget；新增功能不得引入新的常驻 heavy dependency。 |

Release gate 应包含：

- `npm run test:hud-stability`
- `npm run test:performance-budget`
- `npm run performance:summary -- -- --require-clean`
- `npm run delight:contract -- -- --check`
- `npm run support:bundle -- -- --json`
- 10 分钟 Windows idle soak
- 后续 macOS 真机 idle soak

## Feature Roadmap

### P0: Beta Data Trust

目标：先解决“准不准、为什么不准”。

- Provider health 增加 trust ledger 字段。
- HUD/topbar 显示 source honesty badge。
- `status` 和 `support:bundle` 输出每个 provider 的 source、age、confidence。
- adapter template 强制填写 plan type、unit、freshness、privacy boundary。

### P1: Active Context Correctness

目标：不再出现“现在用 Codex 但显示 Hermes”的体验。

- 活跃窗口 provider 选择规则文档化。
- 浏览器 adapter 只在匹配 host/path/title 且 provider 规则命中时启用。
- Overlay avoidance 用矩形重叠判断，不因普通弹窗无脑隐藏。
- 桌面/工具切换延迟作为手动 QA 项记录。

### P2: Low-Cost Delight

目标：有记忆点，但不拖慢电脑。

- 艺术字和图标继续保留，但全部从 shared delight state 读取。
- mini chart 的颜色、fill、状态短语和同一个 remaining value 绑定。
- 低于 20% 的提醒只在状态变化时出现，用户 dismiss 后不重复打扰。
- 高 CPU/高内存时自动进入 static mode。

### P3: “Can I Keep Working?” Predictor

目标：竞品很少把余量转成行动建议。

- 用最近 1h 真实 usage 估算还能支持多少轮。
- 对每个 provider 输出 confidence：`high` / `medium` / `low`。
- 低 confidence 时明确写“只能估算”，不显示假精确。
- 因为 agentic coding 的 token 消耗波动很大，预测应该是行动提示，不应该包装成账单级精确值。

### P4: Interop Instead Of Parser Warehouse

目标：让生态帮我们扩展，而不是核心 runtime 变重。

- 继续维护 TokenTracker/ccusage summary import。
- 增加 adapter scorecard：准确性、隐私、性能、验证命令。
- 推荐社区 adapter 独立发布，核心只收协议和 reference adapter。

## Open-Source Beta Acceptance

源码 beta 可以发出的最低标准：

- README 清楚说明项目不是万能 parser，不保证所有 provider 精确。
- 默认不需要云服务，不上传 telemetry。
- 本地 secret/cookie/API key 不入库、不进支持包。
- Codex、Hermes、generic local API 三条路径的 status 可以解释数据来源。
- `release:check` 通过。
- `secret:scan` 和 `license:check` 通过。
- `performance:summary` 不提示新增 unreviewed polling risk。
- 至少有一份 Windows 10 分钟 idle soak 证据。
- 未完成的 macOS、签名、公证、浏览器/IDE 手动验证明确列为 blocker，不包装成已完成。

## Source Notes

本轮主要参考：

- [TokenTracker GitHub topic entry](https://github.com/topics/usage-tracker)
- [Token Use](https://www.tokenuse.app/)
- [Token Meter](https://token-meter.dev/)
- [TokenBBQ](https://offbyone.cloud/)
- [tokenusage](https://tokenusage.org/)
- [ccusage](https://ccusage.com/) and [ccusage GitHub](https://github.com/ryoppippi/ccusage)
- [toktap](https://toktap.co/)
- [CodexBar GitHub](https://github.com/steipete/codexbar) and [CodexBar site](https://codexbar.app/)
- [onWatch GitHub](https://github.com/onllm-dev/onwatch)
- [How Do AI Agents Spend Your Money?](https://arxiv.org/abs/2604.22750)

## One Sentence Strategy

竞品做“我用了多少 token”，我们做“你现在能不能继续工作，而且这个答案为什么可信”。
