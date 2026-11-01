"use strict";

/* Customers: choose a hotel, the days and hours of arrival and departure, then a room type that is free for all the nights.
   The hotel confirms at once (the number of rooms is counted night by night); payment is at the hotel. Requires store.js. */

const MY_STATUS = { pending: "Waiting for the answer", accepted: "Confirmed", rejected: "Refused", done: "Done", cancelled: "Cancelled" };

async function setupHotels() {
  const $ = id => document.getElementById(id);
  if (!$("dr-form")) return;
  if (!initBackend()) return;
  const { user } = await getAuthState();
  if (!user) { $("dr-signin").hidden = false; $("dr-book").hidden = true; return; }
  const say = (text, bad) => { const m = $("dr-message"); m.textContent = text; m.classList.toggle("error", Boolean(bad)); };
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  $("dr-day").min = today(); $("dr-outday").min = today();

  let hotels = [], chosenRoom = "", rooms = [];
  try { hotels = (await callFn("listProviders", { service: "hotel" })).providers || []; } catch (error) { console.error(error); }
  $("dr-doctor").innerHTML = hotels.length
    ? '<option value="">Choose a hotel…</option>' + hotels.map(d => `<option value="${escapeHTML(d.id)}">${escapeHTML(d.name)}${d.demo ? " · Demo" : d.bookingClosed ? " · closed" : ""}${d.city ? " · " + escapeHTML(d.city) : ""}</option>`).join("")
    : '<option value="">No hotel is available yet</option>';

  /* the payment ways the chosen hotel takes */
  const payNote = document.createElement("p"); payNote.className = "muted"; payNote.id = "dr-pay";
  $("dr-doctor").insertAdjacentElement("afterend", payNote);
  const showPay = () => {
    const d = hotels.find(x => x.id === $("dr-doctor").value);
    if (!d) { payNote.textContent = ""; return; }
    payNote.innerHTML = `${d.address ? escapeHTML(d.address) + ". " : ""}${d.pay && d.pay.cash ? escapeHTML("You pay at the hotel.") + " " : ""}${d.pay ? payChipsHTML(d.pay) : ""}`;
    const b = $("dr-form").querySelector("button[type=submit]"); if (b) b.disabled = Boolean(d.bookingClosed);
    if (d.bookingClosed) say(d.demo ? "This is a demo page, shown only as an example. Booking is not possible here." : "Bookings are closed right now. Please try again later.", true);
  };
  $("dr-doctor").addEventListener("change", showPay);

  /* The cover picture and the faint background the provider chose for his page */
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
    const d = hotels.find(x => x.id === id) || {}, ph = imageSrc(l.photo);
    coverBox.innerHTML = `<div class="ph-cover">${c ? `<img src="${escapeHTML(c)}" alt="">` : ""}</div><div class="ph-row"><div class="ph-avatar">${ph ? `<img src="${escapeHTML(ph)}" alt="">` : `<span>${escapeHTML((d.name || "?").charAt(0).toUpperCase())}</span>`}</div><div class="ph-id"><h2>${escapeHTML(d.name || "")}</h2><p class="muted">${escapeHTML([d.specialty, d.city].filter(Boolean).join(" · "))}</p></div></div>`;
    coverBox.hidden = false;
    if (b) { backBox.style.backgroundImage = `url("${b}")`; backBox.hidden = false; }
  }
  $("dr-doctor").addEventListener("change", showLook);

  const nightsBetween = () => { const a = Date.parse($("dr-day").value), b = Date.parse($("dr-outday").value); return a && b && b > a ? Math.round((b - a) / 86400000) : 0; };
  async function loadRooms() {
    chosenRoom = ""; rooms = [];
    $("dr-rooms-box").hidden = true; $("dr-rooms").innerHTML = "";
    const id = $("dr-doctor").value, n = nightsBetween();
    const note = $("dr-rooms-note");
    if (!id) { note.textContent = ""; return; }
    if (!n) { note.textContent = "Choose the check-in and check-out days to see the free rooms."; return; }
    if (n > 30) { note.textContent = "A stay can be up to 30 nights."; return; }
    note.textContent = "Looking for free rooms…";
    try {
      rooms = (await callFn("hotelAvailability", { providerId: id, day: $("dr-day").value, outDay: $("dr-outday").value })).rooms || [];
      if (!rooms.length) { note.textContent = "This hotel has not published its rooms yet."; return; }
      note.textContent = `${n} ${n > 1 ? "nights" : "night"}`;
      $("dr-rooms").innerHTML = rooms.map(r => `<button type="button" class="style-opt room-opt" role="radio" aria-checked="false" data-id="${escapeHTML(r.id)}"${r.left ? "" : " disabled"}>
        <strong>${escapeHTML(r.name)}</strong><small>${escapeHTML(formatPrice(r.price))} / night · ${escapeHTML(String(r.guests))} ${r.guests > 1 ? "guests" : "guest"}</small>
        <small>${r.left ? `Total ${escapeHTML(formatPrice(r.total))} · ${escapeHTML(String(r.left))} left` : "Full for these nights"}</small>${r.about ? `<small class="muted">${escapeHTML(r.about)}</small>` : ""}</button>`).join("");
      $("dr-rooms-box").hidden = false;
    } catch (error) { note.textContent = authErrorMessage(error); }
  }
  ["dr-doctor", "dr-day", "dr-outday"].forEach(id => $(id).addEventListener("change", () => {
    if (id === "dr-day" && $("dr-day").value) { $("dr-outday").min = $("dr-day").value; }
    loadRooms();
  }));
  $("dr-rooms").addEventListener("click", event => {
    const b = event.target.closest(".room-opt");
    if (!b || b.disabled) return;
    chosenRoom = b.dataset.id;
    $("dr-rooms").querySelectorAll(".room-opt").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", String(x === b)); });
  });

  $("dr-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.target.querySelector("button[type=submit]");
    if (!$("dr-doctor").value) return say("Choose a hotel.", true);
    if (!user.emailVerified) return say("Please verify your email address first, then try again.", true);
    if (!nightsBetween()) return say("Choose a check-out day after the check-in day.", true);
    if (!chosenRoom) return say("Choose a room.", true);
    button.disabled = true; say("Sending…");
    try {
      await callFn("bookAppointment", {
        service: "hotel", doctorId: $("dr-doctor").value, roomId: chosenRoom, firstName: $("dr-first").value, lastName: $("dr-last").value, phone: $("dr-phone").value,
        guests: $("dr-guests").value, day: $("dr-day").value, time: $("dr-time").value, outDay: $("dr-outday").value, outTime: $("dr-outtime").value, reason: $("dr-reason").value
      });
      say("Booked. Your room is confirmed. You pay at the hotel.");
      $("dr-day").value = ""; $("dr-outday").value = ""; $("dr-reason").value = ""; loadRooms();
    } catch (error) { say(authErrorMessage(error), true); loadRooms(); }
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
          <div><strong>${escapeHTML(a.doctorName)}</strong><small class="muted">${escapeHTML(a.firstName)} ${escapeHTML(a.lastName)} · ${escapeHTML(a.roomName || "")} · ${escapeHTML(String(a.guests || 1))} ${a.guests > 1 ? "guests" : "guest"}</small></div>
          <div><span class="appt-day">${escapeHTML(a.day)}</span><span class="appt-time">${escapeHTML(a.time || "")}</span> → <span class="appt-day">${escapeHTML(a.outDay || "")}</span><span class="appt-time">${escapeHTML(a.outTime || "")}</span>
            ${a.price ? `<span class="appt-price">${escapeHTML(formatPrice(a.price))}</span>` : ""}<span class="status-pill">${escapeHTML(MY_STATUS[a.status] || a.status)}</span></div>
        </div>
        ${a.status === "accepted" ? `<p class="appt-come">${escapeHTML(`Check-in ${a.day} at ${a.time}. Check-out ${a.outDay} at ${a.outTime}. ${a.nights} ${a.nights > 1 ? "nights" : "night"}.`)}</p>` : ""}
        ${["pending", "accepted"].includes(a.status) ? '<button type="button" class="small-button delete-button appt-cancel">Cancel</button>' : ""}
      </article>`).join("") : '<p class="empty-state">No booking yet.</p>';
  };
  db.collection("appointments").where("patientUid", "==", user.uid).onSnapshot(snap => { list = snap.docs.map(d => d.data()).filter(a => a.service === "hotel"); render(); }, () => {});
  $("dr-list").addEventListener("click", async event => {
    const card = event.target.closest(".appt-card");
    if (!card || !event.target.closest(".appt-cancel")) return;
    if (!window.confirm("Cancel this booking?")) return;
    try { await callFn("cancelAppointment", { id: card.dataset.id }); showToast("Booking cancelled."); loadRooms(); } catch (error) { showToast(authErrorMessage(error), "error"); }
  });
  /* a link (hotels.html?provider=…) opens the booking of that hotel */
  const want = new URLSearchParams(location.search).get("provider");
  if (want && hotels.some(d => d.id === want)) { $("dr-doctor").value = want; showPay(); showLook(); }
}

document.addEventListener("DOMContentLoaded", () => { setupHotels(); });
