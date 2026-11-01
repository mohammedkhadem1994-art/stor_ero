"use strict";
/* The opening date of registration. While sign-up is closed (the switch "Registration open" in the admin page) and the owner
   wrote a date (settings/opening), a visitor who tries to join sees a friendly window with the date and a live countdown.
   When the date has passed the sign-up opens by itself. */
window.loadOpening = async function () {
  try {
    if (!initBackend()) return null;
    const snap = await db.collection("settings").doc("opening").get();
    if (!snap.exists) return null;
    const at = String(snap.data().at || ""), t = Date.parse(at);
    return { at, time: Number.isFinite(t) ? t : 0, note: String(snap.data().note || "") };
  } catch { return null; }
};

window.showOpeningPopup = function (opening) {
  if (document.getElementById("op-modal")) return;
  const has = opening && opening.time > Date.now();
  const when = has ? new Date(opening.time).toLocaleString(window.mkLang && window.mkLang() === "ar" ? "ar-DZ" : window.mkLang && window.mkLang() === "fr" ? "fr-FR" : "en-GB", { dateStyle: "full", timeStyle: "short" }) : "";
  const el = document.createElement("div");
  el.id = "op-modal"; el.className = "op-modal"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
  el.innerHTML = `<div class="op-card">
    <div class="op-art" aria-hidden="true"><span class="op-spark s1">✦</span><span class="op-spark s2">✦</span><span class="op-spark s3">✧</span><div class="op-icon">🎉</div></div>
    <h2>Registration opens soon</h2>
    <p class="op-sub">${has ? "The doors of the store open on" : "We are getting everything ready. The opening date will be announced soon."}</p>
    ${has ? `<div class="op-date notranslate" dir="auto">${escapeHTML(when)}</div>
    <div class="op-count notranslate" id="op-count" dir="ltr"></div>` : ""}
    ${opening && opening.note ? `<p class="op-note notranslate" dir="auto">${escapeHTML(opening.note)}</p>` : ""}
    <div class="op-actions"><a class="button button-teal" href="board.html">Look at the jobs board meanwhile</a><button type="button" class="small-button" id="op-ok">OK, I will come back</button></div>
  </div>`;
  document.body.appendChild(el); document.body.classList.add("modal-open");
  const close = () => { el.remove(); document.body.classList.remove("modal-open"); };
  el.querySelector("#op-ok").addEventListener("click", close);
  el.addEventListener("click", event => { if (event.target === el) close(); });
  if (has) {
    const box = el.querySelector("#op-count");
    const tick = () => {
      let s = Math.max(0, Math.floor((opening.time - Date.now()) / 1000));
      if (!s) { box.textContent = "🎉"; clearInterval(timer); return; }
      const d = Math.floor(s / 86400); s -= d * 86400; const h = Math.floor(s / 3600); s -= h * 3600; const m = Math.floor(s / 60);
      box.innerHTML = [[d, "days"], [h, "hours"], [m, "min"]].map(([n, l]) => `<span><b>${n}</b><small>${window.mkT ? window.mkT(l) : l}</small></span>`).join("");
    };
    const timer = setInterval(() => { if (!document.body.contains(el)) return clearInterval(timer); tick(); }, 30000);
    tick();
  }
};
