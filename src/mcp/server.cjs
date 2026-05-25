const http = require("node:http");
const readline = require("node:readline");
const { summarizeProviderHealth } = require("../protocol/provider-health.cjs");
const { getLocalApiAccess } = require("../security/local-token.cjs");
const { getDefaultUserDataPath } = require("../system/paths.cjs");

const SERVER_NAME = "who-eats-token";
const SERVER_VERSION = "0.1.0";
const DEFAULT_BASE_URL = "http://127.0.0.1:17667";
const JSONRPC_VERSION = "2.0";

function createMcpServer({
  input = process.stdin,
  output = process.stdout,
  baseUrl = process.env.WHO_EATS_TOKEN_BASE_URL || DEFAULT_BASE_URL,
  accessToken = getLocalApiAccess(getDefaultUserDataPath()).token
} = {}) {
  const state = {
    initialized: false,
    baseUrl,
    accessToken
  };

  const rl = readline.createInterface({
    input,
    crlfDelay: Infinity,
    terminal: false
  });

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let message;
    try {
      message = JSON.parse(trimmed);
    } catch {
      writeMessage(output, buildError(null, -32700, "Parse error"));
      return;
    }

    if (message.id === undefined || message.id === null) {
      handleNotification(message, state);
      return;
    }

    try {
      const result = await handleRequest(message, state);
      writeMessage(output, { jsonrpc: JSONRPC_VERSION, id: message.id, result });
    } catch (error) {
      writeMessage(output, buildError(message.id, error.code || -32603, error.message || "Internal error"));
    }
  });

  return {
    close: () => rl.close()
  };
}

async function handleRequest(message, state) {
  switch (message.method) {
    case "initialize":
      state.initialized = true;
      return {
        protocolVersion: message.params?.protocolVersion || "2025-06-18",
        capabilities: {
          tools: {},
          resources: {}
        },
        serverInfo: {
          name: SERVER_NAME,
          version: SERVER_VERSION
        },
        instructions: "Use this server to read local LLM token capacity and post usage events to Who Eats Token."
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: getTools() };
    case "tools/call":
      return callTool(message.params || {}, state);
    case "resources/list":
      return {
        resources: [
          {
            uri: "who-eats-token://snapshot",
            name: "Who Eats Token Snapshot",
            description: "Current local token capacity snapshot from the desktop app.",
            mimeType: "application/json"
          }
        ]
      };
    case "resources/read":
      return readResource(message.params || {}, state);
    default:
      throw mcpError(-32601, `Method not found: ${message.method}`);
  }
}

function handleNotification(message, state) {
  if (message.method === "notifications/initialized") {
    state.initialized = true;
  }
}

function getTools() {
  return [
    {
      name: "get_token_snapshot",
      description: "Read the current Who Eats Token snapshot from the local desktop app.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    },
    {
      name: "list_provider_health",
      description: "Summarize provider health, live/missing states, and current capacity signals.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    },
    {
      name: "post_usage_event",
      description: "Post a who-eats-token.usage.v1 event to the local desktop app.",
      inputSchema: {
        type: "object",
        properties: {
          provider: { type: "string" },
          tool: { type: "string" },
          model: { type: "string" },
          input_tokens: { type: "number", minimum: 0 },
          output_tokens: { type: "number", minimum: 0 },
          total_tokens: { type: "number", minimum: 0 },
          cost_usd: { type: "number", minimum: 0 },
          confidence: {
            type: "string",
            enum: ["reported", "estimated", "derived", "manual", "unknown"]
          },
          source: { type: "string" },
          rate_limits: { type: "object" },
          context: { type: "object" },
          metadata: { type: "object" }
        },
        additionalProperties: true
      }
    }
  ];
}

async function callTool(params, state) {
  const name = params.name;
  const args = params.arguments || {};
  if (name === "get_token_snapshot") {
    const snapshot = await fetchJson(state, "/snapshot");
    return jsonToolResult(snapshot);
  }

  if (name === "list_provider_health") {
    const snapshot = await fetchJson(state, "/snapshot");
    return jsonToolResult(summarizeProviderHealth(snapshot));
  }

  if (name === "post_usage_event") {
    const result = await postJson(state, "/events", {
      schema: "who-eats-token.usage.v1",
      source: "mcp-server",
      confidence: "reported",
      ...args
    });
    return jsonToolResult(result);
  }

  throw mcpError(-32602, `Unknown tool: ${name}`);
}

async function readResource(params, state) {
  if (params.uri !== "who-eats-token://snapshot") {
    throw mcpError(-32602, `Unknown resource: ${params.uri}`);
  }

  const snapshot = await fetchJson(state, "/snapshot");
  return {
    contents: [
      {
        uri: params.uri,
        mimeType: "application/json",
        text: JSON.stringify(snapshot, null, 2)
      }
    ]
  };
}

function fetchJson(state, path) {
  return requestJson(state, "GET", path);
}

function postJson(state, path, payload) {
  return requestJson(state, "POST", path, payload);
}

function requestJson(state, method, path, payload = null) {
  const target = new URL(path, state.baseUrl);
  const body = payload ? JSON.stringify(payload) : null;
  const headers = {
    "Accept": "application/json",
    ...(state.accessToken ? { "X-Who-Eats-Token": state.accessToken } : {})
  };
  if (body) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = Buffer.byteLength(body);
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method,
        headers,
        timeout: 2500
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
          if (raw.length > 1024 * 1024) {
            req.destroy(new Error("Local API response is too large."));
          }
        });
        res.on("end", () => {
          const parsed = parseJson(raw);
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(mcpError(-32000, parsed?.error || `Local API returned HTTP ${res.statusCode}`));
            return;
          }
          resolve(parsed);
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Local API request timed out.")));
    req.on("error", (error) => reject(mcpError(-32000, `Who Eats Token local API unavailable: ${error.message}`)));
    if (body) req.write(body);
    req.end();
  });
}

function parseJson(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return { raw };
  }
}

function jsonToolResult(value) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

function writeMessage(output, message) {
  output.write(`${JSON.stringify(message)}\n`);
}

function buildError(id, code, message) {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    error: { code, message }
  };
}

function mcpError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

module.exports = {
  createMcpServer,
  summarizeProviderHealth
};
