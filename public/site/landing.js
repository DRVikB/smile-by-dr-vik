/* SmileCompose website motion: reveals, parallax, the Design Studio walkthrough, the before/after
   slider with sample patients, cursor glow and the pricing toggle. No libraries; honours reduced motion. */
document.documentElement.classList.add("js");

document.addEventListener("DOMContentLoaded", () => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = window.matchMedia("(pointer: fine)").matches;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  // Navigation: firmer glass once the page scrolls; the phone menu.
  const nav = $("[data-nav]");
  const menuButton = $("[data-menu]");
  const menu = $("#mobile-menu");
  const setMenu = open => { menuButton.setAttribute("aria-expanded", String(open)); menu.hidden = !open; };
  menuButton.addEventListener("click", () => setMenu(menu.hidden));
  menu.addEventListener("click", event => { if (event.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") setMenu(false); });

  // Already signed in on this browser: "Sign in" becomes a way back into the app.
  if (document.cookie.split(";").some(part => part.trim() === "sc_account=1")) {
    $$('a[href="/?signin"]').forEach(link => { link.href = "/"; link.textContent = "Open SmileCompose"; });
    // In the bar, one button is enough: "Try SmileCompose" becomes the way back in.
    const navSignin = $(".nav-signin"), navTry = $(".nav-actions .btn");
    if (navSignin) navSignin.hidden = true;
    if (navTry) { navTry.href = "/"; navTry.textContent = "Open SmileCompose"; }
  }

  // Stagger: each child waits a little longer than the one before.
  $$("[data-stagger]").forEach(group => [...group.children].forEach((child, i) => child.style.setProperty("--i", String(i))));

  // Reveal sections as they arrive.
  const reveals = $$(".reveal, .style-stack, [data-stagger]");
  if ("IntersectionObserver" in window && !reduced) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add("in"); observer.unobserve(entry.target); }
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.1 });
    reveals.forEach(element => observer.observe(element));
  } else reveals.forEach(element => element.classList.add("in"));

  // Design Studio: the step in the middle of the screen chooses the iPad screen and tab.
  const studio = $("[data-studio]");
  if (studio) {
    const steps = $$(".studio-step", studio);
    const screens = $$(".studio-screen", studio);
    const tabs = $$(".studio-tabs > span:not(.studio-pill)", studio);
    const pill = $("[data-studio-pill]", studio);
    const show = index => {
      steps.forEach((s, i) => s.classList.toggle("is-active", i === index));
      screens.forEach((s, i) => s.classList.toggle("is-active", i === index));
      tabs.forEach((t, i) => t.classList.toggle("is-active", i === index));
      pill.style.setProperty("--i", String(index));
    };
    if ("IntersectionObserver" in window) {
      const stepObserver = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) show(Number(entry.target.dataset.step));
      }, { rootMargin: "-45% 0px -45% 0px" });
      steps.forEach(step => stepObserver.observe(step));
    }
  }

  // Before/after: drag anywhere on the photo, or use the keyboard on the hidden range.
  const compare = $("[data-compare]");
  const range = $("[data-compare-range]");
  const setPosition = value => {
    const clamped = Math.min(100, Math.max(0, value));
    compare.style.setProperty("--pos", `${clamped}%`);
    range.value = String(Math.round(clamped));
  };
  range.addEventListener("input", () => setPosition(Number(range.value)));
  let touched = false;
  compare.addEventListener("pointerdown", () => { touched = true; });
  const sweep = () => {
    if (reduced) return;
    let start;
    const frame = time => {
      if (touched) return;
      start ??= time;
      const t = (time - start) / 2600;
      if (t > 1) { setPosition(50); return; }
      setPosition(50 + Math.sin(t * Math.PI * 2) * 24 * (1 - t));
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
  setTimeout(sweep, 1400);

  // Sample patients: swap the before/after pair (and rotate through them until someone chooses).
  const patients = $$("[data-patients] button");
  const [beforeImg, afterImg] = $$(".compare-img", compare);
  let current = 0;
  let chosen = false;
  const choose = index => {
    if (index === current) return;
    current = index;
    const button = patients[index];
    patients.forEach(b => b.setAttribute("aria-pressed", String(b === button)));
    const next = new Image();
    next.src = button.dataset.after;
    compare.classList.add("swapping");
    setTimeout(() => {
      beforeImg.src = button.dataset.before;
      afterImg.src = button.dataset.after;
      const done = () => { compare.classList.remove("swapping"); touched = false; sweep(); };
      if (afterImg.complete) done(); else afterImg.addEventListener("load", done, { once: true });
    }, reduced ? 0 : 450);
  };
  patients.forEach((button, i) => button.addEventListener("click", () => { chosen = true; choose(i); }));
  if (!reduced) {
    const rotate = setInterval(() => {
      if (chosen || touched || document.hidden) return;
      if (compare.getBoundingClientRect().bottom < 0) return;
      choose((current + 1) % patients.length);
    }, 7000);
    compare.addEventListener("pointerdown", () => clearInterval(rotate), { once: true });
  }

  // Hero tilt follows the cursor.
  const tiltHost = $("[data-tilt]");
  const tilt = $(".tilt", tiltHost);
  if (fine && !reduced && tilt) {
    tiltHost.addEventListener("pointermove", event => {
      const r = tiltHost.getBoundingClientRect();
      const x = (event.clientX - r.left) / r.width - 0.5;
      const y = (event.clientY - r.top) / r.height - 0.5;
      tilt.style.setProperty("--ry", `${x * 8}deg`);
      tilt.style.setProperty("--rx", `${-y * 6}deg`);
    });
    tiltHost.addEventListener("pointerleave", () => { tilt.style.setProperty("--ry", "0deg"); tilt.style.setProperty("--rx", "0deg"); });
  }

  // Cursor glow on cards.
  if (fine) $$(".glow").forEach(card => card.addEventListener("pointermove", event => {
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${event.clientX - r.left}px`);
    card.style.setProperty("--my", `${event.clientY - r.top}px`);
  }));

  // One scroll loop: progress bar, nav glass, parallax, scale-in and the closing zoom.
  const progress = $("[data-progress]");
  const parallax = reduced ? [] : $$("[data-speed]");
  const scaleIns = reduced ? [] : $$("[data-scale-in]");
  const zoom = reduced ? null : $("[data-zoom]");
  let queued = false;
  const update = () => {
    queued = false;
    const vh = window.innerHeight;
    const max = document.documentElement.scrollHeight - vh;
    progress.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
    nav.classList.toggle("scrolled", window.scrollY > 12);
    for (const el of parallax) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      const offset = (r.top + r.height / 2 - vh / 2) * Number(el.dataset.speed);
      el.style.translate = `0 ${offset.toFixed(1)}px`;
    }
    for (const el of scaleIns) {
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.75)));
      el.style.scale = String(0.84 + 0.16 * p);
      el.style.opacity = String(0.4 + 0.6 * p);
    }
    if (zoom) {
      const r = zoom.parentElement.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
      zoom.style.scale = String(1.18 - 0.18 * p);
    }
  };
  const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();

  // Return calculator: the clinician's own numbers, worked out as they move the sliders.
  const roi = $("[data-roi]");
  if (roi) {
    const money = n => `£${Math.round(n).toLocaleString("en-GB")}`;
    const inputs = Object.fromEntries($$("[data-in]", roi).map(i => [i.dataset.in, i]));
    const out = key => $(`[data-out="${key}"]`, roi);
    const calc = () => {
      const consults = Number(inputs.consults.value), uplift = Number(inputs.uplift.value), fee = Number(inputs.fee.value);
      for (const input of Object.values(inputs)) input.style.setProperty("--fill", `${((input.value - input.min) / (input.max - input.min)) * 100}%`);
      const revenue = consults * 12 * (uplift / 10) * fee;
      out("consults").textContent = String(consults);
      out("uplift").textContent = String(uplift);
      out("fee").textContent = money(fee);
      out("revenue").textContent = money(revenue);
      out("multiple").textContent = revenue > 0 ? `${Math.max(1, Math.round(revenue / 299.99)).toLocaleString("en-GB")}×` : "–";
    };
    roi.addEventListener("input", calc);
    calc();
  }

  // Book a demo / early access.
  const lead = $("[data-lead]");
  if (lead) {
    const status = $("[data-lead-status]", lead);
    lead.addEventListener("submit", async event => {
      event.preventDefault();
      const data = new FormData(lead);
      const say = (text, kind) => { status.textContent = text; status.className = `demo-status ${kind}`; };
      if (!String(data.get("name") || "").trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(data.get("email") || ""))) return say("Add your name and a valid email address.", "err");
      if (!data.get("privacy")) return say("Please tick the box to confirm how we’ll use your details.", "err");
      const button = $("button[type=submit]", lead);
      button.disabled = true; say("Sending…", "");
      try {
        const response = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit",
          body: JSON.stringify({ name: data.get("name"), email: data.get("email"), practice: data.get("practice"), role: data.get("role"), interest: data.get("interest"), message: data.get("message"), website: data.get("website"), privacy: true }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Your request couldn’t be sent. Please try again.");
        lead.reset();
        say(data.get("interest") === "early_access" ? "Thank you. You’re on the early-access list; we’ll email you when the app is ready." : "Thank you. Dr Vik will email you to arrange a time.", "ok");
      } catch (error) {
        say(error.message, "err");
      } finally { button.disabled = false; }
    });
  }

  // Pricing: annual or monthly, with a sliding pill.
  const plans = {
    annual: { price: "£299.99", period: "/year", allowance: "600 smile generations a year" },
    monthly: { price: "£29.99", period: "/month", allowance: "50 smile generations a month, unused ones roll over up to 100" },
  };
  const billing = $("[data-billing]");
  const togglePill = $("[data-toggle-pill]", billing);
  const placePill = () => {
    const active = $("[aria-pressed='true']", billing);
    togglePill.style.width = `${active.offsetWidth}px`;
    togglePill.style.transform = `translateX(${active.offsetLeft - 4}px)`;
  };
  billing.classList.add("has-pill");
  placePill();
  window.addEventListener("resize", placePill);
  const price = $(".plan-price");
  billing.addEventListener("click", event => {
    const button = event.target.closest("[data-plan]");
    if (!button || button.getAttribute("aria-pressed") === "true") return;
    const plan = plans[button.dataset.plan];
    $$("[data-plan]", billing).forEach(b => b.setAttribute("aria-pressed", String(b === button)));
    placePill();
    price.classList.add("flip");
    setTimeout(() => {
      $("[data-price]").textContent = plan.price;
      $("[data-period]").textContent = plan.period;
      $("[data-allowance]").textContent = plan.allowance;
      price.classList.remove("flip");
    }, reduced ? 0 : 220);
  });
});
