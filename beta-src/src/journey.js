// ── journey math ──────────────────────────────────────────────────────
// One trip around the Earth = the age of the universe, at true scale.
// Distance along the great circle is ALWAYS d = (years_ago / AGE) × C.
// Scroll, however, is logarithmic in time so recent history is explorable.

import { AGE } from './data/events.js';

export const CIRCUMFERENCE = 40075.017;              // km, equatorial
export const KM_PER_YEAR = CIRCUMFERENCE / AGE;      // ≈ 2.9e-9 km ≈ 2.9 mm
const R = CIRCUMFERENCE / (2 * Math.PI);             // radius consistent with C
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

export const HEADING = 270;                          // travel due west

// ── scroll ↔ time mapping ────────────────────────────────────────────
// Piecewise-log scroll: segment A is log in years-ago (the familiar past),
// segment B is log in years-AFTER-the-big-bang, which is the same as log in
// distance-remaining-to-home — so the camera exponentially eases back into
// the start point as time approaches t=0. Segment C is the final 290 m.
const SA = 0.60;                 // scroll fraction for segment A
const SB = 0.94;                 // end of segment B
const YA_SPLIT = 5e9;            // segment A covers years-ago ∈ [1, 5e9]
const DEC_A = Math.log10(YA_SPLIT);            // 9 decades
const T_SPLIT = AGE - YA_SPLIT;                // years after big bang at split
const T_MIN = 1e5;                             // segment B bottoms out here
const DEC_B = Math.log10(T_SPLIT) - Math.log10(T_MIN);

export function yaFromScroll(s) {
  s = Math.min(1, Math.max(0, s));
  if (s <= SA) return Math.pow(10, DEC_A * (s / SA));
  if (s <= SB) {
    const u = (s - SA) / (SB - SA);
    const t = Math.pow(10, Math.log10(T_SPLIT) - u * DEC_B);
    return AGE - t;
  }
  // segment C: ease t from T_MIN to 0 (the last ~290 m home)
  const u = (s - SB) / (1 - SB);
  const t = T_MIN * (1 - u) * (1 - u);
  return AGE - t;
}

export function scrollFromYa(ya) {
  ya = Math.min(AGE, Math.max(1, ya));
  if (ya <= YA_SPLIT) return SA * (Math.log10(ya) / DEC_A);
  const t = Math.max(0, AGE - ya);
  if (t >= T_MIN) {
    const u = (Math.log10(T_SPLIT) - Math.log10(t)) / DEC_B;
    return SA + u * (SB - SA);
  }
  return SB + (1 - SB) * (1 - Math.sqrt(t / T_MIN));
}

export const distFromYa = (ya) => (ya / AGE) * CIRCUMFERENCE;   // km

// ── spherical math ───────────────────────────────────────────────────
// Destination point given start, bearing, distance. Returns [lng, lat].
export function destination(lng1, lat1, bearingDeg, dKm) {
  const p1 = lat1 * D2R, l1 = lng1 * D2R, th = bearingDeg * D2R, dl = dKm / R;
  const sinP2 = Math.sin(p1) * Math.cos(dl) + Math.cos(p1) * Math.sin(dl) * Math.cos(th);
  const p2 = Math.asin(Math.min(1, Math.max(-1, sinP2)));
  const l2 = l1 + Math.atan2(
    Math.sin(th) * Math.sin(dl) * Math.cos(p1),
    Math.cos(dl) - Math.sin(p1) * sinP2
  );
  return [(((l2 * R2D) + 540) % 360) - 180, p2 * R2D];
}

export function bearingBetween(a, b) {
  const p1 = a[1] * D2R, p2 = b[1] * D2R, dL = (b[0] - a[0]) * D2R;
  const y = Math.sin(dL) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dL);
  return ((Math.atan2(y, x) * R2D) + 360) % 360;
}

// ── the journey object ───────────────────────────────────────────────
// Built once the origin is known. point(d) walks the great circle that
// passes through the origin heading due west.
export function makeJourney(originLngLat) {
  const [lng0, lat0] = originLngLat;

  const point = (dKm) => destination(lng0, lat0, HEADING, dKm);

  // travel heading at distance d (direction the camera should face)
  const headingAt = (dKm) => {
    const a = point(dKm);
    const b = point(dKm + Math.max(1, dKm * 1e-4));
    return bearingBetween(a, b);
  };

  // full-circle polyline with unwrapped longitudes (for the path line)
  const pathCoords = (() => {
    const N = 720, out = [];
    let prev = null;
    for (let i = 0; i <= N; i++) {
      let [lng, lat] = point((i / N) * CIRCUMFERENCE);
      if (prev !== null) {
        while (lng - prev > 180) lng -= 360;
        while (lng - prev < -180) lng += 360;
      }
      out.push([lng, lat]);
      prev = lng;
    }
    return out;
  })();

  const antipode = point(CIRCUMFERENCE / 2);

  return { origin: [lng0, lat0], point, headingAt, pathCoords, antipode };
}

// ── camera altitude curve ────────────────────────────────────────────
// Zoom keyframes anchored to the scroll axis via time, so the camera's
// climb and descent match how fast the ground moves per scroll unit.
const ZOOM_KEYS = (() => {
  const byYa = (ya, z) => [scrollFromYa(ya), z];
  const byT = (t, z) => [scrollFromYa(AGE - t), z];
  return [
    [0, 18.6],                 // 1 year ago: your own street, a few meters
    byYa(100, 18.2),
    byYa(1e3, 17.8),
    byYa(1e4, 16.8),           // all of history: ~29 m
    byYa(1e5, 15.2),           // 290 m
    byYa(1e6, 12.8),           // 2.9 km
    byYa(1e7, 10.2),           // 29 km
    byYa(1e8, 7.2),            // 290 km — the dinosaurs died out here
    byYa(1e9, 3.8),            // 2,900 km — the globe appears
    byYa(3e9, 2.0),
    byYa(5e9, 1.35),           // cruising the deep billions: whole planet in view
    byT(4e9, 1.35),
    byT(1e9, 3.8),             // 2,900 km from home
    byT(1e8, 6.6),             // cosmic dawn: first stars, ~300 km out
    byT(1e7, 9.6),             // 29 km left
    byT(1e6, 12.4),            // 2.9 km left
    byT(T_MIN, 14.8),          // 290 m left — segment C begins
    [1, 17.8],                 // home
  ].sort((a, b) => a[0] - b[0]);
})();

export function zoomFromScroll(s) {
  const K = ZOOM_KEYS;
  if (s <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++) {
    if (s <= K[i][0]) {
      const [s0, z0] = K[i - 1], [s1, z1] = K[i];
      const u = (s - s0) / (s1 - s0);
      const e = u * u * (3 - 2 * u);                 // smoothstep between keys
      return z0 + (z1 - z0) * e;
    }
  }
  return K[K.length - 1][1];
}

export const pitchFromZoom = (z) => Math.min(60, Math.max(4, (z - 2.6) * 5.2));

// shortest-path angle interpolation for bearing smoothing
export function lerpAngle(a, b, t) {
  let d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}
