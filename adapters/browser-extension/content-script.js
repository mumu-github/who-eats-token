(function installWhoEatsTokenAdapter() {
  if (window.__whoEatsTokenBrowserAdapterInstalled) return;
  window.__whoEatsTokenBrowserAdapterInstalled = true;

  const MIN_REPORT_INTERVAL_MS = 1200;
  const KEEPALIVE_MS = 2400;
  const MAX_OVERLAYS = 16;
  const SELECTORS = [
    "dialog[open]",
    "[role='dialog']",
    "[role='alertdialog']",
    "[aria-modal='true']",
    ".modal",
    ".ant-modal",
    ".semi-modal",
    ".MuiDialog-root",
    ".el-dialog",
    ".mantine-Modal-root",
    ".chakra-modal__content",
    "[data-radix-popper-content-wrapper]",
    "[data-state='open'][role='menu']",
    "button",
    "[role='button']",
    "input[type='submit']",
    "textarea",
    "[contenteditable='true']"
  ];
  const BUTTON_LABEL_RE = /(send|submit|continue|confirm|ok|发送|提交|继续|确认|确定|取消|授权|登录)/i;

  let scanTimer = null;
  let keepAliveTimer = null;
  let lastSignature = "";
  let lastSentAt = 0;

  scheduleScan(80);

  const observer = new MutationObserver(() => scheduleScan(160));
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      "aria-hidden",
      "aria-label",
      "aria-modal",
      "class",
      "hidden",
      "open",
      "role",
      "style"
    ]
  });

  for (const eventName of ["resize", "scroll", "focus", "click", "keydown", "pointerup"]) {
    window.addEventListener(eventName, () => scheduleScan(120), true);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      sendOverlayReport([], true);
      return;
    }
    scheduleScan(80);
  });

  window.addEventListener("pagehide", () => sendOverlayReport([], true));
  window.addEventListener("message", forwardUsageEvent);

  function scheduleScan(delayMs) {
    if (scanTimer) return;
    scanTimer = window.setTimeout(() => {
      scanTimer = null;
      window.requestAnimationFrame(scanAndReport);
    }, delayMs);
  }

  function scanAndReport() {
    if (document.visibilityState !== "visible") return;
    const overlays = collectOverlays();
    sendOverlayReport(overlays, false);
    window.clearTimeout(keepAliveTimer);
    keepAliveTimer = null;
    if (overlays.length > 0) {
      keepAliveTimer = window.setTimeout(() => scheduleScan(0), KEEPALIVE_MS);
    }
  }

  function collectOverlays() {
    const candidates = new Set();
    for (const selector of SELECTORS) {
      for (const element of safeQuery(selector)) candidates.add(element);
    }

    const overlays = [];
    for (const element of candidates) {
      const overlay = toOverlay(element);
      if (!overlay) continue;
      overlays.push(overlay);
      if (overlays.length >= MAX_OVERLAYS) break;
    }

    return overlays.sort((left, right) => area(right.bounds) - area(left.bounds));
  }

  function toOverlay(element) {
    if (!(element instanceof Element)) return null;
    const rect = element.getBoundingClientRect();
    if (!isVisible(element, rect)) return null;
    if (!isInterestingElement(element, rect)) return null;
    return {
      type: elementType(element),
      label: safeLabel(element),
      bounds: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    };
  }

  function isVisible(element, rect) {
    if (rect.width < 16 || rect.height < 16) return false;
    if (rect.bottom <= 0 || rect.right <= 0) return false;
    if (rect.top >= window.innerHeight || rect.left >= window.innerWidth) return false;
    if (element.closest("[aria-hidden='true'], [hidden]")) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0.04;
  }

  function isInterestingElement(element, rect) {
    const role = String(element.getAttribute("role") || "").toLowerCase();
    if (role === "dialog" || role === "alertdialog" || element.getAttribute("aria-modal") === "true") return true;
    if (element instanceof HTMLDialogElement && element.open) return true;
    if (isFixedOrSticky(element) && nearHudZone(rect)) return true;
    if (isControl(element)) return nearHudZone(rect) || BUTTON_LABEL_RE.test(readControlLabel(element));
    return false;
  }

  function isFixedOrSticky(element) {
    const position = window.getComputedStyle(element).position;
    return position === "fixed" || position === "sticky";
  }

  function nearHudZone(rect) {
    const rightZone = window.innerWidth * 0.45;
    const bottomZone = window.innerHeight * 0.42;
    return rect.right >= rightZone && rect.bottom >= bottomZone;
  }

  function isControl(element) {
    const tag = element.tagName.toLowerCase();
    const role = String(element.getAttribute("role") || "").toLowerCase();
    return tag === "button" ||
      tag === "textarea" ||
      tag === "input" ||
      role === "button" ||
      element.isContentEditable;
  }

  function elementType(element) {
    const role = element.getAttribute("role");
    if (role) return `role:${role}`;
    return element.tagName.toLowerCase();
  }

  function safeLabel(element) {
    const label = readControlLabel(element);
    if (label) return label.slice(0, 80);
    const role = element.getAttribute("role");
    if (role) return role.slice(0, 80);
    return element.tagName.toLowerCase();
  }

  function readControlLabel(element) {
    const values = [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-testid"),
      element.getAttribute("data-test-id")
    ].filter(Boolean);

    if (values.length) return String(values[0]).trim();
    if (isButtonLike(element)) return String(element.innerText || "").trim().slice(0, 32);
    return "";
  }

  function isButtonLike(element) {
    const tag = element.tagName.toLowerCase();
    const role = String(element.getAttribute("role") || "").toLowerCase();
    return tag === "button" || role === "button" || tag === "input";
  }

  function sendOverlayReport(overlays, force) {
    const signature = JSON.stringify(overlays.map((overlay) => [
      overlay.type,
      overlay.label,
      overlay.bounds.x,
      overlay.bounds.y,
      overlay.bounds.width,
      overlay.bounds.height
    ]));
    const now = Date.now();
    if (!force && signature === lastSignature && now - lastSentAt < KEEPALIVE_MS) return;
    if (!force && now - lastSentAt < MIN_REPORT_INTERVAL_MS) {
      scheduleScan(MIN_REPORT_INTERVAL_MS - (now - lastSentAt));
      return;
    }

    lastSignature = signature;
    lastSentAt = now;
    sendMessage({
      type: "WHO_EATS_TOKEN_OVERLAYS",
      payload: {
        schema: "who-eats-token.overlay.v1",
        timestamp: new Date().toISOString(),
        source: `browser-extension:${location.host || "local"}`,
        url: location.href,
        title: document.title,
        overlays
      }
    });
  }

  function forwardUsageEvent(event) {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.type !== "WHO_EATS_TOKEN_USAGE") return;
    if (!message.event || typeof message.event !== "object") return;
    sendMessage({
      type: "WHO_EATS_TOKEN_USAGE",
      payload: {
        ...message.event,
        source: message.event.source || `browser-extension:${location.host || "local"}`,
        metadata: {
          ...(message.event.metadata || {}),
          pageHost: location.host
        }
      }
    });
  }

  function sendMessage(message) {
    try {
      chrome.runtime.sendMessage(message, () => {
        chrome.runtime.lastError;
      });
    } catch {
      // The extension may be reloaded while the page stays open.
    }
  }

  function safeQuery(selector) {
    try {
      return document.querySelectorAll(selector);
    } catch {
      return [];
    }
  }

  function area(bounds) {
    return bounds.width * bounds.height;
  }
})();
