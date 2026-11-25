/* The swallows, printed in gold.

   The engraved trio of swallows (media/swallows.mp4, cut to a sprite sheet of 63 frames,
   media/swallows-sheet.png: the ink as a grey mask) now flies live instead of sliding as one
   picture. Their wingbeat plays from the engraving itself, blended frame to frame so it never
   stutters, faster when they climb or are startled. The engraved lines are laid in gold leaf
   and lit by the same candle as the gilded Almond Blossom (gild.js): the line ridges catch
   it, single strokes flash and go out, and a soft shadow of the birds falls on the painting
   behind them and slides as they cross the light.

   At the opening they hawk over the blossom in long banking curves (a second trio, farther
   off, crosses now and then); on the Pacific crossing they fly with the pen of the route as
   before, from the .swallows element route.js moves. The pointer pushes them aside; a click
   startles them up. */
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow = matchMedia('(max-width: 959px)');
const anchor = document.querySelector('.swallows');
const paint0 = document.querySelector('.canvas .paint');
const SHEET = 'media/swallows-sheet.png';
const COLS = 8, FRAMES = 63, FPS = 12, ASPECT = 1.5;

const VERT = `
attribute vec2 aPos;
uniform vec2 uView;
uniform vec2 uCenter;     // css px
uniform vec2 uHalf;       // half width, half height, css px
uniform float uRot;
uniform vec2 uFlip;       // x: mirror, y: roll squash
varying vec2 vUv;
varying vec2 vPx;
void main() {
  vUv = aPos * .5 + .5; vUv.y = 1. - vUv.y;
  if (uFlip.x < 0.) vUv.x = 1. - vUv.x;
  vec2 p = aPos * uHalf * vec2(1., uFlip.y);
  float c = cos(uRot), s = sin(uRot);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  vPx = uCenter + vec2(p.x, -p.y);
  vec2 clip = vPx / uView * 2. - 1.;
  gl_Position = vec4(clip.x, -clip.y, 0., 1.);
}`;

const FRAG = `
precision mediump float;
uniform sampler2D uSheet;
uniform vec4 uF;          // frame a (col,row), frame b (col,row)
uniform float uMix;
uniform vec2 uCell;       // one frame in sheet uv
uniform vec2 uTexel;      // one sheet texel
uniform vec3 uCandle;     // css px, z out of the picture
uniform float uLit;       // the candle is over the gilded painting
uniform float uAlpha;
uniform float uShadow;    // 0: the bird, 1: its shadow
uniform float uBlur;      // shadow softness, in sheet texels
uniform float uTime;
uniform float uSeed;
varying vec2 vUv;
varying vec2 vPx;

float ink(vec2 uv) {
  vec2 a = (uF.xy + uv) * uCell, b = (uF.zw + uv) * uCell;
  return mix(texture2D(uSheet, a).r, texture2D(uSheet, b).r, uMix);
}
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

void main() {
  // stay inside the frame (the sheet's neighbours are other frames)
  vec2 m = uTexel / uCell * 1.5;
  vec2 uv = clamp(vUv, m, 1. - m);
  if (uShadow > 1.5) {
    // a fine keyline of ink round the gold, so the birds read apart from the gilded branches
    vec2 o = uTexel / uCell * uBlur;
    float k = ink(uv);
    k = max(k, max(max(ink(uv + vec2(o.x, 0.)), ink(uv - vec2(o.x, 0.))), max(ink(uv + vec2(0., o.y)), ink(uv - vec2(0., o.y)))));
    k = max(k, max(max(ink(uv + o * .7), ink(uv - o * .7)), max(ink(uv + vec2(o.x, -o.y) * .7), ink(uv + vec2(-o.x, o.y) * .7))));
    k = smoothstep(.08, .6, k) * uAlpha;
    gl_FragColor = vec4(vec3(.02, .05, .07) * k, k);
    return;
  }
  if (uShadow > .5) {
    vec2 o = uTexel / uCell * uBlur;
    float a = ink(uv) * .2;
    a += (ink(uv + vec2(o.x, 0.)) + ink(uv - vec2(o.x, 0.)) + ink(uv + vec2(0., o.y)) + ink(uv - vec2(0., o.y))) * .12;
    a += (ink(uv + o) + ink(uv - o) + ink(uv + vec2(o.x, -o.y)) + ink(uv + vec2(-o.x, o.y))) * .08;
    a = smoothstep(.05, .7, a) * uAlpha;
    gl_FragColor = vec4(vec3(.03, .06, .08) * a, a);
    return;
  }
  float a = ink(uv);
  if (a < .01) discard;
  // the engraved lines as ridges: their slope is the slope of the ink
  vec2 t = uTexel / uCell * 1.2;
  float dx = ink(uv + vec2(t.x, 0.)) - ink(uv - vec2(t.x, 0.));
  float dy = ink(uv + vec2(0., t.y)) - ink(uv - vec2(0., t.y));
  vec3 N = normalize(vec3(-dx * 1.6, dy * 1.6, 1.));
  vec3 P = vec3(vPx, 0.);
  vec3 L = normalize(uCandle - P);
  vec3 H = normalize(L + vec3(0., 0., 1.));
  float d = length(uCandle.xy - P.xy) / 900.;
  float fall = mix(.55, 1. / (1. + d * d * 4.), uLit);
  float diff = max(dot(N, L), 0.);
  float spec = pow(max(dot(N, H), 0.), 60.);
  // single strokes flash: a facet every few texels, set off true, catching as the birds move
  vec2 cell = floor(vUv / (uTexel / uCell) / 4.);
  float h = hash(cell + uSeed);
  float flash = pow(max(sin(uTime * (1.3 + h * 2.) + h * 60. + vPx.x * .01), 0.), 30.) * step(.8, h);
  // a paler, cooler gold than the tree's (champagne leaf), so the birds stand off the branches
  vec3 leaf = vec3(.86, .73, .46) * (.55 + .5 * diff) * (.72 + .4 * fall);
  vec3 tint = vec3(1., .92, .74);
  // the engraving keeps its tone: the densest cuts are deep bronze, the fine hatching bright leaf
  leaf = mix(leaf, vec3(.36, .27, .13) * (.8 + .4 * fall), smoothstep(.72, 1., a) * .55);
  vec3 c = leaf + tint * (spec * .8 * fall + flash * .35);
  // paper between the lines stays open, so the painting shows through the hatching
  float al = smoothstep(.03, .8, a) * uAlpha;
  gl_FragColor = vec4(min(c, vec3(1.)) * al, al);
}`;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

function start(img) {
  const cv = document.createElement('canvas');
  cv.className = 'flock';
  const gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
  if (!gl) return;
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { console.warn('swallows:', e); return; }
  document.body.append(cv);
  document.documentElement.classList.add('sw-live');
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const n of ['uView', 'uCenter', 'uHalf', 'uRot', 'uFlip', 'uSheet', 'uF', 'uMix', 'uCell', 'uTexel', 'uCandle', 'uLit', 'uAlpha', 'uShadow', 'uBlur', 'uTime', 'uSeed']) U[n] = gl.getUniformLocation(prog, n);
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, img);
  gl.uniform1i(U.uSheet, 0);
  const rows = Math.ceil(FRAMES / COLS);
  gl.uniform2f(U.uCell, 1 / COLS, 1 / rows);
  gl.uniform2f(U.uTexel, 1 / img.naturalWidth, 1 / img.naturalHeight);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  let W = 0, H = 0, dpr = 1;
  function resize() {
    W = innerWidth; H = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    gl.viewport(0, 0, cv.width, cv.height);
    gl.uniform2f(U.uView, W, H);
  }
  resize();
  addEventListener('resize', resize);

  /* a trio: one engraved group, flown as a body with a heading, a bank and a facing */
  const mk = (far) => ({
    far, x: -400, y: 200, vx: 300, vy: 0,
    goalX: 0, goalY: 0, goalT: 0,
    head: 0, bank: 0, flip: 1, flipK: 1, anim: rand(0, FRAMES), pace: 1,
    a: 0, seed: rand(0, 100), wait: far ? rand(5, 10) : 0, startle: 0, out: true, mode: 'hawk',
  });
  // one trio (a second, farther one crossed now and then: too much)
  const trios = [mk(false)];
  window.__trios = trios;
  // a test hook: ?birds=x,y[,facing] holds the near trio there
  const PIN = new URLSearchParams(location.search).get('birds')?.split(',').map(Number);

  let px = -9999, py = -9999;
  addEventListener('pointermove', (e) => { px = e.clientX; py = e.clientY; }, { passive: true });
  addEventListener('pointerdown', (e) => {
    for (const q of trios) {
      if (Math.hypot(q.x - e.clientX, q.y - e.clientY) < size(q) * .9) {
        q.startle = 1; q.vy -= 520; q.vx += (q.x > e.clientX ? 1 : -1) * 380;
      }
    }
  }, { passive: true });

  function mode() {
    const ao = anchor ? +(anchor.style.opacity || 0) : 0;
    if (ao > .03) return 'cross';
    const top = document.getElementById('hello');
    const end = top && top.offsetHeight ? top.offsetTop + top.offsetHeight - innerHeight * .6 : innerHeight * 3;
    if (paint0 && paint0.classList.contains('is-on') && scrollY < end) return 'hawk';
    return 'away';
  }
  // the trio's width on screen
  const size = (q) => {
    if (q.mode === 'cross') return anchor.offsetWidth * 1.1;
    const near = narrow.matches ? Math.min(W * .46, 200) : clamp(W * .16, 190, 270);
    return q.far ? near * .42 : near;
  };

  function enter(q) {
    // in from one side, a little way below the top
    const side = Math.random() < .5 ? -1 : 1;
    q.x = W / 2 + side * (W / 2 + size(q)); q.y = H * rand(.18, .5);
    q.vx = -side * 320; q.vy = rand(-40, 40);
    q.flip = q.vx < 0 ? -1 : 1; q.flipK = q.flip; q.head = 0;
    q.goalT = 0; q.a = 0; q.out = false;
  }
  function goal(q, m, t) {
    if (m === 'hawk') {
      if (q.far) {
        // the far trio only crosses: a long, slow pass and gone
        q.goalX = q.vx > 0 ? W + size(q) * 2 : -size(q) * 2; q.goalY = H * rand(.1, .35); q.goalT = t + 99;
      } else if ((q.loops = (q.loops || 0) + 1) > 2) {
        // one visit: after a couple of loops they leave, and come back only when the visitor does
        q.goalX = q.vx >= 0 ? W + size(q) * 2.5 : -size(q) * 2.5; q.goalY = H * rand(-.2, .1); q.goalT = t + 99; q.done = true;
      } else {
        // the trio loops through the sky over the tree, one side then the other
        const left = q.x > W / 2;
        q.goalX = W * (left ? rand(.08, .38) : rand(.62, .92));
        q.goalY = H * rand(.14, .62);
        q.goalT = t + rand(2.4, 4.2);
      }
    } else {
      q.goalX = q.vx >= 0 ? W + size(q) * 2.5 : -size(q) * 2.5; q.goalY = -H * .2; q.goalT = t + 99;
    }
  }
  const visibleQ = (q) => { const s = size(q); return q.x > -s && q.x < W + s && q.y > -s && q.y < H + s; };

  let last = performance.now(), running = true, sleeping = false, lastMode = '';
  function step(dt, t) {
    const m = mode();
    if (m !== lastMode) {
      for (const q of trios) q.goalT = 0;
      // back to the opening from below: the near trio flies in again
      if (m === 'hawk' && lastMode && trios[0].out) { trios[0].loops = 0; trios[0].done = false; enter(trios[0]); }
      lastMode = m;
    }
    for (const q of trios) {
      q.mode = m;
      if (q.far) {
        if (m !== 'hawk') { q.a = Math.max(0, q.a - dt * 1.5); if (!q.a) { q.wait = rand(3, 8); q.out = true; } continue; }
        if (q.wait > 0) { q.wait -= dt; if (q.wait <= 0) { enter(q); goal(q, m, t); } continue; }
        if (q.out && q.a > .5) { q.wait = rand(9, 18); q.a = 0; continue; }
      }
      let tx, ty, maxA, cruise = 0;
      if (m === 'cross') {
        const r = anchor.getBoundingClientRect();
        tx = r.left + r.width / 2 + Math.sin(t * .8 + q.seed) * 24;
        ty = r.top + r.height / 2 + Math.cos(t * 1.1 + q.seed) * 14;
        maxA = 3000;
      } else {
        if (t > q.goalT) goal(q, m, t);
        tx = q.goalX; ty = q.goalY; maxA = q.far ? 260 : 640; cruise = q.far ? 170 : 330;
      }
      // steer: a spring onto the pen while crossing, a constant-speed turn while hawking
      let ax, ay;
      const dx = tx - q.x, dy = ty - q.y, dist = Math.hypot(dx, dy) || 1;
      if (m === 'cross') {
        ax = dx * 26 - q.vx * 9; ay = dy * 26 - q.vy * 9;
      } else {
        const sp = cruise * (1 + q.startle * .9) * (m === 'away' ? 1.6 : 1);
        ax = (dx / dist * sp - q.vx) * 1.6; ay = (dy / dist * sp - q.vy) * 1.6;
      }
      // the pointer pushes them aside
      const pd = Math.hypot(q.x - px, q.y - py) || 1, pr = size(q) * .75;
      if (pd < pr && m !== 'cross') { ax += (q.x - px) / pd * (pr - pd) * 9; ay += (q.y - py) / pd * (pr - pd) * 9; }
      const lim = maxA * (1 + q.startle), al = Math.hypot(ax, ay);
      if (al > lim) { ax *= lim / al; ay *= lim / al; }
      q.vx += ax * dt; q.vy += ay * dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
      q.startle = Math.max(0, q.startle - dt * .7);
      const v = Math.hypot(q.vx, q.vy);

      // which way they face: they turn round (through edge-on) when they reverse
      if (v > 40) q.flip = q.vx < -25 ? -1 : q.vx > 25 ? 1 : q.flip;
      q.flipK += (q.flip - q.flipK) * Math.min(1, dt * 5);
      // nose up or down with the climb, a little; bank with how hard they turn
      const climb = Math.atan2(q.vy, Math.abs(q.vx) + 80);
      q.head += (clamp(climb, -.42, .42) * q.flip - q.head) * Math.min(1, dt * 4);
      const lat = (q.vx * ay - q.vy * ax) / Math.max(60, v);
      q.bank += (clamp(lat / 900, -1, 1) - q.bank) * Math.min(1, dt * 3);
      // wingbeat: the engraving's own, quicker climbing or startled, lazier in a dive
      q.pace = clamp(1 - q.vy / 600 + q.startle * .8, .55, 2);
      q.anim = (q.anim + dt * FPS * q.pace) % FRAMES;
      q.a = Math.min(1, q.a + dt * .8);
      q.out = !visibleQ(q);
    }
    return m;
  }

  function drawTrio(q, t, cand) {
    const w = size(q), h = w / ASPECT;
    const f0 = Math.floor(q.anim), f1 = (f0 + 1) % FRAMES, fr = q.anim - f0;
    gl.uniform4f(U.uF, f0 % COLS, Math.floor(f0 / COLS), f1 % COLS, Math.floor(f1 / COLS));
    gl.uniform1f(U.uMix, fr);
    gl.uniform1f(U.uSeed, q.seed);
    const turnW = Math.max(.06, Math.abs(q.flipK));        // edge-on as they turn round
    gl.uniform2f(U.uFlip, q.flipK < 0 ? -1 : 1, 1 - Math.abs(q.bank) * .22);
    gl.uniform1f(U.uRot, -q.head);
    const lit = cand && cand.on ? 1 : 0;
    const cx = cand ? cand.x : W * .3, cy = cand ? cand.y : -H * .2;
    gl.uniform3f(U.uCandle, cx, cy, 420);
    gl.uniform1f(U.uLit, lit);
    gl.uniform1f(U.uTime, t);
    const alpha = q.a * (q.mode === 'cross' ? clamp(+(anchor.style.opacity || 0), 0, 1) : 1) * (q.far ? .85 : 1);
    // the shadow: away from the candle, farther and softer the nearer the birds are to us
    const depth = q.far ? .5 : 1;
    const lx = q.x - cx, ly = q.y - cy, ll = Math.hypot(lx, ly) || 1;
    const off = (lit ? 26 : 14) * depth * (narrow.matches ? .6 : 1);
    gl.uniform1f(U.uShadow, 1);
    gl.uniform1f(U.uBlur, 4 + 5 * depth);
    gl.uniform1f(U.uAlpha, alpha * (lit ? .2 : .12));
    gl.uniform2f(U.uCenter, q.x + lx / ll * off, q.y + ly / ll * off + 10 * depth);
    gl.uniform2f(U.uHalf, w / 2 * turnW * .98, h / 2 * .98);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.uniform2f(U.uCenter, q.x, q.y);
    gl.uniform2f(U.uHalf, w / 2 * turnW, h / 2);
    gl.uniform1f(U.uShadow, 2);
    gl.uniform1f(U.uBlur, clamp(2.2 * 480 / w, 1.2, 4));
    gl.uniform1f(U.uAlpha, alpha * .55);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.uniform1f(U.uShadow, 0);
    gl.uniform1f(U.uAlpha, alpha);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    const m = step(dt, t);
    if (PIN) { const q = trios[0]; q.x = W * PIN[0]; q.y = H * PIN[1]; q.a = 1; q.out = false; q.vx = 300; q.vy = 0; q.flip = q.flipK = PIN[2] || 1; q.head = 0; q.bank = 0; }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const cand = window.__candle;
    for (const q of trios) if (q.a > 0 && !q.out && !(q.far && q.wait > 0)) drawTrio(q, t, cand);
    // rest when they have flown out and nothing calls them back
    if ((m === 'away' || (m === 'hawk' && trios[0].done)) && trios.every((q) => q.out || q.a === 0)) { sleeping = true; gl.clear(gl.COLOR_BUFFER_BIT); return; }
    requestAnimationFrame(frame);
  }
  const wake = () => {
    if (!sleeping) return;
    const m = mode();
    // asleep after their visit at the opening: only coming back up from below wakes them
    if (m === 'away' || (m === 'hawk' && lastMode === 'hawk')) return;
    sleeping = false;
    last = performance.now();
    requestAnimationFrame(frame);
  };
  addEventListener('scroll', wake, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else if (!running) { running = true; last = performance.now(); if (!sleeping) requestAnimationFrame(frame); }
  });
  enter(trios[0]);
  requestAnimationFrame(frame);
}

if (!calm && anchor) {
  let went = false;
  const go = () => {
    if (went) return; went = true;
    const img = new Image();
    img.src = SHEET;
    img.decode().then(() => start(img)).catch((e) => console.warn('swallows:', e));
  };
  // after the page and the painting, so the sheet never competes with the first paint
  if (document.readyState === 'complete') setTimeout(go, 300);
  else { const t = setTimeout(go, 2500); addEventListener('load', () => { clearTimeout(t); setTimeout(go, 300); }, { once: true }); }
}
