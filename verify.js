"use strict";

/* The page a pharmacist opens by scanning the QR code of a printed prescription: it shows what the doctor really sent. */
document.addEventListener("DOMContentLoaded", async () => {
  const p = new URLSearchParams(location.search), state = document.getElementById("vf-state"), body = document.getElementById("vf-body");
  try {
    const r = await callFn("verifyPrescription", { id: p.get("id") || "", code: p.get("c") || "" });
    if (!r.valid) { state.textContent = "This prescription is NOT valid: the doctor never sent it, or it was replaced by a newer one."; state.classList.add("error"); return; }
    state.textContent = "✔ Valid prescription, sent by the doctor through the site."; state.classList.remove("muted"); state.classList.add("success");
    body.hidden = false;
    body.innerHTML = `<p><strong>${escapeHTML(r.doctorName)}</strong><br><small class="muted">${escapeHTML(r.specialty)}</small></p>
      <p><strong>Patient:</strong> ${escapeHTML(r.patient)}<br><strong>Date:</strong> ${escapeHTML(formatDate(r.at))}<br><strong>Stamp:</strong> ${r.stamped ? "✔" : "✘"} · <strong>Signature:</strong> ${r.signed ? "✔" : "✘"}</p>
      <pre class="rx-text">${escapeHTML(r.text)}</pre>`;
  } catch (error) { state.textContent = authErrorMessage(error); state.classList.add("error"); }
});
