// routes/auth.js — register, verify, login, logout, who-am-I.
const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");

const config = require("../config");
const User = require("../models/User");
const requireAuth = require("../middleware/auth");
const { normaliseEmail } = require("../utils/validate");
const mailer = require("../utils/mailer");
const { MailSendError } = require("../utils/mailer");

const router = express.Router();

// Brute-force protection on every auth endpoint.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 30, // 30 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in a few minutes." },
});
router.use(authLimiter);

// Email-sending endpoints get their own strict cap: max 5 sends per 15
// minutes, counted separately per email address and per IP.
const MAIL_LIMIT_WINDOW = 15 * 60 * 1000;
const MAIL_LIMIT_MAX = 5;

const mailIpLimiter = rateLimit({
  windowMs: MAIL_LIMIT_WINDOW,
  limit: MAIL_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || "unknown-ip",
  message: { error: "Too many emails requested. Try again in ~15 minutes." },
});

const mailEmailLimiter = rateLimit({
  windowMs: MAIL_LIMIT_WINDOW,
  limit: MAIL_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String((req.body && req.body.email) || "unknown-email").trim().toLowerCase(),
  message: { error: "Too many codes sent to this email. Try again in ~15 minutes." },
});

// Runs a mail send; on a real SMTP failure answers 503 with a clean message
// for the frontend and logs the underlying error server-side. Never reports
// ok when the mail did not go out. Returns true when the mail was sent,
// false when the 503 has already been answered.
async function trySendMail(res, { label, send, cleanupUser }) {
  try {
    await send();
    return true;
  } catch (err) {
    if (err instanceof MailSendError) {
      const cause = err.original || {};
      console.error(label + " — real SMTP error:", cause.code || cause.command || "", cause.response || cause.message || String(err));
      if (cleanupUser) {
        try { await cleanupUser.deleteOne(); } catch (e) { console.error(label + " — cleanup failed:", e.message); }
      }
      res.status(503).json({ error: "We couldn't send the email, try again" });
      return false;
    }
    throw err;
  }
}

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax",
  secure: config.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/",
};

function setSession(res, user) {
  const token = jwt.sign({ id: user._id }, config.JWT_SECRET, { expiresIn: "7d" });
  res.cookie(config.COOKIE_NAME, token, COOKIE_OPTS);
}

function clearSession(res) {
  res.clearCookie(config.COOKIE_NAME, { path: COOKIE_OPTS.path });
}

function codeHash(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

function makeCode() {
  // 6 digits, no leading-zero surprises
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

// POST /api/auth/register
router.post(
  "/register",
  [
    body("name").trim().isLength({ min: 2, max: 80 }).withMessage("Please tell us your name."),
    body("email")
      .trim().toLowerCase().isEmail().withMessage("That doesn't look like an email address.")
      .matches(/^[a-z0-9._%+-]+@rvce\.edu\.in$/).withMessage("You need your @rvce.edu.in address. Other domains are not allowed."),
    body("password").isLength({ min: 8 }).withMessage("Password needs to be at least 8 characters."),
    mailIpLimiter,
    mailEmailLimiter,
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(403).json({ error: errors.array()[0].msg });
    }

    const email = normaliseEmail(req.body.email);
    try {
      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(409).json({ error: "This email is already registered. Try logging in." });
      }

      const passwordHash = await bcrypt.hash(req.body.password, 12);
      const code = makeCode();
      const user = await User.create({
        name: req.body.name,
        email,
        passwordHash,
        verified: false,
        verifyCodeHash: codeHash(code),
        verifyCodeExpires: new Date(Date.now() + 10 * 60 * 1000),
        verifyAttempts: 0,
      });

      // If the relay rejects the mail, roll the half-created account back so
      // the user can sign up again once SMTP works.
      const sent = await trySendMail(res, { label: "Verification code (" + email + ")", send: () => mailer.sendVerificationCode(email, code), cleanupUser: user });
      if (!sent) return; // 503 already answered
      return res.status(201).json({ ok: true, message: "Check " + email + " for a 6-digit code." });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/auth/verify — 6-digit code from the email.
router.post(
  "/verify",
  [
    body("email").trim().toLowerCase().isEmail().withMessage("That doesn't look like an email address."),
    body("code").matches(/^\d{6}$/).withMessage("The code is 6 digits."),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const email = normaliseEmail(req.body.email);
    try {
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(400).json({ error: "No account with that email. Register first." });
      }
      if (user.verified) {
        return res.status(400).json({ error: "This email is already verified. Log in." });
      }
      if (!user.verifyCodeHash || !user.verifyCodeExpires || user.verifyCodeExpires.getTime() < Date.now()) {
        return res.status(400).json({ error: "That code has expired. Register again to get a new one." });
      }
      if (user.verifyAttempts >= 5) {
        return res.status(400).json({ error: "Too many wrong codes. Register again to get a new one." });
      }

      if (codeHash(req.body.code) !== user.verifyCodeHash) {
        user.verifyAttempts += 1;
        await user.save();
        const left = 5 - user.verifyAttempts;
        return res.status(400).json({
          error: left > 0
            ? "Wrong code. " + left + (left === 1 ? " attempt" : " attempts") + " left."
            : "Too many wrong codes. Register again to get a new one.",
        });
      }

      user.verified = true;
      user.verifyCodeHash = null;
      user.verifyCodeExpires = null;
      user.verifyAttempts = 0;
      await user.save();

      setSession(res, user);
      return res.json({ ok: true, message: "Verified. You're logged in." });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/auth/forgot-password — emails a one-time reset LINK if the account
// exists (verified or not — the link itself proves mailbox ownership;
// reset-password then completes verification too). Always answers ok, so
// nobody can probe which college emails are registered.
router.post(
  "/forgot-password",
  [
    body("email").trim().toLowerCase().isEmail().withMessage("That doesn't look like an email address."),
    mailIpLimiter,
    mailEmailLimiter,
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const email = normaliseEmail(req.body.email);
    try {
      const user = await User.findOne({ email });
      if (user) {
        // A 256-bit token: not guessable, hashed at rest, single-use, 15 minutes.
        const token = crypto.randomBytes(32).toString("hex");
        user.resetTokenHash = codeHash(token);
        user.resetTokenExpires = new Date(Date.now() + 15 * 60 * 1000);
        await user.save();

        // The link goes to the little password page served by this same site.
        const origin = process.env.BASE_URL || (req.protocol + "://" + req.get("host"));
        const link = origin + "/reset.html?token=" + token;
        const sent = await trySendMail(res, { label: "Reset link (" + email + ")", send: () => mailer.sendPasswordResetLink(email, link) });
        if (!sent) return; // 503 already answered — never claim the mail went out
      }
      return res.json({ ok: true, message: "If that email is registered, a reset link is on its way." });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/auth/reset-password — the emailed link's token + the new password.
router.post(
  "/reset-password",
  [
    body("token").isHexadecimal().isLength({ min: 64, max: 64 }).withMessage("The reset link is broken or out of date."),
    body("password").isLength({ min: 8 }).withMessage("Password needs to be at least 8 characters."),
    body("confirm").optional({ values: "falsy" }).isString(),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }
    if (req.body.confirm !== undefined && req.body.confirm !== req.body.password) {
      return res.status(400).json({ error: "The two passwords don't match." });
    }

    try {
      const tokenHash = codeHash(String(req.body.token));
      const user = await User.findOne({
        resetTokenHash: tokenHash,
        resetTokenExpires: { $gt: new Date() },
      });
      if (!user) {
        return res.status(400).json({ error: "That reset link has expired or was already used. Ask for a new one." });
      }

      user.passwordHash = await bcrypt.hash(req.body.password, 12);
      user.resetTokenHash = null; // single use
      user.resetTokenExpires = null;
      // Opening the emailed link proves mailbox ownership, which is all email
      // verification ever established — so finish signup here for accounts
      // that never got past the code step.
      if (!user.verified) user.verified = true;
      await user.save();

      // Log them in right away so the next thing they see is the site.
      setSession(res, user);
      return res.json({ ok: true, name: user.name, email: user.email });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/auth/resend — a fresh verification code for an unverified account.
router.post(
  "/resend",
  [
    body("email").trim().toLowerCase().isEmail().withMessage("That doesn't look like an email address."),
    mailIpLimiter,
    mailEmailLimiter,
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const email = normaliseEmail(req.body.email);
    try {
      const user = await User.findOne({ email, verified: false });
      if (user) {
        const code = makeCode();
        user.verifyCodeHash = codeHash(code);
        user.verifyCodeExpires = new Date(Date.now() + 10 * 60 * 1000);
        user.verifyAttempts = 0;
        await user.save();
        const sent = await trySendMail(res, { label: "Verification code resend (" + email + ")", send: () => mailer.sendVerificationCode(email, code) });
        if (!sent) return; // 503 already answered — never claim the mail went out
      }
      return res.json({ ok: true, message: "If that email still needs verifying, a new code is on its way." });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/auth/login
router.post(
  "/login",
  [
    body("email").trim().toLowerCase().isEmail().withMessage("That doesn't look like an email address."),
    body("password").isString().withMessage("Enter your password."),
  ],
  async (req, res, next) => {
    try {
      const email = normaliseEmail(req.body.email);
      const user = await User.findOne({ email });
      const ok = user && (await bcrypt.compare(String(req.body.password), user.passwordHash));

      if (!ok) {
        // Same message either way, so we don't leak which addresses exist.
        return res.status(401).json({ error: "Wrong email or password." });
      }
      if (!user.verified) {
        return res.status(403).json({ error: "Please verify your email before logging in." });
      }

      setSession(res, user);
      return res.json({ ok: true, name: user.name, email: user.email });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  res.json({ id: req.user.id, name: req.user.name, email: req.user.email });
});

module.exports = router;
