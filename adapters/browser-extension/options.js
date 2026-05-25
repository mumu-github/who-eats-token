const DEFAULT_SETTINGS = {
  enabled: true,
  endpoint: "http://127.0.0.1:17667",
  token: ""
};

const enabledInput = document.querySelector("#enabled");
const endpointInput = document.querySelector("#endpoint");
const tokenInput = document.querySelector("#token");
const saveButton = document.querySelector("#save");
const testButton = document.querySelector("#test");
const statusLine = document.querySelector("#status");

chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
  enabledInput.checked = Boolean(settings.enabled);
  endpointInput.value = settings.endpoint || DEFAULT_SETTINGS.endpoint;
  tokenInput.value = settings.token || "";
});

saveButton.addEventListener("click", () => {
  chrome.storage.local.set(readForm(), () => {
    setStatus("Saved.");
  });
});

testButton.addEventListener("click", () => {
  setStatus("Testing...");
  chrome.runtime.sendMessage({ type: "WHO_EATS_TOKEN_PING" }, (result) => {
    if (chrome.runtime.lastError) {
      setStatus(`Connection failed: ${chrome.runtime.lastError.message}`);
      return;
    }
    if (result?.ok) {
      const summary = result.body?.providerHealth?.summary || {};
      const count = summary.total ?? result.body?.providerHealth?.providers?.length ?? 0;
      const attention = summary.attention ?? 0;
      setStatus(`Connected: ${count} providers, ${attention} need attention`);
      return;
    }
    setStatus(`Connection failed: HTTP ${result?.status || "?"} ${result?.body?.error || result?.error || ""}`.trim());
  });
});

function readForm() {
  return {
    enabled: enabledInput.checked,
    endpoint: normalizeEndpoint(endpointInput.value),
    token: tokenInput.value.trim()
  };
}

function normalizeEndpoint(value) {
  const text = String(value || DEFAULT_SETTINGS.endpoint).trim().replace(/\/+$/, "");
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(text)) return text;
  return DEFAULT_SETTINGS.endpoint;
}

function setStatus(message) {
  statusLine.textContent = message;
}
