"use strict";
/* Every table in the store looks like a small, tidy spreadsheet (grid lines, compact cells, sticky header)
   and gets a little bar to make it smaller or bigger, or to open it full screen. Works on tables that
   pages draw later, too. Tables with data-no-xl (or the printed invoice) are left alone. */
(function () {
  const KEY = "mk-xl-zoom", MIN = 0.6, MAX = 1.8, STEP = 0.1;
  const clamp = z => Math.min(MAX, Math.max(MIN, Math.round(z * 10) / 10));
  let defaultZoom = 1;
  try { const v = parseFloat(localStorage.getItem(KEY)); if (v) defaultZoom = clamp(v); } catch (e) { /* no storage */ }
  /* how the text sits in every table: alignment (auto / start / center / end), width (auto / fit the content / full) and bold; the reader's choice is kept */
  const ALIGN = ["", "start", "center", "end"], FIT = ["", "fit"];
  const PKEY = k => (k === "fit" ? "mk-xl-fit2" : "mk-xl-" + k);
  const pref = { align: "", fit: "", bold: "" };
  try { for (const k of Object.keys(pref)) pref[k] = localStorage.getItem(PKEY(k)) || ""; } catch (e) { /* no storage */ }
  const savePref = () => { try { for (const k of Object.keys(pref)) localStorage.setItem(PKEY(k), pref[k]); } catch (e) { /* ignore */ } };
  const applyPref = box => { for (const k of Object.keys(pref)) { if (pref[k]) box.dataset[k] = pref[k]; else delete box.dataset[k]; } };
  const saveDefault = z => { defaultZoom = z; try { localStorage.setItem(KEY, String(z)); } catch (e) { /* ignore */ } };

  function setZoom(box, z) {
    z = clamp(z);
    box.style.setProperty("--xl-z", String(z));
    const lab = box.querySelector(".xl-pct");
    if (lab) lab.textContent = Math.round(z * 100) + "%";
    box._xlz = z;
  }
  function makeBar() {
    const bar = document.createElement("div");
    bar.className = "xl-bar";
    bar.innerHTML = '<button type="button" class="xl-btn" data-xl="out" title="Smaller" aria-label="Smaller">−</button>' +
      '<span class="xl-pct">100%</span>' +
      '<button type="button" class="xl-btn" data-xl="in" title="Bigger" aria-label="Bigger">+</button>' +
      '<button type="button" class="xl-btn" data-xl="reset" title="100%" aria-label="Reset">⟲</button>' +
      '<button type="button" class="xl-btn" data-xl="align" title="Text position: automatic, left, centre, right" aria-label="Text position">☰</button>' +
      '<button type="button" class="xl-btn" data-xl="fit" title="Table width: full width, fit the content" aria-label="Table width">↔</button>' +
      '<button type="button" class="xl-btn" data-xl="bold" title="Bold text" aria-label="Bold text"><b>B</b></button>' +
      '<button type="button" class="xl-btn" data-xl="full" title="Full screen" aria-label="Full screen">⤢</button>';
    return bar;
  }
  function enhance(table) {
    if (table.dataset.xl || table.hasAttribute("data-no-xl") || table.classList.contains("inv-table") || table.closest("[data-no-xl]")) return;
    table.dataset.xl = "1";
    table.classList.add("xl-table");
    let scroll = table.parentElement;
    if (!scroll || !scroll.classList.contains("table-wrap")) {
      scroll = document.createElement("div");
      scroll.className = "table-wrap";
      table.parentNode.insertBefore(scroll, table);
      scroll.appendChild(table);
    }
    scroll.classList.add("xl-scroll");
    const box = document.createElement("div");
    box.className = "xl-box";
    scroll.parentNode.insertBefore(box, scroll);
    box.appendChild(makeBar());
    box.appendChild(scroll);
    setZoom(box, defaultZoom);
    applyPref(box);
  }
  function refresh() {
    document.querySelectorAll("table:not([data-xl])").forEach(enhance);
    document.querySelectorAll(".xl-box").forEach(box => {
      const t = box.querySelector("table.xl-table");
      const rows = t ? t.querySelectorAll("tr").length : 0;
      const bar = box.querySelector(".xl-bar");
      /* only when it really changes: writing the same value again still counts as a change for other scripts (the side menu watches "hidden") and made the page rebuild itself in a loop */
      const hide = rows < 5 && !box.classList.contains("xl-full");
      if (bar && bar.hidden !== hide) bar.hidden = hide;
    });
  }
  let queued = false, runs = [], pausedUntil = 0;
  function schedule() {
    if (queued) return;
    const now = Date.now();
    if (now < pausedUntil) return;
    /* safety net: if the page keeps changing and this runs again and again, stop for a while (never loop with other scripts) */
    runs = runs.filter(t => now - t < 2000);
    if (runs.length >= 25) { pausedUntil = now + 10000; runs = []; return; }
    queued = true;
    setTimeout(() => { queued = false; runs.push(Date.now()); try { refresh(); } catch (e) { /* never break a page */ } }, 30);
  }
  document.addEventListener("click", ev => {
    const b = ev.target.closest && ev.target.closest(".xl-btn");
    if (!b) return;
    ev.preventDefault();
    const box = b.closest(".xl-box");
    const a = b.dataset.xl;
    if (a === "in") { setZoom(box, box._xlz + STEP); saveDefault(box._xlz); }
    else if (a === "out") { setZoom(box, box._xlz - STEP); saveDefault(box._xlz); }
    else if (a === "reset") { setZoom(box, 1); saveDefault(1); }
    else if (a === "align" || a === "fit" || a === "bold") {
      if (a === "bold") pref.bold = pref.bold ? "" : "1";
      else { const list = a === "align" ? ALIGN : FIT; pref[a] = list[(list.indexOf(pref[a]) + 1) % list.length]; }
      savePref();
      document.querySelectorAll(".xl-box").forEach(applyPref);
      const names = { "": a === "fit" ? "full width" : "automatic", start: "left", center: "centre", end: "right", fit: "fit the content", 1: "bold" };
      if (typeof showToast === "function" && a !== "bold") { const tt = window.mkT || (x => x); showToast(tt(a === "align" ? "Text position" : "Table width") + ": " + tt(names[pref[a]])); }
    }
    else if (a === "full") {
      const on = box.classList.toggle("xl-full");
      document.documentElement.classList.toggle("xl-lock", on);
      b.textContent = on ? "✕" : "⤢";
      b.title = on ? "Close" : "Full screen";
    }
  });
  document.addEventListener("keydown", ev => {
    if (ev.key !== "Escape") return;
    const box = document.querySelector(".xl-box.xl-full");
    if (!box) return;
    box.classList.remove("xl-full");
    document.documentElement.classList.remove("xl-lock");
    const f = box.querySelector('[data-xl="full"]');
    if (f) { f.textContent = "⤢"; f.title = "Full screen"; }
  });
  function start() {
    refresh();
    if (window.MutationObserver) new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
