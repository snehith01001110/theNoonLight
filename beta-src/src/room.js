// ── the opening room ──────────────────────────────────────────────────
// A generic low-poly room built at REAL-WORLD scale (metres, Y up), placed at
// the origin so the true-scale timeline runs across its floor like a tape
// measure. We can't know anyone's real interior, so this is an "imagine your
// room" stage. Everything here is tunable — positions are in metres, the
// timeline runs along local +Z (into the distance), sideways is local X.
import * as THREE from 'three';

// ── tunable layout (metres) ───────────────────────────────────────────
export const ROOM = {
  ground: 70,          // ground-cover plane (hides the blurry tiles beneath)
  width: 6,            // room interior across (X)
  depth: 6.5,          // room interior along the line (Z)
  wallH: 3,            // wall height
  wallT: 0.16,         // wall thickness
};

const FLAT = (color, opacity = 1) =>
  new THREE.MeshStandardMaterial({
    color, flatShading: true, roughness: 0.95, metalness: 0,
    transparent: true, opacity,
  });

const MAT = {
  ground: () => FLAT(0xefe7d6),
  floor: () => FLAT(0xe4d6bb),
  rug: () => FLAT(0xcf7f5a),
  wall: () => FLAT(0xf1ead9),
  wood: () => FLAT(0xb2946c),
  woodDark: () => FLAT(0x8f7452),
  fabric: () => FLAT(0xc98b6a),
  fabric2: () => FLAT(0x9fb5a6),
  metal: () => FLAT(0xb8b2a4),
  glass: () => FLAT(0xbfe0ef, 0.45),
  shade: () => FLAT(0xf3e4c2),
};

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}
function plane(w, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

// ── furniture (metres, sitting on the floor at y=0) ───────────────────
function mkTable(x, z) {
  const g = new THREE.Group();
  const wood = MAT.wood();
  g.add(box(1.2, 0.06, 0.75, wood, 0, 0.74, 0));           // top
  for (const dx of [-0.52, 0.52]) for (const dz of [-0.3, 0.3])
    g.add(box(0.06, 0.72, 0.06, MAT.woodDark(), dx, 0.36, dz)); // legs
  g.position.set(x, 0, z);
  return g;
}
function mkChair(x, z, rot = 0) {
  const g = new THREE.Group();
  const wood = MAT.woodDark();
  g.add(box(0.45, 0.05, 0.45, MAT.wood(), 0, 0.46, 0));    // seat
  g.add(box(0.45, 0.5, 0.05, MAT.wood(), 0, 0.72, -0.2));  // back
  for (const dx of [-0.18, 0.18]) for (const dz of [-0.18, 0.18])
    g.add(box(0.05, 0.46, 0.05, wood, dx, 0.23, dz));      // legs
  g.position.set(x, 0, z); g.rotation.y = rot;
  return g;
}
function mkCouch(x, z, rot = 0) {
  const g = new THREE.Group();
  const f = MAT.fabric();
  g.add(box(1.9, 0.35, 0.85, f, 0, 0.35, 0));              // base
  g.add(box(1.9, 0.2, 0.85, MAT.fabric(), 0, 0.62, 0));    // cushions
  g.add(box(1.9, 0.5, 0.2, f, 0, 0.6, -0.32));             // backrest
  for (const dx of [-0.95, 0.95]) g.add(box(0.2, 0.55, 0.85, f, dx, 0.42, 0)); // arms
  g.position.set(x, 0, z); g.rotation.y = rot;
  return g;
}
function mkLamp(x, z) {
  const g = new THREE.Group();
  g.add(box(0.3, 0.05, 0.3, MAT.metal(), 0, 0.03, 0));     // base
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), MAT.metal());
  pole.position.y = 0.78; g.add(pole);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.35, 10, 1, true), MAT.shade());
  shade.position.y = 1.6; g.add(shade);
  g.position.set(x, 0, z);
  return g;
}
function mkShelf(x, z, rot = 0) {
  const g = new THREE.Group();
  const wood = MAT.woodDark();
  g.add(box(1.0, 1.8, 0.3, MAT.wood(), 0, 0.9, 0));        // body
  for (const y of [0.5, 0.95, 1.4]) g.add(box(0.92, 0.04, 0.3, wood, 0, y, 0.01)); // shelves
  // a few books as color blocks
  const cols = [0xb5544a, 0x4a6ea8, 0xd8a24a, 0x6a9a63, 0xa86ab0];
  for (let i = 0; i < 5; i++) g.add(box(0.08, 0.28, 0.22, FLAT(cols[i]), -0.36 + i * 0.16, 1.06, 0.02));
  g.position.set(x, 0, z); g.rotation.y = rot;
  return g;
}
function mkPlant(x, z) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.28, 8), MAT.woodDark());
  pot.position.y = 0.14; g.add(pot);
  const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), FLAT(0x6f9a63));
  leaves.position.y = 0.5; leaves.scale.y = 1.4; g.add(leaves);
  g.position.set(x, 0, z);
  return g;
}

// ── the whole room ────────────────────────────────────────────────────
// Furniture sits to the SIDES (local ±X) so the timeline (local Z) stays clear.
export function makeRoom() {
  const g = new THREE.Group();
  const hw = ROOM.width / 2, hd = ROOM.depth / 2;

  g.add(plane(ROOM.ground, ROOM.ground, MAT.ground(), 0, 0.0, 0));     // tile cover
  g.add(plane(ROOM.width, ROOM.depth, MAT.floor(), 0, 0.01, 0));       // room floor
  g.add(plane(2.4, 3.2, MAT.rug(), -1.4, 0.02, 0.4));                  // rug off to one side

  // two walls forming a back corner (open toward the camera / along the line)
  g.add(box(ROOM.width, ROOM.wallH, ROOM.wallT, MAT.wall(), 0, ROOM.wallH / 2, -hd)); // back wall
  g.add(box(ROOM.wallT, ROOM.wallH, ROOM.depth, MAT.wall(), -hw, ROOM.wallH / 2, 0)); // left wall
  g.add(box(1.5, 1.25, 0.03, MAT.glass(), 0.9, 1.65, -hd + 0.02));     // window on back wall

  // furniture (kept off the central line)
  g.add(mkCouch(-hw + 0.7, -1.3, 0.15));
  g.add(mkShelf(-hw + 0.55, 1.6, Math.PI / 2));
  g.add(mkTable(hw - 1.4, -0.6));
  g.add(mkChair(hw - 1.4, 0.4, Math.PI));
  g.add(mkLamp(hw - 0.7, -2.0));
  g.add(mkPlant(hw - 0.6, 1.9));

  return g;
}
