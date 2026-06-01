import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
const { collectHermesUsage } = require("../src/collectors/hermes-local.cjs");

testFullSchema();
testTokenizerFallbackSchema();
testFallbackSchema();
testIncompatibleSchema();

console.log("Hermes local collector checks passed.");

function testFullSchema() {
  const dir = makeTempDir();
  try {
    const startedAt = Math.floor(Date.now() / 1000);
    withDatabase(dir, (db) => {
      db.exec(`
        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          source TEXT,
          model TEXT,
          model_config TEXT,
          system_prompt TEXT,
          started_at INTEGER,
          message_count INTEGER,
          input_tokens INTEGER,
          output_tokens INTEGER,
          cache_read_tokens INTEGER,
          cache_write_tokens INTEGER,
          reasoning_tokens INTEGER,
          estimated_cost_usd REAL
        );
        CREATE TABLE messages (
          session_id TEXT,
          role TEXT,
          content TEXT,
          reasoning TEXT,
          reasoning_content TEXT,
          codex_reasoning_items TEXT,
          codex_message_items TEXT,
          token_count INTEGER,
          timestamp INTEGER
        );
      `);
      db.prepare(`
        INSERT INTO sessions (
          id, source, model, model_config, system_prompt, started_at, message_count,
          input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
          reasoning_tokens, estimated_cost_usd
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "session-1",
        "xiaomi",
        "mimo-v2.5",
        "{}",
        "system",
        startedAt,
        1,
        10,
        20,
        3,
        4,
        5,
        0.12
      );
      db.prepare(`
        INSERT INTO messages (
          session_id, role, content, reasoning, reasoning_content,
          codex_reasoning_items, codex_message_items, token_count, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run("session-1", "assistant", "hello", "", "", "", "", 9, startedAt + 1);
    });

    const provider = collectHermesUsage({ hermesDataPath: dir });
    assert.equal(provider.status, "live");
    assert.equal(provider.sourceId, "hermes-local");
    assert.equal(provider.schema.status, "compatible");
    assert.equal(provider.todayTokens, 42);
    assert.equal(provider.confidence, "reported");
    assert.equal(provider.tokenAccuracy.level, "official-usage");
    assert.equal(provider.tokenEstimated, false);
    assert.equal(provider.latest.context.source, "session-token-columns");
    assert.equal(provider.latest.context.tokenAccuracy.level, "official-usage");
    assert.equal(provider.latest.lastTurnTokens, 9);
  } finally {
    removeTempDir(dir);
  }
}

function testTokenizerFallbackSchema() {
  const dir = makeTempDir();
  try {
    const startedAt = Math.floor(Date.now() / 1000);
    withDatabase(dir, (db) => {
      db.exec(`
        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          started_at INTEGER
        );
        CREATE TABLE messages (
          session_id TEXT,
          role TEXT,
          content TEXT,
          token_count INTEGER,
          timestamp INTEGER
        );
      `);
      db.prepare("INSERT INTO sessions (id, started_at) VALUES (?, ?)").run("tokenizer-session", startedAt);
      db.prepare(`
        INSERT INTO messages (session_id, role, content, token_count, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `).run("tokenizer-session", "assistant", "hello", 12, startedAt + 1);
    });

    const provider = collectHermesUsage({ hermesDataPath: dir });
    assert.equal(provider.status, "live");
    assert.equal(provider.confidence, "derived");
    assert.equal(provider.tokenAccuracy.level, "tokenizer");
    assert.equal(provider.tokenEstimated, false);
    assert.equal(provider.latest.context.source, "message-token-count");
    assert.equal(provider.latest.context.usedTokens, 12);
    assert.equal(provider.latest.lastTurnTokens, 12);
  } finally {
    removeTempDir(dir);
  }
}

function testFallbackSchema() {
  const dir = makeTempDir();
  try {
    const startedAt = Math.floor(Date.now() / 1000);
    withDatabase(dir, (db) => {
      db.exec(`
        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          started_at INTEGER
        );
      `);
      db.prepare("INSERT INTO sessions (id, started_at) VALUES (?, ?)").run("minimal-session", startedAt);
    });

    const provider = collectHermesUsage({ hermesDataPath: dir });
    assert.equal(provider.status, "live");
    assert.equal(provider.confidence, "estimated");
    assert.equal(provider.tokenAccuracy.level, "heuristic");
    assert.equal(provider.tokenEstimated, true);
    assert.equal(provider.schema.status, "compatible-with-fallbacks");
    assert.ok(provider.schema.warnings.includes("missing messages table"));
    assert.equal(provider.latest.context.sessionId, "minimal-session");
    assert.equal(provider.latest.context.source, "message-length-heuristic");
    assert.equal(provider.latest.context.estimated, true);
  } finally {
    removeTempDir(dir);
  }
}

function testIncompatibleSchema() {
  const dir = makeTempDir();
  try {
    withDatabase(dir, (db) => {
      db.exec(`
        CREATE TABLE sessions (
          id TEXT PRIMARY KEY
        );
      `);
    });

    const provider = collectHermesUsage({ hermesDataPath: dir });
    assert.equal(provider.status, "missing");
    assert.match(provider.note, /schema 不兼容/);
    assert.match(provider.note, /sessions\.started_at/);
    assert.equal(provider.schema.status, "compatible-with-fallbacks");
  } finally {
    removeTempDir(dir);
  }
}

function withDatabase(dir, setup) {
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "state.db"));
  try {
    setup(db);
  } finally {
    db.close();
  }
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "who-eats-token-hermes-"));
}

function removeTempDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}
