"use strict";

/* The schedule board of a doctor, travel agency or taxi driver (inside merchant.html).
   Opening hours -> one row per appointment slot. People who booked with the app and people who walk in share the same table,
   so the order of the day is never mixed up. Requires store.js and doctor.js. */

const BOARD_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const BOARD_STATUS = { pending: "Waiting for your answer", accepted: "Confirmed", done: "Done" };

window.setupScheduleBoard = function (me, getShop, kind) {
  const $ = id => document.getElementById(id);
  if (!$("board-panel")) return;
  $("board-panel").hidden = false;
  const localDay = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  let staffId = "", lanes = [], filledFor = null, day = localDay(), data = null, loading = false, again = false, apptById = {};
  const who = a => `${escapeHTML(a.firstName || "")} ${escapeHTML(a.lastName || "")}`.trim();

  async function load() {
    if (loading) { again = true; return; }
    loading = true;
    try {
      data = await callFn("daySchedule", { day, staffId });
      lanes = data.lanes || [];
      if (filledFor !== staffId) { filledFor = staffId; fillSettings(data.schedule); }
      draw();
    } catch (error) {
      console.error(error);
      if (staffId && /worker/i.test(String(error && error.message))) { staffId = ""; again = true; }
      else $("b-table").innerHTML = `<p class="empty-state">${escapeHTML("Could not load the board.")}</p>`;
    } finally { loading = false; if (again) { again = false; load(); } }
  }

  const rowOf = (a, time) => `<tr class="board-row board-${escapeHTML(a.status)}" data-id="${escapeHTML(a.id)}">
    <td data-label="Time"><strong>${a.queueNo ? "#" + a.queueNo : escapeHTML(time)}</strong></td>
    <td data-label="Patient"><strong>${who(a)}</strong>${a.reason ? `<br><small class="muted">${escapeHTML(a.reason)}</small>` : ""}${a.to ? `<br><small class="muted">${escapeHTML(a.from)} → ${escapeHTML(a.to)}</small>` : ""}</td>
    <td data-label="Phone">${a.phone ? `<a href="tel:${escapeHTML(a.phone)}">${escapeHTML(a.phone)}</a>` : "—"}</td>
    <td data-label="Booked by"><span class="board-source board-source-${escapeHTML(a.source || "app")}">${a.source === "walkin" ? "Walk-in" : "App"}</span></td>
    <td data-label="Status"><span class="status-pill">${escapeHTML(BOARD_STATUS[a.status] || a.status)}</span></td>
    <td data-label="Actions">
      ${a.status === "pending" ? `${kind !== "doctor" && kind !== "barber" ? `<input type="number" class="b-price" min="1" step="any" placeholder="Price" aria-label="Price">` : ""}<button type="button" class="small-button b-act" data-action="accept">Accept</button> <button type="button" class="small-button delete-button b-act" data-action="reject">Refuse</button>` : ""}
      ${a.status === "accepted" ? `<button type="button" class="small-button b-act" data-action="done">Done</button> <button type="button" class="small-button delete-button b-act" data-action="reject">Cancel</button>` : ""}
    </td></tr>`;

  /* the switch: closed = nobody can book, neither with the app nor at the door */
  const syncOpen = () => {
    const closed = getShop().bookingClosed === true;
    $("b-open").checked = !closed;
    $("b-open-text").textContent = closed ? "Appointments are CLOSED: nobody can book, neither with the app nor at the door." : "Appointments are open.";
    if (data) draw();
  };
  window.syncBoardOpen = syncOpen;
  $("b-open").addEventListener("change", async () => {
    const want = $("b-open").checked;
    try { await callFn("setBookingOpen", { open: want }); const sh = getShop(); sh.bookingClosed = !want; syncOpen(); showToast(want ? "Appointments are open." : "Appointments are closed."); }
    catch (error) { $("b-open").checked = !want; showToast(authErrorMessage(error), "error"); }
  });

  /* the workers of a clinic or a barbershop: one table each, under the same account */
  const canStaff = kind === "doctor" || kind === "barber";
  function drawLanes() {
    const box = $("b-lanes"); if (!box) return;
    box.hidden = !canStaff;
    if (!canStaff) return;
    const word = kind === "barber" ? "barber" : "doctor";
    box.innerHTML = (lanes.length ? lanes.map(l => `<button type="button" class="board-tab notranslate${l.id === staffId ? " on" : ""}" data-lane="${escapeHTML(l.id)}" dir="auto">${escapeHTML(l.name)}</button>`).join("") : "")
      + `<button type="button" class="small-button" id="b-lane-add">＋ Add a ${word} / worker with his own table</button>`
      + (lanes.length ? ` <button type="button" class="small-button" id="b-lane-rename">✎ Rename</button>` + (staffId ? ` <button type="button" class="small-button delete-button" id="b-lane-del">Remove</button>` : "") : "");
  }
  async function staffCall(payload) {
    const r = await callFn("saveStaff", payload);
    lanes = r.lanes || [];
    return r;
  }
  $("b-lanes").addEventListener("click", async event => {
    const tab = event.target.closest("[data-lane]");
    if (tab) { staffId = tab.dataset.lane; load(); return; }
    try {
      if (event.target.closest("#b-lane-add")) {
        const name = window.prompt("Name of the worker (shown to customers):", ""); if (!name) return;
        const before = new Set(lanes.map(l => l.id));
        const r = await staffCall({ action: "add", name });
        if (!before.size) { /* the account's own table gets a name too, so customers can tell the tables apart */
          const own = window.prompt("The table you already have: which name should it show?", getShop().businessName || "");
          if (own) await staffCall({ action: "mainName", name: own });
        }
        const fresh = (r.lanes || []).find(l => l.id && !before.has(l.id)); if (fresh) staffId = fresh.id;
        filledFor = null; showToast("Added. Now set his days and hours below."); load();
      } else if (event.target.closest("#b-lane-rename")) {
        const cur = lanes.find(l => l.id === staffId); const name = window.prompt("New name:", cur ? cur.name : ""); if (!name) return;
        await staffCall(staffId ? { action: "rename", id: staffId, name } : { action: "mainName", name }); load();
      } else if (event.target.closest("#b-lane-del")) {
        if (!window.confirm("Remove this worker and his table?")) return;
        await staffCall({ action: "remove", id: staffId }); staffId = ""; filledFor = null; load();
      }
    } catch (error) { showToast(authErrorMessage(error), "error"); }
  });

  function draw() {
    drawLanes();
    $("b-day").value = day;
    /* a person who comes to the door is written in by hand (no account needed), but only while the appointments are open */
    $("b-walkin").hidden = getShop().bookingClosed === true || Boolean(data.scheduled && data.closed);
    $("b-add").hidden = $("b-walkin").hidden || kind === "agency";   /* a travel agency sells seats from the trip, not from the schedule */
    if ($("b-walkin").hidden && !$("b-modal").hidden) closeModal();
    if (!data.scheduled) {
      const q = data.extra || [];
      $("b-summary").innerHTML = `<span class="board-pill">${q.filter(a => a.queueNo).length} in the queue</span>`;
      $("b-table").innerHTML = (q.length ? `<div class="table-wrap"><table class="orders-table board-table"><thead><tr><th>Order</th><th>Patient</th><th>Phone</th><th>Booked by</th><th>Status</th><th>Actions</th></tr></thead><tbody>${q.map(a => rowOf(a, a.time || "—")).join("")}</tbody></table></div>` : "") +
        '<p class="empty-state">No opening hours yet: people who come to the door are written in the queue, first come, first served. Set your opening hours below if you also want customers to choose a free hour on the site.</p>';
      $("b-settings").open = true; fillTimes(); return;
    }
    if (data.closed) {
      $("b-table").innerHTML = '<p class="empty-state">You are closed on this day (day off or holiday).</p>';
      $("b-summary").textContent = ""; fillTimes(); return;
    }
    const booked = data.rows.filter(r => r.appointment).length;
    $("b-summary").innerHTML = `<span class="board-pill">${booked} booked</span> <span class="board-pill board-pill-free">${data.rows.length - booked} free</span>${data.waiting ? ` <span class="board-pill board-pill-wait">${data.waiting} waiting for a free hour</span>` : ""}`;
    const byId = {};
    [...data.rows.map(r => r.appointment), ...(data.extra || [])].forEach(a => { if (a) byId[a.id] = a; });
    apptById = byId;
    const tile = (a, time) => `<button type="button" class="board-tile board-row board-${escapeHTML(a.status)} b-appt" data-id="${escapeHTML(a.id)}" title="${escapeHTML(who(a))}">
      <b>${a.queueNo ? "#" + a.queueNo : escapeHTML(time)}</b><span class="tile-name">${escapeHTML(a.firstName || "")}</span><span class="board-source board-source-${escapeHTML(a.source || "app")}">${a.source === "walkin" ? "Walk-in" : "App"}</span></button>`;
    const cell = r => r.appointment ? tile(r.appointment, r.time)
      : `<button type="button" class="board-tile board-row board-free b-fill" data-time="${escapeHTML(r.time)}"><b>${escapeHTML(r.time)}</b><span class="tile-name">Free</span></button>`;
    const extra = (data.extra || []).map(a => tile(a, a.time || "—")).join("");
    $("b-table").innerHTML = `<div class="board-grid">${data.rows.map(cell).join("")}${extra}</div>`;
    fillTimes();
  }

  function fillTimes() {
    const free = data && data.rows ? data.rows.filter(r => !r.appointment).map(r => r.time) : [];
    const keep = $("b-time").value;
    $("b-time").innerHTML = `<option value="">${data && data.scheduled ? "Next free hour" : "In the queue (next number)"}</option>` + free.map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join("");
    if (free.includes(keep)) $("b-time").value = keep;
  }

  /* day navigation */
  const shift = n => { const d = new Date(day + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); day = d.toISOString().slice(0, 10); load(); };
  $("b-prev").addEventListener("click", () => shift(-1));
  $("b-next").addEventListener("click", () => shift(1));
  $("b-today").addEventListener("click", () => { day = localDay(); load(); });
  $("b-day").addEventListener("change", () => { if ($("b-day").value) { day = $("b-day").value; load(); } });

  /* the pop-up window: the walk-in form (a free tile) or the details of a booking (a booked tile) */
  function openModal(mode) {
    $("b-walkin").style.display = mode === "form" ? "" : "none";
    $("b-detail").hidden = mode !== "detail";
    $("b-modal").hidden = false; document.body.classList.add("modal-open");
  }
  function closeModal() { $("b-modal").hidden = true; document.body.classList.remove("modal-open"); }
  $("b-modal-x").addEventListener("click", closeModal);
  $("b-modal").addEventListener("click", event => { if (event.target === $("b-modal")) closeModal(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !$("b-modal").hidden) closeModal(); });
  $("b-add").addEventListener("click", () => { $("b-time").value = ""; $("b-message").textContent = ""; openModal("form"); $("b-first").focus(); });
  function showDetail(a) {
    $("b-detail").dataset.id = a.id;
    $("b-detail").innerHTML = `<h3>${a.queueNo ? "#" + a.queueNo : escapeHTML(a.time || "")} · ${escapeHTML(day)}</h3>
      <p><strong>${who(a)}</strong></p>
      <p>${a.phone ? `<a href="tel:${escapeHTML(a.phone)}">${escapeHTML(a.phone)}</a>` : "—"}</p>
      ${a.reason ? `<p class="muted">${escapeHTML(a.reason)}</p>` : ""}${a.to ? `<p class="muted">${escapeHTML(a.from)} → ${escapeHTML(a.to)}</p>` : ""}
      <p><span class="board-source board-source-${escapeHTML(a.source || "app")}">${a.source === "walkin" ? "Walk-in" : "App"}</span> <span class="status-pill">${escapeHTML(BOARD_STATUS[a.status] || a.status)}</span></p>
      <div class="detail-actions">
      ${a.status === "pending" ? `${kind !== "doctor" && kind !== "barber" ? `<input type="number" class="b-price" min="1" step="any" placeholder="Price" aria-label="Price">` : ""}<button type="button" class="small-button b-act" data-action="accept">Accept</button> <button type="button" class="small-button delete-button b-act" data-action="reject">Refuse</button>` : ""}
      ${a.status === "accepted" ? `<button type="button" class="small-button b-act" data-action="done">Done</button> <button type="button" class="small-button delete-button b-act" data-action="reject">Cancel</button>` : ""}
      </div>`;
    openModal("detail");
  }

  /* actions on a row */
  $("b-table").addEventListener("click", async event => {
    const fill = event.target.closest(".b-fill");
    if (fill) { $("b-time").value = fill.dataset.time; $("b-message").textContent = ""; openModal("form"); $("b-first").focus(); return; }
    const tileBtn = event.target.closest(".b-appt");
    if (tileBtn) { const a = apptById[tileBtn.dataset.id]; if (a) showDetail(a); return; }
    answer(event);
  });
  $("b-detail").addEventListener("click", answer);
  async function answer(event) {
    const button = event.target.closest(".b-act");
    if (!button) return;
    const box = button.closest("#b-detail") || button.closest("tr");
    const id = box.dataset.id;
    button.disabled = true;
    try {
      const price = box.querySelector(".b-price");
      await callFn("answerAppointment", { id, action: button.dataset.action, ...(price ? { price: price.value } : {}) });
      showToast("Saved");
      if (box.id === "b-detail") closeModal();
    } catch (error) { showToast(authErrorMessage(error), "error"); button.disabled = false; }
  }

  /* a person who walked in */
  $("b-walkin").addEventListener("submit", async event => {
    event.preventDefault();
    const say = (text, bad) => { const m = $("b-message"); m.textContent = text; m.classList.toggle("error", Boolean(bad)); };
    say("Saving…");
    try {
      const a = await callFn("addWalkIn", { staffId, day, time: $("b-time").value, firstName: $("b-first").value, lastName: $("b-last").value, phone: $("b-phone").value, reason: $("b-reason").value });
      say(`Added at ${a.time}.`);
      $("b-walkin").reset();
      if (!$("b-modal").hidden) setTimeout(closeModal, 700);
    } catch (error) { say(authErrorMessage(error), true); }
  });

  /* printing the day */
  $("b-print").addEventListener("click", () => {
    if (!data || !data.rows) return;
    const w = window.open("", "_blank");
    if (!w) return showToast("Allow pop-ups to print.", "error");
    const lines = [...data.rows.map(r => ({ t: r.time, a: r.appointment })), ...(data.extra || []).map(a => ({ t: a.time || "", a }))];
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${escapeHTML(day)}</title><style>body{font:14px sans-serif;padding:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:6px;text-align:start}.f{color:#888}</style>
      <h2>${escapeHTML(getShop().businessName || "")}${(lanes.find(l => l.id === staffId) || {}).name && lanes.length ? " · " + escapeHTML(lanes.find(l => l.id === staffId).name) : ""} · ${escapeHTML(day)}</h2><table><tr><th>Time</th><th>Name</th><th>Phone</th><th>Details</th><th>Booked by</th></tr>${lines.map(({ t, a }) => a
        ? `<tr><td>${escapeHTML(t)}</td><td>${who(a)}</td><td>${escapeHTML(a.phone || "")}</td><td>${escapeHTML(a.reason || (a.to ? a.from + " → " + a.to : ""))}</td><td>${a.source === "walkin" ? "Walk-in" : "App"}</td></tr>`
        : `<tr class="f"><td>${escapeHTML(t)}</td><td colspan="4">free</td></tr>`).join("")}</table>`);
    w.document.close(); w.focus(); w.print();
  });

  /* opening hours and holidays */
  let closed = [];
  /* a closed day is shown grey in the hours table */
  function syncHours() { BOARD_DAYS.forEach((_, i) => { const row = $(`s-open-${i}`).closest("tr"); if (row) row.classList.toggle("is-closed", !$(`s-open-${i}`).checked); }); }
  $("s-form").addEventListener("change", syncHours);
  const hasHours = s => Boolean(s && s.slotMinutes > 0 && s.days && Object.values(s.days).some(d => d && d.open));
  function fillSettings(s) {
    const sch = s || { slotMinutes: 20, days: {}, closed: [] };
    const fresh = !hasHours(s);
    $("b-noschedule").hidden = !fresh || kind === "agency";
    if (fresh) $("b-settings").open = true;
    $("s-slot").value = String(sch.slotMinutes || 20);
    BOARD_DAYS.forEach((_, i) => {
      const d = (sch.days || {})[i] || {};
      $(`s-open-${i}`).checked = fresh ? i <= 4 : d.open === true;   /* nothing saved yet: Sunday to Thursday ticked, one press on Save publishes the hours */
      $(`s-from-${i}`).value = d.from || "09:00";
      $(`s-to-${i}`).value = d.to || "17:00";
    });
    $("s-break-from").value = sch.breakFrom || ""; $("s-break-to").value = sch.breakTo || "";
    syncHours();
    closed = [...(sch.closed || [])];
    drawClosed();
  }
  function drawClosed() {
    $("s-closed-list").innerHTML = closed.length ? closed.map(d => `<span class="board-chip">${escapeHTML(d)} <button type="button" class="s-unclose" data-day="${escapeHTML(d)}" aria-label="Remove">×</button></span>`).join("") : '<small class="muted">No holiday.</small>';
  }
  $("s-closed-add").addEventListener("click", () => { const v = $("s-closed-day").value; if (v && !closed.includes(v)) { closed.push(v); closed.sort(); drawClosed(); } $("s-closed-day").value = ""; });
  $("s-closed-list").addEventListener("click", event => { const b = event.target.closest(".s-unclose"); if (b) { closed = closed.filter(d => d !== b.dataset.day); drawClosed(); } });
  $("s-form").addEventListener("submit", async event => {
    event.preventDefault();
    const say = (text, bad) => { const m = $("s-message"); m.textContent = text; m.classList.toggle("error", Boolean(bad)); };
    const days = {};
    BOARD_DAYS.forEach((_, i) => { days[i] = { open: $(`s-open-${i}`).checked, from: $(`s-from-${i}`).value, to: $(`s-to-${i}`).value }; });
    say("Saving…");
    try {
      const r = await callFn("saveSchedule", { staffId, schedule: { slotMinutes: Number($("s-slot").value), days, breakFrom: $("s-break-from").value, breakTo: $("s-break-to").value, closed } });
      say(r.conflicts ? `Saved. ${r.conflicts} confirmed appointment${r.conflicts === 1 ? " is" : "s are"} now outside your hours: contact ${r.conflicts === 1 ? "that person" : "those people"}.` : "Saved. Customers now choose from these hours.");
  load();
    } catch (error) { say(authErrorMessage(error), true); }
  });

  const startSettings = () => fillSettings(getShop().schedule);
  startSettings();
  db.collection("merchants").doc(me.uid).onSnapshot(snap => {
    const sig = snap.exists ? JSON.stringify([snap.data().schedule || null, snap.data().staff || null, snap.data().mainName || ""]) : "";
    if (snap.exists && sig !== window.__lastSchedule) { window.__lastSchedule = sig; if (!$("s-form").contains(document.activeElement)) filledFor = null; load(); }
  }, () => {});
  db.collection("appointments").where("doctorId", "==", me.uid).onSnapshot(() => load(), () => {});
  syncOpen();
  load();
};
