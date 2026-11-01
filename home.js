"use strict";

/* Home page: category tiles, popular-search chips and the hero search all fill the product search box and jump to the catalog. */
(function () {
  function goSearch(text) {
    const box = document.getElementById("product-search");
    if (!box) return;
    const category = document.getElementById("category-filter");
    if (category) { category.value = "all"; category.dispatchEvent(new Event("change")); }
    box.value = text;
    box.dispatchEvent(new Event("input", { bubbles: true }));
    const target = document.getElementById("products");
    if (target && target.scrollIntoView) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.addEventListener("click", event => {
    const item = event.target.closest("[data-search]");
    if (item) goSearch(item.dataset.search);
  });

  /* The pictures are built into the page, so they always show. If you add a real photo with the same name in img/ (cat-perfume.jpg ...), it replaces the drawing. */
  document.querySelectorAll("img[data-photo]").forEach(img => {
    const photo = new Image();
    photo.onload = () => { img.src = photo.src; };
    photo.src = img.dataset.photo;
  });

  const form = document.getElementById("hero-search");
  if (form) {
    form.addEventListener("submit", event => {
      event.preventDefault();
      goSearch(document.getElementById("hero-search-input").value.trim());
    });
  }
})();
