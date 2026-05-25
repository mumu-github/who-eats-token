import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const DEFAULT_TIMEOUT_MS = 25_000;
const SAMPLE_WINDOW_MS = 2500;
const DEFAULT_MAX_WORKING_SET_MB = 450;
const DEFAULT_MAX_CPU_PERCENT = 35;

export async function runPackagedSmoke({
  executable,
  packageHint,
  platformName,
  model,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  if (!fs.existsSync(executable)) {
    console.error(`Missing packaged app. Run \`${packageHint}\` first.`);
    process.exit(1);
  }

  const ingestPort = await getFreePort();
  const bridgePort = await getFreePort();
  const token = `smoke-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const userDataDir = path.join(os.tmpdir(), `who-eats-token-smoke-${process.pid}-${Date.now()}`);
  const maxWorkingSetMb = readNumberEnv("WHO_EATS_TOKEN_SMOKE_MAX_RSS_MB", DEFAULT_MAX_WORKING_SET_MB);
  const maxCpuPercent = readNumberEnv("WHO_EATS_TOKEN_SMOKE_MAX_CPU_PERCENT", DEFAULT_MAX_CPU_PERCENT);
  let child = null;
  let stopped = false;

  try {
    child = spawn(executable, ["--no-sandbox"], {
      cwd: path.dirname(executable),
      env: {
        ...process.env,
        WHO_EATS_TOKEN_API_TOKEN: token,
        WHO_EATS_TOKEN_USER_DATA_DIR: userDataDir,
        WHO_EATS_TOKEN_INGEST_PORT: String(ingestPort),
        WHO_EATS_TOKEN_HERMES_BRIDGE_PORT: String(bridgePort),
        WHO_EATS_TOKEN_DEBUG_HUD: "0",
        WHO_EATS_TOKEN_DISABLE_GPU: "1",
        WHO_EATS_TOKEN_HEADLESS_SMOKE: "1"
      },
      stdio: "ignore",
      detached: false,
      windowsHide: true
    });

    child.on("exit", (code, signal) => {
      child.exitCode = code;
      child.exitSignal = signal;
    });

    const initialSnapshot = await waitForFullSnapshot(ingestPort, token, timeoutMs, child);
    validateInitialSnapshot(initialSnapshot, ingestPort, bridgePort);
    const initialHealth = await getJson(ingestPort, "/health", token, {
      origin: localOrigin(ingestPort)
    });
    validateInitialHealth(initialHealth, ingestPort);
    await expectBrowserAuthRejection(ingestPort);

    const bridgeHealth = await getJson(bridgePort, "/health", token, {
      origin: localOrigin(bridgePort)
    });
    assert.equal(bridgeHealth.ok, true, "Hermes bridge health should return ok=true.");
    assert.equal(bridgeHealth.port, bridgePort, "Hermes bridge should bind the smoke bridge port.");
    assert.match(bridgeHealth.ingestUrl || "", new RegExp(`:${ingestPort}/events$`), "Hermes bridge should target the smoke ingest port.");

    await postOverlayReport(ingestPort, token);
    const overlaySnapshot = await waitForOverlay(ingestPort, token, timeoutMs);
    assert.ok(overlaySnapshot.ingest.overlayCount >= 1, "Full snapshot should expose overlay count from ingest.");

    await postUsageEvent(ingestPort, token, {
      provider: "packaged-smoke",
      tool: "Who Eats Token",
      model,
      input_tokens: 12,
      output_tokens: 4,
      confidence: "reported",
      source: `${platformName}-smoke`,
      rate_limits: {
        primary: {
          remaining_percent: 88,
          window_minutes: 300,
          resets_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
        },
        secondary: {
          remaining_percent: 91,
          window_minutes: 10080,
          resets_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        }
      }
    });

    const afterEvent = await waitForProvider(ingestPort, token, "packaged-smoke", timeoutMs);
    const smokeProvider = afterEvent.providers.find((provider) => provider.id === "packaged-smoke");
    assert.ok(smokeProvider, "Full snapshot should include providers posted through the local API.");
    assert.equal(smokeProvider.latest?.rateLimitsTrust?.status, "live", "Posted rate limits should remain live.");
    assert.equal(smokeProvider.latest?.rateLimits?.primary?.usedPercent, 12, "Posted remaining_percent should normalize to usedPercent.");
    const afterHealth = await getJson(ingestPort, "/health", token, {
      origin: localOrigin(ingestPort)
    });
    assert.ok(
      afterHealth.providerHealth?.providers?.some((provider) => provider.id === "packaged-smoke"),
      "Local health should expose compact provider health for posted providers."
    );

    await delay(1500);
    const firstSample = getProcessSample(child.pid);
    await delay(SAMPLE_WINDOW_MS);
    const secondSample = getProcessSample(child.pid);
    const cpuPercent = getCpuPercent(firstSample, secondSample, SAMPLE_WINDOW_MS);
    assert.ok(secondSample.workingSetMb > 0, "Process working set should be measurable.");
    assert.ok(secondSample.workingSetMb <= maxWorkingSetMb, `Working set ${secondSample.workingSetMb}MB exceeds smoke budget ${maxWorkingSetMb}MB.`);
    assert.ok(cpuPercent <= maxCpuPercent, `CPU ${cpuPercent}% exceeds smoke budget ${maxCpuPercent}%.`);

    assertLocalSecretsAndDebugLogs(userDataDir);

    await stopChild(child);
    stopped = true;
    await waitForPortClosed(ingestPort, timeoutMs);

    console.log(JSON.stringify({
      ok: true,
      platform: platformName,
      pid: child.pid,
      ingestPort,
      bridgePort,
      providerCount: afterEvent.providers.length,
      eventCount: afterEvent.ingest.eventCount,
      overlayCount: afterEvent.ingest.overlayCount,
      workingSetMb: secondSample.workingSetMb,
      cpuPercent
    }, null, 2));
  } finally {
    if (!stopped) await stopChild(child);
    cleanupUserData(userDataDir);
  }
}

function validateInitialSnapshot(snapshot, ingestPort, bridgePort) {
  assert.equal(snapshot.ingest?.port, ingestPort, "Full snapshot should include ingest port.");
  assert.equal(snapshot.ingest?.listening, true, "Ingest server should be listening.");
  assert.equal(snapshot.bridges?.hermes?.port, bridgePort, "Full snapshot should include Hermes bridge status.");
  assert.equal(snapshot.bridges?.hermes?.listening, true, "Hermes bridge should be listening.");
  assert.ok(snapshot.settings?.windows, "Full snapshot should include public window settings.");
  assert.ok(snapshot.settings?.providerRegistry?.length >= 2, "Full snapshot should include provider registry.");
  assert.ok(Number.isFinite(Number(snapshot.system?.memory?.totalBytes)), "Full snapshot should include memory metrics.");
  assert.ok(Number.isFinite(Number(snapshot.system?.memory?.freeBytes)), "Full snapshot should include free memory.");
  assert.ok(Array.isArray(snapshot.providers), "Full snapshot should include provider list.");
  assert.ok(Array.isArray(snapshot.providerHealth?.providers), "Full snapshot should include provider health list.");
  assert.ok(Number.isFinite(Number(snapshot.providerHealth?.summary?.total)), "Full snapshot should include provider health summary.");
}

function validateInitialHealth(health, ingestPort) {
  assert.equal(health.ok, true, "Local health should return ok=true.");
  assert.equal(health.service, "who-eats-token", "Local health should identify the service.");
  assert.equal(health.port, ingestPort, "Local health should bind the smoke ingest port.");
  assert.equal(health.listening, true, "Local health should expose listening=true.");
  assert.equal(health.snapshotAvailable, true, "Local health should report desktop snapshot availability.");
  assert.ok(Array.isArray(health.providerHealth?.providers), "Local health should include compact provider health.");
  assert.ok(Number.isFinite(Number(health.providerHealth?.summary?.total)), "Local health should include provider health summary.");
  assert.equal(Object.hasOwn(health, "settings"), false, "Local health should not expose public settings.");
  assert.equal(Object.hasOwn(health, "providers"), false, "Local health should not expose the full provider list.");
}

async function expectBrowserAuthRejection(port) {
  for (const route of ["/snapshot", "/health"]) {
    const response = await requestJson({
      port,
      route,
      accessToken: "wrong-token",
      method: "GET",
      origin: localOrigin(port),
      allowError: true
    });
    assert.equal(response.statusCode, 401, `Browser-origin ${route} requests must require the local access token.`);
  }
}

async function waitForFullSnapshot(port, accessToken, timeout, child) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child?.exitCode !== undefined && child.exitCode !== null) {
      throw new Error(`Packaged app exited early with code ${child.exitCode}.`);
    }
    try {
      const snapshot = await getJson(port, "/snapshot", accessToken, {
        origin: localOrigin(port)
      });
      if (snapshot.ingest?.port === port) return snapshot;
      throw new Error("Snapshot was not the full desktop snapshot yet.");
    } catch (error) {
      lastError = error;
      await delay(500);
    }
  }
  throw new Error(`Timed out waiting for full /snapshot: ${lastError?.message || "unknown error"}`);
}

async function waitForProvider(port, accessToken, providerId, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const snapshot = await getJson(port, "/snapshot", accessToken, {
      origin: localOrigin(port)
    });
    if (snapshot.providers?.some((provider) => provider.id === providerId)) return snapshot;
    await delay(300);
  }
  throw new Error(`Timed out waiting for provider ${providerId}.`);
}

async function waitForOverlay(port, accessToken, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const snapshot = await getJson(port, "/snapshot", accessToken, {
      origin: localOrigin(port)
    });
    if (snapshot.ingest?.overlayCount >= 1) return snapshot;
    await delay(150);
  }
  throw new Error("Timed out waiting for overlay report.");
}

function getJson(port, route, accessToken, options = {}) {
  return requestJson({ port, route, accessToken, method: "GET", ...options });
}

function postUsageEvent(port, accessToken, body) {
  return requestJson({
    port,
    route: "/events",
    accessToken,
    method: "POST",
    body,
    origin: localOrigin(port)
  });
}

function postOverlayReport(port, accessToken) {
  return requestJson({
    port,
    route: "/overlays",
    accessToken,
    method: "POST",
    origin: localOrigin(port),
    body: {
      source: "packaged-smoke",
      url: "http://127.0.0.1:8648/hermes/chat",
      title: "Hermes",
      overlays: [
        {
          type: "content-interactive",
          label: "发送",
          bounds: { x: 860, y: 620, width: 120, height: 64 }
        }
      ]
    }
  });
}

function requestJson({ port, route, accessToken, method, body, origin = null, allowError = false }) {
  return new Promise((resolve, reject) => {
    const headers = {
      "Content-Type": "application/json",
      "X-Who-Eats-Token": accessToken
    };
    if (origin) headers.Origin = origin;

    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: route,
      method,
      timeout: 2000,
      headers
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed = {};
        try {
          parsed = JSON.parse(text || "{}");
        } catch {
          if (!allowError) {
            reject(new Error("Invalid JSON response."));
            return;
          }
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          if (allowError) {
            resolve({ statusCode: response.statusCode, body: parsed, text });
            return;
          }
          reject(new Error(`HTTP ${response.statusCode}: ${text.slice(0, 200)}`));
          return;
        }
        resolve(parsed);
      });
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", reject);
    if (body !== undefined) request.write(JSON.stringify(body));
    request.end();
  });
}

function getProcessSample(pid) {
  if (process.platform === "win32") return getWindowsProcessSample(pid);
  return getPosixProcessSample(pid);
}

function getWindowsProcessSample(pid) {
  const command = [
    "$p = Get-Process -Id",
    String(Number(pid)),
    "-ErrorAction Stop;",
    "[pscustomobject]@{",
    "Cpu=$p.CPU;",
    "WorkingSet64=$p.WorkingSet64",
    "} | ConvertTo-Json -Compress"
  ].join(" ");
  const raw = execFileSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true
  }).trim();
  const parsed = JSON.parse(raw);
  return {
    cpuSeconds: Number(parsed.Cpu || 0),
    workingSetMb: Math.round(Number(parsed.WorkingSet64 || 0) / 1024 / 1024)
  };
}

function getPosixProcessSample(pid) {
  const raw = execFileSync("ps", ["-o", "rss=,%cpu=", "-p", String(Number(pid))], {
    encoding: "utf8",
    timeout: 5000
  }).trim();
  const [rssKb = "0", cpuPercent = "0"] = raw.split(/\s+/);
  return {
    workingSetMb: Math.round(Number(rssKb || 0) / 1024),
    cpuPercent: Number(Number(cpuPercent || 0).toFixed(2))
  };
}

function getCpuPercent(first, second, elapsedMs) {
  if (process.platform !== "win32") return Number(second.cpuPercent || 0);
  const deltaSeconds = Math.max(0, second.cpuSeconds - first.cpuSeconds);
  const cores = Math.max(1, os.cpus().length);
  return Number(((deltaSeconds / (elapsedMs / 1000) / cores) * 100).toFixed(2));
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

async function stopChild(childProcess) {
  if (!childProcess || childProcess.exitCode !== null) return;
  try {
    childProcess.kill();
  } catch {}
  const exited = await waitForExit(childProcess, 5000);
  if (exited) return;

  if (process.platform === "win32") {
    try {
      execFileSync("taskkill.exe", ["/PID", String(childProcess.pid), "/T", "/F"], {
        stdio: "ignore"
      });
      return;
    } catch {}
  }

  try {
    process.kill(childProcess.pid, "SIGKILL");
  } catch {}
}

function waitForExit(childProcess, timeout) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeout);
    childProcess.once("exit", () => {
      cleanup();
      resolve(true);
    });
    function cleanup() {
      clearTimeout(timer);
    }
  });
}

async function waitForPortClosed(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await getJson(port, "/snapshot", "closed-check");
    } catch {
      return;
    }
    await delay(200);
  }
  throw new Error(`Local API port ${port} stayed open after app exit.`);
}

function assertLocalSecretsAndDebugLogs(userDataDir) {
  assert.equal(fs.existsSync(path.join(userDataDir, "hud-debug.ndjson")), false, "HUD debug log should not be created by default.");
  assert.equal(fs.existsSync(path.join(userDataDir, "api-token.txt")), false, "Smoke should use env token instead of writing a local token file.");
}

function cleanupUserData(userDataDir) {
  if (process.env.WHO_EATS_TOKEN_KEEP_SMOKE_DATA === "1") return;
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch {}
}

function readNumberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function localOrigin(port) {
  return `http://127.0.0.1:${port}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
