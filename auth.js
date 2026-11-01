"use strict";

/* Sign in, register and password reset using Firebase Authentication.
   Passwords are handled by Firebase and never appear in this site's files or database. */

const NEXT_PATTERN = /^[a-z-]+\.html(\?[A-Za-z0-9=&_%.-]*)?$/;

function requestedPage() {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && NEXT_PATTERN.test(next) ? next : null;
}

function showAuthMessage(id, text, isError = false) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = text;
  element.classList.toggle("error", isError);
}

async function goAfterLogin() {
  resetAuthState();
  const { isAdmin, merchant, courier } = await getAuthState();
  const home = isAdmin ? "admin.html"
    : merchant && merchant.status === "approved" ? "merchant.html"
    : courier && courier.status === "approved" ? "courier.html"
    : "account.html";
  window.location.href = requestedPage() || home;
}

function setBusy(form, busy) {
  form.querySelectorAll("button[type=submit]").forEach(button => { button.disabled = busy; });
}

/* ---------- Register ---------- */

const registerForm = document.getElementById("register-form");

if (registerForm) {
  /* The owner decides what a new customer must give (phone, ID card) and whether sign-up is open. */
  let kycState = { photo: "" };
  let registrationOpen = true, opening = null;
  (async () => {
    const f = (await getFeatures()).customer;
    const kycHost = document.getElementById("register-kyc");
    if (kycHost) kycHost.innerHTML = kycFieldsHTML("rk", { phone: f.requirePhone, id: f.requireId });
    kycState = bindKycFields("rk", null);
    /* closed while the owner's switch is off, AND until the opening date the owner wrote (when that date has passed the sign-up opens by itself) */
    opening = window.loadOpening ? await window.loadOpening() : null;
    const waiting = Boolean(opening && opening.time && opening.time > Date.now());
    if (f.registrationOpen === false || waiting) {
      if (waiting || !(opening && opening.time && opening.time <= Date.now())) {
        registrationOpen = false;
        showAuthMessage("register-message", "New registrations are closed for now. Please try again later.", true);
        registerForm.querySelectorAll("button[type=submit]").forEach(button => { button.disabled = true; });
        if (window.showOpeningPopup) window.showOpeningPopup(opening);
      }
    }
  })();
  registerForm.addEventListener("submit", async event => {
    event.preventDefault();
    const messageId = "register-message";

    if (!initBackend()) return showAuthMessage(messageId, "The store backend is not connected yet.", true);
    if (!registrationOpen) { if (window.showOpeningPopup) window.showOpeningPopup(opening); return showAuthMessage(messageId, "New registrations are closed for now. Please try again later.", true); }

    const email = document.getElementById("register-email").value.trim().toLowerCase();
    const password = document.getElementById("register-password").value;
    const confirm = document.getElementById("register-confirm").value;

    if (!email) return showAuthMessage(messageId, "Please enter your email.", true);
    if (password.length < 8) return showAuthMessage(messageId, "Use at least 8 characters for your password.", true);
    if (password !== confirm) return showAuthMessage(messageId, "The passwords do not match.", true);

    let kycData;
    try { kycData = readKycFields("rk", kycState); } catch (error) { return showAuthMessage(messageId, error.message, true); }

    setBusy(registerForm, true);
    try {
      const credential = await auth.createUserWithEmailAndPassword(email, password);

      /* Firebase emails a confirmation link. Ordering and applying to sell/deliver need it. */
      try {
        await credential.user.sendEmailVerification();
      } catch (error) {
        console.error("Verification email could not be sent:", error); /* the banner offers "send again" */
      }

      try {
        await saveProfile(credential.user.uid, {
          email,
          phone: kycData.phone,
          customerId: `MKC-${randomHex(3).toUpperCase()}`,
          createdAt: new Date().toISOString()
        });
      } catch (error) {
        console.error("Profile could not be created yet:", error); /* account page retries */
      }

      try { await saveKyc(credential.user.uid, kycData); } catch (error) { console.error("Identity details not saved:", error); /* the account page asks again */ }

      await goAfterLogin();
    } catch (error) {
      showAuthMessage(messageId, authErrorMessage(error), true);
      setBusy(registerForm, false);
    }
  });
}

/* ---------- Sign in ---------- */

const loginForm = document.getElementById("login-form");

if (loginForm) {
  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    const messageId = "login-message";

    if (!initBackend()) return showAuthMessage(messageId, "The store backend is not connected yet.", true);

    const email = document.getElementById("login-email").value.trim().toLowerCase();
    const password = document.getElementById("login-password").value;

    setBusy(loginForm, true);
    try {
      await auth.signInWithEmailAndPassword(email, password);
      await goAfterLogin();
    } catch (error) {
      showAuthMessage(messageId, authErrorMessage(error), true);
      setBusy(loginForm, false);
    }
  });

  document.getElementById("forgot-password").addEventListener("click", async () => {
    const messageId = "login-message";
    if (!initBackend()) return showAuthMessage(messageId, "The store backend is not connected yet.", true);

    const email = document.getElementById("login-email").value.trim().toLowerCase();
    if (!email) return showAuthMessage(messageId, "Enter your email above, then click “Forgot password?” again.", true);

    try {
      await auth.sendPasswordResetEmail(email);
    } catch (error) {
      if (error && (error.code === "auth/invalid-email" || error.code === "auth/network-request-failed")) {
        return showAuthMessage(messageId, authErrorMessage(error), true);
      }
    }
    /* Same answer whether or not the account exists, so emails cannot be probed. */
    showAuthMessage(messageId, "If an account exists for this email, a reset link has been sent.");
  });
}
