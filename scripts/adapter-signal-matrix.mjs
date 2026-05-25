import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "adapters", "catalog.json");
const matrixPath = path.join(root, "docs", "adapter-signal-matrix.md");
const args = parseArgs(process.argv.slice(2));
const signalDescriptions = {
  "usage-tokens": "Reads token counts from a local or native source.",
  "usage-events": "Posts explicit `who-eats-token.usage.v1` events.",
  "quota-capacity": "Provides account or window capacity such as 5-hour or weekly quota.",
  "quota-token-plan": "Provides credit-plan total, used, or remaining values.",
  "context-window": "Provides context-window used or remaining values.",
  "hud-overlays": "Reports short-lived rectangles that the in-tool HUD should avoid.",
  "local-health": "Reads or exposes the lightweight `/health` probe.",
  "snapshot-read": "Reads `/snapshot` or equivalent aggregate state.",
  "provider-health": "Reads, produces, or formats compact provider-health state.",
  "status-display": "Displays compact status without collecting new usage.",
  "setup-workflow": "Helps install, configure, or diagnose the app.",
  "adapter-authoring": "Helps contributors create or review adapters."
};
const signalKeys = Object.keys(signalDescriptions);
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const markdown = renderMatrix(catalog);

if (args.check) {
  const current = fs.existsSync(matrixPath) ? fs.readFileSync(matrixPath, "utf8") : "";
  if (normalizeNewlines(current) !== normalizeNewlines(markdown)) {
    console.error("docs/adapter-signal-matrix.md is out of date. Run `npm run adapter:signal-matrix`.");
    process.exit(1);
  }
} else {
  fs.writeFileSync(matrixPath, markdown, "utf8");
  if (args.json) {
    console.log(JSON.stringify({
      ok: true,
      output: path.relative(root, matrixPath).replaceAll("\\", "/"),
      adapters: catalog.adapters.length,
      signals: signalKeys.length
    }, null, 2));
  } else {
    console.log(`Wrote ${path.relative(root, matrixPath).replaceAll("\\", "/")}`);
  }
}

function renderMatrix(source) {
  const adapters = Array.isArray(source.adapters) ? source.adapters : [];
  const lines = [
    "# Adapter Signal Matrix",
    "",
    "Generated from `adapters/catalog.json`. Do not edit this table by hand; run `npm run adapter:signal-matrix` after changing adapter entries.",
    "",
    "Legend: `yes` means the adapter may provide that signal. Blank means it must not be treated as available.",
    "",
    "| Adapter | Status | Platforms | Type | Usage | Capacity | Token Plan | Context | HUD Avoidance | Health | Snapshot | Status Display | Workflows |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  ];

  for (const adapter of adapters) {
    const signals = new Set(adapter.providedSignals || []);
    lines.push([
      linkAdapter(adapter),
      code(adapter.status),
      (adapter.platforms || []).map(code).join(", "),
      code(adapter.type),
      yes(signals.has("usage-tokens") || signals.has("usage-events")),
      yes(signals.has("quota-capacity")),
      yes(signals.has("quota-token-plan")),
      yes(signals.has("context-window")),
      yes(signals.has("hud-overlays")),
      yes(signals.has("local-health") || signals.has("provider-health")),
      yes(signals.has("snapshot-read")),
      yes(signals.has("status-display")),
      yes(signals.has("setup-workflow") || signals.has("adapter-authoring"))
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  lines.push(
    "",
    "## Signal Keys",
    "",
    "| Signal | Meaning |",
    "| --- | --- |"
  );

  for (const key of signalKeys) {
    lines.push(`| \`${key}\` | ${signalDescriptions[key]} |`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function linkAdapter(adapter) {
  const docs = Array.isArray(adapter.docs) ? adapter.docs : [];
  const firstDoc = docs.find((doc) => typeof doc === "string" && doc.endsWith(".md"));
  const label = adapter.name || adapter.id;
  if (!firstDoc) return code(label);
  return `[${escapePipe(label)}](../${firstDoc})`;
}

function yes(value) {
  return value ? "yes" : "";
}

function code(value) {
  return `\`${escapePipe(String(value || ""))}\``;
}

function escapePipe(value) {
  return String(value).replaceAll("|", "\\|");
}

function normalizeNewlines(value) {
  return String(value).replace(/\r\n/g, "\n");
}

function parseArgs(argv) {
  const parsed = {
    check: false,
    json: false
  };
  for (const arg of argv) {
    if (arg === "--check") parsed.check = true;
    if (arg === "--json") parsed.json = true;
  }
  return parsed;
}
