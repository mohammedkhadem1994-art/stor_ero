/* The guide pages: everybody who is signed in sees the customer guide and the guide of his own kind of account; a guest sees none; the owner sees all. */
(function () {
  "use strict";
  const LANG = () => document.documentElement.getAttribute("lang") || "en";
  function images() {
    const l = ["ar", "fr"].includes(LANG()) ? LANG() : "en";
    document.querySelectorAll("img[data-shot]").forEach(i => { const want = "guide/" + l + "/" + i.dataset.shot + ".webp"; if (i.getAttribute("src") !== want) i.setAttribute("src", want); });
  }
  function ownKind(state) {
    if (state.merchant) return state.merchant.kind || "shop";
    if (state.courier) return "courier";
    if (state.supervisor) return "supervisor";
    if (state.dean) return "dean";
    return "";
  }
  async function pdf() {
    const imgs = [...document.querySelectorAll(".guide-section:not([hidden]) img[data-shot]")];
    imgs.forEach(i => { i.loading = "eager"; });
    await Promise.all(imgs.map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
    const old = document.title; document.title = "Plazavo - guide";
    window.print(); document.title = old;
  }
  function zoom(event) {
    const img = event.target.closest(".g-shots img"); if (!img) return;
    const box = document.createElement("div"); box.className = "g-zoom";
    const big = document.createElement("img"); big.src = img.src; big.alt = ""; box.appendChild(big);
    const close = () => { box.remove(); document.removeEventListener("keydown", key); };
    const key = e => { if (e.key === "Escape") close(); };
    box.addEventListener("click", close); document.addEventListener("keydown", key); document.body.appendChild(box);
  }
  async function start() {
    document.addEventListener("click", zoom);
    images();
    const b = document.getElementById("g-pdf"); if (b) b.addEventListener("click", pdf);
    document.addEventListener("mk-language", images);
    let state = { user: null };
    try { state = await getAuthState(); } catch (e) { /* offline */ }
    const all = [...document.querySelectorAll(".guide-section")];
    const guest = !state.user;
    const mine = guest ? [] : state.isAdmin ? all.map(x => x.dataset.kind) : ["customer", ownKind(state)].filter(Boolean);
    all.forEach(x => { x.hidden = !mine.includes(x.dataset.kind); });
    document.querySelectorAll("[data-l]").forEach(x => { if (x.closest("#g-intro") && x.tagName === "P") x.hidden = !guest; });
    const tools = document.getElementById("g-tools"); if (tools) tools.hidden = guest;
    const idx = document.getElementById("g-index");
    if (idx) idx.innerHTML = all.filter(x => !x.hidden).length > 1 ? all.filter(x => !x.hidden).map(x => {
      const h = x.querySelector("h2"); const a = document.createElement("a"); a.href = "#" + x.id; a.innerHTML = h ? h.innerHTML : x.id; return a.outerHTML; }).join("") : "";
    if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t && !t.hidden) t.scrollIntoView(); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
