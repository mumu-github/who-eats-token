import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionPath = path.join(root, "adapters", "vscode-extension", "extension.js");

const requests = [];
const server = http.createServer((req, res) => {
  requests.push({
    path: req.url,
    token: req.headers["x-who-eats-token"] || ""
  });

  if (req.url === "/health") {
    writeJson(res, {
      ok: true,
      service: "who-eats-token",
      eventCount: 7,
      providerHealth: {
        summary: {
          total: 2,
          attention: 0
        },
        providers: [
          {
            id: "codex",
            name: "Codex",
            status: "live",
            primaryRemainingPercent: 85,
            secondaryRemainingPercent: 80,
            lowestRemainingPercent: 80
          },
          {
            id: "hermes",
            name: "Hermes",
            status: "delayed",
            tokenPlanRemainingPercent: 72,
            lowestRemainingPercent: 72
          }
        ]
      }
    });
    return;
  }

  if (req.url === "/snapshot") {
    writeJson(res, {
      collectedAt: "2026-05-24T12:00:00.000Z",
      providers: [{ id: "codex", name: "Codex" }]
    });
    return;
  }

  writeJson(res, { ok: false, error: "not found" }, 404);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

try {
  const { port } = server.address();
  const endpoint = `http://127.0.0.1:${port}`;
  const commands = new Map();
  const statusItem = createStatusItem();
  const context = {
    subscriptions: []
  };
  let clipboardText = "";
  const vscode = {
    StatusBarAlignment: { Right: 1 },
    window: {
      createStatusBarItem() {
        return statusItem;
      },
      showWarningMessage(message) {
        vscode.lastWarning = message;
      },
      showInformationMessage(message) {
        vscode.lastInfo = message;
      }
    },
    commands: {
      registerCommand(commandId, callback) {
        commands.set(commandId, callback);
        return { dispose() {} };
      },
      async executeCommand(commandId, argument) {
        vscode.lastExecutedCommand = { commandId, argument };
      }
    },
    workspace: {
      getConfiguration(namespace) {
        assert.equal(namespace, "whoEatsToken");
        return {
          get(key, fallback) {
            return {
              enabled: true,
              endpoint,
              token: "vscode-token",
              refreshSeconds: 15
            }[key] ?? fallback;
          }
        };
      },
      onDidChangeConfiguration() {
        return { dispose() {} };
      }
    },
    env: {
      clipboard: {
        async writeText(text) {
          clipboardText = text;
        }
      }
    }
  };

  const module = { exports: {} };
  const source = fs.readFileSync(extensionPath, "utf8");
  vm.runInNewContext(source, {
    require: (moduleName) => moduleName === "vscode" ? vscode : require(moduleName),
    module,
    exports: module.exports,
    process,
    Buffer,
    URL,
    console,
    setTimeout: () => ({ fakeTimer: true }),
    clearTimeout: () => {}
  }, {
    filename: "extension.js"
  });

  module.exports.activate(context);
  assert.equal(statusItem.shown, true);
  assert.equal(statusItem.tooltip, "Who Eats Token: waiting for local health.");
  assert.ok(commands.has("whoEatsToken.refresh"));
  assert.ok(commands.has("whoEatsToken.copySnapshot"));

  await commands.get("whoEatsToken.refresh")();
  assert.deepEqual(requests.map((request) => request.path), ["/health"]);
  assert.equal(requests[0].token, "vscode-token");
  assert.equal(statusItem.text, "$(pulse) 5h 85% 7d 80%");
  assert.match(statusItem.tooltip, /Who Eats Token: Codex/);
  assert.match(statusItem.tooltip, /Endpoint: http:\/\/127\.0\.0\.1:\d+/);

  await commands.get("whoEatsToken.copySnapshot")();
  assert.deepEqual(requests.map((request) => request.path), ["/health", "/snapshot"]);
  assert.match(clipboardText, /"providers"/);
  assert.equal(vscode.lastInfo, "Who Eats Token snapshot copied.");

  module.exports.deactivate();
  console.log("VS Code adapter runtime checks passed.");
} finally {
  await new Promise((resolve) => server.close(resolve));
}

function createStatusItem() {
  return {
    text: "",
    tooltip: "",
    command: "",
    shown: false,
    show() {
      this.shown = true;
    },
    dispose() {}
  };
}

function writeJson(res, payload, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}
