# Open Source Form Strategy

目标：把“谁在吃 token”做成 Windows 10+ 和 macOS 上稳定、低内存、多工具兼容的开源项目。

## 结论

不要只做 skill，也不要只做某个宿主插件。推荐采用分层开源：

1. **Core Desktop App**：主项目，负责常驻 HUD、顶栏、本地采集、本地 API、低占用策略。
2. **Integration Adapters**：轻量接入包，按工具拆分，例如 Hermes Bridge、Browser Extension、VS Code/Cursor Extension、CLI/SDK wrapper。
3. **Agent Skills / Codex Plugin**：不是运行时核心，只负责安装、诊断、接入流程和团队规范。

同类 GitHub 项目已经覆盖了不少通用 token tracking 和 CLI/dashboard 场景，尤其是 TokenTracker 和 ccusage。这个项目不应该把定位写成“第一个/唯一通用 token 追踪器”，而应该明确成“跨 Windows/macOS 的实时桌面 HUD + 本地协议 + 适配器宿主”。详细调研见 [docs/open-source-landscape.md](open-source-landscape.md)，TokenTracker 可借鉴点和我们的轻量趣味突破方向见 [docs/token-tracker-lessons.md](token-tracker-lessons.md)。

简化判断：

| 形态 | 适合做什么 | 不适合做什么 | 推荐优先级 |
| --- | --- | --- | --- |
| 独立桌面工具 | 常驻 HUD、跨工具聚合、系统资源显示、本地 API | 每个网页内深度 DOM 感知 | P0 |
| 本地事件协议/API | 多工具统一上报，低耦合兼容 | 自动知道所有未接入工具的真实用量 | P0 |
| 浏览器扩展 | Web UI 遮挡检测、网页工具 token 使用捕获 | 桌面级全局 HUD、原生 App 检测 | P1 |
| IDE 扩展 | VS Code/Cursor 内状态栏、工作区级 token 统计 | 全系统监控 | P1 |
| MCP Server | 让 Codex/Claude/Cursor 等 agent 查询当前余量、读取接入状态 | 桌面显示和后台常驻采集 | P1 |
| Skill | 安装、接入、诊断、团队流程复用 | 实时监控、后台服务、低延迟 HUD | P2 |
| Codex/Claude 插件 | 打包 skills/MCP/脚本，降低 agent 用户安装成本 | 面向普通用户的系统级监控 | P2 |

## 为什么 Core Desktop App 必须是主形态

- HUD、托盘、前台窗口识别、系统 CPU/内存展示都需要桌面运行时。
- 多工具兼容需要一个稳定的本地聚合点，而不是每个插件各自维护状态。
- 低内存策略应该集中管理：关闭 debug log、降低轮询、缓存供应商查询、限制 DOM overlay。
- Electron 官方分发路径覆盖 Windows/macOS；发布前需要打包、签名和更新策略。Electron 文档把生产分发拆成 packaging、code signing、publishing、updating，且 autoUpdater 支持 Windows 和 macOS。

## 为什么需要 Integration Adapters

不同工具暴露 usage 的方式不同，不应该让核心 App 内置所有工具的私有逻辑。

建议定义稳定本地协议：

- `POST /events`：工具上报 token、cost、rate limits、confidence。
- `GET /snapshot`：读聚合状态。
- `GET /health`：轻量探活和 providerHealth 摘要，供 adapter/extension 启动检查使用。
- `POST /overlays`：可选网页遮挡信息。
- `X-Who-Eats-Token`：本地浏览器来源必须携带。

每个适配器只做一件事：

- Hermes Bridge：代理本地 OpenAI-compatible 请求并提取响应 `usage`。
- Browser Extension：Manifest V3 content script 读取页面内按钮/弹窗/usage，可选上报。
- IDE Extension：把 VS Code/Cursor 里的模型调用、状态栏余量转成 `/events`。
- CLI/SDK Wrapper：OpenAI/Anthropic/Gemini/LiteLLM 等请求返回后统一上报。

## Skill 和插件应该怎么用

Skills 是“流程知识”，不是后台服务。适合提供这些能力：

- “接入 Hermes / 小米 Token Plan”
- “接入 OpenAI-compatible gateway”
- “诊断 HUD 为什么不显示/卡顿”
- “为一个新工具写 adapter”
- “发布前安全检查”

Codex/Claude 插件适合把 skill、MCP server、脚本和默认配置打包，让 agent 用户一键安装。它不应该替代桌面 App。

OpenAI 对 Codex 的区分是：plugin 用来连接外部工具或信息源，skill 用来让 Codex 遵循流程；两者可以组合。Claude Code 文档也把 skills 定位成带 `SKILL.md` 的可复用流程，并支持脚本/参考文件作为辅助资源。

## MCP Server 的位置

MCP 适合作为 agent-facing adapter：

- expose tool: `get_token_snapshot`
- expose tool: `list_provider_health`
- expose tool: `post_usage_event`
- expose resource: `who-eats-token://snapshot`
- expose prompt: `diagnose-token-monitor`

它的价值是让 Codex、Claude、Cursor、其他 MCP 客户端都能读到当前余量；但 MCP 不负责桌面 HUD。

## Browser Extension 的位置

浏览器扩展适合解决“网页内部遮挡”和“网页工具 usage 读取”。Manifest V3 的背景上下文是 service worker，天然更适合低内存事件驱动；但 MV3 也限制远程代码和持久后台，因此不要把它当成核心常驻服务。

第一版扩展只做两件事：

- content script 识别遮挡元素和发送按钮，发给本地 `/overlays`。
- 可选读取工具页面显示的 usage/rate limit，发给 `/events`。

## IDE Extension 的位置

VS Code/Cursor 扩展适合做工作区内状态栏、命令和 wrapper。VS Code 官方发布链路使用 `vsce` 打包 `.vsix`，并通过 `engines.vscode` 约束兼容版本。Cursor 可以优先兼容 VS Code API，避免单独维护两套。

## 推荐仓库结构

```text
who-eats-token/
  apps/
    desktop/              # Electron app, current src can migrate here later
  packages/
    protocol/             # event schema, snapshot schema, shared validation
    node-sdk/             # JS/TS wrapper helpers
    mcp-server/           # MCP adapter
  adapters/
    hermes-bridge/
    browser-extension/
    vscode-extension/
    cli-examples/
  skills/
    who-eats-token-setup/
    who-eats-token-doctor/
    who-eats-token-adapter-author/
  docs/
    compatibility.md
    open-source-form-strategy.md
```

当前项目不需要马上重构成 monorepo。先保持单包稳定，等协议和适配器边界稳定后再迁移。

## 发布路线

### P0: 稳定核心工具

- Windows 10+ 本机验证：桌面顶栏、工具内 HUD、本地 API、低内存。
- macOS 最小可运行：顶栏、HUD、Codex JSONL、ingest API。
- 本地协议文档化，字段 schema 固定。
- CI 覆盖 Windows/macOS 的语法、桥接解析、release check。

### P1: 多工具接入

- Browser Extension: Hermes Web UI / ChatGPT / Claude / Gemini 网页工具。
- VS Code/Cursor Extension: 状态栏 + 本地上报。
- MCP Server: 给 agent 查询余量和健康状态。
- Node SDK: 给 OpenAI-compatible wrappers 一行接入。

### P2: Agent 生态

- Codex plugin: 打包 MCP + skills + install scripts。
- Claude skill/plugin: setup、doctor、adapter-authoring。
- Provider adapter catalog: 社区贡献接入模板。

当前仓库已经保留 repo-local Codex plugin 骨架：`plugins/who-eats-token`。它绑定 `skills/` 的三个 agent workflow，并通过 MCP wrapper 启动仓库里的 `scripts/mcp-server.mjs`。插件形态只解决 agent 安装、诊断和接入，不接管桌面 HUD 常驻逻辑。

## 当前项目的下一步

1. 固定 `src/protocol` 事件 schema，并保持 `docs/protocol.md` 与实现同步。
2. 维护 `docs/adapter-guide.md`，让任何工具都知道如何上报。
3. 维护 `adapters/catalog.json` 和 [docs/adapter-catalog.md](adapter-catalog.md)，把支持状态、入口、验证命令、隐私边界和性能边界变成机器可查的事实源。
4. 维护轻量 MCP server，只读 snapshot 和健康状态，写入只限明确的 usage event。
5. 继续完善独立浏览器扩展 adapter，优先做 Chrome/Edge 手动加载验证和更多工具域名模板。
6. 继续完善 IDE adapter：VS Code/Cursor 状态栏参考实现已具备静态检查，下一步做真实 VSIX 验证。
7. 维护 `skills/` 和 `plugins/who-eats-token`：setup、doctor、adapter-author 只做流程和诊断，不承载实时监控；`npm run test:plugin` 必须保证插件内 skills 快照不漂移。
8. 继续扩展 SDK wrapper：Node 已有轻量参考实现，后续补 Python 包和更多 OpenAI-compatible 示例。
9. 完成发布打包链路：electron-builder 配置、CI artifact、签名/公证文档、真机验证清单。
10. 维护 [docs/release-readiness.md](release-readiness.md) 和 `npm run test:release-readiness`，把跨平台、多工具、低内存、隐私安全和开源协作证据聚合成发布前总审计。
11. 加内存预算：空闲常驻 RSS 目标、HUD 切换延迟、轮询次数上限。
12. 维护 [docs/open-source-landscape.md](open-source-landscape.md)，发布前复查同类项目，避免把已有开源工具已经做好的 CLI/dashboard/parser 能力重复塞进核心桌面 runtime。
13. 维护 [docs/token-tracker-lessons.md](token-tracker-lessons.md)，把从 TokenTracker 学到的 zero-config、status/doctor、本地聚合、隐私边界和趣味 companion 思路，转成我们的轻量 HUD、适配器互操作和低成本可爱交互。

## 参考来源

- OpenAI Codex plugins and skills: https://openai.com/academy/codex-plugins-and-skills/
- Claude Code skills: https://docs.claude.com/en/docs/claude-code/skills
- Electron distribution overview: https://www.electronjs.org/docs/latest/tutorial/distribution-overview
- Electron autoUpdater: https://www.electronjs.org/docs/latest/api/auto-updater
- electron-builder macOS signing: https://www.electron.build/docs/mac
- VS Code extension publishing: https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- VS Code web extensions: https://code.visualstudio.com/api/extension-guides/web-extensions
- Chrome Manifest V3 overview: https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3
- Chrome extension content scripts: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- MCP server concepts: https://modelcontextprotocol.io/docs/learn/server-concepts
