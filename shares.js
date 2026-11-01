/* Monthly shares card: 60 % owner, 25 % deans' pool, 15 % supervisors' pool, shared by the income of each group.
   Put <div data-shares></div> on a page; the card reads monthlyShares for the chosen month. */
(function () {
  "use strict";
  const hosts = () => Array.from(document.querySelectorAll("[data-shares]"));
  const row = (n, i, s) => `<tr><td data-label="Name">${escapeHTML(n)}</td><td class="num" data-label="Income of the group">${formatPrice(i)}</td><td class="num" data-label="Share">${formatPrice(s)}</td></tr>`;
  const table = (title, list) => !list.length ? "" : `<h3 class="subhead">${title}</h3><div class="table-wrap"><table class="orders-table"><thead><tr><th>Name</th><th class="num">Income of the group</th><th class="num">Share</th></tr></thead><tbody>${list.map(x => row(x.name || "", x.income, x.share)).join("")}</tbody></table></div>`;
  /* the owner sees it group by group, like the diagram: the owner on top; each group has its dean, his supervisors, the collaborators
     who paid, the profits of the group and how they split (owner / dean / supervisors) */
  const r2 = n => Math.round(n * 100) / 100;
  const pct = (part, whole) => (whole > 0 ? Math.round(part / whole * 100) : 0);
  /* the diagram: the owner on top, then each group (dean -> his supervisors -> collaborators who paid) with the share of each */
  const collabs = n => `${n || 0} collaborator${Number(n || 0) === 1 ? "" : "s"}`;
  const node = (cls, label, name, amount, note) => `<div class="tnode ${cls}"><small>${label}</small>${name ? `<b>${escapeHTML(name)}</b>` : ""}<span>${amount}</span>${note ? `<em>${note}</em>` : ""}</div>`;
  /* The scheme of how profits are shared, always shown (even with no income yet): the owner on top, then groups; in each group the dean,
     the supervisors, the collaborators and the profits, with the percent that goes to each. */
  function scheme() {
    const group = n => `<div class="sc-group"><div class="sc-tag">Group ${n}</div>
      <div class="sc-circle">
        <div class="sc-dean"><small>Dean</small></div>
        <div class="sc-sups"><span>Supervisor 1</span><span>Supervisor 2</span><span>Supervisor 3</span></div>
        <div class="sc-collab">Collaborators</div>
        <div class="sc-profit"><small>Profits of the group</small><strong>100 %</strong></div>
      </div>
      <div class="sc-pcts"><span class="own"><b>60 %</b> to the owner</span><span class="dean"><b>25 %</b> to the dean (pool)</span><span class="sup"><b>15 %</b> to the supervisors (pool)</span></div></div>`;
    return `<div class="scheme" aria-label="How profits are shared"><div class="sc-owner"><div class="sc-own-name">Owner · the store</div><div class="sc-eng"><small>Plazavo</small><b>Data, storage, development &amp; engineering</b><span><i class="sc-eng-pct">20</i> % of the owner's share</span></div></div><div class="sc-arrows" aria-hidden="true"><span>↙</span><span>↘</span></div><div class="sc-groups">${group(1)}${group(2)}</div><p class="muted sc-note">The scheme shows the rule. The real amounts of each group are below.</p></div>`;
  }
  function treeOwner(blocks, r) {
    const total = r.total || 0;
    const cols = blocks.map((g, i) => {
      const subs = g.subs.map(x => node("sup", "Supervisor", x.name || "", formatPrice(x.share), collabs(x.partners))).join("") || '<div class="tnode empty"><small>No supervisor</small></div>';
      return `<div class="tcol">${g.head ? node("dean", "Dean · group " + (i + 1), g.head.name || "", formatPrice(g.head.share), "25 % pool") : '<div class="tnode empty"><small>No dean</small></div>'}<div class="tline"></div><div class="tsubs">${subs}</div></div>`;
    }).join("");
    const engs = r.engineers || [];
    const top = `<div class="tnode own tbox"><small>Owner · the store</small><span>${formatPrice(r.ownerNet != null ? r.ownerNet : r.owner)}</span><em>60 % + what is left of the groups</em>${engs.length ? `<div class="tin"><small>Site engineers · Plazavo</small><span>${formatPrice(r.engineerPool)}</span><em>${r.engineerPercent} % of the owner's share</em></div>` : ""}</div>`;
    return `<div class="tree" aria-label="Profit sharing diagram">${top}<div class="tline"></div><div class="trow">${cols}</div></div>`;
  }
  function treeMine(r) {
    if (r.role === "dean") {
      const subs = (r.supervisors || []).map(x => node("sup", "Supervisor", x.name || "", formatPrice(x.share), collabs(x.partners))).join("") || '<div class="tnode empty"><small>No supervisor</small></div>';
      return `<div class="tree">${node("dean me", "Dean · me", "", formatPrice(r.me.share), collabs(r.me.partners) + " in my group")}<div class="tline"></div><div class="tsubs">${subs}</div></div>`;
    }
    return `<div class="tree">${node("sup me", "Supervisor · me", "", formatPrice(r.me.share), collabs(r.me.partners) + " who paid")}</div>`;
  }
  function groups(deans, sups, r) {
    const by = {};
    sups.forEach(x => { (by[x.deanId || ""] = by[x.deanId || ""] || []).push(x); });
    const blocks = deans.map(d => ({ head: d, subs: by[d.id] || [] }));
    if (by[""] && by[""].length) blocks.push({ head: null, subs: by[""] });
    if (!blocks.length) return `<p class="muted">No group has income this month yet.</p>`;
    const cards = blocks.map((g, i) => {
      const supShare = r2(g.subs.reduce((a, x) => a + x.share, 0));
      const deanShare = g.head ? g.head.share : 0;
      const income = g.head ? g.head.income : r2(g.subs.reduce((a, x) => a + x.income, 0));
      const ownerPart = r2(income - deanShare - supShare);
      const partners = g.subs.reduce((a, x) => a + (x.partners || 0), 0);
      const chips = g.subs.length ? g.subs.map(x => `<span class="grp-chip"><b>${escapeHTML(x.name || "")}</b><small>${formatPrice(x.share)}</small></span>`).join("") : '<span class="muted">No supervisor</span>';
      const detail = `<details class="grp-detail"><summary>Details of the group</summary><div class="table-wrap"><table class="orders-table grp-table"><thead><tr><th>Name</th><th class="num">Income of the group</th><th class="num">Share</th></tr></thead><tbody>${g.head ? `<tr class="grp-head"><td data-label="Dean">${escapeHTML(g.head.name || "")}</td><td class="num" data-label="Income of the group">${formatPrice(g.head.income)}</td><td class="num" data-label="Share">${formatPrice(g.head.share)}</td></tr>` : ""}${g.subs.map(x => `<tr class="grp-sub"><td data-label="Supervisor">↳ ${escapeHTML(x.name || "")}</td><td class="num" data-label="Income of the group">${formatPrice(x.income)}</td><td class="num" data-label="Share">${formatPrice(x.share)}</td></tr>`).join("")}<tr class="grp-sum"><td data-label="Total of the group"><strong>Total of the group</strong></td><td class="num" data-label="Income">${formatPrice(income)}</td><td class="num" data-label="Share"><strong>${formatPrice(r2(deanShare + supShare))}</strong></td></tr></tbody></table></div></details>`;
      return `<article class="grp-card">
        <div class="grp-tag">${g.head ? "Group " + (i + 1) : "Supervisors with no dean"}</div>
        ${g.head ? `<div class="grp-dean"><small>Dean</small><strong>${escapeHTML(g.head.name || "")}</strong></div>` : ""}
        <div class="grp-sups"><small>Supervisors</small><div>${chips}</div></div>
        <div class="grp-collab">Collaborators who paid this month: <strong>${partners}</strong></div>
        <div class="grp-profit"><small>Profits of the group</small><strong>${formatPrice(income)}</strong></div>
        <div class="grp-split">
          <span class="own">${pct(ownerPart, income)} % <b>Owner</b> ${formatPrice(ownerPart)}</span>
          ${g.head ? `<span class="dean">${pct(deanShare, income)} % <b>Dean</b> ${formatPrice(deanShare)}</span>` : ""}
          <span class="sup">${pct(supShare, income)} % <b>Supervisors</b> ${formatPrice(supShare)}</span>
        </div>${detail}</article>`;
    }).join("");
    return treeOwner(blocks, r) + `<h3 class="subhead">Group by group</h3><div class="grp-grid">${cards}</div>`;
  }
  /* a dean sees HIS group (never the owner's part); a supervisor sees his own collaborators and his share */
  function myGroup(r) {
    const supShare = r2((r.supervisors || []).reduce((a, x) => a + x.share, 0));
    if (r.role === "dean") {
      const chips = r.supervisors.length ? r.supervisors.map(x => `<span class="grp-chip"><b>${escapeHTML(x.name || "")}</b><small>${formatPrice(x.share)}</small></span>`).join("") : '<span class="muted">No supervisor</span>';
      return `<div class="grp-grid"><article class="grp-card"><div class="grp-tag">My group</div>
        <div class="grp-dean"><small>Dean (me)</small><strong>${formatPrice(r.me.share)}</strong></div>
        <div class="grp-sups"><small>Supervisors</small><div>${chips}</div></div>
        <div class="grp-collab">Collaborators who paid this month: <strong>${r.me.partners || 0}</strong></div>
        <div class="grp-profit"><small>Profits of the group</small><strong>${formatPrice(r.me.income)}</strong></div>
        <div class="grp-split"><span class="dean">${pct(r.me.share, r.me.income)} % <b>My share</b> ${formatPrice(r.me.share)}</span><span class="sup">${pct(supShare, r.me.income)} % <b>Supervisors</b> ${formatPrice(supShare)}</span></div></article></div>`;
    }
    return `<div class="grp-grid"><article class="grp-card"><div class="grp-tag">My group</div>
      <div class="grp-sups"><small>Supervisor (me)</small><div><span class="grp-chip"><b>${formatPrice(r.me.share)}</b><small>My share</small></span></div></div>
      <div class="grp-collab">Collaborators who paid this month: <strong>${r.me.partners || 0}</strong></div>
      <div class="grp-profit"><small>Income of my collaborators</small><strong>${formatPrice(r.me.income)}</strong></div>
      <div class="grp-split"><span class="sup">${pct(r.me.share, r.me.income)} % <b>My share</b> ${formatPrice(r.me.share)}</span></div></article></div>`;
  }
  /* the owner lists the site engineers and their part of his own share */
  async function engineersBox(host) {
    const box = host.querySelector(".sh-eng"); if (!box) return;
    let cfg = { percent: 20, list: [] };
    try { cfg = await callFn("getEngineers", {}); } catch (e) { box.innerHTML = ""; return; }
    const row = e => `<tr data-id="${escapeHTML(e.id || "")}"><td data-label="Name"><input class="en-name" maxlength="60" value="${escapeHTML(e.name || "")}" aria-label="Name"></td><td data-label="Email (optional)"><input class="en-email" type="email" maxlength="120" value="${escapeHTML(e.email || "")}" aria-label="Email"></td><td class="num" data-label="Weight"><input class="en-weight" type="number" min="1" max="100" step="1" value="${Number(e.weight || 1)}" aria-label="Weight"></td><td><button type="button" class="small-button delete-button en-del">Remove</button></td></tr>`;
    const draw = () => {
      box.innerHTML = `<details class="balance-more"><summary>Site engineers: their part of the owner's share</summary>
        <p class="muted">The site's engineers receive this percent of the owner's share each month, divided by weight (equal weights = equal parts). With no engineer in the list, nothing is taken.</p>
        <label class="limit-field">Percent of the owner's share<input class="en-percent" type="number" min="0" max="50" step="0.5" value="${Number(cfg.percent)}"></label>
        <div class="table-wrap"><table class="orders-table form-table"><thead><tr><th>Name</th><th>Email (optional)</th><th class="num">Weight</th><th></th></tr></thead><tbody>${cfg.list.map(row).join("")}</tbody></table></div>
        <p><button type="button" class="small-button en-add">+ Add an engineer</button> <button type="button" class="button button-teal en-save">Save</button></p><p class="form-message en-msg" role="status"></p></details>`;
    };
    const read = () => [...box.querySelectorAll("tbody tr")].map(tr => ({ id: tr.dataset.id, name: tr.querySelector(".en-name").value, email: tr.querySelector(".en-email").value, weight: tr.querySelector(".en-weight").value }));
    draw();
    box.onclick = async ev => {
      const msg = box.querySelector(".en-msg");
      if (ev.target.closest(".en-add")) { cfg.list = read(); cfg.percent = box.querySelector(".en-percent").value; cfg.list.push({ id: "", name: "", email: "", weight: 1 }); const open = true; draw(); box.querySelector("details").open = open; return; }
      if (ev.target.closest(".en-del")) { cfg.list = read(); cfg.percent = box.querySelector(".en-percent").value; cfg.list.splice([...ev.target.closest("tbody").children].indexOf(ev.target.closest("tr")), 1); draw(); box.querySelector("details").open = true; return; }
      if (ev.target.closest(".en-save")) {
        msg.classList.remove("error"); msg.textContent = "Saving…";
        try { cfg = await callFn("saveEngineers", { percent: box.querySelector(".en-percent").value, list: read() }); draw(); box.querySelector("details").open = true; box.querySelector(".en-msg").textContent = "Saved."; load(host); }
        catch (e) { msg.textContent = (e && e.message) || "Could not save."; msg.classList.add("error"); }
      }
    };
  }
  async function load(host) {
    const month = host.querySelector(".sh-month").value;
    const out = host.querySelector(".sh-out");
    out.textContent = "Loading…";
    try {
      const r = await callFn("monthlyShares", { month });
      const tiles = r.role === "owner"
        ? `<article class="stat-tile"><span>Fees paid this month</span><strong>${formatPrice(r.total)}</strong></article><article class="stat-tile"><span>Kept by the owner</span><strong>${formatPrice(r.ownerNet != null ? r.ownerNet : r.owner)}</strong></article>${r.engineerPool > 0 ? `<article class="stat-tile"><span>Site engineers</span><strong>${formatPrice(r.engineerPool)}</strong></article>` : ""}<article class="stat-tile"><span>Of it: fees outside the groups</span><strong>${formatPrice(r.ownerOnly)}</strong></article><article class="stat-tile"><span>Deans' pool (25 %)</span><strong>${formatPrice(r.deanPool)}</strong></article><article class="stat-tile"><span>Supervisors' pool (15 %)</span><strong>${formatPrice(r.supPool)}</strong></article>`
        : r.role === "dean"
          ? `<article class="stat-tile"><span>Income of my group</span><strong>${formatPrice(r.me.income)}</strong></article><article class="stat-tile"><span>My share this month</span><strong>${formatPrice(r.me.share)}</strong></article>`
          : `<article class="stat-tile"><span>Income of my collaborators</span><strong>${formatPrice(r.me.income)}</strong></article><article class="stat-tile"><span>My share this month</span><strong>${formatPrice(r.me.share)}</strong></article>`;
      host.querySelectorAll(".sc-eng-pct").forEach(el => { if (r.engineerPercent != null) el.textContent = r.engineerPercent; });
      out.innerHTML = `<div class="stat-tiles">${tiles}</div>` + (r.role === "owner" ? groups(r.deans, r.supervisors, r) : treeMine(r) + myGroup(r)) + (r.role === "dean" ? table("My supervisors", r.supervisors) : "");
    } catch (e) { out.textContent = (e && e.message) || "Could not load."; }
  }
  function mount(host) {
    if (host.dataset.ready) return;
    host.dataset.ready = "1";
    const now = new Date().toISOString().slice(0, 7);
    host.innerHTML = `<div class="panel-heading"><h2>Profit sharing</h2><p>Of the fees paid by sellers that have a supervisor: 60 % stays with the store, 25 % is shared by the deans and 15 % by the supervisors, each in proportion to the income of his group. Fees of sellers with no supervisor stay with the store.</p></div>${scheme()}<label class="limit-field">Month<input type="month" class="sh-month" value="${now}" max="${now}"></label><div class="sh-out"></div><div class="sh-eng"></div>`;
    host.querySelector(".sh-month").addEventListener("change", () => load(host));
    load(host);
    engineersBox(host);
  }
  /* wait until the person is signed in (the pages call firebase after auth) */
  function start() { hosts().forEach(h => { if (!h.closest("[hidden]")) mount(h); }); }
  window.mkShares = { mount, start };
  window.addEventListener("load", () => setTimeout(() => { try { firebase.auth().onAuthStateChanged(u => { if (u) start(); }); } catch (e) { /* page without sign-in */ } }, 300));
  document.addEventListener("click", () => setTimeout(start, 50));
})();
