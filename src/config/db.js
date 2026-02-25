const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'whatsapp_api.db');

let db;

/**
 * Initialize the SQLite database and create tables if they don't exist.
 */
function initializeDatabase() {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  console.log('Connected to SQLite database at', DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email VARCHAR(150) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      api_key VARCHAR(64) UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      device_id VARCHAR(50) UNIQUE NOT NULL,
      session_name VARCHAR(100),
      status TEXT CHECK(status IN ('pending','connected','disconnected')) DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id VARCHAR(50),
      recipient VARCHAR(20),
      message_type TEXT CHECK(message_type IN ('text','file')),
      status VARCHAR(50),
      message_id VARCHAR(100),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('Database tables initialized.');
  console.log('Database ready.');
}

/**
 * Get the database instance.
 */
function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

/**
 * Helper: run a query and return all rows.
 */
function dbAll(sql, params = []) {
  return getDb().prepare(sql).all(...params);
}

/**
 * Helper: run a query and return the first row (or undefined).
 */
function dbGet(sql, params = []) {
  return getDb().prepare(sql).get(...params);
}

/**
 * Helper: run a mutating query (INSERT, UPDATE, DELETE).
 */
function dbRun(sql, params = []) {
  const result = getDb().prepare(sql).run(...params);
  return { lastID: result.lastInsertRowid, changes: result.changes };
}

module.exports = { initializeDatabase, getDb, dbAll, dbGet, dbRun };
