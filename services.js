"use strict";
/* The customer's home: shop, doctor, travel ticket, taxi (and). */
document.addEventListener("DOMContentLoaded", () => {
  const credit = document.getElementById("svc-credit");
  if (credit && window.MK_EDITION && window.MK_EDITION.dz) credit.hidden = false;
  const board = document.getElementById("svc-board");
  if (board && window.MK_EDITION && window.MK_EDITION.dz) board.hidden = false;
});
