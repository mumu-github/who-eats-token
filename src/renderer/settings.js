const state = {
  settings: null
};

const els = {
  close: document.getElementById("settingsClose"),
  save: document.getElementById("settingsSave"),
  reset: document.getElementById("settingsReset"),
  status: document.getElementById("settingsState"),
  providers: document.getElementById("providerSettings")
};

els.close.addEventListener("click", () => window.tokenBar.closeSettings());
els.save.addEventListener("click", saveSettings);
els.reset.addEventListener("click", resetSettings);

for (const input of document.querySelectorAll("[data-path]")) {
  input.addEventListener("input", () => {
    updateOutputs();
    applyVisualSettings(buildSettingsFromForm());
    markDirty();
  });
}

window.tokenBar.onSettingsUpdate(renderSettings);
window.tokenBar.getSettings().then(renderSettings);

function renderSettings(settings) {
  state.settings = normalizeForForm(settings);
  applyFormValues(state.settings);
  renderProviders(state.settings);
  applyVisualSettings(state.settings);
  updateOutputs();
  setStatus("已同步");
}

function applyFormValues(settings) {
  for (const input of document.querySelectorAll("[data-path]")) {
    const value = getPath(settings, input.dataset.path);
    if (input.type === "checkbox") {
      input.checked = Boolean(value);
    } else {
      input.value = value;
    }
  }
}

function renderProviders(settings) {
  const registry = settings.providerRegistry || [];
  els.providers.replaceChildren(
    ...registry.map((provider) => {
      const row = document.createElement("label");
      row.className = "provider-setting";
      row.dataset.source = provider.source;

      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.provider = provider.id;
      input.checked = Boolean(provider.enabled);
      input.disabled = provider.source === "planned";
      input.addEventListener("change", markDirty);

      const copy = document.createElement("span");
      copy.className = "provider-setting-copy";

      const name = document.createElement("strong");
      name.textContent = provider.name;

      const source = document.createElement("span");
      source.textContent = getProviderSourceLabel(provider.source);

      copy.append(name, source);
      row.append(input, copy);
      return row;
    })
  );
}

function buildSettingsFromForm() {
  const settings = structuredClone(state.settings);
  delete settings.providerRegistry;
  for (const input of document.querySelectorAll("[data-path]")) {
    let value = input.type === "checkbox" ? input.checked : Number(input.value);
    if (input.dataset.path === "behavior.refreshSeconds") {
      setPath(settings, "behavior.refreshMs", value * 1000);
      continue;
    }
    if (input.dataset.path === "behavior.activeWindowSeconds") {
      setPath(settings, "behavior.activeWindowMs", value * 1000);
      continue;
    }
    setPath(settings, input.dataset.path, value);
  }

  for (const input of document.querySelectorAll("[data-provider]")) {
    const provider = settings.providers[input.dataset.provider];
    if (provider) provider.enabled = input.checked;
  }
  delete settings.behavior.refreshSeconds;
  delete settings.behavior.activeWindowSeconds;
  return settings;
}

async function saveSettings() {
  const next = buildSettingsFromForm();
  const saved = await window.tokenBar.saveSettings(next);
  renderSettings(saved);
  setStatus("已保存");
}

async function resetSettings() {
  const saved = await window.tokenBar.resetSettings();
  renderSettings(saved);
  setStatus("已恢复");
}

function normalizeForForm(settings) {
  const output = structuredClone(settings);
  output.behavior.refreshSeconds = Math.round(output.behavior.refreshMs / 1000);
  output.behavior.activeWindowSeconds = Math.round(output.behavior.activeWindowMs / 1000);
  return output;
}

function updateOutputs() {
  for (const output of document.querySelectorAll("output[data-for]")) {
    const input = document.querySelector(`[data-path="${output.dataset.for}"]`);
    if (!input) continue;
    output.textContent = formatOutput(output.dataset.for, Number(input.value));
  }
}

function formatOutput(path, value) {
  if (path === "windows.desktopWidthRatio") return `${Math.round(value * 100)}%`;
  if (path === "appearance.glassOpacity") return `${Math.round(value * 100)}%`;
  if (path === "appearance.glassBlur") return `${value}px`;
  if (path === "appearance.fontScale") return `${Math.round(value * 100)}%`;
  if (path === "behavior.refreshSeconds" || path === "behavior.activeWindowSeconds") return `${value}s`;
  return String(value);
}

function getProviderSourceLabel(source) {
  if (source === "codex-jsonl") return "实时";
  if (source === "http-ingest") return "本地 API";
  if (source === "hermes-local") return "Token Plan";
  if (source === "hermes-bridge") return "桥接";
  return "预留";
}

function applyVisualSettings(settings) {
  if (!settings?.appearance) return;
  const root = document.documentElement;
  root.style.setProperty("--glass-opacity", settings.appearance.glassOpacity);
  root.style.setProperty("--glass-blur", `${settings.appearance.glassBlur}px`);
  root.style.setProperty("--font-scale", settings.appearance.fontScale);
}

function markDirty() {
  setStatus("未保存");
}

function setStatus(value) {
  els.status.textContent = value;
}

function getPath(object, path) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}

function setPath(object, path, value) {
  const parts = path.split(".");
  const final = parts.pop();
  let cursor = object;
  for (const part of parts) {
    cursor[part] = cursor[part] || {};
    cursor = cursor[part];
  }
  cursor[final] = value;
}
