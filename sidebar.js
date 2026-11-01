"use strict";
/* Side menu with icons (like a dashboard): the links of the top bar move to a panel on the side.
   On a phone the panel opens with the ☰ button. The old top links stay in the page (hidden) so every other script keeps working. */
(function () {
  const ICONS = [
    [/#about/, "ℹ️"], [/admin-stats/, "📈"], [/admin\.html/, "🏠"], [/index\.html#products|#products/, "🛍️"], [/index\.html|^store$/i, "🛍️"], [/guide\.html/, "📖"], [/accounts\.html/, "🪪"], [/partner\.html/, "🚀"], [/#about/, "ℹ️"],
    [/services\.html/, "🧰"], [/trades\.html/, "🛠️"], [/board\.html/, "📋"], [/doctors\.html/, "🩺"], [/barbers\.html/, "💈"], [/hotels\.html/, "🏨"], [/travel\.html/, "✈️"], [/taxi\.html/, "🚕"], [/wallet\.html/, "💳"],
    [/merchant\.html/, "🏪"], [/courier\.html/, "🚚"], [/supervisor\.html/, "🧑‍💼"], [/dean\.html/, "🎖️"], [/account\.html/, "👤"], [/login\.html/, "🔑"], [/register\.html/, "📝"], [/checkout\.html/, "🛒"], [/privacy\.html/, "🔒"]
  ];
  const TAB_ICONS = { orders: "📦", products: "🏷️", profile: "🏪", jobs: "🚚", history: "🕘", overview: "🏠", security: "🔒", sales: "💰", couriers: "🚚", debts: "💸", invite: "✉️", appointments: "📅", stats: "📈", people: "✅", sups: "🧑‍💼", shares: "💹", monthly: "🗓️" };
  const LABEL_ICONS = [[/log ?out/i, "🚪"], [/credit/i, "💳"], [/dashboard/i, "🏠"], [/statistic/i, "📈"], [/view store|^store$/i, "🛍️"], [/clinic/i, "🩺"], [/travel/i, "✈️"], [/taxi/i, "🚕"]];
  const OWN_ICONS = { "styles-panel": "💈", "board-panel": "🗓️", "requests-panel": "📥", "details-panel": "🏪", "adcard-panel": "📣" };
  const SECTION_ICONS = { "preview-panel": "👁️", "brought-panel": "🧑‍🤝‍🧑", "wipe-zone": "🗑️", "qrs-panel": "🔳", "ads-panel": "📣", "trusted-panel": "⭐", "artisans-panel": "🛠️", "partners-panel": "🤝", "supervisors-panel": "🧑‍💼", "deans-panel": "🎖️", "shares-panel": "💹", "reviews-panel": "⭐", "settings-panel": "⚙️", "users-panel": "👥", "debts-panel": "💸", "monthly-panel": "🗓️", "reports-panel": "📋", "messages-panel": "💬", "fees-panel": "🧾", "feeplan-panel": "📊", "money-panel": "💰", "growth-panel": "🧭", "lists-panel": "🏆", "daily-panel": "🗓️", "orders-panel": "📦", "erase-panel": "🗑️", "records-panel": "🔐", "subs-panel": "🏷️", "plimit-panel": "🖼️", "join-panel": "🚪", "edit-panel": "✏️" };

  const iconFor = (href, label) => {
    for (const [re, icon] of LABEL_ICONS) if (re.test(label)) return icon;
    for (const [re, icon] of ICONS) if (re.test(href)) return icon;
    return "🔹";
  };
  /* the pages that belong to a main link: shown under it, a step lower */
  const SUBS = { "services.html": [["doctors.html", "Doctors", "🩺"], ["barbers.html", "Barbers", "💈"], ["hotels.html", "Hotels & lodging", "🏨"], ["travel.html", "Travel agencies", "✈️"], ["taxi.html", "Taxi", "🚕"]] };
  /* what lies under a main link when its page is not the one you are on */
  let ALL_GUIDES = null;
  const STATIC_SUBS = {
    "dean.html?tab=stats": [["dean.html?tab=stats", "Statistics of my group", "📈"]],
    "supervisor.html?tab=stats": [["supervisor.html?tab=stats", "My statistics", "📈"]],
    "doctors.html": [["doctors.html#dr-book", "New appointment", "🩺"], ["doctors.html#dr-mine", "My appointments", "🗓️"]],
    "barbers.html": [["barbers.html#dr-book", "New appointment", "💈"], ["barbers.html#dr-mine", "My appointments", "🗓️"]],
    "hotels.html": [["hotels.html#dr-book", "New booking", "🏨"], ["hotels.html#dr-mine", "My bookings", "🗓️"]],
    "travel.html": [["travel.html#dr-book", "New seat booking", "✈️"], ["travel.html#dr-mine", "My bookings", "🗓️"]],
    "taxi.html": [["taxi.html#dr-book", "New ride request", "🚖"], ["taxi.html#dr-mine", "My rides", "🗓️"]],
    "trades.html": [["trades.html#trades-search", "All craftsmen", "🛠️"], ["trades.html#trades-mine", "Are you a craftsman? Add your trade", "➕"]],
    "guide.html": [["guide.html#customer", "For customers: buy and book", "🛒"], ["guide.html#shop", "Seller", "🛍️"], ["guide.html#restaurant", "Restaurant", "🍽️"], ["guide.html#pharmacy", "Pharmacy", "💊"], ["guide.html#doctor", "Doctor", "🩺"], ["guide.html#barber", "Barber", "💈"], ["guide.html#hotel", "Hotel", "🏨"], ["guide.html#agency", "Travel agency", "✈️"], ["guide.html#taxi", "Taxi driver", "🚕"], ["guide.html#courier", "Delivery partner", "🛵"], ["guide.html#supervisor", "Supervisor", "🧑‍💼"], ["guide.html#dean", "Dean", "🎓"]],
    "partner.html": [["partner.html?kind=shop", "Join as a seller", "🛍️"], ["partner.html?kind=restaurant", "Join as a restaurant", "🍽️"], ["partner.html?kind=pharmacy", "Join as a pharmacy", "💊"], ["partner.html?kind=doctor", "Join as a doctor", "🩺"], ["partner.html?kind=barber", "Join as a barber", "💈"], ["partner.html?kind=hotel", "Join as a hotel", "🏨"], ["partner.html?kind=agency", "Join as a travel agency", "✈️"], ["partner.html?kind=taxi", "Join as a taxi driver", "🚕"], ["partner.html?kind=courier", "Join as a delivery partner", "🛵"]],
    "accounts.html": [["accounts.html#customer", "Customers", "👤"], ["accounts.html#seller", "Sellers", "🏪"], ["accounts.html#providers", "Doctors, barbers, hotels, agencies, taxi", "🧰"], ["accounts.html#courier", "Delivery partners", "🚚"], ["accounts.html#supervisor", "Supervisors", "🧑‍💼"], ["accounts.html#dean", "Deans", "🎖️"]],
    "#products": [["index.html#categories", "Categories", "🗂️"], ["index.html#product-grid", "All products", "🛍️"], ["index.html#styles-showcase", "Barber styles", "💈"]],
    "#about": [["index.html#reviews", "Customer reviews", "⭐"], ["index.html#about", "About us", "ℹ️"]],
    "admin-stats.html": [["admin-stats.html#money-panel", "Site earnings & sales", "💰"], ["admin-stats.html#growth-panel", "Following the growth", "🧭"], ["admin-stats.html#lists-panel", "Top lists", "🏆"], ["admin-stats.html#daily-panel", "Daily report", "🗓️"]],
    "account.html": [["account.html#overview", "Overview", "🏠"], ["account.html#profile", "My profile", "🏪"], ["account.html#orders", "Orders & invoices", "📦"], ["account.html#security", "Security", "🔒"]],
    "admin.html": [["admin.html#overview", "Overview", "🏠"], ["admin.html#preview-panel", "Preview the pages", "👁️"], ["admin.html#partners-panel", "Staff: sellers, delivery partners", "🤝"], ["admin.html#qrs-panel", "QR codes of the Join us window", "🔳"], ["admin.html#reviews-panel", "Customer reviews", "⭐"], ["admin.html#deans-panel", "Deans", "🎖️"], ["admin.html#shares-panel", "Profit sharing", "💹"], ["admin.html#supervisors-panel", "Supervisors", "🧑‍💼"], ["admin.html#brought-panel", "Who brought the partners", "🧑‍🤝‍🧑"], ["admin.html#settings-panel", "Features & requirements", "⚙️"], ["admin.html#trusted-panel", "Trusted delivery partners", "⭐"], ["admin.html#artisans-panel", "Craftsmen directory", "🛠️"], ["admin.html#ads-panel", "Side banner (announcements)", "📣"], ["admin.html#users-panel", "Users", "👥"], ["admin.html#records-panel", "Security, backup & month close", "🔐"], ["admin.html#erase-panel", "Erase data", "🗑️"], ["admin.html#subs-panel", "Subscription plans for partners", "🏷️"], ["admin.html#plimit-panel", "How many products each account may upload", "🖼️"], ["admin.html#join-panel", "How many new accounts to accept", "🚪"], ["admin.html#feeplan-panel", "Site fees by kind of account", "📊"], ["admin.html#fees-panel", "Site fees: partners → supervisors → site", "🧾"], ["admin.html#monthly-panel", "Monthly collection tables", "🗓️"], ["admin.html#debts-panel", "Sellers' debts to the site", "💸"], ["admin.html#reports-panel", "Reports from supervisors", "📝"], ["admin.html#messages-panel", "Messages", "💬"]]
  };
  /* a title that starts with its own emoji: the emoji becomes the menu icon, so it is not shown twice */
  const splitEmoji = text => { const m = String(text).match(/^([\p{Extended_Pictographic}\uFE0F\u200D]+)\s*(.*)$/u); return m ? { icon: m[1], label: m[2] } : { icon: "", label: String(text) }; };
  const authUser = () => { try { return window.firebase && firebase.apps && firebase.apps.length ? firebase.auth().currentUser : null; } catch { return null; } };
  /* the menu is rebuilt when the sign-in state becomes known or changes */
  let authWatched = false, authTries = 0;
  function watchAuth() {
    if (authWatched) return;
    const tick = setInterval(() => {
      authTries += 1;
      try { if (window.firebase && firebase.apps && firebase.apps.length) { authWatched = true; clearInterval(tick); firebase.auth().onAuthStateChanged(() => schedule()); } } catch { /* not ready */ }
      if (authTries > 40) clearInterval(tick);
    }, 250);
  }
  const plain = el => (typeof window.mkOriginalText === "function" ? window.mkOriginalText(el) : el.textContent) || "";
  /* who is signed in: name and picture, shown at the top of the menu */
  let who = { uid: "", name: "", photo: "" };
  function loadWho(user) {
    if (!user || who.uid === user.uid) return;
    who = { uid: user.uid, name: user.displayName || (user.email || "").split("@")[0], photo: "" };
    try {
      if (typeof getProfile === "function") getProfile(user.uid).then(p => {
        const name = (p && (p.fullName || p.name || p.displayName)) || who.name;
        const photo = p && p.photo && typeof imageSrc === "function" ? imageSrc(p.photo) : "";
        if (name !== who.name || photo !== who.photo) { who.name = name; who.photo = photo; schedule(); }
      }).catch(() => {});
    } catch { /* optional */ }
  }
  const tabClick = (href, page) => {
    const m = String(href).match(/^([^?#]+)\?tab=(\w+)$/);
    if (!m || m[1] !== page) return null;
    return () => { const b = [...document.querySelectorAll(".role-tabs button")].find(x => x.dataset.tab === m[2] && !x.closest("[hidden]")); if (b) b.click(); };
  };
  const here = () => (location.pathname.split("/").pop() || "index.html");
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let side = null, timer = 0, hideMoney = false;   /* the owner hides the credit window on collaborators' accounts during the trial */
  try { if (typeof getFeatures === "function") getFeatures().then(f => { const v = f.global.showCollabMoney === false; if (v !== hideMoney) { hideMoney = v; schedule(); } }).catch(() => {}); } catch { /* optional */ }
  /* the menu keeps its look: which branches are open and how far it is scrolled survive every rebuild and every page change */
  const STATE_KEY = "mk-side-state";
  let openState = {}, savedScroll = 0;
  try { const raw = JSON.parse(sessionStorage.getItem(STATE_KEY) || "{}"); openState = raw.open || {}; savedScroll = Number(raw.scroll) || 0; } catch { /* storage may be blocked */ }
  const saveState = () => { try { sessionStorage.setItem(STATE_KEY, JSON.stringify({ open: openState, scroll: side ? side.scrollTop : savedScroll })); } catch { /* ignore */ } };

  function item(icon, label, { href = "#", active = false, onClick = null, extraClass = "", go = "" } = {}) {
    const a = document.createElement("a");
    if (go) a.dataset.go = go;
    a.className = "side-item" + (active ? " active" : "") + (extraClass ? " " + extraClass : "");
    a.href = href;
    a.innerHTML = `<span class="side-icon" aria-hidden="true">${icon}</span><span class="side-label">${esc(label)}</span>`;
    if (onClick) a.addEventListener("click", event => { event.preventDefault(); onClick(); close(); });
    return a;
  }


  /* a secondary group (the tabs of the page, the owner's sections): its own panel, a title that folds it, a rail on the side */
  function subGroup(title, key) {
    const g = document.createElement("div"); g.className = "side-group side-sub";
    const t = document.createElement("button"); t.type = "button"; t.className = "side-title";
    t.innerHTML = `<span>${esc(title)}</span><span class="side-chevron" aria-hidden="true">▾</span>`;
    const list = document.createElement("div"); list.className = "side-items";
    let folded = false;
    try { folded = localStorage.getItem("mk-side-" + key) === "1"; } catch { /* storage may be blocked */ }
    const paint = () => { g.classList.toggle("collapsed", folded); t.setAttribute("aria-expanded", String(!folded)); };
    t.addEventListener("click", () => { folded = !folded; paint(); try { localStorage.setItem("mk-side-" + key, folded ? "1" : "0"); } catch { /* ignore */ } });
    paint();
    g.appendChild(t); g.appendChild(list);
    return { g, list };
  }

  function close() { document.body.classList.remove("side-open"); }

  function build() {
    buildTimes.push(Date.now());
    window.mkSideBuilds = (window.mkSideBuilds || 0) + 1;   /* counted so a test can notice a rebuild loop */
    const header = document.querySelector(".site-header");
    const nav = header && header.querySelector("nav");
    if (!header || !nav) return;
    if (!side) {
      side = document.createElement("aside");
      side.className = "side-nav no-print";
      side.setAttribute("aria-label", "Menu");
      document.body.appendChild(side);
      const backdrop = document.createElement("div");
      backdrop.className = "side-backdrop no-print";
      backdrop.addEventListener("click", close);
      document.body.appendChild(backdrop);
      const toggle = document.createElement("button");
      toggle.type = "button"; toggle.className = "side-toggle"; toggle.setAttribute("aria-label", "Menu");
      toggle.innerHTML = "☰";
      toggle.addEventListener("click", () => document.body.classList.toggle("side-open"));
      header.insertBefore(toggle, header.firstChild);
      document.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
      side.addEventListener("scroll", () => { savedScroll = side.scrollTop; saveState(); }, { passive: true });
      new MutationObserver(watch).observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "href"] });
      const tools = document.getElementById("doctor-tools");
      if (tools) new MutationObserver(watch).observe(tools, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
      const sellerTools = document.getElementById("seller-tools");
      if (sellerTools) new MutationObserver(watch).observe(sellerTools, { attributes: true, attributeFilter: ["hidden"] });
      document.querySelectorAll(".role-tabs, .account-nav").forEach(el => new MutationObserver(watch).observe(el, { subtree: true, attributes: true, attributeFilter: ["class"] }));
    }
    document.body.classList.add("has-side");

    const picker = side.querySelector("#lang-switch") || document.getElementById("lang-switch");
    const brand = header.querySelector(".brand");
    const keepScroll = side.scrollTop || savedScroll;
    side.textContent = "";
    const head = document.createElement("a");
    head.className = "side-brand"; head.href = brand ? brand.getAttribute("href") : "index.html";
    head.innerHTML = `<span class="brand-mark">P</span><span><strong>Plazavo</strong><small>${esc((brand && brand.querySelector("small") ? plain(brand.querySelector("small")) : "") || "")}</small></span>`;
    side.appendChild(head);
    const closeBtn = document.createElement("button");
    closeBtn.type = "button"; closeBtn.className = "side-close"; closeBtn.setAttribute("aria-label", "Close menu"); closeBtn.innerHTML = "✕";
    closeBtn.addEventListener("click", close);
    side.appendChild(closeBtn);
    const mainTitle = document.createElement("div"); mainTitle.className = "side-main-title"; mainTitle.textContent = "Main menu";
    side.appendChild(mainTitle);

    const page = here();
    const links = [...nav.querySelectorAll("a")].filter(a => !a.classList.contains("cart-link") && a.id !== "header-avatar-link" && !a.closest("#header-avatar-link"));
    /* the same main menu on every page and every account: the links the top bar of this page lacks are added, then all are put in one fixed order */
    /* signed in = the sign-in state of the page itself (the top bar changes its link) or the login the browser holds */
    const signedIn = !!authUser();
    const has = re => links.some(a => re.test(a.getAttribute("href") || ""));
    const fake = (href, text) => { const f = document.createElement("a"); f.setAttribute("href", href); f.textContent = text; links.push(f); };
    /* three separate entries: How it works (the illustrated guides), Accounts (the kinds of account), Join us (one line per kind of account) */
    const ownerSide = links.some(a => a.id === "admin-logout" || /^admin/.test(a.getAttribute("href") || ""));
    for (let i = links.length - 1; i >= 0; i--) if (/^(accounts|partner|guide)\.html/.test(links[i].getAttribute("href") || "")) links.splice(i, 1);
    /* the guides belong to the accounts: a guest sees none of them, a signed-in person sees his own, and only the owner sees the page that lists the kinds of account */
    if (signedIn || ownerSide) fake("guide.html", "How it works");
    if (ownerSide) fake("accounts.html", "Accounts");
    if (!ownerSide) fake("partner.html", "Join us");
    if (!has(/(^|#)about$/)) fake("index.html#about", "About");
    if (!has(/^services\.html/)) fake("services.html", "Services");
    /* the directory of craftsmen and trades (plumber, builder...) */
    if (!has(/^trades\.html/)) fake("trades.html", "Craftsmen & trades");
    /* a dean and a supervisor have their own Statistics (only the people they brought in) */
    if (has(/^dean\.html/)) fake("dean.html?tab=stats", "Statistics");
    if (has(/^supervisor\.html/)) fake("supervisor.html?tab=stats", "Statistics");
    if (!signedIn) {
      /* a guest sees "Sign in" everywhere (some pages show a "My account" link even to guests) */
      for (let i = links.length - 1; i >= 0; i--) if (/^account\.html/.test(links[i].getAttribute("href") || "")) links.splice(i, 1);
      for (let i = links.length - 1; i >= 0; i--) if (/^register\.html/.test(links[i].getAttribute("href") || "")) links.splice(i, 1);
      /* credit needs an account: a guest does not see it */
      for (let i = links.length - 1; i >= 0; i--) if (/^wallet\.html/.test(links[i].getAttribute("href") || "")) links.splice(i, 1);
      if (!has(/^login\.html/)) fake("login.html", "Sign in");
    }
    if (signedIn && !has(/^account\.html/)) fake("account.html", "My account");
    /* everybody who is signed in can sign out from the menu */
    if (signedIn && !links.some(a => /log ?out/i.test(a.textContent) || a.id === "admin-logout")) {
      fake("#", "Log out");
      links[links.length - 1].addEventListener("click", event => { event.preventDefault(); if (typeof mkLogout === "function") mkLogout(); });
    }
    const rank = a => {
      const h = a.getAttribute("href") || "", t = plain(a);
      if (/log ?out/i.test(t) || a.id === "admin-logout") return 9;
      if (/^wallet\.html/.test(h)) return 0;
      if (/^guide\.html/.test(h)) return 1;
      if (/^accounts\.html/.test(h)) return 1.1;
      if (/^partner\.html/.test(h)) return 1.2;
      if (/^(index\.html)?(#products)?$/.test(h) || /^index\.html#products/.test(h) || /^(view )?store$/i.test(t.trim())) return 2;
      if (/(^|#)about$/.test(h)) return 3;
      if (/^services\.html/.test(h)) return 4;
      if (/^trades\.html/.test(h)) return 4.5;
      if (/^board\.html/.test(h)) return 4.6;
      if (/^admin-stats\.html/.test(h) || /^statistics$/i.test(t.trim())) return 6;
      if (/^(account|login|register)\.html/.test(h)) return 8;
      return 5;
    };
    /* the store link is always the same one ("Products"), whatever the page calls it */
    for (let i = 0; i < links.length; i++) if (rank(links[i]) === 2) { const f = document.createElement("a"); f.setAttribute("href", "index.html#products"); f.textContent = "Products"; links[i] = f; }
    links.sort((x, y) => rank(x) - rank(y));
    if (signedIn) {
      loadWho(authUser());
      const roleLink = links.find(a => rank(a) === 5 && !/log ?out/i.test(plain(a)));
      const isAdminSide = links.some(a => a.id === "admin-logout" || /^admin/.test(a.getAttribute("href") || ""));
      const ROLE_NAMES = { "My clinic": "Doctor", "My barbershop": "Barber", "My hotel": "Hotel", "My travel agency": "Travel agency", "My taxi": "Taxi driver", "My restaurant": "Restaurant", "My pharmacy": "Pharmacy", "Seller dashboard": "Seller", "Deliveries": "Delivery partner", "Dean": "Dean", "Supervisor": "Supervisor" };
      const roleText = roleLink ? plain(roleLink).replace(/\s+/g, " ").trim() : "";
      const role = isAdminSide ? "Administrator" : ROLE_NAMES[roleText] || roleText || "Customer";
      /* under "How it works": the customer guide and the guide of his own kind of account only */
      if (!isAdminSide) {
        const OWN = { "Doctor": "doctor", "Barber": "barber", "Hotel": "hotel", "Travel agency": "agency", "Taxi driver": "taxi", "Restaurant": "restaurant", "Pharmacy": "pharmacy", "Seller": "shop", "Delivery partner": "courier" }[ROLE_NAMES[roleText]] || "";
        if (!ALL_GUIDES) ALL_GUIDES = STATIC_SUBS["guide.html"].slice();
        STATIC_SUBS["guide.html"] = ALL_GUIDES.filter(([file]) => file === "guide.html#customer" || (OWN && file === "guide.html#" + OWN));
      }
      if (hideMoney && !isAdminSide && ROLE_NAMES[roleText] && !/^(Dean|Supervisor)$/.test(ROLE_NAMES[roleText])) {
        for (let i = links.length - 1; i >= 0; i--) if (/^wallet\.html/.test(links[i].getAttribute("href") || "")) links.splice(i, 1);
      }
      const card = document.createElement("a"); card.className = "side-user"; card.href = "account.html#profile"; card.title = (authUser() || {}).uid || "";
      const shown = who.name || "";
      card.innerHTML = `<span class="side-user-pic">${who.photo ? `<img alt="" src="${esc(who.photo)}">` : esc((shown.trim().charAt(0) || "?").toUpperCase())}</span><span class="side-user-text"><strong>${esc(shown)}</strong><small>${esc(role)}</small></span>${window.mkRoleMark ? `<span class="side-user-badge" title="${esc(window.mkRoleMark.label)}">${window.mkRoleMark.icon}</span>` : ""}`;
      side.insertBefore(card, mainTitle);
    }
    /* the parts of this page (tabs, panels, sections): they go under the main link of the page */
    const pageSubs = [];
    [...document.querySelectorAll(".role-tabs button, .account-nav button")].filter(b => !b.closest("[hidden]")).forEach(b =>
      pageSubs.push({ icon: TAB_ICONS[b.dataset.tab] || "🔹", label: plain(b).replace(/\s+/g, " ").trim(), active: b.classList.contains("active"), onClick: () => b.click(), go: b.closest(".account-nav") ? "#" + b.dataset.tab : "?tab=" + b.dataset.tab }));
    [...document.querySelectorAll("#doctor-tools:not([hidden]) section.admin-panel[id]:not([hidden])")].filter(x => x.querySelector("h2")).forEach(x =>
      pageSubs.push({ icon: OWN_ICONS[x.id] || "🔹", label: plain(x.querySelector("h2")).replace(/\s+/g, " ").trim(), go: "#" + x.id, active: false, onClick: () => (window.mkPaneFocus && window.mkPaneFocus.has(x.id) ? (location.hash === "#" + x.id ? window.mkPaneFocus.apply(true) : (location.hash = x.id)) : x.scrollIntoView({ behavior: "smooth", block: "start" })) }));
    [...document.querySelectorAll("body.admin-page main section.admin-panel[id]")].filter(x => x.querySelector("h2")).forEach(x =>
      pageSubs.push({ icon: SECTION_ICONS[x.id] || "🔹", label: plain(x.querySelector("h2")).replace(/\s+/g, " ").trim().replace(/\s*\d+$/, "").replace(/^[^\p{L}\p{N}]+/u, ""), go: "#" + x.id, active: false, onClick: () => (window.mkPaneFocus && window.mkPaneFocus.has(x.id) ? (location.hash === "#" + x.id ? window.mkPaneFocus.apply(true) : (location.hash = x.id)) : x.scrollIntoView({ behavior: "smooth", block: "start" })) }));
    /* the ad card and "Erase my data" have their own buttons and open alone */
    if (window.mkPaneFocus) window.mkPaneFocus.extras().forEach(x => { const h = x.querySelector("h2"); if (h && !pageSubs.some(p => p.go === "#" + x.id)) pageSubs.push({ icon: SECTION_ICONS[x.id] || "🔹", label: plain(h).replace(/\s+/g, " ").trim().replace(/^[^\p{L}\p{N}]+/u, ""), go: "#" + x.id, active: false, onClick: () => window.mkPaneFocus.open(x.id) }); });
    pageSubs.forEach(x => { const sp = splitEmoji(x.label); if (sp.icon && sp.label) { x.icon = sp.icon; x.label = sp.label; } });
    /* remember this page's parts: from any other page the same list is shown under its main link (a seller's list differs from a doctor's) */
    if (pageSubs.length && !/^admin/.test(page)) {
      try { localStorage.setItem("mk-side-last-" + page, JSON.stringify(pageSubs.filter(x => x.go && !/^(Active|Archive)\b/.test(x.label)).map(x => [page + x.go, x.label.replace(/\s*\(?\d+\)?$/, ""), x.icon]))); } catch { /* storage may be blocked */ }
    }
    let usedSubs = false;
    const group = document.createElement("div"); group.className = "side-group side-main";
    links.forEach(a => {
      const label = plain(a).replace(/\s+/g, " ").trim(); if (!label) return;
      const href = a.getAttribute("href") || "#";
      const proxy = href === "#" || a.id === "admin-logout";
      const active = a.classList.contains("active") || (!proxy && !/#/.test(href) && href === page);
      const logout = /log ?out/i.test(label) || a.id === "admin-logout";
      const el = item(iconFor(href, label), label, { href, active: active || (SUBS[href] && SUBS[href].some(x => x[0] === page)), onClick: proxy ? () => a.click() : null, extraClass: logout ? "side-logout" : "" });
      if (logout) { group.appendChild(el); return; }
      /* EVERY main link is built the same way as Services: the label opens the page, a square button folds / opens the pages or parts under it */
      let list = null, open = false, memory = "";
      if (SUBS[href]) {
        list = [];
        SUBS[href].forEach(([file, name, icon]) => {
          list.push({ icon, label: name, href: file, active: file === page });
          /* the page you are on shows its own parts right under it (a new booking, my bookings) */
          if (file === page && STATIC_SUBS[file]) STATIC_SUBS[file].forEach(([f2, n2, i2]) => list.push({ icon: i2, label: n2, href: f2, active: false }));
        });
        open = SUBS[href].some(x => x[0] === page);
      } else if (/^admin/.test(page) && /^(dashboard|statistics)$/i.test(label.replace(/^[^\p{L}]+/u, ""))) {
        /* the owner's two items list the same parts on every owner page, so the menu never changes shape */
        const isStats = /statistics/i.test(label);
        list = STATIC_SUBS[isStats ? "admin-stats.html" : "admin.html"].map(([file, name, icon]) => {
          const here = file.startsWith(page + "#");
          const target = here ? document.getElementById(file.split("#")[1]) : null;
          /* on the owner's page a click opens that part alone (admin-focus.js listens to the address); elsewhere it scrolls to the part */
          const open1 = () => { const id = file.split("#")[1]; if (window.mkAdminFocus && page === "admin.html") { if (location.hash === "#" + id) window.mkAdminFocus.apply(); else location.hash = id; } else if (window.mkPaneFocus && window.mkPaneFocus.has(id)) { if (location.hash === "#" + id) window.mkPaneFocus.apply(true); else location.hash = id; } else if (target) target.scrollIntoView({ behavior: "smooth", block: "start" }); };
          return { icon, label: name, href: file, onClick: here && /^[^#]+#.+-panel$/.test(file) && !/#messages-panel$/.test(file) ? open1 : (target ? () => target.scrollIntoView({ behavior: "smooth", block: "start" }) : null) };
        });
        open = isStats ? page === "admin-stats.html" : page === "admin.html";
        usedSubs = true;
      } else if (active && !proxy && !usedSubs && pageSubs.length) {
        usedSubs = true; list = pageSubs; memory = "mk-side-parent-" + page; open = true;
        try { if (localStorage.getItem(memory) === "1") open = false; } catch { /* storage may be blocked */ }
      } else {
        const key = href.replace(/^index\.html(?=#)/, "");
        let known = STATIC_SUBS[key];
        if (!known) { try { known = JSON.parse(localStorage.getItem("mk-side-last-" + key) || "null"); } catch { known = null; } }
        list = (Array.isArray(known) ? known : []).map(([file, name, icon]) => ({ icon, label: name, href: file }));
        if (!list.length) list = [{ icon: "➡️", label: "Open this page", href: proxy ? "#" : href, onClick: proxy ? () => a.click() : null }];
      }
      /* the row itself opens the branches, so the page it leads to is the first line under it (unless you are already on it) */
      /* a link with nothing under it is a plain link: no arrow that only opens "Open this page" */
      if (list.length === 1 && list[0].label === "Open this page") { group.appendChild(el); return; }
      /* when the first line under it already opens the same page (a part of it), "Open this page" would only repeat it */
      const samePage = list[0] && String(list[0].href || "").split("#")[0] === href.split("#")[0];
      if (!proxy && !active && list[0] && list[0].href !== href && !samePage) list = [{ icon: "➡️", label: "Open this page", href }, ...list];
      const stateKey = label.toLowerCase();
      if (stateKey in openState) open = openState[stateKey] === true;
      const wrap = document.createElement("div"); wrap.className = "side-parent";
      const tog = document.createElement("button"); tog.type = "button"; tog.className = "side-toggle-sub"; tog.setAttribute("aria-label", "Show what is under " + label);
      tog.innerHTML = '<span aria-hidden="true">▾</span>';
      el.appendChild(tog);
      const subs = document.createElement("div"); subs.className = "side-subs";
      list.forEach(x => subs.appendChild(item(x.icon, x.label, { href: x.href || "#", active: x.active, onClick: x.onClick || tabClick(x.href, page), extraClass: "side-subitem", go: x.go || "" })));
      const paint = on => { wrap.classList.toggle("open", on); tog.setAttribute("aria-expanded", String(on)); };
      paint(open);
      tog.addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation();
        const on = !wrap.classList.contains("open"); paint(on);
        openState[stateKey] = on; saveState();
      });
      /* tapping the row (icon or name) shows or hides everything under it: no need to go anywhere to see the branches */
      el.addEventListener("click", event => { if (event.target.closest(".side-toggle-sub")) return; event.preventDefault(); event.stopImmediatePropagation(); tog.click(); }, true);
      wrap.appendChild(el); wrap.appendChild(subs);
      group.appendChild(wrap);
    });
    side.appendChild(group);

    /* a page whose own link is not in the menu: its parts stay in a folded panel */
    if (!usedSubs && pageSubs.length) {
      const { g, list } = subGroup("This page", "page");
      pageSubs.forEach(x => list.appendChild(item(x.icon, x.label, { active: x.active, onClick: x.onClick, go: x.go || "" })));
      side.appendChild(g);
    }
    side.scrollTop = keepScroll;
    if (picker) { const holder = document.createElement("div"); holder.className = "side-lang"; holder.appendChild(picker); side.appendChild(holder); }
  }

  /* arriving from another page's menu: ?tab=X opens that tab, #id scrolls to that part (they may appear a moment after the data loads) */
  function arrive() {
    const tab = new URLSearchParams(location.search).get("tab");
    const id = decodeURIComponent(location.hash.slice(1));
    let tries = 0;
    const timerId = setInterval(() => {
      tries += 1;
      let done = !tab && !id;
      if (tab) {
        const b = [...document.querySelectorAll(".role-tabs button")].find(x => x.dataset.tab === tab && !x.closest("[hidden]"));
        if (b) { b.click(); done = true; }
      } else if (id) {
        const el = document.getElementById(id);
        if (el && !el.closest("[hidden]") && el.getBoundingClientRect) { el.scrollIntoView({ block: "start" }); done = true; }
        else if (!el && tries > 2) done = true;
      }
      if (done || tries > 25) clearInterval(timerId);
    }, 300);
  }


  /* the parts of a long page: each part gets a clear banner with the same icon and title as its line in the menu, a visible gap and a frame,
     the menu line of the part you are reading is lit while you scroll, and a part flashes when you open it from the menu */
  const SECTION_PAGES = /^(admin|admin-stats|merchant|supervisor|dean|courier|account|wallet|doctors|barbers|hotels|travel|taxi|trades|board)\.html$/;
  let spyBound = false, spyLinks = [];
  function syncSections() {
    const file = location.pathname.split("/").pop() || "index.html";
    if (!SECTION_PAGES.test(file) || !side) return;
    spyLinks = [];
    side.querySelectorAll("a.side-item").forEach(a => {
      const go = a.dataset.go || "";
      const icon = (a.querySelector(".side-icon") || {}).textContent || "🔹", label = ((a.querySelector(".side-label") || {}).textContent || "").trim();
      /* a tab of the page: the pane that is open gets a banner with the name of the tab */
      const banner = pane => {
        if (!pane || pane.hidden) return;
        if (!pane.classList.contains("sec-block")) pane.classList.add("sec-block");
        let b = pane.querySelector(":scope > .pane-banner");
        if (!b) { b = document.createElement("h2"); b.className = "sec-title pane-banner"; pane.insertBefore(b, pane.firstChild); }
        if (b.dataset.icon !== icon) b.dataset.icon = icon;
        if (b.textContent !== label) b.textContent = label;
        spyLinks.push({ a, target: pane });
      };
      if (go.startsWith("?tab=")) { if (a.classList.contains("active")) banner(document.getElementById("pane-" + go.slice(5))); return; }
      if (go.startsWith("#") && !document.getElementById(go.slice(1)) && document.getElementById("tab-" + go.slice(1))) { if (a.classList.contains("active")) banner(document.getElementById("tab-" + go.slice(1))); return; }
      const raw = go.startsWith("#") ? go : a.getAttribute("href") || "";
      const m = raw.match(/^([^#]*)#(.+)$/);
      if (!m || (m[1] && m[1] !== file)) return;
      const target = document.getElementById(decodeURIComponent(m[2]));
      if (!target || target.closest("[hidden]") || target === document.body) return;
      if (!target.matches("section, .panel, .admin-panel, .role-pane, article, div")) return;
      if (!target.classList.contains("sec-block")) target.classList.add("sec-block");
      const h = target.querySelector("h2, h3");
      if (h && !h.classList.contains("sec-title")) { h.classList.add("sec-title"); h.dataset.icon = (a.querySelector(".side-icon") || {}).textContent || "🔹"; }
      spyLinks.push({ a, target });
    });
    if (!spyBound) {
      spyBound = true;
      let queued = false;
      const spy = () => {
        queued = false;
        let cur = null;
        for (const x of spyLinks) { const r = x.target.getBoundingClientRect(); if (r.height && r.top <= 140) cur = x; }
        spyLinks.forEach(x => { const on = x === cur; if (x.a.classList.contains("sec-on") !== on) x.a.classList.toggle("sec-on", on); });
        if (cur && side && !window.mkAdminFocus) { const sr = side.getBoundingClientRect(), ar = cur.a.getBoundingClientRect(); if (ar.top < sr.top + 60) side.scrollTop -= sr.top + 60 - ar.top; else if (ar.bottom > sr.bottom - 20) side.scrollTop += ar.bottom - sr.bottom + 20; }
      };
      window.addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(spy); } }, { passive: true });
      document.addEventListener("click", event => {
        const a = event.target.closest && event.target.closest("a.side-item"); if (!a) return;
        const hit = spyLinks.find(x => x.a === a); if (!hit) return;
        setTimeout(() => { hit.target.classList.remove("sec-flash"); void hit.target.offsetWidth; hit.target.classList.add("sec-flash"); }, 350);
      });
      setTimeout(spy, 400);
    }
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(() => { build(); syncSections(); }, 30); }
  /* Changes in the page ask for a rebuild through watch(). Safety net: if the menu is rebuilt many times in a short while because
     something keeps touching the page (a loop), page changes stop asking for rebuilds for a few seconds. A menu that is rebuilt
     again and again loses the clicks of the person (Log out had to be pressed many times). */
  const buildTimes = [];
  let muteUntil = 0;
  function watch() {
    const now = Date.now();
    if (now < muteUntil) return;
    while (buildTimes.length && now - buildTimes[0] > 2000) buildTimes.shift();
    if (buildTimes.length >= 8) { muteUntil = now + 10000; try { console.warn("Menu: too many rebuilds, paused for 10 s"); } catch (e) { /* ignore */ } return; }
    schedule();
  }
  function start() { build(); syncSections(); setTimeout(() => { build(); syncSections(); }, 300); setTimeout(syncSections, 1500); arrive(); watchAuth(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  document.addEventListener("mk-language", schedule);
})();
