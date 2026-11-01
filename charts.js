"use strict";
/* Small SVG charts with no library: line, bars and donut, each with a hover tooltip.
   Colours come from the CSS variables --series-1 .. --series-8 (see styles.css, .viz-root). */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const esc = v => String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const color = i => `var(--series-${(i % 8) + 1})`;
  let tip = null;
  function tipBox() {
    if (!tip) { tip = document.createElement("div"); tip.className = "viz-tip"; tip.hidden = true; document.body.appendChild(tip); }
    return tip;
  }
  function showTip(html, x, y) {
    const t = tipBox(); t.innerHTML = html; t.hidden = false;
    const w = t.offsetWidth, h = t.offsetHeight;
    t.style.left = Math.max(6, Math.min(window.innerWidth - w - 6, x + 12)) + "px";
    t.style.top = Math.max(6, y - h - 10) + "px";
  }
  const hideTip = () => { if (tip) tip.hidden = true; };

  /* a "nice" top value for the y axis */
  function niceMax(max) {
    if (!(max > 0)) return 4;
    const pow = Math.pow(10, Math.floor(Math.log10(max)));
    for (const m of [1, 2, 4, 5, 10]) if (max <= m * pow) return m * pow;
    return 10 * pow;
  }
  const fmt = n => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });

  function legend(items) {
    return `<ul class="viz-legend">${items.map(it => `<li><span class="viz-key" style="background:${color(it.color)}"></span>${esc(it.name)}${it.total !== undefined ? ` <strong>${esc(fmt(it.total))}</strong>` : ""}</li>`).join("")}</ul>`;
  }

  /* ---------- line chart: opts = { labels: [..], series: [{ name, values: [..], color: 0 }] } ---------- */
  function line(host, opts) {
    const W = 640, H = 250, L = 40, R = 14, T = 12, B = 28;
    const labels = opts.labels, n = labels.length;
    const max = niceMax(Math.max(0, ...opts.series.flatMap(s => s.values)));
    const x = i => L + (n <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
    const y = v => T + (H - T - B) * (1 - v / max);
    let svg = `<svg viewBox="0 0 ${W} ${H}" class="viz-svg" role="img" aria-label="${esc(opts.title || "Line chart")}">`;
    for (let k = 0; k <= 4; k++) {
      const v = (max * k) / 4;
      svg += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="viz-grid"/><text x="${L - 6}" y="${y(v) + 4}" class="viz-axis" text-anchor="end">${esc(fmt(v))}</text>`;
    }
    const step = Math.max(1, Math.ceil(n / 8));
    labels.forEach((lab, i) => { if ((i % step === 0 && (n - 1 - i >= step * 0.6 || i === n - 1)) || i === n - 1) svg += `<text x="${x(i)}" y="${H - 8}" class="viz-axis" text-anchor="middle">${esc(String(lab).slice(5))}</text>`; });
    opts.series.forEach(s => {
      const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
      svg += `<polyline points="${pts}" fill="none" stroke="${color(s.color)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (n <= 31) s.values.forEach((v, i) => { svg += `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${color(s.color)}" stroke="var(--surface-1)" stroke-width="2"/>`; });
    });
    svg += `<line class="viz-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" hidden/><rect class="viz-hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/></svg>`;
    host.innerHTML = svg + (opts.series.length > 1 ? legend(opts.series.map(s => ({ name: s.name, color: s.color, total: s.values.reduce((a, b) => a + b, 0) }))) : "");
    const el = host.querySelector("svg"), hit = host.querySelector(".viz-hit"), cross = host.querySelector(".viz-cross");
    const at = ev => {
      const box = el.getBoundingClientRect();
      const px = ((ev.clientX - box.left) / box.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1))));
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.removeAttribute("hidden");
      showTip(`<strong>${esc(labels[i])}</strong>` + opts.series.map(s => `<div><span class="viz-key" style="background:${color(s.color)}"></span>${esc(s.name)}: <strong>${esc(fmt(s.values[i]))}</strong></div>`).join(""), ev.clientX, ev.clientY);
    };
    hit.addEventListener("mousemove", at);
    hit.addEventListener("touchstart", e => at(e.touches[0]), { passive: true });
    hit.addEventListener("mouseleave", () => { cross.setAttribute("hidden", ""); hideTip(); });
  }

  /* ---------- horizontal bars: opts = { items: [{ label, value, color? }], unit } ---------- */
  function bars(host, opts) {
    const items = opts.items, max = Math.max(1, ...items.map(i => i.value));
    const rowH = 28, L = 104, W = 340, R = 36, H = Math.max(40, items.length * rowH + 8);
    let svg = `<svg viewBox="0 0 ${W} ${H}" class="viz-svg" role="img" aria-label="${esc(opts.title || "Bar chart")}">`;
    items.forEach((it, i) => {
      const yy = 4 + i * rowH, w = Math.max(it.value > 0 ? 3 : 0, ((W - L - R) * it.value) / max);
      svg += `<text x="${L - 8}" y="${yy + 15}" class="viz-axis" text-anchor="end">${esc(it.label.length > 17 ? it.label.slice(0, 16) + "…" : it.label)}</text>`;
      svg += `<rect class="viz-bar" data-i="${i}" x="${L}" y="${yy + 3}" width="${w}" height="16" rx="4" fill="${color(it.color === undefined ? (opts.color || 0) : it.color)}"/>`;
      svg += `<text x="${L + w + 6}" y="${yy + 15}" class="viz-val">${esc(fmt(it.value))}</text>`;
    });
    host.innerHTML = svg + "</svg>";
    host.querySelectorAll(".viz-bar").forEach(r => {
      const it = items[Number(r.dataset.i)];
      const go = ev => showTip(`<strong>${esc(it.label)}</strong><div>${esc(fmt(it.value))}${opts.unit ? " " + esc(opts.unit) : ""}</div>`, ev.clientX, ev.clientY);
      r.addEventListener("mousemove", go); r.addEventListener("touchstart", e => go(e.touches[0]), { passive: true }); r.addEventListener("mouseleave", hideTip);
    });
  }

  /* ---------- donut: opts = { items: [{ label, value, color }], center } ---------- */
  function donut(host, opts) {
    const items = opts.items.filter(i => i.value > 0), total = items.reduce((a, b) => a + b.value, 0);
    if (!total) { host.innerHTML = '<p class="empty-state">No data yet.</p>'; return; }
    const R = 70, r = 44, C = 90;
    let a0 = -Math.PI / 2, svg = `<svg viewBox="0 0 180 180" class="viz-svg viz-donut" role="img" aria-label="${esc(opts.title || "Donut chart")}">`;
    items.forEach((it, i) => {
      const a1 = a0 + (it.value / total) * Math.PI * 2 - (items.length > 1 ? 0.02 : 0);
      const big = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rad, a) => `${(C + rad * Math.cos(a)).toFixed(2)} ${(C + rad * Math.sin(a)).toFixed(2)}`;
      const d = items.length === 1
        ? `M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - 0.01} ${C - R} L ${C - 0.01} ${C - r} A ${r} ${r} 0 1 0 ${C} ${C - r} Z`
        : `M ${p(R, a0)} A ${R} ${R} 0 ${big} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${big} 0 ${p(r, a0)} Z`;
      svg += `<path class="viz-slice" data-i="${i}" d="${d}" fill="${color(it.color === undefined ? i : it.color)}" stroke="var(--surface-1)" stroke-width="2"/>`;
      a0 += (it.value / total) * Math.PI * 2;
    });
    svg += `<text x="${C}" y="${C - 2}" text-anchor="middle" class="viz-center">${esc(fmt(total))}</text><text x="${C}" y="${C + 14}" text-anchor="middle" class="viz-axis">${esc(opts.center || "total")}</text></svg>`;
    host.innerHTML = `<div class="viz-donut-wrap">${svg}${legend(items.map((it, i) => ({ name: `${it.label}`, color: it.color === undefined ? i : it.color, total: it.value })))}</div>`;
    host.querySelectorAll(".viz-slice").forEach(s => {
      const it = items[Number(s.dataset.i)];
      const go = ev => showTip(`<strong>${esc(it.label)}</strong><div>${esc(fmt(it.value))} (${Math.round((it.value / total) * 100)}%)</div>`, ev.clientX, ev.clientY);
      s.addEventListener("mousemove", go); s.addEventListener("touchstart", e => go(e.touches[0]), { passive: true }); s.addEventListener("mouseleave", hideTip);
    });
  }

  window.MKCharts = { line, bars, donut, fmt };
})();
