import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = path.join(root, "adapters", "browser-extension");
const args = parseArgs(process.argv.slice(2));
const hosts = selectHosts(args.browser);
const results = [];

if (!fs.existsSync(path.join(extensionDir, "manifest.json"))) {
  console.error("Missing browser extension manifest.");
  process.exit(1);
}

for (const host of hosts) {
  const executable = findExecutable(host.candidates);
  if (!executable) {
    results.push({
      name: host.name,
      ok: false,
      skipped: "host-not-found",
      requiredFailure: true,
      candidateCount: host.candidates.length
    });
    continue;
  }

  results.push(await smokeHost({
    ...host,
    executable,
    headed: args.headed
  }));
}

const report = {
  ok: results.every((result) => result.ok || result.skipped),
  checkedAt: new Date().toISOString(),
  headed: args.headed,
  results
};

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report);
}

if (args.require && results.some((result) => !result.ok && result.requiredFailure !== false)) {
  process.exitCode = 1;
}

async function smokeHost({ name, executable, headed }) {
  const remotePort = await getFreePort();
  const userDataDir = path.join(os.tmpdir(), `who-eats-token-${slug(name)}-profile-${process.pid}-${Date.now()}`);
  let browserVersion = null;
  const browserArgs = [
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${remotePort}`,
    `--disable-extensions-except=${extensionDir}`,
    `--load-extension=${extensionDir}`,
    "--enable-unsafe-extension-debugging",
    "--disable-features=DisableLoadExtensionCommandLineSwitch",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "about:blank"
  ];

  if (!headed) {
    browserArgs.unshift("--disable-gpu");
    browserArgs.unshift("--headless=new");
  }

  let child = null;
  const stderrChunks = [];
  try {
    child = spawn(executable, browserArgs, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: !headed
    });
    child.stderr?.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
    child.on("exit", (code, signal) => {
      child.exitCode = code;
      child.exitSignal = signal;
    });

    browserVersion = await waitForDevTools(remotePort, 15_000, child);
    await delay(2500);

    const targets = await readDevToolsTargets(remotePort);
    const preferenceEvidence = readExtensionPreferenceEvidence(userDataDir);
    const extensionTarget = findExtensionTarget(targets);
    const devToolsEvidence = Boolean(extensionTarget);
    const extensionId = extensionIdFromTarget(extensionTarget);

    let optionsHealth = null;
    if (args.testOptionsHealth) {
      assert.ok(extensionId, `${name} extension id was not discoverable for Options /health test.`);
      optionsHealth = await testOptionsHealth({
        port: remotePort,
        extensionId,
        endpoint: args.endpoint,
        tokenInfo: readLocalTokenInfo()
      });
      assert.ok(optionsHealth.ok, `${name} Options /health failed: ${optionsHealth.statusLine || optionsHealth.error || "unknown"}`);
    }

    assert.ok(
      preferenceEvidence.found || devToolsEvidence,
      `${name} did not report the Who Eats Token extension as loaded.`
    );

    return {
      name,
      ok: true,
      executable,
      remotePort,
      extensionLoaded: true,
      extensionId,
      optionsHealth,
      evidence: {
        preferences: preferenceEvidence,
        devToolsTargetCount: targets.length,
        devToolsExtensionTarget: devToolsEvidence
      }
    };
  } catch (error) {
    const targets = await readDevToolsTargets(remotePort).catch(() => []);
    const preferenceEvidence = readExtensionPreferenceEvidence(userDataDir);
    const unsupportedChromeAutomation = isChromeCommandLineExtensionDisabled({
      name,
      browserVersion,
      error
    });
    return {
      name,
      ok: false,
      skipped: unsupportedChromeAutomation ? "chrome-137-command-line-extension-disabled" : undefined,
      requiredFailure: unsupportedChromeAutomation ? false : true,
      executable,
      error: error.message,
      profile: args.keepProfiles ? userDataDir : undefined,
      evidence: compactFailureEvidence({
        preferences: preferenceEvidence,
        targets,
        stderr: stderrTail(stderrChunks)
      })
    };
  } finally {
    await stopChild(child);
    cleanupDir(userDataDir);
  }
}

function findExtensionTarget(targets) {
  return targets.find((target) =>
      /chrome-extension:\/\//.test(target.url || "") &&
      /service-worker\.js|options\.html/.test(target.url || "")
    );
}

function extensionIdFromTarget(target) {
  const match = String(target?.url || "").match(/chrome-extension:\/\/([^/]+)/);
  return match ? match[1] : null;
}

function isChromeCommandLineExtensionDisabled({ name, browserVersion, error }) {
  if (name !== "Chrome") return false;
  if (!/did not report the Who Eats Token extension as loaded/.test(error.message)) return false;
  const major = chromeMajorVersion(browserVersion?.Browser);
  return major !== null && major >= 137;
}

function chromeMajorVersion(value) {
  const match = String(value || "").match(/Chrome\/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function compactFailureEvidence({ preferences, targets, stderr }) {
  const evidence = {
    preferences,
    devToolsTargetCount: targets.length,
    stderrTail: stderr
  };
  if (args.verbose) {
    evidence.devToolsTargets = targets.map((target) => ({
      type: target.type,
      title: target.title,
      url: target.url
    }));
  }
  return evidence;
}

function stderrTail(chunks) {
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return "";
  return text.slice(-1200);
}

function readExtensionPreferenceEvidence(userDataDir) {
  const preferencesPath = path.join(userDataDir, "Default", "Preferences");
  if (!fs.existsSync(preferencesPath)) {
    return { found: false, preferencesPath };
  }

  try {
    const preferences = JSON.parse(fs.readFileSync(preferencesPath, "utf8"));
    const settings = preferences.extensions?.settings || {};
    const entries = Object.entries(settings)
      .map(([id, value]) => ({
        id,
        name: value?.manifest?.name || "",
        path: value?.path || "",
        state: value?.state
      }))
      .filter((entry) =>
        entry.name === "Who Eats Token Adapter" ||
        normalizePath(entry.path).includes(normalizePath(extensionDir))
      );

    return {
      found: entries.length > 0,
      entries
    };
  } catch (error) {
    return {
      found: false,
      error: error.message
    };
  }
}

async function waitForDevTools(port, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error(`Browser exited early with code ${child.exitCode}.`);
    }
    try {
      const version = await requestJson(port, "/json/version");
      if (version.Browser) return version;
    } catch (error) {
      lastError = error;
      await delay(300);
    }
  }
  throw new Error(`Timed out waiting for DevTools endpoint: ${lastError?.message || "unknown"}`);
}

function readDevToolsTargets(port) {
  return requestJson(port, "/json/list");
}

async function testOptionsHealth({ port, extensionId, endpoint, tokenInfo }) {
  assert.ok(tokenInfo.token, "Missing local API token for Options /health test.");
  const optionsUrl = `chrome-extension://${extensionId}/options.html`;
  const target = await openDevToolsTarget(port, optionsUrl);
  const value = await evaluateDevTools(target.webSocketDebuggerUrl, buildOptionsHealthExpression({
    endpoint,
    token: tokenInfo.token
  }));
  return {
    ok: Boolean(value?.ok),
    status: value?.status ?? null,
    statusLine: String(value?.statusLine || ""),
    providerCount: value?.providerCount ?? null,
    attention: value?.attention ?? null,
    tokenSource: tokenInfo.source
  };
}

async function openDevToolsTarget(port, url) {
  const route = `/json/new?${encodeURIComponent(url)}`;
  try {
    return await requestJson(port, route, "PUT");
  } catch {
    return requestJson(port, route, "GET");
  }
}

function buildOptionsHealthExpression({ endpoint, token }) {
  return `
    (async () => {
      const endpoint = ${JSON.stringify(endpoint)};
      const token = ${JSON.stringify(token)};
      await new Promise((resolve) => chrome.storage.local.set({ enabled: true, endpoint, token }, resolve));
      const result = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "WHO_EATS_TOKEN_PING" }, (response) => {
          resolve({
            response,
            runtimeError: chrome.runtime.lastError ? chrome.runtime.lastError.message : null
          });
        });
      });
      const response = result.response || {};
      const summary = response.body && response.body.providerHealth ? response.body.providerHealth.summary || {} : {};
      const statusLine = response.ok
        ? "Connected: " + (summary.total ?? 0) + " providers, " + (summary.attention ?? 0) + " need attention"
        : "Connection failed: " + (result.runtimeError || response.error || response.status || "unknown");
      const statusNode = document.querySelector("#status");
      if (statusNode) statusNode.textContent = statusLine;
      return {
        ok: Boolean(response.ok),
        status: response.status || null,
        statusLine,
        providerCount: summary.total ?? null,
        attention: summary.attention ?? null
      };
    })()
  `;
}

function evaluateDevTools(webSocketDebuggerUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(webSocketDebuggerUrl);
    const timeout = setTimeout(() => {
      try {
        ws.close();
      } catch {}
      reject(new Error("Timed out waiting for Options /health evaluation."));
    }, 10_000);

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: {
          expression,
          awaitPromise: true,
          returnByValue: true
        }
      }));
    });

    ws.addEventListener("message", (event) => {
      const payload = JSON.parse(String(event.data));
      if (payload.id !== 1) return;
      clearTimeout(timeout);
      try {
        ws.close();
      } catch {}
      if (payload.error) {
        reject(new Error(payload.error.message || "DevTools evaluation failed."));
        return;
      }
      if (payload.result?.exceptionDetails) {
        reject(new Error(payload.result.exceptionDetails.text || "Options /health evaluation threw."));
        return;
      }
      resolve(payload.result?.result?.value || null);
    });

    ws.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("Could not connect to DevTools target."));
    });
  });
}

function readLocalTokenInfo() {
  const fromEnv = String(process.env.WHO_EATS_TOKEN_API_TOKEN || "").trim();
  if (fromEnv) return { token: fromEnv, source: "WHO_EATS_TOKEN_API_TOKEN" };
  const tokenPath = defaultTokenPath();
  const token = readTokenFile(tokenPath);
  return {
    token,
    source: token ? "userData api-token.txt" : "missing"
  };
}

function defaultTokenPath() {
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

function readTokenFile(tokenPath) {
  try {
    const token = fs.readFileSync(tokenPath, "utf8").trim();
    return token.length >= 32 ? token : "";
  } catch {
    return "";
  }
}

function requestJson(port, route, method = "GET") {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: route,
      method,
      timeout: 2000
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", reject);
    request.end();
  });
}

async function getFreePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function stopChild(child) {
  if (!child) return;
  if (child.exitCode !== null && child.exitCode !== undefined) return;
  try {
    child.kill();
  } catch {}
  await delay(800);

  if (process.platform === "win32") {
    try {
      execFileSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        timeout: 5000,
        windowsHide: true
      });
    } catch {}
  }
}

function cleanupDir(dir) {
  if (args.keepProfiles) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

function selectHosts(browser) {
  const all = [
    { name: "Chrome", candidates: browserCandidates("chrome") },
    { name: "Edge", candidates: browserCandidates("edge") }
  ];
  if (browser === "all") return all;
  return all.filter((host) => slug(host.name) === browser);
}

function browserCandidates(name) {
  const home = os.homedir();
  const pathCandidates = executablePathCandidates(name === "chrome" ? ["chrome.exe", "chrome"] : ["msedge.exe", "microsoft-edge"]);
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    if (name === "chrome") {
      return [
        ...pathCandidates,
        path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe")
      ];
    }
    return [
      ...pathCandidates,
      path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe")
    ];
  }

  if (process.platform === "darwin") {
    if (name === "chrome") return [...pathCandidates, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
    return [...pathCandidates, "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"];
  }

  return name === "chrome"
    ? [...pathCandidates, "/usr/bin/google-chrome", "/usr/bin/chromium"]
    : [...pathCandidates, "/usr/bin/microsoft-edge"];
}

function executablePathCandidates(names) {
  const pathValue = process.env.PATH || process.env.Path || "";
  return pathValue
    .split(path.delimiter)
    .filter(Boolean)
    .flatMap((entry) => names.map((name) => path.join(entry, name)));
}

function findExecutable(candidates) {
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function printReport(report) {
  console.log("# Browser Host Smoke");
  console.log("");
  console.log(`Headed: ${report.headed ? "yes" : "no"}`);
  for (const result of report.results) {
    if (result.ok) {
      const health = result.optionsHealth?.ok ? ", Options /health OK" : "";
      console.log(`- OK ${result.name}: extension loaded via ${result.executable}${health}`);
    } else if (result.skipped) {
      console.log(`- SKIP ${result.name}: ${result.skipped}`);
    } else {
      console.log(`- FAIL ${result.name}: ${result.error}`);
    }
  }
}

function parseArgs(argv) {
  const parsed = {
    browser: "all",
    endpoint: "http://127.0.0.1:17667",
    headed: argv.includes("--headed"),
    keepProfiles: argv.includes("--keep-profiles"),
    json: argv.includes("--json"),
    require: argv.includes("--require"),
    testOptionsHealth: argv.includes("--test-options-health")
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--browser") {
      parsed.browser = normalizeBrowser(argv[index + 1]);
      index += 1;
    } else if (value.startsWith("--browser=")) {
      parsed.browser = normalizeBrowser(value.slice("--browser=".length));
    } else if (value === "--endpoint") {
      parsed.endpoint = normalizeEndpoint(argv[index + 1]);
      index += 1;
    } else if (value.startsWith("--endpoint=")) {
      parsed.endpoint = normalizeEndpoint(value.slice("--endpoint=".length));
    }
  }
  return parsed;
}

function normalizeBrowser(value) {
  const text = String(value || "").toLowerCase();
  if (["chrome", "edge", "all"].includes(text)) return text;
  return "all";
}

function normalizeEndpoint(value) {
  const text = String(value || "").trim().replace(/\/+$/, "");
  if (/^https?:\/\/(127\.0\.0\.1|localhost):17667$/i.test(text)) return text;
  return "http://127.0.0.1:17667";
}

function slug(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "-");
}

function normalizePath(value) {
  return String(value || "").replaceAll("\\", "/").toLowerCase();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
