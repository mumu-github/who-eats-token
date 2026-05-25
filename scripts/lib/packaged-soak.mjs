import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_DURATION_MS = 10 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 5000;
const DEFAULT_MAX_WORKING_SET_MB = 450;
const DEFAULT_MAX_GROWTH_MB = 80;
const DEFAULT_MAX_CPU_PERCENT = 35;

export async function runPackagedSoak({
  executable,
  packageHint,
  platformName,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  if (!fs.existsSync(executable)) {
    console.error(`Missing packaged app. Run \`${packageHint}\` first.`);
    process.exit(1);
  }

  const durationMs = readNumberEnv("WHO_EATS_TOKEN_SOAK_DURATION_MS", DEFAULT_DURATION_MS);
  const intervalMs = readNumberEnv("WHO_EATS_TOKEN_SOAK_INTERVAL_MS", DEFAULT_INTERVAL_MS);
  const maxWorkingSetMb = readNumberEnv("WHO_EATS_TOKEN_SOAK_MAX_RSS_MB", DEFAULT_MAX_WORKING_SET_MB);
  const maxGrowthMb = readNumberEnv("WHO_EATS_TOKEN_SOAK_MAX_GROWTH_MB", DEFAULT_MAX_GROWTH_MB);
  const maxCpuPercent = readNumberEnv("WHO_EATS_TOKEN_SOAK_MAX_CPU_PERCENT", DEFAULT_MAX_CPU_PERCENT);
  const ingestPort = await getFreePort();
  const bridgePort = await getFreePort();
  const token = `soak-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const userDataDir = path.join(os.tmpdir(), `who-eats-token-soak-${process.pid}-${Date.now()}`);
  const samples = [];
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

    await waitForHealth(ingestPort, token, timeoutMs, child);

    let previous = null;
    const startedAt = Date.now();
    while (Date.now() - startedAt < durationMs) {
      if (child.exitCode !== undefined && child.exitCode !== null) {
        throw new Error(`Packaged app exited during soak with code ${child.exitCode}.`);
      }
      const sample = getProcessSample(child.pid);
      const cpuPercent = previous
        ? getCpuPercent(previous, sample, Math.max(1, sample.timestampMs - previous.timestampMs))
        : 0;
      samples.push({
        timestampMs: sample.timestampMs,
        workingSetMb: sample.workingSetMb,
        cpuPercent
      });
      previous = sample;
      await delay(Math.min(intervalMs, Math.max(0, durationMs - (Date.now() - startedAt))));
    }

    if (samples.length === 0) {
      const sample = getProcessSample(child.pid);
      samples.push({
        timestampMs: sample.timestampMs,
        workingSetMb: sample.workingSetMb,
        cpuPercent: 0
      });
    }

    const first = samples[0];
    const last = samples[samples.length - 1];
    const maxWorkingSet = Math.max(...samples.map((sample) => sample.workingSetMb));
    const maxCpu = Math.max(...samples.map((sample) => sample.cpuPercent));
    const growthMb = last.workingSetMb - first.workingSetMb;

    assert.ok(maxWorkingSet <= maxWorkingSetMb, `Working set ${maxWorkingSet}MB exceeds soak budget ${maxWorkingSetMb}MB.`);
    assert.ok(growthMb <= maxGrowthMb, `Working set growth ${growthMb}MB exceeds soak budget ${maxGrowthMb}MB.`);
    assert.ok(maxCpu <= maxCpuPercent, `CPU ${maxCpu}% exceeds soak budget ${maxCpuPercent}%.`);
    assertLocalSecretsAndDebugLogs(userDataDir);

    await stopChild(child);
    stopped = true;
    await waitForPortClosed(ingestPort, timeoutMs);

    console.log(JSON.stringify({
      ok: true,
      platform: platformName,
      pid: child.pid,
      ingestPort,
      durationMs,
      intervalMs,
      sampleCount: samples.length,
      firstWorkingSetMb: first.workingSetMb,
      lastWorkingSetMb: last.workingSetMb,
      maxWorkingSetMb: maxWorkingSet,
      growthMb,
      maxCpuPercent: maxCpu,
      budgets: {
        maxWorkingSetMb,
        maxGrowthMb,
        maxCpuPercent
      }
    }, null, 2));
  } finally {
    if (!stopped) await stopChild(child);
    cleanupUserData(userDataDir);
  }
}

async function waitForHealth(port, accessToken, timeout, child) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child?.exitCode !== undefined && child.exitCode !== null) {
      throw new Error(`Packaged app exited early with code ${child.exitCode}.`);
    }
    try {
      const health = await requestJson({
        port,
        route: "/health",
        accessToken,
        method: "GET",
        origin: localOrigin(port)
      });
      if (health.ok && health.port === port) return health;
      throw new Error("Health response was not ready.");
    } catch (error) {
      lastError = error;
      await delay(500);
    }
  }
  throw new Error(`Timed out waiting for /health: ${lastError?.message || "unknown error"}`);
}

function requestJson({ port, route, accessToken, method, origin = null, allowError = false }) {
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
    timestampMs: Date.now(),
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
    timestampMs: Date.now(),
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
  if (!childProcess) return;
  if (childProcess.exitCode !== null && childProcess.exitCode !== undefined) return;
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
      await requestJson({
        port,
        route: "/health",
        accessToken: "closed-check",
        method: "GET"
      });
    } catch {
      return;
    }
    await delay(200);
  }
  throw new Error(`Local API port ${port} stayed open after app exit.`);
}

function assertLocalSecretsAndDebugLogs(userDataDir) {
  assert.equal(fs.existsSync(path.join(userDataDir, "hud-debug.ndjson")), false, "HUD debug log should not be created by default.");
  assert.equal(fs.existsSync(path.join(userDataDir, "api-token.txt")), false, "Soak should use env token instead of writing a local token file.");
}

function cleanupUserData(userDataDir) {
  if (process.env.WHO_EATS_TOKEN_KEEP_SOAK_DATA === "1") return;
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
