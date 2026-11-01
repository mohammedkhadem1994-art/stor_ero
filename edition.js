"use strict";
/* Which edition is this? European edition: euro, plus US dollar and British pound at the rates the owner sets. */
window.MK_EDITION = (function () {
  const id = "eu";
  const dz = false;
  return { id, dz, eu: true, currency: "EUR", dinar: v => String(v), localizeText: text => text, creditMethod: false };
})();
