/* Discount code box on the checkout (the store's own products). The page's order call sends window.MK_COUPON. */
(function () {
  "use strict";
  document.addEventListener("DOMContentLoaded", () => {
    const box = document.getElementById("coupon-box");
    if (!box || !(window.MK_EDITION && MK_EDITION.dz)) return;
    box.hidden = false;
    const input = document.getElementById("coupon-code"), msg = document.getElementById("coupon-msg");
    document.getElementById("coupon-apply").addEventListener("click", async () => {
      window.MK_COUPON = "";
      const code = input.value.trim();
      if (!code) { msg.textContent = ""; return; }
      msg.classList.remove("error"); msg.textContent = "Checking…";
      try {
        const lines = typeof getCartLines === "function" ? await getCartLines() : [];
        const r = await callFn("checkCoupon", { code, items: typeof cartPayload === "function" ? cartPayload(lines) : [] });
        window.MK_COUPON = r.code;
        msg.textContent = `✓ ${r.code}: you save ${formatPrice(r.discount)}. New total: ${formatPrice(r.total)} (plus delivery if any).`;
      } catch (e) { msg.classList.add("error"); msg.textContent = (e && e.message) || "This code is not valid."; }
    });
  });
})();
