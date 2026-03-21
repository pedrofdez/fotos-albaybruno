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
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    s3_key TEXT NOT NULL,
    original_filename TEXT,
    size_bytes INTEGER,
    deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Ensure columns exist for existing databases
try { db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE uploads ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0"); } catch (_) {}

// User 1 is always admin
db.prepare("UPDATE users SET is_admin = 1 WHERE id = 1").run();

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
  WHERE uploads.deleted = 0
  ORDER BY uploads.created_at DESC
`);

const getUploadsByUser = db.prepare(`
  SELECT uploads.*, users.name AS uploader_name, users.avatar AS uploader_avatar
  FROM uploads
  JOIN users ON uploads.user_id = users.id
  WHERE uploads.deleted = 0 AND uploads.user_id = ?
  ORDER BY uploads.created_at DESC
`);

const getUploaders = db.prepare(`
  SELECT users.id, users.name, users.avatar
  FROM users
  JOIN uploads ON uploads.user_id = users.id AND uploads.deleted = 0
  GROUP BY users.id
`);

const getAllUploadsAdmin = db.prepare(`
  SELECT uploads.*, users.name AS uploader_name, users.avatar AS uploader_avatar
  FROM uploads
  JOIN users ON uploads.user_id = users.id
  ORDER BY uploads.created_at DESC
`);

const softDeleteUpload = db.prepare("UPDATE uploads SET deleted = 1 WHERE id = ?");
const restoreUpload = db.prepare("UPDATE uploads SET deleted = 0 WHERE id = ?");
const getAllUsers = db.prepare("SELECT id, name, email, avatar, is_admin, created_at FROM users ORDER BY id");
const setUserAdmin = db.prepare("UPDATE users SET is_admin = ? WHERE id = ?");

module.exports = { db, upsertUser, getUserById, insertUpload, getAllUploads, getUploadsByUser, getUploaders, getAllUploadsAdmin, softDeleteUpload, restoreUpload, getAllUsers, setUserAdmin };
