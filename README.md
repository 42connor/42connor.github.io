# 42connor.github.io

Connor Hood's site. The whole page is one painting (Van Gogh's *Almond Blossom* first) with
his work floating on it in windows, the way Monet Shot frames a take. A Monet Shot cursor
clicks the name and zooms; the first window rises from below; the painting crossfades
section by section.

- `index.html`, `style.css`, `main.js`: the page. `hero.css`, `hero.js`: the opening cursor take.
- `sound.js`: the music ("Jaago" by Lifafa, `media/music.m4a`, from the drop, played once) and
  the start: if the browser allows sound, music and site begin together; if not, one quiet Enter
  over the opening starts both. Also the dock button and the StyleFeatures film that ducks it.
- `route.js`: the ink line from Adelaide (production floor, Scouts) across the Pacific to San
  Francisco and behind every window.
- `pieces/`: six StyleFeatures pieces running live in the Work section (credits in each folder);
  Common Ground's window is the live site.
- `autoscroll.js`: the page reads itself, paced to land on the footer ~7 s before the song ends; any touch hands it back.
- `cv.html` (with `site.css`, `nav.js`): the CV.
- `v/` (not committed): the six design variants and six openings this came from.


<!-- earlier notes -->
# 42connor.github.io

Personal site and CV for Connor Hood. Static, no build step: `index.html`,
`site.css`, `site.js`, plus `cv.html` for the full printable CV.
Serve it over http (the hands procession loads `ornaments/hands.json`):

```sh
python3 -m http.server 4820
```

**Live:** https://42connor.github.io

## The idea

A motion study. Muybridge's *Horse in Motion* (1878, Palo Alto) opens the page:
its twelve shutters fire in order, then scrolling sets the whole card galloping.
Everything historical is printed in one ink, the green of Connor's swallows
engraving; colour arrives only on his own photos and film, which develop from
ink to full colour as they reach the middle of the screen.

| Path | What it is |
| --- | --- |
| `media/` | Connor's own photos and clips, cut and encoded for the web (H.264, muted, posters). iPhone HDR clips were tone-mapped to SDR with `avconvert` first. |
| `ornaments/walk.webp` | The 12 Muybridge frames as one sprite, in green ink. |
| `ornaments/plate-horse*.webp` | The whole 1878 card, untouched. |
| `ornaments/hands/` | Sculpted hands from The Met Open Access (CC0), printed in ink. |
| `ornaments/credits*.json` | Sources and licences (kept off the page). |
| `og-card.jpg` | Share card (a render of the opening). |

## Sound and motion

- **The bar** (`nav.js`) stays at the top the whole way down: dark over the films and paintings,
  light on paper, the current section underlined, a hairline for how far you've come. On phones,
  Menu opens a full page of links. The CV page has the same bar and footer.
- **Music** (`media/music.m4a`, the song is "Jaago" by Lifafa; not Connor's) loops quietly behind the page. Browsers only allow sound
  after a tap or key, so it starts on the visitor's first one; the Music button in the
  corner switches it, and an "off" is remembered. Fades run through Web Audio, because
  iPhones ignore a media element's volume.
- **The templates film** plays silently as a picture. *Watch with sound* fades the music
  out and plays the film from the start with its own sound; stopping it, letting it end,
  or scrolling away fades the music back in.
- **Autoscroll** (`autoscroll.js`, from socialacolyte.github.io) reads the page by itself
  after the opening, slower through the scroll scenes, and hands control back the moment
  the visitor scrolls. *Auto* in the corner turns it off.
- **Homer's Sloop, Nassau** is painted as you scroll by the StyleFeatures `wet-on-wet`
  piece, copied whole into `c/wet-on-wet/`.

Respects `prefers-reduced-motion` (finished states, nothing pinned) and prints
`cv.html` as a clean PDF.

## Added November 2026
- **Gilded Almond Blossom** (`gild.js`): the first painting is drawn in WebGL. Van Gogh's dark branch outlines and the wood are laid in gold leaf, which runs out along the branches from the trunk when the page opens (path length along the wood, baked at load). The leaf is cut into tiny facets that flash under a candle: the pointer, or on phones a slow wander that follows the scroll. The paint is relit as relief and the petals glow near the light. Debug: `?gild=1` (masks), `?gild=2` (path length), `?gilded`, `?run=0.5`, `?lx=.3&ly=.4` (fix the candle), `?bare`.
- **The Starry Night, machined** (`steel.js`): behind Hackathons the painting becomes anodized aluminium in its own colours, every brushstroke edge a diamond-cut chamfer that flashes as the light crosses it, the moon and stars lathe-turned. On arrival the light comes in from the left and the metal comes up under it; a studio softbox glides across the surface as you scroll the wins. It also lights the section's metal type (`[data-metal]`). `?machined` shows it from the start, `?box=0.4` holds the softbox.
- **Hackathons**: two win blocks, 8090 (second place: Chamath photo, the pitch, the live Common Ground site) and Impossibl (won: the demo, the night with Fabio), each piled onto a big machined-metal mark, "2nd" and "Won".
- **Bridging lines** (class `bridge` / `lead-bridge`): one short line between his sentences and before section leads, a little quieter than what they lead to.
- **Autoscroll** paces itself to 1.25x the song's length (`STRETCH`), so it reads a quarter slower and reaches the footer shortly after the song ends.
- **Gold swallows** (`swallows.js`, `media/swallows-sheet.png`): the engraved trio from `swallows.mp4`, cut to a 63-frame grey mask, flown live in WebGL. Champagne gold with an ink keyline, lit by the same candle, frame-blended wingbeat (faster climbing or startled), a shadow on the painting, banking and turning round. One smaller trio makes a single visit over the blossom at the opening (two loops, then away until you come back up) and ride the route's pen across the Pacific (`.swallows` is now only the anchor). Pointer pushes them aside; a click startles them. `?birds=.4,.3` pins them for screenshots.
- **The start:** browsers only play sound after a click, tap or key (a scroll doesn't count), so when sound is blocked the page holds at the opening with Enter until that first click (`sound.js`, `html.gated`). A scroll attempt nudges Enter.
- **Swallows:** `media/swallows.webp`, white birds with their own transparency, made from `swallows.mp4` (no blend mode or filter, so no box on phones and no flicker while scrolling).
- **Autoscroll** follows the browser's own small scroll corrections and eases its speed, instead of fighting them.
- Photos from Connor's laptop (exported without location data): RYLA camp 2023, the lab coat on the production floor, Delhi, friends in Vietnam and Oakland, Frontier Tower.
