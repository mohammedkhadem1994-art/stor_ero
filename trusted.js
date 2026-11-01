"use strict";

/* Trusted delivery partners. A shop, restaurant or pharmacy names the delivery partners it trusts;
   the supervisor who brought it approves first, then his dean (the owner if nobody is above).
   window.mkTrusted.seller(el)           the seller's page: propose by email, see the state, remove
   window.mkTrusted.approver(el, field)  supervisor ("supervisorId"), dean ("deanId") or the owner ("owner") */
(function () {
  const esc = s => (window.escapeHTML ? window.escapeHTML(s) : String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));

  function stateOf(t) {
    if (t.status === "approved") return "✅ Trusted";
    if (t.status === "rejected") return "⛔ Refused";
    if (t.supStatus === "pending") return "⏳ Waiting for the supervisor";
    if (t.deanStatus === "pending") return "⏳ Waiting for the dean";
    return "⏳ Waiting for the owner";
  }
  const newest = (a, b) => String(b.at || "").localeCompare(String(a.at || ""));

  async function fetchRows(field, uid) {
    const snap = field === "owner"
      ? await db.collection("trustedCouriers").where("status", "==", "pending").get()
      : await db.collection("trustedCouriers").where(field, "==", uid).get();
    return snap.docs.map(d => ({ ...d.data(), id: d.id })).sort(newest);
  }

  async function seller(el) {
    if (!el) return;
    const user = (await getAuthState()).user;
    if (!user) return;
    async function draw() {
      let rows = [];
      try { rows = await fetchRows("merchantId", user.uid); } catch (error) { console.error(error); }
      el.innerHTML = `<form class="trusted-form" id="trust-form"><label>Email of a delivery partner you trust
          <input type="email" id="trust-email" placeholder="partner@example.com" required></label>
        <button type="submit" class="small-button">Propose</button> <span class="form-message" id="trust-msg"></span></form>
        <p class="muted">He must already be an approved delivery partner. Your supervisor, then his dean, must accept him before he shows at the top of your list.</p>
        ${rows.length ? `<div class="table-wrap"><table class="orders-table"><tbody>${rows.map(t => `<tr><td><strong>${esc(t.courierName || t.email)}</strong><br><small class="muted">${esc(t.email)}</small></td>
          <td><span class="status-pill">${stateOf(t)}</span></td><td><button type="button" class="small-button delete-button tr-remove" data-id="${esc(t.id)}">Remove</button></td></tr>`).join("")}</tbody></table></div>`
          : '<p class="empty-state">No trusted delivery partner yet.</p>'}`;
    }
    el.addEventListener("submit", async event => {
      const form = event.target.closest("#trust-form");
      if (!form) return;
      event.preventDefault();
      const msg = el.querySelector("#trust-msg");
      try {
        await callFn("proposeTrustedCourier", { email: el.querySelector("#trust-email").value });
        showToast("Sent for approval.");
        await draw();
      } catch (error) { msg.className = "form-message error"; msg.textContent = error.message || "Could not send it."; }
    });
    el.addEventListener("click", async event => {
      const btn = event.target.closest(".tr-remove");
      if (!btn) return;
      try { await callFn("removeTrustedCourier", { id: btn.dataset.id }); await draw(); }
      catch (error) { showToast(error.message || "Could not remove it.", "error"); }
    });
    await draw();
  }

  async function approver(el, field) {
    if (!el) return;
    const user = (await getAuthState()).user;
    if (!user) return;
    async function draw() {
      let rows = [];
      try { rows = await fetchRows(field, user.uid); } catch (error) { console.error(error); }
      const mine = t => t.status === "pending" && (field === "owner" || (field === "supervisorId" ? t.supStatus === "pending" : t.deanStatus === "pending" && t.supStatus !== "pending"));
      rows.sort((a, b) => mine(b) - mine(a));
      el.innerHTML = rows.length
        ? `<div class="table-wrap"><table class="orders-table"><thead><tr><th>Seller</th><th>Trusts</th><th>State</th><th></th></tr></thead><tbody>${rows.map(t => `<tr>
            <td><strong>${esc(t.merchantName || "Seller")}</strong></td><td>${esc(t.courierName || t.email)}<br><small class="muted">${esc(t.email)}</small></td>
            <td><span class="status-pill">${stateOf(t)}</span></td>
            <td>${mine(t) ? `<button type="button" class="small-button tr-decide" data-id="${esc(t.id)}" data-ok="1">Approve</button> <button type="button" class="small-button delete-button tr-decide" data-id="${esc(t.id)}" data-ok="0">Refuse</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
        : '<p class="empty-state">No request yet.</p>';
    }
    el.addEventListener("click", async event => {
      const btn = event.target.closest(".tr-decide");
      if (!btn) return;
      btn.disabled = true;
      try { await callFn("decideTrustedCourier", { id: btn.dataset.id, approve: btn.dataset.ok === "1" }); await draw(); }
      catch (error) { showToast(error.message || "Could not do it.", "error"); await draw(); }
    });
    await draw();
  }

  /* the seller's own approved list, for the courier chooser */
  async function approvedIds(uid) {
    try {
      const snap = await db.collection("trustedCouriers").where("merchantId", "==", uid).where("status", "==", "approved").get();
      return snap.docs.map(d => d.data().courierId);
    } catch { return []; }
  }

  window.mkTrusted = { seller, approver, approvedIds, stateOf };
})();
