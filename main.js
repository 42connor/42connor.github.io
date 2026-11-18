/* Variant 2 — One painting. The canvas, the rising window, reveals, the menu. */
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - t, 3);


/* ---------- the painting ---------- */
const paints = [...document.querySelectorAll('.paint')];
const CREDITS = [
  'Vincent van Gogh, Almond Blossom',
  'Claude Monet, Water Lilies',
  'Vincent van Gogh, The Starry Night',
  'Katsushika Hokusai, The Great Wave off Kanagawa',
  'Claude Monet, Poppy Field',
  'J. M. W. Turner, San Giorgio, sunset',
];
// decode each painting ahead of time (off the main thread) so a crossfade never waits on it
const load = (p) => {
  if (p.style.backgroundImage || p._loading) return;
  p._loading = true;
  const im = new Image(); im.src = p.dataset.src;
  (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() => { p.style.backgroundImage = `url(${p.dataset.src})`; p._im = im; });
};
// the first is inline; the next one early, the rest once the page has loaded
load(paints[1]);
addEventListener('load', () => paints.forEach((p, k) => setTimeout(() => load(p), 400 + k * 350)), { once: true });

const credit = document.querySelector('.credit');
const foot = document.querySelector('.foot');
const creditText = credit.querySelector('.credit-text');
let current = 0, swapT = 0;
function show(i) {
  if (i === current) return;
  current = i;
  load(paints[i]);
  paints.forEach((p, k) => p.classList.toggle('is-on', k === i));
  credit.classList.add('is-swap');
  clearTimeout(swapT);
  swapT = setTimeout(() => { creditText.textContent = CREDITS[i]; credit.classList.remove('is-swap'); }, 900);
}

const zones = [...document.querySelectorAll('[data-paint]')];
const navLinks = [...document.querySelectorAll('.nav-links a')];
function whichPainting() {
  const y = innerHeight * 0.55;
  for (const z of zones) {
    const r = z.getBoundingClientRect();
    if (r.top <= y && r.bottom > y) return { i: +z.dataset.paint, id: z.id };
  }
  return null;
}

/* ---------- opening: the window rises from below the horizon ---------- */
const open = document.querySelector('.open');
const rise = open.querySelector('.rise');
const win = open.querySelector('.win-hero');
const nameEl = open.querySelector('.name');
const heroLabel = open.querySelector('.piece-hero .label');
let baseTop = 0, pad = 120;

function measure() {
  pad = parseFloat(getComputedStyle(rise).paddingTop) || 0;
  rise.style.transform = 'none';
  // the window's resting top inside the pinned stage
  baseTop = win.getBoundingClientRect().top - open.querySelector('.stage').getBoundingClientRect().top;
}

function opening() {
  const vh = innerHeight;
  const span = open.offsetHeight - vh;
  const p = clamp(-open.getBoundingClientRect().top / span);
  const e = smooth(0.02, 0.8, p);
  const horizon = vh * 0.5;
  const y0 = horizon + 40 - baseTop;           // the window starts just under the horizon
  const y = y0 * (1 - e);
  const s = 0.9 + 0.1 * e;
  rise.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) scale(${s.toFixed(4)})`;
  // the horizon drops away as it arrives, so the whole window comes clear
  const H = horizon + vh * 1.2 * smooth(0.5, 1, e);
  const m = (H - (baseTop + y)) / s + pad;
  if (e >= 0.999) rise.classList.remove('is-masked');
  else { rise.classList.add('is-masked'); rise.style.setProperty('--m', `${m.toFixed(1)}px`); }
  nameEl.style.setProperty('--name-o', (1 - smooth(0.42, 0.8, e)).toFixed(3));
  nameEl.style.setProperty('--name-y', `${(-34 * e).toFixed(1)}px`);
  open.querySelector('.stage').style.setProperty('--e', e.toFixed(4));
  heroLabel.style.setProperty('--lab-o', smooth(0.84, 1, e).toFixed(3));
}

/* ---------- the lily pond: windows at different depths ---------- */
const pads = [...document.querySelectorAll('.pad')];
const wide = matchMedia('(min-width: 960px)');
function pond() {
  if (!wide.matches) { pads.forEach((p) => { if (p._y) { p._win.style.transform = p._cap.style.transform = ''; p._y = 0; } }); return; }
  const mid = innerHeight / 2;
  for (const p of pads) {
    p._win ||= p.querySelector('.win'); p._cap ||= p.querySelector('figcaption');
    p._d ??= parseFloat(p.style.getPropertyValue('--d')) || 0;
    const r = p.getBoundingClientRect();
    if (r.bottom < -200 || r.top > innerHeight + 200) continue;
    const y = Math.round((r.top + r.height / 2 - mid) * p._d);
    if (y === p._y) continue;
    p._y = y;
    p._win.style.transform = p._cap.style.transform = `translate3d(0, ${y}px, 0)`;
  }
}

/* ---------- one loop, on scroll ---------- */
let ticking = false;
function frame() {
  ticking = false;
  const z = whichPainting();
  if (z) {
    show(z.i);
    navLinks.forEach((a) => a.classList.toggle('is-here', a.getAttribute('href') === `#${({ contact: 'more' })[z.id] || z.id}`));
  }
  credit.classList.toggle('is-gone', foot.getBoundingClientRect().top < innerHeight * 0.75);
  if (!calm) { opening(); pond(); }
}
const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
addEventListener('scroll', request, { passive: true });
addEventListener('resize', () => { if (!calm) measure(); request(); });
if (!calm) measure();
frame();
document.fonts?.ready.then(() => { if (!calm) measure(); request(); });

/* ---------- reveals ---------- */
const io = new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting) { const el = e.target; io.unobserve(el); el.classList.add('in'); }
}), { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
document.querySelectorAll('.reveal').forEach((el) => (calm ? el.classList.add('in') : io.observe(el)));

/* ---------- clips play while in view (they're encoded at the size they're shown, so a few
   at once are cheap; starting and stopping them as you scroll would cost more) ---------- */
const vids = [...document.querySelectorAll('video[data-auto]')];
if (!calm) {
  const vio = new IntersectionObserver((es) => es.forEach((e) => {
    const v = e.target;
    if (e.isIntersecting) { v.preload = 'auto'; v.play().catch(() => {}); } else v.pause();
  }), { threshold: 0.2 });
  vids.forEach((v) => vio.observe(v));
} else {
  vids.forEach((v) => v.addEventListener('click', () => { if (v.paused) v.play().catch(() => {}); else v.pause(); }));
}

/* ---------- copy the brew line ---------- */
document.querySelectorAll('.copy').forEach((b) => b.addEventListener('click', () => {
  navigator.clipboard?.writeText(b.dataset.copy).then(() => {
    b.classList.add('is-done'); setTimeout(() => b.classList.remove('is-done'), 1600);
  }).catch(() => {});
}));

/* ---------- menu ---------- */
const menuBtn = document.querySelector('.nav-menu');
const menu = document.getElementById('menu');
function setMenu(on) {
  menu.hidden = !on;
  root.classList.toggle('menu-open', on);
  menuBtn.setAttribute('aria-expanded', String(on));
  menuBtn.textContent = on ? 'Close' : 'Menu';
}
menuBtn.addEventListener('click', () => setMenu(menu.hidden));
menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) setMenu(false); });
wide.addEventListener('change', () => { if (wide.matches) setMenu(false); });

/* ---------- in-page links glide (instant under reduced motion) ---------- */
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const el = document.getElementById(a.getAttribute('href').slice(1));
  if (!el) return;
  e.preventDefault();
  const y = a.getAttribute('href') === '#top' ? 0 : el.getBoundingClientRect().top + scrollY - (el.classList.contains('anchor') ? 0 : 72);
  scrollTo({ top: y, behavior: calm ? 'auto' : 'smooth' });
  history.replaceState(null, '', a.getAttribute('href'));
});

/* ---------- San Francisco time ---------- */
const t = document.querySelector('.sf-time');
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' });
const tick = () => { t.textContent = fmt.format(new Date()); };
tick(); setInterval(tick, 30000);

/* ---------- the work, running: StyleFeatures pieces and the Common Ground site live in
   their windows. Each loads only as it nears the screen and is unloaded once it is far
   away again; until it is running, the window shows its still. ---------- */
const hosts = [...document.querySelectorAll('[data-piece], .win-site')];
const winOf = (h) => (h.matches('.win') ? h : h.querySelector('.win'));
let lastHold = 0;
const holdAuto = () => {   // autoscroll.js hands the page back on any wheel; a hand in a window counts too
  const n = performance.now(); if (n - lastHold < 400) return; lastHold = n;
  dispatchEvent(new Event('wheel'));
};
function mount(h) {
  if (h._frame) return;
  const win = winOf(h);
  const f = document.createElement('iframe');
  if (h.dataset.piece) {
    f.src = `pieces/live.html?p=${h.dataset.piece}`;
    f.title = `${h.querySelector('figcaption').firstChild.textContent}, a StyleFeatures piece, running`;
  } else {
    f.src = h.dataset.site; f.title = h.dataset.title;
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.addEventListener('load', () => setTimeout(() => h._frame === f && win.classList.add('is-live'), 350));
  }
  f.addEventListener('load', () => {
    // same origin: a touch inside counts as a touch on the page (autoscroll holds; the music may start)
    try {
      const w = f.contentWindow;
      w.addEventListener('pointerdown', () => { h._touched = true; holdAuto(); dispatchEvent(new PointerEvent('pointerdown')); }, { passive: true });
      ['pointermove', 'wheel', 'touchstart'].forEach((ev) => w.addEventListener(ev, holdAuto, { passive: true }));
    } catch {}
  });
  h._frame = f;
  win.append(f);
}
function unmount(h) {
  if (!h._frame) return;
  h._frame.remove(); h._frame = null;
  winOf(h).classList.remove('is-live');
}
addEventListener('message', (e) => {
  if (e.origin !== location.origin || !e.data?.live) return;
  const h = hosts.find((x) => x._frame && x._frame.contentWindow === e.source);
  if (!h) return;
  setTimeout(() => { if (h._frame) { winOf(h).classList.add('is-live'); h._piece = e.source.piece; take(h); } }, 250);
});
// a click into the cross-origin site takes focus from the page: hold the autoscroll for it
addEventListener('blur', () => setTimeout(() => {
  if (hosts.some((h) => h._frame && document.activeElement === h._frame)) holdAuto();
}, 0));
// start each piece just before it scrolls in, and stop it soon after it leaves; on a phone the
// Common Ground site stays a picture until tapped (a whole site is a lot to run in a window)
const phone = () => matchMedia('(max-width: 959px)').matches;
const near = new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return;
  if (phone() && e.target.matches('.win-site') && !e.target.classList.contains('is-awake')) return;
  mount(e.target);
}), { rootMargin: '100% 0px' });
document.querySelectorAll('.win-site').forEach((w) => w.addEventListener('click', () => { w.classList.add('is-awake'); mount(w); }));
// each piece pauses itself when off screen, so once loaded it stays: reloading it costs a warm-up stall every time
const far = { observe() {} };
const seen = new IntersectionObserver((es) => es.forEach((e) => { e.target._seen = e.isIntersecting; if (e.isIntersecting) take(e.target); }), { threshold: 0.65 });
// a mounted window just off screen stops drawing (hidden frames are throttled) until it is back
const onScreen = new IntersectionObserver((es) => es.forEach((e) => winOf(e.target).classList.toggle('is-off', !e.isIntersecting)), { rootMargin: '10% 0px' });
hosts.forEach((h) => { near.observe(h); far.observe(h); seen.observe(h); onScreen.observe(h); });
// Start the pieces early, while the visitor is still on the opening: each has a start-up cost
// that would otherwise land mid-scroll. The heaviest (murmuration's warm-up) goes as the page
// opens (with the lotus leaf, whose large images take a while), before the cursor moves; the rest while the cursor's zoom holds still ('take:still'
// from hero.js), or a few seconds in, or at the first scroll, whichever comes first. Off screen
// they pause themselves. On a phone the Common Ground site still waits for a tap.
{
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 60));
  const ORDER = ['murmuration', 'lotus-leaf', 'koi-pond', 'ripple-pool', 'marbling', 'kintsugi'];
  const rank = (h) => (h.dataset.piece ? ORDER.indexOf(h.dataset.piece) : 99);
  const queue = hosts.filter((h) => !(h.matches('.win-site') && phone())).sort((x, y) => rank(x) - rank(y));
  const firsts = queue.splice(0, 2);   // murmuration's warm-up and the lotus leaf's image work: before the cursor moves
  const step = () => { const h = queue.shift(); if (!h) return; idle(() => { mount(h); setTimeout(step, 320); }, { timeout: 800 }); };
  let rest = false;
  const goRest = () => { if (rest) return; rest = true; step(); };
  const onLoad = () => {
    firsts.forEach((h, k) => setTimeout(() => idle(() => mount(h), { timeout: 400 }), k * 250));
    addEventListener('take:still', goRest, { once: true });
    setTimeout(goRest, 6500);
    addEventListener('scroll', function once() { if (scrollY > 60) { removeEventListener('scroll', once); goRest(); } }, { passive: true });
  };
  if (document.readyState === 'complete') onLoad(); else addEventListener('load', onLoad, { once: true });
}
// the site window draws the real page at desktop width, scaled into the window
const sizeSite = new ResizeObserver((es) => es.forEach((e) => e.target.style.setProperty('--s', (e.contentRect.width / 1280).toFixed(4))));
document.querySelectorAll('.win-site').forEach((w) => sizeSite.observe(w));

/* ---------- the Monet Shot cursor takes the first tap on two of them, once each:
   it glides in, clicks and the piece answers ---------- */
const TAPS = {
  kintsugi: { at: (w, hgt) => { const r = 0.37 * Math.min(w, hgt); return [w / 2 + 0.22 * r, hgt / 2 - 0.3 * r]; }, go: (p) => p.strike?.(0.22, -0.3) },
  murmuration: { at: (w, hgt) => [w * 0.6, hgt * 0.3], go: (p) => p.scatter?.(0.6, 0.3) },
};
const CURSOR = '<svg viewBox="0 0 28 28" width="26" height="26"><path d="M6 3.5v19.2l4.9-4.6 3.1 7.1 3.4-1.5-3.1-6.9h6.6z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg><i></i>';
async function take(h) {
  const tap = TAPS[h.dataset.piece];
  if (calm || !tap || h._took || !h._seen || !h._piece || h._touched) return;
  h._took = true;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(900);
  const win = winOf(h), W = win.offsetWidth, H = win.offsetHeight;
  const c = document.createElement('div'); c.className = 'tap'; c.setAttribute('aria-hidden', 'true'); c.innerHTML = CURSOR;
  h.append(c);
  const [tx, ty] = tap.at(W, H);
  const mv = (from, to, ms) => c.animate([{ transform: `translate3d(${from[0]}px, ${from[1]}px, 0)` }, { transform: `translate3d(${to[0]}px, ${to[1]}px, 0)` }],
    { duration: ms, easing: 'cubic-bezier(.65, 0, .25, 1)', fill: 'forwards' }).finished;
  await mv([W + 30, H * 0.95], [tx, ty], 1300);
  await wait(200);
  if (!h._frame || h._touched) { c.remove(); return; }
  c.classList.add('is-click');
  tap.go(h._piece);
  await wait(1100);
  await mv([tx, ty], [W + 30, H * 1.05], 1200);
  c.remove();
}
