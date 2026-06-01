# wake-probe.ps1 — Desktop wake probe for who-eats-token
# Streams JSON lines describing the foreground window when it is the desktop
# or an offscreen/minimized window steals foreground.
param(
  [int]$IntervalMs = 50
)

$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class ToolDesktopWakeProbe {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", SetLastError=true)]
  public static extern IntPtr GetShellWindow();
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
  [ToolDesktopWakeProbe]::GetWindowText($window, $text, $text.Capacity) | Out-Null
  return $text.ToString()
}

function Get-ClassValue([IntPtr]$window) {
  $class = New-Object System.Text.StringBuilder 256
  [ToolDesktopWakeProbe]::GetClassName($window, $class, $class.Capacity) | Out-Null
  return $class.ToString()
}

function Write-WindowPayload([IntPtr]$window, [string]$source) {
  if ($window -eq [IntPtr]::Zero) { return }
  $processId = 0
  [ToolDesktopWakeProbe]::GetWindowThreadProcessId($window, [ref]$processId) | Out-Null
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  $path = ""
  try {
    if ($process -and $process.Path) { $path = $process.Path }
  } catch {}
  $rect = New-Object ToolDesktopWakeProbe+RECT
  [ToolDesktopWakeProbe]::GetWindowRect($window, [ref]$rect) | Out-Null
  [pscustomobject]@{
    hwnd = "$($window.ToInt64())"
    processName = if ($process) { $process.ProcessName } else { "" }
    path = $path
    title = Get-TextValue $window
    className = Get-ClassValue $window
    bounds = @{
      x = $rect.Left
      y = $rect.Top
      width = $rect.Right - $rect.Left
      height = $rect.Bottom - $rect.Top
    }
    source = $source
    desktop = @{
      clear = $true
      blockerCount = 0
      blockers = @()
    }
  } | ConvertTo-Json -Compress -Depth 4
  [Console]::Out.Flush()
}

while ($true) {
  $window = [ToolDesktopWakeProbe]::GetForegroundWindow()
  if ($window -ne [IntPtr]::Zero) {
    $processId = 0
    [ToolDesktopWakeProbe]::GetWindowThreadProcessId($window, [ref]$processId) | Out-Null
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    $path = ""
    try {
      if ($process -and $process.Path) { $path = $process.Path }
    } catch {}
    $processName = if ($process) { $process.ProcessName } else { "" }
    $title = Get-TextValue $window
    $className = Get-ClassValue $window
    $rect = New-Object ToolDesktopWakeProbe+RECT
    [ToolDesktopWakeProbe]::GetWindowRect($window, [ref]$rect) | Out-Null
    $processLower = $processName.ToLowerInvariant()
    $pathLower = $path.ToLowerInvariant()
    $titleLower = $title.Trim().ToLowerInvariant()
    $classLower = $className.Trim().ToLowerInvariant()
    $isOffscreenForeground = [ToolDesktopWakeProbe]::IsIconic($window) -or $rect.Left -le -30000 -or $rect.Top -le -30000
    $isExplorer = $processLower -eq "explorer" -or $pathLower.EndsWith("\explorer.exe")
    $isDesktop = $isExplorer -and (
      $classLower -eq "progman" -or
      $classLower -eq "workerw" -or
      $titleLower -eq "program manager" -or
      $titleLower -eq "desktop"
    )
    if ($isDesktop) {
      Write-WindowPayload $window "tool-desktop-wake-probe"
    } elseif ($isOffscreenForeground) {
      Write-WindowPayload ([ToolDesktopWakeProbe]::GetShellWindow()) "tool-desktop-wake-offscreen-probe"
    }
  }
  Start-Sleep -Milliseconds $IntervalMs
}
