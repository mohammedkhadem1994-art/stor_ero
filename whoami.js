"use strict";

/* A check page: who the site thinks you are (id, email) and which role records exist for this id. */
(function () {
  const box = document.getElementById("who-box");
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const say = html => { box.innerHTML = html; };
  function start() {
    try {
      if (!window.firebase || typeof FIREBASE_CONFIG === "undefined") return say("<p>The site is not connected to Firebase (firebase-config.js is empty).</p>");
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      const db = firebase.firestore();
      const stop = firebase.auth().onAuthStateChanged(async user => {
        if (typeof stop === "function") stop();
        if (!user) return say('<p><strong>You are not signed in.</strong> <a href="login.html">Sign in</a>, then open this page again.</p>');
        const rows = [];
        for (const [col, label] of [["admins", "Owner (administrator)"], ["deans", "Dean"], ["supervisors", "Supervisor"], ["merchants", "Seller / doctor / barber / agency / taxi"], ["couriers", "Delivery partner"]]) {
          let state;
          try {
            const snap = await db.collection(col).doc(user.uid).get();
            const d = snap.exists ? snap.data() : null;
            state = !snap.exists ? "no record" : d.locked === true ? "record exists, but LOCKED" : d.status ? "record exists (status: " + esc(d.status) + ")" : "record exists";
          } catch (error) { state = "could not read it: " + esc(error.code || error.message); }
          rows.push(`<tr><td>${esc(label)}</td><td><code>${col}/${esc(user.uid)}</code></td><td><strong>${state}</strong></td></tr>`);
        }
        say(`<p>Email: <strong>${esc(user.email || "")}</strong><br>Id (uid): <code>${esc(user.uid)}</code><br>Email verified: <strong>${user.emailVerified ? "yes" : "no"}</strong></p>
          <div class="table-wrap"><table class="orders-table"><thead><tr><th>Role</th><th>Record</th><th>State</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>
          <p class="muted">A dean or supervisor menu appears only when its record exists and is not locked, under exactly this id.</p>`);
      });
    } catch (error) { say("<p>Error: " + esc(error.message) + "</p>"); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
