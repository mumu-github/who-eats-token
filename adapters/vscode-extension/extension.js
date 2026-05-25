const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const vscode = require("vscode");

const DEFAULT_ENDPOINT = "http://127.0.0.1:17667";
const REQUEST_TIMEOUT_MS = 1500;

let statusItem = null;
let refreshTimer = null;
let disposed = false;

function activate(context) {
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  statusItem.command = "whoEatsToken.refresh";
  statusItem.text = "$(pulse) Token";
  statusItem.tooltip = "Who Eats Token: waiting for local health.";
  statusItem.show();

  context.subscriptions.push(statusItem);
  context.subscriptions.push(vscode.commands.registerCommand("whoEatsToken.refresh", () => refreshNow(true)));
  context.subscriptions.push(vscode.commands.registerCommand("whoEatsToken.copySnapshot", copySnapshot));
  context.subscriptions.push(vscode.commands.registerCommand("whoEatsToken.openSettings", openSettings));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("whoEatsToken")) refreshNow(true);
  }));
  context.subscriptions.push({
    dispose() {
      disposed = true;
      clearTimeout(refreshTimer);
    }
  });

  scheduleRefresh(200);
}

function deactivate() {
  disposed = true;
  clearTimeout(refreshTimer);
}

async function refreshNow(manual = false) {
  const settings = readSettings();
  if (!settings.enabled) {
    updateStatus({
      text: "$(circle-slash) Token off",
      tooltip: "Who Eats Token adapter is disabled."
    });
    scheduleRefresh(settings.refreshMs);
    return;
  }

  try {
    const health = await requestJson(`${settings.endpoint}/health`, settings.token);
    updateStatus(formatHealth(health, settings.endpoint));
  } catch (error) {
    updateStatus({
      text: "$(warning) Token --",
      tooltip: `Who Eats Token is not reachable: ${error.message}`
    });
    if (manual) vscode.window.showWarningMessage(`Who Eats Token is not reachable: ${error.message}`);
  } finally {
    scheduleRefresh(settings.refreshMs);
  }
}

async function copySnapshot() {
  const settings = readSettings();
  const snapshot = await requestJson(`${settings.endpoint}/snapshot`, settings.token);
  const text = JSON.stringify(snapshot || {}, null, 2);
  await vscode.env.clipboard.writeText(text);
  vscode.window.showInformationMessage("Who Eats Token snapshot copied.");
}

async function openSettings() {
  await vscode.commands.executeCommand("workbench.action.openSettings", "whoEatsToken");
}

function scheduleRefresh(delayMs) {
  clearTimeout(refreshTimer);
  if (disposed) return;
  refreshTimer = setTimeout(() => refreshNow(false), delayMs);
}

function readSettings() {
  const config = vscode.workspace.getConfiguration("whoEatsToken");
  const endpoint = normalizeEndpoint(config.get("endpoint", DEFAULT_ENDPOINT));
  const refreshSeconds = Number(config.get("refreshSeconds", 15));
  const configuredToken = String(config.get("token", "") || "").trim();
  return {
    enabled: Boolean(config.get("enabled", true)),
    endpoint,
    token: configuredToken || readDefaultLocalToken(),
    refreshMs: Math.min(120000, Math.max(5000, Math.round(refreshSeconds * 1000)))
  };
}

function formatHealth(health, endpoint) {
  const providerHealth = health?.providerHealth || {};
  const providers = Array.isArray(providerHealth.providers) ? providerHealth.providers : [];
  const summary = providerHealth.summary || {};
  if (providers.length === 0) {
    return {
      text: "$(pulse) Token --",
      tooltip: "Who Eats Token is running, but no provider health is available yet."
    };
  }

  const primaryProvider = providers.find((provider) => numberOrNull(provider.lowestRemainingPercent) !== null) || providers[0];
  const primary = numberOrNull(primaryProvider.primaryRemainingPercent ?? primaryProvider.tokenPlanRemainingPercent ?? primaryProvider.contextRemainingPercent);
  const secondary = numberOrNull(primaryProvider.secondaryRemainingPercent);
  const name = primaryProvider.name || primaryProvider.id || "Token";

  const parts = [];
  if (primary !== null) parts.push(`5h ${primary}%`);
  if (secondary !== null) parts.push(`7d ${secondary}%`);
  if (parts.length === 0 && Number.isFinite(primaryProvider.todayTokens)) {
    parts.push(`today ${formatCompact(primaryProvider.todayTokens)}`);
  }

  return {
    text: `$(pulse) ${parts.length ? parts.join(" ") : `${providers.length} sources`}`,
    tooltip: [
      `Who Eats Token: ${name}`,
      `Status: ${primaryProvider.status || "unknown"}`,
      `Providers: ${summary.total ?? providers.length}`,
      `Attention: ${summary.attention ?? 0}`,
      `Events: ${health.eventCount ?? "unknown"}`,
      `Endpoint: ${endpoint}`
    ].join("\n")
  };
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function normalizeEndpoint(value) {
  const text = String(value || DEFAULT_ENDPOINT).trim().replace(/\/+$/, "");
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(text)) return text;
  return DEFAULT_ENDPOINT;
}

function readDefaultLocalToken() {
  if (process.env.WHO_EATS_TOKEN_API_TOKEN) return process.env.WHO_EATS_TOKEN_API_TOKEN;
  try {
    return fs.readFileSync(getDefaultTokenPath(), "utf8").trim();
  } catch {
    return "";
  }
}

function getDefaultTokenPath() {
  if (process.platform === "win32") {
    const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(base, "who-eats-token", "api-token.txt");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "who-eats-token", "api-token.txt");
  }
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "who-eats-token", "api-token.txt");
}

function requestJson(url, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? https : http;
    const request = client.request(parsed, {
      method: "GET",
      timeout: REQUEST_TIMEOUT_MS,
      headers: token ? { "X-Who-Eats-Token": token } : {}
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(text || "{}"));
        } catch {
          reject(new Error("Invalid JSON response"));
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", reject);
    request.end();
  });
}

function updateStatus({ text, tooltip }) {
  if (!statusItem) return;
  statusItem.text = text;
  statusItem.tooltip = tooltip;
}

function formatCompact(value) {
  const number = Number(value) || 0;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return String(Math.round(number));
}

module.exports = {
  activate,
  deactivate
};
