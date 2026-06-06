# 第一次使用

这份指南给第一次打开《谁在吃 token》的用户看。它只使用本机数据和 localhost 服务，不需要云端账号，也不会上传 prompt、completion、源码、API key 或 Cookie。

## 1. 启动应用

源码运行：

```powershell
npm install
npm start
```

启动后应用会监听本机 API：

```text
http://127.0.0.1:17667
```

桌面空闲或切到桌面时显示顶部条；进入 Codex、Hermes 等已识别工具时显示工具内 HUD。

## 2. 看懂余量口径

不同工具的“还能不能继续”不是同一个口径：

| 工具类型 | 显示口径 | 说明 |
| --- | --- | --- |
| Codex | `5小时 / 一周` | 来自 Codex 本机会话 JSONL 的 `token_count` 和 rate limit 窗口。主判定优先当前 5 小时窗口。 |
| Hermes / Xiaomi Token Plan | `剩余 / 总量 / 已用 / 账期` | 检测到 Xiaomi/MiMo Token Plan 配置时显示 Credits。没有平台 Cookie 时会标记为本地估算。 |
| 只有上下文窗口的工具 | `上下文剩余 / 已用上下文` | 用 context window 判断当前会话还能装多少内容。 |
| 只有用量事件的工具 | `今日 / 近1h / 等待限额` | 只知道用量节奏，不假装知道账号余量。 |

顶部条和 HUD 都读同一个 `providerHealth`：`displayMode` 决定显示模式，`remainingStandardPercent` 决定小人和告警，`trust` 说明数字靠不靠谱，`delight` 决定轻量动效状态。

## 3. 获取本机访问 token

首次启动会生成本机访问 token。其他本机工具、浏览器扩展或 IDE adapter 访问 `/health`、`/snapshot`、`/events` 时默认需要带上它。

Windows:

```powershell
$token = (Get-Content "$env:APPDATA\who-eats-token\api-token.txt" -Raw).Trim()
```

macOS:

```sh
token="$(cat "$HOME/Library/Application Support/who-eats-token/api-token.txt")"
```

不要把这个 token 提交到 Git，也不要发给别人。

## 4. 确认当前状态

先跑轻量状态命令：

```powershell
npm run status
npm run status -- -- --json
```

重点看每个 provider 的状态：

| 状态 | 含义 | 下一步 |
| --- | --- | --- |
| `live` | 当前有可信数据 | 可以直接看顶部条/HUD。 |
| `estimated` | 有估算数据 | 可以参考，但不要当成官方实时余量。 |
| `delayed` / `suspect` | 数据慢半拍或疑似跳变 | 等下一次刷新，或检查工具自己的 quota UI。 |
| `auth-expired` | 需要刷新本地凭据 | 重新登录对应 provider，或刷新本地 Cookie。 |
| `missing` | 暂无数据 | 打开对应工具产生一次 usage，或安装 adapter。 |
| `disabled` / `planned` | 已关闭或仅预留 | 到设置页开启，或等待 adapter 接入。 |

## 5. Codex

Codex 默认启用，不需要额外配置。应用会读取本机 `~/.codex/sessions` 下最近的 session JSONL，只使用 token 数、时间戳、模型和 rate limit 元数据。

如果 Codex 显示 `missing`，通常是还没有最近的 `token_count` 事件。打开 Codex 进行一次对话后再运行：

```powershell
npm run status
```

## 6. Hermes / Xiaomi Token Plan

Hermes Local 默认读取本机 Hermes 数据库：

- Windows: `%LOCALAPPDATA%\hermes\state.db`
- macOS: `~/Library/Application Support/hermes/state.db`

如果使用 Xiaomi/MiMo Token Plan，可以把网页登录后的平台 Cookie 放在本机 Hermes 数据目录中：

```powershell
Set-Content -Path "$env:LOCALAPPDATA\hermes\xiaomi-platform-cookie.txt" -Value "你的 platform.xiaomimimo.com Cookie"
```

这个 Cookie 等同登录凭据，只保存在本机，不要提交或分享。没有 Cookie 时，Token Plan 会走本地估算并显示为 `estimated`。

## 7. 浏览器工具

浏览器网页建议用独立扩展接入：

```powershell
npm run test:browser-extension
```

开发安装时在 Chrome/Edge 扩展页加载 `adapters/browser-extension`，然后在 Options 页面填入本机访问 token。扩展默认只上报 HUD 遮挡矩形；usage 必须由网页或用户脚本显式 `window.postMessage`，不会猜测聊天 token。

## 8. VS Code / Cursor

IDE 状态栏 adapter 位于 `adapters/vscode-extension`。它只读 `/health` 显示状态；只有用户显式执行复制命令时才读 `/snapshot`。

```powershell
npm run test:vscode-extension
```

token 留空时，扩展会读取默认 token 文件。

## 9. 本地 API 最小事件

脚本、网关或 SDK wrapper 可以显式上报 usage：

```powershell
$token = (Get-Content "$env:APPDATA\who-eats-token\api-token.txt" -Raw).Trim()
Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:17667/events `
  -Headers @{ "X-Who-Eats-Token" = $token } `
  -ContentType application/json `
  -Body '{"provider":"local-demo","model":"demo-model","input_tokens":1200,"output_tokens":480,"confidence":"reported"}'
```

如果 provider 还能提供余量窗口，把 `rate_limits` 一起上报；如果只有上下文窗口，把 `context` 一起上报。字段细节见 [protocol.md](protocol.md)。

## 10. 小人和动效

小人状态来自真实 `quota/trust/delight`：

- 余量充足：轻松等待、接 token 或跑动。
- 余量偏紧：更谨慎地接 token / 吃 token。
- 余量很低：固定低余量姿态。
- 数据延迟、估算或登录失效：会用文案和姿态标清楚。

默认不会用 GIF 做循环动画。项目优先使用小体积 PNG 姿态图或 spritesheet 加 CSS 动效，并在系统 `reduced motion` 模式下停止装饰动画。
