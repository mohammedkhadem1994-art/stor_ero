"use strict";
/* Translates the text of a push notification in the service worker, which cannot read the page's language.
   The page saves its language in the cache "mk-lang" (i18n.js); this file uses the same tables as the pages (i18n-data.js). */
var pushT = (function () {
  var root = typeof self !== "undefined" ? self : this;
  if (!root.window) root.window = root;
  try { importScripts("i18n-data.js"); } catch (e) { /* no translations: English stays */ }
  var DATA = root.MK_I18N_DATA || [], PATTERNS = root.MK_I18N_PATTERNS || [];
  var norm = function (t) { return String(t).replace(/\s+/g, " ").trim(); };
  var table = new Map();
  DATA.forEach(function (r) { table.set(norm(r[0]), { fr: r[1], ar: r[2] }); });
  function tr(text, to) {
    var key = norm(text);
    if (!key || to === "en" || (to !== "fr" && to !== "ar")) return text;
    var hit = table.get(key);
    if (hit) return hit[to];
    for (var i = 0; i < PATTERNS.length; i++) {
      var m = key.match(PATTERNS[i][0]);
      if (m) return (to === "fr" ? PATTERNS[i][1] : PATTERNS[i][2]).replace(/\$(\d)/g, function (_, n) { return tr(m[Number(n)] || "", to); });
    }
    return text;
  }
  /* a body like "A-123 · €50.00 · cash on delivery — open your dashboard": translate each part between the dots */
  function body(text, to) {
    var whole = tr(text, to);
    if (whole !== text) return whole;
    return String(text).split(" · ").map(function (p) { return tr(p, to); }).join(" · ");
  }
  function lang() {
    return caches.open("mk-lang").then(function (c) { return c.match("lang"); }).then(function (r) { return r ? r.text() : "en"; }).catch(function () { return "en"; });
  }
  return { tr: tr, body: body, lang: lang };
})();
