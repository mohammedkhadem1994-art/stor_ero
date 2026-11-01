"use strict";
/* The owner's page shows one part at a time, like the supervisor's page: a click in the side menu opens that part alone.
   No part is deleted or switched off: the others are only put away (class "pane-away"), so everything they do keeps working.
   The first view ("Overview") is the heading, the pictures, the figures, the orders and the product editor. */
(function () {
  if (!/(^|\/)admin\.html$/.test(location.pathname) && !/(^|\/)admin$/.test(location.pathname)) return;
  const main = document.querySelector("main.admin-main");
  if (!main) return;
  const SKIP = new Set(["messages-panel"]);   /* the inbox is a drawer that opens over the page */
  const panels = () => [...main.querySelectorAll("section[id$='-panel']")].filter(s => !SKIP.has(s.id));
  /* everything else that sits in the page (heading, pictures, figures, orders, editor, the guide bar, the notes) belongs to the overview */
  const overview = () => [...main.children].filter(e => !e.matches("section[id$='-panel']") && !e.querySelector("section[id$='-panel']") && !e.classList.contains("admin-duo"));
  const wanted = () => decodeURIComponent(location.hash.slice(1));
  function apply() {
    const ps = panels(), id = wanted(), known = ps.some(p => p.id === id);
    if (id === "messages-panel") return;
    const cur = known ? id : "";
    ps.forEach(p => p.classList.toggle("pane-away", p.id !== cur));
    overview().forEach(e => e.classList.toggle("pane-away", cur !== ""));
    main.querySelectorAll(".admin-duo").forEach(d => d.classList.toggle("pane-away", ![...d.querySelectorAll("section[id$='-panel']")].some(p => p.id === cur)));
    document.body.dataset.adminPane = cur || "overview";
    fit();
    window.dispatchEvent(new Event("scroll"));
  }
  /* a part with several blocks is laid out in two columns (the second block beside the first) when its tables still fit in half the width */
  function fit() {
    main.querySelectorAll("section.admin-panel:not(.pane-away)").forEach(p => {
      if (SKIP.has(p.id) || !document.body.dataset.adminPane || document.body.dataset.adminPane === "overview") { p.classList.remove("pane-cols"); return; }
      p.classList.remove("pane-cols");
      const blocks = [...p.children].filter(e => !e.classList.contains("panel-heading") && !e.hidden && e.offsetHeight > 0);
      if (blocks.length < 4 || p.clientWidth < 900) return;
      p.classList.add("pane-cols");
      /* if a table does not fit its column (it scrolls sideways), the part goes back to one wide column */
      const over = [...p.querySelectorAll("table")].some(t => { for (let e = t; e && e !== p; e = e.parentElement) if (e.scrollWidth > e.clientWidth + 3) return true; return false; });
      if (over) p.classList.remove("pane-cols");
    });
  }
  function show() { apply(); const t = main.getBoundingClientRect().top + window.scrollY - 12; if (window.scrollY > t) window.scrollTo({ top: Math.max(0, t), behavior: "auto" }); }
  window.addEventListener("hashchange", show);
  document.addEventListener("click", ev => {
    const a = ev.target.closest && ev.target.closest("a.side-item"); if (!a) return;
    const h = a.getAttribute("href") || ""; if (!/^(admin\.html)?#overview$/.test(h)) return;
    ev.preventDefault();
    if (location.hash) history.pushState(null, "", location.pathname + location.search); apply(); window.scrollTo({ top: 0 });
  });
  const start = () => { apply(); setTimeout(apply, 600); setTimeout(apply, 2000); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  let q = false; new MutationObserver(() => { if (q) return; q = true; setTimeout(() => { q = false; apply(); }, 150); }).observe(main, { childList: true });
  window.addEventListener("resize", () => { clearTimeout(window.__fitT); window.__fitT = setTimeout(fit, 150); });
  window.mkAdminFocus = { apply, fit };
})();
