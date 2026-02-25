const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'whatsapp_api.db');

let db;

/**
 * Initialize the SQLite database and create tables if they don't exist.
 * Runs safe ALTER TABLE migrations for new columns.
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
      role TEXT DEFAULT 'user',
      device_limit INTEGER DEFAULT 3,
      message_limit INTEGER DEFAULT 100,
      messages_sent_today INTEGER DEFAULT 0,
      last_message_reset DATE,
      trial_expires_at DATETIME,
      is_active INTEGER DEFAULT 1,
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

  db.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      duration_days INTEGER NOT NULL DEFAULT 30,
      device_limit INTEGER NOT NULL DEFAULT 3,
      message_limit INTEGER NOT NULL DEFAULT 100,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      cf_order_id TEXT UNIQUE,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      payment_id TEXT,
      cf_payment_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    )
  `);

  // ── Safe migrations for existing databases ───────────────
  const migrations = [
    { column: 'role', sql: "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'" },
    { column: 'device_limit', sql: 'ALTER TABLE users ADD COLUMN device_limit INTEGER DEFAULT 3' },
    { column: 'message_limit', sql: 'ALTER TABLE users ADD COLUMN message_limit INTEGER DEFAULT 100' },
    { column: 'messages_sent_today', sql: 'ALTER TABLE users ADD COLUMN messages_sent_today INTEGER DEFAULT 0' },
    { column: 'last_message_reset', sql: 'ALTER TABLE users ADD COLUMN last_message_reset DATE' },
    { column: 'trial_expires_at', sql: 'ALTER TABLE users ADD COLUMN trial_expires_at DATETIME' },
    { column: 'is_active', sql: 'ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1' },
    { column: 'current_plan_id', sql: 'ALTER TABLE users ADD COLUMN current_plan_id INTEGER' },
    { column: 'plan_expires_at', sql: 'ALTER TABLE users ADD COLUMN plan_expires_at DATETIME' },
  ];

  const tableInfo = db.prepare('PRAGMA table_info(users)').all();
  const existingCols = new Set(tableInfo.map(c => c.name));

  for (const m of migrations) {
    if (!existingCols.has(m.column)) {
      db.exec(m.sql);
      console.log(`  Migration: added column "${m.column}" to users table`);
    }
  }

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
