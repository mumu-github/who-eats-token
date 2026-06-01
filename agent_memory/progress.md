# 当前进度

## 当前长期目标（2026-05-29）
- 严格按最终优化方案完整执行《谁在吃 token》底层优化。
- 每次继续执行前必须先读取 `agent_memory/context.md`、`agent_memory/progress.md`、`agent_memory/bugs.md`，并向用户同步当前推进位置。
- 不要重新发散优先级；除非用户明确改方案，否则按 P0 -> P1 -> P2 顺序推进。
- 每阶段完成后必须更新本文件；代码改动涉及运行逻辑时必须执行匹配范围回测。

## 推进看板
- [已完成] P0-1 本地 API 安全边界：`POST /events`、`POST /overlays` 默认强制 token；无 `Origin` 兼容改为显式设置项。
- [已完成] P0-2 Bridge / ingest 稳定性：Hermes Bridge 上游 timeout、usage 上报失败 health 可见；ingest recent O(n²) 单遍历；overlayReports 数量上限。
- [已完成] P0-3 provider 来源模型：引入 `sourceId`，按 usage / quota / context / health 分策略聚合，避免 Hermes Local / Bridge / HTTP ingest 混算。
- [已完成] P1-1 Hermes schema capability：检测 SQLite 表/字段能力，schema 不兼容时返回明确缺失原因。
- [已完成] P1-2 `main.cjs` 小拆：先抽 `snapshot-service`、`server-manager`、`window-safe-send`，不大改窗口仲裁。
- [已完成] P1-3 renderer 共享 view model：抽 `format`、`quota-view-model`、`trust-popover`，统一顶部条与 HUD 展示。
- [已完成] P2-1 定位与 IPC 硬化：抽 `geometry-service`；IPC payload 做白名单、尺寸和字符串长度限制。
- [已完成] P2-2 token 估算分级：官方 usage / tokenizer / 启发式分级，启发式明确标记 estimated。
- [已完成] R-1 安全配置运行态生效：`security.allowUnauthenticatedNoOrigin` 变化会触发 ingest / Hermes Bridge 重启，并由性能预算测试守住。
- [已完成] R-2 设置页空数字输入：空值编辑中跳过写入并保留原值，不再落成 `0` 或最小阈值。
- [已完成] R-3 overlay report TTL：3 秒后标 stale，保留到 15 秒再剪枝，`/overlays` reports 和 hints 暴露 stale/过期语义。
- [已完成] R-4 Hermes Bridge SSE usage 回测：已覆盖 OpenAI Chat/Responses stream、最终 chunk usage、`response.completed`、非 JSON event、上游中断和 ingest 上报失败。

## 本轮已完成
- 已将最终优化方案写入 `agent_memory/context.md`。
- 已将执行顺序、停止条件和推进看板写入本文件。
- 已创建当前长期目标，停止条件为全部方案执行并回测通过。
- P0-1：`settings.security.allowUnauthenticatedNoOrigin` 默认 false；ingest 和 Hermes Bridge 默认不再允许无 `Origin` 请求跳过 token。
- P0-2：ingest recent 统计改为单遍历；overlayReports 增加 128 条上限；Hermes Bridge 增加上游 timeout、上游错误/延迟 health、usage post 失败计数与延迟。
- P0-3：Codex、Hermes Local、HTTP ingest、Hermes Bridge usage 增加来源区分；snapshot/providerHealth 暴露 `sourceId`、`sources`、`usageAggregation`。
- P1-1：Hermes Local Collector 先探测 `sessions`/`messages` 表和字段，再按能力动态查询；最小兼容 schema 可降级运行，缺 `sessions.id`/`sessions.started_at` 时明确报 schema 不兼容。
- P1-2：新增 `src/main/window-safe-send.cjs`、`src/main/server-manager.cjs`、`src/main/snapshot-service.cjs`；`main.cjs` 保留窗口仲裁和薄包装，不再直接承载安全 IPC send、server 启停细节和 provider merge/snapshot build。
- P1-3：新增 `src/renderer/shared/format.js`、`quota-view-model.js`、`trust-popover.js`；顶部条和 HUD 共享 quota/trust/format 展示口径，相关 HTML 已按顺序加载共享脚本。
- P2-1：新增 `src/main/geometry-service.cjs` 和 `src/main/ipc-guards.cjs`；窗口几何工具从 `main.cjs` 抽离，settings preview/update、mouse region、trust popover IPC payload 经过白名单、范围和字符串长度限制。
- P2-2：新增 `src/protocol/token-accuracy.cjs`；Codex、Hermes Local、ingest events、snapshot merge、provider health、HUD payload 统一暴露 `tokenAccuracy` / `tokenEstimated`，Hermes 启发式文本长度估算会在 health/UI 标记为 estimated。

## 下一步
- code review 发现的 R-1 -> R-2 -> R-3 -> R-4 收尾项已补齐并通过匹配范围回测。
- 后续若继续本项目，仍需先读取本文件；不要重新打开已完成方案，除非用户明确提出新目标。
- 真实 Windows 长时间使用的目视确认仍保留：连续 Codex 输入、桌面/Codex 快速切换、HUD trust hover、设置弹窗和可信度 Popover。

## 收尾修复记录（2026-05-30）
- R-1：`restartIngestServerIfNeeded()` 和 `restartHermesBridgeIfNeeded()` 增加 `hasLocalApiSecurityChanged()` 判定，安全兼容开关变更会重启本地服务。
- R-2：`settings.js` 增加 `readSettingInput()` / `readNumberInput()`，空数字输入跳过写入，输出区域不再把空值显示成 `0`。
- R-3：`ingest-server.cjs` 将 overlay report 生命周期改为 `OVERLAY_FRESH_MS = 3000`、`OVERLAY_RECENT_MS = 15 * 1000`，并暴露 `freshness`、`stale`、`expiresAt`。
- R-4：`hermes-bridge.cjs` 处理上游响应 `aborted/error`，避免中断流悬挂；`scripts/test-hermes-bridge.mjs` 补齐流式 usage 与异常链路回测。

## 维护记录（2026-05-30）
- 已按用户要求重启本地应用：停止旧的 `node/electron` 项目进程后重新启动，`127.0.0.1:17667/health` 返回 `ok=true`、`snapshotAvailable=true`。
- 已清理明确可重建缓存：Electron `Cache`、`Code Cache`、`GPUCache`、`DawnGraphiteCache`、`DawnWebGPUCache`、`blob_storage`、`Session Storage`，以及项目 `.understand-anything/tmp`。
- 已保留关键状态：`api-token.txt`、`settings.json`、`Local Storage`、`Preferences`、`.understand-anything/knowledge-graph.json` 未删除。
- 未发现 `.tmp/.bak/.old/.log` 等可判定无效源码文件；以 `npm run check` 和 `git diff --check` 验证源码语法与 diff 空白均正常。

## 最近验证
- `node --check src/collectors/ingest-server.cjs`
- `node --check src/collectors/hermes-bridge.cjs`
- `node --check src/config/settings.cjs`
- `node --check src/main.cjs`
- `node --check src/protocol/provider-health.cjs`
- `node --check scripts/test-hermes-bridge.mjs`
- `node --check scripts/test-local-health.mjs`
- `npm run test:local-health`
- `npm run test:hermes-bridge`
- `npm run test:adapter-contract`
- `npm run test:provider-health`
- `npm run test:protocol`
- `node --check src/collectors/hermes-local.cjs`
- `node --check scripts/test-hermes-local.mjs`
- `npm run test:hermes-local`
- `node --check src/main/window-safe-send.cjs`
- `node --check src/main/server-manager.cjs`
- `node --check src/main/snapshot-service.cjs`
- `node --check src/main/geometry-service.cjs`
- `node --check src/main/ipc-guards.cjs`
- `node --check src/renderer/shared/format.js`
- `node --check src/renderer/shared/trust-popover.js`
- `node --check src/renderer/shared/quota-view-model.js`
- `node --check src/renderer/app.js`
- `node --check src/renderer/hud.js`
- `npm run test:hud-stability`
- `npm run test:performance-budget`
- `npm run test:delight-contract`
- `npm run test:window-detection`
- `node --check src/protocol/token-accuracy.cjs`
- `node --check src/protocol/usage-event.cjs`
- `node --check src/collectors/hermes-local.cjs`
- `node --check src/collectors/ingest-server.cjs`
- `node --check src/protocol/provider-health.cjs`
- `node --check src/main/snapshot-service.cjs`
- `node --check src/main.cjs`
- `node --check src/renderer/hud.js`
- `node --check scripts/test-hermes-local.mjs`
- `node --check scripts/test-provider-health.mjs`
- `node --check scripts/test-adapter-contract.mjs`
- `npm run test:codex-collector`
- `npm run test:protocol`
- `npm run test:hermes-local`
- `npm run test:provider-health`
- `npm run test:adapter-contract`
- `npm run test:local-health`
- `npm run test:hermes-bridge`
- `npm run test:quota-delight`
- `npm run test:docs`
- `npm run check`
- `git diff --check`
- 2026-05-30 维护后复跑：`npm run check`
- 2026-05-30 维护后复跑：`git diff --check`
- 2026-05-30 维护后验证：`GET http://127.0.0.1:17667/health`，结果 `ok=true`、`snapshotAvailable=true`
- 2026-05-30 R-1/R-2/R-3/R-4 收尾回测：`node --check src/main.cjs`
- 2026-05-30 R-1/R-2/R-3/R-4 收尾回测：`node --check src/renderer/settings.js`
- 2026-05-30 R-1/R-2/R-3/R-4 收尾回测：`node --check src/collectors/ingest-server.cjs`
- 2026-05-30 R-1/R-2/R-3/R-4 收尾回测：`node --check src/collectors/hermes-bridge.cjs`
- 2026-05-30 R-1/R-2/R-3/R-4 收尾回测：`node --check scripts/test-hermes-bridge.mjs`
- 2026-05-30 R-1/R-2/R-3/R-4 收尾回测：`node --check scripts/test-local-health.mjs`
- 2026-05-30 R-1/R-2/R-3/R-4 收尾回测：`node --check scripts/test-performance-budget.mjs`
- 2026-05-30 R-1/R-2/R-3/R-4 收尾回测：`node --check scripts/test-hud-stability.mjs`
- 2026-05-30 R-1/R-2/R-3/R-4 收尾回测：`npm run test:performance-budget`
- 2026-05-30 R-1/R-2/R-3/R-4 收尾回测：`npm run test:hud-stability`
- 2026-05-30 R-1/R-2/R-3/R-4 收尾回测：`npm run test:local-health`
- 2026-05-30 R-1/R-2/R-3/R-4 收尾回测：`npm run test:hermes-bridge`
- 2026-05-30 R-1/R-2/R-3/R-4 额外回测：`npm run test:adapter-contract`
- 2026-05-30 R-1/R-2/R-3/R-4 额外回测：`npm run test:protocol`
- 2026-05-30 R-1/R-2/R-3/R-4 最终回测：`npm run check`
- 2026-05-30 R-1/R-2/R-3/R-4 最终回测：`git diff --check`

## 2026-05-30 桌面顶部条闪烁排查
- 当前阶段：已完成只读排查和可复现实验证据收集，尚未修改功能代码。
- 关键发现：桌面切换失败分支中，Windows 前台窗口多次被报告为 `ClickToDo.exe` / `单击以执行`，而不是 Explorer 桌面；此时顶部条与 HUD 都被隐藏，说明主因是桌面瞬态窗口识别缺口，不是浏览器/工具识别，也不是顶部条与 HUD 直接冲突。
- 已沉淀待审核方案：`.omx/plans/desktop-topbar-flicker-plan-20260530.md`。
- 下一步：等待用户确认最小修复方案后，先补窗口识别与 HUD/topbar 决策测试，再做窄匹配实现，并执行计划内回测。

## 2026-05-30 桌面顶部条闪烁新验证
- 已按 hook 要求补充 fresh verification：`npm run status -- --json` 与 `npm run diagnostics -- --json` 均返回 `ok=true`；`node --check src/system/active-window.cjs`、`node --check src/main.cjs` 通过。
- 小压力切换 4 轮复现：桌面侧 active window 均为 `ClickToDo.exe` / `单击以执行`，`isDesktop=false`；顶部条 `谁在吃 token` 为 `visible=false/topmost=false`，HUD 也为隐藏。
- 恢复到 Codex 后，active window 为 `Codex`，HUD 正常显示，顶部条隐藏，说明工具态 HUD 行为正常；桌面态失败仍集中在 `ClickToDo.exe` 桌面瞬态识别缺口。
- 现有 `npm run test:window-detection`、`npm run test:hud-stability`、`git diff --check` 均通过，但当前测试尚未覆盖该真实失败分支。
- 下一步仍保持不变：未经用户审核，不修改功能代码；确认后先补测试再做窄匹配实现。

## 2026-05-30 桌面顶部条闪烁修复完成
- 已按用户确认的顺序执行：先补 `ClickToDo.exe` / `NarratorHelperWindow` 测试，再做窄匹配实现，再回测。
- 实现位置：`src/system/active-window.cjs`。这些 Windows 桌面辅助瞬态只触发 `windows-desktop-assistant` fallback，不直接伪装成 Explorer 桌面；PowerShell blocker-aware 检查确认无真实应用 blocker 后才回落到 Explorer desktop base。
- 测试位置：`scripts/test-window-detection.mjs`、`scripts/test-hud-stability.mjs`。
- 功能回测：重启应用后 4 轮 `ToggleDesktop()` 压力切换，桌面侧 active window 回落为 `Windows 资源管理器`，顶部条 `visible=true/topmost=true`，HUD 隐藏；恢复 Codex 后 HUD 可显示，顶部条隐藏。
- 验证通过：`node --check src/system/active-window.cjs`、`node --check src/main.cjs`、`node --check scripts/test-window-detection.mjs`、`node --check scripts/test-hud-stability.mjs`、`npm run test:window-detection`、`npm run test:hud-stability`、`npm run test:performance-budget`、`npm run check`、`git diff --check`、`npm run status -- --json`、`npm run diagnostics -- --json`。
- 证据文件：`.omx/evidence/desktop-topbar-flicker-implementation-20260530.md`；审查文件：`.omx/reviews/desktop-topbar-flicker-review-20260530.md`。

## 2026-05-30 桌面顶部条视觉收敛
- 用户反馈截图中的桌面顶部条观感很丑；本轮按现有 `DESIGN.md` 约定做最小样式改动，不修改 DOM、数据口径、窗口识别或 HUD 功能逻辑。
- 实现位置：`src/renderer/styles.css`。已降低主玻璃条的彩色饱和度；收轻 `.usage-strip` 的内层胶囊背景、描边和阴影；将“慢半拍 / 过期”等状态徽章从重填充黄绿胶囊改为轻量半透明描边；顶部条用量区改用更干净的 UI 字体。
- 视觉验证：`.\node_modules\.bin\electron.cmd scripts\render-ui-mock.mjs` 已生成默认 tight 状态截图，输出 `output/playwright/topbar-ui.png`。
- 回归验证：`npm run test:hud-stability`、`npm run test:delight-contract`、`npm run test:performance-budget`、`npm run check`、`git diff --check` 均通过。
- 应用状态：已重启本项目 `node/electron` 进程，`npm run status -- --json` 返回 `ok=true`，新样式已加载到运行中的桌面应用。

## 2026-05-30 token 发生器与小人交互增强
- 用户反馈 token 发生器里的 token 与小人互动仍不够；本轮保持现有 DOM 和资源，不新增 provider 轮询、不改数据口径、不改窗口仲裁。
- 实现位置：`src/renderer/app.js`、`src/renderer/styles.css`。发生器现在会同步当前小人 scene；`token-flow` 暴露 `--flow-distance` / `--flow-angle`，CSS 画出发生器到小人的可见喂食线；token 到达小人端有 catch/eat 闪光；发生器和小人按 catch/eat/run/guard 等 scene 做轻量响应动画。
- 测试位置：`scripts/test-hud-stability.mjs` 增加断言，确保 token flow 不是散落粒子，而是明确的 generator-to-mascot 连接与到达反馈。
- 视觉验证：`.\node_modules\.bin\electron.cmd scripts\render-ui-mock.mjs` 已生成默认 tight 状态截图；并用 `WHO_EATS_TOKEN_DEMO_MOOD=low`、`WHO_EATS_TOKEN_DEMO_MOOD=comfy` 跑过场景 mock。
- 回归验证：`node --check src/renderer/app.js`、`node --check scripts/test-hud-stability.mjs`、`npm run test:hud-stability`、`npm run test:delight-contract`、`npm run test:performance-budget`、`npm run check`、`git diff --check` 均通过。
- 应用状态：已重启本项目 `node/electron` 进程，`npm run status -- --json` 返回 `ok=true`，新交互已加载到运行中的桌面应用。

## 2026-05-30 顶部条信息增强与桌面->工具稳定性
- 用户反馈：桌面切回工具判断有延迟，全屏工具和右下角 HUD 偶尔抖动/闪烁；token 发生器与余量联动不足；顶部条小框信息太少。
- 实现位置：`src/main.cjs`。保持 overlay coordinator `200ms` 性能预算不变；工具态 HUD 决策不再先隐藏桌面顶部条，而是在 HUD `showInactive()` 后再隐藏顶部条；新增 `WINDOW_BOUNDS_JITTER_TOLERANCE_PX = 2`，`setWindowBoundsIfChanged()` 与 `shouldRefreshToolHudForDecision()` 忽略 1-2px native bounds 微抖。
- 实现位置：`src/renderer/index.html`、`src/renderer/app.js`、`src/renderer/styles.css`。顶部条用量框新增余量 chip 和重置/账期/新鲜度提示；`usage-strip`、`token-generator`、`token-flow` 共用 active provider 的 `level/mode/delightTone/--quota-fill/--flow-speed`。
- 测试位置：`scripts/test-hud-stability.mjs` 增加顶部条字段、发生器余量联动、HUD 切换时序、bounds 容差与样式契约断言。
- 过程校正：曾尝试把 `OVERLAY_COORDINATOR_REFRESH_MS` 降到 `125ms`，被 `npm run test:performance-budget` 拦截；已恢复 `200ms`，通过时序优化解决感知空窗，不加密轮询。
- 视觉验证：`.\node_modules\.bin\electron.cmd scripts\render-ui-mock.mjs` 生成 `output/playwright/topbar-ui.png`、`hud-ui.png`、`trust-popover-ui.png`；已目视确认顶部条新增字段未挤压指标区。
- 回归验证：`npm run test:hud-stability`、`npm run test:delight-contract`、`npm run test:performance-budget`、`npm run check`、`git diff --check`、`npm run test:window-detection`、`npm run test:local-health` 均通过。
- 应用状态：已重新启动本项目 Electron 实例；`npm run status` 返回本地 API listening，Codex live。Hermes 仍为 `auth-expired`，属于外部凭据状态。

## 2026-05-30 Autopilot 最终闭环：桌面/工具切换、顶部条信息与小人联动
- 推进状态：本轮用户新增目标已执行到 code-review 自检后收尾；没有继续扩大到无证据的窗口类别或新资源生成。
- 根因确认 1：`getWindowsActiveWindow(options.fast === "desktop")` 曾直接接受 inspected `ClickToDo.exe`，绕过 `windows-desktop-assistant` fallback；已改为 `shouldUseInspectedFastDesktopWindow()` 窄门禁，ClickToDo / NarratorHelperWindow / Explorer Host Popup 只走 blocker-aware fallback。
- 根因确认 2：Explorer `Host Popup Window` / `主机弹出窗口` 的 0x0 shell 瞬态未被识别，会在桌面顶部条刚显示后又隐藏；已加 explorer + 标题 + 0/1px bounds 的窄匹配。
- 根因确认 3：桌面 -> 工具恢复时，`desktop.clear=false + blockerCount>0` 的 shell 过渡帧应允许 tool detection 扫 blocker，同时顶部条不得继续显示；已由 `hasDesktopForegroundBlocker()` 接入 `shouldShowDesktopBar()` 与 `shouldInspectDesktopBlockersForToolDetection()`。
- 根因确认 4：`refreshToolHud()` 过去先按 desktop shell transient 隐藏 HUD，再读取已传入的 `toolContext`；已调整为先解析 `options.toolContext || getDetectedToolContext(activeWindow)`，再决定是否按桌面隐藏，避免工具态决策被刷新层反向覆盖。
- 保留约束：`OVERLAY_COORDINATOR_REFRESH_MS` 仍为 `200ms`；未通过加密轮询解决感知延迟。曾尝试加入“desktop-after-tool-transition”保留 HUD 的保护，但真实桌面会残留 HUD，已撤回并用测试断言禁止恢复。
- 压力脚本校正：`scripts/stress-overlay-switch.mjs` 现在先等待目标前台或桌面前台稳定，再等待 `260ms` 给 200ms coordinator 一拍时间；避免把 Windows 激活延迟、Feishu 通知或 LockApp 前台抢占误计为应用逻辑失败。
- 最终有效压力证据：`.omx/evidence/topbar-hud-stress-final-pass4-20260530.json`，24 轮、96 个样本，`desktopSettledCount=24`、`toolReturnCount=24`、`desktopFailureCount=0`、`toolFailureCount=0`。
- 额外说明：之后一次 `.omx/evidence/topbar-hud-stress-final-current-code-20260530.json` 在第 16 轮后被 `LockApp.exe / Windows 默认锁屏界面` 全屏前台抢占，属于外部锁屏/屏保干扰，不作为通过证据；为保持代码与通过证据一致，已撤回仅用于减少 debug 采样开销的非功能改动。
- UI 完成项：顶部条 `usage-strip` 增加余量 chip、重置/账期/新鲜度提示；原余量小人进入小框内并只与 quota orbit 交互，不参与 token 互动。
- 交互完成项：`token-generator`、`token-flow`、roaming mascot 共用当前 provider 的 `level/mode/delightTone/--quota-fill/--flow-speed`；token 从发生器到小人的飞行线、到达闪光、发生器响应和小人 scene 动画已接入。
- 最终回归：`node --check src/main.cjs`、`node --check src/system/active-window.cjs`、`node --check src/renderer/app.js`、`node --check scripts/stress-overlay-switch.mjs`、`npm run test:window-detection`、`npm run test:hud-stability`、`npm run test:delight-contract`、`npm run test:performance-budget`、`npm run test:local-health`、`npm run check`、`git diff --check`、`npm run status -- --json`、`npm run diagnostics -- --json` 已通过或返回 `ok=true`。
- 应用状态：已停止 debug 模式并重新启动 Electron；`npm run status -- --json` 返回 `ok=true`。Codex quota 仍显示 delayed/过期，Hermes 仍为 `auth-expired`，属于外部数据/凭据状态。

## 2026-05-30 维护：重启与缓存清理
- 已按项目记忆先确认边界，再执行维护；本次只清理可重建缓存/日志候选，不按猜测删除源码。
- 已停止旧的本项目进程 8 个：`cmd.exe`、`node.exe`、`electron.exe`，随后以普通模式重新启动 Electron。
- 已清理 Electron 可重建缓存 6 项，共约 2,757,856 bytes：`Cache`、`Code Cache`、`GPUCache`、`DawnGraphiteCache`、`DawnWebGPUCache`、`blob_storage`。
- 本次候选中的 `Session Storage`、`hud-debug.ndjson`、`.understand-anything/tmp` 在清理时不存在，未做额外处理。
- 已扫描仓库内 `.tmp/.bak/.old/.orig/.rej/.log/~` 等临时/备份/日志模式，排除 `.git` 与 `node_modules` 后未发现可直接删除文件；因此未删除任何“无用代码”。
- 已保留关键状态与证据：`api-token.txt`、`settings.json`、`Local Storage`、`Preferences`、`.understand-anything/knowledge-graph.json`、`.omx/evidence`、源码文件均未删除。
- 验证通过：`npm run status -- --json` 返回 `ok=true`，本地 API `http://127.0.0.1:17667` listening；`git diff --check` 无输出。
- 已知外部状态未改变：Codex quota 仍可能显示 delayed，Hermes 仍为 `auth-expired`，属于数据新鲜度/外部凭据状态，不是本次缓存清理引入。

## 2026-05-31 桌面/工具 Overlay 仲裁彻底收敛
- 状态：用户指定的最终方案已按范围完成并回测通过；后续不要再回到“窗口名补丁堆叠”或“remembered tool 复活 HUD”的旧路线。
- 核心实现：新增 `src/main/overlay-controller.cjs` 纯状态机，唯一输出 `desktop-topbar`、`tool-hud`、`hidden`；`src/main.cjs` 通过 `applyOverlayTransition()` 原子执行 show/hide。
- 分层收敛：`active-window` 只做采样与归一化；`tool-detector` 只认当前确认前台工具；remembered tool 仅用于最近工具元信息；`refreshToolHud()` 已改为接收状态机上下文的纯渲染路径。
- 稳定性策略：采样噪声最多保留旧 surface `300ms`，确认工具/桌面后错误 surface 残留上限 `400ms`；超时优先 `hidden`，不保留错误顶部条或 HUD。
- 额外修复：active-window 采样超时转 sampling noise；0x0 Explorer shell 不再作为 desktop base；HUD bounds 判断支持 HiDPI 物理/逻辑等价，避免同一工具窗口反复刷新导致抖动。
- 测试新增：`scripts/test-overlay-state.mjs` 与 `npm run test:overlay-state`；`scripts/test-hud-stability.mjs` 增加状态机、中心 transition、render-only HUD、timeout/noise、HiDPI bounds、stress metric 断言。
- 压力脚本升级：`scripts/stress-overlay-switch.mjs` 统计 `topbarVisibleWhileToolMs`、`hudVisibleWhileDesktopMs`、`surfaceTransitionCount`、`stalePreserveMs`，并要求 settled 时工具态 HUD 可见且顶部条隐藏、桌面态顶部条可见且 HUD 隐藏。
- 50 轮真实切换证据：`.omx/evidence/overlay-controller-stress-50-final-20260531.json`，`desktopFailureCount=0`、`toolFailureCount=0`、`topbarVisibleWhileToolMs=0`、`hudVisibleWhileDesktopMs=99`、`surfaceTransitionCount=100`、`stalePreserveMs=0`、`passed=true`。
- 最终回归通过：`node --check src/main.cjs`、`node --check src/system/active-window.cjs`、`node --check src/main/overlay-controller.cjs`、`node --check scripts/stress-overlay-switch.mjs`、`node --check scripts/test-overlay-state.mjs`、`node --check scripts/test-hud-stability.mjs`、`npm run test:window-detection`、`npm run test:hud-stability`、`npm run test:overlay-state`、`npm run test:performance-budget`、`npm run test:local-health`、`npm run check`、`git diff --check`。
- 应用状态：已停止旧项目 `node/electron` 进程并以普通模式重启；`npm run status -- --json` 返回 `ok=true`、本地 API listening。
- 未改范围：未改 provider/token 数据链路，未改 UI 视觉设计，未扩大到无关模块。
## 2026-05-31 多工具余量、新用户双文档与设置页入口
- 已按用户确认方案完成本轮最小实现：新增 `docs/getting-started.md` 用户版新手指南、`docs/agent-getting-started.md` agent 接入指南，并在 `README.md` 增加“第一次使用”入口。
- 设置页“接入”区域已增加 `用户指南` 与 `Agent 接入指南` 两个入口，并展示本机 API 地址、token 文件位置和 `npm run status` 自检提示；仅新增内部 IPC 打开本地文档，不新增 HTTP endpoint，不改 provider 设置模型。
- 文档已明确不同 provider 的展示口径：Codex 5小时/一周、Hermes/Xiaomi Token Plan、context-only、usage-only；顶部条与 HUD 继续共享 `providerHealth.displayMode`、`remainingStandardPercent`、`trust`、`delight`。
- 小人动效方案已固化在文档中：保留现有 scene，默认不使用 GIF，后续新动作优先 PNG 姿态/精灵图 + CSS，且必须由真实 quota/trust/delight 状态驱动。
- 已扩展文档质量、HUD 稳定和 UI mock 脚本；新增 `settings-guide-ui.png` 专门覆盖设置页接入入口，目视确认按钮、状态提示和 provider 列表未拥挤遮挡。
- 本轮验证通过：`npm run test:docs`、`npm run test:protocol`、`npm run test:provider-health`、`npm run test:hud-stability`、`npm run test:performance-budget`、`npm run test:delight-contract`、`npm run delight:contract -- --check`、`.\node_modules\.bin\electron.cmd scripts\render-ui-mock.mjs`、`npm run check`、`git diff --check`。

## 2026-05-31 Overlay 是否失效的现场复核
- 用户询问 overlay-controller 是否又失效；已先读取 `context/progress/bugs` 并采集 fresh evidence。
- 代码与进程核对：运行中的 Electron 仍从本仓库启动，`src/main.cjs` 仍接入 `src/main/overlay-controller.cjs`，`npm run status -- --json` 与 `npm run diagnostics -- --json` 返回 `ok=true`。
- 静态/单元回归：`npm run test:overlay-state`、`npm run test:hud-stability`、`npm run test:window-detection` 均通过。
- 正常模式 10 轮压力文件：`.omx/evidence/overlay-controller-stress-current-20260531-145621.json` 报 `desktopFailureCount=10`，但原因是 `appDebug=null` 且脚本没有识别到中文标题窗口。
- debug 模式 3 轮压力文件：`.omx/evidence/overlay-controller-stress-debug-20260531-145958.json`，状态机每轮正确切换 `tool-hud -> desktop-topbar -> tool-hud`，`desktopFailureCount=0`、`toolFailureCount=0`、`passed=true`。
- 进一步核实：PowerShell 经 Node 读取窗口标题时，`谁在吃 token` 会乱码成类似 `˭�ڳ� token`，导致 `scripts/stress-overlay-switch.mjs` 的 `/^谁在吃 token$/` 正则漏掉真实顶部条；直接系统枚举可见窗口时顶部条 hwnd 存在且 `visible=true`。
- 当前判断：没有证据表明 overlay-controller 状态机本身失效；但验收脚本存在真实缺陷，之前的 50 轮证据过度依赖 debug 内部状态，真实窗口枚举校验不够硬。
- 应用状态：已关闭临时 debug 环境并以普通模式重启，`npm run status -- --json` 返回 `ok=true`。

## 2026-05-31 Overlay 压力脚本修复与 15 轮回测
- 已按用户要求继续回测，最多 15 轮；本轮未修改产品 overlay 仲裁逻辑，只修 `scripts/stress-overlay-switch.mjs` 与对应守护测试。
- 压力脚本修复：PowerShell 调用改为 `-EncodedCommand` 并设置 UTF-8 输出，避免 `谁在吃 token` 等中文窗口标题被 Node 读成乱码；debug 关闭时，等待 overlay ready 会回退到真实窗口枚举，而不是只等过期/不存在的 debug log。
- 守护测试：`scripts/test-hud-stability.mjs` 增加 UTF-8 PowerShell、真实窗口枚举 fallback、无 debug decision 时 desktop readiness 的断言。
- 验证通过：`node --check scripts/stress-overlay-switch.mjs`、`node --check scripts/test-hud-stability.mjs`、`npm run test:hud-stability`、`git diff --check`、`npm run status -- --json`。
- 15 轮正常模式 evidence：`.omx/evidence/overlay-controller-stress-15-normal-20260531-151220.json`，完整写出 60 个样本。
- 15 轮结果：整体 summary 为 `passed=false`，但原因不是中文误判，也不是已确认的 overlay-controller 错误；有效桌面阶段 `8/8` 通过，有效 Codex 工具阶段 `12/12` 通过。
- 环境干扰：同一 evidence 中 `Weixin/微信` 抢前台 11 个样本，另有若干桌面阶段实际仍为 Codex foreground，因此这些轮次不能作为桌面/工具 overlay 仲裁失败结论。
- 当前应用状态：普通模式运行，`npm run status -- --json` 返回 `ok=true`。

## 2026-05-31 Overlay 真实窗口采样纠偏完成
- 用户要求继续保持 `overlay-controller` 唯一有效，不再不停打补丁；本轮先按记忆核对最终方案，再用真实窗口压力回测定位。
- 结论：`overlay-controller` 状态机没有失效；失败来自采样层在 Show Desktop 后偶发继续返回旧的全屏 `Chrome/Codex` foreground，状态机收到错误 `tool-foreground` 输入后才继续保持 HUD。
- 过程证据：`.omx/evidence/overlay-controller-stress-15-real-windows-20260531-162011.json` 曾出现 `desktopFailureCount=1`；debug 3 轮进一步确认 app 内采样仍报旧全屏工具，而外部压力脚本已看到 Explorer desktop。
- 实现收敛：`src/system/active-window.cjs` 对 own/external overlay foreground 先回查 desktop base，避免从 Z-order 背景工具推回 HUD；新增 Win32 desktop foreground probe，仅在 `src/main.cjs` 最新 surface 为 `tool-hud` 时启用，用于校正 tool -> desktop 的陈旧 native sample，不影响 desktop -> tool 回切。
- 守护测试：`scripts/test-window-detection.mjs` 覆盖 ignored/external overlay foreground 优先 desktop base、陈旧全屏 native sample 被 Win32 desktop probe 覆盖；`scripts/test-hud-stability.mjs` 断言 probe 只由 `latestOverlayDecision?.mode === SURFACES.TOOL` 打开。
- 最终 15 轮真实窗口证据：`.omx/evidence/overlay-controller-stress-15-real-windows-tool-scoped-probe-20260531-164140.json`，`desktopFailureCount=0`、`toolFailureCount=0`、`topbarVisibleWhileToolMs=0`、`hudVisibleWhileDesktopMs=0`、`stalePreserveMs=0`、`productPassed=true`、`environmentClean=true`。
- 最终回归通过：`npm run test:window-detection`、`npm run test:hud-stability`、`npm run test:overlay-state`、`npm run test:performance-budget`、`npm run test:local-health`、`npm run check`、`git diff --check`、`npm run status -- --json`。
- 2026-05-31 Overlay 仲裁重新 ralplan：用户要求基于 `C:\Users\lhy10\Desktop\token.md` 与 Overlay 仲裁彻底收敛方案重新做底层梳理；本轮按 `$oh-my-codex:autopilot` 产出 `.omx/context/overlay-arbitration-reset-20260531T121427Z.md` 与 `.omx/plans/overlay-arbitration-final-plan-20260531.md`。代码层结论：`overlay-controller` 核心已落地，但 transition 原子性、`refreshToolHud()` render-only、remembered tool 残留、real-windows transition count 与正则测试依赖仍需按计划收敛。
- 2026-05-31 P0-0 已关闭：`active-window.normalizeBounds(null)` 已补失败测试并做最小入口防御；重启后 `.omx/run/app-start.err.log` 为空，`npm run status -- --json` 返回 `ok=true`。验证通过：`node --check src/system/active-window.cjs`、`node --check scripts/test-window-detection.mjs`、`npm run test:window-detection`、`npm run test:hud-stability`、`npm run test:overlay-state`、`npm run test:performance-budget`、`npm run test:local-health`、`npm run check`、`git diff --check`。证据：`.omx/evidence/overlay-p0-null-bounds-20260531.md`；审查：`.omx/reviews/overlay-p0-null-bounds-review-20260531.md`。下一步按计划推进 P0-1 transition 原子性，不允许跳到窗口名补丁。

## 2026-05-31 重新回测：active-window timeout 桌面顶部条误隐藏修复
- 已按最终 Overlay 仲裁方案先核对推进状态，再重新回测；本轮没有改 provider/token 数据链路、UI 视觉或无关模块。
- 初始 15 轮真实窗口回测失败：`.omx/evidence/overlay-retest-15-real-windows-20260531-current.json` 中 `desktopFailureCount=13`、`toolFailureCount=0`，表现为外部已经确认 Explorer desktop，但应用内桌面顶部条为 `null`。
- debug 复现定位：`.omx/evidence/overlay-retest-debug-3-real-windows-20260531-current-2.json` 显示 `desktop-topbar -> hidden` 的原因是 `active-window-timeout`，即前台采样器没有拿到新事实时，把已确认桌面错误当成未知窗口隐藏了。
- 已撤回失败尝试：PowerShell desktop probe race、桌面 800ms timeout、启动 prewarm 都未作为最终方案保留，因为它们要么仍失败，要么拉长 `stalePreserveMs`，不符合最终方案的稳定性边界。
- 最小实现：只在 `src/main/overlay-controller.cjs` 状态机内区分 `active-window-timeout`。若上一稳定 surface 已是 `desktop-topbar`，采样 timeout 第一帧只表示“没有新前台事实”，不得立即隐藏已确认桌面顶部条；但连续 timeout 仍累计 `stalePreserveMs`，超过 `300ms` 后进入 `hidden`，不绕开最终方案噪声边界。
- 守护测试：`scripts/test-overlay-state.mjs` 增加 active-window timeout 不立即隐藏已确认桌面、且连续 timeout 不得无限保留桌面的纯状态机测试；`scripts/test-hud-stability.mjs` 增加对应源码契约断言，确保后续不会把 timeout 当成未知窗口立即隐藏顶部条，也不会无上限保留旧 surface。
- 最终 15 轮真实窗口证据：`.omx/evidence/overlay-retest-timeout-preserve-15-real-windows-20260531.json`，`desktopFailureCount=0`、`toolFailureCount=0`、`environmentInterferenceCount=0`、`topbarVisibleWhileToolMs=0`、`hudVisibleWhileDesktopMs=0`、`stalePreserveMs=0`、`productPassed=true`、`passed=true`。
- 本轮回归通过：`node --check src/main/overlay-controller.cjs`、`node --check src/main.cjs`、`node --check src/system/active-window.cjs`、`node --check scripts/test-overlay-state.mjs`、`node --check scripts/test-hud-stability.mjs`、`npm run test:overlay-state`、`npm run test:hud-stability`、`npm run test:window-detection`、`npm run test:performance-budget`、`npm run test:local-health`、`npm run check`、`git diff --check`、`npm run status -- --json`。
- 当前判断：这次不是顶部条和 HUD 冲突，也不是工具/浏览器识别问题；直接根因是 active-window 采样 timeout 被状态机当作“确认未知前台”处理，导致已确认桌面顶部条被隐藏。现在修复仍保持 `overlay-controller` 为唯一可见性仲裁点。
- code-review 追加结论：审查中发现最初 timeout 例外存在“连续 timeout 无限保留桌面顶部条”的设计风险，已收窄为 bounded timeout preserve。补充真实窗口 5 轮 fresh evidence：`.omx/evidence/overlay-code-review-fresh-5-real-windows-20260531.json`，`desktopFailureCount=0`、`toolFailureCount=0`、`environmentInterferenceCount=0`、`topbarVisibleWhileToolMs=0`、`hudVisibleWhileDesktopMs=0`、`stalePreserveMs=0`、`passed=true`。审查记录：`.omx/reviews/overlay-timeout-preserve-review-20260531.md`，verdict 为 `APPROVE / CLEAR`。

## 2026-05-31 Codex 工具内 HUD 连续闪烁只读定位
- 用户反馈 Codex 工具内 HUD 一直闪烁并透出桌面；本轮按用户约束未改状态机、未改功能代码，先做只读定位与 debug 采样。
- 初始事实：`npm run status -- --json` 返回 `fetch failed`，`17667/17668` 未监听，进程列表没有本项目 `electron.exe`；随后以 `WHO_EATS_TOKEN_DEBUG_HUD=1` 重启项目用于采集实时证据。
- debug 证据：`%APPDATA%\who-eats-token\hud-debug.ndjson` 中 90 秒窗口内出现 `tool-hud -> hidden: active-window-timeout` 93 次、`hidden -> tool-hud: tool-foreground` 94 次；典型样本 `stalePreserveMs=323~345ms`，HUD 被隐藏后下一帧又因 Codex 前台恢复显示。
- 下钻证据：`src/main.cjs` 当前 `OVERLAY_ACTIVE_WINDOW_TIMEOUT_MS = 320`，而 `src/system/active-window.cjs` 的 `probeDesktopForeground` 会在最新 surface 为 `tool-hud` 时触发 PowerShell desktop foreground probe；实测 `probe=false` 采样 Codex 为 `1~92ms`，`probe=true` 采样为约 `481~566ms`，超过 320ms 外层超时。
- 当前判断：这次不是顶部条与 HUD 冲突，不是 remembered tool 复活，也不是 `overlay-controller` 状态机机制失效；直接原因是 tool 态为了修正 Show Desktop 陈旧全屏采样而启用的 desktop foreground probe 太慢，被外层 320ms timeout 截断，连续 timeout 超过 300ms 噪声上限后状态机按设计隐藏 HUD，随后快速采到 Codex 又显示 HUD，形成循环闪烁。
- 待用户审核的最小方向：不改 `overlay-controller` 机制，优先在采样层处理 `probeDesktopForeground` 与外层 timeout 的不匹配；任何代码改动前必须先给出精确 diff 范围和回测项。

## 2026-05-31 Codex 工具内 HUD 连续闪烁修复完成
- 用户已确认最小方案；本轮未修改 `src/main/overlay-controller.cjs`，只把 `src/main.cjs` 的 `OVERLAY_ACTIVE_WINDOW_TIMEOUT_MS` 从 `320ms` 调整为 `1000ms`，使外层 timeout 覆盖内部 `900ms` desktop foreground probe 预算。
- 守护测试：`scripts/test-hud-stability.mjs` 已同步断言该 timeout 契约，防止后续再次让外层 timeout 小于 tool-scoped desktop probe。
- debug 空跑证据：修复后自然运行 15 秒，日志仅出现一次启动期 `hidden -> tool-hud: tool-foreground`，`tool-hud -> hidden: active-window-timeout` 为 0。
- 15 轮真实窗口证据：`.omx/evidence/overlay-timeout-budget-fix-15-real-windows-20260531.json`，`desktopFailureCount=0`、`toolFailureCount=0`、`environmentInterferenceCount=0`、`topbarVisibleWhileToolMs=0`、`hudVisibleWhileDesktopMs=0`、`productPassed=true`、`passed=true`。
- 追加日志核对：同一轮 debug 日志中 `toolHiddenTimeouts=[]`，说明原始 HUD 闪烁链路已消失；曾出现 1 次 `desktop-topbar -> hidden: active-window-timeout`，真实窗口层未失败，后续若用户目视发现桌面顶部条再闪烁，应单独按桌面态 timeout 处理，不要把它混同为 HUD 闪烁或状态机失效。
- 本轮回归通过：`node --check src/main.cjs`、`node --check src/system/active-window.cjs`、`node --check src/main/overlay-controller.cjs`、`node --check scripts/test-hud-stability.mjs`、`node --check scripts/test-overlay-state.mjs`、`node --check scripts/stress-overlay-switch.mjs`、`npm run test:window-detection`、`npm run test:hud-stability`、`npm run test:overlay-state`、`npm run test:performance-budget`、`npm run test:local-health`、`npm run check`、`git diff --check`。

## 2026-05-31 桌面顶部条缺失反馈只读复核
- 用户反馈切回桌面没有顶部条；本轮未修改任何代码、未清缓存、未重启，只做事实核对与小轮数回测。
- 已确认运行状态：`npm run status -- --json` 返回 `ok=true`，`settings.json` 中 `desktopBarEnabled=true`、`toolHudEnabled=true`、`debugHud=false`，因此不是服务未启动或设置关闭。
- 当前桌面态直接证据：`getActiveWindow({ fast: "desktop" })` 返回 `explorer / Program Manager / Progman`，`desktop.clear=true`；顶部条 hwnd `19466818` 通过 `getWindowStatusByHwnd()` 与 Win32 样式检查均为 `visible=true`、`topmost=true`、`layered=true`、`transparent=true`、`noActivate=true`，bounds 为 `328,4,944,162`。
- 视觉证据：`.omx/evidence/desktop-topbar-current-20260531.png` 截图中顶部条实际可见。
- 5 轮真实窗口回测：`.omx/evidence/desktop-topbar-current-retest-5-real-windows-20260531.json`，`desktopFailureCount=0`、`toolFailureCount=0`、`environmentInterferenceCount=0`、`topbarVisibleWhileToolMs=0`、`hudVisibleWhileDesktopMs=0`、`productPassed=true`、`passed=true`。
- 当前结论：本轮证据不支持“桌面识别不到、顶部条窗口被关闭、顶部条不是置顶、HUD 冲突导致顶部条消失”。唯一最近代码改动仍是 `src/main.cjs` 的 `OVERLAY_ACTIVE_WINDOW_TIMEOUT_MS 320 -> 1000` 与测试断言；它可能影响刚切换瞬间的等待手感，但本轮没有复现桌面 settled 后无顶部条。

## 2026-05-31 ai-slop-cleaner：工具/浏览器/任务栏切换只读复核
- 本轮按 `$oh-my-codex:ai-slop-cleaner` 先锁行为和分类问题；未改功能代码，未改状态机。
- 最终方案推进核对：P0-0 已关闭；当前代码中 P0-1 的“tool 分支先隐藏 topbar 再刷新 HUD”已落地；P0-2 仍未完全纯化，`refreshToolHud()` 仍包含禁用/无工具/stale 时隐藏窗口的副作用；P1-2 仍未落地，real-windows-only 下 `surfaceTransitionCount` 仍为 0。
- 15 轮 Codex 回测：`.omx/evidence/ai-slop-overlay-taskbar-retest-15-real-windows-20260531.json`，有效样本 `8/8` 通过，`desktopFailureCount=0`、`toolFailureCount=0`、`topbarVisibleWhileToolMs=0`、`hudVisibleWhileDesktopMs=0`；第 9 轮后 `LockApp.exe / Windows 默认锁屏界面` 抢前台，被标为环境干扰，不作为产品失败。
- 浏览器目标补测：打开临时可见 Chrome `OpenAI Overlay Test - Google Chrome` 后跑 `.omx/evidence/ai-slop-overlay-browser-codex-retest-8-real-windows-20260531.json`，Codex+Chrome 均覆盖，`desktopFailureCount=0`、`toolFailureCount=0`、`environmentInterferenceCount=0`、`topbarVisibleWhileToolMs=0`、`hudVisibleWhileDesktopMs=260`、`passed=true`。
- 关键现象：同一 8 轮证据中有一次 `desktop-early` 为 Explorer desktop 但 HUD 仍可见、topbar 尚未出现；持续时间估算 260ms，未超过 400ms 预算，但与用户反馈的“切换闪/透出桌面”体感方向一致。
- 桌面->工具高频复核：`.omx/evidence/ai-slop-overlay-return-highfreq-hwnd-20260531.json` 使用 hwnd 状态复核；Codex 无空白样本，Chrome 有 1 个样本为前台已是工具、顶部条仍可见且 HUD 未显示，随后恢复 HUD。第一次基于 `get-windows.openWindows()` 的高频枚举漏掉 no-activate overlay，不能作为产品失败依据。
- 底部任务栏悬停复核：`.omx/evidence/ai-slop-taskbar-hover-samples-20260531.json`，悬停任务栏左侧、Chrome、微信、空白区域后，前台仍为 `Explorer / Program Manager`，顶部条可见、HUD 隐藏；当前没有证据表明任务栏本体会直接破坏 overlay 仲裁。
- 初步分类：`LockApp`、任务栏缩略图/托盘浮层属于 grounded fail-safe/外部前台边界；普通任务栏悬停不是当前复现源。更像产品体感问题的是 transition 可见性窗口：桌面->工具时旧 surface 和 HUD render 不完全同步，工具->桌面时采样/transition 存在 <=400ms 的 HUD 残留。

## 2026-06-01 ai-slop-cleaner：real-window transition 与 HUD warm-show
- 本轮严格按用户限定范围执行：未修改 `src/main/overlay-controller.cjs`，未新增窗口名匹配，未使用 remembered tool 复活 HUD。
- 已修 `scripts/stress-overlay-switch.mjs`：`--real-windows-only` 下 `surfaceTransitionCount` 改为从真实 topbar/HUD 窗口可见性推导，新增 `surfaceTransitionSource`；同时保留 `maxAllowedLeakMs`，并新增 `smoothLeakTargetMs=0` / `smoothPassed`，避免把 400ms 当作体验目标。
- 已做最小产品改动：`src/main.cjs` 只在状态机已确认 `tool-hud` 后，且缓存 payload 与当前 `tool.id + hwnd` 完全一致时，先 warm-show 现有 HUD payload，再让 `refreshToolHud()` 异步刷新内容；缓存不参与 surface 决策。
- 回归已通过：`npm run test:window-detection`、`npm run test:hud-stability`、`npm run test:overlay-state`、`npm run test:performance-budget`、`npm run test:local-health`、`npm run check`、`git diff --check`；应用已重启，`npm run status -- --json` 返回 `ok=true`。
- Codex+Chrome 15 轮严格 0ms 真实窗口回测证据：`.omx/evidence/ai-slop-warm-show-codex-chrome-15-real-windows-20260601.json`。结果：`surfaceTransitionCount=30`、`surfaceTransitionSource=real-windows`、`topbarVisibleWhileToolMs=0`、`hudVisibleWhileDesktopMs=260`、`smoothPassed=false`、`productPassed=false`（因本轮用 `--max-leak-ms 0` 验证即时响应）。
- 当前结论：验证盲点已修，桌面->工具的 HUD 空窗已做 warm-show 最小优化；但工具->桌面的 `hudVisibleWhileDesktopMs=260` 仍存在，说明“立即隐藏 HUD”不是 warm-show 能解决的问题，而是工具态到桌面态仍受 200ms coordinator/前台采样节奏影响。下一步若要追求 0ms，应先让用户审核一个新的最小范围方案，不能在本轮越过“只做 warm-show”的产品改动边界。
## 2026-06-01 工具切桌面 HUD 残留最终收敛
- 本轮继续按 `overlay-controller` 唯一仲裁方案执行，未修改 `src/main/overlay-controller.cjs`，未新增窗口名规则，未使用 remembered tool，未降低 `OVERLAY_COORDINATOR_REFRESH_MS=200`。
- 实现收敛点：`src/main.cjs` 的 tool-desktop wake helper 增加 offscreen/minimized foreground -> shell window 证据；priority wake sample 通过 `overlayCoordinatorGeneration` 废掉旧普通采样，并用 `overlayCoordinatorPriorityInFlight` 阻止 priority 应用期间新普通采样覆盖结果。
- 验证脚本修正：`scripts/stress-overlay-switch.mjs` 的 `hudVisibleWhileDesktopMs` 只统计桌面阶段且前台已确认桌面的样本；`topbarVisibleWhileToolMs` 只统计工具阶段且前台已确认工具的样本；目标前台未到达继续作为 `environmentInterference` 单独报告。
- 最终 15 轮 Codex+Chrome 真实窗口回测证据：`.omx/evidence/tool-desktop-hud-wake-priority-lock-15-real-windows-20260601.json`，结果为 `desktopFailureCount=0`、`toolFailureCount=0`、`topbarVisibleWhileToolMs=0`、`hudVisibleWhileDesktopMs=0`、`surfaceTransitionCount=30`、`surfaceTransitionSource=real-windows`、`stalePreserveMs=0`、`productPassed=true`、`passed=true`。
- 残余环境说明：同一 15 轮中 `environmentInterferenceCount=3`，均为 tool-return 阶段目标工具前台未到达，其中包含 Feishu 抢前台和 Explorer 前台样本；它们不再污染产品残留时间，但仍作为环境干扰保留。
- 完整回归已通过：`npm run test:window-detection`、`npm run test:hud-stability`、`npm run test:overlay-state`、`npm run test:performance-budget`、`npm run test:local-health`、`npm run check`、`git diff --check`；应用已重启，`.omx/run/app-start.err.log` 为空，`npm run status -- --json` 返回 `ok=true`。
- 证据文件：`.omx/evidence/tool-desktop-hud-wake-priority-lock-evidence-20260601.md`；审查文件：`.omx/reviews/tool-desktop-hud-wake-code-review-20260601.md`，结论 `APPROVE / CLEAR`。
- hook fresh verification：OMX 状态复核为 `active=false/current_phase=complete` 且 `active_modes=[]`；补跑 `npm run test:window-detection`、`npm run test:hud-stability`、`npm run test:overlay-state`、`npm run test:performance-budget`、`npm run test:local-health`、`npm run check`、`git diff --check`、`npm run status -- --json` 均通过。5 轮 Codex+Chrome 真实窗口证据 `.omx/evidence/tool-desktop-hud-wake-hook-fresh-5-real-windows-20260601.json` 为 `hudVisibleWhileDesktopMs=0`、`topbarVisibleWhileToolMs=0`、`surfaceTransitionCount=10`、`environmentInterferenceCount=0`、`passed=true`；汇总见 `.omx/evidence/tool-desktop-hud-wake-hook-fresh-evidence-20260601.md`。
- repeat hook verification：再次收到 stale stop hook 后复核 OMX 仍为 `active=false/current_phase=complete` 且 `active_modes=[]`；补跑同一组关键回归和 `npm run status -- --json` 均通过。3 轮 Codex+Chrome 真实窗口证据 `.omx/evidence/tool-desktop-hud-wake-hook-repeat-3-real-windows-20260601.json` 为 `hudVisibleWhileDesktopMs=0`、`topbarVisibleWhileToolMs=0`、`surfaceTransitionCount=6`、`environmentInterferenceCount=0`、`passed=true`；汇总见 `.omx/evidence/tool-desktop-hud-wake-hook-repeat-evidence-20260601.md`。
- session state fix：第三次重复 stop hook 的直接原因已定位为 session-scoped `.omx/state/sessions/019e7392-6538-7d71-bbe6-e30f784e161c/autopilot-state.json` 仍是 `active=true/current_phase=ralplan`，而 root state 已 complete。已用 `omx state write` 显式写入该 session 为 `active=false/current_phase=complete/run_outcome=finish/lifecycle_outcome=finished`；显式 session `list-active` 返回空。补跑 `npm run test:hud-stability`、`npm run test:overlay-state`、`npm run test:performance-budget`、`npm run test:local-health`、`npm run check`、`git diff --check`、`npm run status -- --json` 均通过。2 轮 Codex+Chrome 真实窗口证据 `.omx/evidence/tool-desktop-hud-wake-session-state-fix-2-real-windows-20260601.json` 为 `hudVisibleWhileDesktopMs=0`、`topbarVisibleWhileToolMs=0`、`surfaceTransitionCount=4`、`environmentInterferenceCount=0`、`passed=true`；汇总见 `.omx/evidence/tool-desktop-hud-wake-session-state-fix-evidence-20260601.md`。
# 2026-06-01 Codex 任务栏红框与 HUD 焦点干扰只读定位
- 本轮按用户要求只做只读定位，未修改 `src/main.cjs`、`overlay-controller` 或任何功能代码。
- 真实窗口 5 轮回测证据：`.omx/evidence/taskbar-red-hud-focus-readonly-5-real-windows-20260601.json`，结果为 `surfaceTransitionSource=real-windows`、`surfaceTransitionCount=10`、`topbarVisibleWhileToolMs=0`、`hudVisibleWhileDesktopMs=260`、`productPassed=false`。
- HUD debug 证据显示 Codex 前台稳定时仍持续产生 `overlay-transition/warm-tool-hud`：当前日志累计 506 次，间隔中位数约 667ms，说明 warm-show 不是只在进入工具态时发生。
- Win32 样式复核显示 `LLM HUD` 与 `LLM HUD Controls` 均为 `noActivate=true`、`appWindow=false`、`topMost=true`、`transparent=true`，当前证据不支持“HUD 自身变成可激活窗口”的结论。
- 待用户审核的最小方案已写入 `.omx/plans/taskbar-red-hud-focus-plan-20260601.md`：只限制 steady tool-hud 下的重复 warm-show / moveTop，不改状态机、不新增窗口名、不使用 remembered tool。
# 2026-06-01 桌面快捷方式图标收敛
- 已按用户反馈重绘 `src/assets/app-icon.png` 与 `src/assets/app-icon.ico`，去掉外部灰色方框背景，只保留透明画布上的圆形玻璃主体与内部元素。
- 底部 `HUD` 区域已缩小并改成更轻的玻璃胶囊，不再使用原先过大的白底字块。
- 新增 [`scripts/render-app-icon.mjs`](C:/Users/lhy10/Documents/谁在吃token/scripts/render-app-icon.mjs) 作为本地图标重绘脚本；当前实现为 Node 调用 Windows `System.Drawing` 生成 PNG，并拼装多尺寸 ICO。
- 桌面快捷方式 [`谁在吃token.lnk`](C:/Users/lhy10/Desktop/谁在吃token.lnk) 已重新写回图标引用，仍指向 `src/assets/app-icon.ico`。
- 由于 Windows 桌面外壳缓存未立即刷新，又补建了 `src/assets/app-icon-shortcut.ico` 作为快捷方式专用图标，并重建了桌面 `.lnk` 后调用 `ie4uinit.exe -show` + `SHChangeNotify` 强制刷新。
- 随后根据用户新反馈，将图标主体视觉再放大到接近 `1.3x`，增强玻璃高光、边缘透感和下半部雾面层次；最新桌面快捷方式已切到带哈希的新图标路径 `src/assets/app-icon-shortcut-31e265d9.ico`，避免 Windows 继续复用旧图标缓存。
- 已验证 `node --check scripts/render-app-icon.mjs`、`node scripts/render-app-icon.mjs`、`node scripts/test-packaging.mjs`、`git diff --check` 全部通过。
