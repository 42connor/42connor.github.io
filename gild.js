/* Almond Blossom, gilded and relit.

   The first painting stops being a flat photograph. Van Gogh outlined every branch in a
   dark stroke; here those strokes are laid in gold leaf, and the leaf runs out along the
   branches from the trunk when the page opens, the way kintsugi lacquer runs along a crack.
   The leaf is not a colour: like the gold-ground mosaic, it is cut into tiny facets, each
   set a few degrees off true, so a candle you carry (the pointer; on a phone it wanders by
   itself and follows the scroll) makes single facets flash and go out. The paint itself
   is relit as a surface: the brush ridges catch the candle, the varnish holds a soft gloss,
   and the petals let the light through.

   The canvas sits inside the first .paint layer, so it crossfades and drifts with it; the
   plain background image underneath is what shows without WebGL or until it is ready. */
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const host = document.querySelector('.canvas .paint');
const SRC = host?.dataset.src;

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * .5 + .5; vUv.y = 1. - vUv.y; gl_Position = vec4(aPos, 0., 1.); }`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uAlb;     // the painting
uniform sampler2D uMap;     // r: path length from the trunk along the branches (0..1), g: soft branch mask
uniform vec4 uCrop;         // image uv = uCrop.xy + vUv * uCrop.zw  (the same crop as the CSS background)
uniform vec2 uTex;          // one painting texel
uniform vec2 uSize;         // the canvas, css px
uniform vec2 uImg;          // css px per painting texel
uniform vec3 uCandle;       // css px from the top left; z out of the picture
uniform vec3 uEye;
uniform float uRun;         // the gold's run along the branches, 0..1.2
uniform float uTime;
uniform float uDebug;
varying vec2 vUv;

const vec3 CANDLE = vec3(1., .82, .58);

float lum(vec3 c) { return dot(c, vec3(.3, .55, .15)); }
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float lobe(vec3 N, vec3 H, float w2) { return exp(-(1. - max(dot(N, H), 0.)) * 2. / w2); }

// how much of a pixel is branch (and its dark outline), and how much is blossom
void classify(vec3 c, out float branch, out float line, out float petal) {
    float l = lum(c);
    float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
    // the sky is a cool blue-green with red well below blue; the wood is green, olive or brown
    float warm = (c.g - c.b) + (c.r - c.b) * .55;
    petal = smoothstep(.56, .7, l) * (1. - smoothstep(.17, .3, mx - mn));
    // the outlines: Van Gogh's near-black strokes round every limb (dark, and not the sky's blue)
    line = (1. - smoothstep(.24, .42, l)) * (1. - smoothstep(.03, .12, c.b - c.g));
    branch = max(smoothstep(-.02, .07, warm) * (1. - petal), line);
}

void main() {
    vec2 uv = uCrop.xy + vUv * uCrop.zw;
    vec3 alb = texture2D(uAlb, uv).rgb;
    vec2 o = uTex * 1.5;
    float hl = lum(texture2D(uAlb, uv - vec2(o.x, 0.)).rgb), hr = lum(texture2D(uAlb, uv + vec2(o.x, 0.)).rgb);
    float hu = lum(texture2D(uAlb, uv - vec2(0., o.y)).rgb), hd = lum(texture2D(uAlb, uv + vec2(0., o.y)).rgb);
    // the paint's ridges: light strokes stand proud of dark ones (the old relighting trick,
    // and on Van Gogh's loaded brush it is nearly true)
    vec3 Nr = normalize(vec3((hl - hr) * 3.2, (hu - hd) * 3.2, 1.));

    float branch, line, petal;
    classify(alb, branch, line, petal);
    vec4 m = texture2D(uMap, uv);
    // the gold has reached here yet? (path length along the wood from the trunk)
    float d = m.r;
    float reached = smoothstep(d - .012, d + .006, uRun);
    float front = exp(-pow((uRun - d) / .018, 2.)) * step(.001, uRun) * step(uRun, 1.15);
    // gold on the dark outlines, and a thin, worn wash of it over the rest of the wood
    float gild = clamp(line * 1.3 + branch * .62, 0., 1.) * reached;

    vec3 P = vec3(vUv * uSize, 0.);
    vec3 L = normalize(uCandle - P);
    vec3 V = normalize(uEye - P);
    vec3 H = normalize(L + V);
    float dist = length(uCandle.xy - P.xy) / max(uSize.x, uSize.y);
    float fall = 1. / (1. + dist * dist * 9.);

    // ---- the paint, relit: ridges catch the candle, the varnish holds a soft gloss
    float diff = dot(Nr, L);
    vec3 paint = alb * (.86 + .3 * diff * (.45 + .55 * fall));
    paint += vec3(1., .96, .9) * lobe(Nr, H, .012) * .07 * fall;
    // the petals let the light through, a little warm, near the candle
    paint += alb * CANDLE * petal * .28 * fall * fall;

    // ---- the leaf: cut into facets a few painting-texels wide, each set off true
    vec2 cell = floor(uv / uTex / 3.);
    float h1 = hash(cell), h2 = hash(cell + 17.3), h3 = hash(cell + 41.7);
    vec2 tilt = (vec2(h1, h2) - .5) * .5;
    vec3 Nf = normalize(vec3(Nr.xy * .8 + tilt, 1.));
    // a facet flashes when the mirror angle passes through it; a broader pool of sheen
    // travels with the candle across all of them
    float glint = lobe(Nf, H, .0035) * (.55 + .9 * h3);
    float sheen = lobe(normalize(vec3(Nr.xy * .6, 1.)), H, .09);
    float l = lum(alb);
    // leaf laid over the paint: the strokes still show through as relief and a little tone
    vec3 leaf = vec3(.7, .5, .21) * (.72 + .5 * smoothstep(.12, .7, l)) * (.82 + .32 * diff);
    vec3 tint = vec3(1., .8, .45);
    vec3 gold = leaf * (.8 + .42 * fall)
              + tint * sheen * (.45 + .7 * fall)
              + tint * glint * 2.8 * fall
              + vec3(.12) * glint * fall;
    // a few facets catch on their own, slowly, wherever the candle is
    float twinkle = pow(max(sin(uTime * (.6 + h2 * 1.1) + h1 * 40.), 0.), 24.) * step(.93, h3);
    gold += tint * twinkle * .9;

    vec3 c = mix(paint, gold, gild);
    // the running front: molten and bright, then it sets
    c += vec3(1., .74, .36) * front * (line + branch * .45) * 1.4;

    // highlights roll off toward white instead of clipping
    vec3 hi = max(c - .78, 0.);
    c = min(c, .78) + .22 * (1. - exp(-hi / .22));
    if (uDebug > .5 && uDebug < 1.5) c = vec3(line, branch, petal);
    if (uDebug > 1.5) c = vec3(m.r, m.g * .5, reached);
    gl_FragColor = vec4(c, 1.);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

/* Path length from the trunk, along the wood. On a small copy of the painting every pixel
   gets a cost to cross (wood is cheap, blossom a little dearer, sky dear, so a gap between
   two strokes is jumped but the gold never strikes out across open sky) and Dijkstra runs
   from the trunk and the limbs entering from the bottom and left edges. */
function bakeMap(img) {
  const W = 480, H = Math.round(W * img.naturalHeight / img.naturalWidth);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, W, H);
  const px = cx.getImageData(0, 0, W, H).data;
  const N = W * H;
  const cost = new Float32Array(N), wood = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = px[i * 4] / 255, g = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255;
    const l = .3 * r + .55 * g + .15 * b;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const warm = (g - b) + (r - b) * .55;
    const petal = l > .6 && mx - mn < .24;
    const dark = l < .34 && b - g < .08;
    const w = dark ? 1 : Math.min(1, Math.max(0, (warm + .02) / .09));
    wood[i] = petal ? 0 : w;
    cost[i] = petal ? 2.2 : 1 + (1 - w) * 26;
  }
  const dist = new Float32Array(N).fill(Infinity);
  // a binary heap of (distance, index)
  const hd = new Float32Array(N * 4), hi = new Int32Array(N * 4); let hn = 0;
  const push = (d, i) => { let k = hn++; while (k > 0) { const p = (k - 1) >> 1; if (hd[p] <= d) break; hd[k] = hd[p]; hi[k] = hi[p]; k = p; } hd[k] = d; hi[k] = i; };
  const pop = () => {
    const ri = hi[0]; const d = hd[--hn], i = hi[hn]; let k = 0;
    for (;;) { let c = 2 * k + 1; if (c >= hn) break; if (c + 1 < hn && hd[c + 1] < hd[c]) c++; if (hd[c] >= d) break; hd[k] = hd[c]; hi[k] = hi[c]; k = c; }
    hd[k] = d; hi[k] = i; return ri;
  };
  // seeds: wood on the bottom edge (the trunk, x 45%..85%, first) and the left edge's lower half
  for (let x = 0; x < W; x++) {
    const i = (H - 1) * W + x;
    if (wood[i] > .5) { const off = (x / W > .45 && x / W < .85) ? 0 : 40; dist[i] = off; push(off, i); }
  }
  for (let y = Math.round(H * .55); y < H; y++) { const i = y * W; if (wood[i] > .5 && dist[i] > 60) { dist[i] = 60; push(60, i); } }
  const D2 = Math.SQRT2;
  while (hn) {
    const i = pop(); const d = dist[i];
    const x = i % W, y = (i / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      const nd = d + cost[j] * (dx && dy ? D2 : 1);
      if (nd < dist[j]) { dist[j] = nd; push(nd, j); }
    }
  }
  // normalise by the farthest wood, so the run ends at the twig tips
  // (the 97th percentile, so a stray speck reached only across open sky doesn't stretch the scale)
  const ds = [];
  for (let i = 0; i < N; i += 3) if (wood[i] > .5 && dist[i] < Infinity) ds.push(dist[i]);
  ds.sort((x, y) => x - y);
  const far = ds[Math.floor(ds.length * .97)] || 1;
  const out = cx.createImageData(W, H);
  for (let i = 0; i < N; i++) {
    out.data[i * 4] = Math.min(255, Math.round(Math.min(1, dist[i] / far) * 255));
    out.data[i * 4 + 1] = Math.round(wood[i] * 255);
    out.data[i * 4 + 3] = 255;
  }
  cx.putImageData(out, 0, 0);
  return cv;
}

function start(img) {
  const cv = document.createElement('canvas');
  cv.className = 'gild';
  const gl = cv.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
  if (!gl) return;
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { console.warn('gild:', e); return; }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const n of ['uAlb', 'uMap', 'uCrop', 'uTex', 'uSize', 'uImg', 'uCandle', 'uEye', 'uRun', 'uTime', 'uDebug']) U[n] = gl.getUniformLocation(prog, n);

  const tex = (unit, source, filter) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
    return t;
  };
  tex(0, img, gl.LINEAR);
  tex(1, bakeMap(img), gl.LINEAR);
  gl.uniform1i(U.uAlb, 0);
  gl.uniform1i(U.uMap, 1);
  const Q = new URLSearchParams(location.search);
  gl.uniform1f(U.uDebug, +(Q.get('gild') || 0));
  if (Q.has('bare')) { const st = document.createElement('style'); st.textContent = 'main,.nav,.gate,.credit,.dock,.foot,.route{display:none!important}.gild{transition:none}'; document.head.append(st); }
  const LX = Q.get('lx'), LY = Q.get('ly');
  gl.uniform2f(U.uTex, 1 / img.naturalWidth, 1 / img.naturalHeight);

  host.appendChild(cv);
  let W = 0, H = 0;
  function resize() {
    const r = host.getBoundingClientRect();
    // the layer's own box, before its drift transform
    W = host.offsetWidth; H = host.offsetHeight;
    const dpr = Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    gl.viewport(0, 0, cv.width, cv.height);
    // background-size: cover; background-position: 50% 40% (style.css)
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const s = Math.max(W / iw, H / ih);
    const zw = W / (iw * s), zh = H / (ih * s);
    gl.uniform4f(U.uCrop, (1 - zw) * .5, (1 - zh) * .4, zw, zh);
    gl.uniform2f(U.uSize, W, H);
    gl.uniform2f(U.uImg, s, s);
    void r;
  }
  resize();
  addEventListener('resize', resize);

  // the candle: the pointer, eased; left alone (or on a phone) it wanders over the tree
  const t0 = performance.now();
  let px = -1, py = -1, lastMove = -1e9;
  let lx = 0, ly = 0, have = false;
  addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { px = e.clientX; py = e.clientY; lastMove = performance.now(); } }, { passive: true });
  document.addEventListener('pointerleave', () => { lastMove = -1e9; });

  // the gold runs once, after the painting has settled in
  const RUN_AT = 1.1, RUN_FOR = 6.5;
  let running = true, visible = true;

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!visible) return;
    const t = (now - t0) / 1000;
    const r = host.getBoundingClientRect();
    // wander: a slow figure over the upper tree, nudged by the scroll so the glints travel as you read
    const sy = scrollY / Math.max(1, innerHeight);
    const tw = calm ? 4 : t;   // reduced motion: the candle holds still
    const wx = W * (.5 + .34 * Math.sin(tw * .11 + sy * .9));
    const wy = H * (.36 + .2 * Math.sin(tw * .17 + 1.3 + sy * .6));
    const idle = calm ? 1 : Math.min(1, Math.max(0, (now - lastMove - 2500) / 2500));
    // pointer, in the layer's own coordinates (it is scaled and drifting)
    const kx = W / r.width, ky = H / r.height;
    const mx = (px - r.left) * kx, my = (py - r.top) * ky;
    const tx = px < 0 ? wx : wx * idle + mx * (1 - idle);
    const ty = px < 0 ? wy : wy * idle + my * (1 - idle);
    if (!have) { lx = tx; ly = ty; have = true; }
    lx += (tx - lx) * .08; ly += (ty - ly) * .08;
    if (LX) { lx = W * +LX; ly = H * +LY; }
    // the swallows are lit by the same candle (swallows.js)
    window.__candle = { x: r.left + lx / kx, y: r.top + ly / ky, on: host.classList.contains('is-on') };
    const z = Math.min(W, H) * .32;
    gl.uniform3f(U.uCandle, lx, ly, z);
    // the eye moves with the scroll too: gold under a fixed candle still glints as you walk past
    gl.uniform3f(U.uEye, W * .5 + Math.sin(sy * 1.7) * W * .08, H * .5 - sy * H * .18, Math.max(W, H) * 1.1);
    const run = Q.has('run') ? +Q.get('run') : calm || Q.has('gilded') ? 1.2 : Math.min(1.2, Math.max(0, (t - RUN_AT) / RUN_FOR) * 1.2);
    gl.uniform1f(U.uRun, run);
    gl.uniform1f(U.uTime, t);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (!cv.classList.contains('on')) cv.classList.add('on');
  }
  requestAnimationFrame(frame);

  // only while this painting is the one showing (and a little after, for its fade)
  let offT = 0;
  const watch = () => {
    const on = host.classList.contains('is-on') && !document.hidden;
    clearTimeout(offT);
    if (on) visible = true; else offT = setTimeout(() => { visible = false; }, 2600);
  };
  new MutationObserver(watch).observe(host, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', watch);
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); running = false; cv.remove(); });
}

if (host && SRC) {
  const img = new Image();
  img.src = SRC;
  (img.decode ? img.decode() : new Promise((r) => { img.onload = r; })).then(() => start(img)).catch((e) => console.warn('gild:', e));
}
