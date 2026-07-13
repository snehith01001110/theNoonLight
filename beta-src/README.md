# The Noonlight `/beta` — "It All Started Right Here"

A scroll-driven journey backward through 13.8 billion years, mapped onto one
full trip around planet Earth at **true scale**: the equator's 40,075 km equals
the age of the universe, so 1 year ≈ 2.9 mm. The journey starts at the
visitor's location, flies due west along the great circle through their point,
and arrives back at their exact coordinates — at the Big Bang.

Live at **thenoonlight.com/beta**. The root site (`../index.html`) is a
separate, untouched, self-contained page.

## Stack

- **Vanilla JS + Vite** — no framework, one page.
- **MapLibre GL JS v5** with globe projection.
- **OpenFreeMap** vector tiles (`tiles.openfreemap.org`), Liberty style forked
  *at runtime*: the style JSON is fetched, every color is pushed through a
  pastelizer, and targeted overrides add soft water/paper tones and 3D
  fill-extrusion buildings (`src/mapstyle.js`). No API keys anywhere.
- **Three.js** via a MapLibre custom layer for low-poly event monuments,
  lazy-loaded after the intro (`src/scenes.js`).
- Events dataset **reused from the root site** — extracted verbatim into
  `src/data/events-raw.js` (1,228 events) with the original category
  classifier in `src/data/events.js`.

Network requests are limited to: OpenFreeMap tiles/style/glyphs,
`ipwho.is` (only if geolocation is denied/unavailable), and Nominatim
(only on explicit user search).

## How it works

- `src/journey.js` — the math. Distance along the great circle is always
  `d = (years_ago / 13.787e9) × 40,075 km` (true scale, never distorted).
  Scroll is piecewise-logarithmic in time: the first 60% of scroll covers
  1 → 5×10⁹ years ago (log in years-ago; recorded history alone gets ~25%),
  the rest is log in years-*after*-the-Big-Bang, which equals log in
  distance-remaining — so the camera exponentially eases back home.
  Camera zoom/pitch follow keyframes anchored to that mapping: street level
  for the last 10,000 years (all of which sit within ~30 m of the start),
  orbital globe through the billions, descent back to the doorstep for the
  finale.
- `src/scroll.js` — virtual scroll: wheel, touch drag + fling, arrow keys,
  and a scrubber all drive a target position with spring easing.
- `src/markers.js` — all events placed ON the path at their true-scale
  positions; a pooled window of DOM markers tracks the current scroll
  position. Recent events (which truly all sit within ~30 m of the start)
  are displayed as a queue of plaques strung along the line at fixed
  on-screen intervals, gliding past as you scroll — order and the line stay
  true, and each card reports the honest distance.
- `src/sky.js` — starfield, deep-time tint, celestial set pieces (Sun
  ignition, first galaxies, cosmic dawn, CMB) drawn on a 2D canvas, plus one
  comet. `src/scenes.js` — ground monuments (pyramid, dinosaurs, asteroid,
  trilobite, ice, vents…).
- `src/ui.js` — intro + location flow (geolocation → ipwho.is → San
  Francisco fallback, plus Nominatim search and pick-on-globe), HUD,
  captions, finale, shareable postcard, and a step-through mode when
  `prefers-reduced-motion` is set.

## Build

```bash
cd beta-src
npm install
npm run dev        # local dev server
npm run build      # builds into ../beta with base /beta/
npm run preview    # serves the built output at localhost:4173/beta/
```

## Deploy

The built output in `/beta` is committed to the repo. GitHub Pages serves the
repo root (with the custom domain), so `/beta` is live as soon as the branch
is merged and pushed — no other configuration. After changing anything in
`beta-src/`, run `npm run build` and commit both `beta-src/` and the
regenerated `beta/`.

Root site checklist: `index.html`, `CNAME`, `favicon.ico`, `.nojekyll` at the
repo root are untouched by the build (`beta-src/vite.config.js` only writes
into `../beta`).
