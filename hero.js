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
 * Marks come from several passes: flat wash() corner tints, two watercolor
 * fill() blooms, field-driven flowLine() drift, deliberate beginStroke() /
 * move() / endStroke() spines, one mass() hand-filled tint, a hatch() panel,
 * charcoal spline() accents, and a generative garden — rose blooms, sage
 * sprigs and gold sparkles, in the spirit of an illuminated manuscript. No two
 * page loads grow the same ones. On a phone, where there are no gutters, the
 * garden spreads across the whole page behind the CV instead of being skipped.
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

  // Deviation from paper, in 0-255, at which a mark counts as fully opaque.
  // Below it a mark keeps proportional translucency — see lift().
  var LIFT_T = 46;

  function rgbOf(hex) {
    var h = String(hex).trim().replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  var PAPER_RGB = rgbOf(PAPER);
  var GOLD = ink('--gold', '#a87a2b');
  var GOLD_SOFT = ink('--gold-soft', '#c9a55b');
  var RULE = ink('--rule', '#d8cdb4');
  var INK_SOFT = ink('--ink-soft', '#6a5e51');
  var SHADE = ink('--paper-shade', '#ebe2cd');
  var ROSE = ink('--rose', '#c2707a');
  var BLUSH = ink('--blush', '#e2b0b3');
  var SAGE = ink('--sage', '#869176');
  var SAGE_SOFT = ink('--sage-soft', '#adb69b');

  // Inner limit for paint, measured from centre. The reading column is 360px
  // either side, so 400 leaves a 40px cordon around the text.
  //
  // This is now the ONLY thing keeping paint off the words: #paint sits in
  // front of the text, and the paper veil that used to be laid back over the
  // column has been retired — in front of the painting it would have done
  // nothing anyway. Legibility is geometric from here on.
  var COL_HALF = 400;

  // Below this much free margin there is nowhere beside the text to paint, and
  // the composition switches to a full-bleed wallpaper behind the page. Kept
  // here rather than duplicated as a CSS breakpoint: hero.js is the only thing
  // that knows which composition it actually drew, so it tells the stylesheet
  // by way of the .is-bleed class. Two independent thresholds would drift, and
  // the gap between them would put petals on top of the words.
  var BLEED_BELOW = 60;

  var mount = document.getElementById(MOUNT);
  var brush = null;
  var canvas = null;
  var lastW = 0;
  var lastH = 0;
  // Bumped on every paint() so a resize can abandon a painting that is still
  // being laid down instead of the two fighting over one canvas.
  var generation = 0;
  // Which composition the current painting is: full-bleed wallpaper behind the
  // text, or a margin garden that may come to the front.
  var bleed = false;

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
    var tight = gutter < BLEED_BELOW;

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
          // fill() is the one operation clip() cannot hold, and with the
          // painting in front of the text an escaped bleed would land on the
          // words rather than under them. Held out in the far half of the
          // gutter, with the spread aimed at the page edge.
          brush.circle(
            side * (colHalf + gutter * 0.82),
            (i ? -1 : 1) * halfH * (0.24 + rnd() * 0.3),
            Math.max(40, gutter * 0.22),
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
    var lanes = tight ? 4 : roomy ? 8 : 6;
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

    /* -- the garden: flowers, sprigs and sparkles -------------------------
       Illuminated manuscripts put small painted plants in the margins beside
       the text. That is what this is, except no two page loads grow the same
       ones: stems that curve as they climb, sage leaves alternating up them,
       and a rose bloom opening at the top.

       Geometry note — measured, not guessed: for move(a, len) the step is
       (cos a * len, -sin a * len). So angle 0 goes right and +90 goes UP, which
       is what lets a stem grow off its base instead of hanging from it.

       Stems, leaves and petals are all flat wash() shapes or stroke work, so
       nothing here bleeds the way fill() does and it can safely be planted
       close to the reading column where it is actually visible. */
    var DEG = Math.PI / 180;

    // Fills ignore clip(), and the painting now sits IN FRONT of the text, so
    // the cordon has to be enforced per shape rather than trusted to placement
    // arithmetic. `reach` is how far the shape can extend back toward centre.
    //
    // Normally a no-op — everything is planted well clear. It exists because
    // getting this wrong once already put a bloom on the footnote, and a
    // slightly displaced leaf is a far better failure than a petal on a word.
    function cordonX(x, reach) {
      if (tight) return x;                 // full-bleed composition, by design
      var s = x < 0 ? -1 : 1;
      var min = colHalf + reach;
      return Math.abs(x) < min ? s * min : x;
    }

    // One almond, pointing along `angle` from (x, y). Serves as both leaf and
    // petal — the only difference is how fat and what colour.
    //
    // Chained pen strokes cannot make either: they make grass. A closed polygon
    // can. Verified against this build — beginShape/vertex/endShape under
    // wash() fills a custom outline, and push/translate/rotate places it.
    //
    // rotate(-angle), not rotate(angle): move(a, len) steps by (cos a, -sin a)
    // while rotate(t) maps (1,0) to (cos t, sin t). Negating is what makes the
    // shape lie along the stem instead of mirrored across it.
    function almond(x, y, angle, L, W, colour, alpha) {
      brush.push();
      brush.translate(cordonX(x, L), y);
      brush.rotate(-angle);
      brush.noStroke();
      brush.wash(colour, alpha);
      // Traced parametrically: sin(pi*t) gives a shape pointed at both ends,
      // and enough steps that the edge reads as a curve, not a hexagon.
      var STEPS = 9;
      brush.beginShape();
      for (var i = 0; i <= STEPS; i++) {
        var t = i / STEPS;
        brush.vertex(L * t, -W * Math.pow(Math.sin(Math.PI * t), 0.75));
      }
      for (var j = STEPS - 1; j > 0; j--) {
        var u = j / STEPS;
        brush.vertex(L * u, W * Math.pow(Math.sin(Math.PI * u), 0.75));
      }
      brush.endShape(true);
      brush.noWash();
      brush.pop();
    }

    // A bloom: two offset rings of petals over a pair of sage leaves, with a
    // gold eye. Rings rather than one, because a single ring of petals reads as
    // a cog; overlapping two at different radii is what makes it a flower.
    function bloomAt(cx, cy, r) {
      var spin = rnd() * 360;
      var warm = rnd() > 0.45;
      // Petals reach ~1.05r in every direction from the centre.
      cx = cordonX(cx, r * 1.1);

      for (var s = -1; s <= 1; s += 2) {
        almond(cx, cy, spin + 90 + s * 118, r * 1.05, r * 0.3, SAGE, 118 + rnd() * 40);
      }

      var outer = 7 + Math.floor(rnd() * 2);
      for (var i = 0; i < outer; i++) {
        almond(cx, cy, spin + (i * 360) / outer, r, r * 0.44,
               warm ? BLUSH : ROSE, 150 + rnd() * 50);
      }

      var inner = outer - 1;
      for (var k = 0; k < inner; k++) {
        almond(cx, cy, spin + 26 + (k * 360) / inner, r * 0.62, r * 0.3,
               warm ? ROSE : BLUSH, 150 + rnd() * 50);
      }

      brush.noStroke();
      brush.wash(GOLD, 190);
      brush.circle(cx, cy, r * 0.24, 0.9);
      brush.noWash();
    }

    function sprig(baseX, baseY, height, lean, crown) {
      var nodes = [];
      var segs = 5;
      var segLen = height / segs;
      var x = baseX;
      var y = baseY;
      var ang = 90 + lean * (4 + rnd() * 7);   // +90 = straight up

      // 'pen' rather than '2B': the pencil brushes scatter their grain, which
      // at this scale turns a stem into a smudge.
      brush.set('pen', SAGE, 1.2 + rnd() * 0.45);
      brush.beginStroke('curve', x, y);
      for (var i = 0; i < segs; i++) {
        // A steady drift one way is what makes a stem look grown, not jointed.
        var a = ang + lean * i * (5 + rnd() * 5) + (rnd() - 0.5) * 6;
        brush.move(a, segLen, 0.42 + rnd() * 0.26);
        x += Math.cos(a * DEG) * segLen;
        y += -Math.sin(a * DEG) * segLen;
        nodes.push([x, y, a]);
      }
      brush.endStroke(ang + lean * 20, 0.14);

      // One leaf per node, alternating sides. Leaves on both sides of every
      // node crowd into a tangle at this size; alternating keeps it open.
      for (var n = 0; n < nodes.length - 1; n++) {
        if (rnd() > 0.9) continue;              // an occasional gap
        var sgn = (n % 2 === 0) ? 1 : -1;
        var L = segLen * (0.95 - n * 0.1) * (0.85 + rnd() * 0.3);
        almond(
          nodes[n][0], nodes[n][1],
          nodes[n][2] + sgn * (42 + rnd() * 16),
          L, L * (0.3 + rnd() * 0.1),
          rnd() > 0.35 ? SAGE : SAGE_SOFT,
          120 + rnd() * 55
        );
      }

      var tip = nodes[nodes.length - 1];
      if (crown) {
        bloomAt(tip[0], tip[1], segLen * (0.62 + rnd() * 0.3));
      } else {
        brush.noStroke();
        brush.wash(rnd() > 0.5 ? ROSE : GOLD, 150 + rnd() * 40);
        brush.circle(tip[0], tip[1], 3 + rnd() * 2.4, 0.9);
        brush.noWash();
      }
    }

    // Four-point sparkle: one long arm and one short, crossed. The asymmetry
    // is what stops it reading as a plus sign.
    function sparkle(x, y, r) {
      brush.set('pen', GOLD, 0.85 + rnd() * 0.4);
      brush.beginStroke('curve', x, y - r);
      brush.move(-90, r * 2, 0.5);
      brush.endStroke(-90, 0.1);
      var arm = r * 0.5;
      brush.beginStroke('curve', x - arm, y);
      brush.move(0, arm * 2, 0.42);
      brush.endStroke(0, 0.1);
    }

    if (tight) {
      /* Phone. There are no gutters, so there is nowhere beside the text to
         plant anything — which is exactly why this used to be skipped and the
         phone got an almost blank page. Instead the garden grows across the
         whole viewport and sits behind the CV, with style.css holding #paint
         back to half opacity at this width so it never competes with the words.
         Clusters are pushed past the edges so they read as a page border rather
         than as objects dropped behind the text. */
      steps.push(function () {
        reset();
        var edgeX = halfW * 0.92;
        var spots = [
          [-edgeX, -halfH * 0.74],
          [edgeX, -halfH * 0.34],
          [-edgeX * 0.86, halfH * 0.28],
          [edgeX * 0.94, halfH * 0.78]
        ];
        for (var i = 0; i < spots.length; i++) {
          bloomAt(spots[i][0], spots[i][1], 20 + rnd() * 14);
        }
      });

      steps.push(function () {
        reset();
        for (var i = 0; i < 3; i++) {
          var side = i % 2 ? 1 : -1;
          sprig(
            side * halfW * (0.84 + rnd() * 0.12),
            -halfH * 0.5 + rnd() * h * 0.85,
            h * (0.1 + rnd() * 0.06),
            side,
            rnd() > 0.45
          );
        }
      });

      steps.push(function () {
        reset();
        for (var i = 0; i < 12; i++) {
          // Outer thirds only. Scattered across the full width these landed on
          // top of the words — faint, but decoration has no business there.
          var side = rnd() > 0.5 ? 1 : -1;
          sparkle(
            side * halfW * (0.66 + rnd() * 0.3),
            (rnd() - 0.5) * h * 0.94,
            3 + rnd() * 5
          );
        }
      });
    } else {
      [-1, 1].forEach(function (side) {
        steps.push(function () {
          reset();
          clipTo(side);
          var count = roomy ? 2 : 1;
          for (var i = 0; i < count; i++) {
            // Planted close in, just outside the text cordon — pushing these
            // out toward the screen edge is what made them invisible before.
            //
            // Two things keep the plant off the words, and both matter now the
            // painting is in front of them. The lean is forced OUTWARD, so a
            // stem can only ever curve away from the column; left free it
            // wandered up to ~100px inward over five segments and carried its
            // bloom onto the text. And the base is set back far enough for the
            // widest inward-pointing leaf plus the crowning bloom's petals,
            // since both are wash() fills and clip() cannot hold them.
            sprig(
              side * (colHalf + 58 + rnd() * Math.max(16, gutter * 0.34)),
              halfH * (0.16 + rnd() * 0.62),
              h * (0.15 + rnd() * 0.09),
              // -side, not side. ang = 90 + lean*(4..11) and the step is
              // (cos a, -sin a), so a lean that LOWERS the angle below 90
              // drives x positive. On the left gutter positive x is inward, so
              // `side` curved stems straight at the column — which is how a
              // bloom ended up on the footnote.
              -side,
              true                              // every margin stem flowers
            );
          }
          brush.noClip();
        });

        // A couple of loose blooms with no stem, tucked further out.
        steps.push(function () {
          reset();
          clipTo(side);
          var n = roomy ? 2 : 1;
          for (var i = 0; i < n; i++) {
            var r = 15 + rnd() * 13;
            // Petals reach ~1.05r, so the centre has to clear the cordon by
            // more than the radius or a petal tip lands in the margin of the
            // text block.
            var reach = colHalf + r * 1.2;
            bloomAt(
              side * (reach + rnd() * Math.max(20, gutter * 0.66)),
              (rnd() - 0.5) * h * 0.82,
              r
            );
          }
          brush.noClip();
        });
      });

      steps.push(function () {
        reset();
        var marks = roomy ? 11 : 6;
        for (var i = 0; i < marks; i++) {
          var side = rnd() > 0.5 ? 1 : -1;
          clipTo(side);
          sparkle(
            side * (colHalf + 16 + rnd() * Math.max(14, gutter - 34)),
            (rnd() - 0.5) * h * 0.88,
            3.4 + rnd() * 5
          );
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

  /* --------------------------------------------------------------- alpha lift */

  // Turns the finished painting into something that can sit IN FRONT of the
  // text.
  //
  // p5.brush has to paint on an opaque substrate: measured on this build, a
  // transparent buffer renders every pixel either fully opaque or fully clear
  // — no antialiasing, no soft wash edges at all. So the painting is still laid
  // down on opaque paper, and the alpha channel is recovered afterwards by
  // comparing each pixel against the paper colour it was painted over.
  //
  // The decomposition is exact rather than approximate. For a pixel C over
  // paper P, take m as the largest per-channel deviation, a = min(1, m/LIFT_T),
  // and S = P + (C - P)/a. Compositing S at alpha a back over P gives
  // a·S + (1-a)·P = P + (C - P) = C, so the page looks identical where paper is
  // what lies behind. Where TEXT lies behind instead, strong marks cover it and
  // faint washes tint it — which is the entire point.
  //
  // Runs once, after the last stroke, and replaces the WebGL canvas with a 2D
  // one. Returns false if anything refuses, in which case the caller leaves the
  // painting where it has always been: behind the words, where an opaque canvas
  // is harmless.
  // The alpha pass itself. Takes a canvas painted over opaque paper and returns
  // a new 2D canvas carrying the same image with a recovered alpha channel, or
  // null if the pixels cannot be read.
  function liftPixels(src) {
    var cw = src.width;
    var ch = src.height;
    var flat, g, img;

    try {
      flat = document.createElement('canvas');
      flat.width = cw;
      flat.height = ch;
      g = flat.getContext('2d', { willReadFrequently: true });
      if (!g) return null;
      g.drawImage(src, 0, 0);
      img = g.getImageData(0, 0, cw, ch);
    } catch (e) {
      return null; // tainted or oversized buffer
    }

    var d = img.data;
    var pr = PAPER_RGB[0];
    var pg = PAPER_RGB[1];
    var pb = PAPER_RGB[2];

    for (var i = 0; i < d.length; i += 4) {
      var dr = d[i] - pr;
      var dg = d[i + 1] - pg;
      var db = d[i + 2] - pb;

      var m = dr < 0 ? -dr : dr;
      var t = dg < 0 ? -dg : dg;
      if (t > m) m = t;
      t = db < 0 ? -db : db;
      if (t > m) m = t;

      if (m === 0) {
        d[i + 3] = 0;              // untouched paper becomes nothing
        continue;
      }

      var a = m / LIFT_T;
      if (a > 1) a = 1;

      // Uint8ClampedArray rounds and clamps these for us.
      d[i] = pr + dr / a;
      d[i + 1] = pg + dg / a;
      d[i + 2] = pb + db / a;
      d[i + 3] = a * 255;
    }

    try {
      g.putImageData(img, 0, 0);
    } catch (e) {
      return null;
    }

    return flat;
  }

  function lift() {
    if (!canvas) return false;
    var flat = liftPixels(canvas);
    if (!flat) return false;

    flat.setAttribute('aria-hidden', 'true');
    flat.id = 'paint-canvas';
    if (canvas.parentNode) canvas.parentNode.replaceChild(flat, canvas);
    else mount.appendChild(flat);
    canvas = flat;
    return true;
  }

  /* ------------------------------------------------------------ bloom sprite */

  // The flower the "In Practice" prose flows around is redrawn every frame,
  // because it moves — and p5.brush is nowhere near fast enough to repaint
  // watercolour petals sixty times a second. Its own documentation says the
  // library suits high-resolution artwork rather than real-time work. That is
  // why the flower was a plain vector shape, and it is the honest constraint.
  //
  // It does not have to be repainted, though. Painted ONCE into a sprite and
  // then blitted, real bleed and brush texture cost nothing per frame.
  //
  // Everything touching p5.brush also stays in this one file, which settles the
  // other objection: two modules driving the library's module-level state would
  // contend over it. pretext.js never sees brush at all, only a finished
  // bitmap. Painted after lift() has already swapped the page's painting for a
  // plain 2D canvas, so creating this extra brush canvas cannot disturb it.
  var sprite = null;

  function spriteAlmond(angle, L, W, colour, alpha, bleed) {
    brush.push();
    brush.rotate(-angle);
    brush.noStroke();
    if (bleed) {
      // Real watercolour: the petals bleed into each other, which is the whole
      // reason for going through the library instead of filling a bezier.
      //
      // The bleed is AIMED along the petal. Left to pick its own direction —
      // fillBleed(amount, 'out') with no angle — every petal wandered off
      // somewhere different and the bloom came out lopsided instead of radial.
      brush.fillBleed(bleed, 'out', angle);
      brush.fillTexture(0.55, 0.34, false);
      brush.fill(colour, alpha);
    } else {
      brush.wash(colour, alpha);
    }
    var STEPS = 9;
    brush.beginShape();
    for (var i = 0; i <= STEPS; i++) {
      var t = i / STEPS;
      brush.vertex(L * t, -W * Math.pow(Math.sin(Math.PI * t), 0.75));
    }
    for (var j = STEPS - 1; j > 0; j--) {
      var u = j / STEPS;
      brush.vertex(L * u, W * Math.pow(Math.sin(Math.PI * u), 0.75));
    }
    brush.endShape(true);
    brush.noFill();
    brush.noWash();
    brush.pop();
  }

  function paintSprite() {
    var SPR = 320;
    var host = document.createElement('div');
    host.style.cssText =
      'position:absolute;left:-99999px;top:0;width:0;height:0;overflow:hidden;pointer-events:none';
    document.body.appendChild(host);

    var tmp = null;
    try {
      tmp = brush.createCanvas(SPR, SPR, {
        pixelDensity: 1,
        parent: host,
        id: 'bloom-sprite'
      });
      brush.angleMode(brush.DEGREES);
      brush.seed(Math.floor(Math.random() * 1e9));
      brush.noiseSeed(Math.floor(Math.random() * 1e9));
      brush.scaleBrushes(1);
      brush.clear(PAPER);

      // Held well inside the canvas: watercolour bleed spreads a long way past
      // the radius it is given, and anything past the edge is simply lost.
      var r = SPR * 0.26;
      var spin = Math.random() * 360;

      for (var s = -1; s <= 1; s += 2) {
        spriteAlmond(spin + 90 + s * 118, r * 1.06, r * 0.32, SAGE, 175, 0.04);
      }

      var outer = 8;
      for (var i = 0; i < outer; i++) {
        spriteAlmond(spin + (i * 360) / outer, r, r * 0.44, BLUSH, 225, 0.05);
      }

      var inner = 7;
      for (var k = 0; k < inner; k++) {
        spriteAlmond(spin + 26 + (k * 360) / inner, r * 0.62, r * 0.3, ROSE, 215, 0.045);
      }

      // mass() for the eye: hand-filled overlapping strokes read as pollen in a
      // way a flat disc does not.
      brush.noStroke();
      brush.mass('pastel', GOLD, {
        precision: 0.5,
        strength: 0.85,
        gradient: 0.3,
        outline: false
      });
      brush.circle(0, 0, r * 0.26, 0.9);
      brush.noMass();

      brush.render();
      sprite = liftPixels(tmp);
    } catch (e) {
      sprite = null;
    }

    try {
      if (tmp && tmp.parentNode) tmp.parentNode.removeChild(tmp);
      if (host.parentNode) host.parentNode.removeChild(host);
    } catch (e) { /* nothing to do */ }

    if (sprite) {
      // pretext.js starts with its own vector flower and upgrades to this if and
      // when it arrives, so a device where the painting was declined still gets
      // a flower.
      window.__garden = { bloom: sprite };
      try {
        window.dispatchEvent(new CustomEvent('garden:bloom'));
      } catch (e) { /* no CustomEvent, the polling path still finds it */ }
    }
    return sprite;
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

    // The stylesheet needs to know whether this is a margin garden (in front of
    // the text) or a full-bleed wallpaper (behind it, dialled back).
    bleed = Math.max(0, w / 2 - COL_HALF) < BLEED_BELOW;
    mount.classList.toggle('is-bleed', bleed);
    mount.classList.remove('is-front');

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
        // Only claim the foreground once the painting actually has an alpha
        // channel. A full-bleed composition stays behind the words regardless.
        if (!bleed && lift()) mount.classList.add('is-front');
        mount.classList.add('is-painted');
        // Only once, and only after the page's own painting is safely a plain
        // 2D canvas.
        if (!sprite) paintSprite();
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
      offerRepaint();
    };
    // On failure the CSS .ambient gradient is simply what the visitor sees.
    document.head.appendChild(s);
  }

  /* ---------------------------------------------------------------- repaint */

  // Every load draws a different painting, so the only thing missing was a way
  // to ask for another one. Revealed only once a painting is actually on
  // screen: on a device where the gating declined, the control would be a
  // button that does nothing.
  //
  // paint() bumps `generation`, which makes any in-flight painting abandon
  // itself, so leaning on the button is safe rather than cumulative.
  function offerRepaint() {
    var wrap = document.getElementById('repaint-wrap');
    var btn = document.getElementById('repaint');
    if (!wrap || !btn) return;

    wrap.hidden = false;
    btn.addEventListener('click', function () {
      mount.classList.remove('is-painted', 'is-instant');
      paint();
    });
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
