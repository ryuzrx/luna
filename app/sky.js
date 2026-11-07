// The living night sky behind every screen: parallax stars in three depths,
// nebulae tinted by the tutor, a floating moon with orbit arcs, falling petals,
// the odd shooting star, and a warp streak between screens.
// Ported from Cosmos.swift.

const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function seeded(seed) {
  let s = BigInt.asUintN(64, BigInt(seed) + 0x9e3779b97f4a7c15n);
  return () => {
    s = BigInt.asUintN(64, s * 6364136223846793005n + 1442695040888963407n);
    return Number(s >> 11n) / 2 ** 53;
  };
}

const depths = [0.22, 0.55, 1.0];
const stars = (() => {
  const r = seeded(42), out = [];
  [170, 80, 28].forEach((count, layer) => {
    const base = [0.45, 0.75, 1.25][layer];
    for (let i = 0; i < count; i++) {
      const roll = r();
      out.push({ x: r(), y: r(), r: base + r() * base * 0.9, a: 0.28 + r() * 0.62,
        tw: 0.4 + r() * 1.8, ph: r() * 6.283, layer, tint: roll < 0.12 ? 1 : roll < 0.2 ? 2 : 0 });
    }
  });
  return out;
})();
const petals = (() => { const r = seeded(7); return Array.from({ length: 14 }, () => ({ x: r(), y: r(), size: 4 + r() * 5, fall: 0.012 + r() * 0.02, sway: 0.4 + r() * 0.8, spin: 0.3 + r() * 1.2, ph: r() * 6.283 })); })();
const motes = (() => { const r = seeded(99); return Array.from({ length: 12 }, () => ({ x: r(), y: r(), size: 1.5 + r() * 2.5, rise: 0.006 + r() * 0.012, ph: r() * 6.283 })); })();
const tints = ["255,248,234", "199,190,255", "169,228,255"];

export const sky = {
  accent: "169,155,255",
  intensity: 1,
  warpStart: -100,
  pointer: { x: 0.5, y: 0.5 },
  target: { x: 0.5, y: 0.5 },
  warp() { this.warpStart = performance.now() / 1000; },
  setAccent(hex) {
    const n = parseInt(hex.replace("#", ""), 16);
    this.accent = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  },
};

function warpAmount(t) {
  const e = t - sky.warpStart, d = 1.15;
  if (e < 0 || e >= d) return 0;
  const p = e / d;
  return p < 0.16 ? p / 0.16 : Math.pow(1 - (p - 0.16) / 0.84, 2.4);
}

function radial(ctx, x, y, r, rgb, a0, a1 = 0) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a0})`);
  g.addColorStop(1, `rgba(${rgb},${a1})`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
}

function draw(ctx, w, h, t) {
  const calm = still();
  const warp = calm ? 0 : warpAmount(t);
  sky.pointer.x += (sky.target.x - sky.pointer.x) * 0.06;
  sky.pointer.y += (sky.target.y - sky.pointer.y) * 0.06;
  const px = sky.pointer.x - 0.5, py = sky.pointer.y - 0.5;
  const I = sky.intensity;

  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#05061a"); bg.addColorStop(0.5, "#0a0b26"); bg.addColorStop(1, "#101238");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

  // Nebulae
  const span = Math.max(w, h);
  [["75,51,184", .18, .30, .62, .05, .20], [sky.accent, .78, .72, .55, .07, .16],
   ["28,110,154", .42, .95, .60, .04, .17], ["176,68,126", .95, .10, .38, .06, .10]]
    .forEach(([rgb, bx, by, br, sp, op], i) => {
      const cx = (bx + 0.05 * Math.sin(t * sp + i * 1.7)) * w;
      const cy = (by + 0.04 * Math.cos(t * sp * 0.8 + i)) * h;
      radial(ctx, cx, cy, br * span * (1 + 0.06 * Math.sin(t * 0.18 + i)), rgb, op * I);
    });

  // Moon and orbits
  const m = Math.min(w * 0.075, 82);
  const mx = w * 0.86 - px * 14, my = h * 0.15 - py * 10 + Math.sin(t * 0.45) * 4;
  radial(ctx, mx, my, m * 5.2, "243,227,188", 0.15 * I);
  [[6.2, 2.1, 22, 0.22], [9.4, 3.3, -14, 0.13]].forEach(([fa, fb, dash, sp], i) => {
    ctx.save(); ctx.translate(mx, my); ctx.rotate(-18 * Math.PI / 180);
    const a = m * fa, b = m * fb;
    ctx.beginPath(); ctx.ellipse(0, 0, a, b, 0, 0, 6.2832);
    ctx.strokeStyle = `rgba(201,210,255,${0.06 * I})`; ctx.lineWidth = 1; ctx.setLineDash([]); ctx.stroke();
    ctx.setLineDash([a * 0.5, a * 2.4]); ctx.lineDashOffset = t * dash;
    ctx.strokeStyle = `rgba(220,227,255,${0.22 * I})`; ctx.lineWidth = 1.1; ctx.lineCap = "round"; ctx.stroke();
    ctx.setLineDash([]);
    const ang = t * sp + i * 2.1, sx = Math.cos(ang) * a, sy = Math.sin(ang) * b, d = i ? 2.2 : 3;
    radial(ctx, sx, sy, d * 3, sky.accent, 0.5 * I);
    ctx.fillStyle = `rgba(255,255,255,${0.9 * I})`; ctx.beginPath(); ctx.arc(sx, sy, d / 2, 0, 6.2832); ctx.fill();
    ctx.restore();
  });
  ctx.fillStyle = `rgba(200,204,240,${0.05 * I})`; ctx.beginPath(); ctx.arc(mx, my, m, 0, 6.2832); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(mx, my, m, 0, 6.2832); ctx.clip();
  const mg = ctx.createLinearGradient(mx - m, my - m, mx + m, my + m);
  mg.addColorStop(0, `rgba(243,227,188,${0.95 * I})`); mg.addColorStop(1, `rgba(226,190,124,${0.75 * I})`);
  ctx.fillStyle = mg; ctx.fillRect(mx - m, my - m, m * 2, m * 2);
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath(); ctx.arc(mx + m * 0.6, my - m * 0.12, m * 0.8, 0, 6.2832); ctx.fill();
  ctx.restore();

  // Stars
  ctx.globalCompositeOperation = "lighter";
  const cx = w / 2, cy = h / 2, pw = w + 40, ph = h + 40;
  for (const s of stars) {
    const dpt = depths[s.layer];
    let x = s.x * pw - (calm ? 0 : t * 5 * dpt), y = s.y * ph - (calm ? 0 : t * 1.4 * dpt);
    x = ((x % pw) + pw) % pw - 20 - px * 36 * dpt;
    y = ((y % ph) + ph) % ph - 20 - py * 24 * dpt;
    const dx = x - cx, dy = y - cy, dist = Math.max(1, Math.hypot(dx, dy)), nx = dx / dist, ny = dy / dist;
    if (warp > 0) { x += nx * warp * 70 * dpt; y += ny * warp * 70 * dpt; }
    const shimmer = calm ? 1 : 0.55 + 0.45 * Math.sin(t * s.tw + s.ph);
    const alpha = s.a * shimmer * I;
    const col = `rgba(${tints[s.tint]},${alpha})`;
    if (warp > 0.03) {
      const len = warp * (24 + dist * 0.22) * dpt;
      ctx.strokeStyle = col; ctx.lineWidth = s.r; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x - nx * len, y - ny * len); ctx.lineTo(x, y); ctx.stroke();
    } else {
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, s.r / 2, 0, 6.2832); ctx.fill();
    }
    if (s.layer === 2 && s.a > 0.62 && warp < 0.3) {
      const g = s.r * (2.4 + 3.2 * shimmer);
      ctx.strokeStyle = `rgba(${tints[s.tint]},${alpha * 0.55})`; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(x - g, y); ctx.lineTo(x + g, y); ctx.moveTo(x, y - g); ctx.lineTo(x, y + g); ctx.stroke();
      radial(ctx, x, y, s.r * 3, tints[s.tint], alpha * 0.35);
    }
  }

  if (!calm) {
    // Shooting star
    const period = 5.5, k = Math.floor(t / period), local = t - k * period;
    if (local < 1.05) {
      const r = seeded(Math.abs(k) % 1000000 * 2654435761 % 2 ** 31);
      if (r() > 0.3) {
        const sx = (0.3 + r() * 0.65) * w, sy = (0.02 + r() * 0.3) * h;
        const dx = -0.88, dy = 0.38 + r() * 0.25, p = local / 1.05;
        const travel = (320 + r() * 260) * (1 - Math.pow(1 - p, 2));
        const hx = sx + dx * travel, hy = sy + dy * travel, tl = 150 * Math.sin(p * Math.PI);
        const a = Math.sin(p * Math.PI) * I;
        const g = ctx.createLinearGradient(hx - dx * tl, hy - dy * tl, hx, hy);
        g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, `rgba(255,255,255,${0.9 * a})`);
        ctx.strokeStyle = g; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(hx - dx * tl, hy - dy * tl); ctx.lineTo(hx, hy); ctx.stroke();
        radial(ctx, hx, hy, 7, "220,214,255", 0.8 * a);
      }
    }
    // Rising light motes
    for (const mo of motes) {
      let y = ((mo.y - t * mo.rise) % 1 + 1) % 1;
      const x = mo.x * w + Math.sin(t * 0.6 + mo.ph) * 18;
      radial(ctx, x, y * h, mo.size * 2.6, sky.accent, 0.32 * Math.sin(y * Math.PI) * I);
    }
  }
  // Warp speed lines
  if (warp > 0.01) {
    const diag = Math.hypot(w, h), r = seeded(1234);
    ctx.strokeStyle = `rgba(255,255,255,${0.1 * warp})`;
    for (let i = 0; i < 64; i++) {
      const a = r() * 6.283, inner = diag * (0.26 + r() * 0.2) * (1.15 - warp * 0.4);
      ctx.lineWidth = 0.6 + r() * 1.8;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * diag * 0.75, cy + Math.sin(a) * diag * 0.75); ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = "source-over";

  // Petals
  if (!calm) {
    for (const p of petals) {
      const y = ((p.y + t * p.fall) % 1.1 + 1.1) % 1.1;
      const xx = ((p.x - t * p.fall * 0.7) % 1 + 1) % 1;
      ctx.save();
      ctx.translate(xx * w + Math.sin(t * p.sway + p.ph) * 26 - px * 40, (y - 0.05) * h - py * 26);
      ctx.rotate(t * p.spin + p.ph);
      ctx.scale(1, Math.max(0.25, Math.abs(Math.cos(t * p.spin * 1.3 + p.ph))));
      ctx.fillStyle = `rgba(246,182,207,${0.32 * I})`;
      ctx.beginPath(); ctx.moveTo(-p.size, 0);
      ctx.quadraticCurveTo(0, -p.size * 0.9, p.size, 0); ctx.quadraticCurveTo(0, p.size * 0.9, -p.size, 0);
      ctx.fill(); ctx.restore();
    }
  }
  // Vignette
  const v = ctx.createRadialGradient(cx, cy, 260, cx, cy, Math.max(w, h) * 0.8);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
}

export function startSky(canvas) {
  const ctx = canvas.getContext("2d");
  let w = 0, h = 0, raf = 0, last = 0;
  const resize = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    w = innerWidth; h = innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + "px"; canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (still()) draw(ctx, w, h, 40);
  };
  const loop = (ms) => {
    raf = requestAnimationFrame(loop);
    if (ms - last < 1000 / 45) return; // ~45 fps is plenty for a slow sky
    last = ms;
    draw(ctx, w, h, ms / 1000);
  };
  const start = () => { cancelAnimationFrame(raf); if (still()) draw(ctx, w, h, 40); else raf = requestAnimationFrame(loop); };
  addEventListener("resize", resize);
  addEventListener("pointermove", (e) => { sky.target.x = e.clientX / innerWidth; sky.target.y = e.clientY / innerHeight; }, { passive: true });
  document.addEventListener("visibilitychange", () => document.hidden ? cancelAnimationFrame(raf) : start());
  resize(); start();
}
