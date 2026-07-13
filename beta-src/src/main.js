// ── the noonlight /beta — it all started right here ─────────────────
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

import { ERAS } from './data/events.js';
import {
  makeJourney, yaFromScroll, scrollFromYa, camDistFromScroll,
  zoomFromScroll, pitchFromZoom, lerpAngle,
} from './journey.js';
import { loadStyle } from './mapstyle.js';
import { makeScroll } from './scroll.js';
import { makeEventLayer, addPathLayer } from './markers.js';
import { makeSky } from './sky.js';
import { setupIntro, makeHud, makeCaptions, makeChapters, makeCard, makeFinale, setupStepMode } from './ui.js';

// ── capability gate ──────────────────────────────────────────────────
const glProbe = document.createElement('canvas').getContext('webgl2');
if (!glProbe) {
  document.getElementById('nogl').hidden = false;
  document.getElementById('intro').hidden = true;
  throw new Error('WebGL2 unavailable');
}

// ── map ──────────────────────────────────────────────────────────────
init();
async function init() {
const style = await loadStyle();
const map = new maplibregl.Map({
  container: 'map',
  style,
  center: [-30, 25],
  zoom: 1.6,
  pitch: 0,
  bearing: 0,
  maxPitch: 60,
  maxZoom: 25.2,                 // deep enough to stand among furniture at true scale
  attributionControl: { compact: true },
  fadeDuration: 120,
  // scrolling drives the camera — the map itself is not directly draggable
  interactive: true,
});
for (const h of ['scrollZoom', 'dragPan', 'dragRotate', 'keyboard', 'doubleClickZoom', 'touchZoomRotate', 'touchPitch', 'boxZoom']) {
  map[h]?.disable?.();
}

// Fade the map's own buildings out at room zoom so the opening furniture isn't
// pierced by the real (blurry) extrusions. 1 = normal, 0 = inside the room.
let bldgLayers = null, lastBldgVis = -1;
function fadeBuildings(zoom) {
  if (bldgLayers === null) {
    bldgLayers = map.getStyle().layers
      .filter((l) => l['source-layer'] === 'building')
      .map((l) => ({
        id: l.id,
        prop: l.type === 'fill-extrusion' ? 'fill-extrusion-opacity' : 'fill-opacity',
        base: l.type === 'fill-extrusion' ? 0.5 : 1,
      }));
  }
  const vis = 1 - Math.min(1, Math.max(0, (zoom - 20.5) / 2));
  if (Math.abs(vis - lastBldgVis) < 0.02) return;
  lastBldgVis = vis;
  for (const b of bldgLayers) {
    try { map.setPaintProperty(b.id, b.prop, b.base * vis); } catch { /* layer gone */ }
  }
}

// ── shared state ─────────────────────────────────────────────────────
let journey = null;
let events = null;
let monuments = null;
let origin = null;
let running = false;
let bearing = 270;
let lastApplied = { s: -1, bearing: -1 };

const hud = makeHud();
const card = makeCard();
const captions = makeCaptions();
const chapters = makeChapters();
const sky = makeSky(document.getElementById('fx'));
const tintEl = document.getElementById('tint');

const scroll = makeScroll({ onInput: () => card.close() });
hud.onScrub((s) => scroll.setTarget(s));

const finale = makeFinale(
  () => origin,
  () => scroll.setTarget(0, true)
);

// ── start ────────────────────────────────────────────────────────────
map.once('load', () => {
  setupIntro(map, ({ lng, lat, label }) => {
    origin = { lng, lat, label };
    journey = makeJourney([lng, lat]);
    addPathLayer(map, journey);
    events = makeEventLayer(map, journey, {
      onSelect: (p) => card.open(p, events.describe(p)),
    });
    // Three.js set pieces load lazily so the intro stays light
    import('./scenes.js').then(({ makeMonumentLayer }) => {
      monuments = makeMonumentLayer(map, events.placed, journey);
      map.addLayer(monuments.layer);
      events.setLandmarks(monuments.eventIds);   // monuments own their own labels
    });

    hud.show();
    scroll.enable(true);
    scroll.setTarget(0, true);
    running = true;

    // reduced motion: tap-through chapters instead of free scroll
    const chapters = [
      { name: 'now', s: 0 },
      ...[...ERAS].reverse().map(([ya, name]) => ({ name, s: scrollFromYa(ya) })),
    ];
    // ERAS lists era *starts*; the big-bang chapter belongs at the very end
    chapters[chapters.length - 1].s = 1;
    const step = setupStepMode(chapters, (s) => scroll.setTarget(s));
    step?.apply();
  });
});

// ── the drive loop ───────────────────────────────────────────────────
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  if (!running) return;

  const s = scroll.tick(dt);
  const ya = yaFromScroll(s);
  // camera odometer: drives forward through the near field so the map moves,
  // strict true-scale in deep time. The HUD reports true distance from `ya`.
  const d = camDistFromScroll(s);

  // camera
  const heading = journey.headingAt(d);
  bearing = lerpAngle(bearing, heading, 1 - Math.exp(-3.2 * dt));
  const moved = Math.abs(s - lastApplied.s) > 1e-7 ||
    Math.abs(bearing - lastApplied.bearing) > 0.01;
  if (moved) {
    const zoom = zoomFromScroll(s);
    map.jumpTo({
      center: journey.point(d),
      zoom,
      pitch: pitchFromZoom(zoom),
      bearing,
    });
    lastApplied = { s, bearing };

    fadeBuildings(zoom);
    hud.update(s, ya);
    captions(s);
    chapters(ya);
    events.update(s, d, zoom);
    monuments?.setScroll(s);
    if (monuments?.hasNearby(s)) map.triggerRepaint();
  }

  // deep-time atmosphere (cheap when fully in the present)
  sky.draw(ya, s);
  const tint = finale.shown ? 0.96 : sky.tintAlpha(ya);
  tintEl.style.opacity = tint.toFixed(3);

  // arriving home at the big bang
  if (s > 0.9985 && scroll.state.target > 0.998) finale.trigger();
  finale.dismissIfScrolledBack(s);
}
requestAnimationFrame(frame);
}
