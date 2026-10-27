// server.js — Express app: JSON API + the static frontend in /public.
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");

const config = require("./config");
const excel = require("./utils/excel");
const mailer = require("./utils/mailer");
const authRoutes = require("./routes/auth");
const contentRoutes = require("./routes/content");
const joinRouter = require("./routes/join");
const eventRegRouter = require("./routes/eventreg");

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Google Fonts for Archivo / IBM Plex; inline style attributes are used by main.js
      styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
    },
  },
  crossOriginResourcePolicy: { policy: "same-origin" },
}));
app.use(express.json({ limit: "20kb" }));
app.use(cookieParser());

// API first.
app.use("/api/auth", authRoutes);
app.use("/api", contentRoutes); // /api/events /api/projects /api/stats
app.use("/api", joinRouter);    // /api/join
app.use("/api", eventRegRouter); // /api/event-register

// A friendly JSON 404 for unknown API paths.
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Unknown API endpoint." });
});

// Static frontend, served from /public.
app.use(express.static("public", { extensions: ["html"] }));

// Fall back to index.html for anything that is not a real file (e.g. /about).
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api")) return next();
  res.sendFile("index.html", { root: "public" }, (err) => (err ? next(err) : null));
});

// Every error finishes as JSON.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON in the request body." });
  }
  if (err.code === 11000) {
    return res.status(409).json({ error: "This email is already on the membership sheet." });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our side." });
});

// Start only when MongoDB is reachable.
async function start() {
  const mongoose = require("mongoose");
  try {
    await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  } catch (err) {
    console.error(
      "\nCould not reach MongoDB at " + config.MONGODB_URI +
      "\nStart it (mongod) or check MONGODB_URI in .env, then try again.\n"
    );
    process.exit(1);
  }
  console.log("Connected to MongoDB");

  // If SMTP is set up, prove it works now — a misconfigured relay should be
  // obvious in the first second, not the first signup. Never logs SMTP_PASS.
  if (mailer.smtpConfigured()) {
    const smtpCheck = await mailer.verifySmtp();
    if (smtpCheck.ok) {
      console.log("SMTP ready (" + config.SMTP.host + ":" + config.SMTP.port + ")");
    } else {
      console.warn("\n⚠ " + smtpCheck.message + "\n  Right now emails will fail; fix .env and restart.\n");
    }
  }  // Fail fast if the workbook is missing.
  try {
    const stats = await excel.getStats();
    if (!stats || !stats.stats || !stats.stats.length) {
      console.warn("⚠ data/club.xlsx had no stats rows. Run: npm run seed");
    }
  } catch {
    console.warn("⚠ data/club.xlsx could not be read. Run: npm run seed");
  }

  app.listen(config.PORT, () => {
    console.log(
      "Coding Club running on http://localhost:" + config.PORT +
      "  (" + config.NODE_ENV + (mailer.smtpConfigured() ? ", SMTP on — emails delivered for real)" : ", SMTP off — dev mode prints codes/links here)")
    );
  });
}

start();
