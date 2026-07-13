// ── map style ─────────────────────────────────────────────────────────
// We fork the OpenFreeMap "liberty" style at runtime: fetch the JSON, then
// push every color through a pastelizer and apply targeted overrides, so
// the world reads as a soft, hand-crafted diorama. No keys, no tokens.

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

// ---- color plumbing --------------------------------------------------
function parseColor(str) {
  if (typeof str !== 'string') return null;
  let m;
  if ((m = str.match(/^#([0-9a-f]{3})$/i))) {
    const [r, g, b] = m[1].split('').map((c) => parseInt(c + c, 16));
    return { r, g, b, a: 1 };
  }
  if ((m = str.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i))) {
    const n = parseInt(m[1], 16);
    return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
  }
  if ((m = str.match(/^rgba?\(([^)]+)\)$/i))) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  if ((m = str.match(/^hsla?\(([^)]+)\)$/i))) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    const { r, g, b } = hslToRgb(p[0] / 360, p[1] / 100, p[2] / 100);
    return { r, g, b, a: p.length > 3 ? p[3] : 1 };
  }
  return null;
}
function hslToRgb(h, s, l) {
  h = ((h % 1) + 1) % 1;
  if (s === 0) { const v = l * 255; return { r: v, g: v, b: v }; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: f(h + 1 / 3) * 255, g: f(h) * 255, b: f(h - 1 / 3) * 255 };
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

// Soft-toy palette: desaturate, lift lightness toward pastel, nudge hues
// so greens go sage, blues go milky, and warm tones go peachy.
export function pastelize(str) {
  const c = parseColor(str);
  if (!c) return str;
  let { h, s, l } = rgbToHsl(c.r, c.g, c.b);
  s = Math.min(0.52, s * 0.62);
  l = 0.38 + l * 0.55;                        // compress contrast, keep order
  if (h > 0.16 && h < 0.45) { h += 0.02; s = Math.min(s, 0.38); }   // sage greens
  if (h >= 0.45 && h < 0.72) { s = Math.min(s, 0.42); l = Math.min(0.85, l + 0.04); } // milky blues
  const { r, g, b } = hslToRgb(h, s, l);
  const a = Math.round(c.a * 1000) / 1000;
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
}

// Recursively pastelize color strings inside paint/layout values (handles
// expressions, interpolations, stop arrays…).
function walkColors(v) {
  if (typeof v === 'string') {
    return /^(#|rgb|hsl)/i.test(v.trim()) ? pastelize(v) : v;
  }
  if (Array.isArray(v)) return v.map(walkColors);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) out[k] = walkColors(v[k]);
    return out;
  }
  return v;
}

// ---- targeted overrides ---------------------------------------------
const PAPER = '#f2ecdd';
const WATER = '#a9cfd9';

const HIDE = /poi|housenumber|oneway|airport|aerodrome|helipad|ferry|gondola|pattern/i;

export function restyle(style) {
  const s = JSON.parse(JSON.stringify(style));
  s.name = 'noonlight-pastel';

  s.layers = s.layers.filter((l) => !HIDE.test(l.id));

  let buildingSrc = null, buildingSrcLayer = null, hasExtrusion = false;
  for (const l of s.layers) {
    l.paint = walkColors(l.paint || {});
    if (l.layout && l.layout['text-font']) l.layout = { ...l.layout };

    if (l.type === 'background') {
      l.paint['background-color'] = PAPER;
    }
    if (l['source-layer'] === 'water' && l.type === 'fill') {
      l.paint['fill-color'] = WATER;
      delete l.paint['fill-pattern'];
    }
    if (l['source-layer'] === 'waterway' && l.type === 'line') {
      l.paint['line-color'] = WATER;
    }
    if (l['source-layer'] === 'building') {
      buildingSrc = l.source;
      buildingSrcLayer = l['source-layer'];
      if (l.type === 'fill-extrusion') {
        hasExtrusion = true;
        l.paint['fill-extrusion-color'] = '#e9dfcb';
        l.paint['fill-extrusion-opacity'] = 0.95;
      } else if (l.type === 'fill') {
        // flat footprints only at mid zoom; extrusions take over close-up
        l.maxzoom = Math.min(l.maxzoom || 24, 15.5);
        l.paint['fill-color'] = '#e6dcc6';
        l.paint['fill-outline-color'] = 'rgba(140,128,105,0.35)';
      }
    }
    if (l.type === 'symbol') {
      l.paint['text-color'] = '#6d6350';
      l.paint['text-halo-color'] = 'rgba(246,241,229,0.9)';
      l.paint['text-halo-width'] = 1.4;
      delete l.paint['icon-color'];
    }
  }

  // our own soft 3D buildings if the style has none
  if (buildingSrc && !hasExtrusion) {
    s.layers.push({
      id: 'noonlight-buildings-3d',
      type: 'fill-extrusion',
      source: buildingSrc,
      'source-layer': buildingSrcLayer,
      minzoom: 15,
      paint: {
        'fill-extrusion-color': [
          'interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 4],
          0, '#efe6d3', 60, '#ddd1b8', 200, '#ccbc9f',
        ],
        // only trust real height data; footprints without it stay low so
        // houses read as houses, not invented office blocks
        'fill-extrusion-height': [
          'case', ['has', 'render_height'], ['get', 'render_height'], 4,
        ],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.85,
      },
    });
  }

  // soft sky + atmosphere for the globe
  s.sky = {
    'sky-color': '#bcd8e6',
    'horizon-color': '#f3e6cf',
    'fog-color': '#f6efe0',
    'sky-horizon-blend': 0.7,
    'horizon-fog-blend': 0.6,
    'fog-ground-blend': 0.85,
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 6, 1, 8, 0.3, 10, 0],
  };
  s.light = { anchor: 'viewport', color: '#fff8ec', intensity: 0.32, position: [1.2, 210, 30] };
  s.projection = { type: 'globe' };
  return s;
}

// Minimal offline style so the app still boots if the style fetch fails
// (tiles will be missing, but the journey, markers, and finale all work).
export function fallbackStyle() {
  return {
    version: 8,
    name: 'noonlight-fallback',
    sources: {},
    projection: { type: 'globe' },
    sky: { 'sky-color': '#bcd8e6', 'horizon-color': '#f3e6cf', 'fog-color': '#f6efe0' },
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': PAPER } }],
  };
}

export async function loadStyle() {
  try {
    const res = await fetch(STYLE_URL, { mode: 'cors' });
    if (!res.ok) throw new Error(`style ${res.status}`);
    return restyle(await res.json());
  } catch (err) {
    console.warn('[noonlight] style fetch failed, using fallback:', err);
    return fallbackStyle();
  }
}
