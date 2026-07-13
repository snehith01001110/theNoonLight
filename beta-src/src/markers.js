// ── event markers ─────────────────────────────────────────────────────
// Every event sits ON the great circle at its true-scale distance. Recent
// events (last ~10,000 years) all land within ~30 m of the start, so their
// along-path spacing is stretched at display time into a queue of plaques
// strung along the line. A small pool of DOM markers tracks the events
// nearest to the current scroll position.

import maplibregl from 'maplibre-gl';
import { EVENTS } from './data/events.js';
import { scrollFromYa, distFromYa, STREET_DRIVE_YA } from './journey.js';
import { formatWhen, formatDistance } from './format.js';

// every event is one warm amber bead on the line — no category colors
const PIN_COLOR = '#df9a52';
const MAX_VISIBLE = 7;         // how many pins live in the pool at once
const LABELED = 3;             // only the few nearest carry a text label
const WINDOW = 0.035;          // scroll-space half-window for candidates
// the "near field" — matches the camera's visual-odometer drive, so every
// event the camera drives through streams past as a queued plaque
const STREET_YA = STREET_DRIVE_YA;
const SLOT_PX = 78;            // on-screen spacing between queued plaques

export function makeEventLayer(map, journey, { onSelect } = {}) {
  // annotate + place every event once the origin is known. Everything sits
  // exactly ON the path; street-zone events (which truly live within ~30 m
  // of the start) get their along-path spacing stretched at display time so
  // they read as a queue of plaques strung along the line.
  const placed = EVENTS.map((ev, i) => {
    const d = distFromYa(ev.ya);
    const s = scrollFromYa(ev.ya);
    const [lng, lat] = journey.point(d);
    return { ...ev, i, d, s, lng, lat, color: PIN_COLOR };
  }).sort((a, b) => a.s - b.s);
  const S = placed.map((p) => p.s);
  const idx = new Map(placed.map((p, k) => [p.i, k]));

  const pool = new Map();      // event index -> maplibregl.Marker
  let landmarks = new Set();   // event indices that also carry a 3D monument

  function makeMarker(p) {
    const el = document.createElement('div');
    // labels hang off alternating sides of the line so neighbors in the
    // queue never stack on each other
    el.className = 'evt ' + (p.i % 2 ? 'evt-right' : 'evt-left');
    el.style.setProperty('--evt-c', p.color);
    // title + when, so every labelled event says both what and *when* it is
    el.innerHTML = `
      <div class="evt-inner">
        <div class="evt-pin" style="background:${p.color}"></div>
        <div class="evt-label">
          <span class="evt-title">${p.title}</span>
          <span class="evt-when">${formatWhen(p.ya)}</span>
        </div>
      </div>`;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onSelect?.(p);
    });
    const mk = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([p.lng, p.lat])
      .addTo(map);
    requestAnimationFrame(() => el.classList.add('show'));
    return mk;
  }

  let lastS = -1;
  function update(s, dNowKm = 0, zoomNow = 17) {
    // window/pool membership only needs recomputing when scroll moved
    if (Math.abs(s - lastS) >= 0.0006) {
      lastS = s;

      // binary search the window in scroll space
      let lo = 0, hi = S.length;
      const from = s - WINDOW, to = s + WINDOW;
      while (lo < hi) { const m = (lo + hi) >> 1; if (S[m] < from) lo = m + 1; else hi = m; }
      let end = lo;
      while (end < S.length && S[end] <= to) end++;

      // nearest N in the window
      const cand = [];
      for (let k = lo; k < end; k++) cand.push(placed[k]);
      cand.sort((a, b) => Math.abs(a.s - s) - Math.abs(b.s - s));
      const keep = new Set(cand.slice(0, MAX_VISIBLE).map((p) => p.i));

      for (const [i, mk] of pool) {
        if (!keep.has(i)) {
          const el = mk.getElement();
          el.classList.remove('show');
          pool.delete(i);
          setTimeout(() => mk.remove(), 500);
        }
      }
      // only the few nearest carry a text label; the rest stay pin-only so
      // dense stretches of history don't become a wall of plaques
      cand.slice(0, MAX_VISIBLE).forEach((p, rank) => {
        if (!pool.has(p.i)) pool.set(p.i, makeMarker(p));
        // landmark events carry their own richer monument label — keep the
        // plain pin here so the two don't stack
        pool.get(p.i).getElement().classList.toggle('mini', rank >= LABELED || landmarks.has(p.i));
      });
    }

    // near-field conveyor: the near field is only a few hundred metres of true
    // distance, which would stack every plaque on one doorstep. Instead the
    // visible plaques queue up ON the line at fixed on-screen intervals, in
    // time order, anchored to the camera's odometer position (dNowKm) so they
    // stream past as the camera drives forward. Order and the line itself stay
    // true; the card still reports the honest distance.
    const recent = [];
    for (const [i, mk] of pool) {
      const p = placed[idx.get(i)];
      if (p.ya < STREET_YA) recent.push({ p, mk });
    }
    if (recent.length) {
      recent.sort((a, b) => a.p.s - b.p.s);
      const mPerPx = (156543.03392 * Math.cos((journey.origin[1] * Math.PI) / 180)) / Math.pow(2, zoomNow);
      const gapKm = (SLOT_PX * mPerPx) / 1000;
      const nBehind = recent.reduce((n, r) => n + (r.p.s < s ? 1 : 0), 0);
      recent.forEach((r, j) => {
        const slot = j - nBehind + (r.p.s >= s ? 1 : 0);   // slot 0 = you
        const target = dNowKm + slot * gapKm;              // may trail behind the start
        const cur = r.mk._dispD ?? target;
        r.mk._dispD = cur + (target - cur) * 0.16;         // glide, don't jump
        r.mk.setLngLat(journey.point(r.mk._dispD));
      });
    }
  }

  function describe(p) {
    return {
      when: formatWhen(p.ya),
      where: p.ya < 12000
        ? `${formatDistance(p.d)} from your door`
        : `${formatDistance(p.d)} along the journey`,
    };
  }

  return { placed, update, describe, setLandmarks(ids) { landmarks = ids; } };
}

// the path itself, drawn as a soft dotted line around the world
export function addPathLayer(map, journey) {
  const line = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: journey.pathCoords },
  };
  if (map.getSource('journey-path')) {
    map.getSource('journey-path').setData(line);
    return;
  }
  map.addSource('journey-path', { type: 'geojson', data: line });
  map.addLayer({
    id: 'journey-path-line',
    type: 'line',
    source: 'journey-path',
    layout: { 'line-cap': 'round' },
    // a clean, thin graticule-like line — this IS a great circle, after all
    paint: {
      'line-color': '#df9a52',
      'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 2, 1.4, 10, 2, 16, 2.5],
      'line-opacity': 0.6,
    },
  });
}
