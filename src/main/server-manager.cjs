const { createHermesBridgeServer } = require("../collectors/hermes-bridge.cjs");
const { createIngestServer } = require("../collectors/ingest-server.cjs");

function restartIngestServer(currentServer, {
  enabled,
  port,
  accessToken,
  security,
  getSnapshot
} = {}) {
  closeServer(currentServer);
  if (!enabled) return null;
  return createIngestServer({
    port,
    accessToken,
    security,
    getSnapshot
  });
}

function restartHermesBridge(currentServer, {
  enabled,
  port,
  targetBaseUrl,
  ingestUrl,
  accessToken,
  ingestToken,
  security
} = {}) {
  closeServer(currentServer);
  if (!enabled) return null;
  return createHermesBridgeServer({
    port,
    targetBaseUrl,
    ingestUrl,
    accessToken,
    ingestToken,
    security
  });
}

function closeServer(server) {
  if (!server) return;
  try {
    server.close();
  } catch {
    // Server shutdown is best-effort during app restarts and process exit.
  }
}

module.exports = {
  closeServer,
  restartHermesBridge,
  restartIngestServer
};
