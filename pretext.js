/*
 * pretext.js — prose that flows around a drifting ink blot, relaid every frame.
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
const PAD = 11;        // clearance between blot edge and text
const MIN_RUN = 64;    // narrowest line worth setting beside the blot
const MAX_ROWS = 400;  // runaway guard for the layout walk
const SAMPLES = 18;    // blot positions sampled to fix the container height

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

/* ----------------------------------------------------------------- the blot */

// Fixed radial jitter, generated once. Re-rolling it per frame would make the
// edge shimmer; baking it in means the shape is a solid object that moves.
const EDGE = (() => {
  const n = 44;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // Two out-of-phase harmonics: lumpy, but closed and smooth.
    const k = 0.94 + 0.05 * Math.sin(a * 3 + 0.7) + 0.04 * Math.sin(a * 5 + 2.1);
    pts.push([Math.cos(a) * k, Math.sin(a) * k]);
  }
  return pts;
})();

// Slow Lissajous drift. Kept clear of the column edges by MIN_RUN so there is
// always a usable run of text on at least one side.
function blot(t, colW, h, r) {
  const ax = Math.max(0, colW * 0.5 - r - Math.max(MIN_RUN, colW * 0.3) - PAD);
  const ay = Math.max(0, h * 0.5 - r * 0.75);
  return {
    x: colW * 0.5 + Math.sin(t * 0.000191) * ax,
    y: h * 0.5 + Math.sin(t * 0.000122 + 1.1) * ay,
    r
  };
}

function paintBlot(ctx, b) {
  ctx.save();
  ctx.translate(b.x, b.y);

  ctx.beginPath();
  ctx.moveTo(EDGE[0][0] * b.r, EDGE[0][1] * b.r);
  for (let i = 1; i < EDGE.length; i++) {
    ctx.lineTo(EDGE[i][0] * b.r, EDGE[i][1] * b.r);
  }
  ctx.closePath();

  const g = ctx.createRadialGradient(0, 0, b.r * 0.08, 0, 0, b.r);
  g.addColorStop(0, 'rgba(168, 122, 43, 0.34)');
  g.addColorStop(0.5, 'rgba(168, 122, 43, 0.23)');
  g.addColorStop(0.84, 'rgba(201, 165, 91, 0.14)');
  g.addColorStop(1, 'rgba(201, 165, 91, 0.04)');
  ctx.fillStyle = g;
  ctx.fill();

  // A defined rim matters more than it looks like it should: without it the
  // shape reads as a smudge and the gap in the text looks like a bug.
  ctx.strokeStyle = 'rgba(168, 122, 43, 0.34)';
  ctx.lineWidth = 1.25;
  ctx.stroke();
  ctx.restore();
}

/* ----------------------------------------------------------------- the flow */

// Walks the paragraph one line at a time, narrowing each line by however much
// the blot intrudes on that row. `onLine` is optional: omitting it turns this
// into a pure height measurement, which is how the container height gets fixed
// without ever drawing.
function flow(api, P, b, colW, lh, onLine) {
  let cursor = { segmentIndex: 0, graphemeIndex: 0 };
  let y = 0;

  for (let i = 0; i < MAX_ROWS; i++) {
    let x = 0;
    let w = colW;

    // Widest horizontal reach of the blot anywhere in this row's band — use
    // the closest point, so the text clears the shape at its fattest.
    const dy = b.y >= y && b.y <= y + lh
      ? 0
      : Math.min(Math.abs(y - b.y), Math.abs(y + lh - b.y));

    if (dy < b.r) {
      const half = Math.sqrt(b.r * b.r - dy * dy) + PAD;
      if (b.x > colW * 0.5) {
        w = Math.min(colW, b.x - half);            // blot right: set to its left
      } else {
        x = Math.max(0, b.x + half);               // blot left: set to its right
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
  let baseH = 0;     // natural (unobstructed) height — drives the blot path
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

    // Below this there is no honest way to wrap text around a shape: the blot
    // would leave two-word lines whichever way it is capped. A phone gets the
    // plain DOM paragraph, which is a perfectly good paragraph.
    if (colW < 480) return false;

    // Hard geometric ceiling on the blot. The drift keeps its centre inside
    // [r + run + PAD, colW - r - run - PAD], so capping the radius here
    // guarantees every row keeps at least `run` of usable width — both an
    // absolute floor and 30% of the column, because MIN_RUN alone is enough to
    // stop the layout walk stalling but not enough to stay readable.
    // Without a cap of some kind a narrow column starves every line and the
    // walk spins to MAX_ROWS placing no text at all.
    const run = Math.max(MIN_RUN, colW * 0.3);
    const ceiling = colW * 0.5 - run - PAD;
    radius = Math.min(colW * 0.26, baseH * 0.3, ceiling);
    if (radius < 40) return false;   // column too tight for the effect to read

    // The blot changes the line count as it moves, so the paragraph's height
    // is not constant. Sampling the path and taking the worst case fixes the
    // container once — no layout shift while it drifts. Cheap: pure arithmetic,
    // no drawing, no DOM.
    let worst = baseH;
    for (let i = 0; i < SAMPLES; i++) {
      const b = blot((i / SAMPLES) * 33000, colW, baseH, radius);
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
    const b = blot(t, colW, baseH, radius);
    ctx.clearRect(0, 0, colW, height);
    paintBlot(ctx, b);

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
