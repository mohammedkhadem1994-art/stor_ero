"use strict";

/* Admin: sellers' debts, supervisors, messages. Requires store.js, chat.js and admin.js. */

const byId = id => document.getElementById(id);

function note(id, text, isError = false) {
  byId(id).textContent = text;
  byId(id).classList.toggle("error", isError);
}

/* ---------- debts ---------- */

let sellers = [];

function renderDebts() {
  const list = sellers.filter(s => Number(s.debt || 0) > 0 || s.suspendedReason === "debt" || Number(s.debtCycle || 1) > 1 || Boolean(s.payClaim) || Number(s.cycleCommission || 0) > 0)
    .sort((a, b) => Number(b.debt || 0) - Number(a.debt || 0));
  byId("admin-debts").innerHTML = list.length ? `<div class="table-wrap"><table class="orders-table">
    <thead><tr><th>Seller</th><th>Debt</th><th>Status</th><th></th></tr></thead>
    <tbody>${list.map(s => {
      const debt = Number(s.debt || 0);
      const limit = debtLimitOf(s.id);
      const pct = Math.min(100, Math.round(debt / limit * 100));
      return `<tr>
        <td><strong>${escapeHTML(s.businessName || s.fullName || "")}</strong>${s.kind && s.kind !== "shop" ? ` <small class="muted">(${escapeHTML({ doctor: "Doctor", agency: "Travel agency", taxi: "Taxi driver", barber: "Barber", hotel: "Hotel", restaurant: "Restaurant", pharmacy: "Pharmacy" }[s.kind] || s.kind)})</small>` : ""}<br><small class="muted">${escapeHTML(s.email || "")}</small></td>
        <td>${formatPrice(debt)} / ${formatPrice(limit)}<div class="progress"><div style="width:${pct}%"></div></div></td>
        <td><span class="status-pill">${escapeHTML(s.suspendedReason === "debt" ? "paused (debt)" : s.status)}</span>${s.payClaim ? `<br><small class="error">Says he paid ${formatPrice(s.payClaim.amount)} · ${escapeHTML(formatDate(s.payClaim.at, true))}</small>${proofLinkHTML(s.payClaim.proofId)}` : ""}</td>
        <td><button type="button" class="small-button debt-hist" data-id="${escapeHTML(s.id)}">History</button>
          ${proofPickerHTML()}<button type="button" class="small-button record-debt" data-id="${escapeHTML(s.id)}" data-debt="${debt}">Record payment</button>
          <button type="button" class="small-button delete-button clear-debt" data-id="${escapeHTML(s.id)}" data-debt="${debt}">Clear debt</button>
          ${waButton(s.phone, s.country, "Seller", `Hello ${s.businessName || ""}, your debt to Plazavo is ${formatPrice(debt)}.`)}</td>
      </tr>`;
    }).join("")}</tbody></table></div>` : '<p class="empty-state">No seller owes anything.</p>';
}

async function loadDebts() {
  const snap = await db.collection("merchants").get();
  sellers = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
  renderDebts();
  renderDebtSwitch();
  if (typeof renderOrders === "function" && typeof currentOrders !== "undefined" && currentOrders.length) renderOrders(currentOrders);
  if (typeof renderOrders === "function" && typeof currentOrders !== "undefined" && currentOrders.length) renderOrders(currentOrders);
}

byId("admin-debts").addEventListener("click", async event => {
  const hist = event.target.closest(".debt-hist");
  if (hist) return showDebtHistory(hist.dataset.id);
  const button = event.target.closest(".record-debt, .clear-debt");
  if (!button) return;
  let amount;
  if (button.classList.contains("clear-debt")) {
    amount = Number(button.dataset.debt);
    if (!window.confirm(`Clear the whole debt of ${formatPrice(amount)}? Do this only after the seller paid you.`)) return;
  } else {
    const answer = window.prompt(MK_EDITION.localizeText("Amount the seller paid to the site (EUR):"), Number(button.dataset.debt).toFixed(2));
    if (answer === null) return;
    amount = Number(String(answer).replace(",", "."));
  }
  if (!(amount > 0)) return note("debt-message", "Enter a valid amount.", true);
  const proof = button.classList.contains("record-debt") ? await readProof(button.closest("td")).catch(error => { note("debt-message", error.message, true); return null; }) : undefined;
  if (proof === null) return;
  button.disabled = true;
  try {
    const result = await callFn("recordDebtPayment", { merchantId: button.dataset.id, amount, ...(proof ? { proof } : {}) });
    note("debt-message", (result && result.statementClosed ? "Payment recorded. The statement was archived and a new balance starts at 0." : "Payment recorded.") + (result && result.reinstated ? " The seller's shop is open again." : ""));
    await loadDebts();
  } catch (error) {
    console.error(error);
    button.disabled = false;
    note("debt-message", authErrorMessage(error), true);
  }
});

/* One seller's whole history: the open balance, closed statements (archive) and every movement. Nothing is deleted. */
async function showDebtHistory(id) {
  const box = byId("debt-history");
  const seller = sellers.find(s => s.id === id) || {};
  box.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const [led, sts] = await Promise.all([
      db.collection("ledger").where("merchantId", "==", id).get(),
      db.collection("debtStatements").where("merchantId", "==", id).get()
    ]);
    const entries = led.docs.map(d => d.data()).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const statements = sts.docs.map(d => d.data()).sort((a, b) => Number(b.cycle) - Number(a.cycle));
    box.innerHTML = `<div class="panel debt-history-box"><h3>${escapeHTML(seller.businessName || "")}: debt history</h3>
      <p>Open balance: <strong>${formatPrice(seller.debt || 0)}</strong> · current statement #${Number(seller.debtCycle) || 1}
        (fees ${formatPrice(seller.cycleCommission || 0)}, paid ${formatPrice(seller.cyclePaid || 0)})</p>
      <h4>Archived statements</h4>
      ${statements.length ? `<div class="table-wrap"><table class="orders-table"><thead><tr><th>#</th><th>Opened</th><th>Closed</th><th>Fees</th><th>Paid</th></tr></thead><tbody>${statements.map(s => `<tr><td>${Number(s.cycle)}</td><td>${escapeHTML(formatDate(s.openedAt, true))}</td><td>${escapeHTML(formatDate(s.closedAt, true))}</td><td>${formatPrice(s.commission)}</td><td>${formatPrice(s.paid)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">No closed statements yet.</p>'}
      <h4>All movements</h4>
      ${entries.length ? `<div class="table-wrap"><table class="orders-table"><tbody>${entries.map(x => `<tr><td>${escapeHTML(formatDate(x.at, true))}</td><td>#${Number(x.cycle) || 1}</td><td>${x.type === "payment" ? "Payment" : `Fee for ${escapeHTML(x.orderNumber || "")}`}</td><td>${x.type === "payment" ? "−" : "+"}${formatPrice(x.amount)}${proofLinkHTML(x.proofId)}</td><td>Balance ${formatPrice(x.balance)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">No movements.</p>'}
      <button type="button" class="small-button" id="debt-hist-close">Close</button></div>`;
    byId("debt-hist-close").addEventListener("click", () => { box.innerHTML = ""; });
  } catch (error) {
    console.error(error);
    box.innerHTML = '<p class="empty-state">Could not load the history.</p>';
  }
}

/* ---------- supervisors ---------- */

let deanList = [];
async function loadSupervisors() {
  const [snap, dsnap] = await Promise.all([db.collection("supervisors").get(), db.collection("deans").get()]);
  const list = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
  deanList = dsnap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
  window.supervisorEmails = Object.fromEntries(list.map(s => [s.id, s.email || s.id]));
  window.supervisorDeanOf = Object.fromEntries(list.filter(s => s.deanId).map(s => [s.id, s.deanId]));
  window.supervisorDeanName = Object.fromEntries(list.filter(s => s.deanId).map(s => [s.id, (deanList.find(d => d.id === s.deanId) || {}).email || s.deanId]));
  const sel = byId("partner-group");
  if (sel) {
    const opts = '<option value="">Everyone</option><option value="none">No supervisor (outside the groups)</option>'
      + deanList.map(d => `<option value="d:${escapeHTML(d.id)}">Dean: ${escapeHTML(d.email || d.id)}</option>`).join("")
      + list.map(s => `<option value="s:${escapeHTML(s.id)}">Supervisor: ${escapeHTML(s.email || s.id)}</option>`).join("");
    if (sel.dataset.opts !== opts) { const keep = sel.value; sel.dataset.opts = opts; sel.innerHTML = opts; sel.value = [...sel.options].some(o => o.value === keep) ? keep : ""; }
  }
  if (typeof renderPartners === "function") renderPartners();
  byId("admin-supervisors").innerHTML = list.length ? `<div class="table-wrap"><table class="orders-table"><thead><tr><th>Supervisor</th><th>Since</th><th>Dean</th><th></th></tr></thead><tbody>${
    list.map(s => `<tr class="${s.locked ? "blocked-row" : ""}"><td>${escapeHTML(s.email || s.id)}${s.locked ? ' <span class="status-pill status-rejected">locked</span>' : ""}</td><td>${escapeHTML(formatDate(s.addedAt))}</td>
      <td><select class="sup-dean" data-id="${escapeHTML(s.id)}" aria-label="Dean"><option value="">— under the owner —</option>${deanList.map(d => `<option value="${escapeHTML(d.id)}"${s.deanId === d.id ? " selected" : ""}>${escapeHTML(d.email || d.id)}</option>`).join("")}</select></td>
      <td><button type="button" class="small-button lock-role" data-role="supervisor" data-uid="${escapeHTML(s.id)}" data-locked="${s.locked ? "0" : "1"}">${s.locked ? "Unlock" : "Lock"}</button> <button type="button" class="small-button delete-button remove-supervisor" data-id="${escapeHTML(s.id)}">Remove</button></td></tr>`).join("")
  }</tbody></table></div>` : '<p class="empty-state">No supervisor yet.</p>';
  renderDeans();
}

async function renderDeans() {
  if (!byId("admin-deans")) return;
  byId("admin-deans").innerHTML = deanList.length ? `<div class="table-wrap"><table class="orders-table"><thead><tr><th>Dean</th><th>Since</th><th>Supervisors</th><th></th></tr></thead><tbody>${
    deanList.map(d => `<tr class="${d.locked ? "blocked-row" : ""}"><td>${escapeHTML(d.email || d.id)}<br><small class="muted">id: ${escapeHTML(d.id)}</small>${d.locked ? ' <span class="status-pill status-rejected">locked</span>' : ""}</td><td>${escapeHTML(formatDate(d.addedAt))}</td><td>${Object.values(window.supervisorEmails || {}).length ? "" : ""}<span class="dean-count" data-id="${escapeHTML(d.id)}"></span></td>
      <td><button type="button" class="small-button lock-role" data-role="dean" data-uid="${escapeHTML(d.id)}" data-locked="${d.locked ? "0" : "1"}">${d.locked ? "Unlock" : "Lock"}</button> <button type="button" class="small-button delete-button remove-dean" data-id="${escapeHTML(d.id)}">Remove</button></td></tr>`).join("")
  }</tbody></table></div>` : '<p class="empty-state">No dean yet.</p>';
  try {
    const supSnap = await db.collection("supervisors").get();
    const counts = {}; supSnap.docs.forEach(s => { const id = s.data().deanId; if (id) counts[id] = (counts[id] || 0) + 1; });
    document.querySelectorAll(".dean-count").forEach(el => { el.textContent = String(counts[el.dataset.id] || 0); });
    const props = await db.collection("supervisorProposals").get();
    const waiting = props.docs.map(p => ({ ...p.data(), id: p.id })).filter(p => p.status === "pending");
    byId("admin-proposals").innerHTML = waiting.length ? `<div class="table-wrap"><table class="orders-table"><tbody>${waiting.map(p => `<tr><td>${escapeHTML(p.email)}</td><td><small class="muted">proposed by ${escapeHTML(p.deanEmail || "a dean")} · ${escapeHTML(formatDate(p.at))}</small></td>
      <td><button type="button" class="small-button prop-decide" data-uid="${escapeHTML(p.id)}" data-approve="1">Approve</button> <button type="button" class="small-button delete-button prop-decide" data-uid="${escapeHTML(p.id)}" data-approve="0">Refuse</button></td></tr>`).join("")}</tbody></table></div>` : '<p class="empty-state">No proposal is waiting.</p>';
  } catch (error) { console.error(error); }
}

byId("dean-form").addEventListener("submit", async event => {
  event.preventDefault();
  const email = byId("dean-email").value.trim().toLowerCase();
  if (!email) return;
  try {
    await callFn("appointRole", { role: "dean", email });
    byId("dean-email").value = "";
    note("dean-message", "Dean appointed. He sees a Dean link after signing in again.");
    await loadSupervisors();
  } catch (error) { console.error(error); note("dean-message", authErrorMessage(error), true); }
});

byId("admin-deans").addEventListener("click", async event => {
  const button = event.target.closest(".remove-dean");
  if (!button || !window.confirm("Remove this dean?")) return;
  try { await db.collection("deans").doc(button.dataset.id).delete(); await loadSupervisors(); }
  catch (error) { note("dean-message", authErrorMessage(error), true); }
});

byId("admin-proposals").addEventListener("click", async event => {
  const button = event.target.closest(".prop-decide"); if (!button) return;
  button.disabled = true;
  try { await callFn("decideSupervisor", { uid: button.dataset.uid, approve: button.dataset.approve === "1" }); await loadSupervisors(); }
  catch (error) { console.error(error); note("dean-message", error.message || "Could not do it.", true); button.disabled = false; }
});

byId("supervisor-form").addEventListener("submit", async event => {
  event.preventDefault();
  const email = byId("supervisor-email").value.trim().toLowerCase();
  if (!email) return;
  try {
    await callFn("appointRole", { role: "supervisor", email });
    byId("supervisor-email").value = "";
    note("supervisor-message", "Supervisor appointed. He sees a Supervisor link after signing in again.");
    await loadSupervisors();
  } catch (error) {
    console.error(error);
    note("supervisor-message", authErrorMessage(error), true);
  }
});

byId("admin-supervisors").addEventListener("change", async event => {
  const select = event.target.closest(".sup-dean"); if (!select) return;
  try {
    const ref = db.collection("supervisors").doc(select.dataset.id);
    const snap = await ref.get(); const next = { ...snap.data() };
    if (select.value) next.deanId = select.value; else delete next.deanId;
    await ref.set(next);
    note("supervisor-message", select.value ? "The dean is set." : "This supervisor is now directly under you.");
  } catch (error) { console.error(error); note("supervisor-message", authErrorMessage(error), true); }
});

byId("admin-supervisors").addEventListener("click", async event => {
  const button = event.target.closest(".remove-supervisor");
  if (!button || !window.confirm("Remove this supervisor?")) return;
  try {
    await db.collection("supervisors").doc(button.dataset.id).delete();
    await loadSupervisors();
  } catch (error) {
    note("supervisor-message", authErrorMessage(error), true);
  }
});

/* ---------- messages ---------- */

let threads = [];

/* Conversations are kept in separate boxes, one per kind of person, so they never get mixed. */
const THREAD_GROUPS = [["merchant", "Sellers"], ["courier", "Delivery partners"], ["customer", "Customers"], ["supervisor", "Supervisors"]];

function threadGroupOf(t) {
  if (typeof roleIds !== "undefined" && roleIds.supervisor && roleIds.supervisor.has(t.id)) return "supervisor";
  return t.role === "merchant" || t.role === "courier" ? t.role : "customer";
}

let threadView = "inbox";   /* "inbox" or "archived" */

function threadRow(t) {
  return `<div class="thread-item"><button type="button" class="thread-arch small-button" data-uid="${escapeHTML(t.id)}" title="${threadView === "archived" ? "Back to the inbox" : "Archive"}" aria-label="${threadView === "archived" ? "Back to the inbox" : "Archive"}">${threadView === "archived" ? "↩" : "📥"}</button><button type="button" class="thread-row ${t.lastFrom === "user" ? "unread" : ""}" data-uid="${escapeHTML(t.id)}" data-name="${escapeHTML(t.name || "")}">
      <strong>${escapeHTML(t.name || t.email || t.id)}</strong>
      <span class="muted">${escapeHTML(t.lastText || "")}</span>
      <small class="muted">${escapeHTML(formatDate(t.lastAt, true))}</small>
    </button></div>`;
}

function renderThreads() {
  const arch = threadView === "archived";
  const shown = threads.filter(t => (t.adminArchived === true) === arch);
  const archivedCount = threads.filter(t => t.adminArchived === true).length;
  const bar = `<div class="thread-bar"><button type="button" class="small-button thread-tab${arch ? "" : " active"}" data-view="inbox">Inbox</button><button type="button" class="small-button thread-tab${arch ? " active" : ""}" data-view="archived">Archive (${archivedCount})</button>${shown.length ? `<button type="button" class="small-button thread-all" data-action="${arch ? "unarchive" : "archive"}">${arch ? "Move all to the inbox" : "Archive all"}</button><button type="button" class="small-button thread-all danger" data-action="clear">Clear all</button>` : ""}</div>`;
  if (!shown.length) { byId("admin-threads").innerHTML = bar + `<p class="empty-state">${arch ? "The archive is empty." : "No conversations yet. People write to you from the Messages button on their pages."}</p>`; return; }
  byId("admin-threads").innerHTML = bar + `<div class="thread-groups">${THREAD_GROUPS.map(([key, label]) => {
    const list = shown.filter(t => threadGroupOf(t) === key);
    const unread = list.filter(t => t.lastFrom === "user").length;
    return `<section class="thread-box" data-group="${key}">
      <h3 class="thread-box-title">${escapeHTML(label)} <span class="count-pill">${list.length}</span>${unread ? ` <span class="unread-pill">${unread} new</span>` : ""}</h3>
      <div class="thread-list">${list.length ? list.map(threadRow).join("") : '<p class="muted thread-empty">No conversations.</p>'}</div>
    </section>`;
  }).join("")}</div>`;
}

async function manageThreads(payload) {
  try { await callFn("manageThreads", payload); } catch (error) { console.error(error); window.alert(authErrorMessage(error)); }
}
byId("admin-threads").addEventListener("click", async event => {
  const tab = event.target.closest(".thread-tab");
  if (tab) { threadView = tab.dataset.view; renderThreads(); return; }
  const one = event.target.closest(".thread-arch");
  if (one) { await manageThreads({ action: threadView === "archived" ? "unarchive" : "archive", uid: one.dataset.uid }); return; }
  const all = event.target.closest(".thread-all");
  if (all) {
    if (all.dataset.action === "clear" && !window.confirm("Delete all these conversations for good? The people will not see them any more either.")) return;
    await manageThreads({ action: all.dataset.action, view: threadView });
    return;
  }
  const row = event.target.closest(".thread-row");
  if (row) openSupportChat(row.dataset.uid, row.dataset.name);
});

byId("broadcast-form").addEventListener("submit", async event => {
  event.preventDefault();
  const text = byId("broadcast-text").value.trim();
  if (!text) return;
  const button = event.target.querySelector("button");
  button.disabled = true;
  try {
    const result = await callFn("broadcastMessage", { group: byId("broadcast-group").value, text });
    byId("broadcast-text").value = "";
    note("broadcast-message", `Sent to ${result.sent} people.`);
  } catch (error) {
    console.error(error);
    note("broadcast-message", authErrorMessage(error), true);
  } finally {
    button.disabled = false;
  }
});

/* Side inbox: a drawer opened from the floating button. */
byId("inbox-fab").addEventListener("click", () => byId("messages-panel").classList.toggle("open"));
byId("inbox-close").addEventListener("click", () => byId("messages-panel").classList.remove("open"));

byId("start-chat-form").addEventListener("submit", async event => {
  event.preventDefault();
  const email = byId("start-chat-email").value.trim().toLowerCase();
  try {
    const snap = await db.collection("users").where("email", "==", email).limit(1).get();
    if (snap.empty) return note("start-chat-message", "No account with this email.", true);
    const doc = snap.docs[0];
    note("start-chat-message", "");
    openSupportChat(doc.id, doc.data().fullName || email);
  } catch (error) {
    console.error(error);
    note("start-chat-message", authErrorMessage(error), true);
  }
});

/* ---------- features & requirements ---------- */

const SETTINGS_ROWS = [
  ["customer", "Customer account", [
    ["registrationOpen", "Registration open"], ["requirePhone", "Phone required"], ["requireId", "ID card required"],
    ["requireLocation", "Location required to order"], ["canOrder", "Ordering allowed"]]],
  ["merchant", "Seller account", [
    ["applicationsOpen", "Applications open"], ["requireId", "ID card required"], ["requireLocation", "Shop location required"],
    ["requireProductPhoto", "Product photo required"], ["canAddProducts", "Adding products allowed"],
    ["debtPause", "Pause a seller at €1000 debt"],
    ...(MK_EDITION.dz ? [["autoDebtFromCredit", "Pay a seller's debt automatically from the credit he earns"]] : [])]],
  ["courier", "Delivery partner account", [
    ["applicationsOpen", "Applications open"], ["requireId", "ID card required"], ["requireLocation", "Location required to be available"]]],
  ["supervisor", "Supervisor account", [["requireId", "ID card required"], ["canInvite", "Invitations allowed"]]],
  ["global", "Everyone", [["qrDelivery", "Delivery confirmed by scanning the customer's QR code"], ["chat", "Chat and messages"], ["showCollabMoney", "Show the credit window and fee statements on collaborators' accounts"],
    ...(MK_EDITION.dz ? [["autoDebtFromCredit", "Take debts from the credit automatically (sellers, delivery partners, supervisors, deans)"]] : [])]]
];

let features = mergeFeatures({});

let usdRateNow = 0, gbpRateNow = 0;
async function loadUsdRateAdmin() {
  if (MK_EDITION.dz) return;
  usdRateNow = await loadUsdRate(); gbpRateNow = GBP_RATE;
  renderSettings();
}

function usdRateBlock() {
  if (MK_EDITION.dz) return "";
  return `<div class="limit-box" id="usd-box"><h3>US dollar and British pound</h3>
    <p class="muted">Prices are in euros. Customers can also pay in dollars or in pounds at the rates you set here (how much of that currency for 1 euro). Empty or 0 = that currency is switched off.</p>
    <label class="limit-field">Dollars per 1 euro
      <input type="number" id="usd-rate" min="0" step="0.0001" value="${usdRateNow || ""}" placeholder="e.g. 1.08"></label>
    <label class="limit-field">Pounds per 1 euro
      <input type="number" id="gbp-rate" min="0" step="0.0001" value="${gbpRateNow || ""}" placeholder="e.g. 0.85"></label>
    <button type="button" class="button button-teal" id="save-usd-rate">Save</button></div>`;
}

let providerFees = { doctor: 0, agency: 0, taxi: 0, shop: 10 };
async function loadProviderFees() {
  try {
    const snap = await db.collection("settings").doc("providerFees").get();
    if (snap.exists) providerFees = { doctor: Number(snap.data().doctor) || 0, agency: Number(snap.data().agency) || 0, taxi: Number(snap.data().taxi) || 0, shop: snap.data().shop === undefined || snap.data().shop === null || !Number.isFinite(Number(snap.data().shop)) ? 10 : Number(snap.data().shop) };
  } catch { /* optional */ }
  renderSettings();
}

function providerFeesBlock() { return ""; }   /* the fees now live in the "Site fees by kind of account" panel */

/* One switch per way of paying: the owner turns each on or off for the whole store. */
function paymentSwitchBlock() {
  const rows = [
    ...(MK_EDITION.dz ? [["creditPay", "💳", "Pay with account credit"]] : []),
    ["cashOnDelivery", "💵", "Cash on delivery"]
  ];
  return `<div class="pay-switch-box"><h3>Ways of paying</h3><p class="muted">Turn each way of paying on or off for the whole store. A way that is off disappears from the checkout and the server refuses it.</p>
    <div class="pay-switches">${rows.map(([key, icon, label]) => {
      const on = features.global[key] !== false;
      return `<button type="button" class="toggle-button pay-switch ${on ? "on" : "off"}" data-group="global" data-key="${key}" aria-pressed="${on}"><span class="pay-icon" aria-hidden="true">${icon}</span><span>${escapeHTML(label)}</span><strong>${on ? "ON" : "OFF"}</strong></button>`;
    }).join("")}</div></div>`;
}

function renderSettings() {
  renderDebtSwitch();
  byId("admin-settings").innerHTML = paymentSwitchBlock() + usdRateBlock() + providerFeesBlock() + `<div class="table-wrap"><table class="orders-table settings-table"><tbody>${SETTINGS_ROWS.map(([group, title, keys]) => `
    <tr><th scope="row">${escapeHTML(title)}</th><td><div class="switch-grid">${keys.map(([key, label]) => {
      const on = features[group][key] !== false && features[group][key] === true;
      return `<button type="button" class="toggle-button ${on ? "on" : "off"}" data-group="${group}" data-key="${key}" aria-pressed="${on}"><span class="tick" aria-hidden="true">${on ? "✓" : "✕"}</span><span>${escapeHTML(label)}</span></button>`;
    }).join("")}</div></td></tr>`).join("")}</tbody></table></div>`;
}

function renderDebtSwitch() {
  const on = features.merchant.debtPause === true;
  const def = DEBT_RULE.limit;
  const list = typeof sellers !== "undefined" ? sellers : [];
  const own = Object.entries(DEBT_RULE.sellers || {}).filter(([, v]) => Number(v) > 0);
  const nameOf = id => { const s = list.find(x => x.id === id); return s ? (s.businessName || s.fullName || id) : id; };
  const options = list.map(x => `<option value="${escapeHTML(x.id)}">${escapeHTML(x.businessName || x.fullName || x.email || x.id)}</option>`).join("");
  byId("debt-switch").innerHTML = `<button type="button" class="toggle-button ${on ? "on" : "off"}" data-group="merchant" data-key="debtPause" aria-pressed="${on}">${on ? "✓" : "✕"} Pause a seller's account when his debt reaches his limit</button>
    <small class="muted">${on ? "ON: a seller who reaches his debt limit is paused (his products are hidden and he cannot take orders) until you record his payment." : "OFF: sellers are never paused automatically, whatever they owe."}</small>
    <div class="debt-limits">
      <label class="limit-field">Default limit for everyone (€)
        <input type="number" id="debt-default" min="1" step="1" value="${escapeHTML(String(def))}"></label>
      <button type="button" class="small-button" id="save-default-limit">Save</button>
      <label class="limit-field">A limit for one seller
        <select id="debt-seller"><option value="">Choose a seller…</option>${options}</select></label>
      <label class="limit-field">His limit (€)
        <input type="number" id="debt-own" min="1" step="1" placeholder="e.g. 500"></label>
      <button type="button" class="small-button" id="save-own-limit">Set</button>
      <button type="button" class="small-button" id="reset-own-limit">Back to default</button>
    </div>
    ${own.length ? `<div class="limit-chips">${own.map(([id, v]) => `<span class="count-pill">${escapeHTML(nameOf(id))}: ${formatPrice(v)}</span>`).join(" ")}</div>` : ""}`;
}

async function saveDebtRule(next, okText) {
  note("settings-message", "Saving…");
  try {
    try {
      await db.collection("settings").doc("debt").set({ limit: next.limit, sellers: next.sellers });
    } catch (error) {
      /* the database rules on Firebase may not include the new rule yet: the server can do the same write for the owner */
      if (!/permission/i.test(String(error && error.code))) throw error;
      await callFn("saveDebtLimits", { limit: next.limit, sellers: next.sellers });
    }
    DEBT_RULE = next;
    note("settings-message", okText);
  } catch (error) {
    console.error(error);
    note("settings-message", `${authErrorMessage(error)}${error && error.code ? " (" + error.code + ")" : ""}`, true);
  }
  renderDebtSwitch();
  renderDebts();
}

byId("debt-switch").addEventListener("click", async event => {
  const id = event.target.id;
  if (id === "save-default-limit") {
    const value = Math.round(Number(byId("debt-default").value) * 100) / 100;
    if (!(value >= 1)) return note("settings-message", MK_EDITION.localizeText("Enter a limit of at least €1."), true);
    return saveDebtRule({ limit: value, sellers: DEBT_RULE.sellers || {} }, "Default limit saved.");
  }
  if (id === "save-own-limit" || id === "reset-own-limit") {
    const seller = byId("debt-seller").value;
    if (!seller) return note("settings-message", "Choose a seller first.", true);
    const map = { ...(DEBT_RULE.sellers || {}) };
    if (id === "reset-own-limit") delete map[seller];
    else {
      const value = Math.round(Number(byId("debt-own").value) * 100) / 100;
      if (!(value >= 1)) return note("settings-message", MK_EDITION.localizeText("Enter a limit of at least €1."), true);
      map[seller] = value;
    }
    return saveDebtRule({ limit: DEBT_RULE.limit, sellers: map }, id === "reset-own-limit" ? "This seller uses the default limit again." : "Limit saved for this seller.");
  }
});

async function toggleFeature(event) {
  const button = event.target.closest(".toggle-button");
  if (!button) return;
  const { group, key } = button.dataset;
  const value = !features[group][key];
  button.disabled = true;
  try {
    await db.collection("settings").doc("features").set({ [group]: { ...features[group], [key]: value } }, { merge: true });
    features[group][key] = value;
    note("settings-message", "Saved.");
  } catch (error) {
    console.error(error);
    note("settings-message", authErrorMessage(error), true);
  }
  renderSettings();
}
byId("admin-settings").addEventListener("click", toggleFeature);
byId("debt-switch").addEventListener("click", toggleFeature);

async function loadSettings() {
  features = await getFeatures(true);
  await loadDebtRule();
  renderSettings();
}

/* ---------- users: search, block, ID card, message ---------- */

let allUsers = [];
let blockedIds = new Set();
let usersMe = "", usersMeEmail = "";

const USER_GROUPS = [
  ["admin", "Owner (admin)"], ["supervisor", "Supervisors"], ["merchant", "Sellers"], ["courier", "Delivery partners"], ["customer", "Customers"]
];
let roleIds = { admin: new Set(), supervisor: new Set(), merchant: new Set(), courier: new Set() };

function userGroupOf(u) {
  for (const [key] of USER_GROUPS) if (key !== "customer" && roleIds[key].has(u.id)) return key;
  return "customer";
}

function avatarHTML(u, size = 34) {
  const letter = escapeHTML(String(u.fullName || u.email || "?").trim().charAt(0).toUpperCase() || "?");
  return u.photo
    ? `<img class="uavatar" style="width:${size}px;height:${size}px" src="${escapeHTML(u.photo)}" alt="">`
    : `<span class="uavatar uavatar-letter" style="width:${size}px;height:${size}px">${letter}</span>`;
}

function userRow(u) {
  const blocked = blockedIds.has(u.id);
  const also = USER_GROUPS.filter(([key]) => key !== "customer" && key !== userGroupOf(u) && roleIds[key].has(u.id)).map(([, label]) => label);
  return `<tr class="${blocked ? "blocked-row" : ""}"><td><div class="user-cell">${avatarHTML(u)}<div><strong>${escapeHTML(u.fullName || u.email || u.id)}</strong>${blocked ? ' <span class="status-pill status-rejected">blocked</span>' : ""}${also.length ? ` <small class="muted">+ ${escapeHTML(also.join(", "))}</small>` : ""}<br><small class="muted">${escapeHTML(u.customerId || "")}</small></div></div></td>
      <td>${escapeHTML(u.email || "")}<br><small class="muted">${escapeHTML(u.phone || "")}</small></td>
      <td><div class="sum-actions">
        ${u.id === usersMe ? '<a class="small-button" href="account.html">Edit my account</a>' : `<button type="button" class="small-button ${blocked ? "" : "delete-button"} block-user" data-id="${escapeHTML(u.id)}" data-to="${blocked ? "0" : "1"}">${blocked ? "Unblock" : "Block"}</button>`}
        <button type="button" class="small-button view-user-id" data-id="${escapeHTML(u.id)}" data-name="${escapeHTML(u.fullName || u.email || "")}">View ID</button>
        <button type="button" class="small-button msg-user" data-id="${escapeHTML(u.id)}" data-name="${escapeHTML(u.fullName || u.email || "")}">Message</button>
        ${waButton(u.phone, u.country, "WhatsApp", `Hello ${u.fullName || ""}, Plazavo`)}
      </div></td></tr>`;
}

function renderUsers() {
  const needle = byId("users-search").value.trim().toLowerCase();
  const list = allUsers.filter(u => !needle || [u.email, u.fullName, u.phone, u.customerId].some(v => String(v || "").toLowerCase().includes(needle)));
  if (!list.length) { byId("admin-users").innerHTML = '<p class="empty-state">No users match.</p>'; return; }
  byId("admin-users").innerHTML = USER_GROUPS.map(([key, label]) => {
    const rows = list.filter(u => userGroupOf(u) === key);
    if (!rows.length) return "";
    return `<section class="user-group" data-group="${key}">
      <h3 class="user-group-title">${escapeHTML(label)} <span class="count-pill">${rows.length}</span></h3>
      <div class="table-wrap"><table class="orders-table users-table"><thead><tr><th>Account</th><th>Contact</th><th></th></tr></thead><tbody>${rows.slice(0, 100).map(userRow).join("")}</tbody></table></div>
    </section>`;
  }).join("");
}

byId("users-search").addEventListener("input", renderUsers);

byId("admin-users").addEventListener("click", async event => {
  const block = event.target.closest(".block-user");
  const id = event.target.closest(".view-user-id");
  const msg = event.target.closest(".msg-user");
  if (id) return showKycModal(id.dataset.id, id.dataset.name);
  if (msg) return openSupportChat(msg.dataset.id, msg.dataset.name);
  if (!block) return;
  const to = block.dataset.to === "1";
  if (to && !window.confirm("Block this account? He will not be able to order, write messages or list products.")) return;
  block.disabled = true;
  try {
    if (to) await db.collection("blocked").doc(block.dataset.id).set({ uid: block.dataset.id, at: new Date().toISOString(), by: usersMe });
    else await db.collection("blocked").doc(block.dataset.id).delete();
    if (to) blockedIds.add(block.dataset.id); else blockedIds.delete(block.dataset.id);
    note("users-message", to ? "Account blocked." : "Account unblocked.");
  } catch (error) {
    console.error(error);
    note("users-message", authErrorMessage(error), true);
  }
  renderUsers();
});

async function loadUsers() {
  const ids = async name => { try { return new Set((await db.collection(name).get()).docs.map(doc => doc.id)); } catch { return new Set(); } };
  const [users, blocked, admins, supervisors, merchants, couriers] = await Promise.all([db.collection("users").get(), db.collection("blocked").get(), ids("admins"), ids("supervisors"), ids("merchants"), ids("couriers")]);
  admins.add(usersMe);   /* the list of admins is private; at least I am one */
  roleIds = { admin: admins, supervisor: supervisors, merchant: merchants, courier: couriers };
  allUsers = users.docs.map(doc => ({ ...doc.data(), id: doc.id })).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  /* the owner always sees his own account in the list, even before he has saved a profile */
  if (usersMe && !allUsers.some(u => u.id === usersMe)) allUsers.unshift({ id: usersMe, email: usersMeEmail, fullName: "Owner" });
  blockedIds = new Set(blocked.docs.map(doc => doc.id));
  renderUsers();
}

/* ---------- start ---------- */

/* ---------- reports from supervisors ---------- */

let reports = [];
let reportsReady = false;

function reportCard(r) {
  const sig = r.signature || {};
  return `<article class="report-card ${r.status === "new" ? "unread" : ""}" data-id="${escapeHTML(r.id)}">
    <header><strong>${escapeHTML(r.sellerName || "Store")}</strong>
      ${r.status === "new" ? '<span class="unread-pill">new</span>' : ""}
      <small class="muted">${escapeHTML(formatDate(r.at, true))} · ${Number(r.words) || 0} words</small></header>
    <p class="report-text">${escapeHTML(r.text || "")}</p>
    <div class="signature-block">
      <span class="signature-label">Signed electronically</span>
      ${/^data:image\/(png|jpeg|webp);base64,/.test(r.signatureImage || "") ? `<img class="report-sig-img" alt="Signature and stamp" src="${escapeHTML(r.signatureImage)}">` : `<span class="signature-name">${escapeHTML(sig.name || r.supervisorName || "")}</span>`}
      <ul class="report-facts">
        <li>Writer: <strong>${escapeHTML((r.signer || {}).name || sig.name || r.supervisorName || "")}</strong>${(r.signer || {}).email ? " · " + escapeHTML(r.signer.email) : ""}${(r.signer || {}).phone ? " · " + escapeHTML(r.signer.phone) : ""} · Supervisor, on behalf of the owner</li>
        <li>Date: ${escapeHTML(formatDate(sig.at || r.at, true))}</li>
        <li>Location: ${r.place ? `<a href="https://www.google.com/maps?q=${Number(r.place.lat)},${Number(r.place.lng)}" target="_blank" rel="noopener">${Number(r.place.lat).toFixed(5)}, ${Number(r.place.lng).toFixed(5)}</a>` : "not shared"}</li>
        ${r.sellerInfo ? `<li>Store: <strong>${escapeHTML(r.sellerInfo.name || "")}</strong>${r.sellerInfo.owner ? " · " + escapeHTML(r.sellerInfo.owner) : ""}${r.sellerInfo.phone ? " · " + escapeHTML(r.sellerInfo.phone) : ""}${r.sellerInfo.email ? " · " + escapeHTML(r.sellerInfo.email) : ""}${r.sellerInfo.city ? " · " + escapeHTML(r.sellerInfo.city) : ""}${r.sellerInfo.address ? ", " + escapeHTML(r.sellerInfo.address) : ""}</li>` : ""}
      </ul>
      <small class="muted">Code ${escapeHTML(sig.fingerprint || "")}</small>
    </div>
    <div class="sum-actions">
      ${r.status === "new" ? `<button type="button" class="small-button mark-report" data-id="${escapeHTML(r.id)}">Mark as read</button>` : ""}
      <button type="button" class="small-button msg-user" data-id="${escapeHTML(r.supervisorUid)}" data-name="${escapeHTML(r.supervisorName || "")}">Reply</button>
    </div></article>`;
}

function renderReports() {
  const fresh = reports.filter(r => r.status === "new").length;
  const badge = byId("reports-new");
  badge.hidden = !fresh; badge.textContent = `${fresh} new`;
  byId("admin-reports").innerHTML = reports.length ? reports.map(reportCard).join("") : '<p class="empty-state">No reports yet.</p>';
}

byId("admin-reports").addEventListener("click", async event => {
  const mark = event.target.closest(".mark-report");
  const reply = event.target.closest(".msg-user");
  if (reply) return openSupportChat(reply.dataset.id, reply.dataset.name);
  if (!mark) return;
  mark.disabled = true;
  try { await db.collection("reports").doc(mark.dataset.id).update({ status: "read", readAt: new Date().toISOString() }); }
  catch (error) { console.error(error); mark.disabled = false; }
});

function watchReports() {
  db.collection("reports").orderBy("at", "desc").limit(50).onSnapshot(snap => {
    const known = new Set(reports.map(r => r.id));
    reports = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    renderReports();
    if (reportsReady) reports.filter(r => !known.has(r.id) && r.status === "new").forEach(r => alertUser(`Report from ${r.supervisorName || "a supervisor"} about ${r.sellerName || "a store"}`));
    reportsReady = true;
  }, error => { console.error(error); byId("admin-reports").innerHTML = '<p class="empty-state">Could not load reports.</p>'; });
}

(async () => {
  if (!initBackend()) return;
  const state = await getAuthState();
  if (!state.user || !state.isAdmin) return;

  usersMe = state.user.uid;
  usersMeEmail = String(state.user.email || "").toLowerCase();
  try { await loadSettings(); } catch (error) { console.error(error); byId("admin-settings").innerHTML = '<p class="empty-state">Could not load the settings.</p>'; }
  try { await loadUsers(); } catch (error) { console.error(error); byId("admin-users").innerHTML = '<p class="empty-state">Could not load users.</p>'; }
  try { await loadDebts(); } catch (error) { console.error(error); byId("admin-debts").innerHTML = '<p class="empty-state">Could not load debts.</p>'; }
  try { await loadSupervisors(); } catch (error) { console.error(error); }
  try { watchReports(); } catch (error) { console.error(error); }
  try {
    db.collection("threads").orderBy("lastAt", "desc").limit(50).onSnapshot(snap => {
      const before = new Map(threads.map(t => [t.id, t.lastAt]));
      threads = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      renderThreads();
      threads.forEach(t => {
        if (t.lastFrom === "user" && before.size && before.get(t.id) !== t.lastAt) alertUser(`${t.name || "A user"}: ${t.lastText || ""}`);
      });
    }, error => { console.error(error); byId("admin-threads").innerHTML = '<p class="empty-state">Could not load messages.</p>'; });
  } catch (error) { console.error(error); }
})();

byId("admin-settings").addEventListener("click", async event => {
  if (event.target.id !== "save-usd-rate") return;
  const value = Math.round(Number(byId("usd-rate").value) * 10000) / 10000;
  const gbp = Math.round(Number((byId("gbp-rate") || {}).value || 0) * 10000) / 10000;
  if (!(value >= 0) || !(gbp >= 0)) return note("settings-message", "Enter a valid rate.", true);
  try {
    const doc = {}; if (value > 0) doc.usdRate = value; if (gbp > 0) doc.gbpRate = gbp;
    if (Object.keys(doc).length) await db.collection("settings").doc("currency").set(doc);
    else await db.collection("settings").doc("currency").delete();
    usdRateNow = value; gbpRateNow = gbp; try { localStorage.setItem("mk-usd-rate", String(value)); localStorage.setItem("mk-gbp-rate", String(gbp)); } catch { /* ignore */ }
    note("settings-message", Object.keys(doc).length ? "Rates saved." : "Dollars and pounds switched off.");
  } catch (error) {
    console.error(error);
    note("settings-message", authErrorMessage(error), true);
  }
});
loadUsdRateAdmin();
loadProviderFees();


/* ---------- the delivery fee chain ---------- */

const SHARE_DEFAULT = { dean: 25, supervisor: 15 };
const shareCell = (role, x) => `<input type="number" class="share-input" min="0" max="90" step="0.5" value="${typeof x.sharePercent === "number" ? x.sharePercent : SHARE_DEFAULT[role]}" data-role="${role}" data-id="${escapeHTML(x.id)}" aria-label="Percentage"> % <button type="button" class="small-button share-save" data-role="${role}" data-id="${escapeHTML(x.id)}">Save</button>`;
const correctButton = (role, x) => `<button type="button" class="small-button fee-correct" data-role="${role}" data-id="${escapeHTML(x.id)}" data-name="${escapeHTML(x.email || "")}" data-earned="${Number(x.feeEarned || 0)}" data-debt="${Number(x.feeDebt || 0)}">Correct amounts</button> `;
async function loadFeeChain() {
  const box = byId("fee-chain"); if (!box) return;
  try {
    const [cs, ss, ds, led] = await Promise.all([db.collection("couriers").get(), db.collection("supervisors").get(), db.collection("deans").get(), db.collection("feeLedger").orderBy("at", "desc").limit(40).get()]);
    const couriersList = cs.docs.map(d => ({ ...d.data(), id: d.id }));
    const sups = ss.docs.map(d => ({ ...d.data(), id: d.id }));
    const deans = ds.docs.map(d => ({ ...d.data(), id: d.id }));
    const supName = id => (sups.find(s => s.id === id) || {}).email || "";
    const deanName = id => (deans.find(s => s.id === id) || {}).email || "";
    const sum = (list, key) => list.reduce((a, x) => a + Number(x[key] || 0), 0);
    const owing = couriersList.filter(c => Number(c.feeDebt || 0) > 0).sort((a, b) => b.feeDebt - a.feeDebt);
    const label = { fee: "Fee added", collect: "Collected", handover: "Handed to the dean", "dean-handover": "Handed to the site", "dean-share": "Dean's share", adjust: "Correction by the owner" };
    box.innerHTML = `<div class="stat-tiles">
      <article class="stat-tile"><span>Owed by delivery partners</span><strong>${formatPrice(sum(couriersList, "feeDebt"))}</strong></article>
      <article class="stat-tile"><span>Owed by supervisors</span><strong>${formatPrice(sum(sups, "feeDebt"))}</strong><small class="muted">to their dean or to you</small></article>
      <article class="stat-tile"><span>Owed by deans</span><strong>${formatPrice(sum(deans, "feeDebt"))}</strong><small class="muted">to hand over to you</small></article>
      <article class="stat-tile"><span>Handed over to you</span><strong>${formatPrice(sum(deans, "feeHandedOver") + sum(sups.filter(s => !s.deanId), "feeHandedOver"))}</strong></article>
      <article class="stat-tile"><span>Supervisors' shares</span><strong>${formatPrice(sum(sups, "feeEarned"))}</strong></article>
      <article class="stat-tile"><span>Deans' shares</span><strong>${formatPrice(sum(deans, "feeEarned"))}</strong></article></div>
      <h3>Deans</h3>
      ${deans.length ? `<div class="table-wrap"><table class="orders-table form-table chain-table"><thead><tr><th>Dean</th><th class="num">Owes you</th><th class="num">His share</th><th class="num">Handed over</th><th class="num">His percentage</th><th></th></tr></thead><tbody>${deans.map(d => `<tr><td>${escapeHTML(d.email || d.id)}</td><td class="num">${formatPrice(Number(d.feeDebt || 0))}</td><td class="num">${formatPrice(Number(d.feeEarned || 0))}</td><td class="num">${formatPrice(Number(d.feeHandedOver || 0))}</td><td class="num">${shareCell("dean", d)}</td><td>${correctButton("dean", d)}${Number(d.feeDebt || 0) > 0 ? `${proofPickerHTML()}<button type="button" class="small-button fee-dean" data-id="${escapeHTML(d.id)}" data-name="${escapeHTML(d.email || "")}" data-held="${Number(d.feeDebt || 0)}">I received the fees</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : '<p class="empty-state">No dean yet.</p>'}
      <h3>Supervisors</h3>
      ${sups.length ? `<div class="table-wrap"><table class="orders-table form-table chain-table"><thead><tr><th>Supervisor</th><th>Dean</th><th class="num">Owes upward</th><th class="num">His share</th><th class="num">Handed up</th><th class="num">His percentage</th><th></th></tr></thead><tbody>${sups.map(s => `<tr><td>${escapeHTML(s.email || s.id)}</td><td>${escapeHTML(deanName(s.deanId) || "—")}</td><td class="num">${formatPrice(Number(s.feeDebt || 0))}</td><td class="num">${formatPrice(Number(s.feeEarned || 0))}</td><td class="num">${formatPrice(Number(s.feeHandedOver || 0))}</td><td class="num">${shareCell("supervisor", s)}</td><td>${correctButton("supervisor", s)}${Number(s.feeDebt || 0) > 0 && (!s.deanId || (deans.find(d => d.id === s.deanId) || {}).locked === true) ? `${proofPickerHTML()}<button type="button" class="small-button fee-handover" data-id="${escapeHTML(s.id)}" data-name="${escapeHTML(s.email || "")}" data-held="${Number(s.feeDebt || 0)}">I received the fees</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : '<p class="empty-state">No supervisor yet.</p>'}
      <h3>Delivery partners who owe the site</h3>
      ${owing.length ? `<div class="table-wrap"><table class="orders-table"><thead><tr><th>Delivery partner</th><th>Collected by</th><th class="num">Owes</th><th></th></tr></thead><tbody>${owing.map(c => `<tr><td>${escapeHTML(c.fullName || c.email || c.id)}${c.payClaim ? `<br><small class="error">says he paid ${formatPrice(c.payClaim.amount)}</small>${proofLinkHTML(c.payClaim.proofId)}` : ""}</td><td>${escapeHTML((() => { const sv = sups.find(x => x.id === c.invitedBy); if (!sv) return "the owner (no supervisor)"; if (sv.locked) return (deanName(sv.deanId) ? deanName(sv.deanId) + " (dean: supervisor locked)" : "the owner (supervisor locked)"); return sv.email || ""; })())}</td><td class="num">${formatPrice(Number(c.feeDebt || 0))}</td><td>${proofPickerHTML()}<button type="button" class="small-button fee-collect" data-id="${escapeHTML(c.id)}" data-name="${escapeHTML(c.fullName || c.email || "")}" data-owes="${Number(c.feeDebt || 0)}">I received the fees</button></td></tr>`).join("")}</tbody></table></div>` : '<p class="empty-state">No delivery partner owes anything.</p>'}
      ${led.docs.length ? `<details><summary>Latest movements (${led.docs.length})</summary><div class="table-wrap"><table class="orders-table"><tbody>${led.docs.map(d => d.data()).map(e => `<tr><td>${escapeHTML(formatDate(e.at, true))}</td><td>${escapeHTML(label[e.type] || e.type)}</td><td>${escapeHTML(e.courierName || e.supervisorName || e.deanName || "")}</td><td class="num">${formatPrice(e.amount)}${proofLinkHTML(e.proofId)}</td></tr>`).join("")}</tbody></table></div></details>` : ""}`;
  } catch (error) { console.error(error); box.innerHTML = '<p class="empty-state">Could not load this section.</p>'; }
}

document.addEventListener("click", async event => {
  const sv = event.target.closest(".share-save"), cr = event.target.closest(".fee-correct");
  if (sv) {
    const input = document.querySelector(`.share-input[data-role="${sv.dataset.role}"][data-id="${sv.dataset.id}"]`);
    sv.disabled = true;
    try { await callFn("setSharePercent", { role: sv.dataset.role, uid: sv.dataset.id, percent: input.value }); note("fee-message", "This account's percentage is saved. It applies to what is collected from now on."); }
    catch (error) { note("fee-message", error.message || "Could not save it.", true); }
    finally { sv.disabled = false; }
    return;
  }
  if (cr) {
    const earned = window.prompt(`${cr.dataset.name}: his share earned so far (now ${formatPrice(Number(cr.dataset.earned))}). Leave the number or type the right one:`, cr.dataset.earned);
    if (earned === null) return;
    const debt = window.prompt(`${cr.dataset.name}: what he still owes upward (now ${formatPrice(Number(cr.dataset.debt))}):`, cr.dataset.debt);
    if (debt === null) return;
    const reason = window.prompt("Reason of the correction (kept in the statement):", "");
    if (reason === null) return;
    cr.disabled = true;
    try { await callFn("adjustEarnings", { role: cr.dataset.role, uid: cr.dataset.id, feeEarned: earned, feeDebt: debt, note: reason }); note("fee-message", "Corrected. The change is kept in the statement."); await loadFeeChain(); }
    catch (error) { note("fee-message", error.message || "Could not correct it.", true); cr.disabled = false; }
    return;
  }
  const collect = event.target.closest(".fee-collect"), hand = event.target.closest(".fee-handover"), dean = event.target.closest(".fee-dean");
  const button = collect || hand || dean; if (!button) return;
  const max = Number(collect ? button.dataset.owes : button.dataset.held);
  const raw = window.prompt(collect ? `How much did ${button.dataset.name} pay you? (he owes ${formatPrice(max)})` : `How much did ${button.dataset.name} hand over to you? (he owes ${formatPrice(max)})`, String(max));
  if (raw === null) return;
  const amount = Math.round(Number(raw) * 100) / 100;
  if (!(amount > 0) || amount > max + 0.0001) return note("fee-message", `Enter an amount up to ${formatPrice(max)}.`, true);
  if (!confirmReceived(button.dataset.name, amount)) return;
  const proof = await readProof(button.closest("td")).catch(error => { note("fee-message", error.message, true); return null; }); if (proof === null) return;
  const extra = proof ? { proof } : {};
  button.disabled = true;
  try {
    await callFn(collect ? "collectCourierFee" : dean ? "recordDeanHandover" : "recordSupervisorHandover", collect ? { courierId: button.dataset.id, amount, ...extra } : dean ? { deanId: button.dataset.id, amount, ...extra } : { supervisorId: button.dataset.id, amount, ...extra });
    note("fee-message", "Recorded.");
  } catch (error) { note("fee-message", error.message || "Could not record it.", true); }
  loadFeeChain();
});
loadFeeChain();


/* ---------- site fees: one rate per kind, free start, and an own rate per account ---------- */
const FEE_NAMES = { shop: "Sellers", restaurant: "Restaurants", pharmacy: "Pharmacies", doctor: "Doctors", agency: "Travel agencies", taxi: "Taxi drivers", barber: "Barbers", hotel: "Hotels" };
const FEE_BASIS = { shop: "on the price he types", restaurant: "on the price he types", pharmacy: "on the price he types", doctor: "a fixed amount per finished booking", agency: "a fixed amount per finished booking", taxi: "a fixed amount per finished booking", barber: "a fixed amount per finished booking", hotel: "a fixed amount per finished booking" };
let feePlanNow = null, feeAccounts = [];

function tenureText(createdAt) {
  const start = new Date(createdAt);
  if (!createdAt || Number.isNaN(start.getTime())) return "—";
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth();
  if (now.getDate() < start.getDate()) months -= 1;
  const anchor = new Date(start.getTime()); anchor.setMonth(anchor.getMonth() + Math.max(0, months));
  const days = Math.max(0, Math.floor((now - anchor) / 86400000));
  if (months < 0) return "0 days";
  return months > 0 ? `${months} month${months === 1 ? "" : "s"}${days ? ` ${days} day${days === 1 ? "" : "s"}` : ""}` : `${days} day${days === 1 ? "" : "s"}`;
}

function feeStateCell(account) {
  const bk = mkEffectiveBooking(feePlanNow, account);
  if (bk) {
    if (bk.source === "free") { const left = Math.max(0, Math.ceil((bk.until - Date.now()) / 86400000)); return `<span class="status-pill fee-free">Free · ${left} days left</span><br><small class="muted">then ${formatPrice(bk.afterApp)} app · ${formatPrice(bk.afterWalkin)} in person</small>`; }
    if (bk.source === "stopped") return '<span class="status-pill fee-stopped">Fees stopped</span><br><small class="muted">for this account only</small>';
    return `<span class="status-pill">${formatPrice(bk.app)} app · ${formatPrice(bk.walkin)} in person</span><br><small class="muted">${bk.source === "account" ? "own fee" : "fee of its kind"}</small>`;
  }
  const eff = mkEffectiveFee(feePlanNow, account);
  if (eff.source === "free") {
    const left = Math.max(0, Math.ceil((eff.until - Date.now()) / 86400000));
    return `<span class="status-pill fee-free">Free · ${left} days left</span><br><small class="muted">until ${escapeHTML(formatDate(new Date(eff.until).toISOString()))}</small>`;
  }
  if (eff.source === "account" && Number(eff.percent) === 0) return '<span class="status-pill fee-stopped">Fees stopped</span><br><small class="muted">for this account only</small>';
  return `<span class="status-pill">${eff.percent} %</span><br><small class="muted">${eff.source === "account" ? "own fee" : "fee of its kind"}</small>`;
}

function renderFeePlan() {
  if (!feePlanNow || !byId("feeplan")) return;
  const counts = {};
  feeAccounts.forEach(a => { const k = MK_FEE_KINDS.includes(a.kind) ? a.kind : "shop"; counts[k] = counts[k] || { all: 0, ok: 0 }; counts[k].all += 1; if (a.status === "approved") counts[k].ok += 1; });
  byId("feeplan").innerHTML = `<div class="table-wrap"><table class="orders-table feeplan-table form-table rates-table"><thead><tr><th>Kind</th><th>Accounts</th><th>Fee (0 – 25 %, or a fixed amount for bookings)</th><th>Applies</th></tr></thead><tbody>
    ${MK_FEE_KINDS.map(k => `<tr><td><strong>${FEE_NAMES[k]}</strong></td><td>${(counts[k] || { ok: 0 }).ok} active · ${(counts[k] || { all: 0 }).all} in all</td>
      <td>${MK_BOOK_KINDS.includes(k)
        ? `<div class="book-fee"><label>In the app <input type="number" class="plan-book" data-kind="${k}" data-src="app" min="0" max="100000" step="1" value="${(feePlanNow.booking[k] || {}).app ?? 0}" aria-label="${FEE_NAMES[k]} fee for a booking made in the app"> €</label><label>In person <input type="number" class="plan-book" data-kind="${k}" data-src="walkin" min="0" max="100000" step="1" value="${(feePlanNow.booking[k] || {}).walkin ?? 0}" aria-label="${FEE_NAMES[k]} fee for a person added by the provider"> €</label></div>`
        : `<input type="number" class="plan-rate" data-kind="${k}" min="0" max="25" step="0.1" value="${feePlanNow.rates[k] ?? 0}" aria-label="${FEE_NAMES[k]} fee"> %`}</td><td><small class="muted">${FEE_BASIS[k]}</small></td></tr>`).join("")}
    </tbody></table></div>
    <div class="limit-box"><label class="limit-field">Free start for every new account (months)<input type="number" id="plan-free" min="0" max="24" step="1" value="${feePlanNow.freeMonths}"></label>
    <small class="muted">0 = no free start. It is counted from the day the account was created.</small>
    <p><button type="button" class="button button-teal" id="save-plan">Save and apply</button></p></div>`;
  renderFeeAccounts();
}

function renderFeeAccounts() {
  const holder = byId("feeplan-accounts"); if (!holder) return;
  const kind = byId("fa-kind").value, term = byId("fa-search").value.trim().toLowerCase();
  const list = feeAccounts.filter(a => (!kind || (a.kind || "shop") === kind) && (!term || `${a.businessName || ""} ${a.fullName || ""} ${a.email || ""}`.toLowerCase().includes(term)))
    .sort((x, y) => String(y.createdAt || "").localeCompare(String(x.createdAt || "")));
  holder.innerHTML = list.length ? `<div class="table-wrap"><table class="orders-table feeplan-table form-table rates-table"><thead><tr><th>Account</th><th>Kind</th><th>Created</th><th>With the site for</th><th>Fee now</th><th>Own fee (% or €)</th><th></th></tr></thead><tbody>
    ${list.map(a => `<tr><td><strong>${escapeHTML(a.businessName || a.fullName || "")}</strong><br><small class="muted">${escapeHTML(a.email || "")} · ${escapeHTML(a.status || "")}</small></td>
      <td>${FEE_NAMES[a.kind || "shop"] || a.kind}</td><td>${escapeHTML(a.createdAt ? formatDate(a.createdAt) : "—")}</td><td>${escapeHTML(tenureText(a.createdAt))}</td><td>${feeStateCell(a)}</td>
      <td>${MK_BOOK_KINDS.includes(a.kind)
        ? `<div class="book-fee"><label>App <input type="number" class="acct-book" data-id="${escapeHTML(a.id)}" data-src="app" min="0" max="100000" step="1" value="${a.bookingFee && a.bookingFee.app !== undefined && a.bookingFee.app !== null ? a.bookingFee.app : ""}" placeholder="kind's" aria-label="Own fee for a booking made in the app"> €</label><label>In person <input type="number" class="acct-book" data-id="${escapeHTML(a.id)}" data-src="walkin" min="0" max="100000" step="1" value="${a.bookingFee && a.bookingFee.walkin !== undefined && a.bookingFee.walkin !== null ? a.bookingFee.walkin : ""}" placeholder="kind's" aria-label="Own fee for a person added by the provider"> €</label></div>`
        : `<input type="number" class="acct-rate" data-id="${escapeHTML(a.id)}" min="0" max="25" step="0.1" value="${a.feeRate === undefined || a.feeRate === null ? "" : a.feeRate}" placeholder="kind's fee" aria-label="Own fee">`}</td>
      <td class="acct-actions"><button type="button" class="small-button acct-save" data-id="${escapeHTML(a.id)}">Save</button>
        ${Number(a.feeRate) === 0 && a.feeRate !== null && a.feeRate !== undefined && a.feeRate !== "" ? `<button type="button" class="small-button acct-resume" data-id="${escapeHTML(a.id)}">Resume fees</button>` : `<button type="button" class="small-button delete-button acct-stop" data-id="${escapeHTML(a.id)}">Stop fees</button>`}</td></tr>`).join("")}
    </tbody></table></div>` : '<p class="empty-state">No account.</p>';
}

async function loadFeePlanPanel() {
  if (!byId("feeplan")) return;
  try {
    const [plan, accounts] = await Promise.all([loadFeePlanDocs(), db.collection("merchants").get()]);
    feePlanNow = plan;
    feeAccounts = accounts.docs.map(d => ({ ...d.data(), id: d.id }));
    const sel = byId("fa-kind");
    if (!sel.options.length) sel.innerHTML = '<option value="">All kinds</option>' + MK_FEE_KINDS.map(k => `<option value="${k}">${FEE_NAMES[k]}</option>`).join("");
    renderFeePlan();
  } catch (error) { console.error(error); byId("feeplan").innerHTML = '<p class="empty-state">Could not load the fees.</p>'; }
}

document.addEventListener("click", async event => {
  const planBtn = event.target.closest("#save-plan");
  const acctBtn = event.target.closest(".acct-save");
  const stopBtn = event.target.closest(".acct-stop, .acct-resume");
  if (stopBtn) {
    const stopping = stopBtn.classList.contains("acct-stop");
    const who = (feeAccounts.find(a => a.id === stopBtn.dataset.id) || {});
    if (stopping && !window.confirm(`Stop all site fees for "${who.businessName || who.fullName || who.email || "this account"}"? It will pay no fee until you resume them.`)) return;
    stopBtn.disabled = true;
    try {
      await callFn("setAccountFee", { id: stopBtn.dataset.id, rate: stopping ? 0 : null });
      await loadFeePlanPanel();
      note("feeplan-message", stopping ? "Fees stopped for this account." : "This account pays fees again (the fee of its kind).");
    } catch (error) { console.error(error); note("feeplan-message", authErrorMessage(error), true); stopBtn.disabled = false; }
    return;
  }
  if (!planBtn && !acctBtn) return;
  const msg = (text, bad) => note("feeplan-message", text, bad);
  try {
    if (planBtn) {
      const rates = {};
      const booking = {};
      for (const k of MK_FEE_KINDS) {
        if (MK_BOOK_KINDS.includes(k)) {
          const a = mkBookingAmount(document.querySelector(`.plan-book[data-kind="${k}"][data-src="app"]`).value), w = mkBookingAmount(document.querySelector(`.plan-book[data-kind="${k}"][data-src="walkin"]`).value);
          if (a === null || w === null) return msg("A booking fee is an amount from 0 to 100,000.", true);
          booking[k] = { app: a, walkin: w }; rates[k] = 0;
          continue;
        }
        const v = mkFeePercent(document.querySelector(`.plan-rate[data-kind="${k}"]`).value);
        if (v === null) return msg("Every fee must be from 0 to 25 %.", true);
        rates[k] = v;
      }
      const months = Math.floor(Number(byId("plan-free").value));
      if (!(months >= 0 && months <= 24)) return msg("The free start is from 0 to 24 months.", true);
      planBtn.disabled = true;
      await db.collection("settings").doc("feePlan").set({ rates, booking, freeMonths: months });
      feePlanNow = { rates, booking, freeMonths: months };
      const done = await callFn("applyFeePlan", {});
      await loadFeePlanPanel();
      msg(`Saved. ${done.accounts} accounts and ${done.products} product prices were updated.`);
    } else {
      const bookApp = document.querySelector(`.acct-book[data-id="${acctBtn.dataset.id}"][data-src="app"]`);
      if (bookApp) {
        const bookWalk = document.querySelector(`.acct-book[data-id="${acctBtn.dataset.id}"][data-src="walkin"]`);
        const ra = bookApp.value.trim(), rw = bookWalk.value.trim();
        if ((ra !== "" && mkBookingAmount(ra) === null) || (rw !== "" && mkBookingAmount(rw) === null)) return msg("A booking fee is an amount from 0 to 100,000.", true);
        acctBtn.disabled = true;
        await callFn("setAccountFee", { id: acctBtn.dataset.id, bookingApp: ra === "" ? null : Number(ra), bookingWalkin: rw === "" ? null : Number(rw) });
        await loadFeePlanPanel();
        msg(ra === "" && rw === "" ? "This account follows the fee of its kind again." : "This account's own fee is saved.");
        return;
      }
      const input = document.querySelector(`.acct-rate[data-id="${acctBtn.dataset.id}"]`);
      const raw = input.value.trim();
      if (raw !== "" && mkFeePercent(raw) === null) return msg("The fee must be from 0 to 25 %.", true);
      acctBtn.disabled = true;
      await callFn("setAccountFee", { id: acctBtn.dataset.id, rate: raw === "" ? null : Number(raw) });
      await loadFeePlanPanel();
      msg(raw === "" ? "This account follows the fee of its kind again." : "This account's own fee is saved.");
    }
  } catch (error) { console.error(error); msg(authErrorMessage(error), true); }
  finally { if (planBtn) planBtn.disabled = false; if (acctBtn) acctBtn.disabled = false; }
});
document.addEventListener("change", event => { if (event.target.id === "fa-kind") renderFeeAccounts(); });
document.addEventListener("input", event => { if (event.target.id === "fa-search") renderFeeAccounts(); });
loadFeePlanPanel();


/* ---------- customer reviews (moderation) ---------- */
async function loadAdminReviews() {
  const box = byId("admin-reviews"); if (!box) return;
  try {
    const [s, p] = await Promise.all([db.collection("siteReviews").orderBy("at", "desc").limit(30).get(), db.collection("productReviews").orderBy("at", "desc").limit(30).get()]);
    const rows = [...s.docs.map(d => ({ ...d.data(), id: d.id, type: "site" })), ...p.docs.map(d => ({ ...d.data(), id: d.id, type: "product" }))].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    box.innerHTML = rows.length ? `<div class="table-wrap"><table class="orders-table"><thead><tr><th>Date</th><th>About</th><th>Stars</th><th>Comment</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td>${escapeHTML(formatDate(r.at))}</td><td>${r.type === "site" ? "The site" : "Product " + escapeHTML(r.productId)}<br><small class="muted">${escapeHTML(r.name || "")}</small></td>
      <td>${r.type === "site" ? `${r.site}★ · trust ${r.trust}★` : `${r.stars}★`}</td><td>${escapeHTML(r.comment || "")}</td>
      <td><button type="button" class="small-button delete-button rv-remove" data-type="${r.type}" data-id="${escapeHTML(r.id)}">Remove</button></td></tr>`).join("")}</tbody></table></div>` : '<p class="empty-state">No review yet.</p>';
  } catch (error) { console.error(error); box.innerHTML = '<p class="empty-state">Could not load the reviews.</p>'; }
}
document.addEventListener("click", async event => {
  const button = event.target.closest(".rv-remove"); if (!button) return;
  if (!window.confirm("Remove this review?")) return;
  button.disabled = true;
  try { await callFn("removeReview", { type: button.dataset.type, id: button.dataset.id }); note("reviews-message", "Removed."); }
  catch (error) { note("reviews-message", error.message || "Could not remove it.", true); }
  loadAdminReviews();
});
loadAdminReviews();


/* lock / unlock a dean or a supervisor: his tasks move one level up (and come back when unlocked) */
document.addEventListener("click", async event => {
  const button = event.target.closest(".lock-role"); if (!button) return;
  const lock = button.dataset.locked === "1";
  const text = lock ? (button.dataset.role === "dean" ? "Lock this dean? His tasks (approvals, his supervisors' payments) move to you until you unlock him." : "Lock this supervisor? His people and delivery partners move to his dean (or to you) until you unlock him.") : "Unlock this account? Its tasks come back to it.";
  if (!window.confirm(text)) return;
  button.disabled = true;
  try {
    await callFn("setRoleLock", { role: button.dataset.role, uid: button.dataset.uid, locked: lock });
    await loadSupervisors();
    if (typeof loadFeeChain === "function") loadFeeChain();
  } catch (error) { console.error(error); note(button.dataset.role === "dean" ? "dean-message" : "supervisor-message", error.message || "Could not do it.", true); button.disabled = false; }
});

/* ---------- limits on new accounts ---------- */
const JOIN_ROWS = [["shop", "Sellers"], ["restaurant", "Restaurants"], ["pharmacy", "Pharmacies"], ["doctor", "Doctors"], ["agency", "Travel agencies"], ["taxi", "Taxi drivers"], ["barber", "Barbers"], ["hotel", "Hotels"], ["courier", "Delivery partners"]];
async function loadJoinLimits() {
  const box = byId("join-limits");
  if (!box) return;
  let limits = {}, counts = {};
  try {
    const [l, c] = await Promise.all([db.collection("settings").doc("joinLimits").get(), db.collection("settings").doc("joinCounts").get()]);
    limits = l.exists ? l.data() : {}; counts = c.exists ? c.data() : {};
  } catch { /* first time */ }
  const closedMap = (limits && limits.closed) || {};
  let moneyShown = true;
  try { moneyShown = (await getFeatures(true)).global.showCollabMoney !== false; } catch { /* default */ }
  box.innerHTML = `<div class="table-wrap"><table class="orders-table form-table limits-table"><thead><tr><th>Kind of account</th><th class="num">Accepted so far</th><th>Most to accept</th><th>Applications</th></tr></thead><tbody>${JOIN_ROWS.map(([k, name]) => {
    const value = limits[k] !== undefined ? limits[k] : (k === "pharmacy" && !Object.keys(limits).length ? 0 : "");
    const full = value !== "" && Number(counts[k] || 0) >= Number(value);
    const shut = closedMap[k] === true;
    return `<tr><td data-label="Kind of account">${name}${shut ? ' <span class="tag tag-warn">Closed</span>' : ""}${full ? ' <span class="tag tag-warn">Full</span>' : ""}</td><td class="num" data-label="Accepted so far">${Number(counts[k] || 0)}</td><td data-label="Most to accept"><input type="number" class="join-limit" data-kind="${k}" min="0" max="1000000" step="1" value="${value}" placeholder="No limit" aria-label="${name}"></td><td data-label="Applications"><button type="button" class="toggle-button join-open ${shut ? "off" : "on"}" data-kind="${k}" data-open="${shut ? "1" : "0"}" aria-pressed="${!shut}"><span class="tick" aria-hidden="true">${shut ? "✕" : "✓"}</span><span>${shut ? "Closed: press to open" : "Open: press to close"}</span></button></td></tr>`;
  }).join("")}</tbody></table></div><p><button type="button" class="button button-teal" id="save-join">Save the numbers</button> <button type="button" class="small-button join-all" data-open="1">Open all kinds</button> <button type="button" class="small-button delete-button join-all" data-open="0">Close all kinds</button></p>
    <h3>Trial period</h3>
    <p class="muted">While the site is in its trial, hide the credit window and the fee statements on the collaborators' accounts (sellers, doctors, barbers, hotels, agencies, taxis, delivery partners). The fees are still counted behind the scenes. Turn it on again when the trial ends.</p>
    <p><button type="button" class="toggle-button ${moneyShown ? "on" : "off"}" id="money-switch" aria-pressed="${moneyShown}"><span class="tick" aria-hidden="true">${moneyShown ? "✓" : "✕"}</span><span>${moneyShown ? "Credit and fee statements are shown: press to hide them" : "Credit and fee statements are hidden: press to show them"}</span></button></p>
    <h3>Start fresh after the trial</h3>
    <p class="muted">Two separate buttons. Nothing is deleted: the old numbers are kept in the statements and the log; orders, bookings, accounts and customers' credit stay. Take a backup first.</p>
    <p><button type="button" class="small-button reset-dues" data-kind="subscriptions">Zero the subscriptions</button> <button type="button" class="small-button reset-dues" data-kind="fees">Zero the sales and booking fees</button></p>
    <p class="muted"><b>Subscriptions:</b> the monthly subscription dues of sellers and providers go to 0 and the months still to bill are cancelled. <b>Fees:</b> what sellers and providers owe for sales and bookings, the delivery partners' fees, and what supervisors and deans still owe upward go to 0.</p>`;
}
document.addEventListener("click", async event => {
  const btn = event.target.closest("#save-join");
  if (!btn) return;
  const limits = {};
  document.querySelectorAll(".join-limit").forEach(i => { limits[i.dataset.kind] = i.value.trim(); });
  btn.disabled = true;
  try {
    await callFn("saveJoinLimits", { limits });
    await loadJoinLimits();
    note("join-message", "Saved. A kind that reached its number is closed for new applications.");
  } catch (error) { console.error(error); note("join-message", authErrorMessage(error), true); }
  finally { btn.disabled = false; }
});
document.addEventListener("click", async event => {
  const btn = event.target.closest(".reset-dues");
  if (!btn) return;
  const kind = btn.dataset.kind;
  const what = kind === "subscriptions" ? "ALL subscription dues of the collaborators (and cancels the months still to bill)" : "ALL sales and booking fees owed by sellers, providers, delivery partners, supervisors and deans";
  const typed = window.prompt(`This sets ${what} to 0. The old numbers stay in the statements and the log. It cannot be undone. Type your own email to confirm.`, "");
  if (typed === null) return;
  btn.disabled = true;
  try {
    const r = await callFn("resetDues", { kind, confirmEmail: typed.trim() });
    note("join-message", kind === "subscriptions" ? `Done: ${r.sellers} accounts, ${r.forgiven} cleared.` : `Done: ${r.sellers} sellers/providers (${r.forgiven}), ${r.couriers} delivery partners (${r.couriersForgiven}), ${r.holders} supervisors/deans (${r.holdersForgiven}).`);
  } catch (error) { console.error(error); note("join-message", authErrorMessage(error), true); }
  finally { btn.disabled = false; }
});
document.addEventListener("click", async event => {
  const one = event.target.closest(".join-open"), all = event.target.closest(".join-all"), money = event.target.closest("#money-switch");
  if (!one && !all && !money) return;
  const btn = one || all || money;
  btn.disabled = true;
  try {
    if (money) {
      const now = (await getFeatures(true)).global.showCollabMoney !== false;
      await db.collection("settings").doc("features").set({ global: { showCollabMoney: !now } }, { merge: true });
      await getFeatures(true);
      note("join-message", now ? "Hidden on the collaborators' accounts." : "Shown again on the collaborators' accounts.");
    } else {
      const open = btn.dataset.open === "1";
      await callFn("setJoinOpen", one ? { kind: btn.dataset.kind, open } : { all: true, open });
      note("join-message", open ? "Applications opened." : "Applications closed: the join page says \"closed for now\".");
    }
    await loadJoinLimits();
  } catch (error) { console.error(error); note("join-message", authErrorMessage(error), true); btn.disabled = false; }
});
loadJoinLimits();

/* ---------- erase data (owner) ---------- */
document.addEventListener("click", async event => {
  const one = event.target.closest("#erase-account"), site = event.target.closest("#erase-site"), credit = event.target.closest("#erase-credit");
  if (!one && !site && !credit) return;
  const btn = one || site || credit;
  try {
    if (credit) {
      const typedEmail = byId("erase-credit-email").value.trim();
      if (!typedEmail) return note("erase-message", "Type your own email to confirm.", true);
      if (!window.confirm("This erases ALL credit: every balance, the history and the requests. It cannot be undone. Continue?")) return;
      btn.disabled = true;
      await callFn("wipeCredit", { confirmEmail: typedEmail });
      byId("erase-credit-email").value = "";
      note("erase-message", "All credit was erased.");
    } else if (one) {
      const email = byId("erase-email").value.trim().toLowerCase();
      if (!email) return note("erase-message", "Type the email of the account.", true);
      const found = await db.collection("users").where("email", "==", email).limit(1).get();
      if (found.empty) return note("erase-message", "No account has this email.", true);
      const typed = window.prompt(`This erases the data of ${email} (orders, products, bookings, messages). The account and its role stay. It cannot be undone. Type DELETE to confirm.`, "");
      if (typed === null) return;
      if (typed.trim() !== "DELETE") return note("erase-message", "Nothing was erased: you did not type DELETE.", true);
      btn.disabled = true;
      if (!(await window.mkEraseBackupRun({ uid: found.docs[0].id }))) return note("erase-message", "Nothing was erased: the backup was not saved.", true);
      await callFn("wipeMyData", { uid: found.docs[0].id, confirm: "DELETE" });
      note("erase-message", `The data of ${email} was erased.`);
    } else {
      const typed = window.prompt("This erases ALL the data of the site (products, orders, bookings, messages, records). Every account stays with its login and its role (doctor, barber, dean, supervisor...). It cannot be undone. Type DELETE ALL to confirm.", "");
      if (typed === null) return;
      if (typed.trim() !== "DELETE ALL") return note("erase-message", "Nothing was erased: you did not type DELETE ALL.", true);
      btn.disabled = true;
      if (!(await window.mkEraseBackupRun({ scope: "site" }))) return note("erase-message", "Nothing was erased: the backup was not saved.", true);
      const done = await callFn("wipeSite", { confirm: "DELETE ALL" });
      note("erase-message", "The data of the site was erased. All the accounts and their roles stay.");
      loadJoinLimits();
    }
  } catch (error) { console.error(error); note("erase-message", authErrorMessage(error), true); }
  finally { btn.disabled = false; }
});

/* ---------- products each account may upload ---------- */
const PLIMIT_KINDS = [["shop", "Sellers"], ["restaurant", "Restaurants"], ["pharmacy", "Pharmacies"], ["barber", "Barbers (style photos)"]];
let plimitKinds = {}, plimitAccounts = [];
async function loadProductLimits() {
  const box = byId("plimit-kinds");
  if (!box) return;
  try { const d = await db.collection("settings").doc("productLimits").get(); plimitKinds = d.exists ? d.data() : {}; } catch { plimitKinds = {}; }
  try { plimitAccounts = (await db.collection("merchants").get()).docs.map(d => ({ ...d.data(), id: d.id })).filter(m => !["doctor", "agency", "taxi", "hotel"].includes(m.kind)); } catch { plimitAccounts = []; }
  box.innerHTML = `<div class="table-wrap"><table class="orders-table form-table limits-table"><thead><tr><th>Kind of account</th><th class="num">Accounts</th><th>Most products per account</th></tr></thead><tbody>${PLIMIT_KINDS.map(([k, name]) =>
    `<tr><td data-label="Kind of account">${name}</td><td class="num" data-label="Accounts">${plimitAccounts.filter(m => (m.kind || "shop") === k).length}</td><td data-label="Most products per account"><input type="number" class="plimit-kind" data-kind="${k}" min="0" max="1000000" step="1" value="${plimitKinds[k] !== undefined ? plimitKinds[k] : ""}" placeholder="No limit" aria-label="${name}"></td></tr>`).join("")}</tbody></table></div><button type="button" class="button button-teal" id="save-plimit-kinds">Save the numbers</button>`;
  renderPlimitAccounts();
}
function renderPlimitAccounts() {
  const box = byId("plimit-accounts");
  if (!box) return;
  const needle = byId("plimit-search").value.trim().toLowerCase();
  const list = plimitAccounts.filter(m => !needle || [m.businessName, m.fullName, m.email].some(v => String(v || "").toLowerCase().includes(needle)));
  if (!list.length) { box.innerHTML = '<p class="empty-state">No account found.</p>'; return; }
  const kindName = k => (PLIMIT_KINDS.find(([x]) => x === (k || "shop")) || [0, "Seller"])[1];
  box.innerHTML = `<div class="table-wrap"><table class="orders-table form-table limits-table"><thead><tr><th>Account</th><th>Kind</th><th class="num">Products now</th><th>His own number</th><th></th></tr></thead><tbody>${list.slice(0, 100).map(m => {
    const own = typeof m.productLimit === "number" && m.productLimit >= 0 ? m.productLimit : "";
    const inherited = plimitKinds[m.kind || "shop"];
    const over = (own !== "" ? own : inherited) !== undefined && (own !== "" ? own : inherited) !== "" && Number(m.productCount || 0) >= Number(own !== "" ? own : inherited);
    return `<tr><td data-label="Account"><strong>${escapeHTML(m.businessName || m.fullName || m.email || m.id)}</strong><br><small class="muted">${escapeHTML(m.email || "")}</small></td><td data-label="Kind">${kindName(m.kind)}</td><td class="num" data-label="Products now">${Number(m.productCount || 0)}${over ? ' <span class="tag tag-warn">Full</span>' : ""}</td><td data-label="His own number"><input type="number" class="plimit-own" data-id="${escapeHTML(m.id)}" min="0" max="1000000" step="1" value="${own}" placeholder="${inherited !== undefined ? "Kind: " + inherited : "No limit"}" aria-label="Limit"></td><td><button type="button" class="small-button plimit-save" data-id="${escapeHTML(m.id)}">Save</button></td></tr>`;
  }).join("")}</tbody></table></div>`;
}
document.addEventListener("input", event => { if (event.target.id === "plimit-search") renderPlimitAccounts(); });
document.addEventListener("click", async event => {
  const kinds = event.target.closest("#save-plimit-kinds"), one = event.target.closest(".plimit-save");
  if (!kinds && !one) return;
  const btn = kinds || one;
  btn.disabled = true;
  try {
    if (kinds) {
      const out = {};
      document.querySelectorAll(".plimit-kind").forEach(i => { out[i.dataset.kind] = i.value.trim(); });
      await callFn("saveProductLimits", { kinds: out });
      note("plimit-message", "Saved. Sellers above the number cannot add more products.");
    } else {
      const input = document.querySelector(`.plimit-own[data-id="${one.dataset.id}"]`);
      await callFn("setProductLimit", { uid: one.dataset.id, limit: input.value.trim() });
      note("plimit-message", input.value.trim() === "" ? "This account follows the number of its kind again." : "This account's own number is saved.");
    }
    await loadProductLimits();
  } catch (error) { console.error(error); note("plimit-message", authErrorMessage(error), true); }
  finally { btn.disabled = false; }
});
loadProductLimits();


/* ---------- subscription plans: price <-> number of photos, and the switch for each account ---------- */
const SUB_DEFAULT = [{ id: "base", name: "Base", price: 250, images: 0, videos: 0, perks: "The account only, no photos" }, { id: "starter", name: "Starter", price: 400, images: 10, videos: 0, perks: "" }, { id: "standard", name: "Standard", price: 650, images: 30, videos: 1, perks: "" }, { id: "plus", name: "Plus", price: 1000, images: 60, videos: 3, perks: "" }, { id: "pro", name: "Pro", price: 1500, images: 100, videos: 5, perks: "" }, { id: "max", name: "Max", price: 2500, images: 200, videos: 10, perks: "" }];
const SUB_KIND_NAMES = { shop: "Seller", restaurant: "Restaurant", pharmacy: "Pharmacy", doctor: "Doctor", agency: "Travel agency", taxi: "Taxi driver", barber: "Barber", hotel: "Hotel" };
let subPlans = [], subAccounts = [], subBreakdown = [];
const SUB_BREAKDOWN_DEFAULT = [{ label: "Data storage (photos, videos, records)", percent: 30 }, { label: "Site engineering and updates", percent: 25 }, { label: "Servers and hosting", percent: 20 }, { label: "Security and backups", percent: 15 }, { label: "Support and other costs", percent: 10 }];
function subActive(m) { return m.planId && m.planUntil && Date.parse(m.planUntil) > Date.now(); }
async function loadSubscriptions() {
  const box = byId("subs-plans");
  if (!box) return;
  try { const d = await db.collection("settings").doc("plans").get(); subPlans = d.exists && Array.isArray(d.data().list) ? d.data().list : SUB_DEFAULT; subBreakdown = d.exists && Array.isArray(d.data().breakdown) ? d.data().breakdown : SUB_BREAKDOWN_DEFAULT; } catch { subPlans = SUB_DEFAULT; subBreakdown = SUB_BREAKDOWN_DEFAULT; }
  try { subAccounts = (await db.collection("merchants").get()).docs.map(d => ({ ...d.data(), id: d.id })); } catch { subAccounts = []; }
  renderSubPlans(); renderSubAccounts();
}
function renderSubPlans() {
  const box = byId("subs-plans");
  box.innerHTML = `<div class="subs-grid"><div><h4 class="subhead">Plans and prices (per month)</h4><div class="table-wrap"><table class="orders-table form-table plans-table"><thead><tr><th>Plan name</th><th class="num">Price per month</th><th class="num">Photos allowed</th><th class="num">Videos allowed</th><th>Rights (free text)</th><th></th></tr></thead><tbody>${subPlans.map((p, i) =>
    `<tr data-i="${i}" data-id="${escapeHTML(p.id || "")}"><td data-label="Plan name"><input class="sp-name" maxlength="40" value="${escapeHTML(p.name)}"></td><td class="num" data-label="Price per month"><input class="sp-price" type="number" min="0" step="any" value="${Number(p.price)}"></td><td class="num" data-label="Photos allowed"><input class="sp-images" type="number" min="0" step="1" value="${Number(p.images)}"></td><td class="num" data-label="Videos allowed"><input class="sp-videos" type="number" min="0" step="1" value="${Number(p.videos || 0)}"></td><td data-label="Rights"><input class="sp-perks" maxlength="200" value="${escapeHTML(p.perks || "")}"></td><td><button type="button" class="small-button delete-button sp-del">Remove</button></td></tr>`).join("")}</tbody></table></div></div><div>
    <h4 class="subhead">What the fee pays for (shown to the partners)</h4>
    <div class="table-wrap"><table class="orders-table form-table bd-table"><thead><tr><th>Cost</th><th class="num">Percent of the fee</th><th></th></tr></thead><tbody>${subBreakdown.map(b => `<tr><td data-label="Cost"><input class="bd-label" maxlength="60" value="${escapeHTML(b.label)}"></td><td class="num" data-label="Percent of the fee"><input class="bd-percent" type="number" min="0" max="100" step="0.5" value="${Number(b.percent)}"></td><td><button type="button" class="small-button delete-button bd-del">Remove</button></td></tr>`).join("")}</tbody></table></div>
    <p class="muted bd-total"></p>
    <p><button type="button" class="small-button" id="bd-add">+ Add a cost</button></p>
    </div></div>
    <p><button type="button" class="small-button" id="sp-add">+ Add a plan</button> <button type="button" class="button button-teal" id="sp-save">Save the plans</button></p>`;
  { const g = box.querySelector(".subs-grid"), pr = box.querySelector("#sp-add") && box.querySelector("#sp-add").parentElement; if (g && pr && g.firstElementChild) g.firstElementChild.appendChild(pr); }
  const sumBd = () => { const t = [...document.querySelectorAll("#subs-plans .bd-percent")].reduce((a, i) => a + (Number(i.value) || 0), 0); const el = document.querySelector("#subs-plans .bd-total"); if (el) { el.textContent = `Total: ${Math.round(t * 100) / 100} % (must be 100 %)`; el.classList.toggle("error", Math.abs(t - 100) > 0.01); } };
  sumBd();
}
function readBreakdown() { return [...document.querySelectorAll("#subs-plans .bd-table tbody tr")].map(tr => ({ label: tr.querySelector(".bd-label").value, percent: tr.querySelector(".bd-percent").value })); }
document.addEventListener("input", event => { if (event.target.classList && event.target.classList.contains("bd-percent")) { const t = [...document.querySelectorAll("#subs-plans .bd-percent")].reduce((a, i) => a + (Number(i.value) || 0), 0); const el = document.querySelector("#subs-plans .bd-total"); if (el) { el.textContent = `Total: ${Math.round(t * 100) / 100} % (must be 100 %)`; el.classList.toggle("error", Math.abs(t - 100) > 0.01); } } });
function readSubPlans() {
  return [...document.querySelectorAll("#subs-plans tbody tr")].map(tr => ({ id: tr.dataset.id, name: tr.querySelector(".sp-name").value, price: tr.querySelector(".sp-price").value, images: tr.querySelector(".sp-images").value, videos: tr.querySelector(".sp-videos").value, perks: tr.querySelector(".sp-perks").value }));
}
function renderSubAccounts() {
  const box = byId("subs-accounts");
  const needle = byId("subs-search").value.trim().toLowerCase();
  const list = subAccounts.filter(m => !needle || [m.businessName, m.fullName, m.email].some(v => String(v || "").toLowerCase().includes(needle)));
  if (!list.length) { box.innerHTML = '<p class="empty-state">No account found.</p>'; return; }
  box.innerHTML = `<div class="table-wrap"><table class="orders-table form-table subs-table"><thead><tr><th>Account</th><th>Kind</th><th>Plan now</th><th class="num">Photos</th><th>Plan</th><th class="num">Months</th><th></th></tr></thead><tbody>${list.slice(0, 100).map(m => {
    const on = subActive(m);
    return `<tr data-id="${escapeHTML(m.id)}"><td data-label="Account"><strong>${escapeHTML(m.businessName || m.fullName || m.email || m.id)}</strong><br><small class="muted">${escapeHTML(m.email || "")}</small></td>
      <td data-label="Kind">${escapeHTML(SUB_KIND_NAMES[m.kind || "shop"] || m.kind)}</td>
      <td data-label="Plan now">${on ? `<span class="tag tag-ok">${escapeHTML(m.planName || m.planId)}</span><br><small class="muted">until ${escapeHTML(String(m.planUntil).slice(0, 10))}</small>` : '<span class="muted">Free start</span>'}</td>
      <td class="num" data-label="Photos">${Number(m.productCount || 0)}${on ? " / " + Number(m.planLimit) : ""}</td>
      <td data-label="Plan"><select class="sa-plan">${subPlans.map(p => `<option value="${escapeHTML(p.id)}"${m.planId === p.id ? " selected" : ""}>${escapeHTML(p.name)} · ${escapeHTML(formatPrice(p.price))} · ${Number(p.images)} photos · ${Number(p.videos || 0)} videos</option>`).join("")}</select></td>
      <td class="num" data-label="Months"><input class="sa-months" type="number" min="1" max="36" value="1" aria-label="Months"></td>
      <td><button type="button" class="small-button sa-on">Activate</button>${on ? ' <button type="button" class="small-button delete-button sa-off">End</button>' : ""}</td></tr>`;
  }).join("")}</tbody></table></div>`;
}
document.addEventListener("input", event => { if (event.target.id === "subs-search") renderSubAccounts(); });
document.addEventListener("click", async event => {
  const t = event.target;
  if (t.closest("#bd-add")) { subPlans = readSubPlans(); subBreakdown = readBreakdown(); subBreakdown.push({ label: "", percent: 0 }); renderSubPlans(); return; }
  if (t.closest(".bd-del")) { subPlans = readSubPlans(); subBreakdown = readBreakdown(); subBreakdown.splice([...t.closest("tbody").children].indexOf(t.closest("tr")), 1); renderSubPlans(); return; }
  if (t.closest("#sp-add")) { subPlans = readSubPlans(); subBreakdown = readBreakdown(); subPlans.push({ id: "", name: "New plan", price: 0, images: 10, videos: 0, perks: "" }); renderSubPlans(); return; }
  if (t.closest(".sp-del")) { subPlans = readSubPlans(); subPlans.splice(Number(t.closest("tr").dataset.i), 1); renderSubPlans(); return; }
  const save = t.closest("#sp-save"), on = t.closest(".sa-on"), off = t.closest(".sa-off");
  if (!save && !on && !off) return;
  const btn = save || on || off; btn.disabled = true;
  try {
    if (save) {
      const r = await callFn("savePlans", { plans: readSubPlans(), breakdown: readBreakdown() });
      subPlans = r.plans; subBreakdown = r.breakdown; note("subs-message", "Plans saved."); renderSubPlans(); renderSubAccounts();
    } else {
      const tr = btn.closest("tr");
      const r = await callFn("setSubscription", off ? { uid: tr.dataset.id, planId: "" } : { uid: tr.dataset.id, planId: tr.querySelector(".sa-plan").value, months: tr.querySelector(".sa-months").value });
      note("subs-message", off ? "The plan was ended for this account." : "Plan switched on. The partner is told.");
      await loadSubscriptions();
    }
  } catch (error) { console.error(error); note("subs-message", authErrorMessage(error), true); }
  finally { btn.disabled = false; }
});
loadSubscriptions();

/* ---------- partners asking for more photos: the owner decides how many ---------- */
async function loadPhotoRequests() {
  const box = byId("photo-requests"); if (!box) return;
  let rows = [];
  try { rows = (await db.collection("photoRequests").get()).docs.map(d => d.data()); } catch { box.innerHTML = '<p class="error">Could not load the requests.</p>'; return; }
  rows.sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || String(b.createdAt).localeCompare(String(a.createdAt)));
  const LABEL = { pending: "Waiting", approved: "Approved", refused: "Refused" };
  box.innerHTML = rows.length ? `<div class="table-wrap"><table class="orders-table form-table"><thead><tr><th>Account</th><th class="num">Photos used / limit</th><th class="num">Asks for</th><th>Why</th><th class="num">I give</th><th></th></tr></thead><tbody>${rows.slice(0, 60).map(r => `<tr data-uid="${escapeHTML(r.uid)}">
    <td data-label="Account"><strong>${escapeHTML(r.name || r.email)}</strong><br><small class="muted">${escapeHTML(r.email || "")} · ${escapeHTML(SUB_KIND_NAMES[r.kind] || r.kind)}</small></td>
    <td class="num" data-label="Photos used / limit">${Number(r.used)} / ${r.limit < 0 ? "no limit" : Number(r.limit)}</td>
    <td class="num" data-label="Asks for">+${Number(r.wanted)}</td><td data-label="Why">${escapeHTML(r.note || "—")}</td>
    ${r.status === "pending" ? `<td class="num" data-label="I give"><input class="pr-give" type="number" min="1" max="5000" value="${Number(r.wanted)}" aria-label="Photos to give"></td><td><button type="button" class="small-button pr-yes">Approve</button> <button type="button" class="small-button delete-button pr-no">Refuse</button></td>`
      : `<td class="num" data-label="I give">${r.status === "approved" ? "+" + Number(r.granted) : "—"}</td><td><span class="status-pill">${LABEL[r.status] || r.status}</span></td>`}</tr>`).join("")}</tbody></table></div>` : '<p class="empty-state">No request for more photos yet.</p>';
}
document.addEventListener("click", async event => {
  const yes = event.target.closest(".pr-yes"), no = event.target.closest(".pr-no");
  if (!yes && !no) return;
  const tr = (yes || no).closest("tr"), btn = yes || no; btn.disabled = true;
  try {
    await callFn("decidePhotoRequest", no ? { uid: tr.dataset.uid, refuse: true } : { uid: tr.dataset.uid, granted: tr.querySelector(".pr-give").value });
    note("subs-message", no ? "Request refused. The partner is told." : "Photos added. The partner is told.");
    await loadPhotoRequests(); await loadSubscriptions();
  } catch (error) { console.error(error); note("subs-message", authErrorMessage(error), true); btn.disabled = false; }
});
loadPhotoRequests();

/* ---------- who brought the partners: counts per dean and per supervisor (no money, no private data) ---------- */
const BROUGHT_COLS = [["shop", "Sellers"], ["restaurant", "Restaurants"], ["pharmacy", "Pharmacies"], ["doctor", "Doctors"], ["barber", "Barbers"], ["hotel", "Hotels"], ["agency", "Agencies"], ["taxi", "Taxis"], ["courier", "Delivery"]];
async function loadBrought() {
  const box = byId("brought-box"); if (!box) return;
  try {
    const [m, c, s, d] = await Promise.all([db.collection("merchants").get(), db.collection("couriers").get(), db.collection("supervisors").get(), db.collection("deans").get()]);
    const tally = () => ({ total: 0, approved: 0, by: {} });
    const add = (t, kind, status) => { t.total += 1; if (status === "approved") t.approved += 1; t.by[kind] = (t.by[kind] || 0) + 1; };
    const sups = {}; s.docs.forEach(x => { sups[x.id] = { ...x.data(), id: x.id, t: tally() }; });
    const deans = {}; d.docs.forEach(x => { deans[x.id] = { ...x.data(), id: x.id, t: tally(), sups: [] }; });
    const alone = tally();   /* joined without a supervisor */
    const place = (kind, doc) => {
      const sup = doc.invitedBy ? sups[doc.invitedBy] : null;
      if (!sup) { add(alone, kind, doc.status); return; }
      add(sup.t, kind, doc.status);
      const dean = sup.deanId ? deans[sup.deanId] : null;
      if (dean) add(dean.t, kind, doc.status);
    };
    m.docs.forEach(x => place(MK_FEE_KINDS.includes(x.data().kind) ? x.data().kind : "shop", x.data()));
    c.docs.forEach(x => place("courier", x.data()));
    Object.values(sups).forEach(sp => { const dn = sp.deanId ? deans[sp.deanId] : null; if (dn) dn.sups.push(sp); });
    const orphans = Object.values(sups).filter(sp => !(sp.deanId && deans[sp.deanId]));
    const cells = t => BROUGHT_COLS.map(([k]) => `<td class="num">${t.by[k] || 0}</td>`).join("") + `<td class="num"><strong>${t.total}</strong></td><td class="num">${t.approved}</td>`;
    const row = (cls, label, sub, t) => `<tr class="${cls}"><td><strong>${escapeHTML(label)}</strong>${sub ? `<br><small class="muted">${escapeHTML(sub)}</small>` : ""}</td>${cells(t)}</tr>`;
    const lines = [];
    const orderedDeans = Object.values(deans).sort((a, b) => b.t.total - a.t.total);
    orderedDeans.forEach(dn => {
      lines.push(row("brought-dean", dn.email || "Dean", "Dean · all his supervisors", dn.t));
      dn.sups.sort((a, b) => b.t.total - a.t.total).forEach(sp => lines.push(row("brought-sup", sp.email || "Supervisor", "Supervisor" + (sp.locked ? " · locked" : ""), sp.t)));
    });
    if (orphans.length) {
      lines.push(`<tr class="brought-group"><td colspan="${BROUGHT_COLS.length + 3}">Supervisors without a dean</td></tr>`);
      orphans.sort((a, b) => b.t.total - a.t.total).forEach(sp => lines.push(row("brought-sup", sp.email || "Supervisor", "Supervisor" + (sp.locked ? " · locked" : ""), sp.t)));
    }
    lines.push(row("brought-alone", "Joined on their own", "No supervisor", alone));
    const all = tally(); m.docs.forEach(x => add(all, "x", x.data().status)); c.docs.forEach(x => add(all, "x", x.data().status));
    const brought = all.total - alone.total;
    box.innerHTML = `<p class="muted">Partners brought in by a supervisor: <strong>${brought}</strong> of ${all.total}. A dean's line adds up all his supervisors.</p>
      <div class="table-wrap"><table class="orders-table brought-table"><thead><tr><th>Dean / supervisor</th>${BROUGHT_COLS.map(([, n]) => `<th class="num">${n}</th>`).join("")}<th class="num">Total</th><th class="num">Approved</th></tr></thead><tbody>${lines.join("")}</tbody></table></div>`;
  } catch (error) { console.error(error); box.innerHTML = '<p class="empty-state">Could not load the numbers.</p>'; }
}
loadBrought();


/* ---------- the side banner: up to 5 announcements, saved in settings/ads ---------- */
async function loadAds() {
  const box = byId("ads-form"); if (!box) return;
  let items = [];
  try { const snap = await db.collection("settings").doc("ads").get(); if (snap.exists && Array.isArray(snap.data().items)) items = snap.data().items; } catch (error) { console.error(error); }
  const rows = Array.from({ length: 5 }, (_, i) => items[i] || {});
  box.innerHTML = rows.map((x, i) => `<fieldset class="ad-row"><legend>Announcement ${i + 1}</legend>
      <label>Title<input type="text" maxlength="60" data-f="title" value="${escapeHTML(x.title || "")}"></label>
      <label>Text<input type="text" maxlength="160" data-f="text" value="${escapeHTML(x.text || "")}"></label>
      <label>Link (https://…)<input type="url" maxlength="300" data-f="link" value="${escapeHTML(x.link || "")}"></label>
      <label>Picture (https://…)<input type="url" maxlength="300" data-f="image" value="${escapeHTML(x.image || "")}"></label></fieldset>`).join("")
    + '<button type="button" class="button button-teal" id="ads-save">Save the announcements</button>';
  byId("ads-save").addEventListener("click", async () => {
    const msg = byId("ads-message"); msg.className = "form-message";
    const out = []; let bad = "";
    [...box.querySelectorAll(".ad-row")].forEach((row, i) => {
      const v = f => row.querySelector(`[data-f="${f}"]`).value.trim();
      const item = { title: v("title"), text: v("text"), link: v("link"), image: v("image") };
      if (!item.title && !item.text) return;
      if ((item.link && !/^https:\/\//i.test(item.link)) || (item.image && !/^https:\/\//i.test(item.image))) bad = `Announcement ${i + 1}: the link and the picture must start with https://`;
      out.push(item);
    });
    if (bad) { msg.textContent = bad; msg.classList.add("error"); return; }
    try { await db.collection("settings").doc("ads").set({ items: out }); msg.textContent = out.length ? "Saved. Visitors see it now." : "Saved. The side banner is empty."; msg.classList.add("success"); }
    catch (error) { console.error(error); msg.textContent = "Could not save."; msg.classList.add("error"); }
  });
}
loadAds();
if (window.mkTrusted) mkTrusted.approver(document.getElementById("trusted-owner"), "owner");


/* ---------- craftsmen directory: approve, refuse or remove the listings ---------- */
(function () {
  const box = document.getElementById("artisans-owner");
  if (!box) return;
  const ST = { pending: "Waiting", approved: "Online", rejected: "Refused" };
  async function load() {
    try {
      const list = (await callFn("listArtisansAdmin", {})).artisans || [];
      box.innerHTML = list.length ? `<div class="table-wrap"><table class="orders-table"><thead><tr><th>Name</th><th>Trade</th><th>Phone</th><th>Place</th><th>State</th><th></th></tr></thead><tbody>${list.map(a => `<tr data-id="${escapeHTML(a.id)}">
        <td data-label="Name"><strong>${escapeHTML(a.firstName)} ${escapeHTML(a.lastName)}</strong>${a.verified ? " ✔️" : ""}</td><td data-label="Trade">${escapeHTML(a.trade)}</td><td data-label="Phone">${escapeHTML(a.phone)}</td>
        <td data-label="Place">${[a.city, a.region, a.country].filter(Boolean).map(escapeHTML).join(" · ")}</td><td data-label="State"><span class="status-pill">${escapeHTML(ST[a.status] || a.status)}</span></td>
        <td data-label="Actions">${a.status !== "approved" ? '<button type="button" class="small-button art-act" data-action="approve">Approve</button> ' : ""}${a.status !== "rejected" ? '<button type="button" class="small-button art-act" data-action="reject">Refuse</button> ' : ""}${a.status === "approved" ? `<button type="button" class="small-button art-act" data-action="${a.verified ? "unverify" : "verify"}">${a.verified ? "Remove ✔️" : "Verify ✔️"}</button> ` : ""}<button type="button" class="small-button delete-button art-act" data-action="delete">Delete</button></td></tr>`).join("")}</tbody></table></div>` : '<p class="empty-state">No listing yet.</p>';
    } catch (error) { box.innerHTML = `<p class="empty-state">${escapeHTML(authErrorMessage(error))}</p>`; if (!retried) { retried = true; setTimeout(load, 2500); } }
  }
  let retried = false;
  box.addEventListener("click", async event => {
    const b = event.target.closest(".art-act"); if (!b) return;
    if (b.dataset.action === "delete" && !window.confirm("Delete this listing?")) return;
    b.disabled = true;
    try { await callFn("decideArtisan", { id: b.closest("tr").dataset.id, action: b.dataset.action }); await load(); }
    catch (error) { showToast(authErrorMessage(error), "error"); b.disabled = false; }
  });
  document.addEventListener("DOMContentLoaded", () => setTimeout(load, 800));
})();


/* ---------- jobs & announcements board: add, edit, approve, refuse, remove ---------- */
(function () {
  const $ = id => document.getElementById(id);
  const box = $("jb-list");
  if (!box) return;
  const CATS = { sch: "Scholarships & funding", doc: "Master & PhD", job: "Teaching jobs", conf: "Conferences", work: "Jobs", ad: "Announcements" };
  const ST = { pending: "Waiting", approved: "Online", rejected: "Refused" };
  let rows = [], retried = false;
  $("jb-cat").innerHTML = Object.entries(CATS).map(([k, v]) => `<option value="${k}">${escapeHTML(v)}</option>`).join("");
  const say = (t, bad) => { const m = $("jb-message"); m.textContent = t; m.classList.toggle("error", Boolean(bad)); };
  const fields = { cat: "jb-cat", title: "jb-title", institution: "jb-inst", country: "jb-country", summary: "jb-summary", url: "jb-url", contact: "jb-contact", deadline: "jb-deadline", eventDate: "jb-event", scope: "jb-scope", source: "jb-source" };
  const reset = () => { $("jb-form").reset(); $("jb-id").value = ""; $("jb-save").textContent = "Add to the board"; $("jb-reset").hidden = true; };
  async function load() {
    try {
      rows = (await callFn("listBoardAdmin", {})).items || [];
      box.innerHTML = rows.length ? `<div class="table-wrap"><table class="orders-table"><thead><tr><th>Title</th><th>Kind</th><th>Link / contact</th><th>State</th><th></th></tr></thead><tbody>${rows.map(a => `<tr data-id="${escapeHTML(a.id)}">
        <td data-label="Title"><strong class="notranslate">${escapeHTML(a.title)}</strong><br><small class="muted notranslate">${escapeHTML(a.institution)}</small></td><td data-label="Kind">${escapeHTML(CATS[a.cat] || a.cat)}</td>
        <td data-label="Link / contact">${a.url ? `<a href="${escapeHTML(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer">link</a>` : ""} ${escapeHTML(a.contact)}</td>
        <td data-label="State"><span class="status-pill">${escapeHTML(ST[a.status] || a.status)}</span></td>
        <td data-label="Actions">${a.status !== "approved" ? '<button type="button" class="small-button jb-act" data-action="approve">Approve</button> ' : ""}${a.status !== "rejected" ? '<button type="button" class="small-button jb-act" data-action="reject">Refuse</button> ' : ""}<button type="button" class="small-button jb-edit">Edit</button> <button type="button" class="small-button delete-button jb-act" data-action="delete">Delete</button></td></tr>`).join("")}</tbody></table></div>` : '<p class="empty-state">No announcement yet. Load the starting list or add one above.</p>';
    } catch (error) { box.innerHTML = `<p class="empty-state">${escapeHTML(authErrorMessage(error))}</p>`; if (!retried) { retried = true; setTimeout(load, 2500); } }
  }
  box.addEventListener("click", async event => {
    const edit = event.target.closest(".jb-edit");
    if (edit) {
      const a = rows.find(x => x.id === edit.closest("tr").dataset.id); if (!a) return;
      Object.entries(fields).forEach(([k, id]) => { $(id).value = a[k] || ""; });
      $("jb-id").value = a.id; $("jb-save").textContent = "Save the change"; $("jb-reset").hidden = false; if ($("jb-form").scrollIntoView) $("jb-form").scrollIntoView({ behavior: "smooth", block: "center" }); return;
    }
    const b = event.target.closest(".jb-act"); if (!b) return;
    if (b.dataset.action === "delete" && !window.confirm("Delete this announcement?")) return;
    b.disabled = true;
    try { await callFn("decideBoardItem", { id: b.closest("tr").dataset.id, action: b.dataset.action }); await load(); }
    catch (error) { showToast(authErrorMessage(error), "error"); b.disabled = false; }
  });
  $("jb-reset").addEventListener("click", () => { reset(); say(""); });
  $("jb-form").addEventListener("submit", async event => {
    event.preventDefault();
    const data = {}; Object.entries(fields).forEach(([k, id]) => { data[k] = $(id).value; });
    if ($("jb-id").value) data.id = $("jb-id").value;
    const b = $("jb-save"); b.disabled = true;
    try { await callFn("saveBoardItem", data); say("Saved."); reset(); await load(); } catch (error) { say(authErrorMessage(error), true); }
    b.disabled = false;
  });
  $("jb-seed").addEventListener("click", async () => {
    const b = $("jb-seed"); b.disabled = true; $("jb-seed-msg").textContent = "";
    try { const r = await callFn("seedBoard", {}); $("jb-seed-msg").textContent = r.added ? `${r.added} announcements added.` : "They are already there."; await load(); }
    catch (error) { $("jb-seed-msg").textContent = authErrorMessage(error); }
    b.disabled = false;
  });
  document.addEventListener("DOMContentLoaded", () => setTimeout(load, 900));
})();


/* ---------- jobs board: the official websites read every day ---------- */
(function () {
  const $ = id => document.getElementById(id);
  const box = $("js-list");
  if (!box) return;
  const CATS = { sch: "Scholarships & funding", doc: "Master & PhD", job: "Teaching jobs", conf: "Conferences", work: "Jobs", ad: "Announcements" };
  $("js-cat").innerHTML = Object.entries(CATS).map(([k, v]) => `<option value="${k}">${escapeHTML(v)}</option>`).join("");
  let rows = [], retried = false;
  const say = (t, bad) => { const m = $("js-message"); m.textContent = t; m.classList.toggle("error", Boolean(bad)); };
  const data = () => ({ name: $("js-name").value, url: $("js-url").value, type: $("js-type").value, include: $("js-include").value, cat: $("js-cat").value, scope: $("js-scope").value, auto: $("js-auto").checked });
  const reset = () => { $("js-form").reset(); $("js-id").value = ""; $("js-save").textContent = "Add this website"; $("js-reset").hidden = true; $("js-auto").checked = true; };
  async function load() {
    try {
      rows = (await callFn("listBoardSources", {})).sources || [];
      box.innerHTML = rows.length ? `<div class="table-wrap"><table class="orders-table"><thead><tr><th>Website</th><th>Type</th><th>Last reading</th><th></th></tr></thead><tbody>${rows.map(r => `<tr data-id="${escapeHTML(r.id)}">
        <td data-label="Website"><strong class="notranslate">${escapeHTML(r.name)}</strong><br><small class="muted notranslate" dir="ltr">${escapeHTML(r.url)}</small></td>
        <td data-label="Type">${r.type === "page" ? "Page" : r.type === "json" ? "Radar file" : "Feed"}${r.active ? "" : " · paused"}${r.auto ? "" : " · needs approval"}</td>
        <td data-label="Last reading">${r.lastRun ? `<span class="status-pill">${escapeHTML(r.lastStatus === "ok" ? "OK · " + r.lastCount + " new" : r.lastStatus)}</span><br><small class="muted notranslate">${escapeHTML(r.lastRun.slice(0, 16).replace("T", " "))}</small>` : '<span class="muted">Not read yet</span>'}</td>
        <td data-label="Actions"><button type="button" class="small-button js-run">Read now</button> <button type="button" class="small-button js-edit">Edit</button> <button type="button" class="small-button js-pause">${r.active ? "Pause" : "Resume"}</button> <button type="button" class="small-button delete-button js-del">Delete</button></td></tr>`).join("")}</tbody></table></div>` : '<p class="empty-state">No website yet. Add the official pages you trust: the board then fills itself every day.</p>';
    } catch (error) { box.innerHTML = `<p class="empty-state">${escapeHTML(authErrorMessage(error))}</p>`; if (!retried) { retried = true; setTimeout(load, 2500); } }
  }
  $("js-test").addEventListener("click", async () => {
    const b = $("js-test"); b.disabled = true; say("Reading…");
    try { const r = await callFn("testBoardSource", data()); say(r.ok ? `It works: ${r.count} announcements found. For example: ${r.sample.join(" | ")}` : r.error, !r.ok); }
    catch (error) { say(authErrorMessage(error), true); }
    b.disabled = false;
  });
  $("js-form").addEventListener("submit", async event => {
    event.preventDefault();
    const d = data(); if ($("js-id").value) d.id = $("js-id").value;
    const b = $("js-save"); b.disabled = true;
    try { await callFn("saveBoardSource", d); say("Saved. It will be read tomorrow morning, or press “Read now”."); reset(); await load(); } catch (error) { say(authErrorMessage(error), true); }
    b.disabled = false;
  });
  $("js-reset").addEventListener("click", () => { reset(); say(""); });
  $("js-univ").addEventListener("click", async () => {
    if (!window.confirm("Add the starting list of websites?")) return;
    say("Adding…");
    try { const r = await callFn("addUniversitySources", { auto: $("js-auto").checked }); say(r.added ? `${r.added} websites added. Press “Read all the websites now” to fill the board.` : "They are already there."); await load(); } catch (error) { say(authErrorMessage(error), true); }
  });
  $("js-jobs").addEventListener("click", async () => {
    if (!window.confirm("Add the official job websites of Europe, Asia, the Gulf and the international organisations?")) return;
    say("Adding…");
    try { const r = await callFn("addJobSources", { auto: $("js-auto").checked }); say(r.added ? `${r.added} job websites added. Press “Read all the websites now” to fill the board.` : "They are already there."); await load(); } catch (error) { say(authErrorMessage(error), true); }
  });
  $("js-run-all").addEventListener("click", async () => {
    const b = $("js-run-all"); b.disabled = true; say("Reading all the websites… this can take a minute.");
    try { const r = await callFn("runBoardSources", {}); say(`Done: ${r.added} new announcements, ${r.removed} old ones removed.`); await load(); if (window.mkJobsReload) window.mkJobsReload(); } catch (error) { say(authErrorMessage(error), true); }
    b.disabled = false;
  });
  box.addEventListener("click", async event => {
    const tr = event.target.closest("tr"); if (!tr) return;
    const r = rows.find(x => x.id === tr.dataset.id); if (!r) return;
    const btn = event.target.closest("button"); if (!btn) return;
    if (btn.classList.contains("js-edit")) {
      $("js-id").value = r.id; $("js-name").value = r.name; $("js-url").value = r.url; $("js-type").value = r.type; $("js-include").value = r.include; $("js-cat").value = r.cat; $("js-scope").value = r.scope; $("js-auto").checked = r.auto;
      $("js-save").textContent = "Save the change"; $("js-reset").hidden = false; if ($("js-form").scrollIntoView) $("js-form").scrollIntoView({ behavior: "smooth", block: "center" }); return;
    }
    if (btn.classList.contains("js-del") && !window.confirm("Delete this website? The announcements already added stay.")) return;
    btn.disabled = true;
    try {
      if (btn.classList.contains("js-run")) { const x = await callFn("runBoardSources", { id: r.id }); say(x.status === "ok" ? `${x.added} new announcements.` : x.status, x.status !== "ok"); }
      else if (btn.classList.contains("js-pause")) await callFn("saveBoardSource", { ...r, active: !r.active });
      else if (btn.classList.contains("js-del")) await callFn("deleteBoardSource", { id: r.id });
      await load();
    } catch (error) { showToast(authErrorMessage(error), "error"); }
    btn.disabled = false;
  });
  document.addEventListener("DOMContentLoaded", () => setTimeout(load, 1100));
})();


/* the owner's cover and background of the jobs board */
(function () {
  const $ = id => document.getElementById(id);
  if (!$("bl-cover")) return;
  const say = (t, bad) => { const m = $("bl-message"); m.textContent = t; m.classList.toggle("error", Boolean(bad)); };
  const save = async (fields, done) => { try { await callFn("saveBoardLook", fields); say(done); } catch (error) { say(authErrorMessage(error), true); } };
  const pick = (input, side, quality, chars, key, done) => input.addEventListener("change", async () => {
    const file = input.files && input.files[0]; input.value = "";
    if (!file) return;
    try { await save({ [key]: await fileToDataUrl(file, side, quality, chars) }, done); } catch (error) { say(error.message || "This file is not a picture.", true); }
  });
  pick($("bl-cover"), 1200, 0.7, 105000, "cover", "Cover saved. Open the board page to see it.");
  pick($("bl-back"), 900, 0.5, 85000, "backdrop", "Background saved. Open the board page to see it.");
  $("bl-cover-del").addEventListener("click", () => save({ cover: "" }, "The cover is back to the daily colour."));
  $("bl-back-del").addEventListener("click", () => save({ backdrop: "" }, "The background is plain again."));
})();


/* the opening date of registration */
(function () {
  const $ = id => document.getElementById(id);
  if (!$("op-at")) return;
  const note = (t, bad) => { $("op-admin-note").textContent = t; $("op-admin-note").classList.toggle("error", Boolean(bad)); };
  (async () => { try { const snap = await db.collection("settings").doc("opening").get(); if (snap.exists) { const d = snap.data(); $("op-at").value = String(d.at || ""); $("op-note").value = String(d.note || ""); const t = Date.parse(d.at || ""); if (d.at && Number.isFinite(t) && d.ms !== t) await db.collection("settings").doc("opening").set({ at: d.at, note: String(d.note || ""), ms: t }); } } catch { /* empty */ } })();
  $("op-save").addEventListener("click", async () => {
    const at = $("op-at").value;
    if (at && !Number.isFinite(Date.parse(at))) return note("Choose a valid date and hour.", true);
    try { await db.collection("settings").doc("opening").set({ at, note: $("op-note").value.trim().slice(0, 300), ms: at ? Date.parse(at) : 0 }); note(at ? "Saved. Visitors will see this date." : "Saved: visitors will see “soon”."); } catch (error) { note(authErrorMessage(error), true); }
  });
  $("op-clear").addEventListener("click", async () => {
    try { await db.collection("settings").doc("opening").set({ at: "", note: "", ms: 0 }); $("op-at").value = ""; $("op-note").value = ""; note("The date was removed."); } catch (error) { note(authErrorMessage(error), true); }
  });
})();

/* the size of a product photo */
(function () {
  const $ = id => document.getElementById(id);
  if (!$("img-kb")) return;
  const note = (t, bad) => { $("img-kb-note").textContent = t; $("img-kb-note").classList.toggle("error", Boolean(bad)); };
  (async () => { try { const snap = await db.collection("settings").doc("images").get(); if (snap.exists && Number(snap.data().kb) >= 10) $("img-kb").value = Number(snap.data().kb); } catch { /* the default stays */ } })();
  $("img-kb-save").addEventListener("click", async () => {
    const kb = Math.round(Number($("img-kb").value));
    if (!(kb >= 10 && kb <= 100)) return note("Write a number from 10 to 100.", true);
    try { await db.collection("settings").doc("images").set({ kb }); note(`Saved: new photos will weigh about ${kb} KB.`); } catch (error) { note(authErrorMessage(error), true); }
  });
})();


/* the US Green Card lottery link */
(function () {
  const $ = id => document.getElementById(id);
  if (!$("dv-open")) return;
  const note = (t, bad) => { $("dv-note").textContent = t; $("dv-note").classList.toggle("error", Boolean(bad)); };
  (async () => { try { const snap = await db.collection("settings").doc("dvLottery").get(); if (snap.exists) { const d = snap.data(); $("dv-open").checked = d.open === true; $("dv-until").value = d.until || ""; if (d.url) $("dv-url").value = d.url; } } catch { /* empty */ } })();
  $("dv-save").addEventListener("click", async () => {
    const url = $("dv-url").value.trim();
    if (!/^https:\/\/[a-z0-9.-]+\.gov(\/|$)/i.test(url)) return note("Write the official link: it must be a https .gov address.", true);
    try { await db.collection("settings").doc("dvLottery").set({ open: $("dv-open").checked, until: $("dv-until").value || "", url }); note($("dv-open").checked ? "Saved. The card shows on the board." : "Saved. The card is hidden."); } catch (error) { note(authErrorMessage(error), true); }
  });
})();

/* the price of a featured announcement */
(function () {
  const $ = id => document.getElementById(id);
  if (!$("ft-price")) return;
  const note = (m, bad) => { $("ft-note").textContent = m; $("ft-note").classList.toggle("error", Boolean(bad)); };
  (async () => { try { const r = await callFn("listBoard", {}); $("ft-price").value = Number(r.featuredPrice) || 0; } catch { /* stays 0 */ } })();
  $("ft-save").addEventListener("click", async () => {
    try { const r = await callFn("saveBoardFeatured", { pricePerDay: $("ft-price").value }); note(r.pricePerDay > 0 ? "Saved." : "Saved: featured announcements are off."); } catch (error) { note(authErrorMessage(error), true); }
  });
})();


/* visitors and board followers, at the top of the owner's page (the full charts are in Statistics) */
async function loadVisitTiles() {
  if (!byId("vs-today")) return;
  try {
    const snap = await db.collection("stats").orderBy("day", "desc").limit(30).get();
    const rows = snap.docs.map(d => d.data());
    const day = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
    const sum = n => rows.filter(r => String(r.day) > day(n)).reduce((a, r) => a + (Number(r.visitors) || 0), 0);
    byId("vs-today").textContent = (Number((rows.find(r => r.day === day(0)) || {}).visitors) || 0).toLocaleString();
    byId("vs-7").textContent = sum(7).toLocaleString();
    byId("vs-30").textContent = sum(30).toLocaleString();
  } catch (error) { console.error(error); }
  try {
    const f = await db.collection("settings").doc("boardFollowers").get();
    const d = f.exists ? f.data() : {};
    byId("vs-follow").textContent = (Number(d.total) || 0).toLocaleString();
    byId("vs-follow-sub").textContent = `${Number(d.follow) || 0} follow · ${Number(d.subscribe) || 0} subscribed · ${Number(d.bell) || 0} bell`;
  } catch (error) { console.error(error); }
}
loadVisitTiles();   /* same moment as the other loaders above */


/* ---------- rented advertising spaces: prices of the places, and the ad of each advertiser ---------- */
(function () {
  const $ = id => document.getElementById(id);
  if (!$("adslots-box") || !window.MK_AD_SLOTS) return;
  const CUR = "€";
  const SLOTS = window.MK_AD_SLOTS;
  const say = (id, t, bad) => { const m = $(id); m.textContent = t; m.className = "form-message " + (bad ? "error" : "success"); };
  let cfg = { prices: {}, off: [] }, ads = [], stats = {}, editing = "";
  const num = v => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
  const state = a => { const l = window.mkAdLive(a); if (a.active === false) return "Hidden"; if (l) return "Live"; const d = new Date(), day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; return a.from && day < a.from ? "Waiting" : "Ended"; };
  function draw() {
    const live = s => ads.filter(a => a.slot === s && state(a) === "Live");
    const sum = SLOTS.reduce((t, s) => t + (cfg.off.includes(s.id) ? 0 : live(s.id).length * num(cfg.prices[s.id])), 0);
    $("adslots-box").innerHTML = `<div class="table-wrap"><table class="orders-table"><thead><tr><th>Place</th><th>Page</th><th>Price per month (${CUR})</th><th>Shown</th><th>Live ads</th><th>Views</th><th>Clicks</th></tr></thead><tbody>${SLOTS.map(s => {
      const mine = ads.filter(a => a.slot === s.id), v = mine.reduce((t, a) => t + ((stats[a.id] || {}).views || 0), 0), c = mine.reduce((t, a) => t + ((stats[a.id] || {}).clicks || 0), 0);
      return `<tr><td data-label="Place"><strong>${escapeHTML(s.name)}</strong></td><td data-label="Page">${escapeHTML(s.where)}</td><td data-label="Price per month"><input type="number" min="0" step="any" class="slot-price" data-slot="${s.id}" value="${num(cfg.prices[s.id]) || ""}" placeholder="0"></td><td data-label="Shown"><input type="checkbox" class="slot-on" data-slot="${s.id}" ${cfg.off.includes(s.id) ? "" : "checked"}></td><td data-label="Live ads" class="num">${live(s.id).length}</td><td data-label="Views" class="num">${v}</td><td data-label="Clicks" class="num">${c}</td></tr>`;
    }).join("")}</tbody></table></div><p><button type="button" class="button button-teal" id="slots-save">Save the prices</button> <strong id="slots-sum">Rented now: ${formatPrice ? formatPrice(sum) : sum} per month</strong></p>`;
    $("slots-save").addEventListener("click", async () => {
      const prices = {}, off = [];
      document.querySelectorAll(".slot-price").forEach(i => { prices[i.dataset.slot] = num(i.value); });
      document.querySelectorAll(".slot-on").forEach(i => { if (!i.checked) off.push(i.dataset.slot); });
      try { await db.collection("settings").doc("adSlots").set({ prices, off }); cfg = { prices, off }; say("adslots-message", "Saved."); draw(); } catch (error) { say("adslots-message", authErrorMessage(error), true); }
    });
    const rows = [...ads].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    $("adlist-box").innerHTML = rows.length ? `<div class="table-wrap"><table class="orders-table"><thead><tr><th>Advertiser / ad</th><th>Place</th><th>From</th><th>To</th><th>State</th><th>Views</th><th>Clicks</th><th></th></tr></thead><tbody>${rows.map(a => {
      const st = stats[a.id] || {}, sl = SLOTS.find(s => s.id === a.slot);
      return `<tr><td data-label="Ad"><strong>${escapeHTML(a.advertiser || "—")}</strong><br>${escapeHTML(a.title)}</td><td data-label="Place">${escapeHTML(sl ? sl.name : a.slot)}</td><td data-label="From">${escapeHTML(a.from || "—")}</td><td data-label="To">${escapeHTML(a.to || "—")}</td><td data-label="State"><span class="status-pill">${state(a)}</span></td><td data-label="Views" class="num">${st.views || 0}</td><td data-label="Clicks" class="num">${st.clicks || 0}</td><td data-label="Actions"><button type="button" class="small-button ad-act" data-act="edit" data-id="${a.id}">Edit</button> <button type="button" class="small-button ad-act" data-act="toggle" data-id="${a.id}">${a.active === false ? "Show" : "Hide"}</button> <button type="button" class="small-button ad-act" data-act="del" data-id="${a.id}">Delete</button></td></tr>`;
    }).join("")}</tbody></table></div>` : '<p class="empty-state">No ads yet.</p>';
  }
  function form(a) {
    a = a || {};
    $("adform-title").textContent = editing ? "Change the ad" : "Add an ad";
    $("adform-box").innerHTML = `<div class="ad-row-grid"><label>Place<select id="ad-slot">${SLOTS.map(s => `<option value="${s.id}" ${a.slot === s.id ? "selected" : ""}>${escapeHTML(s.name)}</option>`).join("")}</select></label>
      <label>Advertiser (shown small)<input type="text" id="ad-adv" maxlength="80" value="${escapeHTML(a.advertiser || "")}"></label>
      <label>Title<input type="text" id="ad-title" maxlength="80" value="${escapeHTML(a.title || "")}"></label>
      <label>Text<input type="text" id="ad-text" maxlength="200" value="${escapeHTML(a.text || "")}"></label>
      <label>Link (https://…)<input type="url" id="ad-link" maxlength="300" value="${escapeHTML(a.link || "")}"></label>
      <label>Picture (https://…)<input type="url" id="ad-image" maxlength="300" value="${escapeHTML(a.image || "")}"></label>
      <label>First day<input type="date" id="ad-from" value="${escapeHTML(a.from || "")}"></label>
      <label>Last day<input type="date" id="ad-to" value="${escapeHTML(a.to || "")}"></label></div>
      <p><button type="button" class="button button-teal" id="ad-save">${editing ? "Save the changes" : "Add this ad"}</button> <button type="button" class="small-button" id="ad-cancel" ${editing ? "" : "hidden"}>Cancel the change</button></p>`;
    $("ad-cancel").addEventListener("click", () => { editing = ""; form(); });
    $("ad-save").addEventListener("click", async () => {
      const v = id => $(id).value.trim();
      const d = { slot: v("ad-slot"), advertiser: v("ad-adv"), title: v("ad-title"), text: v("ad-text"), link: v("ad-link"), image: v("ad-image"), from: v("ad-from"), to: v("ad-to"), active: true };
      if (!d.title) return say("adform-message", "Write the title of the ad.", true);
      if ((d.link && !/^https:\/\//i.test(d.link)) || (d.image && !/^https:\/\//i.test(d.image))) return say("adform-message", "The link and the picture must start with https://", true);
      if (d.from && d.to && d.to < d.from) return say("adform-message", "The last day is before the first day.", true);
      try {
        if (editing) { const old = ads.find(x => x.id === editing) || {}; d.active = old.active !== false; d.createdAt = old.createdAt || new Date().toISOString(); await db.collection("ads").doc(editing).set(d); }
        else { d.createdAt = new Date().toISOString(); await db.collection("ads").doc().set(d); }
        editing = ""; say("adform-message", "Saved. The ad appears on its first day."); form(); await load();
      } catch (error) { say("adform-message", authErrorMessage(error), true); }
    });
  }
  async function load() {
    try {
      const [c, a, s] = await Promise.all([db.collection("settings").doc("adSlots").get(), db.collection("ads").limit(300).get(), db.collection("adStats").limit(300).get()]);
      const cd = c.exists ? c.data() : {}; cfg = { prices: cd.prices || {}, off: Array.isArray(cd.off) ? cd.off : [] };
      ads = a.docs.map(d => ({ ...d.data(), id: d.id })); stats = {}; s.docs.forEach(d => { stats[d.id] = d.data(); });
    } catch (error) { console.error(error); }
    draw();
  }
  $("adlist-box").addEventListener("click", async event => {
    const b = event.target.closest(".ad-act"); if (!b) return;
    const a = ads.find(x => x.id === b.dataset.id); if (!a) return;
    try {
      if (b.dataset.act === "edit") { editing = a.id; form(a); $("adform-box").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
      if (b.dataset.act === "toggle") { const { id, ...rest } = a; await db.collection("ads").doc(id).set({ ...rest, active: a.active === false }); }
      if (b.dataset.act === "del") { if (!window.confirm("Delete this ad?")) return; await db.collection("ads").doc(a.id).delete(); }
      await load();
    } catch (error) { say("adform-message", authErrorMessage(error), true); }
  });
  form(); load();
})();
