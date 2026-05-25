import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = path.join(root, "adapters", "browser-extension");

await testServiceWorkerRuntime();
await testOptionsRuntime();

console.log("Browser extension runtime checks passed.");

async function testServiceWorkerRuntime() {
  const source = fs.readFileSync(path.join(extensionDir, "service-worker.js"), "utf8");
  const requests = [];
  const listeners = {};
  let storedSettings = {
    enabled: true,
    endpoint: "http://127.0.0.1:17667",
    token: "browser-token"
  };

  const context = {
    URL,
    fetch: async (url, init = {}) => {
      const parsed = new URL(String(url));
      const request = {
        path: parsed.pathname,
        method: init.method || "GET",
        headers: init.headers || {},
        body: init.body ? JSON.parse(init.body) : null
      };
      requests.push(request);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(responseForPath(request.path))
      };
    },
    chrome: {
      runtime: {
        onInstalled: {
          addListener(callback) {
            listeners.installed = callback;
          }
        },
        onMessage: {
          addListener(callback) {
            listeners.message = callback;
          }
        }
      },
      storage: {
        local: {
          get(defaults, callback) {
            callback({ ...defaults, ...storedSettings });
          },
          set(nextSettings, callback = () => {}) {
            storedSettings = { ...storedSettings, ...nextSettings };
            callback();
          }
        }
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "service-worker.js" });

  listeners.installed();
  assert.equal(storedSettings.endpoint, "http://127.0.0.1:17667");
  assert.equal(storedSettings.token, "browser-token");

  const ping = await dispatch(listeners.message, {
    type: "WHO_EATS_TOKEN_PING"
  }, {
    url: "https://hermes.example/chat",
    tab: { title: "Hermes" }
  });
  assert.equal(ping.ok, true);
  assert.equal(ping.body.providerHealth.summary.total, 2);
  assert.equal(requests.at(-1).path, "/health");
  assert.equal(requests.at(-1).method, "GET");
  assert.equal(requests.at(-1).headers["X-Who-Eats-Token"], "browser-token");

  const overlay = await dispatch(listeners.message, {
    type: "WHO_EATS_TOKEN_OVERLAYS",
    payload: {
      overlays: [
        {
          type: "content-interactive",
          label: "send",
          bounds: { x: 1, y: 2, width: 3, height: 4 }
        }
      ]
    }
  }, {
    url: "https://hermes.example/chat",
    tab: { title: "Hermes" }
  });
  assert.equal(overlay.ok, true);
  assert.equal(requests.at(-1).path, "/overlays");
  assert.equal(requests.at(-1).body.source, "browser-extension:hermes.example");
  assert.equal(requests.at(-1).body.title, "Hermes");

  const usage = await dispatch(listeners.message, {
    type: "WHO_EATS_TOKEN_USAGE",
    payload: {
      provider: "hermes",
      model: "mimo-v2.5-pro",
      input_tokens: 10,
      output_tokens: 2,
      prompt: "do not forward prompt text",
      completion: "do not forward completion text",
      apiKey: "do not forward secret",
      metadata: {
        prompt: "do not forward metadata prompt",
        harmless: "also stripped because browser pages are untrusted"
      }
    }
  }, {
    url: "https://hermes.example/chat"
  });
  assert.equal(usage.ok, true);
  assert.equal(requests.at(-1).path, "/events");
  assert.equal(requests.at(-1).body.metadata.tabHost, "hermes.example");
  assert.equal(requests.at(-1).body.prompt, undefined);
  assert.equal(requests.at(-1).body.completion, undefined);
  assert.equal(requests.at(-1).body.apiKey, undefined);
  assert.deepEqual(Object.keys(requests.at(-1).body.metadata), ["tabHost"]);

  assert.equal(requests.some((request) => request.path === "/snapshot"), false);
}

async function testOptionsRuntime() {
  const source = fs.readFileSync(path.join(extensionDir, "options.js"), "utf8");
  const elements = new Map();
  const messages = [];
  let savedSettings = null;

  const context = {
    document: {
      querySelector(selector) {
        if (!elements.has(selector)) elements.set(selector, createElement());
        return elements.get(selector);
      }
    },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          messages.push(message);
          callback({
            ok: true,
            body: {
              providerHealth: {
                summary: {
                  total: 2,
                  attention: 1
                },
                providers: [{ id: "codex" }, { id: "hermes" }]
              }
            }
          });
        }
      },
      storage: {
        local: {
          get(defaults, callback) {
            callback({
              ...defaults,
              enabled: true,
              endpoint: "http://127.0.0.1:17667",
              token: "browser-token"
            });
          },
          set(settings, callback = () => {}) {
            savedSettings = settings;
            callback();
          }
        }
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "options.js" });

  assert.equal(elements.get("#enabled").checked, true);
  assert.equal(elements.get("#endpoint").value, "http://127.0.0.1:17667");
  assert.equal(elements.get("#token").value, "browser-token");

  elements.get("#test").listeners.click();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "WHO_EATS_TOKEN_PING");
  assert.equal(elements.get("#status").textContent, "Connected: 2 providers, 1 need attention");

  elements.get("#endpoint").value = "http://evil.example";
  elements.get("#save").listeners.click();
  assert.equal(savedSettings.endpoint, "http://127.0.0.1:17667");
  assert.equal(savedSettings.token, "browser-token");
}

function dispatch(listener, message, sender) {
  return new Promise((resolve, reject) => {
    try {
      const keepAlive = listener(message, sender, resolve);
      assert.equal(keepAlive, true);
    } catch (error) {
      reject(error);
    }
  });
}

function responseForPath(pathname) {
  if (pathname === "/health") {
    return {
      ok: true,
      service: "who-eats-token",
      providerHealth: {
        summary: { total: 2, attention: 1 },
        providers: [
          { id: "codex", status: "live" },
          { id: "hermes", status: "delayed" }
        ]
      }
    };
  }
  return { ok: true, accepted: 1 };
}

function createElement() {
  return {
    checked: false,
    value: "",
    textContent: "",
    listeners: {},
    addEventListener(eventName, callback) {
      this.listeners[eventName] = callback;
    }
  };
}
