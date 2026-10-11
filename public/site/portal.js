/* SmileCompose lab portal: shows one shared lab pack. The token in the address is the only key. */
(() => {
  const token = location.pathname.split("/").filter(Boolean)[1] || "";
  const root = document.querySelector("[data-root]");
  const api = `/api/portal/${encodeURIComponent(token)}`;
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (k === "class") node.className = v; else if (k === "text") node.textContent = v; else node.setAttribute(k, v); }
    for (const child of children) if (child) node.append(child);
    return node;
  };
  const icon = path => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.innerHTML = path; return s; };
  const DL = '<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14" stroke-linecap="round" stroke-linejoin="round"/>';
  const date = iso => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  function unavailable(message) {
    root.replaceChildren(el("div", { class: "gone" }, el("p", { class: "eyebrow", text: "Lab portal" }), el("h1", { text: "This link isn’t available" }), el("p", { class: "sub", text: message })));
  }

  function compare(before, after) {
    const box = el("div", { class: "cmp" },
      el("img", { src: before.url, alt: before.label }), el("img", { class: "after", src: after.url, alt: after.label }),
      el("div", { class: "bar" }, el("span", { text: "‹ ›" })), el("span", { class: "tag l", text: before.label }), el("span", { class: "tag r", text: after.label }));
    const set = x => { const r = box.getBoundingClientRect(); box.style.setProperty("--pos", `${Math.min(100, Math.max(0, (x - r.left) / r.width * 100))}%`); };
    let dragging = false;
    box.addEventListener("pointerdown", e => { dragging = true; box.setPointerCapture(e.pointerId); set(e.clientX); });
    box.addEventListener("pointermove", e => dragging && set(e.clientX));
    box.addEventListener("pointerup", () => { dragging = false; });
    return box;
  }

  function render(pack) {
    document.title = `${pack.caseLabel} · SmileCompose lab portal`;
    document.querySelector("[data-secure] span").textContent = `Shared privately by ${pack.clinicianName} · link expires ${date(pack.expiresAt)}`;
    const files = pack.files.map(f => ({ ...f, url: `${api}/file/${f.index}` }));
    const images = files.filter(f => f.mime.startsWith("image/"));
    const docs = files.filter(f => !f.mime.startsWith("image/"));
    const front = images.find(f => /smile front/i.test(f.label)) ?? images[0];
    const concept = images.find(f => /concept/i.test(f.label));
    const head = el("div", { class: "lp-head" },
      el("div", {}, el("p", { class: "eyebrow", text: `For ${pack.labName}` }), el("h1", { text: `Case ${pack.caseLabel}` }),
        el("p", { class: "sub", text: `Shared ${date(pack.createdAt)} by ${pack.clinicianName}` })),
      el("div", { class: "actions" },
        ...docs.map(d => { const a = el("a", { class: "btn", href: `${d.url}?download`, text: d.label }); a.prepend(icon(DL)); return a; }),
        (() => { const a = el("a", { class: "btn btn-dark", href: `${api}/download`, text: "Download all" }); a.prepend(icon(DL)); return a; })()));
    const visual = concept && front && concept !== front ? compare(front, concept)
      : front ? el("div", { class: "single" }, el("img", { src: front.url, alt: front.label })) : null;
    const thumbs = el("div", { class: "thumbs" }, ...files.map(f => el("a", { href: `${f.url}?download`, title: `Download ${f.label}` },
      f.mime.startsWith("image/") ? el("img", { src: f.url, alt: f.label, loading: "lazy" }) : el("div", { class: "doc", text: "PDF" }),
      el("span", { text: f.label }))));
    const spec = el("aside", { class: "card" },
      pack.spec.length ? el("p", { class: "sec", text: "Design specification" }) : null,
      pack.spec.length ? el("dl", { class: "kv" }, ...pack.spec.flatMap(r => [el("dt", { text: r.label }), el("dd", { text: r.value })])) : null,
      pack.note ? el("p", { class: "sec", text: "Clinician’s note" }) : null,
      pack.note ? el("p", { class: "note", text: pack.note }) : null,
      el("p", { class: "hint", text: "The concept is an AI visualisation for communication, not a prescription. Clinical records, impressions and scans follow separately." }));
    root.replaceChildren(head, el("div", { class: "grid" }, el("div", {}, visual, el("p", { class: "sec", text: "Files" }), thumbs, replyForm(pack)), spec));
  }

  // Reply to the clinic: a message and up to five photos or PDFs (for example, the finished work).
  function replyForm(pack) {
    const status = el("p", { class: "reply-status", role: "status" });
    const message = el("textarea", { name: "message", maxlength: "2000", rows: "3", placeholder: "Questions, timings, or a note with photos of the finished work…" });
    const files = el("input", { type: "file", name: "file", multiple: "", accept: "image/jpeg,image/png,image/webp,application/pdf" });
    const chosen = el("span", { class: "reply-chosen", text: "No files chosen" });
    files.addEventListener("change", () => { chosen.textContent = files.files.length ? `${files.files.length} file${files.files.length === 1 ? "" : "s"} chosen` : "No files chosen"; });
    const pick = el("label", { class: "btn" }, files, el("span", { text: "Add photos or PDFs" }));
    const send = el("button", { class: "btn btn-dark", type: "submit", text: "Send to clinic" });
    const form = el("form", { class: "reply" },
      el("p", { class: "sec", text: `Reply to ${pack.clinicianName}` }), message,
      el("div", { class: "reply-row" }, pick, chosen, send), status);
    form.addEventListener("submit", async e => {
      e.preventDefault();
      if (!message.value.trim() && !files.files.length) { status.textContent = "Write a message or add a photo."; status.className = "reply-status err"; return; }
      if (files.files.length > 5) { status.textContent = "Send up to five files at a time."; status.className = "reply-status err"; return; }
      const body = new FormData();
      body.set("message", message.value);
      for (const f of files.files) body.append("file", f);
      send.disabled = true; status.textContent = "Sending…"; status.className = "reply-status";
      try {
        const r = await fetch(`${api}/reply`, { method: "POST", body, credentials: "omit" });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || "Your reply couldn’t be sent.");
        form.reset(); chosen.textContent = "No files chosen";
        status.textContent = `Sent. ${pack.clinicianName} will see it in SmileCompose.`; status.className = "reply-status ok";
      } catch (err) { status.textContent = err.message; status.className = "reply-status err"; }
      finally { send.disabled = false; }
    });
    return form;
  }

  fetch(api, { cache: "no-store", credentials: "omit" })
    .then(async r => { const body = await r.json().catch(() => ({})); if (!r.ok) throw new Error(body.error || "This lab pack couldn’t be loaded."); return body; })
    .then(render)
    .catch(e => unavailable(e.message || "This lab pack couldn’t be loaded."));
})();
