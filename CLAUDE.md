# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wedding photo upload app ("Fotos Alba & Bruno"). Guests sign in with Google OAuth, upload photos directly to AWS S3 via presigned URLs, and browse a shared gallery. Built with Express + better-sqlite3 + AWS S3.

## Commands

- `npm install` — install dependencies
- `npm start` — run server (`node index.js`)
- `npm run dev` — run with nodemon for auto-reload
- No test suite or linter is configured.

## Architecture

This is a small single-file Express app with one helper module:

- **`index.js`** — Express server, all routes, middleware, Passport config, and S3 presigning logic. Serves static HTML files from `views/`. API endpoints are under `/api/`.
- **`db.js`** — SQLite database setup (better-sqlite3) with prepared statements exported directly. Tables: `users` (Google OAuth profiles) and `uploads` (S3 key references). Uses WAL mode.
- **`views/`** — Static HTML pages (`landing.html`, `upload.html`, `gallery.html`) served via `res.sendFile`. No templating engine.

**Auth flow:** Google OAuth via Passport → upsert user in SQLite → session-based auth. `ensureAuth` middleware guards `/upload`, `/gallery`, and all `/api/*` routes.

**Upload flow:** Client gets a presigned S3 PUT URL from `POST /api/presign`, then uploads directly to S3 from the browser. Upload metadata is recorded in SQLite. Gallery images are served via presigned GET URLs.

## Environment

Requires a `.env` file (see `.env.example`): Google OAuth credentials, AWS credentials, S3 bucket name, region, session secret, and optional BASE_URL.

The SQLite database file (`wedding.db`) is created automatically in the project root on first run.
