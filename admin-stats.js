"use strict";
/* Owner's statistics: visitors, registrations, accounts, orders, bookings. Requires store.js, charts.js. */

const byId = id => document.getElementById(id);
const DAY_MS = 86400000;
let days = 30;
const data = { stats: [], users: [], merchants: [], couriers: [], supervisors: [], orders: [], appts: [], ledger: [], walletLog: [], wallets: [], creditReq: [], withdrawReq: [] };
const tables = {};   /* chart id -> { head: [...], rows: [[...]] } for the table view */

const dayKey = d => new Date(d).toISOString().slice(0, 10);
function lastDays(n) { const out = []; const t = Date.now(); for (let i = n - 1; i >= 0; i--) out.push(dayKey(t - i * DAY_MS)); return out; }
const fmt = n => MKCharts.fmt(n);
const say = (text, isError) => { const el = byId("stats-message"); el.textContent = text || ""; el.classList.toggle("error", Boolean(isError)); };

function tile(label, value, help) {
  return `<article class="stat-tile"><span>${escapeHTML(label)}</span><strong>${escapeHTML(fmt(value))}</strong>${help ? `<small class="muted">${escapeHTML(help)}</small>` : ""}</article>`;
}

function renderKpis() {
  const perDay = {}; data.stats.forEach(s => { perDay[s.day] = s; });
  const sum = n => lastDays(n).reduce((a, d) => a + (Number((perDay[d] || {}).visitors) || 0), 0);
  const today = (perDay[dayKey(Date.now())] || {}).visitors || 0;
  const total = data.stats.reduce((a, s) => a + (Number(s.visitors) || 0), 0);
  const weekAgo = dayKey(Date.now() - 7 * DAY_MS);
  const newUsers = data.users.filter(u => String(u.createdAt || "").slice(0, 10) >= weekAgo).length;
  const approved = list => list.filter(x => x.status === "approved").length;
  const ofKind = k => data.merchants.filter(m => (m.kind || "shop") === k);
  const delivered = data.orders.filter(o => /deliver/i.test(String(o.fulfillment || ""))).length;
  byId("kpis").innerHTML = [
    tile("Visitors today", today), tile("Visitors, 7 days", sum(7)), tile("Visitors, 30 days", sum(30)), tile("Visitors counted in all", total, "since counting started"),
    tile("Registered people", data.users.length), tile("New this week", newUsers),
    tile("Sellers", approved(ofKind("shop")), "approved"), tile("Restaurants", approved(ofKind("restaurant")), "approved"), tile("Pharmacies", approved(ofKind("pharmacy")), "approved"), tile("Doctors", approved(ofKind("doctor")), "approved"),
    tile("Travel agencies", approved(ofKind("agency")), "approved"), tile("Taxi drivers", approved(ofKind("taxi")), "approved"), tile("Barbers", approved(ofKind("barber")), "approved"), tile("Hotels", approved(ofKind("hotel")), "approved"),
    tile("Delivery partners", approved(data.couriers), "approved"), tile("Supervisors", data.supervisors.length),
    tile("Orders", data.orders.length, "latest 2000"), tile("Delivered orders", delivered), tile("Bookings", data.appts.length)
  ].join("");
}

function renderLines() {
  const labels = lastDays(days);
  const perDay = {}; data.stats.forEach(s => { perDay[s.day] = s; });
  const visitors = labels.map(d => Number((perDay[d] || {}).visitors) || 0);
  const fresh = labels.map(d => Number((perDay[d] || {}).newVisitors) || 0);
  MKCharts.line(byId("c-visits"), { title: "Visitors per day", labels, series: [{ name: "Visitors", values: visitors, color: 0 }, { name: "First-time visitors", values: fresh, color: 1 }] });
  tables["c-visits"] = { head: ["Day", "Visitors", "First-time visitors"], rows: labels.map((d, i) => [d, visitors[i], fresh[i]]) };

  const regs = labels.map(d => data.users.filter(u => String(u.createdAt || "").slice(0, 10) === d).length);
  const partners = labels.map(d => [...data.merchants, ...data.couriers].filter(p => String(p.createdAt || "").slice(0, 10) === d).length);
  MKCharts.line(byId("c-regs"), { title: "New registrations per day", labels, series: [{ name: "New people", values: regs, color: 2 }, { name: "Partner applications", values: partners, color: 3 }] });
  tables["c-regs"] = { head: ["Day", "New people", "Partner applications"], rows: labels.map((d, i) => [d, regs[i], partners[i]]) };
}

function countBy(list, fn) { const m = {}; list.forEach(x => { const k = fn(x) || "—"; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); }

function renderOthers() {
  const ofKind = k => data.merchants.filter(m => (m.kind || "shop") === k && m.status === "approved").length;
  const types = [["Customers", data.users.length], ["Sellers", ofKind("shop")], ["Restaurants", ofKind("restaurant")], ["Pharmacies", ofKind("pharmacy")], ["Doctors", ofKind("doctor")], ["Travel agencies", ofKind("agency")],
    ["Taxi drivers", ofKind("taxi")], ["Barbers", ofKind("barber")], ["Hotels", ofKind("hotel")], ["Delivery partners", data.couriers.filter(c => c.status === "approved").length], ["Supervisors", data.supervisors.length]];
  MKCharts.bars(byId("c-types"), { title: "Accounts by type", items: types.map(([label, value], i) => ({ label, value, color: i })) });
  tables["c-types"] = { head: ["Type", "Accounts"], rows: types };

  const states = countBy(data.orders, o => o.fulfillment);
  MKCharts.donut(byId("c-orders"), { title: "Orders by state", center: "orders", items: states.map(([label, value], i) => ({ label, value, color: i })) });
  tables["c-orders"] = { head: ["State", "Orders"], rows: states };

  const pays = countBy(data.orders, o => ({ cod: "Cash on delivery", paypal: "PayPal", credit: "Credit", demo: "Demo" }[o.paymentMethod] || o.paymentMethod));
  MKCharts.donut(byId("c-pay"), { title: "Payment methods", center: "orders", items: pays.map(([label, value], i) => ({ label, value, color: i })) });
  tables["c-pay"] = { head: ["Method", "Orders"], rows: pays };

  const svc = countBy(data.appts, a => ({ doctor: "Doctor", travel: "Travel ticket", taxi: "Taxi", barber: "Barber", hotel: "Hotel" }[a.service || "doctor"]));
  MKCharts.donut(byId("c-appt"), { title: "Bookings by service", center: "bookings", items: svc.map(([label, value], i) => ({ label, value, color: i })) });
  tables["c-appt"] = { head: ["Service", "Bookings"], rows: svc };

}


/* ---------- money, credit, growth and lists ---------- */
const money = n => formatPrice(Math.round((Number(n) || 0) * 100) / 100);
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const dayOfIso = v => String(v || "").slice(0, 10);
const isRejected = o => /reject|cancel/i.test(String(o.fulfillment || ""));
const isDelivered = o => /^deliver/i.test(String(o.fulfillment || ""));
const deliveredDay = o => dayOfIso(o.deliveredAt || o.updatedAt || o.createdAt);
const PAY_LABEL = { cod: "Cash on delivery", paypal: "PayPal", credit: "Credit", demo: "Demo", revolut: "Revolut", postepay: "PostePay", bank: "Bank transfer" };
const SRC_LABEL = { cash: "Cash (supervisor)", manual: "By hand", other: "Other" };
const dayRange = (n, offset = 0) => { const out = []; const t = Date.now() - offset * DAY_MS; for (let i = n - 1; i >= 0; i--) out.push(dayKey(t - i * DAY_MS)); return out; };

function perDayMaps(labels) {
  const set = new Set(labels), m = {};
  const row = d => (m[d] = m[d] || { orders: 0, delivered: 0, sales: 0, earnOrders: 0, earnBookings: 0, paid: 0, topup: 0, topupCount: 0, bookings: 0, bookDone: 0 });
  data.orders.forEach(o => {
    const d = dayOfIso(o.createdAt);
    if (set.has(d)) { const r = row(d); r.orders++; if (!isRejected(o)) r.sales += Number(o.itemsTotal != null ? o.itemsTotal : o.total) || 0; }
    if (isDelivered(o)) { const dd = deliveredDay(o); if (set.has(dd)) { const r = row(dd); r.delivered++; r.earnOrders += Number(o.commission) || 0; } }
  });
  data.ledger.forEach(l => {
    const d = dayOfIso(l.at); if (!set.has(d)) return;
    if (l.type === "commission" && l.orderNumber === "Booking") row(d).earnBookings += Number(l.amount) || 0;
    if (l.type === "payment") row(d).paid += Number(l.amount) || 0;
  });
  data.walletLog.forEach(w => { const d = dayOfIso(w.at); if (set.has(d) && w.type === "mint") { const r = row(d); r.topup += Number(w.delta) || 0; r.topupCount++; } });
  data.appts.forEach(a => { const d = dayOfIso(a.createdAt); if (set.has(d)) { const r = row(d); r.bookings++; } if (a.status === "done") { const dd = dayOfIso(a.updatedAt); if (set.has(dd)) row(dd).bookDone++; } });
  labels.forEach(row);
  return m;
}
const sumKey = (m, labels, key) => labels.reduce((a, d) => a + ((m[d] || {})[key] || 0), 0);
function deltaText(now, before) {
  if (!(before > 0)) return "";
  const p = Math.round(((now - before) / before) * 100);
  return `${p >= 0 ? "+" : ""}${p}% vs the period before`;
}
const tileText = (label, text, help) => `<article class="stat-tile"><span>${escapeHTML(label)}</span><strong>${escapeHTML(text)}</strong>${help ? `<small class="muted">${escapeHTML(help)}</small>` : ""}</article>`;

function renderMoney() {
  const labels = lastDays(days), prev = dayRange(days, days);
  const m = perDayMaps([...labels, ...prev]);
  const earn = d => (m[d] || {}).earnOrders + (m[d] || {}).earnBookings || 0;
  const eNow = labels.reduce((a, d) => a + earn(d), 0), ePrev = prev.reduce((a, d) => a + earn(d), 0);
  const sNow = sumKey(m, labels, "sales"), sPrev = sumKey(m, prev, "sales");
  const oNow = sumKey(m, labels, "orders"), oPrev = sumKey(m, prev, "orders");
  const eAll = data.orders.filter(isDelivered).reduce((a, o) => a + (Number(o.commission) || 0), 0)
    + data.ledger.filter(l => l.type === "commission" && l.orderNumber === "Booking").reduce((a, l) => a + (Number(l.amount) || 0), 0);
  const owed = data.merchants.reduce((a, x) => a + (Number(x.debt) || 0), 0);
  const paidNow = sumKey(m, labels, "paid");
  const dNow = sumKey(m, labels, "delivered");
  byId("money-kpis").innerHTML = [
    tileText("Site earnings (period)", money(eNow), deltaText(eNow, ePrev)),
    tileText("Site earnings (all time)", money(eAll), "in the data loaded"),
    tileText("Earned today", money(earn(dayKey(Date.now())))),
    tileText("Orders (period)", fmt(oNow), deltaText(oNow, oPrev)),
    tileText("Delivered (period)", fmt(dNow)),
    tileText("Goods sold (period)", money(sNow), deltaText(sNow, sPrev)),
    tileText("Average order", money(oNow ? sNow / oNow : 0)),
    tileText("Sellers still owe the site", money(owed)),
    tileText("Paid by sellers (period)", money(paidNow))
  ].join("");

  const eo = labels.map(d => r2((m[d] || {}).earnOrders)), eb = labels.map(d => r2((m[d] || {}).earnBookings));
  MKCharts.line(byId("c-earn"), { title: "Site earnings per day", labels, series: [{ name: "Commissions on orders", values: eo, color: 0 }, { name: "Fees on bookings", values: eb, color: 1 }] });
  tables["c-earn"] = { head: ["Day", "Commissions on orders", "Fees on bookings", "Total"], rows: labels.map((d, i) => [d, money(eo[i]), money(eb[i]), money(eo[i] + eb[i])]) };

  const od = labels.map(d => (m[d] || {}).orders || 0), dl = labels.map(d => (m[d] || {}).delivered || 0), sl = labels.map(d => r2((m[d] || {}).sales));
  MKCharts.line(byId("c-sales"), { title: "Orders and sales per day", labels, series: [{ name: "Orders placed", values: od, color: 2 }, { name: "Orders delivered", values: dl, color: 0 }] });
  tables["c-sales"] = { head: ["Day", "Orders placed", "Orders delivered", "Goods sold"], rows: labels.map((d, i) => [d, od[i], dl[i], money(sl[i])]) };

  const bookFees = eb.reduce((a, b) => a + b, 0), orderFees = eo.reduce((a, b) => a + b, 0);
  const src = [["Orders (sellers' commission)", orderFees], ["Doctor / agency / taxi fees", bookFees]];
  MKCharts.donut(byId("c-src"), { title: "Earnings by source", center: "total", items: src.map(([label, value], i) => ({ label, value: r2(value), color: i })) });
  tables["c-src"] = { head: ["Source", "Earnings"], rows: src.map(([l, v]) => [l, money(v)]) };

  const inP = new Set(labels), byPay = {};
  data.orders.filter(o => inP.has(dayOfIso(o.createdAt)) && !isRejected(o)).forEach(o => { const k = PAY_LABEL[o.paymentMethod] || o.paymentMethod || "—"; byPay[k] = (byPay[k] || 0) + (Number(o.itemsTotal != null ? o.itemsTotal : o.total) || 0); });
  const pays = Object.entries(byPay).sort((a, b) => b[1] - a[1]);
  MKCharts.donut(byId("c-paysales"), { title: "Sales by payment method", center: "sold", items: pays.map(([label, value], i) => ({ label, value: r2(value), color: i })) });
  tables["c-paysales"] = { head: ["Method", "Goods sold"], rows: pays.map(([l, v]) => [l, money(v)]) };
}

function renderCredit() {
  const dz = Boolean(window.MK_EDITION && MK_EDITION.dz);
  byId("credit-panel").hidden = !dz;
  if (!dz) return;
  const labels = lastDays(days), prev = dayRange(days, days);
  const m = perDayMaps([...labels, ...prev]);
  const inP = new Set(labels);
  const log = data.walletLog.filter(w => inP.has(dayOfIso(w.at)));
  const sum = (type, sign) => r2(log.filter(w => w.type === type).reduce((a, w) => a + (sign ? Math.abs(Number(w.delta) || 0) : Number(w.delta) || 0), 0));
  const issued = sum("mint"), issuedPrev = sumKey(m, prev, "topup");
  const spentOrders = sum("order", true), refunds = sum("refund"), sentP2P = sum("send", true), withdrawn = sum("withdraw", true), debtPaid = sum("debt", true) + sum("ad", true);
  const circulation = data.wallets.reduce((a, w) => a + (Number(w.balance) || 0), 0);
  const holders = data.wallets.filter(w => Number(w.balance) > 0).length;
  const mints = log.filter(w => w.type === "mint");
  byId("credit-kpis").innerHTML = [
    tileText("Credit issued (period)", money(issued), deltaText(issued, issuedPrev)),
    tileText("Top-up operations", fmt(mints.length)),
    tileText("Average top-up", money(mints.length ? issued / mints.length : 0)),
    tileText("Spent on orders", money(spentOrders)),
    tileText("Paid out to sellers (withdrawals)", money(withdrawn)),
    tileText("Held in accounts now", money(circulation), `${fmt(holders)} accounts with credit`),
    tileText("Top-up requests waiting", fmt(data.creditReq.filter(r => r.status === "pending").length), "from supervisors"),
    tileText("Withdrawals waiting", fmt(data.withdrawReq.filter(r => r.status === "pending").length), "from sellers")
  ].join("");

  const tu = labels.map(d => r2((m[d] || {}).topup)), tc = labels.map(d => (m[d] || {}).topupCount || 0);
  MKCharts.line(byId("c-topup"), { title: "Credit issued per day", labels, series: [{ name: "Credit issued", values: tu, color: 4 }] });
  tables["c-topup"] = { head: ["Day", "Credit issued", "Operations"], rows: labels.map((d, i) => [d, money(tu[i]), tc[i]]) };

  const bySrc = {}; mints.forEach(w => { const k = SRC_LABEL[w.source] || "Other"; bySrc[k] = (bySrc[k] || 0) + (Number(w.delta) || 0); });
  const srcs = Object.entries(bySrc).sort((a, b) => b[1] - a[1]);
  MKCharts.donut(byId("c-topsrc"), { title: "Top-ups by source", center: "issued", items: srcs.map(([label, value], i) => ({ label, value: r2(value), color: i })) });
  tables["c-topsrc"] = { head: ["Source", "Credit issued"], rows: srcs.map(([l, v]) => [l, money(v)]) };

  const use = [["Spent on orders", spentOrders], ["Sent between people", sentP2P], ["Seller debts paid", debtPaid], ["Withdrawn by sellers", withdrawn], ["Refunded to buyers", refunds]];
  MKCharts.donut(byId("c-credit-use"), { title: "How credit is used", center: "used", items: use.map(([label, value], i) => ({ label, value: r2(value), color: i })) });
  tables["c-credit-use"] = { head: ["Use", "Amount"], rows: use.map(([l, v]) => [l, money(v)]) };
}

function renderGrowth() {
  const labels = lastDays(days), set = new Set(labels), perDay = {}; data.stats.forEach(s => { perDay[s.day] = s; });
  const visitors = labels.reduce((a, d) => a + (Number((perDay[d] || {}).visitors) || 0), 0);
  const signups = data.users.filter(u => set.has(dayOfIso(u.createdAt))).length;
  const ordersP = data.orders.filter(o => set.has(dayOfIso(o.createdAt)));
  const buyers = new Set(ordersP.map(o => o.uid || o.email)).size;
  const delivered = ordersP.filter(isDelivered).length, rejected = ordersP.filter(isRejected).length;
  const everBuyers = {}; data.orders.forEach(o => { const k = o.uid || o.email; everBuyers[k] = (everBuyers[k] || 0) + 1; });
  const repeat = Object.values(everBuyers).filter(n => n > 1).length, allBuyers = Object.keys(everBuyers).length;
  const activeSellers = new Set(ordersP.filter(o => o.merchantId).map(o => o.merchantId)).size;
  const pending = [...data.merchants, ...data.couriers].filter(x => x.status === "pending").length;
  const suspended = data.merchants.filter(x => x.status === "suspended").length;
  const apptP = data.appts.filter(a => set.has(dayOfIso(a.createdAt)));
  const pct = (a, b) => b ? `${Math.round((a / b) * 100)}%` : "—";
  byId("growth-kpis").innerHTML = [
    tileText("Visitors → sign-ups", signups > visitors ? "—" : pct(signups, visitors), `${fmt(signups)} of ${fmt(visitors)}`),
    tileText("Sign-ups → customers who ordered", pct(buyers, signups), `${fmt(buyers)} customers in the period`),
    tileText("Delivery success", pct(delivered, ordersP.length), `${fmt(delivered)} of ${fmt(ordersP.length)} orders`),
    tileText("Rejected orders", pct(rejected, ordersP.length), `${fmt(rejected)} orders`),
    tileText("Customers who came back", pct(repeat, allBuyers), `${fmt(repeat)} of ${fmt(allBuyers)} customers`),
    tileText("Active sellers (sold in the period)", fmt(activeSellers)),
    tileText("Applications waiting for you", fmt(pending), "sellers, partners, doctors…"),
    tileText("Sellers paused for debt", fmt(suspended)),
    tileText("Bookings (period)", fmt(apptP.length), `${fmt(apptP.filter(a => a.status === "done").length)} finished`)
  ].join("");

  const funnel = [["Visitors", visitors], ["Signed up", signups], ["Ordered", buyers], ["Order delivered", new Set(ordersP.filter(isDelivered).map(o => o.uid || o.email)).size]];
  MKCharts.bars(byId("c-funnel"), { title: "From visitor to delivered order", items: funnel.map(([label, value], i) => ({ label, value, color: i })) });
  tables["c-funnel"] = { head: ["Step", "People"], rows: funnel };

  const states = countBy(apptP, a => ({ pending: "Waiting", accepted: "Confirmed", done: "Done", rejected: "Rejected", cancelled: "Cancelled" }[a.status] || a.status));
  MKCharts.donut(byId("c-appt-state"), { title: "Bookings by state", center: "bookings", items: states.map(([label, value], i) => ({ label, value, color: i })) });
  tables["c-appt-state"] = { head: ["State", "Bookings"], rows: states };

  const bd = labels.map(d => data.appts.filter(a => dayOfIso(a.createdAt) === d).length);
  MKCharts.line(byId("c-appt-day"), { title: "Bookings per day", labels, series: [{ name: "New bookings", values: bd, color: 5 }] });
  tables["c-appt-day"] = { head: ["Day", "Bookings"], rows: labels.map((d, i) => [d, bd[i]]) };
}

function miniTable(head, rows) {
  if (!rows.length) return '<p class="empty-state">Nothing yet.</p>';
  return `<div class="table-wrap"><table class="orders-table"><thead><tr>${head.map((h, i) => `<th${i ? ' class="num"' : ""}>${escapeHTML(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ""}>${escapeHTML(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function renderLists() {
  const set = new Set(lastDays(days));
  const ordersP = data.orders.filter(o => set.has(dayOfIso(o.createdAt)) && !isRejected(o));
  const by = (list, keyFn) => { const m = {}; list.forEach(o => { const k = keyFn(o); if (k) (m[k] = m[k] || []).push(o); }); return m; };
  const sellers = Object.entries(by(ordersP.filter(o => o.merchantId), o => o.merchantName || o.merchantId)).map(([name, list]) => [name, list.length, list.reduce((a, o) => a + (Number(o.itemsTotal != null ? o.itemsTotal : o.total) || 0), 0), list.filter(isDelivered).reduce((a, o) => a + (Number(o.commission) || 0), 0)]).sort((a, b) => b[2] - a[2]).slice(0, 8);
  byId("top-sellers").innerHTML = miniTable(["Seller", "Orders"], sellers.map(([n, c]) => [n, fmt(c)]));
  const prod = {}; ordersP.forEach(o => (o.items || []).forEach(it => { const k = it.name || "—"; const p = (prod[k] = prod[k] || { q: 0, a: 0 }); p.q += Number(it.quantity) || 0; p.a += (Number(it.price) || 0) * (Number(it.quantity) || 0); }));
  const prods = Object.entries(prod).sort((a, b) => b[1].a - a[1].a).slice(0, 8);
  byId("top-products").innerHTML = miniTable(["Product", "Sold"], prods.map(([n, p]) => [n, fmt(p.q)]));
  const debts = data.merchants.filter(x => Number(x.debt) > 0).sort((a, b) => b.debt - a.debt).slice(0, 8);
  byId("top-debts").innerHTML = miniTable(["Seller", "Owes"], debts.map(x => [x.businessName || x.fullName || x.id, money(x.debt)]));
  const cust = Object.entries(by(ordersP, o => o.uid || o.email)).map(([k, list]) => [(list[0].customer && list[0].customer.name) || list[0].email || k, list.length, list.reduce((a, o) => a + (Number(o.total) || 0), 0)]).sort((a, b) => b[2] - a[2]).slice(0, 8);
  byId("top-customers").innerHTML = miniTable(["Customer", "Orders", "Spent"], cust.map(([n, c, s]) => [n, fmt(c), money(s)]));
}

let dailyRows = [];
function renderDaily() {
  const labels = lastDays(days), m = perDayMaps(labels), perDay = {}; data.stats.forEach(s => { perDay[s.day] = s; });
  const dz = Boolean(window.MK_EDITION && MK_EDITION.dz);
  const head = ["Day", "Visitors", "New people", "Orders", "Delivered", "Goods sold", "Site earnings", "Bookings", ...(dz ? ["Credit issued"] : [])];
  dailyRows = labels.slice().reverse().map(d => {
    const r = m[d] || {};
    return [d, Number((perDay[d] || {}).visitors) || 0, data.users.filter(u => dayOfIso(u.createdAt) === d).length, r.orders || 0, r.delivered || 0, r2(r.sales), r2((r.earnOrders || 0) + (r.earnBookings || 0)), r.bookings || 0, ...(dz ? [r2(r.topup)] : [])];
  });
  dailyRows.unshift(head);
  const moneyCols = new Set([5, 6, 8]);
  byId("daily-table").innerHTML = `<div class="table-wrap"><table class="orders-table"><thead><tr>${head.map((h, i) => `<th${i ? ' class="num"' : ""}>${escapeHTML(h)}</th>`).join("")}</tr></thead><tbody>${dailyRows.slice(1).map(r => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ""}>${escapeHTML(moneyCols.has(i) ? money(c) : String(c))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
document.addEventListener("click", event => {
  if (event.target.id !== "daily-csv") return;
  const csv = "\ufeff" + dailyRows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `site-report-${dayKey(Date.now())}.csv`; document.body.appendChild(a); a.click(); a.remove();
});

/* ---------- table view of any chart ---------- */
function applyTables() {
  document.querySelectorAll(".viz-table-btn").forEach(btn => {
    const host = byId(btn.dataset.for), t = tables[btn.dataset.for];
    const asTable = host.dataset.view === "table" && t;
    btn.textContent = asTable ? "Chart" : "Table";
    if (asTable) host.innerHTML = `<div class="table-wrap"><table class="orders-table"><thead><tr>${t.head.map(h => `<th>${escapeHTML(h)}</th>`).join("")}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map(c => `<td>${escapeHTML(String(c))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  });
}
document.addEventListener("click", event => {
  const btn = event.target.closest(".viz-table-btn");
  if (!btn) return;
  const host = byId(btn.dataset.for);
  host.dataset.view = host.dataset.view === "table" ? "" : "table";
  render();
});

document.querySelector(".range-row").addEventListener("click", event => {
  const btn = event.target.closest(".range-btn"); if (!btn) return;
  days = Number(btn.dataset.days);
  document.querySelectorAll(".range-btn").forEach(b => b.classList.toggle("active", b === btn));
  render();
});

function render() {
  renderKpis();
  renderLines();
  renderOthers();
  renderMoney();
  renderCredit();
  renderGrowth();
  renderLists();
  renderDaily();
  applyTables();
}

document.getElementById("admin-logout").addEventListener("click", event => { event.preventDefault(); mkLogout(); });

(async () => {
  if (!initBackend()) return;
  const state = await getAuthState();
  if (!state.isAdmin) return;
  const get = async (name, build) => { try { const s = await (build ? build() : db.collection(name).get()); return s.docs.map(d => ({ ...d.data(), id: d.id })); } catch (e) { console.error(name, e); say("Some numbers could not be loaded.", true); return []; } };
  const dzEd = Boolean(window.MK_EDITION && MK_EDITION.dz);
  const recent = (name, n) => () => db.collection(name).orderBy("at", "desc").limit(n).get();
  [data.stats, data.users, data.merchants, data.couriers, data.supervisors, data.orders, data.appts, data.ledger, data.walletLog, data.wallets, data.creditReq, data.withdrawReq] = await Promise.all([
    get("stats"), get("users"), get("merchants"), get("couriers"), get("supervisors"),
    get("orders", () => db.collection("orders").orderBy("createdAt", "desc").limit(2000).get()), callFn("bookingCounts", {}).then(r => r.rows || []).catch(() => []),
    get("ledger", recent("ledger", 3000)),
    dzEd ? get("walletLog", recent("walletLog", 3000)) : [], dzEd ? get("wallets") : [], dzEd ? get("creditRequests") : [], dzEd ? get("withdrawRequests") : []
  ]);
  render();
})();
