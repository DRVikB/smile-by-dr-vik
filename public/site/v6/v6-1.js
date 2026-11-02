/* hero (live site layout): drag or keyboard compare, a gentle sway, sample patients, tilt; Case Library stack; parallax */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, fine = matchMedia('(pointer: fine)').matches;
  const cmp = document.getElementById('hxCmp'), range = document.getElementById('hxRange');
  const setPos = v => { const c = Math.min(100, Math.max(0, v)); cmp.style.setProperty('--pos', c + '%'); range.value = String(Math.round(c)); };
  range.addEventListener('input', () => setPos(Number(range.value)));
  let touched = false;
  cmp.addEventListener('pointerdown', () => { touched = true; });
  const sway = () => {
    if (reduce) return;
    let t0;
    const f = n => { if (touched) return; t0 ??= n; const t = (n - t0) / 2600; if (t > 1) return setPos(50); setPos(50 + Math.sin(t * Math.PI * 2) * 24 * (1 - t)); requestAnimationFrame(f); };
    requestAnimationFrame(f);
  };
  let started = false;
  window.hxStart = () => { if (started) return; started = true; setTimeout(sway, 700); };

  const buttons = [...document.querySelectorAll('#hxPatients button')];
  const [beforeImg, afterImg] = cmp.querySelectorAll('img');
  let current = 0, chosen = false;
  const choose = i => {
    if (i === current) return; current = i;
    const b = buttons[i]; buttons.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    new Image().src = b.dataset.after; new Image().src = b.dataset.before;
    cmp.classList.add('swapping');
    setTimeout(() => {
      beforeImg.src = b.dataset.before; afterImg.src = b.dataset.after;
      const done = () => { cmp.classList.remove('swapping'); touched = false; sway(); };
      if (afterImg.complete) done(); else afterImg.addEventListener('load', done, { once: true });
    }, reduce ? 0 : 450);
  };
  buttons.forEach((b, i) => b.addEventListener('click', () => { chosen = true; choose(i); }));
  if (!reduce) {
    const rot = setInterval(() => { if (chosen || touched || document.hidden || !started) return; if (cmp.getBoundingClientRect().bottom < 0) return; choose((current + 1) % buttons.length); }, 7000);
    cmp.addEventListener('pointerdown', () => clearInterval(rot), { once: true });
  }

  const host = document.getElementById('hxVisual'), tilt = document.getElementById('hxTilt');
  if (fine && !reduce) {
    host.addEventListener('pointermove', e => { const r = host.getBoundingClientRect(); tilt.style.setProperty('--ry', ((e.clientX - r.left) / r.width - .5) * 8 + 'deg'); tilt.style.setProperty('--rx', -((e.clientY - r.top) / r.height - .5) * 6 + 'deg'); });
    host.addEventListener('pointerleave', () => { tilt.style.setProperty('--ry', '0deg'); tilt.style.setProperty('--rx', '0deg'); });
  }

  const stack = document.getElementById('clStack');
  new IntersectionObserver((es, o) => es.forEach(e => { if (e.isIntersecting) { stack.classList.add('in'); o.disconnect(); } }), { threshold: .25 }).observe(stack);

  const items = reduce ? [] : [...document.querySelectorAll('[data-hx-speed]')];
  let queued = false;
  const update = () => { queued = false; const vh = innerHeight;
    for (const el of items) { const r = el.getBoundingClientRect(); if (r.bottom < -200 || r.top > vh + 200) continue; el.style.translate = '0 ' + ((r.top + r.height / 2 - vh / 2) * Number(el.dataset.hxSpeed)).toFixed(1) + 'px'; } };
  if (items.length) { addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true }); update(); }
})();
