// Build-time: rasterize Natural Earth 110m land into a coarse 1° bit mask,
// base64-packed, emitted as src/data/landmask.js. Used only to pick the
// journey heading that crosses the most land. Public-domain source data.
import fs from 'node:fs';

const SRC = '/tmp/ne_land.json';
const OUT = new URL('../src/data/landmask.js', import.meta.url);

const gj = JSON.parse(fs.readFileSync(SRC, 'utf8'));

// collect sub-polygons: each = { rings: [[ [lng,lat],... ], ...], bbox:[w,s,e,n] }
const polys = [];
function addPolygon(rings) {
  let w = 180, s = 90, e = -180, n = -90;
  for (const pt of rings[0]) {
    if (pt[0] < w) w = pt[0]; if (pt[0] > e) e = pt[0];
    if (pt[1] < s) s = pt[1]; if (pt[1] > n) n = pt[1];
  }
  polys.push({ rings, bbox: [w, s, e, n] });
}
for (const f of gj.features) {
  const g = f.geometry;
  if (g.type === 'Polygon') addPolygon(g.coordinates);
  else if (g.type === 'MultiPolygon') for (const p of g.coordinates) addPolygon(p);
}

// even-odd ray cast across all rings of a polygon (handles holes)
function inPoly(lng, lat, poly) {
  const [w, s, e, n] = poly.bbox;
  if (lng < w || lng > e || lat < s || lat > n) return false;
  let inside = false;
  for (const ring of poly.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > lat) !== (yj > lat)) {
        const xint = xi + ((lat - yi) / (yj - yi)) * (xj - xi);
        if (lng < xint) inside = !inside;
      }
    }
  }
  return inside;
}
const isLand = (lng, lat) => polys.some((p) => inPoly(lng, lat, p));

const W = 360, H = 180;                 // 1° cells
const bytes = new Uint8Array(Math.ceil((W * H) / 8));
let landCount = 0;
for (let row = 0; row < H; row++) {
  const lat = 90 - (row + 0.5);
  for (let col = 0; col < W; col++) {
    const lng = -180 + (col + 0.5);
    if (isLand(lng, lat)) {
      const bit = row * W + col;
      bytes[bit >> 3] |= 1 << (7 - (bit & 7));
      landCount++;
    }
  }
}
const b64 = Buffer.from(bytes).toString('base64');
console.error(`land cells: ${landCount}/${W * H} (${(100 * landCount / (W * H)).toFixed(1)}%)  base64 ${b64.length} chars`);

const module = `// ── coarse land/ocean mask ───────────────────────────────────────────
// A 1° equirectangular land bitmap, bit-packed + base64, derived at BUILD time
// from Natural Earth 110m land (public domain). It exists only so the journey
// can choose the heading that crosses the most land — it is never displayed.
// Regenerate with beta-src/scripts/rasterize_land.mjs.
const W = ${W}, H = ${H};
const BITS = Uint8Array.from(atob('${b64}'), (c) => c.charCodeAt(0));

// true if (lng,lat) falls on land, at 1° resolution
export function isLand(lng, lat) {
  let x = ((lng + 180) % 360 + 360) % 360;          // 0..360
  let col = Math.floor(x); if (col >= W) col = W - 1;
  let row = Math.floor(90 - lat); if (row < 0) row = 0; if (row >= H) row = H - 1;
  const bit = row * W + col;
  return (BITS[bit >> 3] & (1 << (7 - (bit & 7)))) !== 0;
}
`;
fs.writeFileSync(OUT, module);
console.error('wrote', OUT.pathname);
