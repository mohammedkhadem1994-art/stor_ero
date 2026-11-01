"use strict";

/* Invoice rendering. Used by checkout.html (right after the order)
   and by invoice.html (reprint from the account page). Requires store.js. */

function renderInvoice(order, target) {
  const biz = BUSINESS;
  const customer = order.customer || {};

  const rows = order.items.map(item => `
    <tr>
      <td>${escapeHTML(item.name)}${item.category ? `<small>${escapeHTML(item.category)}</small>` : ""}</td>
      <td class="num">${Number(item.quantity)}</td>
      <td class="num">${formatPrice(item.price)}</td>
      <td class="num">${formatPrice(Number(item.price) * Number(item.quantity))}</td>
    </tr>`).join("");

  const sellerLines = [
    biz.address ? `<div>${multiline(biz.address)}</div>` : "",
    biz.email ? `<div>${escapeHTML(biz.email)}</div>` : "",
    biz.website ? `<div>${escapeHTML(biz.website)}</div>` : "",
    biz.taxId ? `<div>Tax ID: ${escapeHTML(biz.taxId)}</div>` : ""
  ].join("");

  const buyerLines = [
    customer.company ? `<div>${escapeHTML(customer.company)}</div>` : "",
    customer.address ? `<div>${multiline(customer.address)}</div>` : "",
    (customer.city || customer.country)
      ? `<div>${escapeHTML([customer.city, customer.country].filter(Boolean).join(", "))}</div>` : "",
    customer.email ? `<div>${escapeHTML(customer.email)}</div>` : "",
    customer.phone ? `<div>${escapeHTML(customer.phone)}</div>` : "",
    customer.taxId ? `<div>Tax ID: ${escapeHTML(customer.taxId)}</div>` : ""
  ].join("");

  const taxRow = order.delivery
    ? `<div><span>Goods</span><span>${formatPrice(order.itemsTotal)}</span></div>
       <div><span>Delivery · ${escapeHTML(speedText(order))}</span><span>${formatPrice(order.deliveryFee)}</span></div>`
    : order.tax > 0
    ? `<div><span>Subtotal (excl. VAT)</span><span>${formatPrice(order.subtotal)}</span></div>
       <div><span>VAT (${(order.taxRate * 100).toFixed(0)}%)</span><span>${formatPrice(order.tax)}</span></div>`
    : "";

  const pending = /^Awaiting payment/.test(order.status || "");
  const paymentText = order.demo ? "Demo (no payment taken)"
    : pending ? `Awaiting payment${order.paymentLabel ? " — " + order.paymentLabel : ""}`
    : `Paid${order.paymentLabel ? " — " + order.paymentLabel : ""}`;
  const demoNote = order.demo
    ? `<p class="inv-demo">DEMO ORDER — no payment was taken. This document is not a valid tax invoice.</p>`
    : "";

  target.innerHTML = `
    <article class="invoice-sheet">
      <header class="inv-head">
        <div>
          <div class="inv-brand"><span class="brand-mark">P</span><strong>${escapeHTML(biz.name)}</strong></div>
          <div class="inv-seller">${biz.tagline ? `<div>${escapeHTML(biz.tagline)}</div>` : ""}${sellerLines}</div>
        </div>
        <div class="inv-title">
          <h2>INVOICE</h2>
          <div class="inv-meta">
            <div><span>Invoice no.</span><strong>${escapeHTML(order.number)}</strong></div>
            <div><span>Date</span><strong>${escapeHTML(formatDate(order.createdAt, true))}</strong></div>
            <div><span>Status</span><strong>${escapeHTML(order.status || "Paid")}</strong></div>
          </div>
        </div>
      </header>

      <section class="inv-parties">
        <div>
          <h3>Billed to</h3>
          <div><strong>${escapeHTML(customer.name || order.email)}</strong></div>
          ${buyerLines}
        </div>
        <div>
          <h3>Order reference</h3>
          <div><strong>${escapeHTML(order.id)}</strong></div>
          <div>Currency: ${escapeHTML(order.currency || "EUR")}</div>
          <div>Payment: ${escapeHTML(paymentText)}</div>
          ${order.paypalOrderId ? `<div>PayPal ref: ${escapeHTML(order.paypalOrderId)}</div>` : ""}
        </div>
      </section>

      <table class="inv-table">
        <thead>
          <tr><th>Item</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <section class="inv-totals">
        ${taxRow}
        ${order.discount > 0 ? `<div><span>Discount (${escapeHTML(order.couponCode || "code")})</span><span>− ${formatPrice(order.discount)}</span></div>` : ""}
        <div class="inv-grand"><span>${pending ? "Total due" : "Total paid"}</span><span>${formatPrice(order.total)}</span></div>
      </section>

      ${demoNote}
      <footer class="inv-foot">Thank you for your purchase from ${escapeHTML(biz.name)}.</footer>
    </article>`;
}

/* ---------- Standalone invoice page ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  const page = document.getElementById("invoice-page");
  if (!page) return;

  const sheet = document.getElementById("invoice-sheet");
  const toolbar = document.getElementById("invoice-toolbar");
  const params = new URLSearchParams(window.location.search);

  function showProblem(title, html) {
    toolbar.hidden = true;
    sheet.innerHTML = `<div class="empty-state"><h3>${title}</h3><p>${html}</p></div>`;
  }

  if (!initBackend()) return showProblem("Store not connected", "The store backend is not connected yet.");

  const { user } = await getAuthState();
  if (!user) {
    const next = encodeURIComponent(`invoice.html${window.location.search}`);
    return showProblem("Please sign in", `Sign in to view this invoice. <a href="login.html?next=${next}">Sign in</a>`);
  }

  let order = null;
  try {
    order = await getOrder(params.get("id") || "-");
  } catch (error) {
    console.error(error); /* permission-denied for other people's orders */
  }

  if (!order) {
    return showProblem("Invoice not found", "It may not exist, or it belongs to another account.");
  }

  document.title = `Invoice ${order.number} | Plazavo`;
  renderInvoice(order, sheet);

  document.getElementById("print-invoice").addEventListener("click", () => window.print());
  if (params.get("print") === "1") setTimeout(() => window.print(), 300);
});
