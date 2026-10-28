/* Noon page demos: illustrations of what Noon does, not real data.
   Each demo's state is plain data changed by pure functions (Node runs them
   in tests); the DOM code below only draws that state. One shared clock
   drives every demo, only while it is on screen and the tab is visible;
   with Reduce Motion each demo shows a still state and clicks act at once. */
"use strict";

// Task states, exactly as Noon labels them.
const LABEL = {
  preparing: "Preparing workspace",
  working: "Working",
  ask: "Needs approval",
  finished: "Response finished",
  stopped: "Stopped",
};
const BASE = "3f2a9c1"; // the project's current commit when the tasks start
const COLORS = ["#7daea3", "#d3869b", "#a9b665"]; // the noonlight theme's aqua, pink and green (amber is kept for approvals)

/* ── 1. the map ─────────────────────────────────────────── */

const KINDS = {
  web: "APP", api: "SERVICE", auth: "PACKAGE", worker: "SERVICE", billing: "SERVICE",
  email: "PACKAGE", migrations: "FOLDER", db: "PACKAGE", search: "SERVICE",
};
// Row by row: three columns on wide screens, two on phones.
const ORDER_WIDE = ["web", "api", "auth", "worker", "billing", "email", "migrations", "db", "search"];
const ORDER_NARROW = ["web", "auth", "api", "search", "billing", "db", "email", "worker", "migrations"];
// [from, to, kind]: "code" is found in code (solid), "config" in configuration (dashed).
const CONNECTIONS = [
  ["web", "api", "code"], ["api", "auth", "code"], ["api", "billing", "code"], ["api", "search", "code"],
  ["worker", "billing", "config"], ["billing", "email", "code"], ["billing", "db", "code"], ["search", "db", "code"],
];
const MERGE_SHAS = ["9c2e1f4", "61b0d8a", "f2a7c35"];

// Steps: {at, read} reads a file · {at, edit, code} changes one (git status
// --short code) · {ask} waits for approval · {commit, sha, files} commits.
const MAP_AGENTS = [
  { n: 1, who: "Claude Code", task: "Add rate limiting", branch: "atlas/7f3a", start: "api", steps: [
    { at: "api", read: "api/server.ts" },
    { at: "api", edit: "api/limits.ts", code: "??" },
    { at: "auth", read: "auth/session.ts" },
    { at: "api", edit: "api/middleware.ts", code: " M" },
    { at: "web", read: "web/client.ts" },
    { at: "api", edit: "api/limits.test.ts", code: "??" },
    { commit: "Add a rate limiter", sha: "a1c94e2", files: ["api/limits.ts", "api/middleware.ts"] },
    { commit: "Test the limiter", sha: "b7d0f31", files: ["api/limits.test.ts"] },
  ] },
  { n: 2, who: "Codex", task: "Fix the checkout total", branch: "atlas/c21b", start: "billing", steps: [
    { at: "billing", read: "billing/cart.ts" },
    { at: "billing", edit: "billing/total.ts", code: " M" },
    { at: "db", read: "db/orders.ts" },
    { ask: "Run npm test?" },
    { at: "billing", edit: "billing/total.test.ts", code: " M" },
    { at: "email", read: "email/receipt.ts" },
    { at: "email", edit: "email/receipt.ts", code: " M" },
    { commit: "Fix rounding in the total", sha: "4e8a7c0", files: ["billing/total.ts", "billing/total.test.ts"] },
    { commit: "Show the fixed total on receipts", sha: "d93f2b6", files: ["email/receipt.ts"] },
  ] },
  { n: 3, who: "Claude Code", task: "Search by tag", branch: "atlas/e5d8", start: "search", steps: [
    { at: "search", read: "search/index.ts" },
    { at: "search", edit: "search/query.ts", code: " M" },
    { at: "migrations", edit: "migrations/012_tags.sql", code: "??" },
    { at: "db", read: "db/schema.ts" },
    { at: "api", edit: "api/middleware.ts", code: " M" },
    { commit: "Index tags", sha: "5f61ad9", files: ["search/query.ts", "migrations/012_tags.sql"] },
    { commit: "Route tag searches", sha: "8c0e4b7", files: ["api/middleware.ts"] },
  ] },
];

const systemOf = (file) => file.split("/")[0];
const baseName = (file) => file.split("/").pop();

function mapModel() {
  return {
    t: 0, idle: 0, sel: 0, merges: 0, rest: 0,
    agents: MAP_AGENTS.map((d) => ({
      d, i: 0, prep: d.n + 1, state: "preparing", at: null, file: null,
      dirty: [], changed: new Set(), commits: [], merged: null, ask: "", waited: 0,
    })),
  };
}

// One step of agent k. Returns what happened, for the drawing code.
function mapStep(m, k) {
  const a = m.agents[k];
  if (a.state === "preparing") {
    if (--a.prep <= 0) { a.state = "working"; a.at = a.d.start; }
    return { type: "state", k };
  }
  if (a.state !== "working") return null;
  const s = a.d.steps[a.i];
  if (!s) { a.state = "finished"; return { type: "state" }; }
  a.i++;
  if (s.ask) { a.state = "ask"; a.ask = s.ask; a.waited = 0; return { type: "ask" }; }
  if (s.commit) {
    a.dirty = a.dirty.filter(([f]) => !s.files.includes(f));
    a.commits.push({ msg: s.commit, sha: s.sha });
    return { type: "commit" };
  }
  a.at = s.at;
  a.file = s.edit || s.read;
  if (!s.edit) return { type: "read", at: s.at, k };
  if (!a.dirty.some(([f]) => f === s.edit)) a.dirty.push([s.edit, s.code]);
  a.changed.add(s.edit);
  return { type: "edit", at: s.at, k };
}

function mapApprove(m, k) {
  const a = m.agents[k];
  if (a.state !== "ask") return false;
  a.state = "working";
  a.ask = "";
  return true;
}

// Only commits merge, so a task can merge once it has commits and nothing left uncommitted.
const canMerge = (a) => a.state === "finished" && a.commits.length > 0 && a.dirty.length === 0 && !a.merged;

function mapMerge(m, k) {
  const a = m.agents[k];
  if (!canMerge(a)) return false;
  a.merged = MERGE_SHAS[m.merges++ % MERGE_SHAS.length];
  return true;
}

// Files two or more unmerged tasks have changed: a possible conflict, shown on the map.
function sharedFiles(m) {
  const owners = new Map();
  for (const a of m.agents) {
    if (a.merged) continue;
    for (const f of a.changed) owners.set(f, [...(owners.get(f) || []), a.d.n]);
  }
  return [...owners].filter(([, ns]) => ns.length > 1).map(([file, agents]) => ({ file, agents }));
}

// The Changes tab, which reads like `git status`.
function changesLines(a) {
  const lines = [[`On branch ${a.d.branch}`]];
  if (a.merged) return [...lines, [`Merged into main as ${a.merged}`, "ok"]];
  const n = a.commits.length;
  if (n) lines.push([`Your branch is ahead of 'main' by ${n} commit${n > 1 ? "s" : ""}.`]);
  for (const [f, code] of a.dirty) lines.push([`${code} ${f}`, code === "??" ? "new" : "mod"]);
  if (n) lines.push(["Merges cleanly into 'main'.", "ok"]);
  return lines;
}

// The shared clock calls this; one agent moves per tick. A visitor who isn't
// clicking still sees the whole story: approvals and merges happen by
// themselves after a pause, then everything starts over.
function mapTick(m) {
  m.t++;
  m.idle++;
  if (m.rest) {
    if (--m.rest === 0) { Object.assign(m, mapModel(), { sel: m.sel }); return { type: "reset" }; }
    return null;
  }
  const k = m.t % m.agents.length;
  const a = m.agents[k];
  if (a.state === "ask") {
    if (++a.waited >= 4 && m.idle >= 8) { mapApprove(m, k); return { type: "state" }; }
    return null;
  }
  if (a.state === "working" || a.state === "preparing") return mapStep(m, k);
  if (m.agents.every((x) => x.state === "finished")) {
    if (m.agents.every((x) => x.merged)) { m.rest = 8; return null; }
    if (m.idle >= 6 && m.t % 4 === 0) {
      const next = m.agents.findIndex((x) => canMerge(x));
      if (next >= 0) { mapMerge(m, next); return { type: "merge" }; }
    }
  }
  return null;
}

// The page starts each animated demo a few steps in, so a first look already
// shows agents at work instead of an empty window.
function mapWarm(m) {
  for (let i = 0; i < 12; i++) mapTick(m); // agent 1 editing, 2 reading, 3 just started
  m.idle = 0;
  return m;
}

// Reduce Motion: a still moment with something in every state.
function mapStill() {
  const m = mapModel();
  for (let i = 0; i < 60; i++) {
    m.idle = 0; // no automatic approvals or merges
    mapTick(m);
  }
  return m;
}

/* ── 3. workspaces ──────────────────────────────────────── */

const WS_IDS = ["7f3a", "c21b", "e5d8", "90b4", "2d6f", "b13e"];
const WS_TASKS = ["Add rate limiting", "Fix the checkout total", "Search by tag"];

function wsModel() {
  return { t: 0, idle: 0, made: 0, rest: 0, spaces: [] };
}

function wsNew(m, instant) {
  if (m.spaces.length >= 3) return false;
  const k = m.made++;
  m.spaces.push({
    branch: `atlas/${WS_IDS[k % WS_IDS.length]}`, task: WS_TASKS[k % WS_TASKS.length],
    c: COLORS[k % COLORS.length], state: instant ? "working" : "preparing", age: 0, merged: false, freeing: false,
  });
  return true;
}

// Workspace Cleanup frees only a workspace whose task is stopped and whose work is merged.
const canFree = (s) => s.state === "stopped" && s.merged && !s.freeing;
const freeReason = (s) => (s.state === "stopped" ? (s.merged ? "" : "Unmerged work is kept") : "Running tasks are never touched");

function wsFree(m, branch, instant) {
  const i = m.spaces.findIndex((s) => s.branch === branch);
  if (i < 0 || !canFree(m.spaces[i])) return false;
  if (instant) m.spaces.splice(i, 1);
  else m.spaces[i].freeing = true;
  return true;
}

function wsTick(m) {
  m.t++;
  m.idle++;
  m.spaces = m.spaces.filter((s) => !s.freeing);
  for (const s of m.spaces) {
    s.age++;
    if (s.state === "preparing" && s.age >= 2) { s.state = "working"; s.age = 0; }
  }
  if (m.rest) {
    if (--m.rest === 0) Object.assign(m, wsModel());
    return;
  }
  if (m.idle < 4) return; // give a visitor who is clicking a moment
  if (m.made < 3) { if (m.t % 3 === 0) wsNew(m); return; }
  const s = m.spaces[0];
  if (!s) { m.rest = 4; return; }
  if (s.state === "working" && s.age >= 4) { s.state = "finished"; s.age = 0; }
  else if (s.state === "finished" && s.age >= 3) { s.merged = true; s.state = "stopped"; s.age = 0; }
  else if (s.state === "stopped" && s.age >= 3 && s.merged) wsFree(m, s.branch);
}

function wsWarm(m) {
  wsNew(m, true); // one task already working
  return m;
}

function wsStill() {
  const m = wsModel();
  wsNew(m, true);
  wsNew(m, true);
  Object.assign(m.spaces[0], { state: "stopped", merged: true });
  return m;
}

/* ── 4. terminals ───────────────────────────────────────── */

// Generic agent output, not a copy of any agent's real screen.
const TERMS = [
  { n: 1, who: "Claude Code", task: "Add rate limiting", every: 6, lines: [
    { prep: "Setting up the workspace…" }, { prep: "Starting Claude Code…" },
    ["cmd", "› Add rate limiting to the API"],
    ["dim", "  read api/server.ts"], ["dim", "  read api/middleware.ts"],
    ["new", "  write api/limits.ts"], ["mod", "  edit api/middleware.ts"],
    ["cmd", "  $ npm test"], ["ok", "  ✓ 42 passed"],
    ["dim", "  commit a1c94e2 Add a rate limiter"],
  ] },
  { n: 2, who: "Codex", task: "Fix the checkout total", every: 7, lines: [
    { prep: "Setting up the workspace…" }, { prep: "Starting Codex…" },
    ["cmd", "› Fix the checkout total"],
    ["dim", "  read billing/total.ts"], ["dim", "  read billing/cart.ts"],
    ["mod", "  edit billing/total.ts"],
    { ask: "Run npm test?" },
    ["cmd", "  $ npm test"], ["ok", "  ✓ 18 passed"],
    ["dim", "  commit 4e8a7c0 Fix rounding in the total"],
  ] },
  { n: 3, who: "Claude Code", task: "Search by tag", every: 8, lines: [
    { prep: "Setting up the workspace…" }, { prep: "Starting Claude Code…" },
    ["cmd", "› Search products by tag"],
    ["dim", "  read search/index.ts"], ["mod", "  edit search/query.ts"],
    ["new", "  write migrations/012_tags.sql"], ["mod", "  edit api/middleware.ts"],
    ["cmd", "  $ npm test"], ["ok", "  ✓ 57 passed"],
    ["dim", "  commit 5f61ad9 Index tags"],
  ] },
];
const TERM_KEEP = 12;

function termModel(front = 0) {
  return {
    t: 0, idle: 0, rest: 0, front,
    terms: TERMS.map((d) => ({ d, i: 0, out: [], total: 0, state: "preparing", ask: "", waited: 0 })),
  };
}

function termLine(x) {
  const line = x.d.lines[x.i];
  if (line === undefined) { x.state = "finished"; return null; }
  x.i++;
  if (line.prep) { x.state = "preparing"; return push(x, ["dim", line.prep]); }
  if (line.ask) { x.state = "ask"; x.ask = line.ask; x.waited = 0; return push(x, ["ask", `  ${line.ask}`]); }
  x.state = "working";
  return push(x, line);
}

function push(x, line) {
  x.out.push(line);
  x.total++;
  if (x.out.length > TERM_KEEP) x.out.shift();
  return line;
}

function termApprove(m, k) {
  const x = m.terms[k];
  if (x.state !== "ask") return false;
  x.state = "working";
  x.ask = "";
  push(x, ["dim", "  approved"]);
  return true;
}

function termTick(m) {
  m.t++;
  m.idle++;
  if (m.rest) {
    if (--m.rest === 0) { Object.assign(m, termModel(m.front)); return "reset"; }
    return null;
  }
  m.terms.forEach((x, k) => {
    if (m.t % x.d.every) return;
    if (x.state === "ask") {
      if (++x.waited >= 10 && m.idle >= 40) termApprove(m, k);
      return;
    }
    if (x.state !== "finished") termLine(x);
  });
  if (m.terms.every((x) => x.state === "finished")) m.rest = 40;
  return null;
}

function termWarm(m) {
  for (let i = 0; i < 24; i++) termTick(m); // a few lines in each terminal
  m.idle = 0;
  return m;
}

function termStill() {
  const m = termModel();
  for (const x of m.terms) while (x.state !== "ask" && x.state !== "finished") termLine(x);
  return m;
}

/* ── drawing ────────────────────────────────────────────── */

const SVGNS = "http://www.w3.org/2000/svg";
function svgEl(name, attrs, parent) {
  const e = document.createElementNS(SVGNS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function htmlEl(name, cls, text, parent) {
  const e = document.createElement(name);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}
function retrigger(node, cls) {
  node.classList.remove(cls);
  node.getBoundingClientRect();
  node.classList.add(cls);
}

function makeTicker() {
  const demos = [];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let clock = null;
  let n = 0;
  const live = (d) => d.shown.size > 0 && !document.hidden && !reduced.matches;
  const run = () => {
    n++;
    for (const d of demos) if (live(d) && n % d.every === 0) d.tick();
  };
  const sync = () => {
    for (const d of demos) for (const el of d.els) el.classList.toggle("live", live(d));
    const any = demos.some(live);
    if (any && !clock) clock = setInterval(run, 100);
    if (!any && clock) { clearInterval(clock); clock = null; }
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const d = e.target.noonDemo;
      if (e.isIntersecting) d.shown.add(e.target);
      else d.shown.delete(e.target);
    }
    sync();
  }, { threshold: 0.15 });
  document.addEventListener("visibilitychange", sync);
  reduced.addEventListener("change", () => {
    if (reduced.matches) for (const d of demos) d.still();
    sync();
  });
  return {
    reduced: () => reduced.matches,
    add(d) {
      d.shown = new Set();
      demos.push(d);
      for (const el of d.els) { el.noonDemo = d; io.observe(el); }
      if (reduced.matches) d.still();
      sync();
    },
  };
}

function mountMap(ticker) {
  const win = document.getElementById("window");
  const svg = document.getElementById("map");
  const git = document.getElementById("git");
  const gitPanel = document.getElementById("git-panel");
  const status = document.getElementById("status");
  const askBox = document.getElementById("ask");
  const mergeBtn = document.getElementById("merge");
  const narrowQ = matchMedia("(max-width: 640px)");
  const CW = 150, CH = 60;
  let m = mapWarm(mapModel());
  let pos = {};
  let cards = {};
  let tokens = [];
  let edges = [];
  let gitKey = "";
  let seen = {};

  const center = (key) => [pos[key][0] + CW / 2, pos[key][1] + CH / 2];

  function build() {
    const narrow = narrowQ.matches;
    const order = narrow ? ORDER_NARROW : ORDER_WIDE;
    const cols = narrow ? 2 : 3;
    const gx = narrow ? 30 : 65, gy = narrow ? 66 : 80, left = narrow ? 15 : 30, top = 52;
    pos = {};
    order.forEach((key, i) => { pos[key] = [left + (i % cols) * (CW + gx), top + Math.floor(i / cols) * (CH + gy)]; });
    const rows = Math.ceil(order.length / cols);
    svg.setAttribute("viewBox", `0 0 ${narrow ? 360 : 640} ${top + rows * CH + (rows - 1) * gy + 18}`);
    svg.textContent = "";
    const defs = svgEl("defs", {}, svg);
    for (const [id, fill] of [["arrow", "rgba(235,219,178,0.32)"], ["arrow-hot", "rgba(235,219,178,0.85)"]]) {
      const mk = svgEl("marker", { id, viewBox: "0 0 8 8", refX: 7.5, refY: 4, markerWidth: 7, markerHeight: 7, orient: "auto" }, defs);
      svgEl("path", { d: "M0,0.5 L8,4 L0,7.5 z", fill }, mk);
    }
    edges = CONNECTIONS.map(([a, b, kind]) => {
      const [ax, ay] = center(a), [bx, by] = center(b);
      const dx = bx - ax, dy = by - ay;
      const clip = (cx, cy, ux, uy, gap) => {
        const s = Math.min((CW / 2 + gap) / Math.abs(ux || 1e-9), (CH / 2 + gap) / Math.abs(uy || 1e-9));
        return [cx + ux * s, cy + uy * s];
      };
      const [x1, y1] = clip(ax, ay, dx, dy, 3), [x2, y2] = clip(bx, by, -dx, -dy, 4);
      const line = svgEl("line", { class: `edge ${kind}`, x1, y1, x2, y2, "marker-end": "url(#arrow)" }, svg);
      svgEl("title", {}, line).textContent = kind === "code" ? `${a} uses ${b}: found in code` : `${a} uses ${b}: from configuration`;
      return { a, b, line };
    });
    cards = {};
    for (const key of order) {
      const [x, y] = pos[key];
      const g = svgEl("g", { class: "card", transform: `translate(${x} ${y})` }, svg);
      svgEl("rect", { width: CW, height: CH, rx: 12 }, g);
      svgEl("text", { class: "kind", x: 14, y: 23 }, g).textContent = KINDS[key];
      svgEl("text", { class: "name", x: 14, y: 45 }, g).textContent = key;
      const badge = svgEl("g", { class: "shared", transform: `translate(${CW - 24} ${CH - 16})` }, g);
      svgEl("circle", { class: "s1", r: 6 }, badge);
      svgEl("circle", { class: "s2", r: 6, cx: 8 }, badge);
      svgEl("title", {}, badge);
      g.addEventListener("pointerenter", () => hover(key, true));
      g.addEventListener("pointerleave", () => hover(key, false));
      cards[key] = g;
    }
    tokens = m.agents.map((a, k) => {
      const t = svgEl("g", { class: "token hidden", style: `--c:${COLORS[k]}` }, svg);
      svgEl("circle", { class: "ring", r: 11 }, t);
      svgEl("circle", { class: "body", r: 11 }, t);
      svgEl("text", { class: "n" }, t).textContent = a.d.n;
      const badge = svgEl("g", { class: "q", transform: "translate(9 -9)" }, t);
      svgEl("circle", { r: 6 }, badge);
      svgEl("text", {}, badge).textContent = "?";
      const label = svgEl("text", { class: "file", y: -16 - k * 11 }, t);
      return { t, label };
    });
    gitKey = "";
    render();
  }

  function hover(key, on) {
    svg.classList.toggle("hovering", on);
    cards[key].classList.toggle("hot", on);
    for (const e of edges) {
      const touches = e.a === key || e.b === key;
      e.line.classList.toggle("hot", on && touches);
      e.line.setAttribute("marker-end", on && touches ? "url(#arrow-hot)" : "url(#arrow)");
      if (touches) cards[e.a === key ? e.b : e.a].classList.toggle("hot", on);
    }
  }

  // Task rows, built once and updated in place.
  const rows = m.agents.map((a, k) => {
    const b = htmlEl("button", "task");
    b.type = "button";
    b.style.setProperty("--c", COLORS[k]);
    htmlEl("span", "num", a.d.n, b);
    htmlEl("span", "t-title", a.d.task, b);
    const meta = htmlEl("span", "t-meta", null, b);
    htmlEl("span", null, a.d.who, meta);
    const state = htmlEl("span", "state", null, meta);
    b.addEventListener("click", () => { m.sel = k; m.idle = 0; render(); });
    document.getElementById("tasks").appendChild(b);
    return { b, state };
  });

  document.getElementById("approve").addEventListener("click", () => {
    if (!mapApprove(m, m.sel)) return;
    m.idle = 0;
    if (ticker.reduced()) while (m.agents[m.sel].state === "working") mapStep(m, m.sel);
    render();
  });
  mergeBtn.addEventListener("click", () => merge(m.sel));

  function merge(k) {
    if (!mapMerge(m, k)) return;
    m.idle = 0;
    render();
  }

  function render(ev) {
    m.agents.forEach((a, k) => {
      const { t, label } = tokens[k];
      if (a.at) {
        const [x, y] = pos[a.at];
        const appearing = t.classList.contains("hidden");
        if (appearing) t.style.transition = "none";
        t.style.transform = `translate(${x + CW - 18 - k * 26}px, ${y}px)`;
        if (appearing) { t.getBoundingClientRect(); t.style.transition = ""; }
      }
      t.classList.toggle("hidden", !a.at);
      t.classList.toggle("working", a.state === "working");
      t.classList.toggle("ask", a.state === "ask");
      t.classList.toggle("sel", k === m.sel);
      label.textContent = a.file ? baseName(a.file) : "";
      rows[k].b.setAttribute("aria-pressed", String(k === m.sel));
      rows[k].state.className = `state ${a.state}`;
      rows[k].state.textContent = LABEL[a.state];
    });
    if (ev && ev.type === "edit") {
      cards[ev.at].style.setProperty("--fc", COLORS[ev.k]);
      retrigger(cards[ev.at], "flash");
      retrigger(tokens[ev.k].t, "edited");
    }
    const a = m.agents[m.sel];
    const mine = new Set(a.merged ? [] : [...a.changed].map(systemOf));
    for (const key in cards) {
      cards[key].classList.toggle("mine", mine.has(key));
      cards[key].style.setProperty("--sel", COLORS[m.sel]);
      cards[key].classList.remove("has-shared");
    }
    for (const { file, agents } of sharedFiles(m)) {
      const g = cards[systemOf(file)];
      g.classList.add("has-shared");
      g.querySelector(".s1").style.fill = COLORS[agents[0] - 1];
      g.querySelector(".s2").style.fill = COLORS[agents[1] - 1];
      g.querySelector(".shared title").textContent = `${file}: changed by Agents ${agents.join(" and ")}`;
    }
    win.style.setProperty("--c", COLORS[m.sel]);
    document.getElementById("ch-name").textContent = `Agent ${a.d.n} · ${a.d.task}`;
    status.textContent = "";
    for (const [text, cls] of changesLines(a)) {
      const line = htmlEl("span", cls || null, text, status);
      line.insertAdjacentText("afterend", "\n");
    }
    askBox.hidden = a.state !== "ask";
    document.getElementById("ask-text").textContent = `${a.d.who} asks: ${a.ask}`;
    mergeBtn.hidden = !canMerge(a);
    drawGit();
  }

  function drawGit() {
    const key = JSON.stringify([narrowQ.matches, m.agents.map((a) => [a.state, a.commits.length, a.merged])]);
    if (key === gitKey) return;
    gitKey = key;
    const narrow = narrowQ.matches;
    const W = narrow ? 360 : 640, mainY = 206;
    git.setAttribute("viewBox", `0 0 ${W} 240`);
    git.textContent = "";
    svgEl("path", { class: "trunk", d: `M 16 ${mainY} H ${W - 12}` }, git);
    svgEl("text", { class: "trunk-label", x: 16, y: mainY + 24 }, git).textContent = "main";
    svgEl("text", { class: "sha-label", x: 52, y: mainY + 24 }, git).textContent = BASE; // after "main", not under it
    const order = m.agents.filter((a) => a.merged).sort((p, q) => MERGE_SHAS.indexOf(p.merged) - MERGE_SHAS.indexOf(q.merged));
    m.agents.forEach((a, k) => {
      const g = svgEl("g", { style: `--c:${COLORS[k]}` }, git);
      const lane = svgEl("g", { class: a.merged ? "merged-lane" : "" }, g);
      const ly = 40 + k * 52, x0 = (narrow ? 64 : 86) + k * (narrow ? 16 : 26);
      const dots = a.commits.map((_, j) => (narrow ? 150 : 240) + j * (narrow ? 44 : 74));
      const end = dots.length ? dots[dots.length - 1] : x0 + 12;
      svgEl("path", { class: "lane", d: `M 40 ${mainY} C 40 ${ly} 40 ${ly} ${x0} ${ly} H ${end}` }, lane);
      svgEl("text", { class: "lane-label", x: x0, y: ly - 14 }, lane).textContent = narrow ? a.d.branch : `Agent ${a.d.n} · ${a.d.branch}`;
      const was = seen[a.d.n] || 0;
      dots.forEach((x, j) => {
        const dot = svgEl("circle", { class: `g-dot${j >= was ? " new" : ""}`, cx: x, cy: ly, r: 6 }, lane);
        svgEl("title", {}, dot).textContent = `${a.commits[j].sha} ${a.commits[j].msg}`;
      });
      seen[a.d.n] = dots.length;
      if (a.merged) {
        const mx = W - (narrow ? 96 : 150) + order.indexOf(a) * (narrow ? 30 : 46);
        const fresh = seen[`m${a.d.n}`] !== a.merged;
        svgEl("path", { class: `merge-path${fresh ? " new" : ""}`, d: `M ${end} ${ly} C ${mx} ${ly} ${mx} ${ly} ${mx} ${mainY}` }, g);
        const md = svgEl("circle", { class: `m-dot${fresh ? " new" : ""}`, cx: mx, cy: mainY, r: 7 }, g);
        svgEl("title", {}, md).textContent = `${a.merged} Merge ${a.d.branch}`;
        seen[`m${a.d.n}`] = a.merged;
      } else if (canMerge(a)) {
        const p = svgEl("g", { class: "g-pill", role: "button", tabindex: 0, "aria-label": `Merge ${a.d.branch}`, transform: `translate(${end + 16} ${ly - 12})` }, g);
        svgEl("rect", { width: 62, height: 24, rx: 12 }, p);
        svgEl("text", { x: 31, y: 12.5 }, p).textContent = "Merge";
        p.addEventListener("click", () => merge(k));
        p.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); merge(k); } });
      } else {
        svgEl("text", { class: "g-wait", x: end + 16, y: ly + 4 }, g).textContent = LABEL[a.state];
      }
    });
  }

  narrowQ.addEventListener("change", build);
  build();
  ticker.add({
    els: [win, gitPanel], every: 7,
    tick() {
      const ev = mapTick(m);
      if (ev && ev.type === "reset") { seen = {}; gitKey = ""; }
      render(ev);
    },
    still() { m = Object.assign(mapStill(), { sel: m.sel }); seen = {}; gitKey = ""; render(); },
  });
}

function mountWorkspaces(ticker) {
  const panel = document.getElementById("ws");
  const list = document.getElementById("ws-copies");
  const newBtn = document.getElementById("ws-new");
  let m = wsWarm(wsModel());
  const nodes = new Map();

  newBtn.addEventListener("click", () => {
    if (wsNew(m, ticker.reduced())) { m.idle = 0; render(); }
  });

  function card(s) {
    const li = htmlEl("li", "copy");
    li.style.setProperty("--c", s.c);
    const head = htmlEl("p", "tree-head", null, li);
    htmlEl("b", null, s.branch, head);
    htmlEl("span", null, `from ${BASE}`, head);
    const tree = htmlEl("ul", "tree", null, li);
    htmlEl("li", null, "src/", tree);
    htmlEl("li", null, "api/limits.ts", tree);
    const foot = htmlEl("div", "copy-foot", null, li);
    const state = htmlEl("span", "state", null, foot);
    const tag = htmlEl("span", "tag", "merged", foot);
    const free = htmlEl("button", "pill free", "Free This Workspace…", foot);
    free.type = "button";
    free.addEventListener("click", () => {
      if (wsFree(m, s.branch, ticker.reduced())) { m.idle = 0; render(); }
    });
    return { li, state, tag, free };
  }

  function render() {
    const live = new Set(m.spaces.map((s) => s.branch));
    for (const [branch, n] of nodes) if (!live.has(branch)) { n.li.remove(); nodes.delete(branch); }
    for (const s of m.spaces) {
      let n = nodes.get(s.branch);
      if (!n) {
        n = card(s);
        nodes.set(s.branch, n);
        list.insertBefore(n.li, list.querySelector(".slot")); // new cards go after the others
      }
      n.li.classList.toggle("freeing", s.freeing);
      n.state.className = `state ${s.state}`;
      n.state.textContent = LABEL[s.state];
      n.tag.hidden = !s.merged;
      n.free.disabled = !canFree(s);
      n.free.title = freeReason(s);
    }
    const slots = list.querySelectorAll(".slot");
    const want = 3 - m.spaces.length;
    for (let i = slots.length; i < want; i++) htmlEl("li", "slot", null, list);
    for (let i = want; i < slots.length; i++) slots[i].remove();
    newBtn.disabled = m.spaces.length >= 3;
  }

  render();
  ticker.add({
    els: [panel], every: 9,
    tick() { wsTick(m); render(); },
    still() { m = wsStill(); render(); },
  });
}

function mountTerminals(ticker) {
  const box = document.getElementById("terms");
  let m = termWarm(termModel());
  const views = m.terms.map((x, k) => {
    const art = htmlEl("article", "term", null, box);
    art.style.setProperty("--c", COLORS[k]);
    const head = htmlEl("button", "term-head", null, art);
    head.type = "button";
    htmlEl("span", "dot", null, head);
    htmlEl("b", null, `Agent ${x.d.n}`, head);
    htmlEl("span", "who", x.d.who, head);
    const state = htmlEl("span", "state", null, head);
    const out = htmlEl("pre", "term-out", null, art);
    const ask = htmlEl("div", "ask-box", null, art);
    const q = htmlEl("span", null, null, ask);
    const approve = htmlEl("button", "pill approve", "Approve", ask);
    approve.type = "button";
    approve.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!termApprove(m, k)) return;
      m.idle = 0;
      m.front = k;
      if (ticker.reduced()) while (termLine(m.terms[k]) !== null && m.terms[k].state !== "ask");
      render();
    });
    art.addEventListener("click", () => { m.front = k; m.idle = 0; render(); });
    return { art, head, state, out, ask, q, total: 0 };
  });

  function render() {
    m.terms.forEach((x, k) => {
      const v = views[k];
      const front = k === m.front;
      v.art.classList.toggle("front", front);
      v.head.setAttribute("aria-pressed", String(front));
      v.state.className = `state ${x.state}`;
      v.state.textContent = LABEL[x.state];
      // Append only the lines written since the last draw; keep the newest.
      if (x.total < v.total) { v.out.textContent = ""; v.total = 0; } // started over
      const add = Math.min(x.total - v.total, x.out.length);
      for (const line of x.out.slice(x.out.length - add)) htmlEl("span", line[0], line[1], v.out);
      while (v.out.childElementCount > TERM_KEEP) v.out.firstElementChild.remove();
      v.total = x.total;
      v.ask.hidden = x.state !== "ask";
      v.q.textContent = x.ask;
    });
  }

  render();
  ticker.add({
    els: [box], every: 1,
    tick() { termTick(m); render(); },
    still() {
      m = Object.assign(termStill(), { front: m.front });
      views.forEach((v) => { v.out.textContent = ""; v.total = 0; });
      render();
    },
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    LABEL, MAP_AGENTS, MERGE_SHAS, mapModel, mapStep, mapTick, mapApprove, mapMerge, canMerge, mapStill, mapWarm,
    sharedFiles, changesLines, wsModel, wsNew, wsTick, wsFree, canFree, freeReason, wsStill, wsWarm,
    TERMS, termModel, termTick, termApprove, termLine, termStill, termWarm, CONNECTIONS, KINDS, ORDER_WIDE, ORDER_NARROW,
  };
} else {
  const ticker = makeTicker();
  mountMap(ticker);
  mountWorkspaces(ticker);
  mountTerminals(ticker);
}
