// config.js — load .env once and validate required settings.
require("dotenv").config();

const required = ["MONGODB_URI", "JWT_SECRET"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(
    "\nMissing required environment variables: " + missing.join(", ") +
    "\nCopy .env.example to .env and fill in the values (see README.md), then start again.\n"
  );
  process.exit(1);
}

module.exports = {
  PORT: parseInt(process.env.PORT || "3000", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  MONGODB_URI: process.env.MONGODB_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  SMTP: {
    host: String(process.env.SMTP_HOST || "").trim(),
    port: parseInt(String(process.env.SMTP_PORT || "587").trim(), 10),
    user: String(process.env.SMTP_USER || "").trim(),
    pass: String(process.env.SMTP_PASS || "").trim(),
    from: String(process.env.MAIL_FROM || "").trim(),
  },
  COOKIE_NAME: "cc_session",
};
