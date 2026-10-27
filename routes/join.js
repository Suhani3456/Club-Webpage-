// routes/join.js — POST /api/join, requires login; saves the signup in Mongo
// and mirrors it to data/signups.xlsx (best effort, Mongo stays the truth).
const express = require("express");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");

const Signup = require("../models/Signup");
const mirror = require("../utils/excel");
const { normaliseEmail, isRvceEmail } = require("../utils/validate");

const router = express.Router();

const joinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many joins from this address. Try again later." },
});

// POST /api/join — a logged-in user must use their own verified college
// email; an anonymous submission must still be an @rvce.edu.in address.
router.post(
  "/join",
  joinLimiter,
  [
    body("name").trim().isLength({ min: 2, max: 80 }).withMessage("Please tell us your name."),
    body("year")
      .isIn(["First year", "Second year", "Third year", "Fourth year"])
      .withMessage("Choose your year of study."),
    body("msg").optional({ values: "falsy" }).trim().isLength({ max: 500 }).withMessage("Keep the message under 500 characters."),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }
    try {
      const email = normaliseEmail(req.body.email);
      // Server-side rule, same as registration.
      if (!isRvceEmail(email)) {
        return res.status(403).json({
          error: "Join with your @rvce.edu.in address. Other domains are not allowed.",
        });
      }
      if (req.user && req.user.email !== email) {
        return res.status(403).json({
          error: "You are logged in as " + req.user.email + ". Use that email on the sheet.",
        });
      }

      const dup = await Signup.findOne({ email });
      if (dup) {
        return res.status(409).json({ error: "This email is already on the membership sheet." });
      }

      const signup = await Signup.create({
        name: req.body.name,
        email,
        year: req.body.year,
        msg: req.body.msg || "",
      });

      // Mirror to the excel file, but never let a locked file fail the signup.
      mirror.appendSignup(submissionRow(signup)).catch((err) => {
        console.warn("signups.xlsx mirror failed (MongoDB still has the signup):", err.message);
      });

      const allEvents = await mirror.getEvents();
      const nextEvent = allEvents.events.find((e) => e.status === "next") || null;

      return res.status(201).json({
        ok: true,
        name: signup.name,
        email: signup.email,
        nextEvent,
      });
    } catch (err) {
      return next(err);
    }
  }
);

function submissionRow(s) {
  return {
    name: s.name,
    email: s.email,
    year: s.year,
    msg: s.msg || "",
    joinedOn: new Date().toISOString().slice(0, 10),
  };
}

module.exports = router;
