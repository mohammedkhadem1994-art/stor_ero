"use strict";

/* Shared helpers: Firebase (accounts + database), cart, invoices, UI.
   Load the Firebase scripts and firebase-config.js before this file. */

/* ---------- Business settings (shown on invoices) ----------
   Fill in the empty fields with your real details. Empty fields are not printed. */
const BUSINESS = {
  name: "Plazavo",
  tagline: "Independent digital products",
  address: "Europe",   // e.g. "Street 1\n12345 City\nCountry"
  email: "contact@your-domain.example",     // public contact email for invoices
  website: "your-domain.example",
  taxId: ""      // VAT / tax number
};

/* Share of the price that is VAT, e.g. 0.19 for 19 %. Prices are VAT-inclusive. 0 = no VAT. */
const TAX_RATE = 0;

/* While true, orders are marked as demo orders because no real payment is taken. */
const DEMO_MODE = true;

/* All payment methods and the condition that switches each one on (details: payment-config.js). */
/* A method is on when payment-config.js says { enabled: true }, or (old style) has its details filled in. */
const flag = key => Boolean(PAYMENT[key] && PAYMENT[key].enabled);

const METHOD_DEFS = [
  { id: "paypal", label: "PayPal, card or wallet", name: "PayPal", on: () => Boolean(PAYMENT.paypal.clientId) },
  { id: "paypalme", label: "PayPal (PayPal.me)", name: "PayPal.me", on: () => flag("paypalme") },
  { id: "revolut", label: "Revolut", name: "Revolut", on: () => flag("revolut") || Boolean(PAYMENT.revolut.link) },
  { id: "postepay", label: "PostePay / Poste Italiane", name: "PostePay", on: () => flag("postepay") || Boolean(PAYMENT.postepay.iban || PAYMENT.postepay.cardNumber) },
  { id: "alipay", label: "Alipay", name: "Alipay", on: () => flag("alipay") || Boolean(PAYMENT.alipay && (PAYMENT.alipay.account || PAYMENT.alipay.qr || PAYMENT.alipay.link)) },
  { id: "wise", label: "Wise", name: "Wise", on: () => flag("wise") || Boolean(PAYMENT.wise && (PAYMENT.wise.link || PAYMENT.wise.iban)) },
  { id: "crypto", label: "Crypto", name: "Crypto", on: () => flag("crypto") || Boolean(PAYMENT.crypto && PAYMENT.crypto.address) },
  { id: "other", label: "", name: "Other", on: () => Boolean(PAYMENT.other && PAYMENT.other.label && (flag("other") || PAYMENT.other.details)) },
  { id: "bank", label: "Bank transfer (SEPA)", name: "Bank transfer", on: () => flag("bank") || Boolean(PAYMENT.bank.iban) }
];

function methodLabel(def) {
  if (def.id === "other") return String(PAYMENT.other.label).slice(0, 40);
  if (def.id === "crypto") return `Crypto (${PAYMENT.crypto.coin || "USDT"})`;
  return def.label;
}

function paymentMethods() {
  const list = METHOD_DEFS.filter(def => def.on()).map(def => ({ id: def.id, label: methodLabel(def) }));
  if (DEMO_MODE && !MK_EDITION.dz) list.push({ id: "demo", label: "Demo order (no real payment)" });
  return list;
}

/* Methods the owner has not filled in yet (shown to the admin only). */
function missingPaymentMethods() {
  return METHOD_DEFS.filter(def => !def.on()).map(def => def.name);
}

/* Calls the payment server (Firebase Cloud Functions). */
const FUNCTIONS_REGION = "europe-west1";

/* saves a backup (PDF + JSON, named day-month-year_reference_where) before an erase; false = cancelled, so nothing is erased */
window.mkEraseBackupRun = async function (opts) {
  if (!window.mkEraseBackup) await new Promise((resolve, reject) => { const s = document.createElement("script"); s.src = "erase-backup.js"; s.onload = resolve; s.onerror = () => reject(new Error("The backup tool could not be loaded.")); document.head.appendChild(s); });
  return window.mkEraseBackup(opts);
};

async function callFn(name, data) {
  if (window.MK_VIEW_AS) throw new Error("View only: you are looking at this page as the administrator.");
  if (!initBackend()) throw new Error("The store is not connected.");
  try {
    const result = await firebase.app().functions(FUNCTIONS_REGION).httpsCallable(name)(data);
    return result.data;
  } catch (error) {
    const code = String(error && error.code || "");
    /* only a raw SDK message means "the function is not there"; a message written by our server is shown as it is */
    const raw = /^(NOT_FOUND|UNAVAILABLE|INTERNAL|UNKNOWN|Failed to fetch|Load failed|NetworkError.*)$/i.test(String(error && error.message || "").trim()) || /not-found|unavailable/.test(code);
    if (/not-found|unavailable|internal|unknown/.test(code) && raw) {
      error.message = "The payment server is not available. The owner must deploy the functions (see the setup guide).";
    }
    throw error;
  }
}

/* A seller whose debt to the site reaches this amount is paused (the server enforces it). */
const DEBT_LIMIT = MK_EDITION.dz ? 50000 : 1000;

/* The site's fee, added on top of the price a seller types (keep in sync with functions/core.js).
   Each kind of account has a rate (0 to 25 %), an account can have its own, and the first months are free. */
const MK_FEE_KINDS = ["shop", "restaurant", "pharmacy", "doctor", "agency", "taxi", "barber", "hotel"];
const MK_FEE_NAMES = { shop: "Seller", restaurant: "Restaurant", pharmacy: "Pharmacy", doctor: "Doctor", agency: "Travel agency", taxi: "Taxi driver", barber: "Barber", hotel: "Hotel" };
const MK_SHOP_KINDS = ["shop", "restaurant", "pharmacy"];
const mkFeePercent = value => { const n = Number(value); return value !== null && value !== undefined && value !== "" && Number.isFinite(n) && n >= 0 && n <= 25 ? Math.round(n * 100) / 100 : null; };
function mkFeePlan(planDoc, legacyDoc) {
  const legacy = legacyDoc && legacyDoc.shop !== undefined ? mkFeePercent(legacyDoc.shop) : null;
  const base = legacy === null ? 10 : legacy;
  const rates = {};
  MK_FEE_KINDS.forEach(k => { const own = planDoc && planDoc.rates ? mkFeePercent(planDoc.rates[k]) : null; rates[k] = own !== null ? own : (MK_SHOP_KINDS.includes(k) ? base : 0); });
  const months = planDoc && planDoc.freeMonths !== undefined ? Math.floor(Number(planDoc.freeMonths)) : 3;
  return { rates, booking: mkBookingPlan(planDoc), freeMonths: Number.isFinite(months) && months >= 0 && months <= 24 ? months : 3 };
}
/* Bookings pay a fixed amount per finished booking: one when booked in the app, one when the provider added the person himself (keep in sync with functions/core.js). */
const MK_BOOK_KINDS = ["doctor", "agency", "taxi", "barber", "hotel"];
const mkBookingAmount = value => { const n = Number(value); return value !== null && value !== undefined && value !== "" && Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n * 100) / 100 : null; };
function mkBookingPlan(planDoc) {
  const out = {};
  MK_BOOK_KINDS.forEach(k => { const b = planDoc && planDoc.booking && planDoc.booking[k] ? planDoc.booking[k] : {}; const a = mkBookingAmount(b.app), w = mkBookingAmount(b.walkin); out[k] = { app: a === null ? 0 : a, walkin: w === null ? 0 : w }; });
  return out;
}
function mkEffectiveBooking(plan, account, nowMs = Date.now()) {
  const kind = account && MK_BOOK_KINDS.includes(account.kind) ? account.kind : null;
  if (!kind) return null;
  const own = account.bookingFee || {};
  const ownApp = mkBookingAmount(own.app), ownWalk = mkBookingAmount(own.walkin);
  const stopped = account.feeRate === 0 || account.feeRate === "0";
  const until = plan.freeMonths > 0 ? mkFreeUntil(account.createdAt, plan.freeMonths) : null;
  const free = until !== null && nowMs < until;
  const row = plan.booking && plan.booking[kind] ? plan.booking[kind] : { app: 0, walkin: 0 };
  const pick = (o, base) => (o !== null ? o : stopped || free ? 0 : base);
  return { kind, app: pick(ownApp, row.app), walkin: pick(ownWalk, row.walkin), source: ownApp !== null || ownWalk !== null ? "account" : stopped ? "stopped" : free ? "free" : "kind", until: free ? until : null, afterApp: row.app, afterWalkin: row.walkin };
}
function mkFreeUntil(createdAt, months) {
  const start = new Date(createdAt);
  if (!createdAt || Number.isNaN(start.getTime())) return null;
  start.setUTCMonth(start.getUTCMonth() + months);
  return start.getTime();
}
function mkEffectiveFee(plan, account, nowMs = Date.now()) {
  const kind = account && MK_FEE_KINDS.includes(account.kind) ? account.kind : "shop";
  const own = account ? mkFeePercent(account.feeRate) : null;
  if (own !== null) return { percent: own, source: "account", kind };
  const until = plan.freeMonths > 0 && account ? mkFreeUntil(account.createdAt, plan.freeMonths) : null;
  if (until !== null && nowMs < until) return { percent: 0, source: "free", until, kind };
  return { percent: plan.rates[kind], source: "kind", kind };
}
/* Which ways of paying a seller / provider takes : shown to the customer before he orders. A way that is switched off is grey and crossed. */
function payFlagsOf(x) { return { cash: !x || x.acceptsCash !== false, credit: !x || x.acceptsCredit !== false }; }
function payChipsHTML(flags) {
  if (!MK_EDITION.dz) return "";
  const defs = [["cash", "💵", "Cash"], ["credit", "💳", "Account credit"]];
  return `<span class="pay-chips" role="list" aria-label="Payment ways">${defs.map(([k, icon, label]) => `<span role="listitem" class="pay-chip ${flags[k] ? "on" : "off"}" title="${flags[k] ? "Accepted" : "Not accepted"}">${icon} ${label}${flags[k] ? "" : " ✕"}</span>`).join("")}</span>`;
}
/* the fee of a booking, in words, for the provider */
function bookingFeeText(b) { return b ? `${formatPrice(b.app)} per booking made in the app · ${formatPrice(b.walkin)} per person you add yourself` : ""; }
let STORE_FEE_RATE = 0.10;
let STORE_FEE_INFO = null, STORE_FEE_PLAN = null;
const publicPriceOf = base => Math.round(Number(base) * (1 + STORE_FEE_RATE) * 100) / 100;
async function loadFeePlanDocs() {
  const [plan, legacy] = await Promise.all([db.collection("settings").doc("feePlan").get().catch(() => null), db.collection("settings").doc("providerFees").get().catch(() => null)]);
  return mkFeePlan(plan && plan.exists ? plan.data() : null, legacy && legacy.exists ? legacy.data() : null);
}
async function loadFeeRate(account) {
  try {
    const plan = await loadFeePlanDocs();
    STORE_FEE_PLAN = plan;
    STORE_FEE_INFO = mkEffectiveFee(plan, account || { kind: "shop" });
    STORE_FEE_INFO.booking = mkEffectiveBooking(plan, account || { kind: "shop" });
    STORE_FEE_RATE = STORE_FEE_INFO.percent / 100;
  } catch { /* the default stays */ }
  return STORE_FEE_RATE;
}

/* The owner's debt limits (settings/debt): one default and optional own limits per seller. */
let DEBT_RULE = { limit: DEBT_LIMIT, sellers: {} };
async function loadDebtRule() {
  try {
    const snap = await db.collection("settings").doc("debt").get();
    const data = snap.exists ? snap.data() : {};
    DEBT_RULE = { limit: Number(data.limit) > 0 ? Number(data.limit) : DEBT_LIMIT, sellers: data.sellers || {} };
  } catch (error) { console.error(error); }
  return DEBT_RULE;
}
function debtLimitOf(id) {
  const own = Number((DEBT_RULE.sellers || {})[id]);
  return own > 0 ? own : DEBT_RULE.limit;
}

/* Switches the owner sets in the admin page (settings/features). KEEP IN SYNC with functions/core.js. */
/* Delivery speeds (keep in sync with functions/core.js). The delivery partners set their own price for each. */
const SPEEDS = {
  fast: { label: "Express", hours: "1 to 2 hours" },
  medium: { label: "Standard", hours: "6 to 10 hours" },
  slow: { label: "Economy", hours: "up to 3 days" }
};
const MAX_RATE = MK_EDITION.dz ? 100000 : 500;
const DEFAULT_RATES = MK_EDITION.dz ? { fast: 600, medium: 400, slow: 250 } : { fast: 5, medium: 3, slow: 1.5 };
function courierRate(courier, speed) {
  const raw = courier && courier.rates ? courier.rates[speed] : undefined;
  if (raw === undefined || raw === null || raw === "") return DEFAULT_RATES[speed];
  const number = Number(raw);
  return Number.isFinite(number) && number >= 0 && number <= MAX_RATE ? Math.round(number * 100) / 100 : DEFAULT_RATES[speed];
}
/* Can this delivery partner carry this weight (kg)? No limit set = yes. */
function courierCanCarry(courier, kg) {
  const max = courier ? Number(courier.maxWeight) : 0;
  return !(max > 0) || !(Number(kg) > 0) || Number(kg) <= max + 0.0001;
}
/* Size (cm) and chargeable weight: the larger of the real weight and length x width x height / 5000, line by line (keep in sync with functions/core.js). */
const mkDim = v => { const n = Number(v); return Number.isFinite(n) && n > 0 && n <= 500 ? Math.round(n * 10) / 10 : 0; };
const mkLineKg = it => Math.max(Number(it && it.weightKg) > 0 ? Number(it.weightKg) : 0, mkDim(it && it.lengthCm) * mkDim(it && it.widthCm) * mkDim(it && it.heightCm) / 5000);
const mkChargeable = items => Math.round((items || []).reduce((a, it) => a + mkLineKg(it) * (Number(it && it.quantity) || 0), 0) * 1000) / 1000;
/* What this delivery partner asks for a speed and a chargeable weight: his price covers includedKg (default 5), then perKg for every extra kilo. */
function courierFee(courier, speed, charge = 0) {
  const rate = courierRate(courier, speed);
  if (!(rate > 0)) return 0;
  const per = Number(courier && courier.perKg) || 0;
  const included = courier && Number.isFinite(Number(courier.includedKg)) && Number(courier.includedKg) >= 0 ? Number(courier.includedKg) : 5;
  return Math.round((rate + (per > 0 && charge > 0 ? Math.max(0, charge - included) * per : 0)) * 100) / 100;
}
function courierServes(courier, speed, fee, kg = 0, charge = kg) {
  const price = courierFee(courier, speed, charge);
  return price > 0 && price <= Number(fee) + 0.001 && courierCanCarry(courier, kg);
}
/* "Express · 1 to 2 hours" for an order that was sold with a speed. */
function speedText(order) {
  return order && order.delivery ? `${order.delivery.label} · ${order.delivery.hours}` : "";
}

const FEATURE_DEFAULTS = {
  customer: { registrationOpen: true, requirePhone: true, requireId: true, requireLocation: false, canOrder: true },
  merchant: { applicationsOpen: true, requireId: true, requireLocation: false, requireProductPhoto: false, canAddProducts: true, directPayments: true, debtPause: false, autoDebtFromCredit: false },
  courier: { applicationsOpen: true, requireId: true, requireLocation: false },
  supervisor: { requireId: true, canInvite: true },
  global: { cashOnDelivery: true, creditPay: true, baridimobPay: true, qrDelivery: true, chat: true, showCollabMoney: true, autoDebtFromCredit: true }
};

function mergeFeatures(raw) {
  const out = {};
  for (const group of Object.keys(FEATURE_DEFAULTS)) {
    out[group] = { ...FEATURE_DEFAULTS[group] };
    const stored = raw && raw[group];
    if (stored && typeof stored === "object") {
      for (const key of Object.keys(FEATURE_DEFAULTS[group])) if (typeof stored[key] === "boolean") out[group][key] = stored[key];
    }
  }
  return out;
}

let featuresPromise = null;
/* Reads the switches once per page (the defaults apply if they cannot be read). */
function getFeatures(force = false) {
  if (!featuresPromise || force) {
    featuresPromise = (async () => {
      try {
        if (!initBackend()) return mergeFeatures({});
        const snap = await db.collection("settings").doc("features").get();
        return mergeFeatures(snap.exists ? snap.data() : {});
      } catch {
        return mergeFeatures({});
      }
    })();
  }
  return featuresPromise;
}

const CART_STORAGE_KEY = "plazavoCart";

const STARTER_PRODUCTS = [
  {
    id: "robotics-toolkit",
    name: "Robotics Starter Toolkit",
    price: 19,
    category: "Robotics",
    description: "A practical digital resource for getting started with robotics projects.",
    image: "",
    video: "",
    visible: true
  },
  {
    id: "uav-planner",
    name: "UAV Mission Planner",
    price: 29,
    category: "UAVs",
    description: "A resource for planning and organizing UAV inspection missions.",
    image: "",
    video: "",
    visible: true
  },
  {
    id: "mechatronics-guide",
    name: "Mechatronics Design Guide",
    price: 12,
    category: "Mechatronics",
    description: "A guide covering core concepts in mechatronics system design.",
    image: "",
    video: "",
    visible: true
  }
];

/* ---------- Generic helpers ---------- */

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function multiline(value = "") {
  return escapeHTML(value).replace(/\r?\n/g, "<br>");
}

/* Only allow http(s) URLs in src attributes. */
function safeUrl(value = "") {
  try {
    const url = new URL(String(value).trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

/* European edition: dollars per 1 euro, set by the owner (settings/currency). Cached so prices can show dollars straight away. */
let USD_RATE = 0, GBP_RATE = 0;   /* GBP_RATE: pounds sterling per 1 euro, set by the owner too */
try { USD_RATE = Number(localStorage.getItem("mk-usd-rate")) || 0; GBP_RATE = Number(localStorage.getItem("mk-gbp-rate")) || 0; } catch { /* private mode */ }
async function loadUsdRate() {
  if (MK_EDITION.dz) return 0;
  try {
    const snap = await db.collection("settings").doc("currency").get();
    USD_RATE = snap.exists && Number(snap.data().usdRate) > 0 ? Number(snap.data().usdRate) : 0;
    GBP_RATE = snap.exists && Number(snap.data().gbpRate) > 0 ? Number(snap.data().gbpRate) : 0;
    try { localStorage.setItem("mk-usd-rate", String(USD_RATE)); localStorage.setItem("mk-gbp-rate", String(GBP_RATE)); } catch { /* ignore */ }
  } catch (error) { console.error(error); }
  return USD_RATE;
}
const usdOf = value => Math.round((Number(value) || 0) * USD_RATE * 100) / 100;
const gbpOf = value => Math.round((Number(value) || 0) * GBP_RATE * 100) / 100;
function formatPrice(value) {
    const euro = `€${(Number(value) || 0).toFixed(2)}`;
  return euro + (USD_RATE > 0 ? ` · $${usdOf(value).toFixed(2)}` : "") + (GBP_RATE > 0 ? ` · £${gbpOf(value).toFixed(2)}` : "");
}

function formatDate(iso, withTime = false) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", withTime
    ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" });
}

function randomHex(bytes = 4) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, "0")).join("");
}

function showToast(message, type = "info") {
  let box = document.getElementById("toast-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast-box";
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
    document.body.appendChild(box);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  box.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("hide");
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

/* ---------- Firebase ---------- */

let auth = null;
let db = null;

function backendConfigured() {
  return typeof firebase !== "undefined"
    && typeof FIREBASE_CONFIG !== "undefined"
    && Boolean(FIREBASE_CONFIG.apiKey)
    && !/^PASTE/.test(FIREBASE_CONFIG.apiKey);
}

function initBackend() {
  if (auth && db) return true;
  if (!backendConfigured()) return false;

  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    auth = firebase.auth();
    db = firebase.firestore();
    if (!MK_EDITION.dz) setTimeout(loadUsdRate, 0);
    return true;
  } catch (error) {
    console.error("Firebase could not start:", error);
    return false;
  }
}

function showSetupNotice() {
  if (document.getElementById("setup-notice")) return;
  const notice = document.createElement("div");
  notice.id = "setup-notice";
  notice.className = "setup-notice";
  notice.setAttribute("role", "alert");
  notice.innerHTML = "<strong>The store backend is not connected yet.</strong> " +
    "Add your Firebase settings to <code>firebase-config.js</code> (see the setup steps), then reload.";
  document.body.insertBefore(notice, document.body.firstChild);
}

function authErrorMessage(error) {
  const messages = {
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/user-not-found": "Incorrect email or password.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/email-already-in-use": "An account with this email already exists. Please sign in.",
    "auth/weak-password": "Use at least 8 characters for your password.",
    "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
    "auth/network-request-failed": "Network error. Please check your connection.",
    "auth/requires-recent-login": "For your security, please sign in again and retry.",
    "auth/operation-not-allowed": "Email/password sign-in is not enabled in Firebase yet.",
    "auth/unauthorized-domain": "This website address is not authorised in Firebase (Authentication → Settings → Authorized domains).",
    "permission-denied": "You do not have permission to do this."
  };
  if (/^messaging\//.test(String(error && error.code))) return "Notifications could not be set up on this device. Everything else works normally.";
  return messages[error && error.code] || (error && error.message) || "Something went wrong. Please try again.";
}

/* Resolves once with { user, isAdmin, merchant, courier, supervisor }.
   isAdmin    = a document exists in /admins/{uid}.
   merchant / courier / supervisor = that person's own document (any status), or null. */
let authPromise = null;

async function safeGet(collection, uid) {
  try {
    const snap = await db.collection(collection).doc(uid).get();
    return snap.exists ? { ...snap.data(), id: snap.id } : null;
  } catch {
    return null;
  }
}

function getAuthState() {
  if (authPromise) return authPromise;

  authPromise = new Promise(resolve => {
    if (!initBackend()) return resolve({ user: null, isAdmin: false, merchant: null, courier: null, supervisor: null, dean: null });

    const stop = auth.onAuthStateChanged(async user => {
      if (typeof stop === "function") stop();
      let isAdmin = false;
      let merchant = null;
      let courier = null;
      let supervisor = null;
      let dean = null;
      if (user) {
        [isAdmin, merchant, courier, supervisor, dean] = await Promise.all([
          safeGet("admins", user.uid).then(Boolean),
          safeGet("merchants", user.uid),
          safeGet("couriers", user.uid),
          safeGet("supervisors", user.uid),
          safeGet("deans", user.uid)
        ]);
      }
      /* a locked supervisor or dean: his tasks moved up one level; his pages explain it */
      let locked = "";
      if (supervisor && supervisor.locked === true) { locked = "supervisor"; supervisor = null; }
      if (dean && dean.locked === true) { locked = locked || "dean"; dean = null; }
      /* The owner can preview the SHAPE of a page (an empty sample of it). No real account is opened or read: no customer's or partner's data is ever shown. */
      const asKind = new URLSearchParams(window.location.search).get("as") || "";
      const role = document.body && document.body.dataset.requireRole || "";
      const KINDS = { shop: "merchant", restaurant: "merchant", pharmacy: "merchant", doctor: "merchant", agency: "merchant", taxi: "merchant", barber: "merchant", hotel: "merchant", courier: "courier", supervisor: "supervisor", dean: "dean", customer: "buyer" };
      if (isAdmin && KINDS[asKind] === role) {
        const sample = { id: "preview-sample", uid: "preview-sample", status: "approved", businessName: "Sample", fullName: "Sample", email: "", kind: asKind === "shop" ? "shop" : asKind, createdAt: new Date().toISOString() };
        window.MK_VIEW_AS = { kind: asKind, name: asKind };
        /* sample pictures (cover, faint background, profile) so the preview shows the finished look */
        const demoKind = KINDS[asKind] === "buyer" ? "customer" : asKind;
        window.mkDemoLook = { cover: `demo/cover-${demoKind}.jpg`, backdrop: `demo/back-${demoKind}.jpg`, photo: `demo/avatar-${demoKind}.jpg` };
        Object.assign(sample, { cover: window.mkDemoLook.cover, backdrop: window.mkDemoLook.backdrop });
        db = blindDb();
        const fake = { uid: "preview-sample", email: "", displayName: "Sample", emailVerified: true, _viewAs: true };
        return resolve({ user: fake, isAdmin: true, merchant: role === "merchant" ? sample : null, courier: role === "courier" ? sample : null, supervisor: role === "supervisor" ? sample : null, dean: role === "dean" ? sample : null });
      }
      resolve({ user, isAdmin, merchant, courier, supervisor, dean, locked });
    });
  });

  return authPromise;
}

function resetAuthState() {
  authPromise = null;
}

async function mkLogout() {
  try {
    if (initBackend()) await auth.signOut();
  } catch (error) {
    console.error(error);
  }
  resetAuthState();
  window.location.href = "login.html";
}

/* ---------- Products ---------- */

let productCache = null;

function sortProducts(list) {
  return list.sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || "")) ||
    String(a.name).localeCompare(String(b.name)));
}

/* Visible products only (what the public store shows). */
async function loadProducts() {
  if (productCache) return productCache;
  if (!initBackend()) return [];

  const snap = await db.collection("products").where("visible", "==", true).get();
  productCache = sortProducts(snap.docs.map(doc => {
    const item = { ...doc.data(), id: doc.id };
    /* a seller's offer: the shown price is lowered; the server computes the same price when the order is placed */
    if (Number(item.discountPercent) > 0 && Number(item.discountPercent) <= 90) { item.listPrice = Number(item.price); item.price = Math.round(Number(item.price) * (100 - Number(item.discountPercent))) / 100; }
    return item;
  }));
  return productCache;
}

/* Every product, including hidden ones (administrators only). */
async function loadAllProducts() {
  const snap = await db.collection("products").get();
  return sortProducts(snap.docs.map(doc => ({ ...doc.data(), id: doc.id })));
}

/* ---------- Cart (kept in the visitor's own browser) ---------- */

function getCart() {
  try {
    const cart = JSON.parse(localStorage.getItem(CART_STORAGE_KEY));
    return Array.isArray(cart) ? cart : [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch (error) {
    console.error("Could not save the cart:", error);
  }
  updateCartBadge();
}

async function addToCart(id) {
  const products = await loadProducts();
  const product = products.find(item => item.id === id);
  if (!product) return false;
  if (product.demo === true) { showToast("This is a demo product, shown only as an example.", "error"); return false; }

  const cart = getCart();
  const existing = cart.find(item => item.id === id);
  if (existing) existing.quantity = (Number(existing.quantity) || 1) + 1;
  else cart.push({ id, quantity: 1 });

  saveCart(cart);
  return product;
}

function updateCartBadge() {
  const badge = document.getElementById("cart-count");
  if (!badge) return;
  badge.textContent = getCart().reduce(
    (sum, item) => sum + (Math.max(1, Number(item.quantity) || 1)), 0
  );
}

/* ---------- Orders, invoices and profiles ---------- */

async function getOrder(id) {
  const snap = await db.collection("orders").doc(id).get();
  return snap.exists ? { ...snap.data(), id: snap.id } : null;
}

async function getMyOrders(uid) {
  const snap = await db.collection("orders").where("uid", "==", uid).get();
  return snap.docs
    .map(doc => ({ ...doc.data(), id: doc.id }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function getProfile(uid) {
  if (window.MK_VIEW_AS && window.mkDemoLook) return { photo: window.mkDemoLook.photo, fullName: "Sample" };
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? { ...snap.data() } : {};
}

async function saveProfile(uid, data) {
  await db.collection("users").doc(uid).set(data, { merge: true });
}

/* ---------- Marketplace helpers (sellers, delivery partners) ---------- */

const FULFILLMENT_LABELS = {
  Digital: "Digital product",
  Placed: "Order placed",
  Accepted: "Accepted by the seller",
  CourierRequested: "Waiting for the delivery partner",
  CourierAccepted: "Delivery partner on the way to the seller",
  ReadyForPickup: "Ready: you can collect it",
  OnTheWay: "On the way to you",
  Delivered: "Delivered",
  Rejected: "Rejected by the seller"
};

const FULFILLMENT_STEPS = ["Placed", "Accepted", "CourierRequested", "CourierAccepted", "OnTheWay", "Delivered"];

/* Great-circle distance in km between two {lat, lng} points, or null when a position is missing. */
function distanceKm(a, b) {
  const ok = p => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) && p.lat !== null && p.lng !== null;
  if (!ok(a) || !ok(b)) return null;
  const rad = degrees => degrees * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/* Asks the browser for the current position. Resolves { lat, lng } or rejects with a readable error. */
function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Your device cannot share its location."));
    navigator.geolocation.getCurrentPosition(
      result => resolve({ lat: Math.round(result.coords.latitude * 1e5) / 1e5, lng: Math.round(result.coords.longitude * 1e5) / 1e5 }),
      () => reject(new Error("Location was not shared. Allow location access, or fill in the city and address instead.")),
      { enableHighAccuracy: false, timeout: 10000 }
    );
  });
}

function mapsLink(place) {
  if (place && Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng)) && place.lat !== null && place.lng !== null) {
    return `https://www.google.com/maps?q=${Number(place.lat)},${Number(place.lng)}`;
  }
  const text = [place && place.address, place && place.city, place && place.country].filter(Boolean).join(", ");
  return text ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}` : "";
}

function numOrNull(value) {
  const text = String(value == null ? "" : value).trim();
  return text !== "" && Number.isFinite(Number(text)) ? Number(text) : null;
}

/* Orders that belong to the signed-in seller / delivery partner (newest first). */
async function getOrdersWhere(field, uid) {
  const snap = await db.collection("orders").where(field, "==", uid).get();
  return snap.docs
    .map(doc => ({ ...doc.data(), id: doc.id }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/* Moves an order through the delivery workflow (the server checks who may do what). */
function orderAction(orderId, action, extra = {}) {
  return callFn("updateOrderStatus", { orderId, action, ...extra });
}

/* ---------- WhatsApp ---------- */

const DIAL_CODES = { italy: "39", italia: "39", france: "33", morocco: "212", tunisia: "216", germany: "49",
  spain: "34", "united kingdom": "44", uk: "44", egypt: "20", "saudi arabia": "966", "united arab emirates": "971", uae: "971",
  china: "86", turkey: "90", libya: "218", mauritania: "222", usa: "1", "united states": "1", canada: "1", belgium: "32", netherlands: "31" };

/* wa.me wants the full international number, digits only. Local numbers (0555...) get the country's code. */
function waNumber(phone, country = "") {
  let digits = String(phone || "").replace(/[^\d+]/g, "");
  const plus = digits.startsWith("+");
  digits = digits.replace(/\D/g, "");
  if (digits.length < 6) return "";
  if (plus) return digits;
  if (digits.startsWith("00")) return digits.slice(2);
  const code = DIAL_CODES[String(country).trim().toLowerCase()];
  if (digits.startsWith("0") && code) return code + digits.slice(1);
  return digits;
}

function waLink(phone, country = "", text = "") {
  const number = waNumber(phone, country);
  return number ? `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ""}` : "";
}

const WA_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>';

/* A green WhatsApp button for a phone number (empty string when there is no usable number). */
function waButton(phone, country, label = "", text = "") {
  const href = waLink(phone, country, text);
  if (!href) return "";
  return `<a class="wa-btn" href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer" title="WhatsApp ${escapeHTML(label)}" aria-label="WhatsApp ${escapeHTML(label)}">${WA_ICON}<span>${escapeHTML(label || "WhatsApp")}</span></a>`;
}

/* ---------- Maps, distance and photos ---------- */

function hasPos(place) {
  return Boolean(place) && place.lat !== null && place.lng !== null && place.lat !== undefined && place.lng !== undefined
    && Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng));
}

function mapEmbedUrl(place) {
  return `https://www.google.com/maps?q=${Number(place.lat)},${Number(place.lng)}&z=15&output=embed`;
}

/* "Near" / "Medium" / "Far" for a distance in km. */
function proximity(km) {
  if (km === null || km === undefined) return "";
  return km <= 2 ? "Near" : km <= 10 ? "Medium distance" : "Far";
}

/* Coordinates + a Google Map + a link that opens the full map. */
function locationCardHTML(place, accuracy) {
  if (!hasPos(place)) return '<p class="muted">Location not set yet.</p>';
  const link = mapsLink(place);
  return `<div class="loc-card">
    <div class="loc-coords"><strong>${Number(place.lat).toFixed(5)}, ${Number(place.lng).toFixed(5)}</strong>
      ${accuracy ? `<small class="muted"> (±${Math.round(accuracy)} m)</small>` : ""}
      ${link ? ` · <a href="${escapeHTML(link)}" target="_blank" rel="noopener">Open in Google Maps</a>` : ""}</div>
    <iframe class="loc-map" title="Map" loading="lazy" src="${escapeHTML(mapEmbedUrl(place))}" referrerpolicy="no-referrer-when-downgrade"></iframe>
  </div>`;
}

/* A product photo may be a web address or a small photo taken with the camera (a data: address). */
function imageSrc(value = "") {
  const text = String(value).trim();
  if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(text) && text.length < 400000) return text;
  if ((window.MK_VIEW_AS && /^demo\/[a-z-]+\.jpg$/.test(text)) || /^demo\/(cover|back|avatar)-[a-z]+\.jpg$/.test(text) || /^img\/cat-[a-z]+\.svg$/.test(text)) return text;   /* the sample pictures of the owner's preview */
  return safeUrl(text);
}

/* Pictures on the choosing cards (shops, doctors, barbers, hotels, agencies, taxis): the cover or the profile photo the partner uploaded.
   They are fetched one by one, only when the card is on the screen, and kept for the next time. */
const lookCache = {};
function fetchLook(id) {
  if (!lookCache[id]) lookCache[id] = callFn("providerLook", { id }).catch(() => ({ cover: "", backdrop: "", photo: "" }));
  return lookCache[id];
}
function thumbHTML(id, name, icon) {
  const first = String(name || "?").trim().charAt(0).toUpperCase() || "?";
  return `<span class="pick-thumb" data-look="${escapeHTML(id)}"><span class="pick-fallback" aria-hidden="true">${icon || escapeHTML(first)}</span></span>`;
}
function hydratePickThumbs(root) {
  const fill = async el => {
    if (el.dataset.done) return;
    el.dataset.done = "1";
    const l = await fetchLook(el.dataset.look), src = imageSrc(l.cover) || imageSrc(l.photo);
    if (src) { const img = document.createElement("img"); img.alt = ""; img.loading = "lazy"; img.src = src; el.textContent = ""; el.appendChild(img); }
  };
  const list = [...(root || document).querySelectorAll(".pick-thumb[data-look]")];
  if (!("IntersectionObserver" in window)) { list.forEach(fill); return; }
  const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); fill(e.target); } }), { rootMargin: "200px" });
  list.forEach(el => io.observe(el));
}
/* Cards with pictures above the drop-down list; touching a card chooses that partner (the list stays for keyboards and screen readers). */
function mountProviderPicker(select, providers, icon) {
  if (!select || !providers.length) return;
  let box = document.getElementById("pick-cards");
  if (!box) { box = document.createElement("div"); box.id = "pick-cards"; box.className = "pick-cards"; box.setAttribute("role", "listbox"); select.insertAdjacentElement("beforebegin", box); }
  box.innerHTML = providers.map(d => `<button type="button" class="pick-card" role="option" data-id="${escapeHTML(d.id)}" aria-selected="false">
    ${thumbHTML(d.id, d.name, icon)}<strong class="notranslate">${escapeHTML(d.name)}</strong>
    <small class="muted">${escapeHTML([d.specialty, d.city].filter(Boolean).join(" · "))}</small>${d.bookingClosed ? '<small class="tag tag-warn">Closed</small>' : ""}</button>`).join("");
  const sync = () => box.querySelectorAll(".pick-card").forEach(c => { const on = c.dataset.id === select.value; c.classList.toggle("active", on); c.setAttribute("aria-selected", String(on)); });
  box.addEventListener("click", event => {
    const c = event.target.closest(".pick-card"); if (!c) return;
    select.value = c.dataset.id; select.dispatchEvent(new Event("change", { bubbles: true })); sync();
  });
  select.addEventListener("change", sync);
  hydratePickThumbs(box);
}

/* Shrinks a photo (from the camera or the gallery) to a small picture that fits in the database.
   Product photos: 560 px on the long side, WebP when the phone supports it (JPEG otherwise), aiming at about 27 KB.
   That is still sharp on a phone screen, and it lets the free database hold many times more photos. */
/* The owner sets the size of a product photo in the admin page (settings/images, in KB); 27 KB when he did not. */
/* Before any "I received the debt / fees" is recorded: one clear question, so nobody records a payment by mistake. */
function confirmReceived(name, amount) {
  return window.confirm(`Are you sure you received ${formatPrice(amount)} from ${name || "this account"}? Once you press OK it is recorded, and the amount moves up to you.`);
}

/* ---------- proof of a payment: a photo or a PDF of the bank receipt ---------- */
function proofPickerHTML() {
  return '<label class="proof-pick" title="Photo or PDF of the receipt (bank transfer)"><span>📎 Receipt</span><input type="file" class="proof-file" accept="image/*,application/pdf" hidden><small class="proof-name notranslate"></small></label>';
}
document.addEventListener("change", event => {
  const input = event.target && event.target.closest && event.target.closest(".proof-file");
  const label = input && input.parentElement && input.parentElement.querySelector(".proof-name");
  if (label) label.textContent = input.files && input.files[0] ? input.files[0].name.slice(0, 22) : "";
});
/* The file chosen next to a button (undefined when none). Photos are shrunk; a PDF must be small. */
async function readProof(scope) {
  const input = scope && scope.querySelector && scope.querySelector(".proof-file");
  const file = input && input.files && input.files[0];
  if (!file) return undefined;
  let data;
  if (file.type === "application/pdf") {
    if (file.size > 150000) throw new Error("This PDF is too big (up to 150 KB). Send a photo of the receipt instead.");
    data = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error("Could not read the file.")); r.readAsDataURL(file); });
  } else if (/^image\//.test(file.type)) {
    data = await encodeImage(file, 1100, 0.72, 200000);
  } else throw new Error("Choose a photo or a PDF.");
  return { name: file.name, data };
}
function proofLinkHTML(id) { return id ? ` <button type="button" class="small-button proof-view" data-id="${escapeHTML(id)}">📎 Proof</button>` : ""; }
async function openProof(id) {
  const win = window.open("", "_blank");
  try {
    const p = await callFn("getFeeProof", { id });
    if (!win) return showToast("Allow pop-ups to see the proof.", "error");
    if (p.mime === "application/pdf") {
      const bin = atob(p.data.split(",")[1]), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      win.location.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    } else {
      win.document.write(`<!doctype html><meta charset="utf-8"><title>Proof</title><body style="margin:0;background:#121212;display:grid;place-items:center;min-height:100vh"><img alt="" src="${p.data}" style="max-width:100%;max-height:100vh"></body>`);
      win.document.close();
    }
  } catch (error) { if (win) win.close(); showToast(authErrorMessage(error), "error"); }
}
document.addEventListener("click", event => { const b = event.target && event.target.closest && event.target.closest(".proof-view"); if (b) openProof(b.dataset.id); });

let imageKbPromise = null;
function imageKb() {
  if (!imageKbPromise) {
    imageKbPromise = (async () => {
      try {
        if (!initBackend()) return 27;
        const snap = await db.collection("settings").doc("images").get();
        const kb = snap.exists ? Number(snap.data().kb) : 27;
        return Number.isFinite(kb) && kb >= 10 && kb <= 100 ? kb : 27;
      } catch { return 27; }
    })();
  }
  return imageKbPromise;
}
async function fileToDataUrl(file, maxSide, quality, maxChars) {
  if (maxChars === undefined) {
    const kb = await imageKb();
    maxChars = Math.round(kb * 1365);               /* base64 text is 4/3 of the picture */
    if (maxSide === undefined) maxSide = kb <= 20 ? 480 : kb <= 40 ? 560 : kb <= 70 ? 640 : 760;
  }
  return encodeImage(file, maxSide === undefined ? 560 : maxSide, quality === undefined ? 0.72 : quality, maxChars);
}
function encodeImage(file, maxSide, quality, maxChars) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const picture = new Image();
    picture.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(picture.width, picture.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(picture.width * scale));
        canvas.height = Math.max(1, Math.round(picture.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(picture, 0, 0, canvas.width, canvas.height);
        const encode = q => {
          const webp = canvas.toDataURL("image/webp", q);
          return /^data:image\/webp/.test(webp) ? webp : canvas.toDataURL("image/jpeg", q);
        };
        let q = quality;
        let out = encode(q);
        while (out.length > maxChars && q > 0.35) { q = Math.round((q - 0.07) * 100) / 100; out = encode(q); }
        /* still too big: shrink the picture itself a little instead of ruining the quality */
        let side = Math.max(canvas.width, canvas.height);
        while (out.length > maxChars * 1.25 && side > 320) {
          side = Math.round(side * 0.85);
          const k = side / Math.max(canvas.width, canvas.height);
          const small = document.createElement("canvas");
          small.width = Math.max(1, Math.round(canvas.width * k)); small.height = Math.max(1, Math.round(canvas.height * k));
          small.getContext("2d").drawImage(canvas, 0, 0, small.width, small.height);
          canvas.width = small.width; canvas.height = small.height;
          const c2 = canvas.getContext("2d"); c2.fillStyle = "#fff"; c2.fillRect(0, 0, small.width, small.height); c2.drawImage(small, 0, 0);
          out = encode(0.6);
        }
        URL.revokeObjectURL(url);
        if (out.length > maxChars * 1.5) reject(new Error("The photo is too big. Try again with a lower camera resolution."));
        else resolve(out);
      } catch (error) {
        reject(error);
      }
    };
    picture.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This file is not a picture.")); };
    picture.src = url;
  });
}

/* "Erase my data": every signed-in account can wipe its own data (money and open work must be settled first). The login stays. */
function mountWipeZone(isAdmin) {
  const main = document.querySelector("main");
  if (!main || document.getElementById("wipe-zone")) return;
  const zone = document.createElement("section");
  zone.id = "wipe-zone";
  zone.className = "admin-panel wipe-zone";
  zone.innerHTML = `<div class="panel-heading"><h2>Erase my data</h2>
    <p>${isAdmin ? "Erases the data saved about your own account. Your account, your role and your owner access stay." : "Erases the data saved about your account: your products, orders, bookings, messages and reviews. Your account and your role stay. You can only do it when you owe nothing, your credit is empty and no order or booking is open."} This cannot be undone.</p></div>
    <button type="button" class="button button-danger" id="wipe-me">Erase my data</button>
    <p id="wipe-message" class="form-message" role="status"></p>`;
  main.appendChild(zone);
  document.getElementById("wipe-me").addEventListener("click", async event => {
    const button = event.currentTarget, message = document.getElementById("wipe-message");
    const typed = window.prompt("This erases all your data and cannot be undone. Type DELETE to confirm.", "");
    if (typed === null) return;
    if (typed.trim() !== "DELETE") { message.textContent = "Nothing was erased: you did not type DELETE."; return; }
    button.disabled = true;
    try {
      if (!(await window.mkEraseBackupRun({}))) { message.textContent = "Nothing was erased: the backup was not saved."; button.disabled = false; return; }
      await callFn("wipeMyData", { confirm: "DELETE" });
      showToast("Your data was erased.");
      try { await auth.signOut(); } catch { /* ignore */ }
      window.location.href = "index.html";
    } catch (error) {
      message.textContent = authErrorMessage(error);
      message.classList.add("error");
      button.disabled = false;
    }
  });
}

/* ---------- Live updates and notifications ---------- */

/* A short beep + a title badge, so a new order is noticed even if the tab is in the background. */
let unseen = 0;
const baseTitle = typeof document !== "undefined" ? document.title : "";

function beep() {
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    const context = new Context();
    const tone = context.createOscillator();
    const gain = context.createGain();
    tone.connect(gain);
    gain.connect(context.destination);
    tone.frequency.value = 880;
    gain.gain.value = 0.08;
    tone.start();
    tone.stop(context.currentTime + 0.25);
  } catch { /* sound is optional */ }
}

function alertUser(message, vibration) {
  showToast(message, "info");
  beep();
  unseen += 1;
  document.title = `(${unseen}) ${baseTitle}`;
  if (navigator.vibrate) { try { navigator.vibrate(vibration || 200); } catch { /* optional */ } }
}

window.addEventListener("focus", () => { unseen = 0; document.title = baseTitle; });

/* Watches a list of orders in real time. onData(orders) runs for every change;
   describe(order, previous) returns a message for a NEW order or a changed status (or "" for none).
   Returns the unsubscribe function. */
function watchOrders(field, uid, onData, describe, onError) {
  const known = new Map();
  let first = true;

  /* field = null: every order, newest first (administrators) */
  const source = field
    ? db.collection("orders").where(field, "==", uid)
    : db.collection("orders").orderBy("createdAt", "desc").limit(100);

  return source.onSnapshot(snap => {
    const orders = snap.docs
      .map(doc => ({ ...doc.data(), id: doc.id }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    if (!first) {
      for (const order of orders) {
        const stamp = `${order.status}|${order.fulfillment}`;
        if (known.get(order.id) !== stamp) {
          const message = describe(order, known.get(order.id));
          if (message) alertUser(message);
        }
      }
    }
    orders.forEach(order => known.set(order.id, `${order.status}|${order.fulfillment}`));
    first = false;
    onData(orders);
  }, error => { if (onError) onError(error); else console.error(error); });
}

/* Push notifications (they arrive even when the app is closed). Needs a click to ask permission. */
function pushSupported() {
  return typeof Notification !== "undefined" && "serviceWorker" in navigator && typeof firebase !== "undefined";
}

/* The messaging library is loaded only when push is really switched on. If it were loaded on every page,
   other parts of Firebase would try to register a default service worker (firebase-messaging-sw.js at the
   site root) that does not exist on GitHub Pages, and an error about it could appear anywhere. */
function loadMessagingLibrary() {
  if (typeof firebase.messaging === "function") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load the notifications library."));
    document.head.appendChild(script);
  });
}

async function registerPushToken(user) {
  const registration = await navigator.serviceWorker.register("sw.js");
  await navigator.serviceWorker.ready;
  await loadMessagingLibrary();
  const messaging = firebase.messaging();
  const token = await messaging.getToken({ vapidKey: FIREBASE_CONFIG.vapidKey, serviceWorkerRegistration: registration });
  if (!token) throw new Error("Could not get a notification token from this device.");

  /* While the page is open, chat messages arrive here (the order alerts come from the live lists).
     Registered only AFTER getToken: before it, the SDK looks for a default service worker that does not exist here. */
  try {
    messaging.onMessage(payload => {
      const data = (payload && payload.data) || {};
      /* the open page already announces orders and delivery steps from its live lists; everything else is announced here, each kind with its own icon and vibration */
      const look = typeof pushLook === "function" ? pushLook(data) : null;
      if (!look || !look.live) alertUser(`${look ? look.title : data.title}: ${data.body}`, look && look.vibrate);
    });
  } catch (error) { console.error(error); }

  const ref = db.collection("fcmTokens").doc(user.uid);
  const snap = await ref.get();
  const list = snap.exists && Array.isArray(snap.data().tokens) ? snap.data().tokens : [];
  if (!list.includes(token)) {
    await ref.set({ tokens: [token, ...list].slice(0, 10), updatedAt: new Date().toISOString() });
  }
}

async function setupPush(user) {
  if (!pushSupported()) return;

  const main = document.querySelector("main");
  if (!main) return;
  const bar = document.createElement("aside");
  bar.className = "admin-notice push-bar";
  main.insertBefore(bar, main.firstChild);

  /* once notifications are on there is nothing to show: the bar is removed */
  const ready = () => { bar.remove(); };

  if (Notification.permission === "granted" && FIREBASE_CONFIG.vapidKey) {
    registerPushToken(user).then(ready).catch(error => { console.error(error); bar.remove(); });
    ready();
    return;
  }
  if (Notification.permission === "denied") {
    bar.innerHTML = "<strong>Notifications are blocked</strong> for this site. Allow them in your browser settings to be alerted about new orders.";
    return;
  }

  bar.innerHTML = '<strong>Get alerts on this device</strong> — new orders and delivery requests, even when the app is closed. <button type="button" class="small-button" id="enable-push">Turn on notifications</button>';
  bar.querySelector("#enable-push").addEventListener("click", async () => {
    try {
      if (!FIREBASE_CONFIG.vapidKey) throw new Error("Notifications are not set up yet: the owner must add the vapidKey to firebase-config.js.");
      if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications were not allowed.");
      await registerPushToken(user);
      ready();
    } catch (error) {
      console.error(error);
      showToast(error.message || "Could not turn on notifications.", "error");
    }
  });
}

/* ---------- Identity details (phone, ID number, photo of the ID card) ---------- */

async function getKyc(uid) {
  try {
    const snap = await db.collection("kyc").doc(uid).get();
    return snap.exists ? snap.data() : null;
  } catch {
    return null;
  }
}

/* The three required fields. `p` is an id prefix so the same fields can sit in several forms. */
function kycFieldsHTML(p = "k", opts = {}) {
  const phone = opts.phone !== false, id = opts.id !== false;
  return `<div class="kyc-fields">
    ${phone ? `<label for="${p}-phone">Phone number * <small class="muted">(with country code, e.g. +33 6 12 34 56 78)</small></label>
    <input id="${p}-phone" type="tel" maxlength="40" autocomplete="tel" required>` : ""}
    ${id ? `<label for="${p}-idnumber">ID card / passport number *</label>
    <input id="${p}-idnumber" maxlength="40" autocomplete="off" required>
    <label for="${p}-idfile">Photo of your ID card *</label>
    <input id="${p}-idfile" type="file" accept="image/*" required>
    <img id="${p}-idpreview" class="photo-preview" alt="" hidden>
    <p class="field-help">A clear photo of the front of the card. Only you and the store owner can see it.</p>` : ""}
  </div>`;
}

/* Call after the fields are in the page: shrinks the chosen photo and previews it. */
function bindKycFields(p = "k", existing = null) {
  const input = document.getElementById(`${p}-idfile`);
  const preview = document.getElementById(`${p}-idpreview`);
  const state = { photo: existing && existing.idPhoto ? existing.idPhoto : "" };
  if (!input) return state;   /* the owner switched "ID card required" off for this kind of account */
  if (existing) {
    document.getElementById(`${p}-phone`).value = existing.phone || "";
    document.getElementById(`${p}-idnumber`).value = existing.idNumber || "";
    if (state.photo) { preview.src = state.photo; preview.hidden = false; input.required = false; }
  }
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      state.photo = await fileToDataUrl(file, 1100, 0.7, 380000);
      preview.src = state.photo; preview.hidden = false;
    } catch (error) {
      state.photo = ""; preview.hidden = true;
      input.value = "";
      showToast(error.message || "This photo cannot be used.", "error");
    }
  });
  return state;
}

/* Returns { phone, idNumber, idPhoto } or throws an Error with a message for the person. */
function readKycFields(p, state) {
  const phoneField = document.getElementById(`${p}-phone`);
  const idField = document.getElementById(`${p}-idnumber`);
  const phone = phoneField ? phoneField.value.trim() : "";
  const idNumber = idField ? idField.value.trim() : "";
  if (phoneField && phone.replace(/\D/g, "").length < 8) throw new Error("Enter your phone number with the country code.");
  if (idField && idNumber.length < 5) throw new Error("Enter your ID card or passport number.");
  if (idField && !state.photo) throw new Error("Add a clear photo of your ID card.");
  return { phone, idNumber, idPhoto: state.photo };
}

async function saveKyc(uid, data) {
  if (!data.idNumber || !data.idPhoto) {   /* ID card not required by the owner: only the phone is kept */
    try { if (data.phone) await saveProfile(uid, { phone: data.phone }); } catch { /* optional */ }
    return;
  }
  await db.collection("kyc").doc(uid).set({ uid, phone: data.phone, idNumber: data.idNumber, idPhoto: data.idPhoto, updatedAt: new Date().toISOString() });
  try { await saveProfile(uid, { phone: data.phone }); } catch { /* optional */ }
}

/* A window that asks for the identity details. required = cannot be closed (staff pages). */
function showKycWall(user, required) {
  if (document.getElementById("kyc-wall")) return;
  const wall = document.createElement("aside");
  wall.id = "kyc-wall";
  wall.className = "verify-wall kyc-wall";
  wall.setAttribute("role", "dialog");
  wall.innerHTML = `<div class="verify-wall-box kyc-box"><h2 class="kyc-title">Complete your identity details</h2>
    <p>${required ? "These details are required for your work account." : "Please add your identity details. They are required to work with us as a seller or delivery partner."}</p>
    <form id="kyc-form" novalidate>${kycFieldsHTML("kw")}
      <div class="verify-actions"><button type="submit" class="button button-teal">Save</button>
      ${required ? '<button type="button" class="small-button delete-button" id="kyc-logout">Log out</button>' : '<button type="button" class="small-button" id="kyc-later">Later</button>'}</div>
      <p id="kyc-msg" class="form-message error" role="status"></p></form></div>`;
  document.body.appendChild(wall);
  if (required) document.body.classList.add("verify-locked");
  const state = bindKycFields("kw", null);
  document.getElementById("kyc-form").addEventListener("submit", async event => {
    event.preventDefault();
    const msg = document.getElementById("kyc-msg");
    try {
      const data = readKycFields("kw", state);
      await saveKyc(user.uid, data);
      window.location.reload();
    } catch (error) {
      msg.textContent = authErrorMessage(error);
    }
  });
  const later = document.getElementById("kyc-later");
  if (later) later.addEventListener("click", () => wall.remove());
  const out = document.getElementById("kyc-logout");
  if (out) out.addEventListener("click", () => mkLogout());
}

/* ---------- Blocked accounts ---------- */

/* The owner can block an account: the person sees a red wall and cannot use the site. */
async function checkBlocked(user) {
  try {
    const snap = await db.collection("blocked").doc(user.uid).get();
    if (!snap.exists || document.getElementById("blocked-wall")) return;
    const wall = document.createElement("aside");
    wall.id = "blocked-wall";
    wall.className = "verify-wall blocked-wall";
    wall.setAttribute("role", "alertdialog");
    wall.innerHTML = `<div class="verify-wall-box blocked-box">
      <svg class="prohibited-sign" viewBox="0 0 100 100" width="92" height="92" role="img" aria-label="Not allowed"><circle cx="50" cy="50" r="42" fill="#fff" stroke="#d62828" stroke-width="12"/><line x1="21" y1="79" x2="79" y2="21" stroke="#d62828" stroke-width="12" stroke-linecap="round"/></svg>
      <div><h2>Your account is blocked</h2>
      <p>You cannot continue with this action. Please contact the store owner.</p>
      <div class="verify-actions"><button type="button" class="button button-teal" id="blocked-logout">Log out</button></div></div></div>`;
    document.body.appendChild(wall);
    document.getElementById("blocked-logout").addEventListener("click", () => mkLogout());
  } catch { /* not blocked, or cannot be checked */ }
}

/* ---------- Product pictures next to order items ---------- */

const thumbCache = new Map();

function orderItemsHTML(items) {
  return (items || []).map(item => `<div class="item-line"><img class="item-thumb" data-pid="${escapeHTML(item.id)}" alt="" hidden><span>${escapeHTML(item.name)} × ${Number(item.quantity)}</span></div>`).join("");
}

/* Fills every <img data-pid> inside root with the product's picture (products are read once and kept). */
async function hydrateThumbs(root = document) {
  const imgs = [...root.querySelectorAll("img.item-thumb[data-pid]:not([data-done])")];
  const ids = [...new Set(imgs.map(img => img.dataset.pid))].filter(id => !thumbCache.has(id));
  await Promise.all(ids.map(async id => {
    try {
      const snap = await db.collection("products").doc(id).get();
      thumbCache.set(id, snap.exists ? imageSrc(snap.data().image) : "");
    } catch { thumbCache.set(id, ""); }
  }));
  imgs.forEach(img => {
    img.dataset.done = "1";
    const src = thumbCache.get(img.dataset.pid);
    if (src) { img.src = src; img.hidden = false; }
    else { const box = document.createElement("span"); box.className = "item-thumb item-thumb-empty"; box.textContent = "P"; img.replaceWith(box); }
  });
}

/* ---------- Email verification ---------- */

function showVerifyBanner(user) {
  if (user.emailVerified) return;
  if (document.getElementById("verify-bar")) return;
  const soft = document.body.getAttribute("data-verify") === "soft";   /* checkout keeps the page usable */

  const bar = document.createElement("aside");
  bar.id = "verify-bar";
  const body = `<strong>Please verify your email address.</strong> We sent a link to ${escapeHTML(user.email || "your email")}
    (check the spam folder too). Open it, then press <em>I verified it</em>. If this address does not exist, you will never get the link and cannot use the account.
    <span class="verify-actions"><button type="button" class="small-button" id="verify-done">I verified it</button>
    <button type="button" class="small-button" id="verify-resend">Send the link again</button>
    ${soft ? "" : '<button type="button" class="small-button delete-button" id="verify-logout">Log out</button>'}</span>
    <span id="verify-msg" class="muted"></span>`;

  if (soft) {
    const main = document.querySelector("main");
    if (!main) return;
    bar.className = "admin-notice verify-bar";
    bar.innerHTML = body;
    main.insertBefore(bar, main.firstChild);
  } else {
    /* Entry is blocked: a window with a not-allowed sign covers the page until the address is confirmed. */
    bar.className = "verify-wall";
    bar.setAttribute("role", "alertdialog");
    bar.innerHTML = `<div class="verify-wall-box blocked-box">
      <svg class="prohibited-sign" viewBox="0 0 100 100" width="92" height="92" role="img" aria-label="Not allowed"><circle cx="50" cy="50" r="42" fill="#fff" stroke="#d62828" stroke-width="12"/><line x1="21" y1="79" x2="79" y2="21" stroke="#d62828" stroke-width="12" stroke-linecap="round"/></svg>
      <div><h2>Email not verified</h2><p>${body}</p></div></div>`;
    document.body.classList.add("verify-locked");
    document.body.appendChild(bar);
    document.getElementById("verify-logout").addEventListener("click", () => mkLogout());
  }

  const say = text => { document.getElementById("verify-msg").textContent = text; };

  document.getElementById("verify-resend").addEventListener("click", async () => {
    try {
      await auth.currentUser.sendEmailVerification();
      say("Link sent. It can take a minute to arrive.");
    } catch (error) {
      say(authErrorMessage(error));
    }
  });

  document.getElementById("verify-done").addEventListener("click", async () => {
    try {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true); /* the server reads the verified flag from this token */
      if (auth.currentUser.emailVerified) {
        resetAuthState();
        window.location.reload();
      } else {
        say("Not verified yet. Open the link in the email first.");
      }
    } catch (error) {
      say(authErrorMessage(error));
    }
  });
}

/* ---------- YouTube embed ---------- */

function getVideoEmbed(url = "") {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    let videoId = "";

    if (host === "youtu.be") {
      videoId = parsed.pathname.slice(1);
    } else if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      if (parsed.pathname === "/watch") {
        videoId = parsed.searchParams.get("v") || "";
      } else if (/^\/(embed|shorts)\//.test(parsed.pathname)) {
        videoId = parsed.pathname.split("/")[2] || "";
      }
    }

    return /^[a-zA-Z0-9_-]{11}$/.test(videoId)
      ? `https://www.youtube-nocookie.com/embed/${videoId}`
      : "";
  } catch {
    return "";
  }
}

/* ---------- Page setup shared by every page ---------- */

/* "Congratulations, you are now a Dean / Supervisor": a window that stays a few seconds and goes away. It shows once per promotion and device. */
function showPromotion(user, mark) {
  const at = mark.rec && mark.rec.addedAt;
  if (!at || Date.now() - Date.parse(at) > 14 * 86400000) return;
  const key = `mk-promo-${mark.role}-${user.uid}-${at}`;
  try { if (localStorage.getItem(key)) return; localStorage.setItem(key, "1"); } catch { return; }
  const pop = document.createElement("div");
  pop.className = "promo-pop"; pop.setAttribute("role", "status");
  pop.innerHTML = `<div class="promo-card"><div class="promo-icon" aria-hidden="true">🎉${mark.icon}🎉</div>
    <h2>Congratulations!</h2><p>You were promoted to <strong>${mark.label}</strong>.</p>
    <small>${mark.role === "dean" ? "You now lead supervisors, approve the people they bring in and follow your statistics." : "You now bring in sellers and delivery partners and follow your statistics."}</small>
    <div class="promo-bar"><i></i></div></div>`;
  const close = () => { pop.classList.add("promo-out"); setTimeout(() => pop.remove(), 400); };
  pop.addEventListener("click", close);
  document.body.appendChild(pop);
  setTimeout(close, 9000);
  try { beep(); } catch { /* optional */ }
}

async function initPage() {
  document.querySelectorAll("[data-year]").forEach(element => {
    element.textContent = new Date().getFullYear();
  });
  updateCartBadge();

  const required = document.body.dataset.requireRole;

  if (!initBackend()) {
    showSetupNotice();
    if (required) document.body.classList.add("auth-ok");
    return;
  }

  const { user, isAdmin, merchant, courier, supervisor, dean, locked } = await getAuthState();

  if (required && user && locked && locked === required) {
    document.body.classList.add("auth-ok");
    const main = document.querySelector("main");
    if (main) main.innerHTML = `<section class="admin-panel"><div class="panel-heading"><h2>🔒 Your account is locked</h2><p>The owner locked this account. Your tasks moved to the level above, and your debts stay as they are. Everything comes back by itself when the owner unlocks the account.</p></div><p><a class="button button-teal" href="index.html">Back to the store</a></p></section>`;
    return;
  }

  if (required) {
    const page = window.location.pathname.split("/").pop() || "index.html";
    let allowed = Boolean(user);
    let sendTo = `login.html?next=${encodeURIComponent(page)}`;

    if (user && required === "admin") allowed = isAdmin;
    if (user && required === "merchant") { allowed = Boolean(merchant); sendTo = "partner.html"; }
    if (user && required === "courier") { allowed = Boolean(courier); sendTo = "partner.html"; }
    if (user && required === "supervisor") { allowed = Boolean(supervisor); sendTo = "index.html"; }
    if (user && required === "dean") { allowed = Boolean(dean); sendTo = "index.html"; }

    if (!allowed) {
      window.location.replace(sendTo);
      return;
    }
    document.body.classList.add("auth-ok");
  }

  /* Signed-in people do not need these two links (joining is done from the account page). */
  if (user) {
    document.querySelectorAll("header nav a").forEach(link => {
      if (/PhD\/a\.html/.test(link.href) || /^\s*Sell \/ Deliver\s*$/.test(link.textContent)) link.remove();
    });
  }

  if (user && !isAdmin) checkBlocked(user);

  if (user && !user._viewAs && !window.MK_VIEW_AS && ["buyer", "merchant", "courier", "supervisor", "dean", "admin"].includes(required)) mountWipeZone(isAdmin);

  if (user && !isAdmin && document.body.hasAttribute("data-kyc")) {
    const mode = document.body.getAttribute("data-kyc");   /* "required" blocks the page, "soft" can be skipped */
    const roleKey = required === "buyer" || !required ? "customer" : required;
    getFeatures().then(features => {
      if ((features[roleKey] || features.customer).requireId === false) return;
      return getKyc(user.uid).then(kyc => { if (!kyc) showKycWall(user, mode !== "soft"); });
    });
  }
  if (window.MK_VIEW_AS) enableViewOnly();
  if (user && !user._viewAs && document.body.hasAttribute("data-push")) setupPush(user);
  if (user && !isAdmin && document.body.hasAttribute("data-verify")) showVerifyBanner(user);
  if (user && !user._viewAs && document.body.hasAttribute("data-support") && typeof addSupportButton === "function") addSupportButton(user, isAdmin);

  /* a dean or a supervisor: a mark next to his name everywhere, and a congratulation the first time he sees it */
  const roleMark = dean ? { role: "dean", label: "Dean", icon: "🎖️", rec: dean } : supervisor ? { role: "supervisor", label: "Supervisor", icon: "🧑‍💼", rec: supervisor } : null;
  window.mkRoleMark = roleMark ? { label: roleMark.label, icon: roleMark.icon } : null;
  if (user && !user._viewAs && roleMark) showPromotion(user, roleMark);
  const authLink = document.getElementById("auth-link");
  if (user) { const reg = document.getElementById("register-link"); if (reg) reg.remove(); const fab = document.getElementById("join-fab"); if (fab) fab.remove(); }
  if (authLink && user) {
    authLink.textContent = isAdmin ? "Dashboard" : "My account";
    authLink.href = isAdmin ? "admin.html" : "account.html";

    /* Extra links for people who also sell or deliver. */
    const extras = [];
    if (merchant) extras.push(["merchant.html", { doctor: "My clinic", agency: "My travel agency", taxi: "My taxi", barber: "My barbershop", hotel: "My hotel", restaurant: "My restaurant", pharmacy: "My pharmacy" }[merchant.kind] || "Seller dashboard"]);
    if (courier) extras.push(["courier.html", "Deliveries"]);
    if (supervisor) extras.push(["supervisor.html", "Supervisor"]);
    if (dean) extras.push(["dean.html", "Dean"]);
    extras.forEach(([href, label]) => {
      const link = document.createElement("a");
      link.href = href;
      link.textContent = label;
      authLink.parentNode.insertBefore(link, authLink);
    });

    /* A round profile picture (or the first letter) next to the account link: it opens the profile page. */
    if (!document.getElementById("header-avatar-link")) {
      const holder = document.createElement("a");
      holder.id = "header-avatar-link";
      holder.className = "header-avatar-link";
      holder.href = "account.html#profile";
      holder.title = "My profile";
      if (roleMark) { holder.dataset.badge = roleMark.icon; holder.title = roleMark.label + " · My profile"; }
      authLink.after(holder);
      const letter = (user.displayName || user.email || "?").trim().charAt(0).toUpperCase();
      const paint = photo => {
        const src = photo ? imageSrc(photo) : "";
        holder.innerHTML = src ? `<img class="header-avatar" alt="" src="${escapeHTML(src)}">` : `<span class="header-avatar-letter">${escapeHTML(letter)}</span>`;
      };
      window.mkSetHeaderPhoto = paint;
      paint("");
      getProfile(user.uid).then(profile => paint(profile.photo)).catch(() => {});
    }
  }
}

/* ---------- App install (PWA) ---------- */

let installPrompt = null;

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return;
  if (document.getElementById("install-app")) return;

  const button = document.createElement("button");
  button.id = "install-app";
  button.type = "button";
  button.className = "install-app";
  button.textContent = "Install the app";
  button.addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    try { await installPrompt.userChoice; } catch { /* ignored */ }
    installPrompt = null;
    button.remove();
  });
  document.body.appendChild(button);
});

/* iPhone / iPad: there is no install prompt, so the same button opens a short how-to (Share → Add to Home Screen). */
(function () {
  const ua = navigator.userAgent || "";
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = (window.navigator && window.navigator.standalone === true) || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  if (!ios || standalone) return;
  const show = () => {
    if (document.getElementById("install-app")) return;
    const button = document.createElement("button");
    button.id = "install-app";
    button.type = "button";
    button.className = "install-app";
    button.textContent = "Install the app";
    button.addEventListener("click", () => {
      const modal = document.createElement("div");
      modal.className = "qr-modal";
      modal.innerHTML = `<div class="qr-card" role="dialog" aria-label="Install the app"><h3>Install the app</h3><ol class="ios-steps"><li>Tap the Share button (the square with an arrow) at the bottom of Safari.</li><li>Scroll down and tap "Add to Home Screen".</li><li>Tap "Add". The app appears on your home screen.</li></ol><button type="button" class="button button-light ios-close">Close</button></div>`;
      modal.addEventListener("click", ev => { if (ev.target === modal || ev.target.closest(".ios-close")) modal.remove(); });
      document.body.appendChild(modal);
    });
    document.body.appendChild(button);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", show); else show();
})();

window.addEventListener("appinstalled", () => {
  const button = document.getElementById("install-app");
  if (button) button.remove();
});

if ("serviceWorker" in navigator && /^https?:$/.test(window.location.protocol)) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(error => console.warn("Service worker not registered:", error));
  });
}

/* Preview mode: a database that reads as empty and refuses every write, so no real data can ever appear. */
function blindDb() {
  const empty = () => ({ empty: true, size: 0, docs: [], exists: false, id: "", metadata: {}, forEach() {}, docChanges: () => [], data: () => undefined, get: () => undefined });
  const make = () => new Proxy(function () {}, {
    get(_, key) {
      if (key === "then") return undefined;
      if (key === "get") return () => Promise.resolve(empty());
      if (key === "onSnapshot") return (...args) => { const cb = args.find(a => typeof a === "function"); if (cb) setTimeout(() => cb(empty()), 0); return () => {}; };
      if (["set", "add", "update", "delete", "runTransaction", "commit"].includes(key)) return () => Promise.reject(new Error("View only: this is a preview."));
      return () => make();
    },
    apply() { return make(); }
  });
  return make();
}

/* The owner looks at somebody's page: nothing can be changed from it. */
function enableViewOnly() {
  document.body.classList.add("view-only");
  const bar = document.createElement("div");
  bar.className = "view-as-bar"; bar.setAttribute("role", "status");
  bar.innerHTML = `<span>👁 Preview of the page layout only: no real account or private data is shown, and nothing can be changed here.</span><a class="small-button" href="admin.html">← Back to the dashboard</a>`;
  document.body.insertBefore(bar, document.body.firstChild);
  const allowed = el => el.closest(".view-as-bar, .role-tab, summary, .view-ok, #admin-logout, nav a, .filter-chip, .chip");
  document.addEventListener("click", event => {
    const control = event.target.closest("button, input[type=submit], input[type=checkbox], input[type=radio], label[for]");
    if (control && !allowed(control)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  ["submit", "change"].forEach(type => document.addEventListener(type, event => { event.preventDefault(); event.stopImmediatePropagation(); }, true));
}

/* Count this visitor once a day for the owner's statistics (never blocks the page; admin pages are not counted). */
function trackVisit() {
  try {
    if (window.MK_NO_TRACK || document.body.classList.contains("admin-page") || !initBackend()) return;
    const day = new Date().toISOString().slice(0, 10);
    let cid = ""; let last = "";
    try { cid = localStorage.getItem("mk-cid") || ""; last = localStorage.getItem("mk-cid-day") || ""; } catch { /* private mode */ }
    if (last === day) return;
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(cid)) {
      cid = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, "0")).join("");
      try { localStorage.setItem("mk-cid", cid); } catch { /* ignore */ }
    }
    const fns = firebase.app().functions(FUNCTIONS_REGION);
    fns.httpsCallable("pingSite")({ cid }).catch(() => fns.httpsCallable("trackVisit")({ cid }))
      .then(() => { try { localStorage.setItem("mk-cid-day", day); } catch { /* ignore */ } })
      .catch(() => { /* statistics are optional */ });
  } catch { /* ignore */ }
}

document.addEventListener("DOMContentLoaded", initPage);
document.addEventListener("DOMContentLoaded", () => setTimeout(trackVisit, 1500));
