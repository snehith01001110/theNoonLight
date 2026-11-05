/* The tagline's agent counter: "Run 1 … 99 agents". It ticks 1, 2, 3 slowly,
   then speeds up until the numbers blur, and lands sharp on 99.

   The page ships with 99 in place, so without script (or with reduced motion)
   the tagline reads in full. Otherwise the number is set to 1 before the swarm
   types the line, and the count starts once the swarm has finished it. */

"use strict";

(() => {
  const SEL = ".sub .count";
  const END = 99;
  const FIRST = 520;   // ms the first numbers stay up
  const FALL = 0.78;   // each step is this much shorter than the last
  const FLOOR = 9;     // fastest step, ms: the blur
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // When each number shows, from the start of the count.
  const at = [0];
  for (let n = 2, t = 0; n <= END; n++) {
    t += Math.max(FIRST * Math.pow(FALL, n - 2), FLOOR);
    at.push(t);
  }

  let started = false;
  function run() {
    if (started) return;
    started = true;
    const t0 = performance.now();
    let shown = 0;
    const tick = (now) => {
      // The swarm rewrites the line once typed, so look the span up each frame.
      const el = document.querySelector(SEL);
      if (!el) return;
      const t = now - t0;
      let n = shown;
      while (n < END && at[n] <= t) n++;
      if (n !== shown) {
        shown = n;
        el.textContent = n;
        // Blur grows with speed: none at the start, most when it's a smear.
        const step = n < END ? at[n] - at[n - 1] : Infinity;
        const blur = Math.max(0, Math.min(1, (120 - step) / 100));
        el.style.setProperty("--blur", blur.toFixed(3));
      }
      if (shown < END) requestAnimationFrame(tick);
      else { el.style.setProperty("--blur", "0"); el.classList.add("landed"); }
    };
    requestAnimationFrame(tick);
  }

  function boot() {
    const el = document.querySelector(SEL);
    if (!el) return;
    el.textContent = "1";
    // The swarm tells us when it has drawn a layer.
    document.addEventListener("sw:built", (e) => { if (e.target.matches(".sub")) setTimeout(run, 350); });
    // If the swarm never runs (it bails out, or fails), count anyway.
    addEventListener("load", () => { if (!document.querySelector(".sw-layer")) setTimeout(run, 400); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
