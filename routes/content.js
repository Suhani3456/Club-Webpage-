// routes/content.js — Excel-backed read-only endpoints.
// The club edits data/club.xlsx; nothing on the site is hard-coded.
const express = require("express");
const excel = require("../utils/excel");
const EventRegistration = require("../models/EventRegistration");

const router = express.Router();

function catchExcel(fn) {
  return async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (err) {
      console.error("Excel error:", err.message);
      res.status(500).json({ error: "Could not read the excel data right now." });
    }
  };
}

// GET /api/events — server decides past/upcoming and picks the "next" one.
// Each event also carries its `seats` limit (from the Excel seats column) and
// how many seats are already taken from MongoDB registrations.
router.get("/events", catchExcel(async () => {
  const data = await excel.getEvents();
  const counts = await EventRegistration.aggregate([
    { $group: { _id: "$eventKey", taken: { $sum: 1 } } },
  ]);
  const countByKey = Object.fromEntries(counts.map((c) => [c._id, c.taken]));
  for (const event of data.events) {
    event.eventKey = excel.eventKeyOf(event);
    event.taken = countByKey[event.eventKey] || 0;
    event.seatsLeft = event.seats == null ? null : Math.max(0, event.seats - event.taken);
    event.full = event.seats != null && event.taken >= event.seats;
  }
  return { events: data.events, today: data.today };
}));

// GET /api/projects
router.get("/projects", catchExcel(() => excel.getProjects()));

// GET /api/stats
router.get("/stats", catchExcel(() => excel.getStats()));

// GET /api/version — the club.xlsx mtime; the browser polls this to notice edits.
router.get("/version", (req, res) => {
  res.json({ version: excel.getVersion() });
});

module.exports = router;
