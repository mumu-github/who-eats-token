# Browser Extension Adapter

Connection tests should use `GET /health`. Use `GET /snapshot` only if an explicit extension UI needs the full aggregate state.

浏览器扩展是多工具兼容层，不是桌面 HUD 的替代品。它负责读取网页里的“遮挡矩形”和显式 usage 事件，再交给本机 Who Eats Token 聚合。

## 为什么用 MV3

Chrome/Edge 的现代扩展模型使用 Manifest V3。MV3 的 background 是 service worker，按事件唤醒；content script 在匹配页面里运行，适合做低频 DOM 观察和消息转发。

设计取舍：

- 不使用持久后台页。
- 不使用 `<all_urls>`。
- 不轮询全站 DOM。
- 不读取提示词和回复内容。
- 本地请求必须带 `X-Who-Eats-Token`。

## 数据流

```text
web tool page
  -> content-script.js
  -> chrome.runtime.sendMessage
  -> service-worker.js
  -> http://127.0.0.1:17667/overlays
  -> desktop HUD avoidance
```

usage 事件走同一条链路，但目标是 `/events`。

## 安装

开发安装：

1. 打开 Chrome/Edge 扩展页。
2. 开启开发者模式。
3. 加载 `adapters/browser-extension`。
4. 打开扩展 Options。
5. 填入本机 API token。

Windows token:

```powershell
$token = (Get-Content "$env:APPDATA\who-eats-token\api-token.txt" -Raw).Trim()
```

macOS token:

```sh
token="$(cat "$HOME/Library/Application Support/who-eats-token/api-token.txt")"
```

## 新工具适配原则

新增网页工具时优先做三件事：

1. 在 `manifest.json` 里加精确域名。
2. 确认页面里的弹窗、发送按钮、继续按钮会被 `/overlays` 报告。
3. 如果网页有可靠 usage 数据，让页面显式 `window.postMessage({ type: "WHO_EATS_TOKEN_USAGE", event })`。

不要通过全文 DOM 搜索去猜 token，也不要上传对话内容。

## 稳定性规则

- MutationObserver 只做节流扫描。
- 长时间弹窗用短 timeout 保活，不用 `setInterval`。
- service worker 请求失败只返回失败状态，不阻塞网页。
- Options 里可以一键禁用 adapter。
- 本地 API 关闭时扩展静默失败。

## 测试

```powershell
npm run test:browser-extension
npm run test:browser-extension-runtime
npm run package:browser-extension
npm run release:check
```

打包产物在 `release/adapters/who-eats-token-browser-extension-*.zip`。Chrome/Edge 可以先加载源码目录做开发验证，发布前再用 ZIP 做分发检查。

发布前至少在 Chrome 和 Edge 各手动加载一次，并验证：

- Options 测试连接正常。
- Hermes Web UI 的发送区弹窗能让右下角 HUD 避让。
- 非匹配网站不注入 content script。
