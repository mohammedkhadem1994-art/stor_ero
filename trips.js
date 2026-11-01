"use strict";

/* Travel agency (inside merchant.html): the bus trips and their numbered seats. Requires store.js and seatmap.js. */
window.setupTripsPanel = function (me, getShop) {
  const $ = id => document.getElementById(id);
  if (!$("trips-panel")) return;
  $("trips-panel").hidden = false;
  let soldNow = null, trips = [], openId = "", map = null, picked = new Set(), holderSeat = 0;
  const pax = {};
  window.paxBind($("tr-map"), pax);
  const say = (text, bad) => { const m = $("tr-message"); m.textContent = text; m.classList.toggle("error", Boolean(bad)); };
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  $("tr-day").min = today();
  const reset = () => { $("tr-id").value = ""; $("tr-from").value = ""; $("tr-to").value = ""; $("tr-day").value = ""; $("tr-time").value = ""; $("tr-seats").value = "56"; $("tr-price").value = ""; $("tr-repeat").value = "1"; $("tr-repeat-box").hidden = false; $("tr-save").textContent = "Add trip"; $("tr-cancel").hidden = true; };

  function drawList() {
    $("tr-list").innerHTML = trips.length ? `<div class="table-wrap"><table class="orders-table"><thead><tr><th>Day</th><th>Trip</th><th>Seats</th><th>Price / seat</th><th>Shown</th><th></th></tr></thead><tbody>${trips.map(t => `<tr data-id="${escapeHTML(t.id)}"${t.id === openId ? ' class="appt-today"' : ""}>
      <td data-label="Day"><strong>${escapeHTML(t.day)}</strong><br><small class="muted">${escapeHTML(t.time)}</small></td>
      <td data-label="Trip">${escapeHTML(t.from)} → ${escapeHTML(t.to)}</td>
      <td data-label="Seats">${escapeHTML(String(t.taken))} / ${escapeHTML(String(t.seats))}</td>
      <td data-label="Price / seat">${escapeHTML(t.price ? formatPrice(t.price) : "Free")}</td>
      <td data-label="Shown"><label class="visibility-control"><input type="checkbox" class="tr-vis"${t.visible ? " checked" : ""} aria-label="Shown to customers"></label></td>
      <td data-label="Actions"><button type="button" class="small-button tr-seats">Seats</button> <button type="button" class="small-button tr-edit">Edit</button> <button type="button" class="small-button delete-button tr-del">Delete</button></td></tr>`).join("")}</tbody></table></div>`
      : '<p class="empty-state">No trip yet. Add your first bus trip above: customers can not book until you do.</p>';
  }
  async function load() {
    try { trips = (await callFn("listTrips", { providerId: me.uid })).trips || []; drawList(); }
    catch (error) { $("tr-list").innerHTML = `<p class="empty-state">${escapeHTML(authErrorMessage(error))}</p>`; }
  }

  function drawMap() {
    const box = $("tr-map");
    if (!map) { box.hidden = true; box.innerHTML = ""; return; }
    const t = map.trip, holder = (map.holders || []).find(h => h.n === holderSeat);
    box.hidden = false;
    box.innerHTML = `<h3>${escapeHTML(t.from)} → ${escapeHTML(t.to)} · ${escapeHTML(t.day)} ${escapeHTML(t.time)}</h3>
      <p class="muted">${escapeHTML(String(t.taken))} of ${escapeHTML(String(t.seats))} seats taken. Tap free seats to sell them at the counter (no site fee). Tap a taken seat to see who holds it.</p>
      ${window.seatMapHTML(t.seats, map.taken, picked, true)}
      ${holder ? `<div class="trip-holder"><strong>Seat ${escapeHTML(String(holder.n))}</strong> · ${escapeHTML(holder.firstName || "")} ${escapeHTML(holder.lastName || "")} ${holder.phone ? `· <a href="tel:${escapeHTML(holder.phone)}">${escapeHTML(holder.phone)}</a>` : ""} <small class="muted">(${holder.source === "walkin" ? "counter" : "app"})</small>
        <br><small>${escapeHTML(holder.boardAt || "")} → ${escapeHTML(holder.alightAt || "")} · Ticket <strong>${escapeHTML(holder.ticketNo || "")}</strong></small>
        <br><button type="button" class="small-button tr-tk" data-seat="${escapeHTML(String(holder.n))}">Print this ticket</button> <button type="button" class="small-button delete-button tr-free" data-appt="${escapeHTML(holder.apptId)}">Cancel this booking (frees all its seats)</button></div>` : ""}
      <p><button type="button" class="small-button tr-print">Print the passenger list</button></p>
      ${picked.size ? `<form id="tr-sell" class="trip-holder" novalidate><strong>Sell seat${picked.size > 1 ? "s" : ""} ${escapeHTML([...picked].sort((a, b) => a - b).join(", "))}</strong>
        ${window.paxFormHTML([...picked].sort((a, b) => a - b), pax, t)}
        <button class="button button-teal" type="submit">Sell</button> <p id="ts-message" class="form-message" role="status"></p></form>` : ""}`;
  }
  async function openTrip(id) {
    openId = id; picked = new Set(); holderSeat = 0; for (const k of Object.keys(pax)) delete pax[k];
    try { map = await callFn("tripSeatMap", { tripId: id }); } catch (error) { map = null; say(authErrorMessage(error), true); }
    drawList(); drawMap();
    if (map && $("tr-map").scrollIntoView) $("tr-map").scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  $("tr-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("tr-save"); button.disabled = true; say("Saving…");
    try {
      const base = { from: $("tr-from").value, to: $("tr-to").value, time: $("tr-time").value, seats: $("tr-seats").value, price: $("tr-price").value };
      if ($("tr-id").value) {
        await callFn("saveTrip", { ...base, id: $("tr-id").value, day: $("tr-day").value, visible: (trips.find(t => t.id === $("tr-id").value) || {}).visible !== false });
      } else {
        const n = Math.max(1, Math.min(30, Math.round(Number($("tr-repeat").value) || 1)));
        if (!$("tr-day").value) throw new Error("Choose the day of the trip.");
        for (let i = 0; i < n; i += 1) {
          const d = new Date(Date.parse($("tr-day").value + "T00:00:00Z") + i * 86400000).toISOString().slice(0, 10);
          await callFn("saveTrip", { ...base, day: d });
        }
      }
      say("Saved."); reset(); await load();
      if (openId) openTrip(openId);
    } catch (error) { say(authErrorMessage(error), true); }
    finally { button.disabled = false; }
  });
  $("tr-cancel").addEventListener("click", () => { reset(); say(""); });
  $("tr-list").addEventListener("click", async event => {
    const row = event.target.closest("tr[data-id]"); if (!row) return;
    const t = trips.find(x => x.id === row.dataset.id); if (!t) return;
    if (event.target.closest(".tr-seats")) return openTrip(t.id);
    if (event.target.closest(".tr-edit")) {
      $("tr-id").value = t.id; $("tr-from").value = t.from; $("tr-to").value = t.to; $("tr-day").value = t.day; $("tr-time").value = t.time; $("tr-seats").value = t.seats; $("tr-price").value = t.price;
      $("tr-repeat-box").hidden = true; $("tr-save").textContent = "Save changes"; $("tr-cancel").hidden = false; $("tr-from").scrollIntoView({ block: "center", behavior: "smooth" });
    } else if (event.target.closest(".tr-del")) {
      if (!window.confirm("Delete this trip?")) return;
      try { await callFn("deleteTrip", { id: t.id }); if (openId === t.id) { openId = ""; map = null; drawMap(); } await load(); } catch (error) { say(authErrorMessage(error), true); }
    }
  });
  $("tr-list").addEventListener("change", async event => {
    const box = event.target.closest(".tr-vis"); if (!box) return;
    const t = trips.find(x => x.id === box.closest("tr").dataset.id); if (!t) return;
    try { await callFn("saveTrip", { ...t, visible: box.checked }); t.visible = box.checked; }
    catch (error) { box.checked = !box.checked; say(authErrorMessage(error), true); }
  });
  $("tr-tickets").addEventListener("click", event => {
    if (!soldNow) return;
    if (event.target.closest(".tk-all")) window.printTickets(soldNow.trip, soldNow.passengers);
    const one = event.target.closest(".tk-one"); if (one) window.printTickets(soldNow.trip, soldNow.passengers, Number(one.dataset.seat));
  });
  $("tr-check").addEventListener("submit", async event => {
    event.preventDefault();
    const out = $("tc-result"); out.textContent = "Checking…";
    try {
      const r = (await callFn("findTicket", { ticketNo: $("tc-no").value })).ticket;
      out.innerHTML = `<strong>✔ ${escapeHTML(r.ticketNo)}</strong> · ${escapeHTML(r.firstName)} ${escapeHTML(r.lastName)} · Seat ${escapeHTML(String(r.n))}<br><small>${escapeHTML(r.from)} → ${escapeHTML(r.to)} · ${escapeHTML(r.day)} ${escapeHTML(r.time)} · ${escapeHTML(r.boardAt)} → ${escapeHTML(r.alightAt)} · ${escapeHTML(r.status === "cancelled" ? "cancelled" : "valid")}</small>`;
    } catch (error) { out.textContent = authErrorMessage(error); }
  });
  $("tr-map").addEventListener("click", async event => {
    const seat = event.target.closest(".seat[data-n]");
    if (seat && map) {
      const n = Number(seat.dataset.n);
      if (map.taken.includes(n)) { holderSeat = n; picked = new Set(); } else { holderSeat = 0; if (picked.has(n)) { picked.delete(n); delete pax[n]; } else picked.add(n); }
      return drawMap();
    }
    const tk = event.target.closest(".tr-tk");
    if (tk && map) { const h = (map.holders || []).find(x => x.n === Number(tk.dataset.seat)); if (h) window.printTickets({ agency: getShop().businessName || getShop().fullName || "", from: map.trip.from, to: map.trip.to, day: map.trip.day, time: map.trip.time }, [h]); return; }
    if (event.target.closest(".tr-print") && map) {
      const tr = map.trip;
      return window.printPassengers(`${tr.from} → ${tr.to}`, [`${tr.day} ${tr.time}`, `${tr.taken} / ${tr.seats} seats`], map.holders || []);
    }
    const free = event.target.closest(".tr-free");
    if (free) {
      if (!window.confirm("Cancel this booking? All its seats become free.")) return;
      try { await callFn("answerAppointment", { id: free.dataset.appt, action: "reject" }); showToast("Booking cancelled."); await load(); await openTrip(openId); } catch (error) { showToast(authErrorMessage(error), "error"); }
    }
  });
  $("tr-map").addEventListener("submit", async event => {
    event.preventDefault();
    if (!event.target.closest("#tr-sell") || !map) return;
    const m = $("ts-message"), button = event.target.querySelector("button[type=submit]"); button.disabled = true; m.textContent = "Saving…";
    try {
      const list = window.paxList([...picked].sort((a, b) => a - b), pax, map.trip);
      if (list.some(p => !p.firstName.trim() || !p.lastName.trim())) throw new Error("Write the first name and the last name of every passenger.");
      const sold = await callFn("sellSeats", { tripId: openId, passengers: list });
      showToast("Seats sold."); soldNow = { trip: { agency: getShop().businessName || getShop().fullName || "", from: map.trip.from, to: map.trip.to, day: map.trip.day, time: map.trip.time }, passengers: sold.passengers };
      await load(); await openTrip(openId);
      $("tr-tickets").innerHTML = `<h3>Tickets just sold</h3>` + window.ticketsHTML(sold.passengers); $("tr-tickets").hidden = false;
    } catch (error) { m.textContent = authErrorMessage(error); m.classList.add("error"); button.disabled = false; }
  });
  load();
};
