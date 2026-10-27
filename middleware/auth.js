// middleware/auth.js — require a valid session cookie; attaches the user to req.
const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/User");

module.exports = async function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[config.COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "You are not logged in." });
  }

  let payload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Your session has expired. Log in again." });
  }

  const user = await User.findById(payload.id, "name email verified").lean();
  if (!user) {
    return res.status(401).json({ error: "Your session has expired. Log in again." });
  }
  if (!user.verified) {
    return res.status(403).json({ error: "Please verify your email before doing this." });
  }

  req.user = { id: user._id, name: user.name, email: user.email };
  next();
};
