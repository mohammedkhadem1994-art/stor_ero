"use strict";

/* Share a product: Facebook, X (Twitter), Instagram, WhatsApp, LinkedIn, copy link.
   Also draws a decorated "SHOP NOW" poster (a picture) that can be downloaded or shared.
   Requires store.js. */

const SHARE_REGION = "europe-west1";

/* The link people share. It points at the preview page (productShare function) so that Facebook, WhatsApp,
   LinkedIn and X show a card with the photo, name and price. Real visitors are sent on to the store. */
function shareLink(product) {
  if (typeof FIREBASE_CONFIG !== "undefined" && FIREBASE_CONFIG.projectId && product.fromDatabase !== false) {
    return `https://${SHARE_REGION}-${FIREBASE_CONFIG.projectId}.cloudfunctions.net/productShare?id=${encodeURIComponent(product.id)}`;
  }
  return storeProductUrl(product);
}

function storeProductUrl(product) {
  const base = location.href.split("#")[0].split("?")[0];
  return `${base}?p=${encodeURIComponent(product.id)}#products`;
}

function shareText(product) {
  return `🛍️ Shop now: ${product.name} — ${formatPrice(product.price)}${product.merchantName ? ` · ${product.merchantName}` : ""}`;
}

/* ---------- the poster ---------- */

function loadPicture(src) {
  return new Promise(resolve => {
    if (!src) return resolve(null);
    const img = new Image();
    if (!/^data:/.test(src)) img.crossOrigin = "anonymous";   /* otherwise the canvas could not be exported */
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…";
  }
  return lines;
}

/* 1080 x 1350 (the portrait format Instagram, Facebook and WhatsApp show best). Returns a canvas. */
async function drawPoster(product) {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  /* background: deep blue to teal, with soft circles */
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0e0e0e"); bg.addColorStop(0.55, "#12337a"); bg.addColorStop(1, "#1748b3");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  [[130, 170, 260, .10], [960, 330, 200, .08], [900, 1180, 340, .10], [90, 1090, 170, .08]].forEach(([x, y, r, a]) => {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fill();
  });
  ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 3;
  for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(W - 60, 60, 120 + i * 46, 0, Math.PI * 2); ctx.stroke(); }

  /* brand */
  ctx.fillStyle = "#fff"; ctx.font = "800 44px Arial, sans-serif"; ctx.textAlign = "left";
  roundRect(ctx, 60, 56, 74, 74, 18); ctx.fillStyle = "#1748b3"; ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = "800 34px Arial, sans-serif"; ctx.textAlign = "center"; ctx.fillText("P", 97, 105);
  ctx.textAlign = "left"; ctx.font = "700 38px Arial, sans-serif"; ctx.fillText("Plazavo", 154, 106);

  /* the product card */
  const cx = 90, cy = 190, cw = W - 180, chh = 640;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 50; ctx.shadowOffsetY = 24;
  roundRect(ctx, cx, cy, cw, chh, 44); ctx.fillStyle = "#fff"; ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, cx + 18, cy + 18, cw - 36, chh - 36, 30); ctx.clip();
  const picture = await loadPicture(imageSrc(product.image));
  if (picture) {
    const scale = Math.max((cw - 36) / picture.width, (chh - 36) / picture.height);
    const pw = picture.width * scale, ph = picture.height * scale;
    ctx.drawImage(picture, cx + 18 + (cw - 36 - pw) / 2, cy + 18 + (chh - 36 - ph) / 2, pw, ph);
  } else {
    const ph = ctx.createLinearGradient(cx, cy, cx + cw, cy + chh);
    ph.addColorStop(0, "#f1f1f1"); ph.addColorStop(1, "#dedede");
    ctx.fillStyle = ph; ctx.fillRect(cx, cy, cw, chh);
    ctx.fillStyle = "#12337a"; ctx.font = "800 190px Arial, sans-serif"; ctx.textAlign = "center"; ctx.fillText("P", W / 2, cy + 360);
    ctx.font = "600 40px Arial, sans-serif"; ctx.fillText(product.category || "Digital product", W / 2, cy + 440);
  }
  ctx.restore();

  /* "NEW" style ribbon */
  ctx.save();
  ctx.translate(cx + 40, cy + 40);
  roundRect(ctx, 0, 0, 250, 74, 37); ctx.fillStyle = "#ff5a5f"; ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = "800 34px Arial, sans-serif"; ctx.textAlign = "center"; ctx.fillText("🔥 HOT DEAL", 125, 50);
  ctx.restore();

  /* price badge */
  const priceText = formatPrice(product.price);
  ctx.font = "800 64px Arial, sans-serif";
  const pwid = Math.max(220, ctx.measureText(priceText).width + 70);
  roundRect(ctx, cx + cw - pwid - 30, cy + chh - 70, pwid, 112, 56);
  ctx.fillStyle = "#cfcfcf"; ctx.fill();
  ctx.fillStyle = "#0e0e0e"; ctx.textAlign = "center"; ctx.fillText(priceText, cx + cw - pwid / 2 - 30, cy + chh + 8);

  /* name, seller */
  ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = "800 62px Arial, sans-serif";
  const lines = wrapLines(ctx, product.name, W - 180, 2);
  lines.forEach((line, index) => ctx.fillText(line, 90, 930 + index * 74));
  let y = 930 + lines.length * 74;
  if (product.merchantName) {
    ctx.font = "600 36px Arial, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.fillText(`Sold by ${product.merchantName}`, 90, y); y += 20;
  }

  /* call to action */
  roundRect(ctx, 90, 1130, W - 180, 130, 65); ctx.fillStyle = "#fff"; ctx.fill();
  ctx.fillStyle = "#0e0e0e"; ctx.font = "800 56px Arial, sans-serif"; ctx.textAlign = "center";
  ctx.fillText("SHOP NOW  →", W / 2, 1218);
  ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.font = "600 30px Arial, sans-serif";
  ctx.fillText(location.host + location.pathname.replace(/[^/]*$/, ""), W / 2, 1310);
  return canvas;
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error("Could not make the picture."))), "image/png"));
}

/* ---------- the share window ---------- */

let sharing = null;

function closeShare() {
  const box = document.getElementById("share-modal");
  if (box) box.remove();
  sharing = null;
}

async function openShare(product) {
  closeShare();
  const link = shareLink(product);
  const text = shareText(product);
  const u = encodeURIComponent(link), t = encodeURIComponent(text);
  const targets = [
    ["Facebook", "share-fb", `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${t}`],
    ["X (Twitter)", "share-x", `https://twitter.com/intent/tweet?url=${u}&text=${t}`],
    ["WhatsApp", "share-wa", `https://wa.me/?text=${encodeURIComponent(`${text}\n${link}`)}`],
    ["LinkedIn", "share-li", `https://www.linkedin.com/sharing/share-offsite/?url=${u}`]
  ];

  const box = document.createElement("div");
  box.id = "share-modal";
  box.className = "share-modal";
  box.setAttribute("role", "dialog");
  box.innerHTML = `
    <div class="share-box">
      <button type="button" class="chat-close share-close" aria-label="Close">×</button>
      <h2>Share this product</h2>
      <div class="share-poster"><canvas id="share-canvas" width="1080" height="1350"></canvas><p class="muted" id="share-wait">Making the picture…</p></div>
      <div class="share-buttons">
        ${targets.map(([name, cls, href]) => `<a class="share-btn ${cls}" href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer">${escapeHTML(name)}</a>`).join("")}
        <button type="button" class="share-btn share-ig" id="share-ig">Instagram</button>
        <button type="button" class="share-btn share-copy" id="share-copy">Copy link</button>
        <button type="button" class="share-btn share-dl" id="share-dl">Download picture</button>
        ${navigator.share ? '<button type="button" class="share-btn share-native" id="share-native">More…</button>' : ""}
      </div>
      <p class="small-note" id="share-msg" role="status">Instagram has no web share button: it saves the picture, then you post it from the app (the link goes in your bio or story).</p>
    </div>`;
  document.body.appendChild(box);
  const msg = text2 => { document.getElementById("share-msg").textContent = text2; };

  box.addEventListener("click", event => { if (event.target === box || event.target.closest(".share-close")) closeShare(); });

  sharing = { product, link, text, blob: null };
  const canvas = document.getElementById("share-canvas");
  try {
    const drawn = await drawPoster(product);
    canvas.getContext("2d").drawImage(drawn, 0, 0);
    sharing.blob = await canvasBlob(canvas);
  } catch (error) {
    console.error(error);
  }
  const wait = document.getElementById("share-wait");
  if (wait) wait.remove();

  const download = () => {
    if (!sharing || !sharing.blob) return msg("The picture could not be made (the product photo blocks it). Use the link instead.");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(sharing.blob);
    a.download = `${String(product.name).replace(/[^\w]+/g, "-").slice(0, 40) || "product"}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  document.getElementById("share-dl").addEventListener("click", download);

  document.getElementById("share-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(link);
      msg("Link copied.");
    } catch {
      window.prompt("Copy this link:", link);
    }
  });

  /* Instagram: on a phone the share sheet can hand the picture straight to the Instagram app. */
  document.getElementById("share-ig").addEventListener("click", async () => {
    try {
      if (sharing.blob && navigator.canShare) {
        const file = new File([sharing.blob], "product.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text: `${text}\n${link}` });
          return;
        }
      }
    } catch (error) {
      if (error && error.name === "AbortError") return;
    }
    download();
    try { await navigator.clipboard.writeText(link); } catch { /* optional */ }
    msg("Picture saved and the link copied. Open Instagram, post the picture and paste the link in the caption or your bio.");
  });

  const native = document.getElementById("share-native");
  if (native) {
    native.addEventListener("click", async () => {
      try { await navigator.share({ title: product.name, text, url: link }); } catch { /* cancelled */ }
    });
  }
}

document.addEventListener("click", event => {
  const button = event.target.closest(".share-product");
  if (!button) return;
  const product = (typeof allProducts !== "undefined" ? allProducts : []).find(item => item.id === button.dataset.id);
  if (product) openShare(product);
});

document.addEventListener("keydown", event => { if (event.key === "Escape") closeShare(); });

/* A shared link (index.html?p=ID) scrolls to that product and highlights it. */
function highlightSharedProduct() {
  const id = new URLSearchParams(location.search).get("p");
  if (!id) return;
  const card = [...document.querySelectorAll(".product-card")].find(el => el.dataset.id === id);
  if (card) {
    card.classList.add("product-highlight");
    if (card.scrollIntoView) card.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}
