const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "wedding.db"));

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT UNIQUE NOT NULL,
    name TEXT,
    email TEXT,
    avatar TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    s3_key TEXT NOT NULL,
    original_filename TEXT,
    size_bytes INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

const upsertUser = db.prepare(`
  INSERT INTO users (google_id, name, email, avatar)
  VALUES (@google_id, @name, @email, @avatar)
  ON CONFLICT(google_id) DO UPDATE SET
    name = excluded.name,
    email = excluded.email,
    avatar = excluded.avatar
  RETURNING *
`);

const getUserById = db.prepare("SELECT * FROM users WHERE id = ?");

const insertUpload = db.prepare(`
  INSERT INTO uploads (user_id, s3_key, original_filename, size_bytes)
  VALUES (@user_id, @s3_key, @original_filename, @size_bytes)
`);

const getAllUploads = db.prepare(`
  SELECT uploads.*, users.name AS uploader_name, users.avatar AS uploader_avatar
  FROM uploads
  JOIN users ON uploads.user_id = users.id
  ORDER BY uploads.created_at DESC
`);

module.exports = { db, upsertUser, getUserById, insertUpload, getAllUploads };
