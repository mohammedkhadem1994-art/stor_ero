"use strict";

/* Supervisor dashboard (read-only): sales, deliveries and sellers' debts. Requires store.js. */

const $ = id => document.getElementById(id);
let allOrders = [];
let sellers = [];
let couriers = [];
let me = null;

document.addEventListener("click", event => {
  const tab = event.target.closest(".role-tab");
  if (!tab) return;
  document.querySelectorAll(".role-tab").forEach(item => item.classList.toggle("active", item === tab));
  document.querySelectorAll(".role-pane").forEach(pane => { pane.hidden = pane.id !== `pane-${tab.dataset.tab}`; });
});

/* Orders are grouped by seller. The privacy of the partners is kept: no total of sales, no earnings; only orders, goods, delivery state and what the seller owes the site. */
const isSold = order => /^Paid/.test(order.status || "");
const sitePaid = order => !["cod", "ccp"].includes(order.paymentMethod);
const sumOf = (list, key) => list.reduce((total, order) => total + Number(order[key] || 0), 0);

function orderRow(order) {
  return `<tr>
      <td><strong>${escapeHTML(order.number)}</strong><br><small class="muted">${escapeHTML(formatDate(order.createdAt, true))}</small></td>
      <td>${orderItemsHTML(order.items)}</td>
      <td>${escapeHTML(order.courierName || "—")}</td>
      <td>${escapeHTML(order.status || "")}<br><small class="muted">${escapeHTML(FULFILLMENT_LABELS[order.fulfillment] || order.fulfillment || "")}</small></td>
      <td>${formatPrice(order.commission || 0)}</td>
      <td><a class="small-button" href="invoice.html?id=${encodeURIComponent(order.id)}">Invoice</a> ${waButton((order.customer || {}).phone, (order.customer || {}).country, "Customer")}</td>
    </tr>`;
}

const ORDER_HEAD = "<thead><tr><th>Order</th><th>Items</th><th>Delivery</th><th>Status</th><th>Site fee</th><th>Invoice</th></tr></thead>";

/* what the owner still has to pay this seller: delivered orders paid to the site and not yet paid out */
const payoutsOf = orders => orders.filter(order => order.merchantId && sitePaid(order) && isSold(order) && order.fulfillment === "Delivered" && !order.payoutSettled);

function sellerBlock(group) {
  const seller = sellers.find(item => item.id === group.merchantId) || {};
  const name = group.orders[0].merchantName || seller.businessName || seller.fullName || "Seller";
  const sold = group.orders.filter(isSold);
  const pending = payoutsOf(group.orders);
  const debt = Number(seller.debt || 0);
  const limit = debtLimitOf(group.merchantId);
  const id = escapeHTML(group.merchantId);
  return `<section class="seller-block">
    <div class="seller-head"><div class="head-line">
      <div class="head-name"><strong>${escapeHTML(name)}</strong> <span class="count-pill">${group.orders.length} order(s)</span></div>
      <div class="head-debt">Debt to the site <strong>${formatPrice(debt)}</strong></div>
    </div></div>
    <div class="table-wrap"><table class="orders-table">${ORDER_HEAD}<tbody>${group.orders.slice(0, 100).map(orderRow).join("")}</tbody></table></div>
    <div class="seller-sum">
      <h4 class="sum-title">Account summary</h4>
      <table class="sum-table">
        <thead><tr><th></th><th>Orders</th><th>Site fees</th></tr></thead>
        <tbody>
          <tr><td>All orders</td><td>${group.orders.length}</td><td>${formatPrice(sumOf(group.orders, "commission"))}</td></tr>
          <tr class="sum-total"><td>Paid</td><td>${sold.length}</td><td><strong>${formatPrice(sumOf(sold, "commission"))}</strong></td></tr>
        </tbody>
      </table>
      <div class="owed-boxes">
        <div class="owed-box owed-site"><span>Owed to the owner (site fees)</span><strong>${formatPrice(debt)}</strong><small class="muted">limit ${formatPrice(limit)}${seller.suspendedReason === "debt" ? " · paused" : ""}</small></div>
      </div>
      <div class="sum-actions"><button type="button" class="small-button report-btn" data-id="${id}" data-name="${escapeHTML(name)}">Report to the owner</button></div>
    </div>
  </section>`;
}

function renderOrders() {
  const sold = allOrders.filter(isSold);
  $("v-orders").textContent = allOrders.length;
  $("v-sales").textContent = allOrders.filter(order => order.fulfillment === "Delivered").length;
  $("v-active").textContent = allOrders.filter(order => ["CourierRequested", "CourierAccepted", "OnTheWay"].includes(order.fulfillment)).length;
  $("v-payout").textContent = formatPrice(allOrders.reduce((a, order) => a + Number(order.commission || 0), 0));

  if (!allOrders.length) { $("v-list").innerHTML = '<p class="empty-state">No orders yet.</p>'; renderCouriers(); return; }
  const groups = new Map();
  const own = [];
  for (const order of allOrders.slice(0, 300)) {
    if (!order.merchantId) { own.push(order); continue; }
    if (!groups.has(order.merchantId)) groups.set(order.merchantId, { merchantId: order.merchantId, orders: [] });
    groups.get(order.merchantId).orders.push(order);
  }
  let html = [...groups.values()].map(sellerBlock).join("");
  if (own.length) {
    html += `<section class="seller-block"><div class="seller-head"><div class="head-line"><div class="head-name"><strong>Store products</strong> <span class="count-pill">${own.length} order(s)</span></div></div></div>
      <div class="table-wrap"><table class="orders-table">${ORDER_HEAD}<tbody>${own.map(orderRow).join("")}</tbody></table></div></section>`;
  }
  $("v-list").innerHTML = html;
  hydrateThumbs($("v-list"));
  renderCouriers();
}

/* statistics: only the people this supervisor brought in (and the orders of those people), as counts */
function renderStatistics() {
  if (!me || !$("v-statistics")) return;
  const mineS = sellers.filter(x => x.invitedBy === me.uid), mineC = couriers.filter(x => x.invitedBy === me.uid);
  const ids = new Set([...mineS, ...mineC].map(x => x.id));
  const people = [...mineS.map(x => ({ type: x.kind || "shop", status: x.status, city: x.city, createdAt: x.createdAt })), ...mineC.map(x => ({ type: "courier", status: x.status, city: x.city, createdAt: x.createdAt }))];
  const mineOrders = allOrders.filter(o => ids.has(o.merchantId) || ids.has(o.courierId));
  $("v-statistics").innerHTML = scopedStatsHTML({ people, orders: { total: mineOrders.length, delivered: mineOrders.filter(o => o.fulfillment === "Delivered").length } });
}

/* A collaborator is added by proposing the email of his account; the dean (or the owner) approves. The form is built once so a snapshot never wipes what is being typed. */
let proposals = [], proposalsAt = 0;
async function loadProposals(force) {
  if (!me || (!force && Date.now() - proposalsAt < 20000)) return;
  proposalsAt = Date.now();
  try {
    const snap = await db.collection("collabProposals").where("supervisorId", "==", me.uid).get();
    proposals = snap.docs.map(d => d.data()).sort((x, y) => String(y.at).localeCompare(String(x.at)));
  } catch { proposals = []; }
  const box = $("v-proposals");
  if (!box) return;
  const html = proposals.length ? `<div class="table-wrap"><table class="orders-table"><thead><tr><th>Email</th><th>Status</th><th>Date</th></tr></thead><tbody>${
    proposals.map(x => `<tr><td>${escapeHTML(x.email || "")}</td><td>${x.status === "approved" ? "Approved: he can apply now" : x.status === "rejected" ? "Refused" : "Waiting for approval"}</td><td>${escapeHTML(formatDate(x.at, true))}</td></tr>`).join("")}</tbody></table></div>` : '<p class="empty-state">No proposals yet.</p>';
  if (box.dataset.html !== html) { box.dataset.html = html; box.innerHTML = html; }
}

function renderInvite() {
  const host = $("v-invite");
  if (host && !host.dataset.ready) {
    host.dataset.ready = "1";
    host.innerHTML = `<form id="v-propose" class="inline-form"><input type="email" id="v-pemail" placeholder="Email of his account" required aria-label="Email of the person"><button type="submit" class="button button-teal">Propose as collaborator</button></form><p id="v-pmsg" class="form-message" role="status"></p><h3 class="job-heading">My proposals</h3><div id="v-proposals"></div>`;
    $("v-propose").addEventListener("submit", async event => {
      event.preventDefault();
      const msg = $("v-pmsg");
      msg.textContent = ""; msg.classList.remove("error");
      try {
        const r = await callFn("proposeCollaborator", { email: $("v-pemail").value });
        $("v-pemail").value = "";
        msg.textContent = r.approver === "dean" ? "Sent. Your dean has to approve him." : "Sent. The owner has to approve him.";
        loadProposals(true);
      } catch (error) { msg.textContent = error.message || "Could not send."; msg.classList.add("error"); }
    });
  }
  loadProposals(false);
  const mine = [...sellers.map(s => ({ ...s, kind: SCOPED_TYPES[s.kind || "shop"] || "Seller" })), ...couriers.map(c => ({ ...c, kind: "Delivery partner" }))].filter(x => x.invitedBy === me.uid);
  renderStatistics();
  $("v-invited").innerHTML = mine.length ? `<div class="table-wrap"><table class="orders-table"><thead><tr><th>Name</th><th>Type</th><th>Status</th><th></th></tr></thead><tbody>${
    mine.map(x => `<tr><td><strong>${escapeHTML(x.fullName || "")}</strong><br><small class="muted">${escapeHTML(x.businessName || "")}</small></td><td>${x.kind}</td><td>${escapeHTML(x.status)}</td>
      <td>${waButton(x.phone, x.country, "WhatsApp")}</td></tr>`).join("")}</tbody></table></div>` : '<p class="empty-state">Nobody yet. Propose a collaborator by his email.</p>';
}


function renderCouriers() {
  const rows = couriers.map(courier => {
    const jobs = allOrders.filter(order => order.courierId === courier.id && ["CourierRequested", "CourierAccepted", "OnTheWay"].includes(order.fulfillment));
    const done = allOrders.filter(order => order.courierId === courier.id && order.fulfillment === "Delivered").length;
    const where = hasPos(courier) ? `<a href="${escapeHTML(mapsLink(courier))}" target="_blank" rel="noopener">${Number(courier.lat).toFixed(4)}, ${Number(courier.lng).toFixed(4)}</a>` : "—";
    return `<tr>
      <td><strong>${escapeHTML(courier.fullName || "")}</strong><br><small class="muted">${escapeHTML(courier.phone || "")}</small></td>
      <td>${escapeHTML(courier.status)}${courier.available ? " · available" : ""}</td>
      <td>${where}<br><small class="muted">${courier.locAt ? escapeHTML(formatDate(courier.locAt, true)) : ""}</small></td>
      <td>${jobs.length} active · ${done} delivered</td></tr>`;
  });
  $("v-couriers").innerHTML = rows.length ? `<div class="table-wrap"><table class="orders-table">
    <thead><tr><th>Delivery partner</th><th>Status</th><th>Last location</th><th>Deliveries</th></tr></thead>
    <tbody>${rows.join("")}</tbody></table></div>` : '<p class="empty-state">No delivery partners yet.</p>';
}

/* ---------- delivery fees: my delivery partners owe me, I hand it to the site ---------- */
let myHold = 0, myHandedOver = 0, myEarned = 0, mySharePct = 15, feeEntries = [];
function renderFees() {
  const box = $("v-fees"); if (!box) return;
  const mine = couriers.filter(c => String(c.invitedBy || "") === (me && me.uid));
  const owedToMe = mine.reduce((a, c) => a + Number(c.feeDebt || 0), 0);
  const label = { fee: "Fee added", collect: "Collected", "collect-seller": "Received from a seller", handover: "Handed up" };
  box.innerHTML = `<div class="fee-card"><div class="fee-card-top"><span class="fee-icon" aria-hidden="true">🧾</span><div><strong>Site fees</strong><small class="muted">The sales fee is kept by each seller (shop, restaurant, pharmacy, doctor, barber…). He gives it to you by any way he likes; press "I received the debt" in the Sellers list. You keep your own share and hand the rest to your dean (or the owner), who records it with the same kind of button.</small></div></div>
    <div class="stat-tiles"><article class="stat-tile"><span>My delivery partners owe</span><strong>${formatPrice(owedToMe)}</strong></article>
    <article class="stat-tile"><span>I owe upward</span><strong>${formatPrice(myHold)}</strong><small class="muted">give it to your dean</small></article>
    <article class="stat-tile"><span>My share (${mySharePct} %)</span><strong>${formatPrice(myEarned)}</strong></article></div>
    ${mine.length ? `<div class="table-wrap"><table class="orders-table"><thead><tr><th>Delivery partner</th><th class="num">Owes</th><th class="num">Fees so far</th><th></th></tr></thead><tbody>${mine.map(c => `<tr><td><strong>${escapeHTML(c.fullName || "")}</strong><br><small class="muted">${escapeHTML(c.phone || "")}</small>${c.payClaim ? `<br><small class="muted">says he paid ${formatPrice(c.payClaim.amount)}</small>${proofLinkHTML(c.payClaim.proofId)}` : ""}</td><td class="num">${formatPrice(Number(c.feeDebt || 0))}</td><td class="num">${formatPrice(Number(c.feeTotal || 0))}</td><td>${Number(c.feeDebt || 0) > 0 ? `${proofPickerHTML()}<button type="button" class="small-button collect-fee" data-id="${escapeHTML(c.id)}" data-name="${escapeHTML(c.fullName || "")}" data-owes="${Number(c.feeDebt || 0)}">I received the fees</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : '<p class="empty-state">No delivery partner joined through you yet.</p>'}
    ${feeEntries.some(e => e.type !== "handover") ? `<details><summary>Statement (${feeEntries.filter(e => e.type !== "handover").length})</summary><div class="table-wrap"><table class="orders-table"><tbody>${feeEntries.filter(e => e.type !== "handover").map(e => `<tr><td>${escapeHTML(formatDate(e.at, true))}</td><td>${escapeHTML(label[e.type] || e.type)}</td><td>${escapeHTML(e.courierName || e.merchantName || "")}</td><td class="num">${e.type === "handover" ? "−" : e.type === "collect" || e.type === "collect-seller" ? "+" : ""}${formatPrice(e.amount)}${proofLinkHTML(e.proofId)}</td></tr>`).join("")}</tbody></table></div></details>` : ""}</div>`;
}
document.addEventListener("click", async event => {
  const button = event.target.closest(".collect-fee"); if (!button) return;
  const owes = Number(button.dataset.owes);
  const raw = window.prompt(`How much did ${button.dataset.name} hand to you? (he owes ${formatPrice(owes)})`, String(owes));
  if (raw === null) return;
  const amount = Math.round(Number(raw) * 100) / 100;
  if (!(amount > 0) || amount > owes + 0.0001) return showToast(`Enter an amount up to ${formatPrice(owes)}.`);
  if (!confirmReceived(button.dataset.name, amount)) return;
  const proof = await readProof(button.closest("td")).catch(error => { showToast(error.message); return null; }); if (proof === null) return;
  button.disabled = true;
  try { await callFn("collectCourierFee", { courierId: button.dataset.id, amount, ...(proof ? { proof } : {}) }); showToast("Payment recorded."); }
  catch (error) { showToast(error.message || "Could not record it."); button.disabled = false; }
});

/* a seller handed me the site's fee: I press the button and say how he paid (cash, post, transfer… anything is fine) */
document.addEventListener("click", async event => {
  const button = event.target.closest(".collect-seller"); if (!button) return;
  const owes = Number(button.dataset.owes);
  const raw = window.prompt(`How much did ${button.dataset.name} hand to you? (he owes ${formatPrice(owes)})`, String(owes));
  if (raw === null) return;
  const amount = Math.round(Number(String(raw).replace(",", ".")) * 100) / 100;
  if (!(amount > 0) || amount > owes + 0.0001) return showToast(`Enter an amount up to ${formatPrice(owes)}.`);
  const method = window.prompt("How did he pay? (cash, bank…)", "cash");
  if (method === null) return;
  if (!confirmReceived(button.dataset.name, amount)) return;
  const proof = await readProof(button.closest("td")).catch(error => { showToast(error.message); return null; }); if (proof === null) return;
  button.disabled = true;
  try { await callFn("collectSellerDebt", { merchantId: button.dataset.id, amount, method, ...(proof ? { proof } : {}) }); showToast("Payment recorded."); }
  catch (error) { showToast(error.message || "Could not record it."); button.disabled = false; }
});

function renderDebts() {
  const total = sellers.reduce((sum, seller) => sum + Number(seller.debt || 0), 0);
  $("v-debt").textContent = formatPrice(total);
  const list = [...sellers].sort((a, b) => Number(b.debt || 0) - Number(a.debt || 0));
  $("v-debts").innerHTML = list.length ? `<div class="table-wrap"><table class="orders-table">
    <thead><tr><th>Seller</th><th>Debt</th><th>Status</th><th></th></tr></thead>
    <tbody>${list.map(seller => {
      const debt = Number(seller.debt || 0);
      return `<tr><td><strong>${escapeHTML(seller.businessName || seller.fullName || "")}</strong></td>
        <td>${formatPrice(debt)} / ${formatPrice(debtLimitOf(seller.id))}<div class="progress"><div style="width:${Math.min(100, Math.round(debt / debtLimitOf(seller.id) * 100))}%"></div></div></td>
        <td>${escapeHTML(seller.suspendedReason === "debt" ? "paused (debt)" : seller.status)}${seller.payClaim && String(seller.invitedBy || "") === (me && me.uid) ? `<br><small class="muted">says he paid ${formatPrice(seller.payClaim.amount)}</small>${proofLinkHTML(seller.payClaim.proofId)}` : ""}</td><td>${debt > 0 && String(seller.invitedBy || "") === (me && me.uid) ? `${proofPickerHTML()}<button type="button" class="small-button collect-seller" data-id="${escapeHTML(seller.id)}" data-name="${escapeHTML(seller.businessName || seller.fullName || "")}" data-owes="${debt}">I received the debt</button> ` : ""}<button type="button" class="small-button report-btn" data-id="${escapeHTML(seller.id)}" data-name="${escapeHTML(seller.businessName || seller.fullName || "")}">Report to the owner</button></td></tr>`;
    }).join("")}</tbody></table></div>` : '<p class="empty-state">No sellers yet.</p>';
}

/* ---------- a signed report to the owner about one store (up to 200 words) ---------- */

const REPORT_MAX = 200, REPORT_MIN = 10;
const wordCount = text => (String(text).trim() ? String(text).trim().split(/\s+/).length : 0);

const PAD_W = 640, PAD_H = 220, INFO_H = 118;

/* Draws the hand-written strokes, then the stamp over them (the stamp is slightly tilted and see-through, so the signature shows through). */
function paintPad(ctx, strokes, stamp) {
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, PAD_W, PAD_H);
  ctx.strokeStyle = "#1e1e1e"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const stroke of strokes) {
    ctx.beginPath();
    stroke.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (stroke.length === 1) ctx.lineTo(stroke[0][0] + 0.1, stroke[0][1] + 0.1);
    ctx.stroke();
  }
  if (stamp) {
    const scale = Math.min(190 / stamp.height, 260 / stamp.width, 1.6);
    const w = stamp.width * scale, h = stamp.height * scale;
    ctx.save();
    ctx.translate(PAD_W * 0.64, PAD_H / 2);
    ctx.rotate(-0.12);
    ctx.globalAlpha = 0.9;
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(stamp, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

const fitText = (ctx, text, width) => {
  let out = String(text);
  while (out.length > 4 && ctx.measureText(out).width > width) out = out.slice(0, -2);
  return out === String(text) ? out : out.replace(/\s*$/, "") + "…";
};

/* The final picture: signature + stamp on top, and under it the details the stamp carries. */
function buildSignaturePicture(strokes, stamp, lines) {
  const canvas = document.createElement("canvas");
  canvas.width = PAD_W; canvas.height = PAD_H + INFO_H;
  const ctx = canvas.getContext("2d");
  paintPad(ctx, strokes, stamp);
  ctx.fillStyle = "#f7f7f7"; ctx.fillRect(0, PAD_H, PAD_W, INFO_H);
  ctx.strokeStyle = "#808080"; ctx.lineWidth = 1.5; ctx.strokeRect(1, 1, PAD_W - 2, PAD_H + INFO_H - 2);
  ctx.beginPath(); ctx.moveTo(0, PAD_H); ctx.lineTo(PAD_W, PAD_H); ctx.stroke();
  ctx.fillStyle = "#1e1e1e"; ctx.font = "15px Arial, sans-serif"; ctx.textBaseline = "middle";
  lines.forEach((line, i) => ctx.fillText(fitText(ctx, line, PAD_W - 24), 12, PAD_H + 20 + i * 26));
  return canvas.toDataURL("image/jpeg", 0.82);
}

function loadStampFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read this picture."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("This file is not a picture."));
      img.onload = () => {
        const k = Math.min(1, 320 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        const small = new Image();
        small.onload = () => resolve(small);
        small.src = c.toDataURL("image/png");
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function getPlace() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null), { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 });
  });
}

function openReport(sellerId, storeName) {
  const seller = sellers.find(item => item.id === sellerId) || {};
  const signer = me.displayName || me.email || "Supervisor";
  const debt = Number(seller.debt || 0);
  const vars = { store: storeName || seller.businessName || "", debt: formatPrice(debt), limit: formatPrice(debtLimitOf(sellerId)), date: formatDate(new Date().toISOString()) };
  const templates = window.MK_REPORT_TEMPLATES || {};
  const lang = typeof window.mkLang === "function" ? window.mkLang() : "en";
  const modal = document.createElement("div");
  modal.className = "join-modal";
  modal.innerHTML = `<div class="join-box report-box" role="dialog" aria-label="Report">
    <header><strong>Report about ${escapeHTML(storeName || "this store")}</strong><button type="button" class="small-button" id="report-close">Close</button></header>
    <div class="report-body">
      <p class="muted">Write your report for the store owner (${REPORT_MIN}–${REPORT_MAX} words). He will read it on his screen, get a chat message and a phone alert.</p>
      <div class="template-row">
        <label class="limit-field">Ready-made text
          <select id="report-template">${Object.entries(templates).map(([key, t]) => `<option value="${key}">${escapeHTML(t.label[lang] || t.label.en)}</option>`).join("")}</select></label>
        <button type="button" class="small-button" id="report-use-template">Use this text</button>
      </div>
      <textarea id="report-text" rows="9" placeholder="What did you notice about this store?"></textarea>
      <p class="word-count" id="report-count">0 / ${REPORT_MAX} words</p>

      <div class="sign-row">
        <div class="sign-pad">
          <span class="signature-label">Draw your signature here</span>
          <canvas id="sign-canvas" width="${PAD_W}" height="${PAD_H}" aria-label="Signature"></canvas>
          <button type="button" class="small-button" id="sign-clear">Clear</button>
        </div>
        <div class="stamp-box">
          <span class="signature-label">Stamp (optional)</span>
          <p class="muted">Upload a picture of your stamp. It is placed over your signature.</p>
          <input type="file" id="stamp-file" accept="image/*">
          <button type="button" class="small-button" id="stamp-remove" hidden>Remove stamp</button>
        </div>
      </div>
      <div class="signature-block">
        <span class="signature-label">The stamp carries</span>
        <small>Writer: <strong>${escapeHTML(signer)}</strong> · Supervisor, acting on behalf of the owner</small>
        <small>Date and time: added when you send</small>
        <small>Store: <strong>${escapeHTML(storeName || "")}</strong>${seller.phone ? " · " + escapeHTML(seller.phone) : ""}${seller.city ? " · " + escapeHTML(seller.city) : ""}${seller.address ? ", " + escapeHTML(seller.address) : ""}</small>
        <label class="check-row"><input type="checkbox" id="report-place" checked> Add my location (your browser will ask)</label>
      </div>
      <label class="check-row"><input type="checkbox" id="report-sign"> I confirm this report and sign it with my hand-drawn signature.</label>
    </div>
    <footer class="report-foot">
      <p id="report-hint" class="muted report-hint"></p>
      <p id="report-message" class="form-message" role="status"></p>
      <button type="button" class="button button-teal" id="report-send" disabled>Sign and send</button>
    </footer></div>`;
  document.body.appendChild(modal);
  const $m = sel => modal.querySelector(sel);
  const text = $m("#report-text"), count = $m("#report-count"), sign = $m("#report-sign"), send = $m("#report-send"), msg = $m("#report-message");
  const canvas = $m("#sign-canvas"), ctx = canvas.getContext("2d");
  let strokes = [], stamp = null, drawing = null;

  const repaint = () => { paintPad(ctx, strokes, stamp); refresh(); };
  const refresh = () => {
    const n = wordCount(text.value);
    count.textContent = `${n} / ${REPORT_MAX} words`;
    count.classList.toggle("over", n > REPORT_MAX);
    const missing = [];
    if (n < REPORT_MIN) missing.push(`write at least ${REPORT_MIN} words`);
    if (n > REPORT_MAX) missing.push(`shorten the report to ${REPORT_MAX} words`);
    if (!strokes.length) missing.push("draw your signature");
    if (!sign.checked) missing.push("tick the confirmation box");
    send.disabled = missing.length > 0;
    const tr = x => (typeof window.mkT === "function" ? window.mkT(x) : x);
    $m("#report-hint").textContent = missing.length ? `${tr("To send:")} ${missing.map(tr).join(", ")}` : "";
  };
  const point = event => {
    const box = canvas.getBoundingClientRect();
    return [Math.round((event.clientX - box.left) * PAD_W / (box.width || PAD_W)), Math.round((event.clientY - box.top) * PAD_H / (box.height || PAD_H))];
  };
  canvas.addEventListener("pointerdown", event => {
    event.preventDefault();
    try { canvas.setPointerCapture(event.pointerId); } catch { /* optional */ }
    drawing = [point(event)]; strokes.push(drawing); repaint();
  });
  canvas.addEventListener("pointermove", event => {
    if (!drawing) return;
    drawing.push(point(event)); paintPad(ctx, strokes, null);
  });
  const stop = () => { if (drawing) { drawing = null; repaint(); } };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
  $m("#sign-clear").addEventListener("click", () => { strokes = []; repaint(); });

  $m("#stamp-file").addEventListener("change", async event => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try { stamp = await loadStampFile(file); $m("#stamp-remove").hidden = false; msg.textContent = ""; repaint(); }
    catch (error) { msg.className = "form-message error"; msg.textContent = error.message; }
  });
  $m("#stamp-remove").addEventListener("click", () => { stamp = null; $m("#stamp-file").value = ""; $m("#stamp-remove").hidden = true; repaint(); });

  $m("#report-use-template").addEventListener("click", () => {
    if (text.value.trim() && !window.confirm("Replace what you wrote with the ready-made text?")) return;
    text.value = window.mkReportText($m("#report-template").value, vars);
    refresh();
  });
  text.addEventListener("input", refresh);
  sign.addEventListener("change", refresh);
  $m("#report-close").addEventListener("click", () => modal.remove());

  send.addEventListener("click", async () => {
    send.disabled = true;
    msg.className = "form-message"; msg.textContent = "Sending…";
    try {
      const place = $m("#report-place").checked ? await getPlace() : null;
      const now = new Date();
      const lines = [
        `Writer: ${signer} · Supervisor, on behalf of the owner`,
        `Date: ${now.toLocaleString()}`,
        `Location: ${place ? place.lat.toFixed(5) + ", " + place.lng.toFixed(5) : "not shared"}`,
        `Store: ${storeName || ""}${seller.phone ? " · " + seller.phone : ""}${seller.city ? " · " + seller.city : ""}`
      ];
      const signature = buildSignaturePicture(strokes, stamp, lines);
      const result = await callFn("submitReport", { sellerId, text: text.value, signature, place });
      modal.remove();
      showToast(`Report sent and signed (code ${result.fingerprint}).`, "success");
    } catch (error) {
      console.error(error);
      msg.className = "form-message error";
      msg.textContent = `${authErrorMessage(error)}${error && error.code ? " (" + error.code + ")" : ""}`;
      refresh();
    }
  });
  repaint();
  text.focus();
}

document.addEventListener("click", event => {
  const button = event.target.closest(".report-btn");
  if (button) openReport(button.dataset.id, button.dataset.name);
});

function renderLedger(entries) {
  $("v-ledger").innerHTML = entries.length ? `<div class="table-wrap"><table class="orders-table"><tbody>${entries.map(entry => `<tr>
    <td>${escapeHTML(formatDate(entry.at, true))}</td><td>${escapeHTML(entry.merchantName || "")}</td>
    <td>${entry.type === "payment" ? "Payment" : `Fee for ${escapeHTML(entry.orderNumber || "")}`}</td>
    <td>${entry.type === "payment" ? "−" : "+"}${formatPrice(entry.amount)}</td><td>Balance ${formatPrice(entry.balance)}</td></tr>`).join("")}</tbody></table></div>`
    : '<p class="empty-state">No movements yet.</p>';
}

(async () => {
  if (!initBackend()) return;
  const state = await getAuthState();
  if (!state.user || !state.supervisor) return;
  me = state.user;
  if (window.setupLookPanel) window.setupLookPanel(me, () => ({ businessName: (state.supervisor && (state.supervisor.fullName || state.supervisor.name)) || me.email, kindLabel: "Supervisor" }), { own: true });
  await loadDebtRule();
  renderInvite();
  if (window.mkTrusted) mkTrusted.approver($("v-trusted"), "supervisorId");

  const fail = (id, error) => { console.error(error); $(id).innerHTML = '<p class="empty-state">Could not load this section.</p>'; };

  try {
    watchOrders(null, null, list => { allOrders = list; renderOrders(); renderStatistics(); }, () => "", error => fail("v-list", error));
  } catch (error) { fail("v-list", error); }

  try {
    db.collection("merchants").onSnapshot(snap => {
      sellers = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      renderDebts();
      renderOrders();
      renderInvite();
    }, error => fail("v-debts", error));
    db.collection("couriers").onSnapshot(snap => {
      couriers = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      renderCouriers();
      renderFees();
      renderInvite();
    }, error => fail("v-couriers", error));
    db.collection("supervisors").doc(me.uid).onSnapshot(snap => { if (snap.exists) { myHold = Number(snap.data().feeDebt || 0); myHandedOver = Number(snap.data().feeHandedOver || 0); myEarned = Number(snap.data().feeEarned || 0); mySharePct = typeof snap.data().sharePercent === "number" ? snap.data().sharePercent : 15; renderFees(); } }, () => {});
    db.collection("feeLedger").where("supervisorId", "==", me.uid).onSnapshot(snap => {
      feeEntries = snap.docs.map(d => d.data()).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 60); renderFees();
    }, () => {});
    db.collection("ledger").orderBy("at", "desc").limit(30).onSnapshot(snap => {
      renderLedger(snap.docs.map(doc => doc.data()));
    }, error => fail("v-ledger", error));
  } catch (error) { fail("v-debts", error); }
})();
