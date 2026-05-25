const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const TOKEN_FILE = "api-token.txt";
const TOKEN_BYTES = 32;

function getLocalApiAccess(userDataPath) {
  const fromEnv = String(process.env.WHO_EATS_TOKEN_API_TOKEN || "").trim();
  if (fromEnv) {
    return {
      token: fromEnv,
      tokenFile: null,
      source: "env"
    };
  }

  const tokenFile = path.join(userDataPath, TOKEN_FILE);
  const existing = readToken(tokenFile);
  if (existing) {
    return {
      token: existing,
      tokenFile,
      source: "file"
    };
  }

  const token = crypto.randomBytes(TOKEN_BYTES).toString("hex");
  fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
  fs.writeFileSync(tokenFile, `${token}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(tokenFile, 0o600);
  } catch {
    // Windows may ignore POSIX-style modes; keeping the token under userData is the main boundary.
  }

  return {
    token,
    tokenFile,
    source: "generated"
  };
}

function readToken(tokenFile) {
  try {
    const token = fs.readFileSync(tokenFile, "utf8").trim();
    return token.length >= 32 ? token : null;
  } catch {
    return null;
  }
}

module.exports = {
  getLocalApiAccess
};
