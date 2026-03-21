const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "wedding.db"));
db.pragma("journal_mode = WAL");

// Ensure tables exist (same as db.js)
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
try { db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE uploads ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0"); } catch (_) {}

const fakeUsers = [
  { google_id: "seed_001", name: "Alba García",    email: "alba@example.com",    avatar: null },
  { google_id: "seed_002", name: "Bruno López",    email: "bruno@example.com",   avatar: null },
  { google_id: "seed_003", name: "María Fernández",email: "maria@example.com",   avatar: null },
  { google_id: "seed_004", name: "Carlos Ruiz",    email: "carlos@example.com",  avatar: null },
  { google_id: "seed_005", name: "Lucía Martín",   email: "lucia@example.com",   avatar: null },
  { google_id: "seed_006", name: "Pablo Sánchez",  email: "pablo@example.com",   avatar: null },
];

const filenames = [
  "ceremonia_01.jpg", "ceremonia_02.jpg", "ceremonia_03.jpg",
  "altar.jpg", "anillos.jpg", "beso.jpg",
  "primer_baile.jpg", "brindis.jpg", "tarta.jpg",
  "mesa_novios.jpg", "ramo.jpg", "invitados_01.jpg",
  "invitados_02.jpg", "selfie_grupo.jpg", "puesta_de_sol.jpg",
  "entrada_novia.jpg", "decoracion.jpg", "flores.jpg",
  "photobooth_01.jpg", "photobooth_02.jpg", "fiesta_01.jpg",
  "fiesta_02.jpg", "fiesta_03.jpg", "despedida.jpg",
];

const upsertUser = db.prepare(`
  INSERT INTO users (google_id, name, email, avatar)
  VALUES (@google_id, @name, @email, @avatar)
  ON CONFLICT(google_id) DO UPDATE SET
    name = excluded.name,
    email = excluded.email,
    avatar = excluded.avatar
  RETURNING *
`);

const insertUpload = db.prepare(`
  INSERT INTO uploads (user_id, s3_key, original_filename, size_bytes, created_at)
  VALUES (@user_id, @s3_key, @original_filename, @size_bytes, @created_at)
`);

const seedAll = db.transaction(() => {
  const users = fakeUsers.map(u => upsertUser.get(u));
  console.log(`Seeded ${users.length} users`);

  // Make user 1 admin
  db.prepare("UPDATE users SET is_admin = 1 WHERE id = 1").run();

  let uploadCount = 0;
  for (const user of users) {
    // Each user gets 3-6 random photos
    const count = 3 + Math.floor(Math.random() * 4);
    const shuffled = [...filenames].sort(() => Math.random() - 0.5);
    for (let i = 0; i < count; i++) {
      const filename = shuffled[i];
      const ts = Date.now() - Math.floor(Math.random() * 86400000 * 3); // random time in last 3 days
      const created = new Date(ts).toISOString().replace("T", " ").replace("Z", "").split(".")[0];
      insertUpload.run({
        user_id: user.id,
        s3_key: `uploads/${user.id}/${ts}-${filename}`,
        original_filename: filename,
        size_bytes: Math.floor(Math.random() * 5000000) + 500000,
        created_at: created,
      });
      uploadCount++;
    }
  }
  console.log(`Seeded ${uploadCount} uploads`);
});

seedAll();
console.log("Done! Seed data inserted into wedding.db");
