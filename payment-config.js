"use strict";

/*
  PAYMENT SETTINGS (PUBLIC file — it is on GitHub, so it must NOT contain private details).

  Here you only switch methods ON with { enabled: true }.
  The private details (IBAN, links, addresses) go in functions/payment-details.js,
  which stays on your computer and is sent to Firebase. Buyers see them only after placing an order.
*/

const PAYMENT = {
  /* PayPal with automatic confirmation (buttons on the page): paste the CLIENT ID (public, not the secret).
     Leave empty until you have a PayPal Developer app. */
  paypal: { clientId: "" },

  /* PayPal.me: a simple PayPal payment link (you confirm payments by hand). Set the link in payment-details.js. */
  paypalme: { enabled: false },

  revolut: { enabled: false },
  postepay: { enabled: false },
  alipay: { enabled: false },
  wise: { enabled: false },
  crypto: { enabled: false },

  /* Free-text method: write its visible name here, its details in payment-details.js */
  other: { enabled: false, label: "" },

  bank: { enabled: false }
};
