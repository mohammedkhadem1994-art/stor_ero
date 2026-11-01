"use strict";

/* Demo pages of partners (shops, restaurants, pharmacies, doctors, barbers, hotels, agencies, taxis), made by the owner without an e-mail.
   They are shown in the store with a "Demo" tag to explain and to advertise; nobody can book or order from them. They live inside the QR codes window. */
(function () {
  const host = document.getElementById("demo-box");
  if (!host) return;
  const esc = v => (typeof escapeHTML === "function" ? escapeHTML(v) : String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const T = s => (typeof window.mkT === "function" ? window.mkT(s) : s);
  const $ = id => document.getElementById(id);
  /* kind, label, icon, page where it shows */
  const KINDS = [["shop", "Seller (shop)", "🛍️", "index.html"], ["restaurant", "Restaurant", "🍽️", "index.html"], ["pharmacy", "Pharmacy", "💊", "index.html"], ["doctor", "Doctor", "🩺", "doctors.html"], ["barber", "Barber", "💈", "barbers.html"], ["hotel", "Hotel", "🏨", "hotels.html"], ["agency", "Travel agency", "✈️", "travel.html"], ["taxi", "Taxi driver", "🚕", "taxi.html"]];
  const info = k => KINDS.find(x => x[0] === k) || KINDS[0];
  const say = (t, bad) => { const m = $("demo-msg"); if (!m) return; m.textContent = t ? T(t) : ""; m.classList.toggle("error", Boolean(bad)); };
  let demos = [];

  function build() {
    host.innerHTML = `<h3>${esc(T("Demo pages (no e-mail)"))}</h3>
      <p class="muted">${esc(T("Create sample partner pages to show visitors how the store looks. They appear in the store with a Demo tag, nobody can book or order from them, and you can delete them at any time."))}</p>
      <div class="form-two-columns">
        <div><label for="demo-kind">Kind of page</label><select id="demo-kind">${KINDS.map(k => `<option value="${k[0]}">${k[2]} ${esc(T(k[1]))}</option>`).join("")}</select></div>
        <div><label for="demo-name">Name of the page *</label><input id="demo-name" maxlength="80" autocomplete="off"></div>
        <div><label for="demo-city">City</label><input id="demo-city" maxlength="80" placeholder="Paris" autocomplete="off"></div>
        <div><label for="demo-desc">Short description</label><input id="demo-desc" maxlength="300" autocomplete="off"></div>
      </div>
      <label class="inline-check"><input id="demo-products" type="checkbox" checked> ${esc(T("Add three sample products or dishes (shops, restaurants, pharmacies)"))}</label>
      <p><button type="button" class="button button-teal" id="demo-create">Create the demo page</button></p>
      <p class="form-message" id="demo-msg" role="status"></p>
      <div id="demo-list" class="acad-list"></div>`;
  }
  function list() {
    const box = $("demo-list"); if (!box) return;
    box.innerHTML = demos.length ? demos.map(d => { const k = info(d.kind); return `<article class="acad-row" data-id="${esc(d.id)}"><div><strong>${k[2]} ${esc(d.businessName)} <span class="demo-tag">Demo</span></strong><small>${esc(T(k[1]))} · ${esc(d.city || "")}${d.productCount ? ` · ${d.productCount} ${esc(T("products"))}` : ""}</small></div>
      <div class="acad-actions"><a class="small-button" href="${esc(k[3])}${k[3] === "index.html" ? "?seller=" + encodeURIComponent(d.id) + "#products" : ""}" target="_blank" rel="noopener">${esc(T("See it in the store"))}</a><button type="button" class="small-button" data-a="edit">${esc(T("Edit"))}</button><button type="button" class="small-button danger" data-a="del">${esc(T("Delete"))}</button></div><div class="demo-edit" hidden></div></article>`; }).join("")
      : `<p class="muted">${esc(T("No demo pages yet."))}</p>`;
  }
  async function refresh() {
    const openIds = [...host.querySelectorAll(".acad-row")].filter(r => { const b = r.querySelector(".demo-edit"); return b && !b.hidden; }).map(r => r.dataset.id);
    try { demos = (await callFn("adminDemoList", {})).demos || []; } catch (e) { console.error(e); say("Could not load the demo pages.", true); }
    list();
    /* an editor that was open stays open after a save */
    for (const id of openIds) {
      const row = host.querySelector(`.acad-row[data-id="${id}"]`); if (!row || !open[id]) continue;
      try { const data = await callFn("adminDemoGet", { id }); open[id] = { data, pics: open[id].pics, prodImage: undefined, editing: "" }; row.querySelector(".demo-edit").hidden = false; drawEditor(row); } catch (e) { console.error(e); }
    }
  }
  async function create() {
    const name = $("demo-name").value.trim();
    if (name.length < 2) return say("Write the name of the page.", true);
    $("demo-create").disabled = true;
    try {
      await callFn("adminDemoCreate", { kind: $("demo-kind").value, businessName: name, city: $("demo-city").value.trim(), description: $("demo-desc").value.trim(), withProducts: $("demo-products").checked });
      ["demo-name", "demo-city", "demo-desc"].forEach(i => { $(i).value = ""; });
      say("Created. It now appears in the store with a Demo tag."); await refresh();
    } catch (e) { console.error(e); say(typeof authErrorMessage === "function" ? authErrorMessage(e) : (e.message || String(e)), true); }
    $("demo-create").disabled = false;
  }

  /* ---------- the editor of one demo page: details, the four pictures and the sample products ---------- */
  const SHOPS = ["shop", "restaurant", "pharmacy"];
  const open = {};   /* id -> { data, pics: { cover, backdrop, photo }, prodImage, editing } */
  const PICS = [["cover", "Cover picture", 900, 0.7], ["backdrop", "Background picture", 900, 0.6], ["photo", "Profile picture", 400, 0.75]];
  const ph = (kind, v) => (v ? `<img src="${esc(v)}" alt="">` : `<span class="muted">${esc(T("Not set: the store shows a sample picture."))}</span>`);
  const emsg = (row, t, bad) => { const m = row.querySelector(".demo-emsg"); if (m) { m.textContent = t ? T(t) : ""; m.classList.toggle("error", Boolean(bad)); } };
  function drawEditor(row) {
    const id = row.dataset.id, st = open[id], d = st.data, box = row.querySelector(".demo-edit");
    box.innerHTML = `<div class="form-two-columns">
        <div><label>Name of the page *</label><input data-f="businessName" maxlength="80" value="${esc(d.businessName)}"></div>
        <div><label>City</label><input data-f="city" maxlength="80" value="${esc(d.city)}"></div>
      </div>
      <label>Short description</label><input data-f="description" maxlength="300" value="${esc(d.description)}">
      <div class="demo-pics">${PICS.map(([k, label]) => `<div class="demo-pic" data-k="${k}"><strong>${esc(T(label))}</strong><div class="demo-prev ${k}">${ph(k, st.pics[k])}</div><input type="file" accept="image/*" data-pic="${k}"><button type="button" class="small-button" data-e="clear" data-k="${k}">${esc(T("Remove the picture"))}</button></div>`).join("")}</div>
      <p><button type="button" class="button button-teal" data-e="save">Save the page</button> <button type="button" class="button button-light" data-e="close">Close</button></p>
      ${SHOPS.includes(d.kind) ? `<h4>${esc(T("Sample products"))}</h4><div class="demo-prods">${d.products.map(p => `<div class="demo-prod" data-pid="${esc(p.id)}"><span class="demo-thumb">${p.image ? `<img src="${esc(p.image)}" alt="">` : "🛍️"}</span><div><strong>${esc(p.name)}</strong><small>€${esc(String(p.price))} · ${esc(p.category)}</small></div><div class="acad-actions"><button type="button" class="small-button" data-e="pedit">${esc(T("Edit"))}</button><button type="button" class="small-button danger" data-e="pdel">${esc(T("Delete"))}</button></div></div>`).join("") || `<p class="muted">${esc(T("No products yet."))}</p>`}</div>
      <div class="demo-pform"><div class="form-two-columns">
        <div><label>Name of the product *</label><input data-p="name" maxlength="100"></div>
        <div><label>Price (€)</label><input data-p="price" inputmode="decimal" placeholder="1500"></div>
        <div><label>Category</label><input data-p="category" maxlength="60"></div>
        <div><label>Picture of the product</label><input type="file" accept="image/*" data-pimg></div>
      </div><label>Description</label><input data-p="description" maxlength="300">
      <p><button type="button" class="button button-teal" data-e="psave">${esc(T(st.editing ? "Save the product" : "Add the product"))}</button> ${st.editing ? `<button type="button" class="button button-light" data-e="pcancel">${esc(T("Cancel"))}</button>` : ""}</p></div>` : ""}
      <p class="form-message demo-emsg" role="status"></p>`;
    if (st.editing) { const p = d.products.find(x => x.id === st.editing); if (p) { ["name", "price", "category", "description"].forEach(f => { box.querySelector(`[data-p="${f}"]`).value = p[f] == null ? "" : p[f]; }); } }
  }
  async function toggleEditor(row) {
    const id = row.dataset.id, box = row.querySelector(".demo-edit");
    if (!box.hidden) { box.hidden = true; return; }
    box.hidden = false; box.textContent = T("Loading…");
    try { const data = await callFn("adminDemoGet", { id }); open[id] = { data, pics: { cover: data.cover, backdrop: data.backdrop, photo: data.photo }, prodImage: undefined, editing: "" }; drawEditor(row); }
    catch (e) { console.error(e); box.textContent = typeof authErrorMessage === "function" ? authErrorMessage(e) : String(e.message || e); }
  }
  async function reloadEditor(row) { const id = row.dataset.id, keep = open[id]; const data = await callFn("adminDemoGet", { id }); open[id] = { data, pics: keep.pics, prodImage: undefined, editing: "" }; drawEditor(row); }
  host.addEventListener("change", async ev => {
    const row = ev.target.closest(".acad-row"); if (!row || !open[row.dataset.id]) return;
    const st = open[row.dataset.id], f = ev.target.files && ev.target.files[0]; if (!f) return;
    try {
      if (ev.target.dataset.pic) {
        const k = ev.target.dataset.pic, spec = PICS.find(x => x[0] === k);
        st.pics[k] = await fileToDataUrl(f, spec[2], spec[3], 110000);
        const prev = row.querySelector(`.demo-pic[data-k="${k}"] .demo-prev`); if (prev) prev.innerHTML = ph(k, st.pics[k]);
        emsg(row, "Picture ready. Press Save the page.");
      } else if (ev.target.hasAttribute("data-pimg")) { st.prodImage = await fileToDataUrl(f, 640, 0.7, 110000); emsg(row, "Picture ready. Press Add the product."); }
    } catch (e) { console.error(e); emsg(row, "This picture could not be used. Try another one.", true); }
  });
  async function editorAction(b) {
    const row = b.closest(".acad-row"), id = row.dataset.id, st = open[id]; if (!st) return;
    const val = sel => (row.querySelector(sel) || {}).value || "";
    try {
      if (b.dataset.e === "close") { row.querySelector(".demo-edit").hidden = true; }
      else if (b.dataset.e === "clear") { st.pics[b.dataset.k] = ""; const prev = row.querySelector(`.demo-pic[data-k="${b.dataset.k}"] .demo-prev`); if (prev) prev.innerHTML = ph(b.dataset.k, ""); emsg(row, "Press Save the page to apply."); }
      else if (b.dataset.e === "save") {
        await callFn("adminDemoUpdate", { id, businessName: val('[data-f="businessName"]'), city: val('[data-f="city"]'), description: val('[data-f="description"]'), cover: st.pics.cover || "", backdrop: st.pics.backdrop || "", photo: st.pics.photo || "" });
        await refresh(); const r1 = host.querySelector(`.acad-row[data-id="${id}"]`); if (r1) emsg(r1, "Saved. The store shows the new page now.");
      } else if (b.dataset.e === "pedit") { st.editing = b.closest(".demo-prod").dataset.pid; st.prodImage = undefined; drawEditor(row); row.querySelector("[data-p=name]").scrollIntoView && row.querySelector("[data-p=name]").scrollIntoView({ block: "center" }); }
      else if (b.dataset.e === "pcancel") { st.editing = ""; st.prodImage = undefined; drawEditor(row); }
      else if (b.dataset.e === "pdel") { if (!window.confirm(T("Delete this sample product?"))) return; await callFn("adminDemoProduct", { id, productId: b.closest(".demo-prod").dataset.pid, remove: true }); await refresh(); }
      else if (b.dataset.e === "psave") {
        const name = val("[data-p=name]").trim(); if (!name) return emsg(row, "Write the name of the product.", true);
        const cur = st.editing ? st.data.products.find(x => x.id === st.editing) : null;
        await callFn("adminDemoProduct", { id, productId: st.editing || undefined, name, price: val("[data-p=price]").replace(",", ".") || 0, category: val("[data-p=category]"), description: val("[data-p=description]"), image: st.prodImage !== undefined ? st.prodImage : (cur ? cur.image : "") });
        await refresh(); const r2 = host.querySelector(`.acad-row[data-id="${id}"]`); if (r2) emsg(r2, "Saved.");
      }
    } catch (e) { console.error(e); emsg(row, typeof authErrorMessage === "function" ? authErrorMessage(e) : (e.message || String(e)), true); }
  }

  host.addEventListener("click", async ev => {
    if (ev.target.closest("#demo-create")) return create();
    const eb = ev.target.closest("[data-a='edit']");
    if (eb) return toggleEditor(eb.closest(".acad-row"));
    const act = ev.target.closest("[data-e]"); if (act) return editorAction(act);
    const b = ev.target.closest("[data-a='del']"); if (!b) return;
    const id = b.closest(".acad-row").dataset.id;
    if (!window.confirm(T("Delete this demo page and its sample products?"))) return;
    try { await callFn("adminDemoDelete", { id }); await refresh(); } catch (e) { console.error(e); say(typeof authErrorMessage === "function" ? authErrorMessage(e) : (e.message || String(e)), true); }
  });
  async function start() {
    try { const st = await getAuthState(); if (!st || !st.isAdmin) return; } catch { return; }
    build(); refresh();
  }
  window.mkDemoAdmin = { refresh, create };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
