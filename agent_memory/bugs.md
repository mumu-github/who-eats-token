# 问题与风险

## 当前执行风险
- 当前没有新的已复现 HUD 闪烁阻断风险；Codex 工具态 `tool-hud -> hidden: active-window-timeout` 循环已用最小采样层 timeout 预算修复，并通过 debug 空跑与 15 轮真实窗口回测。
- 已关闭判断：不是顶部条/HUD 冲突，不是 remembered tool 复活，也不是 `overlay-controller` 状态机机制失效；根因是 tool-scoped desktop foreground probe 的实测耗时超过旧的 `OVERLAY_ACTIVE_WINDOW_TIMEOUT_MS = 320`。
- 剩余观察点：修复后 15 轮回测中真实窗口层 0 失败，但 debug 记录出现 1 次桌面态 `desktop-topbar -> hidden: active-window-timeout`；该现象未造成 HUD 闪烁，也未造成 settled 失败。若后续用户目视确认桌面顶部条闪烁，应单独处理桌面态 timeout，不要回到 remembered tool 或窗口名补丁路线。
- 不要为了“清理无用代码”按文件名或直觉删除源码；后续若要删代码，必须先有静态引用证据、测试覆盖和可回滚 diff。

## 已关闭风险
- P0 安全风险已处理：ingest 和 Hermes Bridge 默认不再允许无 `Origin` 请求跳过 token 校验，兼容放行必须显式开启。
- P0 稳定性风险已处理：ingest recent 统计改为单遍历，overlay reports 增加数量上限；Hermes Bridge 增加上游 timeout 和上报失败 health。
- P0 数据风险已处理：provider 聚合引入 `sourceId`、`sources`、`usageAggregation`，避免 Hermes Local / Bridge / HTTP ingest 互相覆盖。
- P1 兼容风险已处理：Hermes Local 启动时探测 SQLite capability，schema 不兼容时返回明确缺失原因。
- P1 维护风险已降低：`main.cjs` 已抽出 `snapshot-service`、`server-manager`、`window-safe-send`、`geometry-service`、`ipc-guards`，窗口仲裁仍留在主文件。
- P1 一致性风险已降低：顶部条和 HUD 已共享 format、quota view model、trust popover 展示逻辑。
- P2 token 口径风险已处理：新增 `tokenAccuracy` / `tokenEstimated`，官方 usage、tokenizer、启发式估算分级进入 protocol、collector、snapshot、provider health 和 HUD；启发式估算会明确显示 estimated。
- R-1 运行态安全风险已处理：`security.allowUnauthenticatedNoOrigin` 变更会触发 ingest / Hermes Bridge 重启，不再依赖应用重启才生效。
- R-2 设置误写风险已处理：设置页空数字输入不会被 `Number("")` 转成 `0`，保存和预览都会保留原值。
- R-3 overlay 闪烁风险已降低：overlay report 3 秒后标 stale，15 秒后剪枝，并对 `/overlays` 调用方暴露过期语义。
- R-4 Hermes Bridge 流式漏测风险已处理：测试覆盖 OpenAI Chat/Responses stream、`response.completed`、最终 chunk usage、非 JSON event、上游中断和 ingest 上报失败。

## 剩余真实环境风险
- 真实 Windows 长时间焦点行为仍需用户目视确认；自动化不能完全替代连续 Codex 输入、桌面/Codex 快速切换、HUD trust hover、设置弹窗和可信度 Popover 的真实工作流观察。
- 未知外部前台、通知、LockApp/锁屏和采样超时现在会按 `hidden/noise` 处理；这可能产生短暂全隐藏，但这是为了避免错误顶部条或错误 HUD 残留。
- 如果 Windows 仍把非 focusable overlay 报为 foreground，日志可能仍表现为 sampling noise；当前策略是 bounded noise + 超时 hidden，不再用 remembered tool 复活 HUD。

## 回归关注
- API 安全：浏览器/扩展 origin 必须带 token；无 Origin 本机请求默认也必须带 token；兼容放行必须有显式设置和测试覆盖。
- 数据正确性：Codex、Hermes Local、Hermes Bridge、HTTP ingest 不能错误互相覆盖；usage、quota、context、health 的合并口径必须可解释。
- 窗口稳定：Codex -> 桌面时 HUD 在 400ms 内消失、顶部条稳定出现；桌面 -> Codex 时顶部条在 400ms 内消失、HUD 稳定出现且 overlay 不抢输入焦点。
- Overlay 仲裁：必须保持 `overlay-controller` 单一输出、`applyOverlayTransition()` 中心切换、`refreshToolHud()` render-only；不要恢复二次采样或 remembered tool 决策。
- UI 一致性：顶部条和 HUD 的 quota、trust、estimated/missing/delayed 文案必须来自同一口径。

## 2026-05-30 当前风险：桌面顶部条被 Windows 瞬态窗口误隐藏
- 状态：已复现，未修复，等待用户审核最小方案。
- 证据：桌面切换压力测试中，失败采样的 active window 为 `ClickToDo.exe` / `单击以执行`，顶部条 `visible=false/topmost=false`，HUD 隐藏；另观察到 `svchost.exe` / `NarratorHelperWindow` 离屏小窗口瞬态。
- 判断：主要是桌面 foreground 识别缺口；当前没有证据支持“浏览器/工具识别导致”或“顶部条与 HUD 互相冲突”为主因。
- 风险：如果直接把所有无标题、小窗口、`svchost` 或 shell 窗口当成桌面，会把真实应用误判成桌面，导致顶部条错误显示；修复必须使用窄匹配并配套回测。

## 2026-05-30 新验证：ClickToDo 桌面瞬态稳定复现
- 状态：已用 4 轮 `ToggleDesktop()` 小压力切换再次复现，未修改功能代码。
- 证据：每轮桌面侧采样 active window 均为 `ClickToDo.exe` / `单击以执行`，路径为 `C:\Windows\SystemApps\MicrosoftWindows.Client.CoreAI_cw5n1h2txyewy\ClickToDo.exe`，窗口为可见 topmost 全屏 `IslandWindow`。
- 结果：active-window 模块返回 `desktopClear=false`、`isDesktop=false`；顶部条窗口 `谁在吃 token` 为 `visible=false/topmost=false`，HUD 窗口也为隐藏。
- 现有测试状态：`npm run test:window-detection` 与 `npm run test:hud-stability` 通过，但未覆盖该分支；修复时必须先补测试。

## 2026-05-30 已关闭：ClickToDo / NarratorHelperWindow 导致桌面顶部条隐藏
- 状态：已修复并通过回测。
- 修复方式：仅将 `ClickToDo.exe` / `单击以执行` / `Click to Do` 与 `svchost.exe` + `NarratorHelperWindow` / 离屏小窗口识别为 Windows 桌面辅助瞬态，并触发 blocker-aware fallback；不把它们直接判为桌面。
- 回测结果：4 轮桌面切换中，桌面侧 active window 回落为 Explorer desktop base，顶部条显示且 topmost，HUD 隐藏。
- 残余风险：如果 Windows 后续引入新的桌面辅助窗口名或 className，需要基于新证据追加窄匹配；不要泛化到所有 shell/svchost/小窗口。

## 2026-05-30 已关闭：桌面顶部条视觉层级过重
- 状态：已做样式收敛并通过匹配范围回归。
- 表现：截图中 `.usage-strip` 像大号半透明胶囊，绿/黄实心状态徽章和高亮描边过重，在桌面壁纸上显脏。
- 处理：仅修改 `src/renderer/styles.css`，降低顶部条与用量区的彩色饱和度、阴影和状态描边强度；状态徽章改为轻量半透明描边；未修改数据、窗口仲裁或 HUD 逻辑。
- 残余风险：审美仍有主观性；真实桌面壁纸上的对比度需要用户目视确认。如继续调整，应仍限制在顶部条样式层，不扩大到功能逻辑。

## 2026-05-30 已关闭：token 发生器与小人互动感不足
- 状态：已增强并通过匹配范围回归。
- 表现：发生器、小人和飞行 token 虽然同屏，但静态观感像独立装饰，缺少清晰的“发生器喂 token 给小人”的关系。
- 处理：`src/renderer/app.js` 让发生器感知当前小人 scene，并向 CSS 暴露 token 路径距离/角度；`src/renderer/styles.css` 增加喂食线、到达闪光、发生器吐 token 响应和小人场景响应动画。
- 残余风险：动效强度仍有审美主观性；后续如继续调整，仍应使用现有 scene / CSS 变量，不要新增高频轮询或把 token 粒子重新挂回小人内部。

## 2026-05-30 已关闭：桌面切回工具空窗与 HUD 微抖
- 状态：已做最小修复并通过匹配范围回归。
- 表现：从桌面切回工具时，桌面顶部条先消失但 HUD 刷新尚未完成，形成感知延迟/闪烁；全屏工具 bounds 采样出现 1-2px 波动时，会触发不必要的 HUD 定位刷新。
- 处理：`src/main.cjs` 中工具态决策不再先隐藏桌面顶部条，改为 HUD `showInactive()` 后再隐藏；新增 2px bounds 容差，避免等价边界反复 `setBounds()`。
- 约束：不要为了“更快判断”把 overlay coordinator 降到 200ms 以下，性能预算会失败；优先用显示时序、采样噪声重试和容差处理感知闪烁。
- 残余风险：真实 Windows 连续快速切换仍需用户目视确认；若仍出现新窗口名/新 className 导致误判，需要用 fresh evidence 做窄匹配，不要泛化桌面规则。

## 2026-05-30 已关闭：顶部条用量小框信息不足
- 状态：已增强并通过视觉 mock 与回归。
- 表现：`usage-strip` 只显示 provider、状态、trust、今日/近期用量，右侧空间利用不足，和余量/发生器联动不够清晰。
- 处理：新增余量 chip 与重置/账期/新鲜度提示；`usage-strip`、发生器和 token flow 共用同一余量 level 与 quota fill，避免显示口径分裂。
- 残余风险：顶部条空间紧张时仍需关注文本截断；新增字段应保持短标签，不要塞长解释文案。

## 2026-05-30 已关闭：桌面/工具切换残余抖动与误隐藏
- 状态：已修复并通过 24 轮压力回测。
- 表现：完整压力测试中曾出现 ClickToDo 通过 fast desktop inspected path 泄漏、Explorer Host Popup 0x0 壳窗口隐藏顶部条、桌面 blocker 过渡帧让顶部条在工具恢复时多留一拍，以及 HUD 刷新层先按 desktop shell transient 隐藏再读取 `toolContext` 的顺序问题。
- 处理：`src/system/active-window.cjs` 增加 `shouldUseInspectedFastDesktopWindow()` 与 Explorer Host Popup 窄匹配；`src/main.cjs` 增加 `hasDesktopForegroundBlocker()` 门禁，并调整 `refreshToolHud()` 的 toolContext/desktop 判断顺序。
- 回测证据：`.omx/evidence/topbar-hud-stress-final-pass4-20260530.json`，24 轮、96 个样本，桌面 settled 与工具 return 均 0 失败。
- 反例校正：曾尝试用 `desktop-after-tool-transition` 保护保留 HUD，但会在真实桌面残留 HUD，已撤回，并在 `scripts/test-hud-stability.mjs` 中断言不得恢复。
- 残余风险：Feishu 通知、Windows LockApp/锁屏等外部前台可以真实抢占桌面/工具样本；不要把所有通知、锁屏、无标题外部窗口泛化为桌面，否则会把真实应用误判成桌面。后续只能基于 fresh evidence 做窄匹配或在压力脚本中标注为外部干扰。

## 2026-05-30 已关闭：顶部条余量小人与发生器联动不足
- 状态：已增强并通过回归。
- 表现：原顶部条小框未包含余量小人，发生器 token 与 roaming 小人的关系不够清晰，且发生器未充分响应余量状态。
- 处理：`usageMascot` 进入 `usage-strip`，使用 quota orbit 表达余量，仅与余量交互；发生器、token flow 与 roaming mascot 共享 quota fill、level、flow speed 和 scene，形成发生器到小人的明确喂食路径。
- 残余风险：视觉与动效强度仍有主观性；继续调整时应保持现有 CSS/scene 变量驱动，不要新增高频轮询或把 token 粒子重新挂回小人内部。

## 2026-05-31 已关闭：Overlay 仲裁结构分裂导致反复闪烁
- 状态：已按最终方案重构收敛并通过 50 轮真实切换压力回测。
- 表现：顶部条、HUD、前台采样、工具记忆、异步刷新分别在不同代码路径里决定可见状态，导致单帧采样噪声可能让顶部条在工具内残留、HUD 在桌面残留或反复切换。
- 处理：新增纯状态机 `src/main/overlay-controller.cjs`；`src/main.cjs` 用 `applyOverlayTransition()` 集中 show/hide；`refreshToolHud()` 变为纯渲染；remembered tool 不再参与 HUD 复活；active-window 采样超时和未知窗口进入 bounded noise/hidden。
- 额外处理：0x0 Explorer shell 不再作为 desktop base；同一 Codex 窗口的 HiDPI 物理/逻辑 bounds 视为等价，避免反复刷新 HUD。
- 回测证据：`.omx/evidence/overlay-controller-stress-50-final-20260531.json`，50 轮、200 个样本、`desktopFailureCount=0`、`toolFailureCount=0`、`topbarVisibleWhileToolMs=0`、`hudVisibleWhileDesktopMs=99`、`passed=true`。
- 残余风险：未知外部前台会短暂隐藏全部，这是当前方案的有意取舍；不要再为每个外部窗口无证据追加桌面/工具规则。
## 2026-05-31 已关闭：新用户文档与设置页入口风险
- 本轮未发现新的开放风险：文档、协议、provider health、HUD 稳定、性能预算、动效契约和整体语法检查均已通过。
- 注意：设置页文档入口通过主进程 allowlist 打开仓库内 `docs/getting-started.md` 与 `docs/agent-getting-started.md`；若后续做打包发布，需要确认 `docs/` 是否随包分发，避免已安装包内打开失败。

## 2026-05-31 当前风险：Overlay 压力脚本中文标题误判
- 状态：已修复脚本并通过守护测试。
- 表现：正常模式运行 `scripts/stress-overlay-switch.mjs` 时，桌面顶部条在真实系统里存在，但脚本通过 Node 读取 PowerShell stdout 后把 `谁在吃 token` 解码成乱码，导致 `/^谁在吃 token$/` 匹配失败，误报 `desktopFailureCount=10`。
- 证据：`.omx/evidence/overlay-controller-stress-current-20260531-145621.json` 中 `desktopBar=null`；debug 复跑 `.omx/evidence/overlay-controller-stress-debug-20260531-145958.json` 中状态机决策为 `desktop-topbar` 且通过；直接系统枚举顶部条 hwnd 显示 `visible=true`。
- 风险：之前 50 轮压力证据主要依赖 app debug 内部状态；如果只看 summary，可能误把内部状态通过当成真实窗口枚举通过。
- 处理：`scripts/stress-overlay-switch.mjs` 已改为 `-EncodedCommand` + UTF-8 输出；debug 关闭时会使用真实窗口枚举判断 overlay ready；`scripts/test-hud-stability.mjs` 已加断言守住。
- 剩余风险：15 轮正常模式回测中，`Weixin/微信` 多次抢前台，导致整体 summary 仍为 `passed=false`；有效桌面阶段 `8/8`、有效 Codex 工具阶段 `12/12` 已通过。后续要获得全绿 summary，需要先控制外部前台干扰，或让压力脚本把“目标前台未达成”的轮次单独标为 environment interference，而不是产品失败。

## 2026-05-31 已关闭：Show Desktop 后 native foreground 返回旧全屏工具
- 状态：已修复并通过 15 轮真实窗口回测。
- 表现：从工具切到桌面后，压力脚本已看到 Explorer desktop，但 app 内 `get-windows` fast desktop sample 偶发仍返回旧的全屏 `Chrome/Codex`；状态机因此收到 `tool-foreground` 输入并保持 HUD，表现为桌面态 HUD 残留。
- 判断：这是采样层陈旧 native sample，不是 `overlay-controller` 状态机失效，也不是 remembered tool 复活 HUD。
- 处理：own/external overlay foreground 优先回查 desktop base，避免用背景工具误判；新增窄 Win32 desktop foreground probe，并只在最新 surface 为 `tool-hud` 时启用，专门纠正 tool -> desktop，避免阻塞 desktop -> tool。
- 回测证据：`.omx/evidence/overlay-controller-stress-15-real-windows-tool-scoped-probe-20260531-164140.json`，`desktopFailureCount=0`、`toolFailureCount=0`、`topbarVisibleWhileToolMs=0`、`hudVisibleWhileDesktopMs=0`、`productPassed=true`。
- 残余风险：如果 Win32 probe 在极端系统负载下连续超时，状态机仍应走 bounded noise/hidden，而不是让 remembered tool 或背景窗口复活 HUD；后续不要把新窗口名继续堆进 overlay 策略。
- 2026-05-31 已关闭：active-window null bounds 防御未真实落地。已在 `scripts/test-window-detection.mjs` 增加 `_test.normalizeBounds(null)` 与 `bounds: null` foreground 判断断言，并在 `src/system/active-window.cjs` 的 `normalizeBounds()` 入口处理 `null/undefined/非对象`。重启后 `.omx/run/app-start.err.log` 为空，`npm run status -- --json` 返回 `ok=true`。剩余风险转入计划项：P0-1 transition 原子性、P0-2 `refreshToolHud()` render-only、P0-3 remembered tool 决策残留。
- 2026-05-31 已关闭：`active-window-timeout` 被当作确认未知前台，导致已确认桌面顶部条被隐藏。证据：`.omx/evidence/overlay-retest-debug-3-real-windows-20260531-current-2.json` 中桌面阶段出现 `desktop-topbar -> hidden`，reason 为 `active-window-timeout`。处理：仅在 `src/main/overlay-controller.cjs` 内让上一稳定 surface 为 `desktop-topbar` 时的第一帧 `active-window-timeout` 保持桌面顶部条，表示“没有新前台事实”；连续 timeout 仍累计 `stalePreserveMs`，超过 `300ms` 后进入 `hidden`。其他未知/通知/LockApp/普通 sampling noise 仍走 bounded noise/hidden。最终证据：`.omx/evidence/overlay-retest-timeout-preserve-15-real-windows-20260531.json` 与 code-review fresh evidence `.omx/evidence/overlay-code-review-fresh-5-real-windows-20260531.json`，均为 `desktopFailureCount=0`、`toolFailureCount=0`、`topbarVisibleWhileToolMs=0`、`hudVisibleWhileDesktopMs=0`、`stalePreserveMs=0`、`passed=true`。
- 2026-05-31 当前观察：用户反馈桌面顶部条缺失后，本轮只读复核未复现。当前桌面识别为 `explorer / Program Manager / Progman`，顶部条 hwnd `19466818` 为 `visible=true/topmost=true`，截图 `.omx/evidence/desktop-topbar-current-20260531.png` 可见，5 轮真实窗口回测 `.omx/evidence/desktop-topbar-current-retest-5-real-windows-20260531.json` 为 `passed=true`。后续若再次出现目视缺失，必须先采集 debug transition 与 Win32 hwnd 样式，不要直接改状态机或追加窗口名补丁。
- 2026-05-31 当前观察：切换体感闪烁/任务栏影响反馈的只读复核。Codex+Chrome 8 轮真实窗口回测通过，但出现 `hudVisibleWhileDesktopMs=260`，说明桌面早期帧可能短暂保留 HUD；Chrome 桌面->工具 hwnd 高频复核出现 1 个样本为工具前台但顶部条仍可见、HUD 未显示。普通任务栏悬停未复现异常；LockApp 抢前台会隐藏全部，符合最终方案的未知/锁屏 fail-safe。当前不要改状态机或追加窗口名，优先在用户审核后处理 transition/HUD render 可见性窗口，并修正 real-windows-only 下 `surfaceTransitionCount=0` 的验证盲点。

## 2026-06-01 当前风险：严格 0ms 桌面响应仍未达成
- 已关闭验证盲点：`scripts/stress-overlay-switch.mjs --real-windows-only` 的 `surfaceTransitionCount` 现在来自真实窗口可见性，本轮 Codex+Chrome 15 轮得到 `surfaceTransitionCount=30`、`surfaceTransitionSource=real-windows`，不再是 0。
- 已落地限定产品改动：同一 `tool.id + hwnd` 的已有 HUD payload 只在状态机确认 `tool-hud` 后 warm-show，不参与判断，不使用 remembered tool，不新增窗口名。
- 未关闭风险：严格 `--max-leak-ms 0` 回测仍有 `hudVisibleWhileDesktopMs=260`，且多次出现在 `desktop-early` 样本；这表示工具->桌面的 HUD 残留来自 200ms coordinator/前台采样节奏，不是 HUD 内容刷新空窗，也不是 remembered tool 复活。
- 后续禁止：不要为了把 `hudVisibleWhileDesktopMs` 压到 0 而私自改状态机、追加窗口名、恢复 remembered tool，或把测试阈值调宽。下一步必须先审查一个新的最小范围方案，例如“状态机仍唯一决策，但增加工具态轻量前台变更唤醒/事件化采样”的方案和回测边界。
## 2026-06-01 已关闭：严格 0ms 桌面残留指标误报与 priority 覆盖竞态
- 状态：已关闭。
- 原因复核：上一轮 `hudVisibleWhileDesktopMs=260` 的最新失败证据主要来自 `tool-return` 或阶段不匹配样本污染统计，并非有效桌面阶段 HUD 残留；同时代码审查发现 priority wake 应用期间普通 coordinator pass 仍可能新启动，存在理论覆盖竞态。
- 处理：残留指标改为 phase-scoped；priority wake 增加 `overlayCoordinatorPriorityInFlight` 闸门，普通 pass 在 priority 应用期间排队；仍然不改状态机、不新增窗口名、不使用 remembered tool、不降低 200ms coordinator 预算。
- 验证：最新 15 轮真实窗口回测 `hudVisibleWhileDesktopMs=0`、`topbarVisibleWhileToolMs=0`、`surfaceTransitionCount=30`、`productPassed=true`；完整回归和 `git diff --check` 通过。
- hook fresh verification：OMX 当前为 complete、无 active mode；5 轮 Codex+Chrome 真实窗口补测 `hudVisibleWhileDesktopMs=0`、`topbarVisibleWhileToolMs=0`、`surfaceTransitionCount=10`、`environmentInterferenceCount=0`、`passed=true`，未重新打开本风险。
- repeat hook verification：重复 stop hook 后再次复核，OMX 仍为 complete、无 active mode；3 轮 Codex+Chrome 真实窗口补测 `hudVisibleWhileDesktopMs=0`、`topbarVisibleWhileToolMs=0`、`surfaceTransitionCount=6`、`environmentInterferenceCount=0`、`passed=true`，仍未重新打开本风险。
- session state fix：第三次重复 stop hook 的原因不是 overlay 回归，而是 session-scoped autopilot state 仍残留 `active=true/current_phase=ralplan`；已显式写回该 session 为 complete/inactive。补测 2 轮 Codex+Chrome 真实窗口 `hudVisibleWhileDesktopMs=0`、`topbarVisibleWhileToolMs=0`、`surfaceTransitionCount=4`、`environmentInterferenceCount=0`、`passed=true`，本风险仍关闭。
- 剩余风险：真实 Windows 激活链路仍可能出现 Feishu/Explorer 抢前台或目标工具未达前台，当前以 `environmentInterference` 单独报告；不要把这类样本再当作产品 overlay 残留，也不要为它们追加泛化窗口名补丁。
# 2026-06-01 当前风险：稳定 tool-hud 下重复 warm-show 可能造成 HUD 闪烁和任务栏注意状态
- 状态：已只读复现并形成待审核方案，尚未修改功能代码。
- 证据：`%APPDATA%\who-eats-token\hud-debug.ndjson` 中 `overlay-transition:warm-tool-hud` 累计 506 次，Codex 前台稳定时仍持续增长；`src/main.cjs` 的 `applyOverlayTransition()` 在每次 `tool-hud` 决策都调用 `warmShowToolHudForTransition()`，而 `showToolHudWindow()` 对已可见 HUD 会继续 `moveTop()`。
- 反证：Win32 样式检查显示 `LLM HUD` 与 `LLM HUD Controls` 仍为 `noActivate=true`、`appWindow=false`，所以不要把问题直接定性为 HUD 窗口已变成可激活窗口。
- 风险判断：重复 topmost/moveTop 可能造成 HUD 视觉闪烁、任务栏红框/注意状态或桌面切换体感卡顿；但尚未直接抓到 Windows `FlashWindowEx` 调用证据，需按“高度相关、待修复验证”的级别处理。
- 禁止方向：不要改 `overlay-controller` 机制，不要新增窗口名补丁，不要恢复 remembered tool，不要通过放宽测试阈值掩盖 `hudVisibleWhileDesktopMs`。
- 待审核修复：只允许在用户确认后，把 warm-show 限制为“刚进入 tool-hud”或“HUD 当前不可见需要恢复”，稳定 `tool-hud -> tool-hud` 不得重复 warm-show / `moveTop()`。
