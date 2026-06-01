# 项目上下文

## 项目目标
- 这是一个本地低开销 LLM token/容量监控桌面工具，核心表面是桌面顶部条、工具内 HUD、可信度 Popover 和设置窗口。
- 主要用户是在 Windows/macOS 上长时间使用 Codex、Hermes、浏览器 AI 工具的开发者。
- 默认沟通和项目记忆使用中文；代码、变量名和接口名沿用仓库现有英文风格。

## 当前架构要点
- Electron + Node.js；renderer 使用静态 HTML/CSS/JS。
- 主进程入口：`src/main.cjs`，负责窗口创建、overlay coordinator、IPC 与本地采集服务。
- 前端入口：`src/renderer/app.js` 顶部条，`src/renderer/hud.js` 工具 HUD，`src/renderer/settings.js` 设置页。
- 前台窗口检测在 `src/system/active-window.cjs`；工具识别在 `src/system/tool-detector.cjs`。
- 项目级知识图谱位于 `.understand-anything/knowledge-graph.json`。
- 当前底层优化执行基准来自 `C:\Users\lhy10\Desktop\token.md` 与 2026-05-29 源码核验后的最终方案。后续执行不要重新发散优先级，必须先看 `agent_memory/progress.md` 的推进看板。
- 2026-05-29：最终优化方案内 P0 / P1 / P2 代码项已执行完成并通过匹配范围回测；后续除非用户明确提出新目标，不要重新打开已完成方案。
- 数据主链路：Codex JSONL / Hermes state.db / Local API / Hermes Bridge / Adapter -> collectors -> `src/main.cjs collectSnapshot()` -> providerHealth / totals / providers -> IPC / `/snapshot` / `/health` -> 顶部条 / HUD / trust popover / settings。
- 窗口主链路：active-window -> overlay reports -> tool-detector -> overlay decision -> desktop topbar 或 tool HUD。

## 最终优化方案基准
- P0：本地 API 安全边界。`POST /events`、`POST /overlays` 默认必须 token；无 `Origin` 绕过只能作为显式兼容开关存在。
- P0：Bridge / ingest 稳定性。Hermes Bridge 加上游 timeout 和上报失败可见性；ingest recent O(n²) 改单遍历；overlayReports 加数量上限。
- P0：provider 来源模型。不能只按 `provider.id` 混合来源；增加 `sourceId`，usage / quota / context / health 分策略聚合。
- P1：Hermes schema 兼容。启动时做 SQLite capability detection，schema 不兼容时明确报告缺失表/字段。
- P1：拆 `main.cjs`。只先抽 `snapshot-service`、`server-manager`、`window-safe-send`，不要大重写 Electron 窗口仲裁。
- P1：renderer 共享 view model。抽 `format`、`quota-view-model`、`trust-popover`，让顶部条和 HUD 共用展示口径。
- P2：定位与 IPC 硬化。抽 `geometry-service`；给 IPC payload 做白名单、尺寸和字符串长度限制。
- P2：token 估算分级。官方 usage > tokenizer > 启发式估算，启发式必须在 UI/health 中标记 estimated。

## 当前设计决策
- `DESIGN.md` 是本仓库 UI/UX 决策源文档；本轮已补齐，后续顶部条/HUD/小人调整应先参考它。
- 桌面顶部条按“桌面状态台”设计：先回答“谁在吃 token、还能不能继续、数字靠不靠谱”，CPU/内存只作为右侧辅助信息。
- 顶部条信息层级：左侧品牌和当前工具，中间当前 provider/plan/trust/用量，右侧 5h/7d 或 token plan 主指标、mini chart、系统状态和关闭/设置入口。
- 顶部条 `usage-strip` 已扩展为 provider 名称、状态、trust、余量百分比、今日/近期用量、重置/账期/新鲜度提示；不要再把这块当纯装饰空框处理。
- 小人和“吃 token”交互必须由真实 quota/trust/delight 状态驱动：healthy 使用轻松接币/等待/跑动，caution 偏等待/接币/吃，danger 固定吃 token。
- token 叙事源点固定为顶部条内 `token-generator`；`token-flow` 负责从发生器飞向小人；不要再把 token 粒子挂在小人内部伪装成“吃”。
- `token-generator` 和 `token-flow` 必须继承与顶部条一致的 `level/mode/delightTone/--quota-fill/--flow-speed`，让发生器颜色、余量环、飞行轨迹和小人状态联动。
- 小人尺寸固定为独立 `--roaming-unit: 96px`，只放大小人，不放大玻璃顶部条；小人锚点只围绕发生器左/下/右移动，不再锚到 usage、brand、chart 等主信息区域。
- 当前 roaming 资源集：`token-generator.png`、`token-peek.png`、`token-catch.png`、`token-eat.png`、`token-wait.png`、`token-panic.png`、`token-guard.png`、`token-run.png`。

## 当前窗口仲裁决策
- 2026-05-31 起，桌面顶部条 / 工具 HUD / 全隐藏只允许由 `src/main/overlay-controller.cjs` 这个纯状态机输出：`desktop-topbar`、`tool-hud`、`hidden`。
- `active-window` 只负责采样、归一化和桌面辅助瞬态窄匹配；不要在其中新增“该显示顶部条还是 HUD”的策略分支。
- Windows 下若非 focusable overlay 或原生库返回旧全屏工具样本，`active-window` 只能做采样纠偏：own/external overlay foreground 优先回查桌面 base；Win32 桌面 foreground probe 仅在最新 surface 为 `tool-hud` 时启用，用于校正 tool -> desktop 的陈旧 native sample，不得变成新的 overlay 策略层。
- `tool-detector` 只认当前确认前台工具；remembered tool 只能作为“最近工具”展示元信息，不得复活 HUD，也不得阻止顶部条消失。
- 未知窗口、通知、LockApp、采样超时、0x0 Explorer shell 等默认进入 `unknown/hidden` 或 bounded noise；不要把每个新窗口名继续堆成桌面补丁。
- 噪声帧最多保留旧 surface `300ms`，超时宁可隐藏全部，也不要让顶部条留在工具里或 HUD 留在桌面上。
- 确认工具前台后，顶部条必须在最多 `400ms` 内消失；确认桌面前台后，HUD 必须在最多 `400ms` 内消失。
- `refreshToolHud()` 是纯渲染函数，只接收状态机给出的 tool/window/snapshot；不要在内部重新 `getActiveWindow()`、重新判定 surface 或使用 remembered tool 改判。
- 所有窗口 show/hide 必须经 `applyOverlayTransition()` 原子切换；同一 tick 内完成隐藏旧 surface 和显示新 surface，并记录 `sampleId/from/to/reason/latencyMs/stalePreserveMs`。
- `showToolHudWindow()` 不再自行隐藏顶部条；窗口可见性归中心 transition 管，渲染函数只负责把 HUD 内容和位置刷正确。
- Native bounds 采样需要同时处理 1-2px 抖动与 HiDPI 物理/逻辑等价；避免同一 Codex 窗口在等价 bounds 间反复触发 HUD 刷新。
- Overlay coordinator 周期保持 `200ms`；不要用加密轮询掩盖仲裁问题，性能预算必须继续守住。
- Windows 桌面辅助瞬态仍只能窄匹配：`ClickToDo.exe`、`NarratorHelperWindow`、Explorer `Host Popup Window` / `主机弹出窗口`；它们触发 fallback，不直接伪装成桌面。
- 压力回测必须统计 `topbarVisibleWhileToolMs`、`hudVisibleWhileDesktopMs`、`surfaceTransitionCount`、`stalePreserveMs`，不能只看 settled 成败。

## 验证约定
- UI/窗口相关改动至少运行：`npm run test:hud-stability`、`npm run test:delight-contract`、`npm run test:performance-budget`、`npm run check`。
- 涉及桌面/工具切换还需优先运行：`npm run test:window-detection`、`npm run test:hud-stability`、`npm run test:overlay-state`、`npm run test:performance-budget`、`npm run test:local-health`、`npm run check`、`git diff --check`，并用 `npm run status` 确认运行中应用健康。
- 涉及 overlay 仲裁的真实压力回测至少 50 轮，要求工具态顶部条残留 `<=400ms`、桌面态 HUD 残留 `<=400ms`、失败数为 0。
- 视觉改动用 Electron mock：`.\node_modules\.bin\electron.cmd scripts\render-ui-mock.mjs`，必要时通过 `WHO_EATS_TOKEN_DEMO_MOOD` 检查 comfy/tight/low 状态。
- delight 资源单个 PNG 不得超过 100KB，除非 release note 明确说明例外。
## 2026-06-01 Overlay 仲裁补充约束
- tool -> desktop 的快速 wake helper 只能把已确认桌面样本喂回统一 coordinator，不得直接 show/hide 窗口，不得绕过 `overlay-controller`。
- priority wake sample 必须能废掉旧普通采样，并且在 priority 应用期间阻止新的普通 coordinator pass 覆盖结果；当前由 `overlayCoordinatorGeneration` 与 `overlayCoordinatorPriorityInFlight` 保证。
- 压测残留时间必须按阶段统计：桌面残留只看桌面阶段且前台确认桌面的样本，工具残留只看工具阶段且前台确认工具的样本；前台未到达目标必须单独作为 `environmentInterference`，不能混入产品残留时间。
