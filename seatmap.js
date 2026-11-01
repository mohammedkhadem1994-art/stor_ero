"use strict";

/* A bus: numbered seats 1..N in order, four per row with an aisle in the middle. Used by the agency (trips panel) and by the customer (travel page). */
window.seatMapHTML = function (total, taken, picked, owner) {
  const t = taken instanceof Set ? taken : new Set(taken || []), p = picked instanceof Set ? picked : new Set(picked || []);
  let html = '<div class="bus" role="group" aria-label="Bus seats"><div class="bus-front"><span>🚌</span> <small>Driver</small></div><div class="bus-grid">';
  for (let n = 1; n <= total; n += 1) {
    const isTaken = t.has(n), isPicked = p.has(n);
    html += `<button type="button" class="seat${isTaken ? " taken" : ""}${isPicked ? " on" : ""}" data-n="${n}"${isTaken && !owner ? " disabled" : ""} aria-pressed="${isPicked}" aria-label="Seat ${n}, ${isTaken ? "taken" : isPicked ? "chosen" : "free"}">${n}</button>`;
    if (n % 4 === 2) html += '<span class="seat-aisle" aria-hidden="true"></span>';
  }
  return html + '</div><p class="seat-legend"><span class="seat"></span> Free <span class="seat on"></span> Chosen <span class="seat taken"></span> Taken</p></div>';
};

/* One card per chosen seat: name, surname, phone, boarding and alighting station. pax = { seatNo: { firstName, lastName, phone, boardAt, alightAt } } is kept up to date by paxBind. */
window.paxFormHTML = function (seats, pax, trip) {
  const e = v => String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  return `<datalist id="pax-stations"><option value="${e(trip.from)}"><option value="${e(trip.to)}"></datalist>` + seats.map(n => { const p = pax[n] || {}; return `<fieldset class="pax" data-seat="${n}"><legend>Seat ${n}</legend>
    <div class="form-two-columns"><div><label>First name *</label><input class="pax-f" data-k="firstName" maxlength="60" value="${e(p.firstName)}"></div><div><label>Last name *</label><input class="pax-f" data-k="lastName" maxlength="60" value="${e(p.lastName)}"></div></div>
    <div class="form-two-columns"><div><label>Phone</label><input class="pax-f" data-k="phone" type="tel" maxlength="40" value="${e(p.phone)}"></div><div></div></div>
    <div class="form-two-columns"><div><label>Boarding station</label><input class="pax-f" data-k="boardAt" list="pax-stations" maxlength="100" value="${e(p.boardAt == null ? trip.from : p.boardAt)}"></div><div><label>Alighting station</label><input class="pax-f" data-k="alightAt" list="pax-stations" maxlength="100" value="${e(p.alightAt == null ? trip.to : p.alightAt)}"></div></div></fieldset>`; }).join("");
};
window.paxBind = function (box, pax) {
  const on = event => { const f = event.target.closest(".pax-f"); if (!f) return; const n = Number(f.closest(".pax").dataset.seat); (pax[n] = pax[n] || {})[f.dataset.k] = f.value; };
  box.addEventListener("input", on); box.addEventListener("change", on);
};
window.paxList = function (seats, pax, trip) {
  return seats.map(n => { const p = pax[n] || {}; return { seat: n, firstName: p.firstName || "", lastName: p.lastName || "", phone: p.phone || "", boardAt: p.boardAt == null ? trip.from : p.boardAt, alightAt: p.alightAt == null ? trip.to : p.alightAt }; });
};
/* A printable passenger list of one trip (the agency) or the tickets of one booking (the customer). */
window.printPassengers = function (title, lines, rows) {
  const w = window.open("", "_blank"); if (!w) return;
  const e = v => String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${e(title)}</title><body style="font-family:Arial,sans-serif;margin:24px"><h2>${e(title)}</h2>${lines.map(l => `<p>${e(l)}</p>`).join("")}
    <table style="border-collapse:collapse;width:100%;font-size:14px"><thead><tr>${["Seat", "Last name", "First name", "Phone", "Boarding", "Alighting", "Ticket"].map(h => `<th style="border:1px solid #888;padding:6px;text-align:left">${h}</th>`).join("")}</tr></thead><tbody>
    ${rows.map(r => `<tr>${[r.n, r.lastName, r.firstName, r.phone, r.boardAt, r.alightAt, r.ticketNo].map(v => `<td style="border:1px solid #888;padding:6px">${e(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></body>`);
  w.document.close(); w.focus(); w.print();
};

/* One ticket per passenger (one page each): agency, route, day, hour, seat, passenger, stations, ticket number and a QR code of the number.
   trip = { agency, from, to, day, time }; list = passengers [{ seat, firstName, lastName, phone, boardAt, alightAt, ticketNo }]; only = a seat number to print one ticket. */
window.printTickets = function (trip, list, only) {
  const w = window.open("", "_blank"); if (!w) return;
  const e = v => String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const qr = no => { try { const q = window.qrcode(0, "M"); q.addData("MK-TICKET:" + no); q.make(); return q.createDataURL(4, 2); } catch { return ""; } };
  const rows = (only ? list.filter(p => p.seat === only || p.n === only) : list);
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Tickets</title><style>body{font-family:Arial,sans-serif;margin:0}.t{box-sizing:border-box;width:640px;margin:24px auto;padding:20px 24px;border:2px dashed #444;border-radius:14px;page-break-inside:avoid}.t h2{margin:0 0 4px}.big{font-size:26px;font-weight:700}.row{display:flex;justify-content:space-between;gap:16px;margin-top:12px}.k{color:#666;font-size:12px;text-transform:uppercase}.no{font:700 22px monospace;letter-spacing:1px}@media print{.t{margin:12px auto;page-break-after:always}}</style><body>
    ${rows.map(p => `<div class="t"><h2>${e(trip.agency)}</h2><div class="k">Bus ticket</div>
      <div class="big">${e(trip.from)} → ${e(trip.to)}</div>
      <div class="row"><div><div class="k">Day</div>${e(trip.day)}</div><div><div class="k">Departure</div>${e(trip.time)}</div><div><div class="k">Seat</div><span class="big">${e(p.seat == null ? p.n : p.seat)}</span></div></div>
      <div class="row"><div><div class="k">Passenger</div><strong>${e(p.firstName)} ${e(p.lastName)}</strong>${p.phone ? `<br>${e(p.phone)}` : ""}</div><div><div class="k">Boarding</div>${e(p.boardAt)}</div><div><div class="k">Alighting</div>${e(p.alightAt)}</div></div>
      <div class="row"><div><div class="k">Ticket number</div><span class="no">${e(p.ticketNo)}</span></div>${qr(p.ticketNo) ? `<img alt="QR" src="${qr(p.ticketNo)}" style="width:96px;height:96px">` : ""}</div></div>`).join("")}</body>`);
  w.document.close(); w.focus(); w.print();
};
/* The tickets of a finished booking, shown on the page with a Print button each. */
window.ticketsHTML = function (list) {
  const e = v => String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  return `<div class="tickets">${list.map(p => `<div class="trip-holder" data-seat="${e(p.seat)}"><strong>🎫 ${e(p.ticketNo)}</strong> · Seat ${e(p.seat)} · ${e(p.firstName)} ${e(p.lastName)}<br><small>${e(p.boardAt)} → ${e(p.alightAt)}</small> <button type="button" class="small-button tk-one" data-seat="${e(p.seat)}">Print this ticket</button></div>`).join("")}
    <button type="button" class="small-button tk-all">Print all tickets</button></div>`;
};
