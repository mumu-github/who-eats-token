# Next Product Design Plan

基于 [competitive-differentiation-plan.md](competitive-differentiation-plan.md)，下一阶段产品设计目标不是“更炫”，而是把实时余量监控做成一个可信、轻量、有陪伴感的桌面工具。

## Product Principle

一句话：

> 让用户在工作现场立刻知道：现在用的是哪个模型、还能用多少、这个数字靠不靠谱、要不要省着点。

优先级：

1. 数据可信。
2. 不挡操作。
3. 不拖慢机器。
4. 有一点可爱和松弛感。
5. 能被开源社区扩展，但核心保持轻。

## Design North Star

### Ambient, Not Dashboard

默认界面不是一个大面板，而是两个轻量层：

- **桌面顶栏**：只在桌面出现，展示全局最重要的容量和系统健康。
- **工具 HUD**：只在活跃工具内出现，展示当前工具的 plan、余量、可信度和轻量预测。

详细 dashboard 可以存在，但不作为第一屏，也不常驻。

### Trust Before Decoration

每个数字都要有来源解释。UI 不再只显示 `85%`，而是显示：

- `精确`：来自 provider 或本地明确事件。
- `汇总`：来自本地事件累计。
- `延迟`：数据可靠但有缓存。
- `估算`：只能辅助判断。
- `过期`：不应作为决策依据。
- `要登录`：凭据失效。

这些状态同时驱动颜色、文案、图标和动效。

## Core Surfaces

### 1. Desktop Top Bar

用途：桌面态的总览，不打扰工作区。

布局建议：

| Area | Content | Notes |
| --- | --- | --- |
| Brand | 艺术字“谁在吃 token” + 状态点 | 保留趣味记忆点。 |
| Active provider card | 当前最吃紧或最近活跃 provider | 显示 provider、plan type、今日/近 1h。 |
| Quota windows | 5 小时、一周或当前 provider 的主 plan | 不同 plan type 使用不同单位。 |
| Mini bars | 5h / 7d / token plan 双柱图 | 颜色和真实余量绑定。 |
| System health | CPU、内存、可用内存、eco mode | 不显示温度，避免不可靠硬件读数。 |
| Close/settings | 关闭或进入设置 | 图标按钮，不放大文字按钮。 |

宽度：

- 默认屏幕宽度 `1/2`。
- 小屏或信息不足时压缩为 `1/3`。
- 不够显示时隐藏次要字段，而不是挤压主数字。

### 2. Tool HUD

用途：当前工具内的快速判断。

信息层级：

1. Provider 名称和 plan badge。
2. 主余量：例如 `Codex 5h 85%` 或 `Hermes Token Plan 24%`。
3. 次余量：一周、已用、上下文、近 1h。
4. Trust badge：`精确` / `延迟` / `估算` / `要登录`。
5. “还能跑几轮”轻预测。

位置规则：

- 默认右下角。
- Hermes Web UI 可使用工具专属 bottom offset。
- 只有检测到 HUD 矩形会遮挡输入框、发送按钮、弹窗主内容时，才移动或隐藏。
- 普通页面、非 Hermes Web UI、非匹配工具窗口，不显示 Hermes HUD。

### 3. Trust Popover

点击 trust badge 后展开一个小 popover。

内容：

- 数据来源：`Codex token_count local event` / `Xiaomi tokenPlan usage API` / `SDK usage field`
- 更新时间：例如 `42 秒前`
- 新鲜度：`live` / `warm` / `stale`
- 可信度：`exact-provider` / `exact-local` / `derived` / `estimated`
- 刷新策略：例如 `15s cache window`
- 隐私边界：`未读取 prompt / completion / API key`

这个 popover 是差异化重点：它把“为什么这个数字可信”讲清楚。

## Visual Language

### Personality

关键词：可爱、松弛、轻、透明、不过度拟物。

视觉方向：

- 毛玻璃底，但边界要轻，不要厚重外框。
- 文字圆润，数字清晰。
- 状态色温和但有区分：5h 偏暖黄，一周偏蓝，低余量偏珊瑚红。
- 图标小而明确：时钟、日历、钥匙、碗、闪电、月亮。
- mascot 可选，只做静态 pose 或状态切换，不做循环动画。

### Color Semantics

| State | Color | Use |
| --- | --- | --- |
| Comfortable | mint green | 余量充足、精确、健康。 |
| Steady | sky blue | 一周窗口、稳定状态。 |
| Tight | warm yellow | 余量偏紧、需要注意。 |
| Low | coral red | 低于 20% 告警。 |
| Delayed | soft amber | 数据延迟或缓存。 |
| Estimated | lavender gray | 估算和低可信度。 |
| Disabled | neutral gray | 未启用或无数据。 |

## Fun Interaction System

所有趣味元素都来自 `quota-delight`，不能各组件自己编状态。

### Delight States

| State | Label | Motion Cue | UI Behavior |
| --- | --- | --- | --- |
| `comfy` | 放心吃 | soft pulse once | 数字轻微弹入，mini bar 饱满。 |
| `steady` | 刚刚好 | calm settle | 静态稳定，少动效。 |
| `tight` | 省着吃 | gentle breathe | mini bar 慢速一次呼吸。 |
| `low` | 省着点 | one-shot warning wiggle | 只在进入低余量时提醒一次。 |
| `empty` | 快见底 | static alert | 不循环闪烁，避免焦虑。 |
| `delayed` | 慢半拍 | clock tick once | 显示数据年龄。 |
| `auth` | 要登录 | key icon nudge | 引导刷新凭据。 |
| `missing` | 等开饭 | quiet peek | 不抢注意力。 |

### Micro-Animation Rules

- 动效只在状态变化时触发。
- 不使用常驻 GIF/Lottie/canvas loop。
- CPU 或内存压力高时进入 static mode。
- reduced motion 下所有动效变成 opacity/position 的一次性极小过渡，或完全静态。
- 所有图表填充宽度、颜色和文案必须由同一个 remaining value 推导。

## Data Design

下一步需要把 provider snapshot 设计成 UI 可解释的数据模型。

```json
{
  "providerId": "hermes",
  "name": "Hermes",
  "planType": "tokenPlan",
  "primaryMetric": {
    "label": "总余量",
    "unit": "credits",
    "remainingPercent": 24,
    "used": 152750000,
    "total": 200000000
  },
  "trust": {
    "level": "exact-provider",
    "label": "精确",
    "sourceLabel": "Provider plan usage API",
    "updatedAt": "2026-05-25T12:00:00.000Z",
    "ageMs": 15000,
    "explain": "来自 provider usage API；未读取 prompt、completion 或 API key。"
  },
  "delight": {
    "id": "tight",
    "shortLabel": "省着吃",
    "tone": "caution",
    "motion": "breathe"
  }
}
```

## Screen Designs

### A. Desktop Overview

主目标：

- 桌面上看一眼就知道整体情况。
- 中间不留大空白。
- 系统状态不抢 token 状态的主次。

建议布局：

```text
[谁在吃 TOKEN] | [Hermes · Token Plan · 精确 · 近1h 560k] | [5小时 85%] [一周 84%] | [bars] | [CPU 13%] [内存 57%] [可用 13.5G] [x]
```

### B. In-Tool HUD

主目标：

- 与输入区域保持距离。
- 工具识别稳定。
- 不遮挡发送按钮、弹窗、权限面板。

建议布局：

```text
Hermes                         Token Plan · 精确
总余量 24%        已用 152.75M        left/used bars
还能跑约 3-5 轮 · 更新 15 秒前 · 5/29 到期
```

### C. Trust Popover

主目标：

- 让用户理解为什么这个数字可信或不可信。
- 出问题时告诉用户下一步操作，而不是只显示错误。

建议内容：

```text
数据可信度：精确
来源：Provider plan usage API
更新：15 秒前
单位：Credits
刷新：15s cache window
隐私：未读取 prompt / completion / API key
```

### D. Eco Mode

触发：

- CPU 持续高。
- 内存压力高。
- 用户开启低动效。

表现：

- 顶栏显示 `静音模式` 或 `省电显示`。
- 关闭所有非必要动效。
- 降低系统指标刷新频率。
- 保留主余量数字，不隐藏关键数据。

## Implementation Slices

### Slice 1: Trust Ledger UI

产出：

- provider health 加 trust 字段。
- HUD/topbar 显示 trust badge。
- status/support bundle 输出 trust explain。
- 增加 fixture 覆盖 exact、delayed、estimated、auth-expired。

验收：

- 用户能从 UI 看出 Codex/Hermes 数字来源。
- stale 或 estimated 不再显示得像 live exact。

### Slice 2: Active Tool HUD Rules

产出：

- provider display resolver 独立成可测试模块。
- Hermes Web UI host/path 规则明确。
- Codex active window 不回退到 Hermes。
- 普通浏览器页面不显示 Hermes HUD。

验收：

- `test:hud-stability` 增加当前工具识别和 HUD 显隐场景。
- 切桌面时工具 HUD 快速隐藏，顶栏快速出现。

### Slice 3: Delight-Driven Visual Refresh

产出：

- 艺术字、mini bar、状态 pill、警告色都读取 shared delight。
- 添加 state transition one-shot animation。
- 加 reduced-motion 和 eco mode 降级。

验收：

- `delight:contract -- --check` 通过。
- 新增动效不增加轮询。
- 低于 20% 时提醒一次，dismiss 后不重复骚扰。

### Slice 4: Can-I-Keep-Working Predictor

产出：

- 使用近 1h usage 和主余量估算还能跑几轮。
- 输出 confidence。
- UI 显示行动文案：`还能跑约 3-5 轮`、`只够轻量对话`、`等重置更稳`。

验收：

- 低 confidence 时明确标记估算。
- 不把 summary import 包装成实时预测。

## Open-Source Design Guardrails

- 默认不联网、不收集遥测。
- fun pack 必须本地、可关闭、低资源。
- 新 provider 只能通过 adapter contract 声明自己的数据类型和可信度。
- README 不能承诺“所有工具都精确”。
- issue 模板要求附 `support:bundle`，但支持包必须脱敏。

## Visual Regression Mock

下一步做视觉调试时，可以用 Electron 离屏渲染 mock 截图，不启动真实采集，也不会触发 provider 请求：

```powershell
.\node_modules\.bin\electron.cmd scripts\render-ui-mock.mjs
```

输出在 `output/playwright/`，该目录不进入 git。它只用于检查顶栏和 HUD 的文本拥挤、状态色、mascot、trust badge、mini chart 是否对齐。

## Next Decision

优先做 **Slice 1 + Slice 2**。

原因：

- 它们直接解决用户最痛的“不准、不及时、显示错工具、HUD 乱出现”。
- 它们也是后续趣味交互的地基。
- 如果没有 trust 和 active context，越多动画越像噪音。

设计上，下一版应该先像一个可靠的小仪表，再像一个可爱的陪伴物。
