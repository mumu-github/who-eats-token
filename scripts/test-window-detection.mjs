import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { _test } = require("../src/system/active-window.cjs");

testMacPermissionOptions();
testMacDesktopDetection();
testDesktopBlockerFiltering();
testWindowsFallbackDecisions();

console.log("Window detection checks passed.");

function testMacPermissionOptions() {
  assert.deepEqual(
    _test.getNativeWindowOptions({ fast: "desktop" }, "darwin"),
    {
      accessibilityPermission: false,
      screenRecordingPermission: false
    },
    "macOS desktop checks should avoid permission prompts."
  );

  assert.deepEqual(
    _test.getNativeWindowOptions({}, "darwin"),
    {
      accessibilityPermission: true,
      screenRecordingPermission: true
    },
    "macOS HUD checks should request full active-window metadata."
  );

  assert.deepEqual(
    _test.getNativeWindowOptions({
      macAccessibilityPermission: false,
      macScreenRecordingPermission: false
    }, "darwin"),
    {
      accessibilityPermission: false,
      screenRecordingPermission: false
    },
    "macOS permission flags should be individually disableable for degraded checks."
  );

  assert.deepEqual(
    _test.getNativeWindowOptions({ fast: "desktop" }, "win32"),
    {},
    "Non-macOS platforms should not receive macOS permission flags."
  );
}

function testMacDesktopDetection() {
  assert.equal(
    _test.isMacDesktopForeground({
      processName: "Finder",
      bundleId: "com.apple.finder",
      title: ""
    }),
    true,
    "Finder with an empty title should count as desktop."
  );
  assert.equal(
    _test.isMacDesktopForeground({
      processName: "Finder",
      bundleId: "com.apple.finder",
      title: "Desktop"
    }),
    true,
    "Finder Desktop should count as desktop."
  );
  assert.equal(
    _test.isMacDesktopForeground({
      processName: "Finder",
      bundleId: "com.apple.finder",
      title: "Documents"
    }),
    false,
    "Finder file windows should not count as desktop."
  );
  assert.equal(
    _test.isMacDesktopForeground({
      processName: "Google Chrome",
      bundleId: "com.google.Chrome",
      title: "Hermes"
    }),
    false,
    "Browser foreground should not show the desktop top bar."
  );
}

function testDesktopBlockerFiltering() {
  const desktopArea = { x: 0, y: 0, width: 1440, height: 900 };
  const windows = [
    nativeWindow("finder", "Desktop", { x: 0, y: 0, width: 1440, height: 900 }, "com.apple.finder"),
    nativeWindow("Who Eats Token", "谁在吃 token", { x: 420, y: 12, width: 720, height: 54 }),
    nativeWindow("Google Chrome", "Hermes", { x: 100, y: 100, width: 900, height: 640 }),
    nativeWindow("Tiny", "Tooltip", { x: 20, y: 20, width: 40, height: 32 }),
    nativeWindow("Offscreen", "Hidden", { x: 2000, y: 100, width: 600, height: 400 })
  ];

  const blockers = _test.getDesktopBlockers(windows, { desktopArea }, "darwin");
  assert.deepEqual(
    blockers.map((windowInfo) => windowInfo.processName),
    ["Google Chrome"],
    "Desktop blocker scan should ignore Finder, own HUD/topbar, tiny windows, and offscreen windows."
  );

  assert.equal(
    _test.isDesktopBlockingWindow(
      _test.normalizeNativeWindow(nativeWindow("explorer", "Program Manager", desktopArea), "win32"),
      desktopArea,
      "win32"
    ),
    false,
    "Windows shell windows should not block desktop visibility."
  );
}

function testWindowsFallbackDecisions() {
  const desktopArea = { x: 0, y: 0, width: 1920, height: 1080 };
  assert.equal(
    _test.shouldUsePowerShellInspection({
      processName: "explorer",
      title: "Program Manager",
      bounds: desktopArea
    }, { desktopArea }),
    true,
    "Explorer desktop needs the PowerShell blocker scan."
  );

  assert.equal(
    _test.shouldUsePowerShellInspection({
      processName: "hermes-web-ui",
      title: "Hermes",
      bounds: { x: 0, y: 0, width: 1280, height: 720 }
    }, { desktopArea }),
    true,
    "Hermes native windows should use richer inspection for overlay hints."
  );

  assert.equal(
    _test.shouldUsePowerShellInspection({
      processName: "chrome",
      title: "Regular Page",
      bounds: { x: 0, y: 0, width: 1280, height: 720 }
    }, { desktopArea }),
    false,
    "Normal large app windows should stay on the low-overhead native path."
  );

  assert.equal(
    _test.shouldUsePowerShellInspection({
      processName: "chrome",
      title: "Download",
      bounds: { x: 100, y: 100, width: 420, height: 260 }
    }, { desktopArea, inspectSmallWindows: false }),
    false,
    "Small-window rich inspection should be disableable to avoid repeated expensive scans."
  );
}

function nativeWindow(name, title, bounds, bundleId = "") {
  return {
    id: `${name}-${title}`,
    title,
    bounds,
    owner: {
      name,
      bundleId,
      processId: 1234,
      path: name === "Who Eats Token" ? "/Applications/Who Eats Token.app" : ""
    }
  };
}
