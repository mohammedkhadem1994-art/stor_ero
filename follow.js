"use strict";

/* Follow / subscribe / bell buttons on the cover of the board (board.html). Needs store.js.
   follow = I follow the board (counted); subscribe = a notification each morning with what is new; bell = also an alert for every new or featured announcement.
   No account is needed: the visitor is the same anonymous id the visit counter uses. */
(function () {
  const RANK = { none: 0, follow: 1, subscribe: 2, bell: 3 };
  const NAME = ["none", "follow", "subscribe", "bell"];
  const T = text => (typeof window.mkT === "function" ? window.mkT(text) : text);
  let box, level = "none", busy = false;

  const cid = () => {
    let id = "";
    try { id = localStorage.getItem("mk-cid") || ""; } catch { /* private mode */ }
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, "0")).join("");
      try { localStorage.setItem("mk-cid", id); } catch { /* ignore */ }
    }
    return id;
  };
  try { const saved = localStorage.getItem("mk-follow"); if (RANK[saved] !== undefined) level = saved; } catch { /* ignore */ }

  function paint(total) {
    if (!box) return;
    box.querySelectorAll("button[data-lv]").forEach(b => {
      const on = RANK[level] >= RANK[b.dataset.lv];
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); b.disabled = busy;
    });
    box.querySelector(".bd-f-hint").textContent = level === "bell" ? T("You get an alert for every new and featured announcement.")
      : level === "subscribe" ? T("You get a notification every morning with what is new.") : level === "follow" ? T("You follow the board.") : "";
    if (total !== undefined) { const el = box.querySelector(".bd-f-count"); el.textContent = total > 0 ? `${Number(total).toLocaleString()} ${T("followers")}` : ""; }
  }

  async function deviceToken() {
    if (typeof pushSupported !== "function" || !pushSupported() || !FIREBASE_CONFIG.vapidKey) throw new Error("This browser can not receive notifications. Open the site in Chrome or install the app.");
    if (Notification.permission === "denied") throw new Error("Notifications are blocked for this site. Allow them in your browser settings.");
    if (Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted") throw new Error("Notifications were not allowed.");
    const registration = await navigator.serviceWorker.register("sw.js");
    await navigator.serviceWorker.ready;
    await loadMessagingLibrary();
    const token = await firebase.messaging().getToken({ vapidKey: FIREBASE_CONFIG.vapidKey, serviceWorkerRegistration: registration });
    if (!token) throw new Error("Could not get a notification token from this device.");
    return token;
  }

  async function choose(next) {
    if (busy) return;
    busy = true; paint();
    try {
      const id = cid();
      await callFn("trackVisit", { cid: id }).catch(() => {});   /* the site must have counted this visitor first */
      const token = RANK[next] >= RANK.subscribe ? await deviceToken() : "";
      await callFn("boardFollow", { cid: id, level: next, token });
      level = next;
      try { localStorage.setItem("mk-follow", level); } catch { /* ignore */ }
      showToast(next === "none" ? "You no longer follow the board." : next === "follow" ? "You follow the board now." : next === "subscribe" ? "Subscribed: you get what is new every morning." : "The bell is on: you get an alert for every new announcement.");
      loadCount();
    } catch (error) { showToast(authErrorMessage(error), "error"); }
    busy = false; paint();
  }

  async function loadCount() {
    try { const d = await db.collection("settings").doc("boardFollowers").get(); paint(d.exists ? Number(d.data().total) || 0 : 0); } catch { paint(0); }
  }

  function build() {
    const host = document.querySelector("#bd-hero .bd-hero-text");
    if (!host || document.getElementById("bd-follow") || typeof initBackend !== "function" || !initBackend()) return;
    box = document.createElement("div");
    box.id = "bd-follow"; box.className = "bd-follow";
    box.innerHTML = `<button type="button" class="bd-f-btn" data-lv="follow">➕ <span>Follow</span></button>
      <button type="button" class="bd-f-btn" data-lv="subscribe">⭐ <span>Subscribe</span></button>
      <button type="button" class="bd-f-btn" data-lv="bell">🔔 <span>Bell</span></button>
      <strong class="bd-f-count notranslate" dir="auto"></strong><small class="bd-f-hint"></small>`;
    host.appendChild(box);
    box.addEventListener("click", event => {
      const b = event.target.closest("button[data-lv]"); if (!b) return;
      const r = RANK[b.dataset.lv];
      choose(RANK[level] >= r ? NAME[r - 1] : b.dataset.lv);
    });
    paint(); loadCount();
  }
  document.addEventListener("DOMContentLoaded", () => setTimeout(build, 300));
  window.mkFollow = { choose };
})();
