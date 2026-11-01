"use strict";

/* Dean dashboard: approves the sellers and delivery partners his supervisors invited, proposes supervisors, follows the debts and the fee statement. Requires store.js. */

const $ = id => document.getElementById(id);
let data = null;

document.addEventListener("click", event => {
  const tab = event.target.closest(".role-tab");
  if (!tab) return;
  document.querySelectorAll(".role-tab").forEach(item => item.classList.toggle("active", item === tab));
  document.querySelectorAll(".role-pane").forEach(pane => { pane.hidden = pane.id !== `pane-${tab.dataset.tab}`; });
});

const TYPE_NAMES = { shop: "Seller", restaurant: "Restaurant", pharmacy: "Pharmacy", doctor: "Doctor", agency: "Travel agency", taxi: "Taxi driver", barber: "Barber", hotel: "Hotel", courier: "Delivery partner" };
const supName = id => { const s = data.supervisors.find(x => x.id === id); return s ? s.email : "—"; };

function renderStats() {
  const waiting = data.collaborators.filter(c => c.status === "pending").length;
  const owedByPeople = data.collaborators.reduce((a, c) => a + c.owes, 0);
  const tile = (label, value, hint) => `<article class="admin-stat"><span>${label}</span><strong>${value}</strong>${hint ? `<small class="muted">${hint}</small>` : ""}</article>`;
  $("dn-stats").innerHTML = tile("My supervisors", data.supervisors.length) + tile("People brought in", data.collaborators.length) + tile("Waiting for my approval", waiting)
    + tile("Their debts still waiting", formatPrice(owedByPeople)) + tile("I owe the owner", formatPrice(data.dean.feeDebt), "from what supervisors handed me")
    + tile(`My share (${data.dean.sharePercent} %)`, formatPrice(data.dean.feeEarned)) + tile("Handed to the owner", formatPrice(data.dean.feeHandedOver));
}

function personRow(c) {
  const buttons = { pending: [["approved", "Approve"], ["rejected", "Reject"]], approved: [["suspended", "Suspend"]], rejected: [["approved", "Approve"]], suspended: [["approved", "Reinstate"]] }[c.status] || [];
  const lockedByDebt = c.status === "suspended" && c.suspendedReason === "debt";
  return `<tr><td><strong>${escapeHTML(c.name)}</strong><br><small class="muted">${escapeHTML(c.business)}</small></td>
    <td>${escapeHTML(TYPE_NAMES[c.type] || c.type)}</td>
    <td>${escapeHTML(c.email)}<br><small class="muted">${escapeHTML(c.phone)} · ${escapeHTML(c.city)}</small></td>
    <td><small>${escapeHTML(supName(c.supervisorId))}</small></td>
    <td>${escapeHTML(c.createdAt ? formatDate(c.createdAt) : "—")}</td>
    <td><span class="status-pill">${escapeHTML(lockedByDebt ? "paused (debt)" : c.status)}</span></td>
    <td>${buttons.filter(([s]) => !(lockedByDebt && s === "approved")).map(([s, label]) => `<button type="button" class="small-button dn-decide" data-kind="${c.kind}" data-id="${escapeHTML(c.id)}" data-status="${s}">${label}</button>`).join(" ")}
      ${c.kind === "couriers" && c.supervisorLocked && c.owes > 0 ? `${proofPickerHTML()}<button type="button" class="small-button dn-courier-collect" data-id="${escapeHTML(c.id)}" data-name="${escapeHTML(c.name)}" data-owes="${c.owes}">I received the fees (${formatPrice(c.owes)})</button>` : ""}</td></tr>`;
}

function renderPeople() {
  const order = { pending: 0, approved: 1, suspended: 2, rejected: 3 };
  const list = [...data.collaborators].sort((a, b) => (order[a.status] - order[b.status]) || String(b.createdAt).localeCompare(String(a.createdAt)));
  $("dn-people").innerHTML = list.length ? `<div class="table-wrap"><table class="orders-table"><thead><tr><th>Name</th><th>Type</th><th>Contact</th><th>Supervisor</th><th>Joined</th><th>Status</th><th></th></tr></thead><tbody>${list.map(personRow).join("")}</tbody></table></div>`
    : '<p class="empty-state">Nobody was brought in by your supervisors yet.</p>';
}

function renderSups() {
  const props = data.proposals.filter(p => p.status !== "approved");
  $("dn-sups").innerHTML = (data.supervisors.length ? `<div class="table-wrap"><table class="orders-table"><thead><tr><th>Supervisor</th><th class="num">Owes me</th><th class="num">His share</th><th class="num">Handed to me</th><th></th></tr></thead><tbody>${data.supervisors.map(s => `<tr><td><strong>${escapeHTML(s.email)}</strong>${s.locked ? ' <span class="status-pill status-rejected">locked: his people are yours</span>' : ""}</td>
      <td class="num">${formatPrice(s.feeDebt)}</td><td class="num">${formatPrice(s.feeEarned)}</td><td class="num">${formatPrice(s.feeHandedOver)}</td>
      <td>${s.feeDebt > 0 ? `${proofPickerHTML()}<button type="button" class="small-button dn-collect" data-id="${escapeHTML(s.id)}" data-name="${escapeHTML(s.email)}" data-owes="${s.feeDebt}">I received the fees</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
    : '<p class="empty-state">You have no supervisor yet. Propose one above.</p>')
    + (props.length ? `<h3 class="job-heading">Your proposals</h3><div class="table-wrap"><table class="orders-table"><tbody>${props.map(p => `<tr><td>${escapeHTML(p.email)}</td><td>${escapeHTML(formatDate(p.at))}</td><td><span class="status-pill">${p.status === "pending" ? "waiting for the owner" : escapeHTML(p.status)}</span></td></tr>`).join("")}</tbody></table></div>` : "");
}

function renderStatistics() {
  $("dn-statistics").innerHTML = scopedStatsHTML({ people: data.collaborators, supervisors: data.supervisors });
}

function renderDebts() {
  const label = { fee: "Fee added", collect: "Collected", "collect-seller": "Received from a seller", handover: "Handed to the dean", "dean-handover": "Handed to the owner", "dean-share": "My share", adjust: "Correction by the owner" };
  const rows = data.collaborators.filter(c => c.owes > 0 || c.paid > 0).sort((a, b) => b.owes - a.owes);
  const pending = rows.reduce((a, c) => a + c.owes, 0), paid = rows.reduce((a, c) => a + c.paid, 0);
  $("dn-debts").innerHTML = `<div class="stat-tiles"><article class="stat-tile"><span>Still waiting</span><strong>${formatPrice(pending)}</strong></article>
    <article class="stat-tile"><span>Already paid</span><strong>${formatPrice(paid)}</strong></article>
    <article class="stat-tile"><span>I owe the owner</span><strong>${formatPrice(data.dean.feeDebt)}</strong></article></div>
    ${rows.length ? `<div class="table-wrap"><table class="orders-table"><thead><tr><th>Person</th><th>Type</th><th>Supervisor</th><th class="num">Waiting</th><th class="num">Paid</th></tr></thead><tbody>${rows.map(c => `<tr><td><strong>${escapeHTML(c.name)}</strong><br><small class="muted">${escapeHTML(c.business)}</small></td><td>${escapeHTML(TYPE_NAMES[c.type] || c.type)}</td><td><small>${escapeHTML(supName(c.supervisorId))}</small></td><td class="num ${c.owes > 0 ? "error" : ""}">${formatPrice(c.owes)}</td><td class="num">${formatPrice(c.paid)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="empty-state">No debt yet.</p>'}
    ${data.ledger.some(e => !["handover", "dean-handover"].includes(e.type)) ? `<details><summary>Statement (${data.ledger.filter(e => !["handover", "dean-handover"].includes(e.type)).length})</summary><div class="table-wrap"><table class="orders-table"><tbody>${data.ledger.filter(e => !["handover", "dean-handover"].includes(e.type)).map(e => `<tr><td>${escapeHTML(formatDate(e.at, true))}</td><td>${escapeHTML(label[e.type] || e.type)}</td><td>${escapeHTML(e.courierName || e.merchantName || e.supervisorName || "")}</td><td class="num">${formatPrice(e.amount)}${proofLinkHTML(e.proofId)}</td></tr>`).join("")}</tbody></table></div></details>` : ""}`;
}

async function load() {
  try {
    data = await callFn("deanOverview", {});
    renderStats(); renderPeople(); renderSups(); renderDebts(); renderStatistics();
  } catch (error) { console.error(error); $("dn-people").innerHTML = `<p class="empty-state">${escapeHTML(error.message || "Could not load.")}</p>`; }
}

document.addEventListener("click", async event => {
  const decide = event.target.closest(".dn-decide");
  const collect = event.target.closest(".dn-collect");
  const direct = event.target.closest(".dn-courier-collect");
  try {
    if (direct) {
      const owes = Number(direct.dataset.owes);
      const raw = window.prompt(`How much did ${direct.dataset.name} hand to you? (he owes ${formatPrice(owes)}). His supervisor is locked, so you collect it and keep your share and his.`, String(owes));
      if (raw === null) return;
      const amount = Math.round(Number(raw) * 100) / 100;
      if (!(amount > 0) || amount > owes + 0.0001) return showToast(`Enter an amount up to ${formatPrice(owes)}.`);
      if (!confirmReceived(direct.dataset.name, amount)) return;
      const proof = await readProof(direct.closest("td")); 
      direct.disabled = true;
      await callFn("collectCourierFee", { courierId: direct.dataset.id, amount, ...(proof ? { proof } : {}) });
      showToast("Payment recorded.");
      await load();
      return;
    }
    if (decide) {
      if (decide.dataset.status !== "approved" && !window.confirm("Are you sure?")) return;
      decide.disabled = true;
      await callFn("deanDecide", { kind: decide.dataset.kind, id: decide.dataset.id, status: decide.dataset.status });
      await load();
    } else if (collect) {
      const owes = Number(collect.dataset.owes);
      const raw = window.prompt(`How much did ${collect.dataset.name} hand to you? (he owes ${formatPrice(owes)})`, String(owes));
      if (raw === null) return;
      const amount = Math.round(Number(raw) * 100) / 100;
      if (!(amount > 0) || amount > owes + 0.0001) return showToast(`Enter an amount up to ${formatPrice(owes)}.`);
      if (!confirmReceived(collect.dataset.name, amount)) return;
      const proof = await readProof(collect.closest("td"));
      collect.disabled = true;
      await callFn("recordSupervisorHandover", { supervisorId: collect.dataset.id, amount, ...(proof ? { proof } : {}) });
      showToast("Payment recorded.");
      await load();
    }
  } catch (error) { console.error(error); showToast(error.message || "Could not do it."); await load(); }
});

document.addEventListener("submit", async event => {
  if (event.target.id !== "dn-propose") return;
  event.preventDefault();
  const email = $("dn-email").value.trim().toLowerCase();
  try {
    await callFn("proposeSupervisor", { email });
    $("dn-email").value = "";
    $("dn-message").textContent = "Sent. The owner has to approve before he becomes your supervisor.";
    $("dn-message").className = "form-message";
    await load();
  } catch (error) { $("dn-message").textContent = error.message || "Could not send it."; $("dn-message").className = "form-message error"; }
});

load();
if (window.mkTrusted) mkTrusted.approver($("dn-trusted"), "deanId");
(async () => { try { const st = await getAuthState(); if (st.user && window.setupLookPanel) window.setupLookPanel(st.user, () => ({ businessName: st.user.displayName || st.user.email, kindLabel: "Dean" }), { own: true }); } catch { /* optional */ } })();
