/* live-site sections: cursor glow, pricing toggle, one FAQ open at a time, the demo form (preview only) */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (matchMedia('(pointer: fine)').matches) document.querySelectorAll('.l-glow').forEach(card => card.addEventListener('pointermove', e => {
    const r = card.getBoundingClientRect(); card.style.setProperty('--mx', e.clientX - r.left + 'px'); card.style.setProperty('--my', e.clientY - r.top + 'px');
  }));
  const plans = { annual: { price: '£299.99', period: '/year', allowance: '600 smile generations a year' },
                  monthly: { price: '£29.99', period: '/month', allowance: '50 smile generations a month, unused ones roll over up to 100' } };
  const billing = document.querySelector('[data-billing]');
  if (billing) {
    const pill = billing.querySelector('[data-toggle-pill]'), price = document.querySelector('.l-plan-price');
    const place = () => { const a = billing.querySelector('[aria-pressed="true"]'); pill.style.width = a.offsetWidth + 'px'; pill.style.transform = 'translateX(' + (a.offsetLeft - 4) + 'px)'; };
    billing.classList.add('l-has-pill'); place(); addEventListener('resize', place);
    new ResizeObserver(place).observe(billing);
    billing.addEventListener('click', e => {
      const b = e.target.closest('[data-plan]'); if (!b || b.getAttribute('aria-pressed') === 'true') return;
      const plan = plans[b.dataset.plan];
      billing.querySelectorAll('[data-plan]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); place();
      price.classList.add('l-flip');
      setTimeout(() => { document.querySelector('[data-price]').textContent = plan.price; document.querySelector('[data-period]').textContent = plan.period;
        document.querySelector('[data-allowance]').textContent = plan.allowance; price.classList.remove('l-flip'); }, reduce ? 0 : 220);
    });
  }
  const faq = [...document.querySelectorAll('.l-faq-list details')];
  faq.forEach(d => d.addEventListener('toggle', () => { if (d.open) faq.forEach(o => { if (o !== d) o.open = false; }); }));
  const lead = document.querySelector('[data-lead]');
  if (lead) {
    const status = lead.querySelector('[data-lead-status]');
    const say = (t, k) => { status.textContent = t; status.className = 'l-demo-status' + (k ? ' l-' + k : ''); };
    lead.addEventListener('submit', e => {
      e.preventDefault();
      const data = new FormData(lead);
      if (!String(data.get('name') || '').trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(data.get('email') || ''))) return say('Add your name and a valid email address.', 'err');
      if (!data.get('privacy')) return say('Please tick the box to confirm how we’ll use your details.', 'err');
      const button = lead.querySelector('button[type=submit]');
      button.disabled = true; say('Sending…', '');
      fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
        body: JSON.stringify({ name: data.get('name'), email: data.get('email'), practice: data.get('practice'), role: data.get('role'), interest: data.get('interest'), message: data.get('message'), website: data.get('website'), privacy: true }) })
        .then(async r => { const body = await r.json().catch(() => ({})); if (!r.ok) throw new Error(body.error || 'Your request couldn’t be sent. Please try again.'); })
        .then(() => { lead.reset(); say(data.get('interest') === 'early_access' ? 'Thank you. You’re on the early-access list; we’ll email you when the app is ready.' : 'Thank you. Dr Vik will email you to arrange a time.', 'ok'); })
        .catch(err => say(err.message, 'err'))
        .finally(() => { button.disabled = false; });
    });
  }
})();
