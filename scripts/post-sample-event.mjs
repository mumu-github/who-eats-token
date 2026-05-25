import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { getDefaultUserDataPath } = require("../src/system/paths.cjs");

const now = Date.now();
const payload = {
  provider: "local-demo",
  model: "demo-model",
  input_tokens: 1200,
  output_tokens: 480,
  cost_usd: 0.0078,
  confidence: "reported",
  rate_limits: {
    limit_id: "local-demo",
    primary: {
      remaining_percent: 72,
      window_minutes: 300,
      resets_at: new Date(now + 2 * 60 * 60 * 1000).toISOString()
    },
    secondary: {
      remaining_percent: 88,
      window_minutes: 10080,
      resets_at: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString()
    }
  }
};

const body = JSON.stringify(payload);
const accessToken = readLocalAccessToken();
const headers = {
  "Content-Type": "application/json",
  "Content-Length": Buffer.byteLength(body)
};
if (accessToken) headers["X-Who-Eats-Token"] = accessToken;

const req = http.request(
  {
    hostname: "127.0.0.1",
    port: 17667,
    path: "/events",
    method: "POST",
    headers
  },
  (res) => {
    let raw = "";
    res.setEncoding("utf8");
    res.on("data", (chunk) => {
      raw += chunk;
    });
    res.on("end", () => {
      console.log(raw);
    });
  }
);

req.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});

req.end(body);

function readLocalAccessToken() {
  const explicit = String(process.env.WHO_EATS_TOKEN_API_TOKEN || "").trim();
  if (explicit) return explicit;

  try {
    return fs.readFileSync(path.join(getDefaultUserDataPath(), "api-token.txt"), "utf8").trim();
  } catch {
    return "";
  }
}
