"use strict";

/* How each kind of notification looks on the phone: icon in the title, vibration pattern, whether it stays until read,
   and whether the open page already announces it itself (live order lists). Kept equal to functions/notify.js KINDS (a test checks it). */
var PUSH_KINDS = {
  order_new: {icon: "🛒", urgent: true, vibrate: [200, 100, 200, 100, 400], live: true},
  admin_order: {icon: "🧾", urgent: false, vibrate: [120], live: false},
  order_accepted: {icon: "✅", urgent: false, vibrate: [150, 80, 150], live: true},
  order_rejected: {icon: "❌", urgent: true, vibrate: [400, 150, 400], live: true},
  order_almost: {icon: "⏳", urgent: false, vibrate: [100, 60, 100], live: true},
  order_ready: {icon: "🍽️", urgent: true, vibrate: [250, 100, 250], live: true},
  order_ready_courier: {icon: "🏃", urgent: true, vibrate: [250, 100, 250], live: true},
  order_onway: {icon: "🚚", urgent: false, vibrate: [100, 50, 100, 50, 100], live: true},
  order_delivered: {icon: "📦", urgent: false, vibrate: [300], live: true},
  order_delivered_seller: {icon: "💵", urgent: false, vibrate: [300], live: true},
  handover: {icon: "🤝", urgent: false, vibrate: [200, 100, 200], live: true},
  courier_request: {icon: "🛵", urgent: true, vibrate: [300, 100, 300, 100, 300], live: true},
  courier_cancelled: {icon: "🚫", urgent: false, vibrate: [400], live: true},
  courier_accepted: {icon: "👍", urgent: false, vibrate: [150, 80, 150], live: true},
  courier_declined: {icon: "↩️", urgent: true, vibrate: [300, 150, 300], live: true},
  booking_new: {icon: "📅", urgent: true, vibrate: [200, 100, 200, 100, 400], live: false},
  booking_confirmed: {icon: "✔️", urgent: false, vibrate: [150, 80, 150], live: false},
  booking_declined: {icon: "✖️", urgent: false, vibrate: [400], live: false},
  booking_cancelled: {icon: "🗓️", urgent: false, vibrate: [400], live: false},
  booking_done: {icon: "🏁", urgent: false, vibrate: [200], live: false},
  booking_price: {icon: "💲", urgent: true, vibrate: [200, 100, 200], live: false},
  reminder: {icon: "⏰", urgent: true, vibrate: [500, 200, 500], live: false},
  slot_free: {icon: "🔔", urgent: false, vibrate: [100, 50, 100, 50, 100], live: false},
  prescription: {icon: "💊", urgent: false, vibrate: [200], live: false},
  ticket: {icon: "🎫", urgent: false, vibrate: [200], live: false},
  chat: {icon: "💬", urgent: false, vibrate: [80, 40, 80], live: false},
  chat_order: {icon: "💬", urgent: false, vibrate: [80, 40, 80], live: false},
  report: {icon: "📝", urgent: false, vibrate: [120], live: false},
  pay_ok: {icon: "💰", urgent: false, vibrate: [150, 80, 150], live: true},
  debt_claim: {icon: "🧮", urgent: false, vibrate: [120], live: false},
  board_news: {icon: "📢", urgent: false, vibrate: [120], live: false},
  debt_paid: {icon: "🧾", urgent: false, vibrate: [150, 80, 150], live: false},
  paused: {icon: "⚠️", urgent: true, vibrate: [600, 200, 600], live: false},
  plan: {icon: "🌟", urgent: false, vibrate: [200], live: false},
  account_ok: {icon: "🎉", urgent: false, vibrate: [200, 100, 200, 100, 200], live: false},
  account_no: {icon: "⛔", urgent: true, vibrate: [500], live: false},
  account_hold: {icon: "🔒", urgent: true, vibrate: [500], live: false},
  account_open: {icon: "🔓", urgent: false, vibrate: [200], live: false},
  team: {icon: "👥", urgent: false, vibrate: [150], live: false},
  promoted: {icon: "🎖️", urgent: true, vibrate: [300, 100, 300, 100, 600], live: false},
  test: {icon: "🧪", urgent: false, vibrate: [100], live: false},
  event: {icon: "🔔", urgent: false, vibrate: [100], live: false}
};

/* Everything a notification needs: title with icon, vibration, tag and whether it stays on screen. */
function pushLook(data) {
  var kind = PUSH_KINDS[data && data.type] || PUSH_KINDS.event;
  return { title: kind.icon + " " + ((data && data.title) || "Plazavo"), vibrate: kind.vibrate, urgent: kind.urgent, live: kind.live, tag: ((data && data.type) || "event") + ":" + ((data && data.link) || "") };
}
