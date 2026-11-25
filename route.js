/* The route. One line of ink runs down the page: from Adelaide through the production
   floor and Scouts, across the Pacific (dotted, with the swallows), into San Francisco,
   then behind every window in order and on to the portrait in the footer. It draws itself
   as you scroll and breaks around every label. */
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow = matchMedia('(max-width: 959px)');
const NS = 'http://www.w3.org/2000/svg';
const $ = (s, r = document) => r.querySelector(s);
const route = $('.route');
const svg = $('.route-svg');
const inkA = $('.ink-a'), inkB = $('.ink-b');
// a darker, wider copy under each line keeps it legible on light paintings (cheaper than a blur filter)
const shadeA = inkA.cloneNode(), shadeB = inkB.cloneNode();
shadeA.setAttribute('class', 'ink-shade'); shadeB.setAttribute('class', 'ink-shade');
inkA.before(shadeA); inkB.before(shadeB);
const dotsG = $('.sea-dots'), ringsG = $('.rings'), gapsG = $('.gaps'), gapAll = $('.gap-all');
const pen = $('.pen');
const marks = Object.fromEntries([...document.querySelectorAll('.mark')].map((m) => [m.dataset.mark, m]));
const stops = [...document.querySelectorAll('.stop')];
const birds = $('.swallows');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

// position in the document, ignoring transforms (reveals slide windows in; the route should not)
function box(el) {
  let x = 0, y = 0, e = el;
  while (e) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight, cx: x + el.offsetWidth / 2, cy: y + el.offsetHeight / 2 };
}
// the tight box of an element's text, in document space
function textBox(el) {
  const r = document.createRange(); r.selectNodeContents(el);
  const t = r.getBoundingClientRect(), o = el.getBoundingClientRect(), b = box(el);
  if (!t.width) return null;
  return { x: b.x + (t.left - o.left), y: b.y + (t.top - o.top), w: t.width, h: t.height };
}

// Catmull-Rom through the points, as cubic segments
function segments(P) {
  const out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
    out.push({ p1, c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
               c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }, p2, flight: !!p1.flight });
  }
  return out;
}
const f = (n) => n.toFixed(1);
const toD = (segs) => segs.length ? `M${f(segs[0].p1.x)},${f(segs[0].p1.y)}` + segs.map((s) => `C${f(s.c1.x)},${f(s.c1.y)} ${f(s.c2.x)},${f(s.c2.y)} ${f(s.p2.x)},${f(s.p2.y)}`).join('') : '';

let samples = [], total = 0, lenA = 0, lenF = 0, drawn = 0, want = 0, raf = 0;
let ringAt = [], markAt = [], dots = [];

function layout() {
  route.style.height = '0px';
  const W = document.documentElement.clientWidth, vh = innerHeight, small = narrow.matches;
  const H = document.documentElement.scrollHeight;
  route.style.height = `${H}px`;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  gapAll.setAttribute('width', W); gapAll.setAttribute('height', H);

  const P = [];
  const add = (x, y, o = {}) => { const p = { x, y, ...o }; P.push(p); return p; };
  const win = (sel) => { const el = $(sel); if (el) { const b = box(el); add(b.cx, b.cy); } };

  // Adelaide: the stops
  const head = box($('#adelaide .sec'));
  const ticks = [...document.querySelectorAll('.stop .tick')].map((t) => box(t));
  add(ticks[0].cx, head.y + head.h + vh * 0.02, { ring: 'origin' });
  ticks.forEach((t, i) => add(t.cx, t.cy, { stop: i }));
  const last = ticks[ticks.length - 1];
  // the Pacific: a long bow across the page to San Francisco
  const studioHead = box($('#studio .sec'));
  const sf = { x: W * (small ? 0.58 : 0.64), y: studioHead.y - vh * (small ? 0.07 : 0.14) };
  const dep = add(last.cx + (small ? 6 : W * 0.03), last.cy + vh * 0.08, { flight: true });
  add(lerp(dep.x, sf.x, 0.5), lerp(dep.y, sf.y, small ? 0.4 : 0.3), { flight: true });
  add(sf.x, sf.y, { ring: 'sf', mark: 'sf', side: small ? 'b' : 'r' });

  // Studio: Frontier Tower, then the clips
  const clips = [...document.querySelectorAll('.clips .clip')].map((c) => box(c));
  const top = Math.min(...clips.map((c) => c.y));
  if (small) {
    add(W * 0.5, top - vh * 0.08, { ring: 'ft', mark: 'ft', side: 'r' });
    clips.forEach((c) => add(c.cx, c.cy));
  } else {
    const c4 = clips[3];
    add(c4.cx, top - vh * 0.07, { ring: 'ft', mark: 'ft', side: 'l' });
    [...clips].reverse().forEach((c) => add(c.cx, c.cy));
  }
  win('.piece-hand .win');
  // Evolve: 8090
  const ev = box($('#hackathons .sec'));
  add(small ? W * 0.72 : W * 0.58, ev.cy + (small ? vh * 0.02 : 0), { ring: '8090', mark: '8090', side: small ? 'b' : 'r' });
  ['.piece-chamath .win', '.piece-pitch .win', '.piece-cg .win', '.piece-demo .win',
   '.piece-monet .win', '.win-film',
   '.pad:nth-child(3) .win', '.pad:nth-child(5) .win', '.pad:nth-child(7) .win',
   '.piece-mcp .win', '.piece-gfn .win',
   '.trio .piece:nth-child(1) .win', '.trio .piece:nth-child(2) .win', '.trio .piece:nth-child(3) .win',
   '.win-me'].forEach(win);
  P[P.length - 1].ring = 'end';

  const segs = segments(P);
  const iF = segs.findIndex((s) => s.flight);
  const iB = segs.findIndex((s, k) => k > iF && !s.flight);
  inkA.setAttribute('d', toD(segs.slice(0, iF)));
  inkB.setAttribute('d', toD(segs.slice(iB)));
  shadeA.setAttribute('d', inkA.getAttribute('d'));
  shadeB.setAttribute('d', inkB.getAttribute('d'));
  // Sample the curves directly (cubic maths, not the browser's getPointAtLength, which walks
  // the whole path on every call and took ~0.45 s here). Each part's sampled length is scaled
  // to the browser's own total, so the dashes that draw the line still meet the samples exactly.
  const walk = (list) => {
    const pts = [{ x: list[0].p1.x, y: list[0].p1.y, l: 0 }];
    let L = 0;
    for (const s of list) {
      const n = Math.max(6, Math.ceil(Math.hypot(s.p2.x - s.p1.x, s.p2.y - s.p1.y) / 5));
      let px = s.p1.x, py = s.p1.y;
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
        const x = a * s.p1.x + b * s.c1.x + c * s.c2.x + d * s.p2.x, y = a * s.p1.y + b * s.c1.y + c * s.c2.y + d * s.p2.y;
        L += Math.hypot(x - px, y - py); px = x; py = y;
        pts.push({ x, y, l: L });
      }
    }
    return { pts, L };
  };
  const wa = walk(segs.slice(0, iF)), wf = walk(segs.slice(iF, iB)), wb = walk(segs.slice(iB));
  lenA = inkA.getTotalLength(); const lenB = inkB.getTotalLength();
  lenF = wf.L;
  total = lenA + lenF + lenB;
  samples = [];
  const keep = (w, L, off) => { const k = w.L ? L / w.L : 1; for (const q of w.pts) samples.push({ l: off + q.l * k, x: q.x, y: q.y }); };
  keep(wa, lenA, 0); keep(wf, lenF, lenA); keep(wb, lenB, lenA + lenF);
  let m = -Infinity; samples.forEach((s) => { m = Math.max(m, s.y); s.my = m; });
  const lenAt = (p) => { let best = 0, d = Infinity; for (const s of samples) { const k = (s.x - p.x) ** 2 + (s.y - p.y) ** 2; if (k < d) { d = k; best = s.l; } } return best; };

  // the dotted crossing, spaced evenly along the flight
  dotsG.replaceChildren(); dots = [];
  const GAP = small ? 9 : 11;
  let j = 0;
  for (let l = GAP; l < lenF - GAP / 2; l += GAP) {
    while (j < wf.pts.length - 2 && wf.pts[j + 1].l < l) j++;
    const q0 = wf.pts[j], q1 = wf.pts[j + 1], t = (l - q0.l) / ((q1.l - q0.l) || 1);
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', f(q0.x + (q1.x - q0.x) * t)); c.setAttribute('cy', f(q0.y + (q1.y - q0.y) * t)); c.setAttribute('r', '1.25');
    dotsG.appendChild(c); dots.push({ c, l: lenA + l });
  }
  birds.style.width = ''; birds.dataset.f0 = lenA; birds.dataset.f1 = lenA + lenF;

  // rings at the places, and the marks beside them
  ringsG.replaceChildren(); ringAt = []; markAt = [];
  P.forEach((p) => {
    if (p.stop !== undefined) { ringAt.push({ el: stops[p.stop], l: lenAt(p) }); return; }
    if (!p.ring) return;
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', f(p.x)); c.setAttribute('cy', f(p.y)); c.setAttribute('r', p.ring === 'origin' ? '3.2' : '4.4');
    if (p.ring === 'origin') c.classList.add('is-origin');
    ringsG.appendChild(c); ringAt.push({ el: c, l: lenAt(p) });
    const mk = p.mark && marks[p.mark];
    if (mk) {
      const w = mk.offsetWidth, h = mk.offsetHeight;
      let x = p.x + 18, y = p.y - h / 2;
      if (p.side === 'l') x = p.x - 18 - w;
      if (p.side === 'b') { x = clamp(p.x - 12, 16, W - 16 - w); y = p.y + 16; }
      mk.style.left = `${f(x)}px`; mk.style.top = `${f(y)}px`;
      ringAt.push({ el: mk, l: lenAt(p) });
    }
  });

  // gaps in the line around every label, and around the marks
  gapsG.replaceChildren();
  const PAD = 12;
  document.querySelectorAll('.l-head, .l-line, .l-links, .sec, .lead, .say p, .pad figcaption, .stop b, .stop span, .film-play, .mark').forEach((el) => {
    const t = el.classList.contains('mark') || el.classList.contains('film-play') ? { x: parseFloat(el.style.left) || box(el).x, y: parseFloat(el.style.top) || box(el).y, w: el.offsetWidth, h: el.offsetHeight } : textBox(el);
    if (!t) return;
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', f(t.x - PAD)); r.setAttribute('y', f(t.y - PAD * .6));
    r.setAttribute('width', f(t.w + PAD * 2)); r.setAttribute('height', f(t.h + PAD * 1.2)); r.setAttribute('rx', '8');
    gapsG.appendChild(r);
  });

  if (calm) { drawn = want = total; paint(); } else { want = target(); drawn = Math.min(drawn, want); paint(); }
}

// how far the ink should have reached: everything above 64% of the screen
function target() {
  const y = scrollY + innerHeight * 0.64;
  let lo = 0, hi = samples.length - 1;
  if (!samples.length || samples[0].my > y) return 0;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (samples[mid].my <= y) lo = mid; else hi = mid - 1; }
  return samples[lo].l;
}

function pointAt(l) {
  let lo = 0, hi = samples.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (samples[mid].l <= l) lo = mid; else hi = mid - 1; }
  return samples[lo];
}

function paint() {
  const a = clamp(drawn, 0, lenA), b = clamp(drawn - lenA - lenF, 0, Infinity);
  const lenB = total - lenA - lenF;
  for (const el of [inkA, shadeA]) { el.style.strokeDasharray = `${lenA} ${lenA + 10}`; el.style.strokeDashoffset = `${lenA - a}`; }
  for (const el of [inkB, shadeB]) { el.style.strokeDasharray = `${lenB} ${lenB + 10}`; el.style.strokeDashoffset = `${lenB - b}`; }
  for (const d of dots) d.c.classList.toggle('on', d.l <= drawn);
  for (const r of ringAt) r.el.classList.toggle('on', r.l <= drawn + 2);
  const p = pointAt(drawn);
  pen.setAttribute('cx', f(p.x)); pen.setAttribute('cy', f(p.y));
  pen.classList.toggle('on', drawn > 4 && drawn < total - 4);
  // the swallows fly the crossing with the pen
  const f0 = +birds.dataset.f0, f1 = +birds.dataset.f1;
  let bl = calm ? lerp(f0, f1, 0.5) : clamp(drawn + 40, f0, f1);
  const q = pointAt(bl), q2 = pointAt(Math.min(f1, bl + 30));
  const ang = clamp(Math.atan2(q2.y - q.y, q2.x - q.x) * 57.3, -24, 24) * 0.6;
  birds.style.transform = `translate3d(${f(q.x)}px, ${f(q.y - (narrow.matches ? 46 : 70))}px, 0) rotate(${ang.toFixed(1)}deg)`;
  const k = calm ? 1 : clamp((drawn - f0) / 160) * clamp((f1 - drawn + 60) / 200);
  birds.style.opacity = k.toFixed(3);
  birds.style.visibility = k > 0.02 ? 'visible' : 'hidden';
}

// the pen sits exactly where the scroll says, drawn at most once a frame
function loop() { raf = 0; if (drawn !== want) { drawn = want; paint(); } }
function onScroll() { if (calm) return; want = target(); if (!raf) raf = requestAnimationFrame(loop); }

let lt = 0;
const relayout = () => { clearTimeout(lt); lt = setTimeout(() => { layout(); onScroll(); }, 120); };
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', relayout);
addEventListener('load', relayout);
document.fonts?.ready.then(relayout);
new ResizeObserver(relayout).observe(document.querySelector('main'));
layout(); onScroll();
