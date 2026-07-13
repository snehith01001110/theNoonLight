// ── set pieces ────────────────────────────────────────────────────────
// Low-poly Three.js monuments standing on the path at major deep-time
// events. Loaded lazily — nothing here runs until the journey starts.

import * as THREE from 'three';
import maplibregl from 'maplibre-gl';
import { zoomFromScroll, STREET_DRIVE_YA } from './journey.js';
import { formatWhen } from './format.js';
import { makeRoom } from './room.js';

const FLAT = (color, emissive = 0x000000, ei = 0) =>
  new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, flatShading: true, roughness: 0.9, metalness: 0 });

// ---- monument builders (pure primitives, toy-town proportions) -------
function mObelisk(c = 0xc98bff) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 1.1, 6), FLAT(0xe9dfcb));
  shaft.position.y = 0.55;
  const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), FLAT(c, c, 0.55));
  gem.position.y = 1.32;
  gem.userData.spin = true;
  g.add(shaft, gem);
  return g;
}
function mDino() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 7, 5), FLAT(0x8fbf86));
  body.scale.set(1.7, 1, 0.9); body.position.y = 0.52;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.15, 0.85, 6), FLAT(0x8fbf86));
  neck.position.set(0.52, 0.95, 0); neck.rotation.z = -0.5;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), FLAT(0x8fbf86));
  head.position.set(0.78, 1.3, 0);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.95, 6), FLAT(0x8fbf86));
  tail.position.set(-0.72, 0.5, 0); tail.rotation.z = 1.85;
  for (const dx of [-0.28, 0.22]) for (const dz of [-0.16, 0.16]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.5, 5), FLAT(0x7fae77));
    leg.position.set(dx, 0.25, dz); g.add(leg);
  }
  g.add(body, neck, head, tail);
  return g;
}
function mAsteroid() {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), FLAT(0x9a8f7d));
  rock.position.y = 1.5;
  const fire = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1, 6), FLAT(0xffb35c, 0xff7b3a, 0.9));
  fire.position.y = 2.1; fire.rotation.z = 0.25;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 18), FLAT(0xd97e4a, 0xd97e4a, 0.4));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.06;
  g.add(rock, fire, ring);
  rock.userData.spin = true;
  return g;
}
function mTrilobite() {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), FLAT(0xb08bd9));
  shell.scale.set(1.5, 0.6, 1); shell.position.y = 0.05;
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Mesh(new THREE.TorusGeometry(0.36 - i * 0.05, 0.035, 5, 12, Math.PI), FLAT(0x9a76c4));
    seg.rotation.x = -Math.PI / 2; seg.rotation.z = Math.PI / 2;
    seg.position.set(-0.1 + i * 0.14, 0.24, 0);
    seg.scale.y = 0.9;
    g.add(seg);
  }
  g.add(shell);
  return g;
}
function mVent() {
  const g = new THREE.Group();
  for (const [x, h, r] of [[-0.3, 0.9, 0.2], [0.1, 1.4, 0.26], [0.45, 0.7, 0.16]]) {
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r, h, 6), FLAT(0x6f6154));
    chimney.position.set(x, h / 2, 0);
    const smoke = new THREE.Mesh(new THREE.SphereGeometry(r * 0.8, 5, 4), FLAT(0x3c3f52, 0x8a7bff, 0.35));
    smoke.position.set(x, h + r * 0.6, 0);
    smoke.userData.bob = Math.random() * 6;
    g.add(chimney, smoke);
  }
  return g;
}
function mIce() {
  const g = new THREE.Group();
  for (const [x, y, s, rz] of [[0, 0.7, 0.55, 0.2], [-0.5, 0.35, 0.3, -0.4], [0.5, 0.3, 0.26, 0.5]]) {
    const spike = new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), FLAT(0xbfe3ef, 0x9fd8ef, 0.25));
    spike.position.set(x, y, 0); spike.rotation.z = rz;
    spike.scale.y = 2.1;
    g.add(spike);
  }
  return g;
}
function mProtoEarth() {
  const g = new THREE.Group();
  const planet = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), FLAT(0x8a4a3a, 0xff5a2a, 0.5));
  planet.position.y = 1.1; planet.userData.spin = true;
  const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), FLAT(0xcfc6b8));
  moon.position.set(0.95, 1.35, 0); moon.userData.orbit = { cx: 0, cy: 1.1, r: 0.95 };
  g.add(planet, moon);
  return g;
}
function mSun() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), FLAT(0xffd98a, 0xffb135, 1.2));
  core.position.y = 1.2; core.userData.spin = true;
  for (let i = 0; i < 8; i++) {
    const ray = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4, 4), FLAT(0xffc45c, 0xff9c2a, 0.8));
    const a = (i / 8) * Math.PI * 2;
    ray.position.set(Math.cos(a) * 0.95, 1.2 + Math.sin(a) * 0.95, 0);
    ray.rotation.z = a - Math.PI / 2;
    g.add(ray);
  }
  g.add(core);
  return g;
}
// which deep-time events get bespoke set pieces (matched by title).
// Nothing within the last 12k years: the user's real streets stay real —
// no fabricated structures next to their house.
const SPECIALS = [
  ['Chicxulub asteroid impact', mAsteroid], ['The dinosaurs die', mDino],
  ['First dinosaurs', mDino], ['Argentinosaurus, largest dinosaur', mDino],
  ['First trilobites', mTrilobite],
  ['Snowball Earth', mIce], ['Sturtian glaciation', mIce],
  ['First life (LUCA)', mVent],
  ['Earth forms', mProtoEarth], ['The Moon forms', mProtoEarth],
  ['The Sun ignites', mSun],
];

const METERS_PER_PX = (zoom, lat) =>
  (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);

export function makeMonumentLayer(map, placedEvents, journey) {
  // pick monument events: bespoke specials + generic obelisks for other
  // notable deep-time events (spread out so they don't stack)
  const items = [];
  const used = new Set();
  for (const [title, builder] of SPECIALS) {
    const ev = placedEvents.find((p) => p.title === title);
    if (ev && !used.has(ev.i)) { used.add(ev.i); items.push({ ev, builder }); }
  }
  let lastS = -1;
  for (const ev of placedEvents) {
    if (ev.ya < STREET_DRIVE_YA || used.has(ev.i)) continue;  // none in the driven near field
    if (ev.s - lastS < 0.012) continue;          // keep them spaced in scroll
    lastS = ev.s;
    items.push({ ev, builder: () => mObelisk() });
  }
  // ground monuments only work while the ground is a stage — at orbital
  // zooms, and for anything before Earth existed, sky effects take over
  const keep = items.filter(({ ev }) =>
    ev.ya >= STREET_DRIVE_YA && ev.ya < 4.55e9 && zoomFromScroll(ev.s) >= 4.5);
  items.length = 0;
  items.push(...keep);

  let renderer = null;
  const built = new Map();     // item -> {scene, group}
  const labels = new Map();    // item -> maplibregl.Marker (DOM caption)
  let curS = 0;
  let roomBuilt = null;        // the opening furniture-scale room (lazy)

  // the opening room: a real-metre-scale set, oriented along the line, shown
  // only at the very start (very high zoom) and cross-fading with the map
  function buildRoom() {
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xfff4e0, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(0.5, 1.2, 0.6);
    scene.add(sun);
    const group = makeRoom();
    group.rotation.y = -(journey.heading * Math.PI) / 180;   // align with the path
    group.traverse((o) => { if (o.material) o.userData.baseOp = o.material.opacity; });
    scene.add(group);
    return { scene, group };
  }

  // each monument captions itself with the single event it marks (title + when),
  // so it's clear these are moments, not eras
  function showLabel(it) {
    if (labels.has(it)) return;
    const el = document.createElement('div');
    el.className = 'mon-label';
    el.innerHTML =
      `<span class="mon-title">${it.ev.title}</span>` +
      `<span class="mon-when">${formatWhen(it.ev.ya)}</span>`;
    const mk = new maplibregl.Marker({ element: el, anchor: 'top', offset: [0, 12] })
      .setLngLat([it.ev.lng, it.ev.lat]).addTo(map);
    requestAnimationFrame(() => el.classList.add('show'));
    labels.set(it, mk);
  }
  function hideLabel(it) {
    const mk = labels.get(it);
    if (!mk) return;
    mk.getElement().classList.remove('show');
    labels.delete(it);
    setTimeout(() => mk.remove(), 400);
  }

  function buildItem(it) {
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xfff4e0, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(0.6, 1, 0.4);
    scene.add(sun);
    const group = it.builder();
    // scale so the piece reads ~80 px tall at the zoom it's met at, but
    // never taller than ~a third of its distance from the start — pieces
    // near the doorstep must stay street furniture, not skyscrapers
    const z = zoomFromScroll(it.ev.s);
    const scale = Math.min(80 * METERS_PER_PX(z, it.ev.lat), Math.max(5, it.ev.d * 1000 * 0.35));
    group.scale.setScalar(scale);
    scene.add(group);
    return { scene, group };
  }

  const layer = {
    id: 'noonlight-monuments',
    type: 'custom',
    renderingMode: '3d',
    onAdd(m, gl) {
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
    },
    render(gl, args) {
      const t = performance.now() / 1000;
      let any = false;

      // opening room — only at the very start (very high zoom)
      const roomOp = Math.min(1, Math.max(0, (map.getZoom() - 20) / 2.5));
      if (roomOp > 0.01) {
        if (!roomBuilt) roomBuilt = buildRoom();
        const { scene, group } = roomBuilt;
        group.traverse((o) => { if (o.material) o.material.opacity = o.userData.baseOp * roomOp; });
        const modelMatrix = map.transform.getMatrixForModel(journey.origin, 0);
        const camera = new THREE.Camera();
        camera.projectionMatrix = new THREE.Matrix4()
          .fromArray(args.defaultProjectionData.mainMatrix)
          .multiply(new THREE.Matrix4().fromArray(modelMatrix));
        renderer.resetState();
        renderer.render(scene, camera);
        any = true;
      }

      for (const it of items) {
        if (Math.abs(it.ev.s - curS) > 0.05) continue;
        if (!built.has(it)) built.set(it, buildItem(it));
        const { scene, group } = built.get(it);

        // little idle life
        group.traverse((o) => {
          if (o.userData.spin) o.rotation.y = t * 0.5;
          if (o.userData.bob !== undefined) o.position.y += Math.sin(t * 1.4 + o.userData.bob) * 0.0012;
          if (o.userData.orbit) {
            const { cy, r } = o.userData.orbit;
            o.position.set(Math.cos(t * 0.7) * r, cy + Math.sin(t * 0.7) * r * 0.25, Math.sin(t * 0.7) * r * 0.6);
          }
        });

        const modelMatrix = map.transform.getMatrixForModel([it.ev.lng, it.ev.lat], 0);
        const camera = new THREE.Camera();
        camera.projectionMatrix = new THREE.Matrix4()
          .fromArray(args.defaultProjectionData.mainMatrix)
          .multiply(new THREE.Matrix4().fromArray(modelMatrix));
        renderer.resetState();
        renderer.render(scene, camera);
        any = true;
      }
      if (any) map.triggerRepaint();
    },
  };

  return {
    layer,
    eventIds: new Set(items.map((it) => it.ev.i)),
    setScroll(s) {
      curS = s;
      for (const it of items) {
        if (Math.abs(it.ev.s - s) < 0.045) showLabel(it); else hideLabel(it);
      }
    },
    hasNearby(s) { return items.some((it) => Math.abs(it.ev.s - s) < 0.05); },
  };
}

