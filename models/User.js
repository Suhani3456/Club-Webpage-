// models/User.js — registered members, with the email verification code.
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    verified: { type: Boolean, default: false },
    verifyCodeHash: { type: String, default: null }, // sha256 of the 6-digit code
    verifyCodeExpires: { type: Date, default: null }, // 10 minutes after the code was sent
    verifyAttempts: { type: Number, default: 0 }, // max 5 tries per code
    resetTokenHash: { type: String, default: null }, // sha256 of the emailed reset-link token
    resetTokenExpires: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
