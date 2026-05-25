const { execFile } = require("node:child_process");

let nativeWindowApiPromise = null;

const POWERSHELL_SCRIPT = `
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$config = ConvertFrom-Json @'
__CONFIG_JSON__
'@
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class ForegroundReader {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll", SetLastError=true)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll", SetLastError=true)]
  public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out int processId);
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("dwmapi.dll")]
  public static extern int DwmGetWindowAttribute(IntPtr hWnd, int dwAttribute, out int pvAttribute, int cbAttribute);
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }
}
"@

function Get-TextValue([IntPtr]$window) {
  $text = New-Object System.Text.StringBuilder 1024
  [ForegroundReader]::GetWindowText($window, $text, $text.Capacity) | Out-Null
  return $text.ToString()
}

function Get-ClassValue([IntPtr]$window) {
  $class = New-Object System.Text.StringBuilder 256
  [ForegroundReader]::GetClassName($window, $class, $class.Capacity) | Out-Null
  return $class.ToString()
}

function Get-ProcessValue([int]$processId) {
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  $path = ""
  try {
    if ($process -and $process.Path) { $path = $process.Path }
  } catch {}
  return [pscustomobject]@{
    processName = if ($process) { $process.ProcessName } else { "" }
    path = $path
  }
}

function Get-WindowPayload([IntPtr]$window) {
  $processId = 0
  [ForegroundReader]::GetWindowThreadProcessId($window, [ref]$processId) | Out-Null
  $process = Get-ProcessValue $processId
  $rect = New-Object ForegroundReader+RECT
  [ForegroundReader]::GetWindowRect($window, [ref]$rect) | Out-Null
  return [pscustomobject]@{
    hwnd = $window.ToInt64()
    pid = $processId
    processName = $process.processName
    path = $process.path
    title = Get-TextValue $window
    className = Get-ClassValue $window
    bounds = @{
      x = $rect.Left
      y = $rect.Top
      width = $rect.Right - $rect.Left
      height = $rect.Bottom - $rect.Top
    }
  }
}

function Test-Cloaked([IntPtr]$window) {
  $cloaked = 0
  try {
    [ForegroundReader]::DwmGetWindowAttribute($window, 14, [ref]$cloaked, 4) | Out-Null
  } catch {
    $cloaked = 0
  }
  return $cloaked -ne 0
}

function Test-ShellOrOverlayWindow($windowInfo) {
  $processName = [string]$windowInfo.processName
  $className = [string]$windowInfo.className
  $title = [string]$windowInfo.title

  if ($script:ignoredHwnds.ContainsKey([string]$windowInfo.hwnd)) { return $true }
  if ($processName -eq "explorer" -and @("Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd") -contains $className) { return $true }
  if (@("Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "DV2ControlHost") -contains $className) { return $true }
  if ($processName -eq "electron" -and @("谁在吃 token", "LLM HUD") -contains $title) { return $true }
  if ($className -like "Windows.UI.Core.*" -and [string]::IsNullOrWhiteSpace($title)) { return $true }

  return $false
}

function Test-HermesLikeWindow($windowInfo) {
  $processName = [string]$windowInfo.processName
  $haystack = ("{0} {1}" -f ([string]$windowInfo.title), ([string]$windowInfo.path))
  return $processName -eq "hermes-web-ui" -or $haystack -match "(?i)(hermes|127\.0\.0\.1:8648|localhost:8648)"
}

function Test-ContentOverlayWindow($windowInfo) {
  $processName = ([string]$windowInfo.processName).ToLowerInvariant()
  if (Test-HermesLikeWindow $windowInfo) { return $true }
  return @("chrome", "msedge", "browser", "hermes-web-ui") -contains $processName
}

function Test-OverlayTriggerName([string]$name) {
  if ([string]::IsNullOrWhiteSpace($name)) { return $false }
  return $name -match "(消息队列|继续|还没好吗|还没好|没好|好了|重试|取消|发送|Message\s*Queue|\bQueue\b|\bContinue\b|Not\s*yet|Still\s*not|Retry|Cancel|Send)"
}

function Test-InteractiveTriggerName([string]$name) {
  if ([string]::IsNullOrWhiteSpace($name)) { return $false }
  return $name -match "(继续|结算|付款|授权|预检|确认|取消|重试|发送|1688|链接|Continue|Checkout|Pay|Authorize|Confirm|Cancel|Retry|Send)"
}

function Convert-UiaBounds($rect) {
  if ($null -eq $rect -or $rect.IsEmpty) { return $null }
  if ($rect.Width -le 1 -or $rect.Height -le 1) { return $null }
  return @{
    x = [int][Math]::Round($rect.Left)
    y = [int][Math]::Round($rect.Top)
    width = [int][Math]::Round($rect.Width)
    height = [int][Math]::Round($rect.Height)
  }
}

function Test-UsefulOverlayBounds($bounds, $rootBounds) {
  if (-not $bounds -or -not $rootBounds) { return $false }
  if ([double]$bounds.width -lt 240 -or [double]$bounds.height -lt 96) { return $false }
  if ([double]$bounds.width -gt ([double]$rootBounds.width * 0.95)) { return $false }
  if ([double]$bounds.height -gt ([double]$rootBounds.height * 0.85)) { return $false }
  return $true
}

function Expand-OverlayBounds($bounds, $rootBounds) {
  if (-not $bounds -or -not $rootBounds) { return $null }
  $left = [Math]::Max([double]$rootBounds.x, [double]$bounds.x - 220)
  $top = [Math]::Max([double]$rootBounds.y, [double]$bounds.y - 80)
  $right = [Math]::Min([double]$rootBounds.x + [double]$rootBounds.width, [double]$bounds.x + [double]$bounds.width + 420)
  $bottom = [Math]::Min([double]$rootBounds.y + [double]$rootBounds.height, [double]$bounds.y + [double]$bounds.height + 180)
  return @{
    x = [int][Math]::Round($left)
    y = [int][Math]::Round($top)
    width = [int][Math]::Round($right - $left)
    height = [int][Math]::Round($bottom - $top)
  }
}

function Expand-InteractiveBounds($bounds, $rootBounds) {
  if (-not $bounds -or -not $rootBounds) { return $null }
  $margin = 10
  $left = [Math]::Max([double]$rootBounds.x, [double]$bounds.x - $margin)
  $top = [Math]::Max([double]$rootBounds.y, [double]$bounds.y - $margin)
  $right = [Math]::Min([double]$rootBounds.x + [double]$rootBounds.width, [double]$bounds.x + [double]$bounds.width + $margin)
  $bottom = [Math]::Min([double]$rootBounds.y + [double]$rootBounds.height, [double]$bounds.y + [double]$bounds.height + $margin)
  return @{
    x = [int][Math]::Round($left)
    y = [int][Math]::Round($top)
    width = [int][Math]::Round($right - $left)
    height = [int][Math]::Round($bottom - $top)
  }
}

function Test-UsefulInteractiveBounds($bounds, $rootBounds) {
  if (-not $bounds -or -not $rootBounds) { return $false }
  if ([double]$bounds.width -lt 36 -or [double]$bounds.height -lt 24) { return $false }
  if ([double]$bounds.width -gt ([double]$rootBounds.width * 0.98) -and [double]$bounds.height -gt ([double]$rootBounds.height * 0.5)) { return $false }
  return $true
}

function Test-InteractiveElement($element, $rootBounds) {
  $controlType = [string]$element.Current.ControlType.ProgrammaticName
  $name = [string]$element.Current.Name
  $isInteractiveType = $controlType -match "ControlType\.(Button|Edit|ComboBox|Hyperlink|CheckBox|RadioButton|MenuItem|SplitButton)"
  if (-not $isInteractiveType) { return $false }
  $bounds = Convert-UiaBounds $element.Current.BoundingRectangle
  if (-not (Test-UsefulInteractiveBounds $bounds $rootBounds)) { return $false }
  if ($controlType -match "ControlType\.(Edit|ComboBox)") { return $true }
  return Test-InteractiveTriggerName $name
}

function Get-OverlayBoundsFromElement($element, $rootBounds) {
  $current = $element
  for ($i = 0; $i -lt 8 -and $null -ne $current; $i++) {
    $bounds = Convert-UiaBounds $current.Current.BoundingRectangle
    if (Test-UsefulOverlayBounds $bounds $rootBounds) { return $bounds }
    $current = $script:uiaWalker.GetParent($current)
  }

  $textBounds = Convert-UiaBounds $element.Current.BoundingRectangle
  return Expand-OverlayBounds $textBounds $rootBounds
}

function Add-OverlayHint($hints, $label, $bounds, $type = "content-overlay") {
  if (-not $bounds) { return }
  foreach ($hint in @($hints)) {
    if ([Math]::Abs([double]$hint.bounds.x - [double]$bounds.x) -lt 8 -and
        [Math]::Abs([double]$hint.bounds.y - [double]$bounds.y) -lt 8 -and
        [Math]::Abs([double]$hint.bounds.width - [double]$bounds.width) -lt 16 -and
        [Math]::Abs([double]$hint.bounds.height - [double]$bounds.height) -lt 16) {
      return
    }
  }

  $hints.Add([pscustomobject]@{
    type = $type
    label = $label
    bounds = $bounds
  }) | Out-Null
}

function Get-ContentOverlayHints([IntPtr]$window, $windowInfo) {
  $hints = New-Object System.Collections.Generic.List[object]
  if (-not (Test-ContentOverlayWindow $windowInfo)) { return @($hints) }
  $processName = ([string]$windowInfo.processName).ToLowerInvariant()
  if (@("chrome", "msedge", "browser", "firefox") -contains $processName) {
    return @($hints)
  }

  try {
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($window)
    if (-not $root) { return @($hints) }

    $script:uiaWalker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
    $rootBounds = Convert-UiaBounds $root.Current.BoundingRectangle
    if (-not $rootBounds) { return @($hints) }

    $script:overlayVisitCount = 0
    function Visit-OverlayElement($element, $depth) {
      if ($script:overlayVisitCount -ge 650 -or $null -eq $element -or $depth -gt 14) { return }
      $script:overlayVisitCount++

      $name = [string]$element.Current.Name
      if (Test-OverlayTriggerName $name) {
        Add-OverlayHint $hints $name (Get-OverlayBoundsFromElement $element $rootBounds)
      }
      if (Test-InteractiveElement $element $rootBounds) {
        $interactiveBounds = Convert-UiaBounds $element.Current.BoundingRectangle
        Add-OverlayHint $hints $name (Expand-InteractiveBounds $interactiveBounds $rootBounds) "content-interactive"
      }

      $child = $script:uiaWalker.GetFirstChild($element)
      while ($null -ne $child -and $script:overlayVisitCount -lt 650) {
        Visit-OverlayElement $child ($depth + 1)
        $child = $script:uiaWalker.GetNextSibling($child)
      }
    }

    Visit-OverlayElement $root 0
  } catch {}

  return @($hints | Select-Object -First 16)
}

function Test-IntersectsDesktopArea($bounds) {
  if (-not $script:desktopArea) { return $false }

  $left = [double]$script:desktopArea.x
  $top = [double]$script:desktopArea.y
  $right = $left + [double]$script:desktopArea.width
  $bottom = $top + [double]$script:desktopArea.height
  $windowLeft = [double]$bounds.x
  $windowTop = [double]$bounds.y
  $windowRight = $windowLeft + [double]$bounds.width
  $windowBottom = $windowTop + [double]$bounds.height

  return $windowRight -gt $left -and $windowLeft -lt $right -and $windowBottom -gt $top -and $windowTop -lt $bottom
}

function Test-NeedsBlockingWindowScan($windowInfo) {
  if (-not $script:desktopArea) { return $false }
  $processName = ([string]$windowInfo.processName).ToLowerInvariant()
  if ($processName -eq "explorer") { return $true }

  $bounds = $windowInfo.bounds
  if (-not $bounds) { return $false }
  $smallWidth = [double]$bounds.width -lt ([double]$script:desktopArea.width * 0.58)
  $smallHeight = [double]$bounds.height -lt ([double]$script:desktopArea.height * 0.58)
  return $smallWidth -and $smallHeight
}

$script:ignoredHwnds = @{}
foreach ($ignoredHwnd in @($config.ignoredHwnds)) {
  if ($null -ne $ignoredHwnd) { $script:ignoredHwnds[[string]$ignoredHwnd] = $true }
}
$script:desktopArea = $config.desktopArea
$script:blockingWindows = New-Object System.Collections.Generic.List[object]
$hwnd = [ForegroundReader]::GetForegroundWindow()
$payload = Get-WindowPayload $hwnd

if (Test-NeedsBlockingWindowScan $payload) {
  [ForegroundReader]::EnumWindows({
    param([IntPtr]$window, [IntPtr]$lParam)

    if (-not [ForegroundReader]::IsWindowVisible($window)) { return $true }
    if ([ForegroundReader]::IsIconic($window)) { return $true }
    if (Test-Cloaked $window) { return $true }

    $windowInfo = Get-WindowPayload $window
    if ($windowInfo.bounds.width -le 0 -or $windowInfo.bounds.height -le 0) { return $true }
    if ($windowInfo.bounds.width -lt 96 -or $windowInfo.bounds.height -lt 80) { return $true }
    if (Test-ShellOrOverlayWindow $windowInfo) { return $true }
    if (-not (Test-IntersectsDesktopArea $windowInfo.bounds)) { return $true }

    $script:blockingWindows.Add($windowInfo) | Out-Null
    return $true
  }, [IntPtr]::Zero) | Out-Null
}
$payload | Add-Member -NotePropertyName contentOverlays -NotePropertyValue @(Get-ContentOverlayHints $hwnd $payload)
$payload | Add-Member -NotePropertyName desktop -NotePropertyValue @{
  clear = if ($script:desktopArea -and ([string]$payload.processName).ToLowerInvariant() -eq "explorer") { $script:blockingWindows.Count -eq 0 } else { $false }
  blockerCount = $script:blockingWindows.Count
  blockers = @($script:blockingWindows | Select-Object -First 5)
}
$payload | ConvertTo-Json -Compress -Depth 8
`;

async function getActiveWindow(options = {}) {
  if (process.platform === "win32") {
    return getWindowsActiveWindow(options);
  }
  if (process.platform === "darwin") {
    return getMacActiveWindow(options);
  }
  return getPortableActiveWindow(options);
}

async function getWindowsActiveWindow(options = {}) {
  const nativeWindow = await getNativeActiveWindow();
  if (options.fast === "desktop") {
    return await getNativeDesktopWindow(options, nativeWindow);
  }
  if (options.fast === true) {
    return nativeWindow;
  }
  if (nativeWindow && !shouldUsePowerShellInspection(nativeWindow, options)) {
    return nativeWindow;
  }

  const inspectedWindow = await getPowerShellActiveWindow(options);
  return inspectedWindow || nativeWindow;
}

async function getMacActiveWindow(options = {}) {
  const nativeWindow = await getNativeActiveWindow(getNativeWindowOptions(options));
  if (!nativeWindow) return null;

  return {
    ...nativeWindow,
    desktop: {
      clear: isMacDesktopForeground(nativeWindow),
      blockerCount: 0,
      blockers: []
    },
    source: nativeWindow.source || "get-windows-macos"
  };
}

async function getPortableActiveWindow(options = {}) {
  const nativeWindow = await getNativeActiveWindow(getNativeWindowOptions(options));
  if (!nativeWindow) return null;

  return {
    ...nativeWindow,
    desktop: {
      clear: false,
      blockerCount: 0,
      blockers: []
    }
  };
}

async function getNativeActiveWindow(options = {}) {
  try {
    const api = await loadNativeWindowApi();
    const windowInfo = await api.activeWindow(options);
    return normalizeNativeWindow(windowInfo);
  } catch {
    return null;
  }
}

function getNativeWindowOptions(options = {}, platform = process.platform) {
  if (platform !== "darwin") return {};

  if (options.fast === "desktop") {
    return {
      accessibilityPermission: false,
      screenRecordingPermission: false
    };
  }

  return {
    accessibilityPermission: options.macAccessibilityPermission !== false,
    screenRecordingPermission: options.macScreenRecordingPermission !== false
  };
}

async function loadNativeWindowApi() {
  if (!nativeWindowApiPromise) {
    nativeWindowApiPromise = import("get-windows").then((module) => {
      const activeWindow = module.activeWindow || module.default;
      const openWindows = module.openWindows;
      if (typeof activeWindow !== "function") {
        throw new Error("get-windows activeWindow API is unavailable");
      }
      if (typeof openWindows !== "function") {
        throw new Error("get-windows openWindows API is unavailable");
      }
      return { activeWindow, openWindows };
    });
  }
  return nativeWindowApiPromise;
}

async function getNativeDesktopWindow(options, activeWindow) {
  try {
    const api = await loadNativeWindowApi();
    const windows = await api.openWindows();
    const blockers = getDesktopBlockers(windows, options);
    const baseWindow = activeWindow || normalizeNativeWindow(windows[0]);
    if (!baseWindow) return null;
    return {
      ...baseWindow,
      desktop: {
        clear: blockers.length === 0,
        blockerCount: blockers.length,
        blockers: blockers.slice(0, 5)
      },
      source: "get-windows-desktop"
    };
  } catch {
    return activeWindow;
  }
}

function normalizeNativeWindow(windowInfo, platform = process.platform) {
  if (!windowInfo) return null;
  const bounds = normalizeBounds(windowInfo.bounds || windowInfo.contentBounds);
  const owner = windowInfo.owner || {};
  return {
    hwnd: String(windowInfo.id || ""),
    pid: Number.isFinite(Number(owner.processId)) ? Number(owner.processId) : null,
    processName: owner.name || "",
    bundleId: owner.bundleId || "",
    path: owner.path || "",
    title: windowInfo.title || "",
    url: windowInfo.url || "",
    platform: windowInfo.platform || platform,
    memoryUsageBytes: Number.isFinite(Number(windowInfo.memoryUsage)) ? Number(windowInfo.memoryUsage) : null,
    className: "",
    bounds,
    contentOverlays: [],
    desktop: {
      clear: false,
      blockerCount: 0,
      blockers: []
    },
    source: "get-windows"
  };
}

function normalizeBounds(bounds = {}) {
  const x = Math.round(Number(bounds.x));
  const y = Math.round(Number(bounds.y));
  const width = Math.round(Number(bounds.width));
  const height = Math.round(Number(bounds.height));
  if (![x, y, width, height].every(Number.isFinite)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return { x, y, width, height };
}

function getDesktopBlockers(windows = [], options = {}, platform = process.platform) {
  const ignoredHwnds = new Set((options.ignoredHwnds || []).map(String));
  const desktopArea = normalizeBounds(options.desktopArea);
  return windows
    .map((windowInfo) => normalizeNativeWindow(windowInfo, platform))
    .filter(Boolean)
    .filter((windowInfo) => !ignoredHwnds.has(String(windowInfo.hwnd)))
    .filter((windowInfo) => isDesktopBlockingWindow(windowInfo, desktopArea, platform));
}

function isDesktopBlockingWindow(windowInfo, desktopArea, platform = process.platform) {
  const bounds = windowInfo.bounds;
  if (!bounds || bounds.width < 96 || bounds.height < 80) return false;
  if (!boundsOverlap(bounds, desktopArea)) return false;
  if (isShellOrOwnOverlayWindow(windowInfo, platform)) return false;
  return true;
}

function isShellOrOwnOverlayWindow(windowInfo, platform = process.platform) {
  const processName = String(windowInfo.processName || "").toLowerCase();
  const title = String(windowInfo.title || "");
  const path = String(windowInfo.path || "").toLowerCase();
  if (processName.includes("explorer") || path.endsWith("\\explorer.exe")) return true;
  if (platform === "darwin" && processName === "finder") return true;
  if (processName === "electron" && /^(谁在吃 token|LLM HUD)$/i.test(title)) return true;
  return false;
}

function isMacDesktopForeground(activeWindow) {
  const processName = String(activeWindow?.processName || "").toLowerCase();
  const bundleId = String(activeWindow?.bundleId || "").toLowerCase();
  const title = String(activeWindow?.title || "").trim().toLowerCase();
  return (processName === "finder" || bundleId === "com.apple.finder") &&
    (!title || title === "desktop" || title === "桌面");
}

function boundsOverlap(first, second) {
  if (!first || !second) return false;
  const firstRight = first.x + first.width;
  const firstBottom = first.y + first.height;
  const secondRight = second.x + second.width;
  const secondBottom = second.y + second.height;
  return firstRight > second.x && first.x < secondRight && firstBottom > second.y && first.y < secondBottom;
}

function shouldUsePowerShellInspection(activeWindow, options = {}) {
  const processName = String(activeWindow.processName || "").toLowerCase();
  const title = String(activeWindow.title || "").trim().toLowerCase();

  if (isHermesWindow(activeWindow)) return true;
  if (isUnreliableShellForeground(activeWindow)) return options.inspectUnreliableShell !== false;
  if (processName === "explorer") return options.inspectExplorer !== false;
  if (title === "program manager" || title === "desktop") return options.inspectExplorer !== false;
  if (isSmallForegroundWindow(activeWindow, options.desktopArea)) return options.inspectSmallWindows !== false;

  return false;
}

function isHermesWindow(activeWindow) {
  const processName = String(activeWindow?.processName || "").toLowerCase();
  const haystack = `${activeWindow?.title || ""} ${activeWindow?.path || ""}`;
  if (processName === "hermes-web-ui") return true;
  return /(hermes|127\.0\.0\.1:8648|localhost:8648)/i.test(haystack);
}

function isUnreliableShellForeground(activeWindow) {
  const processName = String(activeWindow?.processName || "").toLowerCase();
  const title = String(activeWindow?.title || "").toLowerCase();
  const path = String(activeWindow?.path || "").toLowerCase();
  return (
    processName === "idle" ||
    processName === "lockapp.exe" ||
    path.includes("\\microsoft.lockapp_") ||
    title.includes("锁屏") ||
    title.includes("lock screen")
  );
}

function isSmallForegroundWindow(activeWindow, desktopArea) {
  const bounds = activeWindow?.bounds;
  if (!bounds || !desktopArea) return false;
  const desktopWidth = Number(desktopArea.width);
  const desktopHeight = Number(desktopArea.height);
  if (!Number.isFinite(desktopWidth) || !Number.isFinite(desktopHeight)) return false;
  if (bounds.width <= 0 || bounds.height <= 0) return false;
  return bounds.width < desktopWidth * 0.58 && bounds.height < desktopHeight * 0.58;
}

function getPowerShellActiveWindow(options = {}) {
  const config = JSON.stringify({
    ignoredHwnds: (options.ignoredHwnds || []).map(String),
    desktopArea: options.desktopArea || null
  });
  const script = POWERSHELL_SCRIPT.replace("__CONFIG_JSON__", config);

  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, timeout: 3500 },
      (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve(null);
          return;
        }

        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve(null);
        }
      }
    );
  });
}

module.exports = {
  getActiveWindow,
  _test: {
    boundsOverlap,
    getDesktopBlockers,
    getNativeWindowOptions,
    isDesktopBlockingWindow,
    isMacDesktopForeground,
    isShellOrOwnOverlayWindow,
    normalizeBounds,
    normalizeNativeWindow,
    shouldUsePowerShellInspection
  }
};
