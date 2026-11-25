/* Autoscroll: the page reads itself. Any touch of the wheel, keys, finger or
   scrollbar hands it back to you; it takes over again after a pause. The Auto button
   in the corner turns it off for good (until pressed again). */
const btn = document.getElementById('auto');
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SPEED = 205;       // px per second, when there is no music to finish with
const STRETCH = 1.25;    // read a quarter slower than the song: it finishes a little before the footer
const EARLY = 7;         // seconds: reach the footer this long before the song ends
const START = 5800;      // after the site starts: let the cursor make its first take first
const RESUME = 3200;     // idle time before it takes over again

let locked = calm;       // the button (or reduced motion) has turned it off
let held = true;         // paused for now, by the visitor's own scrolling
let pos = scrollY, prev = scrollY, last = 0, timer = 0, raf = 0, vel = 0, top = 0;
const max = () => document.documentElement.scrollHeight - innerHeight;
const slowZones = [...document.querySelectorAll('[data-slow]')];

function paint() { btn.setAttribute('aria-pressed', String(!locked)); }
function hold(ms = RESUME) {
  held = true; clearTimeout(timer);
  if (!locked) timer = setTimeout(go, ms);
}
function go() {
  if (locked || document.hidden) return;
  held = false; pos = prev = scrollY; last = 0; vel = 0;
  cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
}
// With the song playing, pace the page so it arrives at the footer EARLY seconds before the
// song ends, and sits there while the song resolves. Re-planned every frame, so it still
// lands right after the visitor scrolls by hand or pauses for the film.
function speed() {
  const m = window.siteMusic;
  if (!m || m.paused || !isFinite(m.duration)) return SPEED;
  const left = m.duration * STRETCH - EARLY - m.currentTime;
  if (left < 1) return SPEED * 1.6;
  return Math.min(900, Math.max(90, (top - pos) / left));
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
    // the browser moved the page a little on its own (scroll anchoring when something above
    // changes size): go on from where it put us instead of yanking it back. Phones can report the
    // position a frame late, which matches the previous target, so that alone is not a move.
    if (Math.abs(scrollY - pos) > 2 && Math.abs(scrollY - prev) > 2) pos = scrollY;
    prev = pos;
    top = max();
    // paced to the song the plan already covers the slower scenes; otherwise a touch slower through
    // anything marked data-slow (only measured when it matters: no layout reads on the paced path)
    const paced = window.siteMusic && !window.siteMusic.paused;
    const k = paced ? 1 : (slowZones.some((el) => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }) ? .85 : 1);
    // ease the speed toward its target, so a re-plan never shows up as a lurch
    const dt = Math.min(.05, (t - last) / 1000), want = speed() * k;
    vel += (want - vel) * Math.min(1, dt * 2.5);
    pos = Math.min(top, pos + vel * dt);
    scrollTo({ top: pos, behavior: 'instant' });   // instant: never a glide, whatever the css says
    if (pos >= top - 1) { held = true; return; }          // the end: stay put
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
// starts once the site has (sound.js fires 'site:start' with the music)
const kickoff = () => { if (!locked) timer = setTimeout(go, START); };
if (window.siteStarted) kickoff(); else addEventListener('site:start', kickoff, { once: true });
