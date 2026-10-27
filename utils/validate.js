// utils/validate.js — shared validation helpers.
// The club rule: an email at exactly @rvce.edu.in, nothing else.
// a@rvce.edu.in.evil.com, a@mail.rvce.edu.in and a@rvce.edu.in@gmail.com all fail.
const RVCE_EMAIL_RE = /^[a-z0-9._%+-]+@rvce\.edu\.in$/;

function normaliseEmail(raw) {
  return String(raw || "").trim().toLowerCase();
}

function isRvceEmail(raw) {
  return RVCE_EMAIL_RE.test(normaliseEmail(raw));
}

function isStrongPassword(pw) {
  return typeof pw === "string" && pw.length >= 8;
}

module.exports = { RVCE_EMAIL_RE, normaliseEmail, isRvceEmail, isStrongPassword };
