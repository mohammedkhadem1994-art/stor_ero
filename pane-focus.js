"use strict";

/* One window at a time. On pages with several parts (wallet, appointments, announcements, statistics, accounts, craftsmen)
   each button of the left menu shows its own part alone instead of one long strip.
   The part is chosen by the address (page.html#part). An unknown or hidden part falls back to the first one. */
(function () {
  const page = (location.pathname.split("/").pop() || "index.html").replace(/\.html$/, "") || "index";
  const $ = id => document.getElementById(id);
  const ids = list => list.map(id => [id, [$(id)]]);
  const BOOK = () => ids(["dr-book", "dr-mine"]);
  const GROUPS = {
    wallet: () => {
      const named = ["w-admin", "w-send", "w-withdraw", "w-seller", "w-history-panel"], app = $("w-app");
      return [["w-hero", app ? [...app.children].filter(c => !named.includes(c.id)) : []], ...ids(named)];
    },
    doctors: BOOK, barbers: BOOK, hotels: BOOK, travel: BOOK, taxi: BOOK,
    trades: () => ids(["trades-search", "trades-mine"]),
    "admin-stats": () => ids(["money-panel", "credit-panel", "growth-panel", "lists-panel", "daily-panel"]),
    accounts: () => ids(["customer", "seller", "providers", "courier", "supervisor", "dean"]),
    merchant: () => ids(["rooms-panel", "trips-panel", "styles-panel", "board-panel", "requests-panel", "details-panel"]),
    guide: () => ids(["shop", "restaurant", "pharmacy", "doctor", "barber", "hotel", "agency", "taxi", "courier", "supervisor", "dean", "customer"]),
    board: () => [["bd-list", [document.querySelector(".bd-layout")]], ["bd-mine", [$("bd-mine")]]]
  };
  /* windows that every account of a page has beside its work: the ad card and "Erase my data" open alone, from the menu */
  const EXTRAS = { merchant: ["adcard-panel", "restaurant-box", "wipe-zone"], courier: ["wipe-zone"], supervisor: ["wipe-zone"], dean: ["wipe-zone"], account: ["wipe-zone"] };
  const make = GROUPS[page] || (EXTRAS[page] ? () => [] : null);
  if (!make) return;
  let groups = [];
  const names = () => groups.map(g => g[0]);
  let forced = "";
  function apply(scroll) {
    const wanted = forced || decodeURIComponent(location.hash.slice(1)).replace(/^join$/, "trades-mine");
    const main = document.querySelector("main"), extras = (EXTRAS[page] || []).map($).filter(Boolean);
    const extraPick = extras.find(e => e.id === wanted && !e.hidden);
    /* an extra window opens alone: everything beside it, on every level up to the page, steps aside */
    document.querySelectorAll("[data-pf-away]").forEach(el => { el.classList.remove("pane-away"); el.removeAttribute("data-pf-away"); });
    extras.forEach(e => { if (e !== extraPick) e.classList.add("pane-away"); else e.classList.remove("pane-away"); });
    groups = make().map(([id, els]) => [id, els.filter(Boolean)]).filter(g => g[1].length);
    if (extraPick && main) {
      for (let node = extraPick; node && node !== main; node = node.parentElement) {
        [...node.parentElement.children].forEach(sib => { if (sib !== node && !sib.classList.contains("pane-away")) { sib.classList.add("pane-away"); sib.setAttribute("data-pf-away", ""); } });
      }
      document.body.dataset.pane = extraPick.id; if (scroll) window.scrollTo({ top: 0 }); return;
    }
    if (groups.length < 2) { document.body.dataset.pane = ""; return; }
    const live = g => g[1].some(el => !el.hidden);
    const pick = groups.find(g => g[0] === wanted && live(g)) || groups.find(live) || groups[0];
    groups.forEach(g => g[1].forEach(el => el.classList.toggle("pane-away", g !== pick)));
    document.body.dataset.pane = pick[0];
    if (scroll) window.scrollTo({ top: 0 });
  }
  window.mkPaneFocus = { has: id => groups.some(g => g[0] === id) || (EXTRAS[page] || []).includes(id), apply, open: id => { forced = id; apply(true); }, names, extras: () => (EXTRAS[page] || []).map($).filter(e => e && !e.hidden) };
  document.addEventListener("DOMContentLoaded", () => {
    apply(false); setTimeout(() => apply(false), 900);
    /* a window that appears or disappears later (it depends on who is signed in) re-chooses the one to show */
    let timer = 0; const again = () => { clearTimeout(timer); timer = setTimeout(() => apply(false), 120); };
    new MutationObserver(again).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
    const mainEl = document.querySelector("main"); if (mainEl) new MutationObserver(again).observe(mainEl, { childList: true });
    /* a tab of the page brings the normal view back from an extra window */
    document.addEventListener("click", event => {
      if (!event.target.closest(".role-tabs button, .account-nav button")) return;
      if ((EXTRAS[page] || []).includes(document.body.dataset.pane)) { forced = ""; if (/^#(adcard-panel|restaurant-box|wipe-zone)$/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search); apply(false); }
    });
  });
  window.addEventListener("hashchange", () => { forced = ""; apply(true); });
})();
