(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const sm = t => t * t * (3 - 2 * t);
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, t) => a + (b - a) * t;
  let uid = 0;

  /* the SmileCompose mark */
  const markSVG = () => { const id = 'mg' + (++uid); return `
    <defs><linearGradient id="${id}" x1="215" y1="380" x2="810" y2="700" gradientUnits="userSpaceOnUse"><stop stop-color="#E2C38F"/><stop offset="1" stop-color="#A97C42"/></linearGradient></defs>
    <path class="g" pathLength="100" d="M512 251.5V856.5"/><path class="g g2" pathLength="100" d="M270 481.5H755"/>
    <path class="a" pathLength="100" d="M215 431.5C336.5 769 687.5 769 809 431.5" stroke="url(#${id})"/>
    <path class="r" pathLength="100" d="M215 431.5C336.5 769 687.5 769 809 431.5" transform="translate(0 -36)"/>`; };
  document.querySelectorAll('#introMark, #compMark, #endMark, [data-mark]').forEach(s => s.innerHTML = markSVG());

  /* intro: the mark draws, the name settles, then the page */
  const intro = document.getElementById('intro'), word = intro.querySelector('.word');
  'SMILECOMPOSE'.split('').forEach((c, i) => { const s = document.createElement('span'); s.textContent = c; s.style.transitionDelay = (i * 45) + 'ms'; word.appendChild(s); });
  let opened = false; const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, reduce ? Math.min(ms, 200) : ms));
  const open = () => {
    if (opened) return; opened = true; timers.forEach(clearTimeout);
    intro.classList.add('words', 'tag', 'out');
    document.body.classList.remove('locked'); document.body.classList.add('ready');
    setTimeout(heroSweep, reduce ? 0 : 900);
    setTimeout(() => intro.classList.add('gone'), 1000);
  };
  document.body.classList.add('locked'); scrollTo(0, 0);
  requestAnimationFrame(() => document.getElementById('introMark').classList.add('draw'));
  at(1000, () => intro.classList.add('words'));
  at(1700, () => intro.classList.add('tag'));
  at(2900, open);
  document.getElementById('skip').addEventListener('click', open);
  ['wheel', 'touchstart', 'keydown'].forEach(ev => addEventListener(ev, () => { if (!opened) open(); }, { passive: true, once: true }));

  /* arrivals */
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.rv').forEach(el => io.observe(el));
  const endMark = document.getElementById('endMark');
  new IntersectionObserver((es, o) => es.forEach(e => { if (e.isIntersecting) { endMark.classList.add('draw'); o.disconnect(); } }), { threshold: .6 }).observe(endMark);

  /* a draggable before/after */
  const compare = (el, start) => {
    let x = start, dragging = false;
    const set = v => { x = clamp(v, 0, 100); el.style.setProperty('--x', x + '%'); el.setAttribute('aria-valuenow', Math.round(x)); };
    const px = e => { const r = el.getBoundingClientRect(); return (e.clientX - r.left) / r.width * 100; };
    el.addEventListener('pointerdown', e => { dragging = true; el.classList.add('drag'); el.setPointerCapture(e.pointerId); set(px(e)); });
    el.addEventListener('pointermove', e => { if (dragging) set(px(e)); });
    const up = () => { dragging = false; el.classList.remove('drag'); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); set(x + (e.key === 'ArrowLeft' ? -5 : 5)); } });
    const sweep = (from, to, ms) => { if (reduce) return set(to); const t0 = performance.now(); const st = n => { if (dragging) return; const t = clamp((n - t0) / ms), e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; set(lerp(from, to, e)); if (t < 1) requestAnimationFrame(st); }; requestAnimationFrame(st); };
    set(start);
    return { set, sweep };
  };
  const heroSweep = () => window.hxStart && window.hxStart();

  /* his smile: opens on its own when it scrolls into view, then it's draggable */
  const whyEl = document.getElementById('whyCmp');
  if (whyEl) {
    const why = compare(whyEl, 100);
    new IntersectionObserver((es, o) => es.forEach(e => { if (e.isIntersecting) { setTimeout(() => why.sweep(100, 50, 1600), 350); o.disconnect(); } }), { threshold: .55 }).observe(whyEl);
  }

  /* try it */
  const cmpEl = document.getElementById('cmp'), cmp = compare(cmpEl, 50), cmpAfter = document.getElementById('cmpAfter'), cmpLabel = document.getElementById('cmpLabel');
  const state = { shape: 'oval', treat: 'layered' };
  const SHAPE = { oval: 'Oval', square: 'Square', triangle: 'Triangle' };
  const TREAT = { bonding: 'Bonding · A1', layered: 'Layered · B1', porcelain: 'Porcelain · BL2' };
  const file = () => state.treat === 'alignment' ? 'alignment' : state.treat === 'fullarch' ? `fullarch-${state.shape}` : `${state.shape}-${state.treat}`;
  const label = () => state.treat === 'alignment' ? 'Alignment' : state.treat === 'fullarch' ? `${SHAPE[state.shape]} · Full arch · BL1` : `${SHAPE[state.shape]} · ${TREAT[state.treat]}`;
  let swap = 0;
  const apply = () => {
    const my = ++swap, src = `/site/v6/assets/patient/${file()}.webp`, t0 = performance.now();
    document.querySelectorAll('[data-group="shape"] .chip').forEach(c => c.disabled = state.treat === 'alignment');
    cmpEl.classList.add('busy');
    const im = new Image(); im.src = src;
    const done = () => { if (my !== swap) return; setTimeout(() => { if (my !== swap) return; cmpAfter.src = src; cmpLabel.textContent = label(); cmpEl.classList.remove('busy'); cmp.sweep(100, 50, 900); }, Math.max(0, (reduce ? 0 : 600) - (performance.now() - t0))); };
    (im.decode ? im.decode() : Promise.resolve()).then(done, done);
  };
  document.querySelectorAll('.chips').forEach(g => g.addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b || b.disabled) return;
    g.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c === b));
    state[g.dataset.group] = b.dataset.v; apply();
  }));

  /* return calculator: the same sums as the app's landing page */
  (() => {
    const card = document.getElementById('roiCard'); if (!card) return;
    const ins = Object.fromEntries([...card.querySelectorAll('[data-in]')].map(i => [i.dataset.in, i]));
    const outs = Object.fromEntries([...card.querySelectorAll('[data-out]')].map(o => [o.dataset.out, o]));
    const gbp = n => '£' + Math.round(n).toLocaleString('en-GB');
    let shown = 0, target = 0, raf = 0;
    const tick = () => { shown += (target - shown) * (reduce ? 1 : .18); if (Math.abs(target - shown) < 1) shown = target;
      outs.revenue.textContent = gbp(shown); outs.multiple.textContent = Math.max(0, Math.round(shown / 299.99)) + '×';
      raf = shown === target ? 0 : requestAnimationFrame(tick); };
    const update = () => {
      const c = +ins.consults.value, u = +ins.uplift.value, f = +ins.fee.value;
      outs.consults.textContent = c; outs.uplift.textContent = u % 1 ? u.toFixed(1) : u; outs.fee.textContent = gbp(f);
      Object.values(ins).forEach(i => i.style.setProperty('--fill', ((i.value - i.min) / (i.max - i.min) * 100) + '%'));
      target = c * 12 * (u / 10) * f;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    Object.values(ins).forEach(i => i.addEventListener('input', update));
    shown = 0; update();
  })();

  /* account: two steps that play on their own while in view; tap one to pick it */
  (() => {
    const steps = [...document.querySelectorAll('#acctSteps .acct-step')], shots = [...document.querySelectorAll('#acctView img')], url = document.getElementById('acctUrl');
    if (!steps.length) return;
    const URLS = ['SmileCompose · Create your account', 'SmileCompose · Home'];
    const DUR = 4600; let i = 0, t0 = 0, visible = false, paused = false;
    const show = n => { i = n; t0 = performance.now(); steps.forEach((s, k) => { s.classList.toggle('on', k === n); s.setAttribute('aria-selected', k === n); s.style.setProperty('--p', 0); }); shots.forEach((im, k) => im.classList.toggle('on', k === n)); url.textContent = URLS[n]; };
    steps.forEach((s, k) => s.addEventListener('click', () => { paused = true; show(k); steps[k].style.setProperty('--p', 1); }));
    new IntersectionObserver(es => es.forEach(e => { visible = e.isIntersecting; if (visible && !paused) t0 = performance.now(); }), { threshold: .4 }).observe(document.getElementById('acctView'));
    const loop = n => { if (visible && !paused && !reduce) { const p = (n - t0) / DUR; steps[i].style.setProperty('--p', Math.min(1, p)); if (p >= 1) show((i + 1) % steps.length); } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  })();

  /* scroll scenes */
  const nav = document.getElementById('nav');
  const story = document.getElementById('how'), stage = document.getElementById('stage'), sph = document.getElementById('sph');
  const chapters = document.getElementById('chapters'), chs = [...chapters.querySelectorAll('.ch')];
  const cards = [...document.querySelectorAll('#deck .card')], docCard = document.querySelector('.docs .doc'), scCard = document.querySelector('.docs .sc');
  const compMark = document.getElementById('compMark'), camText = document.getElementById('camText');
  const shareArt = document.getElementById('shareArt'), shareLayers = shareArt ? [...shareArt.querySelectorAll('[data-depth]')] : [];
  const progress = el => { const r = el.getBoundingClientRect(), span = r.height - innerHeight; return span > 0 ? clamp(-r.top / span) : 0; };
  const narrow = () => innerWidth <= 900;
  const size = () => {
    const sw = stage.clientWidth, sh = stage.clientHeight;
    const h = narrow() ? Math.min(sh * .96, sw / .758 * .8) : Math.min(sh * .82, 700, sw / (.758 * 1.88));
    sph.style.setProperty('--phh', h + 'px');
  };
  addEventListener('resize', size); size();
  const camLines = ['Move a little closer', 'Hold still', 'Lined up — take the photo'];
  let markDrawn = false, chOn = 0;

  const frame = () => {
    const vh = innerHeight;
    nav.classList.toggle('lined', scrollY > 10);

    const p = progress(story), w = sph.offsetWidth;
    const shift = narrow() ? 0 : -(w * .82 + 28) / 2;
    const capOut = sm(seg(p, .16, .2));
    sph.style.setProperty('--b', sm(seg(p, .02, .1)) * (1 - capOut));
    sph.style.setProperty('--o', sm(seg(p, .05, .13)) * (1 - capOut));
    sph.style.setProperty('--cc', sm(seg(p, .03, .06)) * (1 - capOut));
    sph.style.setProperty('--fl', seg(p, .145, .155) * (1 - seg(p, .155, .19)) * .85);
    camText.textContent = camLines[p < .08 ? 0 : p < .12 ? 1 : 2];
    const inD = sm(seg(p, .19, .25)), outD = sm(seg(p, .56, .61));
    let x = shift * inD * (1 - outD);
    const starts = [.21, .3, .39, .48];
    cards.forEach((c, i) => {
      const t = sm(seg(p, starts[i], starts[i] + .07));
      const n = starts.slice(i + 1).reduce((s, st) => s + sm(seg(p, st, st + .07)), 0);
      c.style.opacity = t * (1 - n * .3) * (1 - outD);
      c.style.transform = `translate3d(${(1 - t) * 40 + outD * 40}px, ${(1 - t) * 30 - n * 16}px, 0) scale(${(1 - (1 - t) * .04) * (1 - n * .04)})`;
      c.style.zIndex = 10 + i;
    });
    const co = sm(seg(p, .6, .63)) * (1 - sm(seg(p, .67, .7)));
    sph.style.setProperty('--co', co);
    if (co > .05 && !markDrawn) { markDrawn = true; compMark.classList.remove('draw'); void compMark.offsetWidth; compMark.classList.add('draw'); }
    if (p < .55) markDrawn = false;
    const wipe = sm(seg(p, .69, .8));
    sph.style.setProperty('--x', (100 - wipe * 100) + '%');
    sph.style.setProperty('--so', wipe > 0 && wipe < 1 ? 1 : 0);
    sph.style.setProperty('--tp', sm(seg(p, .78, .81)) * (1 - sm(seg(p, .84, .86))));
    const D = sm(seg(p, .85, .93));
    x = narrow() ? x : lerp(x, shift, D);
    sph.style.setProperty('--px', x + 'px'); sph.style.setProperty('--ps', 1 - D * (narrow() ? .05 : .06));
    const dT = sm(seg(p, .86, .93)), sT = sm(seg(p, .9, .97));
    docCard.style.opacity = dT; docCard.style.transform = `translate3d(${(1 - dT) * 40}px, ${(1 - dT) * 24}px, 0) rotate(${(1 - dT) * 3 - 1.5}deg)`;
    scCard.style.opacity = sT; scCard.style.transform = `translate3d(${(1 - sT) * 30}px, ${(1 - sT) * 30}px, 0) rotate(${(1 - sT) * -2 + 1}deg)`;
    const ci = p < .19 ? 0 : p < .6 ? 1 : p < .85 ? 2 : 3;
    if (ci !== chOn) { chOn = ci; chs.forEach((c, i) => c.classList.toggle('on', i === ci)); }
    chapters.style.setProperty('--cp', p);

    const sr = shareArt ? shareArt.getBoundingClientRect() : { top: 0, height: 0 }, sc = (sr.top + sr.height / 2) / vh - .5;
    if (!reduce && shareArt) shareLayers.forEach(l => l.style.transform = `translate3d(0, ${sc * +l.dataset.depth * 60}px, 0) rotate(${l.classList.contains('doc') ? -2 : 1.5}deg)`);

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();
