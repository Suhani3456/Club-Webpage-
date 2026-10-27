/* reset.js — the page the emailed "forgot password" link opens.
   Reads ?token=…, checks the two password fields, POSTs to the API. */
(function () {
  "use strict";

  var form = document.getElementById("reset-form");
  var done = document.getElementById("reset-done");
  var broken = document.getElementById("reset-broken");
  var alertEl = document.getElementById("reset-alert");
  var submitting = false;
  var token = "";

  function $(id) { return document.getElementById(id); }

  function setErr(inputId, message) {
    var input = $(inputId);
    var err = $(inputId + "-err");
    var field = input.closest(".field");
    if (message) {
      err.textContent = message;
      err.hidden = false;
      field.classList.add("invalid");
      input.setAttribute("aria-invalid", "true");
    } else {
      err.hidden = true;
      field.classList.remove("invalid");
      input.removeAttribute("aria-invalid");
    }
  }

  function showBroken(message) {
    form.hidden = true;
    broken.hidden = false;
    var p = broken.querySelector("p.muted");
    if (p && message) p.textContent = message;
  }

  // No token, or a mangled URL → the form is pointless.
  var params = new URLSearchParams(window.location.search);
  token = (params.get("token") || "").trim();
  if (!/^[0-9a-f]{64}$/i.test(token)) {
    showBroken("The link looks incomplete. Open it straight from the email, or request a fresh one.");
    return;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (submitting) return;

    var password = $("new-password").value;
    var confirm = $("confirm-password").value;

    var bad = false;
    if (password.length < 8) { setErr("new-password", "Password needs to be at least 8 characters."); bad = true; }
    else setErr("new-password", "");
    if (!confirm) { setErr("confirm-password", "Type the password again to confirm."); bad = true; }
    else if (confirm !== password) { setErr("confirm-password", "The two passwords don't match."); bad = true; }
    else setErr("confirm-password", "");
    if (bad) {
      alertEl.textContent = "Check the fields marked above.";
      $(password.length < 8 ? "new-password" : "confirm-password").focus();
      return;
    }
    alertEl.textContent = "";

    submitting = true;
    $("reset-submit").disabled = true;
    fetch("/api/auth/reset-password", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token, password: password, confirm: confirm }),
    })
      .then(function (r) { return r.json().then(function (data) { return { status: r.status, data: data }; }); })
      .then(function (res) {
        submitting = false;
        $("reset-submit").disabled = false;
        if (res.status >= 200 && res.status < 300 && res.data.ok) {
          form.hidden = true;
          done.hidden = false;
        } else {
          alertEl.textContent = res.data && res.data.error ? res.data.error : "Something went wrong. Try again.";
        }
      })
      .catch(function () {
        submitting = false;
        $("reset-submit").disabled = false;
        alertEl.textContent = "Network problem. Try again.";
      });
  });
})();
