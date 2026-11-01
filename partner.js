"use strict";

/* Apply to become a seller (merchant) or a delivery partner (courier). Requires store.js.
   The application is saved with status "pending"; only an administrator can approve it
   (enforced by the Firestore rules, not by this page). */

const params = new URLSearchParams(window.location.search);
let invitedBy = "";   /* set from the approved proposal of a supervisor (collabProposals); a link can not choose a supervisor any more */
document.querySelectorAll("#join-picker .join-card").forEach(a => { if (a.dataset.join === new URLSearchParams(window.location.search).get("kind")) a.classList.add("on"); });

/* A chosen type opens its own page: a cover picture, a big faded backdrop and the sign-up form (the chooser and its heading are hidden). */
(function joinPage() {
  const kind = params.get("kind");
  const card = kind ? document.querySelector(`#join-picker .join-card[data-join="${kind.replace(/[^a-z]/g, "")}"]`) : null;
  if (!card) return;
  document.body.classList.add("join-page");
  document.body.style.setProperty("--join-back", `url("demo/back-${card.dataset.join}.jpg")`);
  document.querySelector(".partner-main .admin-heading").hidden = true;
  document.querySelector(".join-picker-panel").hidden = true;
  const title = card.querySelector("strong").textContent;
  /* a cover strip across the whole page, then the sign-up window overlapping it, over a blurred backdrop */
  const hero = document.createElement("section");
  hero.className = "join-banner";
  hero.innerHTML = `<img class="join-cover" src="demo/cover-${card.dataset.join}.jpg" alt="">
    <div class="join-banner-inner"><a class="join-back" href="partner.html">← All account types</a><span class="eyebrow">JOIN THE MARKETPLACE</span><h1></h1><p>${card.querySelector("small").textContent}</p></div>`;
  hero.querySelector("h1").textContent = title;
  document.querySelector("main.partner-main").before(hero);
  /* the fields sit side by side (2 or 3 columns): every label is grouped with its field */
  document.querySelectorAll("#merchant-form, #courier-form, #direct-box").forEach(box => {
    [...box.children].forEach(el => {
      if (el.tagName !== "LABEL" || el.hidden || el.id === "m-kind-label") return;   /* the account-type label is hidden once a kind is chosen: no empty cell */
      const cell = document.createElement("div");
      cell.className = "jf";
      el.before(cell);
      cell.append(el);
      const next = cell.nextElementSibling;
      if (next && /^(INPUT|SELECT|TEXTAREA)$/.test(next.tagName) && !next.hidden) cell.append(next);
      if (cell.querySelector("textarea")) cell.classList.add("wide");
    });
  });
})();

const positions = { m: { lat: null, lng: null }, c: { lat: null, lng: null } };

function say(id, text, isError = false) {
  const element = document.getElementById(id);
  element.textContent = text;
  element.classList.toggle("error", isError);
}

function val(id) {
  return document.getElementById(id).value.trim();
}

/* When the database refuses an application, find out which condition of the rule failed and say it. */
async function whyDenied(user, kind, collection) {
  const reasons = [];
  const read = async (path, id) => { try { return await db.collection(path).doc(id).get(); } catch { return null; } };
  try {
    const token = await user.getIdTokenResult(true);
    if (token.claims.email_verified !== true) reasons.push("your email is not verified in the login token (log out, log in again)");
  } catch { /* ignore */ }
  const own = await read(collection, user.uid);
  if (own && own.exists) reasons.push("this account already has an application (status: " + (own.data().status || "?") + "), it cannot be sent twice");
  if (!(await getKyc(user.uid))) reasons.push("your identity details (ID) are missing");
  const feats = await read("settings", "features");
  const f = feats && feats.exists ? feats.data() : {};
  const group = collection === "couriers" ? "courier" : "merchant";
  if (f[group] && f[group].applicationsOpen === false) reasons.push("applications for this kind are switched off by the owner");
  const lim = await read("settings", "joinLimits"), cnt = await read("settings", "joinCounts");
  const key = collection === "couriers" ? "courier" : (kind || "shop");
  const max = lim && lim.exists && lim.data()[key] !== undefined ? Number(lim.data()[key]) : (key === "pharmacy" ? 0 : Infinity);
  if (Number((cnt && cnt.exists ? cnt.data()[key] : 0) || 0) >= max) reasons.push("the limit for '" + key + "' accounts is reached (limit " + max + ")");
  if (lim && lim.exists && lim.data().closed && lim.data().closed[key] === true) reasons.push("applications for '" + key + "' are closed by the owner");
  for (const c of ["couriers", "supervisors", "deans"]) {
    if (c === collection) continue;
    const d = await read(c, user.uid);
    if (d && d.exists) reasons.push("this account already has another role (" + c + ")");
  }
  if (!reasons.length) reasons.push("no known cause found; send this screenshot to support. Kind: " + key);
  return " Reason: " + reasons.join("; ") + ".";
}

function statusBox(title, doc, page, coll) {
  const labels = {
    pending: ["Pending review", "An administrator will review your application. You will see the result here."],
    approved: ["Approved", "Your account is active."],
    rejected: ["Not approved", "Your application was not approved. Contact the store owner for details."],
    suspended: ["Suspended", "Your account is suspended. Contact the store owner."]
  };
  const [label, help] = labels[doc.status] || [doc.status, ""];
  return `
    <section class="admin-panel partner-status status-${escapeHTML(doc.status)}">
      <h2>${escapeHTML(title)}: <span class="status-pill">${escapeHTML(label)}</span></h2>
      <p class="muted">${escapeHTML(help)}</p>
      ${doc.status === "approved" ? `<p><a class="button button-teal" href="${page}">Open dashboard</a></p>` : ""}
      ${doc.status === "pending" ? `<p><button type="button" class="small-button delete-button" data-cancel-app="${escapeHTML(coll)}">Cancel my application</button></p>` : ""}
    </section>`;
}

(async () => {
  if (!initBackend()) return;
  const { user, merchant, courier, supervisor, dean } = await getAuthState();

  const guest = !user;   /* a new collaborator: he creates his login and sends his application from this same page */
  if (guest) {
    const back = encodeURIComponent(`partner.html${window.location.search}`);
    const link = document.getElementById("d-signin"); if (link) link.href = `login.html?next=${back}`;
  }

  const boxes = [];
  if (merchant) boxes.push(statusBox({ doctor: "Doctor application", agency: "Travel agency application", taxi: "Taxi driver application", barber: "Barbershop application", hotel: "Hotel application", restaurant: "Restaurant application", pharmacy: "Pharmacy application" }[merchant.kind] || "Seller application", merchant, "merchant.html", "merchants"));
  if (courier) boxes.push(statusBox("Delivery partner application", courier, "courier.html", "couriers"));
  document.getElementById("partner-status").innerHTML = boxes.join("");
  document.querySelectorAll("[data-cancel-app]").forEach(btn => btn.addEventListener("click", async () => {
    if (!window.confirm("Cancel this application? You can apply again afterwards.")) return;
    btn.disabled = true;
    try {
      await db.collection(btn.dataset.cancelApp).doc(user.uid).delete();
      showToast("Application cancelled");
      window.location.reload();
    } catch (error) {
      console.error(error);
      btn.disabled = false;
      btn.insertAdjacentText("afterend", " " + authErrorMessage(error));
    }
  }));

  if (!guest && !user.emailVerified) {
    let saved = false;
    try { saved = Boolean((await getProfile(user.uid)).partnerDraft); } catch { /* optional */ }
    document.getElementById("partner-status").insertAdjacentHTML("beforeend", saved
      ? '<aside class="admin-notice"><strong>Your account is created and your application is saved.</strong> Open the confirmation link we emailed you, then sign in or reload this page: your application is sent automatically.</aside>'
      : '<p class="muted">Verify your email address first (see the notice at the top), then you can apply.</p>');
    return;
  }

  if (supervisor || dean) {
    document.getElementById("partner-forms").hidden = true;
    document.getElementById("partner-status").insertAdjacentHTML("beforeend",
      `<p class="muted">${dean ? "A dean" : "A supervisor"} only supervises and brings in people. This account cannot be a seller or a delivery partner. To do that job, create another account with another email.</p>`);
    return;
  }

  const features = await getFeatures();
  /* the owner's limits on new accounts: a kind that reached its number is closed */
  const joinFullKinds = {};
  try {
    const [l, c] = await Promise.all([db.collection("settings").doc("joinLimits").get(), db.collection("settings").doc("joinCounts").get()]);
    const limits = l.exists ? l.data() : null, counts = c.exists ? c.data() : {};
    for (const k of ["shop", "restaurant", "pharmacy", "doctor", "agency", "taxi", "barber", "hotel", "courier"]) {
      const max = limits && limits[k] !== undefined ? Number(limits[k]) : (k === "pharmacy" ? 0 : Infinity);
      if (Number(counts[k] || 0) >= max) joinFullKinds[k] = true;
      if (limits && limits.closed && limits.closed[k] === true) joinFullKinds[k] = "closed";   /* the owner switched this kind off */
    }
  } catch { /* no limits set */ }
  /* the chooser: a closed or full kind says so and does not open */
  document.querySelectorAll("#join-picker .join-card").forEach(a => {
    const state = joinFullKinds[a.dataset.join];
    if (!state) return;
    a.classList.add("closed");
    a.querySelector("small").textContent = state === "closed" ? "Closed for now" : "Full for now";
    a.addEventListener("click", ev => ev.preventDefault());
  });
  const kyc = guest ? null : await getKyc(user.uid);
  const idNeeded = ["merchant", "courier"].some(role => features[role].requireId !== false);
  if (!guest && !kyc && idNeeded) {
    document.getElementById("partner-status").insertAdjacentHTML("beforeend",
      '<p class="muted">Add your identity details first (phone, ID number and a photo of your ID card). They are required to work with us.</p><p><button type="button" class="button button-teal" id="open-kyc">Add identity details</button></p>');
    document.getElementById("open-kyc").addEventListener("click", () => showKycWall(user, false));
    showKycWall(user, false);
    return;
  }

  document.getElementById("partner-forms").hidden = false;
  /* One account = one role: after applying as a seller OR a delivery partner, no second application. */
  if (!guest) try {
    const prop = await db.collection("collabProposals").doc(user.uid).get();
    if (prop.exists && prop.data().status === "approved" && prop.data().supervisorId !== user.uid) invitedBy = String(prop.data().supervisorId);
  } catch { /* no proposal */ }
  if (invitedBy && features.supervisor.canInvite === false) invitedBy = "";   /* invitations are switched off */
  if (invitedBy) {
    document.getElementById("partner-status").insertAdjacentHTML("afterbegin",
      '<aside class="admin-notice"><strong>A supervisor added you and it was approved.</strong> Fill in the form below. The dean of your supervisor (or the owner) has to approve your application.</aside>');
  }
  const hasRole = Boolean(merchant || courier);
  document.getElementById("partner-forms").hidden = hasRole;
  document.getElementById("merchant-box").hidden = hasRole || Boolean(merchant);
  document.getElementById("courier-box").hidden = hasRole || Boolean(courier);
  const joinOpen = k => !(joinFullKinds[k]);
  if (features.merchant.applicationsOpen === false) {
    document.getElementById("merchant-box").hidden = true;
    document.getElementById("partner-status").insertAdjacentHTML("beforeend", '<p class="muted">New seller applications are closed for now.</p>');
  }
  if (features.courier.applicationsOpen === false || !joinOpen("courier")) {
    document.getElementById("courier-box").hidden = true;
    document.getElementById("partner-status").insertAdjacentHTML("beforeend", '<p class="muted">New delivery partner applications are closed for now.</p>');
  }
  if (hasRole) {
    document.getElementById("partner-status").insertAdjacentHTML("beforeend",
      '<p class="muted">Each account can be a seller <strong>or</strong> a delivery partner, not both. To do the other job, create a separate account with another email.</p>');
    return;
  }

  /* Pre-fill from the customer's profile. */
  let draft = null;
  if (!guest) try {
    const profile = await getProfile(user.uid);
    draft = profile.partnerDraft || null;
    for (const prefix of ["m", "c"]) {
      const set = (id, value) => { if (value && !val(id)) document.getElementById(id).value = value; };
      set(`${prefix}-name`, profile.fullName);
      set(`${prefix}-phone`, profile.phone);
      set(`${prefix}-country`, profile.country);
      set(`${prefix}-city`, profile.city);
      set(`${prefix}-address`, profile.address);
    }
  } catch { /* optional */ }

  document.querySelectorAll(".use-location").forEach(button => {
    button.addEventListener("click", async () => {
      const prefix = button.dataset.prefix;
      button.disabled = true;
      try {
        positions[prefix] = await getPosition();
        document.getElementById(`${prefix}-location`).textContent =
          `Location saved (${positions[prefix].lat}, ${positions[prefix].lng}).`;
      } catch (error) {
        say(`${prefix}-message`, error.message, true);
      } finally {
        button.disabled = false;
      }
    });
  });


  /* Seller or doctor: the wording of the form follows the choice. */
  const kindSelect = document.getElementById("m-kind");
  const KIND_TEXT = {
    shop: ["Shop / business name *", "Shop address *", "What do you sell?"],
    restaurant: ["Restaurant name *", "Restaurant address *", "What do you cook? (e.g. pizza, grills, sweets)"],
    pharmacy: ["Pharmacy name *", "Pharmacy address *", "What do you offer? (e.g. medicines, baby care, cosmetics)"],
    doctor: ["Clinic / doctor name *", "Clinic address *", "Specialty (e.g. dentist, pediatrician)"],
    agency: ["Agency name *", "Agency address *", "What do you offer? (e.g. flights, buses, ferries)"],
    taxi: ["Taxi / driver name *", "Area you serve *", "Your car and area (e.g. Dacia Logan, Alger centre)"],
    barber: ["Barbershop name *", "Shop address *", "Your services (e.g. haircut, beard, kids)"],
    hotel: ["Hotel / lodging name *", "Hotel address *", "What do you offer? (e.g. rooms, apartments, breakfast)"]
  };
  const applyKind = () => {
    const [business, address, description] = KIND_TEXT[kindSelect.value] || KIND_TEXT.shop;
    document.getElementById("m-business-label").textContent = business;
    document.getElementById("m-address-label").textContent = address;
    document.getElementById("m-description-label").textContent = description;
  };
  const HEAD = {
    shop: ["Become a seller", "Show your products in the store, accept orders and choose a delivery partner near you."],
    restaurant: ["Open a restaurant account", "Show your meals in the store, accept orders and choose a delivery partner near you."],
    pharmacy: ["Open a pharmacy account", "Show your products in the store, accept orders and choose a delivery partner near you."],
    doctor: ["Become a doctor on the site", "Receive appointment requests from patients, answer with the hour and send prescriptions."],
    agency: ["Open a travel agency account", "Receive ticket requests, answer with the price and send the tickets."],
    taxi: ["Open a taxi driver account", "Receive ride requests from customers and answer with your price and pick-up hour."],
    barber: ["Open a barbershop account", "Receive bookings with a schedule, add the customers who walk in, and choose how customers pay you."],
    hotel: ["Open a hotel or lodging account", "Add your room types and prices; customers book the nights with the check-in and check-out hours, and pay you at the hotel."]
  };
  const applyHead = () => {
    const [title, help] = HEAD[kindSelect.value] || HEAD.shop;
    const box = document.getElementById("merchant-box");
    box.querySelector("h2").textContent = title;
    box.querySelector(".panel-heading p").textContent = help;
  };
  /* the owner opens or closes each kind of account; closed kinds disappear from the list */
  [...kindSelect.options].forEach(o => { if (!joinOpen(o.value)) o.remove(); });
  if (!kindSelect.options.length) {
    document.getElementById("merchant-box").hidden = true;
    document.getElementById("partner-status").insertAdjacentHTML("beforeend", '<p class="muted">New applications are full for now.</p>');
  } else if (kindSelect.options.length < 6) {
    document.getElementById("partner-status").insertAdjacentHTML("beforeend", '<p class="muted">Some kinds of accounts are full for new applications for now.</p>');
  }
  const wanted = params.get("kind") || (draft ? (draft.role === "courier" ? "courier" : draft.kind) : "") || null;
  if (wanted && (wanted === "courier" || KIND_TEXT[wanted]) && !joinOpen(wanted)) {
    ["merchant-box", "courier-box", "direct-box"].forEach(id => { document.getElementById(id).hidden = true; });
    document.getElementById("partner-status").insertAdjacentHTML("beforeend", `<p class="muted"><strong>${joinFullKinds[wanted] === "closed" ? "Applications for this kind are closed for now." : "This kind is full for now."}</strong> Please come back later, or choose another kind.</p><p><a class="button button-secondary" href="partner.html">← All account types</a></p>`);
    return;
  }
  if (wanted && KIND_TEXT[wanted]) kindSelect.value = wanted;
  /* one window per kind: the picked card decides which single form is shown */
  if (!hasRole) {
    const mBox = document.getElementById("merchant-box"), cBox = document.getElementById("courier-box");
    if (wanted === "courier") mBox.hidden = true;
    else if (wanted && KIND_TEXT[wanted]) cBox.hidden = true;
    else { mBox.hidden = true; cBox.hidden = true; }
    if (wanted && KIND_TEXT[wanted]) { kindSelect.hidden = true; document.getElementById("m-kind-label").hidden = true; }
  }
  kindSelect.addEventListener("change", () => { applyKind(); applyHead(); });
  applyKind(); applyHead();


  /* ---- a new collaborator: his login (email, password) and, when the owner asks for it, his ID card are on this same page ---- */
  let dkState = { photo: "" };
  const roleOfChoice = wanted === "courier" ? "courier" : "merchant";
  if (guest && wanted && (wanted === "courier" || KIND_TEXT[wanted])) {
    document.getElementById("direct-box").hidden = false;
    if (features[roleOfChoice].requireId !== false) {
      document.getElementById("direct-kyc").innerHTML = kycFieldsHTML("dk", { phone: false, id: true });
      dkState = bindKycFields("dk", null);
    }
    if (features.customer.registrationOpen === false) {
      say(roleOfChoice === "courier" ? "c-message" : "m-message", "New registrations are closed for now. Please try again later.", true);
      document.querySelectorAll("#merchant-form button[type=submit], #courier-form button[type=submit]").forEach(b => { b.disabled = true; });
    }
  }
  /* creates the login, saves the application as a draft in his own profile; it is sent by itself once the email is confirmed */
  async function guestSubmit(prefix, draftData, button) {
    const email = val("d-email").toLowerCase(), password = document.getElementById("d-password").value, confirmPw = document.getElementById("d-confirm").value;
    const msg = `${prefix}-message`;
    if (!email) return say(msg, "Please enter your email.", true);
    if (password.length < 8) return say(msg, "Use at least 8 characters for your password.", true);
    if (password !== confirmPw) return say(msg, "The passwords do not match.", true);
    let kycData = { phone: draftData.phone, idNumber: "", idPhoto: "" };
    try { if (document.getElementById("dk-idnumber")) kycData = { ...readKycFields("dk", dkState), phone: draftData.phone }; } catch (error) { return say(msg, error.message, true); }
    if (kycData.phone.replace(/\D/g, "").length < 8) return say(msg, "Enter your phone number with the country code.", true);
    button.disabled = true; say(msg, "Creating your account…");
    try {
      const credential = await auth.createUserWithEmailAndPassword(email, password);
      try { await credential.user.sendEmailVerification(); } catch (error) { console.error("Verification email could not be sent:", error); }
      await saveProfile(credential.user.uid, { email, fullName: draftData.fullName, phone: draftData.phone, country: draftData.country, city: draftData.city, address: draftData.address || "", customerId: `MKC-${randomHex(3).toUpperCase()}`, createdAt: new Date().toISOString(), partnerDraft: draftData });
      try { await saveKyc(credential.user.uid, kycData); } catch (error) { console.error("Identity details not saved:", error); }
      showToast("Account created. Check your email.");
      window.location.reload();
    } catch (error) {
      console.error(error);
      say(msg, authErrorMessage(error), true);
      button.disabled = false;
    }
  }

  document.getElementById("merchant-form").addEventListener("submit", async event => {
    event.preventDefault();
    const required = ["m-name", "m-business", "m-phone", "m-country", "m-city", "m-address"];
    if (required.some(id => !val(id))) return say("m-message", "Please fill in every field marked *.", true);

    const button = event.target.querySelector("button[type=submit]");
    if (guest) {
      return guestSubmit("m", { role: "merchant", kind: kindSelect.value, fullName: val("m-name"), businessName: val("m-business"), phone: val("m-phone"), country: val("m-country"), city: val("m-city"), address: val("m-address"), description: val("m-description"), ...(positions.m.lat != null ? { lat: positions.m.lat, lng: positions.m.lng } : {}) }, button);
    }
    button.disabled = true;
    try {
      await db.collection("merchants").doc(user.uid).set({
        uid: user.uid,
        email: String(user.email || "").toLowerCase(),
        fullName: val("m-name"),
        businessName: val("m-business"),
        phone: val("m-phone"),
        country: val("m-country"),
        city: val("m-city"),
        address: val("m-address"),
        lat: positions.m.lat,
        lng: positions.m.lng,
        description: val("m-description"),
        status: "pending",
        createdAt: new Date().toISOString(),
        ...(kindSelect.value !== "shop" ? { kind: kindSelect.value } : {}),
        ...(invitedBy && invitedBy !== user.uid ? { invitedBy } : {})
      });
      if (draft) { try { await saveProfile(user.uid, { partnerDraft: null }); } catch { /* the draft is harmless */ } }
      showToast("Application sent");
      window.location.reload();
    } catch (error) {
      console.error(error);
      let more = "";
      if (error && error.code === "permission-denied") more = await whyDenied(user, kindSelect.value, "merchants");
      say("m-message", authErrorMessage(error) + more, true);
      button.disabled = false;
    }
  });

  document.getElementById("courier-form").addEventListener("submit", async event => {
    event.preventDefault();
    const required = ["c-name", "c-phone", "c-country", "c-city"];
    if (required.some(id => !val(id))) return say("c-message", "Please fill in every field marked *.", true);

    const button = event.target.querySelector("button[type=submit]");
    if (guest) {
      return guestSubmit("c", { role: "courier", fullName: val("c-name"), phone: val("c-phone"), country: val("c-country"), city: val("c-city"), address: val("c-address"), vehicle: val("c-vehicle"),
        ...(Number(val("c-maxweight")) > 0 ? { maxWeight: Math.min(1000, Number(val("c-maxweight"))) } : {}), ...(positions.c.lat != null ? { lat: positions.c.lat, lng: positions.c.lng } : {}) }, button);
    }
    button.disabled = true;
    try {
      await db.collection("couriers").doc(user.uid).set({
        uid: user.uid,
        email: String(user.email || "").toLowerCase(),
        fullName: val("c-name"),
        phone: val("c-phone"),
        country: val("c-country"),
        city: val("c-city"),
        address: val("c-address"),
        vehicle: val("c-vehicle"),
        ...(Number(val("c-maxweight")) > 0 ? { maxWeight: Math.min(1000, Number(val("c-maxweight"))) } : {}),
        lat: positions.c.lat,
        lng: positions.c.lng,
        available: false,
        status: "pending",
        createdAt: new Date().toISOString(),
        ...(invitedBy && invitedBy !== user.uid ? { invitedBy } : {})
      });
      if (draft) { try { await saveProfile(user.uid, { partnerDraft: null }); } catch { /* the draft is harmless */ } }
      showToast("Application sent");
      window.location.reload();
    } catch (error) {
      console.error(error);
      say("c-message", authErrorMessage(error) + (error && error.code === "permission-denied" ? await whyDenied(user, "courier", "couriers") : ""), true);
      button.disabled = false;
    }
  });

  /* The application he wrote when he created his account: sent by itself now that his email is confirmed. */
  if (draft && !hasRole) {
    const set = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined && v !== null) el.value = v; };
    if (draft.role === "courier") {
      set("c-name", draft.fullName); set("c-phone", draft.phone); set("c-country", draft.country); set("c-city", draft.city); set("c-address", draft.address); set("c-vehicle", draft.vehicle); set("c-maxweight", draft.maxWeight);
      if (draft.lat != null) positions.c = { lat: draft.lat, lng: draft.lng };
      document.getElementById("courier-form").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    } else {
      if (draft.kind && KIND_TEXT[draft.kind]) kindSelect.value = draft.kind;
      applyKind(); applyHead();
      set("m-name", draft.fullName); set("m-business", draft.businessName); set("m-phone", draft.phone); set("m-country", draft.country); set("m-city", draft.city); set("m-address", draft.address); set("m-description", draft.description);
      if (draft.lat != null) positions.m = { lat: draft.lat, lng: draft.lng };
      document.getElementById("merchant-form").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    }
  }
})();
