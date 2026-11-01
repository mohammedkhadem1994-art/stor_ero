"use strict";

/* Admin dashboard. Requires store.js.
   Real protection: Firestore rules only let accounts listed in /admins/{uid} change products. */

let products = [];

const form = document.getElementById("product-form");
const idField = document.getElementById("product-id");
const nameField = document.getElementById("product-name");
const priceField = document.getElementById("product-price");
const categoryField = document.getElementById("product-category");
const descriptionField = document.getElementById("product-description");
const imageField = document.getElementById("product-image");
const videoField = document.getElementById("product-video");
const visibleField = document.getElementById("product-visible");
const productList = document.getElementById("admin-product-list");
const message = document.getElementById("form-message");
const formHeading = document.getElementById("form-heading");
const saveButton = document.getElementById("save-button");
const cancelButton = document.getElementById("cancel-edit");
const editPanel = document.getElementById("edit-panel");

function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function renderStats() {
  document.getElementById("total-products").textContent = products.length;
  document.getElementById("visible-products").textContent =
    products.filter(product => product.visible !== false).length;
}

function renderProducts() {
  renderStats();

  if (!products.length) {
    productList.innerHTML = '<p class="empty-state">No products yet. Sellers add their products from their own dashboard.</p>';
    return;
  }

  productList.innerHTML = products.map(product => {
    const imageUrl = imageSrc(product.image);
    const hidden = product.visible === false;

    return `
    <article class="admin-product-item">
      <div class="admin-product-thumb">
        ${imageUrl ? `<img src="${escapeHTML(imageUrl)}" alt="" loading="lazy">` : "<span>P</span>"}
      </div>
      <div class="admin-product-details">
        <strong>${escapeHTML(product.name)}</strong>
        <span>${escapeHTML(product.category || "Uncategorized")} · ${formatPrice(product.price)}${product.merchantName ? ` · by ${escapeHTML(product.merchantName)}` : ""}</span>
        <span class="product-status ${hidden ? "status-hidden" : ""}">${hidden ? "Hidden from store" : "Visible in store"}</span>
        ${product.video ? '<span class="media-tag">Video added</span>' : ""}
      </div>
      <div class="admin-product-actions">
        <button class="small-button edit-product" type="button" data-id="${escapeHTML(product.id)}">Edit</button>
        <button class="small-button delete-button delete-product" type="button" data-id="${escapeHTML(product.id)}">Delete</button>
      </div>
    </article>`;
  }).join("");
}

let currentOrders = [];
let showArchive = false;

function renderOrders(allOrders) {
  currentOrders = allOrders;
  const orders = allOrders.filter(order => Boolean(order.archived) === showArchive);
  const tabs = document.getElementById("orders-tabs");
  if (tabs) {
    tabs.innerHTML = `<button type="button" class="role-tab ${showArchive ? "" : "active"}" data-arch="0">Active (${allOrders.filter(o => !o.archived).length})</button>
      <button type="button" class="role-tab ${showArchive ? "active" : ""}" data-arch="1">Archive (${allOrders.filter(o => o.archived).length})</button>`;
  }
  const orders_ = orders;
  const revenue = allOrders
    .filter(order => /^Paid/.test(order.status || ""))
    .reduce((sum, order) => sum + Number(order.total || 0), 0);

  document.getElementById("total-orders").textContent = allOrders.length;
  document.getElementById("total-revenue").textContent = formatPrice(revenue);

  const list = document.getElementById("admin-orders-list");
  const clearBox = document.getElementById("archive-clear");
  if (clearBox) {
    clearBox.innerHTML = showArchive && orders.length
      ? `<p class="admin-notice">The archive holds <strong>${orders.length}</strong> order(s). <button type="button" class="small-button delete-button" id="delete-archive">Delete the whole archive</button> <small class="muted">Permanent. Debt statements and the money ledger are kept.</small></p>` : "";
  }
  if (!orders.length) {
    list.innerHTML = `<p class="empty-state">${showArchive ? "The archive is empty." : "No orders yet."}</p>`;
    return;
  }

  const fullRow = order => `
            <tr>
              <td><strong>${escapeHTML(order.number)}</strong></td>
              <td>${escapeHTML(formatDate(order.createdAt))}</td>
              <td>${escapeHTML((order.customer && order.customer.name) || order.email)}<br>${waButton((order.customer || {}).phone, (order.customer || {}).country, "Customer", `Hello, about your order ${order.number}`)}</td>
              <td>${orderItemsHTML(order.items)}</td>
              <td>${escapeHTML(order.status || "")}<small class="muted"> ${escapeHTML(order.paymentLabel || "")}</small></td>
              <td>${sellerCell(order)}</td>
              <td class="num">${formatPrice(order.total)}</td>
              <td>
                <a class="small-button" href="invoice.html?id=${encodeURIComponent(order.id)}">Invoice</a>
                ${order.status === "Awaiting payment" ? `<button type="button" class="small-button mark-paid" data-id="${escapeHTML(order.id)}">Mark paid</button>` : ""}
                <button type="button" class="small-button archive-order" data-id="${escapeHTML(order.id)}" data-to="${order.archived ? "0" : "1"}">${order.archived ? "Restore" : "Archive"}</button>
                ${order.merchantId && order.fulfillment === "Delivered" && !order.payoutSettled ? `<button type="button" class="small-button settle-payout" data-id="${escapeHTML(order.id)}">Seller paid out</button>` : ""}
              </td>
            </tr>`;

  /* Older orders of the same seller: plain text only, no buttons. */
  const oldRow = order => `
            <tr class="old-order">
              <td>${escapeHTML(order.number)}</td>
              <td>${escapeHTML(formatDate(order.createdAt))}</td>
              <td>${escapeHTML((order.customer && order.customer.name) || order.email)}</td>
              <td>${orderItemsHTML(order.items)}</td>
              <td>${escapeHTML(order.status || "")}</td>
              <td>${escapeHTML(FULFILLMENT_LABELS[order.fulfillment] || order.fulfillment || "")} · fee ${formatPrice(order.commission || 0)}${order.payoutSettled ? " · paid out" : ""}${order.delivery ? ` · ${escapeHTML(order.delivery.label)}` : ""}</td>
              <td class="num">${formatPrice(order.total)}</td>
              <td><a class="small-button" href="invoice.html?id=${encodeURIComponent(order.id)}">Invoice</a></td>
            </tr>`;

  /* One block per seller (newest order first, as a full row); the store's own orders stay as they are. */
  const sorted = [...orders].sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
  const groups = [];
  const byMerchant = new Map();
  for (const order of sorted.slice(0, 200)) {
    if (!order.merchantId) { groups.push({ single: order }); continue; }
    if (!byMerchant.has(order.merchantId)) { const g = { merchantId: order.merchantId, orders: [] }; byMerchant.set(order.merchantId, g); groups.push(g); }
    byMerchant.get(order.merchantId).orders.push(order);
  }

  const thead = `<thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Items</th><th>Payment</th><th>Seller / delivery</th><th class="num">Total</th><th></th></tr></thead>`;
  const tableOf = rows => `<div class="table-wrap"><table class="orders-table">${thead}<tbody>${rows}</tbody></table></div>`;
  const sum = (list, key) => list.reduce((s, o) => s + Number(o[key] || 0), 0);

  /* One block per seller: header bar (name, debt, buttons) / the orders / and, apart, the account summary below them. */
  const sellerBlock = g => {
    const seller = (typeof sellers !== "undefined" ? sellers : []).find(s => s.id === g.merchantId);
    const owed = seller ? Number(seller.debt || 0) : null;
    const [latest, ...older] = g.orders;
    const unpaid = g.orders.filter(o => o.status === "Awaiting payment");
    const toPay = g.orders.filter(o => o.fulfillment === "Delivered" && !o.payoutSettled);
    const id = escapeHTML(g.merchantId);
    return `
      <section class="seller-block">
        <div class="seller-head">
          <div class="head-line">
            <div class="head-name"><strong>${escapeHTML(latest.merchantName || "")}</strong> <span class="count-pill">${g.orders.length} order(s)</span></div>
            <div class="head-debt">Debt to the site <strong>${owed === null ? "…" : formatPrice(owed)}</strong></div>
          </div>
        </div>
        ${tableOf(g.orders.map(oldRow).join(""))}
        <div class="seller-sum">
          <h4 class="sum-title">Account summary</h4>
          <table class="sum-table">
            <thead><tr><th></th><th>Orders</th><th>Site fees</th></tr></thead>
            <tbody>
              <tr><td>Previous (${older.length} order(s))</td><td>${older.length}</td><td>${formatPrice(sum(older, "commission"))}</td></tr>
              <tr><td>New (${escapeHTML(latest.number)})</td><td>1</td><td>${formatPrice(latest.commission || 0)}</td></tr>
              <tr class="sum-total"><td>Total:</td><td>${g.orders.length}</td><td><strong>${formatPrice(sum(g.orders, "commission"))}</strong></td></tr>
            </tbody>
          </table>
          <div class="sum-actions">
              <button type="button" class="small-button mark-paid-all" data-merchant="${id}" ${unpaid.length ? "" : "disabled"}>Paid (${unpaid.length})</button>
              <button type="button" class="small-button settle-all" data-merchant="${id}" ${toPay.length ? "" : "disabled"}>Seller paid out (${toPay.length})</button>
              <button type="button" class="small-button archive-all" data-merchant="${id}" data-to="${showArchive ? "0" : "1"}">${showArchive ? "Restore" : "Archive"}</button>
              <button type="button" class="small-button delete-button delete-all" data-merchant="${id}">Delete</button>
              <button type="button" class="small-button full-invoice" data-merchant="${id}">Full invoice</button>
          </div>
        </div>
      </section>`;
  };

  /* The store's own orders (no seller) form a table of their own. */
  let html = "";
  let singles = [];
  const flush = () => { if (singles.length) { html += `<section class="seller-block"><div class="seller-head"><div class="head-line"><div class="head-name"><strong>Store products</strong> <span class="count-pill">${singles.length} order(s)</span></div></div></div>${tableOf(singles.map(fullRow).join(""))}</section>`; singles = []; } };
  for (const g of groups) { if (g.single) singles.push(g.single); else { flush(); html += sellerBlock(g); } }
  flush();
  list.innerHTML = html;
  hydrateThumbs(list);
}

function resetForm(keepMessage = false) {
  form.reset();
  idField.value = "";
  visibleField.checked = true;
  formHeading.textContent = "Edit product";
  saveButton.textContent = "Update product";
  cancelButton.hidden = true;
  editPanel.hidden = true;   /* the owner no longer adds products: the form opens only to edit an existing one */
  if (!keepMessage) showMessage("");
}

async function refreshProducts() {
  products = await loadAllProducts();
  renderProducts();
}

form.addEventListener("submit", async event => {
  event.preventDefault();

  const name = nameField.value.trim();
  const description = descriptionField.value.trim();
  const price = Number(priceField.value);
  const image = imageField.value.trim();
  const video = videoField.value.trim();

  if (!name || !description || !Number.isFinite(price) || price < 0) {
    return showMessage("Please enter a valid name, description and price.", true);
  }
  if (image && !imageSrc(image)) return showMessage("The image URL must start with http:// or https://.", true);
  if (video && !safeUrl(video)) return showMessage("The video URL must start with http:// or https://.", true);

  const existingId = idField.value;
  if (!existingId) return showMessage("The owner does not add products. Choose a product to edit.", true);
  const existing = products.find(item => item.id === existingId);
  const id = existingId || db.collection("products").doc().id;

  const data = {
    name,
    price: Math.round(price * 100) / 100,
    category: categoryField.value.trim(),
    description,
    image,
    video,
    visible: visibleField.checked,
    /* a seller's product keeps his own price: when the owner corrects the price, the seller's part is recomputed */
    ...(existing && existing.merchantId && existing.basePrice != null ? { basePrice: Math.round(price * (Number(existing.basePrice) / Number(existing.price || 1) || 1 / (1 + STORE_FEE_RATE)) * 100) / 100 } : {}),
    createdAt: (existing && existing.createdAt) || new Date().toISOString(),
    /* keep the owner of a seller's product when an admin edits it */
    ...(existing && existing.merchantId ? { merchantId: existing.merchantId, merchantName: existing.merchantName || "" } : {})
  };

  saveButton.disabled = true;
  try {
    await db.collection("products").doc(id).set(data);
    await refreshProducts();
    resetForm(true);
    showMessage(existingId ? "Product updated successfully." : "Product added successfully.");
  } catch (error) {
    console.error(error);
    showMessage(authErrorMessage(error), true);
  } finally {
    saveButton.disabled = false;
  }
});

productList.addEventListener("click", async event => {
  const editButton = event.target.closest(".edit-product");
  const deleteButton = event.target.closest(".delete-product");

  if (editButton) {
    const product = products.find(item => item.id === editButton.dataset.id);
    if (!product) return;

    idField.value = product.id;
    nameField.value = product.name;
    priceField.value = product.price;
    categoryField.value = product.category || "";
    descriptionField.value = product.description || "";
    imageField.value = product.image || "";
    videoField.value = product.video || "";
    visibleField.checked = product.visible !== false;

    formHeading.textContent = "Edit product";
    saveButton.textContent = "Update product";
    cancelButton.hidden = false;
    editPanel.hidden = false;
    showMessage("");
    if (editPanel.scrollIntoView) editPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (deleteButton) {
    const product = products.find(item => item.id === deleteButton.dataset.id);
    if (!product) return;
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;

    try {
      await db.collection("products").doc(product.id).delete();
      await refreshProducts();
      showMessage("Product deleted.");
    } catch (error) {
      console.error(error);
      showMessage(authErrorMessage(error), true);
    }
  }
});


document.getElementById("admin-orders-list").addEventListener("click", async event => {
  const button = event.target.closest(".mark-paid");
  if (!button) return;
  if (!window.confirm("Confirm that the money for this order has arrived?")) return;

  button.disabled = true;
  try {
    /* the server marks it paid AND notifies the seller and the buyer */
    await callFn("markOrderPaid", { orderId: button.dataset.id });
    showToast("Payment confirmed. The customer and the seller were notified.");
  } catch (error) {
    console.error(error);
    button.disabled = false;
    showToast(authErrorMessage(error), "error");
  }
});

/* Archive / restore an order, and switch between the Active and Archive lists. */
document.getElementById("admin-orders-list").addEventListener("click", async event => {
  const button = event.target.closest(".archive-order");
  if (!button) return;
  button.disabled = true;
  try {
    await db.collection("orders").doc(button.dataset.id).update({ archived: button.dataset.to === "1", archivedAt: new Date().toISOString() });
  } catch (error) {
    console.error(error);
    button.disabled = false;
    showToast(authErrorMessage(error), "error");
  }
});

document.addEventListener("click", event => {
  const tab = event.target.closest("#orders-tabs [data-arch]");
  if (!tab) return;
  showArchive = tab.dataset.arch === "1";
  renderOrders(currentOrders);
});


function sellerCell(order) {
  if (!order.merchantId) return '<small class="muted">Store product</small>';
  const parts = [`<strong>${escapeHTML(order.merchantName || "")}</strong>`,
    `<small class="muted">${escapeHTML(FULFILLMENT_LABELS[order.fulfillment] || order.fulfillment || "")}</small>`];
  if (order.delivery) parts.push(`<small class="muted">${escapeHTML(speedText(order))} · delivery ${formatPrice(order.deliveryFee)}</small>`);
  if (order.courierName) parts.push(`<small class="muted">Courier: ${escapeHTML(order.courierName)}</small>`);
  parts.push(`<small class="muted">Fee ${formatPrice(order.commission || 0)}${order.payoutSettled ? " · seller paid out" : ""}</small>`);
  if (order.refundNeeded) parts.push('<small class="error">Refund the customer</small>');
  return parts.join("<br>");
}

/* ---------- sellers and delivery partners ---------- */

let partners = { merchants: [], couriers: [] };
let bookingStats = {};   /* providerId -> { total, patients, pending, accepted, done } */

function bookingCell(doc) {
  const b = bookingStats[doc.id] || { total: 0, patients: 0, pending: 0, accepted: 0, done: 0 };
  const debt = Number(doc.debt || 0);
  return `<td class="booking-cell"><strong>${b.total}</strong> bookings · ${b.patients} people<br><small class="muted">${b.pending} waiting · ${b.accepted} accepted · ${b.done} done</small><br>
    <small class="${debt > 0 ? "error" : "muted"}">Owes the site: ${formatPrice(debt)}</small></td>`;
}

function partnerRow(kind, doc, withBookings) {
  const place = [doc.city, doc.country].filter(Boolean).join(", ");
  const extra = kind === "merchants" ? doc.businessName : doc.vehicle;
  const buttons = {
    pending: [["approved", "Approve"], ["rejected", "Reject"]],
    approved: [["suspended", "Suspend"]],
    rejected: [["approved", "Approve"]],
    suspended: [["approved", "Reinstate"]]
  }[doc.status] || [];

  return `
    <tr>
      <td><strong>${escapeHTML(doc.fullName || "")}</strong><br><small class="muted">${escapeHTML(extra || "")}</small></td>
      <td>${escapeHTML(doc.email || "")}<br><small class="muted">${escapeHTML(doc.phone || "")}</small><br>${waButton(doc.phone, doc.country, "WhatsApp", `Hello ${doc.fullName || ""}, Plazavo`)}
        <br><small class="muted">${doc.invitedBy ? `Supervisor: ${escapeHTML((window.supervisorEmails || {})[doc.invitedBy] || "a supervisor")}${(window.supervisorDeanName || {})[doc.invitedBy] ? ` · Dean: ${escapeHTML(window.supervisorDeanName[doc.invitedBy])}` : ""}` : "No supervisor (outside the groups)"}</small></td>
      <td>${escapeHTML(place)}</td>
      <td><span class="status-pill">${escapeHTML(doc.status)}</span></td>
      ${withBookings ? bookingCell(doc) : ""}
      <td><button type="button" class="small-button view-id" data-id="${escapeHTML(doc.id)}" data-name="${escapeHTML(doc.fullName || "")}">View ID</button> ${buttons.map(([status, label]) =>
        `<button type="button" class="small-button partner-status" data-kind="${kind}" data-id="${escapeHTML(doc.id)}" data-status="${status}">${label}</button>`).join(" ")} <button type="button" class="small-button partner-remove" data-kind="${kind}" data-id="${escapeHTML(doc.id)}" data-name="${escapeHTML(doc.fullName || doc.email || "")}">Remove collaborator</button></td>
    </tr>`;
}

let partnerGroup = "";
const inGroup = doc => !partnerGroup || (partnerGroup === "none" ? !doc.invitedBy : partnerGroup.startsWith("s:") ? doc.invitedBy === partnerGroup.slice(2) : (window.supervisorDeanOf || {})[doc.invitedBy] === partnerGroup.slice(2));
document.getElementById("partner-group").addEventListener("change", event => { partnerGroup = event.target.value; renderPartners(); });

function renderPartners() {
  const table = (title, kind, list, css, withBookings) => `
    <section class="staff-group ${css}${list.length ? "" : " is-empty"}">
    <h3 class="job-heading">${title} (${list.length})</h3>
    ${list.length ? `<div class="table-wrap"><table class="orders-table">
      <thead><tr><th>Name</th><th>Contact</th><th>Where</th><th>Status</th>${withBookings ? "<th>Bookings</th>" : ""}<th></th></tr></thead>
      <tbody>${list.map(doc => partnerRow(kind, doc, withBookings)).join("")}</tbody></table></div>`
      : ""}
    </section>`;

  const order = { pending: 0, approved: 1, suspended: 2, rejected: 3 };
  const sorted = list => [...list].sort((a, b) => (order[a.status] - order[b.status]) || String(b.createdAt).localeCompare(String(a.createdAt)));
  const ofKind = kind => partners.merchants.filter(doc => (doc.kind || "shop") === kind && inGroup(doc));
  const shops = ofKind("shop"), restaurants = ofKind("restaurant"), pharmacies = ofKind("pharmacy"), doctors = ofKind("doctor"), agencies = ofKind("agency"), taxis = ofKind("taxi"), barbers = ofKind("barber"), hotels = ofKind("hotel");
  document.getElementById("admin-partners").innerHTML =
    table("Sellers", "merchants", sorted(shops), "staff-sellers")
    + table("Restaurants", "merchants", sorted(restaurants), "staff-restaurants")
    + table("Pharmacies", "merchants", sorted(pharmacies), "staff-pharmacies")
    + table("Doctors", "merchants", sorted(doctors), "staff-doctors", true)
    + table("Travel agencies", "merchants", sorted(agencies), "staff-agencies", true)
    + table("Taxi drivers", "merchants", sorted(taxis), "staff-taxis", true)
    + table("Barbers", "merchants", sorted(barbers), "staff-barbers", true)
    + table("Hotels", "merchants", sorted(hotels), "staff-hotels", true)
    + table("Delivery partners", "couriers", sorted(partners.couriers.filter(inGroup)), "staff-couriers");
}

async function loadPartners() {
  /* Bookings: only COUNTS reach the owner (no patient names, no prices, no income of the provider): the server counts them. */
  const [m, c, ap] = await Promise.all([db.collection("merchants").get(), db.collection("couriers").get(),
    callFn("bookingCounts", {}).catch(() => ({ byProvider: {} }))]);
  bookingStats = ap.byProvider || {};
  partners = {
    merchants: m.docs.map(doc => ({ ...doc.data(), id: doc.id })),
    couriers: c.docs.map(doc => ({ ...doc.data(), id: doc.id }))
  };
  renderPartners();
}

/* A window with a person's phone, ID number and ID-card photo (only the owner can read them). */
async function showKycModal(uid, name) {
  const kyc = await getKyc(uid);
  const modal = document.createElement("div");
  modal.className = "join-modal";
  modal.innerHTML = `<div class="join-box kyc-view"><header><strong>${escapeHTML(name || "")}: identity</strong><button type="button" class="small-button" id="kyc-view-close">Close</button></header>
    <div class="kyc-view-body">${kyc ? `<p>Phone: <strong>${escapeHTML(kyc.phone || "")}</strong><br>ID number: <strong>${escapeHTML(kyc.idNumber || "")}</strong></p>${imageSrc(kyc.idPhoto) ? `<img class="kyc-photo" src="${escapeHTML(imageSrc(kyc.idPhoto))}" alt="ID card">` : ""}` : "<p>No identity details were provided.</p>"}</div></div>`;
  document.body.appendChild(modal);
  modal.querySelector("#kyc-view-close").addEventListener("click", () => modal.remove());
}

document.getElementById("admin-partners").addEventListener("click", async event => {
  const idButton = event.target.closest(".view-id");
  if (idButton) return showKycModal(idButton.dataset.id, idButton.dataset.name);
  const rm = event.target.closest(".partner-remove");
  if (rm) {
    if (!window.confirm(`Remove ${rm.dataset.name} as a collaborator? The account becomes a normal customer account (login and credit stay; his products are hidden).`)) return;
    rm.disabled = true;
    try { await callFn("removePartner", { kind: rm.dataset.kind, id: rm.dataset.id }); showToast("The account is now a normal customer account.", "success"); await loadPartners(); await refreshProducts(); }
    catch (error) { console.error(error); rm.disabled = false; showToast(authErrorMessage(error), "error"); }
    return;
  }
  const button = event.target.closest(".partner-status");
  if (!button) return;
  const { kind, id, status } = button.dataset;
  button.disabled = true;
  try {
    await db.collection(kind).doc(id).update({ status, reviewedAt: new Date().toISOString() });
    /* tell the partner the answer (a failure here must not undo the decision) */
    try { await callFn("partnerStatusPush", { kind, id }); } catch (error) { console.error(error); }

    /* A suspended or rejected seller disappears from the public store. */
    if (kind === "merchants" && status !== "approved") {
      const mine = await db.collection("products").where("merchantId", "==", id).get();
      await Promise.all(mine.docs.filter(doc => doc.data().visible === true).map(doc => doc.ref.update({ visible: false })));
      await refreshProducts();
    }
    await loadPartners();
  } catch (error) {
    console.error(error);
    button.disabled = false;
    showToast(authErrorMessage(error), "error");
  }
});

document.getElementById("admin-orders-list").addEventListener("click", async event => {
  const button = event.target.closest(".settle-payout");
  if (!button) return;
  if (!window.confirm("Confirm that you paid this seller their share?")) return;
  button.disabled = true;
  try {
    await db.collection("orders").doc(button.dataset.id).update({ payoutSettled: true, payoutAt: new Date().toISOString() });
    showToast("Marked as paid out.");
  } catch (error) {
    console.error(error);
    button.disabled = false;
    showToast(authErrorMessage(error), "error");
  }
});

/* Bulk actions for one seller's orders (one line of buttons per seller). */
const ordersOf = merchantId => currentOrders.filter(o => o.merchantId === merchantId && Boolean(o.archived) === showArchive);

function statementHTML(merchantId) {
  const list = ordersOf(merchantId).sort((x, y) => String(x.createdAt).localeCompare(String(y.createdAt)));
  const seller = (typeof sellers !== "undefined" ? sellers : []).find(s => s.id === merchantId) || {};
  const total = list.reduce((s, o) => s + Number(o.total || 0), 0);
  const fees = list.reduce((s, o) => s + Number(o.commission || 0), 0);
  return `<h2>${escapeHTML(seller.businessName || (list[0] || {}).merchantName || "")}: full invoice</h2>
    <table class="orders-table"><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Items</th><th>Status</th><th class="num">Total</th><th class="num">Fee</th></tr></thead><tbody>
    ${list.map(o => `<tr><td>${escapeHTML(o.number)}</td><td>${escapeHTML(formatDate(o.createdAt))}</td><td>${escapeHTML((o.customer || {}).name || o.email || "")}</td>
      <td>${(o.items || []).map(i => `${escapeHTML(i.name)} × ${Number(i.quantity)}`).join(", ")}</td><td>${escapeHTML(o.status || "")}</td>
      <td class="num">${formatPrice(o.total)}</td><td class="num">${formatPrice(o.commission || 0)}</td></tr>`).join("")}
    </tbody><tfoot><tr><th colspan="6">Site fees (what the seller owes the site)</th><th class="num">${formatPrice(fees)}</th></tr></tfoot></table>
    <p>Debt to the site: <strong>${formatPrice(seller.debt || 0)}</strong></p>`;
}

document.getElementById("admin-orders-list").addEventListener("click", async event => {
  const button = event.target.closest(".mark-paid-all, .settle-all, .archive-all, .delete-all, .full-invoice");
  if (!button) return;
  const merchantId = button.dataset.merchant;
  const mine = ordersOf(merchantId);

  if (button.classList.contains("full-invoice")) {
    const modal = document.createElement("div");
    modal.className = "join-modal statement-modal";
    modal.innerHTML = `<div class="join-box kyc-view"><header><strong>Full invoice</strong><span><button type="button" class="small-button" id="st-print">Print</button> <button type="button" class="small-button" id="st-close">Close</button></span></header><div class="kyc-view-body" id="st-body">${statementHTML(merchantId)}</div></div>`;
    document.body.appendChild(modal);
    modal.querySelector("#st-close").addEventListener("click", () => modal.remove());
    modal.querySelector("#st-print").addEventListener("click", () => window.print());
    return;
  }

  let targets, question, work;
  if (button.classList.contains("mark-paid-all")) {
    targets = mine.filter(o => o.status === "Awaiting payment");
    question = `Confirm that the money for ${targets.length} orders has arrived?`;
    work = o => callFn("markOrderPaid", { orderId: o.id });
  } else if (button.classList.contains("settle-all")) {
    targets = mine.filter(o => o.fulfillment === "Delivered" && !o.payoutSettled);
    question = `Confirm that you paid this seller for ${targets.length} orders?`;
    work = o => db.collection("orders").doc(o.id).update({ payoutSettled: true, payoutAt: new Date().toISOString() });
  } else if (button.classList.contains("archive-all")) {
    const to = button.dataset.to === "1";
    targets = mine;
    question = `${to ? "Archive" : "Restore"} ${targets.length} orders?`;
    work = o => db.collection("orders").doc(o.id).update({ archived: to, archivedAt: new Date().toISOString() });
  } else {
    targets = mine;
    question = `Permanently delete ${targets.length} orders of this seller? This cannot be undone. The debt statements and ledger are kept.`;
    work = o => db.collection("orders").doc(o.id).delete();
  }
  if (!targets.length || !window.confirm(question)) return;
  button.disabled = true;
  try {
    for (const order of targets) await work(order);
    showToast("Done.");
  } catch (error) {
    console.error(error);
    button.disabled = false;
    showToast(authErrorMessage(error), "error");
  }
});

cancelButton.addEventListener("click", () => resetForm());
document.getElementById("admin-logout").addEventListener("click", event => {
  event.preventDefault();
  mkLogout();
});

(async () => {
  if (!initBackend()) return;

  const state = await getAuthState();
  if (!state.user || !state.isAdmin) return; /* store.js redirects to sign in */

  try {
    await refreshProducts();
  } catch (error) {
    console.error(error);
    showMessage(authErrorMessage(error), true);
  }

  try {
    await loadPartners();
  } catch (error) {
    console.error(error);
    document.getElementById("admin-partners").innerHTML = '<p class="empty-state">Could not load partners.</p>';
  }

  /* Orders update live: new orders appear at once, with a sound and a notice. */
  try {
    watchOrders(null, null, renderOrders,
      (order, previous) => (previous === undefined ? `New order ${order.number} · ${formatPrice(order.total)}` : ""),
      error => {
        console.error(error);
        document.getElementById("admin-orders-list").innerHTML = '<p class="empty-state">Could not load orders.</p>';
      });
  } catch (error) {
    console.error(error);
    document.getElementById("admin-orders-list").innerHTML = '<p class="empty-state">Could not load orders.</p>';
  }
})();

document.addEventListener("click", async event => {
  const button = event.target.closest("#delete-archive");
  if (!button) return;
  const targets = currentOrders.filter(order => order.archived === true);
  if (!window.confirm(`Permanently delete ${targets.length} archived order(s)? This cannot be undone.`)) return;
  button.disabled = true;
  try {
    for (const order of targets) await db.collection("orders").doc(order.id).delete();
    showToast("Archive deleted.");
  } catch (error) {
    console.error(error);
    button.disabled = false;
    showToast(authErrorMessage(error), "error");
  }
});
