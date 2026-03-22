require("dotenv").config();
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const morgan = require("morgan");
const path = require("path");
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { upsertUser, getUserById, insertUpload, getAllUploadsPaginated, getUploadsByUserPaginated, getUploaders, getAllUploadsAdmin, softDeleteUpload, restoreUpload, getAllUsers, setUserAdmin } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// --- S3 client ---
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// --- Middleware ---
app.use(morgan("dev"));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

// --- Passport ---
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = getUserById.get(id);
  done(null, user || false);
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${BASE_URL}/auth/google/callback`,
    },
    (_accessToken, _refreshToken, profile, done) => {
      const user = upsertUser.get({
        google_id: profile.id,
        name: profile.displayName,
        email: (profile.emails && profile.emails[0] && profile.emails[0].value) || null,
        avatar: (profile.photos && profile.photos[0] && profile.photos[0].value) || null,
      });
      done(null, user);
    }
  )
);

function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/");
}

function ensureAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.is_admin) return next();
  res.status(403).json({ error: "forbidden" });
}

// --- Auth routes ---
app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (_req, res) => res.redirect("/upload")
);

app.get("/logout", (req, res) => {
  req.logout(() => res.redirect("/"));
});

// --- Pages ---
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "views", "landing.html")));
app.get("/upload", ensureAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "upload.html"));
});
app.get("/gallery", ensureAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, "views", "gallery.html"));
});

// --- API: current user ---
app.get("/api/me", ensureAuth, (req, res) => {
  res.json({ id: req.user.id, name: req.user.name, avatar: req.user.avatar });
});

// --- API: presign ---
app.post("/api/presign", ensureAuth, async (req, res) => {
  const { filename, contentType } = req.body;
  if (!filename || !contentType) {
    return res.status(400).json({ error: "filename and contentType required" });
  }

  const timestamp = Date.now();
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const s3Key = `uploads/${req.user.id}/${timestamp}-${safe}`;

  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: s3Key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });

  insertUpload.run({
    user_id: req.user.id,
    s3_key: s3Key,
    original_filename: filename,
    size_bytes: 0,
  });

  res.json({ uploadUrl, s3Key });
});

// --- API: uploaders list ---
app.get("/api/uploaders", ensureAuth, (_req, res) => {
  res.json(getUploaders.all());
});

// --- API: all uploads (for gallery) ---
const PAGE_SIZE = 20;

app.get("/api/uploads", ensureAuth, async (req, res) => {
  const userId = req.query.userId;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const limit = PAGE_SIZE + 1;

  const rows = userId
    ? getUploadsByUserPaginated.all(userId, limit, offset)
    : getAllUploadsPaginated.all(limit, offset);

  const hasMore = rows.length > PAGE_SIZE;
  if (hasMore) rows.pop();

  const bucket = process.env.S3_BUCKET_NAME;
  const uploads = await Promise.all(
    rows.map(async (r) => {
      const thumbKey = r.s3_key.replace(/^uploads\//, "thumbnail/");
      const resizedKey = r.s3_key.replace(/^uploads\//, "resized/");
      const [thumbnailUrl, resizedUrl] = await Promise.all([
        getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: thumbKey }), { expiresIn: 3600 }),
        getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: resizedKey }), { expiresIn: 3600 }),
      ]);
      return { ...r, thumbnailUrl, resizedUrl };
    })
  );
  res.json({ uploads, hasMore });
});

// --- Admin ---
app.get("/admin", ensureAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, "views", "admin.html"));
});

app.get("/api/admin/uploads", ensureAdmin, async (_req, res) => {
  const rows = getAllUploadsAdmin.all();
  const bucket = process.env.S3_BUCKET_NAME;
  const uploads = await Promise.all(
    rows.map(async (r) => {
      const thumbKey = r.s3_key.replace(/^uploads\//, "thumbnail/");
      const thumbnailUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: thumbKey }), { expiresIn: 3600 });
      return { ...r, thumbnailUrl };
    })
  );
  res.json(uploads);
});

app.post("/api/admin/uploads/:id/delete", ensureAdmin, (req, res) => {
  softDeleteUpload.run(req.params.id);
  res.json({ ok: true });
});

app.post("/api/admin/uploads/:id/restore", ensureAdmin, (req, res) => {
  restoreUpload.run(req.params.id);
  res.json({ ok: true });
});

app.get("/api/admin/users", ensureAdmin, (_req, res) => {
  res.json(getAllUsers.all());
});

app.post("/api/admin/users/:id/toggle-admin", ensureAdmin, (req, res) => {
  const targetId = parseInt(req.params.id);
  if (targetId === 1) return res.status(400).json({ error: "cannot change user 1" });
  const user = getUserById.get(targetId);
  if (!user) return res.status(404).json({ error: "user not found" });
  setUserAdmin.run(user.is_admin ? 0 : 1, targetId);
  res.json({ ok: true, is_admin: user.is_admin ? 0 : 1 });
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`Server running at ${BASE_URL}`);
});
