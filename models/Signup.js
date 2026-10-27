// models/Signup.js — one row per "Join the club" submission, one signup per email.
const mongoose = require("mongoose");

const signupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    year: {
      type: String,
      required: true,
      enum: ["First year", "Second year", "Third year", "Fourth year"],
    },
    msg: { type: String, default: "", maxlength: 500 },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// 409 on duplicates comes from this index + the route's findOne check.
signupSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model("Signup", signupSchema);
