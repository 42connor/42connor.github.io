/* Stickers arrive with a slap when their moment comes:
   in #hello, when says.js fades their margin photo in (they peel off again if you scroll back);
   on the Adelaide stops, when the route reaches their stop; anywhere else, when they scroll into view.
   Under reduced motion they are simply there. */
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const all = [...document.querySelectorAll('.stk')];

const on = (el) => {
  if (el.classList.contains('is-on')) return;
  el.classList.remove('is-stuck');
  el.classList.add('is-on');
};
const off = (el) => el.classList.remove('is-on', 'is-stuck');
all.forEach((el) => el.querySelector('picture')?.addEventListener('animationend', (e) => {
  if (e.animationName === 'stk-slap') el.classList.add('is-stuck');
}));

if (calm) all.forEach((el) => el.classList.add('is-on', 'is-stuck'));
else {
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { on(e.target); io.unobserve(e.target); }
  }), { threshold: 0.35 });

  for (const el of all) {
    if (el.classList.contains('ra-ph')) {
      // says.js writes this photo's opacity as the reading reaches it
      const read = () => {
        const o = parseFloat(el.style.opacity);
        if (o > 0.32) on(el);
        else if (o < 0.04) off(el);
      };
      new MutationObserver(read).observe(el, { attributes: true, attributeFilter: ['style'] });
      read();
    } else if (el.closest('.stop')) {
      // route.js lights the stop when the line gets there
      const stop = el.closest('.stop');
      const read = () => { if (stop.classList.contains('on')) on(el); };
      new MutationObserver(read).observe(stop, { attributes: true, attributeFilter: ['class'] });
      read();
    } else io.observe(el);
  }
}
