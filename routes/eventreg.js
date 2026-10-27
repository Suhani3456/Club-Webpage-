// routes/eventreg.js — event seat registration.
// The seat limit comes from the `seats` column in data/club.xlsx (blank =
// unlimited) and is enforced here against MongoDB registrations.
const express = require("express");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");

const excel = require("../utils/excel");
const { normaliseEmail, isRvceEmail } = require("../utils/validate");
const EventRegistration = require("../models/EventRegistration");

const router = express.Router();

// Keep one person from filling seats quickly.
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many registration attempts. Try again in ~15 minutes." },
});

// POST /api/event-register { title, date, name, email }
router.post(
  "/event-register",
  registerLimiter,
  [
    body("title").trim().isLength({ min: 1, max: 200 }).withMessage("Which event is this for?"),
    body("date").trim().isLength({ min: 1, max: 20 }).withMessage("Which event is this for?"),
    body("name").trim().isLength({ min: 2, max: 80 }).withMessage("Please tell us your name."),
    body("email").custom((v) => isRvceEmail(v)).withMessage("You need your @rvce.edu.in address."),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const email = normaliseEmail(req.body.email);
    const title = String(req.body.title || "").trim();
    const date = String(req.body.date || "").trim();
    const eventKey = excel.eventKeyOf({ title, date });

    try {
      // The event must actually exist in the spreadsheet and be upcoming.
      const data = await excel.getEvents();
      const event = data.events.find((e) => excel.eventKeyOf(e) === eventKey);
      if (!event || event.status === "past") {
        return res.status(404).json({ error: "That event isn't open for registrations." });
      }

      // Capacity check: seats is set in the Excel `seats` column.
      if (event.seats != null) {
        const taken = await EventRegistration.countDocuments({ eventKey });
        if (taken >= event.seats) {
          return res.status(409).json({ error: "No more registrations can be taken — the seats are full for this event." });
        }
      }

      try {
        await EventRegistration.create({ eventKey, name: req.body.name, email });
      } catch (err) {
        if (err.code === 11000) {
          return res.status(409).json({ error: "This email is already registered for this event." });
        }
        throw err;
      }

      const taken = await EventRegistration.countDocuments({ eventKey });
      return res.status(201).json({
        ok: true,
        message: "You're registered for \"" + event.title + "\"." + (event.seats != null ? " " + Math.max(0, event.seats - taken) + " seat(s) left." : ""),
        taken,
        seats: event.seats,
        seatsLeft: event.seats == null ? null : Math.max(0, event.seats - taken),
      });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
