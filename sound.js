/* The music ("Jaago" by Lifafa, played once from the drop), the start, the dock button, and the film that ducks it.
   Markup it looks for (all optional except the dock's .sound button):
     <button class="sound" aria-pressed="false"><span class="sound-label">Music</span>…</button>
     <section class="film"> … <video class="film-video" muted loop playsinline> … <button class="film-play"><span class="film-label">Watch with sound</span></button>
     any <button data-music> elsewhere (e.g. the footer) toggles the music too.
   Adds html.film-on while the film plays with sound (autoscroll holds for it). */
const MUSIC = new URL('media/music.m4a', import.meta.url).href;
const SONG = 'Jaago · Lifafa';
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const dock = document.querySelector('.sound');
const music = new Audio(MUSIC);
music.loop = false; music.preload = 'auto';  // plays once, from the drop; fetched up front so it starts the moment the site does
const LEVEL = 0.6;
let ctx = null, gain = null, analyser = null, wanted = false, token = 0, filmOn = false;
// Switching the music off holds for this visit only (sessionStorage): every new visit opens
// with the music again. Clear the old site-wide setting from earlier versions.
try { localStorage.removeItem('music'); } catch {}
const store = { get: () => { try { return sessionStorage.getItem('music'); } catch { return null; } },
                set: (v) => { try { sessionStorage.setItem('music', v); } catch {} } };
function graph() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC(); gain = ctx.createGain(); gain.gain.value = 0;
    analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.6;
    ctx.createMediaElementSource(music).connect(gain).connect(analyser).connect(ctx.destination);
}
function ramp(to, secs, done) {
    const t = ++token;
    if (gain) { const n = ctx.currentTime; gain.gain.cancelScheduledValues(n); gain.gain.setValueAtTime(gain.gain.value, n); gain.gain.linearRampToValueAtTime(to, n + secs); }
    else music.volume = to;
    setTimeout(() => { if (t === token && done) done(); }, secs * 1000 + 40);
}
const up = (s = 1.6) => { graph(); ctx?.resume(); music.play().then(() => ramp(LEVEL, s)).catch(() => {}); };
const down = (s = 1.1) => ramp(0, s, () => music.pause());
const extra = document.querySelectorAll('[data-music]');
function paint() {
    if (!dock) return;
    dock.setAttribute('aria-pressed', String(wanted));
    dock.classList.toggle('is-ducked', wanted && filmOn);
    const l = dock.querySelector('.sound-label'); if (l) l.textContent = wanted ? SONG : 'Music';
    dock.title = wanted ? `Music: ${SONG} (tap to stop)` : 'Play the music';
    extra.forEach((b) => (b.textContent = wanted ? 'Stop the music' : 'Play the music'));
}
function toggle() { start(); wanted = !wanted; store.set(wanted ? 'on' : 'off'); if (wanted && !filmOn) up(); else down(); paint(); }
dock?.addEventListener('click', toggle);
extra.forEach((b) => b.addEventListener('click', toggle));
/* --- The start. The site begins with the music. If the browser lets sound play straight
   away, both simply start. If not (most first visits), a quiet Enter sits over the opening,
   and that first click starts the music and the site together. Scrolling past it starts
   the site silently; the music then comes in on the first tap. Anyone who switched the
   music off before gets the site straight away, silent. Pages listen for 'site:start'. --- */
const gate = document.querySelector('.gate');
let started = false;
function start() {
    if (started) return;
    started = true; window.siteStarted = true;
    dispatchEvent(new Event('site:start'));
    if (gate) { gate.classList.remove('is-on'); setTimeout(() => gate.remove(), 900); }
}
function showGate() { if (!started && gate) gate.classList.add('is-on'); }
const GESTURES = ['pointerdown', 'mousedown', 'touchend', 'keydown', 'click'];
const unlisten = () => GESTURES.forEach((g) => removeEventListener(g, first, true));
const first = (e) => {
    if (e.target.closest?.('.dock, .sound, .film, [data-music]')) return;
    unlisten();
    if (store.get() !== 'off' && !wanted) { wanted = true; paint(); if (!filmOn) up(0.3); }
    start();
};
GESTURES.forEach((g) => addEventListener(g, first, true));
addEventListener('scroll', () => { if (scrollY > 40) start(); }, { passive: true });
if (store.get() === 'off') start();
else {
    graph();
    ctx?.resume().catch(() => {});
    music.play().then(() => {
        if (ctx && ctx.state !== 'running') { music.pause(); showGate(); return; }   // allowed, but silent: ask for the click
        if (wanted) return;
        wanted = true; unlisten(); paint(); ramp(LEVEL, 0.3); start();
    }).catch(showGate);
    setTimeout(() => { if (!started && music.paused) showGate(); }, 1200);
}
// the song plays once; when it ends the dock says Music again (press it to play once more)
music.addEventListener('ended', () => { wanted = false; paint(); });
window.siteMusic = music;

const filmSec = document.querySelector('.film');
const film = filmSec?.querySelector('.film-video');
const btn = filmSec?.querySelector('.film-play');
if (film && btn) {
    let fade = 0, seen = false;
    const vol = (to, secs) => {
        cancelAnimationFrame(fade); const from = film.volume, t0 = performance.now();
        const step = (t) => { const k = clamp01((t - t0) / (secs * 1000)); film.volume = from + (to - from) * k; if (k < 1) fade = requestAnimationFrame(step); };
        fade = requestAnimationFrame(step);
    };
    const label = (s) => { const l = btn.querySelector('.film-label'); if (l) l.textContent = s; };
    const start = () => {
        filmOn = true; document.documentElement.classList.add('film-on'); filmSec.classList.add('is-playing');
        btn.setAttribute('aria-pressed', 'true'); label('Stop');
        if (wanted) down(0.9);
        film.loop = false; film.currentTime = 0; film.volume = 0; film.muted = false;
        film.play().then(() => vol(1, 0.9)).catch(() => stop());
        paint();
    };
    const stop = () => {
        if (!filmOn) return;
        filmOn = false; document.documentElement.classList.remove('film-on'); filmSec.classList.remove('is-playing');
        btn.setAttribute('aria-pressed', 'false'); label('Watch with sound');
        vol(0, 0.8);
        setTimeout(() => { if (!filmOn) { film.muted = true; film.loop = true; if (seen) film.play().catch(() => {}); else film.pause(); } }, 820);
        if (wanted) up(1.8);
        paint();
    };
    btn.addEventListener('click', () => (filmOn ? stop() : start()));
    film.addEventListener('click', () => (filmOn ? stop() : start()));
    film.addEventListener('ended', stop);
    new IntersectionObserver((es) => es.forEach((e) => {
        seen = e.isIntersecting;
        if (e.isIntersecting) { film.preload = 'auto'; if (!filmOn) film.play().catch(() => {}); }
        else { if (filmOn) stop(); film.pause(); }
    }), { threshold: 0.25 }).observe(filmSec);
}
paint();


/* --- The dock's four bars follow the music's real levels while it plays. --- */
const bars = dock ? [...dock.querySelectorAll('.bars i')] : [];
let levels = null;
function meter() {
    requestAnimationFrame(meter);
    if (!wanted || filmOn || music.paused || !analyser || !bars.length) {
        if (dock?.classList.contains('is-live')) { dock.classList.remove('is-live'); bars.forEach((b) => (b.style.height = '')); }
        return;
    }
    levels ||= new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(levels);
    dock.classList.add('is-live');
    const bands = [[1, 4], [4, 10], [10, 24], [24, 60]];
    bars.forEach((b, k) => {
        const [a, z] = bands[k]; let sum = 0;
        for (let j = a; j < z; j++) sum += levels[j];
        b.style.height = `${(3 + (sum / (z - a) / 255) * 10).toFixed(1)}px`;
    });
}
requestAnimationFrame(meter);
