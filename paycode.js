"use strict";

/* Pay by QR code. The one who owes (seller, delivery partner, supervisor, dean) shows a code; the one who receives scans it,
   checks the name and the amount, confirms, and the payment is recorded exactly like the "I received…" buttons do. */

(function () {
  const esc = value => (typeof escapeHTML === "function" ? escapeHTML(value) : String(value));
  const tr = text => (typeof window.mkT === "function" ? window.mkT(text) : text);

  function modal(html) {
    const box = document.createElement("div");
    box.className = "qr-modal";
    box.innerHTML = `<div class="qr-card" role="dialog">${html}</div>`;
    document.body.appendChild(box);
    return box;
  }

  /* the payer */
  async function payByQR() {
    const answer = window.prompt("Amount you pay now (leave empty for everything you owe):", "");
    if (answer === null) return;
    try {
      const body = String(answer).trim() ? { amount: Number(String(answer).replace(",", ".")) } : {};
      const res = await callFn("createPayCode", body);
      const qr = qrcode(0, "M"); qr.addData(`MKP:${res.code}`); qr.make();
      const who = tr(res.toRole === "admin" ? "the owner" : res.toRole === "dean" ? "your dean" : "your supervisor");
      const m = modal(`<h3>Payment code · ${esc(formatPrice(res.amount))}</h3>
        <div class="qr-box">${qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true })}</div>
        <p class="qr-code notranslate">${esc(res.code.slice(0, 5))} ${esc(res.code.slice(5))}</p>
        <p class="muted">Hand over the money, then let ${esc(who)} scan this code. He checks the amount and confirms. The code works once and expires in 2 days.</p>
        <button type="button" class="button button-teal qr-close">Close</button>`);
      m.addEventListener("click", ev => { if (ev.target === m || ev.target.closest(".qr-close")) m.remove(); });
    } catch (error) { showToast(authErrorMessage(error), "error"); }
  }

  /* the receiver */
  function ask() {
    return new Promise(resolve => {
      const m = modal(`<h3>Scan the payer's code</h3>
        <video class="qr-video" playsinline muted hidden></video>
        <p class="muted qr-status" role="status"></p>
        <button type="button" class="small-button qr-camera">📷 Scan with the camera</button>
        <label for="pc-manual">Or type the code</label>
        <input id="pc-manual" class="qr-manual notranslate" maxlength="14" autocomplete="off" autocapitalize="characters" placeholder="ABCDE FGHIJ">
        <p><button type="button" class="button button-teal qr-send">Check the payment</button> <button type="button" class="small-button qr-cancel">Cancel</button></p>`);
      let stream = null, timer = null, done = false;
      const finish = value => { if (done) return; done = true; clearInterval(timer); if (stream) stream.getTracks().forEach(t => t.stop()); m.remove(); resolve(value); };
      const status = text => { m.querySelector(".qr-status").textContent = tr(text); };
      m.querySelector(".qr-cancel").addEventListener("click", () => finish(null));
      m.querySelector(".qr-send").addEventListener("click", () => {
        const typed = m.querySelector(".qr-manual").value.trim();
        if (!typed) return status("Type the code or scan the QR code.");
        finish(typed);
      });
      m.querySelector(".qr-camera").addEventListener("click", async () => {
        try {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("no camera");
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
          const video = m.querySelector(".qr-video");
          video.srcObject = stream; video.hidden = false; await video.play();
          status("Point the camera at the payer's QR code…");
          const canvas = document.createElement("canvas"), g = canvas.getContext("2d");
          const detector = "BarcodeDetector" in window ? new BarcodeDetector({ formats: ["qr_code"] }) : null;
          timer = setInterval(async () => {
            if (!video.videoWidth) return;
            let text = "";
            try {
              if (detector) { const found = await detector.detect(video); text = found.length ? found[0].rawValue : ""; }
              else if (typeof jsQR === "function") { canvas.width = video.videoWidth; canvas.height = video.videoHeight; g.drawImage(video, 0, 0); const img = g.getImageData(0, 0, canvas.width, canvas.height); const r = jsQR(img.data, img.width, img.height); text = r ? r.data : ""; }
            } catch { /* keep trying */ }
            if (/^MKP:/i.test(text)) finish(text);
          }, 300);
        } catch { status("The camera is not available. Type the code instead."); }
      });
    });
  }

  async function scanPay() {
    const code = await ask();
    if (!code) return;
    try {
      const seen = await callFn("redeemPayCode", { code });
      if (!confirmReceived(seen.name, seen.amount)) return;
      await callFn("redeemPayCode", { code, confirm: true });
      showToast("Recorded. The amount moved up to you.");
      document.dispatchEvent(new CustomEvent("mk-paycode-done"));
      setTimeout(() => { if (!window.__mkNoReload) location.reload(); }, 1200);
    } catch (error) { showToast(authErrorMessage(error), "error"); }
  }

  document.addEventListener("click", event => {
    if (event.target.closest(".paycode-pay")) { event.preventDefault(); payByQR(); }
    else if (event.target.closest(".paycode-scan")) { event.preventDefault(); scanPay(); }
  });

  /* one place for everybody: the credit page (wallet.html). The one who owes upward (supervisor, dean) pays by code there; the one who receives (supervisor, dean, owner) scans there.
     A seller and a delivery partner already have "Pay by QR code" next to the debt on that page. */
  async function bar() {
    if (document.getElementById("paycode-bar")) return;
    if (location.pathname.split("/").pop() !== "wallet.html") return;
    const hero = document.querySelector(".wallet-hero");
    if (!hero || typeof getAuthState !== "function") return;
    let st; try { st = await getAuthState(); } catch { return; }
    if (!st || !st.user || document.getElementById("paycode-bar")) return;
    const owes = !st.isAdmin && !st.merchant && !st.courier && (st.supervisor || st.dean);
    const receives = st.isAdmin || st.supervisor || st.dean;
    if (!owes && !receives) return;
    hero.insertAdjacentHTML("afterend", `<section class="panel" id="paycode-bar"><h2>QR code payments</h2><p class="muted">${owes ? "Pay what you owe upward by showing a code, or " : ""}scan the code of someone who paid you. Money is handed over outside the site; the code only records it once the receiver confirms.</p><p class="wallet-actions">${owes ? '<button type="button" class="small-button paycode-pay">📲 Pay my debt by QR code</button> ' : ""}${receives ? '<button type="button" class="small-button paycode-scan">📷 Scan a payment code</button>' : ""}</p></section>`);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bar); else bar();
  window.mkPayCode = { payByQR, scanPay };
})();
