# Agent 接入指南

这份指南给运行在用户本地工具里的 agent 看。目标是让 agent 能安全地读取《谁在吃 token》的本机状态，或在明确有 usage 数据时上报事件。

## 安全边界

不要读取、收集、上传或写入以下内容：

- prompt、completion、聊天消息正文
- 源码文件、工作区文件路径、数据库原文
- provider API key、Bearer token、Cookie、refresh token
- `api-token.txt` 的内容，除非它只用于本机请求头且不打印、不记录
- Hermes `state.db` 原始内容或截图

只允许处理 token 数、时间戳、provider/model/tool 名称、余量百分比、上下文窗口、低粒度状态和本机 API 健康信息。

## 1. 找到本机 API 和 token

默认 endpoint：

```text
http://127.0.0.1:17667
```

优先读取环境变量：

```text
WHO_EATS_TOKEN_API_TOKEN
```

如果环境变量没有设置，再读取默认 token 文件。

Windows:

```powershell
$token = (Get-Content "$env:APPDATA\who-eats-token\api-token.txt" -Raw).Trim()
```

macOS:

```sh
token="$(cat "$HOME/Library/Application Support/who-eats-token/api-token.txt")"
```

不要把 token 写进日志、诊断包、issue、聊天回复或持久配置；只把它放进本机请求头：

```text
X-Who-Eats-Token: <token>
```

## 2. 先调用 `/health`

`/health` 是启动检查首选。它比 `/snapshot` 小，不包含完整设置和 provider 对象。

```powershell
Invoke-RestMethod http://127.0.0.1:17667/health -Headers @{ "X-Who-Eats-Token" = $token }
```

Agent 应读取：

- `ok`
- `snapshotAvailable`
- `providerHealth.summary`
- `providerHealth.providers[].status`
- `providerHealth.providers[].displayMode`
- `providerHealth.providers[].primaryRemainingPercent`
- `providerHealth.providers[].secondaryRemainingPercent`
- `providerHealth.providers[].tokenPlanRemainingPercent`
- `providerHealth.providers[].contextRemainingPercent`
- `providerHealth.providers[].lowestRemainingPercent`
- `providerHealth.providers[].trust`
- `providerHealth.providers[].delight`

失败处理：

| 情况 | Agent 行为 |
| --- | --- |
| 连接失败 | 认为桌面应用未启动，继续完成用户原任务，不阻塞。 |
| 401 / 403 | 提示用户检查本机 token，不打印 token。 |
| `ok=false` | 降级为不显示余量，只说明本机状态不可用。 |
| `snapshotAvailable=false` | 仍可展示 health 摘要，不要强行读取外部数据。 |

## 3. 需要完整聚合视图时调用 `/snapshot`

只有当用户明确需要完整状态、调试或复制快照时才读 `/snapshot`：

```powershell
Invoke-RestMethod http://127.0.0.1:17667/snapshot -Headers @{ "X-Who-Eats-Token" = $token }
```

不要把完整 `/snapshot` 自动贴到聊天里。需要分享时先脱敏，且优先使用：

```powershell
npm run diagnostics -- -- --json
npm run support:bundle -- -- --json
```

## 4. 判断不同工具余量

以 `providerHealth.providers[]` 为准：

| `displayMode` | 展示方式 | 主口径 |
| --- | --- | --- |
| `capacity` | `5小时 / 一周` | `remainingStandardPercent`，通常是当前 5 小时窗口。 |
| `token-plan` | `剩余 / 总量 / 已用 / 账期` | `tokenPlanRemainingPercent`。 |
| `context` | `上下文剩余 / 已用上下文` | `contextRemainingPercent`。 |
| `usage` | `今日 / 近1h / 等待限额` | 没有可用余量，不要生成剩余百分比。 |
| `missing` | 等待数据 | 不要推断余量。 |

状态解释：

| `status` | 含义 | Agent 建议 |
| --- | --- | --- |
| `live` | 可直接参考 | 正常展示。 |
| `estimated` | 估算 | 标明估算，不作为精确额度。 |
| `delayed` / `suspect` | 延迟或疑似跳变 | 标明慢半拍，避免给强结论。 |
| `auth-expired` | 凭据过期 | 请用户刷新对应本地凭据。 |
| `missing` | 没有数据 | 请用户打开对应工具或安装 adapter。 |
| `disabled` | 设置关闭 | 请用户到设置页开启。 |
| `planned` | 预留接入 | 不能当作故障。 |

## 5. 上报 usage 事件

只有当 agent 已经从官方响应、SDK wrapper、网关或宿主工具拿到明确 usage 元数据时，才 POST `/events`。

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:17667/events `
  -Headers @{ "X-Who-Eats-Token" = $token } `
  -ContentType application/json `
  -Body '{
    "schema": "who-eats-token.usage.v1",
    "provider": "example",
    "tool": "Example Tool",
    "model": "example-model",
    "input_tokens": 1200,
    "output_tokens": 480,
    "confidence": "reported",
    "token_accuracy": "official-usage",
    "source": "example-agent-wrapper"
  }'
```

如果有余量窗口：

```json
{
  "rate_limits": {
    "primary": {
      "remaining_percent": 72,
      "window_minutes": 300,
      "resets_at": "2026-05-31T18:00:00+08:00"
    },
    "secondary": {
      "remaining_percent": 88,
      "window_minutes": 10080,
      "resets_at": "2026-06-07T09:20:00+08:00"
    }
  }
}
```

如果只有上下文窗口：

```json
{
  "context": {
    "used_tokens": 42000,
    "limit_tokens": 200000,
    "remaining_percent": 79,
    "source": "provider-context-window"
  }
}
```

如果 token 数来自启发式估算，必须标记：

```json
{
  "confidence": "estimated",
  "token_accuracy": {
    "level": "heuristic",
    "source": "message-length-heuristic",
    "estimated": true,
    "reason": "Provider did not return explicit usage."
  }
}
```

## 6. 降级规则

- 本机 API 不可用时，不要重试成高频轮询。
- 上报失败时，不要让监控失败影响真实模型调用。
- 没有 `rate_limits` 或 `context` 时，只展示 usage 节奏。
- 不要从网页 DOM、聊天文本或截图里猜 token。
- 不要新增后台 watchdog 或一分钟级重启循环。

## 7. 最小 Agent 检查清单

1. 读取 token 时不打印、不持久化。
2. 先请求 `/health`。
3. 根据 `displayMode` 选择展示口径。
4. 根据 `status` 和 `trust` 标明 live、estimated、delayed、missing、auth-expired。
5. 只有拿到明确 usage 元数据才 POST `/events`。
6. 所有失败都静默降级或给用户简短提示，不阻塞原任务。
