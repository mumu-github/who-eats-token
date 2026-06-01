import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import activeWindowModule from "../src/system/active-window.cjs";

const execFileAsync = promisify(execFile);
const { getActiveWindow } = activeWindowModule;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const cycles = getNumberArg("--cycles", 20);
const outPath = getStringArg("--out", "");
const settleMs = getNumberArg("--settle-ms", 520);
const earlyMs = getNumberArg("--early-ms", 120);
const toolSettleMs = getNumberArg("--tool-settle-ms", 520);
const foregroundWaitMs = getNumberArg("--foreground-wait-ms", 1400);
const foregroundSettleMs = getNumberArg("--foreground-settle-ms", 260);
const maxAllowedLeakMs = getNonNegativeNumberArg("--max-leak-ms", 400);
const desktopArea = await getDesktopWorkArea();
const fastSamples = hasFlag("--fast-samples");
const realWindowsOnly = hasFlag("--real-windows-only");
let cachedOwnedHwnds = [];

const run = {
  startedAt: new Date().toISOString(),
  cycles,
  settleMs,
  earlyMs,
  toolSettleMs,
  foregroundWaitMs,
  foregroundSettleMs,
  desktopArea,
  targets: [],
  samples: [],
  summary: null
};

let targets = await findTargets();
if (targets.length === 0) {
  throw new Error("No Codex, Hermes browser, Chrome, or Edge window found for stress switching.");
}
run.targets = targets.map(compactWindow);

for (let cycle = 1; cycle <= cycles; cycle++) {
  if (!fastSamples) {
    targets = await findTargets();
  }
  const target = targets[(cycle - 1) % targets.length] || targets[0];
  await activateWindow(target);
  await waitForTargetForeground(target, foregroundWaitMs);
  await waitForAppOverlay(isToolOverlayReady, toolSettleMs);
  run.samples.push(await sample(`cycle-${cycle}:tool-before-desktop`, cycle, target));

  await toggleDesktop();
  await sleep(earlyMs);
  run.samples.push(await sample(`cycle-${cycle}:desktop-early`, cycle, target));
  await waitForDesktopForeground(Math.max(foregroundWaitMs, settleMs - earlyMs));
  await waitForAppOverlay(isDesktopOverlayReady, foregroundSettleMs);
  run.samples.push(await sample(`cycle-${cycle}:desktop-settled`, cycle, target));

  await restoreDesktopWindows();
  await activateWindow(target);
  await waitForTargetForeground(target, foregroundWaitMs);
  await waitForAppOverlay(isToolOverlayReady, toolSettleMs);
  run.samples.push(await sample(`cycle-${cycle}:tool-return`, cycle, target));
}

await activateWindow(targets[0]);
run.finishedAt = new Date().toISOString();
run.summary = summarize(run.samples, readAppDebugEntries(run.startedAt, run.finishedAt));

const text = JSON.stringify(run, null, 2);
if (outPath) {
  fs.mkdirSync(path.dirname(path.resolve(root, outPath)), { recursive: true });
  fs.writeFileSync(path.resolve(root, outPath), `${text}\n`, "utf8");
}
console.log(text);

async function sample(stage, cycle, target) {
  let windows = fastSamples ? [] : await getVisibleWindows();
  const owned = fastSamples ? [] : getOwnedOverlayWindows(windows);
  if (!fastSamples) {
    cachedOwnedHwnds = owned.flatMap((window) => [String(window.hwnd), String(window.hwndInt)]);
  }
  let ignoredHwnds = fastSamples ? cachedOwnedHwnds : owned.flatMap((window) => [String(window.hwnd), String(window.hwndInt)]);
  let activeWindow = await getActiveWindow({
    fast: "desktop",
    ignoredHwnds,
    desktopArea
  });
  if (fastSamples && isOwnedOverlayActiveWindow(activeWindow)) {
    windows = await getVisibleWindows();
    cachedOwnedHwnds = getOwnedOverlayWindows(windows)
      .flatMap((window) => [String(window.hwnd), String(window.hwndInt)]);
    ignoredHwnds = cachedOwnedHwnds;
    activeWindow = await getActiveWindow({
      fast: "desktop",
      ignoredHwnds,
      desktopArea
    });
  }
  const appDebug = readAppDebugState();
  return {
    stage,
    cycle,
    target: compactWindow(target),
    sampledAt: new Date().toISOString(),
    activeWindow: compactActiveWindow(activeWindow),
    overlay: {
      desktopBar: compactWindow(findWindow(windows, /^谁在吃 token$/)),
      hud: compactWindow(findWindow(windows, /^LLM HUD$/)),
      hudHitbox: compactWindow(findWindow(windows, /^LLM HUD Controls$/)),
      trustPopover: compactWindow(findWindow(windows, /^数据可信度$/)),
      settings: compactWindow(findWindow(windows, /^谁在吃 token 设置$/)),
      ownedHwnds: ignoredHwnds
    },
    appDebug
  };
}

function summarize(samples, debugEntries = []) {
  const desktopSettled = samples.filter((item) => item.stage.endsWith(":desktop-settled"));
  const toolReturn = samples.filter((item) => item.stage.endsWith(":tool-return"));
  const desktopEnvironmentInterference = desktopSettled.filter((item) =>
    item.activeWindow?.desktop?.clear !== true
  );
  const toolEnvironmentInterference = toolReturn.filter((item) =>
    !isToolForegroundSample(item)
  );
  const validDesktopSettled = desktopSettled.filter((item) =>
    item.activeWindow?.desktop?.clear === true
  );
  const validToolReturn = toolReturn.filter((item) =>
    isToolForegroundSample(item)
  );
  const desktopFailures = validDesktopSettled.filter((item) => {
    const desktopBarVisible = item.overlay.desktopBar?.visible === true ||
      item.appDebug?.desktopBar?.visible === true;
    return !desktopBarVisible ||
      isHudVisible(item);
  });
  const toolFailures = validToolReturn.filter((item) =>
    !isHudVisible(item) ||
      isDesktopBarVisible(item)
  );
  const foregrounds = countBy(samples.map((item) => `${item.activeWindow?.processName || "--"}|${item.activeWindow?.title || "--"}|${item.activeWindow?.className || "--"}`));
  const hudBounds = samples
    .map((item) => item.overlay.hud?.bounds)
    .filter(Boolean)
    .map((bounds) => `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`);
  const topbarVisibleWhileToolMs = estimateVisibleMs(samples, debugEntries, "desktopBar", (item) =>
    isToolPhaseSample(item) &&
      isToolForegroundSample(item) &&
      isDesktopBarVisible(item)
  );
  const hudVisibleWhileDesktopMs = estimateVisibleMs(samples, debugEntries, "hud", (item) =>
    isDesktopPhaseSample(item) &&
      item.activeWindow?.desktop?.clear === true &&
      isHudVisible(item)
  );
  const surfaceTransition = getSurfaceTransitionStats(samples, debugEntries);
  const smoothLeakTargetMs = 0;
  const stalePreserveMs = Math.max(0, ...samples.map((item) =>
    Number(item.appDebug?.decision?.stalePreserveMs) || 0
  ));
  const insufficientValidSamples = validDesktopSettled.length === 0 || validToolReturn.length === 0;
  const productPassed = !insufficientValidSamples &&
    desktopFailures.length === 0 &&
    toolFailures.length === 0 &&
    topbarVisibleWhileToolMs <= maxAllowedLeakMs &&
    hudVisibleWhileDesktopMs <= maxAllowedLeakMs;
  const environmentInterference = [
    ...desktopEnvironmentInterference.map((item) => summarizeEnvironmentInterference(item, "desktop-foreground-not-reached")),
    ...toolEnvironmentInterference.map((item) => summarizeEnvironmentInterference(item, "tool-foreground-not-reached"))
  ];
  return {
    sampleCount: samples.length,
    desktopSettledCount: desktopSettled.length,
    validDesktopSettledCount: validDesktopSettled.length,
    toolReturnCount: toolReturn.length,
    validToolReturnCount: validToolReturn.length,
    desktopFailureCount: desktopFailures.length,
    toolFailureCount: toolFailures.length,
    environmentInterferenceCount: environmentInterference.length,
    desktopEnvironmentInterferenceCount: desktopEnvironmentInterference.length,
    toolEnvironmentInterferenceCount: toolEnvironmentInterference.length,
    topbarVisibleWhileToolMs,
    hudVisibleWhileDesktopMs,
    surfaceTransitionCount: surfaceTransition.count,
    surfaceTransitionSource: surfaceTransition.source,
    stalePreserveMs,
    maxAllowedLeakMs,
    smoothLeakTargetMs,
    smoothPassed: topbarVisibleWhileToolMs <= smoothLeakTargetMs &&
      hudVisibleWhileDesktopMs <= smoothLeakTargetMs,
    insufficientValidSamples,
    productPassed,
    environmentClean: environmentInterference.length === 0,
    passed: productPassed,
    desktopFailures: desktopFailures.map((item) => ({
      stage: item.stage,
      activeWindow: item.activeWindow,
      desktopBar: item.overlay.desktopBar,
      hud: item.overlay.hud,
      appDebug: item.appDebug
    })),
    toolFailures: toolFailures.map((item) => ({
      stage: item.stage,
      activeWindow: item.activeWindow,
      desktopBar: item.overlay.desktopBar,
      hud: item.overlay.hud,
      appDebug: item.appDebug
    })),
    environmentInterference,
    foregrounds,
    distinctHudBounds: [...new Set(hudBounds)]
  };
}

function summarizeEnvironmentInterference(item, reason) {
  return {
    stage: item.stage,
    reason,
    activeWindow: item.activeWindow,
    desktopBar: item.overlay.desktopBar,
    hud: item.overlay.hud,
    appDebug: item.appDebug
  };
}

function estimateVisibleMs(samples, debugEntries, overlayKind, predicate) {
  let maxVisibleMs = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const item = samples[index];
    if (!predicate(item)) continue;
    const current = Date.parse(item.sampledAt || "");
    const next = Date.parse(samples[index + 1]?.sampledAt || "");
    if (!Number.isFinite(current)) continue;
    const intervalEnd = Number.isFinite(next)
      ? Math.max(0, Math.min(next - current, foregroundSettleMs))
      : foregroundSettleMs;
    const previousHideAt = findPreviousOverlayHideAt(debugEntries, overlayKind, current - 150, current);
    if (Number.isFinite(previousHideAt)) continue;
    const hideAt = findNextOverlayHideAt(debugEntries, overlayKind, current, current + intervalEnd);
    const measuredEnd = Number.isFinite(hideAt) ? hideAt : current + intervalEnd;
    maxVisibleMs = Math.max(maxVisibleMs, Math.max(0, measuredEnd - current));
  }
  return maxVisibleMs;
}

function findPreviousOverlayHideAt(debugEntries, overlayKind, startMs, endMs) {
  for (let index = debugEntries.length - 1; index >= 0; index -= 1) {
    const item = debugEntries[index];
    const timestamp = Date.parse(item.timestamp || "");
    if (!Number.isFinite(timestamp)) continue;
    if (timestamp < startMs) break;
    if (timestamp <= endMs && isOverlayHideEvent(item, overlayKind)) return timestamp;
  }
  return null;
}

function findNextOverlayHideAt(debugEntries, overlayKind, startMs, endMs) {
  const entry = debugEntries.find((item) => {
    const timestamp = Date.parse(item.timestamp || "");
    return Number.isFinite(timestamp) &&
      timestamp >= startMs &&
      timestamp <= endMs &&
      isOverlayHideEvent(item, overlayKind);
  });
  return entry ? Date.parse(entry.timestamp) : null;
}

function isOverlayHideEvent(entry, overlayKind) {
  if (overlayKind === "desktopBar") {
    return entry.event === "desktop-bar" && entry.outcome === "hidden";
  }
  if (overlayKind === "hud") {
    return entry.event === "hud-refresh" &&
      entry.outcome !== "shown" &&
      entry.payload?.visible !== true;
  }
  return false;
}

function getSurfaceTransitionStats(samples, debugEntries = []) {
  const realSurfaceSequence = samples.map(getRealWindowSurface).filter(Boolean);
  if (realWindowsOnly) {
    return {
      count: countSurfaceTransitions(realSurfaceSequence),
      source: "real-windows"
    };
  }

  const debugTransitionCount = debugEntries.filter((entry) =>
    entry.event === "overlay-decision" && entry.transition?.changed === true
  ).length;
  if (debugTransitionCount > 0) {
    return {
      count: debugTransitionCount,
      source: "app-debug-transition-log"
    };
  }

  const debugSurfaceSequence = samples
    .map((item) => item.appDebug?.decision?.mode || null)
    .filter(Boolean);
  if (debugSurfaceSequence.length > 0) {
    return {
      count: countSurfaceTransitions(debugSurfaceSequence),
      source: "app-debug-samples"
    };
  }

  return {
    count: countSurfaceTransitions(realSurfaceSequence),
    source: "real-windows"
  };
}

function getRealWindowSurface(item) {
  const desktopVisible = isDesktopBarVisible(item);
  const hudVisible = isHudVisible(item);
  if (desktopVisible && hudVisible) return "mixed";
  if (desktopVisible) return "desktop-topbar";
  if (hudVisible) return "tool-hud";
  return "hidden";
}

function countSurfaceTransitions(surfaceSequence) {
  let previousSurface = null;
  let count = 0;
  for (const surface of surfaceSequence) {
    if (!surface) continue;
    if (previousSurface && previousSurface !== surface) count += 1;
    previousSurface = surface;
  }
  return count;
}

function isToolForegroundSample(item) {
  return /codex|hermes|chatgpt|openai/i.test([
    item.activeWindow?.title,
    item.activeWindow?.processName,
    item.activeWindow?.url
  ].filter(Boolean).join(" "));
}

function isDesktopPhaseSample(item) {
  return /:desktop-(early|settled)$/.test(String(item?.stage || ""));
}

function isToolPhaseSample(item) {
  return /:tool-(before-desktop|return)$/.test(String(item?.stage || ""));
}

function isDesktopBarVisible(item) {
  if (item.overlay.desktopBar?.visible === true) return true;
  return !realWindowsOnly && item.appDebug?.desktopBar?.visible === true;
}

function isHudVisible(item) {
  if (item.overlay.hud?.visible === true) return true;
  return !realWindowsOnly && item.appDebug?.hud?.visible === true;
}

function isOwnedOverlayActiveWindow(activeWindow) {
  const title = String(activeWindow?.title || "");
  const processName = String(activeWindow?.processName || "");
  const pathText = String(activeWindow?.path || "");
  return /^(谁在吃 token|LLM HUD|LLM HUD Controls|数据可信度|谁在吃 token 设置)$/.test(title) &&
    (/electron/i.test(processName) || /electron/i.test(pathText));
}

function readAppDebugState(startedAt = run.startedAt) {
  const logPath = getAppDebugLogPath();
  if (!logPath || !fs.existsSync(logPath)) return null;
  const entries = readAppDebugEntries(startedAt);
  const latestDesktopBar = findLast(entries, (entry) => entry.event === "desktop-bar");
  const latestHud = findLast(entries, (entry) => entry.event === "hud-refresh");
  const latestDecision = findLast(entries, (entry) => entry.event === "overlay-decision");
  if (!latestDesktopBar && !latestHud && !latestDecision) return null;
  return {
    desktopBar: latestDesktopBar ? {
      visible: latestDesktopBar.outcome === "shown",
      outcome: latestDesktopBar.outcome || null,
      reason: latestDesktopBar.reason || null,
      timestamp: latestDesktopBar.timestamp || null,
      state: latestDesktopBar.after || latestDesktopBar.before || null
    } : null,
    hud: latestHud ? {
      visible: latestHud.outcome === "shown" || latestHud.payload?.visible === true,
      outcome: latestHud.outcome || null,
      reason: latestHud.reason || latestHud.payload?.hiddenReason || null,
      timestamp: latestHud.timestamp || null
    } : null,
    decision: latestDecision ? {
      mode: latestDecision.mode || null,
      reason: latestDecision.reason || null,
      timestamp: latestDecision.timestamp || null,
      transition: latestDecision.transition || null,
      stalePreserveMs: latestDecision.stalePreserveMs || 0
    } : null
  };
}

function readAppDebugEntries(startedAt = null, finishedAt = null) {
  const logPath = getAppDebugLogPath();
  if (!logPath || !fs.existsSync(logPath)) return [];
  let text = "";
  try {
    text = fs.readFileSync(logPath, "utf8");
  } catch {
    return [];
  }
  const startMs = Date.parse(startedAt || "");
  const endMs = Date.parse(finishedAt || "");
  return text
    .trim()
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((entry) => {
      if (!entry) return false;
      const timestamp = Date.parse(entry.timestamp || "");
      if (Number.isFinite(startMs) && (!Number.isFinite(timestamp) || timestamp < startMs)) return false;
      if (Number.isFinite(endMs) && (!Number.isFinite(timestamp) || timestamp > endMs)) return false;
      return true;
    });
}

function getAppDebugLogPath() {
  if (process.env.WHO_EATS_TOKEN_HUD_DEBUG_LOG) {
    return process.env.WHO_EATS_TOKEN_HUD_DEBUG_LOG;
  }
  if (process.env.APPDATA) {
    return path.join(process.env.APPDATA, "who-eats-token", "hud-debug.ndjson");
  }
  if (process.env.HOME) {
    return path.join(process.env.HOME, ".config", "who-eats-token", "hud-debug.ndjson");
  }
  return "";
}

function findLast(items, predicate) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return items[index];
  }
  return null;
}

async function findTargets() {
  const windows = await getVisibleWindows();
  cachedOwnedHwnds = getOwnedOverlayWindows(windows)
    .flatMap((window) => [String(window.hwnd), String(window.hwndInt)]);
  const candidates = windows
    .filter((window) => {
      const text = `${window.title || ""} ${window.processName || ""}`;
      return /^Codex$/i.test(window.title || "") ||
        /Hermes .*Chrome/i.test(window.title || "") ||
        /ChatGPT|OpenAI/i.test(text);
    })
    .filter((window) => !/^LLM HUD|^谁在吃 token|^数据可信度/.test(window.title || ""))
    .sort((left, right) => targetRank(left) - targetRank(right));
  const visibleCandidates = candidates.filter((window) => !window.minimized);
  return visibleCandidates.length > 0 ? visibleCandidates : candidates;
}

function targetRank(window) {
  if (/^Codex$/i.test(window.title || "")) return 0;
  if (/Hermes .*Chrome/i.test(window.title || "")) return 1;
  if (/Google Chrome/i.test(window.title || "")) return 2;
  if (/Microsoft.* Edge/i.test(window.title || "")) return 3;
  return 9;
}

async function activateWindow(window) {
  if (!window) return;
  const script = `${win32TypeScript()}
$hwnd = [IntPtr]${Number(window.hwndInt)}
$targetPid = ${Number(window.pid) || 0}
$title = ${JSON.stringify(String(window.title || ""))}
$restoreX = ${Number(window.bounds?.x) || 0}
$restoreY = ${Number(window.bounds?.y) || 0}
$restoreWidth = ${Number(window.bounds?.width) || Number(desktopArea?.width) || 1200}
$restoreHeight = ${Number(window.bounds?.height) || Number(desktopArea?.height) || 800}
$shell = $null
$shellApp = $null
try { $shell = New-Object -ComObject WScript.Shell } catch {}
try { $shellApp = New-Object -ComObject Shell.Application } catch {}
if ($shellApp) {
  try { $shellApp.UndoMinimizeALL() } catch {}
  Start-Sleep -Milliseconds 120
}
for ($attempt = 0; $attempt -lt 6; $attempt++) {
  [void][Win32Stress]::ShowWindow($hwnd, 9)
  if ($restoreWidth -ge 600 -and $restoreHeight -ge 400) {
    [void][Win32Stress]::SetWindowPos($hwnd, [IntPtr]::Zero, $restoreX, $restoreY, $restoreWidth, $restoreHeight, 0x0040)
  }
  [void][Win32Stress]::SetForegroundWindow($hwnd)
  [Win32Stress]::SwitchToThisWindow($hwnd, $true)
  Start-Sleep -Milliseconds 120
  if ([Win32Stress]::GetForegroundWindow() -eq $hwnd) { break }
  if ($shell -and $title) {
    try { [void]$shell.AppActivate($title) } catch {}
  }
  if ($shell -and $targetPid -gt 0) {
    try { [void]$shell.AppActivate($targetPid) } catch {}
  }
  Start-Sleep -Milliseconds 120
}
`;
  await runPowerShell(script, 3000);
}

async function toggleDesktop() {
  await runPowerShell("$shell = New-Object -ComObject Shell.Application; $shell.ToggleDesktop()", 3000);
}

async function restoreDesktopWindows() {
  await runPowerShell("$shell = New-Object -ComObject Shell.Application; $shell.ToggleDesktop()", 3000);
  await sleep(180);
}

async function waitForTargetForeground(target, timeoutMs) {
  return waitForForeground((activeWindow) => isTargetForeground(activeWindow, target), timeoutMs);
}

async function waitForDesktopForeground(timeoutMs) {
  return waitForForeground((activeWindow) => activeWindow?.desktop?.clear === true, timeoutMs);
}

async function waitForAppOverlay(predicate, timeoutMs) {
  const startedAt = Date.now();
  do {
    const state = await readCurrentOverlayState();
    if (predicate(state)) return state;
    await sleep(75);
  } while (Date.now() - startedAt < timeoutMs);
  return readCurrentOverlayState();
}

function isDesktopOverlayReady(state) {
  return (!state?.decision || state.decision.mode === "desktop-topbar") &&
    state?.desktopBar?.visible === true &&
    state?.hud?.visible !== true;
}

function isToolOverlayReady(state) {
  return (!state?.decision || state.decision.mode === "tool-hud") &&
    state?.hud?.visible === true &&
    state?.desktopBar?.visible !== true;
}

async function readCurrentOverlayState() {
  if (!realWindowsOnly) {
    const debugState = readAppDebugState();
    if (debugState) return debugState;
  }
  const windows = await getVisibleWindows();
  return getOverlayStateFromWindows(windows);
}

function getOverlayStateFromWindows(windows) {
  return {
    desktopBar: getOverlayWindowDebugState(findWindow(windows, /^谁在吃 token$/)),
    hud: getOverlayWindowDebugState(findWindow(windows, /^LLM HUD$/)),
    decision: null
  };
}

function getOverlayWindowDebugState(window) {
  if (!window) return null;
  return {
    visible: window.visible === true,
    outcome: window.visible === true ? "visible" : "hidden",
    reason: null,
    timestamp: new Date().toISOString(),
    state: compactWindow(window)
  };
}

async function waitForForeground(predicate, timeoutMs) {
  const startedAt = Date.now();
  let lastActiveWindow = null;
  do {
    lastActiveWindow = await getActiveWindow({
      fast: "desktop",
      desktopArea
    });
    if (predicate(lastActiveWindow)) return lastActiveWindow;
    await sleep(75);
  } while (Date.now() - startedAt < timeoutMs);
  return lastActiveWindow;
}

function isTargetForeground(activeWindow, target) {
  const activeHwnd = String(activeWindow?.hwnd || activeWindow?.id || "");
  const targetHwnd = String(target?.hwnd || target?.hwndInt || "");
  if (activeHwnd && targetHwnd && activeHwnd === targetHwnd) return true;

  const activeText = `${activeWindow?.processName || ""} ${activeWindow?.title || ""}`;
  const targetText = `${target?.processName || ""} ${target?.title || ""}`;
  if (/codex/i.test(targetText)) return /codex/i.test(activeText);
  if (/chrome/i.test(targetText)) return /chrome/i.test(activeText);
  if (/edge|msedge/i.test(targetText)) return /edge|msedge/i.test(activeText);
  if (/hermes/i.test(targetText)) return /hermes/i.test(activeText);
  return false;
}

async function getVisibleWindows() {
  const script = `${win32TypeScript()}
$items = New-Object System.Collections.Generic.List[object]
[Win32Stress]::EnumWindows({
  param($hwnd, $lparam)
  if (-not [Win32Stress]::IsWindowVisible($hwnd)) { return $true }
  $titleBuilder = New-Object System.Text.StringBuilder 512
  [void][Win32Stress]::GetWindowText($hwnd, $titleBuilder, $titleBuilder.Capacity)
  $classBuilder = New-Object System.Text.StringBuilder 256
  [void][Win32Stress]::GetClassName($hwnd, $classBuilder, $classBuilder.Capacity)
  $nativePid = 0
  [void][Win32Stress]::GetWindowThreadProcessId($hwnd, [ref]$nativePid)
  $rect = New-Object Win32Stress+RECT
  [void][Win32Stress]::GetWindowRect($hwnd, [ref]$rect)
  $proc = $null
  try { $proc = Get-Process -Id $nativePid -ErrorAction Stop } catch {}
  $items.Add([pscustomobject]@{
    hwnd = [string]$hwnd.ToInt64()
    hwndInt = $hwnd.ToInt64()
    pid = $nativePid
    processName = if ($proc) { $proc.ProcessName } else { "" }
    title = $titleBuilder.ToString()
    className = $classBuilder.ToString()
    visible = $true
    minimized = [Win32Stress]::IsIconic($hwnd)
    bounds = @{
      x = $rect.Left
      y = $rect.Top
      width = $rect.Right - $rect.Left
      height = $rect.Bottom - $rect.Top
    }
  })
  return $true
}, [IntPtr]::Zero) | Out-Null
$items | ConvertTo-Json -Depth 6
`;
  const stdout = await runPowerShell(script, 7000);
  const parsed = parseJson(stdout.trim(), []);
  return Array.isArray(parsed) ? parsed : [parsed].filter(Boolean);
}

async function getDesktopWorkArea() {
  const script = "Add-Type -AssemblyName System.Windows.Forms; $screen=[System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea; [pscustomobject]@{x=$screen.X;y=$screen.Y;width=$screen.Width;height=$screen.Height} | ConvertTo-Json -Compress";
  const stdout = await runPowerShell(script, 3000);
  return parseJson(stdout.trim(), null);
}

function getOwnedOverlayWindows(windows) {
  return windows.filter((window) => /^(谁在吃 token|LLM HUD|LLM HUD Controls|数据可信度|谁在吃 token 设置)$/.test(window.title || ""));
}

function findWindow(windows, titlePattern) {
  return windows.find((window) => titlePattern.test(window.title || "")) || null;
}

function compactActiveWindow(window) {
  if (!window) return null;
  return {
    hwnd: String(window.hwnd || window.id || ""),
    processName: window.processName || "",
    title: window.title || "",
    className: window.className || "",
    path: window.path || "",
    url: window.url || "",
    bounds: window.bounds || null,
    desktop: window.desktop || null,
    foregroundFallbackMiss: window.foregroundFallbackMiss || null,
    samplingNoise: window.samplingNoise || null,
    source: window.source || ""
  };
}

function compactWindow(window) {
  if (!window) return null;
  return {
    hwnd: String(window.hwnd || ""),
    hwndInt: Number(window.hwndInt) || null,
    processName: window.processName || "",
    title: window.title || "",
    className: window.className || "",
    visible: Boolean(window.visible),
    minimized: Boolean(window.minimized),
    bounds: window.bounds || null
  };
}

function countBy(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function runPowerShell(script, timeout) {
  const command = getUtf8PowerShellCommand(script);
  const encodedCommand = Buffer.from(command, "utf16le").toString("base64");
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedCommand],
    { windowsHide: true, timeout, maxBuffer: 10 * 1024 * 1024, encoding: "utf8" }
  );
  return stdout;
}

function getUtf8PowerShellCommand(script) {
  return `
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
${script}
`;
}

function win32TypeScript() {
  return `
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class Win32Stress {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
'@ -ErrorAction SilentlyContinue
`;
}

function getStringArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function getNumberArg(name, fallback) {
  const value = Number(getStringArg(name, ""));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getNonNegativeNumberArg(name, fallback) {
  const value = Number(getStringArg(name, ""));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
