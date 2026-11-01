"use strict";

/* Statistics for a dean or a supervisor: ONLY the partners he brought in (his own group), as numbers.
   No income of the partners, nothing about the rest of the store. Used by dean.js and supervisor.js.
   people: [{ type, status, city, createdAt, supervisorId }]   supervisors: [{ id, email }] (dean only)   orders: optional counts */

const SCOPED_TYPES = { shop: "Seller", restaurant: "Restaurant", pharmacy: "Pharmacy", doctor: "Doctor", barber: "Barber", hotel: "Hotel", agency: "Travel agency", taxi: "Taxi driver", courier: "Delivery partner" };

function scopedStatsHTML({ people, supervisors = [], orders = null }) {
  const esc = typeof escapeHTML === "function" ? escapeHTML : s => String(s);
  const count = (list, status) => list.filter(p => p.status === status).length;
  const approved = count(people, "approved"), waiting = count(people, "pending");
  const stopped = people.filter(p => p.status === "suspended" || p.status === "rejected").length;
  const tile = (label, value) => `<article class="admin-stat"><span>${label}</span><strong>${value}</strong></article>`;
  const tiles = tile("People I brought in", people.length) + tile("Working now", approved) + tile("Waiting for approval", waiting) + tile("Paused or refused", stopped)
    + (orders ? tile("Orders of my people", orders.total) + tile("Delivered", orders.delivered) : "");

  const table = (head, rows) => rows.length
    ? `<div class="table-wrap"><table class="orders-table scoped-table"><thead><tr><th>${head}</th><th class="num">Total</th><th class="num">Working</th><th class="num">Waiting</th></tr></thead><tbody>${rows.map(r =>
      `<tr><td>${esc(r.label)}</td><td class="num"><strong>${r.list.length}</strong></td><td class="num">${count(r.list, "approved")}</td><td class="num">${count(r.list, "pending")}</td></tr>`).join("")}</tbody></table></div>`
    : '<p class="empty-state">Nobody yet.</p>';
  const group = (keyOf, labelOf) => {
    const map = new Map();
    people.forEach(p => { const k = keyOf(p); if (!map.has(k)) map.set(k, []); map.get(k).push(p); });
    return [...map.entries()].map(([k, list]) => ({ label: labelOf(k), list })).sort((a, b) => b.list.length - a.list.length);
  };
  const byKind = group(p => p.type || "shop", k => SCOPED_TYPES[k] || k);
  const bySup = supervisors.length ? group(p => p.supervisorId || "", k => { const s = supervisors.find(x => x.id === k); return s ? s.email : "—"; }) : [];
  const byCity = group(p => (p.city || "").trim() || "—", k => k).slice(0, 8);

  /* joining by month, the last six months */
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)); months.push(d.toISOString().slice(0, 7)); }
  const perMonth = months.map(m => ({ m, n: people.filter(p => String(p.createdAt || "").slice(0, 7) === m).length }));
  const top = Math.max(1, ...perMonth.map(x => x.n));
  const bars = `<div class="scoped-bars" role="img" aria-label="Joining by month">${perMonth.map(x =>
    `<div class="scoped-bar"><span class="scoped-bar-n">${x.n}</span><i style="height:${Math.round(x.n / top * 100)}%"></i><small>${x.m.slice(5)}/${x.m.slice(2, 4)}</small></div>`).join("")}</div>`;

  return `<div class="admin-stats">${tiles}</div>
    <h3 class="job-heading">By kind of account</h3>${table("Kind", byKind)}
    ${bySup.length ? `<h3 class="job-heading">By supervisor</h3>${table("Supervisor", bySup)}` : ""}
    <h3 class="job-heading">Joining by month</h3>${bars}
    <h3 class="job-heading">By city</h3>${table("City", byCity)}
    <p class="muted">Only the people you brought in. No income and no private data of anybody is shown here.</p>`;
}
