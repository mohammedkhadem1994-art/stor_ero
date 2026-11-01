"use strict";

/* Reviews: the home-page "What customers say" section (the site and the trust in it) and the product reviews. Requires store.js. */

window.MK_RATINGS = window.MK_RATINGS || {};

const starsText = n => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));
const avgOf = (sum, n) => (n > 0 ? Math.round(sum / n * 10) / 10 : 0);

/* a row of five stars the person can click */
function starPicker(name, value = 0) {
  return `<div class="star-picker" data-name="${name}" role="radiogroup" aria-label="${name}">${[1, 2, 3, 4, 5].map(i =>
    `<button type="button" class="star-btn ${i <= value ? "on" : ""}" data-value="${i}" role="radio" aria-checked="${i === value}" aria-label="${i}">★</button>`).join("")}</div>`;
}
document.addEventListener("click", event => {
  const btn = event.target.closest(".star-btn");
  if (!btn) return;
  const picker = btn.closest(".star-picker");
  picker.dataset.value = btn.dataset.value;
  picker.querySelectorAll(".star-btn").forEach(b => { const on = Number(b.dataset.value) <= Number(btn.dataset.value); b.classList.toggle("on", on); b.setAttribute("aria-checked", String(Number(b.dataset.value) === Number(btn.dataset.value))); });
});
const pickerValue = (root, name) => Number((root.querySelector(`.star-picker[data-name="${name}"]`) || { dataset: {} }).dataset.value || 0);

async function loadRatings() {
  try {
    initBackend();
    const snap = await db.collection("ratings").get();
    window.MK_RATINGS = Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
  } catch { window.MK_RATINGS = {}; }
  return window.MK_RATINGS;
}

/* ---------- the home page section ---------- */

async function renderSiteReviews() {
  const box = document.getElementById("site-reviews");
  if (!box) return;
  const ratings = await loadRatings();
  if (typeof renderStore === "function" && document.getElementById("product-grid")) renderStore();
  const a = ratings.site || { n: 0, siteSum: 0, trustSum: 0 };
  const site = avgOf(a.siteSum, a.n), trust = avgOf(a.trustSum, a.n);
  let list = [];
  try { const snap = await db.collection("siteReviews").orderBy("at", "desc").limit(12).get(); list = snap.docs.map(d => ({ ...d.data(), id: d.id })); } catch { /* none */ }
  try { initBackend(); } catch { /* offline */ }
  const { user } = await getAuthState();
  const mine = user ? list.find(r => r.uid === user.uid) : null;
  box.innerHTML = `<div class="reviews-summary">
      <div class="rating-block"><span class="rating-label">The site</span><strong class="rating-big">${a.n ? site.toFixed(1) : "—"}</strong><span class="stars-line" aria-hidden="true">${a.n ? starsText(site) : "☆☆☆☆☆"}</span></div>
      <div class="rating-block"><span class="rating-label">Trust</span><strong class="rating-big">${a.n ? trust.toFixed(1) : "—"}</strong><span class="stars-line" aria-hidden="true">${a.n ? starsText(trust) : "☆☆☆☆☆"}</span></div>
      <p class="muted rating-count">${a.n ? `${a.n} review${a.n === 1 ? "" : "s"}` : "No review yet. Be the first!"}</p>
    </div>
    ${user ? `<form class="review-form" id="site-review-form">
        <h3>Rate us</h3>
        <label>The site ${starPicker("site", mine ? mine.site : 0)}</label>
        <label>Your trust in the site ${starPicker("trust", mine ? mine.trust : 0)}</label>
        <textarea id="site-review-text" rows="3" maxlength="600" placeholder="Write a comment (optional)">${escapeHTML(mine ? mine.comment || "" : "")}</textarea>
        <button class="button button-teal" type="submit">${mine ? "Update my review" : "Send my review"}</button>
        <p class="form-message" id="site-review-msg" role="status"></p>
      </form>` : `<p class="review-signin"><a class="button button-teal" href="login.html?next=index.html%23reviews">Sign in to rate the site</a></p>`}
    <div class="review-list">${list.filter(r => r.comment || true).map(r => `<article class="review-item"><div><strong>${escapeHTML(r.name || "Customer")}</strong> <span class="stars-line" aria-hidden="true">${starsText(r.site)}</span> <small class="muted">trust ${r.trust}/5 · ${escapeHTML(formatDate(r.at))}</small></div>${r.comment ? `<p>${escapeHTML(r.comment)}</p>` : ""}</article>`).join("")}</div>`;
}

document.addEventListener("submit", async event => {
  if (event.target.id !== "site-review-form") return;
  event.preventDefault();
  const form = event.target, msg = document.getElementById("site-review-msg");
  const site = pickerValue(form, "site"), trust = pickerValue(form, "trust");
  if (!site || !trust) { msg.textContent = "Choose the stars for the site and for your trust."; msg.className = "form-message error"; return; }
  try {
    await callFn("submitReview", { type: "site", site, trust, comment: document.getElementById("site-review-text").value });
    showToast("Thank you for your review!");
    await renderSiteReviews();
  } catch (error) { msg.textContent = error.message || "Could not send it."; msg.className = "form-message error"; }
});

/* ---------- product reviews (a window opened from a product card or from a delivered order) ---------- */

async function openProductReviews(productId, productName) {
  const modal = document.createElement("div");
  modal.className = "qr-modal";
  modal.innerHTML = `<div class="qr-card review-card" role="dialog" aria-label="Reviews"><h3>${escapeHTML(productName || "Product")}</h3><div class="rv-body"><p class="muted">Loading…</p></div><button type="button" class="button button-teal rv-close">Close</button></div>`;
  modal.addEventListener("click", ev => { if (ev.target === modal || ev.target.closest(".rv-close")) modal.remove(); });
  document.body.appendChild(modal);
  const body = modal.querySelector(".rv-body");
  const draw = async () => {
    let list = [];
    try { const snap = await db.collection("productReviews").where("productId", "==", productId).get(); list = snap.docs.map(d => d.data()).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 20); } catch { /* none */ }
    const a = (window.MK_RATINGS || {})[`p-${productId}`] || { n: 0, sum: 0 };
    const { user } = await getAuthState();
    const mine = user ? list.find(r => r.uid === user.uid) : null;
    body.innerHTML = `<p class="rating-line">${a.n ? `<strong class="rating-big">${avgOf(a.sum, a.n).toFixed(1)}</strong> <span class="stars-line" aria-hidden="true">${starsText(avgOf(a.sum, a.n))}</span> <small class="muted">${a.n} review${a.n === 1 ? "" : "s"}</small>` : "No review yet."}</p>
      ${user ? `<form class="review-form" id="product-review-form">${starPicker("stars", mine ? mine.stars : 0)}
        <textarea rows="3" maxlength="600" id="product-review-text" placeholder="Write a comment (optional)">${escapeHTML(mine ? mine.comment || "" : "")}</textarea>
        <button class="button button-teal" type="submit">${mine ? "Update my review" : "Send my review"}</button>
        <p class="form-message" id="product-review-msg" role="status"></p></form>` : `<p><a href="login.html">Sign in</a> to rate this product after you receive it.</p>`}
      <div class="review-list">${list.map(r => `<article class="review-item"><div><strong>${escapeHTML(r.name || "Customer")}</strong> <span class="stars-line" aria-hidden="true">${starsText(r.stars)}</span> <small class="muted">${escapeHTML(formatDate(r.at))}</small></div>${r.comment ? `<p>${escapeHTML(r.comment)}</p>` : ""}</article>`).join("")}</div>`;
    const form = body.querySelector("#product-review-form");
    if (form) form.addEventListener("submit", async ev => {
      ev.preventDefault();
      const msg = body.querySelector("#product-review-msg"), value = pickerValue(form, "stars");
      if (!value) { msg.textContent = "Choose the stars."; msg.className = "form-message error"; return; }
      try {
        await callFn("submitReview", { type: "product", productId, stars: value, comment: body.querySelector("#product-review-text").value });
        await loadRatings(); if (typeof renderStore === "function" && document.getElementById("product-grid")) renderStore();
        await draw();
      } catch (error) { msg.textContent = error.message || "Could not send it."; msg.className = "form-message error"; }
    });
  };
  await draw();
}

document.addEventListener("click", event => {
  const link = event.target.closest(".stars-link, .rate-product");
  if (link) openProductReviews(link.dataset.id, link.dataset.name);
});

/* ---------- rate the store from anywhere (a delivered order, a partner's dashboard) ---------- */

async function openSiteRating() {
  const modal = document.createElement("div");
  modal.className = "qr-modal";
  modal.innerHTML = `<div class="qr-card review-card" role="dialog" aria-label="Rate the store"><h3>Rate the store</h3><div class="rv-body"><p class="muted">Loading…</p></div><button type="button" class="button button-light rv-close">Close</button></div>`;
  modal.addEventListener("click", ev => { if (ev.target === modal || ev.target.closest(".rv-close")) modal.remove(); });
  document.body.appendChild(modal);
  const body = modal.querySelector(".rv-body");
  let user = null, mine = null;
  try { initBackend(); user = (await getAuthState()).user; } catch { /* offline */ }
  if (!user) { body.innerHTML = `<p><a class="button button-teal" href="login.html">Sign in to rate the store</a></p>`; return; }
  try { const snap = await db.collection("siteReviews").doc(user.uid).get(); mine = snap.exists ? snap.data() : null; } catch { /* none yet */ }
  body.innerHTML = `<form class="review-form" id="rate-site-form">
      <label>The site ${starPicker("site", mine ? mine.site : 0)}</label>
      <label>Your trust in the site ${starPicker("trust", mine ? mine.trust : 0)}</label>
      <textarea rows="3" maxlength="600" id="rate-site-text" placeholder="Write a comment (optional)">${escapeHTML(mine ? mine.comment || "" : "")}</textarea>
      <button class="button button-teal" type="submit">${mine ? "Update my review" : "Send my review"}</button>
      <p class="form-message" id="rate-site-msg" role="status"></p></form>`;
  const form = body.querySelector("#rate-site-form");
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    const msg = body.querySelector("#rate-site-msg"), site = pickerValue(form, "site"), trust = pickerValue(form, "trust");
    if (!site || !trust) { msg.textContent = "Choose the stars for the site and for your trust."; msg.className = "form-message error"; return; }
    try {
      await callFn("submitReview", { type: "site", site, trust, comment: body.querySelector("#rate-site-text").value });
      showToast("Thank you for your review!");
      modal.remove();
      if (document.getElementById("site-reviews")) renderSiteReviews();
    } catch (error) { msg.textContent = error.message || "Could not send it."; msg.className = "form-message error"; }
  });
}
document.addEventListener("click", event => { if (event.target.closest(".rate-site")) openSiteRating(); });

if (document.getElementById("site-reviews")) renderSiteReviews();
else if (document.getElementById("product-grid") || document.getElementById("orders-list") || document.querySelector(".rate-product")) loadRatings();
