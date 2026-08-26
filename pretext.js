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

// The thing the prose flows around. Two offset rings of petals and a gold
// centre, sized so the drawn flower nearly fills its own exclusion circle —
// a shape much smaller than the gap it makes reads as a bug in the layout.
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
    height = worst + type.lh;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(colW * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    root.style.setProperty('--flow-h', height + 'px');
    return true;
  }

  function draw(t) {
    const b = bloom(t, colW, baseH, radius, pinned);
    ctx.clearRect(0, 0, colW, height);
    drawBloom(ctx, b);

    ctx.font = type.spec;
    if ('letterSpacing' in ctx) ctx.letterSpacing = type.ls + 'px';
    ctx.fillStyle = type.color;
    ctx.textBaseline = 'middle';

    const half = type.lh / 2;
    flow(api, P, b, colW, type.lh, (line, x, y) => {
      ctx.fillText(line.text, x, y + half);
    });
  }

  if (!(await measure())) return;   // leave the DOM paragraph exactly as it is
  src.insertAdjacentElement('afterend', canvas);
  root.classList.add('is-flowing');
  draw(0);

  if (calm.matches) return; // static blot, laid out once — nothing to animate

  /* ------------------------------------------------------------ frame loop */

  let raf = 0;
  let running = false;

  function tick(now) {
    if (!running) return;
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
