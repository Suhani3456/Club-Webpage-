/*
 * tests/auth-ui.test.js — drives the real public/index.html + public/main.js in jsdom.
 *
 * Covers the "Forgot password?" visibility bug:
 *   1. link visible immediately on the first open of the Log in form
 *   2. hidden in Sign up mode, back when returning to Log in
 *   3. still correct after Escape-close and reopening
 * plus the other mode-dependent elements and Escape-to-close.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const mainJs = fs.readFileSync(path.join(root, "public", "main.js"), "utf8");

let failures = 0;
function check(label, ok) {
  if (ok) {
    console.log("  ok   " + label);
  } else {
    failures++;
    console.error("  FAIL " + label);
  }
}

// jsdom needs a couple of browser APIs main.js touches before its listeners exist.
const dom = new JSDOM(html, {
  url: "http://localhost:3000/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  beforeParse(window) {
    window.matchMedia = () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    });
    window.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    window.fetch = () => Promise.resolve({ status: 200, json: () => Promise.resolve({}) });
  },
});

// run the real site script in the window context
dom.window.eval(mainJs);

const doc = dom.window.document;
const $ = (id) => doc.getElementById(id);

function authVisible() {
  return !$("auth-overlay").hidden;
}

(async () => {
  console.log("Auth UI tests");

  // 1. first open of the dialog
  $("login-btn").click();
  check("dialog opens on first click", authVisible());
  check("Forgot password? is visible immediately in Log in mode", $("forgot-link").hidden === false);
  check("name field is hidden in Log in mode", $("auth-name").closest(".field").hidden);
  check("submit button says Log in", $("auth-submit").textContent.trim().startsWith("Log in"));

  // 2. switch to Sign up and back
  doc.querySelector('[data-auth-mode="signup"]').click();
  check("Forgot password? is hidden in Sign up mode", $("forgot-link").hidden === true);
  check("name field is visible in Sign up mode", !$("auth-name").closest(".field").hidden);
  check("submit button says Create my account", $("auth-submit").textContent.trim().startsWith("Create my account"));
  doc.querySelector('[data-auth-mode="login"]').click();
  check("Forgot password? is back in Log in mode", $("forgot-link").hidden === false);
  check("name field is hidden again", $("auth-name").closest(".field").hidden);

  // 3. switch Sign up -> Log in without an input event (regression of the bug path)
  doc.querySelector('[data-auth-mode="signup"]').click();
  doc.querySelector('[data-auth-mode="login"]').click();
  check("still visible after rapid tab switches", $("forgot-link").hidden === false);

  // 4. keyboard Escape closes; reopen shows the link again straight away
  doc.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  check("Escape closes the dialog", !authVisible());
  $("login-btn").click();
  check("after reopen, Forgot password? is visible immediately again", authVisible() && $("forgot-link").hidden === false);

  // 5. Close button path keeps the state healthy too
  $("auth-close").click();
  check("Close button hides the dialog", !authVisible());
  $("login-btn-mobile").click();
  check("mobile Log in opens the dialog with the link visible", authVisible() && $("forgot-link").hidden === false);

  if (failures) {
    console.error("\n" + failures + " test(s) failed");
    process.exit(1);
  }
  console.log("\nAll auth UI tests passed");
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
