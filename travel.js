"use strict";

/* Customers: choose a travel agency and a bus trip, then numbered seats on the bus. Confirmed at once; a seat can never be sold twice. Requires store.js and seatmap.js. */

const MY_STATUS = { pending: "Waiting for the answer", accepted: "Confirmed", rejected: "Cancelled by the agency", done: "Done", cancelled: "Cancelled" };

async function setupTravel() {
  const $ = id => document.getElementById(id);
  if (!$("dr-form")) return;
  if (!initBackend()) return;
  const { user } = await getAuthState();
  if (!user) { $("dr-signin").hidden = false; $("dr-book").hidden = true; return; }
  const say = (text, bad) => { const m = $("dr-message"); m.textContent = text; m.classList.toggle("error", Boolean(bad)); };
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  $("dr-fday").min = today();

  let lastBooked = null, agencies = [], trips = [], trip = null, taken = new Set(), picked = new Set(), pax = {};
  window.paxBind($("dr-pax"), pax);
  try { agencies = (await callFn("listProviders", { service: "travel" })).providers || []; } catch (error) { console.error(error); }
  $("dr-doctor").innerHTML = agencies.length
    ? '<option value="">Choose a travel agency…</option>' + agencies.map(d => `<option value="${escapeHTML(d.id)}">${escapeHTML(d.name)}${d.demo ? " · Demo" : d.bookingClosed ? " · closed" : ""}${d.city ? " · " + escapeHTML(d.city) : ""}</option>`).join("")
    : '<option value="">No travel agency is available yet</option>';

  const payNote = document.createElement("p"); payNote.className = "muted"; payNote.id = "dr-pay";
  $("dr-doctor").insertAdjacentElement("afterend", payNote);
  const showPay = () => {
    const d = agencies.find(x => x.id === $("dr-doctor").value);
    if (!d) { payNote.textContent = ""; return; }
    payNote.innerHTML = `${d.address ? escapeHTML(d.address) + ". " : ""}${d.pay ? payChipsHTML(d.pay) : ""}`;
    const b = $("dr-form").querySelector("button[type=submit]"); if (b) b.disabled = Boolean(d.bookingClosed);
    if (d.bookingClosed) say(d.demo ? "This is a demo page, shown only as an example. Booking is not possible here." : "Bookings are closed right now. Please try again later.", true);
  };

  /* the cover picture and the faint background the agency chose for his page */
  const looks = {};
  const coverBox = document.createElement("div"); coverBox.id = "dr-cover"; coverBox.className = "page-head"; coverBox.hidden = true;
  $("dr-form").insertAdjacentElement("beforebegin", coverBox);
  const backBox = document.createElement("div"); backBox.id = "dr-backdrop"; backBox.className = "dr-backdrop"; backBox.hidden = true; backBox.setAttribute("aria-hidden", "true");
  document.body.appendChild(backBox);
  async function showLook() {
    const id = $("dr-doctor").value;
    coverBox.hidden = backBox.hidden = true; coverBox.innerHTML = ""; backBox.style.backgroundImage = "";
    if (!id) return;
    if (!looks[id]) { try { looks[id] = await callFn("providerLook", { id }); } catch { looks[id] = { cover: "", backdrop: "" }; } }
    if ($("dr-doctor").value !== id) return;
    const l = looks[id], c = imageSrc(l.cover), b = imageSrc(l.backdrop);
    const d = agencies.find(x => x.id === id) || {}, ph = imageSrc(l.photo);
    coverBox.innerHTML = `<div class="ph-cover">${c ? `<img src="${escapeHTML(c)}" alt="">` : ""}</div><div class="ph-row"><div class="ph-avatar">${ph ? `<img src="${escapeHTML(ph)}" alt="">` : `<span>${escapeHTML((d.name || "?").charAt(0).toUpperCase())}</span>`}</div><div class="ph-id"><h2>${escapeHTML(d.name || "")}</h2><p class="muted">${escapeHTML([d.specialty, d.city].filter(Boolean).join(" · "))}</p></div></div>`;
    coverBox.hidden = false;
    if (b) { backBox.style.backgroundImage = `url("${b}")`; backBox.hidden = false; }
  }

  function drawSeats() {
    $("dr-seats-box").hidden = !trip;
    if (!trip) return;
    $("dr-map").innerHTML = window.seatMapHTML(trip.seats, taken, picked, false);
    const list = [...picked].sort((a, b) => a - b);
    $("dr-picked").textContent = list.length ? `Seat ${list.join(", ")} · ${trip.price ? formatPrice(trip.price * list.length) : "Free"}` : "Tap the seats you want.";
    /* the first passenger is the person booking, until he writes another name */
    if (list.length && !(pax[list[0]] && (pax[list[0]].firstName || pax[list[0]].lastName))) pax[list[0]] = { ...(pax[list[0]] || {}), firstName: $("dr-first").value, lastName: $("dr-last").value, phone: $("dr-phone").value };
    $("dr-pax").innerHTML = window.paxFormHTML(list, pax, trip);
  }
  async function openTrip(id) {
    picked = new Set(); for (const k of Object.keys(pax)) delete pax[k]; trip = null; taken = new Set(); drawSeats();
    if (!id) return;
    try {
      const r = await callFn("tripSeatMap", { tripId: id });
      trip = r.trip; taken = new Set(r.taken || []);
    } catch (error) { say(authErrorMessage(error), true); }
    drawSeats();
  }
  const drawTrips = () => {
    const to = $("dr-fto").value.trim().toLowerCase(), day = $("dr-fday").value;
    const rows = trips.filter(t => (!to || t.to.toLowerCase().includes(to)) && (!day || t.day === day));
    $("dr-trips").innerHTML = rows.map(t => `<button type="button" class="trip-opt${trip && trip.id === t.id ? " on" : ""}" role="radio" aria-checked="${Boolean(trip && trip.id === t.id)}" data-id="${escapeHTML(t.id)}"${t.left ? "" : " disabled"}>
      <strong>${escapeHTML(t.from)} → ${escapeHTML(t.to)}</strong><span>${escapeHTML(t.day)} · ${escapeHTML(t.time)}</span>
      <small>${escapeHTML(t.price ? formatPrice(t.price) + " / seat" : "Free")} · ${t.left ? escapeHTML(`${t.left} seats left`) : "Full"}</small></button>`).join("");
    $("dr-trips-note").textContent = !trips.length ? "This agency has no upcoming trip yet." : rows.length ? "" : "No trip matches this filter.";
  };
  async function loadTrips() {
    trips = []; trip = null; picked = new Set(); taken = new Set();
    $("dr-trips-box").hidden = true; drawSeats(); $("dr-trips").innerHTML = "";
    const id = $("dr-doctor").value;
    if (!id) { $("dr-trips-note").textContent = ""; return; }
    $("dr-trips-note").textContent = "Loading the trips…";
    try { trips = (await callFn("listTrips", { providerId: id })).trips || []; } catch (error) { $("dr-trips-note").textContent = authErrorMessage(error); return; }
    $("dr-trips-box").hidden = !trips.length; drawTrips();
  }
  $("dr-doctor").addEventListener("change", () => { showPay(); showLook(); loadTrips(); });
  ["dr-fto", "dr-fday"].forEach(id => $(id).addEventListener("input", drawTrips));
  $("dr-trips").addEventListener("click", async event => {
    const b = event.target.closest(".trip-opt"); if (!b || b.disabled) return;
    await openTrip(b.dataset.id); drawTrips();
  });
  const tripOf = a => ({ agency: a.doctorName, from: a.from, to: a.to, day: a.day, time: a.time });
  $("dr-done").addEventListener("click", event => {
    if (!lastBooked) return;
    if (event.target.closest(".tk-all")) window.printTickets(tripOf(lastBooked), lastBooked.passengers);
    const one = event.target.closest(".tk-one"); if (one) window.printTickets(tripOf(lastBooked), lastBooked.passengers, Number(one.dataset.seat));
  });
  $("dr-map").addEventListener("click", event => {
    const s = event.target.closest(".seat[data-n]"); if (!s || s.disabled || !trip) return;
    const n = Number(s.dataset.n);
    if (picked.has(n)) { picked.delete(n); delete pax[n]; } else if (picked.size >= 9) return say("You can take up to 9 seats at once.", true); else picked.add(n);
    say(""); drawSeats();
  });

  $("dr-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.target.querySelector("button[type=submit]");
    if (!$("dr-doctor").value) return say("Choose a travel agency.", true);
    if (!user.emailVerified) return say("Please verify your email address first, then try again.", true);
    if (!trip) return say("Choose a trip.", true);
    if (!picked.size) return say("Choose at least one seat.", true);
    const firstSeat = Math.min(...picked);   /* the booker is the first passenger unless he wrote another name */
    if (!(pax[firstSeat] && (pax[firstSeat].firstName || pax[firstSeat].lastName))) pax[firstSeat] = { ...(pax[firstSeat] || {}), firstName: $("dr-first").value, lastName: $("dr-last").value, phone: pax[firstSeat] && pax[firstSeat].phone || $("dr-phone").value };
    if (window.paxList([...picked], pax, trip).some(p => !p.firstName.trim() || !p.lastName.trim())) return say("Write the first name and the last name of every passenger.", true);
    button.disabled = true; say("Sending…");
    try {
      const booked = await callFn("bookAppointment", { service: "travel", doctorId: $("dr-doctor").value, tripId: trip.id, passengers: window.paxList([...picked].sort((a, b) => a - b), pax, trip), day: trip.day, firstName: $("dr-first").value, lastName: $("dr-last").value, phone: $("dr-phone").value, reason: $("dr-reason").value });
      say("Booked. Your seats are confirmed. Your tickets are below.");
      if (booked && booked.passengers) { lastBooked = booked; $("dr-done").innerHTML = `<h3>Your tickets</h3>` + window.ticketsHTML(booked.passengers); $("dr-done").hidden = false; }
      $("dr-reason").value = ""; const keep = trip.id; await loadTrips(); await openTrip(keep); drawTrips();
    } catch (error) { say(authErrorMessage(error), true); const keep = trip && trip.id; await loadTrips(); if (keep) { await openTrip(keep); drawTrips(); } }
    finally { button.disabled = false; }
  });

  /* my bookings, live */
  $("dr-mine").hidden = false;
  let list = [];
  const render = () => {
    const rows = [...list].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    $("dr-list").innerHTML = rows.length ? rows.map(a => `
      <article class="appt-card appt-${escapeHTML(a.status)}" data-id="${escapeHTML(a.id)}">
        <div class="appt-main">
          <div><strong>${escapeHTML(a.doctorName)}</strong><small class="muted">${escapeHTML(a.firstName)} ${escapeHTML(a.lastName)}</small>
            ${a.to ? `<small class="appt-route">${escapeHTML(a.from)} → ${escapeHTML(a.to)}${a.seatNos ? " · Seat " + escapeHTML(a.seatNos.join(", ")) : ` · ${escapeHTML(String(a.seats || 1))} ${a.seats > 1 ? "passengers" : "passenger"}`}</small>` : ""}</div>
          <div><span class="appt-day">${escapeHTML(a.day)}</span>${a.time ? `<span class="appt-time">${escapeHTML(a.time)}</span>` : ""}${a.price ? `<span class="appt-price">${escapeHTML(formatPrice(a.price))}</span>` : ""}
            <span class="status-pill">${escapeHTML(MY_STATUS[a.status] || a.status)}</span></div>
        </div>
        ${(a.passengers || []).length ? `<ul class="pax-list">${a.passengers.map(p => `<li><strong>Seat ${escapeHTML(String(p.seat))}</strong> · ${escapeHTML(p.firstName)} ${escapeHTML(p.lastName)} · ${escapeHTML(p.boardAt)} → ${escapeHTML(p.alightAt)} · Ticket <strong>${escapeHTML(p.ticketNo)}</strong>${a.status === "accepted" || a.status === "done" ? ` <button type="button" class="small-button tk-one" data-seat="${escapeHTML(String(p.seat))}">Print ticket</button>` : ""}</li>`).join("")}</ul>${a.status === "accepted" || a.status === "done" ? '<button type="button" class="small-button tk-print">Print all tickets</button>' : ""}` : ""}
        ${a.status === "accepted" ? `<p class="appt-come">${escapeHTML(`Departure on ${a.day} at ${a.time}.${a.seatNos ? " Your seats: " + a.seatNos.join(", ") + "." : ""}${a.price ? " Price: " + formatPrice(a.price) + "." : ""}`)}</p>` : ""}
        ${a.ticket ? `<div class="rx-box"><strong>Ticket</strong> <small class="muted">${escapeHTML(a.ticket.agencyName)} · ${escapeHTML(formatDate(a.ticket.at, true))}</small><pre class="rx-text">${escapeHTML(a.ticket.text)}</pre><button type="button" class="small-button rx-print">Print</button></div>` : ""}
        ${["pending", "accepted"].includes(a.status) ? '<button type="button" class="small-button delete-button appt-cancel">Cancel</button>' : ""}
      </article>`).join("") : '<p class="empty-state">No booking yet.</p>';
  };
  db.collection("appointments").where("patientUid", "==", user.uid).onSnapshot(snap => { list = snap.docs.map(d => d.data()).filter(a => a.service === "travel"); render(); }, () => {});
  $("dr-list").addEventListener("click", async event => {
    const card = event.target.closest(".appt-card");
    if (!card) return;
    const a = list.find(x => x.id === card.dataset.id);
    if (a && a.ticket && event.target.closest(".rx-print")) {
      const w = window.open("", "_blank"); if (!w) return;
      w.document.write(`<!doctype html><meta charset="utf-8"><title>Ticket</title><body style="font-family:Arial,sans-serif;max-width:680px;margin:30px auto"><h2>${escapeHTML(a.ticket.agencyName)}</h2><hr>
        <p><strong>Passenger:</strong> ${escapeHTML(a.firstName)} ${escapeHTML(a.lastName)}<br>${a.to ? `<strong>Trip:</strong> ${escapeHTML(a.from)} → ${escapeHTML(a.to)}<br>` : ""}${a.seatNos ? `<strong>Seats:</strong> ${escapeHTML(a.seatNos.join(", "))}<br>` : ""}<strong>Date:</strong> ${escapeHTML(a.day)} ${escapeHTML(a.time || "")}</p>
        <pre style="white-space:pre-wrap;font:inherit;font-size:16px">${escapeHTML(a.ticket.text)}</pre></body>`);
      w.document.close(); w.focus(); w.print(); return;
    }
    if (a && event.target.closest(".tk-print")) return window.printTickets(tripOf(a), a.passengers || []);
    if (a && event.target.closest(".tk-one")) return window.printTickets(tripOf(a), a.passengers || [], Number(event.target.closest(".tk-one").dataset.seat));
    if (!event.target.closest(".appt-cancel")) return;
    if (!window.confirm("Cancel this booking? Your seats become free.")) return;
    try { await callFn("cancelAppointment", { id: card.dataset.id }); showToast("Booking cancelled."); const keep = trip && trip.id; await loadTrips(); if (keep) { await openTrip(keep); drawTrips(); } } catch (error) { showToast(authErrorMessage(error), "error"); }
  });
  const want = new URLSearchParams(location.search).get("provider");
  if (want && agencies.some(d => d.id === want)) { $("dr-doctor").value = want; showPay(); showLook(); loadTrips(); }
}

document.addEventListener("DOMContentLoaded", () => { setupTravel(); });
