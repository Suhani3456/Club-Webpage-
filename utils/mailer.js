// utils/mailer.js — real email delivery over SMTP (Brevo relay by default).
//
// Rules this module follows:
//  • Transport is built from SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS in
//    .env (already trimmed in config.js). secure=true only on port 465; port
//    587 uses STARTTLS (secure=false + requireTLS=true). Nothing is hardcoded.
//  • MAIL_FROM is used exactly as set in .env.
//  • When SMTP is configured, codes and reset links go by email ONLY — nothing
//    is printed to the terminal. Without SMTP, codes print in dev only.
//  • sendMail failures surface as a MailSendError; routes turn that into a
//    clean 503 for the frontend and log the real SMTP error here.
//  • SMTP_PASS is never printed anywhere.
const nodemailer = require("nodemailer");
const config = require("../config");

function smtpConfigured() {
  return Boolean(config.SMTP.host && config.SMTP.user && config.SMTP.pass && config.SMTP.from);
}

function buildTransport() {
  const { host, port, user, pass } = config.SMTP;
  // secure=true only for implicit TLS on 465; 587 is STARTTLS.
  const secure = port === 465;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure && port === 587 ? true : undefined,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });
}

let transporter = null;
if (smtpConfigured()) {
  transporter = buildTransport();
}

class MailSendError extends Error {
  constructor(original) {
    super("Could not send the email");
    this.name = "MailSendError";
    this.original = original; // the real nodemailer error, for server logs only
  }
}

// Map a nodemailer/SMTP error to a hint about WHICH setting is likely wrong.
function diagnose(error) {
  const code = error && (error.code || (error.command ? error.command : ""));
  const text = String((error && (error.response || error.message)) || "");

  if (code === "EAUTH" || /535|authentication/i.test(text)) {
    return "SMTP login was rejected — SMTP_USER / SMTP_PASS look wrong. " +
      "The Brevo login is your account email (like xxxx@smtp-brevo.com) and the key is a generated SMTP key.";
  }
  if (/550|553|sender|envelope/i.test(text)) {
    return "The relay refused the message — most often the MAIL_FROM sender address is not verified in Brevo.";
  }
  if (code === "ECONNREFUSED" || code === "ECONNECTION" || code === "ESOCKET") {
    return "The connection was refused — check SMTP_HOST and SMTP_PORT (587 with STARTTLS, or 465).";
  }
  if (code === "ENOTFOUND") {
    return "SMTP_HOST did not resolve — check the host name (e.g. smtp-relay.brevo.com).";
  }
  if (code === "ETIMEDOUT" || code === "ETLS") {
    return "The connection timed out or TLS failed — check SMTP_PORT and whether your network/IP is authorized in Brevo.";
  }
  return "Check SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM in .env.";
}

// Called once at server start. Never returns or logs the password.
async function verifySmtp() {
  if (!smtpConfigured()) {
    return { ok: false, configured: false, message: "SMTP is not configured (SMTP_HOST/SMTP_USER/SMTP_PASS/MAIL_FROM are not all set)." };
  }
  try {
    await transporter.verify();
    return { ok: true, configured: true, message: "SMTP ready" };
  } catch (error) {
    // Log the real error server-side (no secrets in it), surface a hint.
    console.error("SMTP verify failed:", error.code || error.command || "", error.response || error.message);
    return { ok: false, configured: true, message: "SMTP not ready — " + diagnose(error) };
  }
}

async function sendEmail({ to, subject, text }) {
  if (!smtpConfigured()) {
    if (config.NODE_ENV !== "production") {
      throw new Error("SMTP is not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM in .env");
    }
    throw new Error("SMTP is not configured on the server");
  }
  try {
    await transporter.sendMail({ from: config.SMTP.from, to, subject, text });
  } catch (error) {
    console.error("SMTP send failed:", error.code || error.command || "", error.response || error.message);
    throw new MailSendError(error);
  }
}

// Without SMTP, codes and links print in development ONLY — never in
// production, and never when real SMTP delivery is configured.
function devFallback(subject, to, lines) {
  console.log("\n" + "=".repeat(52));
  console.log("  SMTP not configured — " + subject);
  console.log("  To: " + to);
  for (const line of lines) console.log("  " + line);
  console.log("=".repeat(52) + "\n");
}

async function sendVerificationCode(email, code) {
  const subject = "Your Coding Club verification code";
  if (!smtpConfigured()) {
    if (config.NODE_ENV !== "production" && config.NODE_ENV !== "test") {
      devFallback(subject, email, ["CODE: " + code + "   (valid for 10 minutes)"]);
      return;
    }
    throw new Error("SMTP is not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM in .env");
  }
  return sendEmail({
    to: email,
    subject,
    text:
      "Your Coding Club verification code is " + code + ".\n" +
      "It is valid for 10 minutes. If you didn't sign up, ignore this email.",
  });
}

async function sendPasswordResetLink(email, link) {
  const subject = "Reset your Coding Club password";
  if (!smtpConfigured()) {
    if (config.NODE_ENV !== "production" && config.NODE_ENV !== "test") {
      devFallback(subject, email, ["LINK: " + link + "   (valid for 15 minutes, single use)"]);
      return;
    }
    throw new Error("SMTP is not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM in .env");
  }
  return sendEmail({
    to: email,
    subject,
    text:
      "Reset your Coding Club password with this link:\n\n" + link + "\n\n" +
      "The link is valid for 15 minutes and can be used once.\n" +
      "If you didn't ask for a password reset, ignore this email.",
  });
}

module.exports = { sendEmail, sendVerificationCode, sendPasswordResetLink, smtpConfigured, verifySmtp, diagnose, MailSendError };
