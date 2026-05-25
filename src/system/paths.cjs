const os = require("node:os");
const path = require("node:path");

const APP_NAME = "who-eats-token";

function getDefaultUserDataPath(appName = APP_NAME) {
  const explicit = String(process.env.WHO_EATS_TOKEN_USER_DATA_DIR || "").trim();
  if (explicit) return explicit;

  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), appName);
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", appName);
  }

  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), appName);
}

function getHermesDataPath({ localAppData, hermesDataPath } = {}) {
  if (hermesDataPath) return hermesDataPath;

  const explicit = String(process.env.HERMES_DATA_DIR || "").trim();
  if (explicit) return explicit;

  if (localAppData) return path.join(localAppData, "hermes");

  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "hermes");
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "hermes");
  }

  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "hermes");
}

module.exports = {
  getDefaultUserDataPath,
  getHermesDataPath
};
