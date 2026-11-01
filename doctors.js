"use strict";

/* Patients: choose a doctor, ask for a day, follow the answer, read and print the prescription. */

const SERVICE = document.body.dataset.service || "doctor";
const WORDS = {
  doctor: { choose: "Choose a doctor…", none: "No doctor is available yet", pick: "Choose a doctor.", sent: "Request sent. The doctor will answer with the hour.", empty: "No appointment yet." },
  barber: { choose: "Choose a barbershop…", none: "No barbershop is available yet", pick: "Choose a barbershop.", sent: "Request sent. The barber will answer with the hour.", empty: "No booking yet." },
  travel: { choose: "Choose a travel agency…", none: "No travel agency is available yet", pick: "Choose a travel agency.", sent: "Request sent. The agency will answer with the price and the hour.", empty: "No ticket request yet." },
  taxi: { choose: "Choose a taxi driver…", none: "No taxi driver is available yet", pick: "Choose a taxi driver.", sent: "Request sent. The driver will answer with the price and the hour.", empty: "No ride yet." }
}[SERVICE];
const MY_STATUS = { pending: "Waiting for the answer", accepted: "Accepted", rejected: "Refused", done: "Done", cancelled: "Cancelled" };

async function setupDoctors() {
  const $ = id => document.getElementById(id);
  if (!$("dr-form")) return;
  if (!initBackend()) return;
  const { user } = await getAuthState();

  /* the doctors */
  let doctors = [];
  try { doctors = (await callFn("listProviders", { service: SERVICE })).providers || []; }
  catch (error) { console.error(error); }
  $("dr-doctor").innerHTML = doctors.length
    ? `<option value="">${escapeHTML(WORDS.choose)}</option>` + doctors.map(d => `<option value="${escapeHTML(d.id)}">${escapeHTML(d.name)}${d.demo ? " · Demo" : d.bookingClosed ? " · closed" : ""}${d.specialty ? " · " + escapeHTML(d.specialty) : ""}${d.city ? " · " + escapeHTML(d.city) : ""}${d.pay && MK_EDITION.dz ? " · " + [d.pay.cash ? "Cash" : "", d.pay.credit ? "Credit" : ""].filter(Boolean).join("/") : ""}</option>`).join("")
    : `<option value="">${escapeHTML(WORDS.none)}</option>`;

  /* the payment ways the chosen provider takes */
  const payNote = document.createElement("p"); payNote.className = "muted"; payNote.id = "dr-pay";
  $("dr-doctor").insertAdjacentElement("afterend", payNote);
  const showPay = () => {
    const d = doctors.find(x => x.id === $("dr-doctor").value);
    if (!d || !d.pay) { payNote.textContent = ""; return; }
    const w = []; if (d.pay.cash) w.push("cash at the place"); if (d.pay.credit) w.push("account credit");
    payNote.innerHTML = (w.length ? "Payment accepted: " + escapeHTML(w.join(", ")) + ". " : "") + payChipsHTML(d.pay);
  };
  $("dr-doctor").addEventListener("change", showPay);
  /* a clinic or a barbershop with several workers: each has his own table, the customer picks one */
  const staffBox = document.createElement("div"); staffBox.id = "dr-staff-box"; staffBox.hidden = true;
  staffBox.innerHTML = `<label for="dr-staff">${SERVICE === "barber" ? "Barber *" : "Doctor *"}</label><select id="dr-staff"></select>`;
  $("dr-doctor").insertAdjacentElement("afterend", staffBox);
  const syncStaff = () => {
    const d = doctors.find(x => x.id === $("dr-doctor").value), lanes = (d && d.lanes) || [];
    staffBox.hidden = !lanes.length;
    $("dr-staff").innerHTML = lanes.map(l => `<option value="${escapeHTML(l.id)}" class="notranslate">${escapeHTML(l.name)}${l.scheduled ? "" : " · no hours yet"}</option>`).join("");
  };
  $("dr-doctor").addEventListener("change", syncStaff);
  const staffNow = () => (staffBox.hidden ? "" : $("dr-staff").value);
  /* The year of the chosen provider: tap a month to see its days, green = free, red = busy or closed. Tapping a green day chooses it. */
  const cal = document.createElement("section"); cal.id = "dr-cal"; cal.className = "cal-box"; cal.hidden = true;
  cal.innerHTML = `<h3>When is he free?</h3><div class="cal-year"><button type="button" class="small-button" id="cal-prev" aria-label="Previous year">‹</button><strong id="cal-yearname"></strong><button type="button" class="small-button" id="cal-next" aria-label="Next year">›</button></div>
    <div class="cal-months" id="cal-months"></div><div class="cal-days" id="cal-days" aria-live="polite"></div>
    <p class="cal-legend"><span class="cal-dot free"></span> Free <span class="cal-dot full"></span> Busy or closed <span class="cal-dot past"></span> Past</p><p class="muted" id="cal-note"></p>`;
  $("dr-day").closest("div").insertAdjacentElement("beforebegin", cal);
  const calState = { year: 0, month: 0 };
  const lang = () => document.documentElement.lang || "en";
  const monthName = (y, m) => new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString(lang(), { month: "long", timeZone: "UTC" });
  async function calDays() {
    const id = $("dr-doctor").value, box = $("cal-days");
    box.innerHTML = ""; $("cal-note").textContent = "";
    if (!id || !calState.month) return;
    const month = `${calState.year}-${String(calState.month).padStart(2, "0")}`;
    $("cal-note").textContent = "…";
    let r;
    try { r = await callFn("monthAvailability", { doctorId: id, month, staffId: staffNow() }); } catch (error) { $("cal-note").textContent = ""; return; }
    if ($("dr-doctor").value !== id) return;
    if (!r.scheduled) { $("cal-note").textContent = "This provider has not published free hours yet."; return; }
    $("cal-note").textContent = "";
    const first = new Date(Date.UTC(calState.year, calState.month - 1, 1)).getUTCDay();
    const names = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 7 + i)).toLocaleDateString(lang(), { weekday: "narrow", timeZone: "UTC" }));
    box.innerHTML = names.map(n => `<span class="cal-head">${escapeHTML(n)}</span>`).join("") + '<span></span>'.repeat(first)
      + Object.keys(r.days).map(n => { const st = r.days[n], day = `${month}-${String(n).padStart(2, "0")}`;
        return `<button type="button" class="cal-day ${st === "free" ? "free" : st === "past" ? "past" : "full"}" data-day="${day}" ${st === "free" ? "" : "disabled"} aria-label="${day}">${n}</button>`; }).join("");
  }
  function calMonths() {
    $("cal-yearname").textContent = String(calState.year);
    $("cal-months").innerHTML = Array.from({ length: 12 }, (_, i) => `<button type="button" class="cal-month${calState.month === i + 1 ? " on" : ""}" data-m="${i + 1}">${escapeHTML(monthName(calState.year, i + 1))}</button>`).join("");
  }
  function calOpen() {
    const id = $("dr-doctor").value; cal.hidden = !id;
    if (!id) return;
    const now = new Date(); calState.year = now.getFullYear(); calState.month = now.getMonth() + 1;
    calMonths(); calDays();
  }
  $("dr-doctor").addEventListener("change", calOpen);
  $("dr-staff").addEventListener("change", calDays);
  cal.addEventListener("click", event => {
    const m = event.target.closest(".cal-month"), d = event.target.closest(".cal-day"), step = event.target.closest("#cal-prev, #cal-next");
    if (m) { calState.month = Number(m.dataset.m); calMonths(); calDays(); }
    else if (step) { calState.year += step.id === "cal-next" ? 1 : -1; calMonths(); calDays(); }
    else if (d && !d.disabled) { $("dr-day").value = d.dataset.day; $("dr-day").dispatchEvent(new Event("change", { bubbles: true })); cal.querySelectorAll(".cal-day").forEach(x => x.classList.toggle("on", x === d)); }
  });
  /* a provider who closed his appointments: nobody can book him */
  const closedNote = document.createElement("p"); closedNote.className = "form-message error"; closedNote.id = "dr-closed"; closedNote.hidden = true;
  closedNote.textContent = "Bookings are closed right now. Please try again later.";
  $("dr-doctor").insertAdjacentElement("afterend", closedNote);
  const syncClosed = () => {
    const d = doctors.find(x => x.id === $("dr-doctor").value), shut = Boolean(d && d.bookingClosed);
    closedNote.textContent = d && d.demo ? "This is a demo page, shown only as an example. Booking is not possible here." : "Bookings are closed right now. Please try again later.";
    closedNote.hidden = !shut;
    const b = $("dr-form").querySelector("button[type=submit]"); if (b) b.disabled = shut;
  };
  $("dr-doctor").addEventListener("change", syncClosed);

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
    const d = doctors.find(x => x.id === id) || {}, ph = imageSrc(l.photo);
    coverBox.innerHTML = `<div class="ph-cover">${c ? `<img src="${escapeHTML(c)}" alt="">` : ""}</div><div class="ph-row"><div class="ph-avatar">${ph ? `<img src="${escapeHTML(ph)}" alt="">` : `<span>${escapeHTML((d.name || "?").charAt(0).toUpperCase())}</span>`}</div><div class="ph-id"><h2>${escapeHTML(d.name || "")}</h2><p class="muted">${escapeHTML([d.specialty, d.city].filter(Boolean).join(" · "))}</p></div></div>`;
    coverBox.hidden = false;
    if (b) { backBox.style.backgroundImage = `url("${b}")`; backBox.hidden = false; }
  }
  $("dr-doctor").addEventListener("change", showLook);

  /* A barber's haircut styles (photo, name, price): the customer may pick one. */
  let chosenStyle = "", wantStyle = "";
  async function loadStyles() {
    chosenStyle = "";
    const box = $("dr-styles-box"); if (!box) return;
    box.hidden = true; $("dr-styles").innerHTML = "";
    const id = $("dr-doctor").value; if (!id) return;
    try {
      const snap = await db.collection("styles").where("merchantId", "==", id).where("visible", "==", true).get();
      const rows = snap.docs.map(x => ({ ...x.data(), id: x.id })).sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
      if (!rows.length) return;
      $("dr-styles").innerHTML = rows.map(s => `<button type="button" class="style-opt" role="radio" aria-checked="false" data-id="${escapeHTML(s.id)}">${imageSrc(s.image) ? `<img src="${escapeHTML(imageSrc(s.image))}" alt="" loading="lazy">` : ""}<strong>${escapeHTML(s.name)}</strong><small>${escapeHTML(formatPrice(s.price))}</small></button>`).join("");
      box.hidden = false;
      if (wantStyle) { const pick = [...$("dr-styles").querySelectorAll(".style-opt")].find(x => x.dataset.id === wantStyle); wantStyle = ""; if (pick) { pick.click(); pick.scrollIntoView({ block: "center" }); } }
    } catch (error) { console.error(error); }
  }
  $("dr-doctor").addEventListener("change", loadStyles);
  /* a link from the store (barbers.html?provider=..&style=..) opens the booking with that barber and style chosen */
  setTimeout(() => {
    const qp = new URLSearchParams(location.search), want = qp.get("provider");
    if (want && doctors.some(d => d.id === want)) { wantStyle = qp.get("style") || ""; $("dr-doctor").value = want; $("dr-doctor").dispatchEvent(new Event("change", { bubbles: true })); }
  }, 0);
  if ($("dr-styles")) $("dr-styles").addEventListener("click", event => {
    const b = event.target.closest(".style-opt"); if (!b) return;
    chosenStyle = chosenStyle === b.dataset.id ? "" : b.dataset.id;
    $("dr-styles").querySelectorAll(".style-opt").forEach(x => { const on = x.dataset.id === chosenStyle; x.classList.toggle("on", on); x.setAttribute("aria-checked", String(on)); });
  });

  /* from today on */
  const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  $("dr-day").min = today.toISOString().slice(0, 10);

  if (!user) { $("dr-signin").hidden = false; $("dr-book").hidden = true; return; }

  try {
    const profile = await getProfile(user.uid);
    const parts = String(profile.fullName || "").trim().split(/\s+/);
    if (parts[0] && !$("dr-first").value) $("dr-first").value = parts[0];
    if (parts.length > 1 && !$("dr-last").value) $("dr-last").value = parts.slice(1).join(" ");
    if (profile.phone && !$("dr-phone").value) $("dr-phone").value = profile.phone;
  } catch { /* optional */ }

  const say = (text, bad) => { const m = $("dr-message"); m.textContent = text; m.classList.toggle("error", Boolean(bad)); };

  /* A provider with a schedule: the customer takes one of the free hours of the chosen day. */
  let scheduled = false, chosenTime = "";
  async function loadSlots() {
    const id = $("dr-doctor").value, day = $("dr-day").value;
    scheduled = false; chosenTime = ""; $("dr-slots-box").hidden = true; $("dr-wait").hidden = true;
    const wanted = $("dr-wanted"); if (wanted) wanted.closest("div").hidden = false; if ($("dr-slots-label")) $("dr-slots-label").hidden = false;
    if (!id || !day) return;
    try {
      const r = await callFn("getSlots", { doctorId: id, day, staffId: staffNow() });
      if (!r.scheduled) { if (SERVICE === "doctor" || SERVICE === "barber") { $("dr-slots-box").hidden = false; $("dr-slots-label").hidden = true; $("dr-slots").innerHTML = ""; $("dr-slots-note").textContent = "This provider has not published free hours yet. Send the day you want: he will answer with an hour."; } return; }
      scheduled = true;
      if (wanted) wanted.closest("div").hidden = true;
      $("dr-slots-box").hidden = false;
      const free = r.slots.filter(s => s.free);
      $("dr-slots").innerHTML = r.slots.map(s => `<button type="button" class="slot-btn" role="radio" aria-checked="false" data-time="${escapeHTML(s.time)}" ${s.free ? "" : "disabled"}>${escapeHTML(s.time)}</button>`).join("");
      $("dr-slots-note").textContent = r.closed ? "This day is closed. Choose another day." : !r.slots.length ? "No hour is left on this day. Choose another day." : free.length ? "Tap a free hour." : "This day is full.";
      $("dr-wait").hidden = !(r.slots.length && !free.length);
    } catch (error) { console.error(error); }
  }
  $("dr-doctor").addEventListener("change", loadSlots);
  $("dr-day").addEventListener("change", loadSlots);
  $("dr-staff").addEventListener("change", loadSlots);
  $("dr-slots").addEventListener("click", event => {
    const b = event.target.closest(".slot-btn");
    if (!b || b.disabled) return;
    chosenTime = b.dataset.time;
    $("dr-slots").querySelectorAll(".slot-btn").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", String(x === b)); });
  });
  $("dr-wait").addEventListener("click", async () => {
    try { await callFn("joinWaitlist", { staffId: staffNow(), doctorId: $("dr-doctor").value, day: $("dr-day").value, name: `${$("dr-first").value} ${$("dr-last").value}` }); say("Done. You will be told when an hour is freed."); }
    catch (error) { say(authErrorMessage(error), true); }
  });
  $("dr-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.target.querySelector("button[type=submit]");
    if (!$("dr-doctor").value) return say(WORDS.pick, true);
    if (!user.emailVerified) return say("Please verify your email address first, then try again.", true);
    if (scheduled && !chosenTime) return say("Choose a free hour.", true);
    button.disabled = true; say("Sending…");
    try {
      await callFn("bookAppointment", {
        staffId: staffNow(), doctorId: $("dr-doctor").value, firstName: $("dr-first").value, lastName: $("dr-last").value,
        ...(chosenStyle ? { styleId: chosenStyle } : {}),
        phone: $("dr-phone").value, day: $("dr-day").value, ...(scheduled ? { time: chosenTime } : {}), reason: $("dr-reason").value, service: SERVICE,
        ...($("dr-from") ? { from: $("dr-from").value, to: $("dr-to").value, seats: $("dr-seats").value } : {}),
        ...($("dr-wanted") && !scheduled ? { wantedTime: $("dr-wanted").value } : {})
      });
      say(scheduled && (SERVICE === "doctor" || SERVICE === "barber") ? "Booked. Your appointment is confirmed." : WORDS.sent);
      $("dr-day").value = ""; $("dr-reason").value = ""; loadStyles(); loadSlots();
    } catch (error) { say(authErrorMessage(error), true); }
    finally { button.disabled = false; }
  });

  /* my appointments, live */
  $("dr-mine").hidden = false;
  let list = [];
  const render = () => {
    const rows = [...list].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    $("dr-list").innerHTML = rows.length ? rows.map(a => `
      <article class="appt-card appt-${escapeHTML(a.status)}" data-id="${escapeHTML(a.id)}">
        <div class="appt-main">
          <div><strong>${escapeHTML(a.doctorName)}</strong>${a.staffName ? `<small class="muted notranslate"> · ${escapeHTML(a.staffName)}</small>` : ""}<small class="muted">${escapeHTML(a.firstName)} ${escapeHTML(a.lastName)}${a.styleName ? " · " + escapeHTML(a.styleName) : ""}</small>
            ${a.to ? `<small class="appt-route">${escapeHTML(a.from)} → ${escapeHTML(a.to)} · ${escapeHTML(String(a.seats || 1))} ${escapeHTML(a.seats > 1 ? "passengers" : "passenger")}</small>` : ""}</div>
          <div><span class="appt-day">${escapeHTML(a.day)}</span>${a.time ? `<span class="appt-time">${escapeHTML(a.time)}</span>` : ""}${a.price ? `<span class="appt-price">${escapeHTML(formatPrice(a.price))}</span>` : ""}
            <span class="status-pill">${escapeHTML(MY_STATUS[a.status] || a.status)}</span></div>
        </div>
        ${a.status === "accepted" ? `<p class="appt-come">${escapeHTML((SERVICE === "doctor" || SERVICE === "barber") ? `Please come on ${a.day} at ${a.time}.` : SERVICE === "travel" ? `Departure on ${a.day} at ${a.time}. Price: ${formatPrice(a.price)}.` : `Pick-up on ${a.day} at ${a.time}. Price: ${formatPrice(a.price)}.`)}</p>` : ""}
        ${a.ticket ? `<div class="rx-box"><strong>Ticket</strong> <small class="muted">${escapeHTML(a.ticket.agencyName)} · ${escapeHTML(formatDate(a.ticket.at, true))}</small>
          <pre class="rx-text">${escapeHTML(a.ticket.text)}</pre>
          <button type="button" class="small-button rx-print">Print</button></div>` : ""}
        ${a.prescription ? `<div class="rx-box"><strong>Prescription</strong> <small class="muted">${escapeHTML(a.prescription.doctorName)} · ${escapeHTML(formatDate(a.prescription.at, true))}</small>
          <pre class="rx-text">${escapeHTML(a.prescription.text)}</pre>
          <button type="button" class="small-button rx-print">Print</button></div>` : ""}
        ${["pending", "accepted"].includes(a.status) ? '<button type="button" class="small-button delete-button appt-cancel">Cancel</button>' : ""}
      </article>`).join("") : `<p class="empty-state">${escapeHTML(WORDS.empty)}</p>`;
  };
  db.collection("appointments").where("patientUid", "==", user.uid).onSnapshot(snap => { list = snap.docs.map(d => d.data()).filter(a => (a.service || "doctor") === SERVICE); render(); }, () => {});

  $("dr-list").addEventListener("click", async event => {
    const card = event.target.closest(".appt-card");
    if (!card) return;
    const a = list.find(x => x.id === card.dataset.id);
    if (!a) return;
    if (event.target.closest(".appt-cancel")) {
      if (!window.confirm("Cancel this appointment?")) return;
      try { await callFn("cancelAppointment", { id: a.id }); } catch (error) { showToast(authErrorMessage(error), "error"); }
    } else if (event.target.closest(".rx-print")) {
      const w = window.open("", "_blank");
      if (!w) return;
      const doc = a.ticket || a.prescription;
      const who = doc.agencyName || doc.doctorName;
      let qrImg = "";
      if (!a.ticket && doc.code && window.qrcode) {
        try { const qr = qrcode(0, "M"); qr.addData(`${location.origin}${location.pathname.replace(/[^/]*$/, "")}verify.html?id=${encodeURIComponent(a.id)}&c=${doc.code}`); qr.make(); qrImg = qr.createDataURL(4, 2); } catch { /* the paper is still valid without it */ }
      }
      const pic = (src, alt) => { const u = src ? imageSrc(src) : ""; return u ? `<img alt="${alt}" src="${escapeHTML(u)}" style="max-height:110px;max-width:200px;mix-blend-mode:multiply">` : ""; };
      w.document.write(`<!doctype html><meta charset="utf-8"><title>${a.ticket ? "Ticket" : "Prescription"}</title><body style="font-family:Arial,sans-serif;max-width:680px;margin:30px auto">
        <h2>${escapeHTML(who)}</h2><p>${escapeHTML(doc.specialty || "")}</p><hr>
        <p><strong>${a.ticket ? "Passenger" : "Patient"}:</strong> ${escapeHTML(a.firstName)} ${escapeHTML(a.lastName)}<br>${a.to ? `<strong>Trip:</strong> ${escapeHTML(a.from)} → ${escapeHTML(a.to)}<br>` : ""}<strong>Date:</strong> ${escapeHTML(formatDate(doc.at))}</p>
        <pre style="white-space:pre-wrap;font:inherit;font-size:16px">${escapeHTML(doc.text)}</pre>
        ${a.ticket ? "" : `<table style="width:100%;margin-top:30px"><tr>
          <td style="vertical-align:bottom">${qrImg ? `<img alt="QR" src="${qrImg}" style="width:110px;height:110px"><br><small>Scan to check this prescription</small>` : ""}</td>
          <td style="text-align:center;vertical-align:bottom">${pic(doc.stamp, "Stamp")}</td>
          <td style="text-align:center;vertical-align:bottom">${pic(doc.signature, "Signature")}<br><small>${escapeHTML(who)}</small></td></tr></table>`}</body>`);
      w.document.close(); w.focus(); w.print();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => { setupDoctors(); });
