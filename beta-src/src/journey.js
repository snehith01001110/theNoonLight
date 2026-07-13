// ── journey math ──────────────────────────────────────────────────────
// One trip around the Earth = the age of the universe, at true scale.
// Distance along the great circle is ALWAYS d = (years_ago / AGE) × C.
// Scroll, however, is logarithmic in time so recent history is explorable.

import { AGE } from './data/events.js';
import { isLand } from './data/landmask.js';

export const CIRCUMFERENCE = 40075.017;              // km, equatorial
export const KM_PER_YEAR = CIRCUMFERENCE / AGE;      // ≈ 2.9e-9 km ≈ 2.9 mm
const R = CIRCUMFERENCE / (2 * Math.PI);             // radius consistent with C
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

export const HEADING = 270;                          // fallback heading (due west)

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

// ── near-field camera drive ──────────────────────────────────────────
// At true scale, everything younger than ~STREET_DRIVE_YA sits within a few
// hundred metres of the start, so the camera would barely move while you scroll
// past hundreds of events — the map reads as a static backdrop. Through that
// near field we advance the camera along the line on a *visual odometer* (the
// HUD still reports the honest true distance), handing back to strict true-scale
// exactly where the two curves meet. Beyond the handoff the camera is 100%
// honest again. Because the odometer only ever runs AHEAD of the true position
// and rejoins it, the camera never moves backward.
// One dial: larger = more camera travel through the near field (more "journey"),
// but the camera runs further ahead of the honest distance readout mid-drive.
// 0.30 ≈ 210 m of drive, 0.32 ≈ 430 m, 0.34 ≈ 910 m.
export const S_DRIVE = 0.32;                        // scroll where the drive hands off
export const STREET_DRIVE_YA = yaFromScroll(S_DRIVE);
const VF_MAX = distFromYa(STREET_DRIVE_YA);         // true distance at the handoff
const smooth01 = (u) => { u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * (3 - 2 * u); };

// The furniture prologue: for the first sliver of scroll the camera holds at
// true (room) scale so events show at real furniture size; only once you've
// risen out of the room does the odometer drive begin.
export const S_ROOM = 0.05;
const D_ROOM = distFromYa(yaFromScroll(S_ROOM));    // true distance at room exit (~cm)

export function camDistFromScroll(s) {
  const trueD = distFromYa(yaFromScroll(s));
  if (s <= S_ROOM || s >= S_DRIVE) return trueD;    // in the room, or honest deep time
  const u = (s - S_ROOM) / (S_DRIVE - S_ROOM);
  const floor = D_ROOM + (VF_MAX - D_ROOM) * smooth01(u);
  return Math.max(trueD, floor);
}

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

// ── pick a land-rich heading ──────────────────────────────────────────
// Every great circle through the origin is a candidate; choose the one that
// spends the most of its length over land, so the journey crosses continents
// rather than open ocean. Runs once, when the origin is known.
export function bestLandHeading(lng, lat) {
  const N = 480;                                 // samples along each candidate circle
  let bestH = HEADING, bestLand = -1;
  for (let h = 0; h < 360; h += 2) {
    let land = 0;
    for (let i = 0; i < N; i++) {
      const [x, y] = destination(lng, lat, h, (i / N) * CIRCUMFERENCE);
      if (isLand(x, y)) land++;
    }
    if (land > bestLand) { bestLand = land; bestH = h; }
  }
  return bestH;
}

// ── the journey object ───────────────────────────────────────────────
// Built once the origin is known. point(d) walks the great circle that
// passes through the origin heading due west.
export function makeJourney(originLngLat) {
  const [lng0, lat0] = originLngLat;
  const heading = bestLandHeading(lng0, lat0);   // aim the great circle over the most land

  const point = (dKm) => destination(lng0, lat0, heading, dKm);

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

  return { origin: [lng0, lat0], heading, point, headingAt, pathCoords, antipode };
}

// ── camera altitude curve ────────────────────────────────────────────
// Zoom keyframes anchored to the scroll axis via time, so the camera's
// climb and descent match how fast the ground moves per scroll unit.
const ZOOM_KEYS = (() => {
  const byYa = (ya, z) => [scrollFromYa(ya), z];
  const byT = (t, z) => [scrollFromYa(AGE - t), z];
  return [
    [0, 24.3],                 // inside the room: furniture at true scale
    [S_ROOM, 22.0],            // the whole room in view, rising toward the roof
    byYa(120, 20.0),           // out through the roof, into the street
    byYa(1e3, 18.4),
    byYa(1e4, 17.4),           // all of history: ~29 m
    byYa(1e5, 15.9),           // 290 m
    byYa(1e6, 13.4),           // 2.9 km
    byYa(1e7, 10.7),           // 29 km
    byYa(1e8, 7.5),            // 290 km — the dinosaurs died out here
    byYa(1e9, 3.9),            // 2,900 km — the globe appears
    byYa(3e9, 2.0),
    byYa(5e9, 1.35),           // cruising the deep billions: whole planet in view
    byT(4e9, 1.35),
    byT(1e9, 3.9),             // 2,900 km from home
    byT(1e8, 6.8),             // cosmic dawn: first stars, ~300 km out
    byT(1e7, 10.0),            // 29 km left
    byT(1e6, 13.0),            // 2.9 km left
    byT(T_MIN, 15.5),          // 290 m left — segment C begins
    [1, 18.6],                 // home
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

// Gentle tilt overall, and flatter (more top-down) once we're close in so the
// street frame stays a tidy patch instead of a wall of blocks to the horizon.
export const pitchFromZoom = (z) => {
  // inside the room (very high zoom) tilt up to see the furniture in 3D
  if (z >= 21) return Math.min(58, 32 + (z - 21) * 6.2);
  const base = Math.min(44, Math.max(0, (z - 3) * 3.4));
  const topDown = z > 15 ? Math.min(1, (z - 15) / 4) * 12 : 0;
  return Math.max(0, base - topDown);
};

// shortest-path angle interpolation for bearing smoothing
export function lerpAngle(a, b, t) {
  let d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}
