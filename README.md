# 42connor.github.io

Connor Hood's site. The whole page is one painting (Van Gogh's *Almond Blossom* first) with
his work floating on it in windows, the way Monet Shot frames a take. A Monet Shot cursor
clicks the name and zooms; the first window rises from below; the painting crossfades
section by section.

- `index.html`, `style.css`, `main.js`: the page. `hero.css`, `hero.js`: the opening cursor take.
- `sound.js`: the music ("Jaago" by Lifafa, `media/music.m4a`, cut to start at the drop and
  loop the hard section), the dock button, and the StyleFeatures film that ducks it.
- `autoscroll.js`: the page reads itself; any touch hands it back.
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
