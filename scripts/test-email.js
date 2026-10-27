// scripts/test-email.js — send a test email through the configured SMTP relay.
// Usage:
//   node scripts/test-email.js someone@rvce.edu.in
//   npm run test-email -- someone@rvce.edu.in
//
// Prints success (with the message id) or the exact SMTP error. SMTP_PASS is
// never printed.
const config = require("../config");
const mailer = require("../utils/mailer");

const to = String(process.argv[2] || "").trim();

(async () => {
  if (!to) {
    console.error("Usage: npm run test-email -- someone@rvce.edu.in");
    process.exit(1);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    console.error("That email address doesn't look valid: " + to);
    process.exit(1);
  }

  if (!mailer.smtpConfigured()) {
    console.error(
      "SMTP is not configured.\n" +
      "Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM in .env (see README.md), then try again."
    );
    process.exit(1);
  }

  console.log("SMTP configured: " + config.SMTP.host + ":" + config.SMTP.port);
  console.log("From: " + config.SMTP.from);
  console.log("To: " + to);
  console.log("Logging in and sending a test message...");

  try {
    const check = await mailer.verifySmtp();
    if (!check.ok && check.configured) {
      console.error("\nSMTP verify failed:\n  " + check.message);
      process.exit(1);
    }
    await mailer.sendEmail({
      to,
      subject: "Coding Club SMTP test",
      text:
        "This is a test message from the Coding Club site.\n" +
        "If you can read this, real email delivery works.",
    });
    console.log("\nEmail sent successfully. Check the inbox (and junk folder) for: " + to);
    process.exit(0);
  } catch (err) {
    const cause = err.original || err; // MailSendError keeps the real error
    console.error("\nSending failed.\n  code: " + (cause.code || cause.command || "n/a"));
    console.error("  message: " + (cause.response || cause.message || String(err)));
    console.error("\n  " + mailer.diagnose(cause));
    process.exit(1);
  }
})();
