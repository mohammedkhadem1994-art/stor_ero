"use strict";

/* Service worker: lets the store be installed as an app and open instantly.
   Strategy: ALWAYS try the network first (so new versions appear immediately),
   and fall back to the saved copy only when offline. Firebase, PayPal and other sites are never touched. */

const CACHE = "mk-store-v260";
const SHELL = [
  "index.html", "checkout.html", "login.html", "register.html", "account.html", "invoice.html",
  "partner.html", "accounts.html", "guide.html", "merchant.html", "courier.html", "privacy.html", "qrcode.js", "jsqr.js", "reviews.js", "supervisor.html", "supervisor.js", "dean.html", "dean.js", "chat.js", "share.js", "partner.js", "merchant.js", "courier.js",
  "home.js", "pane-focus.js", "report-templates.js", "img/promo-plumber.webp", "img/promo-electrician.webp", "img/promo-painter.webp", "img/cat-restaurants.svg", "img/cat-perfume.svg", "img/cat-phones.svg", "img/cat-watches.svg", "img/cat-fashion.svg", "img/cat-electronics.svg", "img/cat-shops.svg", "img/cat-gifts.svg",
  "doctors.html", "barbers.html", "hotels.html", "hotels.js", "rooms.js", "travel.js", "trips.js", "seatmap.js", "travel.html", "taxi.html", "services.html", "services.js", "games.js", "doctors.js", "verify.html", "verify.js", "styles.js", "doctor.js", "look.js", "schedule.js", "edition.js", "styles.css", "sidebar.js", "tables.js", "shares.js", "records.js", "sales.js", "coupon.js", "collab.js", "adcard.js", "trades.html", "trades.js", "i18n.js", "i18n-data.js", "erase-backup.js", "store.js", "app.js", "auth.js", "account.js", "invoice.js",
  "push-kinds.js", "paycode.js", "follow.js", "opening.js", "adspots.js", "monthly.js", "push-i18n.js", "i18n-data.js", "scoped-stats.js", "trusted.js", "payment-config.js", "firebase-config.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(SHELL.map(url => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE && key !== "mk-lang").map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;     /* never intercept Firebase / PayPal / CDNs */
  if (url.pathname.endsWith("/admin.html") || url.pathname.endsWith("/admin.js") || url.pathname.endsWith("/admin-extra.js")) return; /* admin: always live */

  event.respondWith(
    fetch(request, { cache: "no-cache" })
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then(hit => hit || caches.match("index.html")))
  );
});

/* ---------- Push notifications (Firebase Cloud Messaging) ----------
   The server sends data-only messages; this shows them even when the app is closed. */
try {
  importScripts(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js",
    "firebase-config.js",
    "push-kinds.js",
    "push-i18n.js"
  );
  firebase.initializeApp(FIREBASE_CONFIG);
  firebase.messaging().onBackgroundMessage(payload => {
    const data = (payload && payload.data) || {};
    /* each kind of event has its own icon, vibration and tag; urgent ones stay on screen until they are read */
    return pushT.lang().then(lg => {
    const shown = Object.assign({}, data, { title: data.title ? pushT.tr(data.title, lg) : data.title });
    const look = pushLook(shown);
    return self.registration.showNotification(look.title, {
      body: pushT.body(data.body || "", lg),
      icon: "icon-192.png",
      badge: "icon-192.png",
      tag: look.tag,
      vibrate: look.vibrate,
      requireInteraction: look.urgent === true,
      renotify: true,
      data: { link: data.link || "index.html", type: data.type || "event" }
    });
    });
  });
} catch (error) {
  /* offline or blocked: the store itself keeps working without push */
}

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "index.html";
  const url = new URL(link, self.registration.scope).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(windows => {
      for (const client of windows) {
        if (client.url.startsWith(self.registration.scope) && "focus" in client) {
          return client.navigate(url).then(() => client.focus()).catch(() => client.focus());
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
