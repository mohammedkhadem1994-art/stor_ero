"use strict";

/* Doctor dashboard (inside merchant.html): the patients' appointment requests. */

const APPT_STATUS = { pending: "Waiting", accepted: "Accepted", rejected: "Refused", done: "Done", cancelled: "Cancelled by patient" };

window.setupDoctorPanel = function (me, getShop) {
  const $ = id => document.getElementById(id);
  const kind = getShop().kind || "doctor";
  const T = {
    doctor: { title: "Patients and appointments", help: "Accept a request by choosing the hour. The Notes box is private (only you see it).", hour: "Hour", empty: "No appointment requests yet.",
      biz: "Clinic / doctor name *", spec: "Specialty", addr: "Clinic address *", detailsTitle: "Clinic details", detailsHelp: "Patients see your name, specialty and city." },
    barber: { title: "Customers and bookings", help: "Accept a request by choosing the hour. Customers who come to the shop without the site: add them with the walk-in form. The Notes box is private.", hour: "Hour", empty: "No booking requests yet.",
      biz: "Barbershop name *", spec: "Your services (haircut, beard…)", addr: "Shop address *", detailsTitle: "Barbershop details", detailsHelp: "Customers see your name, services and city." },
    agency: { title: "Seat bookings", help: "Seat bookings are confirmed at once. Mark a booking done after the trip (the site fee is added then), or cancel it to free the seats. The Notes box is private (only you see it).", hour: "Departure hour", empty: "No seat bookings yet.",
      biz: "Agency name *", spec: "What you offer", addr: "Agency address *", detailsTitle: "Agency details", detailsHelp: "Customers see your name, what you offer and city." },
    hotel: { title: "Room bookings", help: "A booking is confirmed at once, night by night. Mark the stay done when the guest leaves, or cancel it. The Notes box is private (only you see it).", hour: "Hour", empty: "No room bookings yet.",
      biz: "Hotel / lodging name *", spec: "What you offer (rooms, apartments, breakfast…)", addr: "Hotel address *", detailsTitle: "Hotel details", detailsHelp: "Customers see your name, what you offer and city." },
    taxi: { title: "Ride requests", help: "Write your price and the pick-up hour, then accept. The Notes box is private (only you see it).", hour: "Pick-up hour", empty: "No ride requests yet.",
      biz: "Taxi / driver name *", spec: "Your car and area", addr: "Area you serve *", detailsTitle: "Taxi details", detailsHelp: "Customers see your name, car and city." }
  }[kind];
  $("d-title").textContent = T.title; $("d-help").textContent = T.help;
  $("doc-business-label").textContent = T.biz; $("doc-specialty-label").textContent = T.spec; $("doc-address-label").textContent = T.addr;
  $("doc-heading").textContent = T.detailsTitle; $("doc-help").textContent = T.detailsHelp;
  let appts = [];
  let notes = {};

  const todayText = () => new Date().toISOString().slice(0, 10);
  const rank = { pending: 0, accepted: 1, done: 2, rejected: 3, cancelled: 4 };

  function stats() {
    $("d-pending").textContent = appts.filter(a => a.status === "pending").length;
    $("d-accepted").textContent = appts.filter(a => a.status === "accepted").length;
    $("d-today").textContent = appts.filter(a => a.status === "accepted" && a.day === todayText()).length;
    $("d-done").textContent = appts.filter(a => a.status === "done").length;
    $("d-total").textContent = appts.length;
    $("d-people").textContent = new Set(appts.filter(a => a.status === "done").map(a => a.patientUid)).size;
  }

  let filter = { text: "", day: "" };
  const digits = v => String(v || "").replace(/\D/g, "");

  function row(a) {
    const open = a.status === "pending" || a.status === "accepted";
    const today = todayText();
    const visits = appts.filter(x => x.id !== a.id && digits(x.phone) && digits(x.phone) === digits(a.phone) && x.status === "done").length;
    const tags = [a.day === today && open ? '<span class="tag tag-today">Today</span>' : "",
      a.day < today && a.status === "accepted" ? '<span class="tag tag-late">Day passed: mark it done</span>' : "",
      visits ? `<span class="tag tag-back">Returning patient (${visits})</span>` : "",
      a.staffName ? `<span class="tag notranslate">${escapeHTML(a.staffName)}</span>` : ""].join(" ");
    return `<tr class="appt-card appt-${escapeHTML(a.status)}${a.day === today && open ? " appt-today" : ""}" data-id="${escapeHTML(a.id)}">
      <td data-label="Patient"><strong>${escapeHTML(a.firstName)} ${escapeHTML(a.lastName)}</strong>
        <small class="muted"><a href="tel:${escapeHTML(a.phone)}">${escapeHTML(a.phone)}</a></small>
        ${typeof waButton === "function" ? waButton(a.phone, "", "WhatsApp", `Hello ${a.firstName}, ${a.doctorName || ""}`) : ""}
        ${tags}</td>
      <td data-label="Day"><span class="appt-day">${escapeHTML(a.day)}</span>
        ${a.time ? `<span class="appt-time">${escapeHTML(a.time)}</span>` : ""}${a.outDay ? ` → <span class="appt-day">${escapeHTML(a.outDay)}</span><span class="appt-time">${escapeHTML(a.outTime || "")}</span>` : ""}
        ${a.price ? `<span class="appt-price">${escapeHTML(formatPrice(a.price))}</span>` : ""}</td>
      <td data-label="Details">
        ${a.styleName ? `<small class="muted">✂ ${escapeHTML(a.styleName)}</small>` : ""}
        ${a.roomName ? `<small class="muted">🏨 ${escapeHTML(a.roomName)} · ${escapeHTML(String(a.nights || 1))} ${a.nights > 1 ? "nights" : "night"} · ${escapeHTML(String(a.guests || 1))} ${a.guests > 1 ? "guests" : "guest"}</small>` : ""}
        ${a.reason ? `<small class="muted">${escapeHTML(a.reason)}</small>` : ""}
        ${a.to ? `<small class="appt-route">${escapeHTML(a.from)} → ${escapeHTML(a.to)} · ${a.tripId && a.seatNos ? "Seat " + escapeHTML(a.seatNos.join(", ")) + (a.source === "walkin" ? " · counter" : " · app") + (a.passengers || []).map(p => `<br>${escapeHTML(String(p.seat))}: ${escapeHTML(p.firstName)} ${escapeHTML(p.lastName)} · ${escapeHTML(p.boardAt)} → ${escapeHTML(p.alightAt)} · ${escapeHTML(p.ticketNo)}`).join("") : `${escapeHTML(String(a.seats || 1))} ${escapeHTML(a.seats > 1 ? "passengers" : "passenger")}`}${a.wantedTime ? " · " + escapeHTML("wants " + a.wantedTime) : ""}</small>` : ""}
        <span class="status-pill">${escapeHTML(APPT_STATUS[a.status] || a.status)}</span>
        ${a.prescription ? '<small class="muted">Prescription sent</small>' : ""}
        ${a.ticket ? '<small class="muted">Ticket sent</small>' : ""}</td>
      <td data-label="Actions"><div class="appt-actions">
        ${open && (kind === "hotel" || a.tripId) ? '<button type="button" class="small-button delete-button appt-act" data-action="reject">Cancel the booking</button>' : ""}
        ${open && kind !== "hotel" && !a.tripId ? `<label class="appt-hour">${escapeHTML(T.hour)} <input type="time" class="appt-time-input" value="${escapeHTML(a.time || a.wantedTime || "")}"></label>
          <label class="appt-hour">${kind === "doctor" || kind === "barber" ? "Price (optional)" : "Price"} <input type="number" min="1" step="any" class="appt-price-input" value="${escapeHTML(String(a.price || ""))}"></label>
          <button type="button" class="small-button appt-act" data-action="accept">${a.status === "accepted" ? "Change hour" : "Accept"}</button>
          <button type="button" class="small-button delete-button appt-act" data-action="reject">Refuse</button>` : ""}
        ${a.status === "accepted" ? '<button type="button" class="small-button appt-act" data-action="done">Done</button>' : ""}
        ${kind === "doctor" && (a.status === "accepted" || a.status === "done") ? `<button type="button" class="small-button appt-rx">${a.prescription ? "Send a new prescription" : "Prescription"}</button>` : ""}
        ${kind === "agency" && (a.status === "accepted" || a.status === "done") ? `<button type="button" class="small-button appt-rx">${a.ticket ? "Send a new ticket" : "Send ticket"}</button>` : ""}
      </div></td>
      <td data-label="Notes (private)"><div class="appt-notes">
        <textarea class="appt-note-input" rows="2" maxlength="1000" placeholder="Only you can see this">${escapeHTML((notes[a.id] || {}).text || "")}</textarea>
        <button type="button" class="small-button appt-save-note">Save notes</button></div></td>
    </tr>`;
  }

  const byTime = (a, b) => String(a.day).localeCompare(String(b.day)) || String(a.time || a.wantedTime || "").localeCompare(String(b.time || b.wantedTime || ""));
  function visible() {
    const text = filter.text.trim().toLowerCase();
    return appts.filter(a => (!filter.day || a.day === filter.day)
      && (!text || `${a.firstName} ${a.lastName} ${a.phone} ${a.reason || ""} ${a.from || ""} ${a.to || ""}`.toLowerCase().includes(text)));
  }

  function section(cls, title, help, list, openByDefault = true) {
    const head = `<span class="appt-h-title">${escapeHTML(title)}</span> <span class="appt-h-count">${list.length}</span> <small>${escapeHTML(help)}</small>`;
    const body = list.length ? `<div class="table-wrap"><table class="orders-table appt-table"><thead><tr><th>Patient</th><th>Day</th><th>Details</th><th>Actions</th><th>Notes (private)</th></tr></thead><tbody>${list.map(row).join("")}</tbody></table></div>`
      : '<p class="empty-state">Nothing here.</p>';
    return `<details class="appt-section ${cls}"${openByDefault ? " open" : ""}><summary class="appt-heading">${head}</summary>${body}</details>`;
  }

  function render() {
    stats();
    const list = visible();
    if (!appts.length) { $("d-list").innerHTML = `<p class="empty-state">${escapeHTML(T.empty)}</p>`; return; }
    const pending = list.filter(a => a.status === "pending").sort(byTime);
    const accepted = list.filter(a => a.status === "accepted").sort(byTime);
    const past = list.filter(a => ["done", "rejected", "cancelled"].includes(a.status)).sort((a, b) => byTime(b, a));
    $("d-list").innerHTML =
      section("appt-h-pending", "Waiting for your answer", "Choose the hour and accept, or refuse.", pending)
      + section("appt-h-accepted", "Confirmed", "Accepted appointments, in date order.", accepted)
      + section("appt-h-past", "Past and closed", "Done, refused or cancelled.", past);
  }

  /* search, day filter, print and export */
  const csvCell = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  function exportCsv() {
    const rows = [["Day", "Hour", "Status", "First name", "Last name", "Phone", "Details", "Price", "Site fee"]]
      .concat([...appts].sort(byTime).map(a => [a.day, a.time || "", a.status, a.firstName, a.lastName, a.phone, a.reason || (a.to ? `${a.from} > ${a.to}` : ""), a.price || "", a.fee || ""]));
    const blob = new Blob(["\ufeff" + rows.map(r => r.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = `bookings-${todayText()}.csv`;
    document.body.appendChild(link); link.click(); link.remove();
  }
  function printList() {
    const day = filter.day || todayText();
    const list = appts.filter(a => a.status === "accepted" && a.day === day).sort(byTime);
    const w = window.open("", "_blank");
    if (!w) return showToast("Allow pop-ups to print.", "error");
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${escapeHTML(day)}</title><style>body{font:14px sans-serif;padding:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:6px;text-align:start}</style>
      <h2>${escapeHTML(getShop().businessName || "")} · ${escapeHTML(day)}</h2>
      <table><tr><th>Hour</th><th>Name</th><th>Phone</th><th>Details</th></tr>${list.map(a => `<tr><td>${escapeHTML(a.time || "")}</td><td>${escapeHTML(a.firstName)} ${escapeHTML(a.lastName)}</td><td>${escapeHTML(a.phone)}</td><td>${escapeHTML(a.reason || (a.to ? a.from + " → " + a.to : ""))}</td></tr>`).join("") || "<tr><td colspan=4>Nothing</td></tr>"}</table>`);
    w.document.close(); w.focus(); w.print();
  }
  if ($("d-search")) {
    $("d-search").addEventListener("input", () => { filter.text = $("d-search").value; render(); });
    $("d-day").addEventListener("change", () => { filter.day = $("d-day").value; render(); });
    $("d-today-btn").addEventListener("click", () => { filter.day = todayText(); $("d-day").value = filter.day; render(); });
    $("d-all-btn").addEventListener("click", () => { filter = { text: "", day: "" }; $("d-search").value = ""; $("d-day").value = ""; render(); });
    $("d-csv").addEventListener("click", exportCsv);
    $("d-print").addEventListener("click", printList);
  }

  db.collection("appointments").where("doctorId", "==", me.uid).onSnapshot(snap => {
    const before = appts.length;
    appts = snap.docs.map(d => d.data());
    if (before && appts.length > before && typeof showToast === "function") showToast("New appointment request");
    render();
  }, error => { console.error(error); $("d-list").innerHTML = '<p class="empty-state">Could not load your appointments.</p>'; });
  db.collection("apptNotes").where("doctorId", "==", me.uid).onSnapshot(snap => {
    notes = {}; snap.docs.forEach(d => { notes[d.id] = d.data(); });
    /* do not wipe a note being typed: only repaint when no note box has focus */
    if (!document.activeElement || !document.activeElement.classList.contains("appt-note-input")) render();
  }, () => {});

  $("d-list").addEventListener("click", async event => {
    const card = event.target.closest(".appt-card");
    if (!card) return;
    const id = card.dataset.id;
    const a = appts.find(x => x.id === id);
    const button = event.target.closest("button");
    if (!button || !a) return;
    try {
      if (button.classList.contains("appt-act")) {
        button.disabled = true;
        const time = card.querySelector(".appt-time-input") ? card.querySelector(".appt-time-input").value : "";
        const priceBox = card.querySelector(".appt-price-input");
        await callFn("answerAppointment", { id, action: button.dataset.action, time, price: priceBox ? priceBox.value : undefined });
        showToast("Saved");
      } else if (button.classList.contains("appt-save-note")) {
        button.disabled = true;
        await callFn("answerAppointment", { id, action: "notes", notes: card.querySelector(".appt-note-input").value });
        showToast("Notes saved");
        button.disabled = false;
      } else if (button.classList.contains("appt-rx")) {
        openPrescription(a, kind === "agency");
      }
    } catch (error) {
      showToast(authErrorMessage(error), "error");
      button.disabled = false;
    }
  });

  function openPrescription(a, ticket) {
    const doc = ticket ? a.ticket : a.prescription;
    const modal = document.createElement("div");
    modal.className = "join-modal";
    modal.innerHTML = `<div class="join-box"><header><strong>${escapeHTML(ticket ? "Ticket for" : "Prescription for")} ${escapeHTML(a.firstName)} ${escapeHTML(a.lastName)}</strong>
      <button type="button" class="small-button" id="rx-close">Close</button></header>
      <div class="kyc-view-body"><p class="muted">${escapeHTML(ticket ? "The customer receives it on his page and can print it." : "The patient receives it on his page and can print it.")}</p>
        <textarea id="rx-text" rows="9" maxlength="3000" placeholder="${escapeHTML(ticket ? "Ticket number, seat, departure place and hour, instructions…" : "Medicines, dose, how many days, advice…")}">${escapeHTML(doc ? doc.text : "")}</textarea>
        ${ticket ? "" : `<details class="rx-seal" open><summary><strong>Stamp, signature and QR code</strong></summary>
          <p class="muted">Upload your stamp and your handwritten signature once: they are printed on every prescription, with a QR code that lets a pharmacist check it is real.</p>
          <div class="rx-seal-row">
            <div><label>Stamp</label><div class="rx-prev" id="rx-stamp-prev"></div>
              <input type="file" id="rx-stamp-file" accept="image/*"> <button type="button" class="small-button delete-button" id="rx-stamp-del">Remove</button></div>
            <div><label>Handwritten signature</label><div class="rx-prev" id="rx-sign-prev"></div>
              <input type="file" id="rx-sign-file" accept="image/*"> <button type="button" class="small-button delete-button" id="rx-sign-del">Remove</button>
              <p class="muted">Or sign here with your finger:</p>
              <canvas id="rx-pad" class="rx-pad" width="360" height="140"></canvas>
              <p><button type="button" class="small-button" id="rx-pad-use">Use this signature</button> <button type="button" class="small-button" id="rx-pad-clear">Clear</button></p></div>
          </div>
          <p><button type="button" class="small-button" id="rx-seal-save">Save my stamp and signature</button></p></details>`}
        <p><button type="button" class="button button-teal" id="rx-send">${escapeHTML(ticket ? "Send to the customer" : "Send to the patient")}</button></p>
        <p id="rx-msg" class="form-message" role="status"></p></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector("#rx-close").addEventListener("click", () => modal.remove());
    let seal = { stamp: "", signature: "" }, dirty = false;
    if (!ticket) {
      const $m = id => modal.querySelector(id);
      const drawPrev = () => {
        $m("#rx-stamp-prev").innerHTML = seal.stamp ? `<img alt="Stamp" src="${escapeHTML(imageSrc(seal.stamp))}">` : '<small class="muted">No stamp yet</small>';
        $m("#rx-sign-prev").innerHTML = seal.signature ? `<img alt="Signature" src="${escapeHTML(imageSrc(seal.signature))}">` : '<small class="muted">No signature yet</small>';
      };
      drawPrev();
      callFn("getRxSeal", {}).then(r => { seal = { stamp: r.stamp || "", signature: r.signature || "" }; drawPrev(); }).catch(() => {});
      const pick = async (input, key) => {
        const f = input.files && input.files[0]; if (!f) return;
        try { seal[key] = await fileToDataUrl(f, 360, 0.85, 70000); dirty = true; drawPrev(); } catch (error) { showToast(authErrorMessage(error), "error"); }
        input.value = "";
      };
      $m("#rx-stamp-file").addEventListener("change", e => pick(e.target, "stamp"));
      $m("#rx-sign-file").addEventListener("change", e => pick(e.target, "signature"));
      $m("#rx-stamp-del").addEventListener("click", () => { seal.stamp = ""; dirty = true; drawPrev(); });
      $m("#rx-sign-del").addEventListener("click", () => { seal.signature = ""; dirty = true; drawPrev(); });
      /* the finger / mouse pad */
      const pad = $m("#rx-pad"), ctx = pad.getContext("2d") || new Proxy({}, { get: () => () => {}, set: () => true });   /* no canvas (old browser): the upload still works */
      ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#0f0f0f";
      let drawing = false, inked = false;
      const at = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; };
      pad.style.touchAction = "none";
      pad.addEventListener("pointerdown", e => { drawing = true; inked = true; const [x, y] = at(e); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.1, y + 0.1); ctx.stroke(); try { pad.setPointerCapture(e.pointerId); } catch { /* optional */ } e.preventDefault(); });
      pad.addEventListener("pointermove", e => { if (!drawing) return; const [x, y] = at(e); ctx.lineTo(x, y); ctx.stroke(); e.preventDefault(); });
      ["pointerup", "pointercancel", "pointerleave"].forEach(n => pad.addEventListener(n, () => { drawing = false; }));
      $m("#rx-pad-clear").addEventListener("click", () => { ctx.clearRect(0, 0, pad.width, pad.height); inked = false; });
      $m("#rx-pad-use").addEventListener("click", () => {
        if (!inked) return showToast("Sign on the pad first.", "error");
        seal.signature = pad.toDataURL("image/png"); dirty = true; drawPrev();
        ctx.clearRect(0, 0, pad.width, pad.height); inked = false;
      });
      $m("#rx-seal-save").addEventListener("click", async event => {
        event.target.disabled = true;
        try { await callFn("saveRxSeal", { stamp: seal.stamp, signature: seal.signature }); dirty = false; showToast("Saved"); }
        catch (error) { showToast(authErrorMessage(error), "error"); }
        event.target.disabled = false;
      });
    }
    modal.querySelector("#rx-send").addEventListener("click", async event => {
      const msg = modal.querySelector("#rx-msg");
      event.target.disabled = true; msg.textContent = "Sending…"; msg.classList.remove("error");
      try {
        if (!ticket && dirty) { await callFn("saveRxSeal", { stamp: seal.stamp, signature: seal.signature }); dirty = false; }
        await callFn(ticket ? "sendTicket" : "sendPrescription", { id: a.id, text: modal.querySelector("#rx-text").value });
        showToast(ticket ? "Ticket sent" : "Prescription sent");
        modal.remove();
      } catch (error) {
        msg.textContent = authErrorMessage(error); msg.classList.add("error"); event.target.disabled = false;
      }
    });
  }

  /* clinic details */
  const shop = getShop();
  $("doc-business").value = shop.businessName || "";
  $("doc-specialty").value = shop.description || "";
  $("doc-phone").value = shop.phone || "";
  $("doc-city").value = shop.city || "";
  $("doc-address").value = shop.address || "";
  $("doc-cash").checked = shop.acceptsCash !== false;
  $("doc-credit").checked = shop.acceptsCredit !== false;
  $("doc-form").addEventListener("submit", async event => {
    event.preventDefault();
    const data = { businessName: $("doc-business").value.trim(), description: $("doc-specialty").value.trim(), phone: $("doc-phone").value.trim(), city: $("doc-city").value.trim(), address: $("doc-address").value.trim(),
      acceptsCash: $("doc-cash").checked, acceptsCredit: $("doc-credit").checked };
    const msg = $("doc-message");
    if (!data.businessName || !data.phone || !data.city || !data.address) { msg.textContent = "Please fill in every field marked *."; msg.classList.add("error"); return; }
    try {
      await db.collection("merchants").doc(me.uid).update(data);
      Object.assign(shop, data);
      msg.textContent = "Saved."; msg.classList.remove("error");
    } catch (error) { msg.textContent = authErrorMessage(error); msg.classList.add("error"); }
  });
};
