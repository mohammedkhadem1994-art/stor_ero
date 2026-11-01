/* Collaborators waiting for approval. A dean sees those proposed by his supervisors; the owner sees all (he can always decide).
   Put <div data-collab></div> on a page. */
(function () {
  "use strict";
  async function load(host) {
    const out = host.querySelector(".cb-out");
    const user = firebase.auth().currentUser;
    if (!user) return;
    let rows = [];
    try {
      const col = db.collection("collabProposals");
      const snap = host.dataset.collab === "dean" ? await col.where("deanId", "==", user.uid).where("status", "==", "pending").get() : await col.where("status", "==", "pending").get();
      rows = snap.docs.map(d => d.data());
    } catch (e) { out.textContent = "Could not load."; return; }
    out.innerHTML = rows.length ? `<div class="table-wrap"><table class="orders-table"><thead><tr><th>Person</th><th>Proposed by</th><th></th></tr></thead><tbody>${rows.map(x =>
      `<tr><td data-label="Person">${escapeHTML(x.email || "")}</td><td data-label="Proposed by">${escapeHTML(x.supervisorEmail || "")}</td><td><button type="button" class="small-button cb-yes" data-uid="${escapeHTML(x.uid)}">Approve</button> <button type="button" class="small-button cb-no" data-uid="${escapeHTML(x.uid)}">Refuse</button></td></tr>`).join("")}</tbody></table></div>` : '<p class="empty-state">Nobody is waiting.</p>';
  }
  function mount(host) {
    if (host.dataset.ready) return;
    host.dataset.ready = "1";
    host.innerHTML = `<div class="panel-heading"><h2>Collaborators to approve</h2><p>A supervisor proposed these people. After you approve, the person can apply as a seller or delivery partner and he is counted under that supervisor.</p></div><p class="form-message cb-msg" role="status"></p><div class="cb-out"></div>`;
    host.addEventListener("click", async event => {
      const b = event.target.closest(".cb-yes, .cb-no");
      if (!b) return;
      b.disabled = true;
      try { await callFn("decideCollaborator", { uid: b.dataset.uid, approve: b.classList.contains("cb-yes") }); showToast("Done."); } catch (e) { host.querySelector(".cb-msg").textContent = e.message || "Could not save."; }
      load(host);
    });
    load(host);
  }
  function start() { document.querySelectorAll("[data-collab]").forEach(h => { if (!h.closest("[hidden]")) mount(h); }); }
  window.addEventListener("load", () => setTimeout(() => { try { firebase.auth().onAuthStateChanged(u => { if (u) start(); }); } catch (e) { /* no sign-in here */ } }, 300));
  document.addEventListener("click", () => setTimeout(start, 50));
})();
