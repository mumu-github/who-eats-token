# Browser Extension Adapter

这个 adapter 是一个 Manifest V3 浏览器扩展，用于把网页工具里的 HUD 遮挡信息和显式 usage 事件转发给本机 `who-eats-token`。

第一版目标是低风险、低内存：

- content script 只在已列入 `manifest.json` 的工具页面运行。
- service worker 只在收到消息时唤醒。
- 默认不上报聊天内容、提示词、补全文本、Cookie 或 API key。
- 遮挡信息只包含元素类型、短标签和屏幕矩形。

## 安装

1. 打开 Chrome 或 Edge 的扩展管理页。
2. 开启开发者模式。
3. 选择“加载已解压的扩展”。
4. 选择本目录：`adapters/browser-extension`。

## 配置本地 token

Who Eats Token 首次启动后会生成本机访问 token。

Windows:

```powershell
$token = (Get-Content "$env:APPDATA\who-eats-token\api-token.txt" -Raw).Trim()
```

macOS:

```sh
token="$(cat "$HOME/Library/Application Support/who-eats-token/api-token.txt")"
```

把这个值填到扩展的 Options 页面。浏览器扩展来源是 `chrome-extension://...`，本地 API 会要求它携带 `X-Who-Eats-Token`。

## 支持页面

当前默认匹配：

- Hermes Web UI: `127.0.0.1:8648`, `localhost:8648`
- ChatGPT: `chatgpt.com`, `chat.openai.com`
- Claude: `claude.ai`
- Gemini: `gemini.google.com`
- Google AI Studio: `aistudio.google.com`

不要把扩展改成 `<all_urls>`。新增工具时先加精确域名，再用 `npm run test:browser-extension` 做静态检查。

## usage 事件

扩展不会猜测聊天 token。网页工具或自写脚本可以显式发事件：

```js
window.postMessage({
  type: "WHO_EATS_TOKEN_USAGE",
  event: {
    provider: "example",
    model: "example-model",
    input_tokens: 1200,
    output_tokens: 320,
    confidence: "reported"
  }
}, window.location.origin);
```

content script 会把这个事件转发到 service worker，再由 service worker POST 到 `http://127.0.0.1:17667/events`。

## 验证

```powershell
npm run test:browser-extension
```

这个测试会检查 MV3 manifest、精确页面匹配、必要文件、语法和低内存约束。
## Lightweight Health

Options connection tests use `GET /health`, not the full `/snapshot`. The extension should post overlays and explicit usage events only; it should not fetch full desktop state unless a future UI explicitly needs it.
