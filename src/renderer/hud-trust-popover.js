const els = {
  root: document.getElementById("hudTrustPopover"),
  status: document.getElementById("trustStatus"),
  rows: document.getElementById("trustRows"),
  privacy: document.getElementById("trustPrivacy"),
  explain: document.getElementById("trustExplain"),
  action: document.getElementById("trustAction")
};

window.tokenBar.onHudTrustPopoverUpdate(renderPopover);
window.tokenBar.onSettingsUpdate(applyVisualSettings);
window.tokenBar.getSettings().then(applyVisualSettings);

function renderPopover(details) {
  if (!details) return;

  els.root.dataset.level = details.level || "missing";
  els.status.textContent = details.status || "等待";
  els.rows.replaceChildren(...(details.rows || []).map(renderRow));
  els.privacy.textContent = details.privacy || "未读取 prompt / completion / API key";
  els.explain.textContent = details.explain || "等待数据。";
  els.action.textContent = details.action ? `${details.action} →` : "了解更多数据口径 →";
  requestPopoverResize();
}

function renderRow(row) {
  const item = document.createElement("div");
  item.className = "hud-popover-row";

  const marker = document.createElement("span");
  marker.className = "hud-popover-icon";
  marker.textContent = getIconText(row.label);

  const label = document.createElement("strong");
  label.textContent = `${row.label}：`;

  const value = document.createElement("span");
  value.textContent = row.value || "--";

  item.append(marker, label, value);
  return item;
}

function getIconText(label) {
  const icons = {
    来源: "↔",
    更新时间: "◷",
    新鲜度: "✦",
    单位: "◎",
    刷新策略: "⟳"
  };
  return icons[label] || "•";
}

function applyVisualSettings(settings) {
  if (!settings?.appearance) return;
  const root = document.documentElement;
  root.style.setProperty("--glass-opacity", settings.appearance.glassOpacity);
  root.style.setProperty("--glass-blur", `${settings.appearance.glassBlur}px`);
  root.style.setProperty("--font-scale", settings.appearance.fontScale);
  requestPopoverResize();
}

function requestPopoverResize() {
  if (!window.tokenBar.resizeHudTrustPopover) return;
  const send = () => {
    const height = Math.ceil(els.root.scrollHeight + 20);
    window.tokenBar.resizeHudTrustPopover({ height });
  };
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(send);
    return;
  }
  send();
}
