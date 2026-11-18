/* Autoscroll: the page reads itself. Any touch of the wheel, keys, finger or
   scrollbar hands it back to you; it takes over again after a pause. The Auto button
   in the corner turns it off for good (until pressed again). */
const btn = document.getElementById('auto');
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SPEED = 270;       // px per second
const START = 6400;      // let the cursor make its first take first
const RESUME = 3200;     // idle time before it takes over again

let locked = calm;       // the button (or reduced motion) has turned it off
let held = true;         // paused for now, by the visitor's own scrolling
let pos = scrollY, last = 0, timer = 0, raf = 0;
const max = () => document.documentElement.scrollHeight - innerHeight;

function paint() { btn.setAttribute('aria-pressed', String(!locked)); }
function hold(ms = RESUME) {
  held = true; clearTimeout(timer);
  if (!locked) timer = setTimeout(go, ms);
}
function go() {
  if (locked || document.hidden) return;
  held = false; pos = scrollY; last = 0;
  cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
}
function tick(t) {
  if (held || locked) return;
  if (last) {
    // somebody else moved the page (scrollbar drag, anchor, find): hand it over.
    // Phones report the new position a frame late, so allow a few steps of slack.
    if (Math.abs(scrollY - pos) > 40) { hold(); return; }
    // the film is playing with sound: let it be watched
    if (document.documentElement.classList.contains('film-on')) { hold(); return; }
    // the menu is open: leave the page where it is
    if (document.documentElement.classList.contains('menu-open')) { hold(); return; }
    // a touch slower through anything marked data-slow (scenes that move with scroll)
    const slow = [...document.querySelectorAll('[data-slow]')].some((el) => {
      const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0;
    });
    const k = slow ? .85 : 1;
    pos = Math.min(max(), pos + SPEED * k * Math.min(.05, (t - last) / 1000));
    scrollTo({ top: pos, behavior: 'instant' });   // instant: never a glide, whatever the css says
    if (pos >= max() - 1) { held = true; return; }          // the end: stay put
  }
  last = t; raf = requestAnimationFrame(tick);
}

['wheel', 'touchstart', 'touchmove'].forEach((e) => addEventListener(e, () => hold(), { passive: true }));
// a flick keeps coasting after the finger lifts: wait for it to settle
addEventListener('scroll', () => { if (held && !locked) hold(); }, { passive: true });
addEventListener('keydown', (e) => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(e.key)) hold(); });
addEventListener('pointerdown', (e) => { if (e.target === document.documentElement) hold(); });   // scrollbar
document.addEventListener('visibilitychange', () => { if (document.hidden) { held = true; clearTimeout(timer); } else if (!locked) hold(1200); });

btn.addEventListener('click', () => {
  locked = !locked; paint();
  if (locked) { held = true; clearTimeout(timer); } else go();
});
paint();
if (!locked) timer = setTimeout(go, START);
