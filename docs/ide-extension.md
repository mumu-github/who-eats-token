# IDE Adapter

IDE adapter 的定位是“把当前余量带进编辑器”，不是替代供应商 billing 或桌面 HUD。

当前参考实现位于 `adapters/vscode-extension`，面向 VS Code 和兼容 VS Code extension API 的 IDE。

## 为什么先做 VS Code 兼容扩展

- VS Code extension API 是 Cursor、Windsurf 等 IDE 最常见的兼容面。
- 状态栏和命令面板足够表达 token 余量，不需要重型 Webview。
- 可以用手动 VSIX 分发，降低早期开源维护成本。

## 数据流

```text
Who Eats Token desktop app
  -> http://127.0.0.1:17667/health
  -> VS Code extension status bar
```

The explicit "copy snapshot" command still reads `/snapshot`; the periodic status-bar refresh uses `/health` to stay light.

真实使用量仍通过这些路径上报：

- Hermes bridge
- Node SDK wrapper
- Browser extension
- Provider-specific adapter

## 不做什么

- 不读取工作区源码。
- 不读取 prompt 或 completion。
- 不拦截 Cursor/VS Code 私有 AI 内部请求。
- 不启动后台 watchdog。

## 兼容性注意

VS Code 官方扩展模型通过 `package.json` 声明 activation events、commands 和 configuration。Cursor 等兼容 IDE 通常支持 VS Code 扩展 API，但扩展市场、版本同步和手动安装体验可能有差异。因此开源发布时建议：

1. 先发布源码和 VSIX。
2. 用 VS Code 验证标准行为。
3. 用 Cursor 手动安装 VSIX 验证状态栏、命令和配置。
4. 再考虑 Open VSX 或其它市场。

## 测试

```powershell
npm run test:vscode-extension
npm run test:vscode-extension-runtime
npm run package:vscode-extension
```

这个测试只做静态门禁：manifest、配置项、命令、语法和低内存约束。真实 IDE 行为还需要手动 Extension Development Host 验证。

打包产物在 `release/adapters/who-eats-token-vscode-adapter-*.vsix`。发布前用 VS Code 和 Cursor 各手动安装一次。
