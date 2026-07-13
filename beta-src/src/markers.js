// ── event markers ─────────────────────────────────────────────────────
// Every event sits at its true-scale distance along the great circle.
// Recent events (last ~10,000 years) all land within ~30 m of the start —
// they're scattered as plaques around the user's streets. A small pool of
// DOM markers tracks the events nearest to the current scroll position.

import maplibregl from 'maplibre-gl';
import { EVENTS, CATS } from './data/events.js';
import { scrollFromYa, distFromYa, destination, HEADING } from './journey.js';
import { formatWhen, formatDistance } from './format.js';

const MAX_VISIBLE = 12;
const WINDOW = 0.035;          // scroll-space half-window for candidates

export function makeEventLayer(map, journey, { onSelect } = {}) {
  // annotate + place every event once the origin is known
  const placed = EVENTS.map((ev, i) => {
    const d = distFromYa(ev.ya);
    const s = scrollFromYa(ev.ya);
    let [lng, lat] = journey.point(d);
    // plaques for the last ~10k years would stack on one doorstep — scatter
    // them a few meters to the sides of the path, like markers on a street
    if (ev.ya < 12000) {
      const side = i % 2 ? 90 : -90;
      const away = 0.004 + 0.0035 * (i % 5);      // 4–18 m
      [lng, lat] = destination(lng, lat, (HEADING + side + 360) % 360, away);
    }
    return { ...ev, i, d, s, lng, lat, color: `rgb(${CATS[ev.c].rgb.join(',')})` };
  }).sort((a, b) => a.s - b.s);
  const S = placed.map((p) => p.s);

  const pool = new Map();      // event index -> maplibregl.Marker

  function makeMarker(p) {
    const el = document.createElement('div');
    el.className = 'evt';
    el.style.setProperty('--evt-c', p.color);
    // staggered stem heights keep neighboring labels off each other
    const stem = 8 + (p.i % 3) * 18;
    el.innerHTML = `
      <div class="evt-inner">
        <div class="evt-pin" style="background:${p.color}"></div>
        <div class="evt-stem" style="height:${stem}px"></div>
        <div class="evt-label">${p.title}</div>
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
  function update(s) {
    if (Math.abs(s - lastS) < 0.0006) return;
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
      pool.get(p.i).getElement().classList.toggle('mini', rank >= 6);
    });
  }

  function describe(p) {
    return {
      when: formatWhen(p.ya),
      where: p.ya < 12000
        ? `${formatDistance(p.d)} from your door`
        : `${formatDistance(p.d)} along the journey`,
    };
  }

  return { placed, update, describe };
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
    paint: {
      'line-color': '#e8a25c',
      'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 2, 1.6, 10, 3, 16, 5],
      'line-opacity': 0.55,
      'line-dasharray': [0.1, 2.4],
    },
  });
}
