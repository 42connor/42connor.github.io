/* 3 · The take. Only plays while the page sits at the top, and stops for good once you scroll. */
const rec = document.querySelector('.hx-rec');
const cur = rec?.querySelector('.hx-cursor');
const rip = rec?.querySelector('.hx-ripple');
const target = document.querySelector('.hx-target');
const canvas = document.querySelector('.canvas');
const name = document.querySelector('.name');
const root = document.documentElement;
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let x = innerWidth + 40, y = innerHeight * 0.8, stopped = false;

function glide(tx, ty, ms) {
  return new Promise((done) => {
    const x0 = x, y0 = y, t0 = performance.now();
    // a soft arc, the way the recorder smooths a real hand
    const bend = (tx - x0) * 0.18;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      x = x0 + (tx - x0) * e; y = y0 + (ty - y0) * e - Math.sin(Math.PI * e) * bend * 0.35;
      cur.style.setProperty('--cx', `${x.toFixed(1)}px`); cur.style.setProperty('--cy', `${y.toFixed(1)}px`);
      if (k < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  });
}
async function click() {
  cur.style.setProperty('--cs', '.82'); rip.style.setProperty('--rx', `${x + 6}px`); rip.style.setProperty('--ry', `${y + 3}px`);
  rip.classList.remove('is-on'); void rip.offsetWidth; rip.classList.add('is-on');
  await wait(140); cur.style.setProperty('--cs', '1');
}
function zoomAt(px, py, on) {
  if (on) {
    const c = canvas.getBoundingClientRect(), n = name.getBoundingClientRect();
    canvas.style.transformOrigin = `${px - c.left}px ${py - c.top}px`;
    name.style.transformOrigin = `${px - n.left}px ${py - n.top}px`;
  }
  root.classList.toggle('hx-zoomed', on);
}
async function take() {
  while (!stopped) {
    const r = target.getBoundingClientRect();
    const tx = r.left + r.width * 0.42, ty = r.top + r.height * 0.55;
    await glide(tx, ty, 1300); if (stopped) break;
    await wait(250); zoomAt(tx, ty, true); await click();
    await wait(1900);
    zoomAt(tx, ty, false); await wait(1100); if (stopped) break;
    await glide(innerWidth * 0.82, innerHeight * 0.32, 1500); await wait(400); await click();
    await wait(900);
    await glide(innerWidth + 60, innerHeight * 0.86, 1400);
    await wait(2200);
  }
}
if (rec && !calm) {
  addEventListener('scroll', () => {
    if (scrollY > 30 && !stopped) { stopped = true; root.classList.remove('hx-zoomed'); rec.style.display = 'none'; }
  }, { passive: true });
  // the take begins when the site does (with the music: sound.js fires 'site:start')
  const begin = () => setTimeout(() => { if (scrollY < 30) take(); else stopped = true; }, 900);
  if (window.siteStarted) begin(); else addEventListener('site:start', begin, { once: true });
}
