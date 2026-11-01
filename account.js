"use strict";

/* Buyer account: overview, profile, orders/invoices, security. Requires store.js. */

(() => {
  const TABS = ["overview", "profile", "orders", "security"];
  const PROFILE_FIELDS = [
    ["fullName", "Full name", "pf-name"],
    ["phone", "Phone", "pf-phone"],
    ["company", "Company", "pf-company"],
    ["taxId", "Tax / VAT number", "pf-taxid"],
    ["country", "Country", "pf-country"],
    ["city", "City", "pf-city"],
    ["address", "Street address", "pf-address"]
  ];

  let user = null;
  let profile = {};
  let orders = [];

  const $ = id => document.getElementById(id);

  /* ---------- Helpers ---------- */

  function initials() {
    const source = (profile.fullName || user.email || "").trim();
    const parts = source.split(/[\s@._-]+/).filter(Boolean);
    const first = parts[0] ? parts[0][0] : "?";
    const second = parts[1] ? parts[1][0] : "";
    return (first + second).toUpperCase();
  }

  function memberSince() {
    const created = user.metadata && (user.metadata.creationTime || profile.createdAt);
    return created ? formatDate(created) : "—";
  }

  function completeness() {
    const filled = PROFILE_FIELDS.filter(([key]) => (profile[key] || "").trim()).length;
    return Math.round((filled / PROFILE_FIELDS.length) * 100);
  }

  /* ---------- Tabs ---------- */

  function showTab(name) {
    if (!TABS.includes(name)) name = "overview";

    TABS.forEach(tab => { $(`tab-${tab}`).hidden = tab !== name; });
    document.querySelectorAll(".acct-nav-btn").forEach(button => {
      button.classList.toggle("active", button.dataset.tab === name);
    });

    if (location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
  }

  /* ---------- Rendering ---------- */

  /* Delivery progress for orders sold by a marketplace seller. */
  function trackingHTML(order) {
    if (!order.merchantId) return "";
    if (order.fulfillment === "Rejected") {
      return `<p class="tracking tracking-bad">The seller could not take this order.${order.refundNeeded ? " Your payment will be refunded." : ""}</p>`;
    }
    const steps = order.deliveryMode === "pickup" ? ["Placed", "Accepted", "ReadyForPickup", "Delivered"] : order.deliveryMode === "self" ? ["Placed", "Accepted", "OnTheWay", "Delivered"] : FULFILLMENT_STEPS;
    const at = Math.max(0, steps.indexOf(order.fulfillment));
    const paid = /^Paid/.test(order.status || "");
    const dots = steps.map((step, index) =>
      `<li class="${index <= at ? "done" : ""}" title="${escapeHTML(FULFILLMENT_LABELS[step])}"></li>`).join("");
    return `<div class="tracking"><ol class="tracking-dots">${dots}</ol>
      <small>${escapeHTML(FULFILLMENT_LABELS[order.fulfillment] || "")}${paid ? "" : " · payment not confirmed yet"}
      · Seller: ${escapeHTML(order.merchantName || "")}${order.courierName ? ` · Delivery: ${escapeHTML(order.courierName)}` : ""}</small></div>`;
  }

  /* A purchase can be removed from the list once it is finished (the seller and the store keep their records). */
  const finished = order => order.fulfillment === "Delivered" || order.fulfillment === "Rejected" || order.fulfillment === "Digital" || (!order.merchantId && /^Paid/.test(order.status || ""));

  function orderCard(order) {
    const count = order.items.reduce((sum, item) => sum + Number(item.quantity), 0);
    const names = order.items.map(item => `${escapeHTML(item.name)} × ${Number(item.quantity)}`).join(", ");
    const invoiceUrl = `invoice.html?id=${encodeURIComponent(order.id)}`;

    return `
      <article class="order-card">
        <div class="order-top">
          <div>
            <strong>${escapeHTML(order.number)}</strong>
            <span class="order-date">${escapeHTML(formatDate(order.createdAt, true))}</span>
          </div>
          <span class="status-pill">${escapeHTML(order.status || "Paid")}</span>
        </div>
        <p class="order-items">${names}</p>
        ${trackingHTML(order)}
        <div class="order-bottom">
          <span>${count} item${count === 1 ? "" : "s"} · <strong>${formatPrice(order.total)}</strong>${order.delivery ? ` <small class="muted">(incl. delivery ${formatPrice(order.deliveryFee)} · ${escapeHTML(speedText(order))})</small>` : ""}</span>
          <span class="order-actions">
            ${order.merchantId ? waButton((order.pickup || {}).phone, (order.pickup || {}).country, "Seller", `Hello, about my order ${order.number}`) + waButton(order.courierPhone, "", "Delivery", `Hello, about my order ${order.number}`) : ""}
            ${order.hasCode && (["pickup", "self"].includes(order.deliveryMode) ? ["Accepted", "ReadyForPickup", "OnTheWay"] : ["CourierAccepted", "OnTheWay"]).includes(order.fulfillment) ? `<button type="button" class="small-button button-teal show-qr" data-id="${escapeHTML(order.id)}" data-number="${escapeHTML(order.number)}">📱 Delivery code (QR)</button>` : ""}
            ${order.merchantId ? `<button type="button" class="small-button" data-chat-order="${escapeHTML(order.id)}" data-chat-number="${escapeHTML(order.number)}">Chat</button>` : ""}
            ${order.fulfillment === "Delivered" || order.fulfillment === "Digital" ? order.items.map(item => `<button type="button" class="small-button rate-product" data-id="${escapeHTML(item.id)}" data-name="${escapeHTML(item.name)}">⭐ Rate ${escapeHTML(item.name).slice(0, 24)}</button>`).join("") : ""}
            ${order.fulfillment === "Delivered" || order.fulfillment === "Digital" ? `<button type="button" class="small-button rate-site">⭐ Rate the store</button>` : ""}
            <a class="small-button" href="${invoiceUrl}">View invoice</a>
            <a class="small-button" href="${invoiceUrl}&print=1" target="_blank" rel="noopener">Print</a>
            ${finished(order) ? `<button type="button" class="small-button delete-button hide-order" data-id="${escapeHTML(order.id)}">Remove</button>` : ""}
          </span>
        </div>
      </article>`;
  }

  function renderOverview() {
    const items = orders.reduce((sum, order) => sum + order.items.reduce((s, i) => s + Number(i.quantity), 0), 0);
    const spent = orders.reduce((sum, order) => sum + Number(order.total), 0);

    $("welcome-title").textContent = `Welcome${profile.fullName ? `, ${profile.fullName.split(" ")[0]}` : ""}!`;
    $("stat-orders").textContent = orders.length;
    $("stat-items").textContent = items;
    $("stat-spent").textContent = formatPrice(spent);

    $("recent-orders").innerHTML = orders.length
      ? orders.slice(0, 3).map(orderCard).join("")
      : `<p class="empty-cart">No orders yet. <a href="index.html#products">Browse the store</a></p>`;

    const library = new Map();
    orders.forEach(order => order.items.forEach(item => {
      const entry = library.get(item.id) || { ...item, quantity: 0 };
      entry.quantity += Number(item.quantity);
      library.set(item.id, entry);
    }));

    $("library").innerHTML = library.size
      ? [...library.values()].map(item => `
          <div class="library-row">
            <div>
              <strong>${escapeHTML(item.name)}</strong>
              <span class="muted">${escapeHTML(item.category || "Digital product")} · bought ${item.quantity}×</span>
            </div>
            <button type="button" class="small-button buy-again" data-id="${escapeHTML(item.id)}">Buy again</button>
          </div>`).join("")
      : `<p class="empty-cart">Products you buy will appear here.</p>`;
  }

  function renderProfile() {
    const percent = completeness();

    paintAvatar($("profile-avatar"), initials());
    $("photo-remove").hidden = !profile.photo;
    $("profile-name").textContent = profile.fullName || "Add your name";
    $("profile-email").textContent = user.email;
    $("profile-id").textContent = profile.customerId || "—";
    $("profile-since").textContent = memberSince();
    $("completeness-text").textContent = `${percent}%`;
    $("completeness-bar").style.width = `${percent}%`;

    $("profile-view").innerHTML = [["Email", user.email], ...PROFILE_FIELDS.map(([key, label]) => [label, profile[key]])]
      .map(([label, value]) => `
        <div><dt>${escapeHTML(label)}</dt><dd>${value ? escapeHTML(value) : '<span class="muted">Not provided</span>'}</dd></div>`)
      .join("");
  }

  function renderLocation() {
    if ($("my-location")) $("my-location").innerHTML = locationCardHTML(profile);
  }

  async function locateMe() {
    const button = $("locate-me");
    button.disabled = true;
    try {
      const where = await getPosition();
      const data = { lat: where.lat, lng: where.lng, locAt: new Date().toISOString() };
      await saveProfile(user.uid, data);
      profile = { ...profile, ...data };
      renderLocation();
      $("loc-message").textContent = "Location saved.";
      $("loc-message").classList.remove("error");
    } catch (error) {
      console.error(error);
      $("loc-message").textContent = error.message || "Could not save the location.";
      $("loc-message").classList.add("error");
    } finally {
      button.disabled = false;
    }
  }

  function paintAvatar(element, text) {
    if (!element) return;
    const src = profile.photo ? imageSrc(profile.photo) : "";
    element.classList.toggle("has-photo", Boolean(src));
    element.style.backgroundImage = src ? `url("${src.replace(/"/g, "")}")` : "";
    element.textContent = src ? "" : text;
  }

  async function changePhoto(file) {
    if (!file) return;
    const message = $("photo-message");
    message.textContent = "Saving…"; message.classList.remove("error");
    try {
      const photo = await fileToDataUrl(file, 320, 0.8, 60000);
      await saveProfile(user.uid, { photo });
      profile = { ...profile, photo };
      message.textContent = "Photo saved.";
      renderAll();
      if (window.mkSetHeaderPhoto) window.mkSetHeaderPhoto(photo);
    } catch (error) {
      console.error(error);
      message.textContent = error.message || "Could not save the photo.";
      message.classList.add("error");
    }
  }

  async function removePhoto() {
    try {
      await saveProfile(user.uid, { photo: "" });
      profile = { ...profile, photo: "" };
      $("photo-message").textContent = "Photo removed.";
      renderAll();
      if (window.mkSetHeaderPhoto) window.mkSetHeaderPhoto("");
    } catch (error) { console.error(error); $("photo-message").textContent = error.message || "Could not remove the photo."; $("photo-message").classList.add("error"); }
  }

  function renderSidebar() {
    if ($("member-badge")) $("member-badge").textContent = window.mkRoleMark ? `${window.mkRoleMark.icon} ${window.mkRoleMark.label} account` : user.emailVerified ? "Verified buyer account" : "Email not verified";
    paintAvatar($("avatar"), initials());
    $("side-name").textContent = profile.fullName || "My account";
    $("side-email").textContent = user.email;
  }

  function renderAll() {
    renderSidebar();
    renderOverview();
    renderProfile();
    renderLocation();

    $("orders-list").innerHTML = orders.length
      ? (orders.some(finished) ? '<p><button type="button" class="small-button delete-button" id="hide-finished">Remove all finished purchases from my list</button></p>' : "") + orders.map(orderCard).join("")
      : `<p class="empty-cart">You have no orders yet. <a href="index.html#products">Browse the store</a></p>`;
  }

  /* ---------- Profile editing ---------- */

  function setEditing(editing) {
    $("profile-form").hidden = !editing;
    $("profile-view").hidden = editing;
    $("edit-profile").hidden = editing;

    if (editing) {
      PROFILE_FIELDS.forEach(([key, , id]) => { $(id).value = profile[key] || ""; });
      $("pf-name").focus();
    }
  }

  async function saveProfileForm(event) {
    event.preventDefault();

    const data = {};
    PROFILE_FIELDS.forEach(([key, , id]) => { data[key] = $(id).value.trim(); });

    try {
      await saveProfile(user.uid, data);
    } catch (error) {
      console.error(error);
      return showToast("Could not save your profile.", "error");
    }

    profile = { ...profile, ...data };
    setEditing(false);
    renderAll();
    showToast("Profile saved");
  }

  /* ---------- Password and account ---------- */

  function setPasswordMessage(text, isError = false) {
    const element = $("pw-message");
    element.textContent = text;
    element.classList.toggle("error", isError);
  }

  async function reauthenticate(password) {
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
    await user.reauthenticateWithCredential(credential);
  }

  async function changePassword(event) {
    event.preventDefault();

    const current = $("pw-current").value;
    const next = $("pw-new").value;
    const confirm = $("pw-confirm").value;

    if (next.length < 8) return setPasswordMessage("Use at least 8 characters for the new password.", true);
    if (next !== confirm) return setPasswordMessage("The new passwords do not match.", true);

    try {
      await reauthenticate(current);
      await user.updatePassword(next);
      $("password-form").reset();
      setPasswordMessage("Password updated.");
      showToast("Password updated");
    } catch (error) {
      setPasswordMessage(authErrorMessage(error), true);
    }
  }

  async function deleteAccount() {
    const password = window.prompt("To delete your account, enter your password. Your past invoices are kept.");
    if (password === null) return;

    try {
      await reauthenticate(password);
      await db.collection("users").doc(user.uid).delete();
      await user.delete();
      window.location.href = "index.html";
    } catch (error) {
      showToast(authErrorMessage(error), "error");
    }
  }

  /* ---------- Start ---------- */

  document.addEventListener("DOMContentLoaded", async () => {
    /* Log out must always work, even if something below fails. */
    if ($("join-btn")) $("join-btn").addEventListener("click", () => {
      const modal = document.createElement("div");
      modal.className = "join-modal";
      modal.innerHTML = '<div class="join-box"><header><strong>Join our sellers or delivery partners</strong><button type="button" class="small-button" id="join-close">Close</button></header><iframe src="partner.html?embed=1" title="Join us"></iframe></div>';
      document.body.appendChild(modal);
      modal.querySelector("#join-close").addEventListener("click", () => modal.remove());
    });
    if ($("logout-btn")) $("logout-btn").addEventListener("click", () => mkLogout());
    if (!initBackend()) return; /* store.js shows the setup notice */

    const state = await getAuthState();
    if (!state.user) return;    /* store.js redirects to the sign-in page */

    user = state.user;
    /* a partner (seller, restaurant, pharmacy, doctor, barber, agency, taxi) gets his advertising card with the QR code in his profile */
    if (state.merchant && !["pending", "rejected"].includes(state.merchant.status) && window.mkAdCard && $("adcard-panel")) {
      $("adcard-panel").hidden = false;
      let shopNow = state.merchant;
      mkAdCard.mount($("adcard-panel"), user.uid, () => shopNow);
    }

    try {
      profile = await getProfile(user.uid);
      orders = (await getMyOrders(user.uid)).filter(order => order.customerHidden !== true);
    } catch (error) {
      console.error(error);
      showToast("Could not load your account data.", "error");
    }

    if (!profile.customerId) {
      profile.customerId = `MKC-${randomHex(3).toUpperCase()}`;
      try {
        await saveProfile(user.uid, { email: user.email, customerId: profile.customerId, createdAt: profile.createdAt || new Date().toISOString() });
      } catch (error) {
        console.error(error);
      }
    }

    try { renderAll(); } catch (error) { console.error(error); showToast("Part of the page could not be shown. Please reload (Ctrl+F5).", "error"); }
    showTab(location.hash.slice(1));

    document.querySelectorAll(".acct-nav-btn").forEach(button => {
      button.addEventListener("click", () => showTab(button.dataset.tab));
    });

    document.addEventListener("click", async event => {
      const go = event.target.closest("[data-go]");
      if (go) return showTab(go.dataset.go);

      const hide = event.target.closest(".hide-order, #hide-finished");
      if (hide) {
        const targets = hide.id === "hide-finished" ? orders.filter(finished) : orders.filter(order => order.id === hide.dataset.id);
        if (!window.confirm(targets.length > 1 ? `Remove ${targets.length} finished purchases from your list?` : "Remove this purchase from your list?")) return;
        try {
          for (const order of targets) await db.collection("orders").doc(order.id).update({ customerHidden: true });
          orders = orders.filter(order => !targets.includes(order));
          renderAll();
          showToast("Removed from your list.");
        } catch (error) {
          console.error(error);
          showToast(authErrorMessage(error), "error");
        }
        return;
      }

      const again = event.target.closest(".buy-again");
      if (again) {
        const product = await addToCart(again.dataset.id);
        if (product) showToast(`${product.name} added to your cart`);
        else showToast("This product is no longer available.", "error");
      }
    });

    window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));

    $("edit-profile").addEventListener("click", () => setEditing(true));
    $("cancel-profile").addEventListener("click", () => setEditing(false));
    $("profile-form").addEventListener("submit", saveProfileForm);
    $("photo-input").addEventListener("change", event => { changePhoto(event.target.files[0]); event.target.value = ""; });
    $("photo-remove").addEventListener("click", removePhoto);
    if ($("locate-me")) $("locate-me").addEventListener("click", locateMe);
    $("password-form").addEventListener("submit", changePassword);
    $("delete-account").addEventListener("click", deleteAccount);
  });
})();


/* The customer's delivery code: the delivery partner scans this QR code (or types the code) to confirm that the parcel arrived. */
document.addEventListener("click", async event => {
  const button = event.target.closest(".show-qr");
  if (!button) return;
  try {
    const snap = await db.collection("orderCodes").doc(button.dataset.id).get();
    if (!snap.exists) return showToast("The code is not available for this order.", "error");
    const code = snap.data().code;
    const qr = qrcode(0, "M"); qr.addData(`MKD:${button.dataset.id}:${code}`); qr.make();
    const modal = document.createElement("div");
    modal.className = "qr-modal";
    modal.innerHTML = `<div class="qr-card" role="dialog" aria-label="Delivery code">
      <h3>Delivery code · ${escapeHTML(button.dataset.number)}</h3>
      <div class="qr-box">${qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true })}</div>
      <p class="qr-code">${escapeHTML(code.slice(0, 4))} ${escapeHTML(code.slice(4))}</p>
      <p class="muted">Show this to the delivery partner when he hands you the parcel. He scans it to confirm the delivery. Do not show it before the parcel is in your hands.</p>
      <button type="button" class="button button-teal qr-close">Close</button></div>`;
    modal.addEventListener("click", ev => { if (ev.target === modal || ev.target.closest(".qr-close")) modal.remove(); });
    document.body.appendChild(modal);
  } catch (error) { console.error(error); showToast(authErrorMessage(error), "error"); }
});
