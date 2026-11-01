"use strict";
/* Rented advertising spaces. The owner rents each space (settings/adSlots has the prices) and writes the ads in the admin page (collection "ads").
   An ad is shown only between its two dates, with the badge "Ad". Views and clicks are counted by the server (adEvent), once per visitor and session. */
window.MK_AD_SLOTS = [
  { id: "rail", name: "Home page – side column", where: "index.html", many: 5 },
  { id: "board", name: "Jobs & announcements – top banner", where: "board.html", many: 1 },
  { id: "doctors", name: "Doctors page – banner", where: "doctors.html", many: 1 },
  { id: "barbers", name: "Barbers page – banner", where: "barbers.html", many: 1 },
  { id: "hotels", name: "Hotels page – banner", where: "hotels.html", many: 1 },
  { id: "travel", name: "Travel page – banner", where: "travel.html", many: 1 },
  { id: "taxi", name: "Taxi page – banner", where: "taxi.html", many: 1 },
  { id: "checkout", name: "Cart and payment – bottom banner", where: "checkout.html", many: 1 }
];
window.mkAdLive = function (ad, today) {
  const day = today || (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
  if (!ad || ad.active === false || !ad.title) return false;
  if (ad.from && day < ad.from) return false;
  if (ad.to && day > ad.to) return false;
  return true;
};
(function () {
  const https = u => { const v = String(u || "").trim(); return /^https:\/\/[^\s"'<>]+$/i.test(v) ? v : ""; };
  const seen = (kind, id) => { const k = `mk-ad-${kind}-${id}`; try { if (sessionStorage.getItem(k)) return true; sessionStorage.setItem(k, "1"); } catch { /* count anyway */ } return false; };
  const send = (id, kind) => { try { if (!seen(kind, id)) callFn("slotSeen", { id, kind }).catch(() => callFn("adEvent", { id, kind })).catch(() => {}); } catch { /* the ad still shows */ } };
  const html = ad => {
    const link = https(ad.link), img = https(ad.image);
    const body = `${img ? `<img src="${escapeHTML(img)}" alt="" loading="lazy">` : ""}<span class="ad-text"><em class="ad-badge">Ad</em><strong>${escapeHTML(ad.title)}</strong>${ad.text ? `<span>${escapeHTML(ad.text)}</span>` : ""}${ad.advertiser ? `<small>${escapeHTML(ad.advertiser)}</small>` : ""}</span>`;
    return link ? `<a class="ad-card" data-ad="${escapeHTML(ad.id)}" href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer sponsored">${body}</a>` : `<div class="ad-card" data-ad="${escapeHTML(ad.id)}">${body}</div>`;
  };
  async function run() {
    const hosts = [...document.querySelectorAll("[data-ad-slot]")];
    if (!hosts.length || typeof initBackend !== "function" || !initBackend()) return;
    let off = [];
    try { const s = await db.collection("settings").doc("adSlots").get(); if (s.exists && Array.isArray(s.data().off)) off = s.data().off; } catch { /* shown */ }
    for (const host of hosts) {
      const slot = host.dataset.adSlot, def = window.MK_AD_SLOTS.find(x => x.id === slot);
      if (!def || off.includes(slot)) { host.hidden = true; continue; }
      try {
        const snap = await db.collection("ads").where("slot", "==", slot).where("active", "==", true).limit(30).get();
        const ads = snap.docs.map(d => ({ ...d.data(), id: d.id })).filter(a => window.mkAdLive(a));
        if (!ads.length) { host.hidden = true; continue; }
        ads.sort(() => Math.random() - 0.5);
        const list = ads.slice(0, def.many);
        const box = host.querySelector(".ad-list") || host;
        box.innerHTML = list.map(html).join("");
        host.hidden = false;
        if (def.many === 1 && ads.length > 1) {
          let i = 0; send(list[0].id, "view");
          setInterval(() => { if (document.hidden) return; i = (i + 1) % ads.length; box.innerHTML = html(ads[i]); send(ads[i].id, "view"); }, 9000);
        } else list.forEach(a => send(a.id, "view"));
        host.addEventListener("click", event => { const a = event.target.closest("[data-ad]"); if (a) send(a.dataset.ad, "click"); });
      } catch (error) { console.error("Ads not loaded:", error); host.hidden = true; }
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run();
})();
