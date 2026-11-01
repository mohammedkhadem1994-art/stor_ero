"use strict";

/* Seller dashboard. Requires store.js.
   Products are written straight to Firestore (rules: only your own, only when approved).
   Order changes go through the server (updateOrderStatus), which checks the role and the status. */

let me = null;          /* the signed-in user */
let shop = null;        /* merchants/{uid} */
let myProducts = [];
let myOrders = [];
let trustedIds = new Set(); /* delivery partners this seller trusts (approved by his supervisor and dean) */
let courierList = null; /* approved couriers, loaded when first needed */

const $ = id => document.getElementById(id);
const OPEN_STATES = ["Placed", "Accepted", "ReadyForPickup", "CourierRequested", "CourierAccepted", "OnTheWay"];

function say(id, text, isError = false) {
  $(id).textContent = text;
  $(id).classList.toggle("error", isError);
}

/* ---------- banner + tabs ---------- */

let moneyHidden = false;   /* the owner hides the credit window and the fee cards during the trial */
let debtPauseOn = false;   /* the owner's switch: pause a seller at the debt limit */

function renderBanner() {
  const texts = {
    pending: ["Your seller account is waiting for approval.", "You can look around, but you can add products only after an administrator approves you."],
    rejected: ["Your application was not approved.", "Please contact the store owner."],
    suspended: ["Your seller account is suspended.", "Please contact the store owner."]
  };
  let info = texts[shop.status];
  const debt = Number(shop.debt || 0);
  if (shop.status === "suspended" && shop.suspendedReason === "debt") {
    info = [["doctor", "agency", "taxi", "barber", "hotel"].includes(shop.kind) ? "Your account is paused because your debt reached the limit." : "Your shop is paused because your debt reached the limit.", `You owe the site ${formatPrice(debt)}. Pay it to the store owner and your account is reopened automatically.`];
  }
  /* With the credit module: what he owes the site and his fee are shown in his credit window (wallet.html), not here.
     The European edition has no credit window, so the balance card stays on this page. */
  const provider = ["doctor", "agency", "taxi", "barber", "hotel"].includes(shop.kind);
  /* the picture guide of this kind of account, one tap away */
  if (!document.getElementById("guide-link")) {
    const main = document.querySelector("main.admin-main");
    if (main) { const p = document.createElement("p"); p.id = "guide-link"; p.className = "guide-link"; p.innerHTML = `<a class="button button-secondary" href="guide.html#${encodeURIComponent(shop.kind || "shop")}"><span aria-hidden="true">📖</span> How to use this account</a>`; main.insertBefore(p, main.firstChild); }
  }
  let balanceBox = "";
  if ((shop.status === "approved" || shop.suspendedReason === "debt") && !moneyHidden) {
    if (MK_EDITION.dz) {
      if (debt > 0) balanceBox = `<p class="muted balance-link">You owe the site ${formatPrice(debt)}. <a href="wallet.html">See it in My credit</a></p>`;
    } else {
      const limit = debtLimitOf(shop.uid), pct = limit > 0 ? Math.min(100, Math.round(debt / limit * 100)) : 0;
      const f = STORE_FEE_INFO;
      let rate = "";
      if (f) {
        const left = f.until ? Math.max(0, Math.ceil((f.until - Date.now()) / 86400000)) : 0;
        const after = STORE_FEE_PLAN && STORE_FEE_PLAN.rates ? Number(STORE_FEE_PLAN.rates[f.kind]) || 0 : 0;
        rate = f.booking
          ? `<div class="balance-tile"><span>Site fee</span><strong>${formatPrice(f.booking.app)} / ${formatPrice(f.booking.walkin)}</strong><small>${f.booking.source === "free" ? `Free start until ${escapeHTML(formatDate(new Date(f.booking.until).toISOString()))}, then ` : ""}${escapeHTML(formatPrice(f.booking.source === "free" ? f.booking.afterApp : f.booking.app))} per booking made in the app · ${escapeHTML(formatPrice(f.booking.source === "free" ? f.booking.afterWalkin : f.booking.walkin))} per person you add yourself</small></div>`
          : f.source === "free"
          ? `<div class="balance-tile"><span>Site fee</span><strong>0 %</strong><small>Free start until ${escapeHTML(formatDate(new Date(f.until).toISOString()))} · ${left} days left${after > 0 ? `, then ${after} %` : ""}</small></div>`
          : `<div class="balance-tile"><span>Site fee</span><strong>${f.percent} %</strong><small>${f.source === "account" ? "Set by the owner for your account" : provider ? "Of each booking you mark as done" : "Added to your prices"}</small></div>`;
      }
      balanceBox = `<aside class="balance-card${debt > 0 ? " has-debt" : ""}">
      <div class="balance-grid">
        <div class="balance-tile balance-main"><span>You owe the site</span><strong>${formatPrice(debt)}</strong>
          <small>${provider ? "The site's fee on the bookings you marked as done." : "The site's sales fee on your orders. You keep it, then pay it to the owner or hand it to your supervisor."}</small></div>
      </div>
      ${rate ? `<details class="balance-more"><summary>Fee details</summary><div class="balance-grid">${rate}</div></details>` : ""}
      ${debtPauseOn && debt > 0 ? `<div class="progress" aria-label="Debt limit"><div style="width:${pct}%"></div></div><small class="muted">${formatPrice(debt)} of ${formatPrice(limit)}. At the limit your account is paused until you pay.</small>` : ""}
      ${shop.payClaim ? `<small class="muted">You told ${shop.payClaim.to === "supervisor" ? "your supervisor" : "the owner"} you paid ${formatPrice(shop.payClaim.amount)}; he will check and record it.</small>` : ""}
      ${debt > 0 ? `<p class="balance-actions">${proofPickerHTML()} <button type="button" class="small-button" id="pay-site">How to pay the site</button> <button type="button" class="small-button" id="claim-paid">I paid the owner</button>${shop.invitedBy ? ' <button type="button" class="small-button" id="claim-paid-sup">I paid my supervisor</button>' : ""}</p><div id="site-pay"></div>` : ""}
    </aside>`;
    }
  }
  $("account-banner").innerHTML = (info
    ? `<aside class="admin-notice"><strong>${escapeHTML(info[0])}</strong> ${escapeHTML(info[1])}</aside>` : "") + balanceBox;
  $("shop-title").textContent = shop.businessName || "Your shop";
}

document.addEventListener("click", async event => {
  const pay = event.target.closest("#pay-site");
  const claim = event.target.closest("#claim-paid, #claim-paid-sup");
  if (pay) {
    try {
      const { info } = await callFn("sitePayInfo", {});
      const row = (label, value) => value ? `<div class="pay-row"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>` : "";
      $("site-pay").innerHTML = (info.rows || []).map(item => row(item.label, item.value)).join("") + (info.note ? `<p class="small-note">${escapeHTML(info.note)}</p>` : "");
    } catch (error) { showToast(authErrorMessage(error), "error"); }
    return;
  }
  if (claim) {
    const answer = window.prompt("Amount you paid to the site:", Number(shop.debt || 0).toFixed(2));
    if (answer === null) return;
    try {
      const toSupervisor = claim.id === "claim-paid-sup";
      const proof = await readProof(claim.closest(".balance-actions"));
      await callFn("claimDebtPayment", { amount: Number(String(answer).replace(",", ".")), to: toSupervisor ? "supervisor" : "owner", ...(proof ? { proof } : {}) });
      showToast(toSupervisor ? "Your supervisor was told. He will check and record your payment." : "The owner was told. He will check and record your payment.");
    } catch (error) { showToast(authErrorMessage(error), "error"); }
    return;
  }
  const tab = event.target.closest(".role-tab");
  if (!tab) return;
  document.querySelectorAll(".role-tab").forEach(item => item.classList.toggle("active", item === tab));
  document.querySelectorAll(".role-pane").forEach(pane => { pane.hidden = pane.id !== `pane-${tab.dataset.tab}`; });
  if (tab.dataset.tab === "sales" && window.renderSales) window.renderSales();
});

/* ---------- stats ---------- */

function renderStats() {
  const delivered = myOrders.filter(order => order.fulfillment === "Delivered");
  $("s-products").textContent = myProducts.length;
  $("s-open").textContent = myOrders.filter(order => OPEN_STATES.includes(order.fulfillment)).length;
  $("s-done").textContent = delivered.length;
  $("s-net").textContent = formatPrice(delivered.reduce((sum, order) => sum + Number(order.merchantNet || 0), 0));
}

/* ---------- orders ---------- */

function fulfillmentBadge(order) {
  return `<span class="status-pill">${escapeHTML(FULFILLMENT_LABELS[order.fulfillment] || order.fulfillment || "")}</span>`;
}

function courierChoices(order) {
  const origin = { lat: shop.lat, lng: shop.lng };
  const rows = (courierList || [])
    .filter(courier => courier.available !== false)
    .filter(courier => !order.delivery || courierServes(courier, order.delivery.speed, order.deliveryFee, order.totalWeight, order.chargeableWeight))
    .map(courier => {
      const km = distanceKm(origin, courier);
      const sameCity = String(courier.city || "").toLowerCase() === String(shop.city || "").toLowerCase();
      return { courier, km, sameCity };
    })
    .sort((a, b) => (trustedIds.has(b.courier.id) - trustedIds.has(a.courier.id)) || (a.km === null) - (b.km === null) || (a.km - b.km) || (b.sameCity - a.sameCity));

  if (!rows.length) return `<p class="muted">No delivery partner is available right now${order.delivery ? ` for ${escapeHTML(order.delivery.label)} delivery at ${formatPrice(order.deliveryFee)}` : ""}. Try again later.</p>`;

  return `<div class="courier-list">${rows.map(({ courier, km, sameCity }) => `
    <div class="courier-row">
      <div>
        <strong>${escapeHTML(courier.fullName)}</strong>${trustedIds.has(courier.id) ? ' <span class="count-pill">⭐ Trusted</span>' : ""}
        <small class="muted">${escapeHTML(courier.vehicle || "")} · ${escapeHTML(courier.city || "")}
          ${courier.maxWeight > 0 ? ` · max ${courier.maxWeight} kg` : ""} · ${km !== null ? `${km.toFixed(1)} km away` : sameCity ? "same city" : "distance unknown"}${order.delivery ? ` · ${formatPrice(courierRate(courier, order.delivery.speed))}` : ""}</small>
      </div>
      <button type="button" class="small-button request-courier" data-order="${escapeHTML(order.id)}" data-courier="${escapeHTML(courier.id)}">Request</button>
    </div>`).join("")}</div>`;
}

function orderCard(order) {
  const customer = order.customer || {};
  const paid = /^Paid/.test(order.status || "");
  const lines = orderItemsHTML(order.items);
  const map = mapsLink(hasPos(customer) ? customer : { address: customer.address, city: customer.city, country: customer.country });
  const waText = {
    Placed: `Hello ${customer.name || ""}, we received your order ${order.number}. We will confirm it shortly.`,
    Accepted: `Hello ${customer.name || ""}, your order ${order.number} is accepted and being prepared.`,
    CourierRequested: `Hello ${customer.name || ""}, your order ${order.number} is ready and we are choosing the delivery partner.`,
    CourierAccepted: `Hello ${customer.name || ""}, a delivery partner took your order ${order.number}.`,
    OnTheWay: `Hello ${customer.name || ""}, your order ${order.number} is on the way.`,
    Delivered: `Hello ${customer.name || ""}, your order ${order.number} was delivered. Thank you! Please rate us on the store.`,
    Rejected: `Hello ${customer.name || ""}, sorry, we could not take your order ${order.number}.`
  }[order.fulfillment] || `Hello ${customer.name || ""}, about your order ${order.number}`;
  const wa = waButton(customer.phone, customer.country, "Customer", waText)
    + waButton(order.courierPhone, "", "Delivery", `Hello, about order ${order.number}`);
  const chat = `<button type="button" class="small-button" data-chat-order="${escapeHTML(order.id)}" data-chat-number="${escapeHTML(order.number)}">Chat</button>`;

  let actions = "";
  switch (order.fulfillment) {
    case "Placed":
      actions = `<button type="button" class="small-button order-action" data-action="accept" data-order="${escapeHTML(order.id)}">Accept order</button>
           <button type="button" class="small-button delete-button order-action" data-action="reject" data-order="${escapeHTML(order.id)}">Reject</button>
           ${paid ? "" : '<small class="muted">Payment not confirmed yet.</small>'}`;
      break;
    case "Accepted":
      if (order.deliveryMode === "pickup" || order.deliveryMode === "self") {
        actions = order.deliveryMode === "pickup"
          ? `<button type="button" class="small-button order-action" data-action="readyPickup" data-order="${escapeHTML(order.id)}">Ready for pick-up</button>`
          : `<button type="button" class="small-button order-action" data-action="startSelfDelivery" data-order="${escapeHTML(order.id)}">I am on my way to the customer</button>`;
        actions += ` <button type="button" class="small-button order-action" data-action="delivered" data-order="${escapeHTML(order.id)}">${order.deliveryMode === "pickup" ? "Handed to the customer" : "Delivered to the customer"}</button>`;
        break;
      }
      actions = `<button type="button" class="small-button choose-courier" data-order="${escapeHTML(order.id)}">Choose a delivery partner</button>
                 <div class="courier-slot" id="couriers-${escapeHTML(order.id)}"></div>`;
      break;
    case "CourierRequested":
      actions = `<span class="muted">Request sent to ${escapeHTML(order.courierName || "the delivery partner")}.</span>
                 <button type="button" class="small-button order-action" data-action="cancelCourier" data-order="${escapeHTML(order.id)}">Cancel request</button>`;
      break;
    case "ReadyForPickup":
      actions = `<span class="muted">Waiting for the customer to collect it.</span> <button type="button" class="small-button order-action" data-action="delivered" data-order="${escapeHTML(order.id)}">Handed to the customer</button>`;
      break;
    case "CourierAccepted":
    case "OnTheWay":
      if (order.deliveryMode === "self") {
        actions = `<span class="muted">You are delivering this order yourself.</span> <button type="button" class="small-button order-action" data-action="delivered" data-order="${escapeHTML(order.id)}">Delivered to the customer</button>`;
        break;
      }
      actions = `<span class="muted">Delivery partner: <strong>${escapeHTML(order.courierName || "")}</strong>
        ${order.courierPhone ? `· ${escapeHTML(order.courierPhone)}` : ""}</span>`;
      break;
    case "Delivered":
    case "Rejected":
      actions = `<button type="button" class="small-button delete-button hide-sale" data-id="${escapeHTML(order.id)}">Remove</button>`;
      break;
    default: break;
  }

  if (Number(order.prepMinutes) > 0 && ["Accepted", "CourierRequested", "CourierAccepted"].includes(order.fulfillment)) {
    const left = order.readyAt ? Math.max(0, Math.round((Date.parse(order.readyAt) - Date.now()) / 60000)) : 0;
    actions += ` <span class="kitchen-box">🍳 ${order.readyAt ? `Ready around ${escapeHTML(new Date(order.readyAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))} (${left} min left)` : `${Number(order.prepMinutes)} min`}
      <input class="ready-minutes" type="number" min="0" max="60" value="${order.readyIn != null ? Number(order.readyIn) : Math.min(5, left)}" aria-label="Minutes until ready" data-order="${escapeHTML(order.id)}">
      <button type="button" class="small-button order-action" data-action="almostReady" data-order="${escapeHTML(order.id)}">Almost ready</button></span>`;
  }
  if (order.paymentMethod === "ccp" && !paid && !["Rejected", "Delivered"].includes(order.fulfillment)) {
    actions += ` <button type="button" class="small-button order-action" data-action="paymentReceived" data-order="${escapeHTML(order.id)}">Payment received</button>`;
  }

  return `
    <article class="order-card">
      <header>
        <strong>${escapeHTML(order.number)}</strong>
        ${fulfillmentBadge(order)}
        <span class="muted">${escapeHTML(formatDate(order.createdAt, true))}</span>
      </header>
      <div class="order-grid">
        <div><small class="muted">Items</small><div>${lines}</div></div>
        <div><small class="muted">${order.deliveryMode === "pickup" ? "The customer collects it" : order.deliveryMode === "self" ? "You deliver to" : "Deliver to"}</small>
          <div>${escapeHTML(customer.name || "")}<br>${escapeHTML(customer.phone || "")}<br>
            ${escapeHTML(customer.address || "")}, ${escapeHTML(customer.city || "")}
            ${hasPos(customer) ? `<br><small>${Number(customer.lat).toFixed(5)}, ${Number(customer.lng).toFixed(5)}</small>` : ""}
            ${map ? `<br><a href="${escapeHTML(map)}" target="_blank" rel="noopener">Open in maps</a>` : ""}</div></div>
        <div><small class="muted">Payment</small>
          <div>${escapeHTML(order.status || "")}<br>Total ${formatPrice(order.total)}${order.delivery ? ` <small class="muted">(goods ${formatPrice(order.itemsTotal)} + delivery ${formatPrice(order.deliveryFee)})</small>` : ""}<br>
            ${order.delivery ? `<small><span class="status-pill">${escapeHTML(speedText(order))}</span></small><br>` : ""}${order.totalWeight > 0 ? `<small class="muted">⚖ ${Number(order.totalWeight)} kg</small><br>` : ""}<small class="muted">Platform fee ${formatPrice(order.commission || 0)} · you get ${formatPrice(order.merchantNet || 0)}</small></div></div>
      </div>
      <div class="order-actions">${actions} ${chat} ${wa}</div>
    </article>`;
}

function renderOrders() {
  renderStats();
  setTimeout(() => hydrateThumbs($("seller-orders")), 0);
  const shown = myOrders.filter(order => order.merchantHidden !== true);
  const finishedSale = order => ["Delivered", "Rejected"].includes(order.fulfillment);
  $("seller-orders").innerHTML = shown.length
    ? (shown.some(finishedSale) ? '<p><button type="button" class="small-button delete-button" id="hide-finished-sales">Remove all finished sales from my list</button></p>' : "") + shown.map(orderCard).join("")
    : '<p class="empty-state">No orders yet. They appear here when a customer buys one of your products.</p>';
}

async function refreshOrders() {
  myOrders = await getOrdersWhere("merchantId", me.uid);
  renderOrders();
}

$("seller-orders").addEventListener("click", async event => {
  const hideBtn = event.target.closest("#hide-finished-sales, .hide-sale");
  if (hideBtn) {
    const finishedSale = order => ["Delivered", "Rejected"].includes(order.fulfillment) && order.merchantHidden !== true;
    const targets = hideBtn.id === "hide-finished-sales" ? myOrders.filter(finishedSale) : myOrders.filter(order => order.id === hideBtn.dataset.id);
    if (!window.confirm(targets.length > 1 ? `Remove ${targets.length} finished sales from your list? Your earnings and the store's records are kept.` : "Remove this sale from your list?")) return;
    try {
      for (const order of targets) await db.collection("orders").doc(order.id).update({ merchantHidden: true });
      targets.forEach(order => { order.merchantHidden = true; });
      renderOrders();
      showToast("Removed from your list.");
    } catch (error) {
      console.error(error);
      showToast(authErrorMessage(error), "error");
    }
    return;
  }
  const act = event.target.closest(".order-action");
  const choose = event.target.closest(".choose-courier");
  const request = event.target.closest(".request-courier");
  if (!act && !choose && !request) return;

  try {
    if (choose) {
      const slot = $(`couriers-${choose.dataset.order}`);
      slot.innerHTML = '<p class="muted">Loading…</p>';
      if (!courierList) {
        const snap = await db.collection("couriers").where("status", "==", "approved").get();
        courierList = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      }
      const order = myOrders.find(item => item.id === choose.dataset.order);
      slot.innerHTML = courierChoices(order);
      return;
    }

    const button = act || request;
    button.disabled = true;
    if (request) {
      await orderAction(request.dataset.order, "requestCourier", { courierId: request.dataset.courier });
      showToast("Request sent to the delivery partner");
    } else {
      if (act.dataset.action === "reject" && !window.confirm("Reject this order? If it was paid, the owner will refund the customer.")) {
        button.disabled = false;
        return;
      }
      if (act.dataset.action === "almostReady") {
        const input = document.querySelector(`.ready-minutes[data-order="${act.dataset.order}"]`);
        await orderAction(act.dataset.order, "almostReady", { minutes: Number(input && input.value) || 0 });
        showToast("The delivery partner was told");
      } else if (act.dataset.action === "delivered") {
        /* no delivery partner: the seller just marks it as handed over (no code from the customer) */
        await orderAction(act.dataset.order, "delivered");
        showToast("Marked as delivered");
      } else await orderAction(act.dataset.order, act.dataset.action);
    }
    await refreshOrders();
  } catch (error) {
    console.error(error);
    showToast(authErrorMessage(error), "error");
    await refreshOrders().catch(() => {});
  }
});

/* ---------- products ---------- */

var renderProducts = function renderProducts() {
  renderStats();
  $("p-list").innerHTML = myProducts.length ? myProducts.map(product => {
    const image = imageSrc(product.image);
    return `
    <article class="admin-product-item">
      <div class="admin-product-thumb">${image ? `<img src="${escapeHTML(image)}" alt="" loading="lazy">` : "<span>P</span>"}</div>
      <div class="admin-product-details">
        <strong>${escapeHTML(product.name)}</strong>
        <span>${escapeHTML(product.category || "Uncategorized")}${product.weightKg > 0 ? ` · ⚖ ${product.weightKg} kg` : ""}${product.lengthCm > 0 ? ` · 📦 ${product.lengthCm}×${product.widthCm}×${product.heightCm} cm` : ""} · Customer pays ${formatPrice(product.price)} · You receive ${formatPrice(product.basePrice != null ? product.basePrice : product.price * (1 - STORE_FEE_RATE))}</span>
        <span class="product-status ${product.visible === false ? "status-hidden" : ""}">${product.visible === false ? "Hidden from store" : "Visible in store"}</span>
        ${Number(product.prepMinutes) > 0 ? `<span class="muted">🍳 ${Number(product.prepMinutes)} min</span>` : ""}${Number(product.discountPercent) > 0 ? ` <span class="offer-badge">-${Number(product.discountPercent)}%</span>` : ""}
        <span class="product-status ${product.available === false ? "status-hidden" : ""}">${product.available === false ? "Not available now" : "Available"}</span>
      </div>
      <div class="admin-product-actions">
        <button class="small-button toggle-avail" type="button" data-id="${escapeHTML(product.id)}">${product.available === false ? "Back in stock" : "Sold out"}</button>
        <button class="small-button edit-product" type="button" data-id="${escapeHTML(product.id)}">Edit</button>
        <button class="small-button delete-button delete-product" type="button" data-id="${escapeHTML(product.id)}">Delete</button>
      </div>
    </article>`;
  }).join("") : '<p class="empty-state">No products yet. Add your first one.</p>';
}

/* How many products this account may have: his own limit, or the limit of his kind (set by the owner). null = no limit. */
let productLimitNow = null;
async function loadProductLimit() {
  productLimitNow = null;
  try {
    if (typeof shop.productLimit === "number" && shop.productLimit >= 0) productLimitNow = shop.productLimit;
    else if (typeof shop.planLimit === "number" && shop.planLimit >= 0) productLimitNow = shop.planLimit;
    else {
      const snap = await db.collection("settings").doc("productLimits").get();
      const v = snap.exists ? snap.data()[shop.kind || "shop"] : undefined;
      if (typeof v === "number" && v >= 0) productLimitNow = v;
    }
  } catch { /* no limit known */ }
  showQuota();
}
function showQuota() {
  const box = $("p-quota");
  if (!box) return;
  if (window.renderPlansBox) window.renderPlansBox(shop, myProducts.length, productLimitNow);
  box.textContent = productLimitNow === null ? "" : `Products: ${myProducts.length} of ${productLimitNow}. ${myProducts.length >= productLimitNow ? "You reached the limit set for your account." : ""}`.trim();
  if (productLimitNow !== null) {
    const more = document.createElement("button");
    more.type = "button"; more.className = "small-button"; more.textContent = "Ask the owner for more room";
    more.addEventListener("click", () => { if (typeof openSupportChat === "function") openSupportChat(); });
    box.append(" ", more);
  }
}

async function refreshProducts() {
  const snap = await db.collection("products").where("merchantId", "==", me.uid).get();
  myProducts = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  renderProducts();
  showQuota();
}

/* The product photo: a small picture taken with the camera / chosen from the gallery (kept as `photo`), or a link. */
let photo = "";

function showPhoto() {
  $("p-preview").hidden = !photo;
  if (photo) $("p-preview").src = photo;
  $("p-photo-clear").hidden = !photo;
}

async function takePhoto(input) {
  const file = input.files && input.files[0];
  input.value = "";
  if (!file) return;
  try {
    photo = await fileToDataUrl(file);
    showPhoto();
    say("p-message", "Photo ready. Press Save product.");
  } catch (error) {
    say("p-message", error.message, true);
  }
}

$("p-camera").addEventListener("click", () => $("p-file-camera").click());
$("p-gallery").addEventListener("click", () => $("p-file-gallery").click());
$("p-file-camera").addEventListener("change", event => takePhoto(event.target));
$("p-file-gallery").addEventListener("change", event => takePhoto(event.target));
$("p-photo-clear").addEventListener("click", () => { photo = ""; showPhoto(); });

function resetProductForm(keepMessage = false) {
  $("p-form").reset();
  photo = "";
  showPhoto();
  $("p-id").value = "";
  $("p-visible").checked = true;
  $("p-available").checked = true;
  $("p-heading").textContent = shop.kind === "restaurant" ? "Add a dish" : "Add a product";
  $("p-save").textContent = "Save product";
  $("p-cancel").hidden = true;
  if (!keepMessage) say("p-message", "");
}

$("p-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (shop.status !== "approved") return say("p-message", "You can add products after an administrator approves your account.", true);

  const feats = await getFeatures();
  if (feats.merchant.canAddProducts === false) return say("p-message", "Adding products is switched off for now.", true);
  if (feats.merchant.requireLocation && shopPosition.lat === null) return say("p-message", "Set your shop location first (Shop & location tab).", true);

  const name = $("p-name").value.trim();
  const description = $("p-description").value.trim();
  const price = Number($("p-price").value);
  const link = $("p-image").value.trim();
  if (shop.kind === "restaurant" && !(Number($("p-weight").value) > 0)) $("p-weight").value = "0.5";
  const weightKg = Number($("p-weight").value);
  if (!Number.isFinite(Number($("p-weight").value)) || Number($("p-weight").value) <= 0 || Number($("p-weight").value) > 1000) return say("p-message", "Write the weight of the product (more than 0 and up to 1000 kg).", true);
  const dims = ["p-length", "p-width", "p-height"].map((id, i) => Number($(id).value) || (shop.kind === "restaurant" ? [25, 25, 10][i] : 0));   /* a dish: a standard food box when the cook does not give the size */
  if (dims.some(d => !Number.isFinite(d) || d <= 0 || d > 500)) return say("p-message", "Write the length, width and height of the package in cm (up to 500).", true);
  const image = photo || link;
  if (feats.merchant.requireProductPhoto && !image) return say("p-message", "Add a photo of the product.", true);
  if (!name || !description || !Number.isFinite(price) || price < 0) return say("p-message", "Please enter a valid name, description and price.", true);
  if (link && !photo && !safeUrl(link)) return say("p-message", "The image URL must start with http:// or https://.", true);

  const existingId = $("p-id").value;
  const existing = myProducts.find(item => item.id === existingId);
  if (!existingId && productLimitNow !== null && myProducts.length >= productLimitNow) return say("p-message", `You reached the limit of ${productLimitNow} products for your account. Delete one, or ask the owner to raise your limit.`, true);
  const id = existingId || db.collection("products").doc().id;

  $("p-save").disabled = true;
  try {
    await db.collection("products").doc(id).set({
      name,
      price: publicPriceOf(price),               /* what the customer pays: his price + the store fee */
      basePrice: Math.round(price * 100) / 100,  /* what the seller receives */
      category: $("p-category").value.trim(),
      weightKg: Math.round(weightKg * 1000) / 1000,
      lengthCm: Math.round(dims[0] * 10) / 10, widthCm: Math.round(dims[1] * 10) / 10, heightCm: Math.round(dims[2] * 10) / 10,
      description,
      image,
      video: "",
      visible: $("p-visible").checked,
      available: $("p-available").checked,
      prepMinutes: Math.max(0, Math.min(240, Math.round(Number($("p-prep").value) || 0))),
      discountPercent: Math.max(0, Math.min(90, Math.round(Number($("p-discount").value) || 0))),
      createdAt: (existing && existing.createdAt) || new Date().toISOString(),
      merchantId: me.uid,
      merchantName: shop.businessName,
      acceptsBaridi: shop.acceptsBaridi === true,
      acceptsCash: shop.acceptsCash !== false,
      acceptsCredit: shop.acceptsCredit !== false
    });
    await refreshProducts();
    callFn("refreshMyProductCount", {}).catch(() => {});
    resetProductForm(true);
    say("p-message", existingId ? "Product updated." : "Product added.");
  } catch (error) {
    console.error(error);
    say("p-message", authErrorMessage(error), true);
  } finally {
    $("p-save").disabled = false;
  }
});

$("p-list").addEventListener("click", async event => {
  const edit = event.target.closest(".edit-product");
  const del = event.target.closest(".delete-product");
  const avail = event.target.closest(".toggle-avail");
  if (avail) {
    const product = myProducts.find(item => item.id === avail.dataset.id);
    if (!product) return;
    try { await db.collection("products").doc(product.id).update({ available: product.available === false }); await refreshProducts(); }
    catch (error) { console.error(error); say("p-message", authErrorMessage(error), true); }
    return;
  }

  if (edit) {
    const product = myProducts.find(item => item.id === edit.dataset.id);
    if (!product) return;
    $("p-id").value = product.id;
    $("p-name").value = product.name;
    $("p-price").value = product.basePrice != null ? product.basePrice : Math.round(product.price / (1 + STORE_FEE_RATE) * 100) / 100;
    updateFeeLine();
    $("p-category").value = product.category || "";
    $("p-weight").value = product.weightKg > 0 ? product.weightKg : "";
    $("p-length").value = product.lengthCm > 0 ? product.lengthCm : "";
    $("p-width").value = product.widthCm > 0 ? product.widthCm : "";
    $("p-height").value = product.heightCm > 0 ? product.heightCm : "";
    updateSizeLine();
    $("p-description").value = product.description || "";
    photo = /^data:image\//.test(product.image || "") ? product.image : "";
    $("p-image").value = photo ? "" : (product.image || "");
    showPhoto();
    $("p-visible").checked = product.visible !== false;
    $("p-available").checked = product.available !== false;
    $("p-prep").value = Number(product.prepMinutes) > 0 ? product.prepMinutes : "";
    $("p-discount").value = Number(product.discountPercent) > 0 ? product.discountPercent : "";
    $("p-heading").textContent = shop.kind === "restaurant" ? "Edit dish" : "Edit product";
    $("p-save").textContent = "Update product";
    $("p-cancel").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (del) {
    const product = myProducts.find(item => item.id === del.dataset.id);
    if (!product || !window.confirm(`Delete "${product.name}"?`)) return;
    try {
      await db.collection("products").doc(product.id).delete();
      await refreshProducts();
      callFn("refreshMyProductCount", {}).catch(() => {});
    } catch (error) {
      console.error(error);
      say("p-message", authErrorMessage(error), true);
    }
  }
});

$("p-cancel").addEventListener("click", () => resetProductForm());

/* ---------- shop details ---------- */

let shopPosition = { lat: null, lng: null };

function describeLocation() {
  $("f-location").textContent = shopPosition.lat !== null
    ? `Location saved (${shopPosition.lat}, ${shopPosition.lng}).` : "Location not set.";
  $("f-map").innerHTML = locationCardHTML(shopPosition);
}

function fillShopForm() {
  $("f-business").value = shop.businessName || "";
  $("f-name").value = shop.fullName || "";
  $("f-phone").value = shop.phone || "";
  $("f-country").value = shop.country || "";
  $("f-city").value = shop.city || "";
  $("f-address").value = shop.address || "";
  $("f-description").value = shop.description || "";
  $("f-cash").checked = shop.acceptsCash !== false;
  $("f-credit").checked = shop.acceptsCredit !== false;
  $("f-pickup").checked = shop.pickupOk !== false;
  $("f-self").checked = shop.selfDelivery === true;
  $("f-self-fee").value = Number(shop.selfDeliveryFee) > 0 ? Number(shop.selfDeliveryFee) : 0;
  shopPosition = { lat: numOrNull(shop.lat), lng: numOrNull(shop.lng) };
  describeLocation();
}

$("f-locate").addEventListener("click", async () => {
  try {
    shopPosition = await getPosition();
    describeLocation();
    say("f-message", "Press Save to keep the new location.");
  } catch (error) {
    say("f-message", error.message, true);
  }
});

$("shop-form").addEventListener("submit", async event => {
  event.preventDefault();
  const data = {
    businessName: $("f-business").value.trim(),
    fullName: $("f-name").value.trim(),
    phone: $("f-phone").value.trim(),
    country: $("f-country").value.trim(),
    city: $("f-city").value.trim(),
    address: $("f-address").value.trim(),
    description: $("f-description").value.trim(),
    lat: shopPosition.lat,
    lng: shopPosition.lng,
    acceptsCash: $("f-cash").checked,
    acceptsCredit: $("f-credit").checked,
    pickupOk: $("f-pickup").checked,
    selfDelivery: $("f-self").checked,
    selfDeliveryFee: Math.max(0, Math.min(100000, Math.round(Number($("f-self-fee").value) || 0)))
  };
  if (!data.businessName || !data.fullName || !data.phone || !data.country || !data.city || !data.address) {
    return say("f-message", "Please fill in every field marked *.", true);
  }
  try {
    await db.collection("merchants").doc(me.uid).update(data);
    shop = { ...shop, ...data };
    /* Products show the "pay the seller directly" option at checkout only when this is on. */
    try {
      const flags = { acceptsBaridi: data.acceptsBaridi === true, acceptsCash: data.acceptsCash !== false, acceptsCredit: data.acceptsCredit !== false };
      const snap = await db.collection("products").where("merchantId", "==", me.uid).get();
      const batch = db.batch();
      snap.docs.forEach(doc => {
        const d = doc.data(), diff = {};
        if ((d.acceptsBaridi === true) !== flags.acceptsBaridi) diff.acceptsBaridi = flags.acceptsBaridi;
        if ((d.acceptsCash !== false) !== flags.acceptsCash) diff.acceptsCash = flags.acceptsCash;
        if ((d.acceptsCredit !== false) !== flags.acceptsCredit) diff.acceptsCredit = flags.acceptsCredit;
        if (Object.keys(diff).length) batch.update(doc.ref, diff);
      });
      await batch.commit();
      await refreshProducts();
    } catch (error) { console.error("Products not updated:", error); }
    renderBanner();
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
  if (!state.user || !state.merchant) return; /* store.js redirects */

  me = state.user;
  shop = state.merchant;
  try { const feats0 = await getFeatures(); debtPauseOn = feats0.merchant.debtPause === true; moneyHidden = feats0.global.showCollabMoney === false; } catch { /* default: off */ }
  await loadDebtRule();
  await loadFeeRate(shop);
  renderBanner();
  if (window.mkAdCard && $("adcard-panel")) { $("adcard-panel").hidden = false; mkAdCard.mount($("adcard-panel"), me.uid, () => shop); }
  loadProductLimit();
  fillShopForm();
  /* A doctor has no goods: he sees his patients and appointments instead of the seller tools. */
  if (["doctor", "agency", "taxi", "barber", "hotel"].includes(shop.kind)) {
    const texts = {
      doctor: ["DOCTOR DASHBOARD", "See your patients, give them an hour and send prescriptions."],
      agency: ["TRAVEL AGENCY DASHBOARD", "Add your bus trips, follow the numbered seats and sell seats at the counter."],
      taxi: ["TAXI DASHBOARD", "See the ride requests, give a price and a pick-up hour."],
      barber: ["BARBERSHOP DASHBOARD", "See your schedule, take online bookings and add the customers who walk in."],
      hotel: ["HOTEL DASHBOARD", "Add your room types and prices, then follow the bookings night by night."]
    }[shop.kind];
    document.querySelectorAll(".shop-only").forEach(el => { el.hidden = true; });
    document.querySelectorAll(`.provider-guide[data-kind="${shop.kind}"]`).forEach(el => { el.hidden = false; });
    document.querySelector(".eyebrow").textContent = texts[0];
    document.querySelector(".admin-heading p").textContent = texts[1];
    $("doctor-tools").hidden = false;
    window.setupDoctorPanel(me, () => shop);
    if (window.setupLookPanel) window.setupLookPanel(me, () => shop);
    if (window.setupScheduleBoard && shop.kind !== "hotel") window.setupScheduleBoard(me, () => shop, shop.kind);
    if (shop.kind === "hotel" && window.setupRoomsPanel) window.setupRoomsPanel(me, () => shop);
    if (shop.kind === "agency" && window.setupTripsPanel) window.setupTripsPanel(me, () => shop);
    /* A barber with opening hours has everything in the schedule board (bookings, walk-ins, done, cancel, print): the second table of requests would only repeat it. */
    const syncRequests = () => { const p = $("requests-panel"); if (p) p.hidden = shop.kind === "barber" && Boolean(shop.schedule && shop.schedule.slotMinutes > 0 && shop.schedule.days); };
    window.syncRequestsPanel = syncRequests; syncRequests();
    if (shop.kind === "barber" && window.setupStylesPanel) window.setupStylesPanel(me, () => shop);
    else if (window.renderPlansBox) window.renderPlansBox(shop, 0, null);
    try {
      db.collection("merchants").doc(me.uid).onSnapshot(snap => { if (snap.exists) { shop = { ...snap.data(), id: snap.id }; renderBanner(); if (window.syncBoardOpen) window.syncBoardOpen(); if (window.syncRequestsPanel) window.syncRequestsPanel(); } }, () => {});
    } catch { /* optional */ }
    return;
  }
  if (window.setupLookPanel) window.setupLookPanel(me, () => shop);
  $("seller-tools").hidden = false;
  if (shop.kind === "restaurant") setupRestaurant();
  if (window.mkTrusted) {
    mkTrusted.seller($("trusted-box"));
    mkTrusted.approvedIds(me.uid).then(ids => { trustedIds = new Set(ids); });
  }

  /* The shop document (status, debt) updates live, e.g. when the owner records a payment. */
  try {
    db.collection("merchants").doc(me.uid).onSnapshot(snap => {
      if (!snap.exists) return;
      shop = { ...snap.data(), id: snap.id };
      renderBanner();
    }, () => {});
  } catch { /* optional */ }

  /* Orders update live: a new order or a status change appears at once, with a sound and a notice. */
  try {
    await refreshProducts();
    watchOrders("merchantId", me.uid, orders => {
      myOrders = orders;
      renderOrders();
    }, describeOrder, error => {
      console.error(error);
      $("seller-orders").innerHTML = '<p class="empty-state">Could not load your orders.</p>';
    });
  } catch (error) {
    console.error(error);
    $("seller-orders").innerHTML = '<p class="empty-state">Could not load your orders.</p>';
  }
})();

/* What to tell the seller about a new or changed order. */
function describeOrder(order, previous) {
  const paidNow = /^Paid/.test(order.status || "");
  if (previous === undefined) {
    return `New order ${order.number} — accept it now${paidNow ? "" : " (payment pending)"}`;
  }
  const [oldStatus, oldFulfillment] = String(previous).split("|");
  if (paidNow && !/^Paid/.test(oldStatus)) return `Payment confirmed for ${order.number} — accept the order`;
  if (order.fulfillment === "CourierAccepted") return `${order.courierName || "The delivery partner"} accepted ${order.number}`;
  if (order.fulfillment === "Accepted" && oldFulfillment === "CourierRequested") return `Delivery partner declined ${order.number} — choose another`;
  if (order.fulfillment === "Delivered") return `${order.number} was delivered`;
  return "";
}

/* live line under the price box: what the customer will pay once the store fee is added */
function updateSizeLine() {
  const line = $("p-size-line"); if (!line) return;
  const item = { weightKg: Number($("p-weight").value), lengthCm: Number($("p-length").value), widthCm: Number($("p-width").value), heightCm: Number($("p-height").value), quantity: 1 };
  const charge = mkChargeable([item]);
  line.textContent = charge > 0
    ? `Chargeable weight: ${charge} kg (the larger of the real weight ${item.weightKg > 0 ? item.weightKg : 0} kg and the size ${Math.round(mkDim(item.lengthCm) * mkDim(item.widthCm) * mkDim(item.heightCm) / 5000 * 1000) / 1000} kg). The delivery price is calculated from it.`
    : "Give the size of the package. The delivery price is calculated from the larger of the real weight and the size (length × width × height ÷ 5000).";
}
['p-weight', 'p-length', 'p-width', 'p-height'].forEach(id => document.addEventListener("input", event => { if (event.target.id === id) updateSizeLine(); }));

function updateFeeLine() {
  const line = $("p-fee-line");
  if (!line) return;
  const value = Number($("p-price").value);
  if (!(value > 0)) { line.textContent = "Type the price you want to receive. The store fee is added for you."; return; }
  const pub = publicPriceOf(value);
  line.textContent = `Customer pays ${formatPrice(pub)} (your price ${formatPrice(value)} + store fee ${formatPrice(pub - value)}).`;
}
$("p-price").addEventListener("input", updateFeeLine);


/* ---------- restaurant: open / closed switch, menu wording ---------- */
function setupRestaurant() {
  document.querySelectorAll(".restaurant-only").forEach(el => { el.hidden = false; });
  document.querySelectorAll(".dims-row, #p-size-line").forEach(el => { el.hidden = true; });
  $("p-heading").textContent = "Add a dish";
  $("p-save").textContent = "Save dish";
  const eyebrow = document.querySelector(".eyebrow"); if (eyebrow) eyebrow.textContent = "RESTAURANT DASHBOARD";
  const open = $("r-open");
  const draw = () => {
    open.checked = shop.open !== false;
    $("r-open-text").textContent = open.checked ? "Open: taking orders" : "Closed: customers cannot order";
    const n = myProducts.length, off = myProducts.filter(p => p.available === false).length;
    $("r-menu-line").textContent = `${n} dish${n === 1 ? "" : "es"} on your menu${off ? ` · ${off} sold out` : ""}.`;
  };
  open.addEventListener("change", async () => {
    try {
      await db.collection("merchants").doc(me.uid).update({ open: open.checked });
      shop.open = open.checked;
      showToast(open.checked ? "Your restaurant is open" : "Your restaurant is closed");
    } catch (error) { console.error(error); open.checked = !open.checked; showToast(authErrorMessage(error), "error"); }
    draw();
  });
  window.drawRestaurant = draw;
  draw();
}
const _renderProducts = renderProducts;
renderProducts = function () { _renderProducts(); if (window.drawRestaurant) window.drawRestaurant(); };
