/* Seller's sales tab: earnings per day (last 14 days), best sellers, sold-out products.
   Reads the page's myOrders / myProducts; call renderSales() when the tab opens. */
(function () {
  "use strict";
  const esc = v => escapeHTML(String(v == null ? "" : v));
  const dayKey = iso => String(iso || "").slice(0, 10);
  function render() {
    const host = document.getElementById("sales-box");
    if (!host || typeof myOrders === "undefined") return;
    const done = myOrders.filter(o => o.fulfillment === "Delivered");
    const days = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d.toISOString().slice(0, 10)); }
    const byDay = Object.fromEntries(days.map(d => [d, 0]));
    done.forEach(o => { const k = dayKey(o.deliveredAt || o.createdAt); if (k in byDay) byDay[k] += Number(o.merchantNet || 0); });
    const max = Math.max(1, ...Object.values(byDay));
    const W = 560, H = 150, bw = W / days.length;
    const bars = days.map((d, i) => {
      const v = byDay[d], h = Math.round((v / max) * (H - 28));
      return `<g><title>${esc(d)}: ${esc(formatPrice(v))}</title><rect x="${(i * bw + 5).toFixed(1)}" y="${H - 18 - h}" width="${(bw - 10).toFixed(1)}" height="${Math.max(h, v > 0 ? 2 : 0)}" rx="4" fill="#1f4eb5"/><text x="${(i * bw + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="9" fill="#6f6f6f">${esc(d.slice(8))}</text></g>`;
    }).join("");
    const sold = {};
    done.forEach(o => (o.items || []).forEach(it => { const k = it.name || it.id; sold[k] = (sold[k] || 0) + Number(it.quantity || 1); }));
    const top = Object.entries(sold).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const out = (typeof myProducts !== "undefined" ? myProducts : []).filter(p => p.available === false);
    const week = days.slice(-7).reduce((a, d) => a + byDay[d], 0);
    host.innerHTML = `<div class="stat-tiles"><article class="stat-tile"><span>Earned, last 7 days</span><strong>${esc(formatPrice(week))}</strong></article><article class="stat-tile"><span>Delivered orders</span><strong>${done.length}</strong></article><article class="stat-tile"><span>Sold-out products</span><strong>${out.length}</strong></article></div>
      <h3 class="subhead">Earnings per day (last 14 days)</h3>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Earnings per day" style="width:100%;max-width:640px;height:auto">${bars}</svg>
      <h3 class="subhead">Best sellers</h3>${top.length ? `<ol class="sales-top">${top.map(([n, q]) => `<li>${esc(n)} <strong>× ${q}</strong></li>`).join("")}</ol>` : '<p class="muted">No delivered order yet.</p>'}
      ${out.length ? `<h3 class="subhead">Sold out: bring them back when you have stock</h3><ul class="sales-top">${out.map(p => `<li>${esc(p.name)}</li>`).join("")}</ul>` : ""}`;
  }
  window.renderSales = render;
})();
