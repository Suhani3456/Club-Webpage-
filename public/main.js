/* Coding Club — main.js (no dependencies; talks to the Express API) */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fetchOpts = { credentials: "same-origin", headers: { "Accept": "application/json" } };

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var LINK_RE = /^https?:\/\/\S+$/i;
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function $(id) { return document.getElementById(id); }
  function pad(n) { return n < 10 ? "0" + n : String(n); }
  function setText(el, text) { if (el) el.textContent = text; }
  function monthOf(date) { // date is "YYYY-MM-DD" from the server
    var m = /^(?:\d{4})-(\d{2})-(\d{2})$/.exec(date);
    return m ? MONTHS[+m[1] - 1] + " " + (+m[2]) : date;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /* ---------- Header: solid on scroll ---------- */
  var header = document.querySelector(".site-header");
  function onScroll() { header.classList.toggle("solid", window.scrollY > 24 || menuOpen()); }
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- Mobile menu ---------- */
  var toggle = document.getElementById("nav-toggle");
  var mobileNav = document.getElementById("mobile-nav");
  function menuOpen() { return toggle.getAttribute("aria-expanded") === "true"; }
  function setMenu(open) {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "Close" : "Menu";
    mobileNav.hidden = !open;
    onScroll();
  }
  toggle.addEventListener("click", function () { setMenu(!menuOpen()); });
  mobileNav.addEventListener("click", function (e) {
    if (e.target.closest("a")) setMenu(false);
    if (e.target.closest("button")) setMenu(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (menuOpen()) { setMenu(false); toggle.focus(); }
      else if (!authOverlay.hidden) closeAuth();
    }
  });
  window.addEventListener("resize", function () { if (window.innerWidth >= 768 && menuOpen()) setMenu(false); });
  onScroll();

  /* ---------- Active section in the nav ---------- */
  var navLinks = document.querySelectorAll(".nav .tab");
  if ("IntersectionObserver" in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (a) {
          if (a.getAttribute("href") === "#" + entry.target.id) a.setAttribute("aria-current", "true");
          else a.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    ["about", "projects", "events", "join"].forEach(function (id) {
      var section = document.getElementById(id);
      if (section) spy.observe(section);
    });
  }

  /* =====================================================================
     AUTH — register, verify (6-digit code), login, logout, who-am-I
     ===================================================================== */
  var authOverlay = $("auth-overlay");
  var authForm = $("auth-form");
  var authMode = "login";
  var authSubmitting = false;

  var authBtnLogin = $("login-btn");
  var authBtnLoginMobile = $("login-btn-mobile");
  var authBtnLogout = $("logout-btn");
  var authBtnLogoutMobile = $("logout-btn-mobile");
  var userName = $("user-name");

  function authFor(mode) { // mode: login | signup
    return {
      name: authMode === "signup" ? { value: $("auth-name").value.trim(), err: $("auth-name-err") } : null,
      email: { value: $("auth-email").value.trim(), err: $("auth-email-err") },
      password: { value: $("auth-password").value, err: $("auth-password-err") },
      code: { value: $("auth-code").value.trim(), err: $("auth-code-err") },
    };
  }

  function setAuthFieldError(input, errEl, message) {
    var field = input.closest(".field");
    if (message) {
      setText(errEl, message);
      errEl.hidden = false;
      field.classList.add("invalid");
      input.setAttribute("aria-invalid", "true");
    } else {
      errEl.hidden = true;
      field.classList.remove("invalid");
      input.removeAttribute("aria-invalid");
    }
  }

  function authAlert(message) { setText($("auth-alert"), message || ""); }

  /* renderAuthMode is the single source of truth for every mode-dependent
     element of the dialog. It must be called on initial open, on every tab
     switch, every open/close — never leave this state to the HTML. */
  function renderAuthMode(mode) {
    authMode = mode;
    document.querySelectorAll("[data-auth-mode]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.authMode === mode));
    });
    var isSignup = mode === "signup";
    var isLogin = mode === "login";
    document.querySelectorAll(".signup-only").forEach(function (h) { h.hidden = !isSignup; });
    var forgot = $("forgot-link");
    if (forgot) forgot.hidden = !isLogin; // only Log in shows it, always
    $("auth-name").closest(".field").hidden = !isSignup;
    $("auth-name").required = isSignup;
    $("auth-password").closest(".field").hidden = mode === "reset";
    $("auth-password").setAttribute("autocomplete", isSignup || mode === "reset" ? "new-password" : "current-password");
    setText($("auth-password-label"), "Password");
    var labels = { signup: "Create my account", login: "Log in", reset: "Send reset code" };
    setText($("auth-submit").firstChild, labels[mode] + " ");
  }

  /* Full reset back to the clean Log in form — used on open, close and load. */
  function resetAuthUi() {
    $("auth-code-field").hidden = true;
    $("resend-link").hidden = true;
    ["auth-name-err", "auth-email-err", "auth-password-err", "auth-code-err"].forEach(function (id) { $(id).hidden = true; });
    ["auth-name", "auth-email", "auth-password", "auth-code"].forEach(function (id) {
      $(id).removeAttribute("aria-invalid");
      var field = $(id).closest(".field");
      if (field) field.classList.remove("invalid");
    });
    authForm.reset();
    pendingVerifyEmail = null;
    codePurpose = null;
    renderAuthMode("login");
  }

  document.querySelectorAll("[data-auth-mode]").forEach(function (b) {
    b.addEventListener("click", function () { renderAuthMode(b.dataset.authMode); authAlert(""); });
  });

  function openAuth() {
    authOverlay.hidden = false;
    document.body.style.overflow = "hidden";
    resetAuthUi(); // guarantees every element matches Log in mode, first open included
    if (resetNotice) { authAlert(resetNotice); resetNotice = null; }
    $("auth-email").focus();
  }
  function closeAuth() {
    authOverlay.hidden = true;
    document.body.style.overflow = "";
    resetAuthUi();
    authAlert("");
  }
  $("auth-close").addEventListener("click", closeAuth);
  authOverlay.addEventListener("click", function (e) { if (e.target === authOverlay) closeAuth(); });

  function showAuthFieldErrors(errors) {
    setAuthFieldError($("auth-name"), $("auth-name-err"), errors.name || "");
    setAuthFieldError($("auth-email"), $("auth-email-err"), errors.email || "");
    setAuthFieldError($("auth-password"), $("auth-password-err"), errors.password || "");
    setAuthFieldError($("auth-code"), $("auth-code-err"), errors.code || "");
  }

  authBtnLogin.addEventListener("click", openAuth);
  authBtnLoginMobile.addEventListener("click", openAuth);

  function updateHeaderAuth() {
    var loggedIn = Boolean(me);
    authBtnLogin.hidden = loggedIn;
    authBtnLogout.hidden = !loggedIn;
    userName.hidden = !loggedIn;
    setText(userName, loggedIn ? me.name : "");
    if (authBtnLogoutMobile) authBtnLogoutMobile.hidden = !loggedIn;
    if (authBtnLoginMobile) authBtnLoginMobile.hidden = loggedIn;
  }

  authBtnLogout.addEventListener("click", function () {
    fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
      .then(function () { me = null; updateHeaderAuth(); if (loggedInEmail) loggedInEmail = null; })
      .catch(function () { /* logging out is absolute: clear the UI either way */ });
    me = null;
    updateHeaderAuth();
  });
  if (authBtnLogoutMobile) authBtnLogoutMobile.addEventListener("click", function () { authBtnLogout.click(); });

  var pendingVerifyEmail = null;
  var pendingName = null;
  var codePurpose = null; // "verify" only now — password resets happen on the emailed link's page
  var resetNotice = null; // shown the next time the login dialog opens

  function askForCode(email) {
    codePurpose = "verify";
    pendingVerifyEmail = email;
    $("auth-code-field").hidden = false;
    $("auth-code").required = true;
    $("resend-link").hidden = false;
    // keep name and password out of the way while the code is checked
    $("auth-name").closest(".field").hidden = true;
    $("auth-password").closest(".field").hidden = true;
    setText($("auth-submit").firstChild, "Verify ");
    authAlert("");
    $("auth-code").focus();
  }

  $("resend-link").addEventListener("click", function () {
    if (!pendingVerifyEmail || authSubmitting) return;
    authSubmitting = true;
    fetch("/api/auth/resend", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pendingVerifyEmail }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        authSubmitting = false;
        authAlert(data && data.error ? data.error : (data && data.message) || "A new code is on its way.");
        $("auth-code").focus();
      })
      .catch(function () { authSubmitting = false; authAlert("Network problem. Try again."); });
  });

  $("forgot-link").addEventListener("click", function () {
    showAuthFieldErrors({});
    $("auth-code-field").hidden = true;
    $("auth-code").required = false;
    $("resend-link").hidden = true;
    pendingVerifyEmail = null;
    codePurpose = null;
    renderAuthMode("reset");
    authAlert("");
    $("auth-email").focus();
  });

  authForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (authSubmitting) return;
    var v = authFor();

    var codeStepVisible = !$("auth-code-field").hidden && $("auth-code").required && Boolean(pendingVerifyEmail);
    var isResetStep1 = authMode === "reset" && !codeStepVisible;

    var errors = {};
    if (authMode === "signup" && v.name && v.name.value.length < 2) errors.name = "Please tell us your name.";
    if (!v.email.value) errors.email = "We need your @rvce.edu.in address.";
    else if (!EMAIL_RE.test(v.email.value)) errors.email = "That doesn't look like an email address.";
    // the verification code step and the reset flow don't take a password here
    var needsPassword = !codeStepVisible && authMode !== "reset";
    if (needsPassword) {
      if (!v.password.value) errors.password = "Enter your password.";
      if (authMode === "signup" && v.password.value && v.password.value.length < 8) errors.password = "Password needs to be at least 8 characters.";
    }
    if (codeStepVisible && !/^\d{6}$/.test(v.code.value)) {
      errors.code = "The code is 6 digits.";
    }
    showAuthFieldErrors(errors);
    if (Object.keys(errors).length) return;

    var email = $("auth-email").value;
    var password = $("auth-password").value;

    // Reset step: ask the server to email the one-time reset link
    if (isResetStep1) {
      authSubmitting = true;
      fetch("/api/auth/forgot-password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
        .then(function (r) { return r.json().then(function (data) { return { status: r.status, data: data }; }); })
        .then(function (res) {
          authSubmitting = false;
          if (res.status !== 200 || !res.data.ok) {
            authAlert(res.data && res.data.error ? res.data.error : "Could not send the reset link. Try again.");
            return;
          }
          closeAuth();
          authAlert("");
          // the message goes back to a closed modal — surface it on next open instead
          resetNotice = "Check " + email.trim().toLowerCase() + " — a reset link is on its way. It works once, for 15 minutes.";
        })
        .catch(function () { authSubmitting = false; authAlert("Network problem. Try again."); });
      return;
    }

    // Verification step: enter or re-confirm a 6-digit code after registering
    if (codeStepVisible) {
      authSubmitting = true;
      fetch("/api/auth/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: (pendingVerifyEmail || "").toLowerCase(), code: v.code.value }),
      })
        .then(function (r) { return r.json().then(function (data) { return { status: r.status, data: data }; }); })
        .then(function (res) {
          authSubmitting = false;
          if (res.status !== 200 || !res.data.ok) {
            authAlert(res.data && res.data.error ? res.data.error : "Could not verify. Try again.");
            return;
          }
          me = { name: pendingName || "member", email: (pendingVerifyEmail || "").toLowerCase() };
          updateHeaderAuth();
          closeAuth();
        })
        .catch(function () { authSubmitting = false; authAlert("Network problem. Try again."); });
      return;
    }

    authSubmitting = true;
    var endpoint = authMode === "signup" ? "/api/auth/register" : "/api/auth/login";
    var payload = { email: email, password: password };
    if (authMode === "signup") payload.name = v.name ? v.name.value : "";

    fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json().then(function (data) { return { status: r.status, data: data }; }); })
      .then(function (res) {
        authSubmitting = false;
        if (res.status === 200 && res.data.ok) {
          me = res.data;
          // after login the server sends back the name we now show in the header
          if (authMode === "login") {
            updateHeaderAuth();
            closeAuth();
          }
          return;
        }
        if (res.status === 201) { // registered: now check the emailed code
          pendingName = v.name ? v.name.value : "";
          askForCode(email.toLowerCase());
          return;
        }
        if (res.status === 403 && /verify/i.test(res.data && res.data.error || "")) {
          // unverified login: jump straight to the code step for this email
          pendingName = res.data.name || "";
          askForCode(email.toLowerCase());
          return;
        }
        if (res.data && res.data.error) authAlert(res.data.error);
        else authAlert("Something went wrong. Try again.");
      })
      .catch(function () {
        authSubmitting = false;
        authAlert("Network problem. Try again.");
      });
  });

  let me = null;
  let loggedInEmail = null;

  resetAuthUi(); // clean Log in state from page load, even before the first open

  fetch("/api/auth/me", fetchOpts)
    .then(function (r) { return r.status === 200 ? r.json() : null; })
    .then(function (data) {
      if (data && data.name) { me = data; loggedInEmail = data.email; updateHeaderAuth(); }
      else updateHeaderAuth();
    })
    .catch(function () { /* server unreachable: show logged-out header */ });

  /* =====================================================================
     PROJECTS — rendered from GET /api/projects (never innerHTML)
     ===================================================================== */
  var list = $("project-list");
  var chips = document.querySelectorAll("[data-filter]");
  var empty = $("empty");
  var count = $("project-count");
  var allProjects = [];
  var activeFilter = "all";

  function projectCard(project, n) {
    var li = el("li", "project" + (project.featured ? " featured" : ""));
    li.dataset.cat = (project.categories || []).join(" ");

    li.append(el("span", "meta signal", pad(n + 1)));
    li.append(el("h3", "project-name", project.name));
    li.append(el("p", "muted", project.description));

    var stack = el("ul", "stack");
    stack.setAttribute("aria-label", "Built with");
    (project.stack || []).forEach(function (item) { stack.append(el("li", null, item)); });
    li.append(stack);

    // Only http(s) links from Excel are ever links — anything else is dropped.
    if (project.link && LINK_RE.test(project.link)) {
      var a = el("a", "ink-link strong project-link", "GitHub");
      a.href = project.link;
      a.target = "_blank";
      a.rel = "noopener";
      a.setAttribute("aria-label", "View " + project.name + " on GitHub (opens in a new tab)");
      var arrow = el("span", "arrow", "↗");
      arrow.setAttribute("aria-hidden", "true");
      a.append(document.createTextNode(" "), arrow);
      li.append(a);
    }
    return li;
  }

  function renderProjects() {
    list.replaceChildren.apply(list, allProjects.map(projectCard));
    updateFilterCounts();
    applyFilter(activeFilter);
  }

  function matches(project, filter) {
    return filter === "all" || project.categories.indexOf(filter) !== -1;
  }

  function updateFilterCounts() {
    chips.forEach(function (chip) {
      var f = chip.dataset.filter;
      var n = allProjects.filter(function (p) { return matches(p, f); }).length;
      var sup = chip.querySelector("sup");
      if (sup) sup.textContent = String(n);
    });
  }

  function applyFilter(filter) {
    activeFilter = filter;
    chips.forEach(function (c) { c.setAttribute("aria-pressed", String(c.dataset.filter === filter)); });
    var cards = list.querySelectorAll(".project");
    var shown = 0;
    allProjects.forEach(function (project, i) {
      var card = cards[i];
      if (!card) return;
      var ok = matches(project, filter);
      card.hidden = !ok;
      if (ok) shown++;
    });
    if (empty) empty.hidden = shown > 0;
    list.hidden = shown === 0;
    if (count) count.textContent = "Showing " + shown + " of " + allProjects.length;
    list.classList.remove("swap");
    void list.offsetWidth; // restart the fade
    list.classList.add("swap");
  }

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () { applyFilter(chip.dataset.filter); });
  });

  /* =====================================================================
     EVENTS — rendered from GET /api/events; server already sorted them
     (next/upcoming first, then most recent past) and tagged each status.
     ===================================================================== */
  var timeline = $("timeline");
  var eventsEmpty = $("events-empty");
  var openEvents = {}; // aria-controls id -> true, so a live update keeps them open

  function eventRow(event, n) {
    var isOpen = openEvents["ev" + (n + 1)] || false;
    var li = el("li", "event" + (event.status === "past" ? " past" : ""));

    var parts = event.date.split("-");
    var day = parts[2];
    var month = MONTHS[+parts[1] - 1];

    var h3 = el("h3", "event-h");
    if (event.status === "past") {
      var sr = el("span", "sr-only", "(past event)");
      h3.append(sr);
    }
    var btn = el("button", "event-head");
    btn.type = "button";
    btn.setAttribute("aria-expanded", String(isOpen));
    btn.setAttribute("aria-controls", "ev" + (n + 1));

    var date = el("span", "date");
    var time = el("time", null, day);
    time.setAttribute("datetime", event.date);
    date.append(time, el("span", "meta", month));

    var title = el("span", "event-title", event.title);
    if (event.status === "next") {
      var nextTagM = el("span", "meta tag-mobile is-next", "Next up");
      nextTagM.setAttribute("aria-hidden", "true");
      title.append(nextTagM);
    }
    if (event.status === "past") {
      var pastTagM = el("span", "meta tag-mobile", "Past");
      pastTagM.setAttribute("aria-hidden", "true");
      title.append(pastTagM);
    }

    var tag = el("span", "meta tag");
    if (event.status === "next") tag.classList.add("is-next"), setText(tag, "Next up");
    if (event.status === "past") tag.classList.add("is-past"), setText(tag, "Past");

    var chev = el("i", "chev");
    chev.setAttribute("aria-hidden", "true");
    btn.append(date, title, tag, chev);
    h3.append(btn);
    li.append(h3);

    var body = el("div", "event-body");
    body.id = "ev" + (n + 1);
    body.hidden = !isOpen; // keep the accordion as the visitor left it
    body.append(el("p", null, event.description));
    var regBox = eventRegisterBox(event);
    if (regBox) body.append(regBox);
    li.append(body);

    btn.addEventListener("click", function () {
      var open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      body.hidden = open;
      openEvents[body.id] = !open;
    });
    return li;
  }

  /* ---------- Event registration (seats limit comes from the Excel sheet) ----------
     event.seats = number from the club.xlsx `seats` column (null = unlimited);
     event.taken / event.full come from GET /api/events on every poll, so a "full"
     event flips to closed automatically when the seats run out — and reopens if
     the club raises the number later. */
  function eventRegisterBox(event) {
    if (event.status === "past" || event.full) {
      // Past events and events with no seats left: no form at all, just notice.
      if (event.status !== "past") {
        var closed = el("div", "event-register");
        var fullNote = el("p", "meta reg-status is-err", "Seats are full — no more registrations can be taken for this event.");
        closed.append(fullNote);
        return closed;
      }
      return null;
    }

    var box = el("div", "event-register");
    var status = el("p", "meta reg-status");
    function msg(text, kind) {
      setText(status, text || "");
      status.className = "meta reg-status" + (kind ? " " + kind : "");
    }
    if (event.seats != null) msg((event.taken || 0) + " of " + event.seats + " seats taken");
    box.append(status);

    var fields = el("div", "event-fields");
    var nameInput = el("input", "reg-field");
    nameInput.placeholder = "Full name";
    nameInput.setAttribute("aria-label", "Full name");
    nameInput.maxLength = 80;
    var emailInput = el("input", "reg-field");
    emailInput.type = "email";
    emailInput.placeholder = "you@rvce.edu.in";
    emailInput.setAttribute("aria-label", "College email");
    emailInput.maxLength = 120;
    fields.append(nameInput, emailInput);
    box.append(fields);

    var regBtn = el("button", "btn btn-line btn-sm", "Register  →");
    regBtn.type = "button";
    box.append(regBtn);

    // Logged-in visitors get a head start, still editable.
    if (me) { nameInput.value = me.name || ""; emailInput.value = me.email || ""; }

    function setBusy(busy) {
      regBtn.disabled = busy;
      setText(regBtn, busy ? "Registering…" : "Register  →");
    }

    function submitReg() {
      var name = nameInput.value.trim();
      var email = emailInput.value.trim();
      if (name.length < 2) { msg("Please tell us your name.", "is-err"); nameInput.focus(); return; }
      if (!EMAIL_RE.test(email)) { msg("You need your @rvce.edu.in address.", "is-err"); emailInput.focus(); return; }
      setBusy(true);
      fetch("/api/event-register", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: event.title, date: event.date, name: name, email: email }),
      })
        .then(function (r) { return r.json().then(function (data) { return { status: r.status, data: data }; }); })
        .then(function (res) {
          setBusy(false);
          if (res.status === 201 && res.data.ok) {
            msg(res.data.message || "You're registered for this event.", "is-ok");
            fields.hidden = true;
            regBtn.hidden = true;
          } else {
            msg(res.data && res.data.error ? res.data.error : "Could not register right now. Try again.", "is-err");
            if (res.data && res.data.error && /seats are full/i.test(res.data.error)) {
              fields.hidden = true;
              regBtn.hidden = true;
            }
          }
        })
        .catch(function () { setBusy(false); msg("Network problem. Try again.", "is-err"); });
    }

    regBtn.addEventListener("click", submitReg);
    [nameInput, emailInput].forEach(function (inp) {
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submitReg(); } });
    });
    return box;
  }

  function renderEvents(events) {
    openEvents = {}; // recollect from the current DOM first
    timeline.querySelectorAll(".event-head[aria-expanded='true']").forEach(function (b) {
      openEvents[b.getAttribute("aria-controls")] = true;
    });
    timeline.replaceChildren.apply(timeline, events.map(eventRow));
    eventsEmpty.hidden = events.length > 0;
    timeline.hidden = events.length === 0;
  }

  /* ---------- Hero ticket (next meetup) ---------- */
  function renderTicket(nextEvent) {
    var title = $("ticket-title");
    var rows = [
      { id: "ticket-when", text: nextEvent ? monthOf(nextEvent.date) + (nextEvent.time ? ", " + nextEvent.time : "") : "" },
      { id: "ticket-where", text: nextEvent ? nextEvent.venue : "" },
      { id: "ticket-bring", text: nextEvent ? nextEvent.bring : "" },
    ];
    if (nextEvent) {
      setText(title, nextEvent.title);
    } else {
      setText(title, "No meetup scheduled yet");
    }
    rows.forEach(function (row, i) {
      var dd = $(row.id);
      if (!dd) return;
      setText(dd, row.text);
      // hide empty facts (the CTF night has no room number, for instance)
      dd.hidden = !row.text;
      dd.previousElementSibling.hidden = !row.text;
      void i;
    });
  }

  /* ---------- Stats ---------- */
  var nums = [];
  var statsIO = null;
  var statsAnimated = false;

  function countUp(targetNode) {
    var value = +targetNode.dataset.count;
    if (reduceMotion) { setText(targetNode, pad(value)); return; }
    var start = performance.now();
    var dur = 1100;
    (function tick(t) {
      var p = Math.min(1, (t - start) / dur);
      setText(targetNode, pad(Math.round(value * (1 - Math.pow(1 - p, 3)))));
      if (p < 1) requestAnimationFrame(tick);
    })(start);
  }

  function renderStats(stats) {
    var grid = $("stats-grid");
    grid.replaceChildren.apply(grid, stats.map(function (s) {
      var wrap = el("div", "stat");
      wrap.append(el("span", "meta", s.label));
      var b = el("b", null, pad(s.value));
      b.dataset.count = String(s.value);
      wrap.append(b);
      return wrap;
    }));
    nums = grid.querySelectorAll("[data-count]");
    if (statsAnimated) {
      // A later poll changed the numbers: update in place, no re-animation
      // (the section is rarely in view when this happens, and re-animation looks broken).
      nums.forEach(function (n) { setText(n, pad(+n.dataset.count)); });
      return;
    }
    if ("IntersectionObserver" in window) {
      statsIO = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { nums.forEach(countUp); statsAnimated = true; statsIO.disconnect(); }
      }, { threshold: 0.4 });
      statsIO.observe(document.querySelector(".stats"));
    } else {
      nums.forEach(countUp);
      statsAnimated = true;
    }
  }

  /* ---------- Loading and live updates ---------- */
  var currentVersion = null;

  function loadContent() {
    Promise.all([
      fetch("/api/events", fetchOpts).then(function (r) { return r.json(); }),
      fetch("/api/projects", fetchOpts).then(function (r) { return r.json(); }),
      fetch("/api/stats", fetchOpts).then(function (r) { return r.json(); }),
    ])
      .then(function (results) {
        var eventsData = results[0] && results[0].events ? results[0] : { events: [] };
        var projectsData = results[1] && results[1].projects ? results[1] : { projects: [] };
        var statsData = results[2] && results[2].stats ? results[2] : { stats: [] };

        allProjects = projectsData.projects;
        renderProjects();
        renderEvents(eventsData.events);
        renderTicket(eventsData.events.find(function (e) { return e.status === "next"; }));
        renderStats(statsData.stats);
      })
      .catch(function (err) {
        console.warn("Could not load club content:", err);
      });
  }

  function pollVersion() {
    fetch("/api/version", fetchOpts)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || typeof data.version !== "string") return;
        if (currentVersion === null) { currentVersion = data.version; return; }
        if (data.version !== currentVersion) {
          currentVersion = data.version;
          loadContent(); // keep the accordion open and the active filter
        }
      })
      .catch(function () { /* server briefly down: try again in 15s */ });
  }

  fetch("/api/version", fetchOpts)
    .then(function (r) { return r.json(); })
    .then(function (data) { if (data) currentVersion = data.version; })
    .catch(function () { /* handled when loadContent runs */ })
    .then(loadContent);

  setInterval(pollVersion, 15000);

  /* ---------- Join form ---------- */
  var form = $("form");
  var done = $("done");
  var alertEl = $("form-alert");
  var yearSel = $("year");
  var touched = false;
  var submitting = false;

  function validate() {
    var v = { name: $("name").value.trim(), email: $("email").value.trim(), year: yearSel.value };
    var errors = {};
    if (v.name.length < 2) errors.name = "Please tell us your name.";
    if (!v.email) errors.email = "We need an email to send the meetup details.";
    else if (!EMAIL_RE.test(v.email)) errors.email = "That doesn't look like an email address.";
    else if (!me && v.email.indexOf("@rvce.edu.in") === -1) errors.email = "Join with your @rvce.edu.in address.";
    if (!v.year) errors.year = "Choose your year of study.";
    return { values: v, errors: errors };
  }

  function show(errors) {
    ["name", "email", "year"].forEach(function (k) {
      var input = $(k);
      var err = $(k + "-err");
      var field = input.closest(".field");
      if (errors[k]) {
        setText(err, errors[k]);
        err.hidden = false;
        field.classList.add("invalid");
        input.setAttribute("aria-invalid", "true");
        input.setAttribute("aria-describedby", k + "-err");
      } else {
        err.hidden = true;
        field.classList.remove("invalid");
        input.removeAttribute("aria-invalid");
        input.removeAttribute("aria-describedby");
      }
    });
    var n = Object.keys(errors).length;
    alertEl.textContent = n ? "Check the " + (n === 1 ? "field" : "fields") + " marked above." : "";
  }

  form.addEventListener("input", function () { if (touched) show(validate().errors); });
  yearSel.addEventListener("change", function () { yearSel.classList.toggle("is-empty", !yearSel.value); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (submitting) return;
    touched = true;
    var r = validate();
    show(r.errors);
    var first = ["name", "email", "year"].filter(function (k) { return r.errors[k]; })[0];
    if (first) { $(first).focus(); return; }

    submitting = true;
    fetch("/api/join", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(r.values),
    })
      .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
      .then(function (res) {
        submitting = false;
        if (res.status >= 200 && res.status < 300 && res.data.ok) {
          var firstName = res.data.name.split(/\s+/)[0];
          $("done-title").textContent = "You're on the list, " + firstName + ".";
          var text = $("done-text");
          text.textContent = "";
          text.append("We'll send the details to ");
          var em = document.createElement("span");
          em.className = "ink";
          setText(em, res.data.email);
          text.append(em);
          if (res.data.nextEvent && res.data.nextEvent.title) {
            text.append(". The next meetup is ");
            var ev = document.createElement("span");
            ev.className = "ink";
            setText(ev, res.data.nextEvent.title);
            text.append(ev, " on " + monthOf(res.data.nextEvent.date) + ".");
          } else {
            text.append(". See you at the next meetup.");
          }
          form.hidden = true;
          done.hidden = false;
          $("done-title").focus();
        } else {
          alertEl.textContent = res.data && res.data.error ? res.data.error : "Something went wrong. Try again.";
        }
      })
      .catch(function () {
        submitting = false;
        alertEl.textContent = "Network problem. Try again.";
      });
  });

  $("again").addEventListener("click", function () {
    form.reset();
    yearSel.classList.add("is-empty");
    touched = false;
    show({});
    done.hidden = true;
    form.hidden = false;
    $("name").focus();
  });

  /* ---------- Scroll reveal (static sections) ---------- */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add("in"); io.unobserve(entry.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    reveals.forEach(function (r) { io.observe(r); });
  } else {
    reveals.forEach(function (r) { r.classList.add("in"); });
  }

  /* ---------- Footer year ---------- */
  setText($("year-now"), String(new Date().getFullYear()));
})();
