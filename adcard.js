"use strict";
/* Advertising card for every partner: made automatically from the account, with a QR code that opens
   the partner's own page in the store. Drawn on a canvas in the browser (nothing is sent anywhere). */
(function () {
  const W = 1080, H = 1350;
  /* colors taken from the store's own pictures, so every card matches its shop */
  const THEMES = {
    orange: { name: "Orange (restaurant)", a: "#6e6e6e", b: "#2a2a2a", bg: "#f5f5f5", ink: "#0e0e0e", soft: "#e0e0e0", accent: "#adadad" },
    purple: { name: "Purple (perfume)",    a: "#565656", b: "#1c1c1c", bg: "#f2f2f2", ink: "#0f0f0f", soft: "#d8d8d8", accent: "#b7b7b7" },
    sky:    { name: "Sky blue (phones)",   a: "#1b56d6", b: "#14357b", bg: "#f3f3f3", ink: "#121212", soft: "#dcdcdc", accent: "#225ad3" },
    gold:   { name: "Midnight & gold (watches)", a: "#171717", b: "#090909", bg: "#f2f2f2", ink: "#0b0b0b", soft: "#dfdfdf", accent: "#9b9b9b" },
    rose:   { name: "Rose (fashion)",      a: "#e0587a", b: "#292929", bg: "#fdeff2", ink: "#111111", soft: "#dbdbdb", accent: "#a6a6a6" },
    indigo: { name: "Indigo (electronics)", a: "#4f7de0", b: "#1d366b", bg: "#f1f1f1", ink: "#0e0e0e", soft: "#d7d7d7", accent: "#4078f0" },
    teal:   { name: "Teal (shops)",        a: "#1341a5", b: "#232323", bg: "#f2f2f2", ink: "#141414", soft: "#dbdbdb", accent: "#a0a0a0" },
    green:  { name: "Green (home & gifts)", a: "#25a35a", b: "#12512c", bg: "#eaf7ef", ink: "#0e2d1a", soft: "#c2e8d1", accent: "#ef5b4b" },
    medic:  { name: "Medical blue",        a: "#0f43b4", b: "#1d1d1d", bg: "#f1f1f1", ink: "#141414", soft: "#dadada", accent: "#2d62d4" },
    violet: { name: "Violet (barber)",     a: "#424242", b: "#1a387a", bg: "#f0f0f0", ink: "#0e0e0e", soft: "#d5d5d5", accent: "#bababa" },
    amber:  { name: "Amber (taxi)",        a: "#8c8c8c", b: "#2c2c2c", bg: "#f7f7f7", ink: "#101010", soft: "#e0e0e0", accent: "#161616" }
  };
  const AUTO_PIC = { restaurants: "orange", perfume: "purple", phones: "sky", watches: "gold", fashion: "rose", electronics: "indigo", shops: "teal", gifts: "green" };
  const AUTO_KIND = { doctor: "medic", barber: "violet", agency: "sky", taxi: "amber", hotel: "sky" };
  const KINDS = {
    shop:       { ctaAr: "اشتري الآن", ctaEn: "Buy now", icon: "🛍️", en: "Online shop",   ar: "متجر إلكتروني",  tagEn: "Shop our products online",        tagAr: "تسوّق من منتجاتنا عبر الإنترنت", pic: "shops" },
    restaurant: { ctaAr: "اطلب الآن", ctaEn: "Order now", icon: "🍽️", en: "Restaurant",    ar: "مطعم",           tagEn: "Order your meal with delivery",   tagAr: "اطلب وجبتك مع التوصيل",         pic: "restaurants" },
    pharmacy:   { ctaAr: "اشتري الآن", ctaEn: "Buy now", icon: "💊", en: "Pharmacy",      ar: "صيدلية",         tagEn: "Your health needs, delivered",    tagAr: "احتياجاتك الصحية تصلك",          pic: "gifts" },
    doctor:     { ctaAr: "احجز الآن", ctaEn: "Book now", icon: "🩺", en: "Doctor",        ar: "طبيب",           tagEn: "Book your appointment online",    tagAr: "احجز موعدك عبر الإنترنت",        pic: "" },
    barber:     { ctaAr: "احجز الآن", ctaEn: "Book now", icon: "💈", en: "Barbershop",    ar: "حلاق",           tagEn: "Book your haircut online",        tagAr: "احجز حلاقتك عبر الإنترنت",       pic: "" },
    hotel:      { ctaAr: "احجز الآن", ctaEn: "Book now", icon: "🏨", en: "Hotel",         ar: "فندق",           tagEn: "Book your room online",           tagAr: "احجز غرفتك عبر الإنترنت",        pic: "" },
    agency:     { ctaAr: "احجز الآن", ctaEn: "Book now", icon: "✈️", en: "Travel agency", ar: "وكالة سفر",      tagEn: "Request your ticket online",      tagAr: "اطلب تذكرتك عبر الإنترنت",       pic: "" },
    taxi:       { ctaAr: "احجز الآن", ctaEn: "Book now", icon: "🚕", en: "Taxi",          ar: "سيارة أجرة",     tagEn: "Book your ride online",           tagAr: "احجز رحلتك عبر الإنترنت",        pic: "" }
  };
  const PICS = [["restaurants", "Restaurants & food"], ["perfume", "Perfumes"], ["phones", "Phone accessories"], ["watches", "Watches"], ["fashion", "Fashion & bags"], ["electronics", "Electronics"], ["shops", "Local shops"], ["gifts", "Home & gifts"]];
  const EMOJI_TILE = { doctor: ["#4078f0", "#0e3790"], barber: ["#909090", "#323232"], hotel: ["#3466d3", "#333333"], agency: ["#6793f3", "#1d58d8"], taxi: ["#bababa", "#6b6b6b"] };
  const FONT = '"Segoe UI", Tahoma, "Noto Sans Arabic", "DejaVu Sans", Arial, sans-serif';

  function pageUrl(uid, kind) {
    const page = { doctor: "doctors.html", barber: "barbers.html", hotel: "hotels.html", agency: "travel.html", taxi: "taxi.html" }[kind];
    const u = new URL(page || "index.html", location.href);
    u.search = ""; u.hash = "";
    u.searchParams.set(page ? "provider" : "seller", uid);
    return u.toString() + (page ? "" : "#products");
  }
  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function fit(c, text, maxW, size, weight, min) {
    let s = size;
    c.font = `${weight} ${s}px ${FONT}`;
    while (c.measureText(text).width > maxW && s > min) { s -= 2; c.font = `${weight} ${s}px ${FONT}`; }
    return s;
  }
  function wrap(c, text, maxW, lines) {
    const words = String(text).split(/\s+/), out = []; let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (c.measureText(t).width <= maxW || !cur) cur = t; else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    if (out.length > lines) { const keep = out.slice(0, lines); keep[lines - 1] = keep[lines - 1].replace(/.{0,2}$/, "…"); return keep; }
    return out;
  }
  function drawQr(c, url, x, y, size, color) {
    const qr = qrcode(0, "M"); qr.addData(url); qr.make();
    const n = qr.getModuleCount(), cell = size / n;
    c.fillStyle = color;
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) c.fillRect(Math.round(x + k * cell), Math.round(y + r * cell), Math.ceil(cell), Math.ceil(cell));
  }
  function loadImg(src) {
    return new Promise(res => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  }

  async function draw(canvas, shop, uid, themeKey, pic) {
    const K = KINDS[shop.kind] || KINDS.shop;
    const T = THEMES[themeKey] || THEMES[AUTO_PIC[pic || K.pic]] || THEMES[AUTO_KIND[shop.kind]] || THEMES.teal;
    const url = pageUrl(uid, shop.kind || "shop");
    canvas.width = W; canvas.height = H;
    let c = null;
    try { c = canvas.getContext("2d"); } catch (e) { /* no canvas here */ }
    if (!c) return url;
    /* background + header band */
    c.fillStyle = T.bg; c.fillRect(0, 0, W, H);
    const g = c.createLinearGradient(0, 0, W, 300); g.addColorStop(0, T.a); g.addColorStop(1, T.b);
    c.fillStyle = g; c.fillRect(0, 0, W, 330);
    c.fillStyle = "rgba(255,255,255,.08)"; c.beginPath(); c.arc(W - 90, 40, 170, 0, 7); c.fill(); c.beginPath(); c.arc(70, 300, 110, 0, 7); c.fill();
    c.save(); c.beginPath(); c.rect(0, 0, W, 330); c.clip(); c.strokeStyle = "rgba(255,255,255,.05)"; c.lineWidth = 2;
    for (let i = -330; i < W; i += 36) { c.beginPath(); c.moveTo(i, 330); c.lineTo(i + 330, 0); c.stroke(); } c.restore();
    c.fillStyle = T.accent; c.fillRect(0, 326, W, 6);
    c.textAlign = "center"; c.textBaseline = "alphabetic";
    c.fillStyle = "#fff"; c.font = `800 46px ${FONT}`; c.fillText("Plazavo", W / 2, 84);
    c.font = `500 26px ${FONT}`; c.fillStyle = "rgba(255,255,255,.85)"; c.fillText(location.host || "your-domain.example", W / 2, 124);
    /* QR tile, top centre */
    const tile = 420, tx = (W - tile) / 2, ty = 150;
    c.save(); c.shadowColor = "rgba(14, 14, 14,.28)"; c.shadowBlur = 36; c.shadowOffsetY = 12; c.fillStyle = "#fff"; rr(c, tx, ty, tile, tile, 38); c.fill(); c.restore();
    c.strokeStyle = T.soft; c.lineWidth = 3; rr(c, tx, ty, tile, tile, 38); c.stroke();
    drawQr(c, url, tx + 32, ty + 32, tile - 64, T.b);
    /* the call-to-action button (Buy now / Book now), drawn like the site's buttons */
    const py = ty + tile + 22, bw0 = 600, bh = 82;
    const lum = hex => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
    c.save(); c.shadowColor = "rgba(14, 14, 14,.30)"; c.shadowBlur = 22; c.shadowOffsetY = 8;
    c.fillStyle = T.accent; rr(c, (W - bw0) / 2, py, bw0, bh, 41); c.fill(); c.restore();
    c.fillStyle = lum(T.accent) > 0.5 ? "#101010" : "#ffffff"; c.font = `800 40px ${FONT}`;
    c.fillText(`${K.ctaAr}  ·  ${K.ctaEn}  ›`, W / 2, py + 55);
    /* name */
    const name = String(shop.businessName || "My shop").trim();
    const maxW = W - 140; let s = 70; c.font = `800 ${s}px ${FONT}`;
    let lines = wrap(c, name, maxW, 2);
    if (lines.length > 1) { s = 58; c.font = `800 ${s}px ${FONT}`; lines = wrap(c, name, maxW, 2); }
    c.fillStyle = T.ink;
    let y = py + 148;
    lines.forEach((l, i) => c.fillText(l, W / 2, y + i * (s + 8)));
    y += (lines.length - 1) * (s + 8);
    /* kind badge */
    const label = `${K.icon}  ${K.en}  ·  ${K.ar}`;
    c.font = `700 32px ${FONT}`;
    const bw = Math.min(W - 120, c.measureText(label).width + 70);
    c.fillStyle = T.soft; rr(c, (W - bw) / 2, y + 24, bw, 58, 29); c.fill();
    c.fillStyle = T.b; c.fillText(label, W / 2, y + 63);
    y += 64;
    const place = [shop.city, shop.country].filter(Boolean).join(" · ");
    if (place) { c.fillStyle = "#4a4a4a"; c.font = `500 30px ${FONT}`; c.fillText("📍 " + place, W / 2, y + 52); y += 52; }
    /* scan hint */
    c.fillStyle = T.b; fit(c, "امسح الرمز  ·  Scan to visit", W - 160, 34, 700, 26); c.fillText("امسح الرمز  ·  Scan to visit", W / 2, y + 66);
    /* illustrations of the site: the chosen one in the middle, two neighbours at its sides */
    const iy = H - 90 - 22;   /* bottom edge of the strip */
    const tile3 = async (pic, cx, w, h, shadow) => {
      const x = cx - w / 2, y2 = iy - h;
      c.save(); if (shadow) { c.shadowColor = "rgba(14, 14, 14,.28)"; c.shadowBlur = 24; c.shadowOffsetY = 8; }
      rr(c, x, y2, w, h, 24); c.fillStyle = "#fff"; c.fill(); c.restore();
      c.save(); rr(c, x, y2, w, h, 24); c.clip();
      const im = pic ? await loadImg(`img/cat-${pic}.svg`) : null;
      if (im) c.drawImage(im, x, y2, w, h);
      else { const col = EMOJI_TILE[shop.kind] || [T.a, T.b], gg = c.createLinearGradient(x, y2, x + w, y2 + h); gg.addColorStop(0, col[0]); gg.addColorStop(1, col[1]); c.fillStyle = gg; c.fillRect(x, y2, w, h); c.fillStyle = "#fff"; c.font = `${Math.round(h * .55)}px ${FONT}`; c.textAlign = "center"; c.fillText(K.icon, cx, y2 + h * .68); }
      c.restore();
    };
    const keys = PICS.map(p => p[0]);
    let main = pic && keys.includes(pic) ? pic : K.pic;
    if (main) {
      const i = keys.indexOf(main);
      await tile3(keys[(i + 1) % keys.length], W / 2 - 270, 196, 147, false);
      await tile3(keys[(i + keys.length - 1) % keys.length], W / 2 + 270, 196, 147, false);
    }
    await tile3(main, W / 2, 260, 195, true);
    /* footer */
    c.fillStyle = g; c.fillRect(0, H - 90, W, 90); c.fillStyle = T.accent; c.fillRect(0, H - 94, W, 5);
    c.fillStyle = "#fff"; c.font = `700 32px ${FONT}`; c.fillText((location.host || "your-domain.example") + "  ·  Plazavo", W / 2, H - 36);
    return url;
  }

  function mount(root, uid, getShop) {
    if (!root) return;
    let theme = "";
    try { theme = localStorage.getItem("mk-adcard-theme") || ""; } catch (e) { /* ignore */ }
    if (!THEMES[theme]) theme = "";
    let pic = "";
    try { pic = localStorage.getItem("mk-adcard-pic-" + uid) || ""; } catch (e) { /* ignore */ }
    root.innerHTML = `<button type="button" class="adcard-toggle" aria-expanded="false" aria-controls="adcard-body"><canvas class="adcard-mini" width="64" height="64" aria-hidden="true"></canvas><span><strong>📣 My advertising card</strong><small class="muted">Tap the QR code to open it</small></span></button>
      <div id="adcard-body" class="adcard-body" hidden>
      <div class="panel-heading"><p>Made for you automatically. Share it on Facebook, Instagram, WhatsApp or print it: whoever scans the QR code goes straight to your page in the store.</p></div>
      <div class="adcard-grid"><canvas class="adcard-canvas" aria-label="Advertising card"></canvas>
      <div class="adcard-side">
        <label for="adcard-theme">Colors</label>
        <select id="adcard-theme"><option value="">Automatic (matches your shop)</option>${Object.entries(THEMES).map(([k, t]) => `<option value="${k}"${k === theme ? " selected" : ""}>${t.name}</option>`).join("")}</select>
        <label for="adcard-pic">Picture</label>
        <select id="adcard-pic"><option value="">Automatic (by account type)</option>${PICS.map(([k, n]) => `<option value="${k}"${k === pic ? " selected" : ""}>${n}</option>`).join("")}</select>
        <div class="adcard-actions">
          <button type="button" class="button button-teal" data-ad="png">⬇ Download the card</button>
          <button type="button" class="button button-light" data-ad="qr">⬇ Download the QR only</button>
          <button type="button" class="button button-light" data-ad="share">📤 Share</button>
          <button type="button" class="button button-light" data-ad="copy">🔗 Copy my link</button>
          <button type="button" class="button button-light" data-ad="print">🖨 Print</button>
        </div>
        <p class="muted adcard-link" dir="ltr"></p>
      </div></div></div>`;
    const toggle = root.querySelector(".adcard-toggle"), body = root.querySelector(".adcard-body"), mini = root.querySelector(".adcard-mini");
    toggle.addEventListener("click", () => { const open = body.hidden; body.hidden = !open; toggle.setAttribute("aria-expanded", String(open)); });
    const canvas = root.querySelector(".adcard-canvas"), linkEl = root.querySelector(".adcard-link");
    let url = "";
    const name = () => String((getShop() || {}).businessName || "card").replace(/[^\w؀-ۿ]+/g, "-").slice(0, 40);
    const render = async () => { try { url = await draw(canvas, getShop() || {}, uid, theme, pic); linkEl.textContent = url;
      const mc = mini.getContext("2d"); mc.fillStyle = "#fff"; mc.fillRect(0, 0, 64, 64); drawQr(mc, url, 3, 3, 58, "#151515"); } catch (e) { console.error(e); } };
    const blob = () => new Promise(res => canvas.toBlob(res, "image/png"));
    const save = (b, file) => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = file; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    root.addEventListener("change", ev => { if (ev.target.id === "adcard-pic") { pic = ev.target.value; try { localStorage.setItem("mk-adcard-pic-" + uid, pic); } catch (e) { /* ignore */ } render(); return; }
      if (ev.target.id === "adcard-theme") { theme = ev.target.value; try { localStorage.setItem("mk-adcard-theme", theme); } catch (e) { /* ignore */ } render(); } });
    root.addEventListener("click", async ev => {
      const b = ev.target.closest("[data-ad]"); if (!b) return;
      const act = b.dataset.ad, toast = window.showToast || (() => {});
      try {
        if (act === "png") save(await blob(), `MK-card-${name()}.png`);
        else if (act === "qr") {
          const q = document.createElement("canvas"); q.width = q.height = 800; const c = q.getContext("2d");
          c.fillStyle = "#fff"; c.fillRect(0, 0, 800, 800); drawQr(c, url, 60, 60, 680, "#151515"); q.toBlob(x => save(x, `MK-QR-${name()}.png`), "image/png");
        } else if (act === "copy") { await navigator.clipboard.writeText(url); toast("Link copied."); }
        else if (act === "share") {
          const file = new File([await blob()], `MK-card-${name()}.png`, { type: "image/png" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: url, url });
          else if (navigator.share) await navigator.share({ text: (getShop().businessName || "") + " " + url, url });
          else { await navigator.clipboard.writeText(url); toast("Link copied. Download the card to share the picture."); }
        } else if (act === "print") {
          const w = window.open("", "_blank"); if (!w) return;
          w.document.write(`<title>${name()}</title><style>@page{margin:0}body{margin:0}img{width:100%;display:block}</style><img src="${canvas.toDataURL("image/png")}" onload="setTimeout(function(){print()},200)">`); w.document.close();
        }
      } catch (e) { if (e && e.name !== "AbortError") console.error(e); }
    });
    render();
    return { refresh: render };
  }
  window.mkAdCard = { mount, pageUrl, draw };
})();
