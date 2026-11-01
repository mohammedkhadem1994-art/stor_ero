"use strict";

/* A partner (shop, restaurant, pharmacy, doctor, barber, travel agency, taxi) gets a page header like a social-media page:
   a wide cover picture, a round profile picture over it, his name, and a very faint background behind the whole page.
   He changes each picture with a button on the picture itself. The customer sees the same header when he books. */

window.setupLookPanel = function (me, getShop, opts) {
  const own = Boolean(opts && opts.own); /* courier, supervisor, dean: the pictures live in the user's own file */
  const $ = id => document.getElementById(id);
  const anchor = document.querySelector(".admin-heading");
  if (!anchor || $("look-header")) return;
  const shop = getShop();
  let cover = shop.cover || "", backdrop = shop.backdrop || "", photo = "";
  if (window.MK_VIEW_AS && window.mkDemoLook) { cover = window.mkDemoLook.cover; backdrop = window.mkDemoLook.backdrop; photo = window.mkDemoLook.photo; }
  const kindName = getShop().kindLabel || { doctor: "Doctor", barber: "Barbershop", hotel: "Hotel", agency: "Travel agency", taxi: "Taxi", shop: "Shop", restaurant: "Restaurant", pharmacy: "Pharmacy" }[shop.kind] || "";
  const box = document.createElement("section");
  box.id = "look-header"; box.className = "page-head";
  box.innerHTML = `<div class="ph-cover" id="lk-cover-prev"></div>
    <div class="ph-tools"><label class="small-button ph-btn">📷 Change cover<input type="file" id="lk-cover" accept="image/*" hidden></label>
      <label class="small-button ph-btn">🖼 Change background<input type="file" id="lk-back" accept="image/*" hidden></label>
      <button type="button" class="small-button ph-btn" id="lk-cover-del" hidden>Remove cover</button>
      <button type="button" class="small-button ph-btn" id="lk-back-del" hidden>Remove background</button></div>
    <div class="ph-row"><div class="ph-avatar" id="lk-avatar"></div>
      <div class="ph-id"><h2 id="lk-name"></h2><p class="muted" id="lk-sub"></p>
        <label class="small-button ph-photo">📷 Change profile picture<input type="file" id="lk-photo" accept="image/*" hidden></label></div></div>
    <p id="lk-message" class="form-message" role="status"></p>`;
  anchor.insertAdjacentElement("beforebegin", box);
  const back = document.createElement("div"); back.className = "dr-backdrop"; back.id = "lk-backdrop"; back.setAttribute("aria-hidden", "true");
  document.body.appendChild(back);
  const say = (t, bad) => { const m = $("lk-message"); m.textContent = t; m.classList.toggle("error", Boolean(bad)); };
  const draw = () => {
    const s = getShop();
    $("lk-cover-prev").innerHTML = cover ? `<img src="${escapeHTML(cover)}" alt="">` : `<span>Add a cover picture</span>`;
    $("lk-avatar").innerHTML = photo ? `<img src="${escapeHTML(photo)}" alt="">` : `<span>${escapeHTML((s.businessName || "?").trim().charAt(0).toUpperCase())}</span>`;
    $("lk-name").textContent = s.businessName || "";
    $("lk-sub").textContent = [kindName, s.description, s.city].filter(Boolean).join(" · ");
    $("lk-cover-del").hidden = !cover; $("lk-back-del").hidden = !backdrop;
    back.style.backgroundImage = backdrop ? `url("${backdrop}")` : ""; back.hidden = !backdrop;
  };
  draw();
  try { db.collection("users").doc(me.uid).get().then(d => { if (!d.exists) return; const u = d.data(); if (u.photo) photo = imageSrc(u.photo); if (own && !window.MK_VIEW_AS) { cover = u.cover || ""; backdrop = u.backdrop || ""; } draw(); }).catch(() => {}); } catch { /* optional */ }
  const keep = async (fields, done) => {
    try { if (own) await db.collection("users").doc(me.uid).set(fields, { merge: true }); else await db.collection("merchants").doc(me.uid).update(fields); Object.assign(getShop(), fields); say(done); }
    catch (error) { say(authErrorMessage(error), true); }
  };
  const pick = (input, side, quality, chars, apply) => input.addEventListener("change", async () => {
    const file = input.files && input.files[0]; input.value = "";
    if (!file) return;
    try { await apply(await fileToDataUrl(file, side, quality, chars)); draw(); }
    catch (error) { say(error.message || "This file is not a picture.", true); }
  });
  pick($("lk-cover"), 900, 0.7, 70000, async v => { cover = v; await keep({ cover }, "Cover saved."); });
  pick($("lk-back"), 700, 0.5, 50000, async v => { backdrop = v; await keep({ backdrop }, "Background saved."); });
  pick($("lk-photo"), 320, 0.8, 60000, async v => { photo = v; await saveProfile(me.uid, { photo }); say("Profile picture saved."); if (window.mkSetHeaderPhoto) window.mkSetHeaderPhoto(v); });
  $("lk-cover-del").addEventListener("click", async () => { cover = ""; await keep({ cover }, "Cover removed."); draw(); });
  $("lk-back-del").addEventListener("click", async () => { backdrop = ""; await keep({ backdrop }, "Background removed."); draw(); });
  /* the name or the city changed in the details form: the header follows */
  const watch = setInterval(() => { if (!document.body.contains(box)) return clearInterval(watch); const s = getShop(); if ($("lk-name").textContent !== (s.businessName || "")) draw(); }, 1500);
};
