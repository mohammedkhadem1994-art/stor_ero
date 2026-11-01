"use strict";

/* Three languages: English (the text written in the pages), French and Arabic (right-to-left).
   The page text stays in English in the files; this script swaps it using i18n-data.js and keeps
   swapping text that other scripts add later (orders, toasts, tables...). The choice is remembered. */
(function () {
  const LANGS = { en: "English", fr: "Français", ar: "العربية" };
  const DATA = window.MK_I18N_DATA || [];
  const PATTERNS = window.MK_I18N_PATTERNS || [];

  const norm = text => String(text).replace(/\s+/g, " ").trim();
  const table = new Map();
  for (const [en, fr, ar] of DATA) table.set(norm(en), { fr, ar });

  const escapeRe = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const phraseKeys = [...table.keys()].filter(key => key.length >= 5 && /[A-Za-z]/.test(key)).sort((a, b) => b.length - a.length);
  const phraseRe = phraseKeys.length ? new RegExp(`(?<![A-Za-z])(?:${phraseKeys.map(escapeRe).join("|")})(?![A-Za-z])`, "g") : null;

  function readLang() {
    try {
      const saved = localStorage.getItem("mkLang");
      if (saved && LANGS[saved]) return saved;
    } catch { /* storage blocked */ }
    /* the first visit opens in Arabic; the visitor then picks his own language and the choice is remembered */
    return "ar";
  }

  let lang = readLang();
  const cache = new Map();

  function translateCore(text, to) {
    const key = norm(text);
    if (!key) return text;
    const hit = table.get(key);
    if (hit) return hit[to];
    for (const [re, fr, ar] of PATTERNS) {
      const m = key.match(re);
      if (m) return (to === "fr" ? fr : ar).replace(/\$(\d)/g, (_, n) => {
        const part = m[Number(n)] || "";
        return translate(part, to);   /* captured parts (names, amounts) are translated if they are known words */
      });
    }
    if (phraseRe) {
      let changed = false;
      const out = key.replace(phraseRe, found => { changed = true; return table.get(found)[to]; });
      if (changed) return out;
    }
    return text;
  }

  function translate(text, to = lang) {
    if (to === "en" || text == null) return text;
    const str = String(text);
    const id = to + "|" + str;
    if (cache.has(id)) return cache.get(id);
    const lead = (str.match(/^\s*/) || [""])[0];
    const trail = (str.match(/\s*$/) || [""])[0];
    const core = translateCore(str, to);
    const result = core === str ? str : lead + core.trim() + trail;
    if (cache.size > 4000) cache.clear();
    cache.set(id, result);
    return result;
  }

  /* ---------- DOM ---------- */
  const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "NOSCRIPT", "CODE", "PRE"]);
  const ATTRS = ["placeholder", "title", "aria-label", "alt"];
  const original = new WeakMap();   /* text node -> English text */
  const written = new WeakMap();    /* text node -> what this script last wrote */
  const attrOriginal = new WeakMap(); /* element -> { attr: [english, written] } */

  const skipped = node => {
    for (let el = node.nodeType === 1 ? node : node.parentElement; el; el = el.parentElement) {
      if (SKIP.has(el.tagName) || el.hasAttribute("data-notranslate") || el.classList.contains("notranslate")) return true;
    }
    return false;
  };

  const post = text => (window.MK_EDITION && window.MK_EDITION.localizeText ? window.MK_EDITION.localizeText(text) : text);

  /* the English text of an element, even while the page is shown in another language (other scripts that copy labels need the English, so the translation works again when the language changes) */
  window.mkOriginalText = el => {
    let out = "";
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) { const e = original.get(n); out += e !== undefined && n.nodeValue === written.get(n) ? e : n.nodeValue; }
    return out;
  };

  function doText(node) {
    if (skipped(node)) return;
    const current = node.nodeValue;
    let english = original.get(node);
    if (english === undefined || current !== written.get(node)) { english = current; original.set(node, english); }
    const next = post(lang === "en" ? english : translate(english));
    if (next !== current) node.nodeValue = next;
    written.set(node, next);
  }

  function doAttrs(el) {
    if (el.nodeType !== 1 || skipped(el)) return;
    let saved = attrOriginal.get(el);
    for (const name of ATTRS) {
      if (!el.hasAttribute(name)) continue;
      const current = el.getAttribute(name);
      saved = saved || {};
      const entry = saved[name];
      let english = entry && entry[1] === current ? entry[0] : current;
      const next = post(lang === "en" ? english : translate(english));
      if (next !== current) el.setAttribute(name, next);
      saved[name] = [english, next];
    }
    if (saved) attrOriginal.set(el, saved);
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    const start = root.nodeType === 9 ? root.documentElement : root;
    doAttrs(start);
    const iterator = document.createTreeWalker(start, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = iterator.nextNode())) {
      if (node.nodeType === 3) doText(node); else doAttrs(node);
    }
  }

  let observer = null;
  function observe() {
    if (observer || typeof MutationObserver === "undefined") return;
    observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === "characterData") doText(record.target);
        else if (record.type === "attributes") doAttrs(record.target);
        else record.addedNodes.forEach(node => walk(node));
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  function setDirection() {
    const root = document.documentElement;
    root.setAttribute("lang", lang);
    root.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
  }

  function apply() {
    setDirection();
    walk(document);
    const select = document.getElementById("lang-switch");
    if (select) select.value = lang;
  }

  /* ---------- language picker ---------- */
  function addPicker() {
    if (document.getElementById("lang-switch")) return;
    const select = document.createElement("select");
    select.id = "lang-switch";
    select.className = "lang-switch notranslate";
    select.setAttribute("aria-label", "Language");
    select.innerHTML = Object.entries(LANGS).map(([code, name]) => `<option value="${code}">${name}</option>`).join("");
    select.value = lang;
    select.addEventListener("change", () => setLanguage(select.value));
    const nav = document.querySelector("header nav");
    if (nav) nav.appendChild(select);
    else (document.querySelector("header") || document.body).appendChild(select);
  }

  /* the service worker shows push notifications and cannot read localStorage: leave the language where it can */
  function shareLang() {
    try { if (window.caches) caches.open("mk-lang").then(c => c.put("lang", new Response(lang))).catch(() => {}); } catch { /* optional */ }
  }

  function setLanguage(code) {
    if (!LANGS[code]) return;
    lang = code;
    shareLang();
    try { localStorage.setItem("mkLang", code); } catch { /* optional */ }
    cache.clear();
    apply();
    document.dispatchEvent(new CustomEvent("mk-language", { detail: { lang } }));
  }

  /* messages shown with the browser's own dialogs */
  for (const name of ["alert", "confirm", "prompt"]) {
    const native = window[name];
    if (typeof native !== "function") continue;
    window[name] = function (message, ...rest) { return native.call(window, translate(message), ...rest); };
  }

  shareLang();
  window.mkT = translate;
  window.mkLang = () => lang;
  window.mkSetLanguage = setLanguage;

  function start() {
    addPicker();
    apply();
    observe();
  }
  if (document.readyState === "loading") {
    setDirection();
    observe();
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
