"use strict";

/* Delivery-partner dashboard. Requires store.js.
   Delivery steps go through the server (updateOrderStatus), which checks that the order is assigned to you. */

let me = null;
let profile = null;   /* couriers/{uid} */
let jobs = [];

const $ = id => document.getElementById(id);

function say(id, text, isError = false) {
  $(id).textContent = text;
  $(id).classList.toggle("error", isError);
}

function renderBanner() {
  const texts = {
    pending: ["Your delivery-partner account is waiting for approval.", "You will receive requests after an administrator approves you."],
    rejected: ["Your application was not approved.", "Please contact the store owner."],
    suspended: ["Your account is suspended.", "Please contact the store owner."]
  };
  const info = texts[profile.status];
  $("account-banner").innerHTML = info
    ? `<aside class="admin-notice"><strong>${escapeHTML(info[0])}</strong> ${escapeHTML(info[1])}</aside>` : "";
}

document.addEventListener("click", event => {
  const tab = event.target.closest(".role-tab");
  if (!tab) return;
  document.querySelectorAll(".role-tab").forEach(item => item.classList.toggle("active", item === tab));
  document.querySelectorAll(".role-pane").forEach(pane => { pane.hidden = pane.id !== `pane-${tab.dataset.tab}`; });
});

/* ---------- deliveries ---------- */

function place(title, where, extra = "") {
  const map = mapsLink(where);
  return `<div><small class="muted">${escapeHTML(title)}</small>
    <div>${escapeHTML(where.name || "")}${where.name ? "<br>" : ""}${escapeHTML(where.phone || "")}${where.phone ? "<br>" : ""}
      ${escapeHTML(where.address || "")}${where.address && where.city ? ", " : ""}${escapeHTML(where.city || "")}
      ${map ? `<br><a href="${escapeHTML(map)}" target="_blank" rel="noopener">Open in maps</a>` : ""}${extra}</div></div>`;
}

function jobCard(order) {
  const customer = order.customer || {};
  const pickup = order.pickup || {};
  const km = distanceKm(pickup, profile);
  const kmCustomer = hasPos(customer) ? distanceKm(customer, profile) : null;
  const wa = waButton(pickup.phone, pickup.country, "Seller", `Hello, delivery for order ${order.number}`)
    + waButton(customer.phone, customer.country, "Customer", `Hello ${customer.name || ""}, I am your delivery partner for order ${order.number}`);
  const chat = `<button type="button" class="small-button" data-chat-order="${escapeHTML(order.id)}" data-chat-number="${escapeHTML(order.number)}">Chat</button>`;

  const buttons = {
    CourierRequested: `<button type="button" class="small-button job-action" data-action="courierAccept" data-order="${escapeHTML(order.id)}">Accept delivery</button>
                       <button type="button" class="small-button delete-button job-action" data-action="courierDecline" data-order="${escapeHTML(order.id)}">Decline</button>`,
    CourierAccepted: `<button type="button" class="small-button job-action" data-action="pickedUp" data-order="${escapeHTML(order.id)}">I picked up the parcel</button>`,
    OnTheWay: `<button type="button" class="small-button job-action" data-action="delivered" data-order="${escapeHTML(order.id)}">Delivered to the customer</button>`
  }[order.fulfillment] || "";

  return `
    <article class="order-card">
      <header>
        <strong>${escapeHTML(order.number)}</strong>
        <span class="status-pill">${escapeHTML(FULFILLMENT_LABELS[order.fulfillment] || order.fulfillment)}</span>
        ${km !== null ? `<span class="distance distance-${km <= 2 ? "near" : km <= 10 ? "mid" : "far"}">Shop: ${km.toFixed(1)} km · ${proximity(km)}</span>` : ""}
        ${kmCustomer !== null ? `<span class="muted">Customer: ${kmCustomer.toFixed(1)} km</span>` : ""}
      </header>
      <div class="order-grid">
        ${place("Pick up at", { ...pickup, name: pickup.name }, hasPos(pickup) ? `<br><small>${Number(pickup.lat).toFixed(5)}, ${Number(pickup.lng).toFixed(5)}</small>` : "")}
        ${place("Deliver to", { name: customer.name, phone: customer.phone, address: customer.address, city: customer.city, country: customer.country, lat: customer.lat, lng: customer.lng }, hasPos(customer) ? `<br><small>${Number(customer.lat).toFixed(5)}, ${Number(customer.lng).toFixed(5)}</small>` : "")}
        <div><small class="muted">Parcel</small><div>${order.items.map(item => `${escapeHTML(item.name)} × ${Number(item.quantity)}`).join("<br>")}${order.totalWeight > 0 ? `<br><small class="muted">⚖ ${Number(order.totalWeight)} kg</small>` : ""}</div></div>
      </div>
      ${order.readyAt && ["CourierRequested", "CourierAccepted"].includes(order.fulfillment) ? (() => { const left = Math.round((Date.parse(order.readyAt) - Date.now()) / 60000); return `<p class="ready-line ${left <= 5 ? "ready-soon" : ""}">🍳 ${left > 0 ? `The kitchen needs about ${left} more min (ready around ${escapeHTML(new Date(order.readyAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}). ${left <= 10 ? "Head there now." : "Do not leave too early."}` : "The order is ready. Come and pick it up."}</p>`; })() : ""}
      ${order.delivery ? `<p class="delivery-line"><span class="status-pill">${escapeHTML(speedText(order))}</span> <span>${order.paymentMethod === "cod" ? `Your fee: ${formatPrice(order.deliveryFee)} · Cash to collect: ${formatPrice(order.total)} (give the seller ${formatPrice(order.itemsTotal)})` : `Your fee: ${formatPrice(order.deliveryFee)} · The customer pays you ${formatPrice(order.deliveryFee)} in cash`}</span></p>` : ""}
      <div class="order-actions">${buttons} ${chat} ${wa}</div>
    </article>`;
}

function renderHistory(done) {
  const list = [...done].sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  const cash = order => (order.paymentMethod === "cod" ? Number(order.total) || 0 : 0);
  const totalCash = list.reduce((sum, order) => sum + cash(order), 0);
  if (!list.length) { $("history").innerHTML = '<p class="empty-state">No completed deliveries yet.</p>'; return; }
  $("history").innerHTML = `<p><strong>${list.length}</strong> deliveries · cash collected <strong>${formatPrice(totalCash)}</strong></p>
    <div class="table-wrap"><table class="admin-table"><thead><tr><th>Date</th><th>Order</th><th>From</th><th>To</th><th>Total</th><th>My fee</th><th>Cash collected</th><th>Site fee I owe</th></tr></thead><tbody>
    ${list.map(order => `<tr><td>${escapeHTML(formatDate(order.updatedAt || order.createdAt, true))}</td><td>${escapeHTML(order.number)}</td>
      <td>${escapeHTML(order.merchantName || "")}</td><td>${escapeHTML((order.customer || {}).city || "")}</td>
      <td>${formatPrice(order.total)}</td><td>${order.deliveryFee ? formatPrice(order.deliveryFee) : "—"}</td><td>${cash(order) ? formatPrice(cash(order)) : "—"}</td><td>${order.feeVia === "courier" ? formatPrice(order.commission) : "—"}</td></tr>`).join("")}
    </tbody></table></div>`;
}

/* What I owe the site's chain (my supervisor, then the site) for the cash orders I delivered. */
let feeEntries = [];
let moneyHidden = false;
getFeatures().then(f => { moneyHidden = f.global.showCollabMoney === false; renderFee(); }).catch(() => {});
function renderFee() {
  const box = $("fee-card"); if (!box) return;
  if (moneyHidden) { box.hidden = true; box.innerHTML = ""; return; }   /* the owner hides it during the trial */
  const owed = Number(profile.feeDebt || 0), total = Number(profile.feeTotal || 0);
  if (MK_EDITION.dz) {   /* shown in the credit window when that module is on */
    box.hidden = !(owed > 0);
    box.innerHTML = owed > 0 ? `<p class="muted balance-link">You owe the site ${formatPrice(owed)}. <a href="wallet.html">See it in My credit</a></p>` : "";
    return;
  }
  if (!owed && !total && !feeEntries.length) { box.hidden = true; return; }
  box.hidden = false;
  const who = profile.invitedBy ? "your supervisor" : "the site (the owner)";
  const label = { fee: "Fee added", collect: "Payment received" };
  box.innerHTML = `<div class="fee-card-top"><span class="fee-icon" aria-hidden="true">🧾</span><div><strong>What I owe the site</strong><small class="muted">Fees from before the new rule: hand them to ${who}; he records it here. From now on the sellers keep the site's fee themselves, not you.</small></div><b class="fee-amount ${owed > 0 ? "owing" : "clear"}">${formatPrice(owed)}</b></div>
    <p class="muted">Fees recorded so far: ${formatPrice(total)} · Paid: ${formatPrice(Number(profile.feePaid || 0))}</p>
    ${feeEntries.length ? `<details><summary>Statement (${feeEntries.length})</summary><div class="table-wrap"><table class="orders-table"><thead><tr><th>Date</th><th>What</th><th>Order</th><th class="num">Amount</th><th class="num">I owe</th></tr></thead><tbody>${feeEntries.map(e => `<tr><td>${escapeHTML(formatDate(e.at, true))}</td><td>${escapeHTML(label[e.type] || e.type)}</td><td>${escapeHTML(e.orderNumber || "")}</td><td class="num">${e.type === "collect" ? "−" : "+"}${formatPrice(e.amount)}</td><td class="num">${formatPrice(e.courierBalance)}</td></tr>`).join("")}</tbody></table></div></details>` : ""}`;
}

function renderJobs() {
  const fresh = jobs.filter(job => job.fulfillment === "CourierRequested");
  const active = jobs.filter(job => ["CourierAccepted", "OnTheWay"].includes(job.fulfillment));
  const done = jobs.filter(job => job.fulfillment === "Delivered");

  $("d-new").textContent = fresh.length;
  $("d-active").textContent = active.length;
  $("d-done").textContent = done.length;
  $("d-avail").textContent = profile.available ? "Available" : "Off";

  const section = (title, list) => list.length ? `<h3 class="job-heading">${title}</h3>${list.map(jobCard).join("")}` : "";
  const html = section("New requests", fresh) + section("In progress", active) + section("Completed", done.slice(0, 20));
  renderHistory(done);
  renderFee();
  $("jobs").innerHTML = html || '<p class="empty-state">No deliveries yet. Make sure you are marked available and your location is set.</p>';
}

async function refreshJobs() {
  jobs = await getOrdersWhere("courierId", me.uid);
  renderJobs();
}

/* Delivery confirmation: scan the customer's QR code with the camera (or type the code under it). */
function scanForCode(order) {
  return new Promise(resolve => {
    const modal = document.createElement("div");
    modal.className = "qr-modal";
    modal.innerHTML = `<div class="qr-card" role="dialog" aria-label="Scan the delivery code">
      <h3>Confirm the delivery · ${escapeHTML(order.number)}</h3>
      <p class="muted">Ask the customer to open <strong>Delivery code (QR)</strong> on his phone, then scan it.</p>
      <video class="qr-video" playsinline muted hidden></video>
      <p class="muted qr-status" role="status"></p>
      <button type="button" class="small-button qr-camera">📷 Scan with the camera</button>
      <label for="qr-manual">Or type the code</label>
      <input id="qr-manual" class="qr-manual" maxlength="12" autocomplete="off" autocapitalize="characters" placeholder="ABCD EFGH">
      <p><button type="button" class="button button-teal qr-send">Confirm delivery</button> <button type="button" class="small-button qr-cancel">Cancel</button></p></div>`;
    document.body.appendChild(modal);
    let stream = null, timer = null, done = false;
    const finish = value => { if (done) return; done = true; clearInterval(timer); if (stream) stream.getTracks().forEach(t => t.stop()); modal.remove(); resolve(value); };
    const status = text => { modal.querySelector(".qr-status").textContent = text; };
    modal.querySelector(".qr-cancel").addEventListener("click", () => finish(null));
    modal.querySelector(".qr-send").addEventListener("click", () => {
      const typed = modal.querySelector(".qr-manual").value.trim();
      if (!typed) return status("Type the code or scan the QR code.");
      finish(typed);
    });
    modal.querySelector(".qr-camera").addEventListener("click", async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("no camera");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const video = modal.querySelector(".qr-video");
        video.srcObject = stream; video.hidden = false; await video.play();
        status("Point the camera at the customer's QR code…");
        const canvas = document.createElement("canvas"), g = canvas.getContext("2d");
        const detector = "BarcodeDetector" in window ? new BarcodeDetector({ formats: ["qr_code"] }) : null;
        timer = setInterval(async () => {
          if (!video.videoWidth) return;
          let text = "";
          try {
            if (detector) { const found = await detector.detect(video); text = found.length ? found[0].rawValue : ""; }
            else if (typeof jsQR === "function") { canvas.width = video.videoWidth; canvas.height = video.videoHeight; g.drawImage(video, 0, 0); const img = g.getImageData(0, 0, canvas.width, canvas.height); const r = jsQR(img.data, img.width, img.height); text = r ? r.data : ""; }
          } catch { /* keep trying */ }
          if (text) finish(text);
        }, 300);
      } catch { status("The camera is not available. Type the code instead."); }
    });
  });
}

$("jobs").addEventListener("click", async event => {
  const button = event.target.closest(".job-action");
  if (!button) return;
  button.disabled = true;
  try {
    const order = jobs.find(job => job.id === button.dataset.order);
    let extra = {};
    if (button.dataset.action === "delivered" && order && order.hasCode) {
      const code = await scanForCode(order);
      if (code === null) { button.disabled = false; return; }
      extra = { code };
    }
    await orderAction(button.dataset.order, button.dataset.action, extra);
    await refreshJobs();
  } catch (error) {
    console.error(error);
    showToast(authErrorMessage(error), "error");
    await refreshJobs().catch(() => {});
  }
});

$("available").addEventListener("change", async event => {
  const box = event.target;
  try {
    if (box.checked && (await getFeatures()).courier.requireLocation && !(profile.lat != null && profile.lng != null)) {
      box.checked = false;
      return showToast("Set your location first (My details & location tab).", "error");
    }
    await db.collection("couriers").doc(me.uid).update({ available: box.checked });
    profile.available = box.checked;
    renderJobs();
  } catch (error) {
    console.error(error);
    box.checked = !box.checked;
    showToast(authErrorMessage(error), "error");
  }
});

let position = { lat: null, lng: null };

/* ---------- live location ---------- */

let watchId = null;
let lastSaved = { at: 0, lat: null, lng: null };
let lastMap = { lat: null, lng: null };

function renderLive(accuracy) {
  const info = $("live-info");
  if (!hasPos(profile)) { info.textContent = "Waiting for your position…"; return; }
  const moved = lastMap.lat === null || distanceKm(lastMap, profile) > 0.05;
  if (moved || !info.querySelector("iframe")) {
    info.innerHTML = locationCardHTML(profile, accuracy);
    lastMap = { lat: profile.lat, lng: profile.lng };
  } else {
    info.querySelector(".loc-coords strong").textContent = `${Number(profile.lat).toFixed(5)}, ${Number(profile.lng).toFixed(5)}`;
  }
}

async function saveLivePosition(lat, lng) {
  const now = Date.now();
  const far = lastSaved.lat === null || distanceKm(lastSaved, { lat, lng }) > 0.03;
  if (now - lastSaved.at < 30000 || !far) return;
  lastSaved = { at: now, lat, lng };
  try {
    await db.collection("couriers").doc(me.uid).update({ lat, lng, locAt: new Date(now).toISOString() });
  } catch (error) {
    console.error(error);
  }
}

function stopLive() {
  if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  $("live-toggle").textContent = "Start live location";
  $("live-info").textContent = "Live location is off. Start it to see how far you are from each shop.";
}

function startLive() {
  if (!navigator.geolocation) return say("f-message", "Your device cannot share its location.", true);
  $("live-toggle").textContent = "Stop live location";
  $("live-info").textContent = "Waiting for your position…";
  watchId = navigator.geolocation.watchPosition(result => {
    const lat = Math.round(result.coords.latitude * 1e5) / 1e5;
    const lng = Math.round(result.coords.longitude * 1e5) / 1e5;
    profile = { ...profile, lat, lng };
    position = { lat, lng };
    renderLive(result.coords.accuracy);
    renderJobs();
    saveLivePosition(lat, lng);
  }, () => {
    stopLive();
    $("live-info").textContent = "Location was not shared. Allow location access in your browser, then try again.";
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
}

$("live-toggle").addEventListener("click", () => (watchId === null ? startLive() : stopLive()));

/* ---------- details ---------- */

function describeLocation() {
  $("f-location").textContent = position.lat !== null ? `Location saved (${position.lat}, ${position.lng}).` : "Location not set.";
}

function fillForm() {
  $("f-name").value = profile.fullName || "";
  $("f-phone").value = profile.phone || "";
  $("f-country").value = profile.country || "";
  $("f-city").value = profile.city || "";
  $("f-address").value = profile.address || "";
  $("f-vehicle").value = profile.vehicle || "Motorbike";
  $("f-maxweight").value = profile.maxWeight > 0 ? profile.maxWeight : "";
  $("f-included").value = profile.includedKg >= 0 && profile.includedKg !== undefined && profile.includedKg !== null ? profile.includedKg : "";
  $("f-perkg").value = profile.perKg > 0 ? profile.perKg : "";
  position = { lat: numOrNull(profile.lat), lng: numOrNull(profile.lng) };
  describeLocation();
  $("available").checked = Boolean(profile.available);
  for (const key of Object.keys(SPEEDS)) {
    const value = profile.rates ? profile.rates[key] : null;
    $(`f-rate-${key}`).value = value === null || value === undefined ? "" : value;
    $(`f-rate-${key}`).placeholder = `site price ${DEFAULT_RATES[key]}`;
  }
  updateCalculator();
}

/* Price calculator: the same rule the server uses (real weight or size, whichever is larger, then the partner's own prices). */
function updateCalculator() {
  const out = $("calc-result"); if (!out) return;
  const speed = $("c-speed").value;
  const me2 = { rates: {}, perKg: Number($("f-perkg").value) || 0, includedKg: $("f-included").value.trim() === "" ? 5 : Number($("f-included").value) };
  for (const key of Object.keys(SPEEDS)) { const raw = $(`f-rate-${key}`).value.trim(); me2.rates[key] = raw === "" ? null : Number(raw); }
  const item = { weightKg: Number($("c-weight").value) || 0, lengthCm: Number($("c-length").value) || 0, widthCm: Number($("c-width").value) || 0, heightCm: Number($("c-height").value) || 0, quantity: 1 };
  const charge = mkChargeable([item]);
  const max = Number($("f-maxweight").value);
  if (max > 0 && item.weightKg > max) { out.textContent = `Too heavy: you carry at most ${max} kg.`; return; }
  const price = courierFee(me2, speed, charge);
  out.textContent = price > 0 ? `Chargeable weight ${charge} kg → the customer pays you ${formatPrice(price)}.` : "You do not offer this speed.";
}
document.addEventListener("input", event => { if (event.target.closest && event.target.closest("#courier-profile")) updateCalculator(); });
document.addEventListener("change", event => { if (event.target.id === "c-speed") updateCalculator(); });

$("f-locate").addEventListener("click", async () => {
  try {
    position = await getPosition();
    describeLocation();
    say("f-message", "Press Save to keep the new location.");
  } catch (error) {
    say("f-message", error.message, true);
  }
});

$("courier-profile").addEventListener("submit", async event => {
  event.preventDefault();
  const data = {
    fullName: $("f-name").value.trim(),
    phone: $("f-phone").value.trim(),
    country: $("f-country").value.trim(),
    city: $("f-city").value.trim(),
    address: $("f-address").value.trim(),
    vehicle: $("f-vehicle").value,
    lat: position.lat,
    lng: position.lng,
    rates: {}
  };
  const maxRaw = $("f-maxweight").value.trim();
  if (maxRaw !== "" && (!(Number(maxRaw) > 0) || Number(maxRaw) > 1000)) return say("f-message", "The heaviest load must be between 0 and 1000 kg (or leave it empty).", true);
  data.maxWeight = maxRaw === "" ? null : Math.round(Number(maxRaw) * 1000) / 1000;
  const perRaw = $("f-perkg").value.trim(), incRaw = $("f-included").value.trim();
  if (perRaw !== "" && (!(Number(perRaw) >= 0) || Number(perRaw) > 100000)) return say("f-message", "The extra price per kg must be 0 or more.", true);
  if (incRaw !== "" && (!(Number(incRaw) >= 0) || Number(incRaw) > 1000)) return say("f-message", "The included weight must be between 0 and 1000 kg.", true);
  data.perKg = perRaw === "" ? 0 : Math.round(Number(perRaw) * 100) / 100;
  data.includedKg = incRaw === "" ? 5 : Math.round(Number(incRaw) * 10) / 10;
  for (const key of Object.keys(SPEEDS)) {
    const raw = $(`f-rate-${key}`).value.trim();
    const number = Number(raw);
    if (raw !== "" && (!Number.isFinite(number) || number < 0 || number > 500)) return say("f-message", "A delivery price must be between 0 and 500.", true);
    data.rates[key] = raw === "" ? null : Math.round(number * 100) / 100;
  }
  if (!data.fullName || !data.phone || !data.country || !data.city) return say("f-message", "Please fill in every field marked *.", true);
  try {
    await db.collection("couriers").doc(me.uid).update(data);
    profile = { ...profile, ...data };
    say("f-message", "Saved.");
  } catch (error) {
    console.error(error);
    say("f-message", authErrorMessage(error), true);
  }
});

/* ---------- start ---------- */

(async () => {
  if (!initBackend()) return;
  const state = await getAuthState();
  if (!state.user || !state.courier) return; /* store.js redirects */

  me = state.user;
  profile = state.courier;
  renderBanner();
  fillForm();
  if (window.setupLookPanel) window.setupLookPanel(me, () => ({ businessName: profile.fullName || profile.name || me.email, kindLabel: "Delivery partner", city: profile.city }), { own: true });
  $("courier-tools").hidden = false;
  /* my own balance (kept up to date) and its statement */
  try {
    db.collection("couriers").doc(me.uid).onSnapshot(snap => { if (snap.exists) { profile = { ...profile, ...snap.data() }; renderFee(); } }, () => {});
    db.collection("feeLedger").where("courierId", "==", me.uid).onSnapshot(snap => {
      feeEntries = snap.docs.map(d => d.data()).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 60); renderFee();
    }, () => {});
  } catch (error) { console.error(error); }

  /* Requests update live, with a sound and a notice. */
  try {
    watchOrders("courierId", me.uid, list => {
      jobs = list;
      renderJobs();
    }, (order, previous) => (previous === undefined && order.fulfillment === "CourierRequested"
      ? `New delivery request ${order.number} — open it to accept` : ""),
    error => {
      console.error(error);
      $("jobs").innerHTML = '<p class="empty-state">Could not load your deliveries.</p>';
    });
  } catch (error) {
    console.error(error);
    $("jobs").innerHTML = '<p class="empty-state">Could not load your deliveries.</p>';
  }
})();
