/*
 * pretext.js — prose that flows around a drifting flower, relaid every frame.
 *
 * The browser cannot do this. CSS `shape-outside` wraps text around a *static*
 * float, but any per-frame change to the exclusion zone means a full layout
 * reflow — the single most expensive thing you can ask a browser to do, and at
 * 60fps it is hopeless.
 *
 * Pretext (@chenglou/pretext, MIT) sidesteps it: prepare() measures the text
 * once with canvas metrics, then layoutNextLineRange() is pure arithmetic over
 * cached widths. That makes it cheap enough to re-flow the whole paragraph
 * every frame with a DIFFERENT width per line — which is exactly what wrapping
 * around a moving shape requires.
 *
 * The real prose stays in the DOM the whole time. The canvas is an enhancement
 * layered over it: selection, screen readers, ctrl+F, print and no-JS all keep
 * working on the actual <p>. If anything here bails, the page is just a page.
 *
 * Pretext by Cheng Lou (MIT) — see vendor/pretext/LICENSE
 */

const LIB = './vendor/pretext/layout.js';
const PAD = 10;        // clearance between the bloom and the text
const MIN_RUN = 64;    // narrowest line worth setting beside the bloom
const MAX_ROWS = 400;  // runaway guard for the layout walk
const SAMPLES = 18;    // bloom positions sampled to fix the container height
const TAU = Math.PI * 2;

// Below this the bloom stops drifting across the column and pins to one edge
// instead — see bloom().
const NARROW = 620;

// Read the palette off :root so the flower can never drift from the page.
function token(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v) return v;
  } catch (e) { /* fall through */ }
  return fallback;
}

const ROSE = token('--rose', '#c2707a');
const BLUSH = token('--blush', '#e2b0b3');
const GOLD = token('--gold', '#a87a2b');
const GOLD_SOFT = token('--gold-soft', '#c9a55b');
const SAGE = token('--sage', '#869176');

// #rrggbb -> rgba(). The palette lives in CSS as hex, but every fill here needs
// its own alpha, so they have to be combined at draw time.
function rgba(hex, a) {
  const h = hex.replace('#', '');
  const n = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h;
  const i = parseInt(n, 16);
  return `rgba(${(i >> 16) & 255}, ${(i >> 8) & 255}, ${i & 255}, ${a})`;
}

const root = document.getElementById('flow');
const src = root && root.querySelector('.flow-source');
const calm = window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : { matches: false };

/* ------------------------------------------------------------------ gating */

function allowed() {
  if (!root || !src || !src.textContent.trim()) return false;
  const c = navigator.connection;
  if (c && c.saveData) return false;
  if (c && /^(slow-)?2g$/.test(c.effectiveType || '')) return false;
  try {
    if (!document.createElement('canvas').getContext('2d')) return false;
  } catch (e) {
    return false;
  }
  return true;
}

/* ------------------------------------------------------- typography syncing */

// Pretext measures with canvas metrics, so its `font` string has to match the
// CSS that styles the source <p> exactly — otherwise every width is wrong.
// Reading it back off the element is the only way to keep the two from drifting
// when style.css is retouched.
function typeOf(el) {
  const s = getComputedStyle(el);
  const size = parseFloat(s.fontSize) || 16;
  const lh = s.lineHeight === 'normal'
    ? size * 1.5
    : parseFloat(s.lineHeight) || size * 1.5;
  const ls = s.letterSpacing === 'normal'
    ? 0
    : parseFloat(s.letterSpacing) || 0;
  return {
    spec: `${s.fontStyle} ${s.fontWeight} ${size}px ${s.fontFamily}`,
    lh: Math.round(lh),
    ls,
    color: s.color
  };
}

/* ---------------------------------------------------------------- the bloom */

// A petal, pointing up from the origin. Two mirrored beziers give a teardrop
// with a soft shoulder — a plain ellipse reads as a lozenge, not a petal.
function petal(ctx, len, wid) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(wid, -len * 0.2, wid * 0.74, -len * 0.9, 0, -len);
  ctx.bezierCurveTo(-wid * 0.74, -len * 0.9, -wid, -len * 0.2, 0, 0);
  ctx.closePath();
}

function ring(ctx, n, len, wid, fill, edge, offset) {
  for (let i = 0; i < n; i++) {
    ctx.save();
    ctx.rotate(offset + (i * TAU) / n);
    petal(ctx, len, wid);
    ctx.fillStyle = fill;
    ctx.fill();
    if (edge) {
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }
}

// hero.js paints one watercolour bloom into a sprite, once, and hands it over.
// If it is there we blit that instead of drawing vectors: real bleed and brush
// texture for nothing per frame. If it never arrives — painting declined, no
// WebGL2, metered connection — the vector flower below stands in, so this page
// has a flower either way.
function spriteBloom() {
  const g = window.__garden;
  return (g && g.bloom) || null;
}

function drawSprite(ctx, b, img) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.a);
  // The sprite is painted with its bloom occupying 0.26 of the sprite canvas,
  // so it has to be drawn at ~3.85x the exclusion radius for the petals to land
  // on that circle. The rest of the sprite is the margin its bleed needed.
  const d = b.r * 3.85;
  ctx.drawImage(img, -d / 2, -d / 2, d, d);
  ctx.restore();
}

// Fallback flower, drawn as vectors. Two offset rings of petals and a gold
// centre, sized so it nearly fills its own exclusion circle — a shape much
// smaller than the gap it makes reads as a bug in the layout.
function drawBloom(ctx, b) {
  const r = b.r;
  ctx.save();
  ctx.translate(b.x, b.y);

  // Sits the bloom on the paper instead of floating it on top.
  const halo = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r * 1.08);
  halo.addColorStop(0, rgba(GOLD, 0.10));
  halo.addColorStop(0.7, rgba(GOLD, 0.05));
  halo.addColorStop(1, rgba(GOLD, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.08, 0, TAU);
  ctx.fill();

  // Two leaves tucked behind, so it reads as cut rather than drawn floating.
  ctx.save();
  ctx.rotate(b.a * 0.5);
  for (let sgn = -1; sgn <= 1; sgn += 2) {
    ctx.save();
    ctx.rotate(sgn * 2.3);
    petal(ctx, r * 1.02, r * 0.3);
    ctx.fillStyle = rgba(SAGE, 0.5);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  ctx.rotate(b.a);
  ring(ctx, 8, r * 0.94, r * 0.40, rgba(BLUSH, 0.88), rgba(ROSE, 0.42), 0);
  ring(ctx, 7, r * 0.60, r * 0.29, rgba(ROSE, 0.62), rgba(ROSE, 0.5), Math.PI / 7);
  ctx.rotate(-b.a);

  const eye = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.27);
  eye.addColorStop(0, rgba(GOLD_SOFT, 0.98));
  eye.addColorStop(1, rgba(GOLD, 0.92));
  ctx.fillStyle = eye;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.24, 0, TAU);
  ctx.fill();

  // Stamen dots, counter-rotating so the centre reads as its own part.
  ctx.fillStyle = rgba(GOLD, 0.55);
  for (let i = 0; i < 9; i++) {
    const a = -b.a * 1.6 + (i * TAU) / 9;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.15, Math.sin(a) * r * 0.15, Math.max(0.8, r * 0.028), 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}

// Where the bloom is, and how far it has turned, at time t.
//
// On a wide column it drifts a long way across, and the prose reorganises
// around it. On a narrow one that same drift would squeeze the text from both
// sides at once and leave three-word lines, so instead the bloom pins to one
// edge and only travels vertically — which is what lets a phone have the effect
// at all rather than being told it cannot.
function bloom(t, colW, h, r, pinned) {
  const ay = Math.max(0, h * 0.5 - r * 0.7);
  const spin = t * 0.000045;

  if (pinned) {
    return {
      x: r + PAD,
      y: h * 0.5 + Math.sin(t * 0.000144) * ay,
      r,
      a: spin
    };
  }

  const ax = Math.max(0, colW * 0.5 - r - Math.max(MIN_RUN, colW * 0.3) - PAD);
  return {
    x: colW * 0.5 + Math.sin(t * 0.000191) * ax,
    y: h * 0.5 + Math.sin(t * 0.000122 + 1.1) * ay,
    r,
    a: spin
  };
}

// Where a held or thrown bloom is allowed to be. Same ceilings measure() uses
// for the drift path, so a dragged flower can never starve a row of text.
function bounds(colW, h, r, pinned) {
  const ay = Math.max(0, h * 0.5 - r * 0.7);
  if (pinned) {
    return { x0: r + PAD, x1: r + PAD, y0: h * 0.5 - ay, y1: h * 0.5 + ay };
  }
  const run = Math.max(MIN_RUN, colW * 0.3);
  const x0 = r + run + PAD;
  return { x0, x1: Math.max(x0, colW - x0), y0: h * 0.5 - ay, y1: h * 0.5 + ay };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ----------------------------------------------------------------- the flow */

// Walks the paragraph one line at a time, narrowing each line by however much
// the bloom intrudes on that row. `onLine` is optional: omitting it turns this
// into a pure height measurement, which is how the container height gets fixed
// without ever drawing.
function flow(api, P, b, colW, lh, onLine) {
  let cursor = { segmentIndex: 0, graphemeIndex: 0 };
  let y = 0;

  for (let i = 0; i < MAX_ROWS; i++) {
    let x = 0;
    let w = colW;

    // Widest horizontal reach of the bloom anywhere in this row's band — use
    // the closest point, so the text clears the shape at its fattest.
    const dy = b.y >= y && b.y <= y + lh
      ? 0
      : Math.min(Math.abs(y - b.y), Math.abs(y + lh - b.y));

    if (dy < b.r) {
      const half = Math.sqrt(b.r * b.r - dy * dy) + PAD;
      if (b.x > colW * 0.5) {
        w = Math.min(colW, b.x - half);            // bloom right: set to its left
      } else {
        x = Math.max(0, b.x + half);               // bloom left: set to its right
        w = colW - x;
      }
    }

    // Too tight to be worth a line — leave the row empty and drop down, the
    // way a real float pushes text past a narrow gap.
    if (w < MIN_RUN) {
      y += lh;
      continue;
    }

    const range = api.layoutNextLineRange(P, cursor, w);
    if (range === null) return y;                  // paragraph exhausted

    if (onLine) onLine(api.materializeLineRange(P, range), x, y);
    cursor = range.end;
    y += lh;
  }

  return y;
}

/* -------------------------------------------------------------------- setup */

async function boot() {
  if (!allowed()) return;

  let api;
  try {
    api = await import(LIB);
  } catch (e) {
    return; // library unreachable — the DOM paragraph is already correct
  }

  const text = src.textContent.replace(/\s+/g, ' ').trim();
  const canvas = document.createElement('canvas');
  canvas.className = 'flow-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let type = null;   // current typography
  let P = null;      // prepared text
  let colW = 0;
  let height = 0;
  let baseH = 0;     // natural (unobstructed) height — drives the bloom path
  let pinned = false;  // narrow column: bloom hugs one edge instead of drifting
  let radius = 0;

  // prepare() is the expensive half; it only has to be redone when the text or
  // the font changes, NOT on resize. That split is the whole point of the
  // library, so honour it.
  async function measure() {
    const next = typeOf(src);
    const w = Math.max(120, Math.round(src.getBoundingClientRect().width));

    if (!P || !type || next.spec !== type.spec || next.ls !== type.ls) {
      type = next;
      // Canvas metrics are wrong until the webfont is actually in. Without
      // this the first layout is measured in Georgia and reflows visibly.
      try {
        await document.fonts.load(type.spec, text.slice(0, 64));
        await document.fonts.ready;
      } catch (e) { /* fall through with whatever is loaded */ }
      P = api.prepareWithSegments(text, type.spec, { letterSpacing: type.ls });
    } else {
      type = next;
    }

    colW = w;
    baseH = api.layout(P, colW, type.lh).height;

    // A narrow column gets the effect too, just arranged differently: the bloom
    // pins to one edge rather than crossing the column, so the text is only
    // ever squeezed from one side. That is the whole reason a phone can have
    // this at all instead of being handed the plain paragraph.
    pinned = colW < NARROW;

    // Hard geometric ceiling on the bloom, so every row keeps a readable run.
    // Without a cap of some kind a narrow column starves every line and the
    // layout walk spins to MAX_ROWS placing no text at all.
    let ceiling;
    if (pinned) {
      // Centre sits at r + PAD, so a line beside it starts at ~2r + 2·PAD.
      // Leave at least 58% of the column for words: at 52% a phone was down to
      // three or four words a line beside the bloom, which reads as cramped
      // rather than as a magazine wrap.
      ceiling = (colW * 0.42 - 2 * PAD) / 2;
    } else {
      // Drift keeps the centre inside [r + run + PAD, colW - r - run - PAD].
      // MIN_RUN alone stops the walk stalling but is not enough to stay
      // readable, hence 30% of the column as well.
      const run = Math.max(MIN_RUN, colW * 0.3);
      ceiling = colW * 0.5 - run - PAD;
    }
    radius = Math.min(colW * 0.3, baseH * 0.32, ceiling);
    if (radius < 30 || colW < 240) return false;   // genuinely no room

    // The bloom changes the line count as it moves, so the paragraph's height
    // is not constant. Sampling the path and taking the worst case fixes the
    // container once — no layout shift while it drifts. Cheap: pure arithmetic,
    // no drawing, no DOM.
    let worst = baseH;
    for (let i = 0; i < SAMPLES; i++) {
      const b = bloom((i / SAMPLES) * 33000, colW, baseH, radius, pinned);
      const h = flow(api, P, b, colW, type.lh, null);
      if (h > worst) worst = h;
    }
    // A dragged bloom can sit anywhere in its bounds, not just on the drift
    // path, so sweep a grid of them too. Still pure arithmetic.
    const bd = bounds(colW, baseH, radius, pinned);
    for (let gx = 0; gx < 5; gx++) {
      for (let gy = 0; gy < 9; gy++) {
        const b = {
          x: bd.x0 + ((bd.x1 - bd.x0) * gx) / 4,
          y: bd.y0 + ((bd.y1 - bd.y0) * gy) / 8,
          r: radius,
          a: 0
        };
        const h = flow(api, P, b, colW, type.lh, null);
        if (h > worst) worst = h;
      }
    }
    height = worst + type.lh;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(colW * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    root.style.setProperty('--flow-h', height + 'px');
    return true;
  }

  // Offset from the drift path. Zero at rest; the pointer sets it while the
  // bloom is held, and a spring walks it back to zero after release, carrying
  // whatever velocity the throw had.
  const off = { x: 0, y: 0, vx: 0, vy: 0 };
  let held = false;

  function place(t) {
    const b = bloom(t, colW, baseH, radius, pinned);
    const bd = bounds(colW, baseH, radius, pinned);
    b.x = clamp(b.x + off.x, bd.x0, bd.x1);
    b.y = clamp(b.y + off.y, bd.y0, bd.y1);
    return b;
  }

  function draw(t) {
    const b = place(t);
    ctx.clearRect(0, 0, colW, height);
    const img = spriteBloom();
    if (img) drawSprite(ctx, b, img);
    else drawBloom(ctx, b);

    ctx.font = type.spec;
    if ('letterSpacing' in ctx) ctx.letterSpacing = type.ls + 'px';
    ctx.fillStyle = type.color;
    ctx.textBaseline = 'middle';

    const half = type.lh / 2;
    flow(api, P, b, colW, type.lh, (line, x, y) => {
      ctx.fillText(line.text, x, y + half);
    });
  }

  let running = false;
  let lastT = 0;

  if (!(await measure())) return;   // leave the DOM paragraph exactly as it is
  src.insertAdjacentElement('afterend', canvas);
  root.classList.add('is-flowing');
  draw(0);

  // With motion off there is no frame loop to notice the sprite arriving, so
  // redraw once when hero.js says it is ready.
  window.addEventListener('garden:bloom', () => {
    if (!running) draw(lastT);
  });

  /* ------------------------------------------------------ grab and throw */

  let last = null;       // last pointer sample, for throw velocity
  let grabDx = 0;
  let grabDy = 0;

  function local(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function hit(e) {
    const p = local(e);
    const b = place(lastT);
    return Math.hypot(p.x - b.x, p.y - b.y) <= b.r;
  }

  // Touch has to say up front that this gesture is the flower's and not a
  // scroll — but only when it lands on the flower, so the rest of the
  // paragraph still scrolls normally.
  canvas.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    if (t && hit(t)) e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || !hit(e)) return;
    const p = local(e);
    const b = place(lastT);
    grabDx = b.x - p.x;
    grabDy = b.y - p.y;
    held = true;
    off.vx = off.vy = 0;
    last = { x: p.x, y: p.y, t: e.timeStamp };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-held');
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!held) {
      canvas.classList.toggle('can-grab', hit(e));
      return;
    }
    const p = local(e);
    const drift = bloom(lastT, colW, baseH, radius, pinned);
    off.x = p.x + grabDx - drift.x;
    off.y = p.y + grabDy - drift.y;
    const dt = Math.max(1, e.timeStamp - last.t);
    // Smoothed, so one jittery sample does not become the whole throw.
    off.vx = off.vx * 0.6 + ((p.x - last.x) / dt) * 1000 * 0.4;
    off.vy = off.vy * 0.6 + ((p.y - last.y) / dt) * 1000 * 0.4;
    last = { x: p.x, y: p.y, t: e.timeStamp };
    if (!running) draw(lastT);
  });

  function release(e) {
    if (!held) return;
    held = false;
    canvas.classList.remove('is-held');
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* gone */ }
    // A pause before letting go is not a throw.
    if (e.timeStamp - last.t > 90) off.vx = off.vy = 0;
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => canvas.classList.remove('can-grab'));

  // Underdamped spring (stiffness 40, damping 7): overshoots once or twice
  // before settling, which is what makes it feel thrown rather than tweened.
  function spring(dt) {
    if (held || (!off.x && !off.y && !off.vx && !off.vy)) return;
    const K = 40, C = 7;
    off.vx += (-K * off.x - C * off.vx) * dt;
    off.vy += (-K * off.y - C * off.vy) * dt;
    off.x += off.vx * dt;
    off.y += off.vy * dt;
    if (Math.abs(off.x) + Math.abs(off.y) + Math.abs(off.vx) + Math.abs(off.vy) < 0.05) {
      off.x = off.y = off.vx = off.vy = 0;
    }
  }

  if (calm.matches) return; // no drift and no spring: a dragged bloom stays put

  /* ------------------------------------------------------------ frame loop */

  let raf = 0;

  function tick(now) {
    if (!running) return;
    spring(Math.min(0.05, (now - lastT) / 1000 || 0.016));
    lastT = now;
    draw(now);
    raf = requestAnimationFrame(tick);
  }

  function start() {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  // Only animate while it is actually on screen. A CV gets left open in a tab.
  if (window.IntersectionObserver) {
    new IntersectionObserver(entries => {
      entries[0].isIntersecting ? start() : stop();
    }, { rootMargin: '120px' }).observe(root);
  } else {
    start();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
  });

  let timer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const w = Math.round(src.getBoundingClientRect().width);
      if (Math.abs(w - colW) < 8) return;
      if (!(await measure())) {
        stop();
        root.classList.remove('is-flowing');
        return;
      }
      root.classList.add('is-flowing');
      draw(performance.now());
    }, 180);
  }, { passive: true });

  calm.addEventListener && calm.addEventListener('change', e => {
    if (e.matches) { stop(); draw(0); } else start();
  });
}

// Strictly off the critical path: nothing here is fetched or measured until the
// section is near the viewport.
function schedule() {
  if (!root) return;
  if (!window.IntersectionObserver) { boot(); return; }
  const io = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) return;
    io.disconnect();
    boot();
  }, { rootMargin: '400px' });
  io.observe(root);
}

if (document.readyState === 'complete') schedule();
else window.addEventListener('load', schedule, { once: true });
