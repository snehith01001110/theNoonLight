/* The tagline's agent counter: "Run 2 … ∞ agents". Numbers roll in like an
   odometer, 2, 3, 4, then speed up until they blur, and the count lands on an
   infinity sign that draws itself in, stroked like the logo.

   The page ships with the ∞ in place, so without script (or with reduced
   motion) the tagline reads in full. Otherwise the ∞ is swapped for 2 before
   the swarm types the line, and the count starts once the swarm has drawn it. */

"use strict";

(() => {
  const SEL = ".sub .count";
  const START = 2;
  const END = 99;      // the last number before ∞
  const FIRST = 340;   // ms the first number stays up
  const FALL = 0.8;    // each step is this much shorter than the last
  const FLOOR = 26;    // fastest step, ms: the blur (its length is about END × FLOOR)
  const ROLL = 70;     // steps longer than this roll; shorter ones just swap
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // When each number shows, from the start of the count; ∞ comes one beat after END.
  const at = [0];
  let t = 0;
  for (let n = START + 1; n <= END; n++) {
    t += Math.max(FIRST * Math.pow(FALL, n - START - 1), FLOOR);
    at.push(t);
  }
  const atInf = t + 90;

  let infMarkup = "";
  const digit = (text) => {
    const d = document.createElement("span");
    d.className = "d";
    d.textContent = text;
    return d;
  };

  // Slide the old face out, the new one in, and ease the width between them.
  function swapIn(box, face, dur) {
    for (const old of box.querySelectorAll(":scope > .d:not(.out), :scope > svg")) {
      if (dur) {
        old.classList.add("out");
        old.style.animationDuration = dur + "ms";
        old.addEventListener("animationend", () => old.remove(), { once: true });
      } else old.remove();
    }
    if (dur) { face.classList.add("in"); face.style.animationDuration = dur + "ms"; }
    box.appendChild(face);
    box.style.width = face.getBoundingClientRect().width + "px";
  }

  let started = false;
  function run() {
    if (started) return;
    started = true;
    const t0 = performance.now();
    let i = 0; // index into at[] of the number showing
    const tick = (now) => {
      // The swarm rewrites the line once typed, so look the box up each frame.
      const box = document.querySelector(SEL);
      if (!box) return;
      const t = now - t0;

      if (t >= atInf) {
        box.style.setProperty("--blur", "0");
        const tpl = document.createElement("template");
        tpl.innerHTML = infMarkup;
        swapIn(box, tpl.content.firstElementChild, 260);
        box.classList.add("landed");
        return;
      }

      let n = i;
      while (n + 1 < at.length && at[n + 1] <= t) n++;
      if (n !== i) {
        i = n;
        const step = n + 1 < at.length ? at[n + 1] - at[n] : FLOOR;
        // Blur grows with speed: none at the start, most when it's a smear.
        box.style.setProperty("--blur", Math.max(0, Math.min(1, (130 - step) / 95)).toFixed(3));
        const text = String(START + n);
        if (step > ROLL) swapIn(box, digit(text), Math.min(300, step * 0.85));
        else {
          let cur = box.querySelector(":scope > .d:not(.out)");
          if (!cur) { cur = digit(text); swapIn(box, cur, 0); }
          for (const old of box.querySelectorAll(":scope > .out")) old.remove();
          if (cur.textContent !== text) {
            cur.textContent = text;
            box.style.width = cur.getBoundingClientRect().width + "px";
          }
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function boot() {
    const box = document.querySelector(SEL);
    if (!box) return;
    infMarkup = box.innerHTML.trim();
    box.textContent = "";
    box.appendChild(digit(String(START)));
    // The swarm tells us when it has drawn a layer.
    document.addEventListener("sw:built", (e) => { if (e.target.matches(".sub")) setTimeout(run, 300); });
    // If the swarm never runs (it bails out, or fails), count anyway.
    addEventListener("load", () => { if (!document.querySelector(".sw-layer")) setTimeout(run, 400); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
