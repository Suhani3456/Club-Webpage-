// models/EventRegistration.js — one seat per (event, email).
// The event identity is the same key the Excel-backed endpoints use
// (utils/excel.eventKeyOf), so limits set in the spreadsheet are enforced here.
const mongoose = require("mongoose");

const eventRegistrationSchema = new mongoose.Schema({
  eventKey: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, lowercase: true, trim: true },
  registeredOn: { type: Date, default: Date.now },
});

eventRegistrationSchema.index({ eventKey: 1, email: 1 }, { unique: true });

module.exports = mongoose.model("EventRegistration", eventRegistrationSchema);
