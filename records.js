/* Owner tools: credit limits, audit log, backup download, monthly close statements.
   Put <div data-records></div> on the owner page. */
(function () {
  "use strict";
  const ACTIONS = {
    "mint-credit": "Created credit", "credit-request-approved": "Approved a credit request", "credit-request-rejected": "Declined a credit request",
    "withdraw-paid": "Paid a withdrawal", "withdraw-declined": "Declined a withdrawal", "large-transfer": "Large credit transfer",
    "credit-limits": "Changed the credit limits", "share-percent": "Set a share percentage", "adjust-earnings": "Corrected earnings",
    "supervisor-approved": "Approved a supervisor", "supervisor-refused": "Refused a supervisor", "collaborator-approved": "Approved a collaborator",
    "collaborator-refused": "Refused a collaborator", "wipe-account": "Erased an account's data", "wipe-site": "Erased the whole site", "wipe-credit": "Erased all credit",
    "month-closed": "Closed a month", "month-closed-auto": "Month closed automatically", "share-paid": "Marked a share paid", "share-unpaid": "Marked a share unpaid", "backup": "Downloaded a backup",
    "clear-threads": "Cleared messages", "coupon-saved": "Saved a discount code", "coupon-deleted": "Deleted a discount code"
  };
  const esc = v => (window.escapeHTML ? escapeHTML(v) : String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])));
  const money = v => (window.formatPrice ? formatPrice(v) : String(v));
  const detailText = d => Object.entries(d || {}).filter(([k, v]) => v !== "" && v != null && typeof v !== "object").slice(0, 5).map(([k, v]) => `${k}: ${v}`).join(" · ");

  async function loadLimits(box) {
    const msg = box.querySelector(".rc-limit-msg");
    try {
      const r = await callFn("getCreditLimits", {});
      box.querySelector(".rc-daily").value = r.daily; box.querySelector(".rc-alert").value = r.alert;
    } catch (e) { box.hidden = true; }
    box.querySelector("form").addEventListener("submit", async ev => {
      ev.preventDefault(); msg.textContent = "Saving…";
      try { await callFn("setCreditLimits", { daily: box.querySelector(".rc-daily").value, alert: box.querySelector(".rc-alert").value }); msg.textContent = "Saved."; loadAudit(); }
      catch (e) { msg.textContent = (e && e.message) || "Could not save."; }
    });
  }
  async function loadAudit() {
    const out = document.querySelector("[data-records] .rc-audit");
    if (!out) return;
    try {
      const snap = await db.collection("auditLog").orderBy("at", "desc").limit(60).get();
      out.innerHTML = snap.empty ? '<p class="muted">Nothing recorded yet.</p>' : `<div class="table-wrap"><table class="orders-table"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead><tbody>${snap.docs.map(d => d.data()).map(x => `<tr><td data-label="When">${esc(String(x.at || "").replace("T", " ").slice(0, 16))}</td><td data-label="Who">${esc(x.by === "system" ? "System" : String(x.by || "").slice(0, 8))}</td><td data-label="What">${esc(ACTIONS[x.action] || x.action)}</td><td data-label="Details">${esc(detailText(x.detail))}</td></tr>`).join("")}</tbody></table></div>`;
    } catch (e) { out.innerHTML = '<p class="error">Could not load the log.</p>'; }
  }
  async function backup(btn, msg) {
    btn.disabled = true;
    try {
      const { collections } = await callFn("backupData", {});
      const result = { exportedAt: new Date().toISOString(), collections: {} };
      for (const col of collections) {
        msg.textContent = `Reading ${col}…`;
        let after = "", list = [];
        for (let i = 0; i < 200; i++) {
          const r = await callFn("backupData", { collection: col, after });
          list = list.concat(r.docs); after = r.last;
          if (r.done) break;
        }
        result.collections[col] = list;
      }
      const blob = new Blob([JSON.stringify(result)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      msg.textContent = "Backup downloaded. Keep the file somewhere safe.";
      loadAudit();
    } catch (e) { msg.textContent = (e && e.message) || "Backup failed."; }
    btn.disabled = false;
  }
  function stmtTable(role, list, month) {
    if (!list.length) return "";
    return `<h4 class="subhead">${role === "dean" ? "Deans" : "Supervisors"}</h4><div class="table-wrap"><table class="orders-table"><thead><tr><th>Name</th><th class="num">Income of the group</th><th class="num">Share</th><th>Paid</th></tr></thead><tbody>${list.map(x => stmtRow(x, role, month)).join("")}</tbody></table></div>`;
  }
  const stmtRow = (x, role, month, sub) => `<tr${sub ? ' class="grp-sub"' : ""}><td data-label="Name">${sub ? "↳ " : ""}${esc(x.name)}</td><td class="num" data-label="Income of the group">${money(x.income)}</td><td class="num" data-label="Share">${money(x.share)}</td><td data-label="Paid"><label><input type="checkbox" data-paid="${esc(x.id)}" data-role="${role}" data-month="${esc(month)}" ${x.paid ? "checked" : ""}> ${x.paid ? "Paid" : "Not paid"}</label></td></tr>`;
  /* the statement group by group: a dean and his supervisors, then the supervisors with no dean */
  function stmtGroups(s) {
    const deans = s.deans || [], sups = s.supervisors || [];
    if (!deans.length && !sups.length) return "";
    const by = {}; sups.forEach(x => { (by[x.deanId || ""] = by[x.deanId || ""] || []).push(x); });
    const blocks = deans.map(d => ({ d, subs: by[d.id] || [] }));
    if ((by[""] || []).length) blocks.push({ d: null, subs: by[""] });
    return blocks.map(g => {
      const rows = (g.d ? stmtRow(g.d, "dean", s.month) : `<tr><td colspan="4"><strong>Supervisors with no dean</strong></td></tr>`) + g.subs.map(x => stmtRow(x, "supervisor", s.month, true)).join("");
      const sum = Math.round(((g.d ? g.d.share : 0) + g.subs.reduce((a, x) => a + x.share, 0)) * 100) / 100;
      return `<div class="table-wrap"><table class="orders-table grp-table"><thead><tr><th>Name</th><th class="num">Income of the group</th><th class="num">Share</th><th>Paid</th></tr></thead><tbody>${rows}<tr class="grp-sum"><td data-label="Total of the group"><strong>Total of the group</strong></td><td></td><td class="num" data-label="Share"><strong>${money(sum)}</strong></td><td></td></tr></tbody></table></div>`;
    }).join("");
  }
  function stmtEngineers(s) {
    const list = s.engineers || [];
    if (!list.length) return "";
    return `<h4 class="subhead">Site engineers (${esc(String(s.engineerPercent != null ? s.engineerPercent : 20))} % of the owner's share)</h4><div class="table-wrap"><table class="orders-table"><thead><tr><th>Name</th><th></th><th class="num">Share</th><th>Paid</th></tr></thead><tbody>${list.map(x => `<tr><td data-label="Name">${esc(x.name)}</td><td></td><td class="num" data-label="Share">${money(x.share)}</td><td data-label="Paid"><label><input type="checkbox" data-paid="${esc(x.id)}" data-role="engineer" data-month="${esc(s.month)}" ${x.paid ? "checked" : ""}> ${x.paid ? "Paid" : "Not paid"}</label></td></tr>`).join("")}</tbody></table></div>`;
  }
  async function loadStatements(host) {
    const out = host.querySelector(".rc-stmts");
    try {
      const snap = await db.collection("monthlyStatements").orderBy("month", "desc").limit(12).get();
      out.innerHTML = snap.empty ? '<p class="muted">No month was closed yet. A month closes by itself on the 1st of the next month.</p>' : snap.docs.map(d => d.data()).map(s => `<article class="stmt" data-stmt="${esc(s.month)}"><header><strong>${esc(s.month)}</strong> <small class="muted">${s.auto ? "closed automatically" : "closed by you"} · fees paid ${money(s.total || 0)} · owner ${money(s.ownerNet != null ? s.ownerNet : (s.owner != null ? s.owner : 0))}</small> <button type="button" class="button button-light rc-print" data-month="${esc(s.month)}">🖨️ Print</button></header>${stmtGroups(s)}${stmtEngineers(s)}</article>`).join("");
    } catch (e) { out.innerHTML = '<p class="error">Could not load the statements.</p>'; }
  }
  /* small tiles: each section opens in its own window */
  function tilesOf(host) {
    const store = document.createElement("div"); store.className = "rc-store"; store.hidden = true;
    const secs = [...host.querySelectorAll(".rc-sec")];
    secs.forEach(sec => store.appendChild(sec));
    const grid = document.createElement("div"); grid.className = "rc-tiles";
    grid.innerHTML = secs.map((sec, i) => `<button type="button" class="rc-tile" data-i="${i}"><span class="rc-tile-icon" aria-hidden="true">${sec.dataset.icon}</span><span class="rc-tile-title">${esc(sec.dataset.title)}</span></button>`).join("");
    const modal = document.createElement("div"); modal.className = "appt-modal rc-modal"; modal.hidden = true;
    modal.innerHTML = '<div class="appt-modal-card"><button type="button" class="appt-modal-x" aria-label="Close">×</button><div class="rc-modal-body"></div></div>';
    const body = modal.querySelector(".rc-modal-body");
    const close = () => { while (body.firstChild) store.appendChild(body.firstChild); modal.hidden = true; document.body.classList.remove("modal-open"); };
    grid.addEventListener("click", event => {
      const t = event.target.closest(".rc-tile"); if (!t) return;
      body.appendChild(secs[Number(t.dataset.i)]); modal.hidden = false; document.body.classList.add("modal-open");
    });
    modal.querySelector(".appt-modal-x").addEventListener("click", close);
    modal.addEventListener("click", event => { if (event.target === modal) close(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && !modal.hidden) close(); });
    host.prepend(grid); host.append(store, modal);
  }
  function mount(host) {
    if (host.dataset.ready) return;
    host.dataset.ready = "1";
    const dz = Boolean(window.MK_EDITION && MK_EDITION.dz);
    const prev = new Date(); prev.setUTCDate(1); prev.setUTCMonth(prev.getUTCMonth() - 1);
    host.innerHTML = `
      ${dz ? `<div class="rc-limits rc-sec" data-icon="🔒" data-title="Credit sending safety"><h3 class="subhead">Credit sending safety</h3><p class="muted">Every sender sees the receiver's name and confirms. A person can send up to the daily limit; a transfer at or above the alert size notifies you. Write 0 to turn one off.</p>
        <form class="wallet-form"><label class="limit-field">Daily limit per person (€)<input class="rc-daily" type="number" min="0" step="1"></label><label class="limit-field">Alert from (€)<input class="rc-alert" type="number" min="0" step="1"></label><button class="button button-teal" type="submit">Save limits</button></form><p class="form-message rc-limit-msg" role="status"></p></div>` : ""}
      ${dz ? `<div class="rc-coupons rc-sec" data-icon="🏷️" data-title="Discount codes"><h3 class="subhead">Discount codes</h3><p class="muted">For the store's own products only. The store pays for the discount. A customer can use a code once.</p>
        <form class="wallet-form rc-coupon-form"><label class="limit-field">Code<input class="cp-code" maxlength="24" required></label><label class="limit-field">Percent (1-90)<input class="cp-percent" type="number" min="0" max="90"></label><label class="limit-field">or Amount (€)<input class="cp-amount" type="number" min="0"></label><label class="limit-field">Minimum order<input class="cp-min" type="number" min="0"></label><label class="limit-field">Max uses (0 = unlimited)<input class="cp-max" type="number" min="0"></label><label class="limit-field">Expires<input class="cp-exp" type="date"></label><button class="button button-teal" type="submit">Save code</button></form><p class="form-message rc-cp-msg" role="status"></p><div class="rc-cp-list"></div></div>` : ""}
      <div class="rc-sec" data-icon="💾" data-title="Backup"><h3 class="subhead">Backup</h3><p class="muted">Download the money and account records (balances, history, fees, statements, staff) as one file.</p>
      <button type="button" class="button button-teal rc-backup">⬇️ Download backup</button> <span class="form-message rc-backup-msg" role="status"></span></div>
      <div class="rc-sec" data-icon="📅" data-title="Monthly statements"><h3 class="subhead">Monthly statements</h3>
      <div class="rc-close"><label class="limit-field">Close a month now<input type="month" class="rc-month" value="${prev.toISOString().slice(0, 7)}"></label><button type="button" class="button button-light rc-close-btn">Close this month</button> <span class="form-message rc-close-msg" role="status"></span></div>
      <div class="rc-stmts">Loading…</div></div>
      <div class="rc-sec" data-icon="📜" data-title="Activity log"><h3 class="subhead">Activity log</h3><div class="rc-audit">Loading…</div></div>`;
    tilesOf(host);
    if (dz) loadLimits(host.querySelector(".rc-limits"));
    if (dz) {
      const list = host.querySelector(".rc-cp-list"), cmsg = host.querySelector(".rc-cp-msg");
      const loadCoupons = async () => {
        try {
          const snap = await db.collection("coupons").get();
          list.innerHTML = snap.empty ? '<p class="muted">No code yet.</p>' : `<div class="table-wrap"><table class="orders-table"><thead><tr><th>Code</th><th>Discount</th><th>Used</th><th>Expires</th><th></th></tr></thead><tbody>${snap.docs.map(d => d.data()).map(c => `<tr><td data-label="Code"><strong>${esc(c.code)}</strong></td><td data-label="Discount">${c.percent ? esc(c.percent) + " %" : money(c.amount)}${c.minTotal ? " · min " + money(c.minTotal) : ""}</td><td data-label="Used">${esc(c.used || 0)}${c.maxUses ? " / " + esc(c.maxUses) : ""}</td><td data-label="Expires">${esc(c.expires || "—")}</td><td><button type="button" class="small-button delete-button cp-del" data-code="${esc(c.code)}">Delete</button></td></tr>`).join("")}</tbody></table></div>`;
        } catch (e) { list.innerHTML = '<p class="error">Could not load the codes.</p>'; }
      };
      host.querySelector(".rc-coupon-form").addEventListener("submit", async ev => {
        ev.preventDefault();
        const q = c => host.querySelector(".cp-" + c).value;
        try { await callFn("saveCoupon", { code: q("code"), percent: q("percent"), amount: q("amount"), minTotal: q("min"), maxUses: q("max"), expires: q("exp") }); cmsg.textContent = "Saved."; ev.target.reset(); loadCoupons(); loadAudit(); }
        catch (e) { cmsg.textContent = (e && e.message) || "Could not save."; }
      });
      list.addEventListener("click", async ev => {
        const b = ev.target.closest(".cp-del"); if (!b || !window.confirm("Delete this code?")) return;
        try { await callFn("deleteCoupon", { code: b.dataset.code }); loadCoupons(); loadAudit(); } catch (e) { cmsg.textContent = (e && e.message) || "Could not delete."; }
      });
      loadCoupons();
    }
    host.querySelector(".rc-backup").addEventListener("click", e => backup(e.currentTarget, host.querySelector(".rc-backup-msg")));
    host.querySelector(".rc-close-btn").addEventListener("click", async () => {
      const m = host.querySelector(".rc-month").value, msg = host.querySelector(".rc-close-msg");
      try { const r = await callFn("closeMonth", { month: m }); msg.textContent = r.already ? "This month was already closed." : "Month closed."; loadStatements(host); loadAudit(); }
      catch (e) { msg.textContent = (e && e.message) || "Could not close."; }
    });
    host.addEventListener("change", async e => {
      const c = e.target.closest("input[data-paid]");
      if (!c) return;
      try { await callFn("setStatementPaid", { month: c.dataset.month, role: c.dataset.role, id: c.dataset.paid, paid: c.checked }); c.parentElement.lastChild.textContent = c.checked ? " Paid" : " Not paid"; }
      catch (err) { c.checked = !c.checked; alert((err && err.message) || "Could not save."); }
    });
    host.addEventListener("click", e => {
      const p = e.target.closest(".rc-print");
      if (!p) return;
      const art = host.querySelector(`[data-stmt="${p.dataset.month}"]`).cloneNode(true);
      art.querySelectorAll("button").forEach(b => b.remove());
      const w = window.open("", "_blank");
      if (!w) return;
      w.document.write(`<!doctype html><meta charset="utf-8"><title>Statement ${esc(p.dataset.month)}</title><style>body{font:14px system-ui;padding:24px}table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #bbb;padding:6px 8px;text-align:start}</style><h2>Plazavo: monthly statement ${esc(p.dataset.month)}</h2>${art.innerHTML}`);
      w.document.close(); w.focus(); w.print();
    });
    loadStatements(host); loadAudit();
  }
  function start() { document.querySelectorAll("[data-records]").forEach(h => { if (!h.closest("[hidden]")) mount(h); }); }
  window.addEventListener("load", () => setTimeout(() => { try { firebase.auth().onAuthStateChanged(u => { if (u) start(); }); } catch (e) { /* no sign-in */ } }, 300));
})();
