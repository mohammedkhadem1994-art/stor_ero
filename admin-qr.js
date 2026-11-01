"use strict";
/* The owner's QR codes of the "Join us" window: one code for each kind of account (seller, restaurant, pharmacy, doctor, barber, hotel,
   travel agency, taxi driver, delivery partner). Each opens the join page on that kind, so each can go in its own advertisement.
   Every code can be saved as a picture (PNG) or as a vector (SVG), or all of them at once in one ZIP file, with a list of the links (CSV). */
(function () {
  const host = document.getElementById("qrs-panel");
  if (!host) return;
  const esc = v => (typeof escapeHTML === "function" ? escapeHTML(v) : String(v));
  const T = s => (typeof window.mkT === "function" ? window.mkT(s) : s);
  /* [kind, title in the menu, Arabic line under the code] */
  const KINDS = [["shop", "Join as a seller", "انضم كبائع"], ["restaurant", "Join as a restaurant", "انضم كمطعم"], ["pharmacy", "Join as a pharmacy", "انضم كصيدلية"], ["doctor", "Join as a doctor", "انضم كطبيب"], ["barber", "Join as a barber", "انضم كحلاق"], ["hotel", "Join as a hotel", "انضم كفندق"], ["agency", "Join as a travel agency", "انضم كوكالة سفر"], ["taxi", "Join as a taxi driver", "انضم كسائق سيارة أجرة"], ["courier", "Join as a delivery partner", "انضم كشريك توصيل"]]
    .map(([id, en, ar]) => ({ id, en, ar }));

  function linkFor(m) { const u = new URL("partner.html", location.href); u.search = ""; u.hash = ""; u.searchParams.set("kind", m.id); return u.toString(); }
  const fileOf = m => "join-" + m.id;
  const makeQR = url => { const qr = qrcode(0, "M"); qr.addData(url); qr.make(); return qr; };

  function drawPNG(m) {
    const qr = makeQR(linkFor(m)), n = qr.getModuleCount();
    const c = document.createElement("canvas"); c.width = 800; c.height = 900;
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 800, 900);
    const cell = Math.floor(680 / (n + 4)), size = cell * n, off = Math.round((800 - size) / 2);
    g.fillStyle = "#151515";
    for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) if (qr.isDark(r, q)) g.fillRect(off + q * cell, 60 + r * cell, cell, cell);
    g.textAlign = "center";
    g.font = '700 42px "Segoe UI", Tahoma, "Noto Sans Arabic", Arial, sans-serif'; g.fillText(m.en, 400, 60 + size + 62);
    g.font = '34px "Segoe UI", Tahoma, "Noto Sans Arabic", Arial, sans-serif'; g.fillText(m.ar, 400, 60 + size + 112);
    return c;
  }
  const png = m => new Promise(res => drawPNG(m).toBlob(res, "image/png"));
  const svg = m => '<?xml version="1.0" encoding="UTF-8"?>\n' + makeQR(linkFor(m)).createSvgTag({ cellSize: 10, margin: 4, scalable: true });
  function save(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

  /* a small ZIP writer (files stored without compression: PNG files are already compressed) */
  const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {   /* files: [{name, data: Uint8Array}] */
    const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
    const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const nm = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
      const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true); h.setUint32(18, sz, true); h.setUint32(22, sz, true); h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), nm, f.data);
      const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nm);
      offset += 30 + nm.length + sz;
    }
    const csize = central.reduce((s, x) => s + x.length, 0);
    const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
  }
  const csv = list => "\ufeff" + ["kind,title,arabic,link", ...list.map(m => [m.id, m.en, m.ar, linkFor(m)].map(x => '"' + String(x).replace(/"/g, '""') + '"').join(","))].join("\r\n");

  function draw() {
    const box = document.getElementById("qrs-list");
    box.innerHTML = KINDS.map(m => `<article class="qrs-card" data-id="${esc(m.id)}"><div class="qrs-code">${makeQR(linkFor(m)).createSvgTag({ cellSize: 4, margin: 2, scalable: true })}</div><strong>${esc(T(m.en))}</strong><small dir="rtl">${esc(m.ar)}</small><div class="qrs-btns"><button type="button" class="small-button" data-q="png">PNG</button><button type="button" class="small-button" data-q="svg">SVG</button><button type="button" class="small-button" data-q="copy">${esc(T("Copy link"))}</button></div></article>`).join("");
  }
  async function load() {
    try { const st = await getAuthState(); if (!st || !st.isAdmin) return; host.hidden = false; draw(); }
    catch (e) { const l = document.getElementById("qrs-list"); if (l) l.textContent = T("Could not load the list."); }
  }
  window.mkQrTools = { zip, csv, linkFor, drawPNG, kinds: KINDS };
  host.addEventListener("click", async ev => {
    const b = ev.target.closest("button"); if (!b) return;
    const toast = window.showToast || (() => {});
    try {
      if (b.dataset.q) {
        const m = KINDS.find(x => x.id === b.closest(".qrs-card").dataset.id); if (!m) return;
        if (b.dataset.q === "png") save(await png(m), "MK-QR-" + fileOf(m) + ".png");
        else if (b.dataset.q === "svg") save(new Blob([svg(m)], { type: "image/svg+xml" }), "MK-QR-" + fileOf(m) + ".svg");
        else { await navigator.clipboard.writeText(linkFor(m)); toast("Link copied."); }
      } else if (b.id === "qrs-zip") {
        b.disabled = true; const old = b.textContent; b.textContent = "…";
        const enc = new TextEncoder(), files = [];
        for (const m of KINDS) { files.push({ name: "png/MK-QR-" + fileOf(m) + ".png", data: new Uint8Array(await (await png(m)).arrayBuffer()) }); files.push({ name: "svg/MK-QR-" + fileOf(m) + ".svg", data: enc.encode(svg(m)) }); }
        files.push({ name: "links.csv", data: enc.encode(csv(KINDS)) });
        save(zip(files), "MK-join-QR-codes.zip"); b.disabled = false; b.textContent = old;
      } else if (b.id === "qrs-csv") save(new Blob([csv(KINDS)], { type: "text/csv;charset=utf-8" }), "MK-join-links.csv");
    } catch (e) { toast("Could not do it: " + (e.message || e), "error"); }
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load); else load();
})();
