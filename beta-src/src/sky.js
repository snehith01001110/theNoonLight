// ── starfield + deep-time atmosphere (no Three.js needed) ──────────

export function makeSky(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, stars = [];
  let comet = null;
  let cometDone = false;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.width = Math.round(innerWidth * dpr);
    H = canvas.height = Math.round(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    stars = Array.from({ length: 320 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: 0.4 + Math.random() * 1.4,
      tw: Math.random() * 6.28, sp: 0.5 + Math.random() * 1.5,
      warm: Math.random() < 0.18,
    }));
  }
  resize();
  window.addEventListener('resize', resize);

  const smooth = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

  // alpha curves driven by time: stars arrive as Earth un-forms
  function starAlpha(ya) { return smooth(3.2e9, 4.8e9, ya); }
  function tintAlpha(ya) { return smooth(3.8e9, 5.0e9, ya) * 0.78; }

  const AGE = 13_787_000_000;

  // cosmic events render as sky, not ground: each is a band in years-ago
  // with a bell fade in/out
  const bell = (ya, a, b) => smooth(a, (a + b) / 2, ya) * (1 - smooth((a + b) / 2, b, ya));

  function drawCelestial(ya, t) {
    // the Sun ignites / the solar system condenses
    const sun = bell(ya, 4.44e9, 4.85e9);
    if (sun > 0.01) {
      const x = W * 0.72, y = H * 0.24, r = W * 0.16 * (1 + 0.03 * Math.sin(t * 2));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,236,190,${0.95 * sun})`);
      g.addColorStop(0.35, `rgba(255,190,100,${0.55 * sun})`);
      g.addColorStop(1, 'rgba(255,190,100,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
      // molten proto-earth nearby
      const px = W * 0.3, py = H * 0.4;
      const pg = ctx.createRadialGradient(px, py, 0, px, py, W * 0.035);
      pg.addColorStop(0, `rgba(255,120,60,${0.9 * sun})`);
      pg.addColorStop(1, 'rgba(255,120,60,0)');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(px, py, W * 0.035, 0, 6.28); ctx.fill();
    }
    // first galaxies: a slow swirl of faint points
    const gal = bell(ya, 13.32e9, 13.52e9);
    if (gal > 0.01) {
      const cx = W * 0.62, cy = H * 0.3;
      for (let i = 0; i < 90; i++) {
        const arm = i % 2, th = i * 0.19 + t * 0.05 + arm * Math.PI;
        const rr = 6 + i * (W * 0.0021);
        ctx.globalAlpha = gal * (0.75 - i / 140);
        ctx.fillStyle = i % 7 ? '#cfd8ff' : '#ffe2b8';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(th) * rr, cy + Math.sin(th) * rr * 0.5, 1.1 * (W / 800), 0, 6.28);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // cosmic dawn: the first stars flare on
    const dawn = bell(ya, 13.55e9, 13.68e9);
    if (dawn > 0.01) {
      for (let i = 0; i < 7; i++) {
        const x = W * ((i * 0.37 + 0.13) % 1), y = H * ((i * 0.23 + 0.1) % 0.55);
        const fl = 0.5 + 0.5 * Math.sin(t * 1.7 + i * 2.4);
        const r = W * 0.012 * (1 + fl);
        ctx.globalAlpha = dawn * (0.5 + 0.5 * fl);
        ctx.strokeStyle = '#fff2d8';
        ctx.lineWidth = W / 900;
        ctx.beginPath();
        ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
        ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
        ctx.stroke();
        ctx.fillStyle = '#fff6e2';
        ctx.beginPath(); ctx.arc(x, y, W / 320, 0, 6.28); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // first light: the CMB — the whole sky glows warm
    const tAfter = AGE - ya;
    const cmb = tAfter < 8e5 ? smooth(8e5, 2.5e5, tAfter) : 0;
    if (cmb > 0.01) {
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, `rgba(255,150,70,${0.34 * cmb * (1 + 0.12 * Math.sin(t * 1.1))})`);
      g.addColorStop(1, `rgba(120,30,90,${0.22 * cmb})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function draw(ya, sNow) {
    const a = starAlpha(ya);
    if (a <= 0.004 && !comet) { ctx.clearRect(0, 0, W, H); return 0; }
    ctx.clearRect(0, 0, W, H);
    const t = performance.now() / 1000;
    ctx.globalCompositeOperation = 'screen';
    drawCelestial(ya, t);
    for (const st of stars) {
      const tw = 0.55 + 0.45 * Math.sin(st.tw + t * st.sp);
      ctx.globalAlpha = a * tw;
      ctx.fillStyle = st.warm ? '#ffd9a8' : '#dfeaff';
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r * (W / 1600), 0, 6.28);
      ctx.fill();
    }
    // one comet, once, on the way through the deep billions
    if (!cometDone && !comet && ya > 5.5e9 && ya < 9e9 && Math.random() < 0.006) {
      comet = { p: 0, y0: H * (0.15 + Math.random() * 0.3) };
    }
    if (comet) {
      comet.p += 0.008;
      const x = W * (1.1 - comet.p * 1.3), y = comet.y0 + comet.p * H * 0.22;
      const grad = ctx.createLinearGradient(x, y, x + W * 0.16, y - H * 0.05);
      grad.addColorStop(0, 'rgba(255,240,210,0.95)');
      grad.addColorStop(1, 'rgba(255,240,210,0)');
      ctx.globalAlpha = Math.min(1, a + 0.3);
      ctx.strokeStyle = grad;
      ctx.lineWidth = W / 500;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + W * 0.16, y - H * 0.05); ctx.stroke();
      ctx.fillStyle = '#fff6e6';
      ctx.beginPath(); ctx.arc(x, y, W / 340, 0, 6.28); ctx.fill();
      if (comet.p > 1.3) { comet = null; cometDone = true; }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    return a;
  }

  return { draw, tintAlpha, get cometVisible() { return !!comet; } };
}
