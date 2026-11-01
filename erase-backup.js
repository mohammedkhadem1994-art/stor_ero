"use strict";

/* Before data is erased, a copy is saved: a PDF to read (and a JSON file with everything), named DAY-MONTH-YEAR_reference_where.
   Where: this device, or Google Drive through the phone's share menu (the Drive app takes the file from there).
   The erase starts only after the copy was saved or shared; if the person cancels, nothing is erased. */
(function () {
  const A4 = [595, 842], K = 2;                      /* points, and pixels per point */
  const hasArabic = t => /[؀-ۿ]/.test(t);
  const pad2 = n => String(n).padStart(2, "0");

  function pdfOfPages(canvases) {
    const enc = new TextEncoder(), parts = [], offsets = [];
    let size = 0;
    const push = bytes => { parts.push(bytes); size += bytes.length; };
    const text = str => push(enc.encode(str));
    const obj = (n, body) => { offsets[n] = size; text(`${n} 0 obj\n${body}\nendobj\n`); };
    text("%PDF-1.4\n");
    const pageCount = canvases.length, kids = canvases.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`);
    canvases.forEach((cv, i) => {
      const base = 3 + i * 3, jpg = atob(cv.toDataURL("image/jpeg", 0.82).split(",")[1]);
      const bytes = new Uint8Array(jpg.length); for (let k = 0; k < jpg.length; k++) bytes[k] = jpg.charCodeAt(k);
      obj(base, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4[0]} ${A4[1]}] /Resources << /XObject << /Im0 ${base + 1} 0 R >> >> /Contents ${base + 2} 0 R >>`);
      offsets[base + 1] = size;
      text(`${base + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);
      push(bytes); text("\nendstream\nendobj\n");
      const content = `q ${A4[0]} 0 0 ${A4[1]} 0 0 cm /Im0 Do Q`;
      obj(base + 2, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    });
    const total = 3 + pageCount * 3, xref = size;
    text(`xref\n0 ${total}\n0000000000 65535 f \n`);
    for (let n = 1; n < total; n++) text(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
    text(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    const out = new Uint8Array(size); let at = 0; parts.forEach(p => { out.set(p, at); at += p.length; });
    return new Blob([out], { type: "application/pdf" });
  }

  function buildPdf(r, stamp) {
    const W = A4[0] * K, H = A4[1] * K, M = 36 * K, pages = [];
    let cv, ctx, y;
    const newPage = () => {
      cv = document.createElement("canvas"); cv.width = W; cv.height = H; ctx = cv.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "#0d0d0d"; y = M; pages.push(cv);
    };
    const line = (t, size, bold, color) => {
      ctx.font = `${bold ? "700 " : ""}${size * K}px Arial, "Segoe UI", sans-serif`; ctx.fillStyle = color || "#0d0d0d";
      const rtl = false;   /* one left-to-right line: Arabic words inside it are still shaped and ordered correctly */
      ctx.direction = rtl ? "rtl" : "ltr"; ctx.textAlign = rtl ? "right" : "left";
      const maxW = W - 2 * M, words = String(t).split(" "); let cur = "";
      const flush = s => { if (y > H - M) newPage(); y += size * K * 1.3; ctx.fillText(s, rtl ? W - M : M, y); };
      for (const w of words) { const test = cur ? cur + " " + w : w; if (ctx.measureText(test).width > maxW && cur) { flush(cur); cur = w; } else cur = test; }
      if (cur) flush(cur);
    };
    newPage();
    line(r.scope === "site" ? "Backup before erasing the whole site" : `Backup before erasing the data of ${r.label}`, 17, true);
    line(`Date: ${stamp.date} ${stamp.time}   ·   Reference: ${r.label}`, 10, false, "#343434");
    line("The same data, complete, is in the JSON file saved with this PDF." + (r.truncated ? " Very large lists were cut at 1500 rows." : ""), 10, false, "#343434");
    y += 8 * K;
    for (const [name, rows] of Object.entries(r.collections)) {
      if (!rows.length) continue;
      y += 6 * K; line(`${name} (${rows.length})`, 13, true, "#0f3076");
      rows.slice(0, 80).forEach(row => {
        const { id, ...rest } = row;
        line(`• ${id}  ${Object.entries(rest).slice(0, 10).map(([k, v]) => `${k}: ${v}`).join(" · ")}`, 8, false);
      });
      if (rows.length > 80) line(`… and ${rows.length - 80} more (see the JSON file)`, 8, false, "#525252");
    }
    return pdfOfPages(pages);
  }

  function saveBlob(blob, name) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* returns true when the copy was saved or shared; false when the person cancelled (then nothing must be erased) */
  window.mkEraseBackup = async function (opts) {
    const r = await callFn("exportErase", opts);
    const d = new Date();
    const stamp = { date: `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`, time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}` };
    const safe = String(r.label).replace(/[^A-Za-z0-9@._-]+/g, "_").slice(0, 60);
    const toDrive = window.confirm("A backup of the data (PDF + JSON) is saved before the erase.\n\nOK = Google Drive (the share menu opens: choose Drive)\nCancel = save on this device");
    const base = `${stamp.date}_${safe}_${toDrive ? "Drive" : "Device"}`;
    const pdf = buildPdf(r, stamp), json = new Blob([JSON.stringify(r, null, 1)], { type: "application/json" });
    const files = [new File([pdf], base + ".pdf", { type: "application/pdf" }), new File([json], base + ".json", { type: "application/json" })];
    if (toDrive && navigator.canShare && navigator.canShare({ files })) {
      try { await navigator.share({ files, title: base }); return true; }
      catch (error) { return false; }   /* the share menu was closed: nothing is erased */
    }
    saveBlob(pdf, base + ".pdf"); saveBlob(json, base + ".json");
    if (toDrive) showToast("Saved on this device. Upload the file to Google Drive, then continue.");
    return window.confirm(`The backup was saved as ${base}.pdf. Continue with the erase?`);
  };
})();
