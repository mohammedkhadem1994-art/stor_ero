"use strict";

/* Barber: haircut styles with a photo and a price (inside merchant.html), and the subscription plans of every partner.
   The number of photos follows the plan the owner switched on for this account (or the number of the barber kind). */

const DEFAULT_PLANS = [
  { id: "base", name: "Base", price: 250, images: 0, videos: 0, perks: "The account only, no photos" },
  { id: "starter", name: "Starter", price: 400, images: 10, videos: 0, perks: "" },
  { id: "standard", name: "Standard", price: 650, images: 30, videos: 1, perks: "" },
  { id: "plus", name: "Plus", price: 1000, images: 60, videos: 3, perks: "" },
  { id: "pro", name: "Pro", price: 1500, images: 100, videos: 5, perks: "" },
  { id: "max", name: "Max", price: 2500, images: 200, videos: 10, perks: "" }
];


const DEFAULT_BREAKDOWN = [
  { label: "Data storage (photos, videos, records)", percent: 30 },
  { label: "Site engineering and updates", percent: 25 },
  { label: "Servers and hosting", percent: 20 },
  { label: "Security and backups", percent: 15 },
  { label: "Support and other costs", percent: 10 }
];
let PLANS_BREAKDOWN = DEFAULT_BREAKDOWN;
async function loadPlans() {
  try {
    const snap = await db.collection("settings").doc("plans").get();
    if (snap.exists && Array.isArray(snap.data().breakdown)) PLANS_BREAKDOWN = snap.data().breakdown;
    if (snap.exists && Array.isArray(snap.data().list)) return snap.data().list;
  } catch { /* default */ }
  return DEFAULT_PLANS;
}

/* "Subscription fees" box: the free start, the monthly fee that follows, the price table by number of photos / videos, and the request for more photos. Customers never pay. */
window.renderPlansBox = async function (shop, usedNow, limitNow) {
  const box = document.getElementById("plans-box");
  if (!box) return;
  if (box.contains(document.activeElement) && box.querySelector("form")) return;   /* he is typing his request: do not redraw under his fingers */
  const wasOpen = Boolean(box.querySelector("details[open]"));
  const plans = await loadPlans();
  const active = shop.planId && shop.planUntil && Date.parse(shop.planUntil) > Date.now();
  const showsPhotos = ["shop", "restaurant", "pharmacy", "barber"].includes(shop.kind || "shop");
  const base = plans.slice().sort((a, b) => a.price - b.price)[0];
  let free = "";
  try {
    const f = typeof STORE_FEE_INFO !== "undefined" ? STORE_FEE_INFO : null;
    if (f && f.source === "free" && f.until) { const left = Math.max(0, Math.ceil((f.until - Date.now()) / 86400000)); free = `<strong>Free start</strong> <span>until ${escapeHTML(formatDate(new Date(f.until).toISOString()))} · ${left} days left.</span> `; }
  } catch { /* none */ }
  const rows = showsPhotos ? plans : plans.filter(p => Number(p.images) === 0 || p === base);
  box.innerHTML = `<details class="balance-more plans-details"${wasOpen ? " open" : ""}><summary>Subscription fees</summary>
    <p class="muted">${free}${base ? `<span>After the free start the subscription starts at</span> <strong>${escapeHTML(formatPrice(base.price))}</strong> <span>${showsPhotos ? "a month for the account alone; it rises with the number of photos and videos you upload." : "a month for the account alone; it rises with the number of services."}</span> ` : ""}${active ? `<span>Your plan:</span> <strong>${escapeHTML(shop.planName || shop.planId)}</strong> <span>until ${escapeHTML(String(shop.planUntil).slice(0, 10))}.</span>` : "<span>You have no paid plan now.</span>"}
      ${showsPhotos && limitNow !== null ? ` Photos: ${usedNow} of ${limitNow}.` : ""}</p>
    ${rows.length ? `<div class="table-wrap"><table class="orders-table plans-table"><thead><tr><th>Plan</th><th class="num">Price / month</th>${showsPhotos ? '<th class="num">Photos</th><th class="num">Videos</th>' : ""}<th>Rights</th></tr></thead><tbody>${rows.map(p =>
      `<tr${active && p.id === shop.planId ? ' class="board-free"' : ""}><td data-label="Plan"><strong>${escapeHTML(p.name)}</strong></td><td class="num" data-label="Price / month">${p.price > 0 ? escapeHTML(formatPrice(p.price)) : "Free"}</td>${showsPhotos ? `<td class="num" data-label="Photos">${Number(p.images)}</td><td class="num" data-label="Videos">${Number(p.videos || 0)}</td>` : ""}<td data-label="Rights">${escapeHTML(p.perks || "")}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">The owner has not published the plans yet.</p>'}
    ${(() => { const ref = active ? (plans.find(p => p.id === shop.planId) || base) : base; const list = PLANS_BREAKDOWN || []; return ref && list.length ? `<h4 class="subhead">What your fee pays for</h4><p class="muted">Example with the <strong>${escapeHTML(ref.name)}</strong> plan (${escapeHTML(formatPrice(ref.price))} a month).</p><div class="table-wrap"><table class="orders-table fee-breakdown"><thead><tr><th>Cost</th><th class="num">Share</th><th class="num">Amount / month</th></tr></thead><tbody>${list.map(b => `<tr><td data-label="Cost">${escapeHTML(b.label)}</td><td class="num" data-label="Share">${Number(b.percent)} %</td><td class="num" data-label="Amount / month">${escapeHTML(formatPrice(Math.round(ref.price * b.percent) / 100))}</td></tr>`).join("")}</tbody></table></div>` : ""; })()}
    <p class="field-help">Customers always use the site for free. To subscribe, pay the owner and ask him to switch the plan on for your account.</p>
    <p><button type="button" class="small-button" id="plan-ask">Ask the owner to activate a plan</button></p>
    ${showsPhotos ? `<div class="more-photos"><h4 class="subhead">Need more photos?</h4>
      <form id="more-form" class="inline-form"><label class="limit-field">How many more photos<input id="more-count" type="number" min="1" max="5000" step="1" required></label>
        <label class="limit-field">Why (optional)<input id="more-note" maxlength="200"></label>
        <button type="submit" class="button button-teal">Send my request to the owner</button></form>
      <p id="more-status" class="form-message" role="status"></p></div>` : ""}</details>`;
  const ask = document.getElementById("plan-ask");
  if (ask) ask.addEventListener("click", () => { if (typeof openSupportChat === "function") openSupportChat(); });
  const form = document.getElementById("more-form");
  if (form) {
    const status = document.getElementById("more-status");
    const showRequest = async () => {
      try {
        const snap = await db.collection("photoRequests").doc(shop.uid || shop.id || (auth.currentUser && auth.currentUser.uid)).get();
        if (!snap.exists) return;
        const r = snap.data();
        status.textContent = r.status === "pending" ? `Your request for ${r.wanted} more photos is waiting for the owner.` : r.status === "approved" ? `The owner added ${r.granted} photos to your account.` : "The owner did not add more photos this time.";
        form.querySelector("button").disabled = r.status === "pending";
      } catch { /* optional */ }
    };
    showRequest();
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const btn = form.querySelector("button"); btn.disabled = true; status.classList.remove("error"); status.textContent = "Sending…";
      try { await callFn("requestMorePhotos", { wanted: document.getElementById("more-count").value, note: document.getElementById("more-note").value }); form.reset(); await showRequest(); }
      catch (error) { status.textContent = authErrorMessage(error); status.classList.add("error"); btn.disabled = false; }
    });
  }
};

window.setupStylesPanel = function (me, getShop) {
  const $ = id => document.getElementById(id);
  if (!$("styles-panel")) return;
  $("styles-panel").hidden = false;
  let photo = "", list = [];

  const limitOf = async () => {
    const shop = getShop();
    if (typeof shop.productLimit === "number" && shop.productLimit >= 0) return shop.productLimit;
    if (typeof shop.planLimit === "number" && shop.planLimit >= 0) return shop.planLimit;
    try { const s = await db.collection("settings").doc("productLimits").get(); const v = s.exists ? s.data().barber : undefined; if (typeof v === "number" && v >= 0) return v; } catch { /* none */ }
    return null;
  };
  const say = (text, bad) => { const m = $("st-message"); m.textContent = text; m.classList.toggle("error", Boolean(bad)); };
  async function render() {
    const limit = await limitOf();
    $("st-quota").textContent = limit === null ? "" : `Styles: ${list.length} of ${limit}. ${list.length >= limit ? "You reached the number set for your account." : ""}`.trim();
    window.renderPlansBox(getShop(), list.length, limit);
    $("st-list").innerHTML = list.length ? list.map(s => `
      <article class="style-card" data-id="${escapeHTML(s.id)}">
        <div class="admin-product-thumb">${imageSrc(s.image) ? `<img src="${escapeHTML(imageSrc(s.image))}" alt="" loading="lazy">` : "<span>✂</span>"}</div>
        <div><strong>${escapeHTML(s.name)}</strong><small class="muted">${escapeHTML(formatPrice(s.price))}${s.visible === false ? " · hidden" : ""}${s.overLimit ? " · above your number" : ""}</small></div>
        <button type="button" class="small-button delete-button st-del">Delete</button>
      </article>`).join("") : '<p class="empty-state">No style yet. Add the haircuts you do, with a photo and a price.</p>';
  }
  async function refresh() {
    const snap = await db.collection("styles").where("merchantId", "==", me.uid).get();
    list = snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    await render();
  }
  $("st-photo").addEventListener("change", async event => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try { photo = await fileToDataUrl(file); $("st-preview").src = photo; $("st-preview").hidden = false; say("Photo ready. Press Add style."); }
    catch (error) { say(error.message, true); }
  });
  $("st-form").addEventListener("submit", async event => {
    event.preventDefault();
    const name = $("st-name").value.trim(), price = Number($("st-price").value);
    if (!name) return say("Write the name of the style (e.g. Fade, Beard trim).", true);
    if (!(price >= 0) || $("st-price").value === "") return say("Write the price of this style.", true);
    const limit = await limitOf();
    if (limit !== null && list.length >= limit) return say("You reached the number of photos of your account. Ask the owner for a bigger plan.", true);
    try {
      await db.collection("styles").doc("st" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).set({ merchantId: me.uid, name, price, image: photo, visible: true, createdAt: new Date().toISOString() });
      callFn("refreshMyProductCount", {}).catch(() => {});
      $("st-name").value = ""; $("st-price").value = ""; photo = ""; $("st-preview").hidden = true;
      say("Style added.");
      await refresh();
    } catch (error) { say(authErrorMessage(error), true); }
  });
  $("st-list").addEventListener("click", async event => {
    const b = event.target.closest(".st-del"); if (!b) return;
    const id = b.closest(".style-card").dataset.id;
    if (!window.confirm("Delete this style?")) return;
    try { await db.collection("styles").doc(id).delete(); callFn("refreshMyProductCount", {}).catch(() => {}); await refresh(); }
    catch (error) { say(authErrorMessage(error), true); }
  });
  refresh().catch(error => console.error(error));
};
