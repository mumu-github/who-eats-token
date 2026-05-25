import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ensureHermesOverlayInstalled } = require("../src/integrations/hermes-overlay-installer.cjs");
const { getLocalApiAccess } = require("../src/security/local-token.cjs");
const { getDefaultUserDataPath } = require("../src/system/paths.cjs");

const userDataPath = getDefaultUserDataPath();
const access = getLocalApiAccess(userDataPath);
const results = ensureHermesOverlayInstalled({ accessToken: access.token });

if (results.length === 0) {
  console.log("No Hermes Web UI client directory was found.");
  console.log("Set HERMES_WEB_UI_CLIENT_DIR to the dist/client directory and run this command again.");
  process.exitCode = 1;
} else {
  for (const result of results) {
    console.log(`${result.changed ? "Installed" : "Already installed"}: ${result.clientDir}`);
  }
  console.log(`Local API token source: ${access.source}`);
}
