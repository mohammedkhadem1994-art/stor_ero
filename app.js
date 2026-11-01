"use strict";

/* Storefront: product grid with search/filter/sort, cart and checkout.
   Requires store.js (and invoice.js on the checkout page). */

const filters = { search: "", category: "all", seller: new URLSearchParams(location.search).get("seller") || "all", sort: "featured" };
let jumpToSeller = filters.seller !== "all";   /* a partner's own link (QR card): show only his products */
let allProducts = [];

function filteredProducts() {
  const query = filters.search.trim().toLowerCase();

  const list = allProducts.filter(product => {
    if (filters.category !== "all" && (product.category || "") !== filters.category) return false;
    if (filters.seller !== "all" && (product.merchantId || "store") !== filters.seller) return false;
    if (!query) return true;
    return [product.name, product.category, product.description]
      .some(text => String(text || "").toLowerCase().includes(query));
  });

  const sorters = {
    "price-asc": (a, b) => Number(a.price) - Number(b.price),
    "price-desc": (a, b) => Number(b.price) - Number(a.price),
    "name": (a, b) => String(a.name).localeCompare(String(b.name))
  };
  if (sorters[filters.sort]) list.sort(sorters[filters.sort]);

  return list;
}

/* Seller choices (top strip and toolbar) are built from the products that are really on sale. */
function renderSellerOptions() {
  const names = new Map();
  allProducts.forEach(product => { names.set(product.merchantId || "store", product.merchantName || "Plazavo (store)"); });
  const sellers = [...names.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  if (filters.seller !== "all" && !names.has(filters.seller)) filters.seller = "all";
  ["seller-filter", "seller-filter-top"].forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = '<option value="all">All sellers</option>' +
      sellers.map(([key, name]) => `<option value="${escapeHTML(key)}">${escapeHTML(name)}</option>`).join("");
    select.value = filters.seller;
  });
}

function renderChips() {
  const catIcon = name => {
    const k = String(name || "").toLowerCase();
    const map = [[/^all$|^$/, "✨"], [/perfum|parfum|عطر|fragran/, "🧴"], [/access|bijou|jewel|إكسس/, "💍"], [/phone|mobile|هاتف/, "📱"], [/watch|montre|ساع/, "⌚"], [/fashion|cloth|shoe|wear|ملاب|حذاء/, "👗"], [/electr|computer|laptop|إلكتر/, "🔌"], [/restaur|food|meal|مطعم|طعام/, "🍽️"], [/gift|هد/, "🎁"], [/shop|store|متجر/, "🛍️"], [/beauty|cosmet|تجميل/, "💄"], [/home|house|furnit|منزل/, "🏠"], [/book|كتاب/, "📚"], [/sport|رياض/, "⚽"], [/toy|لعب/, "🧸"], [/robot|digital|software/, "🤖"]];
    for (const [re, icon] of map) if (re.test(k)) return icon;
    return "🏷️";
  };
  const box = document.getElementById("cat-chips");
  if (!box) return;
  const counts = {};
  allProducts.forEach(product => { if (product.category) counts[product.category] = (counts[product.category] || 0) + 1; });
  const names = Object.keys(counts).sort();
  box.innerHTML = [["all", "All", allProducts.length], ...names.map(name => [name, name, counts[name]])].map(([value, label, n]) =>
    `<button type="button" class="chip${filters.category === value ? " active" : ""}" data-cat="${escapeHTML(value)}"><span class="chip-icon" aria-hidden="true">${catIcon(value)}</span><span>${escapeHTML(label)}</span> <small>${n}</small></button>`).join("");
}

function renderCategoryOptions() {
  renderSellerOptions();
  if (jumpToSeller && filters.seller !== "all") { jumpToSeller = false; setTimeout(() => { const el = document.getElementById("products"); if (el && el.scrollIntoView) el.scrollIntoView(); }, 300); }
  renderChips();
  const select = document.getElementById("category-filter");
  if (!select) return;

  const categories = [...new Set(allProducts.map(product => product.category).filter(Boolean))].sort();
  select.innerHTML = '<option value="all">All categories</option>' +
    categories.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join("");

  if (!categories.includes(filters.category)) filters.category = "all";
  select.value = filters.category;
  renderChips();
}

function productCard(product) {
  const imageUrl = imageSrc(product.image);
  const image = imageUrl
    ? `<img src="${escapeHTML(imageUrl)}" alt="${escapeHTML(product.name)}" loading="lazy">`
    : `<div class="product-placeholder"><span>P</span><small>${escapeHTML(product.category || "Digital resource")}</small></div>`;

  const embedUrl = getVideoEmbed(product.video || "");
  const videoUrl = safeHttpsUrl(product.video);
  let video = "";

  if (embedUrl) {
    video = `<div class="video-frame"><iframe src="${escapeHTML(embedUrl)}" title="${escapeHTML(product.name)} video" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`;
  } else if (videoUrl) {
    video = `<video class="product-video" controls preload="none" src="${escapeHTML(videoUrl)}"></video>`;
  }

  return `
    <article class="product-card" data-id="${escapeHTML(product.id)}">
      <div class="product-image">${image}</div>
      <div class="product-content">
        <span class="product-category">${escapeHTML(product.category || "Digital product")}${product.weightKg > 0 ? ` · ⚖ ${Number(product.weightKg)} kg` : ""}</span>
        <h3>${escapeHTML(product.name)}</h3>
        ${product.merchantName ? `<small class="sold-by">Sold by ${escapeHTML(product.merchantName)}</small>` : ""}
        ${payChipsHTML(payFlagsOf(product))}
        <p>${escapeHTML(product.description || "")}</p>
        ${video ? `<details class="product-media"><summary>Watch product video</summary>${video}</details>` : ""}
        <div class="product-card-footer">
          <strong class="product-price">${product.listPrice ? `<s class="old-price">${formatPrice(product.listPrice)}</s> ` : ""}${formatPrice(product.price)}${product.listPrice ? ` <span class="offer-badge">-${Number(product.discountPercent)}%</span>` : ""}</strong>
          ${product.demo ? '<span class="status-pill demo-tag">Demo: not for sale</span>' : product.available === false ? '<span class="status-pill status-hidden">Not available now</span>' : `<button class="button button-teal add-to-cart" type="button" data-id="${escapeHTML(product.id)}">Add to cart</button> <button class="button buy-now" type="button" data-id="${escapeHTML(product.id)}">Buy now</button>`}
          ${Number(product.prepMinutes) > 0 ? `<small class="muted prep-note">🍳 About ${Number(product.prepMinutes)} min to prepare</small>` : ""}
        </div>
        ${(() => { const r = (window.MK_RATINGS || {})[`p-${product.id}`]; return `<button class="stars-link" type="button" data-id="${escapeHTML(product.id)}" data-name="${escapeHTML(product.name)}">${r && r.n ? `<span class="stars-line" aria-hidden="true">${"★".repeat(Math.round(r.sum / r.n))}${"☆".repeat(5 - Math.round(r.sum / r.n))}</span> ${(r.sum / r.n).toFixed(1)} (${r.n})` : "☆ Reviews"}</button>`; })()}
        <button class="share-product" type="button" data-id="${escapeHTML(product.id)}" aria-label="Share ${escapeHTML(product.name)}">↗ Share</button>
      </div>
    </article>`;
}

let loadFailed = false;

/* A seller's own page (his link or QR): the cover, the round picture and the name like a social page, and his faint background */
const sellerLooks = {};
async function renderSellerHead() {
  const id = filters.seller, sec = document.getElementById("products");
  let head = document.getElementById("seller-head"), back = document.getElementById("seller-backdrop");
  if (!sec) return;
  if (id === "all" || id === "store") { if (head) head.hidden = true; if (back) back.hidden = true; return; }
  if (!head) { head = document.createElement("div"); head.id = "seller-head"; head.className = "page-head"; sec.insertAdjacentElement("afterbegin", head); }
  if (!back) { back = document.createElement("div"); back.id = "seller-backdrop"; back.className = "dr-backdrop"; back.setAttribute("aria-hidden", "true"); document.body.appendChild(back); }
  if (!sellerLooks[id]) { try { sellerLooks[id] = await callFn("providerLook", { id }); } catch { sellerLooks[id] = {}; } }
  if (filters.seller !== id) return;
  const l = sellerLooks[id], c = imageSrc(l.cover), b = imageSrc(l.backdrop), ph = imageSrc(l.photo), nm = l.name || "";
  head.hidden = !(c || ph || nm);
  head.innerHTML = `<div class="ph-cover">${c ? `<img src="${escapeHTML(c)}" alt="">` : ""}</div><div class="ph-row"><div class="ph-avatar">${ph ? `<img src="${escapeHTML(ph)}" alt="">` : `<span>${escapeHTML((nm || "?").charAt(0).toUpperCase())}</span>`}</div><div class="ph-id"><h2>${escapeHTML(nm)}</h2><p class="muted">${escapeHTML([l.about, l.city].filter(Boolean).join(" · "))}</p></div></div>`;
  back.style.backgroundImage = b ? `url("${b}")` : ""; back.hidden = !b;
}

function renderStore() {
  try { renderSellerHead(); } catch { /* optional */ }
  const container = document.getElementById("product-grid");
  if (!container) return;

  const products = filteredProducts();

  const count = document.getElementById("product-count");
  if (count) {
    count.textContent = allProducts.length === products.length
      ? `${products.length} product${products.length === 1 ? "" : "s"}`
      : `${products.length} of ${allProducts.length} products`;
  }

  if (loadFailed) {
    container.innerHTML = `
      <div class="empty-store">
        <h3>The catalogue could not be loaded</h3>
        <p>Please check your connection and reload the page.</p>
      </div>`;
    if (count) count.textContent = "";
    return;
  }

  if (!allProducts.length) {
    container.innerHTML = `
      <div class="empty-store">
        <h3>New products are coming soon</h3>
        <p>Please check back later.</p>
      </div>`;
    return;
  }

  if (!products.length) {
    container.innerHTML = `
      <div class="empty-store">
        <h3>No products match your search</h3>
        <p><button type="button" class="button button-secondary" id="reset-filters">Clear filters</button></p>
      </div>`;
    return;
  }

  container.innerHTML = products.map(productCard).join("");
  if (typeof highlightSharedProduct === "function" && !renderStore.highlighted) { renderStore.highlighted = true; highlightSharedProduct(); }
}

/* The haircut styles the barbers uploaded (photo, name, price): shown in the store, with a button that opens the booking of that barber with the style chosen. */
/* The announcements in the side rail: written by the owner (settings/ads), shown to every visitor. Only https links and pictures are used. */
const safeHttpsUrl = u => { const v = String(u || "").trim(); return /^https:\/\/[^\s"'<>]+$/i.test(v) ? v : ""; };
async function loadRailAds() {
  const box = document.getElementById("rail-ads"), list = document.getElementById("rail-ads-list");
  if (!box || !list) return;
  try {
    const snap = await db.collection("settings").doc("ads").get();
    const items = (snap.exists && Array.isArray(snap.data().items) ? snap.data().items : []).filter(x => x && (x.title || x.text)).slice(0, 5);
    if (!items.length) { box.hidden = true; return; }
    list.innerHTML = items.map(x => {
      const link = safeHttpsUrl(x.link), img = safeHttpsUrl(x.image);
      const body = `${img ? `<img src="${escapeHTML(img)}" alt="" loading="lazy">` : ""}${x.title ? `<strong>${escapeHTML(x.title)}</strong>` : ""}${x.text ? `<span>${escapeHTML(x.text)}</span>` : ""}`;
      return link ? `<a class="rail-ad" href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer sponsored">${body}</a>` : `<div class="rail-ad">${body}</div>`;
    }).join("");
    box.hidden = false;
  } catch (error) { console.error("Announcements not loaded:", error); box.hidden = true; }
}

async function loadStyleShowcase() {
  const section = document.getElementById("styles-showcase"), grid = document.getElementById("style-grid");
  if (!section || !grid) return;
  try {
    const [snap, list] = await Promise.all([
      db.collection("styles").where("visible", "==", true).limit(40).get(),
      callFn("listProviders", { service: "barber" })
    ]);
    const barbers = {}; (list.providers || []).forEach(b => { barbers[b.id] = b; });
    const rows = snap.docs.map(d => ({ ...d.data(), id: d.id })).filter(x => barbers[x.merchantId])
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    if (!rows.length) { section.hidden = true; return; }
    grid.innerHTML = rows.map(x => {
      const b = barbers[x.merchantId], img = imageSrc(x.image);
      return `<article class="product-card style-card">
        <div class="product-image">${img ? `<img src="${escapeHTML(img)}" alt="${escapeHTML(x.name)}" loading="lazy">` : '<div class="product-placeholder"><span>💈</span></div>'}</div>
        <div class="product-content">
          <span class="product-category">💈 ${escapeHTML(b.name || "Barber")}${b.city ? " · " + escapeHTML(b.city) : ""}</span>
          <h3>${escapeHTML(x.name)}</h3>
          ${payChipsHTML(b.pay || payFlagsOf(null))}
          <div class="product-card-footer"><strong class="product-price">${formatPrice(x.price)}</strong>
            <a class="button button-teal" href="barbers.html?provider=${encodeURIComponent(x.merchantId)}&style=${encodeURIComponent(x.id)}">Book this style</a></div>
        </div></article>`;
    }).join("");
    section.hidden = false;
  } catch (error) { console.error("Styles not loaded:", error); section.hidden = true; }
}

async function loadStore() {
  const container = document.getElementById("product-grid");
  if (!container) return;
  loadStyleShowcase();
  loadRailAds();

  container.innerHTML = '<div class="empty-store"><p>Loading products…</p></div>';

  try {
    allProducts = await loadProducts();
  } catch (error) {
    console.error("Could not load products:", error);
    loadFailed = true;
  }

  renderCategoryOptions();
  renderStore();
}

/* ---------- Products / shops and restaurants (two views of the same page) ---------- */
const storeView = { view: "products", kind: "all", list: null, failed: false };
const STORE_KIND_NAMES = { shop: "Shops", restaurant: "Restaurants", pharmacy: "Pharmacies" };
const STORE_KIND_ONE = { shop: "Shop", restaurant: "Restaurant", pharmacy: "Pharmacy" };
const STORE_ICON = { shop: "🏪", restaurant: "🍽️", pharmacy: "💊" };
function storesShown() {
  const query = filters.search.trim().toLowerCase();
  const count = {};
  allProducts.forEach(p => { const id = p.merchantId || ""; if (id) count[id] = (count[id] || 0) + 1; });
  return (storeView.list || []).map(x => ({ ...x, products: count[x.id] || 0 }))
    .filter(x => x.products > 0 && (storeView.kind === "all" || x.kind === storeView.kind)
      && (!query || [x.name, x.city, x.about].some(t => String(t || "").toLowerCase().includes(query))));
}
function renderStoresView() {
  const grid = document.getElementById("store-grid");
  if (!grid || storeView.view !== "stores") return;
  const kinds = document.getElementById("store-kinds");
  const present = ["all", ...["shop", "restaurant", "pharmacy"].filter(k => (storeView.list || []).some(x => x.kind === k))];
  if (kinds) kinds.innerHTML = present.map(k => `<button type="button" class="chip${storeView.kind === k ? " active" : ""}" data-kind="${k}"><span class="chip-icon" aria-hidden="true">${k === "all" ? "✨" : STORE_ICON[k]}</span><span>${escapeHTML(k === "all" ? "All" : STORE_KIND_NAMES[k])}</span></button>`).join("");
  const count = document.getElementById("store-count");
  if (storeView.list === null) { grid.innerHTML = storeView.failed ? '<div class="empty-store"><h3>The list could not be loaded</h3><p>Please check your connection and try again.</p></div>' : '<div class="empty-store"><p>Loading…</p></div>'; if (count) count.textContent = ""; return; }
  const rows = storesShown();
  if (count) count.textContent = `${rows.length} ${rows.length === 1 ? "partner" : "partners"}`;
  grid.innerHTML = rows.length ? rows.map(x => `<article class="store-card" data-store="${escapeHTML(x.id)}" tabindex="0" role="button">
      ${thumbHTML(x.id, x.name, STORE_ICON[x.kind] || "🏪")}
      <strong class="notranslate">${escapeHTML(x.name)}${x.demo ? ' <span class="demo-tag">Demo</span>' : ""}</strong>
      <small class="muted">${escapeHTML(STORE_KIND_ONE[x.kind] || "")}${x.city ? " · " + escapeHTML(x.city) : ""}</small>
      ${x.about ? `<small>${escapeHTML(x.about)}</small>` : ""}
      <span class="store-card-count">${x.products} ${x.products === 1 ? "product" : "products"}</span>
      <span class="button button-teal store-card-open">See the products</span></article>`).join("")
    : '<div class="empty-store"><h3>No shop or restaurant matches</h3><p>Try another word or kind.</p></div>';
  hydratePickThumbs(grid);
}
async function setStoreView(view) {
  storeView.view = view === "stores" ? "stores" : "products";
  document.querySelectorAll("#view-tabs .view-tab").forEach(b => { const on = b.dataset.view === storeView.view; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
  const pb = document.getElementById("products-box"), sb = document.getElementById("store-grid-box");
  if (pb) pb.hidden = storeView.view !== "products";
  if (sb) sb.hidden = storeView.view !== "stores";
  if (storeView.view === "stores") {
    renderStoresView();
    if (storeView.list === null) {
      try { storeView.list = (await callFn("listStores", {})).stores || []; storeView.failed = false; }
      catch (error) { console.error(error); storeView.failed = true; }
      renderStoresView();
    }
  }
}
function setupStoreViews() {
  const tabs = document.getElementById("view-tabs");
  if (!tabs) return;
  tabs.addEventListener("click", event => { const b = event.target.closest(".view-tab"); if (b) setStoreView(b.dataset.view); });
  const box = document.getElementById("store-grid-box");
  const pick = card => {
    filters.seller = card.dataset.store; filters.category = "all";
    ["seller-filter", "seller-filter-top"].forEach(id => { const o = document.getElementById(id); if (o) o.value = filters.seller; });
    setStoreView("products"); renderStore();
    const target = document.getElementById("products"); if (target && target.scrollIntoView) target.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  if (box) {
    box.addEventListener("click", event => {
      const chip = event.target.closest("#store-kinds .chip"); if (chip) { storeView.kind = chip.dataset.kind; renderStoresView(); return; }
      const card = event.target.closest(".store-card"); if (card) pick(card);
    });
    box.addEventListener("keydown", event => { const card = event.target.closest(".store-card"); if (card && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); pick(card); } });
  }
  /* a partner's own link (?seller=…) goes straight to his products */
}

function setupStoreControls() {
  const search = document.getElementById("product-search");
  const category = document.getElementById("category-filter");
  const sort = document.getElementById("sort-select");
  if (!search || !category || !sort) return;

  let timer;
  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      filters.search = search.value;
      renderStore(); renderStoresView();
    }, 150);
  });

  category.addEventListener("change", () => {
    filters.category = category.value;
    renderChips();
    renderStore();
  });

  const toProducts = () => { const target = document.getElementById("products"); if (target && target.scrollIntoView) target.scrollIntoView({ behavior: "smooth", block: "start" }); };
  ["seller-filter", "seller-filter-top"].forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    select.addEventListener("change", () => {
      filters.seller = select.value;
      ["seller-filter", "seller-filter-top"].forEach(other => { const o = document.getElementById(other); if (o) o.value = filters.seller; });
      renderStore();
      toProducts();
    });
  });
  setupStoreViews();
  const chips = document.getElementById("cat-chips");
  if (chips) chips.addEventListener("click", event => {
    const chip = event.target.closest(".chip"); if (!chip) return;
    filters.category = chip.dataset.cat;
    category.value = filters.category;
    renderChips(); renderStore(); toProducts();
  });
  /* one search bar under the cover: choosing a category / seller / order, or pressing Enter, brings the results into view */
  ["category-filter", "sort-select"].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener("change", toProducts); });
  const sb = document.getElementById("product-search");
  if (sb) sb.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); toProducts(); } });
  const clearTop = document.getElementById("quick-clear");
  if (clearTop) clearTop.addEventListener("click", () => resetAll());

  sort.addEventListener("change", () => {
    filters.sort = sort.value;
    renderStore();
  });

  function resetAll() {
    filters.search = ""; filters.category = "all"; filters.seller = "all"; filters.sort = "featured";
    search.value = ""; category.value = "all"; sort.value = "featured";
    ["seller-filter", "seller-filter-top"].forEach(id => { const o = document.getElementById(id); if (o) o.value = "all"; });
    renderChips(); renderStore();
  }
  document.addEventListener("click", event => {
    if (!event.target.closest("#reset-filters")) return;
    resetAll();
  });
}

/* ---------- Cart ---------- */

async function getCartLines() {
  const products = new Map((await loadProducts()).map(product => [product.id, product]));
  return getCart()
    .map(item => ({ product: products.get(item.id), quantity: Math.max(1, Number(item.quantity) || 1) }))
    .filter(line => line.product);
}

async function renderCart() {
  const cartItems = document.getElementById("cart-items");
  if (!cartItems) return;

  let lines = [];
  try {
    lines = await getCartLines();
  } catch (error) {
    console.error(error);
    cartItems.innerHTML = '<p class="empty-cart">Could not load your cart. Please reload the page.</p>';
    return;
  }

  if (!lines.length) {
    cartItems.innerHTML = `<p class="empty-cart">Your cart is empty. <a href="index.html#products">Browse the store</a></p>`;
  } else {
    cartItems.innerHTML = lines.map(({ product, quantity }) => `
      <div class="cart-row">
        <div>
          <strong>${escapeHTML(product.name)}</strong>
          <p class="cart-line">${formatPrice(product.price)} × ${quantity}</p>
        </div>
        <div class="cart-row-actions">
          <button type="button" class="small-button quantity-change" data-id="${escapeHTML(product.id)}" data-change="-1" aria-label="Decrease quantity">−</button>
          <span>${quantity}</span>
          <button type="button" class="small-button quantity-change" data-id="${escapeHTML(product.id)}" data-change="1" aria-label="Increase quantity">+</button>
          <button type="button" class="small-button delete-button remove-cart-item" data-id="${escapeHTML(product.id)}">Remove</button>
        </div>
      </div>`).join("");
  }

  const total = lines.reduce((sum, { product, quantity }) => sum + Math.round(Number(product.price) * 100) * quantity, 0) / 100;
  const totalElement = document.getElementById("cart-total");
  if (totalElement) totalElement.textContent = formatPrice(total);

  /* One order = one seller = one delivery, so a cart cannot mix sellers. */
  const sellers = new Set(lines.map(line => line.product.merchantId || ""));
  const mixed = sellers.size > 1;
  let warning = document.getElementById("mixed-cart-warning");
  if (mixed && !warning) {
    warning = document.createElement("p");
    warning.id = "mixed-cart-warning";
    warning.className = "form-message error";
    warning.textContent = "Your cart has items from different sellers. Please order from one seller at a time: remove the items of the other seller(s), then check out.";
    cartItems.after(warning);
  }
  if (warning) warning.hidden = !mixed;

  const submit = document.getElementById("place-order");
  if (submit) submit.disabled = !lines.length || mixed;
}

document.addEventListener("click", async event => {
  /* "Buy now": put it in the cart and go straight to the order page */
  const buyButton = event.target.closest(".buy-now");
  if (buyButton) {
    buyButton.disabled = true;
    const already = getCart().some(item => item.id === buyButton.dataset.id);   /* already in the cart: do not add a second one */
    const bought = already || await addToCart(buyButton.dataset.id);
    if (bought) window.location.href = "checkout.html";
    else buyButton.disabled = false;
    return;
  }
  const addButton = event.target.closest(".add-to-cart");
  if (addButton) {
    const product = await addToCart(addButton.dataset.id);
    if (!product) return;

    showToast(`${product.name} added to your cart`);
    addButton.textContent = "Added ✓";
    setTimeout(() => {
      if (addButton.isConnected) addButton.textContent = "Add to cart";
    }, 1000);
    return;
  }

  const quantityButton = event.target.closest(".quantity-change");
  if (quantityButton) {
    const cart = getCart();
    const item = cart.find(entry => entry.id === quantityButton.dataset.id);
    if (!item) return;

    item.quantity = (Number(item.quantity) || 1) + Number(quantityButton.dataset.change);
    saveCart(cart.filter(entry => entry.quantity > 0));
    renderCart();
    return;
  }

  const removeButton = event.target.closest(".remove-cart-item");
  if (removeButton) {
    saveCart(getCart().filter(item => item.id !== removeButton.dataset.id));
    renderCart();
  }
});

/* ---------- Checkout ---------- */

/* Images may only be a file next to the page (e.g. alipay-qr.png) or an https URL. */
function safeImage(value = "") {
  const text = String(value).trim();
  if (/^[\w][\w./-]*\.(png|jpe?g|webp|gif|svg)$/i.test(text) && !text.includes("..")) return text;
  return safeHttpsUrl(text);
}

function paymentInstructionsHTML(order) {
  const method = order.paymentMethod;
  const row = (label, value) => value
    ? `<div class="pay-row"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>` : "";
  const button = (url, text) => safeHttpsUrl(url)
    ? `<p><a class="button button-teal" href="${escapeHTML(safeHttpsUrl(url))}" target="_blank" rel="noopener">${escapeHTML(text)}</a></p>` : "";

  let details = "";
  if (order.payInfo) {
    /* Private details sent by the payment server with the order. */
    const info = order.payInfo;
    const qr = safeImage(info.qr);
    details = (qr ? `<p class="pay-qr"><img src="${escapeHTML(qr)}" alt="QR code" width="200" height="200"></p>` : "")
      + (info.rows || []).map(item => row(item.label, item.value)).join("")
      + (info.text ? `<p>${multiline(info.text)}</p>` : "")
      + (info.links || []).map(item => button(item.url, item.label)).join("")
      + (info.note ? `<p class="small-note">${escapeHTML(info.note)}</p>` : "");
  } else if (method === "revolut") {
    details = button(PAYMENT.revolut.link, "Pay with Revolut");
  } else if (method === "postepay") {
    const p = PAYMENT.postepay;
    details = row("Account holder", p.holder) + row("IBAN", p.iban) + row("PostePay card", p.cardNumber);
  } else if (method === "alipay") {
    const a = PAYMENT.alipay;
    const qr = safeImage(a.qr);
    details = (qr ? `<p class="pay-qr"><img src="${escapeHTML(qr)}" alt="Alipay QR code" width="200" height="200"></p>` : "")
      + row("Alipay account", a.account) + button(a.link, "Pay with Alipay");
  } else if (method === "wise") {
    const w = PAYMENT.wise;
    details = button(w.link, "Pay with Wise") + row("Account holder", w.holder) + row("IBAN", w.iban);
  } else if (method === "crypto") {
    const c = PAYMENT.crypto;
    details = row("Coin", c.coin) + row("Network", c.network) + row("Address", c.address)
      + '<p class="small-note">Send on the exact network shown. Funds sent on a different network are lost.</p>';
  } else if (method === "other") {
    details = `<p>${multiline(PAYMENT.other.details)}</p>` + button(PAYMENT.other.link, "Open payment page");
  } else if (method === "bank") {
    const b = PAYMENT.bank;
    details = row("Account holder", b.holder) + row("IBAN", b.iban) + row("BIC / SWIFT", b.bic);
  }

  return `
    <h2>Complete your payment</h2>
    <p>Send <strong>${escapeHTML(formatPrice(order.total))}</strong> using <strong>${escapeHTML(order.paymentLabel)}</strong>
       and write <strong>${escapeHTML(order.number)}</strong> as the payment reference or note.</p>
    ${details}
    ${row("Amount", formatPrice(order.total))}
    ${row("Reference", order.number)}
    <p class="small-note">Your invoice shows <em>Awaiting payment</em> until we receive the money and mark it as paid. Keep your payment receipt.</p>`;
}

/* European edition: the buyer may pay in euros, dollars or pounds (the owner's rates). PayPal's script is loaded for one currency, so a change reloads the page. */
function payCurrency() {
  try {
    const c = sessionStorage.getItem("mk-pay-cur");
    if (MK_EDITION.dz) return "EUR";
    return c === "USD" && USD_RATE > 0 ? "USD" : c === "GBP" && GBP_RATE > 0 ? "GBP" : "EUR";
  } catch { return "EUR"; }
}

let paypalLoading = null;
function loadPayPal() {
  if (window.paypal) return Promise.resolve(window.paypal);
  if (paypalLoading) return paypalLoading;
  paypalLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(PAYMENT.paypal.clientId)}&currency=${payCurrency()}&intent=capture`;
    script.onload = () => resolve(window.paypal);
    script.onerror = () => { paypalLoading = null; reject(new Error("PayPal could not be loaded.")); };
    document.head.appendChild(script);
  });
  return paypalLoading;
}

async function setupCheckout() {
  const form = document.getElementById("checkout-form");
  if (!form) return;

  const field = id => document.getElementById(id);
  const message = field("checkout-message");

  if (!initBackend()) return;

  const { user, isAdmin } = await getAuthState();

  /* Orders are tied to an account, so buyers must sign in first. */
  if (!user) {
    field("billing-panel").hidden = true;
    field("signin-panel").hidden = false;
    return;
  }

  let profile = {};
  try {
    profile = await getProfile(user.uid);
  } catch (error) {
    console.error("Could not load the profile:", error);
  }

  field("checkout-name").value = profile.fullName || "";
  field("checkout-email").value = user.email || "";
  field("checkout-phone").value = profile.phone || "";
  field("checkout-company").value = profile.company || "";
  field("checkout-taxid").value = profile.taxId || "";
  field("checkout-country").value = profile.country || "";
  field("checkout-city").value = profile.city || "";
  field("checkout-address").value = profile.address || "";

  /* ----- payment method selector ----- */
  const feats = await getFeatures();
  let methods = paymentMethods();
  let sellerNoCredit = false;
  /* A seller's goods are paid to the SELLER: cash to the delivery partner,.
     (The seller then pays the site's commission himself.) The site's other methods stay available too: the site then pays the seller out. */
  try {
    const cartNow = await getCartLines();
    if (cartNow.length && cartNow.every(line => line.product.merchantId)) {
      /* The seller's own ways first (cash to the delivery partner), then every other method of the site. */
      const own = [];
      sellerNoCredit = cartNow.some(line => line.product.acceptsCredit === false);
      if (feats.global.cashOnDelivery !== false && cartNow.every(line => line.product.acceptsCash !== false)) own.push({ id: "cod", label: "Cash on delivery (pay the delivery partner)" });
      methods = [...own, ...methods];
    }
  } catch { /* optional */ }
  /* ----- pay with account credit (only when the credit module is on) ----- */
  let creditBalance = 0;
  if (MK_EDITION.dz) {
    try {
      const w = await db.collection("wallets").doc(user.uid).get();
      creditBalance = w.exists ? Number(w.data().balance) || 0 : 0;
    } catch { /* optional */ }
    if (feats.global.creditPay !== false && !sellerNoCredit) methods = [{ id: "credit", label: `Account credit (balance ${formatPrice(creditBalance)})` }, ...methods];
  }
  /* ----- European edition: euro or dollar ----- */
  if (!MK_EDITION.dz) {
    await loadUsdRate();
    const cur = field("pay-currency");
    if (cur && (USD_RATE > 0 || GBP_RATE > 0)) {
      cur.hidden = false;
      const now = payCurrency();
      cur.querySelectorAll("input").forEach(input => {
        const off = (input.value === "USD" && !(USD_RATE > 0)) || (input.value === "GBP" && !(GBP_RATE > 0));
        if (off && input.closest("label")) input.closest("label").hidden = true;
        input.checked = input.value === now;
        input.addEventListener("change", () => {
          try { sessionStorage.setItem("mk-pay-cur", input.value); } catch { /* ignore */ }
          if (window.paypal) location.reload();
        });
      });
    }
  }
  /* ----- delivery speed (only for a seller's goods) ----- */
  let speedChoice = "";
  let sellerCart = false;
  try {
    const cartNow = await getCartLines();
    sellerCart = cartNow.length > 0 && cartNow.every(line => line.product.merchantId);
    if (sellerCart) {
      const goods = cartNow.reduce((sum, line) => sum + Number(line.product.price) * line.quantity, 0);
      const quoteData = await callFn("deliveryQuote", { items: getCart().map(item => ({ id: item.id, quantity: item.quantity })) });
      const quote = quoteData.speeds || {};
      const box = field("speed-options");
      field("speed-fieldset").hidden = false;
      const firstFree = ["medium", "fast", "slow"].find(key => quote[key] && quote[key].fee !== null);
      /* the seller's own ways: the customer collects the order, or the seller delivers it himself */
      const ownWays = quoteData.own || {};
      const OWN = { pickup: { label: "I collect it from the seller", hours: "Ready after the seller accepts" }, self: { label: "The seller delivers it himself", hours: "Arranged with the seller" } };
      const ownKeys = ["pickup", "self"].filter(key => typeof ownWays[key] === "number");
      speedChoice = firstFree || ownKeys[0] || "";
      const showTotals = () => {
        const fee = !speedChoice ? 0 : OWN[speedChoice] ? Number(ownWays[speedChoice]) || 0 : quote[speedChoice] ? Number(quote[speedChoice].fee) : 0;
        field("delivery-row").hidden = !speedChoice;
        field("grand-row").hidden = !speedChoice;
        field("delivery-fee").textContent = formatPrice(fee);
        field("grand-total").textContent = formatPrice(goods + fee);
      };
      box.innerHTML = Object.entries(SPEEDS).map(([key, info]) => {
        const fee = quote[key] ? quote[key].fee : null;
        return `<label class="speed-card ${fee === null ? "unavailable" : ""}">
          <input type="radio" name="speed" value="${key}" ${key === speedChoice ? "checked" : ""} ${fee === null ? "disabled" : ""}>
          <span><span class="speed-name">${escapeHTML(info.label)}</span><br><span class="speed-time">${escapeHTML(info.hours)}</span></span>
          <span class="speed-price">${fee === null ? "Not available" : formatPrice(fee)}</span>
        </label>`;
      }).join("") + ownKeys.map(key => `<label class="speed-card">
          <input type="radio" name="speed" value="${key}" ${key === speedChoice ? "checked" : ""}>
          <span><span class="speed-name">${escapeHTML(OWN[key].label)}</span><br><span class="speed-time">${escapeHTML(OWN[key].hours)}</span></span>
          <span class="speed-price">${ownWays[key] > 0 ? formatPrice(ownWays[key]) : "Free"}</span>
        </label>`).join("");
      if (quoteData.chargeable > 0 && !field("parcel-line")) box.insertAdjacentHTML("beforebegin", `<p class="muted parcel-line" id="parcel-line">Parcel: ${Number(quoteData.weight) || 0} kg real · ${Number(quoteData.chargeable)} kg chargeable${quoteData.volume > 0 ? ` · ${Number(quoteData.volume)} litres` : ""}. The delivery price is calculated from it.</p>`);
      box.addEventListener("change", event => { if (event.target.name === "speed") { speedChoice = event.target.value; showTotals(); } });
      showTotals();
    }
  } catch (error) { console.error(error); }
  const options = field("payment-options");
  const submitButton = field("place-order");
  const paypalBox = field("paypal-container");

  if (!methods.length) {
    options.innerHTML = '<p class="muted">No payment method is set up yet. The owner must fill in the PAYMENT settings in store.js.</p>';
    submitButton.hidden = true;
    return;
  }

  const adminNote = isAdmin && missingPaymentMethods().length
    ? `<p class="small-note admin-note">Only you (admin) see this. Not set up yet: ${escapeHTML(missingPaymentMethods().join(", "))}. Fill them in <code>payment-config.js</code>.</p>`
    : "";

  options.innerHTML = adminNote + methods.map((method, index) => `
    <label class="payment-option">
      <input type="radio" name="payment" value="${method.id}" ${index === 0 ? "checked" : ""}>
      <span>${escapeHTML(method.label)}</span>
    </label>`).join("");

  const manualHint = "You will get the payment details after placing the order. The invoice is marked Paid once we receive the money.";
  const hints = {
    paypal: "You will pay securely with PayPal, a card or a wallet. The invoice is marked Paid right away.",
    cod: "You pay the delivery partner in cash when the parcel arrives (the goods and the delivery fee). Share your location above so he can find you.",
    credit: "Your total is taken from your account credit right away and the invoice is marked Paid. The delivery fee is paid in cash to the delivery partner.",
    demo: "Test only: no money is taken and the invoice is marked as a demo."
  };

  const selected = () => (document.querySelector('input[name="payment"]:checked') || {}).value;

  /* The buyer's position (optional): from the profile, or from the "use my location" button. */
  let where = { lat: numOrNull(profile.lat), lng: numOrNull(profile.lng) };
  const showWhere = () => {
    const note = field("checkout-where");
    if (note) note.textContent = where.lat !== null ? `Location shared: ${where.lat}, ${where.lng}` : "Location not shared.";
  };
  showWhere();
  const locateButton = field("checkout-locate");
  if (locateButton) {
    locateButton.addEventListener("click", async () => {
      locateButton.disabled = true;
      try { where = await getPosition(); showWhere(); }
      catch (error) { message.textContent = error.message; message.classList.add("error"); }
      finally { locateButton.disabled = false; }
    });
  }

  function collectCustomer() {
    const customer = {
      name: field("checkout-name").value.trim(),
      email: field("checkout-email").value.trim(),
      phone: field("checkout-phone").value.trim(),
      company: field("checkout-company").value.trim(),
      taxId: field("checkout-taxid").value.trim(),
      country: field("checkout-country").value.trim(),
      city: field("checkout-city").value.trim(),
      address: field("checkout-address").value.trim()
    };
    if (where.lat !== null && where.lng !== null) { customer.lat = where.lat; customer.lng = where.lng; }
    if (!customer.name || !customer.email || !customer.country || !customer.city || !customer.address) {
      message.textContent = "Please fill in your name, email and billing address.";
      message.classList.add("error");
      return null;
    }
    message.textContent = "";
    message.classList.remove("error");
    return customer;
  }

  function cartPayload(lines) {
    return lines.map(({ product, quantity }) => ({ id: product.id, quantity }));
  }

  async function finish(order) {
    saveCart([]);
    renderInvoice(order, field("invoice-container"));
    field("invoice-page-link").href = `invoice.html?id=${encodeURIComponent(order.id)}`;
    field("order-reference").textContent = order.number;

    const instructions = field("payment-instructions");
    const pending = /^Awaiting payment/.test(order.status || "");
    instructions.hidden = !pending;
    if (pending) instructions.innerHTML = paymentInstructionsHTML(order);
    field("success-eyebrow").textContent = pending ? "ORDER RECEIVED — PAYMENT PENDING" : "ORDER CONFIRMED";

    field("checkout-view").hidden = true;
    field("success-view").hidden = false;
    window.scrollTo({ top: 0 });
  }

  let placing = false; /* ignores double clicks while an order is being saved */

  async function renderPayPalButtons() {
    if (paypalBox.dataset.ready) return;
    paypalBox.dataset.ready = "1";
    paypalBox.innerHTML = '<p class="muted">Loading PayPal…</p>';

    try {
      const paypal = await loadPayPal();
      paypalBox.innerHTML = "";

      paypal.Buttons({
        style: { layout: "vertical", shape: "rect", label: "pay" },

        onClick: (data, actions) => {
          if (placing || !collectCustomer()) return actions.reject();
        },

        createOrder: async () => {
          const lines = await getCartLines();
          if (!lines.length) throw new Error("Your cart is empty.");
          if (sellerCart && !speedChoice) throw new Error("Choose a delivery speed.");
          const created = await callFn("createPayPalOrder", { items: cartPayload(lines), currency: payCurrency() });
          return created.id;
        },

        onApprove: async (data, actions) => {
          placing = true;
          message.classList.remove("error");
          message.textContent = "Payment received — confirming with PayPal…";

          try {
            const customer = collectCustomer();
            const lines = await getCartLines();
            const order = await callFn("capturePayPalOrder", {
              paypalOrderId: data.orderID,
              items: cartPayload(lines),
              customer,
              speed: speedChoice,
              currency: payCurrency()
            });
            await finish(order);
          } catch (error) {
            console.error(error);
            message.textContent = (error && error.message ? error.message + " " : "") +
              "If PayPal already charged you, do not pay again — contact us with your PayPal receipt.";
            message.classList.add("error");
            placing = false;
          }
        },

        onError: error => {
          console.error(error);
          message.textContent = "PayPal reported a problem. Please try again.";
          message.classList.add("error");
        }
      }).render("#paypal-container");
    } catch (error) {
      console.error(error);
      paypalBox.innerHTML = '<p class="form-message error">PayPal could not be loaded. Check the client ID or your connection.</p>';
      delete paypalBox.dataset.ready;
    }
  }

  function updateMethod() {
    const method = selected();
    field("payment-hint").textContent = hints[method] || manualHint;
    const isPayPal = method === "paypal";
    paypalBox.hidden = !isPayPal;
    submitButton.hidden = isPayPal;
    if (isPayPal) renderPayPalButtons();
  }

  options.addEventListener("change", updateMethod);
  updateMethod();

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (placing || selected() === "paypal") return;
    if (!user.emailVerified) {
      message.textContent = "Please verify your email address first (see the notice at the top of the page), then try again.";
      message.classList.add("error");
      return;
    }
    placing = true;

    const lines = await getCartLines();
    if (!lines.length) { placing = false; return; }

    const customer = collectCustomer();
    if (!customer) { placing = false; return; }
    if (feats.customer.canOrder === false) {
      message.textContent = "Ordering is switched off for now. Please try again later.";
      message.classList.add("error");
      placing = false;
      return;
    }
    if (feats.customer.requireLocation && !(customer.lat != null && customer.lng != null)) {
      message.textContent = "Please share your location (button above) to place an order.";
      message.classList.add("error");
      placing = false;
      return;
    }

    if (sellerCart && !speedChoice) {
      message.textContent = "Choose a delivery speed.";
      message.classList.add("error");
      placing = false;
      return;
    }
    submitButton.disabled = true;
    message.textContent = "Saving your order…";

    let order;
    try {
      const chosen = methods.find(item => item.id === selected());
      order = await callFn("createOrder", { method: selected(), label: chosen && chosen.label, customer, items: cartPayload(lines), speed: speedChoice, coupon: window.MK_COUPON || "" });
    } catch (error) {
      console.error(error);
      message.textContent = (error && error.message) || "Could not save the order. Please try again.";
      message.classList.add("error");
      submitButton.disabled = false;
      placing = false;
      return;
    }

    await finish(order);
  });

  const printButton = field("print-now");
  if (printButton) printButton.addEventListener("click", () => window.print());
}

document.addEventListener("DOMContentLoaded", () => {
  setupStoreControls();
  loadStore();
  renderCart();
  setupCheckout();
});
