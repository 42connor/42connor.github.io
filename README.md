# 42connor.github.io

Personal CV site for Connor Hood — a single static page, no build step, no
dependencies to install. Open `index.html` and it works.

**Live:** https://42connor.github.io

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | The whole CV. Semantic sections, no framework. |
| `style.css` | Parchment + gold light-mode design. Cormorant Garamond headings, JetBrains Mono body. Includes a print stylesheet that produces a clean one-page PDF. |
| `hero.js` | Generative painting in the margins, drawn once with p5.brush. Washes, watercolor blooms, flow-field drift, plotted stroke spines, a hatch panel, and little painted sprigs and sparkles. Different on every load. |
| `pretext.js` | The "In Practice" paragraph, laid out in userland with pretext so the prose re-flows around a drifting shape every frame. |
| `fonts/` | Self-hosted variable woff2 subsets, so no cross-origin request blocks first paint. |
| `img/` | Portrait at 1x/2x/3x in webp and jpg. |
| `vendor/` | Third-party libraries, committed rather than installed. |
| `tools/og-card.html` | Source for the social share card; see below. |
| `tools/render-card.mjs` | Renders that card to `og-card.png`. Zero dependencies. |

## Vendored libraries

Both are committed so the site has no install step and no CDN dependency.

- **[p5.brush](https://github.com/acamposuribe/p5.brush)** v2.2.2 (MIT) — `vendor/brush.js`,
  the standalone WebGL2 build, so p5.js is not needed.
- **[pretext](https://github.com/chenglou/pretext)** v0.0.8 (MIT) — `vendor/pretext/`,
  ESM, lazy-imported only when the section that uses it nears the viewport.

## Progressive enhancement

Neither effect is load-bearing. The painting is skipped without WebGL2, on
metered or 2G connections, and on low-core devices, falling back to the CSS
gradient in `.ambient`. The flowed paragraph stays ordinary DOM text — always
present for selection, screen readers, ctrl+F and print — and does not engage
below a 480px column, where wrapping text around a shape would leave two-word
lines. Both respect `prefers-reduced-motion`.

## Regenerating the share card

`og-card.png` is a 1200x630 render of `tools/og-card.html`. After changing the
card, rebuild it with:

```sh
node tools/render-card.mjs
```

The script is self-contained — it starts its own static server and its own
isolated headless Chrome, waits for the webfonts to load, shoots the card, and
cleans up after itself. No dependencies to install, and it never touches your
real browser profile. Set `CHROME=/path/to/chrome` if it cannot find a browser.

Chrome's old `--screenshot` flag is not an option here: the headless mode it
belonged to has been removed from current builds, so the script drives DevTools
directly instead.
