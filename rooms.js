"use strict";

/* The room types of a hotel (inside merchant.html): name, price of one night, how many rooms, guests per room. Requires store.js. */
window.setupRoomsPanel = function (me, getShop) {
  const $ = id => document.getElementById(id);
  if (!$("rooms-panel")) return;
  $("rooms-panel").hidden = false;
  let rooms = [];
  const say = (text, bad) => { const m = $("rm-message"); m.textContent = text; m.classList.toggle("error", Boolean(bad)); };
  const reset = () => { $("rm-id").value = ""; $("rm-name").value = ""; $("rm-price").value = ""; $("rm-count").value = "1"; $("rm-guests").value = "2"; $("rm-about").value = ""; $("rm-save").textContent = "Add room type"; $("rm-cancel").hidden = true; };
  const draw = () => {
    $("rm-list").innerHTML = rooms.length ? `<div class="table-wrap"><table class="orders-table"><thead><tr><th>Room type</th><th>Price / night</th><th>Rooms</th><th>Guests</th><th>Shown</th><th></th></tr></thead><tbody>${rooms.map(r => `<tr data-id="${escapeHTML(r.id)}">
      <td data-label="Room type"><strong>${escapeHTML(r.name)}</strong>${r.about ? `<br><small class="muted">${escapeHTML(r.about)}</small>` : ""}</td>
      <td data-label="Price / night">${escapeHTML(formatPrice(r.price))}</td><td data-label="Rooms">${escapeHTML(String(r.count))}</td><td data-label="Guests">${escapeHTML(String(r.guests))}</td>
      <td data-label="Shown"><label class="visibility-control"><input type="checkbox" class="rm-vis"${r.visible ? " checked" : ""} aria-label="Shown to customers"></label></td>
      <td data-label="Actions"><button type="button" class="small-button rm-edit">Edit</button> <button type="button" class="small-button delete-button rm-del">Delete</button></td></tr>`).join("")}</tbody></table></div>`
      : '<p class="empty-state">No room type yet. Add your first one above: customers can not book until you do.</p>';
  };
  async function load() {
    try { rooms = (await callFn("listRooms", { providerId: me.uid })).rooms || []; draw(); }
    catch (error) { $("rm-list").innerHTML = `<p class="empty-state">${escapeHTML(authErrorMessage(error))}</p>`; }
  }
  $("rm-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("rm-save"); button.disabled = true; say("Saving…");
    try {
      await callFn("saveRoom", { id: $("rm-id").value, name: $("rm-name").value, price: $("rm-price").value, count: $("rm-count").value, guests: $("rm-guests").value, about: $("rm-about").value, visible: (rooms.find(r => r.id === $("rm-id").value) || { visible: true }).visible });
      say("Saved."); reset(); await load();
    } catch (error) { say(authErrorMessage(error), true); }
    finally { button.disabled = false; }
  });
  $("rm-cancel").addEventListener("click", () => { reset(); say(""); });
  $("rm-list").addEventListener("click", async event => {
    const row = event.target.closest("tr[data-id]"); if (!row) return;
    const r = rooms.find(x => x.id === row.dataset.id); if (!r) return;
    if (event.target.closest(".rm-edit")) {
      $("rm-id").value = r.id; $("rm-name").value = r.name; $("rm-price").value = r.price; $("rm-count").value = r.count; $("rm-guests").value = r.guests; $("rm-about").value = r.about || "";
      $("rm-save").textContent = "Save changes"; $("rm-cancel").hidden = false; $("rm-name").scrollIntoView({ block: "center", behavior: "smooth" });
    } else if (event.target.closest(".rm-del")) {
      if (!window.confirm("Delete this room type?")) return;
      try { await callFn("deleteRoom", { id: r.id }); await load(); } catch (error) { say(authErrorMessage(error), true); }
    }
  });
  $("rm-list").addEventListener("change", async event => {
    const box = event.target.closest(".rm-vis"); if (!box) return;
    const r = rooms.find(x => x.id === box.closest("tr").dataset.id); if (!r) return;
    try { await callFn("saveRoom", { ...r, visible: box.checked }); r.visible = box.checked; }
    catch (error) { box.checked = !box.checked; say(authErrorMessage(error), true); }
  });
  /* the switch: closed = nobody can book */
  const syncOpen = () => { const closed = getShop().bookingClosed === true; $("rm-open").checked = !closed; $("rm-open-text").textContent = closed ? "Bookings are CLOSED: nobody can book right now." : "Bookings are open."; };
  window.syncBoardOpen = syncOpen; syncOpen();
  $("rm-open").addEventListener("change", async () => {
    const want = $("rm-open").checked;
    try { await callFn("setBookingOpen", { open: want }); getShop().bookingClosed = !want; syncOpen(); showToast(want ? "Bookings are open." : "Bookings are closed."); }
    catch (error) { $("rm-open").checked = !want; showToast(authErrorMessage(error), "error"); }
  });
  load();
};
