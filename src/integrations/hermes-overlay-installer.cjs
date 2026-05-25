const fs = require("node:fs");
const path = require("node:path");

const SCRIPT_NAME = "who-eats-token-overlay.js";
const SCRIPT_TAG = `<script src="/${SCRIPT_NAME}"></script>`;

const OVERLAY_SCRIPT = String.raw`(() => {
  if (window.__whoEatsTokenOverlayInstalled) return;
  window.__whoEatsTokenOverlayInstalled = true;

  const ENDPOINT = "http://127.0.0.1:17667/overlays";
  const ACCESS_TOKEN = __WHO_EATS_TOKEN_ACCESS_TOKEN__;
  const KEYWORD_RE = /(消息队列|继续|还没好吗|还没好|没好|好了|重试|取消|发送|选择文件夹|选择文件|Message\s*Queue|\bQueue\b|\bContinue\b|Not\s*yet|Still\s*not|Retry|Cancel|Send|Choose\s*Folder|Choose\s*File)/i;
  const PANEL_CLASS_RE = /(modal|dialog|popover|drawer|sheet|overlay|floating|dropdown|menu|tooltip|queue|toast|mask|backdrop)/i;
  const ROOT_LAYOUT_RE = /(^|\s|[-_])(app-main|main-layout|router-view|page-shell|app-shell|chat-view|app\s*main)(\s|[-_]|$)/i;
  const SEMANTIC_ROLES = new Set(["dialog", "alertdialog", "menu", "listbox", "tooltip"]);
  const OVERLAY_SELECTOR = [
    "dialog[open]",
    "[role='dialog']",
    "[role='alertdialog']",
    "[role='menu']",
    "[role='listbox']",
    "[role='tooltip']",
    "[aria-modal='true']",
    "[popover]",
    "[data-state='open']",
    "[class*='modal' i]",
    "[class*='dialog' i]",
    "[class*='popover' i]",
    "[class*='drawer' i]",
    "[class*='toast' i]",
    "[class*='queue' i]",
    "[class*='dropdown' i]"
  ].join(",");
  const INTERACTIVE_SELECTOR = [
    "button",
    "input",
    "textarea",
    "select",
    "a[href]",
    "[role='button']",
    "[role='textbox']",
    "[contenteditable='true']"
  ].join(",");
  const MIN_PANEL_WIDTH = 220;
  const MIN_PANEL_HEIGHT = 88;

  let lastSignature = "";
  let lastSentAt = 0;
  let scheduled = false;
  let scheduleTimer = null;
  let keepAliveTimer = null;

  function scheduleReport() {
    if (scheduled) return;
    scheduled = true;
    window.clearTimeout(scheduleTimer);
    scheduleTimer = window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        scheduled = false;
        reportOverlays();
      });
    }, 120);
  }

  function reportOverlays() {
    const overlays = [
      ...collectOverlays(),
      ...collectInteractiveAvoidTargets()
    ];
    const signature = JSON.stringify(overlays.map((overlay) => [
      overlay.label,
      overlay.bounds.x,
      overlay.bounds.y,
      overlay.bounds.width,
      overlay.bounds.height
    ]));
    const now = Date.now();

    if (signature === lastSignature && now - lastSentAt < 1200) return;
    lastSignature = signature;
    lastSentAt = now;
    window.clearTimeout(keepAliveTimer);
    keepAliveTimer = null;
    if (overlays.length > 0) {
      keepAliveTimer = window.setTimeout(scheduleReport, 2400);
    }

    fetch(ENDPOINT, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
        ...(ACCESS_TOKEN ? { "X-Who-Eats-Token": ACCESS_TOKEN } : {})
      },
      body: JSON.stringify({
        source: "hermes-web-ui-dom",
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString(),
        overlays
      })
    }).catch(() => {});
  }

  function collectOverlays() {
    const elements = Array.from(new Set([
      ...document.querySelectorAll(OVERLAY_SELECTOR),
      ...Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR)).filter((element) => (
        element instanceof HTMLElement && KEYWORD_RE.test(getElementLabel(element))
      ))
    ]));
    const candidates = [];

    for (const element of elements) {
      if (!(element instanceof HTMLElement)) continue;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (!isVisibleElement(element, rect, style)) continue;

      const label = getElementLabel(element);
      const keywordHit = KEYWORD_RE.test(label);
      const semanticHit = isSemanticOverlay(element);
      const floatingHit = isFloatingPanel(element, rect, style);

      if (!keywordHit && !semanticHit && !floatingHit) continue;

      const container = keywordHit ? findOverlayContainer(element) : element;
      const containerRect = container.getBoundingClientRect();
      const containerStyle = window.getComputedStyle(container);
      if (!isVisibleElement(container, containerRect, containerStyle)) continue;
      if (!isUsefulOverlayBounds(containerRect)) continue;

      candidates.push({
        element: container,
        rect: containerRect,
        priority: keywordHit ? 90 : semanticHit ? 80 : 60,
        label: keywordHit ? label : getElementLabel(container) || "content-overlay"
      });
    }

    return dedupeCandidates(candidates)
      .sort((a, b) => b.priority - a.priority || area(b.rect) - area(a.rect))
      .slice(0, 12)
      .map((candidate) => ({
        type: "content-overlay",
        label: candidate.label.slice(0, 120) || "content-overlay",
        bounds: toScreenBounds(candidate.rect)
      }));
  }

  function collectInteractiveAvoidTargets() {
    const candidates = [];
    const elements = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR));

    for (const element of elements) {
      if (!(element instanceof HTMLElement)) continue;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (!isVisibleElement(element, rect, style)) continue;
      if (!isUsefulInteractiveBounds(rect)) continue;
      if (isDisabledControl(element, style)) continue;

      const label = getElementLabel(element) || element.tagName.toLowerCase();
      candidates.push({
        element,
        rect,
        priority: getInteractivePriority(element, rect),
        label
      });
    }

    return dedupeCandidates(candidates)
      .sort((a, b) => b.priority - a.priority || area(b.rect) - area(a.rect))
      .slice(0, 24)
      .map((candidate) => ({
        type: "content-interactive",
        label: candidate.label.slice(0, 120) || "interactive-control",
        bounds: expandScreenBounds(toScreenBounds(candidate.rect), 10)
      }));
  }

  function isVisibleElement(element, rect, style) {
    if (!rect || rect.width < 16 || rect.height < 16) return false;
    if (element === document.body || element === document.documentElement) return false;
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number.parseFloat(style.opacity || "1") < 0.05) return false;
    if (rect.right <= 0 || rect.bottom <= 0) return false;
    if (rect.left >= window.innerWidth || rect.top >= window.innerHeight) return false;
    return true;
  }

  function isSemanticOverlay(element) {
    const role = (element.getAttribute("role") || "").toLowerCase();
    if (SEMANTIC_ROLES.has(role)) return true;
    if (element.getAttribute("aria-modal") === "true") return true;
    if (element.tagName === "DIALOG" && element.open) return true;
    try {
      if (element.matches("[popover]:popover-open")) return true;
    } catch {}
    return false;
  }

  function isFloatingPanel(element, rect, style) {
    if (!isUsefulOverlayBounds(rect)) return false;

    const position = style.position;
    const zIndex = Number.parseInt(style.zIndex, 10);
    const hasHighLayer = Number.isFinite(zIndex) && zIndex >= 10;
    const isFloating = position === "fixed" || position === "absolute" || position === "sticky";
    const identity = [
      element.id,
      element.className && String(element.className),
      element.getAttribute("data-state"),
      element.getAttribute("data-headlessui-state")
    ].filter(Boolean).join(" ");
    const largePanel = rect.width >= window.innerWidth * 0.78 && rect.height >= window.innerHeight * 0.78;

    if (ROOT_LAYOUT_RE.test(identity) && largePanel) return false;
    if (largePanel && !PANEL_CLASS_RE.test(identity)) return false;
    if (!isFloating && !hasHighLayer && !PANEL_CLASS_RE.test(identity)) return false;
    return hasPanelSurface(style) || PANEL_CLASS_RE.test(identity);
  }

  function hasPanelSurface(style) {
    if (backgroundAlpha(style.backgroundColor) >= 0.12) return true;
    if (backgroundAlpha(style.borderColor) >= 0.12) return true;
    if (style.boxShadow && style.boxShadow !== "none") return true;
    if (style.backdropFilter && style.backdropFilter !== "none") return true;
    if (style.filter && /blur|drop-shadow/i.test(style.filter)) return true;
    return false;
  }

  function isUsefulOverlayBounds(rect) {
    if (rect.width < MIN_PANEL_WIDTH || rect.height < MIN_PANEL_HEIGHT) return false;
    if (rect.width > window.innerWidth * 0.995 && rect.height > window.innerHeight * 0.995) return false;
    return true;
  }

  function isUsefulInteractiveBounds(rect) {
    if (rect.width < 36 || rect.height < 24) return false;
    if (rect.width > window.innerWidth * 0.98 && rect.height > window.innerHeight * 0.5) return false;
    return true;
  }

  function isDisabledControl(element, style) {
    if (element.disabled) return true;
    if (element.getAttribute("aria-disabled") === "true") return true;
    if (style.pointerEvents === "none") return true;
    return false;
  }

  function getInteractivePriority(element, rect) {
    let priority = 40;
    const label = getElementLabel(element);
    if (/发送|继续|结算|付款|授权|预检|确认|取消|重试|Send|Continue|Checkout|Pay|Authorize|Confirm|Cancel|Retry/i.test(label)) {
      priority += 40;
    }
    if (rect.top > window.innerHeight * 0.45) priority += 15;
    if (rect.left > window.innerWidth * 0.45) priority += 10;
    if (element.tagName === "BUTTON" || element.getAttribute("role") === "button") priority += 8;
    return priority;
  }

  function findOverlayContainer(element) {
    let best = element;
    let current = element;

    for (let i = 0; i < 9 && current && current.parentElement; i++) {
      current = current.parentElement;
      if (current === document.body || current === document.documentElement) break;

      const rect = current.getBoundingClientRect();
      const style = window.getComputedStyle(current);
      if (!isVisibleElement(current, rect, style)) continue;
      if (!isUsefulOverlayBounds(rect)) continue;

      if (isSemanticOverlay(current) || isFloatingPanel(current, rect, style) || hasPanelSurface(style)) {
        best = current;
      }
    }

    return best;
  }

  function dedupeCandidates(candidates) {
    const result = [];
    for (const candidate of candidates) {
      const duplicate = result.find((current) => similarBounds(current.rect, candidate.rect));
      if (!duplicate) {
        result.push(candidate);
      } else if (candidate.priority > duplicate.priority || area(candidate.rect) > area(duplicate.rect)) {
        Object.assign(duplicate, candidate);
      }
    }
    return result;
  }

  function similarBounds(first, second) {
    return Math.abs(first.left - second.left) < 8 &&
      Math.abs(first.top - second.top) < 8 &&
      Math.abs(first.width - second.width) < 16 &&
      Math.abs(first.height - second.height) < 16;
  }

  function getElementLabel(element) {
    return [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("role"),
      element.id,
      element.className && String(element.className),
      element.innerText
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  function backgroundAlpha(value) {
    if (!value || value === "transparent") return 0;
    const rgba = value.match(/rgba?\(([^)]+)\)/i);
    if (!rgba) return 1;
    const parts = rgba[1].split(",").map((part) => part.trim());
    if (parts.length < 4) return 1;
    const alpha = Number.parseFloat(parts[3]);
    return Number.isFinite(alpha) ? alpha : 1;
  }

  function area(rect) {
    return rect.width * rect.height;
  }

  function toScreenBounds(rect) {
    const leftGap = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
    const topGap = Math.max(0, window.outerHeight - window.innerHeight - leftGap);
    const screenLeft = Number.isFinite(window.screenX) ? window.screenX : window.screenLeft || 0;
    const screenTop = Number.isFinite(window.screenY) ? window.screenY : window.screenTop || 0;

    return {
      x: Math.round(screenLeft + leftGap + rect.left),
      y: Math.round(screenTop + topGap + rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }

  function expandScreenBounds(bounds, margin) {
    return {
      x: bounds.x - margin,
      y: bounds.y - margin,
      width: bounds.width + margin * 2,
      height: bounds.height + margin * 2
    };
  }

  const observer = new MutationObserver(scheduleReport);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "open", "aria-hidden", "aria-modal", "role", "data-state"]
  });

  window.addEventListener("resize", scheduleReport, { passive: true });
  window.addEventListener("scroll", scheduleReport, { passive: true, capture: true });
  window.addEventListener("focus", scheduleReport, { passive: true });
  window.addEventListener("click", () => setTimeout(scheduleReport, 80), { passive: true, capture: true });
  window.addEventListener("keydown", () => setTimeout(scheduleReport, 80), { passive: true, capture: true });
  setTimeout(reportOverlays, 400);
})();`;

function ensureHermesOverlayInstalled({ accessToken = "" } = {}) {
  const results = [];
  const overlayScript = buildOverlayScript(accessToken);
  for (const clientDir of getCandidateClientDirs()) {
    const result = installIntoClientDir(clientDir, overlayScript);
    if (result) results.push(result);
  }
  return results;
}

function installIntoClientDir(clientDir, overlayScript) {
  const indexPath = path.join(clientDir, "index.html");
  if (!fs.existsSync(indexPath)) return null;

  let changed = false;
  const scriptPath = path.join(clientDir, SCRIPT_NAME);
  const currentScript = fs.existsSync(scriptPath) ? fs.readFileSync(scriptPath, "utf8") : "";
  if (currentScript !== overlayScript) {
    fs.writeFileSync(scriptPath, overlayScript, "utf8");
    changed = true;
  }

  const currentHtml = fs.readFileSync(indexPath, "utf8");
  if (!currentHtml.includes(SCRIPT_TAG)) {
    const nextHtml = currentHtml.includes("</head>")
      ? currentHtml.replace("</head>", `  ${SCRIPT_TAG}\n</head>`)
      : `${currentHtml}\n${SCRIPT_TAG}\n`;
    fs.writeFileSync(indexPath, nextHtml, "utf8");
    changed = true;
  }

  return {
    clientDir,
    scriptPath,
    indexPath,
    changed
  };
}

function buildOverlayScript(accessToken) {
  return OVERLAY_SCRIPT.replace(
    "__WHO_EATS_TOKEN_ACCESS_TOKEN__",
    JSON.stringify(String(accessToken || ""))
  );
}

function getCandidateClientDirs() {
  const explicitClientDir = process.env.HERMES_WEB_UI_CLIENT_DIR;
  if (explicitClientDir) return [explicitClientDir];

  const candidates = process.platform === "win32"
    ? [
        process.env.APPDATA && path.join(process.env.APPDATA, "npm", "node_modules", "hermes-web-ui", "dist", "client"),
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "npm", "node_modules", "hermes-web-ui", "dist", "client")
      ]
    : [
        process.env.npm_config_prefix && path.join(process.env.npm_config_prefix, "lib", "node_modules", "hermes-web-ui", "dist", "client"),
        "/opt/homebrew/lib/node_modules/hermes-web-ui/dist/client",
        "/usr/local/lib/node_modules/hermes-web-ui/dist/client",
        path.join(process.env.HOME || "", ".npm-global", "lib", "node_modules", "hermes-web-ui", "dist", "client")
      ];

  return Array.from(new Set(candidates.filter(Boolean)));
}

module.exports = {
  ensureHermesOverlayInstalled
};
