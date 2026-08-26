/*
 * hero.js — generative painting behind the CV, drawn with p5.brush.
 *
 * Uses the p5.brush *standalone* build (vendor/brush.js), which talks straight
 * to WebGL2 and needs no p5.js — ~29 KB over the wire instead of ~250 KB for
 * p5 + the p5 build. Nothing here touches the critical path: the library is
 * only fetched once the page has loaded and the main thread goes idle.
 *
 * The painting is drawn ONCE, spread over several animation frames so it never
 * blocks input, then the canvas sits there costing nothing. No render loop.
 *
 * Marks come from four passes: flat wash() corner tints, two watercolor
 * fill() blooms, field-driven flowLine() drift, deliberate beginStroke() /
 * move() / endStroke() spines, one mass() hand-filled tint, a hatch() panel,
 * and charcoal spline() accents.
 *
 * p5.brush by Alejandro Campos Uribe (MIT) — see vendor/p5.brush-LICENSE.md
 */
(function () {
  'use strict';

  var LIB = 'vendor/brush.js';
  var MOUNT = 'paint';

  // Read straight off the :root custom properties so the paint always matches
  // the page. Hard-coding these would let the two palettes drift apart the
  // first time style.css is retouched. Fallbacks cover the (unlikely) case of
  // the script running before the stylesheet resolves.
  function ink(name, fallback) {
    var v = '';
    try {
      v = getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
    } catch (e) { /* fall through */ }
    return v || fallback;
  }

  var PAPER = ink('--paper', '#f5efe1');
  var GOLD = ink('--gold', '#a87a2b');
  var GOLD_SOFT = ink('--gold-soft', '#c9a55b');
  var RULE = ink('--rule', '#d8cdb4');
  var INK_SOFT = ink('--ink-soft', '#6a5e51');
  var SHADE = ink('--paper-shade', '#ebe2cd');

  // Inner limit for paint, measured from centre. The reading column itself is
  // 360px either side, and .veil lays paper back over everything within 420px
  // (fading out by 560px). Starting the paint at 470 puts it where the veil is
  // already thinning, so the marks land in the part of the margin that is
  // actually visible instead of being half-erased.
  var COL_HALF = 470;

  var mount = document.getElementById(MOUNT);
  var brush = null;
  var canvas = null;
  var lastW = 0;
  var lastH = 0;
  // Bumped on every paint() so a resize can abandon a painting that is still
  // being laid down instead of the two fighting over one canvas.
  var generation = 0;

  /* ---------------------------------------------------------------- gating */

  // Bail out where the painting would be a bad trade: no WebGL2, metered
  // connection, or a device that will struggle with the fill passes. The CSS
  // gradient in .ambient stays as the fallback, so nothing looks broken.
  function allowed() {
    if (!mount) return false;

    try {
      if (!document.createElement('canvas').getContext('webgl2')) return false;
    } catch (e) {
      return false;
    }

    var conn = navigator.connection;
    if (conn && conn.saveData) return false;
    if (conn && /^(slow-)?2g$/.test(conn.effectiveType || '')) return false;
    if (navigator.deviceMemory && navigator.deviceMemory < 4) return false;
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) return false;

    return true;
  }

  var calm = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

  /* ------------------------------------------------------------ composition */

  // Returns an array of thunks. Each one draws a slice of the painting; the
  // scheduler decides how many to run per frame. Keeping them separate is what
  // lets a heavy watercolor pass yield to the browser instead of janking.
  function build(w, h) {
    var rnd = brush.random;
    var halfW = w / 2;
    var halfH = h / 2;
    var colHalf = Math.min(COL_HALF, halfW);
    var gutter = halfW - colHalf; // free margin either side of the text
    var steps = [];

    var roomy = gutter >= 150;
    var tight = gutter < 60;

    function reset() {
      brush.noStroke();
      brush.noFill();
      brush.noHatch();
      brush.noWash();
      brush.noField();
      brush.noClip();
      // Mass is sticky state like fill and hatch; leaving it on would have
      // every later circle() and rect() come out hand-filled.
      if (brush.noMass) brush.noMass();
    }

    // brush.clip() constrains stroke and hatch operations (not fills), so use
    // it as a hard guarantee that no mark lands on the reading column.
    var EDGE = 14;
    function clipTo(side) {
      if (tight) {
        // No side margins at all: confine marks to bands off the top and
        // bottom of the viewport, clear of the text entirely.
        brush.clip(
          side < 0
            ? [-halfW, -halfH, halfW, -halfH + h * 0.13]
            : [-halfW, halfH - h * 0.13, halfW, halfH]
        );
      } else if (side < 0) {
        brush.clip([-halfW, -halfH, -(colHalf + EDGE), halfH]);
      } else {
        brush.clip([colHalf + EDGE, -halfH, halfW, halfH]);
      }
    }

    /* -- corner washes ---------------------------------------------------
       Flat `wash()` rather than `fill()`: no bleed simulation, so these are
       cheap, and they do the job of tinting the paper. Alpha stays under ~10%
       so body-text contrast is untouched. */
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (corner) {
      steps.push(function () {
        reset();
        var blobs = 2 + Math.floor(rnd() * 2);
        for (var i = 0; i < blobs; i++) {
          // RULE only — the saturated golds are what pushed link contrast down
          // when a wash crept under the text.
          brush.wash(RULE, tight ? 8 + rnd() * 6 : 18 + rnd() * 14);
          var r = Math.min(halfW, halfH) * (0.16 + rnd() * 0.14);
          // Centre sits OUTSIDE the canvas, so only the soft shoulder of the
          // circle is visible and it reads as a corner tint, not a disc.
          brush.circle(
            corner[0] * (halfW + r * (tight ? 0.75 : 0.45)) + (rnd() - 0.5) * 50,
            corner[1] * (halfH + r * (tight ? 0.75 : 0.45)) + (rnd() - 0.5) * 50,
            r,
            0.7
          );
        }
        brush.noWash();
      });
    });

    /* -- watercolor blooms ----------------------------------------------
       The real thing: bleed + texture. Genuinely expensive, so at most two,
       and only where there is margin to put them in. */
    if (!tight) {
      [-1, 1].forEach(function (side, i) {
        steps.push(function () {
          reset();
          // The third argument is the wash direction. Omitting it makes
          // p5.brush pick a RANDOM direction, which on some seeds sent the
          // bleed inward across the reading column. Aim it at the nearest
          // page edge so it always spreads away from the text.
          brush.fillBleed(0.08, 'out', side < 0 ? 180 : 0);
          brush.fillTexture(0.45, 0.34, false);
          brush.fill(i ? GOLD : GOLD_SOFT, 30 + rnd() * 14);
          // Nominal inner edge sits ~0.47 * gutter clear of the text column;
          // watercolor bleed spreads well past the radius it is given, and
          // that headroom is what keeps it off the reading area.
          brush.circle(
            side * (colHalf + gutter * 0.75),
            (i ? -1 : 1) * halfH * (0.24 + rnd() * 0.3),
            Math.max(44, gutter * 0.28),
            0.9
          );
        });
      });
    }

    /* -- flow-field strokes ---------------------------------------------
       p5.brush's signature move: strokes bent by a vector field. "seabed"
       gives long organic drifts. These run down the gutters, so on a wide
       screen you get painted margins framing the CV. */
    var field = ['seabed', 'waves', 'curved'][Math.floor(rnd() * 3)];
    var lanes = tight ? 5 : roomy ? 18 : 11;
    var perStep = 4;

    for (var start = 0; start < lanes; start += perStep) {
      (function (from) {
        steps.push(function () {
          reset();
          brush.field(field);
          // pastel and crayon lay down broad, soft, low-opacity marks; cpencil
          // is kept for the occasional finer line so the margins have detail
          // as well as mass.
          var tip = rnd() > 0.55 ? (rnd() > 0.5 ? 'pastel' : 'crayon') : 'cpencil';
          brush.set(tip, rnd() > 0.5 ? GOLD_SOFT : RULE, 0.8 + rnd() * 0.9);

          for (var i = from; i < Math.min(from + perStep, lanes); i++) {
            var side = i % 2 ? 1 : -1;
            var x, len;

            if (tight) {
              // No margin to work with — hug the very top and bottom edges.
              side = i < lanes / 2 ? -1 : 1;
              clipTo(side);
              x = (rnd() - 0.5) * w * 0.9;
              var y = side * halfH * (0.88 + rnd() * 0.1);
              len = h * 0.09;
              brush.flowLine(x, y, len, side < 0 ? 75 : -75);
              continue;
            }

            clipTo(side);
            x = side * (colHalf + 24 + rnd() * Math.max(10, gutter - 44));
            len = h * (0.18 + rnd() * 0.3);
            brush.flowLine(
              x,
              -halfH + rnd() * h,
              len,
              (rnd() > 0.5 ? 84 : -96) + (rnd() - 0.5) * 22
            );
          }
          brush.noField();
          brush.noClip();
        });
      })(start);
    }

    /* -- hatch panel -----------------------------------------------------
       One block of hatching low in a gutter, echoing the ════ rules in the
       CV itself. */
    if (roomy) {
      steps.push(function () {
        reset();
        var side = rnd() > 0.5 ? 1 : -1;
        clipTo(side);
        // hatchStyle() gives the hatch its own brush, and noStroke() keeps
        // brush.rect() from drawing a hard outline around the panel.
        brush.noStroke();
        brush.hatchStyle('2H', RULE, 0.34);
        brush.hatch(16 + rnd() * 8, 28 + rnd() * 24, {
          rand: 0.22,
          continuous: false,
          gradient: 0.45
        });
        brush.rect(
          side * (colHalf + gutter * 0.5),
          halfH * (0.3 + rnd() * 0.3),
          Math.min(gutter * 0.7, 170),
          Math.min(gutter * 0.9, 230),
          'center'
        );
        brush.noHatch();
        brush.noClip();
      });
    }

    /* -- plotted strokes -------------------------------------------------
       beginStroke/move/endStroke is the one place in p5.brush where a mark is
       *drawn* rather than sampled from a vector field: every segment is an
       explicit angle, length and pressure. flowLine gives you drift; this
       gives you intent. A couple of long calligraphic spines down each gutter
       is what the margins were missing.

       Angles here are ABSOLUTE, not turns relative to the previous segment
       (measured: move(-90, 80) four times from the origin draws a dead-straight
       299px vertical line, not a zigzag). -90 is straight down, so the spines
       start high and run down the gutter, and the per-segment jitter is a
       deviation from vertical rather than something that accumulates. */
    if (!tight) {
      [-1, 1].forEach(function (side) {
        steps.push(function () {
          reset();
          clipTo(side);
          brush.set(rnd() > 0.5 ? '2B' : 'pen', GOLD, 0.8 + rnd() * 0.45);

          var runs = roomy ? 2 : 1;
          for (var r = 0; r < runs; r++) {
            brush.beginStroke(
              'curve',
              side * (colHalf + 28 + rnd() * Math.max(12, gutter - 58)),
              -halfH * (0.2 + rnd() * 0.55)
            );

            var segs = 3 + Math.floor(rnd() * 3);
            for (var i = 0; i < segs; i++) {
              // Near-vertical, wandering a little. Pressure swells then eases,
              // which is what gives the stroke a drawn taper instead of a
              // uniform line.
              brush.move(
                -90 + (rnd() - 0.5) * 32,
                h * (0.06 + rnd() * 0.06),
                0.3 + rnd() * 0.62
              );
            }
            brush.endStroke(-90 + (rnd() - 0.5) * 24, 0.22 + rnd() * 0.28);
          }
          brush.noClip();
        });
      });
    }

    /* -- mass fill -------------------------------------------------------
       mass() hand-fills a shape by laying overlapping brush strokes instead of
       simulating wet bleed. That makes it both cheaper than fill() and, more
       usefully here, a STROKE operation — so unlike fill() it is bound by
       clip(). It is the one fill in this composition that cannot wander onto
       the reading column, which is why it gets to sit closest to the text.
       Geometry keeps it in the gutter regardless, so the guarantee is belt and
       braces rather than load-bearing. */
    if (roomy) {
      steps.push(function () {
        reset();
        var side = rnd() > 0.5 ? 1 : -1;
        clipTo(side);
        brush.noStroke();
        // 'pastel' over 'crayon' and a low strength on purpose. At full
        // strength mass() lays down enough overlapping strokes to read as a
        // solid gold scribble, which fights the CV instead of framing it —
        // gradient near 1 lets it fall away into the paper.
        brush.mass('pastel', rnd() > 0.72 ? GOLD_SOFT : RULE, {
          precision: 0.34 + rnd() * 0.16,  // lower = looser, fewer strokes
          strength: 0.16 + rnd() * 0.12,   // a tint, not a block
          gradient: 0.72,
          outline: false
        });
        brush.circle(
          side * (colHalf + gutter * 0.52),
          halfH * (-0.5 + rnd() * 0.3),
          Math.min(gutter * 0.26, 78),
          0.85
        );
        brush.noMass();
        brush.noClip();
      });
    }

    /* -- charcoal accents ------------------------------------------------
       A handful of dry marks so the margins are not purely soft washes. */
    if (!tight) {
      steps.push(function () {
        reset();
        brush.set('charcoal', INK_SOFT, 0.3);
        var marks = roomy ? 5 : 3;
        for (var i = 0; i < marks; i++) {
          var side = rnd() > 0.5 ? 1 : -1;
          clipTo(side);
          var x = side * (colHalf + 30 + rnd() * Math.max(10, gutter - 50));
          var y = (rnd() - 0.5) * h * 0.8;
          var pts = [];
          for (var p = 0; p < 4; p++) {
            pts.push([
              x + (rnd() - 0.5) * 40,
              y + p * (14 + rnd() * 26),
              0.3 + rnd() * 0.5
            ]);
          }
          brush.spline(pts, 0.55);
        }
        brush.noClip();
      });
    }

    // A last faint wash tying the whole thing back to the paper colour. Pinned
    // to a corner rather than the middle — a bloom behind the reading column
    // reads as a smudge on the page, not as paint.
    steps.push(function () {
      reset();
      brush.wash(SHADE, 14);
      var r = Math.min(halfW, halfH) * 0.36;
      brush.circle(
        (rnd() > 0.5 ? 1 : -1) * (halfW + r * 0.35),
        (rnd() > 0.5 ? 1 : -1) * (halfH + r * 0.35),
        r,
        0.6
      );
      brush.noWash();
    });

    return steps;
  }

  /* -------------------------------------------------------------- scheduling */

  function paint() {
    var mine = ++generation;

    var w = Math.max(320, window.innerWidth);
    var h = Math.max(320, window.innerHeight);
    lastW = w;
    lastH = h;

    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);

    // Density 1 on purpose. These are soft washes, so the extra fill-rate of a
    // retina-resolution buffer buys nothing visible and costs a lot of GPU.
    canvas = brush.createCanvas(w, h, {
      pixelDensity: 1,
      parent: mount,
      id: 'paint-canvas'
    });
    canvas.setAttribute('aria-hidden', 'true');

    brush.angleMode(brush.DEGREES);
    brush.seed(Math.floor(Math.random() * 1e9));
    brush.noiseSeed(Math.floor(Math.random() * 1e9));
    brush.scaleBrushes(Math.max(1.1, Math.min(w, h) / 640));

    // Clear to the paper colour rather than leaving the canvas transparent.
    // p5.brush's wash/bleed blending assumes an opaque substrate — over a
    // transparent buffer the same calls come out pale and show hard shape
    // edges. Note the library's own no-argument clear() cannot be used here:
    // it writes RGB white at alpha 0, which is invalid premultiplied alpha and
    // resolves to opaque white in Chrome. The colour is --paper, so the canvas
    // is seamless against the rest of the page.
    brush.clear(PAPER);

    var steps = build(w, h);
    var i = 0;

    // Reduced motion gets the painting without the progressive reveal: it is
    // already there by the time the fade-in would have started.
    if (calm.matches) mount.classList.add('is-instant');

    function chunk() {
      if (mine !== generation) return; // a newer paint took over

      var budget = calm.matches ? 4 : 2; // steps per frame
      var end = Math.min(i + budget, steps.length);

      for (; i < end; i++) {
        try {
          steps[i]();
        } catch (e) {
          // One bad step should not cost the whole painting.
        }
      }

      try {
        brush.render(); // flush this slice to the canvas
      } catch (e) {
        return; // compositor is unhappy; leave what is already down
      }

      if (i < steps.length) {
        requestAnimationFrame(chunk);
      } else {
        mount.classList.add('is-painted');
      }
    }

    requestAnimationFrame(chunk);
  }

  /* ------------------------------------------------------------------ resize */

  var resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var w = Math.max(320, window.innerWidth);
      var h = Math.max(320, window.innerHeight);
      // Width changes mean a genuinely different layout. Height alone is
      // usually just a mobile URL bar sliding away — not worth a repaint.
      if (Math.abs(w - lastW) < 80 && Math.abs(h - lastH) < 260) return;
      paint();
    }, 320);
  }

  /* ------------------------------------------------------------------- boot */

  function boot() {
    if (!allowed()) return;

    var s = document.createElement('script');
    s.src = LIB;
    s.async = true;
    s.onload = function () {
      brush = window.brush;
      if (!brush || typeof brush.createCanvas !== 'function') return;
      paint();
      window.addEventListener('resize', onResize, { passive: true });
    };
    // On failure the CSS .ambient gradient is simply what the visitor sees.
    document.head.appendChild(s);
  }

  // Strictly after load, and then only when the main thread has nothing better
  // to do, so the library never competes with text, fonts, or the portrait.
  function schedule() {
    if (window.requestIdleCallback) {
      requestIdleCallback(boot, { timeout: 2500 });
    } else {
      setTimeout(boot, 600);
    }
  }

  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
})();
