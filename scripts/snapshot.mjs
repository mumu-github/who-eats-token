import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { collectCodexUsage } = require("../src/collectors/codex.cjs");

const snapshot = collectCodexUsage();
console.log(JSON.stringify(snapshot, null, 2));
