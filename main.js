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
const load = (p) => { if (!p.style.backgroundImage) p.style.backgroundImage = `url(${p.dataset.src})`; };
// the first is inline; the next one early, the rest once the page has loaded
load(paints[1]);
addEventListener('load', () => setTimeout(() => paints.forEach(load), 400), { once: true });

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
  if (!wide.matches) { pads.forEach((p) => p.style.removeProperty('--py')); return; }
  const mid = innerHeight / 2;
  for (const p of pads) {
    const r = p.getBoundingClientRect();
    if (r.bottom < -200 || r.top > innerHeight + 200) continue;
    const d = parseFloat(p.style.getPropertyValue('--d')) || 0;
    p.style.setProperty('--py', `${((r.top + r.height / 2 - mid) * d).toFixed(1)}px`);
  }
}

/* ---------- one loop, on scroll ---------- */
let ticking = false;
function frame() {
  ticking = false;
  const z = whichPainting();
  if (z) {
    show(z.i);
    navLinks.forEach((a) => a.classList.toggle('is-here', a.getAttribute('href') === `#${({ top: 'work', stylefeatures: 'work', contact: 'more' })[z.id] || z.id}`));
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
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
document.querySelectorAll('.reveal').forEach((el) => (calm ? el.classList.add('in') : io.observe(el)));

/* ---------- studio clips play while in view ---------- */
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
