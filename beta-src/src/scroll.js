// ── virtual scroll ────────────────────────────────────────────────────
// There is no page to scroll; wheel, touch, keys and the scrubber all move
// a target position s ∈ [0,1] along the journey. A little spring each frame
// gives the camera its momentum and easing.

const WHEEL_LEN = 52000;      // px of wheel travel for the full journey
const TOUCH_LEN = 26000;      // px of finger travel (flicks add momentum)

export function makeScroll({ onInput } = {}) {
  const st = {
    target: 0,
    current: 0,
    vel: 0,               // fling velocity in s/sec
    enabled: false,
  };

  const clamp = (x) => Math.min(1, Math.max(0, x));
  const nudge = (ds) => {
    if (!st.enabled) return;
    st.target = clamp(st.target + ds);
    onInput?.();
  };

  // wheel / trackpad
  window.addEventListener('wheel', (e) => {
    if (!st.enabled) return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    st.vel = 0;
    nudge(dy / WHEEL_LEN);
  }, { passive: false });

  // touch: one finger drags time; pinch/two fingers are left to the map
  let ty = null, tLast = 0, tVel = 0, tId = null;
  window.addEventListener('touchstart', (e) => {
    if (!st.enabled || e.touches.length !== 1) { ty = null; return; }
    tId = e.touches[0].identifier;
    ty = e.touches[0].clientY;
    tLast = performance.now();
    tVel = 0;
    st.vel = 0;
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (!st.enabled || ty === null || e.touches.length !== 1) return;
    const t = [...e.touches].find((t) => t.identifier === tId);
    if (!t) return;
    e.preventDefault();
    const now = performance.now();
    const dy = ty - t.clientY;                    // swipe up = forward in time-ago
    ty = t.clientY;
    const ds = dy / TOUCH_LEN;
    const dt = Math.max(8, now - tLast) / 1000;
    tVel = 0.75 * tVel + 0.25 * (ds / dt);
    tLast = now;
    nudge(ds);
  }, { passive: false });
  window.addEventListener('touchend', (e) => {
    if (!st.enabled || ty === null) return;
    if (performance.now() - tLast < 90) st.vel = tVel;   // fling
    ty = null;
  }, { passive: true });

  // keys
  window.addEventListener('keydown', (e) => {
    if (!st.enabled) return;
    const step = e.shiftKey ? 0.02 : 0.004;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); nudge(step); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); nudge(-step); }
    else if (e.key === 'PageDown') { e.preventDefault(); nudge(0.03); }
    else if (e.key === 'PageUp') { e.preventDefault(); nudge(-0.03); }
    else if (e.key === 'Home') { e.preventDefault(); st.target = 0; onInput?.(); }
    else if (e.key === 'End') { e.preventDefault(); st.target = 1; onInput?.(); }
  });

  // advance one frame; returns current s
  function tick(dtSec) {
    if (Math.abs(st.vel) > 1e-4) {
      st.target = clamp(st.target + st.vel * dtSec);
      st.vel *= Math.exp(-2.6 * dtSec);            // fling decay
      if (st.target === 0 || st.target === 1) st.vel = 0;
    }
    const k = 1 - Math.exp(-4.2 * dtSec);          // spring toward target
    st.current += (st.target - st.current) * k;
    if (Math.abs(st.target - st.current) < 1e-6) st.current = st.target;
    return st.current;
  }

  return {
    state: st,
    tick,
    setTarget(s, immediate = false) {
      st.target = clamp(s);
      st.vel = 0;
      if (immediate) st.current = st.target;
      onInput?.();
    },
    enable(v = true) { st.enabled = v; },
  };
}
