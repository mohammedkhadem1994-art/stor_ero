"use strict";

/* Side chat (a drawer on the right). Requires store.js.
   - Order chat: the customer, the seller and the delivery partner of one order (and the administrator).
   - Support chat: the administrator and one person.
   Messages are written only by the server (sendMessage); this file reads them live and sends new ones. */

let chatStop = null;
let chatTarget = null;

function chatRoot() {
  let root = document.getElementById("chat-drawer");
  if (root) return root;
  root = document.createElement("aside");
  root.id = "chat-drawer";
  root.className = "chat-drawer";
  root.hidden = true;
  root.setAttribute("aria-label", "Chat");
  root.innerHTML = `
    <header class="chat-head"><button type="button" class="chat-back" id="chat-back" aria-label="Back to messages" hidden>‹</button><strong id="chat-title">Chat</strong>
      <button type="button" class="chat-close" aria-label="Close chat">×</button></header>
    <div class="chat-inbox" id="chat-inbox" hidden></div>
    <div class="chat-list" id="chat-list" aria-live="polite"></div>
    <form class="chat-form" id="chat-form">
      <input id="chat-input" type="text" maxlength="500" autocomplete="off" placeholder="Write a message…" required>
      <button type="submit" class="button button-teal">Send</button>
    </form>`;
  document.body.appendChild(root);

  root.querySelector(".chat-close").addEventListener("click", closeChat);
  root.querySelector("#chat-back").addEventListener("click", () => showInbox());
  root.querySelector("#chat-form").addEventListener("submit", async event => {
    event.preventDefault();
    const input = root.querySelector("#chat-input");
    const text = input.value.trim();
    if (!text || !chatTarget) return;
    const button = event.target.querySelector("button");
    button.disabled = true;
    try {
      await callFn("sendMessage", { ...chatTarget.payload, text });
      input.value = "";
    } catch (error) {
      console.error(error);
      showToast(authErrorMessage(error), "error");
    } finally {
      button.disabled = false;
      input.focus();
    }
  });
  return root;
}

function closeChat() {
  if (chatStop) { chatStop(); chatStop = null; }
  chatTarget = null;
  const root = document.getElementById("chat-drawer");
  if (root) root.hidden = true;
}

function renderChat(docs, myUid) {
  const list = document.getElementById("chat-list");
  if (!list) return;
  if (!docs.length) {
    list.innerHTML = '<p class="muted chat-empty">No messages yet. Say hello.</p>';
    return;
  }
  const labels = { customer: "Customer", merchant: "Seller", courier: "Delivery", admin: "Store" };
  list.innerHTML = docs.map(m => `
    <div class="chat-msg ${m.from === myUid ? "mine" : ""}">
      <small class="muted">${escapeHTML(m.name || labels[m.role] || "")}${m.role ? ` · ${escapeHTML(labels[m.role] || m.role)}` : ""}
        · ${escapeHTML(new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}</small>
      <div>${escapeHTML(m.text)}</div>
    </div>`).join("");
  list.scrollTop = list.scrollHeight;
}

function openChat(title, path, payload, fromInbox = false) {
  if (!initBackend()) return;
  const user = auth.currentUser;
  if (!user) return showToast("Sign in to use the chat.", "error");
  closeChat();
  const root = chatRoot();
  root.hidden = false;
  root.querySelector("#chat-inbox").hidden = true;
  root.querySelector("#chat-list").hidden = false;
  root.querySelector("#chat-form").hidden = false;
  root.querySelector("#chat-back").hidden = !fromInbox;
  root.querySelector("#chat-title").textContent = title;
  root.querySelector("#chat-list").innerHTML = '<p class="muted chat-empty">Loading…</p>';
  chatTarget = { payload };

  chatStop = db.collection(path).orderBy("at").limit(200).onSnapshot(snap => {
    renderChat(snap.docs.map(doc => ({ ...doc.data(), id: doc.id })), user.uid);
  }, error => {
    console.error(error);
    root.querySelector("#chat-list").innerHTML = '<p class="muted chat-empty">Could not load the messages.</p>';
  });
  setTimeout(() => { const input = root.querySelector("#chat-input"); if (input) input.focus(); }, 0);
}

/* Chat of one order (customer + seller + delivery). */
async function chatAllowed() {
  const state = await getAuthState().catch(() => ({}));
  if (state.isAdmin) return true;
  if ((await getFeatures()).global.chat === false) { showToast("Chat is switched off for now.", "error"); return false; }
  return true;
}

function openOrderChat(orderId, number) {
  chatAllowed().then(ok => { if (ok) openOrderChatNow(orderId, number); });
}

function openOrderChatNow(orderId, number) {
  openChat(`Order ${number || orderId}`, `orders/${orderId}/messages`, { orderId });
}

/* The administrator's chat with one person (admin: pass that person's uid; others: no argument). */
function openSupportChat(threadUid, name) {
  chatAllowed().then(ok => { if (ok) openSupportChatNow(threadUid, name); });
}

function openSupportChatNow(threadUid, name) {
  const user = auth.currentUser;
  const uid = threadUid || (user && user.uid);
  openChat(threadUid ? `Chat with ${name || "user"}` : "Messages from the store",
    `threads/${uid}/messages`, threadUid ? { threadUid } : {});
}

/* ---------- The inbox: every kind of sender has a box of its own (owner / supervisor / sellers / delivery partners / orders) ---------- */

const seenKey = (uid, key) => `seen:${uid}:${key}`;
const getSeen = (uid, key) => { try { return localStorage.getItem(seenKey(uid, key)) || ""; } catch { return ""; } };
const markSeen = (uid, key) => { try { localStorage.setItem(seenKey(uid, key), new Date().toISOString()); } catch { /* optional */ } };
const pairOf = (a, b) => [a, b].sort().join("_");
let inboxTab = "owner";

function openDirectChat(otherUid, name) {
  const user = auth.currentUser;
  markSeen(user.uid, pairOf(user.uid, otherUid));
  openChat(`Chat with ${name || "user"}`, `direct/${pairOf(user.uid, otherUid)}/messages`, { directUid: otherUid }, true);
}

async function loadInbox(user, state) {
  const boxes = [];
  const sellerView = state.merchant || state.courier;

  /* 1) the owner */
  let thread = null;
  try { const snap = await db.collection("threads").doc(user.uid).get(); thread = snap.exists ? snap.data() : null; } catch { /* optional */ }
  boxes.push({ key: "owner", label: "Owner", empty: "", items: [{
    title: "Messages from the store", sub: thread && thread.lastText ? thread.lastText : "Write to the store owner.",
    unread: Boolean(thread && thread.lastFrom === "admin" && thread.lastAt > getSeen(user.uid, "thread")),
    open: () => { markSeen(user.uid, "thread"); openChat("Messages from the store", `threads/${user.uid}/messages`, {}, true); }
  }] });

  /* what the direct chats look like right now */
  const direct = new Map();
  try {
    const snap = await db.collection("direct").where("participants", "array-contains", user.uid).get();
    snap.docs.forEach(doc => { const d = doc.data(); const other = (d.participants || []).find(id => id !== user.uid); if (other) direct.set(other, d); });
  } catch (error) { console.error(error); }
  const directItem = (uid, name, fallback) => {
    const d = direct.get(uid);
    return { title: name || fallback, sub: d ? d.lastText : "No messages yet.",
      unread: Boolean(d && d.lastFrom !== user.uid && d.lastAt > getSeen(user.uid, pairOf(user.uid, uid))),
      open: () => openDirectChat(uid, name || fallback) };
  };

  /* 2) the supervisor who invited me */
  if (sellerView && sellerView.invitedBy) boxes.push({ key: "supervisor", label: "Supervisor", items: [directItem(sellerView.invitedBy, "", "Your supervisor")] });

  /* 3) a supervisor: the sellers and delivery partners he invited */
  if (state.supervisor) {
    const people = async (collection, key, label, fallback) => {
      try {
        const snap = await db.collection(collection).where("invitedBy", "==", user.uid).get();
        boxes.push({ key, label, empty: `Nobody yet. Invite people from the Invite tab.`,
          items: snap.docs.map(doc => { const d = doc.data(); return directItem(doc.id, d.businessName || d.fullName || d.email, fallback); }) });
      } catch (error) { console.error(error); }
    };
    await people("merchants", "sellers", "Sellers", "Seller");
    await people("couriers", "couriers", "Delivery partners", "Delivery partner");
  }

  /* 4) the orders (customer, seller and delivery partner of each order chat together) */
  const fields = ["uid"]; if (state.merchant) fields.push("merchantId"); if (state.courier) fields.push("courierId");
  const found = new Map();
  for (const field of fields) {
    try { (await getOrdersWhere(field, user.uid)).forEach(o => found.set(o.id, o)); } catch (error) { console.error(error); }
  }
  const orders = [...found.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 15);
  boxes.push({ key: "orders", label: "Orders", empty: "No orders yet.", items: orders.map(o => ({
    title: o.number || o.id, sub: `${o.merchantName || "Store"} · ${o.status || ""}`, unread: false, open: () => openOrderChatNow(o.id, o.number) })) });
  return boxes;
}

async function showInbox() {
  if (!initBackend()) return;
  const user = auth.currentUser;
  if (!user) return showToast("Sign in to use the chat.", "error");
  closeChat();
  const root = chatRoot();
  root.hidden = false;
  root.querySelector("#chat-list").hidden = true;
  root.querySelector("#chat-form").hidden = true;
  root.querySelector("#chat-back").hidden = true;
  root.querySelector("#chat-title").textContent = "Messages";
  const pane = root.querySelector("#chat-inbox");
  pane.hidden = false;
  pane.innerHTML = '<p class="muted chat-empty">Loading…</p>';

  const state = await getAuthState().catch(() => ({}));
  const boxes = await loadInbox(user, state);
  if (!boxes.some(box => box.key === inboxTab)) inboxTab = "owner";
  const draw = () => {
    const box = boxes.find(item => item.key === inboxTab) || boxes[0];
    pane.innerHTML = `<nav class="inbox-tabs" role="tablist">${boxes.map(item => {
      const fresh = item.items.filter(x => x.unread).length;
      return `<button type="button" role="tab" class="inbox-tab ${item.key === box.key ? "active" : ""}" data-tab="${item.key}" aria-selected="${item.key === box.key}">${escapeHTML(item.label)}${fresh ? ` <span class="unread-pill">${fresh}</span>` : ""}</button>`;
    }).join("")}</nav>
      <div class="inbox-list">${box.items.length ? box.items.map((item, i) => `<button type="button" class="inbox-item ${item.unread ? "unread" : ""}" data-i="${i}">
        <strong>${escapeHTML(item.title)}</strong>${item.unread ? ' <span class="unread-pill">new</span>' : ""}<small class="muted">${escapeHTML(item.sub || "")}</small></button>`).join("")
        : `<p class="muted chat-empty">${escapeHTML(box.empty || "Nothing here yet.")}</p>`}</div>`;
    pane.querySelectorAll(".inbox-tab").forEach(btn => btn.addEventListener("click", () => { inboxTab = btn.dataset.tab; draw(); }));
    pane.querySelectorAll(".inbox-item").forEach(btn => btn.addEventListener("click", () => box.items[Number(btn.dataset.i)].open()));
  };
  draw();
}

/* A "Messages" button for every signed-in person except the administrator: it opens the inbox. */
function addSupportButton(user, isAdmin) {
  if (isAdmin || document.getElementById("support-fab")) return;
  const button = document.createElement("button");
  button.id = "support-fab";
  button.type = "button";
  button.className = "support-fab";
  button.textContent = "Messages";
  button.addEventListener("click", () => chatAllowed().then(ok => { if (ok) showInbox(); }));
  document.body.appendChild(button);

  /* A red dot when somebody wrote to you since you last looked (the owner, or your supervisor / the people you invited). */
  let owner = false, directs = false;
  const paint = () => button.classList.toggle("has-new", owner || directs);
  try {
    db.collection("threads").doc(user.uid).onSnapshot(snap => {
      const d = snap.exists ? snap.data() : null;
      owner = Boolean(d && d.lastFrom === "admin" && d.lastAt && d.lastAt > getSeen(user.uid, "thread"));
      paint();
    }, () => {});
    db.collection("direct").where("participants", "array-contains", user.uid).onSnapshot(snap => {
      directs = snap.docs.some(doc => {
        const d = doc.data(); const other = (d.participants || []).find(id => id !== user.uid);
        return d.lastFrom !== user.uid && d.lastAt > getSeen(user.uid, pairOf(user.uid, other));
      });
      paint();
    }, () => {});
  } catch { /* optional */ }
}

/* Any element with data-chat-order="ORDER_ID" opens that order's chat. */
document.addEventListener("click", event => {
  const button = event.target.closest("[data-chat-order]");
  if (button) openOrderChat(button.dataset.chatOrder, button.dataset.chatNumber);
});
