# Coding Club: full-stack college club website

Backend (Node.js + Express + MongoDB) wired to the existing plain HTML/CSS/JS frontend. No build step. Content (events, projects, stats) comes from an Excel file the club edits — never from code.

## Files

```
coding-club/
├── server.js            Express app: JSON API + serves public/ + JSON errors
├── package.json         dependencies and the start/dev/seed scripts
├── .env.example         copy to .env and fill in (see below)
├── config.js            reads .env, fails fast if MONGODB_URI/JWT_SECRET missing
├── routes/auth.js       register, 6-digit email verification, forgot-password link, login, logout, /me
├── routes/content.js    GET /api/events, /api/projects, /api/stats, /api/version
├── routes/join.js       POST /api/join — membership sheet, one signup per email
├── models/User.js       registered members + pending verification codes
├── models/Signup.js     one row per "Join the club" submission
├── middleware/auth.js   checks the session cookie on protected routes
├── utils/excel.js       club.xlsx reader (mtime-cached, crash-safe) + signups.xlsx mirror
├── utils/mailer.js      nodemailer over Brevo SMTP; verifies transport at startup, dev-mode fallback only
├── scripts/test-email.js  sends a test email and prints success or the exact SMTP error (npm run test-email)
├── utils/validate.js    the @rvce.edu.in rule and password checks
├── scripts/seed-excel.js  creates data/club.xlsx pre-filled with the original content
├── data/club.xlsx       the file the club edits (Events, Projects, Stats sheets)
├── data/signups.xlsx    auto-maintained copy of MongoDB signups (best effort)
├── public/reset.html    the password-reset page the emailed link opens
├── public/reset.js      validates the token + the two password fields on that page
└── public/              index.html, style.css, main.js, head.js — the site
```

## Prerequisites

- Node.js 18 or newer
- MongoDB running locally (`mongod` on port 27017) or a MongoDB Atlas connection string

## Setup

```bash
npm install
cp .env.example .env        # then edit .env (Windows: copy .env.example .env)
npm run seed                # creates data/club.xlsx with the original content
npm run dev                 # http://localhost:3000 (auto-restarts on changes)
```

Production: `npm start`. The server exits with a readable message if `MONGODB_URI` or `JWT_SECRET` is missing.

`.env` settings:

| Variable | Meaning |
| --- | --- |
| `PORT` | HTTP port (3000) |
| `NODE_ENV` | `development` or `production` (production = secure cookies + real mail required) |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/coding-club` or an Atlas string |
| `JWT_SECRET` | long random string used to sign session cookies |
| `BASE_URL` | optional; origin used in password-reset links (defaults to the request host) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | real SMTP for verification and password-reset emails (Brevo free tier recommended; Gmail app password also works) |
| `MAIL_FROM` | visible sender, e.g. `"Coding Club <you@rvce.edu.in>"` — must be a **verified sender** |

### Getting real emails (Brevo SMTP, ~5 minutes)

1. **Sign up free** at brevo.com (300 emails/day on the free plan).
2. **Senders & IP → Senders:** add and verify your sender address (e.g. your own college email). `MAIL_FROM` must be exactly this verified address, or Brevo rejects the mail (error 550) and nothing arrives — the most common reason an app "sends" but the inbox stays empty.
3. **SMTP & API → SMTP:** create an SMTP key. Your SMTP login is your Brevo account email (it looks like `xxxx@smtp-brevo.com`) and the key is a generated password — put those in `SMTP_USER` / `SMTP_PASS`.
4. **SMTP & API → Authorised IPs:** add your IP if Brevo requires it (otherwise the connection is refused at startup).
5. Keep `SMTP_PORT=587` (STARTTLS). Port 465 also works (implicit TLS).
6. Restart the server — it logs `SMTP ready` on success, or the exact setting likely wrong (wrong login, wrong key, wrong port, unverified sender, unauthorized IP).
7. Check delivery without clicking through the UI: `npm run test-email -- you@rvce.edu.in`. It prints "Email sent successfully" or the exact SMTP error.

While SMTP is configured, verification codes and reset links are emailed only — nothing is printed in the terminal. Only with SMTP off in development they print in the terminal so you can test locally. Sending failures answer the frontend with a clean 503 (`We couldn't send the email, try again`) and log the real SMTP error server-side; the server never reports an email as sent when it was not.

With SMTP blank and `NODE_ENV != production`, the 6-digit codes print in the server terminal instead of being emailed — handy for local testing. Email verification exists so only people who really own an `@rvce.edu.in` mailbox can register.

## Editing club.xlsx (the club edits this file, never the code)

Open `data/club.xlsx` in Excel. Save when done — the running site picks changes up within 15 seconds, no restart needed. If Excel has the file locked mid-save, the server keeps serving the last good data and logs a warning instead of crashing.

**Events sheet** — `title | date | time | venue | bring | description | published`

| title | date | time | venue | bring | description | published |
| --- | --- | --- | --- | --- | --- | --- |
| Git without fear | 2026-11-06 | 6:00 PM | Lab 204, CS Block | A laptop with Git installed | Branches, merges and fixing a broken history. Open to all years. | yes |

- `date` is `YYYY-MM-DD`. The **server** (in Bengaluru time, `Asia/Kolkata`) marks each event *past* or *upcoming* and tags the earliest upcoming one *Next up* in the hero ticket.
- `published=no` (or blank rows) hides an event. Delete rows freely; empty rows are skipped.
- `time`, `venue` and `bring` can stay empty; the page just shows fewer facts.

**Projects sheet** — `name | description | categories | stack | link | featured`

| name | description | categories | stack | link | featured |
| --- | --- | --- | --- | --- | --- |
| CampusConnect | A timetable and notice-board app for campus announcements. | web | HTML,JavaScript,Node.js | https://github.com/you/repo | yes |

- `categories`: `web`, `ai`, `security`, `hardware`, or several separated by spaces or commas — these drive the filter chips.
- `stack`: comma separated chips shown under the project.
- `link` must start with `http(s)://` or it is not shown (protection against injected links).
- `featured=yes` renders bigger, at the top. Row order doesn't matter.

**Stats sheet** — `label | value`, e.g. `active members | 42`. The labels shown are the rows themselves; the count-up animation uses `value`.

If you delete or break the file, `npm run seed` recreates it with the original content.

**Seats per event (optional 8th column):** `seats` sets the registration limit for an event — no code, just edit the number in the Excel sheet like everything else.

- **Leave it blank** → no limit; anyone can register.
- **A number** (e.g. `40`) → that event allows exactly that many registrations. The event card shows `X of N seats taken`; when the count reaches the limit, the form disappears and visitors see **"Seats are full — no more registrations can be taken for this event."**
- Raise the number later → registration reopens automatically (everything re-checks live on the site, within ~15 s like the other Excel edits).
- Registrations are stored in MongoDB (one per email per event); the club's "Join the club" list is separate and never eats event seats.

## How authentication works

- **Register** (`POST /api/auth/register`) with an `@rvce.edu.in` email — validated on the server with `/^[a-z0-9._%+-]+@rvce\.edu\.in$/` after trimming and lowercasing, so lookalikes like `a@rvce.edu.in.evil.com` or `a@mail.rvce.edu.in` are rejected with a 403.
- A random **6-digit code** (hashed in MongoDB, valid 10 minutes, max 5 attempts) is emailed. `POST /api/auth/verify` completes registration and logs you in.
- **Login** is only possible for verified accounts. Passwords are bcrypt-hashed.
- Sessions are a JWT in an httpOnly, `sameSite=lax` cookie (secure in production) via `GET /api/auth/me`. Log out with `POST /api/auth/logout`.
- **Forgot password (link based):** the Log in dialog has a *Forgot password?* link. `POST /api/auth/forgot-password` emails a one-time link to `reset.html?token=…` (256-bit token, hashed in MongoDB, valid 15 minutes, single use) and always answers ok, so nobody can probe which accounts exist. The page asks for the new password plus a confirm field and calls `POST /api/auth/reset-password`, which updates the password and logs you in. It works for accounts that never completed the 6-digit verification too — opening the emailed link proves mailbox ownership, so reset-password completes verification as well. Old links are void each time a new one is requested.
- **Resend code:** the verification step has a *Resend code* link (`POST /api/auth/resend`) for when the first mail doesn't arrive.
- **Rate limits:** every auth endpoint is capped at 30 requests / 15 min per IP; the email-sending endpoints (`register`, `resend`, `forgot-password`) are additionally capped at max 5 sends / 15 min **per email address and per IP**.
- The auth endpoints sit behind `express-rate-limit`; input validation is `express-validator`; security headers are `helmet`.

"Join the club" (`POST /api/join`) stores one signup per email in MongoDB (409 on duplicates), requires an @rvce.edu.in address from everyone — logged-in users must use their own verified address — and is mirrored to `data/signups.xlsx`; if that mirror file is locked the signup still succeeds because MongoDB is the source of truth.

**Event registration with seat limits:** every upcoming event card has a small register form (name + @rvce.edu.in email, one registration per email per event via a Mongo unique index). `GET /api/events` attaches `seats` (the Excel `seats` column), `taken`, and `full` so the UI shows live seat counts and closes registration when the batch is full; `POST /api/event-register` re-checks capacity server-side before accepting a seat and answers 409 with the seats-full message otherwise. Rate-limited like the other email endpoints (10 attempts / 15 min per IP).

## How the site picks up Excel edits live

The browser polls `GET /api/version` (the club.xlsx modification time) every 15 seconds. When the version changes it re-fetches the three content endpoints and re-renders — keeping open accordion items and the active filter where possible. All Excel text is inserted with `textContent`/`createElement`, never `innerHTML`, so a value in the spreadsheet cannot inject HTML.

### How it works (judge summary)

A static-looking page with a real backend: Express serves the HTML/CSS/JS and a JSON API. MongoDB stores accounts, hashed passwords, verification codes and membership signups. Excel (club.xlsx) is the CMS — the club's editing file — read, cached and pushed to the browser through three JSON endpoints with change detection. Security: server-side email allow-list, bcrypt, JWT httpOnly cookies, rate limiting, helmet, input validation, XSS-safe rendering.

## Deploy (Render or Railway + MongoDB Atlas)

1. Create a free **MongoDB Atlas** cluster, get a connection string (allow the host's IP).
2. Push this repo to GitHub. In **Render** create a *Web Service* (or Railway a Node service) pointing at it.
3. Environment variables: `NODE_ENV=production`, `MONGODB_URI` (Atlas string), `JWT_SECRET` (long random), plus the SMTP_* variables with real brevo/postmark/Gmail credentials — verification mail must actually send in production.
4. Start command `npm start`. On first deploy run `npm run seed` once (Render shell) to create `data/club.xlsx`.
5. Deployed file systems are ephemeral on free tiers: keep club.xlsx in the repo, or move both excel files to a persistent disk / replace utils/excel.js with a database-backed source later.

## Credits

Fonts: Archivo, IBM Plex Sans and IBM Plex Mono from Google Fonts, under the SIL Open Font License. Backend packages: express, mongoose, exceljs, nodemailer, bcryptjs, jsonwebtoken and friends (npm).
