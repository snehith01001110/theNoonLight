// ── UI: intro & location, HUD, captions, finale ──────────────────────
import { AGE, eraOf } from './data/events.js';
import { CIRCUMFERENCE, distFromYa, scrollFromYa } from './journey.js';
import { formatYearsAgo, formatDistance } from './format.js';

const $ = (id) => document.getElementById(id);
const SF = { lng: -122.4194, lat: 37.7749, label: 'San Francisco (default)' };

// ── location acquisition ─────────────────────────────────────────────
// 1. browser geolocation → 2. ipwho.is → 3. San Francisco, clearly labeled.
// Search (Nominatim) and pick-on-globe are user-initiated overrides.
export function setupIntro(map, onStart) {
  const status = $('loc-status');
  let started = false;

  const begin = (lng, lat, label) => {
    if (started) return;
    started = true;
    $('intro').classList.add('leaving');
    setTimeout(() => { $('intro').hidden = true; }, 950);
    onStart({ lng, lat, label });
  };

  $('btn-geo').addEventListener('click', () => {
    if (!('geolocation' in navigator)) return ipFallback('Geolocation unsupported');
    status.textContent = 'Finding you…';
    status.classList.remove('err');
    // getCurrentPosition's own timeout only starts once permission is
    // granted — a watchdog covers an ignored/hung permission prompt too
    let settled = false;
    const watchdog = setTimeout(() => {
      if (!settled) { settled = true; ipFallback('Location timed out'); }
    }, 15000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true; clearTimeout(watchdog);
        begin(pos.coords.longitude, pos.coords.latitude, 'your location');
      },
      () => {
        if (settled) return;
        settled = true; clearTimeout(watchdog);
        ipFallback('Location denied');
      },
      { enableHighAccuracy: true, timeout: 13000, maximumAge: 60000 }
    );
  });

  async function ipFallback(why) {
    status.textContent = `${why} — estimating from your network…`;
    try {
      const res = await fetch('https://ipwho.is/');
      const j = await res.json();
      if (j && j.success && Number.isFinite(j.latitude)) {
        return begin(j.longitude, j.latitude, j.city ? `near ${j.city}` : 'near you (network estimate)');
      }
      throw new Error('ipwho failed');
    } catch {
      status.innerHTML = 'Couldn’t locate you — starting in San Francisco. You can also search a city below.';
      status.classList.add('err');
      setTimeout(() => begin(SF.lng, SF.lat, SF.label), 1600);
    }
  }

  // Nominatim search — only on explicit submit, per usage policy
  $('geo-search').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('search-input').value.trim();
    if (!q) return;
    status.textContent = 'Searching…';
    status.classList.remove('err');
    const box = $('search-results');
    box.innerHTML = '';
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=4&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const results = await res.json();
      if (!results.length) { status.textContent = 'No matches — try another spelling.'; return; }
      status.textContent = '';
      for (const r of results) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = r.display_name;
        b.addEventListener('click', () => begin(+r.lon, +r.lat, r.display_name.split(',')[0]));
        box.appendChild(b);
      }
    } catch {
      status.textContent = 'Search failed — check your connection.';
      status.classList.add('err');
    }
  });

  // pick on globe
  $('btn-pick').addEventListener('click', () => {
    const intro = $('intro');
    intro.classList.add('pick-mode');
    const banner = document.createElement('div');
    banner.id = 'pick-banner';
    banner.textContent = 'Tap anywhere on the globe to start your journey there';
    intro.querySelector('.intro-inner').appendChild(banner);
    map.once('click', (e) => begin(e.lngLat.lng, e.lngLat.lat, 'your chosen point'));
  });
}

// ── HUD ──────────────────────────────────────────────────────────────
export function makeHud() {
  const elTime = $('hud-time'), elEra = $('hud-era'), elDist = $('hud-dist');
  const ring = $('ring-fg'), ringDot = $('ring-dot');
  const RING_C = 2 * Math.PI * 19;
  const scrub = $('scrub');
  let lastTxt = '';

  return {
    show() { $('hud').hidden = false; $('scrub-wrap').hidden = false; },
    update(s, ya) {
      const d = distFromYa(ya);
      const txt = ya < 1.5 && s < 0.001 ? 'now' : formatYearsAgo(ya);
      if (txt !== lastTxt) {
        elTime.textContent = txt;
        elEra.textContent = eraOf(ya);
        lastTxt = txt;
      }
      elDist.textContent = `${formatDistance(d)} travelled`;
      ring.style.strokeDashoffset = RING_C * (1 - s);
      const a = s * 2 * Math.PI - Math.PI / 2;
      ringDot.setAttribute('cx', 22 + 19 * Math.cos(a));
      ringDot.setAttribute('cy', 22 + 19 * Math.sin(a));
      if (document.activeElement !== scrub) scrub.value = Math.round(s * 100000);
      scrub.style.setProperty('--p', s);
    },
    onScrub(fn) {
      scrub.addEventListener('input', () => fn(scrub.value / 100000));
    },
  };
}

// ── contextual captions ──────────────────────────────────────────────
const CAPTIONS = [
  { ya: [1, 40], text: 'At true scale, one year is 2.9 mm — this whole room is about two thousand years of history.' },
  { ya: [55, 95], text: 'Your whole lifetime so far: about 23 cm of this floor.' },
  { ya: [3800, 8000], text: 'All recorded history fits in the first fifteen meters from your door.' },
  { ya: [55e6, 82e6], text: 'The dinosaurs died out about 190 km from here.' },
  { ya: [4.4e9, 4.75e9], text: 'Beyond this point, Earth itself hasn’t formed yet. The road continues anyway.' },
  { ya: [6.55e9, 7.3e9], text: 'Halfway. The universe was half its current age when you were on the exact opposite side of the world.' },
  { t: [1.5e6, 6e7], text: 'The cosmic dark ages — nothing shines yet, anywhere. You’re nearly home.' },
  { t: [2.2e5, 7e5], text: 'First light: the universe turns transparent — about 1 km from your door.' },
  { t: [0, 9e4], text: 'The first atomic nuclei formed 29 cm from your starting point.' },
];

export function makeCaptions() {
  const el = $('caption');
  let current = -1;
  const ranges = CAPTIONS.map((c) => {
    const [a, b] = c.ya ? [scrollFromYa(c.ya[0]), scrollFromYa(c.ya[1])]
      : [scrollFromYa(AGE - c.t[1]), scrollFromYa(AGE - Math.max(1, c.t[0]))];
    return { a, b, text: c.text };
  });
  return (s) => {
    let hit = -1;
    for (let i = 0; i < ranges.length; i++) {
      if (s >= ranges[i].a && s <= ranges[i].b) { hit = i; break; }
    }
    if (hit === current) return;
    current = hit;
    if (hit === -1) { el.classList.remove('show'); return; }
    el.hidden = false;
    el.textContent = ranges[hit].text;
    el.classList.add('show');
  };
}

// ── chapter / era transitions ─────────────────────────────────────────
// A short, plain-language line about each chapter, shown once as you cross
// into it, so the journey reads as a story with named acts.
const ERA_BLURB = {
  'civilization': 'Cities, writing, empires — all of it in the last few meters.',
  'the human story': 'Our ancestors spread out, shaped tools, and learned to speak.',
  'age of mammals': 'After the dinosaurs, warm-blooded life inherits the Earth.',
  'age of dinosaurs': 'Giants rule the land for over 150 million years.',
  'first animals': 'The first complex creatures stir in the ancient seas.',
  'complex cells': 'Life is still microscopic — but cells grow a nucleus.',
  'first life': 'The earliest living things appear on a young planet.',
  'the Sun & Earth form': 'A cloud of dust collapses into our Sun and its worlds.',
  'the age of galaxies': 'Galaxies light up across a fast-expanding cosmos.',
  'first stars': 'The very first stars ignite in the cosmic dark.',
  'the big bang': 'The beginning of space, time, and everything. You are home.',
};

export function makeChapters() {
  const el = $('chapter'), name = $('chapter-name'), desc = $('chapter-desc');
  let current = null, timer = null;
  return (ya) => {
    const era = eraOf(ya);
    if (current === null) { current = era; return; }   // no banner for the starting chapter
    if (era === current) return;
    current = era;
    name.textContent = era;
    desc.textContent = ERA_BLURB[era] || '';
    el.hidden = false;
    // reflow so re-entering the same chapter still animates
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('show'), 3400);
  };
}

// ── event card ───────────────────────────────────────────────────────
export function makeCard() {
  const card = $('card');
  $('card-close').addEventListener('click', () => { card.hidden = true; });
  return {
    open(p, meta) {
      card.style.setProperty('--evt-c', p.color);
      $('card-when').textContent = meta.when;
      $('card-title').textContent = p.title;
      $('card-desc').textContent = p.desc;
      $('card-where').textContent = meta.where;
      card.hidden = false;
    },
    close() { card.hidden = true; },
  };
}

// ── finale ───────────────────────────────────────────────────────────
export function makeFinale(getOrigin, restart) {
  const finale = $('finale'), flash = $('finale-flash'), copy = $('finale-copy');
  let shown = false;

  function stats() {
    const o = getOrigin();
    $('finale-stats').innerHTML =
      `You travelled <strong>${Math.round(CIRCUMFERENCE).toLocaleString('en-US')} km</strong> — once around the Earth.<br/>` +
      `13.8 billion years, at <strong>2.9 mm per year</strong>.<br/>` +
      `Your lifetime: <strong>≈ 23 cm</strong>. All recorded history: <strong>≈ 15 m</strong>.<br/>` +
      `<span style="opacity:0.7">${o.label} · ${o.lat.toFixed(3)}°, ${o.lng.toFixed(3)}°</span>`;
  }

  $('btn-again').addEventListener('click', () => {
    shown = false;
    copy.classList.remove('show');
    setTimeout(() => { finale.hidden = true; copy.hidden = true; }, 400);
    restart();
  });

  $('btn-share').addEventListener('click', async () => {
    const o = getOrigin();
    const png = await drawShareCard(o);
    const file = new File([png], 'noonlight-journey.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'It all started right here' }); return; } catch { /* fall through */ }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(png);
    a.download = 'noonlight-journey.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });

  return {
    get shown() { return shown; },
    trigger() {
      if (shown) return;
      shown = true;
      stats();
      finale.hidden = false;
      copy.hidden = false;
      flash.style.transition = 'opacity 0.28s ease';
      flash.style.opacity = '1';
      setTimeout(() => {
        flash.style.transition = 'opacity 1.4s ease';
        flash.style.opacity = '0';
        copy.classList.add('show');
      }, 340);
    },
    dismissIfScrolledBack(s) {
      if (shown && s < 0.985) {
        shown = false;
        copy.classList.remove('show');
        setTimeout(() => { finale.hidden = true; copy.hidden = true; }, 400);
      }
    },
  };
}

async function drawShareCard(origin) {
  const cv = $('share-canvas');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#131628'); g.addColorStop(1, '#07080f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // stars
  for (let i = 0; i < 220; i++) {
    ctx.globalAlpha = 0.25 + Math.random() * 0.7;
    ctx.fillStyle = Math.random() < 0.2 ? '#ffd9a8' : '#dfeaff';
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H * 0.62, Math.random() * 2.4, 0, 6.28);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // point of light home
  const rg = ctx.createRadialGradient(W / 2, H * 0.36, 0, W / 2, H * 0.36, 130);
  rg.addColorStop(0, '#fff6e0'); rg.addColorStop(0.25, 'rgba(255,214,150,0.8)'); rg.addColorStop(1, 'rgba(255,214,150,0)');
  ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(W / 2, H * 0.36, 130, 0, 6.28); ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f6ecd6';
  ctx.font = '800 74px system-ui, sans-serif';
  ctx.fillText('13.8 billion years ago,', W / 2, H * 0.56);
  ctx.fillText('it all began right here.', W / 2, H * 0.63);
  ctx.font = '600 34px system-ui, sans-serif';
  ctx.fillStyle = '#c9c1a8';
  const lines = [
    `${origin.label} · ${origin.lat.toFixed(3)}°, ${origin.lng.toFixed(3)}°`,
    '',
    'One trip around the Earth = the age of the universe.',
    '1 year ≈ 2.9 mm · a lifetime ≈ 23 cm',
    'all recorded history ≈ the first 15 meters',
    'the dinosaurs ≈ 190 km away',
  ];
  lines.forEach((ln, i) => ctx.fillText(ln, W / 2, H * 0.71 + i * 52));
  ctx.font = '700 30px system-ui, sans-serif';
  ctx.fillStyle = '#e8a25c';
  ctx.fillText('thenoonlight.com/beta', W / 2, H * 0.955);
  return new Promise((r) => cv.toBlob(r, 'image/png'));
}

// ── reduced-motion step mode ─────────────────────────────────────────
export function setupStepMode(chapters, goTo) {
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  const steps = $('steps'), label = $('step-label');
  steps.hidden = false;
  let idx = 0;
  const apply = () => {
    label.textContent = chapters[idx].name;
    goTo(chapters[idx].s);
  };
  $('step-prev').addEventListener('click', () => { idx = Math.max(0, idx - 1); apply(); });
  $('step-next').addEventListener('click', () => { idx = Math.min(chapters.length - 1, idx + 1); apply(); });
  return { apply: () => apply() };
}
