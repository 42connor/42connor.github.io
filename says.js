/* His lines, read along. Every word starts dim and lights up as the scroll reaches it, like
   karaoke; a finished line stays, quieter; the line being read is brightest.
   #hello is one piece of writing pinned in a tall track: it rolls up as it is read, and each
   photo arrives in the margin beside its line, then settles there as a small window.
   The section leads and closing lines light the same way where they sit.
   Positions are measured once (and on resize); each frame only does arithmetic and writes the
   few opacities that changed. Under reduced motion nothing is split: everything is simply there. */
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow = matchMedia('(max-width: 959px)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const DIM = 0.22, DONE = 0.56;

// wrap every word in a span, keeping links, asides and emphasis around them
function words(el) {
  const out = [];
  const walk = (n) => {
    for (const c of [...n.childNodes]) {
      if (c.nodeType === 3) {
        const frag = document.createDocumentFragment();
        const aside = !!c.parentElement.closest('.aside');
        c.textContent.split(/(\s+)/).forEach((t) => {
          if (!t) return;
          if (/^\s+$/.test(t)) { frag.append(t); return; }
          const w = document.createElement('span'); w.className = 'w'; w.textContent = t; frag.append(w);
          out.push({ el: w, o: -1, aside });
        });
        c.replaceWith(frag);
      } else if (c.nodeType === 1) walk(c);
    }
  };
  walk(el);
  return out;
}
const set = (it, o) => { if (Math.abs(o - it.o) > 0.004) { it.o = o; it.el.style.opacity = o.toFixed(3); } };
// position in the document, ignoring transforms
function docTop(el) { let y = 0, e = el; while (e) { y += e.offsetTop; e = e.offsetParent; } return y; }
function relTop(el, root) { let y = 0, e = el; while (e && e !== root) { y += e.offsetTop; e = e.offsetParent; } return y; }

if (!calm) {
  /* ---------- #hello ---------- */
  const hello = document.getElementById('hello');
  const text = hello.querySelector('.ra-text');
  // the reading clock, in units of one word: a beat after each sentence, a longer one after each paragraph
  const LEAD = 1.2, HOLD = 2.4, PARA = 1.6, TAIL = 2.6;
  let u = LEAD;
  const lines = [...hello.querySelectorAll('.ln')].map((ln) => {
    const ws = words(ln);
    const L = { el: ln, ws, o: -1, s: u };
    ws.forEach((w) => { w.s = u; u += w.aside ? 0.7 : 1; });
    L.e = u;
    u += HOLD + (ln === ln.parentElement.lastElementChild ? PARA : 0);
    return L;
  });
  const U = u - HOLD - PARA + TAIL;
  const all = lines.flatMap((L) => L.ws);
  // each row's photos belong to the first line in that row
  const photos = [...hello.querySelectorAll('.ra-row')].flatMap((row) => {
    const L = lines.find((x) => row.contains(x.el));
    return [...row.querySelectorAll('.ra-ph')].map((el, k) => ({ el, L, k, key: '' }));
  });

  /* ---------- leads and closing lines ---------- */
  const leads = [...document.querySelectorAll('.lead, .say-end .say-text')].map((el) => {
    el.classList.add('lit');
    return { el, ws: words(el), o: -1, top: 0, h: 0 };
  });

  let trackTop = 0, trackSpan = 1, keys = [], anchor = 0, vh = innerHeight, ty = NaN, raf = 0;
  function layout() {
    vh = innerHeight;
    trackTop = docTop(hello);
    trackSpan = Math.max(1, hello.offsetHeight - vh);
    anchor = vh * (narrow.matches ? 0.4 : 0.44);
    // rows of the writing: where each sits, and when it is being read
    const rows = [];
    let row = null;
    for (const w of all) {
      const y = relTop(w.el, text), h = w.el.offsetHeight;
      if (!row || Math.abs(y - row.y) > h * 0.4) { row = { y, h, a: w.s, b: w.s + 1 }; rows.push(row); }
      else row.b = w.s + 1;
    }
    keys = rows.map((r) => ({ f: (r.a + r.b) / 2, y: r.y + r.h / 2 }));
    // the foot of each line inside the writing, so a read line can fade as it passes under the nav
    for (const L of lines) { const w = L.ws[L.ws.length - 1].el; L.yb = relTop(w, text) + w.offsetHeight; }
    for (const l of leads) { l.top = docTop(l.el); l.h = l.el.offsetHeight; }
    ty = NaN;
  }
  // where the reading is, as a y inside the writing: row to row, smoothly
  function readY(f) {
    if (f <= keys[0].f) return keys[0].y;
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1], b = keys[i];
      if (f <= b.f) return a.y + (b.y - a.y) * smooth(a.f, b.f, f);
    }
    return keys[keys.length - 1].y;
  }

  function frame() {
    raf = 0;
    const sy = scrollY;
    // #hello: only while it is near the screen
    if (sy > trackTop - vh * 1.2 && sy < trackTop + trackSpan + vh * 1.2) {
      const f = clamp((sy - trackTop) / trackSpan) * U;
      for (const w of all) set(w, DIM + (1 - DIM) * clamp(f - w.s));
      const y = Math.round((anchor - readY(f)) * 2) / 2;
      if (y !== ty) { ty = y; text.style.transform = `translate3d(0, ${y}px, 0)`; }
      for (const L of lines) set(L, (1 - (1 - DONE) * smooth(L.e + 0.3, L.e + 2.2, f)) * (0.25 + 0.75 * smooth(vh * 0.07, vh * 0.26, y + L.yb)));
      for (const p of photos) {
        const a = smooth(p.L.s - 1.5 + p.k * 2.2, p.L.s + 3 + p.k * 2.2, f);
        const s = smooth(p.L.e + 0.6, p.L.e + 4, f);
        const key = `${a.toFixed(3)}|${s.toFixed(3)}`;
        if (key === p.key) continue;
        p.key = key;
        p.el.style.opacity = a.toFixed(3);
        p.el.style.transform = `translate3d(0, ${((1 - a) * 46).toFixed(1)}px, 0) scale(${(1.04 - 0.04 * a - 0.17 * s).toFixed(4)})`;
      }
    }
    // the leads: lit while they cross the middle of the screen, quieter once read
    for (const l of leads) {
      const top = l.top - sy;
      const n = l.ws.length;
      const f = clamp((vh * 0.9 - top) / (l.h + vh * 0.5)) * (n + 0.5);
      if (f === 0 && l.ws[0].o === DIM) continue;   // still unread, already drawn so
      for (let k = 0; k < n; k++) set(l.ws[k], DIM + (1 - DIM) * clamp(f - k));
      set(l, 1 - (1 - DONE) * smooth(0, 1, (vh * 0.34 - top - l.h) / (vh * 0.22)));
    }
  }
  const request = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const relayout = () => { layout(); request(); };
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', relayout);
  layout(); frame();
  document.fonts?.ready.then(relayout);
  addEventListener('load', relayout, { once: true });
  new ResizeObserver(relayout).observe(document.querySelector('main'));
}
