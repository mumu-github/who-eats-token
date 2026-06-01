# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-05-28
- Primary product surfaces: desktop top bar, in-tool HUD, trust popover, settings overlay, token generator, token flow, roaming mascot.
- Evidence reviewed: `docs/next-product-design-plan.md`, `docs/delight-contract.md`, `docs/performance-budget.md`, `docs/manual-validation.md`, `src/renderer/index.html`, `src/renderer/hud.html`, `src/renderer/styles.css`, `src/renderer/app.js`, `src/assets/delight/roaming/`, `scripts/render-ui-mock.mjs`, `scripts/test-hud-stability.mjs`.

## Brand
- Personality: 可爱、轻量、可信、有陪伴感，但不抢工作流主角。
- Trust signals: 数字来源、可信度状态、刷新年龄、低余量语义必须清晰。
- Avoid: 常驻大面板、营销式 hero、无意义循环动画、影响输入焦点的透明窗口装饰。

## Product goals
- Goals: 让用户一眼知道当前谁在吃 token、还能不能继续、这个数字靠不靠谱。
- Non-goals: 不做完整系统监控面板，不把 CPU/内存做成主角，不用弹窗解释基础功能。
- Success signals: 桌面顶部条稳定出现，工具 HUD 不抢焦点，低余量提示清楚但安静。

## Personas and jobs
- Primary personas: 长时间使用 Codex/Hermes/浏览器 AI 工具的本地开发者。
- User jobs: 判断剩余额度、识别当前活跃工具、理解数据可信度、避免被 overlay 干扰输入。
- Key contexts of use: Windows 桌面、Codex/Hermes 工具窗口、普通应用切换、弹窗和设置窗口出现时。

## Information architecture
- Primary navigation: 无常规导航；顶部条和 HUD 是环境感知层，设置窗口负责配置。
- Core routes/screens: desktop top bar、tool HUD、trust popover、settings overlay。
- Content hierarchy: 当前工具/额度判断优先，其次 5h/7d 或 token plan 窗口，再其次系统健康和关闭/设置控制。

## Design principles
- Principle 1: 桌面状态台先回答“还能不能继续”，再展示辅助指标。
- Principle 2: 趣味必须由真实 quota/trust/delight 状态驱动，不能自造情绪。
- Token interaction: token 必须从顶部条内固定 `token-generator` 源点产生，再沿可见轨迹飞向小人；不要把 token 粒子直接挂在小人身上伪装成“吃”。
- Mascot scale: 只放大小人和透明舞台里的动作，不放大玻璃顶部条；小人尺寸必须独立于 `--bar-height`。
- Layout guardrail: 小人只能围绕 `token-generator` 的左/下/右锚点活动，不能重新锚到 usage、brand、chart 等主信息区域。
- Tradeoffs: 保留玻璃质感和 mascot 记忆点，但降低系统指标和装饰光效的主视觉权重。

## Visual language
- Color: 绿色表示健康和可信，黄色表示接近紧张，珊瑚红表示低余量，蓝色表示周期窗口，灰色表示辅助系统状态。
- Typography: 数字清楚、标签短、紧凑控件内不使用夸张大字号。
- Spacing/layout rhythm: 顶部条是紧凑单行状态台；发生器位于条内，token 飞行轨迹和小人位于透明舞台，顶部条高度不能被小人尺寸牵着变大。
- Shape/radius/elevation: 玻璃圆角主容器，内部状态块圆角更克制，阴影只用于可读性。
- Motion: 装饰动画只在状态变化或短时游走时出现；reduced-motion 下必须静态可读。
- Imagery/iconography: 小人是 token 消费者，发生器是 token 来源，二者之间需要有明确空间关系和粒子路径。

## Components
- Existing components to reuse: `usage-strip`, `metric`, `mini-chart`, `system-strip`, `hud`, `trust-popover`。
- New/changed components: `token-generator` 作为条内固定发生器；`token-flow` 作为发生器到小人的粒子轨迹层；`roaming-mascot` 作为消费者，不再拥有本地 token 粒子或旧 `bite/bowl/chase` 场景。
- Asset set: 当前 roaming 资产为 `token-peek.png`、`token-catch.png`、`token-eat.png`、`token-wait.png`、`token-panic.png`、`token-guard.png`、`token-run.png`、`token-generator.png`。
- Variants and states: healthy、caution、danger、unknown、delayed、estimated、login、asleep。
- Token/component ownership: quota/trust/delight 语义来自 `src/protocol/quota-delight.cjs` 和 provider snapshot；renderer 只负责呈现。

## Accessibility
- Target standard: 本地桌面工具的可读性和 reduced-motion 友好优先。
- Keyboard/focus behavior: overlay 不能抢工具输入焦点；设置/popover 出现时保留对应顶部条或 HUD 预览。
- Contrast/readability: 玻璃背景必须有足够遮罩和描边，数字不能被桌面背景吞掉。
- Screen-reader semantics: 装饰小人和粒子 `aria-hidden`，关键状态通过文本和 label 暴露。
- Reduced motion and sensory considerations: 禁止常驻高频闪烁；低余量提示不能重复骚扰。

## Responsive behavior
- Supported breakpoints/devices: Windows 桌面宽屏优先，小宽度下隐藏次要信息而不是压缩主数字。
- Layout adaptations: 顶部条贴顶居中；小人围绕发生器在透明舞台内活动，不遮挡主信息。
- Touch/hover differences: 桌面鼠标环境优先，悬浮信息不能作为唯一可用入口。

## Interaction states
- Loading: 显示安静的未知/等待状态，不伪装成实时余量。
- Empty: 使用低余量/快见底语义，数字仍优先。
- Error: 使用 trust/auth/missing 文案说明下一步，不用纯红色惊吓。
- Success: 健康状态轻微高亮，不循环庆祝。
- Disabled: 小人休息，关键数字置灰或隐藏。
- Offline/slow network, if applicable: delayed/stale 与 live 明确区分。

## Content voice
- Tone: 短、轻、像一个懂工作的桌面同伴。
- Terminology: 继续使用“谁在吃 token”“慢半拍”“省着吃”“过期”“精准”等现有语义。
- Microcopy rules: 先给判断，再给来源；避免把内部实现词暴露给普通用户。

## Implementation constraints
- Framework/styling system: Electron renderer + plain HTML/CSS/JS。
- Design-token constraints: 优先扩展现有 CSS variables，不引入新 UI 框架。
- Performance constraints: 不新增 provider polling，不新增高频 window scan，不新增超过 100KB 的 delight 资源。
- Compatibility constraints: Windows overlay 稳定性优先；透明窗口必须避免焦点和命中测试副作用。
- Test/screenshot expectations: `npm run test:hud-stability`, `npm run test:delight-contract`, `npm run test:performance-budget`, `npm run check`, `node scripts/render-ui-mock.mjs`。

## Open questions
- [ ] 是否需要为不同 provider 提供单独小人动作包 / owner: product / impact: 中。
- [ ] 系统指标是否应在低宽度或低性能模式下完全折叠 / owner: product / impact: 低。
- [ ] 顶部条是否要支持用户选择更紧凑的信息密度 / owner: product / impact: 中。
