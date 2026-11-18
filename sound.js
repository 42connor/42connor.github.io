/* Shared by every variant: the music loop, the dock button, and the film that ducks it.
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
music.loop = true; music.preload = 'auto';   // 1.5 MB, fetched up front so the drop lands on the first tap
const LEVEL = 0.6;
let ctx = null, gain = null, wanted = false, token = 0, filmOn = false;
const store = { get: () => { try { return localStorage.getItem('music'); } catch { return null; } },
                set: (v) => { try { localStorage.setItem('music', v); } catch {} } };
function graph() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC(); gain = ctx.createGain(); gain.gain.value = 0;
    ctx.createMediaElementSource(music).connect(gain).connect(ctx.destination);
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
function toggle() { wanted = !wanted; store.set(wanted ? 'on' : 'off'); if (wanted && !filmOn) up(); else down(); paint(); }
dock?.addEventListener('click', toggle);
extra.forEach((b) => b.addEventListener('click', toggle));
// Start the moment the page opens if the browser allows sound (it does for returning
// visitors in Chrome, and wherever autoplay is permitted). Otherwise start on the very first
// tap, click, key or touch anywhere, unless the visitor switched it off before.
const GESTURES = ['pointerdown', 'mousedown', 'touchend', 'keydown', 'click'];
const unlisten = () => GESTURES.forEach((g) => removeEventListener(g, first, true));
const first = (e) => {
    if (e.target.closest?.('.dock, .sound, .film, [data-music]')) return;
    unlisten();
    if (store.get() === 'off' || wanted) return;
    wanted = true; paint(); if (!filmOn) up(0.35);
};
GESTURES.forEach((g) => addEventListener(g, first, true));
if (store.get() !== 'off') {
    graph();
    ctx?.resume().catch(() => {});
    music.play().then(() => {
        if (ctx && ctx.state !== 'running') { music.pause(); return; }   // allowed to play, but silently: wait for a tap
        if (wanted) return;
        wanted = true; unlisten(); paint(); ramp(LEVEL, 0.35);
    }).catch(() => {});
}

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
