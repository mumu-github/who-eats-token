const PROVIDER_REGISTRY = [
  {
    id: "codex",
    name: "Codex",
    source: "codex-jsonl",
    description: "读取本机 Codex 会话日志里的实时额度窗口。",
    configurable: false,
    enabledByDefault: true
  },
  {
    id: "ingest",
    name: "本地接入 API",
    source: "http-ingest",
    description: "通过 http://127.0.0.1:17667/events 接收其他工具上报。",
    configurable: true,
    enabledByDefault: true
  },
  {
    id: "cursor",
    name: "Cursor",
    source: "planned",
    description: "预留 Cursor / IDE 插件接入位。",
    configurable: true,
    enabledByDefault: false
  },
  {
    id: "claude",
    name: "Claude",
    source: "planned",
    description: "预留 Claude Code 或 Anthropic API 接入位。",
    configurable: true,
    enabledByDefault: false
  },
  {
    id: "gemini",
    name: "Gemini",
    source: "planned",
    description: "预留 Gemini CLI / Google API 接入位。",
    configurable: true,
    enabledByDefault: false
  },
  {
    id: "hermes",
    name: "Hermes",
    source: "hermes-local",
    description: "读取本地 Hermes 会话库里的用量和上下文；检测到 Xiaomi/MiMo 配置时可额外同步 Token Plan Credits。",
    configurable: true,
    enabledByDefault: true
  }
];

function buildDefaultProviderSettings() {
  return Object.fromEntries(
    PROVIDER_REGISTRY.map((provider) => [
      provider.id,
      {
        enabled: provider.enabledByDefault,
        name: provider.name,
        source: provider.source
      }
    ])
  );
}

function getProviderRegistry(settings) {
  return PROVIDER_REGISTRY.map((provider) => ({
    ...provider,
    enabled: settings?.providers?.[provider.id]?.enabled ?? provider.enabledByDefault
  }));
}

module.exports = {
  PROVIDER_REGISTRY,
  buildDefaultProviderSettings,
  getProviderRegistry
};
