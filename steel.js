/* The Starry Night, machined: the tech section's painting as precision hardware.

   The paint becomes anodized aluminium in its own colours: matte, finely bead-blasted, the
   brush relief kept. Every edge where one brushstroke meets the next is a diamond-cut chamfer,
   polished bright, that flashes silver only when it faces the light, so as the light moves the
   flashes run along the swirls. The moon and the stars are lathe-turned: fine concentric
   grooves round each centre, with the light spinning on them like a watch part. When the
   section arrives the light comes in from the left edge and the metal comes up under it; as you
   scroll through the wins a studio softbox glides across the surface. The light is
   the pointer (on a phone it wanders and follows the scroll). Where the Almond Blossom is gilded
   by hand, this one is machined.

   Like gild.js, the canvas sits inside its .paint layer, so it crossfades and drifts with it,
   and the plain painting underneath is what shows without WebGL. ?machined shows it from the
   start; ?lx=.4&ly=.3 holds the light. */
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const host = document.querySelectorAll('.canvas .paint')[2];
const SRC = host?.dataset.src;
const POS_Y = .32;   // style.css: .paint:nth-child(3) background-position 50% 32%
const Q = new URLSearchParams(location.search);
const MAXN = 16;

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
uniform sampler2D uAlb;
uniform sampler2D uMap;     // rg: brushstroke direction as (cos 2a, sin 2a)
uniform vec4 uCrop;
uniform vec2 uTex;
uniform vec2 uSize;
uniform vec3 uCandle;
uniform vec3 uEye;
uniform float uRun;         // 0..1: how far the metal has come up as the light arrives
uniform vec2 uBox;          // the studio softbox's position on the sphere of directions (scroll-driven)
uniform float uTime;
uniform vec3 uNodes[${MAXN}];   // stars and moon: css px x, y, radius
uniform int uNN;
uniform float uDebug;
varying vec2 vUv;

float lum(vec3 c) { return dot(c, vec3(.3, .55, .15)); }
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float lobe(vec3 N, vec3 H, float w2) { return exp(-(1. - max(dot(N, H), 0.)) * 2. / w2); }
// brushed metal: the highlight of a surface scratched along T (Kajiya-Kay)
float brushed(vec3 T, vec3 H, float p) { float th = dot(T, H); return pow(sqrt(max(0., 1. - th * th)), p); }

void main() {
  vec2 P = vUv * uSize;
  vec2 uv = uCrop.xy + vUv * uCrop.zw;
  vec3 alb = texture2D(uAlb, uv).rgb;
  float l = lum(alb);
  vec2 o = uTex * 1.5;
  float hl = lum(texture2D(uAlb, uv - vec2(o.x, 0.)).rgb), hr = lum(texture2D(uAlb, uv + vec2(o.x, 0.)).rgb);
  float hu = lum(texture2D(uAlb, uv - vec2(0., o.y)).rgb), hd = lum(texture2D(uAlb, uv + vec2(0., o.y)).rgb);
  vec3 Nr = normalize(vec3((hl - hr) * 3., (hu - hd) * 3., 1.));

  vec3 L = normalize(uCandle - vec3(P, 0.));
  vec3 V = normalize(uEye - vec3(P, 0.));
  vec3 H = normalize(L + V);
  float dc = length(uCandle.xy - P) / max(uSize.x, uSize.y);
  float fall = 1. / (1. + dc * dc * 8.);
  float diff = dot(Nr, L);

  // Anodized aluminium with diamond-cut edges. The paint is the anodized colour: matte, finely
  // bead-blasted, the brush relief kept. Where one stroke meets the next, the edge is chamfered and
  // polished: a narrow bevel whose normal leans across the edge, so it flashes bright silver only
  // when it faces the light, and the flashes run along the swirls as the light moves. The stars
  // are lathe-turned: fine concentric grooves round each centre that spin the light.
  float sky = 1. - smoothstep(.62, .7, uv.y);
  float nearest = 1e9; vec2 c0 = P; float nr = 1.;
  for (int i = 0; i < ${MAXN}; i++) {
    if (i >= uNN) break;
    vec3 n = uNodes[i];
    float d = length(P - n.xy) / n.z;
    if (d < nearest) { nearest = d; c0 = n.xy; nr = n.z; }
  }
  // the edge: the paint's value gradient, measured a little wider so bevels have width
  vec2 o2 = uTex * 2.6;
  float gx = lum(texture2D(uAlb, uv + vec2(o2.x, 0.)).rgb) - lum(texture2D(uAlb, uv - vec2(o2.x, 0.)).rgb);
  float gy = lum(texture2D(uAlb, uv + vec2(0., o2.y)).rgb) - lum(texture2D(uAlb, uv - vec2(0., o2.y)).rgb);
  vec2 gd = vec2(gx, gy);
  float gm = length(gd);
  float bevel = smoothstep(.07, .16, gm);
  // the chamfer's normal leans 40 degrees across the edge, toward the darker stroke
  vec2 across = -gd / max(gm, 1e-4);
  vec3 Nb = normalize(vec3(across * .84, 1.));
  vec3 Hw = normalize(normalize(vec3(-.5, -.75, .45)) + V);
  float cut = lobe(Nb, H, .012) * fall * 2.1 + lobe(Nb, Hw, .02) * .4;

  // anodized: the paint's colour, a touch deeper and more even, with a fine satin sheen
  float grain = hash(floor(uv / uTex));
  vec3 Ns = normalize(vec3(Nr.xy * .5, 1.));
  vec3 anod = alb * (.8 + .2 * diff) * (.94 + .06 * grain);
  anod += alb * lobe(Ns, H, .08) * .35 * fall + vec3(.6, .7, .8) * lobe(Ns, Hw, .2) * .05;
  // the studio softbox: a broad, soft highlight that glides across the whole surface as you
  // scroll, the way light slides over a phone turned in the hand; the bevels inside it light up
  vec3 Lb = normalize(vec3(uBox, 1.));
  vec3 Hb = normalize(Lb + V);
  float box = lobe(Ns, Hb, .035);
  anod += mix(alb, vec3(.8, .88, 1.), .45) * box * .3;
  cut += lobe(Nb, Hb, .03) * .9;
  vec3 metal = anod + vec3(.92, .96, 1.) * cut * bevel;

  // lathe-turned stars: concentric grooves round each centre, the light spinning on them
  // only the star's own bright paint is turned, never the sky round it
  float turned = (1. - smoothstep(1.05, 1.5, nearest)) * smoothstep(.04, .14, (alb.r + alb.g) * .5 - alb.b) * smoothstep(.42, .58, l) * sky;
  vec2 rr = P - c0;
  vec3 Tt = normalize(vec3(-rr.y, rr.x, 0.) + 1e-4);
  float th = dot(Tt, H);
  float ring = .82 + .18 * sin(length(rr) * 3.1);
  vec3 turnedC = alb * .7 * ring + vec3(1., .94, .78) * pow(sqrt(max(0., 1. - th * th)), 140.) * (.3 + .6 * fall);
  metal = mix(metal, turnedC, turned);

  // the metal comes up as the light arrives (no sweep: just the light finding it)
  vec3 paint = alb * (.86 + .26 * diff * (.5 + .5 * fall));
  vec3 c = mix(paint, metal, uRun);
  float steel = bevel, brass = turned, cypress = 0.;

  if (uDebug > .5) c = vec3(steel, brass, cypress);
  vec3 hi = max(c - .8, 0.);
  c = min(c, .8) + .2 * (1. - exp(-hi / .2));
  gl_FragColor = vec4(c, 1.);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

/* the brushstroke direction (structure tensor of a small copy) and the stars (warm, bright blobs above the village) */
function bake(im) {
  const W = 480, H = Math.round(W * im.naturalHeight / im.naturalWidth);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(im, 0, 0, W, H);
  const px = cx.getImageData(0, 0, W, H).data;
  const N = W * H, L = new Float32Array(N), star = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const r = px[i * 4] / 255, g = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255;
    L[i] = .3 * r + .55 * g + .15 * b;
    star[i] = ((r + g) / 2 - b > .2 && L[i] > .55 && i / W < H * .62) ? 1 : 0;
  }
  const xx = new Float32Array(N), xy = new Float32Array(N), yy = new Float32Array(N);
  const at = (x, y) => L[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    const i = y * W + x; xx[i] = gx * gx; xy[i] = gx * gy; yy[i] = gy * gy;
  }
  const tmp = new Float32Array(N);
  const blur = (a, r) => {
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < H; y++) {
        let s = 0; const row = y * W;
        for (let x = -r; x <= r; x++) s += a[row + Math.min(W - 1, Math.max(0, x))];
        for (let x = 0; x < W; x++) { tmp[row + x] = s / (2 * r + 1); s += a[row + Math.min(W - 1, x + r + 1)] - a[row + Math.max(0, x - r)]; }
      }
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let y = -r; y <= r; y++) s += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
        for (let y = 0; y < H; y++) { a[y * W + x] = s / (2 * r + 1); s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]; }
      }
    }
  };
  blur(xx, 3); blur(xy, 3); blur(yy, 3);
  const out = cx.createImageData(W, H);
  for (let i = 0; i < N; i++) {
    const s = .5 * Math.atan2(2 * xy[i], xx[i] - yy[i]) + Math.PI / 2;
    out.data[i * 4] = Math.round((Math.cos(2 * s) * .5 + .5) * 255);
    out.data[i * 4 + 1] = Math.round((Math.sin(2 * s) * .5 + .5) * 255);
    out.data[i * 4 + 3] = 255;
  }
  cx.putImageData(out, 0, 0);
  // stars: connected warm blobs, merged when they belong to one star (the moon comes in pieces)
  const seen = new Uint8Array(N), blobs = [];
  for (let i = 0; i < N; i++) {
    if (!star[i] || seen[i]) continue;
    const stack = [i]; seen[i] = 1; let n = 0, sx = 0, sy = 0, bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
    while (stack.length) {
      const j = stack.pop(); n++; sx += j % W; sy += (j / W) | 0;
      const x = j % W, y = (j / W) | 0;
      bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (star[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    if (n >= 5 && n / ((bx1 - bx0 + 1) * (by1 - by0 + 1)) > .3 && Math.max(bx1 - bx0, by1 - by0) < 3.2 * Math.min(bx1 - bx0, by1 - by0) + 3) blobs.push({ u: (sx / n + .5) / W, v: (sy / n + .5) / H, n });
  }
  blobs.sort((a, b) => b.n - a.n);
  const stars = [];
  for (const b of blobs) {
    const r = Math.sqrt(b.n / Math.PI) / W;
    const near = stars.find((m) => Math.hypot((m.u - b.u) * W, (m.v - b.v) * H) < Math.max(34, m.r * W * 3.2));
    if (near) { const k = near.n + b.n; near.u = (near.u * near.n + b.u * b.n) / k; near.v = (near.v * near.n + b.v * b.n) / k; near.n = k; near.r = Math.sqrt(k / Math.PI) / W; }
    else stars.push({ ...b, r });
  }
  return { map: cv, stars: stars.slice(0, MAXN) };
}

function start(im) {
  const cv = document.createElement('canvas');
  cv.className = 'gild';
  const gl = cv.getContext('webgl', { alpha: false, antialias: false });
  if (!gl) return;
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { console.warn('steel:', e); return; }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const n of ['uAlb', 'uMap', 'uCrop', 'uTex', 'uSize', 'uCandle', 'uEye', 'uRun', 'uBox', 'uTime', 'uNodes', 'uNN', 'uDebug']) U[n] = gl.getUniformLocation(prog, n);
  const tex = (unit, source) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
  };
  const { map, stars } = bake(im);
  tex(0, im);
  tex(1, map);
  gl.uniform1i(U.uAlb, 0);
  gl.uniform1i(U.uMap, 1);
  gl.uniform1f(U.uDebug, +(Q.get('steel') || 0));
  gl.uniform2f(U.uTex, 1 / im.naturalWidth, 1 / im.naturalHeight);
  host.appendChild(cv);

  let W = 0, H = 0;
  function resize() {
    W = host.offsetWidth; H = host.offsetHeight;
    const dpr = Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    gl.viewport(0, 0, cv.width, cv.height);
    const iw = im.naturalWidth, ih = im.naturalHeight;
    const s = Math.max(W / iw, H / ih);
    const zw = W / (iw * s), zh = H / (ih * s);
    const crop = [(1 - zw) * .5, (1 - zh) * POS_Y, zw, zh];
    gl.uniform4f(U.uCrop, ...crop);
    gl.uniform2f(U.uSize, W, H);
    const nd = new Float32Array(MAXN * 3);
    stars.forEach((st, i) => nd.set([(st.u - crop[0]) / crop[2] * W, (st.v - crop[1]) / crop[3] * H, Math.max(8, st.r / crop[2] * W * 1.6)], i * 3));
    gl.uniform3fv(U.uNodes, nd);
    gl.uniform1i(U.uNN, stars.length);
  }
  resize();
  addEventListener('resize', resize);

  const LX = Q.get('lx'), LY = Q.get('ly');
  let px = -1, py = -1, lastMove = -1e9, lx = 0, ly = 0, have = false;
  addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { px = e.clientX; py = e.clientY; lastMove = performance.now(); } }, { passive: true });
  const t0 = performance.now();
  const forced = Q.has('steel') || Q.has('machined');
  let onAt = host.classList.contains('is-on') || forced ? t0 : -1, visible = onAt > 0, running = true;
  const section = document.getElementById('hackathons');
  const metals = [...document.querySelectorAll('[data-metal]')];

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!visible) return;
    const t = (now - t0) / 1000;
    const r = host.getBoundingClientRect();
    const kx = W / r.width, ky = H / r.height;
    const sy = scrollY / Math.max(1, innerHeight);
    const tw = calm ? 4 : t;
    const wx = W * (.5 + .36 * Math.sin(tw * .12 + sy * .9)), wy = H * (.36 + .22 * Math.sin(tw * .18 + 1.1 + sy * .6));
    const idle = calm ? 1 : Math.min(1, Math.max(0, (now - lastMove - 2500) / 2500));
    const mx = (px - r.left) * kx, my = (py - r.top) * ky;
    const tx = px < 0 ? wx : wx * idle + mx * (1 - idle), ty = px < 0 ? wy : wy * idle + my * (1 - idle);
    if (!have) { lx = tx; ly = ty; have = true; }
    lx += (tx - lx) * .08; ly += (ty - ly) * .08;
    if (LX) { lx = W * +LX; ly = H * +LY; }
    // on arrival the light comes in from beyond the left edge and settles into its path
    const since = (now - onAt) / 1000;
    const arrive = calm || forced ? 1 : Math.min(1, Math.max(0, since / 2.6));
    const ea = 1 - Math.pow(1 - arrive, 3);
    const cx = -W * .25 + (lx + W * .25) * ea, cy = ly;
    gl.uniform3f(U.uCandle, cx, cy, Math.min(W, H) * .3);
    // the section's own metal type (the win marks) is lit by the same light, in viewport px
    window.__steelLight = { x: r.left + cx / kx, y: r.top + cy / ky, on: host.classList.contains('is-on') };
    for (const el of metals) {
      const b = el.getBoundingClientRect();
      if (b.bottom < 0 || b.top > innerHeight) continue;
      el.style.setProperty('--lx', `${(((r.left + cx / kx) - b.left) / b.width * 100).toFixed(1)}%`);
      el.style.setProperty('--ly', `${(((r.top + cy / ky) - b.top) / b.height * 100).toFixed(1)}%`);
    }
    gl.uniform3f(U.uEye, W * .5 + Math.sin(sy * 1.7) * W * .08, H * .5 - (sy % 4) * H * .1, Math.max(W, H) * 1.1);
    gl.uniform1f(U.uRun, Math.min(1, .25 + ea * .75));
    // the softbox travels with the reading of the section: top left to lower right
    let sp = .5;
    if (section) { const sr = section.getBoundingClientRect(); sp = Math.min(1, Math.max(0, (innerHeight - sr.top) / (sr.height + innerHeight))); }
    if (Q.has('box')) sp = +Q.get('box');
    gl.uniform2f(U.uBox, -.9 + sp * 1.8, -.55 + sp * 1.0);
    gl.uniform1f(U.uTime, calm ? 0 : t);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (!cv.classList.contains('on')) cv.classList.add('on');
  }
  requestAnimationFrame(frame);

  let offT = 0;
  const watch = () => {
    const on = host.classList.contains('is-on') && !document.hidden;
    clearTimeout(offT);
    if (on) { if (!visible) onAt = performance.now(); visible = true; }
    else offT = setTimeout(() => { visible = false; }, 2600);
  };
  new MutationObserver(watch).observe(host, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', watch);
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); running = false; cv.remove(); });
  // test hook: ?machined (or ?steel=1 for the masks) shows this painting from the start
  if (forced) document.querySelectorAll('.canvas .paint').forEach((p, k) => p.classList.toggle('is-on', k === 2));
}

if (host && SRC) {
  let went = false;
  const go = () => {
    if (went) return; went = true;
    const im = new Image(); im.src = SRC;
    im.decode().then(() => start(im)).catch((e) => console.warn('steel:', e));
  };
  if (Q.has('steel') || Q.has('machined')) go();
  else if (document.readyState === 'complete') setTimeout(go, 1500);
  else { const t = setTimeout(go, 5000); addEventListener('load', () => { clearTimeout(t); setTimeout(go, 1500); }, { once: true }); }
}
