"use strict";
/* Monthly collection tables for the supervisor, the dean and the owner. Needs store.js (callFn, escapeHTML, formatPrice).
   Mount: <div data-monthly></div>. The server decides what each role sees. */
(function () {
  const hosts = document.querySelectorAll("[data-monthly]");
  if (!hosts.length) return;
  const host = hosts[0];
  const STATE = { year: new Date().getFullYear(), data: null, open: null };
  const lang = () => (document.documentElement.lang || "en").slice(0, 2);
  const monthName = i => new Date(2024, i, 1).toLocaleString(lang(), { month: "short" });
  const T = s => (window.mkT ? window.mkT(s) : s);
  const money = n => formatPrice(Number(n) || 0);
  const ICON = { paid: "✅", partial: "◐", unpaid: "⏳", none: "·" };

  function cell(row, i, ctx) {
    const x = row.months[i];
    if (x.status === "none") return `<td class="mt-none">·</td>`;
    const label = x.status === "paid" ? money(x.due) : money(x.left);
    return `<td class="mt-${x.status}"><button type="button" class="mt-btn" data-mt="${escapeHTML(row.id)}|${ctx}|${i + 1}" title="${escapeHTML(row.name)}">${ICON[x.status]} ${escapeHTML(label)}</button></td>`;
  }
  function totalsRow(totals, label) {
    return `<tr class="mt-total"><th>${escapeHTML(label)}</th>${totals.map(t => `<td>${t.due ? `<small>${escapeHTML(T("Due"))}</small> ${money(t.due)}<br><small>${escapeHTML(T("Collected"))}</small> ${money(t.paid)}<br><small>${escapeHTML(T("Left"))}</small> <strong>${money(t.left)}</strong>` : "·"}</td>`).join("")}</tr>`;
  }
  const head = () => `<thead><tr><th>${escapeHTML(T("Collaborator"))}</th>${Array.from({ length: 12 }, (_, i) => `<th>${escapeHTML(monthName(i))}</th>`).join("")}</tr></thead>`;

  function groupHTML(g, gi, role) {
    if (!g.rows.length && role !== "owner") return "";
    const title = g.name ? `${escapeHTML(T("Supervisor"))}: ${escapeHTML(g.name)}${g.deanName && role === "owner" ? ` — ${escapeHTML(T("Dean"))}: ${escapeHTML(g.deanName)}` : ""}` : escapeHTML(T("Directly under the owner"));
    if (!g.rows.length) return "";
    return `<section class="mt-group"><h3 class="job-heading">${title}</h3><div class="mt-wrap"><table class="admin-table mt-table">${head()}<tbody>${g.rows.map(r => `<tr><th title="${escapeHTML(r.name)}">${escapeHTML(r.name)}${r.carry ? `<br><small class="muted">${escapeHTML(T("Earlier years"))}: ${money(r.carry)}</small>` : ""}</th>${r.months.map((_, i) => cell(r, i, gi)).join("")}</tr>`).join("")}${totalsRow(g.totals, T("Total"))}</tbody></table></div></section>`;
  }
  function render() {
    const d = STATE.data;
    if (!d) { host.innerHTML = `<p class="muted">${escapeHTML(T("Loading…"))}</p>`; return; }
    const years = []; const y0 = new Date().getFullYear();
    for (let y = y0 + 1; y >= y0 - 4; y--) years.push(y);
    let html = `<div class="panel-heading"><h2>${escapeHTML(T("Monthly collection table"))}</h2><p>${escapeHTML(T("Each month shows what the collaborator still owes (subscription + sales fee). Press a month to see the details and to confirm that you received the money with its reference number."))}</p></div>
      <p class="mt-bar"><label>${escapeHTML(T("Year"))} <select id="mt-year">${years.map(y => `<option${y === STATE.year ? " selected" : ""}>${y}</option>`).join("")}</select></label>
      <span class="muted">✅ ${escapeHTML(T("Paid"))} · ◐ ${escapeHTML(T("Partly paid"))} · ⏳ ${escapeHTML(T("Unpaid"))}</span></p>`;
    if (d.role === "owner" && d.system.length) html += `<section class="mt-group"><h3 class="job-heading">${escapeHTML(T("Whole system"))}</h3><div class="mt-wrap"><table class="admin-table mt-table"><thead><tr><th></th>${Array.from({ length: 12 }, (_, i) => `<th>${escapeHTML(monthName(i))}</th>`).join("")}</tr></thead><tbody>${totalsRow(d.system, T("Total"))}${d.deans.map(x => totalsRow(x.totals, `${T("Dean")}: ${x.name}`)).join("")}</tbody></table></div></section>`;
    html += d.groups.map((g, i) => groupHTML(g, i, d.role)).join("");
    if (!d.groups.some(g => g.rows.length)) html += `<p class="muted">${escapeHTML(T("No collaborators yet."))}</p>`;
    if (d.truncated) html += `<p class="muted">${escapeHTML(T("Only the first accounts are shown."))}</p>`;
    html += `<div id="mt-detail"></div>`;
    host.innerHTML = html;
    if (STATE.open) openDetail(STATE.open.merchantId, STATE.open.month, STATE.open.name);
  }
  async function load() {
    STATE.data = null; render();
    try { STATE.data = await callFn("monthlyTable", { year: STATE.year }); render(); }
    catch (e) { host.innerHTML = `<p class="form-message error">${escapeHTML(e.message || String(e))}</p>`; }
  }
  async function openDetail(merchantId, month, name) {
    const box = document.getElementById("mt-detail"); if (!box) return;
    STATE.open = { merchantId, month, name };
    box.innerHTML = `<p class="muted">${escapeHTML(T("Loading…"))}</p>`;
    try {
      const d = await callFn("monthDetail", { merchantId, month });
      const st = { paid: T("Paid"), partial: T("Partly paid"), unpaid: T("Unpaid"), none: "" }[d.status];
      const canVerify = d.role === "owner" || d.role === "dean";
      box.innerHTML = `<article class="mt-detail admin-panel"><h3>${escapeHTML(d.name)} — ${escapeHTML(month)} <small>${escapeHTML(st)}</small></h3>
        <p>${escapeHTML(T("Subscription"))}: <strong>${money(d.sub)}</strong> · ${escapeHTML(T("Sales fee"))}: <strong>${money(d.sales)}</strong> · ${escapeHTML(T("Total due"))}: <strong>${money(d.due)}</strong> · ${escapeHTML(T("Collected"))}: <strong>${money(d.paid)}</strong> · ${escapeHTML(T("Left"))}: <strong>${money(d.left)}</strong></p>
        ${d.canConfirm ? `<form id="mt-form" class="inline-form"><input type="number" id="mt-amount" min="0.01" step="0.01" max="${d.left}" value="${d.left}" required aria-label="${escapeHTML(T("Amount"))}">
          <input type="text" id="mt-ref" maxlength="40" required placeholder="${escapeHTML(T("Reference number (bank receipt)"))}" aria-label="${escapeHTML(T("Reference number"))}">
          <input type="text" id="mt-note" maxlength="200" placeholder="${escapeHTML(T("Note (optional)"))}" aria-label="${escapeHTML(T("Note"))}">
          <button class="button button-teal" type="submit">${escapeHTML(T("Confirm receipt"))}</button></form>
          <p class="muted">${escapeHTML(T("Writing the number only records it. It counts as verified when your dean or the owner checks it."))}</p>` : (d.left > 0.004 ? `<p class="muted">${escapeHTML(T("You can not confirm this month yourself."))}</p>` : "")}
        <p id="mt-msg" class="form-message" role="status"></p>
        ${d.entries.length ? `<div class="mt-wrap"><table class="admin-table"><thead><tr><th>${escapeHTML(T("Date"))}</th><th>${escapeHTML(T("Amount"))}</th><th>${escapeHTML(T("Reference number"))}</th><th>${escapeHTML(T("Confirmed by"))}</th><th>${escapeHTML(T("Status"))}</th></tr></thead><tbody>${d.entries.map(e => `<tr><td>${escapeHTML(formatDate(e.at, true))}</td><td>${money(e.amount)}</td><td>${escapeHTML(e.ref)}</td><td>${escapeHTML(e.by)}</td><td>${e.verified ? "✅ " + escapeHTML(T("Verified")) : escapeHTML(T("Recorded, not verified"))}${canVerify ? ` <button type="button" class="small-button" data-mtv="${escapeHTML(e.id)}|${e.verified ? 0 : 1}">${escapeHTML(e.verified ? T("Undo verification") : T("Mark verified"))}</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">${escapeHTML(T("No confirmation yet for this month."))}</p>`}
        </article>`;
      const form = document.getElementById("mt-form");
      if (form) form.addEventListener("submit", async ev => {
        ev.preventDefault();
        const msg = document.getElementById("mt-msg"); msg.textContent = "…";
        try {
          await callFn("confirmMonthPayment", { merchantId, month, amount: Number(document.getElementById("mt-amount").value), ref: document.getElementById("mt-ref").value, note: document.getElementById("mt-note").value });
          await load();
        } catch (e) { msg.textContent = e.message || String(e); msg.classList.add("error"); }
      });
      box.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } catch (e) { box.innerHTML = `<p class="form-message error">${escapeHTML(e.message || String(e))}</p>`; }
  }
  host.addEventListener("click", async ev => {
    const b = ev.target.closest("[data-mt]");
    if (b) { const [id, , i] = b.dataset.mt.split("|"); openDetail(id, `${STATE.year}-${String(i).padStart(2, "0")}`, b.title); return; }
    const v = ev.target.closest("[data-mtv]");
    if (v) { const [id, on] = v.dataset.mtv.split("|"); v.disabled = true; try { await callFn("verifyMonthPayment", { id, verified: on === "1" }); await openDetail(STATE.open.merchantId, STATE.open.month, STATE.open.name); } catch (e) { alert(e.message || String(e)); } }
  });
  host.addEventListener("change", ev => { if (ev.target.id === "mt-year") { STATE.year = Number(ev.target.value); STATE.open = null; load(); } });
  /* load when the tab / panel is first looked at */
  let started = false;
  const start = () => { if (started) return; started = true; (typeof getAuthState === "function" ? getAuthState() : Promise.resolve()).then(load, load); };
  const pane = host.closest(".role-pane");
  if (!pane || !pane.hidden) start();
  document.addEventListener("click", ev => { if (ev.target.closest('.role-tab[data-tab="monthly"]')) start(); });
  if (!pane) { const io = "IntersectionObserver" in window ? new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) start(); }) : null; if (io) io.observe(host); }
})();
