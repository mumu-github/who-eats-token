# VS Code / Cursor Adapter

这个 adapter 是一个轻量 VS Code 兼容扩展，用于在 IDE 状态栏显示本机 Who Eats Token 快照。

它不拦截 IDE 的私有 AI 请求，也不读取工作区源码或提示词。真实 token 用量仍应通过本地 gateway、SDK wrapper 或供应商 usage API 上报。

## 能做什么

- 在状态栏显示当前 5 小时和 7 天余量。
- 命令面板手动刷新。
- 复制当前 `/snapshot` JSON，方便排查。
- 支持 VS Code，以及兼容 VS Code extension API 的 Cursor/Windsurf 类 IDE。

## 配置

设置项：

- `whoEatsToken.enabled`
- `whoEatsToken.endpoint`
- `whoEatsToken.token`
- `whoEatsToken.refreshSeconds`

默认 endpoint 是 `http://127.0.0.1:17667`。token 留空时会读取本机默认 token 文件。

## 开发安装

1. 在 VS Code 中打开本目录。
2. 用 Extension Development Host 加载 `adapters/vscode-extension`。
3. 或后续使用 `vsce package` 打包 VSIX 后手动安装。

Cursor 兼容性建议优先走手动 VSIX 安装验证，因为不同版本的 Cursor 对扩展市场和 VS Code API 的同步程度可能不同。

## 低内存约束

- 不使用 `setInterval`。
- 用递归 `setTimeout`，默认 15 秒刷新。
- 请求超时 1.5 秒。
- 本机 API 关闭时只更新状态栏，不阻塞编辑器。
## Lightweight Health

The status bar refresh reads `GET /health` for compact provider status. The extension reads the full `/snapshot` only when the user runs the explicit copy snapshot command.
