/* The bar along the top, there the whole way down. It reads the section beneath it
   and turns dark over the films and paintings, underlines the part of the page you're
   in, and draws a hairline of how far you've come. On phones its Menu opens a full
   page of links. Also keeps the San Francisco clock in the footer. */
(() => {
    'use strict';
    const nav = document.querySelector('.nav');
    if (!nav) return;
    const root = document.documentElement;
    const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tones = [...document.querySelectorAll('section[data-tone]')];
    const spots = [...document.querySelectorAll('[data-nav]')];
    const links = [...nav.querySelectorAll('.nav-links a')];
    const open = document.querySelector('.open');
    const hair = nav.querySelector('.nav-progress');
    const clamp01 = (v) => Math.min(1, Math.max(0, v));

    let queued = false;
    function paint() {
        queued = false;
        const vh = innerHeight, mid = nav.offsetHeight / 2;
        let tone = 'light';
        for (const s of tones) {
            const r = s.getBoundingClientRect();
            if (r.top <= mid && r.bottom > mid) { tone = s.dataset.tone; break; }
        }
        nav.dataset.tone = tone;
        nav.classList.toggle('is-scrolled', scrollY > 8);

        let here = '';
        for (const s of spots) {
            const r = s.getBoundingClientRect();
            if (r.top <= vh * 0.45 && r.bottom > vh * 0.45) { here = s.dataset.nav; break; }
        }
        for (const a of links) {
            const on = a.hash === '#' + here;
            a.classList.toggle('is-here', on);
            if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
        }

        const max = root.scrollHeight - vh;
        hair.style.transform = `scaleX(${max > 0 ? clamp01(scrollY / max).toFixed(4) : 0})`;

        // the big name on the opening card hands over to the small one in the bar
        if (open) {
            const r = open.getBoundingClientRect();
            const p = clamp01(-r.top / Math.max(1, r.height - vh));
            nav.style.setProperty('--mark', REDUCED ? 1 : clamp01((p - 0.3) / 0.4).toFixed(3));
        }
    }
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(paint); } };
    addEventListener('scroll', queue, { passive: true });
    addEventListener('resize', queue, { passive: true });
    paint();

    /* --- Menu (phones) --- */
    const btn = nav.querySelector('.nav-menu');
    const menu = document.getElementById('menu');
    function setMenu(on) {
        if (!menu) return;
        btn.setAttribute('aria-expanded', String(on));
        btn.querySelector('span').textContent = on ? 'Close' : 'Menu';
        menu.classList.toggle('is-open', on);
        menu.inert = !on;
        root.classList.toggle('menu-open', on);
    }
    if (menu) {
        menu.inert = true;
        btn.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
        addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('is-open')) { setMenu(false); btn.focus(); } });
        matchMedia('(min-width: 961px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });
    }

    /* --- In-page links glide there (and close the menu first) --- */
    document.addEventListener('click', (e) => {
        const a = e.target.closest?.('a[href^="#"]');
        if (!a) return;
        const target = a.hash === '#top' ? document.body : document.querySelector(a.hash);
        if (!target) return;
        e.preventDefault();
        setMenu(false);
        const top = a.hash === '#top' ? 0 : target.getBoundingClientRect().top + scrollY;
        scrollTo({ top, behavior: REDUCED ? 'instant' : 'smooth' });
        history.replaceState(null, '', a.hash === '#top' ? location.pathname : a.hash);
    });

    /* --- The time where he is --- */
    const clock = document.getElementById('sf-time');
    if (clock) {
        const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' });
        const tick = () => { clock.textContent = fmt.format(new Date()).toLowerCase(); };
        tick();
        setInterval(tick, 20000);
    }
})();
