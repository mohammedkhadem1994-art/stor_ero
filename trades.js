"use strict";
/* Directory of craftsmen and trades: search by country, region, city and trade; a signed-in person adds his own listing (the owner approves it).
   Requires store.js. */
(function () {
  const TRADES = [
    ["plumber", "Plumber"], ["builder", "Builder / mason"], ["electrician", "Electrician"], ["painter", "Painter"], ["carpenter", "Carpenter"], ["welder", "Welder / blacksmith"],
    ["tiler", "Tiler"], ["plasterer", "Plasterer / false ceilings"], ["aluminium", "Aluminium / PVC windows"], ["glazier", "Glazier"], ["locksmith", "Locksmith"],
    ["ac-fridge", "Air conditioning & fridge repair"], ["mechanic", "Car mechanic"], ["car-body", "Car body & paint"], ["car-electric", "Car electrician"],
    ["phone-repair", "Phone repair"], ["computer-repair", "Computer repair"], ["satellite", "Satellite / antenna installer"], ["cleaning", "House cleaning"],
    ["mover", "Movers / transport"], ["gardener", "Gardener"], ["tailor", "Tailor"], ["other", "Other trade"]
  ];
  const $ = id => document.getElementById(id);
  const esc = value => (typeof escapeHTML === "function" ? escapeHTML(value) : String(value == null ? "" : value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const tradeLabel = key => (TRADES.find(t => t[0] === key) || [0, ""])[1];

  document.addEventListener("DOMContentLoaded", async () => {
    if (!$("t-list")) return;
    if (!initBackend()) return;
    TRADES.forEach(t => { $("t-trade").insertAdjacentHTML("beforeend", `<option value="${esc(t[0])}">${esc(t[1])}</option>`); $("m-trade").insertAdjacentHTML("beforeend", `<option value="${esc(t[0])}">${esc(t[1])}</option>`); });

    /* ---------- the search ---------- */
    let seq = 0;
    const waLink = phone => { let d = String(phone || "").replace(/[^\d+]/g, ""); if (d.startsWith("+")) d = d.slice(1); else if (d.startsWith("00")) d = d.slice(2); else if (d.startsWith("0")) d = ""; return d ? `https://wa.me/${d}` : ""; };
    const fill = (select, values, keep, all) => {
      select.innerHTML = `<option value="">${esc(all)}</option>` + values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
      select.value = values.includes(keep) ? keep : "";
    };
    async function search() {
      const mine = ++seq;
      const country = $("t-country").value, tradeKey = $("t-trade").value, q = $("t-q").value.trim();
      $("t-count").textContent = "Searching…";
      try {
        const r = await callFn("listArtisans", { country, tradeKey, q, region: $("t-region").value, city: $("t-city").value, sort: $("t-sort").value });
        if (mine !== seq) return;
        fill($("t-country"), r.countries || [], $("t-country").value, "All countries");
        fill($("t-region"), r.regions || [], $("t-region").value, "All regions");
        fill($("t-city"), r.cities || [], $("t-city").value, "All cities");
        const list = r.artisans || [];
        $("t-count").textContent = list.length ? `${list.length} found` : "Nobody found here yet. Try another place or trade.";
        $("t-list").innerHTML = list.length ? `<div class="table-wrap"><table class="orders-table trades-table"><thead><tr><th>Name</th><th>Trade</th><th>Phone</th><th>Country</th><th>Region</th><th>City</th><th>Rating</th><th>About</th></tr></thead><tbody>${list.map(a => {
          const wa = waLink(a.phone);
          const tel = String(a.phone).replace(/[^\d+]/g, "");
          return `<tr><td data-label="Name"><strong>${esc(a.firstName)} ${esc(a.lastName)}</strong>${a.verified ? ' <span class="verified-badge" title="Verified by the store">✔ Verified</span>' : ""}</td><td data-label="Trade">${esc(a.tradeKey === "other" ? a.trade : tradeLabel(a.tradeKey) || a.trade)}</td>
            <td data-label="Phone"><a href="tel:${esc(tel)}">📞 ${esc(a.phone)}</a>${wa ? ` <a href="${esc(wa)}" target="_blank" rel="noopener" aria-label="WhatsApp">💬</a>` : ""}</td>
            <td data-label="Country">${esc(a.country)}</td><td data-label="Region">${esc(a.region)}</td><td data-label="City">${esc(a.city)}</td><td data-label="Rating">${a.ratingCount ? `<span class="stars">★ ${esc(a.rating)}</span> <small class="muted">(${esc(a.ratingCount)})</small>` : '<small class="muted">No rating yet</small>'}<br><select class="rate-art" data-id="${esc(a.id)}" aria-label="Rate"><option value="">Rate…</option>${[5, 4, 3, 2, 1].map(n => `<option value="${n}">${"★".repeat(n)}</option>`).join("")}</select></td><td data-label="About">${esc(a.about || "")}</td></tr>`;
        }).join("")}</tbody></table></div>` : "";
      } catch (error) { if (mine === seq) { $("t-count").textContent = authErrorMessage(error); } }
    }
    let timer = 0;
    $("t-country").addEventListener("change", () => { $("t-region").value = ""; $("t-city").value = ""; search(); });
    $("t-trade").addEventListener("change", search);
    $("t-region").addEventListener("change", () => { $("t-city").value = ""; search(); });
    $("t-city").addEventListener("change", search);
    $("t-sort").addEventListener("change", search);
    $("t-list").addEventListener("change", async e => {
      const sel = e.target.closest(".rate-art");
      if (!sel || !sel.value) return;
      try { await callFn("rateArtisan", { id: sel.dataset.id, stars: sel.value }); search(); }
      catch (error) { $("t-count").textContent = authErrorMessage(error); sel.value = ""; }
    });
    $("t-q").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(search, 350); });
    search();


    /* ---------- my own listing ---------- */
    const STATUS = { pending: "Waiting for the owner's approval. People will find you once it is approved.", approved: "Your listing is online: people can find you and call you.", rejected: "Your listing was not accepted. Change it and send it again." };
    const say = (text, bad) => { const m = $("m-message"); m.textContent = text; m.classList.toggle("error", Boolean(bad)); };
    const other = () => { $("m-other-box").hidden = $("m-trade").value !== "other"; };
    $("m-trade").addEventListener("change", other);
    const state = await getAuthState();
    if (!state.user) { $("t-guest").hidden = false; return; }
    $("t-form").hidden = false;
    try {
      const mine = (await callFn("getMyArtisan", {})).listing;
      if (mine) {
        $("m-first").value = mine.firstName; $("m-last").value = mine.lastName; $("m-trade").value = mine.tradeKey; other();
        if (mine.tradeKey === "other") $("m-other").value = mine.trade;
        $("m-phone").value = mine.phone; $("m-country").value = mine.country; $("m-region").value = mine.region; $("m-city").value = mine.city; $("m-about").value = mine.about;
        $("t-status").textContent = STATUS[mine.status] || ""; $("m-delete").hidden = false;
      }
    } catch (error) { console.error(error); }
    $("t-form").addEventListener("submit", async event => {
      event.preventDefault();
      const key = $("m-trade").value;
      say("Saving…");
      try {
        const r = await callFn("saveArtisan", { firstName: $("m-first").value, lastName: $("m-last").value, tradeKey: key, trade: key === "other" ? $("m-other").value : tradeLabel(key), phone: $("m-phone").value, country: $("m-country").value, region: $("m-region").value, city: $("m-city").value, about: $("m-about").value });
        $("t-status").textContent = STATUS[r.listing.status]; $("m-delete").hidden = false;
        say("Sent. The owner will approve it soon.");
      } catch (error) { say(authErrorMessage(error), true); }
    });
    $("m-delete").addEventListener("click", async () => {
      if (!window.confirm("Remove your listing?")) return;
      try { await callFn("deleteMyArtisan", {}); $("t-form").reset(); other(); $("t-status").textContent = ""; $("m-delete").hidden = true; say("Your listing was removed."); }
      catch (error) { say(authErrorMessage(error), true); }
    });
  });
})();
