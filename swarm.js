/* Noon's page, built in front of you by a swarm of agent cursors.

   The page is plain HTML (so search engines and no-JS visitors get it whole);
   this script marks every visible piece as a layer and hides it. Agents, each
   a cursor in one of the theme's colours, arrive in small packs, claim a layer
   near them, travel to it, drag out a wireframe in their own colour with
   corner handles and a size tag, and fill it in: text is typed out,
   buttons and images get a placeholder first, blocks resolve from a blur. An
   agent with nothing to build in view fades out where it is, and fades back
   in when it heads for the next layer; once the page is built they are all
   gone and the canvas is removed. The camera follows the build front until
   you scroll yourself; the build runs at 4×. With Reduce Motion the page is
   simply shown. */
(() => {
"use strict";

const PALETTE = ["#7daea3", "#d3869b", "#a9b665", "#d8a657", "#e78a4e", "#ebdbb2"]; // aqua, pink, green, amber, orange, cream
const RED = "#ea6962";     // measures: the theme's red
const INK = "#0f0e0c";
const NAMES = ["Claude Code", "Codex"];

// What counts as a layer, in the order it is matched. Kinds: text is typed
// character by character; button and image get a placeholder; block resolves
// from a blur (the live demos, whose text is rewritten by demos.js); frame is
// a container that appears before the layers inside it.
const SPEC = [
  [".eye", "text"], [".hero h1 .logo", "image"],
  [".sub", "text"], [".hero .btn", "button"], [".hero .fine", "text"], [".works", "text"],
  [".head h2", "text"], [".head p", "text"],
  [".window", "frame"], [".titlebar", "block"], [".side .label", "block"], [".task", "block"],
  [".changes", "frame"], [".ch-title", "block"], [".status", "block"],
  [".canvas", "frame"], ["#map .edge", "block"], ["#map .card", "block"], ["#map .token", "block"], [".canvas .hint", "block"],
  [".hint.below", "text"],
  [".panel.ws", "frame"], [".repo", "frame"], [".repo .tree-head", "block"], [".repo .tree li", "text"], ["#ws-new", "button"],
  [".ws-arrow", "block"], ["#ws-copies", "block"],
  [".term", "frame"], [".term-head", "block"], [".term-out", "block"],
  ["#git-panel", "frame"], ["#git", "block"],
  [".facts li", "text"],
  [".faq details", "text"],
  [".chips li", "text"], [".steps li", "text"], [".center .btn", "button"], [".brew", "text"],
  ["footer .f-row > *", "text"], ["footer details", "text"], ["footer > p", "text"],
];

// Drawn first, before the rest of the page: the Noon logo and the tagline.
const OPENING = ".hero h1 .logo, .hero .sub";

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const turn = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from)); // the short way round, in -π..π

/* ── boot ────────────────────────────────────────────────────────── */

function boot() {
  const main = document.querySelector("main.wrap");
  if (!main) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.body.classList.remove("sw-hold");
    return;
  }
  start(main);
}

/* ── layers ──────────────────────────────────────────────────────── */

function collectLayers(main) {
  const seen = new Set();
  const list = [];
  for (const [sel, kind] of SPEC) {
    for (const el of main.querySelectorAll(sel)) {
      if (seen.has(el)) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      list.push({ el, kind, textEl: el.tagName === "DETAILS" ? el.querySelector("summary") : el, state: "pending", parent: null });
    }
  }
  list.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  for (const L of list) L.el.swLayer = L;
  for (const L of list) L.opening = L.el.matches(OPENING);
  for (const L of list) {
    let p = L.el.parentElement;
    while (p && !p.swLayer) p = p.parentElement;
    L.parent = p ? p.swLayer : null;
  }
  return list;
}

const rectOf = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
};

// Wrap each character of the element's text in a span, keeping the markup
// around it (b, a, code). The original markup is restored once typed.
function wrapChars(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const spans = [];
  for (const node of nodes) {
    if (!node.nodeValue.trim()) continue;
    // Words this device doesn't show ("Click" on a phone) aren't typed: their
    // spans would have no position for the cursor to follow.
    if (!node.parentElement.getClientRects().length) continue;
    const frag = document.createDocumentFragment();
    for (const ch of node.nodeValue) {
      const s = document.createElement("span");
      s.className = "sw-ch";
      s.textContent = ch;
      frag.appendChild(s);
      spans.push(s);
    }
    node.parentNode.replaceChild(frag, node);
  }
  return spans;
}

/* ── the run ─────────────────────────────────────────────────────── */

function start(main) {
  const layers = collectLayers(main);
  for (const L of layers) L.el.classList.add("sw-layer", "sw-pending");
  document.body.classList.remove("sw-hold");

  // Overlay: the canvas.
  const canvas = document.createElement("canvas");
  canvas.className = "sw-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d");
  document.body.appendChild(canvas);

  let dpr = 1;
  const viewW = () => document.documentElement.clientWidth; // the canvas's width: the viewport less any scrollbar
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(viewW() * dpr);
    canvas.height = Math.round(innerHeight * dpr);
  }

  // State.
  let phase = "build";     // build → done
  let lastY = scrollY;
  const speed = 4;     // fixed: the build is quick and quiet
  let done = 0;
  let last = performance.now();
  let raf = 0;
  const frames = [];     // wireframes: {x,y,w,h,p,alpha,tag,hold}
  const phs = [];        // placeholders: {x,y,w,h,color,alpha}
  const measures = [];   // red distance guides: {a,b,until}
  const recent = [];     // the last few finished layers, for measures
  let agents = [];

  /* agents */
  function spawnPoint() {
    const side = Math.floor(rnd(0, 4));
    const w = innerWidth, h = innerHeight;
    const p = side === 0 ? [rnd(0, w), -40] : side === 1 ? [w + 40, rnd(0, h)] : side === 2 ? [rnd(0, w), h + 40] : [-40, rnd(0, h)];
    return { x: p[0] + scrollX, y: p[1] + scrollY };
  }
  function makeAgents() {
    const n = clamp(Math.round((innerWidth * innerHeight) / 105000), 6, 14);
    const list = [];
    let pack = 0;
    while (list.length < n) {
      const size = Math.min(pick([1, 1, 2, 2, 3, 4]), n - list.length);
      const color = PALETTE[pack % PALETTE.length];
      let leader = null;
      for (let i = 0; i < size; i++) {
        const p = spawnPoint();
        const a = {
          id: list.length, name: `${NAMES[list.length % 2]} ${list.length + 1}`, color, pack, rank: i,
          leader, x: p.x, y: p.y, vx: 0, vy: 0, ang: 0, alpha: 0,
          state: "idle", wait: rnd(0.2, 1.4), tx: p.x, ty: p.y, job: null, hist: [], alphaGoal: 1,
        };
        if (!leader) leader = a;
        list.push(a);
      }
      pack++;
    }
    return list;
  }
  function spring(a, tx, ty, k, d, dt) {
    a.vx += ((tx - a.x) * k - a.vx * d) * dt;
    a.vy += ((ty - a.y) * k - a.vy * d) * dt;
    const sp = Math.hypot(a.vx, a.vy);
    const max = 3200;
    if (sp > max) { a.vx *= max / sp; a.vy *= max / sp; }
    a.x += a.vx * dt;
    a.y += a.vy * dt;
  }

  /* claiming work */
  function ready(L) { return !L.parent || L.parent.state !== "pending"; }
  function claim(a) {
    // The nearest pending layer in view (plus a little below it); when the
    // view is built, the first one above it, so the page fills in behind.
    const top = scrollY - 60, bottom = scrollY + innerHeight + 200;
    let best = null, bestScore = Infinity, above = null;
    // The logo and the tagline are drawn before anything else: until both are
    // done, nothing else is claimed.
    const openingLeft = layers.some((L) => L.opening && L.state !== "done");
    for (const L of layers) {
      if (L.state !== "pending" || !ready(L)) continue;
      if (openingLeft && !L.opening) continue;
      const r = rectOf(L.el);
      if (r.y > bottom) break;
      if (r.y + r.h < top) { if (!above) { above = L; above.rect = r; } continue; }
      const score = Math.hypot(r.x - a.x, r.y - a.y);
      if (score < bestScore) { best = L; bestScore = score; best.rect = r; }
    }
    if (!best) best = above;
    if (!best) return null;
    best.state = "active";
    return best;
  }
  function startJob(a, L) {
    const r = L.rect;
    const frame = { x: r.x, y: r.y, w: r.w, h: r.h, p: 0, alpha: 1, tag: true, hold: 0, color: a.color }; // in the colour of the agent drawing it
    frames.push(frame);
    a.job = { L, r, frame, t: 0, dur: clamp(Math.hypot(r.w, r.h) / 1100, 0.22, 0.85), ph: null, spans: null, i: 0, rate: 0 };
    a.state = "go";
  }
  function finishLayer(a) {
    const { L, frame } = a.job;
    const el = L.el;
    if (a.job.spans) {
      L.textEl.innerHTML = a.job.saved;
      L.textEl.classList.remove("sw-typing");
    }
    el.classList.remove("sw-pending", "sw-ghost");
    setTimeout(() => el.classList.remove("sw-layer"), 700);
    L.state = "done";
    done++;
    el.dispatchEvent(new CustomEvent("sw:built", { bubbles: true }));
    frame.hold = rnd(0.5, 1.4);
    frame.tag = false;
    // A red distance guide to a neighbour, now and then.
    if (!measures.length && Math.random() < 0.12) {
      const r = rectOf(el);
      for (const M of recent) {
        const q = rectOf(M.el);
        const overlap = Math.min(r.x + r.w, q.x + q.w) - Math.max(r.x, q.x);
        const gap = q.y >= r.y + r.h ? q.y - (r.y + r.h) : r.y >= q.y + q.h ? r.y - (q.y + q.h) : -1;
        if (overlap > 24 && gap > 4 && gap < 160) { measures.push({ a: r, b: q, until: rnd(0.6, 0.9) }); break; }
      }
    }
    recent.unshift(L);
    if (recent.length > 6) recent.pop();
    a.job = null;
    a.state = "idle";
    a.wait = rnd(0.1, 0.5);
    a.tx = a.x; a.ty = a.y;
    if (done === layers.length) phase = "done";
  }
  function beginFill(a) {
    const j = a.job, L = j.L, el = L.el;
    j.t = 0;
    if (L.kind === "text") {
      j.saved = L.textEl.innerHTML;
      j.spans = wrapChars(L.textEl);
      j.rate = clamp(j.spans.length / 2.2, 26, 150);
      el.classList.remove("sw-pending");
      L.textEl.classList.add("sw-typing");
      if (!j.spans.length) finishLayer(a);
    } else if (L.kind === "button" || L.kind === "image") {
      j.ph = { x: j.r.x, y: j.r.y, w: j.r.w, h: j.r.h, color: L.kind === "button" ? "#ebdbb2" : "#59534b", alpha: 0, r: L.kind === "button" ? Math.min(j.r.h / 2, 999) : 8 };
      phs.push(j.ph);
    } else if (L.kind === "block") {
      el.classList.add("sw-ghost");
      el.classList.remove("sw-pending");
    } else {
      el.classList.remove("sw-pending");
    }
  }

  /* one frame */
  function step(dt) {
    const jdt = dt * speed;
    // Cursors that aren't working ride along with the viewport when the
    // page is scrolled, so they stay in view; working ones stay on their layer.
    const dy = scrollY - lastY;
    lastY = scrollY;
    if (dy) for (const a of agents) {
      const busy = a.job || (a.leader && a.leader.job);
      if (busy) continue;
      a.y += dy; a.ty += dy;
      for (const h of a.hist) h.y += dy;
    }
    for (const a of agents) {
      // Fade in when there is work; fade out where it is when there isn't.
      const lead = a.leader || a;
      a.alphaGoal = lead.state === "rest" ? 0 : 1;
      a.alpha += clamp(a.alphaGoal - a.alpha, -dt * 3, dt * 4);

      if (a.leader) {
        if (lead.state === "rest") {
          // Nothing to do: come to a stop while fading out.
          spring(a, a.x, a.y, 40, 10, dt);
        } else {
          // Moving: trail the leader along its recent path.
          const h = lead.hist;
          const k = Math.min(h.length - 1, 7 * a.rank);
          const p = h.length ? h[h.length - 1 - k] : lead;
          const off = 10 * a.rank;
          spring(a, p.x - off * 0.6, p.y + off * 0.4, 70, 12, dt);
        }
      } else if (a.state === "idle") {
        // Just finished (or just arrived): a beat, then the next layer, or rest.
        a.wait -= jdt;
        spring(a, a.tx, a.ty, 38, 9, jdt);
        if (a.wait <= 0) {
          const L = phase === "build" ? claim(a) : null;
          if (L) startJob(a, L);
          else { a.state = "rest"; a.wait = rnd(0.3, 0.7); }
        }
      } else if (a.state === "rest") {
        // Hidden, riding along with the screen; check for work now and then.
        spring(a, a.x, a.y, 40, 10, dt);
        a.wait -= jdt;
        if (a.wait <= 0 && phase === "build") {
          a.wait = rnd(0.3, 0.7);
          const L = claim(a);
          if (L) startJob(a, L);
        }
      } else if (a.state === "go") {
        const j = a.job;
        spring(a, j.r.x, j.r.y, 110, 15, jdt);
        if (Math.hypot(j.r.x - a.x, j.r.y - a.y) < 5 && Math.hypot(a.vx, a.vy) < 120) {
          a.x = j.r.x; a.y = j.r.y; a.vx = a.vy = 0;
          a.state = "draw";
          j.t = 0;
        }
      } else if (a.state === "draw") {
        const j = a.job;
        j.t = Math.min(1, j.t + jdt / j.dur);
        const p = ease(j.t);
        a.x = j.r.x + j.r.w * p;
        a.y = j.r.y + j.r.h * p;
        a.vx = a.vy = 0;
        j.frame.p = p;
        if (j.t >= 1) { a.state = "fill"; beginFill(a); }
      } else if (a.state === "fill") {
        const j = a.job, L = j.L;
        j.t += jdt;
        if (L.kind === "text") {
          j.i = Math.min(j.spans.length, j.i + j.rate * jdt);
          const n = Math.floor(j.i);
          for (let k = j.shown || 0; k < n; k++) j.spans[k].classList.add("on");
          j.shown = n;
          const s = j.spans[Math.max(0, n - 1)];
          const cr = s.getBoundingClientRect();
          spring(a, cr.right + scrollX + 1, cr.top + scrollY + cr.height / 2, 160, 18, jdt);
          if (n >= j.spans.length) finishLayer(a);
        } else if (L.kind === "button" || L.kind === "image") {
          const ph = j.ph;
          ph.alpha = j.t < 0.75 ? Math.min(1, j.t / 0.2) : Math.max(0, 1 - (j.t - 0.75) / 0.3);
          spring(a, j.r.x + j.r.w * 0.5, j.r.y + j.r.h * 0.55, 60, 11, jdt);
          if (j.t >= 0.75 && L.el.classList.contains("sw-pending")) L.el.classList.remove("sw-pending");
          if (j.t >= 1.05) { phs.splice(phs.indexOf(ph), 1); finishLayer(a); }
        } else if (L.kind === "block") {
          spring(a, j.r.x + j.r.w * 0.5, j.r.y + j.r.h * 0.5, 60, 11, jdt);
          if (j.t >= 0.4) L.el.classList.remove("sw-ghost");
          if (j.t >= 0.7) finishLayer(a);
        } else {
          spring(a, j.r.x + j.r.w, j.r.y, 60, 11, jdt);
          if (j.t >= 0.35) finishLayer(a);
        }
      }
      // Pointers point where they go.
      {
        const sp = Math.hypot(a.vx, a.vy);
        let goal = 0;
        if (sp > 160) goal = turn(Math.atan2(a.vy, a.vx) + (3 * Math.PI) / 4, 0);
        a.ang += turn(goal, a.ang) * Math.min(1, dt * 10);
        a.ang = turn(a.ang, 0); // keep it in -π..π
      }
      a.hist.push({ x: a.x, y: a.y });
      if (a.hist.length > 40) a.hist.shift();
    }

    for (let i = frames.length - 1; i >= 0; i--) {
      const f = frames[i];
      if (f.hold > 0) { f.hold -= jdt; if (f.hold <= 0) f.alpha = 0.999; }
      else if (f.alpha < 1) { f.alpha -= jdt * 2.2; if (f.alpha <= 0) frames.splice(i, 1); }
    }
    for (let i = measures.length - 1; i >= 0; i--) { measures[i].until -= jdt; if (measures[i].until <= 0) measures.splice(i, 1); }
  }

  /* drawing */
  function drawArrow(x, y, ang, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.scale(1.15, 1.15);
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, 16); ctx.lineTo(4.2, 12.3); ctx.lineTo(7, 18.4); ctx.lineTo(9.7, 17.1); ctx.lineTo(6.9, 11.3); ctx.lineTo(12, 11.3);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(11,10,8,0.9)";
    ctx.lineWidth = 1.3;
    ctx.lineJoin = "round";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.stroke();
    ctx.restore();
  }
  function chip(x, y, text, bg, fg, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "500 10px 'JetBrains Mono', ui-monospace, Menlo, monospace";
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(x, y, w, 15, 3);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + 5, y + 8);
    ctx.restore();
  }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const vx0 = scrollX, vy0 = scrollY, vx1 = scrollX + innerWidth, vy1 = scrollY + innerHeight;
    const onScreen = (x, y, w, h) => x + w > vx0 - 40 && x < vx1 + 40 && y + h > vy0 - 40 && y < vy1 + 40;

    ctx.translate(-scrollX, -scrollY);

    for (const p of phs) {
      if (!onScreen(p.x, p.y, p.w, p.h)) continue;
      ctx.save();
      ctx.globalAlpha = p.alpha * 0.92;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, p.h, p.r); ctx.fill();
      ctx.restore();
    }
    for (const f of frames) {
      if (!onScreen(f.x, f.y, f.w, f.h)) continue;
      if (f.p <= 0) continue;
      const w = f.w * f.p, h = f.h * f.p;
      ctx.save();
      ctx.globalAlpha = f.alpha;
      ctx.fillStyle = f.color;
      ctx.globalAlpha = f.alpha * 0.05;
      ctx.fillRect(f.x, f.y, w, h);
      ctx.globalAlpha = f.alpha;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(f.x + 0.5, f.y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
      ctx.fillStyle = INK;
      for (const [hx, hy] of [[f.x, f.y], [f.x + w, f.y], [f.x, f.y + h], [f.x + w, f.y + h]]) {
        ctx.fillRect(hx - 3, hy - 3, 6, 6);
        ctx.strokeRect(hx - 2.5, hy - 2.5, 5, 5);
      }
      if (f.tag) chip(f.x, f.y + h + 6, `${Math.round(w)} × ${Math.round(h)}`, f.color, INK, 1);
      ctx.restore();
    }
    for (const m of measures) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, m.until * 4);
      ctx.strokeStyle = RED;
      ctx.lineWidth = 1;
      ctx.strokeRect(m.a.x + 0.5, m.a.y + 0.5, m.a.w - 1, m.a.h - 1);
      ctx.strokeRect(m.b.x + 0.5, m.b.y + 0.5, m.b.w - 1, m.b.h - 1);
      const top = m.a.y < m.b.y ? m.a : m.b, bottom = top === m.a ? m.b : m.a;
      const x = (Math.max(top.x, bottom.x) + Math.min(top.x + top.w, bottom.x + bottom.w)) / 2;
      const y0 = top.y + top.h, y1 = bottom.y;
      ctx.beginPath(); ctx.moveTo(x + 0.5, y0); ctx.lineTo(x + 0.5, y1); ctx.stroke();
      chip(x + 6, (y0 + y1) / 2 - 7, `${Math.round(y1 - y0)}`, RED, INK, 1);
      ctx.restore();
    }
    for (const a of agents) {
      if (a.alpha <= 0 || !onScreen(a.x, a.y, 1, 1)) continue;
      drawArrow(a.x, a.y, a.ang, a.color, a.alpha);
    }
  }

  let ticks = 0;
  function loop(now) {
    ticks++;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    // Small fixed steps: at 4× a whole frame is too big a step for the springs
    // on a slow or power-saving screen (30 frames a second), and cursors would
    // overshoot for ever instead of arriving.
    const n = Math.max(1, Math.ceil(dt * 120));
    for (let i = 0; i < n; i++) step(dt / n);
    draw();
    if (phase === "done" && gone()) { finish(); return; }
    raf = requestAnimationFrame(loop);
  }
  // Built, and every cursor faded out: nothing left to draw.
  function gone() {
    if (frames.length || phs.length || measures.length) return false;
    return agents.every((a) => a.alpha === 0);
  }
  // The build is over: take the canvas and its listeners away.
  function finish() {
    cancelAnimationFrame(raf);
    canvas.remove();
    removeEventListener("resize", resize);
    removeEventListener("wheel", userScrolled);
    removeEventListener("touchmove", userScrolled);
    removeEventListener("keydown", userKey);
  }

  // If the browser hardly animates (some embedded views and power savers give
  // a page no frames at all), don't leave the page hidden: after a moment on
  // screen with almost no progress, show it whole. A tab opened in the
  // background waits until it is shown.
  function showAll() {
    for (const a of agents) if (a.job && a.job.spans) { a.job.L.textEl.innerHTML = a.job.saved; a.job.L.textEl.classList.remove("sw-typing"); }
    for (const L of layers) { L.el.classList.remove("sw-pending", "sw-ghost", "sw-layer"); L.state = "done"; }
    phase = "done";
    finish();
  }
  function watchdog() {
    if (document.visibilityState !== "visible") {
      document.addEventListener("visibilitychange", () => setTimeout(watchdog, 2500), { once: true });
      return;
    }
    if (ticks < 20 && phase === "build") showAll();
  }
  setTimeout(watchdog, 2500);

  addEventListener("resize", resize);
  resize();
  agents = makeAgents();
  raf = requestAnimationFrame((t) => { last = t; loop(t); });
}

boot();
})();
