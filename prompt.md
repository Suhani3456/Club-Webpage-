You are building the backend for my existing college club website and wiring it to the frontend. The folder contains index.html, style.css, main.js and README.md. FIRST read all four files fully before changing anything. Do not change the visual design: keep every class name, id and the CSS look exactly the same.

STACK (hackathon requirement): Node.js 18+, Express, MongoDB (mongoose), and the existing plain HTML/CSS/JS frontend served by Express. No React, no build step.

FOLDER STRUCTURE to create:
coding-club/
server.js
package.json
.env.example (and a .env I can fill in)
.gitignore (node_modules, .env)
routes/auth.js, routes/content.js, routes/join.js
models/User.js, models/Signup.js
middleware/auth.js
utils/excel.js, utils/mailer.js, utils/validate.js
scripts/seed-excel.js
data/club.xlsx (created by the seed script)
public/ (move index.html, style.css, main.js here; Express serves this folder)

1. AUTHENTICATION

- Register + login + logout + "who am I" endpoints: POST /api/auth/register, POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me.
- ONLY emails ending exactly in @rvce.edu.in are allowed. Validate on the SERVER (the frontend check is only for UX). Trim and lowercase the email, then test against /^[a-z0-9._%+-]+@rvce\.edu\.in$/. Reject lookalikes such as a@rvce.edu.in.evil.com, a@mail.rvce.edu.in, a@rvce.edu.in@gmail.com. Return clear 400/403 JSON errors.
- Passwords hashed with bcryptjs (min 8 chars). Sessions via JWT in an httpOnly, sameSite=lax cookie (secure in production). Use cookie-parser.
- Email verification: after register, send a 6-digit code (valid 10 minutes, stored hashed, max 5 attempts) to the email using nodemailer with SMTP settings from .env. Add POST /api/auth/verify. A user cannot log in until verified. If SMTP is not configured and NODE_ENV is not production, print the code in the server terminal instead so I can test locally. This proves the person really owns an rvce.edu.in mailbox.
- Add helmet, express-rate-limit on the auth routes, and express-validator or equivalent input validation.
- Frontend: add a small Login / Sign up UI that fits the existing design (reuse existing button and field classes, e.g. btn, sheet-field), reachable from the header nav and the mobile menu. Show the same style of inline errors as the Join form. When logged in, show the user's name and a Log out button in the header instead of Login.
- The existing "Join the club" form (#form: name, email, year, msg) must require a logged-in user, or else apply the same @rvce.edu.in rule. Make it POST /api/join, saving to the Signup collection in MongoDB (name, email, year, msg, createdAt, one signup per email, return 409 on duplicates). Keep the existing success screen, but show it only after the server confirms success, and show server errors in the existing #form-alert.

2. EXCEL AS THE CONTENT SOURCE (the club edits the file, never the code)

- One workbook data/club.xlsx with three sheets, using the exceljs package:
  Sheet "Events": title | date (YYYY-MM-DD) | time | venue | bring | description | published (yes/no)
  Sheet "Projects": name | description | categories (space or comma separated: web, ai, security, hardware) | stack (comma separated) | link | featured (yes/no)
  Sheet "Stats": label | value (active members, projects shipped, workshops held, hackathons run)
- scripts/seed-excel.js creates the workbook pre-filled with the exact events, projects and stats currently hard-coded in index.html, so nothing is lost. Add the npm script "seed".
- utils/excel.js reads the workbook on request, cached by file modification time (re-read automatically whenever the file changes; no server restart needed). If the file is locked or half-saved, keep serving the last good data and log a warning, never crash. Skip empty rows and rows with published=no. Handle Excel date cells (real dates and text) correctly.
- Routes: GET /api/events, GET /api/projects, GET /api/stats. The SERVER decides "past" vs "upcoming" by comparing the event date with today's date in Asia/Kolkata time, and marks the earliest upcoming event as "next". Return events sorted by date.
- Frontend: remove the hard-coded events, projects, stats and the hero "Next meetup" ticket content from index.html. Render them from the API into the SAME markup structure and class names (li.project with data-cat, li.event with the event-head button, aria-controls and event-body ids like ev1, ev2, the .stat blocks with data-count, and the hero ticket with title, When, Where, Bring). Keep the "Next up" and "Past" tags, the .featured and .past classes, and a sensible empty state if there are no events.
- IMPORTANT: use textContent / createElement for all Excel-provided text. Never innerHTML with Excel data (XSS). Only allow http(s) links in the Projects link column.
- Make the project filter chip counts, the "Showing X of Y" counter, the events accordion, the stats count-up animation, the scroll reveal and the scroll-spy in main.js all still work AFTER dynamic rendering (initialise them after the data has loaded, and re-initialise them when new data arrives; do not leave duplicate event listeners).
- Live updates: the open page must pick up Excel changes without reload. Implement polling every 15 seconds, comparing a version/ETag (the file's mtime), and re-render only when it changed. Do not break open accordion items or the active filter when re-rendering if avoidable.
- Mirror each new Join signup to a SEPARATE file data/signups.xlsx (so it never conflicts with the file I edit). If that file is open/locked, retry or skip with a warning, since MongoDB remains the source of truth for signups and users.

3. CONFIG AND RUNNING

- .env.example with: PORT=3000, MONGODB_URI, JWT_SECRET, NODE_ENV, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM. Fail with a readable message if MONGODB_URI or JWT_SECRET is missing.
- package.json scripts: "start", "dev" (node --watch), "seed".
- Express serves /public and falls back sensibly; all API errors return JSON.
- Rewrite README.md for this full-stack version: prerequisites, setup, how to edit club.xlsx (column meanings with an example row), how auth works, how to run, how to deploy (Render or Railway + MongoDB Atlas), and a short "how it works" section I can read out to hackathon judges, plus a one-line explanation of every file.

4. QUALITY BAR (do all of this yourself before telling me you're done)

- Run npm install, run the seed script, start the server, and test with curl or a script: register with gmail (must fail), register with a@rvce.edu.in.evil.com (must fail), register with test@rvce.edu.in (works, code is printed), verify, login, /api/auth/me, join form, duplicate join (409), and all three content endpoints.
- Edit club.xlsx programmatically (add an event for tomorrow), confirm /api/events changes with no restart, then remove the test event.
- Fix every error and warning you find. Check the browser console would be clean: no references to removed elements, no undefined variables.
- At the end, give me: the list of files created or changed, the exact commands to run, and anything you could not test.
